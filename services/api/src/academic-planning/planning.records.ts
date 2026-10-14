import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { and, asc, eq, inArray, isNull, ne, or, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { departmentOptions, programOptions, sectionOptions } from '../admin/structure.records.js';
import { validateSlot } from '../admin/timetable-rules.js';
import type { RoleName } from '../auth/principal.js';
import { audit } from '../common/audit.js';
import { Clock, localParts } from '../common/time.js';
import { regulations } from '../db/schema-curriculum.js';
import { creditTransfers, electiveBaskets, electiveBasketSubjects, facultyAllocations, periodStructures, specialClasses, subjectRequisites, workingDaySwaps, type BellPeriod } from '../db/schema-academic-ops.js';
import { academicYears, examResultLines, examResults, programs, rooms, sections, students, subjects, timetableSlots, userRoles, users } from '../db/schema.js';
import { supersedeDocuments } from '../exam-cell/result-runs.js';
import { fail, int, lc, outcome, required } from '../import/row-helpers.js';
import { RecordRegistry, type FieldOption, type KitCtx, type RecordEntity } from '../records/entity.js';
import { copyName, DateText, Int, OptionalRef, OptionalText, Ref, Text, uuidEq } from '../records/helpers.js';
import { eachRow } from '../records/import.js';
import { addDays } from '../teacher/teacher.service.js';
import { CalendarService } from '../timetable/calendar.service.js';
import { TimetableService } from '../timetable/timetable.service.js';
import { parseDays, parsePeriods, periodsText, TRANSFER_SOURCES, WEEKDAYS } from './planning-rules.js';

export { TRANSFER_SOURCES };

/**
 * Academic planning as record kit entities (docs/requirements/RECORD_DEPTH_KIT.md): elective baskets, prerequisites
 * and co-requisites, credit transfers (ABC, SWAYAM, NPTEL), faculty allocation with mid-semester hand-over, period
 * structures (bell schedules), special classes, compensatory working days and regulations.
 */

const ADMIN: RoleName[] = ['tenant_admin', 'principal'];
const HEADS: RoleName[] = [...ADMIN, 'hod'];
const READ: RoleName[] = [...HEADS, 'teacher', 'exam_controller', 'admissions_officer'];
const TEACHERS: RoleName[] = [...HEADS, 'teacher'];
const isAdmin = (ctx: KitCtx) => ctx.p.roles.some((r) => ADMIN.includes(r));
const isHeadOrAdmin = (ctx: KitCtx) => ctx.p.roles.some((r) => HEADS.includes(r) || r === 'exam_controller');

const Decimal = (min: number, max: number) => z.coerce.number().min(min).max(max).refine((n) => Math.round(n * 10) === n * 10, 'Use at most one decimal place');
const OptionalDecimal = (min: number, max: number) =>
  z
    .union([z.literal(''), z.null(), z.coerce.number().min(min).max(max)])
    .transform((v) => (v === '' || v === null ? null : v));
const OptionalInt = (min: number, max: number) =>
  z
    .union([z.literal(''), z.null(), z.coerce.number().int().min(min).max(max)])
    .transform((v) => (v === '' || v === null ? null : v));
const HHMM = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:\d\d)?$/, 'Use a time like 09:30').transform((v) => v.slice(0, 5));

export const BASKET_KINDS: FieldOption[] = [
  { value: 'elective', label: 'Elective' },
  { value: 'open_elective', label: 'Open elective' },
  { value: 'minor', label: 'Minor' },
  { value: 'honours', label: 'Honours' },
  { value: 'skill', label: 'Skill enhancement' },
  { value: 'value_added', label: 'Value added' },
];
export const ALLOCATION_ROLES: FieldOption[] = [
  { value: 'primary', label: 'Course teacher' },
  { value: 'co_teacher', label: 'Co-teacher' },
  { value: 'lab', label: 'Lab in charge' },
  { value: 'tutorial', label: 'Tutorial' },
];
export const SPECIAL_KINDS: FieldOption[] = [
  { value: 'extra', label: 'Extra class' },
  { value: 'special', label: 'Special class' },
  { value: 'remedial', label: 'Remedial class' },
  { value: 'makeup', label: 'Make-up class' },
];
const SPECIAL_STATUS: FieldOption[] = [
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'held', label: 'Held' },
  { value: 'cancelled', label: 'Cancelled' },
];
const DECISION: FieldOption[] = [
  { value: 'pending', label: 'Awaiting decision' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Declined' },
  { value: 'revoked', label: 'Revoked' },
];
const REQUISITE_KINDS: FieldOption[] = [
  { value: 'prerequisite', label: 'Prerequisite' },
  { value: 'corequisite', label: 'Co-requisite' },
];
const WEEKDAY_OPTIONS: FieldOption[] = WEEKDAYS.map((d, i) => ({ value: String(i + 1), label: d }));
const labelOf = (list: FieldOption[], v: unknown) => list.find((o) => o.value === String(v))?.label ?? String(v ?? '');

// ---- options --------------------------------------------------------------------------------------

/** Subjects as "CODE Name", grouped by programme and term. */
export async function subjectOptions(ctx: KitCtx): Promise<FieldOption[]> {
  const rows = await ctx.tx
    .select({ id: subjects.id, code: subjects.code, name: subjects.name, program: programs.name, term: subjects.term })
    .from(subjects)
    .innerJoin(programs, eq(programs.id, subjects.programId))
    .orderBy(asc(programs.sortOrder), asc(programs.name), asc(subjects.term), asc(subjects.sortOrder), asc(subjects.code));
  return rows.map((r) => ({ value: r.id, label: `${r.code} ${r.name}`, group: `${r.program} · ${r.term}` }));
}

/** Teaching staff (teachers, heads of department, the principal). */
export async function teacherOptions(ctx: KitCtx): Promise<FieldOption[]> {
  const rows = await ctx.tx
    .selectDistinct({ id: users.id, name: users.fullName })
    .from(users)
    .innerJoin(userRoles, and(eq(userRoles.userId, users.id), inArray(userRoles.role, ['teacher', 'hod', 'principal'])))
    .where(eq(users.status, 'active'))
    .orderBy(asc(users.fullName));
  return rows.map((r) => ({ value: r.id, label: r.name }));
}

async function studentOptions(ctx: KitCtx): Promise<FieldOption[]> {
  const rows = await ctx.tx
    .select({ id: students.id, rollNo: students.rollNo, name: students.fullName, section: sections.displayName })
    .from(students)
    .innerJoin(sections, eq(sections.id, students.sectionId))
    .innerJoin(academicYears, eq(academicYears.id, sections.academicYearId))
    .where(and(inArray(students.status, ['active', 'promoted', 'detained', 'on_leave']), eq(academicYears.isCurrent, true)))
    .orderBy(asc(sections.displayName), asc(students.rollNo));
  return rows.map((r) => ({ value: r.id, label: `${r.rollNo} ${r.name}`, group: r.section }));
}

/** Terms 1 to the longest programme's count. */
async function termOptions(ctx: KitCtx): Promise<FieldOption[]> {
  const [{ max }] = await ctx.tx.select({ max: sql<number>`coalesce(max(${programs.termCount}), 0)::int` }).from(programs);
  return Array.from({ length: max }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }));
}

async function roomOptions(ctx: KitCtx): Promise<FieldOption[]> {
  const rows = await ctx.tx.select({ id: rooms.id, name: rooms.name }).from(rooms).orderBy(asc(rooms.name));
  return rows.map((r) => ({ value: r.id, label: r.name }));
}

const programByName = async (ctx: KitCtx, name: string) => {
  const [p] = await ctx.tx.select().from(programs).where(sql`lower(${programs.name}) = ${lc(name)}`).limit(1);
  return p ?? fail('No programme with this name', name);
};
const subjectByCode = async (ctx: KitCtx, code: string, programId?: string) => {
  const [s] = await ctx.tx
    .select()
    .from(subjects)
    .where(and(sql`lower(${subjects.code}) = ${lc(code)}`, programId ? eq(subjects.programId, programId) : undefined))
    .limit(2);
  return s ?? fail('No subject with this code', code);
};
const sectionByName = async (ctx: KitCtx, name: string) => {
  const [s] = await ctx.tx.select().from(sections).innerJoin(academicYears, eq(academicYears.id, sections.academicYearId)).where(and(sql`lower(${sections.displayName}) = ${lc(name)}`, eq(academicYears.isCurrent, true))).limit(1);
  return s?.sections ?? fail('No class with this name this year', name);
};
const teacherByName = async (ctx: KitCtx, who: string) => {
  const [u] = await ctx.tx
    .selectDistinct({ id: users.id })
    .from(users)
    .innerJoin(userRoles, and(eq(userRoles.userId, users.id), inArray(userRoles.role, ['teacher', 'hod', 'principal'])))
    .where(or(sql`lower(${users.email}) = ${lc(who)}`, sql`lower(${users.fullName}) = ${lc(who)}`))
    .limit(1);
  return u?.id ?? fail('No teacher with this email or name', who);
};

/** A class and a subject belong together: the subject is taught in the class's programme and term. */
async function assertSubjectInClass(ctx: KitCtx, sectionId: string, subjectId: string) {
  const [s] = await ctx.tx.select().from(sections).where(eq(sections.id, sectionId));
  if (!s) throw new NotFoundException('Class not found');
  const [sub] = await ctx.tx.select().from(subjects).where(eq(subjects.id, subjectId));
  if (!sub) throw new NotFoundException('Subject not found');
  if (sub.programId !== s.programId || sub.term !== s.term) throw new BadRequestException('That subject is not taught in this class');
  return { section: s, subject: sub };
}

/** A head of department may only manage their department's subjects. */
async function assertHeadsSubject(ctx: KitCtx, subjectId: string) {
  if (isAdmin(ctx)) return;
  const [r] = await ctx.tx.execute<{ ok: boolean }>(sql`select exists (select 1 from subjects s join departments d on d.id = s.department_id where s.id = ${subjectId}::uuid and d.head_user_id = ${ctx.p.userId}::uuid) as ok`).then((x) => x.rows);
  if (!r?.ok) throw new ForbiddenException("Only the principal or the subject's head of department can change this");
}

/** Subjects of the departments this head runs (for list scopes). */
const headedSubjects = (ctx: KitCtx, col: SQL) => sql`${col} in (select s.id from subjects s join departments d on d.id = s.department_id where d.head_user_id = ${ctx.p.userId}::uuid)`;

@Injectable()
export class PlanningRecords implements OnModuleInit {
  constructor(
    private readonly registry: RecordRegistry,
    private readonly clock: Clock,
    private readonly timetable: TimetableService,
    private readonly calendar: CalendarService,
  ) {}

  onModuleInit(): void {
    for (const e of [this.baskets(), this.requisites(), this.transfers(), this.allocations(), this.periods(), this.specials(), this.workingDays(), this.regulationsEntity()]) this.registry.register(e);
  }

  private async today(ctx: KitCtx) {
    return localParts(this.clock.now(), await this.timetable.tenantTimezone(ctx.tx)).date;
  }

  // ---- elective baskets ---------------------------------------------------------------------------

  private baskets(): RecordEntity {
    const b = electiveBaskets;
    const members = sql<string>`(select coalesce(string_agg(s.code, ', ' order by s.code), '') from elective_basket_subjects m join subjects s on s.id = m.subject_id where m.basket_id = ${b.id})`;
    const memberCount = sql<number>`(select count(*)::int from elective_basket_subjects m where m.basket_id = ${b.id})`;
    const credits = sql<number | null>`(select sum(s.credits)::float from elective_basket_subjects m join subjects s on s.id = m.subject_id where m.basket_id = ${b.id})`;
    const checkRange = async (ctx: KitCtx, id: string, patch: Record<string, unknown>) => {
      const [cur] = await ctx.tx.select().from(b).where(eq(b.id, id));
      const next = { ...cur, ...patch };
      if (next.minChoose > next.maxChoose) throw new BadRequestException('The minimum to choose cannot exceed the maximum');
      if (next.minCredits !== null && next.maxCredits !== null && Number(next.minCredits) > Number(next.maxCredits)) throw new BadRequestException('Minimum credits cannot exceed maximum credits');
      await ctx.tx.update(b).set(patch).where(eq(b.id, id));
    };
    return {
      key: 'elective-baskets',
      module: 'academics',
      table: b,
      subjectType: 'elective_basket',
      roles: { read: READ, write: HEADS },
      label: (r) => String(r.name),
      list: {
        select: { id: b.id, name: b.name, programId: b.programId, programName: programs.name, term: b.term, kind: b.kind, minChoose: b.minChoose, maxChoose: b.maxChoose, minCredits: b.minCredits, maxCredits: b.maxCredits, notes: b.notes, sortOrder: b.sortOrder, members, memberCount, credits },
        joins: (q) => q.innerJoin(programs, eq(programs.id, b.programId)),
        search: [b.name, programs.name, members],
        filters: {
          programme: { label: 'Programme', options: programOptions, where: (v) => uuidEq(b.programId, v) },
          term: { label: 'Term', options: termOptions, where: (v) => (/^\d{1,2}$/.test(v) ? eq(b.term, Number(v)) : undefined) },
          kind: { label: 'Kind', options: BASKET_KINDS, where: (v) => (BASKET_KINDS.some((o) => o.value === v) ? eq(b.kind, v) : undefined) },
        },
        sorts: { name: b.name, programme: programs.name, term: b.term, kind: b.kind, subjects: memberCount },
        defaultSort: { id: 'programme', dir: 'asc' },
        tiebreak: [b.term, b.sortOrder, b.name],
      },
      fields: {
        programId: { label: 'Programme', type: 'select', schema: Ref, column: b.programId, options: programOptions, required: true, edit: false },
        term: { label: 'Term', type: 'number', schema: Int(1, 20), column: b.term, required: true },
        name: { label: 'Name', type: 'text', schema: Text(120), column: b.name, required: true, help: 'For example: Discipline elective I' },
        kind: { label: 'Kind', type: 'select', schema: Text(20), column: b.kind, options: BASKET_KINDS, required: true, bulk: true },
        minChoose: { label: 'Choose at least', type: 'number', schema: Int(0, 20), apply: (ctx, id, v) => checkRange(ctx, id, { minChoose: v }), rowKey: 'minChoose', required: true },
        maxChoose: { label: 'Choose at most', type: 'number', schema: Int(1, 20), apply: (ctx, id, v) => checkRange(ctx, id, { maxChoose: v }), rowKey: 'maxChoose', required: true },
        minCredits: { label: 'Minimum credits', type: 'number', schema: OptionalDecimal(0, 60), apply: (ctx, id, v) => checkRange(ctx, id, { minCredits: v }) },
        maxCredits: { label: 'Maximum credits', type: 'number', schema: OptionalDecimal(0, 60), apply: (ctx, id, v) => checkRange(ctx, id, { maxCredits: v }) },
        notes: { label: 'Notes', type: 'textarea', schema: OptionalText(1000).transform((v) => v ?? ''), column: b.notes },
      },
      create: async (ctx, v) => {
        const [prog] = await ctx.tx.select().from(programs).where(eq(programs.id, String(v.programId)));
        if (!prog) throw new NotFoundException('Programme not found');
        if (Number(v.term) > prog.termCount) throw new BadRequestException('The term is outside the programme');
        const min = Number(v.minChoose ?? 1);
        const max = Number(v.maxChoose ?? 1);
        if (min > max) throw new BadRequestException('The minimum to choose cannot exceed the maximum');
        if (v.minCredits != null && v.maxCredits != null && Number(v.minCredits) > Number(v.maxCredits)) throw new BadRequestException('Minimum credits cannot exceed maximum credits');
        const [dup] = await ctx.tx.select({ id: b.id }).from(b).where(and(eq(b.programId, prog.id), eq(b.term, Number(v.term)), sql`lower(${b.name}) = ${lc(String(v.name))}`));
        if (dup) throw new ConflictException('This term already has a basket with this name');
        const [row] = await ctx.tx
          .insert(b)
          .values({ tenantId: ctx.p.tenantId, programId: prog.id, term: Number(v.term), name: String(v.name), kind: String(v.kind), minChoose: min, maxChoose: max, minCredits: (v.minCredits as number | null) ?? null, maxCredits: (v.maxCredits as number | null) ?? null, notes: String(v.notes ?? '') })
          .returning({ id: b.id });
        return row.id;
      },
      order: { column: b.sortOrder, scope: [b.programId, b.term] },
      duplicate: async (ctx, row) => ({ name: await copyName(ctx.tx, b, b.name, String(row.name), and(eq(b.programId, String(row.program_id)), eq(b.term, Number(row.term)))) }),
      columns: [
        { key: 'name', header: 'Basket' },
        { key: 'programName', header: 'Programme' },
        { key: 'term', header: 'Term' },
        { key: 'kind', header: 'Kind', value: (r) => labelOf(BASKET_KINDS, r.kind) },
        { key: 'minChoose', header: 'Choose at least' },
        { key: 'maxChoose', header: 'Choose at most' },
        { key: 'minCredits', header: 'Minimum credits' },
        { key: 'maxCredits', header: 'Maximum credits' },
        { key: 'members', header: 'Courses' },
      ],
      import: {
        columns: [
          { key: 'program', header: 'Programme', required: true, example: 'BSc', options: async (ctx) => (await programOptions(ctx)).map((o) => o.label) },
          { key: 'term', header: 'Term', required: true, example: '5' },
          { key: 'name', header: 'Basket', required: true, example: 'Discipline elective I' },
          { key: 'kind', header: 'Kind', required: true, help: BASKET_KINDS.map((k) => k.value).join(', '), example: 'elective', options: BASKET_KINDS.map((k) => k.value) },
          { key: 'min_choose', header: 'Choose at least', example: '1' },
          { key: 'max_choose', header: 'Choose at most', example: '1' },
          { key: 'min_credits', header: 'Minimum credits' },
          { key: 'max_credits', header: 'Maximum credits' },
          { key: 'subjects', header: 'Course codes', help: 'Comma-separated codes of the programme', example: 'BSC-5.3, BSC-5.4' },
        ],
        key: ['program', 'term', 'name'],
        exists: async (ctx, r) => {
          const [p] = await ctx.tx.select({ id: programs.id }).from(programs).where(sql`lower(${programs.name}) = ${lc(r.get('program'))}`).limit(1);
          if (!p || !/^\d+$/.test(r.get('term'))) return false;
          return !!(await ctx.tx.select({ id: b.id }).from(b).where(and(eq(b.programId, p.id), eq(b.term, Number(r.get('term'))), sql`lower(${b.name}) = ${lc(r.get('name'))}`)).limit(1))[0];
        },
        run: async (ctx, rows) =>
          eachRow(ctx.tx, rows, async (tx, r) => {
            const c = { tx, p: ctx.p };
            const prog = await programByName(c, required(r, 'program'));
            const term = int(required(r, 'term'), 1, prog.termCount, 'The term is outside the programme');
            const name = required(r, 'name');
            const kind = lc(required(r, 'kind'));
            if (!BASKET_KINDS.some((k) => k.value === kind)) fail('Unknown kind', kind);
            const min = r.get('min_choose') ? int(r.get('min_choose'), 0, 20) : 1;
            const max = r.get('max_choose') ? int(r.get('max_choose'), 1, 20) : Math.max(1, min);
            if (min > max) fail('The minimum to choose cannot exceed the maximum', `${min} ${max}`);
            const num = (k: string) => (r.get(k) ? (Number.isFinite(Number(r.get(k))) ? Number(r.get(k)) : fail('Not a number', r.get(k))) : null);
            const codes = r.get('subjects') ? r.get('subjects').split(',').map((x) => x.trim()).filter(Boolean) : [];
            const subjectIds: string[] = [];
            for (const code of codes) subjectIds.push((await subjectByCode(c, code, prog.id)).id);
            const [found] = await tx.select().from(b).where(and(eq(b.programId, prog.id), eq(b.term, term), sql`lower(${b.name}) = ${lc(name)}`)).limit(1);
            const values = { kind, minChoose: min, maxChoose: max, minCredits: num('min_credits'), maxCredits: num('max_credits') };
            const id = found ? found.id : (await tx.insert(b).values({ tenantId: ctx.p.tenantId, programId: prog.id, term, name, sortOrder: 1_000_000, ...values }).returning({ id: b.id }))[0].id;
            if (found) await tx.update(b).set(values).where(eq(b.id, id));
            if (codes.length) {
              await tx.delete(electiveBasketSubjects).where(eq(electiveBasketSubjects.basketId, id));
              await tx.insert(electiveBasketSubjects).values(subjectIds.map((subjectId) => ({ tenantId: ctx.p.tenantId, basketId: id, subjectId }))).onConflictDoNothing();
            }
            return outcome(!found, !!found, [prog.name, String(term), name]);
          }),
      },
    };
  }

  // ---- prerequisites and co-requisites --------------------------------------------------------------

  private requisites(): RecordEntity {
    const q = subjectRequisites;
    const req = sql.raw('rq');
    const reqCode = sql<string>`(select ${req}.code from subjects ${req} where ${req}.id = ${q.requiresSubjectId})`;
    const reqName = sql<string>`(select ${req}.name from subjects ${req} where ${req}.id = ${q.requiresSubjectId})`;
    const assertNoCycle = async (ctx: KitCtx, subjectId: string, requiresId: string, ignore?: string) => {
      if (subjectId === requiresId) throw new BadRequestException('A course cannot require itself');
      const { rows } = await ctx.tx.execute<{ hit: boolean }>(sql`
        with recursive chain(id) as (
          select requires_subject_id from subject_requisites where subject_id = ${requiresId}::uuid and (${ignore ?? null}::uuid is null or id <> ${ignore ?? null}::uuid)
          union select r.requires_subject_id from subject_requisites r join chain c on r.subject_id = c.id
        ) select exists (select 1 from chain where id = ${subjectId}::uuid) as hit`);
      if (rows[0]?.hit) throw new ConflictException('This would make the courses require each other');
    };
    return {
      key: 'course-requisites',
      module: 'academics',
      table: q,
      subjectType: 'subject_requisite',
      roles: { read: READ, write: HEADS },
      label: (r) => `${r.code ?? ''} → ${r.requiresCode ?? ''}`,
      list: {
        select: { id: q.id, subjectId: q.subjectId, code: subjects.code, name: subjects.name, programName: programs.name, term: subjects.term, requiresSubjectId: q.requiresSubjectId, requiresCode: reqCode, requiresName: reqName, kind: q.kind, note: q.note },
        joins: (x) => x.innerJoin(subjects, eq(subjects.id, q.subjectId)).innerJoin(programs, eq(programs.id, subjects.programId)),
        search: [subjects.code, subjects.name, reqCode, reqName],
        filters: {
          programme: { label: 'Programme', options: programOptions, where: (v) => uuidEq(subjects.programId, v) },
          kind: { label: 'Kind', options: REQUISITE_KINDS, where: (v) => (REQUISITE_KINDS.some((o) => o.value === v) ? eq(q.kind, v) : undefined) },
        },
        sorts: { course: subjects.code, requires: reqCode, kind: q.kind, programme: programs.name },
        defaultSort: { id: 'course', dir: 'asc' },
      },
      fields: {
        subjectId: { label: 'Course', type: 'select', schema: Ref, column: q.subjectId, options: subjectOptions, required: true, edit: false },
        requiresSubjectId: {
          label: 'Requires',
          type: 'select',
          schema: Ref,
          options: subjectOptions,
          required: true,
          apply: async (ctx, id, v) => {
            const [cur] = await ctx.tx.select().from(q).where(eq(q.id, id));
            await assertNoCycle(ctx, cur.subjectId, String(v), id);
            await ctx.tx.update(q).set({ requiresSubjectId: String(v) }).where(eq(q.id, id));
          },
        },
        kind: { label: 'Kind', type: 'select', schema: Text(20), column: q.kind, options: REQUISITE_KINDS, required: true, bulk: true },
        note: { label: 'Note', type: 'text', schema: OptionalText(300).transform((v) => v ?? ''), column: q.note, help: 'For example: a minimum grade' },
      },
      create: async (ctx, v) => {
        const subjectId = String(v.subjectId);
        const requiresId = String(v.requiresSubjectId);
        await assertNoCycle(ctx, subjectId, requiresId);
        const [dup] = await ctx.tx.select({ id: q.id }).from(q).where(and(eq(q.subjectId, subjectId), eq(q.requiresSubjectId, requiresId)));
        if (dup) throw new ConflictException('This requirement is already there');
        const [row] = await ctx.tx.insert(q).values({ tenantId: ctx.p.tenantId, subjectId, requiresSubjectId: requiresId, kind: String(v.kind), note: String(v.note ?? '') }).returning({ id: q.id });
        return row.id;
      },
      columns: [
        { key: 'code', header: 'Course code' },
        { key: 'name', header: 'Course' },
        { key: 'kind', header: 'Kind', value: (r) => labelOf(REQUISITE_KINDS, r.kind) },
        { key: 'requiresCode', header: 'Requires code' },
        { key: 'requiresName', header: 'Requires' },
        { key: 'programName', header: 'Programme' },
        { key: 'note', header: 'Note' },
      ],
      import: {
        columns: [
          { key: 'program', header: 'Programme', required: true, example: 'BSc', options: async (ctx) => (await programOptions(ctx)).map((o) => o.label) },
          { key: 'course', header: 'Course code', required: true, example: 'BSC-5.3' },
          { key: 'requires', header: 'Requires code', required: true, help: 'A course of the same programme', example: 'BSC-3.3' },
          { key: 'kind', header: 'Kind', required: true, help: 'prerequisite or corequisite', example: 'prerequisite', options: ['prerequisite', 'corequisite'] },
          { key: 'note', header: 'Note' },
        ],
        key: ['program', 'course', 'requires'],
        exists: async (ctx, r) => {
          const [p] = await ctx.tx.select({ id: programs.id }).from(programs).where(sql`lower(${programs.name}) = ${lc(r.get('program'))}`).limit(1);
          if (!p) return false;
          const [a] = await ctx.tx.select({ id: subjects.id }).from(subjects).where(and(eq(subjects.programId, p.id), sql`lower(${subjects.code}) = ${lc(r.get('course'))}`));
          const [bb] = await ctx.tx.select({ id: subjects.id }).from(subjects).where(and(eq(subjects.programId, p.id), sql`lower(${subjects.code}) = ${lc(r.get('requires'))}`));
          return !!a && !!bb && !!(await ctx.tx.select({ id: q.id }).from(q).where(and(eq(q.subjectId, a.id), eq(q.requiresSubjectId, bb.id))))[0];
        },
        run: async (ctx, rows) =>
          eachRow(ctx.tx, rows, async (tx, r) => {
            const c = { tx, p: ctx.p };
            const prog = await programByName(c, required(r, 'program'));
            const a = await subjectByCode(c, required(r, 'course'), prog.id);
            const bb = await subjectByCode(c, required(r, 'requires'), prog.id);
            const kind = lc(required(r, 'kind'));
            if (kind !== 'prerequisite' && kind !== 'corequisite') fail('Use prerequisite or corequisite', kind);
            const [found] = await tx.select().from(q).where(and(eq(q.subjectId, a.id), eq(q.requiresSubjectId, bb.id)));
            if (found) {
              const changed = found.kind !== kind || found.note !== r.get('note');
              if (changed) await tx.update(q).set({ kind, note: r.get('note') }).where(eq(q.id, found.id));
              return outcome(false, changed, [a.code, bb.code]);
            }
            await assertNoCycle(c, a.id, bb.id).catch((e: Error) => fail(e.message, `${a.code} ${bb.code}`));
            await tx.insert(q).values({ tenantId: ctx.p.tenantId, subjectId: a.id, requiresSubjectId: bb.id, kind, note: r.get('note') });
            return outcome(true, false, [a.code, bb.code]);
          }),
      },
    };
  }

  // ---- credit transfers -----------------------------------------------------------------------------

  /**
   * One register for credits earned elsewhere, shared by academic planning and the exam cell (results desk): ABC,
   * SWAYAM, NPTEL, other MOOCs and courses at another institution (transfer, lateral entry). A transfer is a request;
   * once approved it counts as passing the mapped course in course registration, its credits (with the grade point,
   * when given) count in the CGPA, and it leads the transcript. Approving or revoking one dates issued transcripts.
   */
  private transfers(): RecordEntity {
    const t = creditTransfers;
    const mapped = sql<string | null>`(select s.code || ' ' || s.name from subjects s where s.id = ${t.mappedSubjectId})`;
    const mappedCode = sql<string | null>`(select s.code from subjects s where s.id = ${t.mappedSubjectId})`;
    /** A course already passed here, or already counted by another approved transfer, cannot be brought in again. */
    const assertNotEarned = async (tx: KitCtx['tx'], studentId: string, subjectId: string | null, exceptId?: string) => {
      if (!subjectId) return;
      const [here] = await tx
        .select({ s: examResultLines.subjectId })
        .from(examResultLines)
        .innerJoin(examResults, eq(examResults.id, examResultLines.resultId))
        .where(and(eq(examResults.studentId, studentId), eq(examResultLines.subjectId, subjectId), eq(examResultLines.passed, true)))
        .limit(1);
      if (here) throw new ConflictException('The student has already passed this course here');
      const [dup] = await tx
        .select({ id: t.id })
        .from(t)
        .where(and(eq(t.studentId, studentId), eq(t.mappedSubjectId, subjectId), eq(t.status, 'approved'), exceptId ? ne(t.id, exceptId) : undefined))
        .limit(1);
      if (dup) throw new ConflictException('Another approved transfer already counts for this course');
    };
    const pending = (column: keyof typeof creditTransfers.$inferInsert) => async (ctx: KitCtx, id: string, value: unknown) => {
      const [cur] = await ctx.tx.select({ status: t.status, studentId: t.studentId }).from(t).where(eq(t.id, id));
      if (!cur) throw new NotFoundException('Credit transfer not found');
      if (cur.status !== 'pending') throw new ConflictException('Only a transfer awaiting a decision can be changed');
      if (column === 'mappedSubjectId') await assertNotEarned(ctx.tx, cur.studentId, (value as string | null) ?? null, id);
      await ctx.tx.update(t).set({ [column]: column === 'grade' ? String(value ?? '').trim().toUpperCase() : value }).where(eq(t.id, id));
    };
    const decide = async (ctx: KitCtx, id: string, status: 'approved' | 'rejected' | 'revoked', note: string | null) => {
      const [cur] = await ctx.tx.select().from(t).where(eq(t.id, id)).for('update');
      if (!cur) throw new NotFoundException('Credit transfer not found');
      const from = status === 'revoked' ? 'approved' : 'pending';
      if (cur.status !== from) throw new ConflictException(status === 'revoked' ? 'Only an approved transfer can be revoked' : `This transfer is already ${cur.status}`);
      if (status !== 'approved' && !note) throw new BadRequestException('Give a reason');
      if (status === 'approved') await assertNotEarned(ctx.tx, cur.studentId, cur.mappedSubjectId, id);
      await ctx.tx.update(t).set({ status, decidedBy: ctx.p.userId, decidedAt: this.clock.now(), decisionNote: note }).where(eq(t.id, id));
      await audit(ctx.tx, { tenantId: ctx.p.tenantId, actorType: 'user', actorId: ctx.p.userId, action: `credit_transfer.${status}`, subjectType: 'credit_transfer', subjectId: id, changes: { status: { before: from, after: status } }, data: { note } });
      // An approved credit counts in the CGPA and the transcript, so issued transcripts no longer match.
      if (status !== 'rejected') await supersedeDocuments(ctx.tx, cur.studentId, 'Transferred credits changed');
    };
    return {
      key: 'credit-transfers',
      module: 'academics',
      table: t,
      subjectType: 'credit_transfer',
      roles: { read: READ, write: [...HEADS, 'exam_controller'] },
      label: (r) => `${r.rollNo ?? ''} ${r.courseTitle ?? r.course_title ?? ''}`.trim(),
      list: {
        select: {
          id: t.id,
          studentId: t.studentId,
          rollNo: students.rollNo,
          fullName: students.fullName,
          section: sections.displayName,
          source: t.source,
          courseTitle: t.courseTitle,
          provider: t.provider,
          externalRef: t.externalRef,
          credits: t.credits,
          grade: t.grade,
          gradePoint: t.gradePoint,
          completedOn: t.completedOn,
          term: t.term,
          mappedSubjectId: t.mappedSubjectId,
          mapped,
          mappedCode,
          status: t.status,
          decisionNote: t.decisionNote,
          note: t.note,
          createdAt: t.createdAt,
        },
        joins: (q) => q.innerJoin(students, eq(students.id, t.studentId)).innerJoin(sections, eq(sections.id, students.sectionId)),
        search: [students.fullName, students.rollNo, t.courseTitle, t.provider, t.externalRef],
        filters: {
          status: { label: 'Status', options: DECISION, where: (v) => (DECISION.some((o) => o.value === v) ? eq(t.status, v) : undefined) },
          source: { label: 'Source', options: TRANSFER_SOURCES, where: (v) => (TRANSFER_SOURCES.some((o) => o.value === v) ? eq(t.source, v) : undefined) },
          institution: { label: 'Offered by', options: async (ctx) => (await ctx.tx.selectDistinct({ i: t.provider }).from(t).where(ne(t.provider, '')).orderBy(asc(t.provider))).map((r) => ({ value: r.i, label: r.i })), where: (v) => eq(t.provider, v) },
          equivalent: { label: 'Equivalent course', options: [{ value: 'yes', label: 'Mapped to a course' }, { value: 'no', label: 'Credit only' }], where: (v) => (v === 'yes' ? sql`${t.mappedSubjectId} is not null` : v === 'no' ? sql`${t.mappedSubjectId} is null` : undefined) },
          class: { label: 'Class', options: sectionOptions, where: (v) => uuidEq(students.sectionId, v) },
        },
        sorts: { student: students.fullName, course: t.courseTitle, institution: t.provider, term: t.term, credits: t.credits, completed: t.completedOn, status: t.status, created: t.createdAt },
        defaultSort: { id: 'created', dir: 'desc' },
        tiebreak: [t.courseTitle],
        scope: (ctx) => (isHeadOrAdmin(ctx) ? undefined : sql`exists (select 1 from timetable_slots ts where ts.section_id = ${students.sectionId} and ts.teacher_id = ${ctx.p.userId}::uuid)`),
      },
      fields: {
        studentId: { label: 'Student', type: 'select', schema: Ref, column: t.studentId, options: studentOptions, required: true, edit: false },
        source: { label: 'Source', type: 'select', schema: Text(20), options: TRANSFER_SOURCES, required: true, apply: pending('source') },
        courseTitle: { label: 'Course', type: 'text', schema: Text(200), required: true, apply: pending('courseTitle'), help: 'Code and name of the course as on the certificate or marks card' },
        provider: { label: 'Offered by', type: 'text', schema: OptionalText(200).transform((v) => v ?? ''), apply: pending('provider'), help: 'The university, institution or MOOC platform' },
        externalRef: { label: 'Certificate or ABC reference', type: 'text', schema: OptionalText(120).transform((v) => v ?? ''), apply: pending('externalRef') },
        credits: { label: 'Credits', type: 'number', schema: Decimal(0.5, 40), required: true, apply: pending('credits') },
        grade: { label: 'Grade', type: 'text', schema: OptionalText(20).transform((v) => v ?? ''), apply: pending('grade') },
        gradePoint: { label: 'Grade point', type: 'number', schema: OptionalDecimal(0, 10), apply: pending('gradePoint'), help: 'On the 10-point scale used here; leave empty for a pass-only credit, which stays out of the CGPA' },
        completedOn: { label: 'Completed on', type: 'date', schema: DateText, apply: pending('completedOn') },
        term: { label: 'Counts in term', type: 'number', schema: OptionalInt(1, 20), apply: pending('term') },
        mappedSubjectId: { label: 'Counts as course', type: 'select', schema: OptionalRef, options: subjectOptions, apply: pending('mappedSubjectId'), help: 'The programme course it replaces; leave empty to count it as credit only' },
        note: { label: 'Note', type: 'textarea', schema: OptionalText(300), column: t.note, help: 'E.g. the order number of the equivalence committee' },
      },
      create: async (ctx, v) => {
        const studentId = String(v.studentId);
        const mappedSubjectId = (v.mappedSubjectId as string | null) ?? null;
        await assertNotEarned(ctx.tx, studentId, mappedSubjectId);
        const [row] = await ctx.tx
          .insert(t)
          .values({
            tenantId: ctx.p.tenantId,
            studentId,
            source: String(v.source),
            courseTitle: String(v.courseTitle),
            provider: String(v.provider ?? ''),
            externalRef: String(v.externalRef ?? ''),
            credits: Number(v.credits),
            grade: String(v.grade ?? '').trim().toUpperCase(),
            gradePoint: (v.gradePoint as number | null) ?? null,
            completedOn: (v.completedOn as string | null) ?? null,
            term: (v.term as number | null) ?? null,
            mappedSubjectId,
            note: (v.note as string | null) ?? null,
            createdBy: ctx.p.userId,
          })
          .returning({ id: t.id });
        return row.id;
      },
      remove: { guard: async (ctx, id) => ((await ctx.tx.select({ s: t.status }).from(t).where(eq(t.id, id)))[0]?.s === 'approved' ? 'An approved transfer counts towards results; revoke it instead' : null) },
      actions: {
        approve: { label: 'Approve', inputs: [{ key: 'note', label: 'Note', type: 'textarea' }], params: z.object({ note: z.string().trim().max(500).optional() }), apply: (ctx, id, p) => decide(ctx, id, 'approved', (p as { note?: string }).note || null) },
        reject: { label: 'Decline', tone: 'danger', inputs: [{ key: 'note', label: 'Reason', type: 'textarea', required: true }], params: z.object({ note: z.string().trim().min(3).max(500) }), apply: (ctx, id, p) => decide(ctx, id, 'rejected', (p as { note: string }).note) },
        revoke: { label: 'Revoke', tone: 'danger', inputs: [{ key: 'note', label: 'Reason', type: 'textarea', required: true }], params: z.object({ note: z.string().trim().min(3).max(500) }), apply: (ctx, id, p) => decide(ctx, id, 'revoked', (p as { note: string }).note) },
      },
      columns: [
        { key: 'rollNo', header: 'Roll no' },
        { key: 'fullName', header: 'Student' },
        { key: 'section', header: 'Class' },
        { key: 'source', header: 'Source', value: (r) => labelOf(TRANSFER_SOURCES, r.source) },
        { key: 'courseTitle', header: 'Course' },
        { key: 'provider', header: 'Offered by' },
        { key: 'externalRef', header: 'Reference' },
        { key: 'credits', header: 'Credits' },
        { key: 'grade', header: 'Grade' },
        { key: 'gradePoint', header: 'Grade point' },
        { key: 'completedOn', header: 'Completed on' },
        { key: 'term', header: 'Term' },
        { key: 'mapped', header: 'Counts as' },
        { key: 'status', header: 'Status', value: (r) => labelOf(DECISION, r.status) },
        { key: 'note', header: 'Note' },
      ],
      import: {
        columns: [
          { key: 'roll_no', header: 'Roll number', required: true, example: 'BSC1A001' },
          { key: 'source', header: 'Source', required: true, help: TRANSFER_SOURCES.map((s) => s.value).join(', '), example: 'nptel', options: TRANSFER_SOURCES.map((s) => s.value) },
          { key: 'course', header: 'Course', required: true, example: 'Data Science for Engineers' },
          { key: 'provider', header: 'Offered by', example: 'IIT Madras' },
          { key: 'reference', header: 'Certificate or ABC reference', example: 'NPTEL24CS12S' },
          { key: 'credits', header: 'Credits', required: true, example: '3' },
          { key: 'grade', header: 'Grade', example: 'Elite' },
          { key: 'grade_point', header: 'Grade point', help: 'On the 10-point scale here; empty for a pass-only credit', example: '8' },
          { key: 'term', header: 'Counts in term', help: 'A whole number from 1 to 20', example: '2' },
          { key: 'completed_on', header: 'Completed on', help: 'YYYY-MM-DD', example: '2026-10-20' },
          { key: 'course_code', header: 'Counts as course code', help: "Optional: a course of the student's programme" },
          { key: 'note', header: 'Note', help: 'E.g. the equivalence order number', example: 'EQ/2026/14' },
        ],
        key: ['roll_no', 'source', 'course'],
        exists: async (ctx, r) => {
          const [st] = await ctx.tx.select({ id: students.id }).from(students).where(sql`lower(${students.rollNo}) = ${lc(r.get('roll_no'))}`).limit(1);
          return !!st && !!(await ctx.tx.select({ id: t.id }).from(t).where(and(eq(t.studentId, st.id), eq(t.source, lc(r.get('source'))), sql`lower(${t.courseTitle}) = ${lc(r.get('course'))}`)).limit(1))[0];
        },
        run: async (ctx, rows) =>
          eachRow(ctx.tx, rows, async (tx, r) => {
            const c = { tx, p: ctx.p };
            const roll = required(r, 'roll_no');
            const [st] = await tx.select({ id: students.id, programId: sections.programId }).from(students).innerJoin(sections, eq(sections.id, students.sectionId)).where(sql`lower(${students.rollNo}) = ${lc(roll)}`).limit(1);
            if (!st) fail('No student with this roll number', roll);
            const source = lc(required(r, 'source'));
            if (!TRANSFER_SOURCES.some((s) => s.value === source)) fail('Unknown source', source);
            const credits = Decimal(0.5, 40).safeParse(required(r, 'credits'));
            if (!credits.success) fail('Credits must be a number from 0.5 to 40 with at most one decimal place', r.get('credits'));
            const gp = r.get('grade_point') ? z.coerce.number().min(0).max(10).safeParse(r.get('grade_point')) : null;
            if (gp && !gp.success) fail('A grade point is from 0 to 10', r.get('grade_point'));
            const term = r.get('term') ? int(r.get('term'), 1, 20, 'The term is a whole number from 1 to 20') : null;
            const completedOn = r.get('completed_on') || null;
            if (completedOn && !/^\d{4}-\d{2}-\d{2}$/.test(completedOn)) fail('Give dates as YYYY-MM-DD', completedOn);
            const mappedSubjectId = r.get('course_code') ? (await subjectByCode(c, r.get('course_code'), st!.programId)).id : null;
            const course = required(r, 'course').slice(0, 200);
            const values = { provider: r.get('provider').slice(0, 200), externalRef: r.get('reference').slice(0, 120), credits: credits.data!, grade: r.get('grade').toUpperCase().slice(0, 20), gradePoint: gp?.data ?? null, term, completedOn, mappedSubjectId, note: r.get('note') || null };
            const [found] = await tx.select().from(t).where(and(eq(t.studentId, st!.id), eq(t.source, source), sql`lower(${t.courseTitle}) = ${lc(course)}`)).limit(1);
            if (found) {
              if (found.status !== 'pending') return outcome(false, false, [roll, course]);
              await assertNotEarned(tx, st!.id, mappedSubjectId, found.id);
              await tx.update(t).set(values).where(eq(t.id, found.id));
              return outcome(false, true, [roll, course]);
            }
            await assertNotEarned(tx, st!.id, mappedSubjectId);
            await tx.insert(t).values({ tenantId: ctx.p.tenantId, studentId: st!.id, source, courseTitle: course, createdBy: ctx.p.userId, ...values });
            return outcome(true, false, [roll, course]);
          }),
      },
    };
  }

  // ---- faculty allocation ---------------------------------------------------------------------------

  private allocations(): RecordEntity {
    const a = facultyAllocations;
    const periods = sql<number>`(select count(*)::int from timetable_slots ts where ts.section_id = ${a.sectionId} and ts.subject_id = ${a.subjectId} and ts.teacher_id = ${a.teacherId} and ts.archived_at is null and (${a.batch} is null or ts.batch = ${a.batch}))`;
    const active = sql<boolean>`(${a.toDate} is null or ${a.toDate} >= current_date)`;
    return {
      key: 'faculty-allocations',
      module: 'academics',
      table: a,
      subjectType: 'faculty_allocation',
      roles: { read: READ, write: HEADS },
      label: (r) => `${r.subjectCode ?? ''} ${r.section ?? ''} ${r.teacher ?? ''}`.trim() || 'Allocation',
      list: {
        select: {
          id: a.id,
          sectionId: a.sectionId,
          section: sections.displayName,
          subjectId: a.subjectId,
          subjectCode: subjects.code,
          subject: subjects.name,
          teacherId: a.teacherId,
          teacher: users.fullName,
          role: a.role,
          batch: a.batch,
          hoursPerWeek: a.hoursPerWeek,
          fromDate: a.fromDate,
          toDate: a.toDate,
          note: a.note,
          active,
          periods,
        },
        joins: (q) => q.innerJoin(sections, eq(sections.id, a.sectionId)).innerJoin(subjects, eq(subjects.id, a.subjectId)).innerJoin(users, eq(users.id, a.teacherId)),
        search: [sections.displayName, subjects.code, subjects.name, users.fullName],
        filters: {
          class: { label: 'Class', options: sectionOptions, where: (v) => uuidEq(a.sectionId, v) },
          teacher: { label: 'Teacher', options: teacherOptions, where: (v) => uuidEq(a.teacherId, v) },
          department: { label: 'Department', options: departmentOptions, where: (v) => uuidEq(subjects.departmentId, v) },
          active: { label: 'Current', options: [{ value: 'yes', label: 'Current' }, { value: 'no', label: 'Ended' }], where: (v) => (v === 'yes' ? active : v === 'no' ? sql`not ${active}` : undefined) },
        },
        sorts: { class: sections.displayName, subject: subjects.code, teacher: users.fullName, hours: a.hoursPerWeek, from: a.fromDate },
        defaultSort: { id: 'class', dir: 'asc' },
        tiebreak: [subjects.code],
        scope: (ctx) => (isAdmin(ctx) || ctx.p.roles.includes('exam_controller') ? undefined : ctx.p.roles.includes('hod') ? or(headedSubjects(ctx, sql`${a.subjectId}`), eq(a.teacherId, ctx.p.userId)) : eq(a.teacherId, ctx.p.userId)),
      },
      fields: {
        sectionId: { label: 'Class', type: 'select', schema: Ref, column: a.sectionId, options: sectionOptions, required: true, edit: false },
        subjectId: { label: 'Course', type: 'select', schema: Ref, column: a.subjectId, options: subjectOptions, required: true, edit: false },
        teacherId: { label: 'Teacher', type: 'select', schema: Ref, column: a.teacherId, options: teacherOptions, required: true, edit: false, help: 'To change the teacher mid-semester, use Hand over: the history stays' },
        role: { label: 'Role', type: 'select', schema: Text(20), column: a.role, options: ALLOCATION_ROLES, required: true, bulk: true },
        batch: { label: 'Batch', type: 'text', schema: OptionalText(20), column: a.batch, help: 'A lab or tutorial batch (empty = the whole class)' },
        hoursPerWeek: { label: 'Hours a week', type: 'number', schema: Int(0, 40), column: a.hoursPerWeek, required: true, bulk: true },
        fromDate: { label: 'From', type: 'date', schema: DateText, column: a.fromDate },
        toDate: { label: 'To', type: 'date', schema: DateText, column: a.toDate },
        note: { label: 'Note', type: 'text', schema: OptionalText(300).transform((v) => v ?? ''), column: a.note },
      },
      create: async (ctx, v) => {
        const { section } = await assertSubjectInClass(ctx, String(v.sectionId), String(v.subjectId));
        await assertHeadsSubject(ctx, String(v.subjectId));
        if (v.fromDate && v.toDate && String(v.fromDate) > String(v.toDate)) throw new BadRequestException('The allocation cannot end before it starts');
        const [dup] = await ctx.tx
          .select({ id: a.id })
          .from(a)
          .where(and(eq(a.sectionId, section.id), eq(a.subjectId, String(v.subjectId)), eq(a.teacherId, String(v.teacherId)), eq(a.role, String(v.role)), v.batch ? eq(a.batch, String(v.batch)) : isNull(a.batch), sql`(${a.toDate} is null or ${a.toDate} >= current_date)`));
        if (dup) throw new ConflictException('This teacher already has this allocation');
        const [row] = await ctx.tx
          .insert(a)
          .values({ tenantId: ctx.p.tenantId, academicYearId: section.academicYearId, sectionId: section.id, subjectId: String(v.subjectId), teacherId: String(v.teacherId), role: String(v.role), batch: (v.batch as string | null) ?? null, hoursPerWeek: Number(v.hoursPerWeek ?? 0), fromDate: (v.fromDate as string | null) ?? null, toDate: (v.toDate as string | null) ?? null, note: String(v.note ?? '') })
          .returning({ id: a.id });
        return row.id;
      },
      move: {
        label: 'Hand over to',
        options: teacherOptions,
        reason: true,
        // Ends this allocation yesterday, starts the same for the new teacher today, and moves the class's future
        // periods (the old ones are kept, archived, with their attendance and plans).
        apply: async (ctx, id, to, reason) => {
          const [cur] = await ctx.tx.select().from(a).where(eq(a.id, id));
          if (!cur) throw new NotFoundException('Allocation not found');
          await assertHeadsSubject(ctx, cur.subjectId);
          if (cur.teacherId === to) throw new BadRequestException('This teacher already has it');
          if (cur.toDate && cur.toDate < (await this.today(ctx))) throw new ConflictException('This allocation has ended');
          const today = await this.today(ctx);
          const [teacher] = (await teacherOptions(ctx)).filter((o) => o.value === to);
          if (!teacher) throw new BadRequestException('Choose a member of the teaching staff');
          const end = cur.fromDate && cur.fromDate >= today ? cur.fromDate : addDays(today, -1);
          await ctx.tx.update(a).set({ toDate: end }).where(eq(a.id, id));
          const [next] = await ctx.tx
            .insert(a)
            .values({ tenantId: ctx.p.tenantId, academicYearId: cur.academicYearId, sectionId: cur.sectionId, subjectId: cur.subjectId, teacherId: to, role: cur.role, batch: cur.batch, hoursPerWeek: cur.hoursPerWeek, fromDate: today, toDate: cur.toDate, note: reason ?? '' })
            .returning({ id: a.id });
          const slots = await ctx.tx
            .select()
            .from(timetableSlots)
            .where(and(eq(timetableSlots.sectionId, cur.sectionId), eq(timetableSlots.subjectId, cur.subjectId), eq(timetableSlots.teacherId, cur.teacherId), isNull(timetableSlots.archivedAt), cur.batch ? eq(timetableSlots.batch, cur.batch) : undefined));
          for (const s of slots) {
            const values = await validateSlot(ctx.tx, { sectionId: s.sectionId, subjectId: s.subjectId, teacherId: to, roomId: s.roomId, dayOfWeek: s.dayOfWeek, startsAt: s.startsAt.slice(0, 5), endsAt: s.endsAt.slice(0, 5), batch: s.batch, combinedSectionIds: s.combinedSectionIds }, s.id);
            await ctx.tx.update(timetableSlots).set({ archivedAt: new Date() }).where(eq(timetableSlots.id, s.id));
            const [created] = await ctx.tx.insert(timetableSlots).values({ tenantId: ctx.p.tenantId, ...values }).returning({ id: timetableSlots.id });
            await audit(ctx.tx, { tenantId: ctx.p.tenantId, actorType: 'user', actorId: ctx.p.userId, action: 'timetable.slot_changed', subjectType: 'timetable_slot', subjectId: created.id, data: { replaces: s.id, handover: id } });
          }
          await audit(ctx.tx, { tenantId: ctx.p.tenantId, actorType: 'user', actorId: ctx.p.userId, action: 'faculty_allocation.handed_over', subjectType: 'faculty_allocation', subjectId: id, changes: { toDate: { before: cur.toDate, after: end } }, data: { to: teacher.label, next: next.id, periods: slots.length, reason } });
        },
      },
      columns: [
        { key: 'section', header: 'Class' },
        { key: 'subjectCode', header: 'Course code' },
        { key: 'subject', header: 'Course' },
        { key: 'teacher', header: 'Teacher' },
        { key: 'role', header: 'Role', value: (r) => labelOf(ALLOCATION_ROLES, r.role) },
        { key: 'batch', header: 'Batch' },
        { key: 'hoursPerWeek', header: 'Hours a week' },
        { key: 'periods', header: 'Periods in timetable' },
        { key: 'fromDate', header: 'From' },
        { key: 'toDate', header: 'To' },
      ],
      import: {
        columns: [
          { key: 'class', header: 'Class', required: true, example: 'BSc Sem 1 A', options: async (ctx) => (await sectionOptions(ctx)).map((o) => o.label) },
          { key: 'course', header: 'Course code', required: true, example: 'BSC-1.1' },
          { key: 'teacher', header: 'Teacher', required: true, help: 'Email or full name', example: 'asha@college.edu.in' },
          { key: 'role', header: 'Role', help: ALLOCATION_ROLES.map((x) => x.value).join(', '), example: 'primary', options: ALLOCATION_ROLES.map((x) => x.value) },
          { key: 'batch', header: 'Batch', help: 'Optional: a lab or tutorial batch' },
          { key: 'hours', header: 'Hours a week', required: true, example: '4' },
          { key: 'from', header: 'From', help: 'YYYY-MM-DD' },
          { key: 'to', header: 'To', help: 'YYYY-MM-DD' },
        ],
        key: ['class', 'course', 'teacher', 'role', 'batch'],
        exists: async () => false,
        run: async (ctx, rows) =>
          eachRow(ctx.tx, rows, async (tx, r) => {
            const c = { tx, p: ctx.p };
            const section = await sectionByName(c, required(r, 'class'));
            const subject = await subjectByCode(c, required(r, 'course'), section.programId);
            if (subject.term !== section.term) fail('That subject is not taught in this class', subject.code);
            const teacherId = await teacherByName(c, required(r, 'teacher'));
            const role = lc(r.get('role') || 'primary');
            if (!ALLOCATION_ROLES.some((x) => x.value === role)) fail('Unknown role', role);
            const hours = int(required(r, 'hours'), 0, 40);
            for (const k of ['from', 'to']) if (r.get(k) && !/^\d{4}-\d{2}-\d{2}$/.test(r.get(k))) fail('Give dates as YYYY-MM-DD', r.get(k));
            const batch = r.get('batch') || null;
            const [found] = await tx
              .select()
              .from(a)
              .where(and(eq(a.sectionId, section.id), eq(a.subjectId, subject.id), eq(a.teacherId, teacherId), eq(a.role, role), batch ? eq(a.batch, batch) : isNull(a.batch)))
              .limit(1);
            const values = { hoursPerWeek: hours, fromDate: r.get('from') || null, toDate: r.get('to') || null };
            if (found) {
              await tx.update(a).set(values).where(eq(a.id, found.id));
              return outcome(false, true, [section.displayName, subject.code]);
            }
            await tx.insert(a).values({ tenantId: ctx.p.tenantId, academicYearId: section.academicYearId, sectionId: section.id, subjectId: subject.id, teacherId, role, batch, ...values });
            return outcome(true, false, [section.displayName, subject.code]);
          }),
      },
    };
  }

  // ---- period structures ----------------------------------------------------------------------------

  private periods(): RecordEntity {
    const p = periodStructures;
    const text = sql<string>`(select coalesce(string_agg((x.p->>'label') || ' ' || (x.p->>'startsAt') || '-' || (x.p->>'endsAt') || case when x.p->>'kind' = 'break' then ' break' else '' end, E'\n' order by x.ord), '') from jsonb_array_elements(${p.periods}) with ordinality as x(p, ord))`;
    const classCount = sql<number>`(select count(*)::int from jsonb_array_elements(${p.periods}) e where e->>'kind' = 'class')`;
    const first = sql<string | null>`(${p.periods}->0->>'startsAt')`;
    const last = sql<string | null>`(${p.periods}->(jsonb_array_length(${p.periods}) - 1)->>'endsAt')`;
    const daysText = sql<string>`array_to_string(${p.days}, ',')`;
    const setDefault = async (ctx: KitCtx, id: string, on: boolean) => {
      if (on) await ctx.tx.update(p).set({ isDefault: false }).where(ne(p.id, id));
      await ctx.tx.update(p).set({ isDefault: on }).where(eq(p.id, id));
    };
    return {
      key: 'period-structures',
      module: 'timetable',
      table: p,
      subjectType: 'period_structure',
      roles: { read: [...READ], write: ADMIN },
      label: (r) => String(r.name),
      list: {
        select: { id: p.id, name: p.name, programId: p.programId, programName: programs.name, days: p.days, daysText, periodsText: text, classCount, first, last, isDefault: p.isDefault, sortOrder: p.sortOrder, periods: p.periods },
        joins: (q) => q.leftJoin(programs, eq(programs.id, p.programId)),
        search: [p.name],
        filters: { programme: { label: 'Programme', options: programOptions, where: (v) => uuidEq(p.programId, v) } },
        sorts: { name: p.name, programme: programs.name },
        defaultSort: { id: 'name', dir: 'asc' },
      },
      fields: {
        name: { label: 'Name', type: 'text', schema: Text(120), column: p.name, required: true, help: 'For example: Regular day, Saturday' },
        programId: { label: 'Programme', type: 'select', schema: OptionalRef, column: p.programId, options: programOptions, help: 'Empty = every programme' },
        days: { label: 'Days', type: 'text', schema: z.string().trim().min(1, 'This value is required').max(60).transform((v, c) => parseDays(v) ?? (c.addIssue({ code: 'custom', message: 'Use days like Mon,Tue,Wed or 1,2,3' }), z.NEVER)), apply: async (ctx, id, v) => void (await ctx.tx.update(p).set({ days: v as number[] }).where(eq(p.id, id))), rowKey: 'daysText', required: true, help: 'Mon,Tue,Wed,Thu,Fri,Sat' },
        periods: {
          label: 'Periods',
          type: 'textarea',
          schema: z.string().trim().min(1, 'This value is required').max(4000).transform((v, c) => {
            const r = parsePeriods(v);
            if (typeof r === 'string') {
              c.addIssue({ code: 'custom', message: r });
              return z.NEVER;
            }
            return r;
          }),
          apply: async (ctx, id, v) => void (await ctx.tx.update(p).set({ periods: v as BellPeriod[] }).where(eq(p.id, id))),
          rowKey: 'periodsText',
          required: true,
          help: 'One per line: "P1 09:00-09:55", "Break 10:50-11:05 break"',
        },
        isDefault: { label: 'Default', type: 'boolean', schema: z.boolean(), apply: (ctx, id, v) => setDefault(ctx, id, v as boolean), help: 'Used where no other structure fits' },
      },
      create: async (ctx, v) => {
        const [dup] = await ctx.tx.select({ id: p.id }).from(p).where(sql`lower(${p.name}) = ${lc(String(v.name))}`);
        if (dup) throw new ConflictException('A period structure with this name exists');
        const [row] = await ctx.tx.insert(p).values({ tenantId: ctx.p.tenantId, name: String(v.name), programId: (v.programId as string | null) ?? null, days: v.days as number[], periods: v.periods as BellPeriod[] }).returning({ id: p.id });
        if (v.isDefault) await setDefault(ctx, row.id, true);
        return row.id;
      },
      order: { column: p.sortOrder },
      duplicate: async (ctx, row) => ({ name: await copyName(ctx.tx, p, p.name, String(row.name)), is_default: false }),
      columns: [
        { key: 'name', header: 'Structure' },
        { key: 'programName', header: 'Programme' },
        { key: 'daysText', header: 'Days', value: (r) => String(r.daysText ?? '').split(',').filter(Boolean).map((d) => WEEKDAYS[Number(d) - 1]).join(', ') },
        { key: 'classCount', header: 'Periods' },
        { key: 'first', header: 'Starts' },
        { key: 'last', header: 'Ends' },
        { key: 'periodsText', header: 'Bell schedule', value: (r) => String(r.periodsText ?? '').replace(/\n/g, '; ') },
        { key: 'isDefault', header: 'Default' },
      ],
      import: {
        columns: [
          { key: 'name', header: 'Structure', required: true, example: 'Regular day' },
          { key: 'program', header: 'Programme', help: 'Optional (empty = every programme)', options: async (ctx) => (await programOptions(ctx)).map((o) => o.label) },
          { key: 'days', header: 'Days', required: true, example: 'Mon,Tue,Wed,Thu,Fri' },
          { key: 'periods', header: 'Periods', required: true, help: 'Separated by semicolons: P1 09:00-09:55; Break 10:50-11:05 break', example: 'P1 09:00-09:55; P2 09:55-10:50; Break 10:50-11:05 break; P3 11:05-12:00' },
        ],
        key: ['name'],
        exists: async (ctx, r) => !!(await ctx.tx.select({ id: p.id }).from(p).where(sql`lower(${p.name}) = ${lc(r.get('name'))}`))[0],
        run: async (ctx, rows) =>
          eachRow(ctx.tx, rows, async (tx, r) => {
            const name = required(r, 'name');
            const days = parseDays(required(r, 'days')) ?? fail('Use days like Mon,Tue,Wed', r.get('days'));
            const periods = parsePeriods(required(r, 'periods').replace(/;/g, '\n'));
            if (typeof periods === 'string') fail(periods, r.get('periods'));
            const programId = r.get('program') ? (await programByName({ tx, p: ctx.p }, r.get('program'))).id : null;
            const [found] = await tx.select({ id: p.id }).from(p).where(sql`lower(${p.name}) = ${lc(name)}`);
            if (found) {
              await tx.update(p).set({ days, periods: periods as BellPeriod[], programId }).where(eq(p.id, found.id));
              return outcome(false, true, [name]);
            }
            await tx.insert(p).values({ tenantId: ctx.p.tenantId, name, days, periods: periods as BellPeriod[], programId, sortOrder: 1_000_000 });
            return outcome(true, false, [name]);
          }),
      },
    };
  }

  // ---- special classes --------------------------------------------------------------------------------

  private specials(): RecordEntity {
    const s = specialClasses;
    const marked = sql<number>`(select count(*)::int from special_class_attendance x where x.special_class_id = ${s.id})`;
    const roomName = sql<string | null>`(select r.name from rooms r where r.id = ${s.roomId})`;
    const editable = async (ctx: KitCtx, id: string) => {
      const [cur] = await ctx.tx.select().from(s).where(eq(s.id, id));
      if (!cur) throw new NotFoundException('Special class not found');
      if (cur.status === 'cancelled') throw new ConflictException('This class was cancelled');
      if (!isAdmin(ctx) && cur.teacherId !== ctx.p.userId) await assertHeadsSubject(ctx, cur.subjectId);
      return cur;
    };
    const set = (column: 'date' | 'startsAt' | 'endsAt' | 'roomId' | 'topic' | 'kind' | 'batch') => async (ctx: KitCtx, id: string, v: unknown) => {
      const cur = await editable(ctx, id);
      const next = { ...cur, [column]: v };
      await this.assertSpecialFits(ctx, next, id);
      await ctx.tx.update(s).set({ [column]: v }).where(eq(s.id, id));
    };
    return {
      key: 'special-classes',
      module: 'timetable',
      table: s,
      subjectType: 'special_class',
      roles: { read: READ, write: TEACHERS },
      label: (r) => `${r.subjectCode ?? ''} ${r.section ?? ''} ${r.date ?? ''}`.trim() || 'Special class',
      list: {
        select: {
          id: s.id,
          kind: s.kind,
          sectionId: s.sectionId,
          section: sections.displayName,
          subjectId: s.subjectId,
          subjectCode: subjects.code,
          subject: subjects.name,
          teacherId: s.teacherId,
          teacher: users.fullName,
          roomId: s.roomId,
          room: roomName,
          batch: s.batch,
          date: s.date,
          startsAt: sql<string>`to_char(${s.startsAt}, 'HH24:MI')`,
          endsAt: sql<string>`to_char(${s.endsAt}, 'HH24:MI')`,
          topic: s.topic,
          status: s.status,
          marked,
        },
        joins: (q) => q.innerJoin(sections, eq(sections.id, s.sectionId)).innerJoin(subjects, eq(subjects.id, s.subjectId)).innerJoin(users, eq(users.id, s.teacherId)),
        search: [sections.displayName, subjects.code, subjects.name, users.fullName, s.topic],
        filters: {
          class: { label: 'Class', options: sectionOptions, where: (v) => uuidEq(s.sectionId, v) },
          teacher: { label: 'Teacher', options: teacherOptions, where: (v) => uuidEq(s.teacherId, v) },
          kind: { label: 'Kind', options: SPECIAL_KINDS, where: (v) => (SPECIAL_KINDS.some((o) => o.value === v) ? eq(s.kind, v) : undefined) },
          status: { label: 'Status', options: SPECIAL_STATUS, where: (v) => (SPECIAL_STATUS.some((o) => o.value === v) ? eq(s.status, v) : undefined) },
          month: { label: 'Month', where: (v) => (/^\d{4}-\d{2}$/.test(v) ? sql`to_char(${s.date}, 'YYYY-MM') = ${v}` : undefined) },
        },
        sorts: { date: s.date, class: sections.displayName, subject: subjects.code, teacher: users.fullName, status: s.status },
        defaultSort: { id: 'date', dir: 'desc' },
        tiebreak: [s.startsAt],
        scope: (ctx) => (isAdmin(ctx) || ctx.p.roles.includes('exam_controller') ? undefined : ctx.p.roles.includes('hod') ? or(headedSubjects(ctx, sql`${s.subjectId}`), eq(s.teacherId, ctx.p.userId)) : eq(s.teacherId, ctx.p.userId)),
      },
      fields: {
        kind: { label: 'Kind', type: 'select', schema: Text(20), options: SPECIAL_KINDS, required: true, apply: set('kind') },
        sectionId: { label: 'Class', type: 'select', schema: Ref, column: s.sectionId, options: sectionOptions, required: true, edit: false },
        subjectId: { label: 'Course', type: 'select', schema: Ref, column: s.subjectId, options: subjectOptions, required: true, edit: false },
        teacherId: { label: 'Teacher', type: 'select', schema: OptionalRef, column: s.teacherId, options: teacherOptions, edit: false, help: 'Empty = you' },
        date: { label: 'Date', type: 'date', schema: DateText.refine((v) => v !== null, 'This value is required'), required: true, apply: set('date') },
        startsAt: { label: 'Starts', type: 'text', schema: HHMM, required: true, apply: set('startsAt'), help: 'HH:MM' },
        endsAt: { label: 'Ends', type: 'text', schema: HHMM, required: true, apply: set('endsAt'), help: 'HH:MM' },
        roomId: { label: 'Room', type: 'select', schema: OptionalRef, options: roomOptions, apply: set('roomId') },
        batch: { label: 'Batch', type: 'text', schema: OptionalText(20), apply: set('batch'), help: 'Only a lab or tutorial batch (empty = the whole class)' },
        topic: { label: 'Topic', type: 'text', schema: OptionalText(300).transform((v) => v ?? ''), apply: set('topic') },
      },
      create: async (ctx, v) => {
        await assertSubjectInClass(ctx, String(v.sectionId), String(v.subjectId));
        const teacherId = (v.teacherId as string | null) || ctx.p.userId;
        if (teacherId !== ctx.p.userId && !isAdmin(ctx)) await assertHeadsSubject(ctx, String(v.subjectId));
        if (!(await teacherOptions(ctx)).some((o) => o.value === teacherId)) throw new BadRequestException('Choose a member of the teaching staff');
        const row = { kind: String(v.kind), sectionId: String(v.sectionId), subjectId: String(v.subjectId), teacherId, roomId: (v.roomId as string | null) ?? null, batch: (v.batch as string | null) ?? null, date: String(v.date), startsAt: String(v.startsAt), endsAt: String(v.endsAt), topic: String(v.topic ?? '') };
        await this.assertSpecialFits(ctx, row, null);
        const [created] = await ctx.tx.insert(s).values({ tenantId: ctx.p.tenantId, ...row, createdBy: ctx.p.userId }).returning({ id: s.id });
        return created.id;
      },
      duplicate: async (ctx, row) => {
        const next = addDays(String(row.date), 7);
        await this.assertSpecialFits(ctx, { sectionId: String(row.section_id), teacherId: String(row.teacher_id), roomId: (row.room_id as string | null) ?? null, date: next, startsAt: String(row.starts_at), endsAt: String(row.ends_at), batch: (row.batch as string | null) ?? null }, null);
        return { date: next, status: 'scheduled', created_by: ctx.p.userId };
      },
      actions: {
        cancel: {
          label: 'Cancel class',
          tone: 'danger',
          inputs: [{ key: 'note', label: 'Reason', type: 'textarea', required: true }],
          params: z.object({ note: z.string().trim().min(3).max(300) }),
          apply: async (ctx, id, params) => {
            const cur = await editable(ctx, id);
            await ctx.tx.update(s).set({ status: 'cancelled', topic: cur.topic ? `${cur.topic} · ${(params as { note: string }).note}` : (params as { note: string }).note }).where(eq(s.id, id));
            await audit(ctx.tx, { tenantId: ctx.p.tenantId, actorType: 'user', actorId: ctx.p.userId, action: 'special_class.cancelled', subjectType: 'special_class', subjectId: id, changes: { status: { before: cur.status, after: 'cancelled' } }, data: { note: (params as { note: string }).note } });
          },
        },
      },
      columns: [
        { key: 'date', header: 'Date' },
        { key: 'startsAt', header: 'Starts' },
        { key: 'endsAt', header: 'Ends' },
        { key: 'kind', header: 'Kind', value: (r) => labelOf(SPECIAL_KINDS, r.kind) },
        { key: 'section', header: 'Class' },
        { key: 'subjectCode', header: 'Course code' },
        { key: 'subject', header: 'Course' },
        { key: 'teacher', header: 'Teacher' },
        { key: 'room', header: 'Room' },
        { key: 'topic', header: 'Topic' },
        { key: 'status', header: 'Status', value: (r) => labelOf(SPECIAL_STATUS, r.status) },
        { key: 'marked', header: 'Marked' },
      ],
      import: {
        columns: [
          { key: 'kind', header: 'Kind', required: true, help: SPECIAL_KINDS.map((k) => k.value).join(', '), example: 'extra', options: SPECIAL_KINDS.map((k) => k.value) },
          { key: 'class', header: 'Class', required: true, options: async (ctx) => (await sectionOptions(ctx)).map((o) => o.label) },
          { key: 'course', header: 'Course code', required: true },
          { key: 'teacher', header: 'Teacher', required: true, help: 'Email or full name' },
          { key: 'date', header: 'Date', required: true, help: 'YYYY-MM-DD' },
          { key: 'starts', header: 'Starts', required: true, example: '15:30' },
          { key: 'ends', header: 'Ends', required: true, example: '16:30' },
          { key: 'topic', header: 'Topic' },
        ],
        key: ['class', 'course', 'date', 'starts'],
        exists: async () => false,
        run: async (ctx, rows) =>
          eachRow(ctx.tx, rows, async (tx, r) => {
            const c = { tx, p: ctx.p };
            const kind = lc(required(r, 'kind'));
            if (!SPECIAL_KINDS.some((k) => k.value === kind)) fail('Unknown kind', kind);
            const section = await sectionByName(c, required(r, 'class'));
            const subject = await subjectByCode(c, required(r, 'course'), section.programId);
            if (subject.term !== section.term) fail('That subject is not taught in this class', subject.code);
            const teacherId = await teacherByName(c, required(r, 'teacher'));
            const date = required(r, 'date');
            if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) fail('Give dates as YYYY-MM-DD', date);
            const starts = required(r, 'starts');
            const ends = required(r, 'ends');
            if (!/^\d{2}:\d{2}$/.test(starts) || !/^\d{2}:\d{2}$/.test(ends)) fail('Give times as HH:MM', `${starts} ${ends}`);
            const row = { kind, sectionId: section.id, subjectId: subject.id, teacherId, roomId: null, batch: null, date, startsAt: starts, endsAt: ends, topic: r.get('topic') };
            await this.assertSpecialFits(c, row, null).catch((e: Error) => fail(e.message, `${date} ${starts}`));
            await tx.insert(s).values({ tenantId: ctx.p.tenantId, ...row, createdBy: ctx.p.userId });
            return outcome(true, false, [section.displayName, subject.code, date]);
          }),
      },
    };
  }

  /**
   * A special class must not clash with the teacher's, the class's or the room's other special classes that day, nor
   * with their weekly periods on that day (compensatory working days followed), and must end after it starts.
   */
  private async assertSpecialFits(ctx: KitCtx, c: { sectionId: string; teacherId: string; roomId: string | null; date: string; startsAt: string; endsAt: string; batch?: string | null }, ignore: string | null) {
    const starts = c.startsAt.slice(0, 5);
    const ends = c.endsAt.slice(0, 5);
    if (starts >= ends) throw new BadRequestException('The class must end after it starts');
    const s = specialClasses;
    const [other] = await ctx.tx
      .select({ id: s.id })
      .from(s)
      .where(
        and(
          eq(s.date, c.date),
          ne(s.status, 'cancelled'),
          ignore ? ne(s.id, ignore) : undefined,
          sql`${s.startsAt} < ${ends}::time and ${s.endsAt} > ${starts}::time`,
          or(eq(s.teacherId, c.teacherId), and(eq(s.sectionId, c.sectionId), c.batch ? sql`(${s.batch} is null or ${s.batch} = ${c.batch})` : undefined), c.roomId ? eq(s.roomId, c.roomId) : undefined),
        ),
      )
      .limit(1);
    if (other) throw new ConflictException('Another special class is at that time for this teacher, class or room');
    const [sec] = await ctx.tx.select({ programId: sections.programId }).from(sections).where(eq(sections.id, c.sectionId));
    const weekday = (await this.calendar.dayOrders(ctx.tx, c.date, c.date)).weekday(c.date, sec?.programId);
    const [weekly] = await ctx.tx
      .select({ id: timetableSlots.id })
      .from(timetableSlots)
      .where(
        and(
          isNull(timetableSlots.archivedAt),
          eq(timetableSlots.dayOfWeek, weekday),
          sql`${timetableSlots.startsAt} < ${ends}::time and ${timetableSlots.endsAt} > ${starts}::time`,
          or(eq(timetableSlots.teacherId, c.teacherId), and(eq(timetableSlots.sectionId, c.sectionId), c.batch ? sql`(${timetableSlots.batch} is null or ${timetableSlots.batch} = ${c.batch})` : undefined), c.roomId ? eq(timetableSlots.roomId, c.roomId) : undefined),
        ),
      )
      .limit(1);
    if (weekly) throw new ConflictException('The teacher, the class or the room has a timetable period at that time');
    const holiday = (await this.calendar.holidays(ctx.tx, c.date, c.date)).on(c.date, sec?.programId);
    if (holiday) throw new ConflictException(`${c.date} is a holiday (${holiday.title})`);
  }

  // ---- compensatory working days ------------------------------------------------------------------------

  private workingDays(): RecordEntity {
    const w = workingDaySwaps;
    const programNames = sql<string | null>`(select string_agg(pr.name, ', ') from programs pr where pr.id = any(${w.programIds}))`;
    return {
      key: 'working-days',
      module: 'timetable',
      table: w,
      subjectType: 'working_day',
      roles: { read: READ, write: ADMIN },
      label: (r) => String(r.date),
      list: {
        select: { id: w.id, date: w.date, weekday: sql<number>`extract(isodow from ${w.date})::int`, followsWeekday: w.followsWeekday, programIds: w.programIds, programs: programNames, reason: w.reason, programId: sql<string | null>`${w.programIds}[1]` },
        search: [w.reason],
        filters: { year: { label: 'Year', where: (v) => (/^\d{4}$/.test(v) ? sql`extract(year from ${w.date}) = ${Number(v)}` : undefined) } },
        sorts: { date: w.date },
        defaultSort: { id: 'date', dir: 'desc' },
      },
      fields: {
        date: { label: 'Date', type: 'date', schema: DateText.refine((v) => v !== null, 'This value is required'), column: w.date, required: true },
        followsWeekday: { label: "Follows the timetable of", type: 'select', schema: z.coerce.number().int().min(1).max(7), column: w.followsWeekday, options: WEEKDAY_OPTIONS, required: true },
        programId: { label: 'Programme', type: 'select', schema: OptionalRef, options: programOptions, apply: async (ctx, id, v) => void (await ctx.tx.update(w).set({ programIds: v ? [String(v)] : null }).where(eq(w.id, id))), help: 'Empty = every programme' },
        reason: { label: 'Reason', type: 'text', schema: OptionalText(300).transform((v) => v ?? ''), column: w.reason, help: 'For example: in lieu of the Dasara holiday' },
      },
      create: async (ctx, v) => {
        const [dup] = await ctx.tx.select({ id: w.id }).from(w).where(eq(w.date, String(v.date)));
        if (dup) throw new ConflictException('That date already follows another timetable');
        const [row] = await ctx.tx.insert(w).values({ tenantId: ctx.p.tenantId, date: String(v.date), followsWeekday: Number(v.followsWeekday), programIds: v.programId ? [String(v.programId)] : null, reason: String(v.reason ?? ''), createdBy: ctx.p.userId }).returning({ id: w.id });
        return row.id;
      },
      columns: [
        { key: 'date', header: 'Date' },
        { key: 'weekday', header: 'Day', value: (r) => WEEKDAYS[Number(r.weekday) - 1] ?? '' },
        { key: 'followsWeekday', header: 'Follows', value: (r) => WEEKDAYS[Number(r.followsWeekday) - 1] ?? '' },
        { key: 'programs', header: 'Programmes' },
        { key: 'reason', header: 'Reason' },
      ],
      import: {
        columns: [
          { key: 'date', header: 'Date', required: true, help: 'YYYY-MM-DD', example: '2026-11-14' },
          { key: 'follows', header: 'Follows', required: true, help: 'Mon, Tue, Wed, Thu, Fri, Sat or Sun', example: 'Mon', options: [...WEEKDAYS] },
          { key: 'program', header: 'Programme', help: 'Optional (empty = every programme)', options: async (ctx) => (await programOptions(ctx)).map((o) => o.label) },
          { key: 'reason', header: 'Reason' },
        ],
        key: ['date'],
        exists: async (ctx, r) => !!(await ctx.tx.select({ id: w.id }).from(w).where(eq(w.date, r.get('date'))).limit(1))[0],
        run: async (ctx, rows) =>
          eachRow(ctx.tx, rows, async (tx, r) => {
            const date = required(r, 'date');
            if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) fail('Give dates as YYYY-MM-DD', date);
            const follows = WEEKDAYS.findIndex((d) => d.toLowerCase() === lc(required(r, 'follows')).slice(0, 3)) + 1;
            if (follows < 1) fail('Use Mon, Tue, Wed, Thu, Fri, Sat or Sun', r.get('follows'));
            const programIds = r.get('program') ? [(await programByName({ tx, p: ctx.p }, r.get('program'))).id] : null;
            const [found] = await tx.select({ id: w.id }).from(w).where(eq(w.date, date));
            if (found) {
              await tx.update(w).set({ followsWeekday: follows, programIds, reason: r.get('reason') }).where(eq(w.id, found.id));
              return outcome(false, true, [date]);
            }
            await tx.insert(w).values({ tenantId: ctx.p.tenantId, date, followsWeekday: follows, programIds, reason: r.get('reason'), createdBy: ctx.p.userId });
            return outcome(true, false, [date]);
          }),
      },
    };
  }

  // ---- regulations --------------------------------------------------------------------------------------

  private regulationsEntity(): RecordEntity {
    const g = regulations;
    const versions = sql<number>`(select count(*)::int from curriculum_versions v where v.regulation_id = ${g.id})`;
    return {
      key: 'regulations',
      module: 'academics',
      table: g,
      subjectType: 'regulation',
      roles: { read: READ, write: HEADS },
      label: (r) => `${r.name} ${r.year}`,
      list: {
        select: { id: g.id, name: g.name, year: g.year, programId: g.programId, programName: programs.name, authority: g.authority, effectiveFrom: g.effectiveFrom, notes: g.notes, versions },
        joins: (q) => q.leftJoin(programs, eq(programs.id, g.programId)),
        search: [g.name, g.authority, programs.name],
        filters: { programme: { label: 'Programme', options: programOptions, where: (v) => uuidEq(g.programId, v) } },
        sorts: { name: g.name, year: g.year, programme: programs.name, effective: g.effectiveFrom, versions },
        defaultSort: { id: 'year', dir: 'desc' },
      },
      fields: {
        name: { label: 'Name', type: 'text', schema: Text(120), column: g.name, required: true, help: 'For example: R2024, NEP 2024, 2019 scheme' },
        year: { label: 'Year', type: 'number', schema: Int(1950, 2100), column: g.year, required: true },
        programId: { label: 'Programme', type: 'select', schema: OptionalRef, column: g.programId, options: programOptions, help: 'Empty = every programme', bulk: true },
        authority: { label: 'Approved by', type: 'text', schema: Text(120), column: g.authority, required: true, help: 'Board of Studies, Academic Council, the university' },
        effectiveFrom: { label: 'In force from', type: 'date', schema: DateText.refine((v) => v !== null, 'This value is required'), column: g.effectiveFrom, required: true },
        notes: { label: 'Notes', type: 'textarea', schema: OptionalText(2000).transform((v) => v ?? ''), column: g.notes },
      },
      create: async (ctx, v) => {
        const [dup] = await ctx.tx.select({ id: g.id }).from(g).where(and(sql`lower(${g.name}) = ${lc(String(v.name))}`, eq(g.year, Number(v.year))));
        if (dup) throw new ConflictException('This regulation already exists for that year');
        const [row] = await ctx.tx.insert(g).values({ tenantId: ctx.p.tenantId, name: String(v.name), year: Number(v.year), programId: (v.programId as string | null) ?? null, authority: String(v.authority), effectiveFrom: String(v.effectiveFrom), notes: String(v.notes ?? '') }).returning({ id: g.id });
        return row.id;
      },
      duplicate: async (ctx, row) => ({ name: await copyName(ctx.tx, g, g.name, String(row.name), eq(g.year, Number(row.year))) }),
      columns: [
        { key: 'name', header: 'Regulation' },
        { key: 'year', header: 'Year' },
        { key: 'programName', header: 'Programme' },
        { key: 'authority', header: 'Approved by' },
        { key: 'effectiveFrom', header: 'In force from' },
        { key: 'versions', header: 'Syllabus versions' },
        { key: 'notes', header: 'Notes' },
      ],
      import: {
        columns: [
          { key: 'name', header: 'Regulation', required: true, example: 'R2024' },
          { key: 'year', header: 'Year', required: true, example: '2024' },
          { key: 'program', header: 'Programme', help: 'Optional', options: async (ctx) => (await programOptions(ctx)).map((o) => o.label) },
          { key: 'authority', header: 'Approved by', example: 'Board of Studies' },
          { key: 'effective_from', header: 'In force from', required: true, help: 'YYYY-MM-DD', example: '2024-06-01' },
          { key: 'notes', header: 'Notes' },
        ],
        key: ['name', 'year'],
        exists: async (ctx, r) => !!(await ctx.tx.select({ id: g.id }).from(g).where(and(sql`lower(${g.name}) = ${lc(r.get('name'))}`, eq(g.year, Number(r.get('year')) || 0))).limit(1))[0],
        run: async (ctx, rows) =>
          eachRow(ctx.tx, rows, async (tx, r) => {
            const name = required(r, 'name');
            const year = int(required(r, 'year'), 1950, 2100);
            const eff = required(r, 'effective_from');
            if (!/^\d{4}-\d{2}-\d{2}$/.test(eff)) fail('Give dates as YYYY-MM-DD', eff);
            const programId = r.get('program') ? (await programByName({ tx, p: ctx.p }, r.get('program'))).id : null;
            const values = { programId, authority: r.get('authority') || 'Board of Studies', effectiveFrom: eff, notes: r.get('notes') };
            const [found] = await tx.select({ id: g.id }).from(g).where(and(sql`lower(${g.name}) = ${lc(name)}`, eq(g.year, year)));
            if (found) {
              await tx.update(g).set(values).where(eq(g.id, found.id));
              return outcome(false, true, [name, String(year)]);
            }
            await tx.insert(g).values({ tenantId: ctx.p.tenantId, name, year, ...values });
            return outcome(true, false, [name, String(year)]);
          }),
      },
    };
  }
}

