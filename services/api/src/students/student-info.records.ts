import { BadRequestException, Injectable, OnModuleInit } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { z } from 'zod';
import { programOptions, sectionOptions } from '../admin/structure.records.js';
import type { RoleName } from '../auth/principal.js';
import { normalizePhone } from '../auth/phone.js';
import { studentChangeRequests, studentClearances, studentCustomFields } from '../db/schema-sis.js';
import { guardians, sections, students, users } from '../db/schema.js';
import { fail, lc, outcome, required } from '../import/row-helpers.js';
import { RecordRegistry, type FieldOption, type RecordEntity } from '../records/entity.js';
import { copyName, OptionalText, Text, uuidEq } from '../records/helpers.js';
import { eachRow } from '../records/import.js';
import { LifecycleService } from './lifecycle.service.js';
import { CHANGE_DECIDE_ROLES, CLEARANCE_LEADS, StudentInfoService } from './student-info.service.js';
import { GUARDIAN_ROLES, PROFILE_ROLES } from './students.controller.js';

const ADMIN: RoleName[] = ['tenant_admin', 'principal'];
/** Roles a custom field can be shown to or edited by. */
export const FIELD_ROLES = ['tenant_admin', 'principal', 'admissions_officer', 'hod', 'teacher', 'accountant', 'counsellor', 'exam_controller', 'librarian', 'hostel_warden'] as const;
const FIELD_TYPES: FieldOption[] = ['text', 'number', 'date', 'select', 'boolean'].map((v) => ({ value: v, label: v[0].toUpperCase() + v.slice(1) }));
const RELATIONS: FieldOption[] = ['father', 'mother', 'guardian', 'grandparent', 'sibling'].map((v) => ({ value: v, label: v[0].toUpperCase() + v.slice(1) }));
const yesNo = (label: string): FieldOption[] => [
  { value: 'yes', label },
  { value: 'no', label: `Not ${label.toLowerCase()}` },
];

/** "a, b, c" → ["a", "b", "c"] (trimmed, no blanks, no repeats). */
const listOf = (max: number) =>
  z
    .string()
    .max(2000)
    .nullable()
    .transform((s) => [...new Set((s ?? '').split(/[,\n]/).map((x) => x.trim()).filter(Boolean))].slice(0, max));
const RoleList = listOf(20).refine((l) => l.every((r) => (FIELD_ROLES as readonly string[]).includes(r)), { message: `Use role names: ${FIELD_ROLES.join(', ')}` });
const jsonText = (col: unknown) => sql<string>`(select coalesce(string_agg(x, ', '), '') from jsonb_array_elements_text(${col}) x)`;

/**
 * The student-information lists as record kit entities: the institution's custom profile fields, profile change
 * requests (approve and reject in bulk), no-dues clearances, and guardian links (with an import for linking families).
 */
@Injectable()
export class StudentInfoRecords implements OnModuleInit {
  constructor(
    private readonly registry: RecordRegistry,
    private readonly svc: StudentInfoService,
    private readonly lifecycle: LifecycleService,
  ) {}

  onModuleInit(): void {
    this.registry.register(this.customFields());
    this.registry.register(this.changeRequests());
    this.registry.register(this.clearances());
    this.registry.register(this.guardianLinks());
  }

  customFields(): RecordEntity {
    const f = studentCustomFields;
    return {
      key: 'student-custom-fields',
      module: 'students',
      table: f,
      subjectType: 'student_custom_field',
      roles: { read: PROFILE_ROLES, write: ADMIN },
      label: (r) => String(r.label),
      list: {
        select: {
          id: f.id,
          key: f.key,
          label: f.label,
          type: f.type,
          optionsText: jsonText(f.options),
          required: f.required,
          help: f.help,
          viewRolesText: jsonText(f.viewRoles),
          editRolesText: jsonText(f.editRoles),
          requestable: f.requestable,
          active: f.active,
          sortOrder: f.sortOrder,
          filled: sql<number>`(select count(*)::int from student_profiles sp where sp.custom ? ${f.key} and sp.custom ->> ${f.key} is not null)`,
        },
        search: [f.label, f.key],
        filters: {
          type: { label: 'Type', options: FIELD_TYPES, where: (v) => eq(f.type, v) },
          active: { label: 'In use', options: yesNo('In use'), where: (v) => (v === 'yes' ? eq(f.active, true) : v === 'no' ? eq(f.active, false) : undefined) },
        },
        sorts: { order: f.sortOrder, label: f.label, type: f.type },
        defaultSort: { id: 'order', dir: 'asc' },
      },
      fields: {
        label: { label: 'Label', type: 'text', schema: Text(120), column: f.label, required: true },
        key: { label: 'Key', type: 'text', schema: z.string().trim().regex(/^[a-z][a-z0-9_]{1,40}$/, 'Use lowercase letters, digits and underscores'), column: f.key, required: true, edit: false, help: 'Stored with each value: blood_group, hobby, house' },
        type: { label: 'Type', type: 'select', schema: z.enum(['text', 'number', 'date', 'select', 'boolean']), column: f.type, options: FIELD_TYPES, required: true },
        options: { label: 'Choices', type: 'textarea', schema: listOf(60), column: f.options, rowKey: 'optionsText', help: 'For a choice field: the choices, separated by commas' },
        required: { label: 'Required', type: 'boolean', schema: z.boolean(), column: f.required, bulk: true },
        help: { label: 'Help text', type: 'text', schema: OptionalText(200), column: f.help },
        viewRoles: { label: 'Visible to', type: 'text', schema: RoleList, column: f.viewRoles, rowKey: 'viewRolesText', bulk: true, help: 'Roles, separated by commas; empty: everyone who may open a profile' },
        editRoles: { label: 'Changed by', type: 'text', schema: RoleList, column: f.editRoles, rowKey: 'editRolesText', bulk: true, help: 'Roles, separated by commas; empty: the admissions office, principal and administrator' },
        requestable: { label: 'Students and parents may ask to change it', type: 'boolean', schema: z.boolean(), column: f.requestable, bulk: true },
        active: { label: 'In use', type: 'boolean', schema: z.boolean(), column: f.active, bulk: true },
      },
      order: { column: f.sortOrder },
      duplicate: async (ctx, row) => {
        const label = await copyName(ctx.tx, f, f.label, String(row.label));
        let key = `${row.key}_copy`;
        for (let n = 2; (await ctx.tx.select({ id: f.id }).from(f).where(eq(f.key, key)))[0]; n++) key = `${row.key}_copy${n}`;
        return { label, key };
      },
      columns: [
        { key: 'label', header: 'Label' },
        { key: 'key', header: 'Key' },
        { key: 'type', header: 'Type' },
        { key: 'optionsText', header: 'Choices' },
        { key: 'required', header: 'Required' },
        { key: 'viewRolesText', header: 'Visible to' },
        { key: 'editRolesText', header: 'Changed by' },
        { key: 'requestable', header: 'Requestable' },
        { key: 'active', header: 'In use' },
        { key: 'filled', header: 'Students with a value' },
      ],
      import: {
        columns: [
          { key: 'key', header: 'Key', required: true, help: 'Lowercase letters, digits and underscores; rows are matched on it', example: 'blood_group' },
          { key: 'label', header: 'Label', required: true, example: 'Blood group' },
          { key: 'type', header: 'Type', required: true, options: ['text', 'number', 'date', 'select', 'boolean'], example: 'select' },
          { key: 'options', header: 'Choices', help: 'For a choice field, separated by commas', example: 'A+, A-, B+, B-, O+, O-, AB+, AB-' },
          { key: 'required', header: 'Required', options: ['yes', 'no'] },
          { key: 'help', header: 'Help text' },
        ],
        key: ['key'],
        exists: async (ctx, r) => !!(await ctx.tx.select({ id: f.id }).from(f).where(eq(f.key, lc(r.get('key')))).limit(1))[0],
        run: (ctx, rows) =>
          eachRow(ctx.tx, rows, async (tx, r) => {
            const key = lc(required(r, 'key'));
            if (!/^[a-z][a-z0-9_]{1,40}$/.test(key)) fail('Use lowercase letters, digits and underscores', key);
            const type = lc(required(r, 'type'));
            if (!['text', 'number', 'date', 'select', 'boolean'].includes(type)) fail('Choose one of the listed values', type);
            const options = [...new Set(r.get('options').split(',').map((x) => x.trim()).filter(Boolean))];
            if (type === 'select' && options.length < 2) fail('Give at least two choices', key);
            const values = { label: required(r, 'label'), type, options, required: lc(r.get('required')) === 'yes', help: r.get('help') || null };
            const [found] = await tx.select().from(f).where(eq(f.key, key));
            if (!found) {
              await tx.insert(f).values({ tenantId: ctx.p.tenantId, key, ...values, sortOrder: 1_000_000 });
              return outcome(true, false, [values.label]);
            }
            const changed = found.label !== values.label || found.type !== values.type || JSON.stringify(found.options) !== JSON.stringify(values.options) || found.required !== values.required || (found.help ?? null) !== values.help;
            if (changed) await tx.update(f).set(values).where(eq(f.id, found.id));
            return outcome(false, changed, [values.label]);
          }),
      },
    };
  }

  changeRequests(): RecordEntity {
    const r = studentChangeRequests;
    const requester = alias(users, 'requester');
    const decider = alias(users, 'decider');
    return {
      key: 'student-change-requests',
      module: 'students',
      table: r,
      subjectType: 'student_change_request',
      roles: { read: PROFILE_ROLES, write: CHANGE_DECIDE_ROLES },
      label: (x) => `${x.studentName}: ${x.fieldLabel}`,
      list: {
        select: {
          id: r.id,
          studentId: r.studentId,
          studentName: students.fullName,
          rollNo: students.rollNo,
          className: sections.displayName,
          field: r.field,
          fieldLabel: r.fieldLabel,
          currentValue: r.currentValue,
          newValue: r.newValue,
          reason: r.reason,
          status: r.status,
          requestedAs: r.requestedAs,
          requesterName: requester.fullName,
          deciderName: decider.fullName,
          decisionNote: r.decisionNote,
          decidedAt: r.decidedAt,
          createdAt: r.createdAt,
        },
        joins: (q) => q.innerJoin(students, eq(students.id, r.studentId)).innerJoin(sections, eq(sections.id, students.sectionId)).leftJoin(requester, eq(requester.id, r.requestedBy)).leftJoin(decider, eq(decider.id, r.decidedBy)),
        search: [students.fullName, students.rollNo, r.fieldLabel, r.newValue],
        filters: {
          status: { label: 'Status', options: ['pending', 'approved', 'rejected', 'cancelled'].map((v) => ({ value: v, label: v[0].toUpperCase() + v.slice(1) })), where: (v) => eq(r.status, v) },
          requestedAs: { label: 'Asked by', options: ['student', 'guardian', 'staff'].map((v) => ({ value: v, label: v[0].toUpperCase() + v.slice(1) })), where: (v) => eq(r.requestedAs, v) },
          section: { label: 'Class', options: sectionOptions, where: (v) => uuidEq(students.sectionId, v) },
        },
        sorts: { created: r.createdAt, student: students.fullName, field: r.fieldLabel, status: r.status, decided: r.decidedAt },
        defaultSort: { id: 'created', dir: 'desc' },
      },
      actions: {
        approve: { label: 'Approve', params: z.object({ note: z.string().trim().max(500).optional() }), apply: (ctx, id, params) => this.svc.decideChange(ctx.tx, ctx.p, id, 'approve', (params as { note?: string }).note) },
        reject: { label: 'Reject', tone: 'danger', params: z.object({ note: z.string({ error: 'Say why the request is rejected' }).trim().min(3, 'Say why the request is rejected').max(500) }), apply: (ctx, id, params) => this.svc.decideChange(ctx.tx, ctx.p, id, 'reject', (params as { note: string }).note) },
      },
      columns: [
        { key: 'createdAt', header: 'Asked on' },
        { key: 'studentName', header: 'Student' },
        { key: 'rollNo', header: 'Roll no' },
        { key: 'className', header: 'Class' },
        { key: 'fieldLabel', header: 'Detail' },
        { key: 'currentValue', header: 'Now' },
        { key: 'newValue', header: 'Asked for' },
        { key: 'reason', header: 'Reason' },
        { key: 'requestedAs', header: 'Asked by' },
        { key: 'requesterName', header: 'Name' },
        { key: 'status', header: 'Status' },
        { key: 'deciderName', header: 'Decided by' },
        { key: 'decisionNote', header: 'Note' },
      ],
    };
  }

  clearances(): RecordEntity {
    const c = studentClearances;
    const total = sql<number>`(select count(*)::int from student_clearance_items i where i.clearance_id = ${c.id})`;
    const cleared = sql<number>`(select count(*)::int from student_clearance_items i where i.clearance_id = ${c.id} and i.status = 'cleared')`;
    const blocked = sql<string>`(select coalesce(string_agg(i.department, ', ' order by i.department), '') from student_clearance_items i where i.clearance_id = ${c.id} and i.status <> 'cleared')`;
    const dues = sql<number>`(select coalesce(sum(i.dues_paise), 0)::float from student_clearance_items i where i.clearance_id = ${c.id} and i.status <> 'cleared')`;
    return {
      key: 'student-clearances',
      module: 'students',
      table: c,
      subjectType: 'student_clearance',
      roles: { read: [...PROFILE_ROLES, 'librarian', 'hostel_warden', 'transport_manager'], write: [...CLEARANCE_LEADS, 'admissions_officer'] },
      label: (x) => `${x.studentName} (${x.purpose})`,
      list: {
        select: { id: c.id, studentId: c.studentId, studentName: students.fullName, rollNo: students.rollNo, className: sections.displayName, purpose: c.purpose, status: c.status, note: c.note, total, cleared, pendingWith: blocked, duesPaise: dues, createdAt: c.createdAt, completedAt: c.completedAt },
        joins: (q) => q.innerJoin(students, eq(students.id, c.studentId)).innerJoin(sections, eq(sections.id, students.sectionId)),
        search: [students.fullName, students.rollNo],
        filters: {
          status: { label: 'Status', options: ['open', 'cleared', 'cancelled'].map((v) => ({ value: v, label: v[0].toUpperCase() + v.slice(1) })), where: (v) => eq(c.status, v) },
          purpose: { label: 'For', options: [{ value: 'tc', label: 'Transfer certificate' }, { value: 'course_completion', label: 'Course completion' }, { value: 'migration', label: 'Migration' }, { value: 'other', label: 'Other' }], where: (v) => eq(c.purpose, v) },
          programme: { label: 'Programme', options: programOptions, where: (v) => uuidEq(sections.programId, v) },
        },
        sorts: { created: c.createdAt, student: students.fullName, status: c.status, completed: c.completedAt },
        defaultSort: { id: 'created', dir: 'desc' },
      },
      actions: {
        recheck: { label: 'Check dues again', apply: async (ctx, id) => void (await this.svc.recheckClearance(ctx.tx, ctx.p, id)) },
        cancel: { label: 'Cancel clearance', tone: 'danger', apply: (ctx, id) => this.svc.cancelClearance(ctx.tx, ctx.p, id) },
      },
      columns: [
        { key: 'createdAt', header: 'Raised on' },
        { key: 'studentName', header: 'Student' },
        { key: 'rollNo', header: 'Roll no' },
        { key: 'className', header: 'Class' },
        { key: 'purpose', header: 'For' },
        { key: 'status', header: 'Status' },
        { key: 'cleared', header: 'Lines cleared' },
        { key: 'total', header: 'Lines' },
        { key: 'pendingWith', header: 'Waiting on' },
        { key: 'duesPaise', header: 'Dues (paise)' },
        { key: 'completedAt', header: 'Cleared on' },
      ],
    };
  }

  guardianLinks(): RecordEntity {
    const g = guardians;
    const children = sql<number>`(select count(*)::int from guardians g2 where g2.user_id = ${g.userId})`;
    return {
      key: 'guardian-links',
      module: 'students',
      table: g,
      subjectType: 'guardian_link',
      historyTypes: [],
      roles: { read: PROFILE_ROLES, write: GUARDIAN_ROLES },
      label: (x) => `${x.guardianName} (${x.relation} of ${x.studentName})`,
      list: {
        select: {
          id: g.id,
          userId: g.userId,
          guardianName: users.fullName,
          phone: users.phone,
          email: users.email,
          relation: g.relation,
          isPrimary: g.isPrimary,
          isEmergencyContact: g.isEmergencyContact,
          studentId: g.studentId,
          studentName: students.fullName,
          rollNo: students.rollNo,
          className: sections.displayName,
          studentStatus: students.status,
          children,
          createdAt: g.createdAt,
        },
        joins: (q) => q.innerJoin(users, eq(users.id, g.userId)).innerJoin(students, eq(students.id, g.studentId)).innerJoin(sections, eq(sections.id, students.sectionId)),
        search: [users.fullName, users.phone, students.fullName, students.rollNo],
        filters: {
          relation: { label: 'Relation', options: RELATIONS, where: (v) => eq(g.relation, v) },
          section: { label: 'Class', options: sectionOptions, where: (v) => uuidEq(students.sectionId, v) },
          siblings: { label: 'Brothers and sisters', options: [{ value: 'yes', label: 'Parents of more than one student' }], where: (v) => (v === 'yes' ? sql`${children} > 1` : undefined) },
          primary: { label: 'Primary contact', options: yesNo('Primary contact'), where: (v) => (v === 'yes' ? eq(g.isPrimary, true) : v === 'no' ? eq(g.isPrimary, false) : undefined) },
        },
        sorts: { guardian: users.fullName, student: students.fullName, class: sections.displayName, relation: g.relation, children, created: g.createdAt },
        defaultSort: { id: 'guardian', dir: 'asc' },
        tiebreak: [students.fullName],
      },
      fields: {
        relation: { label: 'Relation', type: 'select', schema: z.enum(['father', 'mother', 'guardian', 'grandparent', 'sibling']), options: RELATIONS, create: false, bulk: true, apply: (ctx, id, v) => this.patch(ctx.tx, ctx.p, id, { relation: String(v) }) },
        isPrimary: { label: 'Primary contact', type: 'boolean', schema: z.boolean(), create: false, apply: (ctx, id, v) => this.patch(ctx.tx, ctx.p, id, { isPrimary: !!v }) },
        isEmergencyContact: { label: 'Emergency contact', type: 'boolean', schema: z.boolean(), create: false, bulk: true, apply: (ctx, id, v) => this.patch(ctx.tx, ctx.p, id, { isEmergencyContact: !!v }) },
      },
      remove: {
        guard: async (ctx, id) => {
          const [row] = await ctx.tx.select({ studentId: g.studentId }).from(g).where(eq(g.id, id));
          if (!row) return null;
          const [{ n }] = (await ctx.tx.execute<{ n: number }>(sql`select count(*)::int as n from guardians where student_id = ${row.studentId}::uuid`)).rows;
          return n <= 1 ? 'A student needs at least one guardian: add the new one first' : null;
        },
      },
      columns: [
        { key: 'guardianName', header: 'Guardian' },
        { key: 'phone', header: 'Phone' },
        { key: 'email', header: 'Email' },
        { key: 'relation', header: 'Relation' },
        { key: 'studentName', header: 'Student' },
        { key: 'rollNo', header: 'Roll no' },
        { key: 'className', header: 'Class' },
        { key: 'isPrimary', header: 'Primary contact' },
        { key: 'isEmergencyContact', header: 'Emergency contact' },
        { key: 'children', header: 'Children at the institution' },
      ],
      import: {
        columns: [
          { key: 'roll_no', header: 'Student roll number', required: true, help: 'The student the guardian belongs to', example: 'BSC1A001' },
          { key: 'class', header: 'Class', help: 'Only needed when the roll number is used in more than one class', options: async (ctx) => (await sectionOptions(ctx)).map((o) => o.label) },
          { key: 'guardian_name', header: 'Guardian name', required: true, example: 'Ramesh Kulkarni' },
          { key: 'guardian_phone', header: 'Guardian phone', required: true, help: 'Brothers and sisters with the same parent phone share one parent login', example: '+919900000201' },
          { key: 'guardian_email', header: 'Guardian email' },
          { key: 'relation', header: 'Relation', required: true, options: RELATIONS.map((o) => o.value), example: 'father' },
          { key: 'primary', header: 'Primary contact', options: ['yes', 'no'] },
          { key: 'emergency', header: 'Emergency contact', options: ['yes', 'no'] },
        ],
        key: ['roll_no', 'guardian_phone'],
        exists: async (ctx, r) => {
          const phone = normalizePhone(r.get('guardian_phone'));
          const [hit] = await ctx.tx.select({ id: g.id }).from(g).innerJoin(students, eq(students.id, g.studentId)).innerJoin(users, eq(users.id, g.userId)).where(and(eq(students.rollNo, r.get('roll_no')), eq(users.phone, phone))).limit(1);
          return !!hit;
        },
        run: (ctx, rows) =>
          eachRow(ctx.tx, rows, async (tx, r) => {
            const roll = required(r, 'roll_no');
            const cls = r.get('class');
            const matches = await tx.select({ id: students.id, name: students.fullName }).from(students).innerJoin(sections, eq(sections.id, students.sectionId)).where(and(eq(students.rollNo, roll), cls ? sql`lower(${sections.displayName}) = ${lc(cls)}` : undefined));
            if (!matches.length) fail('No student with this roll number', roll);
            if (matches.length > 1) fail('This roll number is used in more than one class: give the class', roll);
            const e164 = normalizePhone(required(r, 'guardian_phone'));
            if (!/^\+\d{8,15}$/.test(e164)) fail('Enter a valid mobile number', r.get('guardian_phone'));
            const relation = lc(required(r, 'relation'));
            if (!RELATIONS.some((o) => o.value === relation)) fail('Choose one of the listed values', relation);
            const studentId = matches[0].id;
            const [linked] = await tx.select({ id: g.id, relation: g.relation, isPrimary: g.isPrimary, isEmergencyContact: g.isEmergencyContact }).from(g).innerJoin(users, eq(users.id, g.userId)).where(and(eq(g.studentId, studentId), eq(users.phone, e164)));
            const primary = lc(r.get('primary')) === 'yes';
            const emergency = lc(r.get('emergency')) === 'yes';
            if (linked) {
              const patch = { ...(linked.relation !== relation && { relation }), ...(primary && !linked.isPrimary && { isPrimary: true }), ...(r.get('emergency') && linked.isEmergencyContact !== emergency && { isEmergencyContact: emergency }) };
              if (Object.keys(patch).length) await this.lifecycle.updateGuardian(tx, ctx.p, studentId, linked.id, patch);
              return outcome(false, Object.keys(patch).length > 0, [required(r, 'guardian_name'), matches[0].name]);
            }
            await this.lifecycle.linkGuardian(tx, ctx.p, studentId, { fullName: required(r, 'guardian_name'), phone: e164, email: r.get('guardian_email') || null, relation, isPrimary: primary || undefined, isEmergencyContact: emergency });
            return outcome(true, false, [required(r, 'guardian_name'), matches[0].name]);
          }),
      },
    };
  }

  /** Guardian link changes go through the lifecycle service, which keeps one primary contact and the student's record. */
  private async patch(tx: Parameters<LifecycleService['updateGuardian']>[0], p: Parameters<LifecycleService['updateGuardian']>[1], id: string, patch: { relation?: string; isPrimary?: boolean; isEmergencyContact?: boolean }) {
    const [row] = await tx.select({ studentId: guardians.studentId }).from(guardians).where(eq(guardians.id, id));
    if (!row) throw new BadRequestException('Guardian not found');
    await this.lifecycle.updateGuardian(tx, p, row.studentId, id, patch);
  }
}
