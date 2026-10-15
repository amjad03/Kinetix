import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { randomInt } from 'node:crypto';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { UserPrincipal } from '../auth/principal.js';
import { Clock, zonedToInstant } from '../common/time.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService, type Tx } from '../db/db.service.js';
import { qbPaperReleases } from '../db/schema-depth.js';
import { qpAppointments, qpSetDraws } from '../db/schema-exam-flagship.js';
import { coSets, courseOutcomes, examPapers, qbBlueprints, qbPaperItems, qbPapers, subjects, tenants, userRoles, users } from '../db/schema.js';
import { loadOfficeSettings } from '../exam-office/settings.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { TasksService } from '../tasks/tasks.service.js';
import { auditCell, CELL, CELL_READ, loadSession } from './common.js';
import { blueprintGaps, coverage, drawIndex, overlapPercent, setterProgress, type SetItem } from './qp.logic.js';

const AppointBody = z.object({
  subjectId: z.uuid(),
  role: z.enum(['setter', 'moderator']),
  userId: z.uuid(),
  setsRequired: z.number().int().min(1).max(6).default(2),
  dueOn: z.iso.date(),
  remunerationPaise: z.number().int().min(0).max(10_000_000).default(0),
  note: z.string().trim().max(500).optional(),
});
const RespondBody = z.object({ accept: z.boolean(), note: z.string().trim().max(500).optional() });
const CancelBody = z.object({ reason: z.string().trim().min(3).max(300) });

type Appointment = typeof qpAppointments.$inferSelect;

/**
 * Whether the user may build a set of this session's subject: an accepted setter appointed for it, or the exam office.
 * Called by the question bank when a paper is made for a session.
 */
export async function assertCanSet(tx: Tx, p: UserPrincipal, sessionId: string, subjectId: string): Promise<void> {
  if (p.roles.some((r) => CELL.includes(r))) return;
  const [a] = await tx.select({ id: qpAppointments.id }).from(qpAppointments).where(and(eq(qpAppointments.sessionId, sessionId), eq(qpAppointments.subjectId, subjectId), eq(qpAppointments.role, 'setter'), eq(qpAppointments.userId, p.userId), eq(qpAppointments.status, 'accepted')));
  if (!a) throw new ForbiddenException('Only the setter appointed (and accepted) for this paper can set it');
}

/** The appointed moderator of a session's subject, when one has accepted (the scrutiny must go to them). */
export async function appointedModerator(tx: Tx, sessionId: string, subjectId: string): Promise<string | null> {
  const [a] = await tx.select({ userId: qpAppointments.userId }).from(qpAppointments).where(and(eq(qpAppointments.sessionId, sessionId), eq(qpAppointments.subjectId, subjectId), eq(qpAppointments.role, 'moderator'), eq(qpAppointments.status, 'accepted')));
  return a?.userId ?? null;
}

/**
 * Question paper setting for an exam session: the controller appoints setters and moderators per subject, setters
 * build sets (A, B, C ...) from the question bank against a blueprint, moderators scrutinise them, the office locks
 * them and draws the set the examination uses; only the drawn set is sealed for release before the exam.
 */
@Controller('v1')
export class QpSettingController {
  constructor(
    private readonly db: DbService,
    private readonly clock: Clock,
    private readonly tasks: TasksService,
    private readonly notes: NotificationsService,
  ) {}

  /** Every subject of the session with its appointments, sets (with what each covers) and the draw. */
  @Get('exam-sessions/:id/qp-setting')
  @Auth('user', CELL_READ)
  overview(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const s = await loadSession(tx, id);
      const today = this.clock.now().toISOString().slice(0, 10);
      const subs = await tx
        .selectDistinct({ id: subjects.id, code: subjects.code, name: subjects.name, examDate: sql<string>`min(${examPapers.examDate})::text`, startsAt: sql<string>`min(${examPapers.startsAt})::text` })
        .from(examPapers)
        .innerJoin(subjects, eq(subjects.id, examPapers.subjectId))
        .where(eq(examPapers.sessionId, id))
        .groupBy(subjects.id, subjects.code, subjects.name)
        .orderBy(asc(subjects.code));
      const apps = await tx.select({ a: qpAppointments, name: users.fullName }).from(qpAppointments).innerJoin(users, eq(users.id, qpAppointments.userId)).where(eq(qpAppointments.sessionId, id)).orderBy(asc(qpAppointments.createdAt));
      const sets = await tx.select({ id: qbPapers.id, subjectId: qbPapers.subjectId, setLabel: qbPapers.setLabel, status: qbPapers.status, title: qbPapers.title, repeats: qbPapers.repeats, blueprintId: qbPapers.blueprintId, setterId: qbPapers.setterId }).from(qbPapers).where(eq(qbPapers.sessionId, id)).orderBy(asc(qbPapers.setLabel));
      const draws = await tx.select().from(qpSetDraws).where(eq(qpSetDraws.sessionId, id));
      const items = sets.length ? await tx.select({ paperId: qbPaperItems.paperId, questionId: qbPaperItems.questionId, section: qbPaperItems.section, marks: qbPaperItems.marks, snapshot: qbPaperItems.snapshot }).from(qbPaperItems).where(inArray(qbPaperItems.paperId, sets.map((x) => x.id))) : [];
      const releases = sets.length ? await tx.select().from(qbPaperReleases).where(inArray(qbPaperReleases.paperId, sets.map((x) => x.id))) : [];
      const rows = subs.map((sub) => {
        const mySets = sets.filter((x) => x.subjectId === sub.id);
        const draw = draws.find((d) => d.subjectId === sub.id);
        const qids = new Map(mySets.map((x) => [x.id, items.filter((i) => i.paperId === x.id).map((i) => i.questionId)]));
        const setRows = mySets.map((x) => {
          const cov = coverage(items.filter((i) => i.paperId === x.id).map((i) => toItem(i)));
          const others = mySets.filter((o) => o.id !== x.id);
          const rel = releases.find((r) => r.paperId === x.id);
          return { ...x, coverage: cov, overlapPercent: others.length ? Math.max(...others.map((o) => overlapPercent(qids.get(x.id) ?? [], qids.get(o.id) ?? []))) : 0, drawn: draw?.paperId === x.id, release: rel ? { releaseAt: rel.releaseAt, status: rel.status } : null };
        });
        const appointments = apps
          .filter((x) => x.a.subjectId === sub.id)
          .map((x) => ({ id: x.a.id, role: x.a.role, userId: x.a.userId, name: x.name, setsRequired: x.a.setsRequired, dueOn: x.a.dueOn, status: x.a.status, progress: x.a.role === 'setter' ? setterProgress(x.a.status, x.a.setsRequired, mySets.filter((m) => m.setterId === x.a.userId)) : x.a.status, overdue: ['appointed', 'accepted'].includes(x.a.status) && x.a.dueOn < today && (x.a.role !== 'setter' || mySets.filter((m) => m.setterId === x.a.userId && m.status !== 'draft').length < x.a.setsRequired), remunerationPaise: x.a.remunerationPaise, note: x.a.note }));
        const locked = mySets.filter((x) => x.status === 'locked').length;
        return { subjectId: sub.id, code: sub.code, name: sub.name, examDate: sub.examDate, startsAt: sub.startsAt?.slice(0, 5) ?? null, appointments, sets: setRows, lockedSets: locked, draw: draw ? { paperId: draw.paperId, setLabel: mySets.find((x) => x.id === draw.paperId)?.setLabel ?? null, drawnAt: draw.drawnAt, candidates: draw.candidates.length } : null, canDraw: !draw && locked >= 2 };
      });
      const summary = {
        subjects: rows.length,
        withSetter: rows.filter((r) => r.appointments.some((a) => a.role === 'setter' && !['declined', 'cancelled'].includes(a.status))).length,
        setsLocked: rows.reduce((a, r) => a + r.lockedSets, 0),
        drawn: rows.filter((r) => r.draw).length,
        overdue: rows.reduce((a, r) => a + r.appointments.filter((x) => x.overdue).length, 0),
      };
      return { session: { id: s.id, name: s.name, status: s.status }, summary, subjects: rows };
    });
  }

  /** The coverage of each set of a subject against its blueprint and the course outcomes. */
  @Get('exam-sessions/:id/subjects/:subjectId/qp-coverage')
  @Auth('user', [...CELL_READ, 'teacher'])
  coverageOf(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Param('subjectId', ParseUUIDPipe) subjectId: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await loadSession(tx, id);
      const sets = await tx.select().from(qbPapers).where(and(eq(qbPapers.sessionId, id), eq(qbPapers.subjectId, subjectId))).orderBy(asc(qbPapers.setLabel));
      if (!p.roles.some((r) => CELL_READ.includes(r)) && !sets.some((x) => x.setterId === p.userId || x.moderatorId === p.userId)) throw new NotFoundException('No sets of yours for this paper');
      const cos = await tx.select({ id: courseOutcomes.id, code: courseOutcomes.code }).from(courseOutcomes).innerJoin(coSets, eq(coSets.id, courseOutcomes.coSetId)).where(and(eq(coSets.subjectId, subjectId), eq(coSets.status, 'active'))).orderBy(asc(courseOutcomes.ord));
      const out = [];
      for (const x of sets) {
        const [bp] = await tx.select().from(qbBlueprints).where(eq(qbBlueprints.id, x.blueprintId));
        const its = (await tx.select().from(qbPaperItems).where(eq(qbPaperItems.paperId, x.id))).map((i) => ({ ...toItem(i), coId: (i.snapshot as { coId?: string | null }).coId ?? null }));
        out.push({ paperId: x.id, setLabel: x.setLabel, status: x.status, blueprint: bp ? { title: bp.title, totalMarks: bp.totalMarks } : null, coverage: coverage(its), gaps: bp ? blueprintGaps(bp.sections, its, cos) : [] });
      }
      return { outcomes: cos.map((c) => c.code), sets: out };
    });
  }

  /** Appoints a setter or a moderator for a subject of the session; they get a task with the due date. */
  @Post('exam-sessions/:id/qp-appointments')
  @Auth('user', CELL)
  appoint(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(AppointBody)) b: z.infer<typeof AppointBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const s = await loadSession(tx, id);
      if (s.status !== 'draft' && s.status !== 'scheduled') throw new ConflictException('Papers can be set only before the examination is processed');
      const [paper] = await tx.select({ id: examPapers.id }).from(examPapers).where(and(eq(examPapers.sessionId, id), eq(examPapers.subjectId, b.subjectId))).limit(1);
      if (!paper) throw new BadRequestException('The subject has no paper in this session');
      const [staff] = await tx.select({ id: users.id, name: users.fullName }).from(users).innerJoin(userRoles, eq(userRoles.userId, users.id)).where(and(eq(users.id, b.userId), inArray(userRoles.role, ['teacher', 'hod', 'principal', 'examiner', 'exam_controller']))).limit(1);
      if (!staff) throw new BadRequestException('Appoint a member of the teaching staff or an examiner');
      const open = await tx.select().from(qpAppointments).where(and(eq(qpAppointments.sessionId, id), eq(qpAppointments.subjectId, b.subjectId), inArray(qpAppointments.status, ['appointed', 'accepted'])));
      if (open.some((a) => a.role === b.role && a.userId === b.userId)) throw new ConflictException(`${staff.name} is already appointed for this paper`);
      if (b.role === 'moderator' && open.some((a) => a.role === 'moderator')) throw new ConflictException('A moderator is already appointed for this paper; cancel that appointment first');
      if (open.some((a) => a.userId === b.userId && a.role !== b.role)) throw new BadRequestException('The setter and the moderator of a paper must be different people');
      const [row] = await tx.insert(qpAppointments).values({ tenantId: p.tenantId, sessionId: id, subjectId: b.subjectId, role: b.role, userId: b.userId, setsRequired: b.role === 'setter' ? b.setsRequired : 0, dueOn: b.dueOn, remunerationPaise: b.remunerationPaise, note: b.note ?? null, createdBy: p.userId }).returning();
      const [sub] = await tx.select({ code: subjects.code, name: subjects.name }).from(subjects).where(eq(subjects.id, b.subjectId));
      await this.tasks.create(tx, {
        tenantId: p.tenantId,
        ownerId: p.userId,
        assigneeId: b.userId,
        title: b.role === 'setter' ? `Set ${b.setsRequired} question paper set(s): ${sub.code} ${sub.name}` : `Moderate the question paper sets: ${sub.code} ${sub.name}`,
        description: `${s.name}. Due on ${b.dueOn}. Accept or decline the appointment first.${b.note ? ` ${b.note}` : ''}`,
        dueAt: new Date(`${b.dueOn}T18:00:00+05:30`),
        priority: 'high',
        sourceModule: 'qp_setting',
        sourceId: row.id,
      });
      await auditCell(tx, p, 'qp.appointed', 'qp_appointment', row.id, { after: { role: b.role, userId: b.userId, subjectId: b.subjectId, setsRequired: row.setsRequired, dueOn: b.dueOn } });
      return row;
    });
  }

  /** The appointee accepts or declines; a decline is passed back to the exam office. */
  @Post('qp-appointments/:id/respond')
  @HttpCode(200)
  @Auth('user')
  respond(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(RespondBody)) b: z.infer<typeof RespondBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const a = await this.load(tx, id);
      if (a.userId !== p.userId) throw new ForbiddenException('Only the person appointed can answer');
      if (a.status !== 'appointed') throw new ConflictException(`The appointment is already ${a.status}`);
      if (!b.accept && !b.note) throw new BadRequestException('Say why you decline');
      const status = b.accept ? 'accepted' : 'declined';
      const [row] = await tx.update(qpAppointments).set({ status, respondedAt: this.clock.now(), note: b.note ?? a.note }).where(eq(qpAppointments.id, id)).returning();
      await auditCell(tx, p, `qp.${status}`, 'qp_appointment', id, { before: { status: a.status }, after: { status, note: b.note ?? null } });
      if (!b.accept) await this.notes.notifyUsers(tx, [a.createdBy], { kind: 'task', text: { title: 'Paper setting declined', body: b.note ?? 'An appointee declined' }, data: { appointmentId: id }, dedupeKey: `qp:declined:${id}` });
      return row;
    });
  }

  @Post('qp-appointments/:id/cancel')
  @HttpCode(200)
  @Auth('user', CELL)
  cancel(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(CancelBody)) b: z.infer<typeof CancelBody>) {
    return this.db.withTenant(p.tenantId, (tx) => cancelAppointment(tx, p, id, b.reason));
  }

  /** The signed-in member of staff's appointments, with the session and subject (teacher app and ERP). */
  @Get('qp-appointments/mine')
  @Auth('user')
  mine(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const rows = await tx.execute(
        sql`select a.id, a.role, a.status, a.sets_required as "setsRequired", a.due_on::text as "dueOn", a.remuneration_paise::float8 as "remunerationPaise", a.note,
              s.id as "sessionId", s.name as session, sub.id as "subjectId", sub.code, sub.name as subject,
              (select count(*)::int from qb_papers q where q.session_id = a.session_id and q.subject_id = a.subject_id and q.setter_id = a.user_id) as "setsMade",
              (select count(*)::int from qb_papers q where q.session_id = a.session_id and q.subject_id = a.subject_id and q.status = 'scrutiny' and q.moderator_id = a.user_id) as "toModerate"
            from qp_appointments a join exam_sessions s on s.id = a.session_id join subjects sub on sub.id = a.subject_id
            where a.user_id = ${p.userId}::uuid and a.status in ('appointed', 'accepted') order by a.due_on`,
      );
      return rows.rows;
    });
  }

  /**
   * Draws, at random, the set the examination uses from the locked sets (at least two), and seals it for release the
   * office's set minutes before the paper starts. The other sets stay locked as reserves.
   */
  @Post('exam-sessions/:id/subjects/:subjectId/draw')
  @HttpCode(200)
  @Auth('user', CELL)
  draw(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Param('subjectId', ParseUUIDPipe) subjectId: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await loadSession(tx, id);
      const [done] = await tx.select().from(qpSetDraws).where(and(eq(qpSetDraws.sessionId, id), eq(qpSetDraws.subjectId, subjectId)));
      if (done) throw new ConflictException('The set for this paper has already been drawn');
      const locked = await tx.select().from(qbPapers).where(and(eq(qbPapers.sessionId, id), eq(qbPapers.subjectId, subjectId), eq(qbPapers.status, 'locked'))).orderBy(asc(qbPapers.setLabel));
      if (locked.length < 2) throw new ConflictException('Lock at least two sets before drawing');
      const [first] = await tx.select({ examDate: examPapers.examDate, startsAt: examPapers.startsAt }).from(examPapers).where(and(eq(examPapers.sessionId, id), eq(examPapers.subjectId, subjectId))).orderBy(asc(examPapers.examDate), asc(examPapers.startsAt)).limit(1);
      if (!first) throw new BadRequestException('The subject has no paper in this session');
      const pick = locked[drawIndex(locked.length, randomInt(0, 1_000_000) / 1_000_000)];
      const [row] = await tx.insert(qpSetDraws).values({ tenantId: p.tenantId, sessionId: id, subjectId, paperId: pick.id, candidates: locked.map((x) => ({ paperId: x.id, setLabel: x.setLabel ?? '' })), drawnBy: p.userId }).returning();
      const [t] = await tx.select({ tz: tenants.timezone }).from(tenants);
      const minutes = (await loadOfficeSettings(tx)).qpReleaseMinutes;
      const releaseAt = new Date(zonedToInstant(first.examDate, first.startsAt.slice(0, 5), t?.tz ?? 'Asia/Kolkata').getTime() - minutes * 60_000);
      await tx.insert(qbPaperReleases).values({ tenantId: p.tenantId, paperId: pick.id, releaseAt, controllerId: p.userId, createdBy: p.userId }).onConflictDoUpdate({ target: qbPaperReleases.paperId, set: { releaseAt, controllerId: p.userId, status: 'scheduled' } });
      await auditCell(tx, p, 'qp.set_drawn', 'qp_set_draw', row.id, { data: { subjectId, setLabel: pick.setLabel, from: locked.map((x) => x.setLabel), releaseAt: releaseAt.toISOString() } });
      return { setLabel: pick.setLabel, paperId: pick.id, from: locked.length, releaseAt };
    });
  }

  private async load(tx: Tx, id: string): Promise<Appointment> {
    const [a] = await tx.select().from(qpAppointments).where(eq(qpAppointments.id, id));
    if (!a) throw new NotFoundException('Appointment not found');
    return a;
  }
}

/** Cancels an appointment that is still open (appointed or accepted); the reason is kept as its note. */
export async function cancelAppointment(tx: Tx, p: UserPrincipal, id: string, reason: string) {
  const [a] = await tx.select().from(qpAppointments).where(eq(qpAppointments.id, id));
  if (!a) throw new NotFoundException('Appointment not found');
  if (!['appointed', 'accepted'].includes(a.status)) throw new ConflictException(`The appointment is already ${a.status}`);
  const [row] = await tx.update(qpAppointments).set({ status: 'cancelled', note: reason }).where(eq(qpAppointments.id, id)).returning();
  await auditCell(tx, p, 'qp.cancelled', 'qp_appointment', id, { before: { status: a.status }, after: { status: 'cancelled', reason } });
  await tx.execute(sql`update tasks set status = 'cancelled' where source_module = 'qp_setting' and source_id = ${id} and status in ('open', 'in_progress')`);
  return row;
}

function toItem(i: { section: number; marks: number; snapshot: unknown }): SetItem {
  const s = (i.snapshot ?? {}) as { bloom?: string; difficulty?: string; coCode?: string | null; unit?: string | null };
  return { section: i.section, marks: i.marks, bloom: s.bloom ?? 'remember', difficulty: s.difficulty ?? 'medium', coCode: s.coCode ?? null, unit: s.unit ?? null };
}
