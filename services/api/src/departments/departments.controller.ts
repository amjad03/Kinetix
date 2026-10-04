import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from "@nestjs/common";
import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  sql,
} from "drizzle-orm";
import { z } from "zod";
import {
  Auth,
  CurrentPrincipal,
  STAFF_ADMIN_ROLES,
} from "../auth/auth.decorators.js";
import type { RoleName, UserPrincipal } from "../auth/principal.js";
import { audit } from "../common/audit.js";
import { Clock, localParts, zonedToInstant } from "../common/time.js";
import { ZodBody } from "../common/zod-body.js";
import { DbService, type Tx } from "../db/db.service.js";
import {
  assessments,
  attendanceRecords,
  boardSessions,
  departments,
  departmentStaff,
  homework,
  marks,
  programs,
  recordings,
  sections,
  subjects,
  timetableSlots,
  userRoles,
  users,
} from "../db/schema.js";
import {
  addDays,
  isSchoolAdmin,
  isoWeekday,
  parseDate,
} from "../teacher/teacher.service.js";
import { TimetableService } from "../timetable/timetable.service.js";

/** Who can open a department view: its head, or the principal and administrator for any. */
const VIEW_ROLES: RoleName[] = ["hod", "principal", "tenant_admin"];

/** Longest range the overview covers (a term is about 100 days). */
const MAX_DAYS = 120;

const CreateBody = z.object({
  name: z.string().trim().min(1).max(120),
  headUserId: z.uuid().nullable().optional(),
});
const UpdateBody = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  headUserId: z.uuid().nullable().optional(),
  staffIds: z.array(z.uuid()).max(500).optional(),
  subjectIds: z.array(z.uuid()).max(500).optional(),
});

/** Departments a user heads. */
export async function headedDepartmentIds(
  tx: Tx,
  userId: string,
): Promise<string[]> {
  const rows = await tx
    .select({ id: departments.id })
    .from(departments)
    .where(eq(departments.headUserId, userId));
  return rows.map((r) => r.id);
}

/** Whether [p] heads the department that teaches [subjectId] (read access to its classes' records). */
export async function headsSubject(
  tx: Tx,
  p: UserPrincipal,
  subjectId: string,
): Promise<boolean> {
  if (!p.roles.includes("hod")) return false;
  const [row] = await tx
    .select({ id: subjects.id })
    .from(subjects)
    .innerJoin(departments, eq(departments.id, subjects.departmentId))
    .where(
      and(eq(subjects.id, subjectId), eq(departments.headUserId, p.userId)),
    );
  return !!row;
}

const pct = (n: number, d: number) =>
  d === 0 ? null : Math.round((n / d) * 100);

/**
 * The head of department's view: how the department's classes went over a range of days
 * (taught on the board, attendance taken, homework, recordings, marks), per teacher and per
 * class. The principal and administrator can open any department.
 */
@Controller("v1/departments")
export class DepartmentsController {
  constructor(
    private readonly db: DbService,
    private readonly clock: Clock,
    private readonly timetable: TimetableService,
  ) {}

  /** The departments this user may open: the ones they head, or all for the principal. */
  @Get()
  @Auth("user", VIEW_ROLES)
  mine(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, (tx) =>
      tx
        .select({
          id: departments.id,
          name: departments.name,
          head: { id: users.id, fullName: users.fullName },
        })
        .from(departments)
        .leftJoin(users, eq(users.id, departments.headUserId))
        .where(
          isSchoolAdmin(p) ? undefined : eq(departments.headUserId, p.userId),
        )
        .orderBy(asc(departments.name)),
    );
  }

  @Get(":id/overview")
  @Auth("user", VIEW_ROLES)
  overview(
    @CurrentPrincipal() p: UserPrincipal,
    @Param("id", ParseUUIDPipe) id: string,
    @Query("from") fromQ?: string,
    @Query("to") toQ?: string,
  ) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [dept] = await tx
        .select({
          id: departments.id,
          name: departments.name,
          headUserId: departments.headUserId,
          head: users.fullName,
        })
        .from(departments)
        .leftJoin(users, eq(users.id, departments.headUserId))
        .where(eq(departments.id, id));
      // Someone else's department reads as missing, so ids reveal nothing.
      if (!dept || (!isSchoolAdmin(p) && dept.headUserId !== p.userId))
        throw new NotFoundException("Department not found");

      const tz = await this.timetable.tenantTimezone(tx);
      const now = localParts(this.clock.now(), tz);
      const to = toQ ? parseDate(toQ, "to") : now.date;
      const from = fromQ ? parseDate(fromQ, "from") : addDays(to, -6);
      if (from > to)
        throw new BadRequestException("from must be on or before to");
      if (addDays(from, MAX_DAYS - 1) < to)
        throw new BadRequestException(`Choose at most ${MAX_DAYS} days`);
      const start = zonedToInstant(from, "00:00:00", tz);
      const end = zonedToInstant(addDays(to, 1), "00:00:00", tz);

      const subjectRows = await tx
        .select({
          id: subjects.id,
          code: subjects.code,
          name: subjects.name,
          term: subjects.term,
          program: programs.name,
        })
        .from(subjects)
        .innerJoin(programs, eq(programs.id, subjects.programId))
        .where(eq(subjects.departmentId, id))
        .orderBy(asc(subjects.code));
      const subjectIds = subjectRows.map((s) => s.id);
      const staffRows = await tx
        .select({ id: users.id, fullName: users.fullName })
        .from(departmentStaff)
        .innerJoin(users, eq(users.id, departmentStaff.userId))
        .where(eq(departmentStaff.departmentId, id))
        .orderBy(asc(users.fullName));

      const empty = {
        department: { id: dept.id, name: dept.name, head: dept.head },
        range: { from, to },
        totals: null,
        subjects: subjectRows,
        teachers: [],
        classes: [],
        assessments: [],
      };
      if (subjectIds.length === 0)
        return {
          ...empty,
          teachers: staffRows.map((s) => ({ ...s, ...zero() })),
        };

      // The current timetable's periods for the department's subjects.
      const slots = await tx
        .select({
          id: timetableSlots.id,
          dayOfWeek: timetableSlots.dayOfWeek,
          endsAt: timetableSlots.endsAt,
          sectionId: timetableSlots.sectionId,
          section: sections.displayName,
          subjectId: timetableSlots.subjectId,
          teacherId: timetableSlots.teacherId,
          teacher: users.fullName,
        })
        .from(timetableSlots)
        .innerJoin(sections, eq(sections.id, timetableSlots.sectionId))
        .innerJoin(users, eq(users.id, timetableSlots.teacherId))
        .where(
          and(
            inArray(timetableSlots.subjectId, subjectIds),
            isNull(timetableSlots.archivedAt),
          ),
        );
      const slotIds = slots.map((s) => s.id);

      // Periods already over in the range: each weekday's date, and today only once a period ends.
      const due = new Map<string, number>();
      for (let d = from; d <= to && d <= now.date; d = addDays(d, 1)) {
        const wd = isoWeekday(d);
        for (const s of slots)
          if (s.dayOfWeek === wd && (d < now.date || s.endsAt <= now.time))
            due.set(s.id, (due.get(s.id) ?? 0) + 1);
      }

      const localDate = (col: typeof boardSessions.startedAt) =>
        sql<string>`to_char(${col} at time zone ${tz}, 'YYYY-MM-DD')`;
      const taughtRows = slotIds.length
        ? await tx
            .selectDistinct({
              slotId: boardSessions.timetableSlotId,
              day: localDate(boardSessions.startedAt),
            })
            .from(boardSessions)
            .where(
              and(
                inArray(boardSessions.timetableSlotId, slotIds),
                gte(boardSessions.startedAt, start),
                lt(boardSessions.startedAt, end),
              ),
            )
        : [];
      const attRows = slotIds.length
        ? await tx
            .select({
              slotId: attendanceRecords.timetableSlotId,
              periods: sql<number>`count(distinct ${attendanceRecords.date})::int`,
              marked: sql<number>`count(*)::int`,
              present: sql<number>`count(*) filter (where ${attendanceRecords.status} in ('present', 'late'))::int`,
            })
            .from(attendanceRecords)
            .where(
              and(
                inArray(attendanceRecords.timetableSlotId, slotIds),
                gte(attendanceRecords.date, from),
                sql`${attendanceRecords.date} <= ${to}`,
              ),
            )
            .groupBy(attendanceRecords.timetableSlotId)
        : [];
      const hwRows = await tx
        .select({
          sectionId: homework.sectionId,
          subjectId: homework.subjectId,
          by: homework.createdBy,
          n: sql<number>`count(*)::int`,
        })
        .from(homework)
        .where(
          and(
            inArray(homework.subjectId, subjectIds),
            gte(homework.createdAt, start),
            lt(homework.createdAt, end),
          ),
        )
        .groupBy(homework.sectionId, homework.subjectId, homework.createdBy);
      const recRows = await tx
        .select({
          sectionId: recordings.sectionId,
          subjectId: recordings.subjectId,
          by: recordings.ownerId,
          n: sql<number>`count(*)::int`,
        })
        .from(recordings)
        .where(
          and(
            inArray(recordings.subjectId, subjectIds),
            isNotNull(recordings.finishedAt),
            gte(recordings.startedAt, start),
            lt(recordings.startedAt, end),
          ),
        )
        .groupBy(
          recordings.sectionId,
          recordings.subjectId,
          recordings.ownerId,
        );
      const assessRows = await tx
        .select({
          id: assessments.id,
          title: assessments.title,
          kind: assessments.kind,
          heldOn: assessments.heldOn,
          maxMarks: assessments.maxMarks,
          publishedAt: assessments.publishedAt,
          sectionId: assessments.sectionId,
          section: sections.displayName,
          subjectId: assessments.subjectId,
          subject: subjects.name,
          createdBy: users.fullName,
          entered: sql<number>`(select count(*)::int from ${marks} m where m.assessment_id = ${assessments.id})`,
          average: sql<
            number | null
          >`(select avg(m.marks)::float from ${marks} m where m.assessment_id = ${assessments.id} and m.marks is not null)`,
        })
        .from(assessments)
        .innerJoin(sections, eq(sections.id, assessments.sectionId))
        .innerJoin(subjects, eq(subjects.id, assessments.subjectId))
        .innerJoin(users, eq(users.id, assessments.createdBy))
        .where(
          and(
            inArray(assessments.subjectId, subjectIds),
            gte(assessments.heldOn, from),
            sql`${assessments.heldOn} <= ${to}`,
          ),
        )
        .orderBy(desc(assessments.heldOn), asc(sections.displayName));

      const taughtBySlot = new Map<string, number>();
      for (const r of taughtRows)
        if (r.slotId)
          taughtBySlot.set(r.slotId, (taughtBySlot.get(r.slotId) ?? 0) + 1);
      const attBySlot = new Map(attRows.map((r) => [r.slotId!, r]));
      const percentOf = (a: (typeof assessRows)[number]) =>
        a.average === null
          ? null
          : Math.round((a.average / a.maxMarks) * 1000) / 10;

      // Per class (section + subject + teacher).
      type Agg = ReturnType<typeof zero>;
      const classes = new Map<
        string,
        Agg & {
          sectionId: string;
          section: string;
          subjectId: string;
          subject: string;
          teacherId: string;
          teacher: string;
        }
      >();
      const teachers = new Map<
        string,
        Agg & { id: string; fullName: string }
      >();
      for (const s of staffRows) teachers.set(s.id, { ...s, ...zero() });
      const subjectName = new Map(subjectRows.map((s) => [s.id, s.name]));
      for (const s of slots) {
        const key = `${s.sectionId}|${s.subjectId}|${s.teacherId}`;
        const c = classes.get(key) ?? {
          sectionId: s.sectionId,
          section: s.section,
          subjectId: s.subjectId,
          subject: subjectName.get(s.subjectId)!,
          teacherId: s.teacherId,
          teacher: s.teacher,
          ...zero(),
        };
        const t = teachers.get(s.teacherId) ?? {
          id: s.teacherId,
          fullName: s.teacher,
          ...zero(),
        };
        const att = attBySlot.get(s.id);
        // Counted only for periods that were due, so a future-dated record cannot exceed 100%.
        const scheduled = due.get(s.id) ?? 0;
        const add = {
          scheduled,
          taught: Math.min(taughtBySlot.get(s.id) ?? 0, scheduled),
          attendanceTaken: Math.min(att?.periods ?? 0, scheduled),
          marked: att?.marked ?? 0,
          present: att?.present ?? 0,
        };
        for (const target of [c, t])
          for (const [k, v] of Object.entries(add))
            target[k as keyof typeof add] += v;
        classes.set(key, c);
        teachers.set(s.teacherId, t);
      }
      for (const r of hwRows) {
        for (const c of classes.values())
          if (
            c.sectionId === r.sectionId &&
            c.subjectId === r.subjectId &&
            c.teacherId === r.by
          )
            c.homework += r.n;
        const t = teachers.get(r.by);
        if (t) t.homework += r.n;
      }
      for (const r of recRows) {
        for (const c of classes.values())
          if (
            c.sectionId === r.sectionId &&
            c.subjectId === r.subjectId &&
            c.teacherId === r.by
          )
            c.recordings += r.n;
        const t = teachers.get(r.by);
        if (t) t.recordings += r.n;
      }

      const shape = <T extends Agg>(a: T) => {
        const { marked, present, ...rest } = a;
        return {
          ...rest,
          taughtPercent: pct(a.taught, a.scheduled),
          attendancePercent: pct(present, marked),
          attendanceTakenPercent: pct(a.attendanceTaken, a.scheduled),
        };
      };
      const classList = [...classes.values()]
        .sort(
          (a, b) =>
            a.section.localeCompare(b.section) ||
            a.subject.localeCompare(b.subject),
        )
        .map((c) => {
          const latest = assessRows.find(
            (a) =>
              a.sectionId === c.sectionId &&
              a.subjectId === c.subjectId &&
              a.publishedAt,
          );
          return {
            ...shape(c),
            latestAssessment: latest
              ? {
                  id: latest.id,
                  title: latest.title,
                  heldOn: latest.heldOn,
                  averagePercent: percentOf(latest),
                }
              : null,
          };
        });
      const all = [...classes.values()].reduce((acc, c) => {
        for (const k of Object.keys(acc) as (keyof Agg)[]) acc[k] += c[k];
        return acc;
      }, zero());
      return {
        ...empty,
        totals: {
          ...shape(all),
          assessments: assessRows.length,
          published: assessRows.filter((a) => a.publishedAt).length,
        },
        teachers: [...teachers.values()]
          .sort((a, b) => a.fullName.localeCompare(b.fullName))
          .map(shape),
        classes: classList,
        assessments: assessRows.map(({ average: _a, ...a }) => ({
          ...a,
          averagePercent: percentOf({ ...a, average: _a }),
        })),
      };
    });
  }
}

function zero() {
  return {
    scheduled: 0,
    taught: 0,
    attendanceTaken: 0,
    marked: 0,
    present: 0,
    homework: 0,
    recordings: 0,
  };
}

/** Setting up departments: principal and administrator. */
@Controller("v1/admin/departments")
export class DepartmentsAdminController {
  constructor(private readonly db: DbService) {}

  @Get()
  @Auth("user", STAFF_ADMIN_ROLES)
  list(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, (tx) => this.listIn(tx));
  }

  private async listIn(tx: Tx) {
    const rows = await tx
      .select({
        id: departments.id,
        name: departments.name,
        headUserId: departments.headUserId,
        head: users.fullName,
      })
      .from(departments)
      .leftJoin(users, eq(users.id, departments.headUserId))
      .orderBy(asc(departments.name));
    const staff = await tx
      .select({
        departmentId: departmentStaff.departmentId,
        id: users.id,
        fullName: users.fullName,
      })
      .from(departmentStaff)
      .innerJoin(users, eq(users.id, departmentStaff.userId))
      .orderBy(asc(users.fullName));
    const subs = await tx
      .select({
        departmentId: subjects.departmentId,
        id: subjects.id,
        code: subjects.code,
        name: subjects.name,
      })
      .from(subjects)
      .where(isNotNull(subjects.departmentId))
      .orderBy(asc(subjects.code));
    return rows.map((d) => ({
      ...d,
      staff: staff
        .filter((s) => s.departmentId === d.id)
        .map(({ departmentId: _d, ...s }) => s),
      subjects: subs
        .filter((s) => s.departmentId === d.id)
        .map(({ departmentId: _d, ...s }) => s),
    }));
  }

  @Post()
  @Auth("user", STAFF_ADMIN_ROLES)
  create(
    @CurrentPrincipal() p: UserPrincipal,
    @Body(new ZodBody(CreateBody)) body: z.infer<typeof CreateBody>,
  ) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      if (body.headUserId) await this.assertCanHead(tx, body.headUserId);
      const [d] = await tx
        .insert(departments)
        .values({
          tenantId: p.tenantId,
          name: body.name,
          headUserId: body.headUserId ?? null,
        })
        .returning();
      await audit(tx, {
        tenantId: p.tenantId,
        actorType: "user",
        actorId: p.userId,
        action: "department.created",
        subjectType: "department",
        subjectId: d.id,
        data: { name: d.name, headUserId: d.headUserId },
      });
      return d;
    });
  }

  /** Rename, change the head, and replace the staff list or subject list (each when given). */
  @Put(":id")
  @Auth("user", STAFF_ADMIN_ROLES)
  update(
    @CurrentPrincipal() p: UserPrincipal,
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodBody(UpdateBody)) body: z.infer<typeof UpdateBody>,
  ) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [d] = await tx
        .select()
        .from(departments)
        .where(eq(departments.id, id));
      if (!d) throw new NotFoundException("Department not found");
      if (body.headUserId) await this.assertCanHead(tx, body.headUserId);
      if (body.name !== undefined || body.headUserId !== undefined) {
        await tx
          .update(departments)
          .set({
            ...(body.name !== undefined && { name: body.name }),
            ...(body.headUserId !== undefined && {
              headUserId: body.headUserId,
            }),
          })
          .where(eq(departments.id, id));
      }
      if (body.staffIds) {
        const ids = [...new Set(body.staffIds)];
        if (ids.length) {
          const found = await tx
            .select({ id: users.id })
            .from(users)
            .where(inArray(users.id, ids));
          if (found.length !== ids.length)
            throw new BadRequestException("Some staff were not found");
        }
        await tx
          .delete(departmentStaff)
          .where(eq(departmentStaff.departmentId, id));
        if (ids.length)
          await tx
            .insert(departmentStaff)
            .values(
              ids.map((userId) => ({
                tenantId: p.tenantId,
                departmentId: id,
                userId,
              })),
            );
      }
      if (body.subjectIds) {
        const ids = [...new Set(body.subjectIds)];
        if (ids.length) {
          const found = await tx
            .select({ id: subjects.id })
            .from(subjects)
            .where(inArray(subjects.id, ids));
          if (found.length !== ids.length)
            throw new BadRequestException("Some subjects were not found");
        }
        // A subject belongs to one department: listing it here moves it.
        await tx
          .update(subjects)
          .set({ departmentId: null })
          .where(eq(subjects.departmentId, id));
        if (ids.length)
          await tx
            .update(subjects)
            .set({ departmentId: id })
            .where(inArray(subjects.id, ids));
      }
      await audit(tx, {
        tenantId: p.tenantId,
        actorType: "user",
        actorId: p.userId,
        action: "department.updated",
        subjectType: "department",
        subjectId: id,
        data: body,
      });
      return (await this.listIn(tx)).find((x) => x.id === id);
    });
  }

  @Delete(":id")
  @HttpCode(204)
  @Auth("user", STAFF_ADMIN_ROLES)
  async remove(
    @CurrentPrincipal() p: UserPrincipal,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    await this.db.withTenant(p.tenantId, async (tx) => {
      const [d] = await tx
        .delete(departments)
        .where(eq(departments.id, id))
        .returning({ id: departments.id, name: departments.name });
      if (!d) throw new NotFoundException("Department not found");
      await audit(tx, {
        tenantId: p.tenantId,
        actorType: "user",
        actorId: p.userId,
        action: "department.deleted",
        subjectType: "department",
        subjectId: id,
        data: { name: d.name },
      });
    });
  }

  /** A head must be an active member of staff with the HOD role. */
  private async assertCanHead(tx: Tx, userId: string) {
    const [u] = await tx
      .select({
        fullName: users.fullName,
        hod: sql<boolean>`bool_or(${userRoles.role} = 'hod')`,
      })
      .from(users)
      .leftJoin(userRoles, eq(userRoles.userId, users.id))
      .where(and(eq(users.id, userId), eq(users.status, "active")))
      .groupBy(users.id);
    if (!u) throw new BadRequestException("That person was not found");
    if (!u.hod)
      throw new BadRequestException(
        `Give ${u.fullName} the HOD role before making them head of a department`,
      );
  }
}
