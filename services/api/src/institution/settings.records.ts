import { BadRequestException, Injectable, OnModuleInit } from '@nestjs/common';
import { and, asc, desc, eq, gte, inArray, lte, ne, sql } from 'drizzle-orm';
import { z } from 'zod';
import { STAFF_ADMIN_ROLES } from '../auth/auth.decorators.js';
import type { RoleName } from '../auth/principal.js';
import { normalizePhone } from '../auth/phone.js';
import { audit } from '../common/audit.js';
import type { Tx } from '../db/db.service.js';
import { academicTerms, academicYears, campuses, programs, userRoles, users } from '../db/schema.js';
import { fail, lc, outcome, required } from '../import/row-helpers.js';
import { programsMeet } from '../terms/terms.js';
import { RecordRegistry, type FieldOption, type KitCtx, type RecordEntity } from '../records/entity.js';
import { copyName, OptionalRef, OptionalText, Text, uuidEq } from '../records/helpers.js';
import { eachRow } from '../records/import.js';

/** Settings lists: academic years, terms (semesters) and campuses. Leaders write; staff who plan read. */
const READERS: RoleName[] = [...STAFF_ADMIN_ROLES, 'hod', 'university_admin', 'exam_controller'];
const WRITERS: RoleName[] = STAFF_ADMIN_ROLES;

const DAY = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-06-01');
const today = sql`(now() at time zone (select t.timezone from tenants t where t.id = nullif(current_setting('app.tenant_id', true), '')::uuid))::date`;

/** "2026-27" → "2027-28"; "2026" → "2027"; anything else gets " (next)". */
export function nextYearLabel(label: string): string {
  const m = /^(\d{4})([-/–])(\d{2}|\d{4})$/.exec(label.trim());
  if (m) {
    const a = Number(m[1]) + 1;
    const b = Number(m[3]) + 1;
    return `${a}${m[2]}${m[3].length === 2 ? String(b % 100).padStart(2, '0') : b}`;
  }
  if (/^\d{4}$/.test(label.trim())) return String(Number(label) + 1);
  return `${label} (next)`;
}

/** The same calendar day a year later (29 Feb becomes 28 Feb). */
export function plusYear(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  const leap = (n: number) => (n % 4 === 0 && n % 100 !== 0) || n % 400 === 0;
  const dd = m === 2 && d === 29 && !leap(y + 1) ? 28 : d;
  return `${y + 1}-${String(m).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
}

async function yearOptions(ctx: KitCtx): Promise<FieldOption[]> {
  const rows = await ctx.tx.select({ id: academicYears.id, label: academicYears.label }).from(academicYears).orderBy(desc(academicYears.startsOn));
  return rows.map((r) => ({ value: r.id, label: r.label }));
}

async function programOptions(ctx: KitCtx): Promise<FieldOption[]> {
  const rows = await ctx.tx.select({ id: programs.id, name: programs.name }).from(programs).orderBy(asc(programs.sortOrder), asc(programs.name));
  return rows.map((r) => ({ value: r.id, label: r.name }));
}

/** Staff who can head a campus: active people with a leadership or staff role. */
async function headOptions(ctx: KitCtx): Promise<FieldOption[]> {
  const rows = await ctx.tx
    .selectDistinct({ id: users.id, name: users.fullName })
    .from(users)
    .innerJoin(userRoles, eq(userRoles.userId, users.id))
    .where(and(eq(users.status, 'active'), inArray(userRoles.role, ['principal', 'tenant_admin', 'hod', 'university_admin'])))
    .orderBy(asc(users.fullName));
  return rows.map((r) => ({ value: r.id, label: r.name }));
}

// ---- academic years ----------------------------------------------------------------------------------------------------

const YEAR_ID = sql.raw('"academic_years"."id"');
const CAMPUS_ID = sql.raw('"campuses"."id"');
const termCount = sql<number>`(select count(*)::int from academic_terms t where t.academic_year_id = ${YEAR_ID})`;
const classCount = sql<number>`(select count(*)::int from sections s where s.academic_year_id = ${YEAR_ID})`;
const studentCount = sql<number>`(select count(*)::int from students st join sections s on s.id = st.section_id where s.academic_year_id = ${YEAR_ID} and st.status = 'active')`;
const yearState = sql<string>`case when ${academicYears.isCurrent} then 'current' when ${academicYears.endsOn} < ${today} then 'past' when ${academicYears.startsOn} > ${today} then 'upcoming' else 'open' end`;

/** A year's dates must be in order, at most two years long, not overlap another year, and still hold its terms. */
async function checkYear(tx: Tx, id: string): Promise<void> {
  const [y] = await tx.select().from(academicYears).where(eq(academicYears.id, id));
  if (!y) return;
  if (y.endsOn <= y.startsOn) throw new BadRequestException('The last day must be after the first day');
  if (Date.parse(y.endsOn) - Date.parse(y.startsOn) > 731 * 86_400_000) throw new BadRequestException('An academic year can be at most two years long');
  const [same] = await tx.select({ id: academicYears.id }).from(academicYears).where(and(ne(academicYears.id, id), sql`lower(${academicYears.label}) = ${y.label.toLowerCase()}`));
  if (same) throw new BadRequestException(`There is already an academic year called ${y.label}`);
  const [clash] = await tx.select({ label: academicYears.label }).from(academicYears).where(and(ne(academicYears.id, id), lte(academicYears.startsOn, y.endsOn), gte(academicYears.endsOn, y.startsOn)));
  if (clash) throw new BadRequestException(`The dates overlap the academic year ${clash.label}`);
  const [outside] = await tx
    .select({ name: academicTerms.name })
    .from(academicTerms)
    .where(and(eq(academicTerms.academicYearId, id), sql`(${academicTerms.startsOn} < ${y.startsOn} or ${academicTerms.endsOn} > ${y.endsOn})`));
  if (outside) throw new BadRequestException(`The term "${outside.name}" would fall outside the year; change it first`);
}

/** Makes one academic year the current one (the ERP's default year); the others stop being current. */
async function makeCurrent(ctx: KitCtx, id: string): Promise<string> {
  const [y] = await ctx.tx.select().from(academicYears).where(eq(academicYears.id, id));
  if (!y) throw new BadRequestException('Academic year not found');
  if (y.isCurrent) return 'Already current';
  const [was] = await ctx.tx.select({ id: academicYears.id, label: academicYears.label }).from(academicYears).where(eq(academicYears.isCurrent, true));
  await ctx.tx.update(academicYears).set({ isCurrent: false }).where(eq(academicYears.isCurrent, true));
  await ctx.tx.update(academicYears).set({ isCurrent: true }).where(eq(academicYears.id, id));
  await audit(ctx.tx, { tenantId: ctx.p.tenantId, actorType: 'user', actorId: ctx.p.userId, action: 'academic_year.made_current', subjectType: 'academic_year', subjectId: id, changes: { isCurrent: { before: false, after: true } }, data: { label: y.label, previous: was?.label ?? null } });
  return y.label;
}

/** Year-end rollover: the next academic year with the same shape, its terms copied a year later. The next year must not exist yet. */
async function rollOver(ctx: KitCtx, id: string): Promise<string> {
  const [y] = await ctx.tx.select().from(academicYears).where(eq(academicYears.id, id));
  if (!y) throw new BadRequestException('Academic year not found');
  const label = nextYearLabel(y.label);
  const startsOn = plusYear(y.startsOn);
  const endsOn = plusYear(y.endsOn);
  const [exists] = await ctx.tx.select({ id: academicYears.id }).from(academicYears).where(sql`lower(${academicYears.label}) = ${label.toLowerCase()}`);
  if (exists) throw new BadRequestException(`The academic year ${label} already exists`);
  const [n] = await ctx.tx.insert(academicYears).values({ tenantId: ctx.p.tenantId, label, startsOn, endsOn, isCurrent: false }).returning({ id: academicYears.id });
  await checkYear(ctx.tx, n.id);
  const terms = await ctx.tx.select().from(academicTerms).where(eq(academicTerms.academicYearId, id)).orderBy(asc(academicTerms.startsOn));
  for (const t of terms) await ctx.tx.insert(academicTerms).values({ tenantId: ctx.p.tenantId, academicYearId: n.id, name: t.name.replace(String(y.startsOn.slice(0, 4)), String(Number(y.startsOn.slice(0, 4)) + 1)), startsOn: plusYear(t.startsOn), endsOn: plusYear(t.endsOn), programIds: t.programIds });
  await audit(ctx.tx, { tenantId: ctx.p.tenantId, actorType: 'user', actorId: ctx.p.userId, action: 'academic_year.created', subjectType: 'academic_year', subjectId: n.id, after: { label, startsOn, endsOn }, data: { label, rolledOverFrom: y.label, terms: terms.length } });
  return `${label} with ${terms.length} terms`;
}

export function academicYearsEntity(): RecordEntity {
  return {
    key: 'academic-years',
    module: 'settings',
    table: academicYears,
    subjectType: 'academic_year',
    roles: { read: READERS, write: WRITERS },
    label: (r) => String(r.label),
    list: {
      select: { id: academicYears.id, label: academicYears.label, startsOn: academicYears.startsOn, endsOn: academicYears.endsOn, isCurrent: academicYears.isCurrent, state: yearState, termCount, classCount, studentCount },
      search: [academicYears.label],
      filters: {
        state: {
          label: 'When',
          options: [
            { value: 'current', label: 'Current' },
            { value: 'upcoming', label: 'Upcoming' },
            { value: 'past', label: 'Past' },
          ],
          where: (v) => (['current', 'upcoming', 'past', 'open'].includes(v) ? sql`${yearState} = ${v}` : undefined),
        },
      },
      sorts: { label: academicYears.label, starts: academicYears.startsOn, ends: academicYears.endsOn, classes: classCount, students: studentCount },
      defaultSort: { id: 'starts', dir: 'desc' },
    },
    fields: {
      label: { label: 'Name', type: 'text', schema: Text(20), column: academicYears.label, required: true, help: 'For example 2026-27' },
      startsOn: { label: 'First day', type: 'date', schema: DAY, column: academicYears.startsOn, required: true },
      endsOn: { label: 'Last day', type: 'date', schema: DAY, column: academicYears.endsOn, required: true },
    },
    check: (ctx, id) => checkYear(ctx.tx, id),
    remove: {
      guard: async (ctx, id) => {
        const [y] = await ctx.tx.select({ isCurrent: academicYears.isCurrent }).from(academicYears).where(eq(academicYears.id, id));
        return y?.isCurrent ? 'Make another year current before deleting this one' : null;
      },
    },
    actions: {
      makeCurrent: { label: 'Make current', apply: makeCurrent },
      rollOver: { label: 'Roll over to the next year', apply: rollOver },
    },
    columns: [
      { key: 'label', header: 'Academic year' },
      { key: 'startsOn', header: 'First day' },
      { key: 'endsOn', header: 'Last day' },
      { key: 'isCurrent', header: 'Current', value: (r) => (r.isCurrent ? 'Yes' : 'No') },
      { key: 'termCount', header: 'Terms' },
      { key: 'classCount', header: 'Classes' },
      { key: 'studentCount', header: 'Students' },
    ],
    import: {
      columns: [
        { key: 'label', header: 'Academic year', required: true, help: 'Rows are matched on this name', example: '2027-28' },
        { key: 'starts_on', header: 'First day', required: true, help: 'YYYY-MM-DD', example: '2027-06-01' },
        { key: 'ends_on', header: 'Last day', required: true, help: 'YYYY-MM-DD', example: '2028-04-30' },
      ],
      key: ['label'],
      exists: async (ctx, r) => !!(await ctx.tx.select({ id: academicYears.id }).from(academicYears).where(sql`lower(${academicYears.label}) = ${lc(r.get('label'))}`).limit(1))[0],
      run: (ctx, rows) =>
        eachRow(ctx.tx, rows, async (tx, r) => {
          const label = required(r, 'label');
          const startsOn = required(r, 'starts_on');
          const endsOn = required(r, 'ends_on');
          if (!DAY.safeParse(startsOn).success) fail('Use a date like 2026-06-01', startsOn);
          if (!DAY.safeParse(endsOn).success) fail('Use a date like 2026-06-01', endsOn);
          const [found] = await tx.select().from(academicYears).where(sql`lower(${academicYears.label}) = ${label.toLowerCase()}`);
          let id = found?.id;
          if (!found) id = (await tx.insert(academicYears).values({ tenantId: ctx.p.tenantId, label, startsOn, endsOn }).returning({ id: academicYears.id }))[0].id;
          else if (found.startsOn !== startsOn || found.endsOn !== endsOn) await tx.update(academicYears).set({ startsOn, endsOn }).where(eq(academicYears.id, found.id));
          try {
            await checkYear(tx, id!);
          } catch (e) {
            fail(e instanceof Error ? e.message : 'This value is not valid', label);
          }
          return outcome(!found, !!found && (found.startsOn !== startsOn || found.endsOn !== endsOn), [label]);
        }),
    },
  };
}

// ---- terms -------------------------------------------------------------------------------------------------------------

const termPrograms = sql<string[] | null>`(select array_agg(p.name order by p.sort_order, p.name) from programs p where p.id = any(${academicTerms.programIds}))`;
const termDays = sql<number>`(${academicTerms.endsOn} - ${academicTerms.startsOn} + 1)`;

/** A term sits inside its academic year and does not overlap another term of the same programmes. */
async function checkTerm(tx: Tx, id: string): Promise<void> {
  const [t] = await tx.select().from(academicTerms).where(eq(academicTerms.id, id));
  if (!t) return;
  if (t.endsOn < t.startsOn) throw new BadRequestException('The last day must be on or after the first day');
  const [y] = await tx.select().from(academicYears).where(eq(academicYears.id, t.academicYearId));
  if (t.startsOn < y.startsOn || t.endsOn > y.endsOn) throw new BadRequestException(`The term must be within the academic year ${y.label} (${y.startsOn} to ${y.endsOn})`);
  const others = await tx.select().from(academicTerms).where(and(ne(academicTerms.id, id), lte(academicTerms.startsOn, t.endsOn), gte(academicTerms.endsOn, t.startsOn)));
  const clash = others.find((o) => programsMeet(o.programIds, t.programIds));
  if (clash) throw new BadRequestException(`The term overlaps "${clash.name}" (${clash.startsOn} to ${clash.endsOn}) for the same programmes`);
}

export function termsEntity(): RecordEntity {
  return {
    key: 'terms',
    module: 'settings',
    table: academicTerms,
    subjectType: 'academic_term',
    roles: { read: READERS, write: WRITERS },
    label: (r) => `${r.name} (${r.yearLabel})`,
    list: {
      select: {
        id: academicTerms.id,
        name: academicTerms.name,
        academicYearId: academicTerms.academicYearId,
        yearLabel: academicYears.label,
        startsOn: academicTerms.startsOn,
        endsOn: academicTerms.endsOn,
        programIds: academicTerms.programIds,
        programId: sql<string | null>`${academicTerms.programIds}[1]`,
        programNames: termPrograms,
        days: termDays,
      },
      joins: (q) => q.innerJoin(academicYears, eq(academicYears.id, academicTerms.academicYearId)),
      search: [academicTerms.name, academicYears.label],
      filters: {
        year: { label: 'Academic year', options: yearOptions, where: (v) => uuidEq(academicTerms.academicYearId, v) },
        program: { label: 'Programme', options: programOptions, where: (v) => (z.uuid().safeParse(v).success ? sql`(${academicTerms.programIds} is null or ${v}::uuid = any(${academicTerms.programIds}))` : undefined) },
      },
      sorts: { starts: academicTerms.startsOn, name: academicTerms.name, year: academicYears.startsOn, days: termDays },
      defaultSort: { id: 'starts', dir: 'asc' },
    },
    fields: {
      academicYearId: { label: 'Academic year', type: 'select', schema: z.uuid(), column: academicTerms.academicYearId, options: yearOptions, required: true },
      name: { label: 'Name', type: 'text', schema: Text(120), column: academicTerms.name, required: true, help: 'For example Odd semester' },
      startsOn: { label: 'First day', type: 'date', schema: DAY, column: academicTerms.startsOn, required: true },
      endsOn: { label: 'Last day', type: 'date', schema: DAY, column: academicTerms.endsOn, required: true },
      programId: {
        label: 'Only for programme',
        type: 'select',
        schema: OptionalRef,
        options: programOptions,
        help: 'Leave empty for every programme',
        apply: async (ctx, id, v) => void (await ctx.tx.update(academicTerms).set({ programIds: v ? [String(v)] : null }).where(eq(academicTerms.id, id))),
      },
    },
    check: (ctx, id) => checkTerm(ctx.tx, id),
    columns: [
      { key: 'yearLabel', header: 'Academic year' },
      { key: 'name', header: 'Term' },
      { key: 'startsOn', header: 'First day' },
      { key: 'endsOn', header: 'Last day' },
      { key: 'days', header: 'Days' },
      { key: 'programNames', header: 'Programmes', value: (r) => ((r.programNames as string[] | null) ?? ['All']).join('; ') },
    ],
    import: {
      columns: [
        { key: 'academic_year', header: 'Academic year', required: true, example: '2026-27', options: async (ctx) => (await yearOptions(ctx)).map((o) => o.label) },
        { key: 'name', header: 'Term', required: true, help: 'Rows are matched on the year and this name', example: 'Odd semester' },
        { key: 'starts_on', header: 'First day', required: true, help: 'YYYY-MM-DD', example: '2026-06-15' },
        { key: 'ends_on', header: 'Last day', required: true, help: 'YYYY-MM-DD', example: '2026-11-15' },
        { key: 'programmes', header: 'Programmes', help: 'Programme names separated by ; (empty for every programme)', options: async (ctx) => (await programOptions(ctx)).map((o) => o.label) },
      ],
      key: ['academic_year', 'name'],
      exists: async (ctx, r) =>
        !!(
          await ctx.tx
            .select({ id: academicTerms.id })
            .from(academicTerms)
            .innerJoin(academicYears, eq(academicYears.id, academicTerms.academicYearId))
            .where(and(sql`lower(${academicYears.label}) = ${lc(r.get('academic_year'))}`, sql`lower(${academicTerms.name}) = ${lc(r.get('name'))}`))
            .limit(1)
        )[0],
      run: async (ctx, rows) => {
        const progs = await programOptions(ctx);
        return eachRow(ctx.tx, rows, async (tx, r) => {
          const yearLabel = required(r, 'academic_year');
          const name = required(r, 'name');
          const startsOn = required(r, 'starts_on');
          const endsOn = required(r, 'ends_on');
          if (!DAY.safeParse(startsOn).success) fail('Use a date like 2026-06-01', startsOn);
          if (!DAY.safeParse(endsOn).success) fail('Use a date like 2026-06-01', endsOn);
          const [y] = await tx.select({ id: academicYears.id }).from(academicYears).where(sql`lower(${academicYears.label}) = ${yearLabel.toLowerCase()}`);
          if (!y) fail('Academic year not found', yearLabel);
          const names = r.get('programmes').split(';').map((s) => s.trim()).filter(Boolean);
          const programIds = names.length ? names.map((n) => progs.find((p) => p.label.toLowerCase() === n.toLowerCase())?.value ?? fail('Programme not found', n)) : null;
          const [found] = await tx.select().from(academicTerms).where(and(eq(academicTerms.academicYearId, y!.id), sql`lower(${academicTerms.name}) = ${name.toLowerCase()}`));
          let id = found?.id;
          if (!found) id = (await tx.insert(academicTerms).values({ tenantId: ctx.p.tenantId, academicYearId: y!.id, name, startsOn, endsOn, programIds }).returning({ id: academicTerms.id }))[0].id;
          else await tx.update(academicTerms).set({ startsOn, endsOn, programIds }).where(eq(academicTerms.id, found.id));
          try {
            await checkTerm(tx, id!);
          } catch (e) {
            fail(e instanceof Error ? e.message : 'This value is not valid', name);
          }
          const changed = !!found && (found.startsOn !== startsOn || found.endsOn !== endsOn || JSON.stringify(found.programIds) !== JSON.stringify(programIds));
          return outcome(!found, changed, [yearLabel, name]);
        });
      },
    },
  };
}

// ---- campuses ----------------------------------------------------------------------------------------------------------

const campusPrograms = sql<number>`(select count(*)::int from programs p where p.campus_id = ${CAMPUS_ID})`;
const campusStudents = sql<number>`(select count(*)::int from students st join sections s on s.id = st.section_id join programs p on p.id = s.program_id where p.campus_id = ${CAMPUS_ID} and st.status = 'active')`;
const campusBuildings = sql<number>`(select count(*)::int from buildings b where b.campus_id = ${CAMPUS_ID})`;
const Code = z
  .union([z.string().trim().regex(/^[A-Za-z0-9-]{1,12}$/, 'Letters, digits and dashes, up to 12'), z.literal('')])
  .nullable()
  .transform((v) => (v ? v.toUpperCase() : null));
const Phone = z
  .union([z.string().trim().max(20), z.literal('')])
  .nullable()
  .transform((v, c) => {
    if (!v) return null;
    const p = normalizePhone(v);
    if (!/^\+\d{8,15}$/.test(p)) {
      c.addIssue({ code: 'custom', message: 'Enter a valid phone number' });
      return z.NEVER;
    }
    return p;
  });

export function campusesEntity(): RecordEntity {
  return {
    key: 'campuses',
    module: 'settings',
    table: campuses,
    subjectType: 'campus',
    roles: { read: READERS, write: WRITERS },
    label: (r) => String(r.name),
    list: {
      select: {
        id: campuses.id,
        name: campuses.name,
        code: campuses.code,
        city: campuses.city,
        address: campuses.address,
        phone: campuses.phone,
        headUserId: campuses.headUserId,
        headName: users.fullName,
        active: campuses.active,
        sortOrder: campuses.sortOrder,
        programCount: campusPrograms,
        studentCount: campusStudents,
        buildingCount: campusBuildings,
      },
      joins: (q) => q.leftJoin(users, eq(users.id, campuses.headUserId)),
      search: [campuses.name, campuses.code, campuses.city],
      filters: {
        active: {
          label: 'Status',
          options: [
            { value: 'yes', label: 'Open' },
            { value: 'no', label: 'Closed' },
          ],
          where: (v) => (v === 'yes' ? eq(campuses.active, true) : v === 'no' ? eq(campuses.active, false) : undefined),
        },
      },
      sorts: { name: campuses.name, code: campuses.code, city: campuses.city, students: campusStudents, programs: campusPrograms },
      defaultSort: { id: 'name', dir: 'asc' },
    },
    fields: {
      name: { label: 'Name', type: 'text', schema: Text(120), column: campuses.name, required: true },
      code: { label: 'Code', type: 'text', schema: Code, column: campuses.code, help: 'A short code used on numbers and documents, e.g. MAIN' },
      city: { label: 'City', type: 'text', schema: OptionalText(80), column: campuses.city, bulk: true },
      address: { label: 'Address', type: 'textarea', schema: OptionalText(300), column: campuses.address },
      phone: { label: 'Phone', type: 'phone', schema: Phone, column: campuses.phone },
      headUserId: { label: 'Head of campus', type: 'select', schema: OptionalRef, column: campuses.headUserId, options: headOptions, bulk: true },
      active: { label: 'Open', type: 'boolean', schema: z.boolean(), column: campuses.active, create: false, bulk: true, help: 'A closed campus stays in records but is not offered for new programmes' },
    },
    order: { column: campuses.sortOrder },
    duplicate: async (ctx, row) => ({ name: await copyName(ctx.tx, campuses, campuses.name, String(row.name)), code: null }),
    remove: {
      guard: async (ctx, id) => {
        const [r] = await ctx.tx.select({ n: sql<number>`count(*)::int` }).from(campuses).where(ne(campuses.id, id));
        return (r?.n ?? 0) === 0 ? 'An institution needs at least one campus' : null;
      },
    },
    columns: [
      { key: 'name', header: 'Campus' },
      { key: 'code', header: 'Code' },
      { key: 'city', header: 'City' },
      { key: 'address', header: 'Address' },
      { key: 'phone', header: 'Phone' },
      { key: 'headName', header: 'Head' },
      { key: 'active', header: 'Open', value: (r) => (r.active ? 'Yes' : 'No') },
      { key: 'programCount', header: 'Programmes' },
      { key: 'studentCount', header: 'Students' },
      { key: 'buildingCount', header: 'Buildings' },
    ],
    import: {
      columns: [
        { key: 'name', header: 'Campus', required: true, help: 'Rows are matched on this name', example: 'City campus' },
        { key: 'code', header: 'Code', help: 'Letters, digits and dashes, up to 12', example: 'CITY' },
        { key: 'city', header: 'City', example: 'Bengaluru' },
        { key: 'address', header: 'Address', example: '12 MG Road' },
        { key: 'phone', header: 'Phone', example: '+918012345678' },
      ],
      key: ['name'],
      exists: async (ctx, r) => !!(await ctx.tx.select({ id: campuses.id }).from(campuses).where(sql`lower(${campuses.name}) = ${lc(r.get('name'))}`).limit(1))[0],
      run: (ctx, rows) =>
        eachRow(ctx.tx, rows, async (tx, r) => {
          const name = required(r, 'name');
          const code = Code.safeParse(r.get('code'));
          if (!code.success) fail('Letters, digits and dashes, up to 12', r.get('code'));
          const phone = Phone.safeParse(r.get('phone'));
          if (!phone.success) fail('Enter a valid phone number', r.get('phone'));
          const values = { code: code.data ?? null, city: r.get('city') || null, address: r.get('address') || null, phone: phone.data ?? null };
          const [found] = await tx.select().from(campuses).where(sql`lower(${campuses.name}) = ${name.toLowerCase()}`);
          if (!found) {
            await tx.insert(campuses).values({ tenantId: ctx.p.tenantId, name, ...values, sortOrder: 1_000_000 });
            return outcome(true, false, [name]);
          }
          const changed = (Object.keys(values) as (keyof typeof values)[]).some((k) => values[k] !== null && values[k] !== found[k]);
          if (changed) await tx.update(campuses).set(Object.fromEntries(Object.entries(values).filter(([, v]) => v !== null))).where(eq(campuses.id, found.id));
          return outcome(false, changed, [name]);
        }),
    },
  };
}

@Injectable()
export class SettingsRecords implements OnModuleInit {
  constructor(private readonly registry: RecordRegistry) {}

  onModuleInit(): void {
    this.registry.register(academicYearsEntity());
    this.registry.register(termsEntity());
    this.registry.register(campusesEntity());
  }
}
