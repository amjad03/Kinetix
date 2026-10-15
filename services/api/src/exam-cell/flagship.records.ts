import { ConflictException, Injectable, OnModuleInit } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { z } from 'zod';
import { Clock } from '../common/time.js';
import { marksUnlockRequests, qpAppointments } from '../db/schema-exam-flagship.js';
import { assessments, departments, examSessions, sections, subjects, users } from '../db/schema.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { RecordRegistry, type RecordEntity } from '../records/entity.js';
import { Int, OptionalText, uuidEq } from '../records/helpers.js';
import { CELL, CELL_READ, sessionOptions } from './common.js';
import { decideUnlock } from './marks-unlock.js';
import { cancelAppointment } from './qp-setting.js';

const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-11-05');
const WORDS = (list: string[]) => list.map((v) => ({ value: v, label: v[0].toUpperCase() + v.slice(1).replace(/_/g, ' ') }));
const APPOINTMENT_STATUSES = ['appointed', 'accepted', 'declined', 'submitted', 'completed', 'cancelled'];
const UNLOCK_STATUSES = ['pending', 'approved', 'rejected', 'cancelled'];
const day = (v: unknown) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v ?? '').slice(0, 10));

/** An appointment that is still open can change its due date, fee and note; a closed one stays as it was. */
const whileOpen = (column: 'dueOn' | 'remunerationPaise' | 'note') => async (ctx: { tx: import('../db/db.service.js').Tx }, id: string, value: unknown) => {
  const [a] = await ctx.tx.select({ status: qpAppointments.status }).from(qpAppointments).where(eq(qpAppointments.id, id));
  if (!a || !['appointed', 'accepted'].includes(a.status)) throw new ConflictException('A closed appointment cannot be changed');
  await ctx.tx.update(qpAppointments).set({ [column]: value ?? null }).where(eq(qpAppointments.id, id));
};

/** Question paper setters and moderators of every session, as a record kit list (added from the paper setting page). */
export function qpAppointmentsEntity(): RecordEntity {
  return {
    key: 'qp-appointments',
    module: 'exams',
    table: qpAppointments,
    subjectType: 'qp_appointment',
    roles: { read: CELL_READ, write: CELL },
    label: (r) => `${String(r.code ?? '')} ${String(r.role ?? '')}: ${String(r.staffName ?? '')}`.trim(),
    list: {
      select: { id: qpAppointments.id, sessionId: qpAppointments.sessionId, sessionName: examSessions.name, subjectId: qpAppointments.subjectId, code: subjects.code, subjectName: subjects.name, role: qpAppointments.role, userId: qpAppointments.userId, staffName: users.fullName, setsRequired: qpAppointments.setsRequired, dueOn: qpAppointments.dueOn, status: qpAppointments.status, remunerationPaise: qpAppointments.remunerationPaise, note: qpAppointments.note, createdAt: qpAppointments.createdAt },
      joins: (q) => q.innerJoin(examSessions, eq(examSessions.id, qpAppointments.sessionId)).innerJoin(subjects, eq(subjects.id, qpAppointments.subjectId)).innerJoin(users, eq(users.id, qpAppointments.userId)),
      search: [users.fullName, subjects.code, subjects.name],
      filters: {
        session: { label: 'Exam session', options: (ctx) => sessionOptions(ctx.tx), where: (v) => uuidEq(qpAppointments.sessionId, v) },
        role: { label: 'Role', options: WORDS(['setter', 'moderator']), where: (v) => (['setter', 'moderator'].includes(v) ? eq(qpAppointments.role, v as 'setter') : undefined) },
        status: { label: 'Status', options: WORDS(APPOINTMENT_STATUSES), where: (v) => (APPOINTMENT_STATUSES.includes(v) ? eq(qpAppointments.status, v) : undefined) },
      },
      sorts: { due: qpAppointments.dueOn, subject: subjects.code, staff: users.fullName, status: qpAppointments.status, created: qpAppointments.createdAt },
      defaultSort: { id: 'due', dir: 'asc' },
    },
    fields: {
      dueOn: { label: 'Due on', type: 'date', schema: DATE, create: false, apply: whileOpen('dueOn') },
      remunerationPaise: { label: 'Remuneration (paise)', type: 'number', schema: Int(0, 10_000_000), create: false, apply: whileOpen('remunerationPaise') },
      note: { label: 'Note', type: 'textarea', schema: OptionalText(500), create: false, apply: whileOpen('note') },
    },
    remove: { guard: async (ctx, id) => ((await ctx.tx.select({ s: qpAppointments.status }).from(qpAppointments).where(eq(qpAppointments.id, id)))[0]?.s === 'appointed' ? null : 'Only an appointment nobody has answered yet can be deleted; cancel it instead') },
    actions: {
      cancel: {
        label: 'Cancel appointment',
        tone: 'danger',
        inputs: [{ key: 'reason', label: 'Reason', type: 'textarea', required: true }],
        params: z.object({ reason: z.string().trim().min(3).max(300) }),
        apply: async (ctx, id, params) => {
          await cancelAppointment(ctx.tx, ctx.p, id, (params as { reason: string }).reason);
        },
      },
    },
    columns: [
      { key: 'sessionName', header: 'Exam session' },
      { key: 'code', header: 'Code' },
      { key: 'subjectName', header: 'Subject' },
      { key: 'role', header: 'Role' },
      { key: 'staffName', header: 'Appointed' },
      { key: 'setsRequired', header: 'Sets' },
      { key: 'dueOn', header: 'Due on', value: (r) => day(r.dueOn) },
      { key: 'status', header: 'Status' },
      { key: 'remunerationPaise', header: 'Remuneration (Rs)', value: (r) => Number(r.remunerationPaise ?? 0) / 100 },
      { key: 'note', header: 'Note' },
    ],
  };
}

const requester = alias(users, 'unlock_requester');
const decider = alias(users, 'unlock_decider');

/** Requests to unlock marks, as a record kit list: teachers see theirs, heads of department their subjects'. */
export function marksUnlockEntity(notes: NotificationsService, clock: Clock): RecordEntity {
  const decide = (approve: boolean) => async (ctx: Parameters<NonNullable<RecordEntity['actions']>[string]['apply']>[0], id: string, params: unknown) => {
    await decideUnlock(ctx.tx, ctx.p, notes, clock.now(), id, approve, (params as { note?: string } | undefined)?.note || undefined);
  };
  return {
    key: 'marks-unlock-requests',
    module: 'exams',
    table: marksUnlockRequests,
    subjectType: 'marks_unlock_request',
    roles: { read: ['teacher', 'hod', ...CELL], write: ['hod', ...CELL] },
    label: (r) => `${String(r.assessment ?? '')} (${String(r.section ?? '')})`,
    list: {
      select: { id: marksUnlockRequests.id, assessmentId: marksUnlockRequests.assessmentId, assessment: assessments.title, markStatus: assessments.markStatus, section: sections.displayName, code: subjects.code, subjectName: subjects.name, reason: marksUnlockRequests.reason, status: marksUnlockRequests.status, requestedBy: requester.fullName, decidedBy: decider.fullName, decisionNote: marksUnlockRequests.decisionNote, createdAt: marksUnlockRequests.createdAt, decidedAt: marksUnlockRequests.decidedAt },
      joins: (q) =>
        q
          .innerJoin(assessments, eq(assessments.id, marksUnlockRequests.assessmentId))
          .innerJoin(sections, eq(sections.id, assessments.sectionId))
          .innerJoin(subjects, eq(subjects.id, assessments.subjectId))
          .leftJoin(departments, eq(departments.id, subjects.departmentId))
          .innerJoin(requester, eq(requester.id, marksUnlockRequests.requestedBy))
          .leftJoin(decider, eq(decider.id, marksUnlockRequests.decidedBy)),
      search: [assessments.title, subjects.code, subjects.name, requester.fullName],
      filters: {
        status: { label: 'Status', options: WORDS(UNLOCK_STATUSES), where: (v) => (UNLOCK_STATUSES.includes(v) ? eq(marksUnlockRequests.status, v) : undefined) },
      },
      sorts: { created: marksUnlockRequests.createdAt, subject: subjects.code, status: marksUnlockRequests.status },
      defaultSort: { id: 'created', dir: 'desc' },
      scope: (ctx) => {
        if (ctx.p.roles.some((r) => CELL.includes(r))) return undefined;
        if (ctx.p.roles.includes('hod')) return sql`(${departments.headUserId} = ${ctx.p.userId}::uuid or ${marksUnlockRequests.requestedBy} = ${ctx.p.userId}::uuid)`;
        return sql`${marksUnlockRequests.requestedBy} = ${ctx.p.userId}::uuid`;
      },
    },
    remove: { guard: async (ctx, id) => (['cancelled'].includes((await ctx.tx.select({ s: marksUnlockRequests.status }).from(marksUnlockRequests).where(eq(marksUnlockRequests.id, id)))[0]?.s ?? '') ? null : 'A request stays on record once it is decided or waiting') },
    actions: {
      approve: { label: 'Approve and unlock', roles: ['hod', ...CELL], inputs: [{ key: 'note', label: 'Note', type: 'textarea' }], params: z.object({ note: z.string().trim().max(500).optional() }).optional(), apply: decide(true) },
      reject: { label: 'Turn down', tone: 'danger', roles: ['hod', ...CELL], inputs: [{ key: 'note', label: 'Reason', type: 'textarea', required: true }], params: z.object({ note: z.string().trim().min(3).max(500) }), apply: decide(false) },
    },
    columns: [
      { key: 'createdAt', header: 'Asked on', value: (r) => day(r.createdAt) },
      { key: 'code', header: 'Code' },
      { key: 'assessment', header: 'Assessment' },
      { key: 'section', header: 'Class' },
      { key: 'requestedBy', header: 'Asked by' },
      { key: 'reason', header: 'Reason' },
      { key: 'status', header: 'Status' },
      { key: 'decidedBy', header: 'Decided by' },
      { key: 'decisionNote', header: 'Decision note' },
    ],
  };
}

@Injectable()
export class FlagshipRecords implements OnModuleInit {
  constructor(
    private readonly registry: RecordRegistry,
    private readonly notes: NotificationsService,
    private readonly clock: Clock,
  ) {}
  onModuleInit(): void {
    this.registry.register(qpAppointmentsEntity());
    this.registry.register(marksUnlockEntity(this.notes, this.clock));
  }
}
