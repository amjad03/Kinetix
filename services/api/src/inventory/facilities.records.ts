import { BadRequestException, Injectable, OnModuleInit } from '@nestjs/common';
import { and, asc, eq, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { z } from 'zod';
import type { RoleName } from '../auth/principal.js';
import { assets, buildingFloors, buildings, campuses, rooms, users } from '../db/schema.js';
import { facilityBookings, maintenanceTickets } from '../db/schema-procurement.js';
import { fail, int, lc, outcome, required } from '../import/row-helpers.js';
import { RecordRegistry, type FieldOption, type KitCtx, type RecordEntity } from '../records/entity.js';
import { copyName, OptionalRef, Ref, Text, uuidEq } from '../records/helpers.js';
import { eachRow } from '../records/import.js';
import { FacilitiesService, FACILITY_ROLES, isFacilityManager } from './facilities.service.js';
import { TICKET_CATEGORIES } from './facilities.controller.js';
import { STAFF_ROLES } from './inventory.controller.js';
import { roomOptions } from './inventory.records.js';

/**
 * Facilities as record kit entities: the rooms, labs and halls master (capacity, bookable, facilities), facility
 * bookings and maintenance tickets. Bookings and tickets are added by anyone on the staff; each person sees their own
 * and the estate office sees all.
 */

const opt = (pairs: [string, string][]): FieldOption[] => pairs.map(([value, label]) => ({ value, label }));
export const ROOM_KINDS = opt([['classroom', 'Classroom'], ['lab', 'Lab'], ['hall', 'Hall'], ['seminar_hall', 'Seminar hall'], ['auditorium', 'Auditorium'], ['staff_room', 'Staff room'], ['library', 'Library'], ['other', 'Other']]);
const BOOKING_STATUS = opt([['pending', 'Waiting for approval'], ['approved', 'Approved'], ['rejected', 'Rejected'], ['cancelled', 'Cancelled']]);
const CATEGORIES = opt([['electrical', 'Electrical'], ['it', 'IT'], ['civil', 'Civil'], ['plumbing', 'Plumbing'], ['carpentry', 'Carpentry'], ['housekeeping', 'Housekeeping'], ['other', 'Other']]);
const PRIORITY = opt([['low', 'Low'], ['normal', 'Normal'], ['high', 'High'], ['urgent', 'Urgent']]);
const TICKET_STATUS = opt([['open', 'Open'], ['assigned', 'Assigned'], ['in_progress', 'In progress'], ['on_hold', 'On hold'], ['resolved', 'Resolved'], ['closed', 'Closed']]);
const ROOM_READ: RoleName[] = [...FACILITY_ROLES, 'hod', 'exam_controller'];
const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-10-15');
const Time = z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, 'Use a time like 14:30');

async function campusOptions(ctx: KitCtx): Promise<FieldOption[]> {
  return (await ctx.tx.select({ id: campuses.id, name: campuses.name }).from(campuses).orderBy(asc(campuses.name))).map((r) => ({ value: r.id, label: r.name }));
}
async function floorOptions(ctx: KitCtx): Promise<FieldOption[]> {
  return (await ctx.tx.select({ id: buildingFloors.id, label: buildingFloors.label, building: buildings.name }).from(buildingFloors).innerJoin(buildings, eq(buildings.id, buildingFloors.buildingId)).orderBy(asc(buildings.name), asc(buildingFloors.level))).map((r) => ({ value: r.id, label: `${r.building} · ${r.label}`, group: r.building }));
}
async function bookableOptions(ctx: KitCtx): Promise<FieldOption[]> {
  return (await ctx.tx.select({ id: rooms.id, name: rooms.name, capacity: rooms.capacity }).from(rooms).where(and(eq(rooms.active, true), isFacilityManager(ctx.p) ? undefined : eq(rooms.bookable, true))).orderBy(asc(rooms.name))).map((r) => ({ value: r.id, label: r.capacity ? `${r.name} (${r.capacity})` : r.name }));
}
async function assetPick(ctx: KitCtx): Promise<FieldOption[]> {
  return (await ctx.tx.select({ id: assets.id, tag: assets.tag, name: assets.name }).from(assets).where(sql`${assets.status} <> 'disposed'`).orderBy(asc(assets.tag))).map((r) => ({ value: r.id, label: `${r.tag} · ${r.name}` }));
}
async function staffPick(ctx: KitCtx): Promise<FieldOption[]> {
  return (await ctx.tx.selectDistinct({ id: users.id, name: users.fullName }).from(users).where(and(eq(users.status, 'active'), sql`exists (select 1 from user_roles r where r.user_id = "users"."id" and r.role not in ('student', 'guardian', 'alumni'))`)).orderBy(asc(users.fullName))).map((r) => ({ value: r.id, label: r.name }));
}

@Injectable()
export class FacilitiesRecords implements OnModuleInit {
  constructor(
    private readonly registry: RecordRegistry,
    private readonly svc: FacilitiesService,
  ) {}

  onModuleInit(): void {
    this.registry.register(this.rooms());
    this.registry.register(this.bookings());
    this.registry.register(this.tickets());
  }

  // ---- rooms --------------------------------------------------------------------------------------

  private rooms(): RecordEntity {
    const classes = sql<number>`(select count(*)::int from timetable_slots t where t.room_id = "rooms"."id" and t.archived_at is null)`;
    const assetCount = sql<number>`(select count(*)::int from assets a where a.room_id = "rooms"."id" and a.status <> 'disposed')`;
    const floorLabel = sql<string | null>`(select b.name || ' · ' || f.label from building_floors f join buildings b on b.id = f.building_id where f.id = "rooms"."floor_id")`;
    return {
      key: 'rooms',
      module: 'facilities',
      table: rooms,
      subjectType: 'room',
      roles: { read: ROOM_READ, write: FACILITY_ROLES },
      label: (r) => String(r.name),
      list: {
        select: { id: rooms.id, name: rooms.name, kind: rooms.kind, capacity: rooms.capacity, campusId: rooms.campusId, campusName: campuses.name, floorId: rooms.floorId, floorLabel, bookable: rooms.bookable, facilities: rooms.facilities, active: rooms.active, classes, assets: assetCount },
        joins: (q) => q.innerJoin(campuses, eq(campuses.id, rooms.campusId)),
        search: [rooms.name, rooms.facilities],
        filters: {
          kind: { label: 'Kind', options: ROOM_KINDS, where: (v) => (ROOM_KINDS.some((o) => o.value === v) ? eq(rooms.kind, v) : undefined) },
          campus: { label: 'Campus', options: campusOptions, where: (v) => uuidEq(rooms.campusId, v) },
          bookable: { label: 'Booking', options: opt([['yes', 'Bookable'], ['no', 'Not bookable']]), where: (v) => (v === 'yes' ? eq(rooms.bookable, true) : v === 'no' ? eq(rooms.bookable, false) : undefined) },
        },
        sorts: { name: rooms.name, kind: rooms.kind, capacity: rooms.capacity, classes },
        defaultSort: { id: 'name', dir: 'asc' },
      },
      fields: {
        name: { label: 'Name', type: 'text', schema: Text(80), column: rooms.name, required: true },
        kind: { label: 'Kind', type: 'select', schema: z.enum(ROOM_KINDS.map((o) => o.value) as [string, ...string[]]), column: rooms.kind, options: ROOM_KINDS, required: true, bulk: true },
        capacity: { label: 'Seats', type: 'number', schema: z.coerce.number().int().min(1).max(100_000).nullable(), column: rooms.capacity, help: 'Used by the timetable and exam seating' },
        campusId: { label: 'Campus', type: 'select', schema: Ref, column: rooms.campusId, options: campusOptions, required: true, bulk: true },
        floorId: { label: 'Building and floor', type: 'select', schema: OptionalRef, column: rooms.floorId, options: floorOptions },
        bookable: { label: 'Can be booked', type: 'boolean', schema: z.boolean(), column: rooms.bookable, bulk: true, help: 'Staff can book it through Facilities' },
        facilities: { label: 'Facilities', type: 'text', schema: z.string().trim().max(300), column: rooms.facilities, help: 'Projector, AC, sound system…' },
        active: { label: 'In use', type: 'boolean', schema: z.boolean(), column: rooms.active, create: false, bulk: true },
      },
      duplicate: async (ctx, row) => ({ name: await copyName(ctx.tx, rooms, rooms.name, String(row.name)) }),
      columns: [
        { key: 'name', header: 'Room' },
        { key: 'kind', header: 'Kind', value: (r) => ROOM_KINDS.find((o) => o.value === r.kind)?.label ?? String(r.kind) },
        { key: 'capacity', header: 'Seats' },
        { key: 'campusName', header: 'Campus' },
        { key: 'floorLabel', header: 'Building and floor' },
        { key: 'facilities', header: 'Facilities' },
        { key: 'bookable', header: 'Bookable', value: (r) => (r.bookable ? 'Yes' : 'No') },
        { key: 'classes', header: 'Classes a week' },
        { key: 'assets', header: 'Assets' },
      ],
      import: {
        columns: [
          { key: 'name', header: 'Room', required: true, help: 'Rows are matched on the name', example: 'Seminar Hall 1' },
          { key: 'kind', header: 'Kind', help: ROOM_KINDS.map((o) => o.value).join(', '), example: 'seminar_hall', options: ROOM_KINDS.map((o) => o.value) },
          { key: 'capacity', header: 'Seats', example: '120' },
          { key: 'campus', header: 'Campus', help: 'The first campus if empty', options: async (ctx) => (await campusOptions(ctx)).map((o) => o.label) },
          { key: 'bookable', header: 'Bookable', help: 'yes or no', options: ['yes', 'no'] },
          { key: 'facilities', header: 'Facilities', example: 'Projector, AC, sound system' },
        ],
        key: ['name'],
        exists: async (ctx, r) => !!(await ctx.tx.select({ id: rooms.id }).from(rooms).where(sql`lower(${rooms.name}) = ${lc(r.get('name'))}`).limit(1))[0],
        run: async (ctx, rows) => {
          const camps = await campusOptions(ctx);
          return eachRow(ctx.tx, rows, async (tx, r) => {
            const name = required(r, 'name');
            const kind = r.get('kind') || 'classroom';
            if (!ROOM_KINDS.some((o) => o.value === kind)) fail('Unknown kind of room', kind);
            const campus = r.get('campus') ? camps.find((c) => lc(c.label) === lc(r.get('campus'))) : camps[0];
            if (!campus) fail('No campus with this name', r.get('campus'));
            const values = { kind, capacity: r.get('capacity') ? int(r.get('capacity'), 1, 100_000) : null, campusId: campus!.value, bookable: ['yes', 'y', 'true', '1'].includes(lc(r.get('bookable'))), facilities: r.get('facilities') };
            const [found] = await tx.select().from(rooms).where(sql`lower(${rooms.name}) = ${lc(name)}`).limit(1);
            if (!found) {
              await tx.insert(rooms).values({ tenantId: ctx.p.tenantId, name, ...values });
              return outcome(true, false, [name]);
            }
            const changed = (Object.keys(values) as (keyof typeof values)[]).some((k) => found[k] !== values[k]);
            if (changed) await tx.update(rooms).set(values).where(eq(rooms.id, found.id));
            return outcome(false, changed, [name]);
          });
        },
      },
    };
  }

  // ---- bookings -----------------------------------------------------------------------------------

  private bookings(): RecordEntity {
    const booker = alias(users, 'booker');
    return {
      key: 'facility-bookings',
      module: 'facilities',
      table: facilityBookings,
      subjectType: 'facility_booking',
      roles: { read: STAFF_ROLES, write: STAFF_ROLES },
      label: (r) => `${r.number} ${r.title}`,
      list: {
        select: { id: facilityBookings.id, number: facilityBookings.number, roomId: facilityBookings.roomId, roomName: rooms.name, title: facilityBookings.title, purpose: facilityBookings.purpose, organiser: facilityBookings.organiser, attendees: facilityBookings.attendees, onDate: facilityBookings.onDate, startsAt: facilityBookings.startsAt, endsAt: facilityBookings.endsAt, status: facilityBookings.status, decisionNote: facilityBookings.decisionNote, bookedBy: facilityBookings.bookedBy, bookedByName: booker.fullName, createdAt: facilityBookings.createdAt },
        joins: (q) => q.innerJoin(rooms, eq(rooms.id, facilityBookings.roomId)).leftJoin(booker, eq(booker.id, facilityBookings.bookedBy)),
        search: [facilityBookings.number, facilityBookings.title, facilityBookings.organiser, rooms.name, booker.fullName],
        filters: {
          status: { label: 'Status', options: BOOKING_STATUS, where: (v) => (BOOKING_STATUS.some((o) => o.value === v) ? eq(facilityBookings.status, v) : undefined) },
          room: { label: 'Room', options: roomOptions, where: (v) => uuidEq(facilityBookings.roomId, v) },
          when: { label: 'When', options: opt([['upcoming', 'Upcoming'], ['today', 'Today'], ['past', 'Past']]), where: (v) => (v === 'upcoming' ? sql`${facilityBookings.onDate} >= current_date` : v === 'today' ? sql`${facilityBookings.onDate} = current_date` : v === 'past' ? sql`${facilityBookings.onDate} < current_date` : undefined) },
        },
        sorts: { date: facilityBookings.onDate, room: rooms.name, title: facilityBookings.title, created: facilityBookings.createdAt },
        defaultSort: { id: 'date', dir: 'asc' },
        tiebreak: [facilityBookings.startsAt],
        scope: (ctx) => (isFacilityManager(ctx.p) ? undefined : eq(facilityBookings.bookedBy, ctx.p.userId)),
      },
      fields: {
        roomId: { label: 'Room or hall', type: 'select', schema: Ref, column: facilityBookings.roomId, options: bookableOptions, required: true, edit: false },
        title: { label: 'Event', type: 'text', schema: Text(160), column: facilityBookings.title, required: true },
        onDate: { label: 'Date', type: 'date', schema: Day, column: facilityBookings.onDate, required: true, edit: false },
        startsAt: { label: 'From', type: 'text', schema: Time, column: facilityBookings.startsAt, required: true, edit: false, help: '24-hour time, e.g. 14:00' },
        endsAt: { label: 'To', type: 'text', schema: Time, column: facilityBookings.endsAt, required: true, edit: false, help: '24-hour time, e.g. 16:30' },
        organiser: { label: 'Organised by', type: 'text', schema: z.string().trim().max(120), column: facilityBookings.organiser },
        attendees: { label: 'Expected attendance', type: 'number', schema: z.coerce.number().int().min(1).max(100_000).nullable(), column: facilityBookings.attendees },
        purpose: { label: 'Purpose and needs', type: 'textarea', schema: z.string().trim().max(500), column: facilityBookings.purpose, help: 'Projector, sound, seating arrangement…' },
      },
      create: async (ctx, v) => (await this.svc.book(ctx.tx, ctx.p, { roomId: String(v.roomId), title: String(v.title), onDate: String(v.onDate), startsAt: String(v.startsAt), endsAt: String(v.endsAt), organiser: String(v.organiser ?? ''), attendees: (v.attendees as number | null) ?? null, purpose: String(v.purpose ?? '') })).id,
      remove: {
        guard: async (ctx, id) => {
          const [b] = await ctx.tx.select({ status: facilityBookings.status }).from(facilityBookings).where(eq(facilityBookings.id, id));
          return b?.status === 'approved' && !isFacilityManager(ctx.p) ? 'Cancel an approved booking instead of deleting it' : null;
        },
      },
      actions: {
        approve: { label: 'Approve', roles: FACILITY_ROLES, apply: async (ctx, id) => void (await this.svc.decideBooking(ctx.tx, ctx.p, id, { approve: true })) },
        cancel: { label: 'Cancel booking', tone: 'danger', apply: async (ctx, id) => void (await this.svc.cancelBooking(ctx.tx, ctx.p, id)) },
      },
      columns: [
        { key: 'number', header: 'Booking' },
        { key: 'onDate', header: 'Date' },
        { key: 'startsAt', header: 'From', value: (r) => String(r.startsAt ?? '').slice(0, 5) },
        { key: 'endsAt', header: 'To', value: (r) => String(r.endsAt ?? '').slice(0, 5) },
        { key: 'roomName', header: 'Room' },
        { key: 'title', header: 'Event' },
        { key: 'organiser', header: 'Organised by' },
        { key: 'attendees', header: 'Attendance' },
        { key: 'bookedByName', header: 'Booked by' },
        { key: 'status', header: 'Status', value: (r) => BOOKING_STATUS.find((o) => o.value === r.status)?.label ?? String(r.status) },
      ],
    };
  }

  // ---- maintenance tickets ------------------------------------------------------------------------

  private tickets(): RecordEntity {
    const raiser = alias(users, 'raiser');
    const sla = sql<string>`case when ${maintenanceTickets.resolvedAt} is not null then (case when ${maintenanceTickets.resolvedAt} <= ${maintenanceTickets.dueAt} then 'met' else 'breached' end) when now() > ${maintenanceTickets.dueAt} then 'breached' when ${maintenanceTickets.dueAt} - now() < (${maintenanceTickets.dueAt} - ${maintenanceTickets.createdAt}) / 4 then 'at_risk' else 'on_track' end`;
    const managerOnly = (field: string) => async (ctx: KitCtx, id: string, value: unknown) => {
      if (!isFacilityManager(ctx.p)) throw new BadRequestException({ formErrors: [], fieldErrors: { [field]: ['Only the estate office assigns tickets'] } });
      const set = field === 'assigneeName' ? { assigneeName: String(value ?? '') } : { assigneeUserId: (value as string | null) ?? null };
      await ctx.tx.update(maintenanceTickets).set({ ...set, updatedAt: new Date() }).where(eq(maintenanceTickets.id, id));
    };
    const moveTo = (status: string) => async (ctx: KitCtx, id: string) => void (await this.svc.move(ctx.tx, ctx.p, id, { status }));
    return {
      key: 'maintenance-tickets',
      module: 'facilities',
      table: maintenanceTickets,
      subjectType: 'maintenance_ticket',
      roles: { read: STAFF_ROLES, write: STAFF_ROLES },
      label: (r) => `${r.number} ${r.title}`,
      list: {
        select: { id: maintenanceTickets.id, number: maintenanceTickets.number, category: maintenanceTickets.category, priority: maintenanceTickets.priority, title: maintenanceTickets.title, description: maintenanceTickets.description, roomId: maintenanceTickets.roomId, roomName: rooms.name, assetId: maintenanceTickets.assetId, assetTag: assets.tag, location: maintenanceTickets.location, status: maintenanceTickets.status, assigneeName: maintenanceTickets.assigneeName, assigneeUserId: maintenanceTickets.assigneeUserId, slaHours: maintenanceTickets.slaHours, dueAt: maintenanceTickets.dueAt, resolvedAt: maintenanceTickets.resolvedAt, resolution: maintenanceTickets.resolution, cost: sql<number>`(${maintenanceTickets.costPaise} / 100.0)::float8`, rating: maintenanceTickets.rating, raisedBy: maintenanceTickets.raisedBy, raisedByName: raiser.fullName, createdAt: maintenanceTickets.createdAt, sla },
        joins: (q) => q.leftJoin(rooms, eq(rooms.id, maintenanceTickets.roomId)).leftJoin(assets, eq(assets.id, maintenanceTickets.assetId)).leftJoin(raiser, eq(raiser.id, maintenanceTickets.raisedBy)),
        search: [maintenanceTickets.number, maintenanceTickets.title, maintenanceTickets.location, rooms.name, assets.tag, maintenanceTickets.assigneeName],
        filters: {
          status: { label: 'Status', options: [...TICKET_STATUS, { value: 'active', label: 'Not yet resolved' }], where: (v) => (v === 'active' ? sql`${maintenanceTickets.status} not in ('resolved', 'closed')` : TICKET_STATUS.some((o) => o.value === v) ? eq(maintenanceTickets.status, v) : undefined) },
          category: { label: 'Category', options: CATEGORIES, where: (v) => (CATEGORIES.some((o) => o.value === v) ? eq(maintenanceTickets.category, v) : undefined) },
          priority: { label: 'Priority', options: PRIORITY, where: (v) => (PRIORITY.some((o) => o.value === v) ? eq(maintenanceTickets.priority, v) : undefined) },
          sla: { label: 'Deadline', options: opt([['breached', 'Overdue'], ['at_risk', 'Due soon'], ['on_track', 'On track'], ['met', 'Met']]), where: (v) => (['breached', 'at_risk', 'on_track', 'met'].includes(v) ? sql`${sla} = ${v}` : undefined) },
        },
        sorts: { number: maintenanceTickets.number, due: maintenanceTickets.dueAt, created: maintenanceTickets.createdAt, priority: sql`array_position(array['urgent','high','normal','low'], ${maintenanceTickets.priority})`, status: maintenanceTickets.status },
        defaultSort: { id: 'due', dir: 'asc' },
        scope: (ctx) => (isFacilityManager(ctx.p) ? undefined : eq(maintenanceTickets.raisedBy, ctx.p.userId)),
      },
      fields: {
        title: { label: 'Problem', type: 'text', schema: Text(160), column: maintenanceTickets.title, required: true },
        category: { label: 'Category', type: 'select', schema: z.enum(TICKET_CATEGORIES), column: maintenanceTickets.category, options: CATEGORIES, required: true, edit: false },
        priority: { label: 'Priority', type: 'select', schema: z.enum(['low', 'normal', 'high', 'urgent']), column: maintenanceTickets.priority, options: PRIORITY, required: true, edit: false, help: 'Sets the deadline' },
        roomId: { label: 'Room', type: 'select', schema: OptionalRef, column: maintenanceTickets.roomId, options: roomOptions },
        assetId: { label: 'Asset', type: 'select', schema: OptionalRef, column: maintenanceTickets.assetId, options: assetPick },
        location: { label: 'Where', type: 'text', schema: z.string().trim().max(160), column: maintenanceTickets.location, help: 'If not a listed room: corridor, terrace, gate…' },
        description: { label: 'Details', type: 'textarea', schema: z.string().trim().max(2000), column: maintenanceTickets.description },
        assigneeName: { label: 'Assigned to', type: 'text', schema: z.string().trim().max(120), create: false, bulk: true, apply: managerOnly('assigneeName'), help: 'Technician or contractor' },
        assigneeUserId: { label: 'Staff member responsible', type: 'select', schema: OptionalRef, create: false, bulk: true, options: staffPick, apply: managerOnly('assigneeUserId') },
      },
      create: async (ctx, v) => (await this.svc.raise(ctx.tx, ctx.p, { category: String(v.category), priority: v.priority as 'normal', title: String(v.title), description: String(v.description ?? ''), roomId: (v.roomId as string | null) ?? null, assetId: (v.assetId as string | null) ?? null, location: String(v.location ?? '') })).id,
      remove: {
        guard: async (ctx, id) => {
          const [t] = await ctx.tx.select({ status: maintenanceTickets.status }).from(maintenanceTickets).where(eq(maintenanceTickets.id, id));
          return t && t.status !== 'open' && !isFacilityManager(ctx.p) ? 'Work has started on this ticket; ask the estate office' : null;
        },
      },
      actions: {
        start: { label: 'Start work', roles: FACILITY_ROLES, apply: moveTo('in_progress') },
        hold: { label: 'Put on hold', roles: FACILITY_ROLES, apply: moveTo('on_hold') },
        close: { label: 'Close', roles: FACILITY_ROLES, apply: moveTo('closed') },
      },
      columns: [
        { key: 'number', header: 'Ticket' },
        { key: 'createdAt', header: 'Raised', value: (r) => (r.createdAt instanceof Date ? r.createdAt.toISOString().slice(0, 16).replace('T', ' ') : String(r.createdAt ?? '')) },
        { key: 'title', header: 'Problem' },
        { key: 'category', header: 'Category', value: (r) => CATEGORIES.find((o) => o.value === r.category)?.label ?? String(r.category) },
        { key: 'priority', header: 'Priority', value: (r) => PRIORITY.find((o) => o.value === r.priority)?.label ?? String(r.priority) },
        { key: 'roomName', header: 'Room' },
        { key: 'assetTag', header: 'Asset' },
        { key: 'location', header: 'Where' },
        { key: 'raisedByName', header: 'Raised by' },
        { key: 'assigneeName', header: 'Assigned to' },
        { key: 'status', header: 'Status', value: (r) => TICKET_STATUS.find((o) => o.value === r.status)?.label ?? String(r.status) },
        { key: 'dueAt', header: 'Due', value: (r) => (r.dueAt instanceof Date ? r.dueAt.toISOString().slice(0, 16).replace('T', ' ') : String(r.dueAt ?? '')) },
        { key: 'sla', header: 'Deadline' },
        { key: 'resolution', header: 'What was done' },
        { key: 'cost', header: 'Cost (₹)' },
        { key: 'rating', header: 'Rating' },
      ],
    };
  }
}
