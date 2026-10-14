import { BadRequestException, Injectable, OnModuleInit } from '@nestjs/common';
import { asc, sql } from 'drizzle-orm';
import { diaryEntries, sections, subjects } from '../db/schema.js';
import { qualified } from '../campus-life/kit-shared.js';
import { RecordRegistry, type FieldOption, type KitCtx, type RecordEntity } from '../records/entity.js';
import { kitEntity, rowOf } from '../research/kit.js';
import { DiaryService } from './diary.controller.js';
import { DIARY_WRITERS, SchoolLifeService } from './school-life.service.js';

const sectionOptions = async (ctx: KitCtx): Promise<FieldOption[]> => (await ctx.tx.select({ id: sections.id, name: sections.displayName }).from(sections).orderBy(asc(sections.displayName))).map((s) => ({ value: s.id, label: s.name }));
const subjectOptions = async (ctx: KitCtx): Promise<FieldOption[]> => (await ctx.tx.select({ id: subjects.id, code: subjects.code, name: subjects.name }).from(subjects).orderBy(asc(subjects.code))).map((s) => ({ value: s.id, label: `${s.code} ${s.name}` }));
const sectionByName = async (ctx: KitCtx, text: string) => (await ctx.tx.select({ id: sections.id }).from(sections).where(sql`lower(${sections.displayName}) = ${text.toLowerCase()}`).limit(1))[0]?.id ?? null;
/** Principals, administrators and heads see every class; a teacher sees the classes they teach. */
const isLead = (ctx: KitCtx) => ctx.p.roles.some((r) => r === 'principal' || r === 'tenant_admin' || r === 'hod');

/**
 * The school diary as a record kit list across classes (filtered by class and date): an entry is written through the
 * kit's Add (families are told, as from the Teacher App), corrected, deleted to the recycle bin and restored; the
 * list shows how many families have read each entry. A teacher sees and writes for the classes they teach.
 */
@Injectable()
export class DiaryRecords implements OnModuleInit {
  constructor(
    private readonly registry: RecordRegistry,
    private readonly diary: DiaryService,
    private readonly svc: SchoolLifeService,
  ) {}

  onModuleInit(): void {
    this.registry.register(this.entries());
  }

  private entries(): RecordEntity {
    const diary = this.diary;
    const svc = this.svc;
    const e = kitEntity({
      key: 'diary-entries',
      module: 'diary',
      table: diaryEntries,
      subjectType: 'diary_entry',
      roles: { read: DIARY_WRITERS, write: DIARY_WRITERS },
      title: 'entryDate',
      label: (r) => `${String(r.section ?? '')} ${String(r.entryDate ?? '')}`.trim(),
      fields: {
        sectionId: { label: 'Class', kind: 'ref', column: diaryEntries.sectionId, options: sectionOptions, required: true, edit: false, filter: true, lookup: sectionByName },
        entryDate: { label: 'Date', kind: 'date', column: diaryEntries.entryDate, required: true, example: '2026-10-20' },
        subjectId: { label: 'Subject', kind: 'ref', column: diaryEntries.subjectId, options: subjectOptions },
        classwork: { label: 'Classwork', kind: 'textarea', column: diaryEntries.classwork, max: 3000 },
        homeworkNote: { label: 'Homework', kind: 'textarea', column: diaryEntries.homeworkNote, max: 3000 },
        notice: { label: 'Notice', kind: 'textarea', column: diaryEntries.notice, max: 3000 },
      },
      extra: {
        section: sql<string>`(select s.display_name from sections s where s.id = ${qualified('diary_entries', 'section_id')})`,
        subject: sql<string | null>`(select s.name from subjects s where s.id = ${qualified('diary_entries', 'subject_id')})`,
        author: sql<string>`(select u.full_name from users u where u.id = ${qualified('diary_entries', 'author_id')})`,
        acknowledged: sql<number>`(select count(*)::int from diary_acks a where a.entry_id = ${qualified('diary_entries', 'id')})`,
        students: sql<number>`(select count(*)::int from students st where st.section_id = ${qualified('diary_entries', 'section_id')})`,
      },
      filters: {
        from: { label: 'From', where: (v) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? sql`${diaryEntries.entryDate} >= ${v}` : undefined) },
        to: { label: 'To', where: (v) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? sql`${diaryEntries.entryDate} <= ${v}` : undefined) },
      },
      search: [diaryEntries.classwork, diaryEntries.homeworkNote, diaryEntries.notice],
      defaultSort: { id: 'entryDate', dir: 'desc' },
      scope: (ctx) => (isLead(ctx) ? undefined : sql`exists (select 1 from timetable_slots ts where ts.teacher_id = ${ctx.p.userId}::uuid and ts.section_id = ${qualified('diary_entries', 'section_id')} and ts.archived_at is null)`),
      importKey: ['sectionId', 'entryDate'],
      remove: { guard: async (ctx, id) => (isLead(ctx) || (await rowOf(ctx, diaryEntries, id)).authorId === ctx.p.userId ? null : 'Only the teacher who wrote this entry, or the principal, can delete it') },
      exportExtra: [
        { key: 'section', header: 'Class name' },
        { key: 'author', header: 'Written by' },
        { key: 'acknowledged', header: 'Families who read it' },
      ],
    });
    // Writing goes through the diary service: the class check, the author and telling the families.
    e.create = async (ctx, v) => {
      const row = await diary.create(ctx.tx, ctx.p, { sectionId: String(v.sectionId), subjectId: (v.subjectId as string | null) ?? undefined, entryDate: (v.entryDate as string | undefined) ?? undefined, classwork: String(v.classwork ?? ''), homeworkNote: String(v.homeworkNote ?? ''), notice: String(v.notice ?? '') });
      return row.id;
    };
    e.check = async (ctx, id) => {
      const r = await rowOf(ctx, diaryEntries, id);
      await svc.assertCanActFor(ctx.tx, ctx.p, String(r.sectionId));
      if (!String(r.classwork ?? '').trim() && !String(r.homeworkNote ?? '').trim() && !String(r.notice ?? '').trim()) throw new BadRequestException('Write classwork, a homework note or a notice');
    };
    // The text columns are never null: an emptied box is stored as an empty string.
    for (const k of ['classwork', 'homeworkNote', 'notice']) e.fields![k].schema = e.fields![k].schema.transform((x: unknown) => (x ?? '') as string);
    return e;
  }
}
