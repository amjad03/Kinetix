import { Injectable, OnModuleInit } from '@nestjs/common';
import { STUDENT_STATUSES, type StudentStatus } from '@zynetix/shared';
import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { programOptions, sectionOptions } from '../admin/structure.records.js';
import { studentProfiles } from '../db/schema-sis.js';
import { academicYears, programs, sections, students } from '../db/schema.js';
import { errorRow, ImportService, type RowResult } from '../import/import.service.js';
import { RecordRegistry, type FieldOption, type KitCtx, type RecordEntity } from '../records/entity.js';
import { DateText, OptionalText, Ref, Text, uuidEq } from '../records/helpers.js';
import { LifecycleService } from './lifecycle.service.js';
import { CATEGORIES, GENDERS } from './student-info.logic.js';
import { CLEARANCE_PURPOSES, StudentInfoService } from './student-info.service.js';
import { LIFECYCLE_ROLES, PROFILE_ROLES } from './students.controller.js';

const STATUS_LABELS: Record<string, string> = {
  enrolled: 'Enrolled',
  active: 'Active',
  on_leave: 'On leave',
  detained: 'Detained',
  promoted: 'Promoted',
  transferred: 'Transferred out',
  alumni: 'Alumni',
  dropped: 'Dropped out',
  suspended: 'Suspended',
  expelled: 'Expelled',
  deceased: 'Deceased',
  deferred: 'Deferred',
  long_absent: 'Long absent',
};
const STATUS_OPTIONS: FieldOption[] = STUDENT_STATUSES.filter((s) => s !== 'applicant').map((s) => ({ value: s, label: STATUS_LABELS[s] ?? s }));
const LANGUAGES = ['en', 'hi', 'kn'];
/** Import columns that fill the student's profile: column → profile field. */
const PROFILE_IMPORT = [['admission_no', 'admissionNo'], ['register_no', 'registerNo'], ['date_of_birth', 'dateOfBirth'], ['gender', 'gender'], ['category', 'category'], ['religion', 'religion']] as const;
const RELATIONS = ['father', 'mother', 'guardian', 'grandparent', 'sibling'];

const guardianCount = sql<number>`(select count(*)::int from guardians g where g.student_id = ${students.id})`;
const GENDER_OPTIONS: FieldOption[] = GENDERS.map((g) => ({ value: g, label: g[0].toUpperCase() + g.slice(1) }));
const CATEGORY_OPTIONS: FieldOption[] = CATEGORIES.map((c) => ({ value: c, label: c === 'general' || c === 'other' ? c[0].toUpperCase() + c.slice(1) : c.toUpperCase() }));

/**
 * Students as a record kit entity — the template other modules copy. Class changes and status changes go through
 * the lifecycle service so the student's permanent record stays complete; the kit adds the bin, bulk edit, move
 * (between classes and programmes), bulk promote, duplicate, import, export, history and saved views.
 */
@Injectable()
export class StudentRecords implements OnModuleInit {
  constructor(
    private readonly registry: RecordRegistry,
    private readonly lifecycle: LifecycleService,
    private readonly imports: ImportService,
    private readonly info: StudentInfoService,
  ) {}

  /** A profile detail set from the list (add, edit, bulk edit), through the profile's own checks and history. */
  private profileField(key: string) {
    return async (ctx: KitCtx, id: string, value: unknown) => void (await this.info.updateDetails(ctx.tx, ctx.p, id, { values: { [key]: (value as string | null) ?? null } }, { skipRoleCheck: true, via: 'list' }));
  }

  onModuleInit(): void {
    this.registry.register(this.entity());
  }

  entity(): RecordEntity {
    return {
      key: 'students',
      module: 'students',
      table: students,
      subjectType: 'student',
      roles: { read: PROFILE_ROLES, write: LIFECYCLE_ROLES },
      label: (r) => `${r.rollNo} ${r.fullName}`,
      list: {
        select: {
          id: students.id,
          fullName: students.fullName,
          rollNo: students.rollNo,
          status: students.status,
          sectionId: students.sectionId,
          className: sections.displayName,
          programId: sections.programId,
          programName: programs.name,
          term: sections.term,
          yearLabel: academicYears.label,
          enrolledOn: students.enrolledOn,
          hasLogin: sql<boolean>`${students.userId} is not null`,
          guardianCount,
          admissionNo: studentProfiles.admissionNo,
          registerNo: studentProfiles.registerNo,
          gender: studentProfiles.gender,
          category: studentProfiles.category,
          dateOfBirth: studentProfiles.dateOfBirth,
          updatedAt: students.updatedAt,
        },
        joins: (q) =>
          q
            .innerJoin(sections, eq(sections.id, students.sectionId))
            .innerJoin(programs, eq(programs.id, sections.programId))
            .innerJoin(academicYears, eq(academicYears.id, sections.academicYearId))
            .leftJoin(studentProfiles, eq(studentProfiles.studentId, students.id)),
        search: [students.fullName, students.rollNo, sections.displayName, studentProfiles.admissionNo, studentProfiles.registerNo],
        filters: {
          section: { label: 'Class', options: sectionOptions, where: (v) => uuidEq(students.sectionId, v) },
          programme: { label: 'Programme', options: programOptions, where: (v) => uuidEq(sections.programId, v) },
          term: { label: 'Term', where: (v) => (/^\d{1,2}$/.test(v) ? eq(sections.term, Number(v)) : undefined) },
          status: { label: 'Status', options: STATUS_OPTIONS, where: (v) => ((STUDENT_STATUSES as readonly string[]).includes(v) ? eq(students.status, v) : undefined) },
          gender: { label: 'Gender', options: GENDER_OPTIONS, where: (v) => ((GENDERS as readonly string[]).includes(v) ? eq(studentProfiles.gender, v) : undefined) },
          category: { label: 'Category', options: CATEGORY_OPTIONS, where: (v) => ((CATEGORIES as readonly string[]).includes(v) ? eq(studentProfiles.category, v) : undefined) },
          admissionNo: { label: 'Admission number', options: [{ value: 'missing', label: 'No admission number' }, { value: 'set', label: 'Has an admission number' }], where: (v) => (v === 'missing' ? sql`${studentProfiles.admissionNo} is null` : v === 'set' ? sql`${studentProfiles.admissionNo} is not null` : undefined) },
        },
        sorts: { name: students.fullName, roll: students.rollNo, class: sections.displayName, programme: programs.name, status: students.status, enrolled: students.enrolledOn, admissionNo: studentProfiles.admissionNo, dob: studentProfiles.dateOfBirth },
        defaultSort: { id: 'class', dir: 'asc' },
        tiebreak: [students.rollNo],
      },
      fields: {
        fullName: { label: 'Full name', type: 'text', schema: Text(120), column: students.fullName, required: true },
        rollNo: { label: 'Roll number', type: 'text', schema: Text(40), column: students.rollNo, required: true, help: 'Unique in the class' },
        sectionId: { label: 'Class', type: 'select', schema: Ref, column: students.sectionId, options: sectionOptions, required: true, edit: false, help: 'To change the class later, use Move' },
        enrolledOn: { label: 'Enrolled on', type: 'date', schema: DateText, column: students.enrolledOn, bulk: true },
        status: {
          label: 'Status',
          type: 'select',
          schema: z.enum(STUDENT_STATUSES),
          options: STATUS_OPTIONS,
          create: false,
          edit: false,
          bulk: true,
          help: 'Changed through the student lifecycle rules',
          apply: async (ctx, id, value) => void (await this.lifecycle.changeStatus(ctx.tx, ctx.p, id, value as StudentStatus, { reason: 'Changed in bulk edit' })),
        },
        admissionNo: { label: 'Admission number', type: 'text', schema: OptionalText(40), apply: this.profileField('admissionNo'), help: 'Unique in the institution' },
        registerNo: { label: 'University register number', type: 'text', schema: OptionalText(40), apply: this.profileField('registerNo') },
        dateOfBirth: { label: 'Date of birth', type: 'date', schema: DateText, apply: this.profileField('dateOfBirth') },
        gender: { label: 'Gender', type: 'select', schema: z.enum(GENDERS).nullable(), options: GENDER_OPTIONS, bulk: true, apply: this.profileField('gender') },
        category: { label: 'Category', type: 'select', schema: z.enum(CATEGORIES).nullable(), options: CATEGORY_OPTIONS, bulk: true, apply: this.profileField('category') },
      },
      move: {
        label: 'Move to class',
        options: sectionOptions,
        reason: true,
        apply: async (ctx, id, to, reason) => void (await this.lifecycle.changeSection(ctx.tx, ctx.p, id, to, reason ?? 'Moved', { anyProgram: true })),
      },
      actions: {
        promote: {
          label: 'Promote to next class',
          roles: LIFECYCLE_ROLES,
          params: z.object({ label: z.string().trim().min(3).max(120).default('Promoted'), toSectionId: z.uuid().optional() }),
          apply: (ctx, id, params) => {
            const p = params as { label: string; toSectionId?: string };
            return this.lifecycle.promoteOne(ctx.tx, ctx.p, id, p.label, p.toSectionId);
          },
        },
        admissionNo: {
          label: 'Give admission numbers',
          roles: ['tenant_admin', 'principal', 'admissions_officer'],
          apply: (ctx, id) => this.info.assignAdmissionNo(ctx.tx, ctx.p, id),
        },
        clearance: {
          label: 'Start no-dues clearance',
          roles: ['tenant_admin', 'principal', 'admissions_officer'],
          params: z.object({ purpose: z.enum(CLEARANCE_PURPOSES).default('tc') }),
          apply: async (ctx, id, params) => {
            const c = await this.info.raiseClearance(ctx.tx, ctx.p, id, { purpose: (params as { purpose: string }).purpose });
            const waiting = c.items.filter((i) => i.status !== 'cleared').map((i) => i.label);
            return waiting.length ? `Waiting on ${waiting.join(', ')}` : 'Cleared';
          },
        },
      },
      duplicate: async (ctx, row) => ({
        full_name: `${row.full_name} (copy)`,
        roll_no: await this.lifecycle.freeRollNo(ctx.tx, String(row.section_id), `${row.roll_no}-2`),
        user_id: null,
        application_id: null,
        status: 'active',
        status_changed_at: null,
      }),
      columns: [
        { key: 'rollNo', header: 'Roll no' },
        { key: 'fullName', header: 'Student' },
        { key: 'className', header: 'Class' },
        { key: 'programName', header: 'Programme' },
        { key: 'term', header: 'Term' },
        { key: 'status', header: 'Status', value: (r) => STATUS_LABELS[String(r.status)] ?? String(r.status) },
        { key: 'enrolledOn', header: 'Enrolled on' },
        { key: 'admissionNo', header: 'Admission no' },
        { key: 'registerNo', header: 'Register no' },
        { key: 'gender', header: 'Gender' },
        { key: 'category', header: 'Category' },
        { key: 'dateOfBirth', header: 'Date of birth' },
        { key: 'guardianCount', header: 'Guardians' },
        { key: 'hasLogin', header: 'Has a login' },
      ],
      import: {
        columns: [
          { key: 'roll_no', header: 'Roll number', required: true, help: 'Unique in the institution; rows are matched on it', example: 'BSC1A001' },
          { key: 'full_name', header: 'Full name', required: true, help: 'In any script', example: 'Aditi Kulkarni' },
          { key: 'section', header: 'Class', required: true, help: 'The class as shown, e.g. BSc Sem 1 A', options: async (ctx) => (await sectionOptions(ctx)).map((o) => o.label) },
          { key: 'student_email', header: 'Student email', help: 'Optional: gives the student a login' },
          { key: 'student_phone', header: 'Student phone', help: 'Optional: gives the student a login' },
          { key: 'preferred_language', header: 'Language', help: 'en, hi or kn (default en)', options: LANGUAGES },
          { key: 'guardian1_name', header: 'Guardian 1 name', example: 'Ramesh Kulkarni' },
          { key: 'guardian1_phone', header: 'Guardian 1 phone', help: 'Brothers and sisters with the same parent phone share one parent login', example: '+919900000201' },
          { key: 'guardian1_relation', header: 'Guardian 1 relation', options: RELATIONS, example: 'father' },
          { key: 'guardian1_language', header: 'Guardian 1 language', options: LANGUAGES },
          { key: 'guardian2_name', header: 'Guardian 2 name' },
          { key: 'guardian2_phone', header: 'Guardian 2 phone' },
          { key: 'guardian2_relation', header: 'Guardian 2 relation', options: RELATIONS },
          { key: 'guardian2_language', header: 'Guardian 2 language', options: LANGUAGES },
          { key: 'admission_no', header: 'Admission number', help: 'Optional: unique in the institution' },
          { key: 'register_no', header: 'University register number' },
          { key: 'date_of_birth', header: 'Date of birth', help: 'Like 2008-06-15', example: '2008-06-15' },
          { key: 'gender', header: 'Gender', options: [...GENDERS] },
          { key: 'category', header: 'Category', options: [...CATEGORIES] },
          { key: 'religion', header: 'Religion' },
        ],
        key: ['roll_no'],
        exists: async (ctx, r) => !!(await ctx.tx.select({ id: students.id }).from(students).where(eq(students.rollNo, r.get('roll_no'))).limit(1))[0],
        // The bulk importer's student rows (families, logins, roll numbers) are the one place students are imported.
        run: async (ctx, rows) => {
          const out: RowResult[] = [];
          for (const r of rows) {
            try {
              out.push(
                await ctx.tx.transaction(async (sp) => {
                  const [one] = await this.imports.applyRows(sp, ctx.p, 'students', [r]);
                  if (one.status === 'error') return one;
                  // The profile details on the same row go through the profile's checks (unique admission number and so on).
                  const values = Object.fromEntries(PROFILE_IMPORT.map(([col, key]) => [key, r.get(col)]).filter(([, v]) => v !== ''));
                  if (!Object.keys(values).length) return one;
                  const [st] = await sp.select({ id: students.id }).from(students).where(eq(students.rollNo, r.get('roll_no'))).limit(1);
                  const result = { changed: false };
                  if (st) await this.info.updateDetails(sp, ctx.p, st.id, { values }, { skipRoleCheck: true, via: 'import', result });
                  return result.changed && one.status === 'skipped' ? { ...one, status: 'updated' as const } : one;
                }),
              );
            } catch (e) {
              out.push(errorRow(r.line, e));
            }
          }
          return out;
        },
      },
    };
  }
}
