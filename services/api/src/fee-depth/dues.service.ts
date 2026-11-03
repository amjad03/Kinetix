import { Injectable, OnModuleInit } from '@nestjs/common';
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { UserPrincipal } from '../auth/principal.js';
import { auditUser } from '../common/audit.js';
import { Clock, localParts } from '../common/time.js';
import { DbService, type Tx } from '../db/db.service.js';
import { audienceRules, messageCampaigns, messageTemplates } from '../db/schema-pathways.js';
import { feeReminderRuns } from '../db/schema-fee-depth.js';
import { feeInvoices, sections, students, tenants, userRoles } from '../db/schema.js';
import { feeReminderSends } from '../db/schema-fee-flagship.js';
import type { EscalationStep } from '../db/schema-fee-accounts.js';
import { heldSql } from '../fee-flagship/reports.js';
import { familyUserIds, sendFeeMessage } from '../fees/fee-messages.js';
import { settingsOf } from '../fee-accounts/fee-accounts.service.js';
import { reminderDue } from '../fees/fee-depth.logic.js';
import { JobsService, type Job } from '../jobs/jobs.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { feeTexts } from './texts.js';

export const REMINDER_JOB = 'fees.reminders';
export const SUMMARY_JOB = 'fees.daily_summary';
export type DuesPurpose = 'hallTicket' | 'results' | 'tc';

/**
 * Dues and what follows from them: whether a student's overdue fees hold back a hall ticket, result or TC (the
 * institution's settings), the reminder schedule (days before and after the due date, on the app, SMS and WhatsApp
 * through the communication templates "fee_reminder"), and the daily collection summary to the management.
 */
@Injectable()
export class DuesService implements OnModuleInit {
  constructor(
    private readonly db: DbService,
    private readonly clock: Clock,
    private readonly jobs: JobsService,
    private readonly notifications: NotificationsService,
  ) {}

  onModuleInit(): void {
    this.jobs.registerDaily(REMINDER_JOB, (job: Job) => this.db.withTenant(job.tenantId, (tx) => this.remind(tx, job.tenantId, null)).then(() => undefined));
    this.jobs.registerDaily(SUMMARY_JOB, (job: Job) => this.db.withTenant(job.tenantId, (tx) => this.summary(tx, job.tenantId)).then(() => undefined));
  }

  async today(tx: Tx): Promise<string> {
    const [t] = await tx.select({ tz: tenants.timezone }).from(tenants);
    return localParts(this.clock.now(), t?.tz ?? 'Asia/Kolkata').date;
  }

  /** The student's due and overdue amounts and which documents the overdue amount holds back. */
  async blocks(tx: Tx, tenantId: string, studentId: string) {
    const s = await settingsOf(tx, tenantId);
    const today = await this.today(tx);
    const [d] = await tx
      .select({
        due: sql<number>`coalesce(sum(${feeInvoices.amountPaise} - ${feeInvoices.paidPaise}), 0)::bigint`.mapWith(Number),
        overdue: sql<number>`coalesce(sum(${feeInvoices.amountPaise} - ${feeInvoices.paidPaise}) filter (where ${feeInvoices.dueOn} < ${today}::date), 0)::bigint`.mapWith(Number),
      })
      .from(feeInvoices)
      .where(and(eq(feeInvoices.studentId, studentId), eq(feeInvoices.status, 'due')));
    // A government scholarship still expected (SSP, NSP…) holds that much of the dues back from the block.
    const held = (await this.held(tx, [studentId])).get(studentId) ?? 0;
    const overdue = Math.max(0, d.overdue - held);
    const min = Math.round((s.duesBlock.minRupees ?? 0) * 100);
    const over = overdue > 0 && overdue >= min;
    return { duePaise: d.due, overduePaise: overdue, scholarshipHeldPaise: Math.min(held, d.overdue), minPaise: min, hallTicket: !!s.duesBlock.hallTicket && over, results: !!s.duesBlock.results && over, tc: !!s.duesBlock.tc && over };
  }

  /** What government scholarships still expected hold back, per student. */
  async held(tx: Tx, studentIds?: string[]): Promise<Map<string, number>> {
    const rows = await tx.execute<{ student_id: string; held: string }>(sql`select * from ${heldSql} h ${studentIds?.length ? sql`where h.student_id in (${sql.join(studentIds.map((i) => sql`${i}::uuid`), sql`, `)})` : sql``}`);
    return new Map(rows.rows.map((r) => [r.student_id, Number(r.held)]));
  }

  /** Whether dues hold back this document for the student (for other offices to call before issuing it). */
  async blocked(tx: Tx, tenantId: string, studentId: string, purpose: DuesPurpose): Promise<boolean> {
    return (await this.blocks(tx, tenantId, studentId))[purpose];
  }

  /**
   * Sends the reminders due today by the schedule (or, run by a person, to everyone with overdue fees). App
   * notices always go out; SMS and WhatsApp go through the institution's "fee_reminder" template on that channel
   * when it has one. Returns what went out and what was skipped.
   */
  async remind(tx: Tx, tenantId: string, p: UserPrincipal | null) {
    const s = await settingsOf(tx, tenantId);
    const today = await this.today(tx);
    if (!p && !s.reminders.enabled) return { students: 0, app: 0, sms: 0, whatsapp: 0, skipped: ['The reminder schedule is off'] };
    // A schedule of steps with escalations (Settings → reminders) replaces the simple days before and after.
    if (!p && s.escalations.length) return this.escalate(tx, tenantId, s.escalations, today);
    const open = await tx.select({ studentId: feeInvoices.studentId, dueOn: feeInvoices.dueOn, balance: sql<number>`(${feeInvoices.amountPaise} - ${feeInvoices.paidPaise})::bigint`.mapWith(Number) }).from(feeInvoices).where(eq(feeInvoices.status, 'due'));
    const heldBy = await this.held(tx);
    const chosen = open.filter((i) => (p ? i.dueOn < today : reminderDue(s.reminders, i.dueOn, today))).filter((i) => !(heldBy.get(i.studentId) && (heldBy.get(i.studentId) ?? 0) >= i.balance));
    const per = new Map<string, { balancePaise: number; dueOn: string }>();
    for (const i of chosen) {
      const cur = per.get(i.studentId) ?? { balancePaise: 0, dueOn: i.dueOn };
      per.set(i.studentId, { balancePaise: cur.balancePaise + i.balance, dueOn: i.dueOn < cur.dueOn ? i.dueOn : cur.dueOn });
    }
    // The full balance the student owes, not only the invoices due today.
    if (per.size) {
      const totals = await tx.select({ studentId: feeInvoices.studentId, t: sql<number>`sum(${feeInvoices.amountPaise} - ${feeInvoices.paidPaise})::bigint`.mapWith(Number) }).from(feeInvoices).where(and(eq(feeInvoices.status, 'due'), inArray(feeInvoices.studentId, [...per.keys()]))).groupBy(feeInvoices.studentId);
      for (const t of totals) per.get(t.studentId)!.balancePaise = t.t;
    }
    const channels = s.reminders.channels?.length ? s.reminders.channels : ['app'];
    const out = { students: per.size, app: 0, sms: 0, whatsapp: 0, skipped: [] as string[] };
    for (const [studentId, r] of per) {
      if (channels.includes('app')) {
        await this.notifications.feeReminder(tx, { studentId, balancePaise: r.balancePaise, dueOn: r.dueOn, day: today });
        out.app++;
      }
    }
    for (const ch of ['sms', 'whatsapp'] as const) {
      if (!channels.includes(ch) || !per.size) continue;
      const [tpl] = await tx.select().from(messageTemplates).where(and(eq(messageTemplates.key, 'fee_reminder'), eq(messageTemplates.channel, ch), eq(messageTemplates.active, true))).limit(1);
      if (!tpl) {
        out.skipped.push(`No active "fee_reminder" ${ch === 'sms' ? 'SMS' : 'WhatsApp'} template in Communication`);
        continue;
      }
      if (ch === 'sms' && !tpl.dltTemplateId) {
        out.skipped.push('The "fee_reminder" SMS template has no DLT template id');
        continue;
      }
      for (const [studentId, r] of per) {
        const family = await tx.execute<{ user_id: string }>(sql`select g.user_id from guardians g where g.student_id = ${studentId}::uuid union select s.user_id from students s where s.id = ${studentId}::uuid and s.user_id is not null`);
        const ids = family.rows.map((x) => x.user_id).filter(Boolean);
        if (!ids.length) continue;
        const [st] = await tx.select({ name: students.fullName }).from(students).where(eq(students.id, studentId));
        const [rule] = await tx.insert(audienceRules).values({ tenantId, name: `Fee reminder ${ch} ${studentId} ${today}`, rule: { userIds: ids } }).onConflictDoNothing().returning();
        if (!rule) continue; // already sent on this channel today
        await tx.insert(messageCampaigns).values({ tenantId, title: `Fee reminder: ${st?.name ?? ''}`, templateId: tpl.id, audienceId: rule.id, vars: { student: st?.name ?? '', amount: `₹${(r.balancePaise / 100).toLocaleString('en-IN')}`, dueOn: r.dueOn }, sendAt: this.clock.now(), createdBy: p?.userId ?? null });
        out[ch]++;
      }
    }
    await tx.insert(feeReminderRuns).values({ tenantId, runOn: today, kind: p ? 'manual' : 'scheduled', students: out.students, app: out.app, sms: out.sms, whatsapp: out.whatsapp, skipped: out.skipped, runBy: p?.userId ?? null });
    if (p) await auditUser(tx, p, 'fees.reminders_run', 'fee_reminder', undefined, out);
    return out;
  }

  /**
   * The reminder schedule with escalations. Each step is a number of days from the due date (negative before, 0 on
   * the day, positive after) with who is told and how: the family (app, SMS, WhatsApp, e-mail), then the class
   * teacher, the principal or the accounts office. For each open invoice only the latest step it has reached is sent,
   * once (fee_reminder_sends), so a missed day catches up without repeating older steps. Dues a government
   * scholarship still covers are left alone.
   */
  async escalate(tx: Tx, tenantId: string, steps: EscalationStep[], today: string) {
    const open = await tx
      .select({ id: feeInvoices.id, studentId: feeInvoices.studentId, title: feeInvoices.title, dueOn: feeInvoices.dueOn, balance: sql<number>`(${feeInvoices.amountPaise} - ${feeInvoices.paidPaise})::bigint`.mapWith(Number), sectionId: students.sectionId, student: students.fullName, classTeacher: sections.classTeacherId })
      .from(feeInvoices)
      .innerJoin(students, eq(students.id, feeInvoices.studentId))
      .innerJoin(sections, eq(sections.id, students.sectionId))
      .where(and(eq(feeInvoices.status, 'due'), sql`${feeInvoices.amountPaise} > ${feeInvoices.paidPaise}`));
    const heldBy = await this.held(tx);
    const sorted = [...steps].sort((a, b) => a.offsetDays - b.offsetDays);
    const day = (d: string) => Date.parse(`${d}T00:00:00Z`) / 86_400_000;
    const sent = new Set((await tx.select({ i: feeReminderSends.invoiceId, s: feeReminderSends.step }).from(feeReminderSends)).map((r) => `${r.i}|${r.s}`));
    const principals = (await tx.selectDistinct({ id: userRoles.userId }).from(userRoles).where(eq(userRoles.role, 'principal'))).map((r) => r.id);
    const accounts = (await tx.selectDistinct({ id: userRoles.userId }).from(userRoles).where(eq(userRoles.role, 'accountant'))).map((r) => r.id);
    const out = { students: 0, app: 0, sms: 0, whatsapp: 0, email: 0, escalated: 0, skipped: [] as string[] };
    const studentsTold = new Set<string>();
    const staffDigest = new Map<string, { student: string; title: string; balance: number; days: number }[]>();
    for (const inv of open) {
      if ((heldBy.get(inv.studentId) ?? 0) >= inv.balance) continue;
      const since = Math.round(day(today) - day(inv.dueOn));
      const step = [...sorted].reverse().find((x) => since >= x.offsetDays && (x.minRupees ?? 0) * 100 <= inv.balance);
      if (!step) continue;
      const key = `d${step.offsetDays >= 0 ? (step.offsetDays === 0 ? '0' : `+${step.offsetDays}`) : step.offsetDays}`;
      if (sent.has(`${inv.id}|${key}`)) continue;
      sent.add(`${inv.id}|${key}`);
      const record = (channel: string, audience: string) => tx.insert(feeReminderSends).values({ tenantId, invoiceId: inv.id, studentId: inv.studentId, step: key, channel, audience, sentOn: today, balancePaise: inv.balance }).onConflictDoNothing();
      for (const aud of step.audience) {
        if (aud === 'family') {
          studentsTold.add(inv.studentId);
          if (step.channels.includes('app')) {
            await this.notifications.feeReminder(tx, { studentId: inv.studentId, balancePaise: inv.balance, dueOn: inv.dueOn, day: `${today}:${key}` });
            await record('app', 'family');
            out.app++;
          }
          const ids = await familyUserIds(tx, inv.studentId);
          for (const ch of ['sms', 'whatsapp', 'email'] as const) {
            if (!step.channels.includes(ch)) continue;
            const r = await sendFeeMessage(tx, { tenantId, key: since < 0 ? 'fee_reminder' : since === 0 ? 'fee_due_today' : 'fee_overdue', channel: ch, userIds: ids, vars: { student: inv.student, amount: `₹${(inv.balance / 100).toLocaleString('en-IN')}`, dueOn: inv.dueOn, fee: inv.title }, title: `Fee reminder ${key}: ${inv.student}`, dedupe: `fee-reminder ${inv.id} ${key}`, createdBy: null, at: this.clock.now() });
            if (r.ok) {
              await record(ch, 'family');
              out[ch]++;
            } else if (!out.skipped.includes(r.error)) out.skipped.push(r.error);
          }
        } else {
          const to = aud === 'class_teacher' ? (inv.classTeacher ? [inv.classTeacher] : []) : aud === 'principal' ? principals : accounts;
          for (const u of to) staffDigest.set(u, [...(staffDigest.get(u) ?? []), { student: inv.student, title: inv.title, balance: inv.balance, days: since }]);
          if (to.length) {
            await record('app', aud);
            out.escalated++;
          }
        }
      }
    }
    // Staff get one digest each: the students overdue at their step.
    for (const [userId, items] of staffDigest) {
      const total = items.reduce((t, x) => t + x.balance, 0);
      await this.notifications.notifyUsers(tx, [userId], { kind: 'task', text: feeTexts.escalation(items.length, total, items.slice(0, 3).map((x) => x.student)), data: { day: today, students: String(items.length) }, dedupeKey: `fee-escalation:${userId}:${today}` });
    }
    out.students = studentsTold.size;
    await tx.insert(feeReminderRuns).values({ tenantId, runOn: today, kind: 'scheduled', students: out.students, app: out.app, sms: out.sms, whatsapp: out.whatsapp, skipped: out.skipped });
    return out;
  }

  /** Yesterday's collection to the principal and institution admins, when the summary is switched on. */
  async summary(tx: Tx, tenantId: string, force = false) {
    const s = await settingsOf(tx, tenantId);
    if (!force && !s.reminders.dailySummary) return null;
    const today = await this.today(tx);
    const d = new Date(`${today}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - (force ? 0 : 1));
    const day = d.toISOString().slice(0, 10);
    const [c] = await tx.execute<{ total: string; n: number }>(sql`select coalesce(sum(total_paise), 0)::bigint as total, count(*)::int as n from fee_receipts where collected_on = ${day}::date and status in ('active', 'cancel_pending')`).then((x) => x.rows);
    const [due] = await tx.execute<{ due: string }>(sql`select coalesce(sum(amount_paise - paid_paise), 0)::bigint as due from fee_invoices where status = 'due'`).then((x) => x.rows);
    const ids = (await tx.selectDistinct({ id: userRoles.userId }).from(userRoles).where(inArray(userRoles.role, ['principal', 'tenant_admin']))).map((r) => r.id);
    await this.notifications.notifyUsers(tx, ids, { kind: 'task', text: feeTexts.dailySummary(day, Number(c.total), c.n, Number(due.due)), data: { day, collectedPaise: String(c.total) }, dedupeKey: `fee-summary:${day}` });
    return { day, collectedPaise: Number(c.total), receipts: c.n, duePaise: Number(due.due), sentTo: ids.length };
  }
}

