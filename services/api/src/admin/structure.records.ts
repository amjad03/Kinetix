import { BadRequestException, ConflictException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';
import { STAFF_ADMIN_ROLES } from '../auth/auth.decorators.js';
import type { RoleName } from '../auth/principal.js';
import { audit } from '../common/audit.js';
import { naturalAsc } from '../common/natural-order.js';
import { academicYears, campuses, departments, programLevel, programs, sections, subjects, timetableSlots } from '../db/schema.js';
import { fail, int, lc, outcome, required, type Row as ImportRow } from '../import/row-helpers.js';
import { z } from 'zod';
import { RecordRegistry, type FieldOption, type KitCtx, type RecordEntity } from '../records/entity.js';
import { copyName, Int, OptionalRef, Ref, Text, uuidEq } from '../records/helpers.js';
import { eachRow } from '../records/import.js';

/**
 * The academic structure as record kit entities: programmes, classes (sections) and subjects (courses). Together
 * with students, staff and departments they are the reference modules other modules copy (docs/requirements/RECORD_DEPTH_KIT.md).
 */

const READ: RoleName[] = ['tenant_admin', 'principal', 'hod', 'admissions_officer', 'exam_controller'];
const WRITE: RoleName[] = STAFF_ADMIN_ROLES;

const LEVELS: FieldOption[] = [
  { value: 'k12', label: 'School (K-12)' },
  { value: 'ug', label: 'Undergraduate' },
  { value: 'pg', label: 'Postgraduate' },
  { value: 'diploma', label: 'Diploma' },
  { value: 'phd', label: 'PhD' },
];
const LEVEL_WORDS: Record<string, (typeof programLevel.enumValues)[number]> = { k12: 'k12', school: 'k12', ug: 'ug', undergraduate: 'ug', pg: 'pg', postgraduate: 'pg', diploma: 'diploma', phd: 'phd' };

// ---- options shared by the reference entities ---------------------------------------------------

export async function currentYearId(ctx: KitCtx): Promise<string> {
  const [y] = await ctx.tx.select({ id: academicYears.id }).from(academicYears).where(eq(academicYears.isCurrent, true));
  if (!y) throw new BadRequestException('There is no current academic year');
  return y.id;
}

/** Classes of the current academic year, grouped by programme, in the programmes' and classes' own order. */
export async function sectionOptions(ctx: KitCtx): Promise<FieldOption[]> {
  const rows = await ctx.tx
    .select({ id: sections.id, name: sections.displayName, program: programs.name })
    .from(sections)
    .innerJoin(programs, eq(programs.id, sections.programId))
    .innerJoin(academicYears, eq(academicYears.id, sections.academicYearId))
    .where(eq(academicYears.isCurrent, true))
    .orderBy(asc(programs.sortOrder), asc(programs.name), asc(sections.term), asc(sections.sortOrder), ...naturalAsc(sections.displayName));
  return rows.map((r) => ({ value: r.id, label: r.name, group: r.program }));
}

export async function programOptions(ctx: KitCtx): Promise<FieldOption[]> {
  const rows = await ctx.tx.select({ id: programs.id, name: programs.name }).from(programs).orderBy(asc(programs.sortOrder), asc(programs.name));
  return rows.map((r) => ({ value: r.id, label: r.name }));
}

export async function departmentOptions(ctx: KitCtx): Promise<FieldOption[]> {
  const rows = await ctx.tx.select({ id: departments.id, name: departments.name }).from(departments).orderBy(asc(departments.sortOrder), asc(departments.name));
  return rows.map((r) => ({ value: r.id, label: r.name }));
}

async function campusOptions(ctx: KitCtx): Promise<FieldOption[]> {
  const rows = await ctx.tx.select({ id: campuses.id, name: campuses.name }).from(campuses).orderBy(asc(campuses.createdAt));
  return rows.map((r) => ({ value: r.id, label: r.name }));
}

async function yearOptions(ctx: KitCtx): Promise<FieldOption[]> {
  const rows = await ctx.tx.select({ id: academicYears.id, label: academicYears.label }).from(academicYears).orderBy(desc(academicYears.startsOn));
  return rows.map((r) => ({ value: r.id, label: r.label }));
}

/** Terms 1 to the longest programme's count. */
async function termOptions(ctx: KitCtx): Promise<FieldOption[]> {
  const [{ max }] = await ctx.tx.select({ max: sql<number>`coalesce(max(${programs.termCount}), 0)::int` }).from(programs);
  return Array.from({ length: max }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }));
}

const programByName = async (ctx: KitCtx, name: string) => {
  const [p] = await ctx.tx.select().from(programs).where(sql`lower(${programs.name}) = ${lc(name)}`).limit(1);
  return p ?? fail('No programme with this name', name);
};

/** "BCom Sem 3 A" (or "Grade 7 B" in a school): how a class is named unless given another name. */
export const classDisplayName = (program: { name: string; level: string }, term: number, name: string) => (program.level === 'k12' ? `Grade ${term} ${name}` : `${program.name} Sem ${term} ${name}`);

// ---- programmes ---------------------------------------------------------------------------------

const classCount = sql<number>`(select count(*)::int from sections s where s.program_id = ${programs.id})`;
const subjectCount = sql<number>`(select count(*)::int from subjects x where x.program_id = ${programs.id})`;
const programStudents = sql<number>`(select count(*)::int from students st join sections s on s.id = st.section_id where s.program_id = ${programs.id})`;

function programmesEntity(): RecordEntity {
  return {
    key: 'programmes',
    module: 'academics',
    table: programs,
    subjectType: 'program',
    roles: { read: READ, write: WRITE },
    label: (r) => String(r.name),
    list: {
      select: { id: programs.id, name: programs.name, level: programs.level, termCount: programs.termCount, campusId: programs.campusId, campusName: campuses.name, sortOrder: programs.sortOrder, classCount, subjectCount, studentCount: programStudents },
      joins: (q) => q.innerJoin(campuses, eq(campuses.id, programs.campusId)),
      search: [programs.name],
      filters: {
        level: { label: 'Level', options: LEVELS, where: (v) => (LEVELS.some((l) => l.value === v) ? eq(programs.level, v as (typeof programLevel.enumValues)[number]) : undefined) },
        campus: { label: 'Campus', options: campusOptions, where: (v) => uuidEq(programs.campusId, v) },
      },
      sorts: { name: programs.name, level: programs.level, terms: programs.termCount, campus: campuses.name, classes: classCount, students: programStudents },
      defaultSort: { id: 'name', dir: 'asc' },
    },
    fields: {
      name: { label: 'Name', type: 'text', schema: Text(120), column: programs.name, required: true },
      level: { label: 'Level', type: 'select', schema: Text(20), column: programs.level, options: LEVELS, required: true, bulk: true },
      termCount: { label: 'Terms (semesters or grades)', type: 'number', schema: Int(1, 20), column: programs.termCount, required: true },
      campusId: { label: 'Campus', type: 'select', schema: Ref, column: programs.campusId, options: campusOptions, required: true, edit: false },
    },
    move: { label: 'Move to campus', options: campusOptions, column: programs.campusId },
    order: { column: programs.sortOrder },
    duplicate: async (ctx, row) => ({ name: await copyName(ctx.tx, programs, programs.name, String(row.name)) }),
    columns: [
      { key: 'name', header: 'Programme' },
      { key: 'level', header: 'Level', value: (r) => LEVELS.find((l) => l.value === r.level)?.label ?? String(r.level) },
      { key: 'termCount', header: 'Terms' },
      { key: 'campusName', header: 'Campus' },
      { key: 'classCount', header: 'Classes' },
      { key: 'subjectCount', header: 'Subjects' },
      { key: 'studentCount', header: 'Students' },
    ],
    import: {
      columns: [
        { key: 'name', header: 'Programme', required: true, help: 'The programme name, e.g. BCom or CBSE', example: 'BSc' },
        { key: 'level', header: 'Level', required: true, help: 'ug, pg, school, diploma or phd', example: 'ug', options: ['ug', 'pg', 'school', 'diploma', 'phd'] },
        { key: 'terms', header: 'Terms', required: true, help: 'Number of semesters (ug/pg) or grades (school)', example: '6' },
        { key: 'campus', header: 'Campus', help: 'Optional: the campus name (the first campus if empty)', options: async (ctx) => (await campusOptions(ctx)).map((o) => o.label) },
      ],
      key: ['name'],
      exists: async (ctx, r) => !!(await ctx.tx.select({ id: programs.id }).from(programs).where(sql`lower(${programs.name}) = ${lc(r.get('name'))}`).limit(1))[0],
      run: async (ctx, rows) => {
        const all = await campusOptions(ctx);
        const seen = new Set<string>();
        return eachRow(ctx.tx, rows, async (tx, r) => {
          const name = required(r, 'name');
          if (seen.has(lc(name))) fail('This row repeats an earlier row', name);
          seen.add(lc(name));
          const level = LEVEL_WORDS[lc(required(r, 'level'))] ?? fail('Unknown programme level (use ug, pg or school)', r.get('level'));
          const termCount = int(required(r, 'terms'), 1, 20);
          const campusName = r.get('campus');
          const campusId = campusName ? (all.find((c) => lc(c.label) === lc(campusName))?.value ?? fail('No campus with this name', campusName)) : all[0]?.value;
          if (!campusId) fail('The institution has no campus');
          const [found] = await tx.select().from(programs).where(sql`lower(${programs.name}) = ${lc(name)}`).limit(1);
          if (!found) {
            await tx.insert(programs).values({ tenantId: ctx.p.tenantId, name, level, termCount, campusId: campusId!, sortOrder: 1_000_000 });
            return outcome(true, false, [name]);
          }
          const changed = found.level !== level || found.termCount !== termCount || (campusName && found.campusId !== campusId);
          if (changed) await tx.update(programs).set({ level, termCount, campusId: campusId! }).where(eq(programs.id, found.id));
          return outcome(false, !!changed, [name]);
        });
      },
    },
  };
}

// ---- classes (sections) -------------------------------------------------------------------------

const sectionStudents = sql<number>`(select count(*)::int from students st where st.section_id = ${sections.id})`;

function classesEntity(): RecordEntity {
  return {
    key: 'classes',
    module: 'academics',
    table: sections,
    subjectType: 'section',
    roles: { read: [...READ, 'teacher'], write: WRITE },
    label: (r) => String(r.displayName),
    list: {
      select: {
        id: sections.id,
        displayName: sections.displayName,
        name: sections.name,
        term: sections.term,
        programId: sections.programId,
        programName: programs.name,
        academicYearId: sections.academicYearId,
        yearLabel: academicYears.label,
        isCurrentYear: academicYears.isCurrent,
        sortOrder: sections.sortOrder,
        studentCount: sectionStudents,
      },
      joins: (q) => q.innerJoin(programs, eq(programs.id, sections.programId)).innerJoin(academicYears, eq(academicYears.id, sections.academicYearId)),
      search: [sections.displayName, sections.name, programs.name],
      filters: {
        programme: { label: 'Programme', options: programOptions, where: (v) => uuidEq(sections.programId, v) },
        term: { label: 'Term', options: termOptions, where: (v) => (/^\d{1,2}$/.test(v) ? eq(sections.term, Number(v)) : undefined) },
        year: { label: 'Academic year', options: yearOptions, where: (v) => uuidEq(sections.academicYearId, v) },
      },
      sorts: { name: sections.displayName, programme: programs.name, term: sections.term, year: academicYears.startsOn, students: sectionStudents },
      defaultSort: { id: 'name', dir: 'asc' },
      tiebreak: [programs.name, sections.term],
    },
    fields: {
      programId: { label: 'Programme', type: 'select', schema: Ref, column: sections.programId, options: programOptions, required: true, edit: false },
      term: { label: 'Term (semester or grade)', type: 'number', schema: Int(1, 20), column: sections.term, required: true },
      name: { label: 'Section', type: 'text', schema: Text(40), column: sections.name, required: true, help: 'A, B, Science…' },
      displayName: { label: 'Name shown', type: 'text', schema: Text(120), column: sections.displayName, create: false },
      academicYearId: { label: 'Academic year', type: 'select', schema: OptionalRef, column: sections.academicYearId, options: yearOptions, edit: false, help: 'The current year if left empty' },
    },
    create: async (ctx, v) => {
      const [prog] = await ctx.tx.select().from(programs).where(eq(programs.id, String(v.programId)));
      if (!prog) throw new NotFoundException('Programme not found');
      const term = Number(v.term);
      if (term > prog.termCount) throw new BadRequestException('The term is outside the programme');
      const yearId = (v.academicYearId as string | null) || (await currentYearId(ctx));
      const displayName = classDisplayName(prog, term, String(v.name));
      const [dup] = await ctx.tx
        .select({ id: sections.id })
        .from(sections)
        .where(and(eq(sections.academicYearId, yearId), sql`lower(${sections.displayName}) = ${lc(displayName)}`));
      if (dup) throw new ConflictException('Another class already has this name');
      const [row] = await ctx.tx.insert(sections).values({ tenantId: ctx.p.tenantId, programId: prog.id, academicYearId: yearId, term, name: String(v.name), displayName }).returning({ id: sections.id });
      return row.id;
    },
    move: {
      label: 'Move to programme',
      options: programOptions,
      apply: async (ctx, id, to) => {
        const [s] = await ctx.tx.select({ s: sections, program: programs }).from(sections).innerJoin(programs, eq(programs.id, sections.programId)).where(eq(sections.id, id));
        if (!s) throw new NotFoundException('Class not found');
        if (s.s.programId === to) throw new BadRequestException('The class is already in this programme');
        const [target] = await ctx.tx.select().from(programs).where(eq(programs.id, to));
        if (s.s.term > target.termCount) throw new BadRequestException(`${target.name} has only ${target.termCount} terms`);
        const [slot] = await ctx.tx.select({ id: timetableSlots.id }).from(timetableSlots).where(and(eq(timetableSlots.sectionId, id), isNull(timetableSlots.archivedAt))).limit(1);
        if (slot) throw new ConflictException(`${s.s.displayName} has periods in the timetable for its programme's subjects. Clear its timetable first.`);
        // A name made from the old programme follows the class; a name typed in by hand stays.
        const generated = classDisplayName(s.program, s.s.term, s.s.name);
        const displayName = s.s.displayName === generated ? classDisplayName(target, s.s.term, s.s.name) : s.s.displayName;
        await ctx.tx.update(sections).set({ programId: to, displayName }).where(eq(sections.id, id));
        await audit(ctx.tx, { tenantId: ctx.p.tenantId, actorType: 'user', actorId: ctx.p.userId, action: 'section.moved', subjectType: 'section', subjectId: id, changes: { programId: { before: s.s.programId, after: to }, ...(displayName !== s.s.displayName && { displayName: { before: s.s.displayName, after: displayName } }) }, data: { to: target.name } });
      },
    },
    order: { column: sections.sortOrder, scope: [sections.programId, sections.academicYearId, sections.term] },
    duplicate: async (ctx, row) => {
      const name = await copyName(ctx.tx, sections, sections.displayName, String(row.display_name), eq(sections.academicYearId, String(row.academic_year_id)));
      return { display_name: name, name: `${row.name}${name.slice(String(row.display_name).length)}` };
    },
    columns: [
      { key: 'displayName', header: 'Class' },
      { key: 'programName', header: 'Programme' },
      { key: 'term', header: 'Term' },
      { key: 'name', header: 'Section' },
      { key: 'yearLabel', header: 'Academic year' },
      { key: 'studentCount', header: 'Students' },
    ],
    import: {
      columns: [
        { key: 'program', header: 'Programme', required: true, help: 'The programme name (add programmes first)', example: 'BSc', options: async (ctx) => (await programOptions(ctx)).map((o) => o.label) },
        { key: 'term', header: 'Term', required: true, help: 'Semester or grade number', example: '1' },
        { key: 'section', header: 'Section', required: true, help: 'The class within the term, e.g. A', example: 'A' },
        { key: 'display_name', header: 'Name shown', help: 'Optional: the class name as shown (default "BSc Sem 1 A")' },
      ],
      key: ['program', 'term', 'section'],
      exists: async (ctx, r) => {
        const [p] = await ctx.tx.select({ id: programs.id }).from(programs).where(sql`lower(${programs.name}) = ${lc(r.get('program'))}`).limit(1);
        if (!p || !/^\d+$/.test(r.get('term'))) return false;
        const yearId = await currentYearId(ctx);
        return !!(await ctx.tx.select({ id: sections.id }).from(sections).where(and(eq(sections.programId, p.id), eq(sections.academicYearId, yearId), eq(sections.term, Number(r.get('term'))), sql`lower(${sections.name}) = ${lc(r.get('section'))}`)).limit(1))[0];
      },
      run: async (ctx, rows) => {
        const yearId = await currentYearId(ctx);
        return eachRow(ctx.tx, rows, async (tx, r) => {
          const prog = await programByName({ tx, p: ctx.p }, required(r, 'program'));
          const term = int(required(r, 'term'), 1, prog.termCount, 'The term is outside the programme');
          const name = required(r, 'section');
          const displayName = r.get('display_name') || classDisplayName(prog, term, name);
          const [found] = await tx.select().from(sections).where(and(eq(sections.programId, prog.id), eq(sections.academicYearId, yearId), eq(sections.term, term), sql`lower(${sections.name}) = ${lc(name)}`)).limit(1);
          const [same] = await tx.select({ id: sections.id }).from(sections).where(and(eq(sections.academicYearId, yearId), sql`lower(${sections.displayName}) = ${lc(displayName)}`)).limit(1);
          if (same && same.id !== found?.id) fail('Another class already has this name', displayName);
          if (!found) {
            await tx.insert(sections).values({ tenantId: ctx.p.tenantId, programId: prog.id, academicYearId: yearId, term, name, displayName, sortOrder: 1_000_000 });
            return outcome(true, false, [displayName]);
          }
          if (found.displayName === displayName) return outcome(false, false, [displayName]);
          await tx.update(sections).set({ displayName }).where(eq(sections.id, found.id));
          return outcome(false, true, [displayName]);
        });
      },
    },
  };
}

// ---- the course master ---------------------------------------------------------------------------

export const COURSE_TYPES: FieldOption[] = [
  { value: 'core', label: 'Core' },
  { value: 'elective', label: 'Elective' },
  { value: 'open_elective', label: 'Open elective' },
  { value: 'audit', label: 'Audit' },
  { value: 'mooc', label: 'MOOC' },
  { value: 'lab', label: 'Lab' },
  { value: 'project', label: 'Project' },
  { value: 'skill', label: 'Skill enhancement' },
  { value: 'ability', label: 'Ability enhancement' },
];

/** An optional number (empty clears it); whole numbers when `whole`. */
const OptionalNum = (min: number, max: number, whole = false) =>
  z.union([z.literal(''), z.null(), whole ? z.coerce.number().int().min(min).max(max) : z.coerce.number().min(min).max(max)]).transform((v) => (v === '' || v === null ? null : v));

/** The course master values of an add form (the rest default). */
function courseMaster(v: Record<string, unknown>): Partial<typeof subjects.$inferInsert> {
  const out: Record<string, unknown> = {};
  for (const k of ['courseType', 'credits', 'lectureHours', 'tutorialHours', 'practicalHours', 'selfStudyHours', 'maxInternal', 'maxExternal', 'internalPassMarks', 'externalPassMarks']) if (v[k] !== undefined) out[k] = v[k];
  return out;
}

/** The course master columns of an import row (only the ones filled in). */
function importedMaster(r: ImportRow): Partial<typeof subjects.$inferInsert> {
  const out: Partial<typeof subjects.$inferInsert> = {};
  const type = lc(r.get('type'));
  if (type) out.courseType = COURSE_TYPES.some((o) => o.value === type) ? type : fail('Unknown course type', r.get('type'));
  const num = (key: string, max: number) => {
    const t = r.get(key);
    const n = Number(t);
    return Number.isFinite(n) && n >= 0 && n <= max ? n : fail('Not a valid number', t);
  };
  if (r.get('credits')) out.credits = num('credits', 40);
  if (r.get('ltps')) {
    const parts = r.get('ltps').split(/[-/ ]+/).map(Number);
    if (parts.length !== 4 || parts.some((x) => !Number.isInteger(x) || x < 0 || x > 30)) fail('Write L-T-P-S like 3-1-0-2', r.get('ltps'));
    [out.lectureHours, out.tutorialHours, out.practicalHours, out.selfStudyHours] = parts;
  }
  if (r.get('max_internal')) out.maxInternal = num('max_internal', 1000);
  if (r.get('max_external')) out.maxExternal = num('max_external', 1000);
  if (r.get('internal_pass')) out.internalPassMarks = num('internal_pass', 1000);
  if (r.get('external_pass')) out.externalPassMarks = num('external_pass', 1000);
  return out;
}

// ---- subjects (courses) -------------------------------------------------------------------------

function subjectsEntity(): RecordEntity {
  return {
    key: 'subjects',
    module: 'academics',
    table: subjects,
    subjectType: 'subject',
    roles: { read: [...READ, 'teacher'], write: WRITE },
    label: (r) => `${r.code} ${r.name}`,
    list: {
      select: {
        id: subjects.id,
        code: subjects.code,
        name: subjects.name,
        term: subjects.term,
        programId: subjects.programId,
        programName: programs.name,
        departmentId: subjects.departmentId,
        departmentName: departments.name,
        sortOrder: subjects.sortOrder,
        credits: subjects.credits,
        lectureHours: subjects.lectureHours,
        tutorialHours: subjects.tutorialHours,
        practicalHours: subjects.practicalHours,
        selfStudyHours: subjects.selfStudyHours,
        courseType: subjects.courseType,
        maxInternal: subjects.maxInternal,
        maxExternal: subjects.maxExternal,
        internalPassMarks: subjects.internalPassMarks,
        externalPassMarks: subjects.externalPassMarks,
        requires: sql<string>`(select coalesce(string_agg(r.code, ', ' order by r.code), '') from subject_requisites q join subjects r on r.id = q.requires_subject_id where q.subject_id = ${subjects.id})`,
      },
      joins: (q) => q.innerJoin(programs, eq(programs.id, subjects.programId)).leftJoin(departments, eq(departments.id, subjects.departmentId)),
      search: [subjects.code, subjects.name],
      filters: {
        programme: { label: 'Programme', options: programOptions, where: (v) => uuidEq(subjects.programId, v) },
        term: { label: 'Term', options: termOptions, where: (v) => (/^\d{1,2}$/.test(v) ? eq(subjects.term, Number(v)) : undefined) },
        department: { label: 'Department', options: async (ctx) => [{ value: 'none', label: 'No department' }, ...(await departmentOptions(ctx))], where: (v) => (v === 'none' ? isNull(subjects.departmentId) : uuidEq(subjects.departmentId, v)) },
        type: { label: 'Type', options: COURSE_TYPES, where: (v) => (COURSE_TYPES.some((o) => o.value === v) ? eq(subjects.courseType, v) : undefined) },
      },
      sorts: { code: subjects.code, name: subjects.name, programme: programs.name, term: subjects.term, department: departments.name, credits: subjects.credits, type: subjects.courseType },
      defaultSort: { id: 'code', dir: 'asc' },
    },
    fields: {
      programId: { label: 'Programme', type: 'select', schema: Ref, column: subjects.programId, options: programOptions, required: true, edit: false },
      term: { label: 'Term', type: 'number', schema: Int(1, 20), column: subjects.term, required: true, bulk: true },
      code: { label: 'Code', type: 'text', schema: Text(40), column: subjects.code, required: true },
      name: { label: 'Name', type: 'text', schema: Text(160), column: subjects.name, required: true },
      departmentId: { label: 'Department', type: 'select', schema: OptionalRef, column: subjects.departmentId, options: departmentOptions, bulk: true },
      courseType: { label: 'Type', type: 'select', schema: Text(20), column: subjects.courseType, options: COURSE_TYPES, bulk: true },
      credits: { label: 'Credits', type: 'number', schema: OptionalNum(0, 40), column: subjects.credits, bulk: true },
      lectureHours: { label: 'Lecture hours (L)', type: 'number', schema: Int(0, 30), column: subjects.lectureHours, bulk: true, help: 'Contact hours a week' },
      tutorialHours: { label: 'Tutorial hours (T)', type: 'number', schema: Int(0, 30), column: subjects.tutorialHours, bulk: true },
      practicalHours: { label: 'Practical hours (P)', type: 'number', schema: Int(0, 30), column: subjects.practicalHours, bulk: true },
      selfStudyHours: { label: 'Self-study hours (S)', type: 'number', schema: Int(0, 30), column: subjects.selfStudyHours, bulk: true },
      maxInternal: { label: 'Internal maximum', type: 'number', schema: OptionalNum(0, 1000, true), column: subjects.maxInternal, bulk: true },
      maxExternal: { label: 'External maximum', type: 'number', schema: OptionalNum(0, 1000, true), column: subjects.maxExternal, bulk: true },
      internalPassMarks: { label: 'Internal pass marks', type: 'number', schema: OptionalNum(0, 1000, true), column: subjects.internalPassMarks, bulk: true, help: 'Empty: the scheme or the university profile decides' },
      externalPassMarks: { label: 'External pass marks', type: 'number', schema: OptionalNum(0, 1000, true), column: subjects.externalPassMarks, bulk: true },
    },
    create: async (ctx, v) => {
      const [prog] = await ctx.tx.select().from(programs).where(eq(programs.id, String(v.programId)));
      if (!prog) throw new NotFoundException('Programme not found');
      if (Number(v.term) > prog.termCount) throw new BadRequestException('The term is outside the programme');
      const [dup] = await ctx.tx.select({ id: subjects.id }).from(subjects).where(and(eq(subjects.programId, prog.id), sql`lower(${subjects.code}) = ${lc(String(v.code))}`));
      if (dup) throw new ConflictException('This programme already has a subject with this code');
      const [row] = await ctx.tx
        .insert(subjects)
        .values({ tenantId: ctx.p.tenantId, programId: prog.id, term: Number(v.term), code: String(v.code), name: String(v.name), departmentId: (v.departmentId as string | null) ?? null, ...courseMaster(v) })
        .returning({ id: subjects.id });
      return row.id;
    },
    move: { label: 'Move to department', options: departmentOptions, column: subjects.departmentId },
    order: { column: subjects.sortOrder, scope: [subjects.programId, subjects.term] },
    duplicate: async (ctx, row) => {
      const code = await copyName(ctx.tx, subjects, subjects.code, String(row.code), eq(subjects.programId, String(row.program_id)), (n) => (n === 1 ? '-COPY' : `-COPY${n}`));
      return { code, name: `${row.name} (copy)` };
    },
    columns: [
      { key: 'code', header: 'Code' },
      { key: 'name', header: 'Subject' },
      { key: 'programName', header: 'Programme' },
      { key: 'term', header: 'Term' },
      { key: 'departmentName', header: 'Department' },
      { key: 'courseType', header: 'Type', value: (r) => COURSE_TYPES.find((o) => o.value === r.courseType)?.label ?? String(r.courseType ?? '') },
      { key: 'credits', header: 'Credits' },
      { key: 'ltps', header: 'L-T-P-S', value: (r) => `${r.lectureHours ?? 0}-${r.tutorialHours ?? 0}-${r.practicalHours ?? 0}-${r.selfStudyHours ?? 0}` },
      { key: 'maxInternal', header: 'Internal maximum' },
      { key: 'maxExternal', header: 'External maximum' },
      { key: 'internalPassMarks', header: 'Internal pass marks' },
      { key: 'externalPassMarks', header: 'External pass marks' },
      { key: 'requires', header: 'Requires' },
    ],
    import: {
      columns: [
        { key: 'program', header: 'Programme', required: true, help: 'The programme name (add programmes first)', example: 'BSc', options: async (ctx) => (await programOptions(ctx)).map((o) => o.label) },
        { key: 'term', header: 'Term', required: true, help: 'Semester or grade number', example: '1' },
        { key: 'code', header: 'Code', required: true, help: 'Unique within the programme', example: 'BSC-1.1' },
        { key: 'name', header: 'Subject', required: true, example: 'Physics I' },
        { key: 'department', header: 'Department', help: 'Optional: the department that teaches it', options: async (ctx) => (await departmentOptions(ctx)).map((o) => o.label) },
        { key: 'type', header: 'Type', help: COURSE_TYPES.map((o) => o.value).join(', '), example: 'core', options: COURSE_TYPES.map((o) => o.value) },
        { key: 'credits', header: 'Credits', example: '4' },
        { key: 'ltps', header: 'L-T-P-S', help: 'Contact hours a week, e.g. 3-1-0-2', example: '3-1-0-0' },
        { key: 'max_internal', header: 'Internal maximum', example: '40' },
        { key: 'max_external', header: 'External maximum', example: '60' },
        { key: 'internal_pass', header: 'Internal pass marks' },
        { key: 'external_pass', header: 'External pass marks' },
      ],
      key: ['program', 'code'],
      exists: async (ctx, r) => {
        const [p] = await ctx.tx.select({ id: programs.id }).from(programs).where(sql`lower(${programs.name}) = ${lc(r.get('program'))}`).limit(1);
        return !!p && !!(await ctx.tx.select({ id: subjects.id }).from(subjects).where(and(eq(subjects.programId, p.id), sql`lower(${subjects.code}) = ${lc(r.get('code'))}`)).limit(1))[0];
      },
      run: async (ctx, rows) => {
        const depts = await departmentOptions(ctx);
        const seen = new Set<string>();
        return eachRow(ctx.tx, rows, async (tx, r) => {
          const prog = await programByName({ tx, p: ctx.p }, required(r, 'program'));
          const term = int(required(r, 'term'), 1, prog.termCount, 'The term is outside the programme');
          const code = required(r, 'code');
          const name = required(r, 'name');
          const key = `${prog.id}:${lc(code)}`;
          if (seen.has(key)) fail('This row repeats an earlier row', code);
          seen.add(key);
          const deptName = r.get('department');
          const departmentId = deptName ? (depts.find((d) => lc(d.label) === lc(deptName))?.value ?? fail('No department with this name', deptName)) : null;
          const [found] = await tx.select().from(subjects).where(and(eq(subjects.programId, prog.id), sql`lower(${subjects.code}) = ${lc(code)}`)).limit(1);
          if (!found) {
            await tx.insert(subjects).values({ tenantId: ctx.p.tenantId, programId: prog.id, term, code, name, departmentId, sortOrder: 1_000_000, ...importedMaster(r) });
            return outcome(true, false, [`${code} ${name}`]);
          }
          const master = importedMaster(r);
          const set: Partial<typeof subjects.$inferInsert> = {};
          for (const [k, v] of Object.entries(master)) if ((found as Record<string, unknown>)[k] !== v) (set as Record<string, unknown>)[k] = v;
          if (found.name !== name) set.name = name;
          if (found.term !== term) set.term = term;
          if (deptName && found.departmentId !== departmentId) set.departmentId = departmentId;
          if (Object.keys(set).length) await tx.update(subjects).set(set).where(eq(subjects.id, found.id));
          return outcome(false, Object.keys(set).length > 0, [`${code} ${name}`]);
        });
      },
    },
  };
}

/** Registers programmes, classes and subjects with the record kit. */
@Injectable()
export class StructureRecords implements OnModuleInit {
  constructor(private readonly registry: RecordRegistry) {}

  onModuleInit(): void {
    this.registry.register(programmesEntity());
    this.registry.register(classesEntity());
    this.registry.register(subjectsEntity());
  }
}
