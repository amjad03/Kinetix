import { Injectable, OnModuleInit } from '@nestjs/common';
import { desc, eq, sql } from 'drizzle-orm';
import type { RoleName } from '../auth/principal.js';
import { iqacActions, iqacAqarSubmissions, iqacFeedbackReports, iqacInitiatives, iqacMeetings, iqacMembers, iqacPractices } from '../db/schema-accreditation.js';
import { RecordRegistry, type FieldOption, type KitCtx } from '../records/entity.js';
import { choices, kitEntity, rowOf } from '../research/kit.js';

/**
 * The IQAC's registers as record kit lists: the committee, meetings, action points, the year's quality initiatives,
 * stakeholder feedback analyses with the action taken, best practices and AQAR submissions.
 */
const READ: RoleName[] = ['tenant_admin', 'principal', 'quality_officer', 'hod', 'accreditation_reviewer'];
const WRITE: RoleName[] = ['tenant_admin', 'principal', 'quality_officer'];
const MODULE = 'accreditation';
const CRITERIA = choices(['1', '2', '3', '4', '5', '6', '7'], { 1: 'Criterion 1', 2: 'Criterion 2', 3: 'Criterion 3', 4: 'Criterion 4', 5: 'Criterion 5', 6: 'Criterion 6', 7: 'Criterion 7' });
const after = (a: unknown, b: unknown) => !!a && !!b && String(a) < String(b);

const meetingOptions = async (ctx: KitCtx): Promise<FieldOption[]> => (await ctx.tx.select({ id: iqacMeetings.id, title: iqacMeetings.title, on: iqacMeetings.meetingOn }).from(iqacMeetings).orderBy(desc(iqacMeetings.meetingOn))).map((m) => ({ value: m.id, label: `${m.on} ${m.title}` }));
const meetingLookup = async (ctx: KitCtx, text: string) => (await ctx.tx.select({ id: iqacMeetings.id }).from(iqacMeetings).where(sql`lower(${iqacMeetings.title}) = ${text.toLowerCase()} or ${iqacMeetings.meetingOn}::text = ${text}`).orderBy(desc(iqacMeetings.meetingOn)).limit(1))[0]?.id ?? null;

function membersEntity() {
  return kitEntity({
    key: 'iqac-members',
    module: MODULE,
    table: iqacMembers,
    subjectType: 'iqac_member',
    roles: { read: READ, write: WRITE },
    title: 'name',
    fields: {
      name: { label: 'Name', kind: 'text', column: iqacMembers.name, required: true, max: 120, example: 'Dr. S. Hegde' },
      category: { label: 'Category', kind: 'select', column: iqacMembers.category, required: true, options: choices(['chairperson', 'coordinator', 'management', 'teacher', 'administrative', 'external_expert', 'alumni', 'student', 'employer', 'local_society']), bulk: true, example: 'Teacher', help: 'NAAC lists the head of the institution as chairperson, teachers, management, administrative officers, local society, students, alumni, employers and experts' },
      designation: { label: 'Designation', kind: 'text', column: iqacMembers.designation, max: 120, example: 'Associate Professor, Commerce' },
      organisation: { label: 'Organisation', kind: 'text', column: iqacMembers.organisation, max: 160 },
      userId: { label: 'ERP account', kind: 'user', column: iqacMembers.userId, help: 'For members on the staff' },
      email: { label: 'E-mail', kind: 'email', column: iqacMembers.email },
      phone: { label: 'Phone', kind: 'text', column: iqacMembers.phone, max: 20 },
      termFrom: { label: 'Term from', kind: 'date', column: iqacMembers.termFrom, required: true, example: '2025-06-01' },
      termTo: { label: 'Term to', kind: 'date', column: iqacMembers.termTo, example: '2027-05-31' },
    },
    extra: { active: sql<boolean>`(${iqacMembers.termTo} is null or ${iqacMembers.termTo} >= current_date)` },
    filters: { term: { label: 'Term', options: choices(['current', 'past']), where: (v) => (v === 'current' ? sql`(${iqacMembers.termTo} is null or ${iqacMembers.termTo} >= current_date)` : v === 'past' ? sql`${iqacMembers.termTo} < current_date` : undefined) } },
    search: [iqacMembers.name, iqacMembers.designation, iqacMembers.organisation],
    defaultSort: { id: 'name', dir: 'asc' },
    order: { column: iqacMembers.sortOrder },
    importKey: ['name', 'termFrom'],
    validate: async (ctx, id) => {
      const r = await rowOf(ctx, iqacMembers, id);
      if (after(r.termTo, r.termFrom)) return 'The term ends before it starts';
      if (r.category === 'chairperson' || r.category === 'coordinator') {
        const [other] = await ctx.tx.execute(sql`select 1 from iqac_members where category = ${r.category} and id <> ${id} and (term_to is null or term_to >= current_date) and (${r.termTo}::date is null or ${r.termTo}::date >= current_date) limit 1`).then((x) => x.rows);
        if (other) return `The IQAC already has a ${r.category} for this term`;
      }
      return null;
    },
  });
}

function meetingsEntity() {
  return kitEntity({
    key: 'iqac-meetings',
    module: MODULE,
    table: iqacMeetings,
    subjectType: 'iqac_meeting',
    roles: { read: READ, write: WRITE },
    title: 'title',
    fields: {
      title: { label: 'Meeting', kind: 'text', column: iqacMeetings.title, required: true, max: 200, example: 'Second IQAC meeting 2026-27' },
      kind: { label: 'Kind', kind: 'select', column: iqacMeetings.kind, options: choices(['regular', 'special']), example: 'Regular' },
      meetingOn: { label: 'Date', kind: 'date', column: iqacMeetings.meetingOn, required: true, example: '2026-10-01' },
      venue: { label: 'Venue', kind: 'text', column: iqacMeetings.venue, max: 120 },
      status: { label: 'Status', kind: 'select', column: iqacMeetings.status, options: choices(['scheduled', 'held', 'minutes_approved']), bulk: true },
      present: { label: 'Members present', kind: 'number', column: iqacMeetings.present, int: true, min: 0, max: 200 },
      agenda: { label: 'Agenda', kind: 'textarea', column: iqacMeetings.agenda, max: 4000 },
      minutes: { label: 'Minutes', kind: 'textarea', column: iqacMeetings.minutes, max: 12000 },
      attendees: { label: 'Attendees', kind: 'textarea', column: iqacMeetings.attendees, max: 2000 },
    },
    extra: {
      actions: sql<number>`(select count(*)::int from iqac_actions a where a.meeting_id = "iqac_meetings"."id")`,
      openActions: sql<number>`(select count(*)::int from iqac_actions a where a.meeting_id = "iqac_meetings"."id" and a.status in ('open', 'in_progress'))`,
    },
    search: [iqacMeetings.title, iqacMeetings.agenda, iqacMeetings.minutes],
    defaultSort: { id: 'meetingOn', dir: 'desc' },
    defaults: (ctx) => ({ createdBy: ctx.p.userId }),
    importKey: ['title', 'meetingOn'],
    validate: async (ctx, id) => {
      const r = await rowOf(ctx, iqacMeetings, id);
      if (r.status === 'minutes_approved' && !String(r.minutes ?? '').trim()) return 'Write the minutes before marking them approved';
      return null;
    },
  });
}

function actionsEntity() {
  return kitEntity({
    key: 'iqac-actions',
    module: MODULE,
    table: iqacActions,
    subjectType: 'iqac_action',
    roles: { read: READ, write: WRITE },
    title: 'action',
    fields: {
      meetingId: { label: 'Meeting', kind: 'ref', column: iqacActions.meetingId, required: true, options: meetingOptions, lookup: meetingLookup, filter: true, help: 'In an import, the meeting title or date', example: 'Second IQAC meeting 2026-27' },
      action: { label: 'Action point', kind: 'text', column: iqacActions.action, required: true, max: 1000, example: 'Collect alumni feedback on the curriculum' },
      ownerUserId: { label: 'Owner', kind: 'user', column: iqacActions.ownerUserId, bulk: true, filter: true },
      ownerName: { label: 'Owner (not on the staff)', kind: 'text', column: iqacActions.ownerName, max: 120 },
      departmentId: { label: 'Department', kind: 'department', column: iqacActions.departmentId, bulk: true },
      criterion: { label: 'NAAC criterion', kind: 'select', column: iqacActions.criterion, options: CRITERIA, bulk: true },
      priority: { label: 'Priority', kind: 'select', column: iqacActions.priority, options: choices(['low', 'normal', 'high']), bulk: true },
      dueOn: { label: 'Due on', kind: 'date', column: iqacActions.dueOn, bulk: true },
      status: { label: 'Status', kind: 'select', column: iqacActions.status, options: choices(['open', 'in_progress', 'done', 'dropped']), bulk: true },
      actionTaken: { label: 'Action taken', kind: 'textarea', column: iqacActions.actionTaken, max: 4000 },
    },
    extra: {
      meeting: sql<string>`(select m.title from iqac_meetings m where m.id = ${iqacActions.meetingId})`,
      overdue: sql<boolean>`(${iqacActions.status} in ('open', 'in_progress') and ${iqacActions.dueOn} < current_date)`,
    },
    filters: { overdue: { label: 'Overdue', options: choices(['yes']), where: (v) => (v === 'yes' ? sql`${iqacActions.status} in ('open', 'in_progress') and ${iqacActions.dueOn} < current_date` : undefined) } },
    search: [iqacActions.action, iqacActions.ownerName, iqacActions.actionTaken],
    defaultSort: { id: 'dueOn', dir: 'asc' },
    importKey: ['meetingId', 'action'],
    move: { label: 'Move to meeting', options: meetingOptions, column: iqacActions.meetingId },
    validate: async (ctx, id) => {
      const r = await rowOf(ctx, iqacActions, id);
      if (r.status === 'done' && !String(r.actionTaken ?? '').trim()) return 'Describe the action taken before closing it';
      const closed = r.status === 'done' || r.status === 'dropped';
      if (closed !== !!r.closedAt) await ctx.tx.update(iqacActions).set({ closedAt: closed ? new Date() : null }).where(eq(iqacActions.id, id));
      return null;
    },
  });
}

function initiativesEntity() {
  return kitEntity({
    key: 'iqac-initiatives',
    module: MODULE,
    table: iqacInitiatives,
    subjectType: 'iqac_initiative',
    roles: { read: READ, write: WRITE },
    title: 'title',
    fields: {
      title: { label: 'Initiative', kind: 'text', column: iqacInitiatives.title, required: true, max: 200, example: 'Academic and administrative audit' },
      kind: { label: 'Kind', kind: 'select', column: iqacInitiatives.kind, required: true, options: choices(['workshop', 'audit', 'survey', 'ranking', 'collaboration', 'orientation', 'award', 'other']), bulk: true, example: 'Audit' },
      criterion: { label: 'NAAC criterion', kind: 'select', column: iqacInitiatives.criterion, options: CRITERIA, bulk: true },
      plannedOn: { label: 'Planned for', kind: 'date', column: iqacInitiatives.plannedOn, example: '2026-11-15' },
      heldOn: { label: 'Held on', kind: 'date', column: iqacInitiatives.heldOn },
      participants: { label: 'Participants', kind: 'number', column: iqacInitiatives.participants, int: true, min: 0, max: 100000 },
      coordinatorUserId: { label: 'Coordinator', kind: 'user', column: iqacInitiatives.coordinatorUserId },
      status: { label: 'Status', kind: 'select', column: iqacInitiatives.status, options: choices(['planned', 'done', 'cancelled']), bulk: true },
      outcome: { label: 'Outcome', kind: 'textarea', column: iqacInitiatives.outcome, max: 4000 },
    },
    search: [iqacInitiatives.title, iqacInitiatives.outcome],
    defaultSort: { id: 'plannedOn', dir: 'asc' },
    importKey: ['title', 'plannedOn'],
    duplicate: (_ctx, _row) => ({ status: 'planned', held_on: null, participants: null, outcome: null }),
    validate: async (ctx, id) => {
      const r = await rowOf(ctx, iqacInitiatives, id);
      if (r.status === 'done' && !r.heldOn) return 'Give the date it was held';
      return null;
    },
  });
}

function feedbackEntity() {
  return kitEntity({
    key: 'iqac-feedback',
    module: MODULE,
    table: iqacFeedbackReports,
    subjectType: 'iqac_feedback_report',
    roles: { read: READ, write: WRITE },
    title: 'summary',
    label: (r) => `${r.stakeholder} ${r.cycle}`,
    fields: {
      cycle: { label: 'Academic year', kind: 'text', column: iqacFeedbackReports.cycle, required: true, max: 7, example: '2026-27' },
      stakeholder: { label: 'Stakeholder', kind: 'select', column: iqacFeedbackReports.stakeholder, required: true, options: choices(['students', 'teachers', 'employers', 'alumni', 'parents']), example: 'Students' },
      responses: { label: 'Responses', kind: 'number', column: iqacFeedbackReports.responses, int: true, min: 0, max: 32000 },
      averageRating: { label: 'Average rating', kind: 'number', column: iqacFeedbackReports.averageRating, min: 0, max: 10 },
      summary: { label: 'Analysis', kind: 'textarea', column: iqacFeedbackReports.summary, required: true, max: 4000, example: 'Students ask for more laboratory hours' },
      actionTaken: { label: 'Action taken', kind: 'textarea', column: iqacFeedbackReports.actionTaken, max: 4000 },
      status: { label: 'Status', kind: 'select', column: iqacFeedbackReports.status, options: choices(['analysed', 'action_planned', 'action_taken']), bulk: true },
    },
    search: [iqacFeedbackReports.summary, iqacFeedbackReports.actionTaken],
    defaultSort: { id: 'cycle', dir: 'desc' },
    defaults: (ctx) => ({ createdBy: ctx.p.userId }),
    importKey: ['cycle', 'stakeholder'],
    validate: async (ctx, id) => {
      const r = await rowOf(ctx, iqacFeedbackReports, id);
      if (!/^\d{4}-\d{2}$/.test(String(r.cycle))) return 'Give the academic year like 2026-27';
      if (r.status === 'action_taken' && !String(r.actionTaken ?? '').trim()) return 'Describe the action taken';
      return null;
    },
  });
}

function practicesEntity() {
  return kitEntity({
    key: 'iqac-practices',
    module: MODULE,
    table: iqacPractices,
    subjectType: 'iqac_practice',
    roles: { read: READ, write: WRITE },
    title: 'title',
    fields: {
      kind: { label: 'Kind', kind: 'select', column: iqacPractices.kind, required: true, options: choices(['best_practice', 'distinctiveness']), example: 'Best practice' },
      title: { label: 'Title of the practice', kind: 'text', column: iqacPractices.title, required: true, max: 200, example: 'Mentoring circles' },
      year: { label: 'Year', kind: 'text', column: iqacPractices.year, max: 20, example: '2026-27' },
      objectives: { label: 'Objectives', kind: 'textarea', column: iqacPractices.objectives, max: 4000 },
      context: { label: 'The context', kind: 'textarea', column: iqacPractices.context, max: 4000 },
      practice: { label: 'The practice', kind: 'textarea', column: iqacPractices.practice, max: 8000 },
      evidence: { label: 'Evidence of success', kind: 'textarea', column: iqacPractices.evidence, max: 4000 },
      problems: { label: 'Problems encountered and resources required', kind: 'textarea', column: iqacPractices.problems, max: 4000 },
    },
    extra: { complete: sql<boolean>`(${iqacPractices.objectives} <> '' and ${iqacPractices.context} <> '' and ${iqacPractices.practice} <> '' and ${iqacPractices.evidence} <> '' and ${iqacPractices.problems} <> '')` },
    search: [iqacPractices.title, iqacPractices.practice],
    defaultSort: { id: 'title', dir: 'asc' },
    defaults: (ctx) => ({ createdBy: ctx.p.userId }),
    duplicate: true,
  });
}

function aqarEntity() {
  return kitEntity({
    key: 'iqac-aqar',
    module: MODULE,
    table: iqacAqarSubmissions,
    subjectType: 'iqac_aqar',
    roles: { read: READ, write: WRITE },
    title: 'year',
    label: (r) => `AQAR ${r.year}`,
    fields: {
      year: { label: 'Year', kind: 'text', column: iqacAqarSubmissions.year, required: true, max: 7, example: '2025-26' },
      dueOn: { label: 'Due on', kind: 'date', column: iqacAqarSubmissions.dueOn, example: '2026-12-31' },
      status: { label: 'Status', kind: 'select', column: iqacAqarSubmissions.status, options: choices(['preparing', 'submitted', 'accepted', 'returned']) },
      submittedOn: { label: 'Submitted on', kind: 'date', column: iqacAqarSubmissions.submittedOn },
      reference: { label: 'NAAC acknowledgement', kind: 'text', column: iqacAqarSubmissions.reference, max: 80 },
      note: { label: 'Note', kind: 'textarea', column: iqacAqarSubmissions.note, max: 2000 },
    },
    search: [iqacAqarSubmissions.year, iqacAqarSubmissions.reference],
    defaultSort: { id: 'year', dir: 'desc' },
    importKey: ['year'],
    validate: async (ctx, id) => {
      const r = await rowOf(ctx, iqacAqarSubmissions, id);
      if (!/^\d{4}-\d{2}$/.test(String(r.year))) return 'Give the year like 2025-26';
      if (r.status !== 'preparing' && !r.submittedOn) return 'Give the date the AQAR was submitted';
      if (r.status === 'accepted' && !r.reference) return 'Give NAAC\'s acknowledgement number';
      return null;
    },
  });
}

@Injectable()
export class IqacRecords implements OnModuleInit {
  constructor(private readonly registry: RecordRegistry) {}

  onModuleInit(): void {
    for (const e of [membersEntity(), meetingsEntity(), actionsEntity(), initiativesEntity(), feedbackEntity(), practicesEntity(), aqarEntity()]) this.registry.register(e);
  }
}

