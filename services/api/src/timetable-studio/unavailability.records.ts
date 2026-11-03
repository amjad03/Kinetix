import { BadRequestException, ForbiddenException, Injectable, OnModuleInit } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { teacherOptions } from '../academic-planning/planning.records.js';
import type { RoleName } from '../auth/principal.js';
import { facultyUnavailability as fu } from '../db/schema-academics-pass.js';
import { users } from '../db/schema.js';
import { fail, lc, outcome, required } from '../import/row-helpers.js';
import { RecordRegistry, type FieldOption, type KitCtx, type RecordEntity } from '../records/entity.js';
import { DateText, OptionalRef, OptionalText, uuidEq } from '../records/helpers.js';
import { eachRow } from '../records/import.js';

const ADMIN: RoleName[] = ['tenant_admin', 'principal'];
const HEADS: RoleName[] = [...ADMIN, 'hod'];
const isHead = (ctx: KitCtx) => ctx.p.roles.some((r) => HEADS.includes(r));
const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const DAY_OPTIONS: FieldOption[] = WEEKDAYS.map((d, i) => ({ value: String(i + 1), label: d }));
const HHMM = z
  .union([z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:\d\d)?$/, 'Use a time like 09:30'), z.literal('')])
  .nullable()
  .transform((v) => (v ? v.slice(0, 5) : null));
const Day = z.coerce.number().int().min(1).max(7);

/** A head of department sees and keeps their department's teachers; a teacher their own. */
const headed = (ctx: KitCtx) => sql`${fu.teacherId} in (select ds.user_id from department_staff ds join departments d on d.id = ds.department_id where d.head_user_id = ${ctx.p.userId}::uuid)`;

/**
 * When a teacher cannot be timetabled (research day, another campus, a course they attend): a weekday, optionally
 * hours of it, optionally only between two dates. The generator keeps it free and the editor refuses a period there.
 */
export function unavailabilityEntity(): RecordEntity {
  return {
    key: 'faculty-unavailability',
    module: 'timetable',
    table: fu,
    subjectType: 'faculty_unavailability',
    roles: { read: [...HEADS, 'teacher'], write: [...HEADS, 'teacher'] },
    label: (r) => `${r.teacher ?? ''} ${WEEKDAYS[Number(r.dayOfWeek) - 1] ?? ''} ${r.startsAt ? `${r.startsAt}–${r.endsAt}` : 'all day'}`.trim(),
    list: {
      select: {
        id: fu.id,
        teacherId: fu.teacherId,
        teacher: users.fullName,
        dayOfWeek: fu.dayOfWeek,
        startsAt: sql<string | null>`to_char(${fu.startsAt}, 'HH24:MI')`,
        endsAt: sql<string | null>`to_char(${fu.endsAt}, 'HH24:MI')`,
        fromDate: fu.fromDate,
        toDate: fu.toDate,
        reason: fu.reason,
        createdAt: fu.createdAt,
      },
      joins: (q) => q.innerJoin(users, eq(users.id, fu.teacherId)),
      search: [users.fullName, fu.reason],
      filters: {
        teacher: { label: 'Teacher', options: teacherOptions, where: (v) => uuidEq(fu.teacherId, v) },
        day: { label: 'Day', options: DAY_OPTIONS, where: (v) => (/^[1-7]$/.test(v) ? eq(fu.dayOfWeek, Number(v)) : undefined) },
        current: { label: 'In force', options: [{ value: 'now', label: 'In force now' }, { value: 'past', label: 'Ended' }], where: (v) => (v === 'now' ? sql`(${fu.toDate} is null or ${fu.toDate} >= current_date)` : v === 'past' ? sql`${fu.toDate} < current_date` : undefined) },
      },
      sorts: { teacher: users.fullName, day: fu.dayOfWeek, starts: fu.startsAt, created: fu.createdAt },
      defaultSort: { id: 'teacher', dir: 'asc' },
      tiebreak: [fu.dayOfWeek, fu.startsAt],
      scope: (ctx) => (ctx.p.roles.some((r) => ADMIN.includes(r)) ? undefined : ctx.p.roles.includes('hod') ? sql`(${headed(ctx)} or ${fu.teacherId} = ${ctx.p.userId}::uuid)` : eq(fu.teacherId, ctx.p.userId)),
    },
    fields: {
      teacherId: { label: 'Teacher', type: 'select', schema: OptionalRef, column: fu.teacherId, options: teacherOptions, edit: false, help: 'Empty = you' },
      dayOfWeek: { label: 'Day', type: 'select', schema: Day, column: fu.dayOfWeek, options: DAY_OPTIONS, required: true, bulk: true },
      startsAt: { label: 'From', type: 'text', schema: HHMM, column: fu.startsAt, help: 'HH:MM; empty = the whole day' },
      endsAt: { label: 'To', type: 'text', schema: HHMM, column: fu.endsAt, help: 'HH:MM' },
      fromDate: { label: 'Starting', type: 'date', schema: DateText, column: fu.fromDate, help: 'Empty = from now on' },
      toDate: { label: 'Until', type: 'date', schema: DateText, column: fu.toDate, bulk: true, help: 'Empty = until removed' },
      reason: { label: 'Reason', type: 'text', schema: OptionalText(300).transform((v) => v ?? ''), column: fu.reason, required: true },
    },
    create: async (ctx, v) => {
      const teacherId = (v.teacherId as string | null) || ctx.p.userId;
      await assertMayKeep(ctx, teacherId);
      if (!(await teacherOptions(ctx)).some((o) => o.value === teacherId)) throw new BadRequestException('Choose a member of the teaching staff');
      const [row] = await ctx.tx
        .insert(fu)
        .values({ tenantId: ctx.p.tenantId, teacherId, dayOfWeek: Number(v.dayOfWeek), startsAt: (v.startsAt as string | null) ?? null, endsAt: (v.endsAt as string | null) ?? null, fromDate: (v.fromDate as string | null) ?? null, toDate: (v.toDate as string | null) ?? null, reason: String(v.reason ?? ''), createdBy: ctx.p.userId })
        .returning({ id: fu.id });
      return row.id;
    },
    check: async (ctx, id) => {
      const [r] = await ctx.tx.select().from(fu).where(eq(fu.id, id));
      if (!r) return;
      await assertMayKeep(ctx, r.teacherId);
      if ((r.startsAt === null) !== (r.endsAt === null)) throw new BadRequestException('Give both times, or neither for the whole day');
      if (r.startsAt && r.endsAt && r.startsAt >= r.endsAt) throw new BadRequestException('The end time must be after the start time');
      if (r.fromDate && r.toDate && r.fromDate > r.toDate) throw new BadRequestException('The last date must be on or after the first');
    },
    remove: { guard: async (ctx, id) => ((await mayKeep(ctx, id)) ? null : 'You can remove only your own unavailability') },
    columns: [
      { key: 'teacher', header: 'Teacher' },
      { key: 'dayOfWeek', header: 'Day', value: (r) => WEEKDAYS[Number(r.dayOfWeek) - 1] ?? '' },
      { key: 'startsAt', header: 'From', value: (r) => (r.startsAt as string | null) ?? 'All day' },
      { key: 'endsAt', header: 'To', value: (r) => (r.endsAt as string | null) ?? '' },
      { key: 'fromDate', header: 'Starting' },
      { key: 'toDate', header: 'Until' },
      { key: 'reason', header: 'Reason' },
    ],
    import: {
      columns: [
        { key: 'teacher', header: 'Teacher', required: true, help: 'Email or full name of the teacher', example: 'sudhir.kamath@soundarya.edu.in' },
        { key: 'day', header: 'Day', required: true, options: WEEKDAYS, example: 'Wednesday' },
        { key: 'from', header: 'From', help: 'HH:MM; empty = the whole day', example: '14:00' },
        { key: 'to', header: 'To', help: 'HH:MM', example: '16:00' },
        { key: 'reason', header: 'Reason', required: true, example: 'Research day' },
        { key: 'until', header: 'Until', help: 'YYYY-MM-DD; empty = until removed' },
      ],
      key: ['teacher', 'day', 'from'],
      exists: async (ctx, r) => {
        const t = await teacherBy(ctx, r.get('teacher'));
        const day = WEEKDAYS.findIndex((d) => lc(d) === lc(r.get('day'))) + 1;
        if (!t || !day) return false;
        const from = r.get('from') || null;
        return !!(await ctx.tx.select({ id: fu.id }).from(fu).where(and(eq(fu.teacherId, t), eq(fu.dayOfWeek, day), from ? sql`to_char(${fu.startsAt}, 'HH24:MI') = ${from}` : sql`${fu.startsAt} is null`)).limit(1))[0];
      },
      run: async (ctx, rows) =>
        eachRow(ctx.tx, rows, async (tx, r) => {
          const who = required(r, 'teacher');
          const teacherId = await teacherBy({ ...ctx, tx }, who);
          if (!teacherId) fail('No teacher with this email or name', who);
          await assertMayKeep(ctx, teacherId!);
          const day = WEEKDAYS.findIndex((d) => lc(d) === lc(required(r, 'day'))) + 1;
          if (!day) fail('Use a weekday name, e.g. Wednesday', r.get('day'));
          const from = HHMM.safeParse(r.get('from'));
          const to = HHMM.safeParse(r.get('to'));
          if (!from.success || !to.success || (from.data === null) !== (to.data === null) || (from.data && to.data && from.data >= to.data)) fail('Give both times as HH:MM with the end after the start, or neither', `${r.get('from')} ${r.get('to')}`);
          const until = DateText.safeParse(r.get('until'));
          if (!until.success) fail('Use a date like 2027-03-31', r.get('until'));
          const reason = required(r, 'reason');
          const [found] = await tx.select().from(fu).where(and(eq(fu.teacherId, teacherId!), eq(fu.dayOfWeek, day), from.data ? sql`to_char(${fu.startsAt}, 'HH24:MI') = ${from.data}` : sql`${fu.startsAt} is null`)).limit(1);
          if (!found) {
            await tx.insert(fu).values({ tenantId: ctx.p.tenantId, teacherId: teacherId!, dayOfWeek: day, startsAt: from.data ?? null, endsAt: to.data ?? null, toDate: until.data ?? null, reason, createdBy: ctx.p.userId });
            return outcome(true, false, [who, WEEKDAYS[day - 1]]);
          }
          const changed = found.reason !== reason || (found.endsAt?.slice(0, 5) ?? null) !== to.data || (found.toDate ?? null) !== (until.data ?? null);
          if (changed) await tx.update(fu).set({ reason, endsAt: to.data ?? null, toDate: until.data ?? null }).where(eq(fu.id, found.id));
          return outcome(false, changed, [who, WEEKDAYS[day - 1]]);
        }),
    },
  };
}

async function teacherBy(ctx: KitCtx, who: string): Promise<string | null> {
  const [u] = await ctx.tx.select({ id: users.id }).from(users).where(sql`lower(${users.email}) = ${lc(who)} or lower(${users.fullName}) = ${lc(who)}`).limit(1);
  if (!u) return null;
  return (await teacherOptions(ctx)).some((o) => o.value === u.id) ? u.id : null;
}

/** Whether this person may keep the teacher's unavailability: the office, the teacher's head of department, the teacher. */
async function assertMayKeep(ctx: KitCtx, teacherId: string) {
  if (teacherId === ctx.p.userId || ctx.p.roles.some((r) => ADMIN.includes(r))) return;
  if (isHead(ctx)) {
    const [hit] = await ctx.tx.execute<{ one: number }>(sql`select 1 as one from department_staff ds join departments d on d.id = ds.department_id where ds.user_id = ${teacherId}::uuid and d.head_user_id = ${ctx.p.userId}::uuid limit 1`).then((r) => r.rows);
    if (hit) return;
  }
  throw new ForbiddenException('You can set only your own unavailability');
}

async function mayKeep(ctx: KitCtx, id: string) {
  const [r] = await ctx.tx.select({ teacherId: fu.teacherId }).from(fu).where(eq(fu.id, id));
  if (!r) return true;
  try {
    await assertMayKeep(ctx, r.teacherId);
    return true;
  } catch {
    return false;
  }
}

@Injectable()
export class UnavailabilityRecords implements OnModuleInit {
  constructor(private readonly registry: RecordRegistry) {}

  onModuleInit(): void {
    this.registry.register(unavailabilityEntity());
  }
}
