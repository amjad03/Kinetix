import { BadRequestException, ConflictException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { and, eq, gte, inArray, lte, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { CONDONATION_DECIDERS, CORRECTION_DECIDERS, decideCondonation, decideCorrection, recordCondonationFee } from '../attendance-governance/decisions.js';
import { TEACHING_ROLES } from '../auth/auth.decorators.js';
import type { RoleName } from '../auth/principal.js';
import { Clock } from '../common/time.js';
import { attendanceLeaves } from '../db/schema-academic-ops.js';
import { academicYears, attendanceCondonations, attendanceCorrections, programs, sections, students, subjects, timetableSlots } from '../db/schema.js';
import { fail, lc, outcome, required } from '../import/row-helpers.js';
import { RecordRegistry, type FieldOption, type KitCtx, type RecordEntity } from '../records/entity.js';
import { DateText, OptionalText, Ref, Text, uuidEq } from '../records/helpers.js';
import { eachRow } from '../records/import.js';
import { sectionOptions } from '../admin/structure.records.js';
import { AttendanceDeskService } from './desk.service.js';

/**
 * Attendance lists as record kit entities (docs/requirements/RECORD_DEPTH_KIT.md): leave and on duty, correction
 * requests and condonation requests, with their approvals as kit actions so they can be decided one by one or in bulk.
 */

const CLASS_ROLES: RoleName[] = [...TEACHING_ROLES, 'tenant_admin'];
const STAFF_READ: RoleName[] = [...CLASS_ROLES, 'exam_controller'];
const isHead = (ctx: KitCtx) => ctx.p.roles.some((r) => r === 'principal' || r === 'tenant_admin' || r === 'hod' || r === 'exam_controller');
const Time = z.union([z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use a time like 09:30'), z.literal('')]).nullable().transform((v) => (v ? v : null));

/** Students a teacher sees: classes they teach or are class teacher of. */
const teachesStudent = (ctx: KitCtx, studentCol: SQL) =>
  sql`exists (select 1 from students st join sections s on s.id = st.section_id where st.id = ${studentCol} and (s.class_teacher_id = ${ctx.p.userId}::uuid
        or exists (select 1 from timetable_slots ts where ts.section_id = s.id and ts.teacher_id = ${ctx.p.userId}::uuid)))`;

/** Active students of the current year, by class, as "R12 Asha Rao". */
async function studentOptions(ctx: KitCtx): Promise<FieldOption[]> {
  const rows = await ctx.tx
    .select({ id: students.id, rollNo: students.rollNo, name: students.fullName, section: sections.displayName })
    .from(students)
    .innerJoin(sections, eq(sections.id, students.sectionId))
    .innerJoin(academicYears, eq(academicYears.id, sections.academicYearId))
    .innerJoin(programs, eq(programs.id, sections.programId))
    .where(and(eq(students.status, 'active'), eq(academicYears.isCurrent, true)))
    .orderBy(programs.sortOrder, programs.name, sections.term, sections.sortOrder, sections.displayName, students.rollNo);
  return rows.map((r) => ({ value: r.id, label: `${r.rollNo} ${r.name}`, group: r.section }));
}

const LEAVE_KINDS: FieldOption[] = [
  { value: 'on_duty', label: 'On duty' },
  { value: 'medical', label: 'Medical leave' },
  { value: 'personal', label: 'Leave' },
];
const LEAVE_STATUS: FieldOption[] = [
  { value: 'pending', label: 'Awaiting decision' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Declined' },
  { value: 'cancelled', label: 'Withdrawn' },
  { value: 'revoked', label: 'Revoked' },
];
const DECISION: FieldOption[] = [
  { value: 'pending', label: 'Awaiting decision' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Declined' },
];
const FEE: FieldOption[] = [
  { value: 'none', label: 'No fee' },
  { value: 'due', label: 'Fee due' },
  { value: 'paid', label: 'Fee paid' },
  { value: 'waived', label: 'Fee waived' },
];
const label = (list: FieldOption[], v: unknown) => list.find((o) => o.value === v)?.label ?? String(v ?? '');
const userName = (col: SQL | ReturnType<typeof sql.raw>) => sql<string | null>`(select u.full_name from users u where u.id = ${col})`;

@Injectable()
export class AttendanceRecords implements OnModuleInit {
  constructor(
    private readonly registry: RecordRegistry,
    private readonly desk: AttendanceDeskService,
    private readonly clock: Clock,
  ) {}

  onModuleInit(): void {
    this.registry.register(this.leaves());
    this.registry.register(this.corrections());
    this.registry.register(this.condonations());
  }

  /** A pending leave can still be changed; a decided one cannot. */
  private async pendingLeave(ctx: KitCtx, id: string) {
    const [l] = await ctx.tx.select().from(attendanceLeaves).where(eq(attendanceLeaves.id, id));
    if (!l) throw new NotFoundException('Leave not found');
    if (l.status !== 'pending') throw new ConflictException('Only a leave awaiting a decision can be changed');
    return l;
  }

  private leaves(): RecordEntity {
    const t = attendanceLeaves;
    const set = (column: keyof typeof attendanceLeaves.$inferInsert) => async (ctx: KitCtx, id: string, value: unknown) => {
      const l = await this.pendingLeave(ctx, id);
      const next = { ...l, [column]: value };
      if (String(next.fromDate) > String(next.toDate)) throw new BadRequestException('The leave cannot end before it starts');
      await ctx.tx.update(attendanceLeaves).set({ [column]: value }).where(eq(attendanceLeaves.id, id));
    };
    return {
      key: 'attendance-leaves',
      module: 'attendance',
      table: t,
      subjectType: 'attendance_leave',
      roles: { read: STAFF_READ, write: CLASS_ROLES },
      label: (r) => `${r.rollNo ?? ''} ${r.fullName ?? ''} ${r.fromDate ?? r.from_date ?? ''}`.trim(),
      list: {
        select: {
          id: t.id,
          studentId: t.studentId,
          fullName: students.fullName,
          rollNo: students.rollNo,
          sectionId: students.sectionId,
          section: sections.displayName,
          kind: t.kind,
          fromDate: t.fromDate,
          toDate: t.toDate,
          fromTime: t.fromTime,
          toTime: t.toTime,
          activity: t.activity,
          reason: t.reason,
          status: t.status,
          countsAs: t.countsAs,
          appliedMarks: t.appliedMarks,
          hasDocument: sql<boolean>`${t.documentKey} is not null`,
          requestedBy: userName(sql`${t.requestedBy}`),
          decidedBy: userName(sql`${t.decidedBy}`),
          decidedAt: t.decidedAt,
          decisionNote: t.decisionNote,
          createdAt: t.createdAt,
        },
        joins: (q) => q.innerJoin(students, eq(students.id, t.studentId)).innerJoin(sections, eq(sections.id, students.sectionId)),
        search: [students.fullName, students.rollNo, t.reason, t.activity],
        filters: {
          status: { label: 'Status', options: LEAVE_STATUS, where: (v) => (LEAVE_STATUS.some((o) => o.value === v) ? eq(t.status, v) : undefined) },
          kind: { label: 'Kind', options: LEAVE_KINDS, where: (v) => (LEAVE_KINDS.some((o) => o.value === v) ? eq(t.kind, v) : undefined) },
          class: { label: 'Class', options: sectionOptions, where: (v) => uuidEq(students.sectionId, v) },
          month: { label: 'Month', where: (v) => (/^\d{4}-\d{2}$/.test(v) ? and(lte(t.fromDate, sql`(${`${v}-01`}::date + interval '1 month' - interval '1 day')::date`), gte(t.toDate, `${v}-01`)) : undefined) },
        },
        sorts: { from: t.fromDate, student: students.fullName, class: sections.displayName, kind: t.kind, status: t.status, created: t.createdAt },
        defaultSort: { id: 'created', dir: 'desc' },
        scope: (ctx) => (isHead(ctx) ? undefined : teachesStudent(ctx, sql`${t.studentId}`)),
      },
      fields: {
        studentId: { label: 'Student', type: 'select', schema: Ref, column: t.studentId, options: studentOptions, required: true, edit: false },
        kind: { label: 'Kind', type: 'select', schema: z.enum(['on_duty', 'medical', 'personal']), options: LEAVE_KINDS, required: true, apply: set('kind') },
        fromDate: { label: 'From', type: 'date', schema: DateText.refine((v) => v !== null, 'This value is required'), required: true, apply: set('fromDate') },
        toDate: { label: 'To', type: 'date', schema: DateText.refine((v) => v !== null, 'This value is required'), required: true, apply: set('toDate') },
        fromTime: { label: 'From time', type: 'text', schema: Time, apply: set('fromTime'), help: 'Part of a day only: periods starting from this time (HH:MM)' },
        toTime: { label: 'To time', type: 'text', schema: Time, apply: set('toTime'), help: 'Part of a day only: periods starting before this time (HH:MM)' },
        activity: { label: 'Activity', type: 'text', schema: OptionalText(200).transform((v) => v ?? ''), apply: set('activity'), help: 'For on duty: the event, sport, NSS camp or placement drive' },
        reason: { label: 'Reason', type: 'textarea', schema: Text(1000), required: true, apply: set('reason') },
      },
      create: async (ctx, v) => {
        const studentId = String(v.studentId);
        const from = String(v.fromDate);
        const to = String(v.toDate);
        if (from > to) throw new BadRequestException('The leave cannot end before it starts');
        if (!v.fromTime !== !v.toTime || (v.fromTime && String(v.fromTime) >= String(v.toTime))) throw new BadRequestException('Give both times, the first before the second');
        const [stu] = await ctx.tx.select({ id: students.id }).from(students).where(eq(students.id, studentId));
        if (!stu) throw new NotFoundException('Student not found');
        const [overlap] = await ctx.tx.select({ id: t.id }).from(t).where(and(eq(t.studentId, studentId), inArray(t.status, ['pending', 'approved']), lte(t.fromDate, to), gte(t.toDate, from)));
        if (overlap) throw new ConflictException('The student already has leave for some of these days');
        const [row] = await ctx.tx
          .insert(t)
          .values({ tenantId: ctx.p.tenantId, studentId, kind: String(v.kind), fromDate: from, toDate: to, fromTime: (v.fromTime as string | null) ?? null, toTime: (v.toTime as string | null) ?? null, activity: String(v.activity ?? ''), reason: String(v.reason), requestedBy: ctx.p.userId })
          .returning({ id: t.id });
        return row.id;
      },
      remove: { guard: async (ctx, id) => ((await ctx.tx.select({ s: t.status }).from(t).where(eq(t.id, id)))[0]?.s === 'approved' ? 'An approved leave has written marks: revoke it instead of deleting it' : null) },
      actions: {
        approve: { label: 'Approve', inputs: [{ key: 'note', label: 'Note', type: 'textarea' }], params: z.object({ note: z.string().trim().max(500).optional() }), apply: async (ctx, id, params) => void (await this.desk.decideLeave(ctx.tx, ctx.p, id, true, (params as { note?: string }).note || null)) },
        reject: { label: 'Decline', tone: 'danger', inputs: [{ key: 'note', label: 'Reason', type: 'textarea', required: true }], params: z.object({ note: z.string().trim().min(3).max(500) }), apply: async (ctx, id, params) => void (await this.desk.decideLeave(ctx.tx, ctx.p, id, false, (params as { note: string }).note)) },
        revoke: { label: 'Revoke approval', tone: 'danger', inputs: [{ key: 'note', label: 'Reason', type: 'textarea', required: true }], params: z.object({ note: z.string().trim().min(3).max(500) }), apply: async (ctx, id, params) => void (await this.desk.revokeLeave(ctx.tx, ctx.p, id, (params as { note: string }).note)) },
      },
      columns: [
        { key: 'rollNo', header: 'Roll no' },
        { key: 'fullName', header: 'Student' },
        { key: 'section', header: 'Class' },
        { key: 'kind', header: 'Kind', value: (r) => label(LEAVE_KINDS, r.kind) },
        { key: 'fromDate', header: 'From' },
        { key: 'toDate', header: 'To' },
        { key: 'fromTime', header: 'From time' },
        { key: 'toTime', header: 'To time' },
        { key: 'activity', header: 'Activity' },
        { key: 'reason', header: 'Reason' },
        { key: 'status', header: 'Status', value: (r) => label(LEAVE_STATUS, r.status) },
        { key: 'appliedMarks', header: 'Marks written' },
        { key: 'decidedBy', header: 'Decided by' },
        { key: 'decisionNote', header: 'Decision note' },
      ],
      import: {
        columns: [
          { key: 'roll_no', header: 'Roll number', required: true, help: "The student's roll number", example: 'BSC1A001' },
          { key: 'kind', header: 'Kind', required: true, help: 'on_duty, medical or personal', example: 'on_duty', options: ['on_duty', 'medical', 'personal'] },
          { key: 'from', header: 'From', required: true, help: 'First day, YYYY-MM-DD', example: '2026-11-03' },
          { key: 'to', header: 'To', required: true, help: 'Last day, YYYY-MM-DD', example: '2026-11-04' },
          { key: 'from_time', header: 'From time', help: 'Optional: part of a day, HH:MM' },
          { key: 'to_time', header: 'To time', help: 'Optional: part of a day, HH:MM' },
          { key: 'activity', header: 'Activity', help: 'For on duty: the event', example: 'Inter-college fest' },
          { key: 'reason', header: 'Reason', required: true, example: 'Representing the college' },
        ],
        key: ['roll_no', 'kind', 'from'],
        exists: async (ctx, r) => {
          const [st] = await ctx.tx.select({ id: students.id }).from(students).where(sql`lower(${students.rollNo}) = ${lc(r.get('roll_no'))}`).limit(1);
          return !!st && !!(await ctx.tx.select({ id: t.id }).from(t).where(and(eq(t.studentId, st.id), eq(t.kind, lc(r.get('kind'))), eq(t.fromDate, r.get('from')))).limit(1))[0];
        },
        run: async (ctx, rows) =>
          eachRow(ctx.tx, rows, async (tx, r) => {
            const roll = required(r, 'roll_no');
            const [st] = await tx.select({ id: students.id, name: students.fullName }).from(students).where(and(sql`lower(${students.rollNo}) = ${lc(roll)}`, eq(students.status, 'active'))).limit(1);
            if (!st) fail('No active student with this roll number', roll);
            const kind = lc(required(r, 'kind'));
            if (!['on_duty', 'medical', 'personal'].includes(kind)) fail('Use on_duty, medical or personal', r.get('kind'));
            const from = required(r, 'from');
            const to = required(r, 'to');
            if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) fail('Give dates as YYYY-MM-DD', `${from} ${to}`);
            if (from > to) fail('The leave cannot end before it starts', `${from} ${to}`);
            const ft = r.get('from_time') || null;
            const tt = r.get('to_time') || null;
            if (!ft !== !tt || (ft && !/^\d{2}:\d{2}$/.test(ft)) || (tt && !/^\d{2}:\d{2}$/.test(tt)) || (ft && tt && ft >= tt)) fail('Give both times as HH:MM, the first before the second', `${ft ?? ''} ${tt ?? ''}`);
            const [found] = await tx.select().from(t).where(and(eq(t.studentId, st!.id), eq(t.kind, kind), eq(t.fromDate, from))).limit(1);
            if (found) {
              if (found.status !== 'pending') return outcome(false, false, [roll, from]);
              await tx.update(t).set({ toDate: to, fromTime: ft, toTime: tt, activity: r.get('activity'), reason: required(r, 'reason') }).where(eq(t.id, found.id));
              return outcome(false, true, [roll, from]);
            }
            const [overlap] = await tx.select({ id: t.id }).from(t).where(and(eq(t.studentId, st!.id), inArray(t.status, ['pending', 'approved']), lte(t.fromDate, to), gte(t.toDate, from)));
            if (overlap) fail('The student already has leave for some of these days', roll);
            await tx.insert(t).values({ tenantId: ctx.p.tenantId, studentId: st!.id, kind, fromDate: from, toDate: to, fromTime: ft, toTime: tt, activity: r.get('activity'), reason: required(r, 'reason'), requestedBy: ctx.p.userId });
            return outcome(true, false, [roll, st!.name, from]);
          }),
      },
    };
  }

  private corrections(): RecordEntity {
    const c = attendanceCorrections;
    return {
      key: 'attendance-corrections',
      module: 'attendance',
      table: c,
      subjectType: 'attendance_correction',
      roles: { read: CLASS_ROLES, write: CLASS_ROLES },
      label: (r) => `${r.rollNo ?? ''} ${r.fullName ?? ''} ${r.date ?? ''}`.trim(),
      list: {
        select: {
          id: c.id,
          fullName: students.fullName,
          rollNo: students.rollNo,
          section: sections.displayName,
          subject: subjects.name,
          date: c.date,
          fromStatus: c.fromStatus,
          toStatus: c.toStatus,
          reason: c.reason,
          status: c.status,
          requestedBy: userName(sql`${c.requestedBy}`),
          decidedBy: userName(sql`${c.decidedBy}`),
          decisionNote: c.decisionNote,
          createdAt: c.createdAt,
        },
        joins: (q) => q.innerJoin(students, eq(students.id, c.studentId)).innerJoin(sections, eq(sections.id, c.sectionId)).innerJoin(timetableSlots, eq(timetableSlots.id, c.timetableSlotId)).innerJoin(subjects, eq(subjects.id, timetableSlots.subjectId)),
        search: [students.fullName, students.rollNo, c.reason, subjects.name],
        filters: {
          status: { label: 'Status', options: DECISION, where: (v) => (DECISION.some((o) => o.value === v) ? eq(c.status, v) : undefined) },
          class: { label: 'Class', options: sectionOptions, where: (v) => uuidEq(c.sectionId, v) },
        },
        sorts: { date: c.date, student: students.fullName, class: sections.displayName, status: c.status, created: c.createdAt },
        defaultSort: { id: 'created', dir: 'desc' },
        // Heads of department and the principal see every request; teachers their own.
        scope: (ctx) => (ctx.p.roles.some((r) => CORRECTION_DECIDERS.includes(r)) ? undefined : eq(c.requestedBy, ctx.p.userId)),
      },
      remove: { guard: async (ctx, id) => ((await ctx.tx.select({ s: c.status }).from(c).where(eq(c.id, id)))[0]?.s === 'pending' ? null : 'A decided correction stays on record') },
      actions: {
        approve: { label: 'Approve', roles: CORRECTION_DECIDERS, inputs: [{ key: 'note', label: 'Note', type: 'textarea', required: true }], params: z.object({ note: z.string().trim().min(3).max(500) }), apply: async (ctx, id, params) => void (await decideCorrection(ctx.tx, ctx.p, id, 'approved', (params as { note: string }).note, this.clock.now())) },
        reject: { label: 'Decline', roles: CORRECTION_DECIDERS, tone: 'danger', inputs: [{ key: 'note', label: 'Reason', type: 'textarea', required: true }], params: z.object({ note: z.string().trim().min(3).max(500) }), apply: async (ctx, id, params) => void (await decideCorrection(ctx.tx, ctx.p, id, 'rejected', (params as { note: string }).note, this.clock.now())) },
      },
      columns: [
        { key: 'rollNo', header: 'Roll no' },
        { key: 'fullName', header: 'Student' },
        { key: 'section', header: 'Class' },
        { key: 'subject', header: 'Subject' },
        { key: 'date', header: 'Date' },
        { key: 'fromStatus', header: 'From' },
        { key: 'toStatus', header: 'To' },
        { key: 'reason', header: 'Reason' },
        { key: 'requestedBy', header: 'Asked by' },
        { key: 'status', header: 'Status', value: (r) => label(DECISION, r.status) },
        { key: 'decidedBy', header: 'Decided by' },
        { key: 'decisionNote', header: 'Decision note' },
      ],
    };
  }

  private condonations(): RecordEntity {
    const c = attendanceCondonations;
    const today = async (ctx: KitCtx) => (await this.desk.now(ctx.tx)).date;
    return {
      key: 'attendance-condonations',
      module: 'attendance',
      table: c,
      subjectType: 'attendance_condonation',
      roles: { read: STAFF_READ, write: [...CLASS_ROLES, 'accountant'] },
      label: (r) => `${r.rollNo ?? ''} ${r.fullName ?? ''}`.trim(),
      list: {
        select: {
          id: c.id,
          studentId: c.studentId,
          fullName: students.fullName,
          rollNo: students.rollNo,
          section: sections.displayName,
          subject: subjects.name,
          kind: c.kind,
          reason: c.reason,
          status: c.status,
          approvedPoints: c.approvedPoints,
          feePaise: c.feePaise,
          feeStatus: c.feeStatus,
          feeReceipt: c.feeReceipt,
          hasDocument: sql<boolean>`${c.documentKey} is not null`,
          leaveCount: sql<number>`coalesce(array_length(${c.leaveIds}, 1), 0)`,
          requestedBy: userName(sql`${c.requestedBy}`),
          decidedBy: userName(sql`${c.decidedBy}`),
          decisionNote: c.decisionNote,
          createdAt: c.createdAt,
        },
        joins: (q) => q.innerJoin(students, eq(students.id, c.studentId)).innerJoin(sections, eq(sections.id, students.sectionId)).leftJoin(subjects, eq(subjects.id, c.subjectId)),
        search: [students.fullName, students.rollNo, c.reason],
        filters: {
          status: { label: 'Status', options: DECISION, where: (v) => (DECISION.some((o) => o.value === v) ? eq(c.status, v) : undefined) },
          fee: { label: 'Fee', options: FEE, where: (v) => (FEE.some((o) => o.value === v) ? eq(c.feeStatus, v) : undefined) },
          class: { label: 'Class', options: sectionOptions, where: (v) => uuidEq(students.sectionId, v) },
        },
        sorts: { student: students.fullName, class: sections.displayName, status: c.status, points: c.approvedPoints, created: c.createdAt },
        defaultSort: { id: 'created', dir: 'desc' },
        scope: (ctx) => (isHead(ctx) || ctx.p.roles.includes('accountant') ? undefined : teachesStudent(ctx, sql`${c.studentId}`)),
      },
      remove: { guard: async (ctx, id) => ((await ctx.tx.select({ s: c.status }).from(c).where(eq(c.id, id)))[0]?.s === 'pending' ? null : 'A decided condonation stays on record') },
      actions: {
        approve: {
          label: 'Approve',
          roles: CONDONATION_DECIDERS,
          inputs: [
            { key: 'points', label: 'Percentage points', type: 'number', required: true },
            { key: 'feePaise', label: 'Condonation fee (₹)', type: 'money', help: 'Empty: the fee in Academics settings' },
            { key: 'note', label: 'Note', type: 'textarea', required: true },
          ],
          params: z.object({ points: z.number().int().min(1).max(30), note: z.string().trim().min(3).max(500), feePaise: z.number().int().min(0).max(10_000_000).optional() }),
          apply: async (ctx, id, params) => void (await decideCondonation(ctx.tx, ctx.p, id, { decision: 'approved', ...(params as { points: number; note: string; feePaise?: number }) }, this.clock.now(), await today(ctx))),
        },
        reject: { label: 'Decline', roles: CONDONATION_DECIDERS, tone: 'danger', inputs: [{ key: 'note', label: 'Reason', type: 'textarea', required: true }], params: z.object({ note: z.string().trim().min(3).max(500) }), apply: async (ctx, id, params) => void (await decideCondonation(ctx.tx, ctx.p, id, { decision: 'rejected', points: 0, note: (params as { note: string }).note }, this.clock.now(), await today(ctx))) },
        feePaid: { label: 'Fee paid', roles: [...CONDONATION_DECIDERS, 'accountant'], inputs: [{ key: 'receipt', label: 'Receipt number', type: 'text', required: true }], params: z.object({ receipt: z.string().trim().min(1).max(60) }), apply: async (ctx, id, params) => void (await recordCondonationFee(ctx.tx, ctx.p, id, { action: 'paid', receipt: (params as { receipt: string }).receipt }, this.clock.now())) },
        feeWaived: { label: 'Waive fee', roles: CONDONATION_DECIDERS, inputs: [{ key: 'note', label: 'Note', type: 'textarea' }], params: z.object({ note: z.string().trim().max(500).optional() }), apply: async (ctx, id, params) => void (await recordCondonationFee(ctx.tx, ctx.p, id, { action: 'waived', note: (params as { note?: string }).note }, this.clock.now())) },
      },
      columns: [
        { key: 'rollNo', header: 'Roll no' },
        { key: 'fullName', header: 'Student' },
        { key: 'section', header: 'Class' },
        { key: 'subject', header: 'Subject' },
        { key: 'kind', header: 'Kind' },
        { key: 'reason', header: 'Reason' },
        { key: 'status', header: 'Status', value: (r) => label(DECISION, r.status) },
        { key: 'approvedPoints', header: 'Points' },
        { key: 'feePaise', header: 'Fee (₹)', value: (r) => Number(r.feePaise ?? 0) / 100 },
        { key: 'feeStatus', header: 'Fee', value: (r) => label(FEE, r.feeStatus) },
        { key: 'feeReceipt', header: 'Receipt' },
        { key: 'decidedBy', header: 'Decided by' },
        { key: 'decisionNote', header: 'Decision note' },
      ],
    };
  }
}
