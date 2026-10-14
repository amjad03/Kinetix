import { Injectable, OnModuleInit } from '@nestjs/common';
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { UserPrincipal } from '../auth/principal.js';
import { auditUser } from '../common/audit.js';
import { Clock, localParts } from '../common/time.js';
import { DbService, type Tx } from '../db/db.service.js';
import { audienceRules, messageCampaigns, messageTemplates } from '../db/schema-pathways.js';
import { feeReminderRuns } from '../db/schema-fee-depth.js';
import { feeInvoices, students, tenants, userRoles } from '../db/schema.js';
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
    const min = Math.round((s.duesBlock.minRupees ?? 0) * 100);
    const over = d.overdue > 0 && d.overdue >= min;
    return { duePaise: d.due, overduePaise: d.overdue, minPaise: min, hallTicket: !!s.duesBlock.hallTicket && over, results: !!s.duesBlock.results && over, tc: !!s.duesBlock.tc && over };
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
    const open = await tx.select({ studentId: feeInvoices.studentId, dueOn: feeInvoices.dueOn, balance: sql<number>`(${feeInvoices.amountPaise} - ${feeInvoices.paidPaise})::bigint`.mapWith(Number) }).from(feeInvoices).where(eq(feeInvoices.status, 'due'));
    const chosen = open.filter((i) => (p ? i.dueOn < today : reminderDue(s.reminders, i.dueOn, today)));
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

