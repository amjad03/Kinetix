import { ConflictException, Injectable, OnModuleInit } from '@nestjs/common';
import { and, asc, eq, sql, type AnyColumn } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { z } from 'zod';
import { campusEvents, clubs, committees, students, sections, users } from '../db/schema.js';
import { activityUnits, clubExpenseClaims, elections, outreachActivities, studentAchievements } from '../db/schema-life.js';
import { fail, lc, outcome, required } from '../import/row-helpers.js';
import { RecordRegistry, type FieldOption, type KitCtx, type RecordEntity } from '../records/entity.js';
import { copyName, DateText, Int, OptionalRef, OptionalText, Ref, Text, uuidEq } from '../records/helpers.js';
import { eachRow } from '../records/import.js';
import { COMMITTEE_STAFF, LIFE_STAFF } from './campus-life.access.js';
import { CampusDepthService } from './life-depth.service.js';
import { insertRecord, qualified, Rupees, rupeesOf, staffByEmail, staffOptions, studentByRoll, studentOptions, yearLabelOf } from './kit-shared.js';

const choices = (m: Record<string, string>): FieldOption[] => Object.entries(m).map(([value, label]) => ({ value, label }));
const pick = (opts: FieldOption[]) => z.enum(opts.map((o) => o.value) as [string, ...string[]]);
const labelOf = (opts: FieldOption[], v: unknown) => opts.find((o) => o.value === v)?.label ?? String(v ?? '');
const inChoices = (opts: FieldOption[], v: string, what: string) => {
  const hit = opts.find((o) => o.value === lc(v) || lc(o.label) === lc(v));
  return hit ? hit.value : fail(`Use one of: ${opts.map((o) => o.value).join(', ')}`, `${what}: ${v}`);
};
const yes = (v: string) => ['yes', 'y', 'true', '1'].includes(lc(v));
const coordinator = alias(users, 'coordinator');

export const CLUB_CATEGORIES = choices({ academic: 'Academic', cultural: 'Cultural', sports: 'Sports', service: 'Service', technical: 'Technical', general: 'General' });
export const UNIT_KINDS = choices({ nss: 'NSS unit', ncc: 'NCC company', sports: 'Sports team', other: 'Other unit' });
export const ACH_CATEGORIES = choices({ sports: 'Sports', cultural: 'Cultural', academic: 'Academic', technical: 'Technical', social: 'Social service', other: 'Other' });
export const ACH_LEVELS = choices({ institution: 'Institution', inter_college: 'Inter-college', university: 'University', state: 'State', national: 'National', international: 'International' });
export const ACH_POSITIONS = choices({ winner: 'Winner', runner_up: 'Runner-up', third: 'Third place', participation: 'Participation', special: 'Special mention' });
export const ACH_STATUSES = choices({ pending: 'To verify', verified: 'Verified', rejected: 'Rejected' });
export const OUTREACH_KINDS = choices({ extension: 'Extension activity', outreach: 'Outreach programme', gender: 'Gender sensitisation', sustainability: 'Environment and sustainability', swachh: 'Swachh Bharat', health: 'Health and awareness', other: 'Other' });
export const EVENT_TYPES = choices({ seminar: 'Seminar', workshop: 'Workshop', parent_meeting: 'Parent meeting', fest: 'Fest', sports: 'Sports', competition: 'Competition', conference: 'Conference', alumni: 'Alumni', other: 'Other' });
export const EVENT_STATUSES = choices({ draft: 'Draft', published: 'Published', cancelled: 'Cancelled' });
export const EVENT_APPROVALS = choices({ not_required: 'Not needed', pending: 'Awaiting approval', approved: 'Approved', rejected: 'Rejected' });
export const AUDIENCES = choices({ all: 'Everyone', students: 'Students', parents: 'Parents', staff: 'Staff' });
export const CLAIM_STATUSES = choices({ submitted: 'Submitted', approved: 'Approved', rejected: 'Rejected', paid: 'Paid' });
export const ELECTION_STATUSES = choices({ draft: 'Draft', open: 'Voting open', closed: 'Closed', published: 'Results published' });

async function clubOptions(ctx: KitCtx): Promise<FieldOption[]> {
  return (await ctx.tx.select({ id: clubs.id, name: clubs.name }).from(clubs).orderBy(asc(clubs.name))).map((r) => ({ value: r.id, label: r.name }));
}
async function unitOptions(ctx: KitCtx): Promise<FieldOption[]> {
  return (await ctx.tx.select({ id: activityUnits.id, name: activityUnits.name, kind: activityUnits.kind }).from(activityUnits).orderBy(asc(activityUnits.sortOrder), asc(activityUnits.name))).map((r) => ({ value: r.id, label: r.name, group: labelOf(UNIT_KINDS, r.kind) }));
}

// ---- clubs ---------------------------------------------------------------------------------------

const clubMembersCount = sql<number>`(select count(*)::int from club_members m where m.club_id = ${clubs.id} and m.status = 'active')`;
const clubPending = sql<number>`(select count(*)::int from club_members m where m.club_id = ${clubs.id} and m.status = 'requested')`;

export function clubsEntity(): RecordEntity {
  return {
    key: 'clubs',
    module: 'campus-life',
    table: clubs,
    subjectType: 'club',
    roles: { read: LIFE_STAFF, write: LIFE_STAFF },
    label: (r) => String(r.name),
    list: {
      select: { id: clubs.id, name: clubs.name, category: clubs.category, description: clubs.description, facultyCoordinatorId: clubs.facultyCoordinatorId, coordinatorName: coordinator.fullName, active: clubs.active, members: clubMembersCount, pending: clubPending, createdAt: clubs.createdAt },
      joins: (q) => q.leftJoin(coordinator, eq(coordinator.id, clubs.facultyCoordinatorId)),
      search: [clubs.name, clubs.description, coordinator.fullName],
      filters: {
        category: { label: 'Category', options: CLUB_CATEGORIES, where: (v) => eq(clubs.category, v) },
        active: { label: 'Status', options: [{ value: 'yes', label: 'Active' }, { value: 'no', label: 'Inactive' }], where: (v) => eq(clubs.active, v === 'yes') },
        pending: { label: 'Join requests', options: [{ value: 'yes', label: 'Has requests' }], where: (v) => (v === 'yes' ? sql`${clubPending} > 0` : undefined) },
      },
      sorts: { name: clubs.name, category: clubs.category, members: clubMembersCount, pending: clubPending, coordinator: coordinator.fullName, created: clubs.createdAt },
      defaultSort: { id: 'name', dir: 'asc' },
    },
    fields: {
      name: { label: 'Name', type: 'text', schema: Text(120), column: clubs.name, required: true },
      category: { label: 'Category', type: 'select', schema: pick(CLUB_CATEGORIES), column: clubs.category, options: CLUB_CATEGORIES, required: true, bulk: true },
      facultyCoordinatorId: { label: 'Faculty coordinator', type: 'select', schema: OptionalRef, column: clubs.facultyCoordinatorId, options: staffOptions, bulk: true },
      description: { label: 'Description', type: 'textarea', schema: z.string().trim().max(2000), column: clubs.description },
      active: { label: 'Active', type: 'boolean', schema: z.boolean(), column: clubs.active, bulk: true, create: false },
    },
    duplicate: async (ctx, row) => ({ name: await copyName(ctx.tx, clubs, clubs.name, String(row.name)) }),
    columns: [
      { key: 'name', header: 'Club' },
      { key: 'category', header: 'Category', value: (r) => labelOf(CLUB_CATEGORIES, r.category) },
      { key: 'coordinatorName', header: 'Coordinator' },
      { key: 'members', header: 'Members' },
      { key: 'pending', header: 'Join requests' },
      { key: 'active', header: 'Active', value: (r) => (r.active ? 'Yes' : 'No') },
      { key: 'description', header: 'Description' },
    ],
    import: {
      columns: [
        { key: 'name', header: 'Club', required: true, example: 'Nature Club' },
        { key: 'category', header: 'Category', required: true, options: CLUB_CATEGORIES.map((o) => o.value), example: 'service' },
        { key: 'coordinator_email', header: 'Coordinator email', help: "Optional: the faculty coordinator's email" },
        { key: 'description', header: 'Description' },
      ],
      key: ['name'],
      exists: async (ctx, r) => !!(await ctx.tx.select({ id: clubs.id }).from(clubs).where(sql`lower(${clubs.name}) = ${lc(r.get('name'))}`))[0],
      run: (ctx, rows) =>
        eachRow(ctx.tx, rows, async (tx, r) => {
          const name = required(r, 'name');
          const category = inChoices(CLUB_CATEGORIES, required(r, 'category'), 'Category');
          const coord = r.get('coordinator_email') ? await staffByEmail(tx, r.get('coordinator_email')) : undefined;
          const [hit] = await tx.select().from(clubs).where(sql`lower(${clubs.name}) = ${lc(name)}`);
          const values = { category, ...(coord ? { facultyCoordinatorId: coord } : {}), ...(r.get('description') ? { description: r.get('description') } : {}) };
          if (!hit) {
            await tx.insert(clubs).values({ tenantId: ctx.p.tenantId, name, ...values });
            return outcome(true, false, [name]);
          }
          await tx.update(clubs).set(values).where(eq(clubs.id, hit.id));
          return outcome(false, true, [name]);
        }),
    },
  };
}

// ---- committees ----------------------------------------------------------------------------------

const committeeMembersCount = sql<number>`(select count(*)::int from committee_members m where m.committee_id = ${qualified('committees')} and (m.tenure_end is null or m.tenure_end >= current_date))`;
const committeeOpen = sql<number>`(select count(*)::int from committee_action_items a where a.committee_id = ${qualified('committees')} and a.status in ('open', 'in_progress'))`;

export function committeesEntity(): RecordEntity {
  return {
    key: 'committees',
    module: 'campus-life',
    table: committees,
    subjectType: 'committee',
    roles: { read: COMMITTEE_STAFF, write: COMMITTEE_STAFF },
    label: (r) => String(r.name),
    list: {
      select: { id: committees.id, name: committees.name, statutory: committees.statutory, description: committees.description, active: committees.active, members: committeeMembersCount, openActions: committeeOpen, createdAt: committees.createdAt },
      search: [committees.name, committees.description],
      filters: {
        statutory: { label: 'Kind', options: [{ value: 'yes', label: 'Statutory' }, { value: 'no', label: 'Other' }], where: (v) => eq(committees.statutory, v === 'yes') },
        active: { label: 'Status', options: [{ value: 'yes', label: 'Active' }, { value: 'no', label: 'Inactive' }], where: (v) => eq(committees.active, v === 'yes') },
      },
      sorts: { name: committees.name, members: committeeMembersCount, open: committeeOpen, created: committees.createdAt },
      defaultSort: { id: 'name', dir: 'asc' },
    },
    fields: {
      name: { label: 'Name', type: 'text', schema: Text(160), column: committees.name, required: true },
      statutory: { label: 'Statutory committee', type: 'boolean', schema: z.boolean(), column: committees.statutory, bulk: true, help: 'IQAC, anti-ragging, ICC, SC/ST cell, grievance redressal' },
      description: { label: 'Description', type: 'textarea', schema: z.string().trim().max(2000), column: committees.description },
      active: { label: 'Active', type: 'boolean', schema: z.boolean(), column: committees.active, bulk: true, create: false },
    },
    duplicate: async (ctx, row) => ({ name: await copyName(ctx.tx, committees, committees.name, String(row.name)) }),
    columns: [
      { key: 'name', header: 'Committee' },
      { key: 'statutory', header: 'Statutory', value: (r) => (r.statutory ? 'Yes' : 'No') },
      { key: 'members', header: 'Members' },
      { key: 'openActions', header: 'Open actions' },
      { key: 'active', header: 'Active', value: (r) => (r.active ? 'Yes' : 'No') },
    ],
    import: {
      columns: [
        { key: 'name', header: 'Committee', required: true, example: 'Anti-ragging committee' },
        { key: 'statutory', header: 'Statutory', options: ['yes', 'no'], example: 'yes' },
        { key: 'description', header: 'Description' },
      ],
      key: ['name'],
      exists: async (ctx, r) => !!(await ctx.tx.select({ id: committees.id }).from(committees).where(sql`lower(${committees.name}) = ${lc(r.get('name'))}`))[0],
      run: (ctx, rows) =>
        eachRow(ctx.tx, rows, async (tx, r) => {
          const name = required(r, 'name');
          const [hit] = await tx.select().from(committees).where(sql`lower(${committees.name}) = ${lc(name)}`);
          const values = { statutory: yes(r.get('statutory')), ...(r.get('description') ? { description: r.get('description') } : {}) };
          if (!hit) {
            await tx.insert(committees).values({ tenantId: ctx.p.tenantId, name, ...values });
            return outcome(true, false, [name]);
          }
          await tx.update(committees).set(values).where(eq(committees.id, hit.id));
          return outcome(false, true, [name]);
        }),
    },
  };
}

// ---- campus events -------------------------------------------------------------------------------

const evRegistered = sql<number>`(select count(*)::int from event_registrations r where r.event_id = ${qualified('campus_events')} and r.status = 'registered')`;
const evExternal = sql<number>`(select count(*)::int from event_external_registrations r where r.event_id = ${qualified('campus_events')} and r.status = 'registered')`;
const evAttended = sql<number>`((select count(*)::int from event_registrations r where r.event_id = ${qualified('campus_events')} and r.checked_in_at is not null) + (select count(*)::int from event_external_registrations r where r.event_id = ${qualified('campus_events')} and r.checked_in_at is not null))`;

export function campusEventsEntity(cancel: (ctx: KitCtx, id: string, reason: string) => Promise<string>): RecordEntity {
  return {
    key: 'campus-events',
    module: 'campus-life',
    table: campusEvents,
    subjectType: 'event',
    roles: { read: LIFE_STAFF, write: LIFE_STAFF },
    label: (r) => String(r.title),
    list: {
      select: {
        id: campusEvents.id,
        title: campusEvents.title,
        eventType: campusEvents.eventType,
        venue: campusEvents.venue,
        capacity: campusEvents.capacity,
        startsAt: campusEvents.startsAt,
        endsAt: campusEvents.endsAt,
        audience: campusEvents.audience,
        feeRupees: rupeesOf(campusEvents.feePaise),
        budgetRupees: rupeesOf(campusEvents.budgetPaise),
        spentRupees: rupeesOf(campusEvents.spentPaise),
        status: campusEvents.status,
        approvalStatus: campusEvents.approvalStatus,
        externalRegistration: campusEvents.externalRegistration,
        description: campusEvents.description,
        hasReport: sql<boolean>`${campusEvents.reportAt} is not null`,
        registered: evRegistered,
        external: evExternal,
        attended: evAttended,
        createdAt: campusEvents.createdAt,
      },
      search: [campusEvents.title, campusEvents.venue, campusEvents.description],
      filters: {
        status: { label: 'Status', options: EVENT_STATUSES, where: (v) => eq(campusEvents.status, v) },
        approval: { label: 'Approval', options: EVENT_APPROVALS, where: (v) => eq(campusEvents.approvalStatus, v) },
        type: { label: 'Type', options: EVENT_TYPES, where: (v) => eq(campusEvents.eventType, v) },
        when: { label: 'When', options: [{ value: 'upcoming', label: 'Upcoming' }, { value: 'past', label: 'Past' }], where: (v) => (v === 'upcoming' ? sql`${campusEvents.endsAt} > now()` : v === 'past' ? sql`${campusEvents.endsAt} <= now()` : undefined) },
        report: { label: 'Report', options: [{ value: 'missing', label: 'Report missing' }, { value: 'done', label: 'Report written' }], where: (v) => (v === 'missing' ? sql`${campusEvents.reportAt} is null and ${campusEvents.endsAt} <= now() and ${campusEvents.status} = 'published'` : v === 'done' ? sql`${campusEvents.reportAt} is not null` : undefined) },
      },
      sorts: { starts: campusEvents.startsAt, title: campusEvents.title, type: campusEvents.eventType, registered: evRegistered, attended: evAttended, budget: campusEvents.budgetPaise, created: campusEvents.createdAt },
      defaultSort: { id: 'starts', dir: 'desc' },
    },
    fields: {
      title: { label: 'Title', type: 'text', schema: Text(200), column: campusEvents.title, required: true, create: false },
      eventType: { label: 'Type', type: 'select', schema: pick(EVENT_TYPES), column: campusEvents.eventType, options: EVENT_TYPES, bulk: true, create: false },
      venue: { label: 'Venue', type: 'text', schema: z.string().trim().max(200), column: campusEvents.venue, bulk: true, create: false },
      capacity: { label: 'Capacity', type: 'number', schema: Int(1, 100000), column: campusEvents.capacity, create: false },
      audience: { label: 'Audience', type: 'select', schema: pick(AUDIENCES), column: campusEvents.audience, options: AUDIENCES, bulk: true, create: false },
      budgetRupees: { label: 'Budget (₹)', type: 'number', schema: Rupees, create: false, apply: async (ctx, id, v) => void (await ctx.tx.update(campusEvents).set({ budgetPaise: v as number }).where(eq(campusEvents.id, id))) },
      externalRegistration: { label: 'Open to other institutions', type: 'boolean', schema: z.boolean(), column: campusEvents.externalRegistration, create: false },
      description: { label: 'Description', type: 'textarea', schema: z.string().trim().max(4000), column: campusEvents.description, create: false },
    },
    duplicate: async (ctx, row) => ({ title: await copyName(ctx.tx, campusEvents, campusEvents.title, String(row.title)), status: 'draft', approval_status: 'not_required', approved_by: null, approved_at: null, approval_note: '', report: '', report_at: null, spent_paise: 0, cancel_reason: '', created_by: ctx.p.userId }),
    columns: [
      { key: 'title', header: 'Event' },
      { key: 'eventType', header: 'Type', value: (r) => labelOf(EVENT_TYPES, r.eventType) },
      { key: 'startsAt', header: 'Starts', value: (r) => (r.startsAt instanceof Date ? r.startsAt.toISOString() : String(r.startsAt)) },
      { key: 'endsAt', header: 'Ends', value: (r) => (r.endsAt instanceof Date ? r.endsAt.toISOString() : String(r.endsAt)) },
      { key: 'venue', header: 'Venue' },
      { key: 'status', header: 'Status', value: (r) => labelOf(EVENT_STATUSES, r.status) },
      { key: 'approvalStatus', header: 'Approval', value: (r) => labelOf(EVENT_APPROVALS, r.approvalStatus) },
      { key: 'capacity', header: 'Capacity' },
      { key: 'registered', header: 'Registered' },
      { key: 'external', header: 'External' },
      { key: 'attended', header: 'Attended' },
      { key: 'feeRupees', header: 'Fee (₹)' },
      { key: 'budgetRupees', header: 'Budget (₹)' },
      { key: 'spentRupees', header: 'Spent (₹)' },
    ],
    actions: {
      publish: {
        label: 'Publish',
        apply: async (ctx, id) => {
          const [ev] = await ctx.tx.select().from(campusEvents).where(eq(campusEvents.id, id)).for('update');
          if (ev.status !== 'draft') throw new ConflictException(`A ${ev.status} event cannot be published`);
          if (ev.approvalStatus === 'pending' || ev.approvalStatus === 'rejected') throw new ConflictException('The proposal must be approved before the event is published');
          await ctx.tx.update(campusEvents).set({ status: 'published' }).where(eq(campusEvents.id, id));
        },
      },
      cancel: {
        label: 'Cancel event',
        tone: 'danger',
        params: z.object({ reason: z.string().trim().max(500).default('') }),
        apply: (ctx, id, params) => cancel(ctx, id, (params as { reason: string }).reason),
      },
    },
  };
}

// ---- NSS, NCC, sports teams ----------------------------------------------------------------------

const unitMembersCount = sql<number>`(select count(*)::int from unit_members m where m.unit_id = ${activityUnits.id} and m.status = 'active')`;
const unitHoursTotal = sql<number>`(select coalesce(sum(h.hours), 0)::float8 from unit_hours h where h.unit_id = ${activityUnits.id})`;
const unitActivitiesCount = sql<number>`(select count(*)::int from unit_activities a where a.unit_id = ${activityUnits.id})`;

export function activityUnitsEntity(): RecordEntity {
  return {
    key: 'activity-units',
    module: 'campus-life',
    table: activityUnits,
    subjectType: 'activity_unit',
    roles: { read: LIFE_STAFF, write: LIFE_STAFF },
    label: (r) => String(r.name),
    list: {
      select: { id: activityUnits.id, kind: activityUnits.kind, name: activityUnits.name, sport: activityUnits.sport, coordinatorUserId: activityUnits.coordinatorUserId, coordinatorName: coordinator.fullName, targetHours: activityUnits.targetHours, description: activityUnits.description, active: activityUnits.active, sortOrder: activityUnits.sortOrder, members: unitMembersCount, hours: unitHoursTotal, activities: unitActivitiesCount, createdAt: activityUnits.createdAt },
      joins: (q) => q.leftJoin(coordinator, eq(coordinator.id, activityUnits.coordinatorUserId)),
      search: [activityUnits.name, activityUnits.sport, coordinator.fullName],
      filters: {
        kind: { label: 'Kind', options: UNIT_KINDS, where: (v) => eq(activityUnits.kind, v as 'nss') },
        active: { label: 'Status', options: [{ value: 'yes', label: 'Active' }, { value: 'no', label: 'Inactive' }], where: (v) => eq(activityUnits.active, v === 'yes') },
      },
      sorts: { order: activityUnits.sortOrder, name: activityUnits.name, kind: activityUnits.kind, members: unitMembersCount, hours: unitHoursTotal, created: activityUnits.createdAt },
      defaultSort: { id: 'order', dir: 'asc' },
      tiebreak: [activityUnits.name],
    },
    fields: {
      kind: { label: 'Kind', type: 'select', schema: pick(UNIT_KINDS), column: activityUnits.kind, options: UNIT_KINDS, required: true },
      name: { label: 'Name', type: 'text', schema: Text(120), column: activityUnits.name, required: true },
      sport: { label: 'Sport', type: 'text', schema: z.string().trim().max(80), column: activityUnits.sport, help: 'Sports teams only' },
      coordinatorUserId: { label: 'Coordinator', type: 'select', schema: OptionalRef, column: activityUnits.coordinatorUserId, options: staffOptions, bulk: true, help: 'Programme officer, associate NCC officer or coach' },
      targetHours: { label: 'Hours target per member', type: 'number', schema: Int(0, 2000), column: activityUnits.targetHours, bulk: true, help: 'NSS: 240 hours over two years; 0 for no target' },
      description: { label: 'Description', type: 'textarea', schema: z.string().trim().max(2000), column: activityUnits.description },
      active: { label: 'Active', type: 'boolean', schema: z.boolean(), column: activityUnits.active, bulk: true, create: false },
    },
    order: { column: activityUnits.sortOrder },
    duplicate: async (ctx, row) => ({ name: await copyName(ctx.tx, activityUnits, activityUnits.name, String(row.name)) }),
    columns: [
      { key: 'name', header: 'Unit' },
      { key: 'kind', header: 'Kind', value: (r) => labelOf(UNIT_KINDS, r.kind) },
      { key: 'sport', header: 'Sport' },
      { key: 'coordinatorName', header: 'Coordinator' },
      { key: 'members', header: 'Members' },
      { key: 'activities', header: 'Activities' },
      { key: 'hours', header: 'Hours logged' },
      { key: 'targetHours', header: 'Target hours' },
    ],
    import: {
      columns: [
        { key: 'name', header: 'Unit', required: true, example: 'NSS Unit 1' },
        { key: 'kind', header: 'Kind', required: true, options: UNIT_KINDS.map((o) => o.value), example: 'nss' },
        { key: 'sport', header: 'Sport', help: 'Sports teams only' },
        { key: 'coordinator_email', header: 'Coordinator email' },
        { key: 'target_hours', header: 'Target hours', example: '240' },
      ],
      key: ['name'],
      exists: async (ctx, r) => !!(await ctx.tx.select({ id: activityUnits.id }).from(activityUnits).where(sql`lower(${activityUnits.name}) = ${lc(r.get('name'))}`))[0],
      run: (ctx, rows) =>
        eachRow(ctx.tx, rows, async (tx, r) => {
          const name = required(r, 'name');
          const kind = inChoices(UNIT_KINDS, required(r, 'kind'), 'Kind') as 'nss';
          const coord = r.get('coordinator_email') ? await staffByEmail(tx, r.get('coordinator_email')) : undefined;
          const target = r.get('target_hours') ? Number(r.get('target_hours')) : undefined;
          if (target !== undefined && (!Number.isInteger(target) || target < 0)) fail('Give whole hours', r.get('target_hours'));
          const values = { kind, ...(r.get('sport') ? { sport: r.get('sport') } : {}), ...(coord ? { coordinatorUserId: coord } : {}), ...(target !== undefined ? { targetHours: target } : {}) };
          const [hit] = await tx.select().from(activityUnits).where(sql`lower(${activityUnits.name}) = ${lc(name)}`);
          if (!hit) {
            await tx.insert(activityUnits).values({ tenantId: ctx.p.tenantId, name, sortOrder: 1_000_000, ...values });
            return outcome(true, false, [name]);
          }
          await tx.update(activityUnits).set(values).where(eq(activityUnits.id, hit.id));
          return outcome(false, true, [name]);
        }),
    },
  };
}

// ---- student achievements ------------------------------------------------------------------------

const verifier = alias(users, 'verifier');

export function achievementsEntity(): RecordEntity {
  return {
    key: 'student-achievements',
    module: 'campus-life',
    table: studentAchievements,
    subjectType: 'student_achievement',
    roles: { read: LIFE_STAFF, write: LIFE_STAFF },
    label: (r) => `${r.studentName}: ${r.title}`,
    list: {
      select: {
        id: studentAchievements.id,
        studentId: studentAchievements.studentId,
        studentName: students.fullName,
        rollNo: students.rollNo,
        className: sections.displayName,
        title: studentAchievements.title,
        category: studentAchievements.category,
        level: studentAchievements.level,
        position: studentAchievements.position,
        eventName: studentAchievements.eventName,
        organiser: studentAchievements.organiser,
        achievedOn: studentAchievements.achievedOn,
        team: studentAchievements.team,
        awardRupees: rupeesOf(studentAchievements.awardPaise),
        evidenceUrl: studentAchievements.evidenceUrl,
        status: studentAchievements.status,
        verifiedByName: verifier.fullName,
        notes: studentAchievements.notes,
        unitId: studentAchievements.unitId,
        clubId: studentAchievements.clubId,
        createdAt: studentAchievements.createdAt,
      },
      joins: (q) => q.innerJoin(students, eq(students.id, studentAchievements.studentId)).innerJoin(sections, eq(sections.id, students.sectionId)).leftJoin(verifier, eq(verifier.id, studentAchievements.verifiedBy)),
      search: [students.fullName, students.rollNo, studentAchievements.title, studentAchievements.eventName, studentAchievements.organiser],
      filters: {
        level: { label: 'Level', options: ACH_LEVELS, where: (v) => eq(studentAchievements.level, v) },
        category: { label: 'Category', options: ACH_CATEGORIES, where: (v) => eq(studentAchievements.category, v) },
        position: { label: 'Position', options: ACH_POSITIONS, where: (v) => eq(studentAchievements.position, v) },
        status: { label: 'Verification', options: ACH_STATUSES, where: (v) => eq(studentAchievements.status, v as 'pending') },
        year: { label: 'Academic year', options: async (ctx) => yearOptions(ctx), where: (v) => yearWhere(v) },
        section: { label: 'Class', where: (v) => uuidEq(students.sectionId, v) },
      },
      sorts: { date: studentAchievements.achievedOn, student: students.fullName, title: studentAchievements.title, level: studentAchievements.level, created: studentAchievements.createdAt },
      defaultSort: { id: 'date', dir: 'desc' },
    },
    fields: {
      studentId: { label: 'Student', type: 'select', schema: Ref, column: studentAchievements.studentId, options: studentOptions, required: true },
      title: { label: 'Achievement', type: 'text', schema: Text(200), column: studentAchievements.title, required: true },
      category: { label: 'Category', type: 'select', schema: pick(ACH_CATEGORIES), column: studentAchievements.category, options: ACH_CATEGORIES, required: true, bulk: true },
      level: { label: 'Level', type: 'select', schema: pick(ACH_LEVELS), column: studentAchievements.level, options: ACH_LEVELS, required: true, bulk: true },
      position: { label: 'Position', type: 'select', schema: pick(ACH_POSITIONS), column: studentAchievements.position, options: ACH_POSITIONS, required: true, bulk: true },
      eventName: { label: 'Event or competition', type: 'text', schema: z.string().trim().max(200), column: studentAchievements.eventName },
      organiser: { label: 'Organised by', type: 'text', schema: z.string().trim().max(200), column: studentAchievements.organiser },
      achievedOn: { label: 'Date', type: 'date', schema: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-10-15'), column: studentAchievements.achievedOn, required: true },
      team: { label: 'Team event', type: 'boolean', schema: z.boolean(), column: studentAchievements.team },
      awardRupees: { label: 'Prize money (₹)', type: 'number', schema: Rupees, apply: async (ctx, id, v) => void (await ctx.tx.update(studentAchievements).set({ awardPaise: v as number }).where(eq(studentAchievements.id, id))) },
      evidenceUrl: { label: 'Certificate link', type: 'text', schema: z.union([z.url().max(500), z.literal('')]), column: studentAchievements.evidenceUrl, help: 'A link to the certificate or news report' },
      unitId: { label: 'Unit or team', type: 'select', schema: OptionalRef, column: studentAchievements.unitId, options: unitOptions, bulk: true },
      clubId: { label: 'Club', type: 'select', schema: OptionalRef, column: studentAchievements.clubId, options: clubOptions, bulk: true },
      notes: { label: 'Notes', type: 'textarea', schema: z.string().trim().max(2000), column: studentAchievements.notes },
    },
    create: async (ctx, v) => {
      const { awardRupees, ...rest } = v;
      return insertRecord(ctx, studentAchievements, { ...rest, awardPaise: (awardRupees as number | undefined) ?? 0 });
    },
    duplicate: (ctx) => ({ status: 'pending', verified_by: null, verified_at: null, created_by: ctx.p.userId }),
    columns: [
      { key: 'rollNo', header: 'Roll no' },
      { key: 'studentName', header: 'Student' },
      { key: 'className', header: 'Class' },
      { key: 'title', header: 'Achievement' },
      { key: 'eventName', header: 'Event' },
      { key: 'organiser', header: 'Organised by' },
      { key: 'category', header: 'Category', value: (r) => labelOf(ACH_CATEGORIES, r.category) },
      { key: 'level', header: 'Level', value: (r) => labelOf(ACH_LEVELS, r.level) },
      { key: 'position', header: 'Position', value: (r) => labelOf(ACH_POSITIONS, r.position) },
      { key: 'achievedOn', header: 'Date' },
      { key: 'team', header: 'Team', value: (r) => (r.team ? 'Yes' : 'No') },
      { key: 'awardRupees', header: 'Prize (₹)' },
      { key: 'status', header: 'Verification', value: (r) => labelOf(ACH_STATUSES, r.status) },
      { key: 'evidenceUrl', header: 'Certificate link' },
    ],
    actions: {
      verify: {
        label: 'Mark verified',
        apply: async (ctx, id) => {
          await ctx.tx.update(studentAchievements).set({ status: 'verified', verifiedBy: ctx.p.userId, verifiedAt: new Date() }).where(eq(studentAchievements.id, id));
        },
      },
      reject: {
        label: 'Reject',
        tone: 'danger',
        params: z.object({ note: z.string().trim().max(500).default('') }),
        apply: async (ctx, id, params) => {
          const note = (params as { note: string }).note;
          await ctx.tx.update(studentAchievements).set({ status: 'rejected', verifiedBy: ctx.p.userId, verifiedAt: new Date(), ...(note ? { notes: note } : {}) }).where(eq(studentAchievements.id, id));
        },
      },
    },
    import: {
      columns: [
        { key: 'roll_no', header: 'Roll no', required: true, example: 'R12' },
        { key: 'class', header: 'Class', help: 'Needed when two classes share roll numbers' },
        { key: 'title', header: 'Achievement', required: true, example: 'First prize, debate' },
        { key: 'category', header: 'Category', required: true, options: ACH_CATEGORIES.map((o) => o.value), example: 'cultural' },
        { key: 'level', header: 'Level', required: true, options: ACH_LEVELS.map((o) => o.value), example: 'university' },
        { key: 'position', header: 'Position', required: true, options: ACH_POSITIONS.map((o) => o.value), example: 'winner' },
        { key: 'event', header: 'Event', example: 'Inter-college youth festival' },
        { key: 'organiser', header: 'Organised by' },
        { key: 'date', header: 'Date', required: true, example: '2026-09-14' },
        { key: 'team', header: 'Team event', options: ['yes', 'no'] },
      ],
      key: ['roll_no', 'title', 'date'],
      exists: async (ctx, r) => {
        const sid = await studentByRoll(ctx.tx, r.get('roll_no'), r.get('class') || undefined).catch(() => null);
        if (!sid) return false;
        return !!(await ctx.tx.select({ id: studentAchievements.id }).from(studentAchievements).where(and(eq(studentAchievements.studentId, sid), sql`lower(${studentAchievements.title}) = ${lc(r.get('title'))}`, eq(studentAchievements.achievedOn, r.get('date')))))[0];
      },
      run: (ctx, rows) =>
        eachRow(ctx.tx, rows, async (tx, r) => {
          const sid = await studentByRoll(tx, required(r, 'roll_no'), r.get('class') || undefined);
          const title = required(r, 'title');
          const date = required(r, 'date');
          if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) fail('Use a date like 2026-10-15', date);
          const values = {
            category: inChoices(ACH_CATEGORIES, required(r, 'category'), 'Category'),
            level: inChoices(ACH_LEVELS, required(r, 'level'), 'Level'),
            position: inChoices(ACH_POSITIONS, required(r, 'position'), 'Position'),
            eventName: r.get('event'),
            organiser: r.get('organiser'),
            team: yes(r.get('team')),
          };
          const [hit] = await tx.select({ id: studentAchievements.id }).from(studentAchievements).where(and(eq(studentAchievements.studentId, sid), sql`lower(${studentAchievements.title}) = ${lc(title)}`, eq(studentAchievements.achievedOn, date)));
          if (!hit) {
            await tx.insert(studentAchievements).values({ tenantId: ctx.p.tenantId, studentId: sid, title, achievedOn: date, createdBy: ctx.p.userId, ...values });
            return outcome(true, false, [r.get('roll_no'), title]);
          }
          await tx.update(studentAchievements).set(values).where(eq(studentAchievements.id, hit.id));
          return outcome(false, true, [r.get('roll_no'), title]);
        }),
    },
  };
}

/** The academic years (June to May) that have achievements or outreach. */
async function yearOptions(ctx: KitCtx): Promise<FieldOption[]> {
  const rows = await ctx.tx.execute<{ y: number }>(sql`select distinct (extract(year from d) - case when extract(month from d) < 6 then 1 else 0 end)::int as y from (select achieved_on as d from student_achievements union all select held_on from outreach_activities) x order by y desc`);
  return rows.rows.map((r) => ({ value: String(r.y), label: yearLabelOf(new Date(Date.UTC(r.y, 6, 1))) }));
}
const yearWhere = (v: string, col: AnyColumn = studentAchievements.achievedOn) => (/^\d{4}$/.test(v) ? sql`${col} >= ${`${v}-06-01`}::date and ${col} < ${`${Number(v) + 1}-06-01`}::date` : undefined);

// ---- extension, outreach, gender and sustainability ----------------------------------------------

export function outreachEntity(): RecordEntity {
  return {
    key: 'outreach-activities',
    module: 'campus-life',
    table: outreachActivities,
    subjectType: 'outreach_activity',
    roles: { read: LIFE_STAFF, write: LIFE_STAFF },
    label: (r) => String(r.title),
    list: {
      select: {
        id: outreachActivities.id,
        title: outreachActivities.title,
        kind: outreachActivities.kind,
        organisedBy: outreachActivities.organisedBy,
        agency: outreachActivities.agency,
        heldOn: outreachActivities.heldOn,
        endsOn: outreachActivities.endsOn,
        place: outreachActivities.place,
        studentsCount: outreachActivities.studentsCount,
        staffCount: outreachActivities.staffCount,
        beneficiaries: outreachActivities.beneficiaries,
        unitId: outreachActivities.unitId,
        unitName: activityUnits.name,
        description: outreachActivities.description,
        outcome: outreachActivities.outcome,
        evidenceUrl: outreachActivities.evidenceUrl,
        createdAt: outreachActivities.createdAt,
      },
      joins: (q) => q.leftJoin(activityUnits, eq(activityUnits.id, outreachActivities.unitId)),
      search: [outreachActivities.title, outreachActivities.organisedBy, outreachActivities.agency, outreachActivities.place],
      filters: {
        kind: { label: 'Kind', options: OUTREACH_KINDS, where: (v) => eq(outreachActivities.kind, v) },
        unit: { label: 'Unit', options: unitOptions, where: (v) => uuidEq(outreachActivities.unitId, v) },
        year: { label: 'Academic year', options: async (ctx) => yearOptions(ctx), where: (v) => yearWhere(v, outreachActivities.heldOn) },
      },
      sorts: { date: outreachActivities.heldOn, title: outreachActivities.title, students: outreachActivities.studentsCount, beneficiaries: outreachActivities.beneficiaries, created: outreachActivities.createdAt },
      defaultSort: { id: 'date', dir: 'desc' },
    },
    fields: {
      title: { label: 'Title', type: 'text', schema: Text(200), column: outreachActivities.title, required: true },
      kind: { label: 'Kind', type: 'select', schema: pick(OUTREACH_KINDS), column: outreachActivities.kind, options: OUTREACH_KINDS, required: true, bulk: true, help: 'Extension and outreach count for NAAC 3.4; gender and sustainability for 7.1' },
      organisedBy: { label: 'Organised by', type: 'text', schema: z.string().trim().max(200), column: outreachActivities.organisedBy, help: 'The department, unit or club' },
      agency: { label: 'Collaborating agency', type: 'text', schema: z.string().trim().max(200), column: outreachActivities.agency },
      heldOn: { label: 'From', type: 'date', schema: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-10-15'), column: outreachActivities.heldOn, required: true },
      endsOn: { label: 'To', type: 'date', schema: DateText, column: outreachActivities.endsOn },
      place: { label: 'Place', type: 'text', schema: z.string().trim().max(200), column: outreachActivities.place },
      studentsCount: { label: 'Students taking part', type: 'number', schema: Int(0, 100000), column: outreachActivities.studentsCount },
      staffCount: { label: 'Staff taking part', type: 'number', schema: Int(0, 10000), column: outreachActivities.staffCount },
      beneficiaries: { label: 'People reached', type: 'number', schema: Int(0, 10000000), column: outreachActivities.beneficiaries },
      unitId: { label: 'Unit', type: 'select', schema: OptionalRef, column: outreachActivities.unitId, options: unitOptions, bulk: true },
      description: { label: 'What was done', type: 'textarea', schema: z.string().trim().max(4000), column: outreachActivities.description },
      outcome: { label: 'Outcome', type: 'textarea', schema: z.string().trim().max(4000), column: outreachActivities.outcome },
      evidenceUrl: { label: 'Photos or report link', type: 'text', schema: z.union([z.url().max(500), z.literal('')]), column: outreachActivities.evidenceUrl },
    },
    create: (ctx, v) => insertRecord(ctx, outreachActivities, v),
    duplicate: async (ctx, row) => ({ title: await copyName(ctx.tx, outreachActivities, outreachActivities.title, String(row.title)), created_by: ctx.p.userId }),
    columns: [
      { key: 'title', header: 'Activity' },
      { key: 'kind', header: 'Kind', value: (r) => labelOf(OUTREACH_KINDS, r.kind) },
      { key: 'heldOn', header: 'From' },
      { key: 'endsOn', header: 'To' },
      { key: 'organisedBy', header: 'Organised by' },
      { key: 'agency', header: 'Collaborating agency' },
      { key: 'place', header: 'Place' },
      { key: 'studentsCount', header: 'Students' },
      { key: 'staffCount', header: 'Staff' },
      { key: 'beneficiaries', header: 'People reached' },
      { key: 'unitName', header: 'Unit' },
      { key: 'outcome', header: 'Outcome' },
      { key: 'evidenceUrl', header: 'Evidence link' },
    ],
    import: {
      columns: [
        { key: 'title', header: 'Activity', required: true, example: 'Tree plantation drive' },
        { key: 'kind', header: 'Kind', required: true, options: OUTREACH_KINDS.map((o) => o.value), example: 'sustainability' },
        { key: 'from', header: 'From', required: true, example: '2026-08-15' },
        { key: 'to', header: 'To' },
        { key: 'organised_by', header: 'Organised by', example: 'NSS Unit 1' },
        { key: 'agency', header: 'Collaborating agency' },
        { key: 'place', header: 'Place' },
        { key: 'students', header: 'Students', example: '60' },
        { key: 'staff', header: 'Staff', example: '4' },
        { key: 'reached', header: 'People reached', example: '300' },
      ],
      key: ['title', 'from'],
      exists: async (ctx, r) => !!(await ctx.tx.select({ id: outreachActivities.id }).from(outreachActivities).where(and(sql`lower(${outreachActivities.title}) = ${lc(r.get('title'))}`, eq(outreachActivities.heldOn, r.get('from')))))[0],
      run: (ctx, rows) =>
        eachRow(ctx.tx, rows, async (tx, r) => {
          const title = required(r, 'title');
          const from = required(r, 'from');
          for (const d of [from, r.get('to')].filter(Boolean)) if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) fail('Use a date like 2026-10-15', d);
          const n = (k: string) => {
            const v = r.get(k);
            if (!v) return 0;
            const x = Number(v);
            return Number.isInteger(x) && x >= 0 ? x : fail('Give a whole number', `${k}: ${v}`);
          };
          const values = { kind: inChoices(OUTREACH_KINDS, required(r, 'kind'), 'Kind'), endsOn: r.get('to') || null, organisedBy: r.get('organised_by'), agency: r.get('agency'), place: r.get('place'), studentsCount: n('students'), staffCount: n('staff'), beneficiaries: n('reached') };
          const [hit] = await tx.select({ id: outreachActivities.id }).from(outreachActivities).where(and(sql`lower(${outreachActivities.title}) = ${lc(title)}`, eq(outreachActivities.heldOn, from)));
          if (!hit) {
            await tx.insert(outreachActivities).values({ tenantId: ctx.p.tenantId, title, heldOn: from, createdBy: ctx.p.userId, ...values });
            return outcome(true, false, [title]);
          }
          await tx.update(outreachActivities).set(values).where(eq(outreachActivities.id, hit.id));
          return outcome(false, true, [title]);
        }),
    },
  };
}

// ---- club expense claims -------------------------------------------------------------------------

const claimer = alias(users, 'claimer');

export function clubClaimsEntity(): RecordEntity {
  return {
    key: 'club-expense-claims',
    module: 'campus-life',
    table: clubExpenseClaims,
    subjectType: 'club_expense_claim',
    roles: { read: LIFE_STAFF, write: LIFE_STAFF },
    label: (r) => `${r.clubName}: ${r.title}`,
    list: {
      select: {
        id: clubExpenseClaims.id,
        clubId: clubExpenseClaims.clubId,
        clubName: clubs.name,
        yearLabel: clubExpenseClaims.yearLabel,
        title: clubExpenseClaims.title,
        amountRupees: rupeesOf(clubExpenseClaims.amountPaise),
        spentOn: clubExpenseClaims.spentOn,
        payee: clubExpenseClaims.payee,
        billNo: clubExpenseClaims.billNo,
        status: clubExpenseClaims.status,
        decisionNote: clubExpenseClaims.decisionNote,
        paidOn: clubExpenseClaims.paidOn,
        paymentRef: clubExpenseClaims.paymentRef,
        submittedByName: claimer.fullName,
        createdAt: clubExpenseClaims.createdAt,
      },
      joins: (q) => q.innerJoin(clubs, eq(clubs.id, clubExpenseClaims.clubId)).leftJoin(claimer, eq(claimer.id, clubExpenseClaims.submittedBy)),
      search: [clubExpenseClaims.title, clubExpenseClaims.payee, clubExpenseClaims.billNo, clubs.name],
      filters: {
        status: { label: 'Status', options: CLAIM_STATUSES, where: (v) => eq(clubExpenseClaims.status, v as 'submitted') },
        club: { label: 'Club', options: clubOptions, where: (v) => uuidEq(clubExpenseClaims.clubId, v) },
        year: { label: 'Year', options: async (ctx) => (await ctx.tx.selectDistinct({ y: clubExpenseClaims.yearLabel }).from(clubExpenseClaims).orderBy(asc(clubExpenseClaims.yearLabel))).map((r) => ({ value: r.y, label: r.y })), where: (v) => eq(clubExpenseClaims.yearLabel, v) },
      },
      sorts: { date: clubExpenseClaims.spentOn, amount: clubExpenseClaims.amountPaise, club: clubs.name, status: clubExpenseClaims.status, created: clubExpenseClaims.createdAt },
      defaultSort: { id: 'created', dir: 'desc' },
    },
    fields: {
      clubId: { label: 'Club', type: 'select', schema: Ref, column: clubExpenseClaims.clubId, options: clubOptions, required: true },
      title: { label: 'What it was for', type: 'text', schema: Text(200), column: clubExpenseClaims.title, required: true },
      amountRupees: { label: 'Amount (₹)', type: 'number', schema: Rupees, required: true, apply: async (ctx, id, v) => void (await ctx.tx.update(clubExpenseClaims).set({ amountPaise: v as number }).where(eq(clubExpenseClaims.id, id))) },
      spentOn: { label: 'Spent on', type: 'date', schema: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-10-15'), column: clubExpenseClaims.spentOn, required: true },
      payee: { label: 'Paid to', type: 'text', schema: z.string().trim().max(200), column: clubExpenseClaims.payee },
      billNo: { label: 'Bill number', type: 'text', schema: z.string().trim().max(80), column: clubExpenseClaims.billNo },
    },
    create: async (ctx, v) => {
      const { amountRupees, ...rest } = v;
      return insertRecord(ctx, clubExpenseClaims, { ...rest, amountPaise: amountRupees as number, yearLabel: yearLabelOf(new Date(`${String(rest.spentOn)}T00:00:00Z`)), submittedBy: ctx.p.userId }, 'submittedBy');
    },
    remove: { guard: async (ctx, id) => ((await ctx.tx.select({ s: clubExpenseClaims.status }).from(clubExpenseClaims).where(eq(clubExpenseClaims.id, id)))[0]?.s === 'paid' ? 'A paid claim stays on the books' : null) },
    columns: [
      { key: 'clubName', header: 'Club' },
      { key: 'yearLabel', header: 'Year' },
      { key: 'title', header: 'Expense' },
      { key: 'amountRupees', header: 'Amount (₹)' },
      { key: 'spentOn', header: 'Spent on' },
      { key: 'payee', header: 'Paid to' },
      { key: 'billNo', header: 'Bill number' },
      { key: 'status', header: 'Status', value: (r) => labelOf(CLAIM_STATUSES, r.status) },
      { key: 'decisionNote', header: 'Note' },
      { key: 'paidOn', header: 'Paid on' },
      { key: 'paymentRef', header: 'Payment reference' },
      { key: 'submittedByName', header: 'Submitted by' },
    ],
    actions: {
      approve: {
        label: 'Approve',
        roles: COMMITTEE_STAFF,
        apply: async (ctx, id) => decideClaim(ctx, id, 'approved', ''),
      },
      reject: {
        label: 'Reject',
        roles: COMMITTEE_STAFF,
        tone: 'danger',
        params: z.object({ note: z.string().trim().max(500).default('') }),
        apply: async (ctx, id, params) => decideClaim(ctx, id, 'rejected', (params as { note: string }).note),
      },
      pay: {
        label: 'Mark paid',
        roles: [...COMMITTEE_STAFF, 'accountant'],
        params: z.object({ paymentRef: z.string().trim().max(120).default('') }),
        apply: async (ctx, id, params) => {
          const [c] = await ctx.tx.select().from(clubExpenseClaims).where(eq(clubExpenseClaims.id, id)).for('update');
          if (c.status !== 'approved') throw new ConflictException('Only an approved claim can be paid');
          await ctx.tx.update(clubExpenseClaims).set({ status: 'paid', paidOn: new Date().toISOString().slice(0, 10), paymentRef: (params as { paymentRef: string }).paymentRef }).where(eq(clubExpenseClaims.id, id));
        },
      },
    },
  };
}

/** Approve or reject a submitted claim. An approval may not take the club over its budget for the year. */
async function decideClaim(ctx: KitCtx, id: string, status: 'approved' | 'rejected', note: string): Promise<string | void> {
  const [c] = await ctx.tx.select().from(clubExpenseClaims).where(eq(clubExpenseClaims.id, id)).for('update');
  if (c.status !== 'submitted') throw new ConflictException(`This claim is already ${c.status}`);
  if (c.submittedBy === ctx.p.userId) throw new ConflictException('A claim must be decided by someone other than the person who submitted it');
  if (status === 'approved') {
    const r = await ctx.tx.execute<{ budget: string | null; used: string }>(
      sql`select (select amount_paise from club_budgets b where b.club_id = ${c.clubId} and b.year_label = ${c.yearLabel}) as budget, coalesce((select sum(amount_paise) from club_expense_claims x where x.club_id = ${c.clubId} and x.year_label = ${c.yearLabel} and x.status in ('approved', 'paid')), 0) as used`,
    );
    const budget = r.rows[0].budget === null ? null : Number(r.rows[0].budget);
    if (budget !== null && Number(r.rows[0].used) + c.amountPaise > budget) throw new ConflictException(`This claim would take the club over its ${c.yearLabel} budget`);
  }
  await ctx.tx.update(clubExpenseClaims).set({ status, decisionNote: note, decidedBy: ctx.p.userId, decidedAt: new Date() }).where(eq(clubExpenseClaims.id, id));
}

// ---- elections -----------------------------------------------------------------------------------

const electionPostsCount = sql<number>`(select count(*)::int from election_posts p where p.election_id = ${qualified('elections')})`;
const electionCandidatesCount = sql<number>`(select count(*)::int from election_candidates c join election_posts p on p.id = c.post_id where p.election_id = ${qualified('elections')} and c.status = 'approved')`;
const electionTurnout = sql<number>`(select count(*)::int from election_voters v where v.election_id = ${qualified('elections')})`;

export function electionsEntity(): RecordEntity {
  return {
    key: 'elections',
    module: 'campus-life',
    table: elections,
    subjectType: 'election',
    roles: { read: COMMITTEE_STAFF, write: COMMITTEE_STAFF },
    label: (r) => String(r.title),
    list: {
      select: { id: elections.id, title: elections.title, description: elections.description, votingStartsAt: elections.votingStartsAt, votingEndsAt: elections.votingEndsAt, status: elections.status, posts: electionPostsCount, candidates: electionCandidatesCount, voted: electionTurnout, createdAt: elections.createdAt },
      search: [elections.title],
      filters: { status: { label: 'Status', options: ELECTION_STATUSES, where: (v) => eq(elections.status, v as 'draft') } },
      sorts: { starts: elections.votingStartsAt, title: elections.title, voted: electionTurnout, created: elections.createdAt },
      defaultSort: { id: 'starts', dir: 'desc' },
    },
    fields: {
      title: { label: 'Title', type: 'text', schema: Text(200), column: elections.title, required: true, create: false },
      description: { label: 'Description', type: 'textarea', schema: OptionalText(4000).transform((v) => v ?? ''), column: elections.description, create: false },
    },
    remove: { guard: async (ctx, id) => ((await ctx.tx.select({ s: elections.status }).from(elections).where(eq(elections.id, id)))[0]?.s === 'open' ? 'Close the vote before deleting the election' : null) },
    columns: [
      { key: 'title', header: 'Election' },
      { key: 'status', header: 'Status', value: (r) => labelOf(ELECTION_STATUSES, r.status) },
      { key: 'votingStartsAt', header: 'Voting opens', value: (r) => (r.votingStartsAt instanceof Date ? r.votingStartsAt.toISOString() : String(r.votingStartsAt)) },
      { key: 'votingEndsAt', header: 'Voting closes', value: (r) => (r.votingEndsAt instanceof Date ? r.votingEndsAt.toISOString() : String(r.votingEndsAt)) },
      { key: 'posts', header: 'Posts' },
      { key: 'candidates', header: 'Candidates' },
      { key: 'voted', header: 'Votes cast' },
    ],
  };
}

/** Registers the campus life entities. */
@Injectable()
export class CampusLifeRecords implements OnModuleInit {
  constructor(
    private readonly registry: RecordRegistry,
    private readonly depth: CampusDepthService,
  ) {}

  onModuleInit(): void {
    for (const e of [clubsEntity(), committeesEntity(), campusEventsEntity((ctx, id, reason) => this.depth.cancelEvent(ctx, id, reason)), activityUnitsEntity(), achievementsEntity(), outreachEntity(), clubClaimsEntity(), electionsEntity()]) this.registry.register(e);
  }
}
