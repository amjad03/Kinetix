import { BadRequestException, ConflictException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { and, asc, desc, eq, inArray, ne, sql } from 'drizzle-orm';
import { z } from 'zod';
import { STAFF_ADMIN_ROLES, TEACHING_ROLES } from '../auth/auth.decorators.js';
import type { Tx } from '../db/db.service.js';
import { academicDocRequests, academicYears, creditTransfers, examPapers, examResultLines, examResults, examSessions, invigilationDuties, malpracticeCases, pastExamQuestions, programs, revaluationRequests, rooms, students, subjects, users } from '../db/schema.js';
import { DOC_KINDS, DOC_TITLE, type DocKind } from '../academic-docs/academic-docs.logic.js';
import { AcademicDocsService } from '../academic-docs/academic-docs.service.js';
import { REVAL_KINDS, revalFee } from '../exam-office/exam-office.logic.js';
import { loadOfficeSettings } from '../exam-office/settings.js';
import { overlaps } from '../exams/seating.js';
import { fail, int, lc, outcome, required } from '../import/row-helpers.js';
import { RecordRegistry, type FieldOption, type KitCtx, type RecordEntity } from '../records/entity.js';
import { copyName, Int, OptionalRef, OptionalText, Ref, Text, uuidEq } from '../records/helpers.js';
import { eachRow } from '../records/import.js';
import { assertInSession, auditCell, CELL, CELL_READ, hasResults, loadSession, sessionOptions } from './common.js';
import { invigilatorOptions } from './halls.js';
import { supersedeDocuments } from './result-runs.js';
import { studentOptions } from './withholds.js';

const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-11-05');
const TIME = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use a time like 10:00');
const KINDS = ['regular', 'supplementary', 'improvement', 'special', 'practical', 'viva'] as const;
const KIND_WORDS: Record<(typeof KINDS)[number], string> = { regular: 'Regular', supplementary: 'Supplementary', improvement: 'Improvement', special: 'Special (make-up)', practical: 'Practical', viva: 'Viva voce' };
const STATUS_WORDS = (list: string[]) => list.map((v) => ({ value: v, label: v[0].toUpperCase() + v.slice(1).replace(/_/g, ' ') }));
const hm = (t: string) => t.slice(0, 5);

async function programmeOptions(ctx: KitCtx): Promise<FieldOption[]> {
  return (await ctx.tx.select({ id: programs.id, name: programs.name }).from(programs).orderBy(asc(programs.sortOrder), asc(programs.name))).map((r) => ({ value: r.id, label: r.name }));
}
async function yearOptions(ctx: KitCtx): Promise<FieldOption[]> {
  return (await ctx.tx.select({ id: academicYears.id, label: academicYears.label }).from(academicYears).orderBy(desc(academicYears.startsOn))).map((r) => ({ value: r.id, label: r.label }));
}
async function subjectOptions(ctx: KitCtx): Promise<FieldOption[]> {
  const rows = await ctx.tx.select({ id: subjects.id, code: subjects.code, name: subjects.name, program: programs.name }).from(subjects).innerJoin(programs, eq(programs.id, subjects.programId)).orderBy(asc(programs.name), asc(subjects.code));
  return rows.map((r) => ({ value: r.id, label: `${r.code} ${r.name}`, group: r.program }));
}
async function paperOptions(ctx: KitCtx): Promise<FieldOption[]> {
  const rows = await ctx.tx.select({ id: examPapers.id, code: subjects.code, name: subjects.name, date: examPapers.examDate, session: examSessions.name }).from(examPapers).innerJoin(subjects, eq(subjects.id, examPapers.subjectId)).innerJoin(examSessions, eq(examSessions.id, examPapers.sessionId)).orderBy(desc(examSessions.startsOn), asc(examPapers.examDate));
  return rows.map((r) => ({ value: r.id, label: `${r.code} ${r.name} (${r.date})`, group: r.session }));
}
async function roomOptions(ctx: KitCtx): Promise<FieldOption[]> {
  return (await ctx.tx.select({ id: rooms.id, name: rooms.name }).from(rooms).orderBy(asc(rooms.name))).map((r) => ({ value: r.id, label: r.name }));
}

// ---- exam sessions -----------------------------------------------------------------------------

const paperCount = sql<number>`(select count(*)::int from exam_papers p where p.session_id = ${examSessions.id})`;
const candidateCount = sql<number>`(select count(*)::int from exam_results r where r.session_id = ${examSessions.id})`;

/** A session's dates change only within the papers already set, and never after results. */
const sessionDate = (key: 'startsOn' | 'endsOn') => async (ctx: KitCtx, id: string, value: unknown) => {
  const s = await loadSession(ctx.tx, id);
  if (hasResults(s)) throw new ConflictException('Results are processed; the dates can no longer change');
  const next = { startsOn: s.startsOn, endsOn: s.endsOn, [key]: String(value) };
  if (next.endsOn < next.startsOn) throw new BadRequestException('The session cannot end before it starts');
  const [outside] = await ctx.tx.select({ id: examPapers.id }).from(examPapers).where(and(eq(examPapers.sessionId, id), sql`(${examPapers.examDate} < ${next.startsOn} or ${examPapers.examDate} > ${next.endsOn})`)).limit(1);
  if (outside) throw new ConflictException('A paper of the session falls outside those dates; move it first');
  await ctx.tx.update(examSessions).set({ [key]: String(value) }).where(eq(examSessions.id, id));
};

export function sessionsEntity(): RecordEntity {
  return {
    key: 'exam-sessions',
    module: 'exams',
    table: examSessions,
    subjectType: 'exam_session',
    roles: { read: [...CELL, 'hod'], write: CELL },
    label: (r) => String(r.name),
    list: {
      select: { id: examSessions.id, name: examSessions.name, kind: examSessions.kind, status: examSessions.status, programId: examSessions.programId, programName: programs.name, academicYearId: examSessions.academicYearId, yearLabel: academicYears.label, term: examSessions.term, startsOn: examSessions.startsOn, endsOn: examSessions.endsOn, papers: paperCount, candidates: candidateCount, frozenAt: examSessions.frozenAt, publishedAt: examSessions.publishedAt },
      joins: (q) => q.innerJoin(programs, eq(programs.id, examSessions.programId)).innerJoin(academicYears, eq(academicYears.id, examSessions.academicYearId)),
      search: [examSessions.name, programs.name],
      filters: {
        programme: { label: 'Programme', options: programmeOptions, where: (v) => uuidEq(examSessions.programId, v) },
        status: { label: 'Status', options: STATUS_WORDS(['draft', 'scheduled', 'processed', 'published', 'locked']), where: (v) => (['draft', 'scheduled', 'processed', 'published', 'locked'].includes(v) ? sql`${examSessions.status} = ${v}` : undefined) },
        kind: { label: 'Kind', options: KINDS.map((k) => ({ value: k, label: KIND_WORDS[k] })), where: (v) => ((KINDS as readonly string[]).includes(v) ? sql`${examSessions.kind} = ${v}` : undefined) },
        year: { label: 'Academic year', options: yearOptions, where: (v) => uuidEq(examSessions.academicYearId, v) },
      },
      sorts: { name: examSessions.name, starts: examSessions.startsOn, programme: programs.name, status: examSessions.status, term: examSessions.term, papers: paperCount },
      defaultSort: { id: 'starts', dir: 'desc' },
    },
    fields: {
      name: { label: 'Name', type: 'text', schema: Text(160), column: examSessions.name, required: true },
      kind: { label: 'Kind', type: 'select', schema: z.enum(KINDS), column: examSessions.kind, required: true, edit: false, options: KINDS.map((k) => ({ value: k, label: KIND_WORDS[k] })) },
      programId: { label: 'Programme', type: 'select', schema: Ref, column: examSessions.programId, required: true, edit: false, options: programmeOptions },
      academicYearId: { label: 'Academic year', type: 'select', schema: Ref, column: examSessions.academicYearId, required: true, edit: false, options: yearOptions },
      term: { label: 'Term', type: 'number', schema: Int(1, 20), column: examSessions.term, required: true, edit: false },
      startsOn: { label: 'From', type: 'date', schema: DATE, apply: sessionDate('startsOn'), required: true },
      endsOn: { label: 'To', type: 'date', schema: DATE, apply: sessionDate('endsOn'), required: true },
    },
    create: async (ctx, v) => {
      if (String(v.endsOn) < String(v.startsOn)) throw new BadRequestException('The session cannot end before it starts');
      const [row] = await ctx.tx.insert(examSessions).values({ tenantId: ctx.p.tenantId, name: String(v.name), kind: v.kind as (typeof KINDS)[number], programId: String(v.programId), academicYearId: String(v.academicYearId), term: Number(v.term), startsOn: String(v.startsOn), endsOn: String(v.endsOn), createdBy: ctx.p.userId }).returning({ id: examSessions.id });
      return row.id;
    },
    duplicate: async (ctx, row) => ({ name: await copyName(ctx.tx, examSessions, examSessions.name, String(row.name)), status: 'draft', processed_at: null, published_at: null, locked_at: null, frozen_at: null, frozen_by: null, approval_requested_by: null, approval_requested_at: null, approved_by: null, approved_at: null, approval_note: null, created_by: ctx.p.userId }),
    remove: { guard: async (ctx, id) => ((await loadSession(ctx.tx, id)).status === 'draft' ? null : 'Only a draft session can be deleted; a scheduled one has hall tickets, seats and marks') },
    columns: [
      { key: 'name', header: 'Session' },
      { key: 'kind', header: 'Kind' },
      { key: 'programName', header: 'Programme' },
      { key: 'yearLabel', header: 'Academic year' },
      { key: 'term', header: 'Term' },
      { key: 'startsOn', header: 'From' },
      { key: 'endsOn', header: 'To' },
      { key: 'papers', header: 'Papers' },
      { key: 'candidates', header: 'Results' },
      { key: 'status', header: 'Status' },
    ],
  };
}

// ---- malpractice -------------------------------------------------------------------------------

export function malpracticeEntity(): RecordEntity {
  const reported = async (tx: Tx, id: string) => (await tx.select({ s: malpracticeCases.status }).from(malpracticeCases).where(eq(malpracticeCases.id, id)))[0]?.s === 'reported';
  return {
    key: 'malpractice-cases',
    module: 'exams',
    table: malpracticeCases,
    subjectType: 'malpractice_case',
    roles: { read: CELL_READ, write: [...CELL, 'hod'] },
    label: (r) => `${String(r.rollNo ?? '')} ${String(r.studentName ?? '')} (${String(r.sessionName ?? '')})`.trim(),
    list: {
      select: { id: malpracticeCases.id, sessionId: malpracticeCases.sessionId, sessionName: examSessions.name, studentId: malpracticeCases.studentId, studentName: students.fullName, rollNo: students.rollNo, paperId: malpracticeCases.paperId, code: subjects.code, subjectName: subjects.name, roomId: malpracticeCases.roomId, roomName: rooms.name, description: malpracticeCases.description, status: malpracticeCases.status, penalty: malpracticeCases.penalty, decisionNote: malpracticeCases.decisionNote, reportedBy: users.fullName, createdAt: malpracticeCases.createdAt, decidedAt: malpracticeCases.decidedAt },
      joins: (q) => q.innerJoin(examSessions, eq(examSessions.id, malpracticeCases.sessionId)).innerJoin(students, eq(students.id, malpracticeCases.studentId)).leftJoin(examPapers, eq(examPapers.id, malpracticeCases.paperId)).leftJoin(subjects, eq(subjects.id, examPapers.subjectId)).leftJoin(rooms, eq(rooms.id, malpracticeCases.roomId)).leftJoin(users, eq(users.id, malpracticeCases.reportedBy)),
      search: [students.fullName, students.rollNo, malpracticeCases.description],
      filters: {
        session: { label: 'Exam session', options: (ctx) => sessionOptions(ctx.tx), where: (v) => uuidEq(malpracticeCases.sessionId, v) },
        status: { label: 'Status', options: STATUS_WORDS(['reported', 'penalised', 'dismissed']), where: (v) => (['reported', 'penalised', 'dismissed'].includes(v) ? eq(malpracticeCases.status, v) : undefined) },
      },
      sorts: { reported: malpracticeCases.createdAt, student: students.fullName, status: malpracticeCases.status },
      defaultSort: { id: 'reported', dir: 'desc' },
    },
    fields: {
      sessionId: { label: 'Exam session', type: 'select', schema: Ref, column: malpracticeCases.sessionId, required: true, edit: false, options: (ctx) => sessionOptions(ctx.tx) },
      studentId: { label: 'Student', type: 'select', schema: Ref, column: malpracticeCases.studentId, required: true, edit: false, options: studentOptions },
      paperId: { label: 'Paper', type: 'select', schema: OptionalRef, column: malpracticeCases.paperId, edit: false, options: paperOptions },
      roomId: { label: 'Hall', type: 'select', schema: OptionalRef, column: malpracticeCases.roomId, edit: false, options: roomOptions },
      description: {
        label: 'What happened',
        type: 'textarea',
        schema: Text(2000),
        required: true,
        apply: async (ctx, id, v) => {
          if (!(await reported(ctx.tx, id))) throw new ConflictException('A decided case cannot be changed');
          await ctx.tx.update(malpracticeCases).set({ description: String(v) }).where(eq(malpracticeCases.id, id));
        },
      },
    },
    create: async (ctx, v) => {
      await loadSession(ctx.tx, String(v.sessionId));
      await assertInSession(ctx.tx, String(v.sessionId), String(v.studentId));
      if (v.paperId) {
        const [paper] = await ctx.tx.select({ id: examPapers.id }).from(examPapers).where(and(eq(examPapers.id, String(v.paperId)), eq(examPapers.sessionId, String(v.sessionId))));
        if (!paper) throw new BadRequestException('That paper is not in this session');
      }
      const [row] = await ctx.tx.insert(malpracticeCases).values({ tenantId: ctx.p.tenantId, sessionId: String(v.sessionId), studentId: String(v.studentId), paperId: (v.paperId as string | null) ?? null, roomId: (v.roomId as string | null) ?? null, description: String(v.description), reportedBy: ctx.p.userId }).returning({ id: malpracticeCases.id });
      return row.id;
    },
    remove: { guard: async (ctx, id) => ((await reported(ctx.tx, id)) ? null : 'A decided case stays on record') },
    columns: [
      { key: 'createdAt', header: 'Reported', value: (r) => (r.createdAt instanceof Date ? r.createdAt.toISOString().slice(0, 10) : String(r.createdAt ?? '').slice(0, 10)) },
      { key: 'sessionName', header: 'Exam session' },
      { key: 'rollNo', header: 'Roll no' },
      { key: 'studentName', header: 'Student' },
      { key: 'code', header: 'Paper' },
      { key: 'roomName', header: 'Hall' },
      { key: 'description', header: 'What happened' },
      { key: 'status', header: 'Status' },
      { key: 'penalty', header: 'Penalty' },
      { key: 'reportedBy', header: 'Reported by' },
    ],
  };
}

// ---- revaluation requests ----------------------------------------------------------------------

export function revaluationsEntity(): RecordEntity {
  return {
    key: 'revaluations',
    module: 'exams',
    table: revaluationRequests,
    subjectType: 'revaluation',
    roles: { read: CELL_READ, write: CELL },
    label: (r) => `${String(r.rollNo ?? '')} ${String(r.studentName ?? '')}: ${String(r.code ?? '')} ${String(r.kind ?? '')}`.trim(),
    list: {
      select: { id: revaluationRequests.id, sessionId: revaluationRequests.sessionId, sessionName: examSessions.name, studentId: revaluationRequests.studentId, studentName: students.fullName, rollNo: students.rollNo, subjectId: revaluationRequests.subjectId, code: subjects.code, subjectName: subjects.name, kind: revaluationRequests.kind, status: revaluationRequests.status, reason: revaluationRequests.reason, feePaise: revaluationRequests.feePaise, previousPercent: revaluationRequests.previousPercent, newPercent: revaluationRequests.newPercent, decisionNote: revaluationRequests.decisionNote, createdAt: revaluationRequests.createdAt },
      joins: (q) => q.innerJoin(examSessions, eq(examSessions.id, revaluationRequests.sessionId)).innerJoin(students, eq(students.id, revaluationRequests.studentId)).innerJoin(subjects, eq(subjects.id, revaluationRequests.subjectId)),
      search: [students.fullName, students.rollNo, subjects.name, subjects.code],
      filters: {
        session: { label: 'Exam session', options: (ctx) => sessionOptions(ctx.tx), where: (v) => uuidEq(revaluationRequests.sessionId, v) },
        status: { label: 'Status', options: STATUS_WORDS(['requested', 'accepted', 'rejected', 'completed']), where: (v) => (['requested', 'accepted', 'rejected', 'completed'].includes(v) ? sql`${revaluationRequests.status} = ${v}` : undefined) },
        kind: { label: 'Kind', options: REVAL_KINDS.map((k) => ({ value: k, label: k[0].toUpperCase() + k.slice(1) })), where: (v) => ((REVAL_KINDS as readonly string[]).includes(v) ? eq(revaluationRequests.kind, v) : undefined) },
      },
      sorts: { created: revaluationRequests.createdAt, student: students.fullName, subject: subjects.code, status: revaluationRequests.status },
      defaultSort: { id: 'created', dir: 'desc' },
    },
    fields: {
      sessionId: { label: 'Exam session', type: 'select', schema: Ref, column: revaluationRequests.sessionId, required: true, edit: false, options: (ctx) => sessionOptions(ctx.tx) },
      studentId: { label: 'Student', type: 'select', schema: Ref, column: revaluationRequests.studentId, required: true, edit: false, options: studentOptions },
      subjectId: { label: 'Subject', type: 'select', schema: Ref, column: revaluationRequests.subjectId, required: true, edit: false, options: subjectOptions },
      kind: { label: 'Kind', type: 'select', schema: z.enum(REVAL_KINDS), column: revaluationRequests.kind, required: true, edit: false, options: REVAL_KINDS.map((k) => ({ value: k, label: k[0].toUpperCase() + k.slice(1) })) },
      reason: { label: 'Reason', type: 'textarea', schema: Text(500), column: revaluationRequests.reason, required: true, edit: false },
    },
    create: async (ctx, v) => {
      const s = await loadSession(ctx.tx, String(v.sessionId));
      if (s.status !== 'published') throw new ConflictException(s.status === 'locked' ? 'The revaluation window is closed' : 'Results are not published');
      const cfg = await loadOfficeSettings(ctx.tx);
      const [line] = await ctx.tx.select({ percent: examResultLines.percent }).from(examResultLines).innerJoin(examResults, eq(examResults.id, examResultLines.resultId)).where(and(eq(examResults.sessionId, s.id), eq(examResults.studentId, String(v.studentId)), eq(examResultLines.subjectId, String(v.subjectId))));
      if (!line) throw new BadRequestException('The student has no result in that subject');
      const [open] = await ctx.tx.select({ id: revaluationRequests.id }).from(revaluationRequests).where(and(eq(revaluationRequests.sessionId, s.id), eq(revaluationRequests.studentId, String(v.studentId)), eq(revaluationRequests.subjectId, String(v.subjectId)), inArray(revaluationRequests.status, ['requested', 'accepted'])));
      if (open) throw new ConflictException('A request for this subject is already open');
      const kind = v.kind as (typeof REVAL_KINDS)[number];
      const [row] = await ctx.tx.insert(revaluationRequests).values({ tenantId: ctx.p.tenantId, sessionId: s.id, studentId: String(v.studentId), subjectId: String(v.subjectId), kind, reason: String(v.reason), feePaise: revalFee(cfg.revaluation, kind), previousPercent: line.percent, requestedBy: ctx.p.userId }).returning({ id: revaluationRequests.id });
      return row.id;
    },
    remove: { guard: async (ctx, id) => (['requested', 'rejected'].includes((await ctx.tx.select({ s: revaluationRequests.status }).from(revaluationRequests).where(eq(revaluationRequests.id, id)))[0]?.s ?? '') ? null : 'An accepted or completed request stays on record') },
    columns: [
      { key: 'createdAt', header: 'Asked on', value: (r) => (r.createdAt instanceof Date ? r.createdAt.toISOString().slice(0, 10) : String(r.createdAt ?? '').slice(0, 10)) },
      { key: 'sessionName', header: 'Exam session' },
      { key: 'rollNo', header: 'Roll no' },
      { key: 'studentName', header: 'Student' },
      { key: 'code', header: 'Paper' },
      { key: 'kind', header: 'Kind' },
      { key: 'feePaise', header: 'Fee (Rs)', value: (r) => Number(r.feePaise ?? 0) / 100 },
      { key: 'previousPercent', header: 'Was %' },
      { key: 'newPercent', header: 'Now %' },
      { key: 'status', header: 'Status' },
      { key: 'decisionNote', header: 'Note' },
    ],
  };
}

// ---- invigilation duties -----------------------------------------------------------------------

async function assertFree(tx: Tx, staffId: string, slot: { date: string; startsAt: string; endsAt: string }, exceptId?: string) {
  const same = await tx.select().from(invigilationDuties).where(and(eq(invigilationDuties.staffId, staffId), eq(invigilationDuties.dutyDate, slot.date), exceptId ? ne(invigilationDuties.id, exceptId) : sql`true`));
  if (same.some((d) => overlaps({ examDate: d.dutyDate, startsAt: hm(d.startsAt), endsAt: hm(d.endsAt) }, { examDate: slot.date, startsAt: hm(slot.startsAt), endsAt: hm(slot.endsAt) }))) throw new ConflictException('That staff member already has a duty at that time');
}

export function dutiesEntity(): RecordEntity {
  return {
    key: 'invigilation-duties',
    module: 'exams',
    table: invigilationDuties,
    subjectType: 'invigilation_duty',
    historyTypes: [],
    roles: { read: CELL_READ, write: [...CELL, 'hod'] },
    label: (r) => `${String(r.staffName ?? '')}: ${String(r.roomName ?? '')} ${String(r.dutyDate ?? '')}`.trim(),
    list: {
      select: { id: invigilationDuties.id, sessionId: invigilationDuties.sessionId, sessionName: examSessions.name, staffId: invigilationDuties.staffId, staffName: users.fullName, roomId: invigilationDuties.roomId, roomName: rooms.name, dutyDate: invigilationDuties.dutyDate, startsAt: invigilationDuties.startsAt, endsAt: invigilationDuties.endsAt, role: invigilationDuties.role, status: invigilationDuties.status },
      joins: (q) => q.innerJoin(examSessions, eq(examSessions.id, invigilationDuties.sessionId)).innerJoin(users, eq(users.id, invigilationDuties.staffId)).innerJoin(rooms, eq(rooms.id, invigilationDuties.roomId)),
      search: [users.fullName, rooms.name],
      filters: {
        session: { label: 'Exam session', options: (ctx) => sessionOptions(ctx.tx), where: (v) => uuidEq(invigilationDuties.sessionId, v) },
        staff: { label: 'Staff', options: invigilatorOptions, where: (v) => uuidEq(invigilationDuties.staffId, v) },
        role: { label: 'Role', options: [{ value: 'invigilator', label: 'Invigilator' }, { value: 'chief', label: 'Chief superintendent' }], where: (v) => (v === 'invigilator' || v === 'chief' ? eq(invigilationDuties.role, v) : undefined) },
      },
      sorts: { date: invigilationDuties.dutyDate, staff: users.fullName, room: rooms.name },
      defaultSort: { id: 'date', dir: 'asc' },
      tiebreak: [invigilationDuties.startsAt, rooms.name],
    },
    fields: {
      sessionId: { label: 'Exam session', type: 'select', schema: Ref, column: invigilationDuties.sessionId, required: true, edit: false, options: (ctx) => sessionOptions(ctx.tx) },
      staffId: { label: 'Staff', type: 'select', schema: Ref, column: invigilationDuties.staffId, required: true, edit: false, options: invigilatorOptions },
      roomId: { label: 'Hall', type: 'select', schema: Ref, column: invigilationDuties.roomId, required: true, options: roomOptions, bulk: true },
      dutyDate: { label: 'Date', type: 'date', schema: DATE, column: invigilationDuties.dutyDate, required: true, edit: false },
      startsAt: { label: 'From', type: 'text', schema: TIME, column: invigilationDuties.startsAt, required: true, edit: false },
      endsAt: { label: 'To', type: 'text', schema: TIME, column: invigilationDuties.endsAt, required: true, edit: false },
      role: { label: 'Role', type: 'select', schema: z.enum(['invigilator', 'chief']), column: invigilationDuties.role, required: true, options: [{ value: 'invigilator', label: 'Invigilator' }, { value: 'chief', label: 'Chief superintendent' }], bulk: true },
    },
    create: async (ctx, v) => {
      const s = await loadSession(ctx.tx, String(v.sessionId));
      const slot = { date: String(v.dutyDate), startsAt: String(v.startsAt), endsAt: String(v.endsAt) };
      if (slot.endsAt <= slot.startsAt) throw new BadRequestException('A duty must end after it starts');
      if (slot.date < s.startsOn || slot.date > s.endsOn) throw new BadRequestException('The duty is outside the session dates');
      await assertFree(ctx.tx, String(v.staffId), slot);
      const [row] = await ctx.tx.insert(invigilationDuties).values({ tenantId: ctx.p.tenantId, sessionId: s.id, staffId: String(v.staffId), roomId: String(v.roomId), dutyDate: slot.date, startsAt: slot.startsAt, endsAt: slot.endsAt, role: String(v.role), createdBy: ctx.p.userId }).returning({ id: invigilationDuties.id });
      return row.id;
    },
    move: {
      label: 'Give to another member of staff',
      options: invigilatorOptions,
      reason: true,
      apply: async (ctx, id, to, reason) => {
        const [d] = await ctx.tx.select().from(invigilationDuties).where(eq(invigilationDuties.id, id));
        if (!d) throw new NotFoundException('Duty not found');
        if (d.staffId === to) return;
        await assertFree(ctx.tx, to, { date: d.dutyDate, startsAt: d.startsAt, endsAt: d.endsAt }, id);
        await ctx.tx.update(invigilationDuties).set({ staffId: to, status: 'substituted', substitutedFrom: d.staffId }).where(eq(invigilationDuties.id, id));
        await auditCell(ctx.tx, ctx.p, 'invigilation_duty.moved', 'invigilation_duty', id, { before: { staffId: d.staffId }, after: { staffId: to }, data: { reason } });
      },
    },
    columns: [
      { key: 'dutyDate', header: 'Date' },
      { key: 'startsAt', header: 'From', value: (r) => hm(String(r.startsAt ?? '')) },
      { key: 'endsAt', header: 'To', value: (r) => hm(String(r.endsAt ?? '')) },
      { key: 'roomName', header: 'Hall' },
      { key: 'staffName', header: 'Staff' },
      { key: 'role', header: 'Role' },
      { key: 'status', header: 'Status' },
      { key: 'sessionName', header: 'Exam session' },
    ],
  };
}

// ---- past-exam questions -----------------------------------------------------------------------

export function pastQuestionsEntity(): RecordEntity {
  const subjectByCode = async (tx: Tx, code: string) => {
    const [s] = await tx.select({ id: subjects.id }).from(subjects).where(sql`lower(${subjects.code}) = ${lc(code)}`).limit(1);
    return s?.id ?? fail('No subject with this code', code);
  };
  return {
    key: 'past-exam-questions',
    module: 'exams',
    table: pastExamQuestions,
    subjectType: 'past_exam_question',
    roles: { read: [...STAFF_ADMIN_ROLES, ...TEACHING_ROLES, 'exam_controller'], write: [...STAFF_ADMIN_ROLES, 'hod', 'exam_controller'] },
    label: (r) => `${String(r.exam)} ${String(r.year)}${r.questionNo ? ` Q${String(r.questionNo)}` : ''}`,
    list: {
      select: { id: pastExamQuestions.id, subjectId: pastExamQuestions.subjectId, subjectCode: subjects.code, subjectName: subjects.name, question: pastExamQuestions.question, exam: pastExamQuestions.exam, year: pastExamQuestions.year, marks: pastExamQuestions.marks, unit: pastExamQuestions.unit, questionNo: pastExamQuestions.questionNo, paperCode: pastExamQuestions.paperCode, createdAt: pastExamQuestions.createdAt },
      joins: (q) => q.leftJoin(subjects, eq(subjects.id, pastExamQuestions.subjectId)),
      search: [pastExamQuestions.question, pastExamQuestions.exam, pastExamQuestions.unit, pastExamQuestions.paperCode, subjects.code],
      filters: {
        subject: { label: 'Subject', options: subjectOptions, where: (v) => (v === 'none' ? sql`${pastExamQuestions.subjectId} is null` : uuidEq(pastExamQuestions.subjectId, v)) },
        year: { label: 'Year', options: async (ctx) => (await ctx.tx.selectDistinct({ y: pastExamQuestions.year }).from(pastExamQuestions).orderBy(desc(pastExamQuestions.year))).map((r) => ({ value: String(r.y), label: String(r.y) })), where: (v) => (/^\d{4}$/.test(v) ? eq(pastExamQuestions.year, Number(v)) : undefined) },
        exam: { label: 'Examination', options: async (ctx) => (await ctx.tx.selectDistinct({ e: pastExamQuestions.exam }).from(pastExamQuestions).orderBy(asc(pastExamQuestions.exam))).map((r) => ({ value: r.e, label: r.e })), where: (v) => eq(pastExamQuestions.exam, v) },
      },
      sorts: { year: pastExamQuestions.year, exam: pastExamQuestions.exam, subject: subjects.code, marks: pastExamQuestions.marks, added: pastExamQuestions.createdAt },
      defaultSort: { id: 'year', dir: 'desc' },
      tiebreak: [pastExamQuestions.exam, pastExamQuestions.questionNo],
    },
    fields: {
      question: { label: 'Question', type: 'textarea', schema: z.string().trim().min(5, 'Write the question').max(2000), column: pastExamQuestions.question, required: true },
      subjectId: { label: 'Subject', type: 'select', schema: OptionalRef, column: pastExamQuestions.subjectId, options: subjectOptions, bulk: true },
      exam: { label: 'Examination', type: 'text', schema: Text(120), column: pastExamQuestions.exam, required: true, bulk: true, help: 'E.g. Bangalore University BCom Sem 3, CBSE Class 12 Board, Internal test 2' },
      year: { label: 'Year', type: 'number', schema: Int(1950, 2100), column: pastExamQuestions.year, required: true, bulk: true },
      marks: { label: 'Marks', type: 'number', schema: z.coerce.number().int().min(0).max(100).nullable(), column: pastExamQuestions.marks },
      unit: { label: 'Unit', type: 'text', schema: OptionalText(120), column: pastExamQuestions.unit, bulk: true },
      questionNo: { label: 'Question no', type: 'text', schema: OptionalText(20), column: pastExamQuestions.questionNo },
      paperCode: { label: 'Paper code', type: 'text', schema: OptionalText(40), column: pastExamQuestions.paperCode, bulk: true },
    },
    duplicate: () => ({ question_no: null }),
    columns: [
      { key: 'year', header: 'Year' },
      { key: 'exam', header: 'Examination' },
      { key: 'paperCode', header: 'Paper code' },
      { key: 'subjectCode', header: 'Subject code' },
      { key: 'unit', header: 'Unit' },
      { key: 'questionNo', header: 'Question no' },
      { key: 'question', header: 'Question' },
      { key: 'marks', header: 'Marks' },
    ],
    import: {
      columns: [
        { key: 'question', header: 'Question', required: true, help: 'The question as printed', example: 'Explain the provisions of the Companies Act for the issue of shares.' },
        { key: 'exam', header: 'Examination', required: true, help: 'The examination or paper it came from', example: 'Bangalore University BCom Sem 3' },
        { key: 'year', header: 'Year', required: true, help: 'The year of the examination', example: '2024' },
        { key: 'marks', header: 'Marks', help: 'Marks of the question', example: '10' },
        { key: 'subject_code', header: 'Subject code', help: "The subject's code in KINETIX; leave empty for any subject", example: 'BCOM-3.1', options: async (ctx) => (await ctx.tx.select({ code: subjects.code }).from(subjects).orderBy(asc(subjects.code))).map((r) => r.code) },
        { key: 'unit', header: 'Unit', help: 'Unit or module of the syllabus', example: 'Unit 2' },
        { key: 'question_no', header: 'Question no', help: 'Its number on the paper', example: '4(a)' },
        { key: 'paper_code', header: 'Paper code', help: 'The code printed on the paper', example: '3BC1' },
      ],
      key: ['exam', 'year', 'question'],
      exists: async (ctx, r) => !!(await ctx.tx.select({ id: pastExamQuestions.id }).from(pastExamQuestions).where(and(sql`lower(${pastExamQuestions.exam}) = ${lc(r.get('exam'))}`, eq(pastExamQuestions.year, Number(r.get('year')) || 0), sql`lower(${pastExamQuestions.question}) = ${lc(r.get('question'))}`)).limit(1))[0],
      run: async (ctx, rows) =>
        eachRow(ctx.tx, rows, async (tx, r) => {
          const question = required(r, 'question');
          if (question.length < 5) fail('The question is too short', question);
          if (question.length > 2000) fail('The question is longer than 2000 characters', question.slice(0, 40));
          const exam = required(r, 'exam');
          const year = int(required(r, 'year'), 1950, 2100, 'Give a year like 2024');
          const marksText = r.get('marks');
          const marks = marksText ? int(marksText, 0, 100, 'Marks must be a whole number from 0 to 100') : null;
          const code = r.get('subject_code');
          const subjectId = code ? await subjectByCode(tx, code) : null;
          const extra = { unit: r.get('unit') || null, questionNo: r.get('question_no') || null, paperCode: r.get('paper_code') || null };
          const [found] = await tx.select().from(pastExamQuestions).where(and(sql`lower(${pastExamQuestions.exam}) = ${lc(exam)}`, eq(pastExamQuestions.year, year), sql`lower(${pastExamQuestions.question}) = ${lc(question)}`)).limit(1);
          if (!found) {
            await tx.insert(pastExamQuestions).values({ tenantId: ctx.p.tenantId, question, exam, year, marks, subjectId, ...extra });
            return outcome(true, false, [exam, String(year)]);
          }
          const changed = found.marks !== marks || found.subjectId !== subjectId || found.unit !== extra.unit || found.questionNo !== extra.questionNo || found.paperCode !== extra.paperCode;
          if (changed) await tx.update(pastExamQuestions).set({ marks, subjectId, ...extra }).where(eq(pastExamQuestions.id, found.id));
          return outcome(false, changed, [exam, String(year)]);
        }),
    },
  };
}

// ---- academic document requests --------------------------------------------------------------

export function docRequestsEntity(docs: AcademicDocsService): RecordEntity {
  return {
    key: 'academic-doc-requests',
    module: 'exams',
    table: academicDocRequests,
    subjectType: 'academic_doc_request',
    roles: { read: CELL_READ, write: CELL },
    label: (r) => `${DOC_TITLE[r.kind as DocKind] ?? String(r.kind)}: ${String(r.rollNo ?? '')} ${String(r.studentName ?? '')}`.trim(),
    list: {
      select: { id: academicDocRequests.id, studentId: academicDocRequests.studentId, studentName: students.fullName, rollNo: students.rollNo, kind: academicDocRequests.kind, purpose: academicDocRequests.purpose, status: academicDocRequests.status, serialNo: academicDocRequests.serialNo, duplicate: academicDocRequests.duplicate, feePaise: academicDocRequests.feePaise, paymentRef: academicDocRequests.paymentRef, supersededAt: academicDocRequests.supersededAt, supersededReason: academicDocRequests.supersededReason, decisionNote: academicDocRequests.decisionNote, issuedAt: academicDocRequests.issuedAt, createdAt: academicDocRequests.createdAt },
      joins: (q) => q.innerJoin(students, eq(students.id, academicDocRequests.studentId)),
      search: [students.fullName, students.rollNo, academicDocRequests.serialNo, academicDocRequests.purpose],
      filters: {
        status: { label: 'Status', options: STATUS_WORDS(['requested', 'approved', 'rejected', 'issued']), where: (v) => (['requested', 'approved', 'rejected', 'issued'].includes(v) ? eq(academicDocRequests.status, v) : undefined) },
        kind: { label: 'Document', options: DOC_KINDS.map((k) => ({ value: k, label: DOC_TITLE[k] })), where: (v) => ((DOC_KINDS as readonly string[]).includes(v) ? eq(academicDocRequests.kind, v) : undefined) },
        reissue: { label: 'Out of date', options: [{ value: 'yes', label: 'Needs reissue' }], where: (v) => (v === 'yes' ? sql`${academicDocRequests.supersededAt} is not null and ${academicDocRequests.status} = 'issued'` : undefined) },
        duplicate: { label: 'Duplicate', options: [{ value: 'yes', label: 'Duplicates' }], where: (v) => (v === 'yes' ? eq(academicDocRequests.duplicate, true) : undefined) },
      },
      sorts: { created: academicDocRequests.createdAt, student: students.fullName, status: academicDocRequests.status, issued: academicDocRequests.issuedAt },
      defaultSort: { id: 'created', dir: 'desc' },
    },
    fields: {
      studentId: { label: 'Student', type: 'select', schema: Ref, column: academicDocRequests.studentId, required: true, edit: false, options: studentOptions },
      kind: { label: 'Document', type: 'select', schema: z.enum(DOC_KINDS), column: academicDocRequests.kind, required: true, edit: false, options: DOC_KINDS.map((k) => ({ value: k, label: DOC_TITLE[k] })) },
      purpose: {
        label: 'Purpose',
        type: 'text',
        schema: z.string().trim().max(300),
        apply: async (ctx, id, v) => {
          const [r] = await ctx.tx.select({ s: academicDocRequests.status }).from(academicDocRequests).where(eq(academicDocRequests.id, id));
          if (r?.s === 'issued') throw new ConflictException('An issued document cannot be changed');
          await ctx.tx.update(academicDocRequests).set({ purpose: String(v ?? '') }).where(eq(academicDocRequests.id, id));
        },
      },
    },
    create: async (ctx, v) => {
      const studentId = String(v.studentId);
      const kind = v.kind as DocKind;
      const [open] = await ctx.tx.select({ id: academicDocRequests.id }).from(academicDocRequests).where(and(eq(academicDocRequests.studentId, studentId), eq(academicDocRequests.kind, kind), inArray(academicDocRequests.status, ['requested', 'approved'])));
      if (open) throw new ConflictException('A request for this document is already open');
      const snap = await docs.snapshot(ctx.tx, ctx.p.tenantId, studentId);
      if (!snap.terms.length) throw new ConflictException('There are no results to issue a document from yet');
      const [row] = await ctx.tx.insert(academicDocRequests).values({ tenantId: ctx.p.tenantId, studentId, kind, purpose: String(v.purpose ?? ''), requestedBy: ctx.p.userId }).returning({ id: academicDocRequests.id });
      return row.id;
    },
    remove: { guard: async (ctx, id) => ((await ctx.tx.select({ s: academicDocRequests.status }).from(academicDocRequests).where(eq(academicDocRequests.id, id)))[0]?.s === 'issued' ? 'An issued document stays on record; it can be reissued instead' : null) },
    columns: [
      { key: 'createdAt', header: 'Asked on', value: (r) => (r.createdAt instanceof Date ? r.createdAt.toISOString().slice(0, 10) : String(r.createdAt ?? '').slice(0, 10)) },
      { key: 'rollNo', header: 'Roll no' },
      { key: 'studentName', header: 'Student' },
      { key: 'kind', header: 'Document', value: (r) => DOC_TITLE[r.kind as DocKind] ?? String(r.kind) },
      { key: 'purpose', header: 'Purpose' },
      { key: 'status', header: 'Status' },
      { key: 'serialNo', header: 'Serial number' },
      { key: 'duplicate', header: 'Duplicate', value: (r) => (r.duplicate ? 'Yes' : '') },
      { key: 'supersededReason', header: 'Out of date because' },
    ],
  };
}

// ---- transferred credits ---------------------------------------------------------------------

const Credits = z.coerce.number().min(0.5, 'Credits are at least 0.5').max(40, 'Credits are at most 40').multipleOf(0.5, 'Credits go in steps of 0.5');
const GradePoint = z.coerce.number().min(0, 'A grade point is from 0 to 10').max(10, 'A grade point is from 0 to 10');
const Grade = z.string().trim().min(1, 'Give the grade').max(4, 'A grade is at most 4 characters');

/** A course already passed here cannot also be brought in from elsewhere. */
async function assertNotEarned(tx: Tx, studentId: string, subjectId: string | null, exceptId?: string) {
  if (!subjectId) return;
  const [here] = await tx.select({ s: examResultLines.subjectId }).from(examResultLines).innerJoin(examResults, eq(examResults.id, examResultLines.resultId)).where(and(eq(examResults.studentId, studentId), eq(examResultLines.subjectId, subjectId), eq(examResultLines.passed, true))).limit(1);
  if (here) throw new ConflictException('The student has already passed this course here');
  const [twice] = await tx.select({ id: creditTransfers.id }).from(creditTransfers).where(and(eq(creditTransfers.studentId, studentId), eq(creditTransfers.subjectId, subjectId), exceptId ? ne(creditTransfers.id, exceptId) : sql`true`)).limit(1);
  if (twice) throw new ConflictException('Credits for this course are already transferred');
}

/** Changing an accepted credit changes the CGPA, so any issued transcript goes out of date. */
const transferField = (key: 'credits' | 'grade' | 'gradePoint' | 'term' | 'subjectId') => async (ctx: KitCtx, id: string, value: unknown) => {
  const [row] = await ctx.tx.select().from(creditTransfers).where(eq(creditTransfers.id, id));
  if (!row) throw new NotFoundException('Transferred credit not found');
  const next = key === 'grade' ? String(value).trim().toUpperCase() : key === 'subjectId' ? ((value as string | null) ?? null) : Number(value);
  if (key === 'subjectId') await assertNotEarned(ctx.tx, row.studentId, next as string | null, id);
  if (row[key] === next) return;
  await ctx.tx.update(creditTransfers).set({ [key]: next }).where(eq(creditTransfers.id, id));
  await supersedeDocuments(ctx.tx, row.studentId, 'Transferred credits changed');
};

export function creditTransfersEntity(): RecordEntity {
  const studentByRoll = async (tx: Tx, roll: string) => {
    const [st] = await tx.select({ id: students.id }).from(students).where(sql`lower(${students.rollNo}) = ${lc(roll)}`).limit(1);
    return st?.id ?? fail('No student with this roll number', roll);
  };
  const subjectByCode = async (tx: Tx, code: string) => {
    const [sub] = await tx.select({ id: subjects.id }).from(subjects).where(sql`lower(${subjects.code}) = ${lc(code)}`).limit(1);
    return sub?.id ?? fail('No subject with this code', code);
  };
  return {
    key: 'credit-transfers',
    module: 'exams',
    table: creditTransfers,
    subjectType: 'credit_transfer',
    roles: { read: CELL_READ, write: CELL },
    label: (r) => `${String(r.rollNo ?? '')} ${String(r.studentName ?? '')}: ${String(r.sourceCourse ?? '')} (${String(r.sourceInstitution ?? '')})`.trim(),
    list: {
      select: { id: creditTransfers.id, studentId: creditTransfers.studentId, studentName: students.fullName, rollNo: students.rollNo, sourceInstitution: creditTransfers.sourceInstitution, sourceCourse: creditTransfers.sourceCourse, subjectId: creditTransfers.subjectId, subjectCode: subjects.code, subjectName: subjects.name, term: creditTransfers.term, credits: creditTransfers.credits, grade: creditTransfers.grade, gradePoint: creditTransfers.gradePoint, note: creditTransfers.note, createdAt: creditTransfers.createdAt },
      joins: (q) => q.innerJoin(students, eq(students.id, creditTransfers.studentId)).leftJoin(subjects, eq(subjects.id, creditTransfers.subjectId)),
      search: [students.fullName, students.rollNo, creditTransfers.sourceInstitution, creditTransfers.sourceCourse, subjects.code],
      filters: {
        institution: { label: 'From institution', options: async (ctx) => (await ctx.tx.selectDistinct({ i: creditTransfers.sourceInstitution }).from(creditTransfers).orderBy(asc(creditTransfers.sourceInstitution))).map((r) => ({ value: r.i, label: r.i })), where: (v) => eq(creditTransfers.sourceInstitution, v) },
        equivalent: { label: 'Equivalent course', options: [{ value: 'yes', label: 'Mapped to a course' }, { value: 'no', label: 'Credit only' }], where: (v) => (v === 'yes' ? sql`${creditTransfers.subjectId} is not null` : v === 'no' ? sql`${creditTransfers.subjectId} is null` : undefined) },
      },
      sorts: { student: students.fullName, institution: creditTransfers.sourceInstitution, term: creditTransfers.term, credits: creditTransfers.credits, added: creditTransfers.createdAt },
      defaultSort: { id: 'added', dir: 'desc' },
      tiebreak: [creditTransfers.sourceCourse],
    },
    fields: {
      studentId: { label: 'Student', type: 'select', schema: Ref, column: creditTransfers.studentId, required: true, edit: false, options: studentOptions },
      sourceInstitution: { label: 'From institution', type: 'text', schema: Text(200), column: creditTransfers.sourceInstitution, required: true, bulk: true, help: 'The college or university where the credits were earned' },
      sourceCourse: { label: 'Course there', type: 'text', schema: Text(160), column: creditTransfers.sourceCourse, required: true, help: 'Code and name of the course as on their marks card' },
      subjectId: { label: 'Counts as', type: 'select', schema: OptionalRef, apply: transferField('subjectId'), options: subjectOptions, help: 'The course here it replaces; leave empty to count it as credit only' },
      term: { label: 'Term', type: 'number', schema: Int(1, 20), apply: transferField('term'), required: true },
      credits: { label: 'Credits', type: 'number', schema: Credits, apply: transferField('credits'), required: true },
      grade: { label: 'Grade', type: 'text', schema: Grade, apply: transferField('grade'), required: true },
      gradePoint: { label: 'Grade point', type: 'number', schema: GradePoint, apply: transferField('gradePoint'), required: true, help: 'On the 10-point scale used here' },
      note: { label: 'Note', type: 'textarea', schema: OptionalText(300), column: creditTransfers.note, help: 'E.g. the order number of the equivalence committee' },
    },
    create: async (ctx, v) => {
      const studentId = String(v.studentId);
      const subjectId = (v.subjectId as string | null) ?? null;
      await assertNotEarned(ctx.tx, studentId, subjectId);
      const [row] = await ctx.tx.insert(creditTransfers).values({ tenantId: ctx.p.tenantId, studentId, sourceInstitution: String(v.sourceInstitution), sourceCourse: String(v.sourceCourse), subjectId, term: Number(v.term), credits: Number(v.credits), grade: String(v.grade).trim().toUpperCase(), gradePoint: Number(v.gradePoint), note: (v.note as string | null) ?? null, createdBy: ctx.p.userId }).returning({ id: creditTransfers.id });
      await supersedeDocuments(ctx.tx, studentId, 'Transferred credits changed');
      return row.id;
    },
    remove: {
      // Runs in the delete's transaction just before the row goes: the student's issued transcripts no longer match.
      guard: async (ctx, id) => {
        const [row] = await ctx.tx.select({ studentId: creditTransfers.studentId }).from(creditTransfers).where(eq(creditTransfers.id, id));
        if (row) await supersedeDocuments(ctx.tx, row.studentId, 'Transferred credits changed');
        return null;
      },
    },
    columns: [
      { key: 'rollNo', header: 'Roll no' },
      { key: 'studentName', header: 'Student' },
      { key: 'sourceInstitution', header: 'From institution' },
      { key: 'sourceCourse', header: 'Course there' },
      { key: 'subjectCode', header: 'Counts as' },
      { key: 'term', header: 'Term' },
      { key: 'credits', header: 'Credits' },
      { key: 'grade', header: 'Grade' },
      { key: 'gradePoint', header: 'Grade point' },
      { key: 'note', header: 'Note' },
    ],
    import: {
      columns: [
        { key: 'roll_no', header: 'Roll no', required: true, help: "The student's roll number here", example: '22BCOM014' },
        { key: 'source_institution', header: 'From institution', required: true, help: 'Where the credits were earned', example: 'St Joseph College, Mysuru' },
        { key: 'source_course', header: 'Course there', required: true, help: 'Code and name on their marks card', example: 'BC204 Financial Accounting II' },
        { key: 'subject_code', header: 'Counts as (subject code)', help: 'The course here it replaces; leave empty for credit only', example: 'BCOM-2.1' },
        { key: 'term', header: 'Term', required: true, help: 'The term here it counts in', example: '2' },
        { key: 'credits', header: 'Credits', required: true, help: 'Credits accepted', example: '4' },
        { key: 'grade', header: 'Grade', required: true, help: 'Grade as awarded there', example: 'A' },
        { key: 'grade_point', header: 'Grade point', required: true, help: 'On the 10-point scale used here', example: '8' },
        { key: 'note', header: 'Note', help: 'E.g. the equivalence order number', example: 'EQ/2026/14' },
      ],
      key: ['roll_no', 'source_institution', 'source_course'],
      exists: async (ctx, r) => !!(await ctx.tx.select({ id: creditTransfers.id }).from(creditTransfers).innerJoin(students, eq(students.id, creditTransfers.studentId)).where(and(sql`lower(${students.rollNo}) = ${lc(r.get('roll_no'))}`, sql`lower(${creditTransfers.sourceInstitution}) = ${lc(r.get('source_institution'))}`, sql`lower(${creditTransfers.sourceCourse}) = ${lc(r.get('source_course'))}`)).limit(1))[0],
      run: async (ctx, rows) =>
        eachRow(ctx.tx, rows, async (tx, r) => {
          const studentId = await studentByRoll(tx, required(r, 'roll_no'));
          const sourceInstitution = required(r, 'source_institution').slice(0, 200);
          const sourceCourse = required(r, 'source_course').slice(0, 160);
          const code = r.get('subject_code');
          const subjectId = code ? await subjectByCode(tx, code) : null;
          const term = int(required(r, 'term'), 1, 20, 'The term is a whole number from 1 to 20');
          const credits = Credits.safeParse(required(r, 'credits'));
          if (!credits.success) fail(credits.error.issues[0].message, r.get('credits'));
          const gradePoint = GradePoint.safeParse(required(r, 'grade_point'));
          if (!gradePoint.success) fail(gradePoint.error.issues[0].message, r.get('grade_point'));
          const grade = required(r, 'grade').toUpperCase();
          if (grade.length > 4) fail('A grade is at most 4 characters', grade);
          const values = { subjectId, term, credits: credits.data!, grade, gradePoint: gradePoint.data!, note: r.get('note') || null };
          const [found] = await tx.select().from(creditTransfers).where(and(eq(creditTransfers.studentId, studentId), sql`lower(${creditTransfers.sourceInstitution}) = ${lc(sourceInstitution)}`, sql`lower(${creditTransfers.sourceCourse}) = ${lc(sourceCourse)}`)).limit(1);
          if (!found) {
            await assertNotEarned(tx, studentId, subjectId);
            await tx.insert(creditTransfers).values({ tenantId: ctx.p.tenantId, studentId, sourceInstitution, sourceCourse, createdBy: ctx.p.userId, ...values });
            await supersedeDocuments(tx, studentId, 'Transferred credits changed');
            return outcome(true, false, [sourceInstitution, sourceCourse]);
          }
          const changed = found.subjectId !== subjectId || found.term !== term || found.credits !== values.credits || found.grade !== grade || found.gradePoint !== values.gradePoint || found.note !== values.note;
          if (changed) {
            if (found.subjectId !== subjectId) await assertNotEarned(tx, studentId, subjectId, found.id);
            await tx.update(creditTransfers).set(values).where(eq(creditTransfers.id, found.id));
            await supersedeDocuments(tx, studentId, 'Transferred credits changed');
          }
          return outcome(false, changed, [sourceInstitution, sourceCourse]);
        }),
    },
  };
}

@Injectable()
export class ExamRecords implements OnModuleInit {
  constructor(
    private readonly registry: RecordRegistry,
    private readonly docs: AcademicDocsService,
  ) {}
  onModuleInit(): void {
    this.registry.register(sessionsEntity());
    this.registry.register(malpracticeEntity());
    this.registry.register(revaluationsEntity());
    this.registry.register(dutiesEntity());
    this.registry.register(pastQuestionsEntity());
    this.registry.register(docRequestsEntity(this.docs));
    this.registry.register(creditTransfersEntity());
  }
}
