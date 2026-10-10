import { BadRequestException, Body, Controller, ForbiddenException, Get, HttpCode, Injectable, NotFoundException, OnModuleInit, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { and, asc, desc, eq, inArray, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { BoardPrincipal, RoleName, UserPrincipal } from '../auth/principal.js';
import { auditUser, audit } from '../common/audit.js';
import { Day } from '../common/ops.js';
import { tenantToday } from '../common/tenant-today.js';
import { Clock } from '../common/time.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService, type Tx } from '../db/db.service.js';
import { mentorAssignments, students, timetableSlots } from '../db/schema.js';
import { earlyAlertFlags, earlyAlertInterventions } from '../db/schema-integrations.js';
import { JobsService, type Job } from '../jobs/jobs.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { type AlertSignals, scoreSignals } from './early-alert-rules.js';

const MANAGERS = ['tenant_admin', 'principal', 'hod', 'counsellor'] as RoleName[];
const WORKERS = [...MANAGERS, 'teacher', 'mentor'] as RoleName[];
export const EARLY_ALERTS_JOB = 'early_alerts.compute';
const IntervBody = z.object({ action: z.enum(['call_parent', 'meet_student', 'extra_class', 'counselling_referral', 'remedial_plan', 'other']), note: z.string().trim().max(1000).default(''), dueOn: Day.optional() });
const StatusBody = z.object({ status: z.enum(['open', 'resolved', 'dismissed']), outcome: z.string().trim().max(500).optional() });

@Injectable()
export class EarlyAlertService implements OnModuleInit {
  constructor(private readonly db: DbService, private readonly clock: Clock, private readonly jobs: JobsService, private readonly notifications: NotificationsService) {}

  onModuleInit() {
    this.jobs.registerDaily(EARLY_ALERTS_JOB, (job: Job) => this.compute(job.tenantId).then(() => undefined));
  }

  compute(tenantId: string) {
    return this.db.withTenant(tenantId, (tx) => this.computeTx(tx, tenantId));
  }

  /** Recomputes every active student's flag from attendance, results, homework and fees. */
  async computeTx(tx: Tx, tenantId: string) {
    const today = await tenantToday(tx, this.clock);
    const rows = (q: ReturnType<typeof sql>) => tx.execute(q).then((r) => r.rows as Record<string, any>[]);
    const att = await rows(sql`select student_id, count(*)::int as total, count(*) filter (where status in ('present','late','excused'))::int as ok from attendance_records where date > (${today}::date - 30) and date <= ${today}::date group by student_id`);
    const marks = await rows(sql`with latest as (select distinct on (r.student_id) r.id, r.student_id from exam_results r join exam_sessions x on x.id = r.session_id where x.status in ('published','locked') order by r.student_id, x.starts_on desc, r.computed_at desc)
      select l.student_id, avg(rl.percent)::float as avg, count(*) filter (where not rl.passed)::int as failed from latest l join exam_result_lines rl on rl.result_id = l.id group by l.student_id`);
    const hw = await rows(sql`select s.id as student_id, count(h.id)::int as total, count(h.id) filter (where hs.homework_id is null)::int as missed from students s join homework h on h.section_id = s.section_id and h.due_on > (${today}::date - 30) and h.due_on <= ${today}::date left join homework_submissions hs on hs.homework_id = h.id and hs.student_id = s.id group by s.id`);
    const fees = await rows(sql`select student_id, sum(amount_paise - paid_paise)::bigint as due, (${today}::date - min(due_on))::int as days from fee_invoices where status = 'due' and paid_paise < amount_paise and due_on < ${today}::date group by student_id`);
    const mentors = await tx.select({ studentId: mentorAssignments.studentId, mentor: mentorAssignments.mentorUserId }).from(mentorAssignments).where(sql`${mentorAssignments.endedOn} is null`);
    const by = (l: Record<string, any>[]) => new Map(l.map((r) => [r.student_id as string, r]));
    const A = by(att), M = by(marks), H = by(hw), F = by(fees);
    const mentorOf = new Map(mentors.map((m) => [m.studentId, m.mentor]));
    const roster = await tx.select({ id: students.id, name: students.fullName }).from(students).where(inArray(students.status, ['active', 'enrolled']));
    const existing = new Map((await tx.select().from(earlyAlertFlags)).map((f) => [f.studentId, f]));
    const now = this.clock.now();
    let flagged = 0, created = 0, cleared = 0;
    for (const st of roster) {
      const a = A.get(st.id), m = M.get(st.id), h = H.get(st.id), f = F.get(st.id);
      const signals: AlertSignals = { attendancePct: a && a.total >= 5 ? (a.ok / a.total) * 100 : null, averagePercent: m?.avg ?? null, failedSubjects: m?.failed ?? 0, homeworkMissedPct: h && h.total >= 2 ? (h.missed / h.total) * 100 : null, overdueDays: f?.days ?? 0, overduePaise: Number(f?.due ?? 0) };
      const r = scoreSignals(signals);
      const cur = existing.get(st.id);
      const mentor = mentorOf.get(st.id) ?? null;
      if (r.level === 'none') {
        if (cur && cur.status !== 'resolved') {
          await tx.update(earlyAlertFlags).set({ level: 'none', score: r.score, reasons: r.reasons, status: 'resolved', resolvedAt: now, computedAt: now }).where(eq(earlyAlertFlags.id, cur.id));
          cleared++;
        }
        continue;
      }
      flagged++;
      if (!cur) {
        const [row] = await tx.insert(earlyAlertFlags).values({ tenantId, studentId: st.id, level: r.level, score: r.score, reasons: r.reasons, mentorUserId: mentor, computedAt: now }).returning({ id: earlyAlertFlags.id });
        created++;
        if (mentor && r.level !== 'watch') await this.tellMentor(tx, mentor, st.name, r.level, row.id);
        continue;
      }
      const closed = cur.status === 'resolved' || cur.status === 'dismissed';
      const reopen = closed && (r.level === 'high' || r.level === 'medium') && (!cur.resolvedAt || now.getTime() - cur.resolvedAt.getTime() > 14 * 86_400_000 || cur.level === 'none');
      if (closed && !reopen) continue;
      await tx.update(earlyAlertFlags).set({ level: r.level, score: r.score, reasons: r.reasons, mentorUserId: mentor, computedAt: now, ...(reopen ? { status: 'open', resolvedAt: null } : {}) }).where(eq(earlyAlertFlags.id, cur.id));
      if (mentor && (reopen || (cur.level !== 'high' && r.level === 'high'))) await this.tellMentor(tx, mentor, st.name, r.level, cur.id);
    }
    await audit(tx, { tenantId, actorType: 'system', action: 'early_alerts.computed', data: { students: roster.length, flagged, created, cleared } });
    return { students: roster.length, flagged, created, cleared };
  }

  private tellMentor(tx: Tx, mentor: string, name: string, level: string, flagId: string) {
    return this.notifications.notifyUsers(tx, [mentor], {
      kind: 'welfare',
      text: { en: { title: `${name} needs your attention`, body: `An early alert (${level}) was raised for your mentee. Open it to see why and plan a step.` }, hi: { title: `${name} पर आपका ध्यान चाहिए`, body: `आपके मेंटी के लिए प्रारंभिक चेतावनी (${level}) आई है। कारण देखें और अगला कदम तय करें।` }, kn: { title: `${name} ಅವರ ಕಡೆಗೆ ನಿಮ್ಮ ಗಮನ ಬೇಕು`, body: `ನಿಮ್ಮ ಮೆಂಟಿಗೆ ಮುಂಚಿತ ಎಚ್ಚರಿಕೆ (${level}) ಬಂದಿದೆ. ಕಾರಣ ನೋಡಿ, ಮುಂದಿನ ಹೆಜ್ಜೆ ಯೋಜಿಸಿ.` } },
      data: { flagId },
      dedupeKey: `early-alert:${flagId}:${level}`,
    });
  }
}

/** Slow-learner and at-risk flags, and the mentor's intervention workflow. Students and parents never see these. */
@Controller('v1/early-alerts')
export class EarlyAlertsController {
  constructor(private readonly db: DbService, private readonly svc: EarlyAlertService) {}

  private isManager(p: UserPrincipal) {
    return p.roles.some((r) => MANAGERS.includes(r));
  }

  /** Students the caller may act on: managers all; others their mentees and the classes they teach. */
  private async scope(tx: Tx, p: UserPrincipal) {
    if (this.isManager(p)) return undefined;
    const mentees = tx.select({ id: mentorAssignments.studentId }).from(mentorAssignments).where(and(eq(mentorAssignments.mentorUserId, p.userId), sql`${mentorAssignments.endedOn} is null`));
    const classes = tx.select({ id: students.id }).from(students).where(inArray(students.sectionId, tx.select({ s: timetableSlots.sectionId }).from(timetableSlots).where(eq(timetableSlots.teacherId, p.userId))));
    return or(inArray(earlyAlertFlags.studentId, mentees), inArray(earlyAlertFlags.studentId, classes));
  }

  @Post('run')
  @HttpCode(200)
  @Auth('user', MANAGERS)
  run(@CurrentPrincipal() p: UserPrincipal) {
    return this.svc.compute(p.tenantId);
  }

  @Get()
  @Auth('user', WORKERS)
  list(@CurrentPrincipal() p: UserPrincipal, @Query('status') status?: string, @Query('level') level?: string, @Query('mine') mine?: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const scope = mine === 'true' ? inArray(earlyAlertFlags.studentId, tx.select({ id: mentorAssignments.studentId }).from(mentorAssignments).where(and(eq(mentorAssignments.mentorUserId, p.userId), sql`${mentorAssignments.endedOn} is null`))) : await this.scope(tx, p);
      const rows = await tx
        .select({ id: earlyAlertFlags.id, studentId: earlyAlertFlags.studentId, studentName: students.fullName, rollNo: students.rollNo, sectionId: students.sectionId, level: earlyAlertFlags.level, score: earlyAlertFlags.score, reasons: earlyAlertFlags.reasons, status: earlyAlertFlags.status, mentorUserId: earlyAlertFlags.mentorUserId, computedAt: earlyAlertFlags.computedAt })
        .from(earlyAlertFlags).innerJoin(students, eq(students.id, earlyAlertFlags.studentId))
        .where(and(status ? eq(earlyAlertFlags.status, status) : sql`${earlyAlertFlags.status} in ('open','in_progress')`, level ? eq(earlyAlertFlags.level, level) : undefined, scope))
        .orderBy(desc(earlyAlertFlags.score), asc(students.fullName)).limit(500);
      return rows;
    });
  }

  /** Flags of one class, for the teacher app and the board roster: teachers of that class only. */
  @Get('section/:sectionId')
  @Auth(['user', 'board'], [...WORKERS])
  async section(@CurrentPrincipal() p: UserPrincipal | BoardPrincipal, @Param('sectionId', ParseUUIDPipe) sectionId: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const teacherId = p.kind === 'board' ? p.teacherId : p.userId;
      const manager = p.kind === 'user' && this.isManager(p);
      if (!manager) {
        const [slot] = await tx.select({ id: timetableSlots.id }).from(timetableSlots).where(and(eq(timetableSlots.sectionId, sectionId), eq(timetableSlots.teacherId, teacherId))).limit(1);
        const [mentee] = await tx.select({ id: mentorAssignments.id }).from(mentorAssignments).innerJoin(students, eq(students.id, mentorAssignments.studentId)).where(and(eq(students.sectionId, sectionId), eq(mentorAssignments.mentorUserId, teacherId))).limit(1);
        if (!slot && !mentee) throw new ForbiddenException('You do not teach this class');
      }
      return tx.select({ studentId: earlyAlertFlags.studentId, flagId: earlyAlertFlags.id, level: earlyAlertFlags.level, status: earlyAlertFlags.status, reasons: earlyAlertFlags.reasons }).from(earlyAlertFlags).innerJoin(students, eq(students.id, earlyAlertFlags.studentId)).where(and(eq(students.sectionId, sectionId), sql`${earlyAlertFlags.status} in ('open','in_progress')`));
    });
  }

  @Get(':id')
  @Auth('user', WORKERS)
  one(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const flag = await this.visible(tx, p, id);
      const interventions = await tx.select().from(earlyAlertInterventions).where(eq(earlyAlertInterventions.flagId, id)).orderBy(desc(earlyAlertInterventions.createdAt));
      return { ...flag, interventions };
    });
  }

  private async visible(tx: Tx, p: UserPrincipal, id: string) {
    const scope = await this.scope(tx, p);
    const [row] = await tx.select().from(earlyAlertFlags).where(and(eq(earlyAlertFlags.id, id), scope));
    if (!row) throw new NotFoundException('Alert not found');
    return row;
  }

  @Post(':id/interventions')
  @Auth('user', WORKERS)
  intervene(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(IntervBody)) b: z.infer<typeof IntervBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const flag = await this.visible(tx, p, id);
      const [row] = await tx.insert(earlyAlertInterventions).values({ tenantId: p.tenantId, flagId: id, studentId: flag.studentId, byUserId: p.userId, ...b, dueOn: b.dueOn ?? null }).returning();
      if (flag.status === 'open') await tx.update(earlyAlertFlags).set({ status: 'in_progress' }).where(eq(earlyAlertFlags.id, id));
      await auditUser(tx, p, 'early_alert.intervention', 'early_alert', id, { action: b.action });
      return row;
    });
  }

  @Put(':id/interventions/:iid/outcome')
  @Auth('user', WORKERS)
  outcome(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Param('iid', ParseUUIDPipe) iid: string, @Body(new ZodBody(z.object({ outcome: z.string().trim().min(1).max(500) }))) b: { outcome: string }) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await this.visible(tx, p, id);
      const [row] = await tx.update(earlyAlertInterventions).set({ outcome: b.outcome }).where(and(eq(earlyAlertInterventions.id, iid), eq(earlyAlertInterventions.flagId, id))).returning();
      if (!row) throw new NotFoundException('Step not found');
      return row;
    });
  }

  @Put(':id/status')
  @Auth('user', WORKERS)
  status(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(StatusBody)) b: z.infer<typeof StatusBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const flag = await this.visible(tx, p, id);
      if (b.status === 'dismissed' && !this.isManager(p) && flag.mentorUserId !== p.userId) throw new ForbiddenException('Only the mentor or a head can dismiss an alert');
      if (b.status !== 'open' && !b.outcome) throw new BadRequestException('Say what happened before closing the alert');
      const [row] = await tx.update(earlyAlertFlags).set({ status: b.status, resolvedAt: b.status === 'open' ? null : new Date() }).where(eq(earlyAlertFlags.id, id)).returning();
      if (b.outcome) await tx.insert(earlyAlertInterventions).values({ tenantId: p.tenantId, flagId: id, studentId: flag.studentId, byUserId: p.userId, action: `closed_${b.status}`, note: b.outcome, outcome: b.outcome });
      await auditUser(tx, p, 'early_alert.status', 'early_alert', id, { status: b.status });
      return row;
    });
  }
}
