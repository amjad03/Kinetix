import { ConflictException, Injectable, OnModuleInit } from '@nestjs/common';
import { and, asc, eq, isNotNull, isNull, ne, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { z } from 'zod';
import { hasRole } from '../placements/placements.access.js';
import { disciplineIncidents, grievanceTickets, mentorAssignments, sections, students, users, welfareRequests } from '../db/schema.js';
import { antiraggingUndertakings, grievanceRoutes, pwdAccommodations } from '../db/schema-life.js';
import { fail, lc, outcome, required } from '../import/row-helpers.js';
import { RecordRegistry, type FieldOption, type RecordEntity } from '../records/entity.js';
import { DateText, Int, OptionalRef, Ref, Text, uuidEq } from '../records/helpers.js';
import { eachRow } from '../records/import.js';
import { insertRecord, rupeesOf, staffByEmail, staffOptions, studentByRoll, studentOptions } from '../campus-life/kit-shared.js';
import { MENTORING_ADMIN } from '../mentoring/mentoring-rules.js';
import { COMMITTEE_ROLES, DISCIPLINE_DECIDERS, DISCIPLINE_VIEW, GRIEVANCE_STAFF, WELFARE_ROLES } from './welfare.access.js';

const choices = (m: Record<string, string>): FieldOption[] => Object.entries(m).map(([value, label]) => ({ value, label }));
const pick = (opts: FieldOption[]) => z.enum(opts.map((o) => o.value) as [string, ...string[]]);
const labelOf = (opts: FieldOption[], v: unknown) => opts.find((o) => o.value === v)?.label ?? String(v ?? '');
const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-10-15');
const yes = (v: string) => ['yes', 'y', 'true', '1'].includes(lc(v));

export const GRIEVANCE_CATEGORIES = choices({ academic: 'Academic', exam: 'Examination', fees: 'Fees', hostel: 'Hostel', transport: 'Transport', infrastructure: 'Infrastructure', staff_conduct: 'Staff conduct', ragging: 'Ragging', harassment: 'Harassment', discrimination: 'Discrimination (SC/ST)', other: 'Other' });
export const GRIEVANCE_STATUSES = choices({ open: 'Open', assigned: 'Assigned', in_progress: 'In progress', escalated: 'Escalated', reopened: 'Reopened', resolved: 'Resolved', closed: 'Closed' });
export const COMMITTEES = choices({ anti_ragging: 'Anti-ragging committee', icc: 'Internal Complaints Committee', posh: 'POSH committee', sc_st: 'SC/ST cell' });
export const UNDERTAKING_STATUSES = choices({ pending: 'Not yet given', received: 'Received', verified: 'Verified' });
export const ACCOMMODATION_STATUSES = choices({ active: 'Active', revoked: 'Revoked' });
export const WELFARE_KINDS = choices({ scholarship: 'Scholarship', fee_waiver: 'Fee waiver', freeship: 'Free-ship', poor_fund: 'Poor students fund', medical_aid: 'Medical aid', hardship: 'Hardship', other: 'Other' });
export const WELFARE_STATUSES = choices({ submitted: 'Submitted', under_review: 'Under review', approved: 'Approved', rejected: 'Rejected', disbursed: 'Disbursed', withdrawn: 'Withdrawn' });
export const INCIDENT_STATUSES = choices({ reported: 'Reported', under_review: 'Under review', action_taken: 'Action taken', appealed: 'Appealed', closed: 'Closed' });
export const SEVERITIES = choices({ minor: 'Minor', major: 'Major', severe: 'Severe' });

const assignee = alias(users, 'assignee');
const backup = alias(users, 'backup');
const raiser = alias(users, 'raiser');
const mentor = alias(users, 'mentor');
const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : v === null || v === undefined ? '' : String(v));

// ---- grievance routes ----------------------------------------------------------------------------

export function grievanceRoutesEntity(): RecordEntity {
  return {
    key: 'grievance-routes',
    module: 'grievances',
    table: grievanceRoutes,
    subjectType: 'grievance_route',
    roles: { read: GRIEVANCE_STAFF, write: ['tenant_admin', 'principal'] },
    label: (r) => labelOf(GRIEVANCE_CATEGORIES, r.category),
    list: {
      select: { id: grievanceRoutes.id, category: grievanceRoutes.category, assigneeUserId: grievanceRoutes.assigneeUserId, assigneeName: assignee.fullName, backupUserId: grievanceRoutes.backupUserId, backupName: backup.fullName, slaHours: grievanceRoutes.slaHours, notes: grievanceRoutes.notes, active: grievanceRoutes.active, createdAt: grievanceRoutes.createdAt },
      joins: (q) => q.innerJoin(assignee, eq(assignee.id, grievanceRoutes.assigneeUserId)).leftJoin(backup, eq(backup.id, grievanceRoutes.backupUserId)),
      search: [assignee.fullName, backup.fullName, grievanceRoutes.notes],
      filters: { active: { label: 'Status', options: [{ value: 'yes', label: 'Active' }, { value: 'no', label: 'Paused' }], where: (v) => eq(grievanceRoutes.active, v === 'yes') } },
      sorts: { category: grievanceRoutes.category, assignee: assignee.fullName, created: grievanceRoutes.createdAt },
      defaultSort: { id: 'category', dir: 'asc' },
    },
    fields: {
      category: { label: 'Category', type: 'select', schema: pick(GRIEVANCE_CATEGORIES.filter((c) => !['ragging', 'harassment', 'discrimination'].includes(c.value))), column: grievanceRoutes.category, options: GRIEVANCE_CATEGORIES.filter((c) => !['ragging', 'harassment', 'discrimination'].includes(c.value)), required: true, help: 'Committee matters (ragging, harassment, discrimination) always go to their committee' },
      assigneeUserId: { label: 'Handled by', type: 'select', schema: Ref, column: grievanceRoutes.assigneeUserId, options: staffOptions, required: true, bulk: true },
      backupUserId: { label: 'Backup', type: 'select', schema: OptionalRef, column: grievanceRoutes.backupUserId, options: staffOptions, bulk: true, help: 'Takes the ticket when it is about the usual handler' },
      slaHours: { label: 'Response deadline (hours)', type: 'number', schema: z.union([Int(1, 2000), z.null()]), column: grievanceRoutes.slaHours, help: 'Leave empty for the deadline set by severity' },
      notes: { label: 'Notes', type: 'textarea', schema: z.string().trim().max(1000), column: grievanceRoutes.notes },
      active: { label: 'Active', type: 'boolean', schema: z.boolean(), column: grievanceRoutes.active, bulk: true, create: false },
    },
    columns: [
      { key: 'category', header: 'Category', value: (r) => labelOf(GRIEVANCE_CATEGORIES, r.category) },
      { key: 'assigneeName', header: 'Handled by' },
      { key: 'backupName', header: 'Backup' },
      { key: 'slaHours', header: 'Deadline (hours)' },
      { key: 'active', header: 'Active', value: (r) => (r.active ? 'Yes' : 'No') },
    ],
  };
}

// ---- the grievance register (NAAC) ---------------------------------------------------------------

const resolutionHours = sql<number | null>`case when ${grievanceTickets.resolvedAt} is null then null else round(extract(epoch from ${grievanceTickets.resolvedAt} - ${grievanceTickets.createdAt}) / 3600)::int end`;

export function grievancesEntity(): RecordEntity {
  return {
    key: 'grievances',
    module: 'grievances',
    table: grievanceTickets,
    subjectType: 'grievance',
    roles: { read: [...GRIEVANCE_STAFF, ...COMMITTEE_ROLES], write: [...GRIEVANCE_STAFF, ...COMMITTEE_ROLES] },
    label: (r) => String(r.ticketNo),
    list: {
      select: {
        id: grievanceTickets.id,
        ticketNo: grievanceTickets.ticketNo,
        category: grievanceTickets.category,
        severity: grievanceTickets.severity,
        subject: sql<string>`case when ${grievanceTickets.committee} is null then ${grievanceTickets.subject} else '' end`,
        committee: grievanceTickets.committee,
        status: grievanceTickets.status,
        anonymous: grievanceTickets.anonymous,
        raisedByName: sql<string | null>`case when ${grievanceTickets.anonymous} then null else ${raiser.fullName} end`,
        assigneeName: assignee.fullName,
        slaDueAt: grievanceTickets.slaDueAt,
        escalationLevel: grievanceTickets.escalationLevel,
        createdAt: grievanceTickets.createdAt,
        resolvedAt: grievanceTickets.resolvedAt,
        resolutionHours,
        rating: grievanceTickets.rating,
        appealStatus: grievanceTickets.appealStatus,
      },
      joins: (q) => q.innerJoin(raiser, eq(raiser.id, grievanceTickets.raisedBy)).leftJoin(assignee, eq(assignee.id, grievanceTickets.assigneeUserId)),
      search: [grievanceTickets.ticketNo, sql`case when ${grievanceTickets.committee} is null then ${grievanceTickets.subject} else '' end`],
      filters: {
        status: { label: 'Status', options: GRIEVANCE_STATUSES, where: (v) => eq(grievanceTickets.status, v) },
        category: { label: 'Category', options: GRIEVANCE_CATEGORIES, where: (v) => eq(grievanceTickets.category, v) },
        committee: { label: 'Committee', options: COMMITTEES, where: (v) => eq(grievanceTickets.committee, v) },
        overdue: { label: 'Deadline', options: [{ value: 'yes', label: 'Past the deadline' }], where: (v) => (v === 'yes' ? sql`${grievanceTickets.status} in ('open', 'assigned', 'in_progress', 'escalated', 'reopened') and ${grievanceTickets.slaDueAt} < now()` : undefined) },
        appeal: { label: 'Appeal', options: [{ value: 'pending', label: 'Appeal pending' }, { value: 'any', label: 'Appealed' }], where: (v) => (v === 'pending' ? eq(grievanceTickets.appealStatus, 'pending') : v === 'any' ? isNotNull(grievanceTickets.appealStatus) : undefined) },
        year: { label: 'Academic year', where: (v) => (/^\d{4}$/.test(v) ? sql`${grievanceTickets.createdAt} >= ${`${v}-06-01`}::date and ${grievanceTickets.createdAt} < ${`${Number(v) + 1}-06-01`}::date` : undefined) },
      },
      sorts: { raised: grievanceTickets.createdAt, due: grievanceTickets.slaDueAt, ticket: grievanceTickets.ticketNo, resolution: resolutionHours },
      defaultSort: { id: 'raised', dir: 'desc' },
      // Committee matters only for the committee, general tickets only for the grievance team, never the person it is about.
      scope: (ctx) => {
        const general = hasRole(ctx.p, GRIEVANCE_STAFF);
        const committee = hasRole(ctx.p, COMMITTEE_ROLES);
        return and(general && committee ? undefined : general ? isNull(grievanceTickets.committee) : isNotNull(grievanceTickets.committee), or(isNull(grievanceTickets.againstUserId), ne(grievanceTickets.againstUserId, ctx.p.userId)));
      },
    },
    remove: { guard: async () => 'Grievances stay in the register; close them instead' },
    columns: [
      { key: 'ticketNo', header: 'Ticket' },
      { key: 'createdAt', header: 'Raised on', value: (r) => iso(r.createdAt).slice(0, 10) },
      { key: 'category', header: 'Category', value: (r) => labelOf(GRIEVANCE_CATEGORIES, r.category) },
      { key: 'committee', header: 'Committee', value: (r) => (r.committee ? labelOf(COMMITTEES, r.committee) : '') },
      { key: 'severity', header: 'Severity' },
      { key: 'subject', header: 'Subject' },
      { key: 'raisedByName', header: 'Raised by', value: (r) => (r.anonymous ? 'Anonymous' : String(r.raisedByName ?? '')) },
      { key: 'assigneeName', header: 'Handled by' },
      { key: 'status', header: 'Status', value: (r) => labelOf(GRIEVANCE_STATUSES, r.status) },
      { key: 'resolvedAt', header: 'Resolved on', value: (r) => iso(r.resolvedAt).slice(0, 10) },
      { key: 'resolutionHours', header: 'Hours to resolve' },
      { key: 'rating', header: 'Rating' },
      { key: 'appealStatus', header: 'Appeal' },
    ],
  };
}

// ---- anti-ragging undertakings -------------------------------------------------------------------

export function undertakingsEntity(): RecordEntity {
  return {
    key: 'antiragging-undertakings',
    module: 'grievances',
    table: antiraggingUndertakings,
    subjectType: 'antiragging_undertaking',
    roles: { read: [...GRIEVANCE_STAFF, 'hod', 'admissions_officer'], write: [...GRIEVANCE_STAFF, 'admissions_officer'] },
    label: (r) => `${r.rollNo} ${r.studentName} (${r.yearLabel})`,
    list: {
      select: { id: antiraggingUndertakings.id, studentId: antiraggingUndertakings.studentId, studentName: students.fullName, rollNo: students.rollNo, className: sections.displayName, sectionId: students.sectionId, yearLabel: antiraggingUndertakings.yearLabel, studentRef: antiraggingUndertakings.studentRef, parentRef: antiraggingUndertakings.parentRef, submittedOn: antiraggingUndertakings.submittedOn, status: antiraggingUndertakings.status, verifiedAt: antiraggingUndertakings.verifiedAt, notes: antiraggingUndertakings.notes, createdAt: antiraggingUndertakings.createdAt },
      joins: (q) => q.innerJoin(students, eq(students.id, antiraggingUndertakings.studentId)).innerJoin(sections, eq(sections.id, students.sectionId)),
      search: [students.fullName, students.rollNo, antiraggingUndertakings.studentRef, antiraggingUndertakings.parentRef],
      filters: {
        status: { label: 'Status', options: UNDERTAKING_STATUSES, where: (v) => eq(antiraggingUndertakings.status, v as 'pending') },
        year: { label: 'Year', options: async (ctx) => (await ctx.tx.selectDistinct({ y: antiraggingUndertakings.yearLabel }).from(antiraggingUndertakings).orderBy(asc(antiraggingUndertakings.yearLabel))).map((r) => ({ value: r.y, label: r.y })), where: (v) => eq(antiraggingUndertakings.yearLabel, v) },
        section: { label: 'Class', options: async (ctx) => (await ctx.tx.select({ id: sections.id, name: sections.displayName }).from(sections).orderBy(asc(sections.displayName))).map((s) => ({ value: s.id, label: s.name })), where: (v) => uuidEq(students.sectionId, v) },
      },
      sorts: { student: students.fullName, roll: students.rollNo, className: sections.displayName, status: antiraggingUndertakings.status, submitted: antiraggingUndertakings.submittedOn, created: antiraggingUndertakings.createdAt },
      defaultSort: { id: 'className', dir: 'asc' },
      tiebreak: [students.rollNo],
    },
    fields: {
      studentId: { label: 'Student', type: 'select', schema: Ref, column: antiraggingUndertakings.studentId, options: studentOptions, required: true, edit: false },
      yearLabel: { label: 'Academic year', type: 'text', schema: z.string().regex(/^\d{4}-\d{2}$/, 'Use a year like 2026-27'), column: antiraggingUndertakings.yearLabel, required: true, edit: false },
      studentRef: { label: 'Student undertaking number', type: 'text', schema: z.string().trim().max(80), column: antiraggingUndertakings.studentRef, help: 'The reference number from antiragging.in' },
      parentRef: { label: 'Parent undertaking number', type: 'text', schema: z.string().trim().max(80), column: antiraggingUndertakings.parentRef },
      submittedOn: { label: 'Submitted on', type: 'date', schema: DateText, column: antiraggingUndertakings.submittedOn },
      notes: { label: 'Notes', type: 'textarea', schema: z.string().trim().max(1000), column: antiraggingUndertakings.notes },
    },
    create: async (ctx, v) => insertRecord(ctx, antiraggingUndertakings, { ...v, status: v.studentRef && v.parentRef ? 'received' : 'pending', submittedOn: v.submittedOn ?? (v.studentRef && v.parentRef ? new Date().toISOString().slice(0, 10) : null) }),
    columns: [
      { key: 'rollNo', header: 'Roll no' },
      { key: 'studentName', header: 'Student' },
      { key: 'className', header: 'Class' },
      { key: 'yearLabel', header: 'Year' },
      { key: 'studentRef', header: 'Student undertaking' },
      { key: 'parentRef', header: 'Parent undertaking' },
      { key: 'submittedOn', header: 'Submitted on' },
      { key: 'status', header: 'Status', value: (r) => labelOf(UNDERTAKING_STATUSES, r.status) },
    ],
    actions: {
      receive: {
        label: 'Mark received',
        apply: async (ctx, id) => {
          const [u] = await ctx.tx.select().from(antiraggingUndertakings).where(eq(antiraggingUndertakings.id, id));
          if (!u.studentRef || !u.parentRef) throw new ConflictException('Enter both undertaking numbers first');
          await ctx.tx.update(antiraggingUndertakings).set({ status: 'received', submittedOn: u.submittedOn ?? new Date().toISOString().slice(0, 10) }).where(eq(antiraggingUndertakings.id, id));
        },
      },
      verify: {
        label: 'Mark verified',
        apply: async (ctx, id) => {
          const [u] = await ctx.tx.select().from(antiraggingUndertakings).where(eq(antiraggingUndertakings.id, id));
          if (u.status === 'pending') throw new ConflictException('The undertaking has not been received');
          await ctx.tx.update(antiraggingUndertakings).set({ status: 'verified', verifiedBy: ctx.p.userId, verifiedAt: new Date() }).where(eq(antiraggingUndertakings.id, id));
        },
      },
    },
    import: {
      columns: [
        { key: 'roll_no', header: 'Roll no', required: true, example: 'R12' },
        { key: 'class', header: 'Class' },
        { key: 'year', header: 'Academic year', required: true, example: '2026-27' },
        { key: 'student_ref', header: 'Student undertaking number', example: 'AR-2026-118833' },
        { key: 'parent_ref', header: 'Parent undertaking number', example: 'AR-2026-118834' },
        { key: 'submitted_on', header: 'Submitted on', example: '2026-08-02' },
      ],
      key: ['roll_no', 'year'],
      exists: async (ctx, r) => {
        const sid = await studentByRoll(ctx.tx, r.get('roll_no'), r.get('class') || undefined).catch(() => null);
        return !!sid && !!(await ctx.tx.select({ id: antiraggingUndertakings.id }).from(antiraggingUndertakings).where(and(eq(antiraggingUndertakings.studentId, sid), eq(antiraggingUndertakings.yearLabel, r.get('year')))))[0];
      },
      run: (ctx, rows) =>
        eachRow(ctx.tx, rows, async (tx, r) => {
          const sid = await studentByRoll(tx, required(r, 'roll_no'), r.get('class') || undefined);
          const year = required(r, 'year');
          if (!/^\d{4}-\d{2}$/.test(year)) fail('Use a year like 2026-27', year);
          const on = r.get('submitted_on');
          if (on && !/^\d{4}-\d{2}-\d{2}$/.test(on)) fail('Use a date like 2026-10-15', on);
          const both = !!(r.get('student_ref') && r.get('parent_ref'));
          const values = { studentRef: r.get('student_ref'), parentRef: r.get('parent_ref'), submittedOn: on || (both ? new Date().toISOString().slice(0, 10) : null), status: (both ? 'received' : 'pending') as 'received' | 'pending' };
          const [hit] = await tx.select().from(antiraggingUndertakings).where(and(eq(antiraggingUndertakings.studentId, sid), eq(antiraggingUndertakings.yearLabel, year)));
          if (!hit) {
            await tx.insert(antiraggingUndertakings).values({ tenantId: ctx.p.tenantId, studentId: sid, yearLabel: year, ...values });
            return outcome(true, false, [r.get('roll_no'), year]);
          }
          await tx.update(antiraggingUndertakings).set({ ...values, status: hit.status === 'verified' ? 'verified' : values.status }).where(eq(antiraggingUndertakings.id, hit.id));
          return outcome(false, true, [r.get('roll_no'), year]);
        }),
    },
  };
}

// ---- disability accommodations -------------------------------------------------------------------

export function accommodationsEntity(): RecordEntity {
  return {
    key: 'pwd-accommodations',
    module: 'grievances',
    table: pwdAccommodations,
    subjectType: 'pwd_accommodation',
    roles: { read: [...WELFARE_ROLES, 'exam_controller', 'counsellor', 'hod'], write: [...WELFARE_ROLES, 'counsellor'] },
    label: (r) => `${r.rollNo} ${r.studentName}`,
    list: {
      select: {
        id: pwdAccommodations.id,
        studentId: pwdAccommodations.studentId,
        studentName: students.fullName,
        rollNo: students.rollNo,
        className: sections.displayName,
        disability: pwdAccommodations.disability,
        percent: pwdAccommodations.percent,
        certificateNo: pwdAccommodations.certificateNo,
        scribe: pwdAccommodations.scribe,
        extraMinutesPerHour: pwdAccommodations.extraMinutesPerHour,
        separateRoom: pwdAccommodations.separateRoom,
        groundFloor: pwdAccommodations.groundFloor,
        other: pwdAccommodations.other,
        validUntil: pwdAccommodations.validUntil,
        status: pwdAccommodations.status,
        expired: sql<boolean>`${pwdAccommodations.validUntil} is not null and ${pwdAccommodations.validUntil} < current_date`,
        createdAt: pwdAccommodations.createdAt,
      },
      joins: (q) => q.innerJoin(students, eq(students.id, pwdAccommodations.studentId)).innerJoin(sections, eq(sections.id, students.sectionId)),
      search: [students.fullName, students.rollNo, pwdAccommodations.disability, pwdAccommodations.certificateNo],
      filters: {
        status: { label: 'Status', options: [...ACCOMMODATION_STATUSES, { value: 'expired', label: 'Expired' }], where: (v) => (v === 'expired' ? sql`${pwdAccommodations.validUntil} < current_date` : eq(pwdAccommodations.status, v as 'active')) },
        scribe: { label: 'Scribe', options: [{ value: 'yes', label: 'Needs a scribe' }], where: (v) => (v === 'yes' ? eq(pwdAccommodations.scribe, true) : undefined) },
        section: { label: 'Class', where: (v) => uuidEq(students.sectionId, v) },
      },
      sorts: { student: students.fullName, className: sections.displayName, valid: pwdAccommodations.validUntil, created: pwdAccommodations.createdAt },
      defaultSort: { id: 'className', dir: 'asc' },
      tiebreak: [students.rollNo],
    },
    fields: {
      studentId: { label: 'Student', type: 'select', schema: Ref, column: pwdAccommodations.studentId, options: studentOptions, required: true, edit: false },
      disability: { label: 'Disability', type: 'text', schema: Text(160), column: pwdAccommodations.disability, required: true, help: 'As on the disability certificate (RPwD Act 2016)' },
      percent: { label: 'Disability %', type: 'number', schema: z.union([Int(0, 100), z.null()]), column: pwdAccommodations.percent },
      certificateNo: { label: 'Certificate number', type: 'text', schema: z.string().trim().max(80), column: pwdAccommodations.certificateNo },
      scribe: { label: 'Scribe', type: 'boolean', schema: z.boolean(), column: pwdAccommodations.scribe, bulk: true },
      extraMinutesPerHour: { label: 'Extra minutes per hour', type: 'number', schema: Int(0, 60), column: pwdAccommodations.extraMinutesPerHour, bulk: true, help: 'Usually 20 minutes per hour' },
      separateRoom: { label: 'Separate room', type: 'boolean', schema: z.boolean(), column: pwdAccommodations.separateRoom, bulk: true },
      groundFloor: { label: 'Ground-floor room', type: 'boolean', schema: z.boolean(), column: pwdAccommodations.groundFloor, bulk: true },
      other: { label: 'Other support', type: 'textarea', schema: z.string().trim().max(1000), column: pwdAccommodations.other },
      validUntil: { label: 'Valid until', type: 'date', schema: DateText, column: pwdAccommodations.validUntil, bulk: true },
    },
    create: (ctx, v) => insertRecord(ctx, pwdAccommodations, { ...v, approvedBy: ctx.p.userId }, 'approvedBy'),
    columns: [
      { key: 'rollNo', header: 'Roll no' },
      { key: 'studentName', header: 'Student' },
      { key: 'className', header: 'Class' },
      { key: 'disability', header: 'Disability' },
      { key: 'percent', header: 'Disability %' },
      { key: 'certificateNo', header: 'Certificate' },
      { key: 'scribe', header: 'Scribe', value: (r) => (r.scribe ? 'Yes' : 'No') },
      { key: 'extraMinutesPerHour', header: 'Extra minutes per hour' },
      { key: 'separateRoom', header: 'Separate room', value: (r) => (r.separateRoom ? 'Yes' : 'No') },
      { key: 'groundFloor', header: 'Ground floor', value: (r) => (r.groundFloor ? 'Yes' : 'No') },
      { key: 'other', header: 'Other support' },
      { key: 'validUntil', header: 'Valid until' },
      { key: 'status', header: 'Status', value: (r) => labelOf(ACCOMMODATION_STATUSES, r.status) },
    ],
    actions: {
      revoke: { label: 'Revoke', tone: 'danger', apply: async (ctx, id) => void (await ctx.tx.update(pwdAccommodations).set({ status: 'revoked' }).where(eq(pwdAccommodations.id, id))) },
      reinstate: { label: 'Reinstate', apply: async (ctx, id) => void (await ctx.tx.update(pwdAccommodations).set({ status: 'active' }).where(eq(pwdAccommodations.id, id))) },
    },
    import: {
      columns: [
        { key: 'roll_no', header: 'Roll no', required: true, example: 'R12' },
        { key: 'class', header: 'Class' },
        { key: 'disability', header: 'Disability', required: true, example: 'Low vision' },
        { key: 'percent', header: 'Disability %', example: '45' },
        { key: 'certificate_no', header: 'Certificate number' },
        { key: 'scribe', header: 'Scribe', options: ['yes', 'no'] },
        { key: 'extra_minutes', header: 'Extra minutes per hour', example: '20' },
        { key: 'separate_room', header: 'Separate room', options: ['yes', 'no'] },
        { key: 'valid_until', header: 'Valid until', example: '2027-05-31' },
      ],
      key: ['roll_no', 'disability'],
      exists: async (ctx, r) => {
        const sid = await studentByRoll(ctx.tx, r.get('roll_no'), r.get('class') || undefined).catch(() => null);
        return !!sid && !!(await ctx.tx.select({ id: pwdAccommodations.id }).from(pwdAccommodations).where(and(eq(pwdAccommodations.studentId, sid), sql`lower(${pwdAccommodations.disability}) = ${lc(r.get('disability'))}`)))[0];
      },
      run: (ctx, rows) =>
        eachRow(ctx.tx, rows, async (tx, r) => {
          const sid = await studentByRoll(tx, required(r, 'roll_no'), r.get('class') || undefined);
          const disability = required(r, 'disability');
          const n = (k: string, max: number) => {
            const v = r.get(k);
            if (!v) return null;
            const x = Number(v);
            return Number.isInteger(x) && x >= 0 && x <= max ? x : fail('Give a whole number', `${k}: ${v}`);
          };
          const until = r.get('valid_until');
          if (until && !/^\d{4}-\d{2}-\d{2}$/.test(until)) fail('Use a date like 2026-10-15', until);
          const values = { percent: n('percent', 100), certificateNo: r.get('certificate_no'), scribe: yes(r.get('scribe')), extraMinutesPerHour: n('extra_minutes', 60) ?? 0, separateRoom: yes(r.get('separate_room')), validUntil: until || null };
          const [hit] = await tx.select({ id: pwdAccommodations.id }).from(pwdAccommodations).where(and(eq(pwdAccommodations.studentId, sid), sql`lower(${pwdAccommodations.disability}) = ${lc(disability)}`));
          if (!hit) {
            await tx.insert(pwdAccommodations).values({ tenantId: ctx.p.tenantId, studentId: sid, disability, approvedBy: ctx.p.userId, ...values });
            return outcome(true, false, [r.get('roll_no'), disability]);
          }
          await tx.update(pwdAccommodations).set(values).where(eq(pwdAccommodations.id, hit.id));
          return outcome(false, true, [r.get('roll_no'), disability]);
        }),
    },
  };
}

// ---- welfare requests (read, export, history) ----------------------------------------------------

export function welfareRequestsEntity(): RecordEntity {
  return {
    key: 'welfare-requests',
    module: 'grievances',
    table: welfareRequests,
    subjectType: 'welfare',
    roles: { read: WELFARE_ROLES, write: WELFARE_ROLES },
    label: (r) => `${r.rollNo} ${r.studentName}: ${r.title}`,
    list: {
      select: { id: welfareRequests.id, studentId: welfareRequests.studentId, studentName: students.fullName, rollNo: students.rollNo, className: sections.displayName, kind: welfareRequests.kind, title: welfareRequests.title, requestedRupees: rupeesOf(welfareRequests.amountRequestedPaise), approvedRupees: rupeesOf(welfareRequests.amountApprovedPaise), status: welfareRequests.status, decisionNote: welfareRequests.decisionNote, disbursedOn: welfareRequests.disbursedOn, createdAt: welfareRequests.createdAt },
      joins: (q) => q.innerJoin(students, eq(students.id, welfareRequests.studentId)).innerJoin(sections, eq(sections.id, students.sectionId)),
      search: [students.fullName, students.rollNo, welfareRequests.title],
      filters: {
        status: { label: 'Status', options: WELFARE_STATUSES, where: (v) => eq(welfareRequests.status, v) },
        kind: { label: 'Kind', options: WELFARE_KINDS, where: (v) => eq(welfareRequests.kind, v) },
      },
      sorts: { created: welfareRequests.createdAt, student: students.fullName, amount: welfareRequests.amountRequestedPaise, status: welfareRequests.status },
      defaultSort: { id: 'created', dir: 'desc' },
    },
    remove: { guard: async (ctx, id) => (['approved', 'disbursed'].includes((await ctx.tx.select({ s: welfareRequests.status }).from(welfareRequests).where(eq(welfareRequests.id, id)))[0]?.s ?? '') ? 'An approved or paid request stays on the record' : null) },
    columns: [
      { key: 'createdAt', header: 'Requested on', value: (r) => iso(r.createdAt).slice(0, 10) },
      { key: 'rollNo', header: 'Roll no' },
      { key: 'studentName', header: 'Student' },
      { key: 'className', header: 'Class' },
      { key: 'kind', header: 'Kind', value: (r) => labelOf(WELFARE_KINDS, r.kind) },
      { key: 'title', header: 'Request' },
      { key: 'requestedRupees', header: 'Requested (₹)' },
      { key: 'approvedRupees', header: 'Approved (₹)' },
      { key: 'status', header: 'Status', value: (r) => labelOf(WELFARE_STATUSES, r.status) },
      { key: 'disbursedOn', header: 'Paid on' },
    ],
  };
}

// ---- discipline register -------------------------------------------------------------------------

export function disciplineEntity(): RecordEntity {
  return {
    key: 'discipline-incidents',
    module: 'grievances',
    table: disciplineIncidents,
    subjectType: 'incident',
    roles: { read: DISCIPLINE_VIEW, write: DISCIPLINE_DECIDERS },
    label: (r) => `${r.rollNo} ${r.studentName}: ${r.kind}`,
    list: {
      select: { id: disciplineIncidents.id, studentId: disciplineIncidents.studentId, studentName: students.fullName, rollNo: students.rollNo, className: sections.displayName, incidentOn: disciplineIncidents.incidentOn, kind: disciplineIncidents.kind, severity: disciplineIncidents.severity, description: disciplineIncidents.description, status: disciplineIncidents.status, reportedByName: raiser.fullName, createdAt: disciplineIncidents.createdAt },
      joins: (q) => q.innerJoin(students, eq(students.id, disciplineIncidents.studentId)).innerJoin(sections, eq(sections.id, students.sectionId)).innerJoin(raiser, eq(raiser.id, disciplineIncidents.reportedBy)),
      search: [students.fullName, students.rollNo, disciplineIncidents.kind, disciplineIncidents.description],
      filters: {
        status: { label: 'Status', options: INCIDENT_STATUSES, where: (v) => eq(disciplineIncidents.status, v) },
        severity: { label: 'Severity', options: SEVERITIES, where: (v) => eq(disciplineIncidents.severity, v) },
      },
      sorts: { date: disciplineIncidents.incidentOn, student: students.fullName, severity: disciplineIncidents.severity },
      defaultSort: { id: 'date', dir: 'desc' },
    },
    remove: { guard: async (ctx, id) => ((await ctx.tx.select({ s: disciplineIncidents.status }).from(disciplineIncidents).where(eq(disciplineIncidents.id, id)))[0]?.s === 'reported' ? null : 'Only an incident not yet acted on can be deleted') },
    columns: [
      { key: 'incidentOn', header: 'Date' },
      { key: 'rollNo', header: 'Roll no' },
      { key: 'studentName', header: 'Student' },
      { key: 'className', header: 'Class' },
      { key: 'kind', header: 'Incident' },
      { key: 'severity', header: 'Severity', value: (r) => labelOf(SEVERITIES, r.severity) },
      { key: 'status', header: 'Status', value: (r) => labelOf(INCIDENT_STATUSES, r.status) },
      { key: 'reportedByName', header: 'Reported by' },
      { key: 'description', header: 'Description' },
    ],
  };
}

// ---- mentor assignments --------------------------------------------------------------------------

export function mentorAssignmentsEntity(): RecordEntity {
  return {
    key: 'mentor-assignments',
    module: 'mentoring',
    table: mentorAssignments,
    subjectType: 'mentor_assignment',
    roles: { read: [...MENTORING_ADMIN, 'counsellor'], write: MENTORING_ADMIN },
    label: (r) => `${r.rollNo} ${r.studentName} → ${r.mentorName}`,
    list: {
      select: { id: mentorAssignments.id, studentId: mentorAssignments.studentId, studentName: students.fullName, rollNo: students.rollNo, className: sections.displayName, sectionId: students.sectionId, mentorUserId: mentorAssignments.mentorUserId, mentorName: mentor.fullName, startedOn: mentorAssignments.startedOn, endedOn: mentorAssignments.endedOn, sessions: sql<number>`(select count(*)::int from mentoring_sessions s where s.student_id = ${mentorAssignments.studentId} and s.mentor_user_id = ${mentorAssignments.mentorUserId})` },
      joins: (q) => q.innerJoin(students, eq(students.id, mentorAssignments.studentId)).innerJoin(sections, eq(sections.id, students.sectionId)).innerJoin(mentor, eq(mentor.id, mentorAssignments.mentorUserId)),
      search: [students.fullName, students.rollNo, mentor.fullName],
      filters: {
        state: { label: 'Status', options: [{ value: 'open', label: 'Current' }, { value: 'ended', label: 'Ended' }], where: (v) => (v === 'open' ? isNull(mentorAssignments.endedOn) : v === 'ended' ? isNotNull(mentorAssignments.endedOn) : undefined) },
        mentor: { label: 'Mentor', options: staffOptions, where: (v) => uuidEq(mentorAssignments.mentorUserId, v) },
        section: { label: 'Class', options: async (ctx) => (await ctx.tx.select({ id: sections.id, name: sections.displayName }).from(sections).orderBy(asc(sections.displayName))).map((s) => ({ value: s.id, label: s.name })), where: (v) => uuidEq(students.sectionId, v) },
      },
      sorts: { student: students.fullName, className: sections.displayName, mentor: mentor.fullName, started: mentorAssignments.startedOn },
      defaultSort: { id: 'className', dir: 'asc' },
      tiebreak: [students.rollNo],
    },
    fields: {
      studentId: { label: 'Student', type: 'select', schema: Ref, column: mentorAssignments.studentId, options: studentOptions, required: true, edit: false },
      mentorUserId: { label: 'Mentor', type: 'select', schema: Ref, column: mentorAssignments.mentorUserId, options: staffOptions, required: true, edit: false },
    },
    create: (ctx, v) => insertRecord(ctx, mentorAssignments, { ...v, startedOn: new Date().toISOString().slice(0, 10), assignedBy: ctx.p.userId }, 'assignedBy'),
    move: {
      label: 'Change mentor',
      options: staffOptions,
      reason: true,
      // The current assignment ends and a new one starts, so the mentoring history stays with the old mentor.
      apply: async (ctx, id, to) => {
        const [a] = await ctx.tx.select().from(mentorAssignments).where(eq(mentorAssignments.id, id)).for('update');
        if (a.endedOn) throw new ConflictException('This assignment has already ended');
        if (a.mentorUserId === to) throw new ConflictException('This is already the mentor');
        const today = new Date().toISOString().slice(0, 10);
        await ctx.tx.update(mentorAssignments).set({ endedOn: today }).where(eq(mentorAssignments.id, id));
        await ctx.tx.insert(mentorAssignments).values({ tenantId: ctx.p.tenantId, studentId: a.studentId, mentorUserId: to, startedOn: today, assignedBy: ctx.p.userId });
      },
    },
    columns: [
      { key: 'rollNo', header: 'Roll no' },
      { key: 'studentName', header: 'Student' },
      { key: 'className', header: 'Class' },
      { key: 'mentorName', header: 'Mentor' },
      { key: 'startedOn', header: 'From' },
      { key: 'endedOn', header: 'To' },
      { key: 'sessions', header: 'Sessions' },
    ],
    actions: {
      end: {
        label: 'End mentoring',
        apply: async (ctx, id) => {
          const [a] = await ctx.tx.select().from(mentorAssignments).where(eq(mentorAssignments.id, id));
          if (a.endedOn) throw new ConflictException('This assignment has already ended');
          await ctx.tx.update(mentorAssignments).set({ endedOn: new Date().toISOString().slice(0, 10) }).where(eq(mentorAssignments.id, id));
        },
      },
    },
    import: {
      columns: [
        { key: 'roll_no', header: 'Roll no', required: true, example: 'R12' },
        { key: 'class', header: 'Class' },
        { key: 'mentor_email', header: 'Mentor email', required: true, example: 'teacher@college.edu' },
      ],
      key: ['roll_no'],
      exists: async (ctx, r) => {
        const sid = await studentByRoll(ctx.tx, r.get('roll_no'), r.get('class') || undefined).catch(() => null);
        return !!sid && !!(await ctx.tx.select({ id: mentorAssignments.id }).from(mentorAssignments).where(and(eq(mentorAssignments.studentId, sid), isNull(mentorAssignments.endedOn))))[0];
      },
      run: (ctx, rows) =>
        eachRow(ctx.tx, rows, async (tx, r) => {
          const sid = await studentByRoll(tx, required(r, 'roll_no'), r.get('class') || undefined);
          const mid = await staffByEmail(tx, required(r, 'mentor_email'));
          const today = new Date().toISOString().slice(0, 10);
          const [open] = await tx.select().from(mentorAssignments).where(and(eq(mentorAssignments.studentId, sid), isNull(mentorAssignments.endedOn)));
          if (open?.mentorUserId === mid) return outcome(false, false, [r.get('roll_no')]);
          if (open) await tx.update(mentorAssignments).set({ endedOn: today }).where(eq(mentorAssignments.id, open.id));
          await tx.insert(mentorAssignments).values({ tenantId: ctx.p.tenantId, studentId: sid, mentorUserId: mid, startedOn: today, assignedBy: ctx.p.userId });
          return outcome(!open, !!open, [r.get('roll_no'), r.get('mentor_email')]);
        }),
    },
  };
}

@Injectable()
export class WelfareRecords implements OnModuleInit {
  constructor(private readonly registry: RecordRegistry) {}

  onModuleInit(): void {
    for (const e of [grievanceRoutesEntity(), grievancesEntity(), undertakingsEntity(), accommodationsEntity(), welfareRequestsEntity(), disciplineEntity()]) this.registry.register(e);
  }
}

@Injectable()
export class MentoringRecords implements OnModuleInit {
  constructor(private readonly registry: RecordRegistry) {}

  onModuleInit(): void {
    this.registry.register(mentorAssignmentsEntity());
  }
}
