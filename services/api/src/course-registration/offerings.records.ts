import { BadRequestException, ConflictException, Injectable, OnModuleInit } from '@nestjs/common';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { academicTerms, courseOfferings, OFFERING_CATEGORIES, subjects, timetableSlots } from '../db/schema.js';
import { qualified } from '../campus-life/kit-shared.js';
import { RecordRegistry, type FieldOption, type KitCtx, type RecordEntity } from '../records/entity.js';
import { choices, kitEntity, rowOf } from '../research/kit.js';
import { REGISTRATION_ADMIN } from './course-registration.controller.js';
import { CourseRegistrationService } from './course-registration.service.js';

const termOptions = async (ctx: KitCtx): Promise<FieldOption[]> => (await ctx.tx.select({ id: academicTerms.id, name: academicTerms.name }).from(academicTerms).orderBy(desc(academicTerms.startsOn))).map((t) => ({ value: t.id, label: t.name }));
const subjectOptions = async (ctx: KitCtx): Promise<FieldOption[]> => (await ctx.tx.select({ id: subjects.id, code: subjects.code, name: subjects.name }).from(subjects).orderBy(asc(subjects.code))).map((s) => ({ value: s.id, label: `${s.code} ${s.name}` }));
const subjectByCode = async (ctx: KitCtx, text: string) => (await ctx.tx.select({ id: subjects.id }).from(subjects).where(sql`lower(${subjects.code}) = ${text.toLowerCase()}`).limit(1))[0]?.id ?? null;
const termByName = async (ctx: KitCtx, text: string) => (await ctx.tx.select({ id: academicTerms.id }).from(academicTerms).where(sql`lower(${academicTerms.name}) = ${text.toLowerCase()}`).limit(1))[0]?.id ?? null;
const taken = (status: string) => sql<number>`(select count(*)::int from course_registrations r where r.offering_id = ${qualified('course_offerings', 'id')} and r.status = ${status})`;

/**
 * A term's course offerings as a record kit list: added, edited and closed or reopened (singly or in bulk), with the
 * seats filled and the waitlist. A head of department sees and changes only the courses of their department; the seat
 * limit cannot drop below the seats filled, and raising it moves the waitlist up.
 */
@Injectable()
export class OfferingRecords implements OnModuleInit {
  constructor(
    private readonly registry: RecordRegistry,
    private readonly svc: CourseRegistrationService,
  ) {}

  onModuleInit(): void {
    this.registry.register(this.offerings());
  }

  private offerings(): RecordEntity {
    const svc = this.svc;
    const setStatus = (status: 'open' | 'closed') => async (ctx: KitCtx, id: string) => {
      const o = await rowOf(ctx, courseOfferings, id);
      await svc.checkDepartment(ctx.tx, ctx.p, [String(o.subjectId)]);
      if (o.status === status) return status === 'open' ? 'Already open' : 'Already closed';
      await ctx.tx.update(courseOfferings).set({ status, version: Number(o.version) + 1 }).where(eq(courseOfferings.id, id));
    };
    const e = kitEntity({
      key: 'course-offerings',
      module: 'courseRegistration',
      table: courseOfferings,
      subjectType: 'course_offering',
      roles: { read: REGISTRATION_ADMIN, write: REGISTRATION_ADMIN },
      title: 'subjectId',
      label: (r) => `${String(r.subjectCode ?? '')} ${String(r.subjectName ?? '')}`.trim(),
      fields: {
        termId: { label: 'Term', kind: 'ref', column: courseOfferings.termId, options: termOptions, required: true, edit: false, filter: true, lookup: termByName, help: 'The term name, as on the course registration page' },
        subjectId: { label: 'Subject', kind: 'ref', column: courseOfferings.subjectId, options: subjectOptions, required: true, edit: false, lookup: subjectByCode, help: 'The subject code' },
        category: { label: 'Category', kind: 'select', column: courseOfferings.category, options: choices(OFFERING_CATEGORIES), required: true, bulk: true, example: 'elective' },
        credits: { label: 'Credits', kind: 'number', column: courseOfferings.credits, required: true, min: 0, max: 30, example: '3' },
        seatCap: { label: 'Seats', kind: 'number', column: courseOfferings.seatCap, required: true, int: true, min: 0, max: 5000, bulk: true, example: '60' },
        feePaise: { label: 'Course fee', kind: 'money', column: courseOfferings.feePaise, bulk: true, help: 'In rupees; charged when the registration is approved (0 for none)' },
        facultyId: { label: 'Faculty', kind: 'user', column: courseOfferings.facultyId, bulk: true },
        prerequisiteSubjectId: { label: 'Prerequisite', kind: 'ref', column: courseOfferings.prerequisiteSubjectId, options: subjectOptions, lookup: subjectByCode },
        status: { label: 'Status', kind: 'select', column: courseOfferings.status, options: choices(['open', 'closed']), create: false, bulk: true },
      },
      extra: {
        subjectCode: subjects.code,
        subjectName: subjects.name,
        term: sql<string>`(select t.name from academic_terms t where t.id = ${qualified('course_offerings', 'term_id')})`,
        registered: taken('registered'),
        waitlisted: taken('waitlisted'),
        preferences: taken('preference'),
        version: courseOfferings.version,
      },
      joins: (q) => q.innerJoin(subjects, eq(subjects.id, courseOfferings.subjectId)),
      search: [subjects.code, subjects.name],
      sorts: { subject: subjects.code, registered: taken('registered') },
      defaultSort: { id: 'subject', dir: 'asc' },
      scope: (ctx) =>
        ctx.p.roles.some((r) => r === 'principal' || r === 'tenant_admin')
          ? undefined
          : sql`not exists (select 1 from subjects s join departments d on d.id = s.department_id where s.id = ${qualified('course_offerings', 'subject_id')} and d.head_user_id is not null and d.head_user_id <> ${ctx.p.userId}::uuid)`,
      importKey: ['termId', 'subjectId'],
      exportExtra: [
        { key: 'subjectCode', header: 'Subject code' },
        { key: 'subjectName', header: 'Subject name' },
        { key: 'term', header: 'Term name' },
        { key: 'registered', header: 'Registered' },
        { key: 'waitlisted', header: 'Waitlisted' },
      ],
      remove: { guard: async (ctx, id) => ((await ctx.tx.execute<{ n: number }>(sql`select count(*)::int as n from course_registrations where offering_id = ${id}::uuid`)).rows[0].n ? 'Students have registered for this course; close it instead' : null) },
      actions: {
        close: { label: 'Close registration', apply: setStatus('closed') },
        reopen: { label: 'Reopen registration', apply: setStatus('open') },
      },
    });
    // Semesters the course is open to, and the timetable slots it meets in (two courses clash when their slots overlap).
    e.list.select.eligibleSemesters = sql<string>`coalesce(array_to_string(${courseOfferings.eligibleSemesters}, ', '), '')`;
    e.list.select.slotIds = sql<string>`array_to_string(${courseOfferings.slotIds}, ', ')`;
    e.fields!.eligibleSemesters = {
      label: 'Open to semesters',
      type: 'text',
      help: 'Semester numbers separated by commas, for example 3, 5; empty for every semester',
      schema: z.union([z.string(), z.null()]).transform((v, c) => {
        const list = String(v ?? '').split(/[,;\s]+/).filter(Boolean).map(Number);
        if (list.some((n) => !Number.isInteger(n) || n < 1 || n > 20)) c.addIssue({ code: 'custom', message: 'Use semester numbers from 1 to 20, separated by commas' });
        return list.length ? [...new Set(list)] : null;
      }),
      bulk: true,
      apply: async (ctx, id, v) => void (await ctx.tx.update(courseOfferings).set({ eligibleSemesters: v as number[] | null }).where(eq(courseOfferings.id, id))),
    };
    e.fields!.slotIds = {
      label: 'Timetable slots',
      type: 'text',
      help: 'The ids of the timetable slots the course meets in, separated by commas',
      schema: z.union([z.string(), z.null()]).transform((v, c) => {
        const list = [...new Set(String(v ?? '').split(/[,;\s]+/).filter(Boolean))];
        if (list.some((x) => !z.uuid().safeParse(x).success)) c.addIssue({ code: 'custom', message: 'Give timetable slot ids separated by commas' });
        return list.slice(0, 40);
      }),
      apply: async (ctx, id, v) => {
        const ids = v as string[];
        if (ids.length && (await ctx.tx.select({ id: timetableSlots.id }).from(timetableSlots).where(inArray(timetableSlots.id, ids))).length !== ids.length) throw new ConflictException('One of the timetable slots does not exist');
        await ctx.tx.update(courseOfferings).set({ slotIds: ids }).where(eq(courseOfferings.id, id));
      },
    };
    // The builder's Add writes the columns; the two list fields above are written after it.
    const insert = e.create!;
    e.create = async (ctx, v) => {
      const { eligibleSemesters, slotIds, ...rest } = v;
      const id = await insert(ctx, rest);
      if (eligibleSemesters !== undefined) await e.fields!.eligibleSemesters.apply!(ctx, id, eligibleSemesters);
      if (slotIds !== undefined) await e.fields!.slotIds.apply!(ctx, id, slotIds);
      return id;
    };
    e.check = async (ctx, id) => {
      const o = await rowOf(ctx, courseOfferings, id);
      await svc.checkDepartment(ctx.tx, ctx.p, [String(o.subjectId)]);
      if (o.prerequisiteSubjectId && o.prerequisiteSubjectId === o.subjectId) throw new BadRequestException('A course cannot be its own prerequisite');
      const [dup] = await ctx.tx.select({ id: courseOfferings.id }).from(courseOfferings).where(and(eq(courseOfferings.termId, String(o.termId)), eq(courseOfferings.subjectId, String(o.subjectId)), sql`${courseOfferings.id} <> ${id}`));
      if (dup) throw new ConflictException('This subject is already offered in the term');
      if (Number(o.seatCap) < (await svc.seatsTaken(ctx.tx, id))) throw new ConflictException('The seat limit is below the seats already filled');
      // Every change counts as a new version (the registration pages check it), and freed seats go to the waitlist.
      const [row] = await ctx.tx.update(courseOfferings).set({ version: Number(o.version) + 1 }).where(eq(courseOfferings.id, id)).returning();
      await svc.promote(ctx.tx, row);
    };
    return e;
  }
}
