import { BadRequestException, Body, Controller, Get, HttpCode, Injectable, OnModuleInit, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { and, asc, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { UserPrincipal } from '../auth/principal.js';
import { auditUser } from '../common/audit.js';
import { Clock } from '../common/time.js';
import { tenantToday } from '../common/tenant-today.js';
import { Day } from '../common/ops.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService, type Tx } from '../db/db.service.js';
import { userRoles, users } from '../db/schema.js';
import { complianceDeadlines, rtiRequests } from '../db/schema-governance-pass.js';
import { JobsService, type Job } from '../jobs/jobs.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { GOVERNANCE_ROLES } from './governance.controller.js';
import { govTexts } from './governance-texts.js';
import { GovernancePassRecords, RTI_ROLES } from './governance-pass.records.js';
import { daysBetween, deadlineState, reminderDue, standardDate, STANDARD_DEADLINES } from './statutory.js';

export const COMPLIANCE_REMINDER_JOB = 'governance.compliance-reminders';

/** Reminders for compliance deadlines and RTI replies, once a day per institution. */
@Injectable()
export class ComplianceReminders implements OnModuleInit {
  constructor(
    private readonly db: DbService,
    private readonly jobs: JobsService,
    private readonly clock: Clock,
    private readonly notifications: NotificationsService,
  ) {}

  onModuleInit(): void {
    this.jobs.registerDaily(COMPLIANCE_REMINDER_JOB, (job: Job) => this.db.withTenant(job.tenantId, (tx) => this.run(tx)).then(() => undefined));
  }

  /**
   * Each open deadline whose reminder day has come tells its owner (or the principals when it has none); a deadline
   * that passed undone tells them once. Each open RTI request tells its PIO in the last five days and when overdue.
   */
  async run(tx: Tx): Promise<{ deadlines: number; missed: number; rti: number }> {
    const today = await tenantToday(tx, this.clock);
    const leaders = (await tx.selectDistinct({ id: userRoles.userId }).from(userRoles).innerJoin(users, eq(users.id, userRoles.userId)).where(and(inArray(userRoles.role, ['principal', 'quality_officer']), eq(users.status, 'active')))).map((r) => r.id);
    let deadlines = 0;
    let missed = 0;
    const open = await tx.select().from(complianceDeadlines).where(and(eq(complianceDeadlines.status, 'pending'), lte(complianceDeadlines.dueOn, sql`${today}::date + 366`)));
    for (const d of open) {
      const to = d.ownerUserId ? [d.ownerUserId] : leaders;
      if (d.dueOn < today) {
        if (d.lastRemindedOn && d.lastRemindedOn > d.dueOn) continue;
        await this.notifications.notifyUsers(tx, to, { kind: 'task', text: govTexts.deadlineMissed({ title: d.title, dueOn: d.dueOn }), data: { deadlineId: d.id }, dedupeKey: `compliance-missed:${d.id}` });
        await tx.update(complianceDeadlines).set({ lastRemindedOn: today, remindersSent: d.remindersSent + 1 }).where(eq(complianceDeadlines.id, d.id));
        missed++;
        continue;
      }
      const step = reminderDue({ status: d.status, dueOn: d.dueOn, remindDays: d.remindDays, lastRemindedOn: d.lastRemindedOn }, today);
      if (step === null) continue;
      await this.notifications.notifyUsers(tx, to, { kind: 'task', text: govTexts.deadlineReminder({ title: d.title, dueOn: d.dueOn, days: daysBetween(today, d.dueOn) }), data: { deadlineId: d.id }, dedupeKey: `compliance-remind:${d.id}:${step}` });
      await tx.update(complianceDeadlines).set({ lastRemindedOn: today, remindersSent: d.remindersSent + 1 }).where(eq(complianceDeadlines.id, d.id));
      deadlines++;
    }
    let rti = 0;
    const due = await tx.select().from(rtiRequests).where(and(inArray(rtiRequests.status, ['received', 'transferred']), lte(rtiRequests.dueOn, sql`${today}::date + 5`)));
    for (const r of due) {
      if (r.status === 'transferred') continue;
      if (r.lastRemindedOn === today) continue;
      const to = r.pioUserId ? [r.pioUserId] : leaders;
      await this.notifications.notifyUsers(tx, to, { kind: 'task', text: govTexts.rtiDue({ no: r.requestNo, dueOn: r.dueOn, days: daysBetween(today, r.dueOn) }), data: { rtiId: r.id }, dedupeKey: `rti-due:${r.id}:${today}` });
      await tx.update(rtiRequests).set({ lastRemindedOn: today }).where(eq(rtiRequests.id, r.id));
      rti++;
    }
    return { deadlines, missed, rti };
  }
}

/**
 * The compliance calendar (regulatory deadlines of UGC, AICTE, NAAC, NIRF, AISHE, the income-tax and PF authorities)
 * and the RTI register's returns. The lists themselves are record kit lists (governance-pass.records.ts).
 */
@Controller('v1/governance')
export class ComplianceController {
  constructor(
    private readonly db: DbService,
    private readonly clock: Clock,
    private readonly records: GovernancePassRecords,
    private readonly reminders: ComplianceReminders,
  ) {}

  /** Deadlines between two dates (the next 12 months by default), each with its state, grouped by month. */
  @Get('compliance/calendar')
  @Auth('user', GOVERNANCE_ROLES)
  calendar(@CurrentPrincipal() p: UserPrincipal, @Query('from') from?: string, @Query('to') to?: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const today = await tenantToday(tx, this.clock);
      const lo = from && Day.safeParse(from).success ? from : `${today.slice(0, 7)}-01`;
      const hi = to && Day.safeParse(to).success ? to : sql`(${lo}::date + interval '12 months' - interval '1 day')::date`;
      const rows = await tx
        .select({ d: complianceDeadlines, owner: users.fullName })
        .from(complianceDeadlines)
        .leftJoin(users, eq(users.id, complianceDeadlines.ownerUserId))
        .where(and(gte(complianceDeadlines.dueOn, lo), lte(complianceDeadlines.dueOn, hi as string)))
        .orderBy(asc(complianceDeadlines.dueOn))
        .limit(1000);
      // Overdue items from before the window still need doing, so they come first.
      const late = await tx.select({ d: complianceDeadlines, owner: users.fullName }).from(complianceDeadlines).leftJoin(users, eq(users.id, complianceDeadlines.ownerUserId)).where(and(eq(complianceDeadlines.status, 'pending'), sql`${complianceDeadlines.dueOn} < ${lo}`)).orderBy(asc(complianceDeadlines.dueOn));
      const items = [...late, ...rows].map((r) => ({ id: r.d.id, title: r.d.title, authority: r.d.authority, dueOn: r.d.dueOn, recurrence: r.d.recurrence, status: r.d.status, state: deadlineState(r.d, today), owner: r.owner, reference: r.d.reference, completedOn: r.d.completedOn, daysLeft: daysBetween(today, r.d.dueOn) }));
      const months = new Map<string, typeof items>();
      for (const it of items) months.set(it.dueOn.slice(0, 7), [...(months.get(it.dueOn.slice(0, 7)) ?? []), it]);
      const count = (s: string) => items.filter((i) => i.state === s).length;
      return { today, from: lo, totals: { overdue: count('overdue'), dueSoon: count('due_soon'), upcoming: count('upcoming'), done: count('done') }, months: [...months].map(([month, list]) => ({ month, items: list })) };
    });
  }

  /** Adds the standard deadlines of an academic year (June to May) that are not on the calendar yet. */
  @Post('compliance/standard')
  @HttpCode(200)
  @Auth('user', GOVERNANCE_ROLES)
  standard(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(z.object({ startYear: z.number().int().min(2000).max(2100).optional(), ownerUserId: z.uuid().optional() }))) b: { startYear?: number; ownerUserId?: string }) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const today = await tenantToday(tx, this.clock);
      const start = b.startYear ?? Number(today.slice(0, 4)) - (Number(today.slice(5, 7)) < 6 ? 1 : 0);
      const have = await tx.select({ title: complianceDeadlines.title, dueOn: complianceDeadlines.dueOn }).from(complianceDeadlines).where(and(gte(complianceDeadlines.dueOn, `${start}-06-01`), lte(complianceDeadlines.dueOn, `${start + 1}-05-31`)));
      const add = STANDARD_DEADLINES.map((s) => ({ s, dueOn: standardDate(s, start) })).filter(({ s }) => !have.some((h) => h.title === s.title));
      if (add.length) await tx.insert(complianceDeadlines).values(add.map(({ s, dueOn }) => ({ tenantId: p.tenantId, title: s.title, authority: s.authority, frameworkKey: s.frameworkKey ?? null, dueOn, recurrence: s.recurrence, note: s.note, ownerUserId: b.ownerUserId ?? null, createdBy: p.userId })));
      await auditUser(tx, p, 'compliance.standard_added', 'compliance_deadline', undefined, { startYear: start, added: add.length });
      return { added: add.length, year: `${start}-${String((start + 1) % 100).padStart(2, '0')}` };
    });
  }

  /** Marks a deadline done (the next occurrence of a recurring one is created). */
  @Post('compliance/:id/done')
  @HttpCode(200)
  @Auth('user', GOVERNANCE_ROLES)
  done(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(z.object({ reference: z.string().trim().max(200).default('') }))) b: { reference: string }) {
    return this.db.withTenant(p.tenantId, async (tx) => ({ message: await this.records.completeDeadline({ tx, p }, id, b.reference, await tenantToday(tx, this.clock)) }));
  }

  /** Runs today's reminders now (the daily job does the same). */
  @Post('compliance/remind')
  @HttpCode(200)
  @Auth('user', GOVERNANCE_ROLES)
  remind(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const r = await this.reminders.run(tx);
      await auditUser(tx, p, 'compliance.reminders_sent', 'compliance_deadline', undefined, r);
      return r;
    });
  }

  /**
   * The RTI return for a period (the quarter by default, as section 25 asks): requests carried in, received,
   * transferred, replied, refused by section, fees collected, first appeals received and decided, and late replies.
   */
  @Get('rti/register')
  @Auth('user', RTI_ROLES)
  rtiRegister(@CurrentPrincipal() p: UserPrincipal, @Query('from') from?: string, @Query('to') to?: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const today = await tenantToday(tx, this.clock);
      const q = Math.floor((Number(today.slice(5, 7)) - 1) / 3);
      const lo = from && Day.safeParse(from).success ? from : `${today.slice(0, 4)}-${String(q * 3 + 1).padStart(2, '0')}-01`;
      const hi = to && Day.safeParse(to).success ? to : today;
      if (hi < lo) throw new BadRequestException('The period ends before it starts');
      const all = await tx.select().from(rtiRequests).where(lte(rtiRequests.receivedOn, hi));
      const inPeriod = (d: string | null) => !!d && d >= lo && d <= hi;
      const carried = all.filter((r) => r.receivedOn < lo && (!r.repliedOn || r.repliedOn >= lo) && (!r.transferredOn || r.transferredOn >= lo));
      const received = all.filter((r) => inPeriod(r.receivedOn));
      const replied = all.filter((r) => r.status !== 'rejected' && inPeriod(r.repliedOn));
      const refused = all.filter((r) => r.status === 'rejected' && inPeriod(r.repliedOn));
      const transferred = all.filter((r) => inPeriod(r.transferredOn));
      const bySection: Record<string, number> = {};
      for (const r of refused) bySection[r.rejectionSection] = (bySection[r.rejectionSection] ?? 0) + 1;
      const pending = all.filter((r) => ['received'].includes(r.status) || (r.repliedOn !== null && r.repliedOn > hi));
      return {
        from: lo,
        to: hi,
        carriedIn: carried.length,
        received: received.length,
        transferred: transferred.length,
        replied: replied.length,
        refused: refused.length,
        refusedBySection: bySection,
        pendingAtEnd: pending.filter((r) => r.receivedOn <= hi).length,
        lateReplies: [...replied, ...refused].filter((r) => r.repliedOn! > r.dueOn).length,
        overdueNow: all.filter((r) => r.status === 'received' && r.dueOn < today).length,
        feesPaise: received.reduce((a, r) => a + r.feePaise, 0) + [...replied].reduce((a, r) => a + r.additionalFeePaise, 0),
        appealsReceived: all.filter((r) => inPeriod(r.appealFiledOn)).length,
        appealsDecided: all.filter((r) => inPeriod(r.appealDecidedOn)).length,
        appealsPending: all.filter((r) => r.appealFiledOn && !r.appealOutcome).length,
      };
    });
  }
}
