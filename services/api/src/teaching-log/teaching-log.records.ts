import { BadRequestException, ForbiddenException, Injectable, OnModuleInit } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { subjectOptions, teacherOptions } from '../academic-planning/planning.records.js';
import { sectionOptions } from '../admin/structure.records.js';
import type { RoleName } from '../auth/principal.js';
import { AGAINST_PLAN, TEACHING_DELIVERIES, teachingLogs as tl } from '../db/schema-academics-pass.js';
import { sections, subjects, users } from '../db/schema.js';
import { RecordRegistry, type FieldOption, type KitCtx, type RecordEntity } from '../records/entity.js';
import { OptionalText, uuidEq } from '../records/helpers.js';

const ADMIN: RoleName[] = ['tenant_admin', 'principal'];
const HEADS: RoleName[] = [...ADMIN, 'hod'];
const DELIVERY: FieldOption[] = TEACHING_DELIVERIES.map((v) => ({ value: v, label: v.replace('_', ' ').replace(/^./, (c) => c.toUpperCase()) }));
const PLAN: FieldOption[] = [
  { value: 'as_planned', label: 'As planned' },
  { value: 'ahead', label: 'Ahead of plan' },
  { value: 'behind', label: 'Behind plan' },
  { value: 'unplanned', label: 'No plan' },
];
const headed = (ctx: KitCtx) => sql`${tl.subjectId} in (select s.id from subjects s join departments d on d.id = s.department_id where d.head_user_id = ${ctx.p.userId}::uuid)`;
const topicTitles = sql<string>`(select string_agg(t.title, '; ' order by t.position) from topics t where t.id = any(${tl.topicIds}))`;

/** The teaching diary as a record kit list: search, filters, export, history, edit of what was done, delete to the bin. */
export function teachingLogsEntity(): RecordEntity {
  return {
    key: 'teaching-logs',
    module: 'academics',
    table: tl,
    subjectType: 'teaching_log',
    roles: { read: [...HEADS, 'teacher', 'exam_controller'], write: [...HEADS, 'teacher'] },
    label: (r) => `${r.date ?? ''} ${r.section ?? ''} ${r.subjectCode ?? ''}`.trim(),
    list: {
      select: {
        id: tl.id,
        date: tl.date,
        startsAt: sql<string>`to_char(${tl.startsAt}, 'HH24:MI')`,
        endsAt: sql<string>`to_char(${tl.endsAt}, 'HH24:MI')`,
        sectionId: tl.sectionId,
        section: sections.displayName,
        subjectId: tl.subjectId,
        subjectCode: subjects.code,
        subject: subjects.name,
        teacherId: tl.teacherId,
        teacher: users.fullName,
        batch: tl.batch,
        topics: topicTitles,
        topicCount: sql<number>`cardinality(${tl.topicIds})`,
        delivery: tl.delivery,
        summary: tl.summary,
        againstPlan: tl.againstPlan,
        deviationReason: tl.deviationReason,
        source: tl.source,
        substitute: tl.substitute,
        reviewedAt: tl.reviewedAt,
        reviewRemark: tl.reviewRemark,
      },
      joins: (q) => q.innerJoin(sections, eq(sections.id, tl.sectionId)).innerJoin(subjects, eq(subjects.id, tl.subjectId)).innerJoin(users, eq(users.id, tl.teacherId)),
      search: [sections.displayName, subjects.code, subjects.name, users.fullName, tl.summary],
      filters: {
        class: { label: 'Class', options: sectionOptions, where: (v) => uuidEq(tl.sectionId, v) },
        subject: { label: 'Course', options: subjectOptions, where: (v) => uuidEq(tl.subjectId, v) },
        teacher: { label: 'Teacher', options: teacherOptions, where: (v) => uuidEq(tl.teacherId, v) },
        plan: { label: 'Against plan', options: PLAN, where: (v) => (PLAN.some((o) => o.value === v) ? eq(tl.againstPlan, v) : undefined) },
        reviewed: { label: 'Review', options: [{ value: 'no', label: 'Not reviewed' }, { value: 'yes', label: 'Reviewed' }], where: (v) => (v === 'no' ? sql`${tl.reviewedAt} is null` : v === 'yes' ? sql`${tl.reviewedAt} is not null` : undefined) },
        month: { label: 'Month', where: (v) => (/^\d{4}-\d{2}$/.test(v) ? sql`to_char(${tl.date}, 'YYYY-MM') = ${v}` : undefined) },
        source: { label: 'Written from', options: [{ value: 'erp', label: 'ERP' }, { value: 'teacher_app', label: 'Teacher App' }, { value: 'board', label: 'Smart board' }], where: (v) => (['erp', 'teacher_app', 'board'].includes(v) ? eq(tl.source, v) : undefined) },
      },
      sorts: { date: tl.date, class: sections.displayName, subject: subjects.code, teacher: users.fullName, plan: tl.againstPlan },
      defaultSort: { id: 'date', dir: 'desc' },
      tiebreak: [tl.startsAt],
      scope: (ctx) => (ctx.p.roles.some((r) => ADMIN.includes(r) || r === 'exam_controller') ? undefined : ctx.p.roles.includes('hod') ? sql`(${headed(ctx)} or ${tl.teacherId} = ${ctx.p.userId}::uuid)` : eq(tl.teacherId, ctx.p.userId)),
    },
    fields: {
      delivery: { label: 'Delivery', type: 'select', schema: z.enum(TEACHING_DELIVERIES), column: tl.delivery, options: DELIVERY, create: false, bulk: true },
      summary: { label: 'What was done', type: 'textarea', schema: OptionalText(2000).transform((v) => v ?? ''), column: tl.summary, create: false },
      againstPlan: { label: 'Against plan', type: 'select', schema: z.enum(AGAINST_PLAN), column: tl.againstPlan, options: PLAN, create: false },
      deviationReason: { label: 'Why it differed', type: 'text', schema: OptionalText(500).transform((v) => v ?? ''), column: tl.deviationReason, create: false },
    },
    create: async () => {
      throw new BadRequestException('Write a diary entry from the period (Teaching diary → Periods to log)');
    },
    check: async (ctx, id) => {
      const [r] = await ctx.tx.select().from(tl).where(eq(tl.id, id));
      if (!r) return;
      if (r.teacherId !== ctx.p.userId && !ctx.p.roles.some((x) => ADMIN.includes(x))) throw new ForbiddenException('Only the teacher who taught the period edits its diary');
      if (r.againstPlan === 'behind' && !r.deviationReason.trim()) throw new BadRequestException('Say why the period fell behind its lesson plan');
      // An edit takes the entry back for review.
      await ctx.tx.update(tl).set({ reviewedAt: null, reviewedBy: null, updatedAt: new Date() }).where(and(eq(tl.id, id), sql`${tl.reviewedAt} is not null`));
    },
    remove: { guard: async (ctx, id) => ((await ctx.tx.select({ id: tl.id }).from(tl).where(and(eq(tl.id, id), ctx.p.roles.some((x) => ADMIN.includes(x)) ? undefined : eq(tl.teacherId, ctx.p.userId))))[0] ? null : 'Only the teacher who taught the period removes its diary entry') },
    columns: [
      { key: 'date', header: 'Date' },
      { key: 'startsAt', header: 'From' },
      { key: 'endsAt', header: 'To' },
      { key: 'section', header: 'Class' },
      { key: 'subjectCode', header: 'Code' },
      { key: 'subject', header: 'Course' },
      { key: 'teacher', header: 'Teacher' },
      { key: 'batch', header: 'Batch' },
      { key: 'topics', header: 'Topics taught' },
      { key: 'delivery', header: 'Delivery' },
      { key: 'summary', header: 'What was done' },
      { key: 'againstPlan', header: 'Against plan', value: (r) => PLAN.find((o) => o.value === r.againstPlan)?.label ?? String(r.againstPlan ?? '') },
      { key: 'deviationReason', header: 'Why it differed' },
      { key: 'substitute', header: 'Substitute', value: (r) => (r.substitute ? 'Yes' : '') },
      { key: 'reviewedAt', header: 'Reviewed', value: (r) => (r.reviewedAt ? String(r.reviewedAt).slice(0, 10) : '') },
      { key: 'reviewRemark', header: 'Review remark' },
    ],
  };
}

@Injectable()
export class TeachingLogRecords implements OnModuleInit {
  constructor(private readonly registry: RecordRegistry) {}

  onModuleInit(): void {
    this.registry.register(teachingLogsEntity());
  }
}
