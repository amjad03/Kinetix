import { BadRequestException, ConflictException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { and, asc, eq, isNull, sql, type AnyColumn } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { z } from 'zod';
import { readSettings } from '../campus-ops/settings.js';
import { auditUser } from '../common/audit.js';
import { Bool, choiceFilter, choices, familyUserIds, oneOf, OptionalDecimal, qual, Rupees, rupeesOf, staffOptions, studentByRoll, todayIn, yesNo } from '../common/lht-kit.js';
import { nextNumber } from '../common/ops.js';
import { Clock } from '../common/time.js';
import { assets, healthVisits, hostelAllotments, hostelBeds, hostelBlocks, hostelComplaints, hostelGatePasses, hostelRooms, hostelVisitors, invItems, messPlans, messSubscriptions, sections, students, users } from '../db/schema.js';
import { hostelApplications, hostelBedHolds, hostelDeposits, hostelDuties, hostelIncidents, hostelLateEntries, hostelRequests, hostelRoomAssets, hostelRoomTypes, hostels, hostelSettlements, hostelSickbay, hostelStaff, messBills, messLeaves } from '../db/schema-lht.js';
import { FeesService } from '../fees/fees.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { RecordRegistry, type FieldOption, type KitCtx, type RecordEntity, type RecordField } from '../records/entity.js';
import { copyName, DateText, Int, OptionalRef, Text, uuidEq } from '../records/helpers.js';
import { fail, int, outcome, required } from '../import/row-helpers.js';
import { eachRow } from '../records/import.js';
import { allotBed, decidePass, defaultHostel, gateMove, residentOf, transfer, vacate } from './allotment.js';
import { HOSTEL_ROLES } from './hostel.controller.js';

/**
 * The hostel's lists as record kit entities: hostels, room types, blocks, rooms and beds; residents (allot, vacate
 * with settlement, transfer, internship hold), applications, room-change and vacate requests, bed holds, gate passes,
 * visitors, complaints, discipline incidents, late entries, caution deposits and settlements, wardens and the duty
 * roster, the sick bay, room assets, and the mess (plans, subscriptions, leave and monthly bills).
 */

const GENDERS = choices(['boys', 'Boys'], ['girls', 'Girls'], ['mixed', 'Mixed']);
const STUDENT_GENDERS = choices(['male', 'Male'], ['female', 'Female'], ['other', 'Other']);
const ROOM_STATUSES = choices(['available', 'Open'], ['maintenance', 'Under maintenance'], ['closed', 'Closed']);
const APP_STATUSES = choices(['applied', 'Applied'], ['approved', 'Approved'], ['waitlisted', 'Waiting list'], ['allotted', 'Allotted'], ['rejected', 'Rejected'], ['withdrawn', 'Withdrawn']);
const REQUEST_KINDS = choices(['change', 'Room change'], ['vacate', 'Vacate']);
const REQUEST_STATUSES = choices(['pending', 'Pending'], ['approved', 'Approved'], ['rejected', 'Rejected'], ['cancelled', 'Cancelled']);
const HOLD_REASONS = choices(['reservation', 'Reservation'], ['internship', 'Internship'], ['maintenance', 'Maintenance']);
const PASS_STATUSES = choices(['parent_pending', 'Waiting for the family'], ['requested', 'Requested'], ['approved', 'Approved'], ['issued', 'Issued'], ['out', 'Out'], ['returned', 'Returned'], ['rejected', 'Rejected'], ['cancelled', 'Cancelled']);
const COMPLAINT_CATS = choices(['maintenance', 'Maintenance'], ['food', 'Food'], ['cleanliness', 'Cleanliness'], ['safety', 'Safety'], ['other', 'Other']);
const COMPLAINT_STATUSES = choices(['open', 'Open'], ['in_progress', 'In progress'], ['resolved', 'Resolved']);
const INCIDENT_KINDS = choices(['ragging', 'Ragging'], ['damage', 'Damage to property'], ['misconduct', 'Misconduct'], ['late_entry', 'Late entries'], ['substance', 'Alcohol or drugs'], ['other', 'Other']);
const DEPOSIT_MODES = choices(['cash', 'Cash'], ['online', 'Online'], ['fee_invoice', 'Through the fee account']);
const DEPOSIT_STATUSES = choices(['held', 'Held'], ['refunded', 'Refunded'], ['forfeited', 'Forfeited']);
const STAFF_ROLES = choices(['warden', 'Warden'], ['resident_tutor', 'Resident tutor'], ['security', 'Security'], ['caretaker', 'Caretaker'], ['matron', 'Matron']);
const SHIFTS = choices(['morning', 'Morning'], ['evening', 'Evening'], ['night', 'Night']);
const DUTY_STATUSES = choices(['scheduled', 'Scheduled'], ['done', 'Done'], ['missed', 'Missed']);
const CONDITIONS = choices(['good', 'Good'], ['damaged', 'Damaged'], ['missing', 'Missing']);
const BILLING = choices(['fixed', 'Fixed each month'], ['per_day', 'Per day']);
const MEALS = ['breakfast', 'lunch', 'snacks', 'dinner'];

async function hostelOptions(ctx: KitCtx): Promise<FieldOption[]> {
  return (await ctx.tx.select({ id: hostels.id, name: hostels.name }).from(hostels).orderBy(asc(hostels.sortOrder), asc(hostels.name))).map((r) => ({ value: r.id, label: r.name }));
}
async function blockOptions(ctx: KitCtx): Promise<FieldOption[]> {
  return (await ctx.tx.select({ id: hostelBlocks.id, name: hostelBlocks.name, hostel: hostels.name }).from(hostelBlocks).leftJoin(hostels, eq(hostels.id, hostelBlocks.hostelId)).orderBy(asc(hostels.name), asc(hostelBlocks.sortOrder), asc(hostelBlocks.name))).map((r) => ({ value: r.id, label: r.name, group: r.hostel ?? undefined }));
}
async function typeOptions(ctx: KitCtx): Promise<FieldOption[]> {
  return (await ctx.tx.select({ id: hostelRoomTypes.id, name: hostelRoomTypes.name }).from(hostelRoomTypes).orderBy(asc(hostelRoomTypes.sortOrder), asc(hostelRoomTypes.name))).map((r) => ({ value: r.id, label: r.name }));
}
async function roomOptions(ctx: KitCtx): Promise<FieldOption[]> {
  return (await ctx.tx.select({ id: hostelRooms.id, number: hostelRooms.number, block: hostelBlocks.name }).from(hostelRooms).innerJoin(hostelBlocks, eq(hostelBlocks.id, hostelRooms.blockId)).orderBy(asc(hostelBlocks.name), asc(hostelRooms.number))).map((r) => ({ value: r.id, label: `${r.block} · ${r.number}`, group: r.block }));
}
/** Beds with no resident, as "Block · Room · Bed". */
async function freeBedOptions(ctx: KitCtx): Promise<FieldOption[]> {
  const rows = await ctx.tx
    .select({ id: hostelBeds.id, label: hostelBeds.label, room: hostelRooms.number, block: hostelBlocks.name })
    .from(hostelBeds)
    .innerJoin(hostelRooms, eq(hostelRooms.id, hostelBeds.roomId))
    .innerJoin(hostelBlocks, eq(hostelBlocks.id, hostelRooms.blockId))
    .where(sql`not exists (select 1 from hostel_allotments a where a.bed_id = ${qual(hostelBeds.id)} and a.vacated_on is null) and ${qual(hostelRooms.status)} = 'available'`)
    .orderBy(asc(hostelBlocks.name), asc(hostelRooms.number), asc(hostelBeds.label));
  return rows.map((r) => ({ value: r.id, label: `${r.block} · ${r.room} · ${r.label}`, group: r.block }));
}
async function allBedOptions(ctx: KitCtx): Promise<FieldOption[]> {
  const rows = await ctx.tx.select({ id: hostelBeds.id, label: hostelBeds.label, room: hostelRooms.number, block: hostelBlocks.name }).from(hostelBeds).innerJoin(hostelRooms, eq(hostelRooms.id, hostelBeds.roomId)).innerJoin(hostelBlocks, eq(hostelBlocks.id, hostelRooms.blockId)).orderBy(asc(hostelBlocks.name), asc(hostelRooms.number), asc(hostelBeds.label));
  return rows.map((r) => ({ value: r.id, label: `${r.block} · ${r.room} · ${r.label}`, group: r.block }));
}
async function planOptions(ctx: KitCtx): Promise<FieldOption[]> {
  return (await ctx.tx.select({ id: messPlans.id, name: messPlans.name }).from(messPlans).where(eq(messPlans.active, true)).orderBy(asc(messPlans.name))).map((r) => ({ value: r.id, label: r.name }));
}

/** A student named by roll number in the add form (the list shows their roll number). */
const studentField = (label = 'Student (roll no.)'): RecordField => ({ label, type: 'text', schema: Text(40), required: true, edit: false, rowKey: 'rollNo', apply: async () => undefined });
/** The student columns most lists show. */
const studentCols = { studentId: students.id, studentName: students.fullName, rollNo: students.rollNo, className: sections.displayName };
const withStudent = (col: AnyColumn) => (q: Parameters<NonNullable<RecordEntity['list']['joins']>>[0]) => q.innerJoin(students, eq(students.id, col)).innerJoin(sections, eq(sections.id, students.sectionId));
const studentSearch = [students.fullName, students.rollNo];
const studentLabel = (r: Record<string, unknown>) => `${r.rollNo} ${r.studentName}`;

/** Where a bed is, as SQL text "Block · Room · Bed". */
const placeOf = (bed: AnyColumn) => sql<string | null>`(select hb.name || ' · ' || r.number || ' · ' || b.label from hostel_beds b join hostel_rooms r on r.id = b.room_id join hostel_blocks hb on hb.id = r.block_id where b.id = ${qual(bed)})`;
/** The hostel a bed is in. */
const hostelOfBed = (bed: AnyColumn) => sql<string | null>`(select hb.hostel_id from hostel_beds b join hostel_rooms r on r.id = b.room_id join hostel_blocks hb on hb.id = r.block_id where b.id = ${qual(bed)})`;

const decider = alias(users, 'decider');

@Injectable()
export class HostelRecords implements OnModuleInit {
  constructor(
    private readonly registry: RecordRegistry,
    private readonly clock: Clock,
    private readonly fees: FeesService,
    private readonly notifications: NotificationsService,
  ) {}

  onModuleInit(): void {
    for (const e of [
      this.hostels(),
      this.roomTypes(),
      this.blocks(),
      this.rooms(),
      this.residents(),
      this.applications(),
      this.requests(),
      this.holds(),
      this.passes(),
      this.visitors(),
      this.complaints(),
      this.incidents(),
      this.lateEntries(),
      this.deposits(),
      this.settlements(),
      this.staff(),
      this.duties(),
      this.sickbay(),
      this.roomAssets(),
      this.messPlans(),
      this.messSubscriptions(),
      this.messLeaves(),
      this.messBills(),
    ])
      this.registry.register(e);
  }

  private today(ctx: KitCtx) {
    return todayIn(ctx.tx, this.clock.now());
  }

  /** A status change with its audit entry; refused unless the record is in one of `from`. */
  private async move<T extends { status: string }>(ctx: KitCtx, table: Parameters<KitCtx['tx']['update']>[0], idCol: AnyColumn, statusCol: AnyColumn, subject: string, id: string, from: string[], to: string, extra: Record<string, unknown> = {}, data: Record<string, unknown> = {}): Promise<T> {
    const [row] = (await ctx.tx.select().from(table).where(eq(idCol, id)).for('update')) as unknown as T[];
    if (!row) throw new NotFoundException('Not found');
    if (!from.includes(row.status)) throw new ConflictException(`This is ${row.status.replace('_', ' ')}`);
    await ctx.tx.update(table).set({ status: to, ...extra } as never).where(eq(idCol, id));
    void statusCol;
    await auditUser(ctx.tx, ctx.p, `${subject}.${to}`, subject, id, { ...data, changes: { status: { before: row.status, after: to } } });
    return row;
  }

  // ---- buildings ------------------------------------------------------------------------------------------------

  hostels(): RecordEntity {
    const beds = sql<number>`(select count(*)::int from hostel_beds b join hostel_rooms r on r.id = b.room_id join hostel_blocks k on k.id = r.block_id where k.hostel_id = ${qual(hostels.id)})`;
    const occupied = sql<number>`(select count(*)::int from hostel_allotments a join hostel_beds b on b.id = a.bed_id join hostel_rooms r on r.id = b.room_id join hostel_blocks k on k.id = r.block_id where k.hostel_id = ${qual(hostels.id)} and a.vacated_on is null)`;
    return {
      key: 'hostels',
      module: 'hostel',
      table: hostels,
      subjectType: 'hostel',
      roles: { read: HOSTEL_ROLES, write: HOSTEL_ROLES },
      label: (r) => String(r.name),
      list: {
        select: { id: hostels.id, name: hostels.name, code: hostels.code, gender: hostels.gender, address: hostels.address, wardenUserId: hostels.wardenUserId, wardenName: users.fullName, phone: hostels.phone, allowedTerms: sql<string>`array_to_string(${hostels.allowedTerms}, ', ')`, sortOrder: hostels.sortOrder, blocks: sql<number>`(select count(*)::int from hostel_blocks k where k.hostel_id = ${qual(hostels.id)})`, beds, occupied },
        joins: (q) => q.leftJoin(users, eq(users.id, hostels.wardenUserId)),
        search: [hostels.name, hostels.code, hostels.address],
        filters: { gender: choiceFilter('For', hostels.gender, GENDERS) },
        sorts: { name: hostels.name, beds, occupied },
        defaultSort: { id: 'name', dir: 'asc' },
      },
      fields: {
        name: { label: 'Name', type: 'text', schema: Text(80), column: hostels.name, required: true },
        code: { label: 'Code', type: 'text', schema: z.string().trim().max(20), column: hostels.code },
        gender: { label: 'For', type: 'select', schema: oneOf(GENDERS), options: GENDERS, column: hostels.gender, required: true, bulk: true },
        address: { label: 'Address', type: 'textarea', schema: z.string().trim().max(300), column: hostels.address },
        wardenUserId: { label: 'Chief warden', type: 'select', schema: OptionalRef, options: (ctx) => staffOptions(ctx), column: hostels.wardenUserId },
        phone: { label: 'Phone', type: 'phone', schema: z.string().trim().max(20), column: hostels.phone },
        allowedTerms: { label: 'Years or semesters allowed', type: 'text', schema: TermsText, apply: setTerms(hostels, hostels.id), rowKey: 'allowedTerms', help: 'For example 1, 2 for first-years only; empty for all' },
      },
      order: { column: hostels.sortOrder },
      duplicate: async (ctx, row) => ({ name: await copyName(ctx.tx, hostels, hostels.name, String(row.name)) }),
      columns: [
        { key: 'name', header: 'Hostel' },
        { key: 'code', header: 'Code' },
        { key: 'gender', header: 'For' },
        { key: 'wardenName', header: 'Chief warden' },
        { key: 'phone', header: 'Phone' },
        { key: 'allowedTerms', header: 'Years allowed' },
        { key: 'blocks', header: 'Blocks' },
        { key: 'beds', header: 'Beds' },
        { key: 'occupied', header: 'Occupied' },
      ],
    };
  }

  roomTypes(): RecordEntity {
    const rooms = sql<number>`(select count(*)::int from hostel_rooms r where r.room_type_id = ${qual(hostelRoomTypes.id)})`;
    return {
      key: 'hostel-room-types',
      module: 'hostel',
      table: hostelRoomTypes,
      subjectType: 'hostel_room_type',
      roles: { read: HOSTEL_ROLES, write: HOSTEL_ROLES },
      label: (r) => String(r.name),
      list: {
        select: { id: hostelRoomTypes.id, name: hostelRoomTypes.name, bedsPerRoom: hostelRoomTypes.bedsPerRoom, ac: hostelRoomTypes.ac, attachedBath: hostelRoomTypes.attachedBath, feeRupees: rupeesOf(hostelRoomTypes.feePaise), description: hostelRoomTypes.description, sortOrder: hostelRoomTypes.sortOrder, rooms },
        search: [hostelRoomTypes.name, hostelRoomTypes.description],
        sorts: { name: hostelRoomTypes.name, fee: hostelRoomTypes.feePaise, rooms },
        defaultSort: { id: 'name', dir: 'asc' },
      },
      fields: {
        name: { label: 'Name', type: 'text', schema: Text(80), column: hostelRoomTypes.name, required: true },
        bedsPerRoom: { label: 'Beds a room', type: 'number', schema: Int(1, 20), column: hostelRoomTypes.bedsPerRoom, required: true },
        ac: { label: 'Air-conditioned', type: 'boolean', schema: Bool, column: hostelRoomTypes.ac, bulk: true },
        attachedBath: { label: 'Attached bathroom', type: 'boolean', schema: Bool, column: hostelRoomTypes.attachedBath, bulk: true },
        fee: { label: 'Room fee a month (₹)', type: 'number', schema: Rupees, column: hostelRoomTypes.feePaise, rowKey: 'feeRupees', required: true },
        description: { label: 'Description', type: 'textarea', schema: z.string().trim().max(300), column: hostelRoomTypes.description },
      },
      order: { column: hostelRoomTypes.sortOrder },
      duplicate: async (ctx, row) => ({ name: await copyName(ctx.tx, hostelRoomTypes, hostelRoomTypes.name, String(row.name)) }),
      columns: [
        { key: 'name', header: 'Room type' },
        { key: 'bedsPerRoom', header: 'Beds a room' },
        { key: 'ac', header: 'AC' },
        { key: 'attachedBath', header: 'Attached bathroom' },
        { key: 'feeRupees', header: 'Fee a month (₹)' },
        { key: 'rooms', header: 'Rooms' },
      ],
      actions: {
        applyFee: {
          label: 'Apply the fee to its rooms',
          apply: async (ctx, id) => {
            const [t] = await ctx.tx.select().from(hostelRoomTypes).where(eq(hostelRoomTypes.id, id));
            const done = await ctx.tx.update(hostelRooms).set({ monthlyFeePaise: t.feePaise }).where(eq(hostelRooms.roomTypeId, id)).returning({ id: hostelRooms.id });
            await auditUser(ctx.tx, ctx.p, 'hostel_room_type.fee_applied', 'hostel_room_type', id, { rooms: done.length, feePaise: t.feePaise });
            return `${done.length}`;
          },
        },
      },
    };
  }

  blocks(): RecordEntity {
    const beds = sql<number>`(select count(*)::int from hostel_beds b join hostel_rooms r on r.id = b.room_id where r.block_id = ${qual(hostelBlocks.id)})`;
    const occupied = sql<number>`(select count(*)::int from hostel_allotments a join hostel_beds b on b.id = a.bed_id join hostel_rooms r on r.id = b.room_id where r.block_id = ${qual(hostelBlocks.id)} and a.vacated_on is null)`;
    return {
      key: 'hostel-blocks',
      module: 'hostel',
      table: hostelBlocks,
      subjectType: 'hostel_block',
      roles: { read: HOSTEL_ROLES, write: HOSTEL_ROLES },
      label: (r) => String(r.name),
      list: {
        select: { id: hostelBlocks.id, name: hostelBlocks.name, gender: hostelBlocks.gender, hostelId: hostelBlocks.hostelId, hostelName: hostels.name, allowedTerms: sql<string>`array_to_string(${hostelBlocks.allowedTerms}, ', ')`, sortOrder: hostelBlocks.sortOrder, rooms: sql<number>`(select count(*)::int from hostel_rooms r where r.block_id = ${qual(hostelBlocks.id)})`, beds, occupied },
        joins: (q) => q.leftJoin(hostels, eq(hostels.id, hostelBlocks.hostelId)),
        search: [hostelBlocks.name, hostels.name],
        filters: { hostel: { label: 'Hostel', options: hostelOptions, where: (v) => uuidEq(hostelBlocks.hostelId, v) }, gender: choiceFilter('For', hostelBlocks.gender, GENDERS) },
        sorts: { name: hostelBlocks.name, hostel: hostels.name, beds, occupied },
        defaultSort: { id: 'name', dir: 'asc' },
      },
      fields: {
        name: { label: 'Name', type: 'text', schema: Text(60), column: hostelBlocks.name, required: true },
        hostelId: { label: 'Hostel', type: 'select', schema: OptionalRef, options: hostelOptions, column: hostelBlocks.hostelId, edit: false },
        gender: { label: 'For', type: 'select', schema: oneOf(GENDERS), options: GENDERS, column: hostelBlocks.gender, bulk: true, help: 'Empty or "Mixed" follows the hostel' },
        allowedTerms: { label: 'Years or semesters allowed', type: 'text', schema: TermsText, apply: setTerms(hostelBlocks, hostelBlocks.id), rowKey: 'allowedTerms', help: 'Empty follows the hostel' },
      },
      create: async (ctx, v) => {
        const [b] = await ctx.tx.insert(hostelBlocks).values({ tenantId: ctx.p.tenantId, name: String(v.name), gender: String(v.gender ?? 'mixed'), hostelId: (v.hostelId as string | null) ?? (await defaultHostel(ctx.tx, ctx.p.tenantId)), allowedTerms: (v.allowedTerms as number[] | undefined) ?? [] }).returning({ id: hostelBlocks.id });
        return b.id;
      },
      move: { label: 'Move to hostel', options: hostelOptions, column: hostelBlocks.hostelId },
      order: { column: hostelBlocks.sortOrder, scope: [hostelBlocks.hostelId] },
      columns: [
        { key: 'name', header: 'Block' },
        { key: 'hostelName', header: 'Hostel' },
        { key: 'gender', header: 'For' },
        { key: 'allowedTerms', header: 'Years allowed' },
        { key: 'rooms', header: 'Rooms' },
        { key: 'beds', header: 'Beds' },
        { key: 'occupied', header: 'Occupied' },
      ],
    };
  }

  rooms(): RecordEntity {
    const bedCount = sql<number>`(select count(*)::int from hostel_beds b where b.room_id = ${qual(hostelRooms.id)})`;
    const occupied = sql<number>`(select count(*)::int from hostel_allotments a join hostel_beds b on b.id = a.bed_id where b.room_id = ${qual(hostelRooms.id)} and a.vacated_on is null)`;
    const residents = sql<string>`(select string_agg(s.full_name, ', ' order by s.full_name) from hostel_allotments a join hostel_beds b on b.id = a.bed_id join students s on s.id = a.student_id where b.room_id = ${qual(hostelRooms.id)} and a.vacated_on is null)`;
    return {
      key: 'hostel-rooms',
      module: 'hostel',
      table: hostelRooms,
      subjectType: 'hostel_room',
      roles: { read: HOSTEL_ROLES, write: HOSTEL_ROLES },
      label: (r) => `${r.blockName} · ${r.number}`,
      list: {
        select: { id: hostelRooms.id, number: hostelRooms.number, floor: hostelRooms.floor, blockId: hostelRooms.blockId, blockName: hostelBlocks.name, hostelName: hostels.name, roomTypeId: hostelRooms.roomTypeId, roomTypeName: hostelRoomTypes.name, feeRupees: rupeesOf(hostelRooms.monthlyFeePaise), status: hostelRooms.status, note: hostelRooms.note, beds: bedCount, occupied, free: sql<number>`${bedCount} - ${occupied}`, residents },
        joins: (q) => q.innerJoin(hostelBlocks, eq(hostelBlocks.id, hostelRooms.blockId)).leftJoin(hostels, eq(hostels.id, hostelBlocks.hostelId)).leftJoin(hostelRoomTypes, eq(hostelRoomTypes.id, hostelRooms.roomTypeId)),
        search: [hostelRooms.number, hostelBlocks.name, hostels.name],
        filters: {
          hostel: { label: 'Hostel', options: hostelOptions, where: (v) => uuidEq(hostelBlocks.hostelId, v) },
          block: { label: 'Block', options: blockOptions, where: (v) => uuidEq(hostelRooms.blockId, v) },
          type: { label: 'Room type', options: typeOptions, where: (v) => uuidEq(hostelRooms.roomTypeId, v) },
          status: choiceFilter('Status', hostelRooms.status, ROOM_STATUSES),
          vacancy: yesNo('Free beds', sql`${bedCount} > ${occupied}`, sql`${bedCount} <= ${occupied}`, ['Has a free bed', 'Full']),
          floor: { label: 'Floor', where: (v) => (/^\d{1,2}$/.test(v) ? eq(hostelRooms.floor, Number(v)) : undefined) },
        },
        sorts: { number: sql`length(${hostelRooms.number}), ${hostelRooms.number}`, block: hostelBlocks.name, floor: hostelRooms.floor, fee: hostelRooms.monthlyFeePaise, free: sql`${bedCount} - ${occupied}` },
        defaultSort: { id: 'number', dir: 'asc' },
        tiebreak: [hostelBlocks.name],
      },
      fields: {
        blockId: { label: 'Block', type: 'select', schema: z.uuid(), options: blockOptions, column: hostelRooms.blockId, required: true, edit: false },
        number: { label: 'Room number', type: 'text', schema: Text(20), column: hostelRooms.number, required: true },
        floor: { label: 'Floor', type: 'number', schema: Int(0, 50), column: hostelRooms.floor, bulk: true },
        roomTypeId: { label: 'Room type', type: 'select', schema: OptionalRef, options: typeOptions, column: hostelRooms.roomTypeId, bulk: true },
        fee: { label: 'Room fee a month (₹)', type: 'number', schema: Rupees, column: hostelRooms.monthlyFeePaise, rowKey: 'feeRupees', bulk: true, help: 'Empty takes the room type’s fee' },
        beds: { label: 'Beds', type: 'number', schema: Int(1, 20), required: true, edit: false, apply: async () => undefined },
        status: { label: 'Status', type: 'select', schema: oneOf(ROOM_STATUSES), options: ROOM_STATUSES, column: hostelRooms.status, create: false, bulk: true },
        note: { label: 'Note', type: 'text', schema: z.string().trim().max(300), column: hostelRooms.note },
      },
      create: async (ctx, v) => {
        const [type] = v.roomTypeId ? await ctx.tx.select().from(hostelRoomTypes).where(eq(hostelRoomTypes.id, String(v.roomTypeId))) : [];
        const [r] = await ctx.tx.insert(hostelRooms).values({ tenantId: ctx.p.tenantId, blockId: String(v.blockId), number: String(v.number), floor: Number(v.floor ?? 0), roomTypeId: (v.roomTypeId as string | null) ?? null, monthlyFeePaise: v.fee !== undefined ? Number(v.fee) : Number(type?.feePaise ?? 0), note: String(v.note ?? '') }).returning({ id: hostelRooms.id });
        const n = Number(v.beds ?? type?.bedsPerRoom ?? 1);
        await ctx.tx.insert(hostelBeds).values(Array.from({ length: n }, (_, i) => ({ tenantId: ctx.p.tenantId, roomId: r.id, label: `B${i + 1}` })));
        return r.id;
      },
      duplicate: async (ctx, row) => ({ number: await copyName(ctx.tx, hostelRooms, hostelRooms.number, String(row.number), eq(hostelRooms.blockId, String(row.block_id)), (n) => (n === 1 ? '-A' : `-${String.fromCharCode(64 + n)}`)) }),
      move: { label: 'Move to block', options: blockOptions, column: hostelRooms.blockId },
      columns: [
        { key: 'number', header: 'Room' },
        { key: 'blockName', header: 'Block' },
        { key: 'hostelName', header: 'Hostel' },
        { key: 'floor', header: 'Floor' },
        { key: 'roomTypeName', header: 'Type' },
        { key: 'feeRupees', header: 'Fee a month (₹)' },
        { key: 'status', header: 'Status' },
        { key: 'beds', header: 'Beds' },
        { key: 'occupied', header: 'Occupied' },
        { key: 'free', header: 'Free' },
        { key: 'residents', header: 'Residents' },
      ],
      remove: { guard: async (ctx, id) => ((await ctx.tx.select({ n: sql<number>`count(*)::int` }).from(hostelAllotments).innerJoin(hostelBeds, eq(hostelBeds.id, hostelAllotments.bedId)).where(and(eq(hostelBeds.roomId, id), isNull(hostelAllotments.vacatedOn))))[0].n > 0 ? 'Students live in this room' : null) },
      import: {
        columns: [
          { key: 'block', header: 'Block', required: true, help: 'The block’s name; it must exist', options: async (ctx) => (await blockOptions(ctx)).map((o) => o.label) },
          { key: 'room', header: 'Room number', required: true, example: '101' },
          { key: 'floor', header: 'Floor', example: '1' },
          { key: 'type', header: 'Room type', options: async (ctx) => (await typeOptions(ctx)).map((o) => o.label) },
          { key: 'beds', header: 'Beds', help: 'New rooms only (the room type’s if empty)', example: '3' },
          { key: 'fee', header: 'Fee a month (₹)', help: 'Empty takes the room type’s fee' },
        ],
        key: ['block', 'room'],
        exists: async (ctx, r) => !!(await ctx.tx.select({ id: hostelRooms.id }).from(hostelRooms).innerJoin(hostelBlocks, eq(hostelBlocks.id, hostelRooms.blockId)).where(and(sql`lower(${hostelBlocks.name}) = ${r.get('block').toLowerCase()}`, sql`lower(${hostelRooms.number}) = ${r.get('room').toLowerCase()}`)).limit(1))[0],
        run: async (ctx, rows) => {
          const blocks = await blockOptions(ctx);
          const types = await ctx.tx.select().from(hostelRoomTypes);
          return eachRow(ctx.tx, rows, async (tx, r) => {
            const blk = blocks.filter((b) => b.label.toLowerCase() === required(r, 'block').toLowerCase());
            if (blk.length !== 1) fail(blk.length ? 'More than one block has this name' : 'No block with this name', r.get('block'));
            const number = required(r, 'room');
            const type = r.get('type') ? (types.find((t) => t.name.toLowerCase() === r.get('type').toLowerCase()) ?? fail('No room type with this name', r.get('type'))) : null;
            const fee = r.get('fee') ? Math.round(Number(r.get('fee')) * 100) : type ? type.feePaise : undefined;
            if (fee !== undefined && !(fee >= 0)) fail('This value is not valid', r.get('fee'));
            const set = { ...(r.get('floor') && { floor: int(r.get('floor'), 0, 50) }), ...(type && { roomTypeId: type.id }), ...(fee !== undefined && { monthlyFeePaise: fee }) };
            const [found] = await tx.select({ id: hostelRooms.id }).from(hostelRooms).where(and(eq(hostelRooms.blockId, blk[0].value), sql`lower(${hostelRooms.number}) = ${number.toLowerCase()}`));
            if (found) {
              if (Object.keys(set).length) await tx.update(hostelRooms).set(set).where(eq(hostelRooms.id, found.id));
              return outcome(false, Object.keys(set).length > 0, [number]);
            }
            const [room] = await tx.insert(hostelRooms).values({ tenantId: ctx.p.tenantId, blockId: blk[0].value, number, ...set }).returning({ id: hostelRooms.id });
            const n = r.get('beds') ? int(r.get('beds'), 1, 20) : (type?.bedsPerRoom ?? 1);
            await tx.insert(hostelBeds).values(Array.from({ length: n }, (_, i) => ({ tenantId: ctx.p.tenantId, roomId: room.id, label: `B${i + 1}` })));
            return outcome(true, false, [number, `${n} beds`]);
          });
        },
      },
      actions: {
        addBed: {
          label: 'Add a bed',
          apply: async (ctx, id) => {
            const [{ n }] = await ctx.tx.select({ n: sql<number>`count(*)::int` }).from(hostelBeds).where(eq(hostelBeds.roomId, id));
            let k = n + 1;
            while ((await ctx.tx.select({ id: hostelBeds.id }).from(hostelBeds).where(and(eq(hostelBeds.roomId, id), eq(hostelBeds.label, `B${k}`))))[0]) k++;
            await ctx.tx.insert(hostelBeds).values({ tenantId: ctx.p.tenantId, roomId: id, label: `B${k}` });
            await auditUser(ctx.tx, ctx.p, 'hostel_room.bed_added', 'hostel_room', id, { label: `B${k}` });
            return `B${k}`;
          },
        },
        removeBed: {
          label: 'Remove a free bed',
          apply: async (ctx, id) => {
            const [bed] = await ctx.tx.select().from(hostelBeds).where(and(eq(hostelBeds.roomId, id), sql`not exists (select 1 from hostel_allotments a where a.bed_id = ${qual(hostelBeds.id)})`, sql`not exists (select 1 from hostel_bed_holds h where h.bed_id = ${qual(hostelBeds.id)})`)).orderBy(sql`${hostelBeds.label} desc`).limit(1);
            if (!bed) throw new ConflictException('Every bed in this room has been used; a bed with history stays');
            await ctx.tx.delete(hostelBeds).where(eq(hostelBeds.id, bed.id));
            await auditUser(ctx.tx, ctx.p, 'hostel_room.bed_removed', 'hostel_room', id, { label: bed.label });
            return bed.label;
          },
        },
      },
    };
  }

  // ---- residents ------------------------------------------------------------------------------------------------

  residents(): RecordEntity {
    const roomFee = sql<number>`(select r.monthly_fee_paise from hostel_beds b join hostel_rooms r on r.id = b.room_id where b.id = ${qual(hostelAllotments.bedId)})`;
    const hold = sql<string | null>`(select h.until_on::text from hostel_bed_holds h where h.bed_id = ${qual(hostelAllotments.bedId)} and h.student_id = ${qual(hostelAllotments.studentId)} and h.status = 'active' and h.reason = 'internship')`;
    return {
      key: 'hostel-residents',
      module: 'hostel',
      table: hostelAllotments,
      subjectType: 'hostel_allotment',
      roles: { read: HOSTEL_ROLES, write: HOSTEL_ROLES },
      label: studentLabel,
      list: {
        select: { id: hostelAllotments.id, ...studentCols, term: sections.term, bedId: hostelAllotments.bedId, place: placeOf(hostelAllotments.bedId), hostelId: hostelOfBed(hostelAllotments.bedId), startsOn: hostelAllotments.startsOn, vacatedOn: hostelAllotments.vacatedOn, vacateReason: hostelAllotments.vacateReason, feeRupees: rupeesOf(roomFee), internshipUntil: hold, status: sql<string>`case when ${hostelAllotments.vacatedOn} is null then 'resident' else 'left' end` },
        joins: withStudent(hostelAllotments.studentId),
        search: [...studentSearch, sections.displayName],
        filters: {
          status: { label: 'Status', options: choices(['resident', 'Living in'], ['left', 'Left']), where: (v) => (v === 'resident' ? isNull(hostelAllotments.vacatedOn) : v === 'left' ? sql`${hostelAllotments.vacatedOn} is not null` : undefined) },
          hostel: { label: 'Hostel', options: hostelOptions, where: (v) => (/^[0-9a-f-]{36}$/.test(v) ? sql`${hostelOfBed(hostelAllotments.bedId)} = ${v}::uuid` : undefined) },
          block: { label: 'Block', options: blockOptions, where: (v) => (/^[0-9a-f-]{36}$/.test(v) ? sql`exists (select 1 from hostel_beds b join hostel_rooms r on r.id = b.room_id where b.id = ${qual(hostelAllotments.bedId)} and r.block_id = ${v}::uuid)` : undefined) },
          term: { label: 'Year or semester', where: (v) => (/^\d{1,2}$/.test(v) ? eq(sections.term, Number(v)) : undefined) },
        },
        sorts: { name: students.fullName, roll: students.rollNo, place: placeOf(hostelAllotments.bedId), since: hostelAllotments.startsOn, left: hostelAllotments.vacatedOn },
        defaultSort: { id: 'place', dir: 'asc' },
        scope: () => undefined,
      },
      fields: {
        student: studentField(),
        bedId: { label: 'Bed', type: 'select', schema: z.uuid(), options: freeBedOptions, required: true, edit: false, rowKey: 'bedId', apply: async () => undefined },
        startsOn: { label: 'From', type: 'date', schema: DateText, column: hostelAllotments.startsOn, edit: false },
      },
      create: async (ctx, v) => {
        const s = await studentByRoll(ctx.tx, String(v.student));
        const a = await allotBed(ctx.tx, ctx.p, this.clock.now(), s.id, String(v.bedId), (v.startsOn as string | null) ?? undefined);
        return a.id;
      },
      columns: [
        { key: 'rollNo', header: 'Roll no.' },
        { key: 'studentName', header: 'Student' },
        { key: 'className', header: 'Class' },
        { key: 'place', header: 'Block · Room · Bed' },
        { key: 'startsOn', header: 'From' },
        { key: 'vacatedOn', header: 'Left on' },
        { key: 'feeRupees', header: 'Room fee (₹)' },
        { key: 'internshipUntil', header: 'Away on internship until' },
        { key: 'vacateReason', header: 'Reason for leaving' },
      ],
      remove: { guard: async () => 'An allotment stays in the record; vacate the bed instead' },
      actions: {
        vacate: {
          label: 'Vacate',
          tone: 'danger',
          params: z.object({ on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), reason: z.string().trim().max(200).default(''), damages: Rupees.default(0), dues: Rupees.default(0), refundUnusedFee: z.boolean().default(true) }).default({ reason: '', damages: 0, dues: 0, refundUnusedFee: true }),
          apply: async (ctx, id, raw) => {
            const p = raw as { on?: string; reason: string; damages: number; dues: number; refundUnusedFee: boolean };
            const r = await vacate(ctx.tx, ctx.p, this.clock.now(), id, { on: p.on, reason: p.reason, damagesPaise: p.damages, duesPaise: p.dues, refundUnusedFee: p.refundUnusedFee });
            return r.settlement ? `Refund ₹${(r.settlement.netRefundPaise / 100).toFixed(2)}` : undefined;
          },
        },
        transfer: {
          label: 'Move to another bed',
          params: z.object({ bedId: z.uuid('Choose the bed'), reason: z.string().trim().min(2, 'Say why').max(200) }),
          apply: async (ctx, id, raw) => {
            const p = raw as { bedId: string; reason: string };
            await transfer(ctx.tx, ctx.p, this.clock.now(), id, p.bedId, p.reason);
          },
        },
        internship: {
          label: 'Hold the bed during an internship',
          params: z.object({ from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), note: z.string().trim().max(200).default('') }),
          apply: async (ctx, id, raw) => {
            const p = raw as { from: string; until: string; note: string };
            if (p.until < p.from) throw new BadRequestException('The end is before the start');
            const [a] = await ctx.tx.select().from(hostelAllotments).where(eq(hostelAllotments.id, id));
            if (a.vacatedOn) throw new ConflictException('This student has left');
            const [h] = await ctx.tx.insert(hostelBedHolds).values({ tenantId: ctx.p.tenantId, bedId: a.bedId, studentId: a.studentId, reason: 'internship', fromOn: p.from, untilOn: p.until, note: p.note, createdBy: ctx.p.userId }).onConflictDoNothing().returning();
            if (!h) throw new ConflictException('This bed already has a hold');
            // Away on internship counts as mess leave.
            await ctx.tx.insert(messLeaves).values({ tenantId: ctx.p.tenantId, studentId: a.studentId, fromOn: p.from, toOn: p.until, reason: 'Internship', status: 'approved', decidedBy: ctx.p.userId, decidedAt: this.clock.now(), createdBy: ctx.p.userId });
            await auditUser(ctx.tx, ctx.p, 'hostel.internship_hold', 'hostel_allotment', id, { from: p.from, until: p.until });
          },
        },
      },
    };
  }

  applications(): RecordEntity {
    const setApp = (to: string, from: string[], note = false) => async (ctx: KitCtx, id: string, raw: unknown) => {
      await this.move(ctx, hostelApplications, hostelApplications.id, hostelApplications.status, 'hostel_application', id, from, to, { decidedBy: ctx.p.userId, decidedAt: this.clock.now(), ...(note && { decisionNote: (raw as { note?: string } | undefined)?.note ?? '' }) });
    };
    return {
      key: 'hostel-applications',
      module: 'hostel',
      table: hostelApplications,
      subjectType: 'hostel_application',
      roles: { read: HOSTEL_ROLES, write: HOSTEL_ROLES },
      label: (r) => `${r.number} ${r.studentName}`,
      list: {
        select: { id: hostelApplications.id, number: hostelApplications.number, ...studentCols, term: sections.term, hostelId: hostelApplications.hostelId, hostelName: hostels.name, roomTypeId: hostelApplications.roomTypeId, roomTypeName: hostelRoomTypes.name, gender: hostelApplications.gender, distanceKm: hostelApplications.distanceKm, meritScore: hostelApplications.meritScore, category: hostelApplications.category, needs: hostelApplications.needs, status: hostelApplications.status, priority: hostelApplications.priority, decisionNote: hostelApplications.decisionNote, allotmentId: hostelApplications.allotmentId, place: sql<string | null>`(select ${placeOf(hostelAllotments.bedId)} from hostel_allotments where hostel_allotments.id = ${qual(hostelApplications.allotmentId)})`, createdAt: hostelApplications.createdAt },
        joins: (q) => withStudent(hostelApplications.studentId)(q).leftJoin(hostels, eq(hostels.id, hostelApplications.hostelId)).leftJoin(hostelRoomTypes, eq(hostelRoomTypes.id, hostelApplications.roomTypeId)),
        search: [hostelApplications.number, ...studentSearch],
        filters: { status: choiceFilter('Status', hostelApplications.status, APP_STATUSES), hostel: { label: 'Hostel', options: hostelOptions, where: (v) => uuidEq(hostelApplications.hostelId, v) }, gender: choiceFilter('Gender', hostelApplications.gender, STUDENT_GENDERS) },
        sorts: { priority: hostelApplications.priority, applied: hostelApplications.createdAt, name: students.fullName, distance: hostelApplications.distanceKm, merit: hostelApplications.meritScore },
        defaultSort: { id: 'priority', dir: 'desc' },
      },
      fields: {
        student: studentField(),
        hostelId: { label: 'Preferred hostel', type: 'select', schema: OptionalRef, options: hostelOptions, column: hostelApplications.hostelId },
        roomTypeId: { label: 'Preferred room type', type: 'select', schema: OptionalRef, options: typeOptions, column: hostelApplications.roomTypeId },
        gender: { label: 'Gender', type: 'select', schema: oneOf(STUDENT_GENDERS), options: STUDENT_GENDERS, column: hostelApplications.gender, required: true },
        distanceKm: { label: 'Distance from home (km)', type: 'number', schema: OptionalDecimal(0, 20000), column: hostelApplications.distanceKm },
        meritScore: { label: 'Merit score (0-100)', type: 'number', schema: OptionalDecimal(0, 100), column: hostelApplications.meritScore },
        category: { label: 'Category', type: 'text', schema: z.string().trim().max(40), column: hostelApplications.category },
        needs: { label: 'Special needs', type: 'textarea', schema: z.string().trim().max(300), column: hostelApplications.needs },
      },
      create: async (ctx, v) => {
        const s = await studentByRoll(ctx.tx, String(v.student));
        if (await residentOf(ctx.tx, s.id)) throw new ConflictException('This student already has a bed');
        const [a] = await ctx.tx.insert(hostelApplications).values({ tenantId: ctx.p.tenantId, number: await nextNumber(ctx.tx, ctx.p.tenantId, 'HAP'), studentId: s.id, hostelId: (v.hostelId as string | null) ?? null, roomTypeId: (v.roomTypeId as string | null) ?? null, gender: String(v.gender), distanceKm: (v.distanceKm as number | null) ?? null, meritScore: (v.meritScore as number | null) ?? null, category: String(v.category ?? 'general') || 'general', needs: String(v.needs ?? ''), createdBy: ctx.p.userId }).returning({ id: hostelApplications.id });
        await rankApplications(ctx);
        return a.id;
      },
      columns: [
        { key: 'number', header: 'Number' },
        { key: 'rollNo', header: 'Roll no.' },
        { key: 'studentName', header: 'Student' },
        { key: 'className', header: 'Class' },
        { key: 'gender', header: 'Gender' },
        { key: 'distanceKm', header: 'Distance (km)' },
        { key: 'meritScore', header: 'Merit' },
        { key: 'priority', header: 'Priority' },
        { key: 'hostelName', header: 'Hostel wanted' },
        { key: 'roomTypeName', header: 'Room type wanted' },
        { key: 'status', header: 'Status' },
        { key: 'place', header: 'Allotted' },
      ],
      actions: {
        approve: { label: 'Approve', apply: setApp('approved', ['applied', 'waitlisted']) },
        waitlist: { label: 'Put on the waiting list', apply: setApp('waitlisted', ['applied', 'approved']) },
        reject: { label: 'Reject', tone: 'danger', params: z.object({ note: z.string().trim().max(300).optional() }).default({}), apply: setApp('rejected', ['applied', 'approved', 'waitlisted'], true) },
        allot: {
          label: 'Allot a bed',
          params: z.object({ bedId: z.uuid('Choose the bed') }),
          apply: async (ctx, id, raw) => {
            const [app] = await ctx.tx.select().from(hostelApplications).where(eq(hostelApplications.id, id)).for('update');
            if (!['applied', 'approved', 'waitlisted'].includes(app.status)) throw new ConflictException(`This application is ${app.status}`);
            const a = await allotBed(ctx.tx, ctx.p, this.clock.now(), app.studentId, (raw as { bedId: string }).bedId);
            await ctx.tx.update(hostelApplications).set({ status: 'allotted', allotmentId: a.id, decidedBy: ctx.p.userId, decidedAt: this.clock.now() }).where(eq(hostelApplications.id, id));
            await auditUser(ctx.tx, ctx.p, 'hostel_application.allotted', 'hostel_application', id, { allotmentId: a.id, changes: { status: { before: app.status, after: 'allotted' } } });
          },
        },
      },
    };
  }

  requests(): RecordEntity {
    return {
      key: 'hostel-requests',
      module: 'hostel',
      table: hostelRequests,
      subjectType: 'hostel_request',
      roles: { read: HOSTEL_ROLES, write: HOSTEL_ROLES },
      label: (r) => `${r.rollNo} ${r.studentName} · ${r.kind}`,
      list: {
        select: { id: hostelRequests.id, ...studentCols, kind: hostelRequests.kind, roomTypeName: hostelRoomTypes.name, bedId: hostelRequests.bedId, wantedBed: placeOf(hostelRequests.bedId), currentPlace: sql<string | null>`(select ${placeOf(hostelAllotments.bedId)} from hostel_allotments where hostel_allotments.student_id = ${qual(hostelRequests.studentId)} and hostel_allotments.vacated_on is null)`, reason: hostelRequests.reason, effectiveOn: hostelRequests.effectiveOn, status: hostelRequests.status, decidedByName: decider.fullName, decisionNote: hostelRequests.decisionNote, createdAt: hostelRequests.createdAt },
        joins: (q) => withStudent(hostelRequests.studentId)(q).leftJoin(hostelRoomTypes, eq(hostelRoomTypes.id, hostelRequests.roomTypeId)).leftJoin(decider, eq(decider.id, hostelRequests.decidedBy)),
        search: studentSearch,
        filters: { kind: choiceFilter('Request', hostelRequests.kind, REQUEST_KINDS), status: choiceFilter('Status', hostelRequests.status, REQUEST_STATUSES) },
        sorts: { asked: hostelRequests.createdAt, effective: hostelRequests.effectiveOn, name: students.fullName },
        defaultSort: { id: 'asked', dir: 'desc' },
      },
      fields: {
        student: studentField(),
        kind: { label: 'Request', type: 'select', schema: oneOf(REQUEST_KINDS), options: REQUEST_KINDS, column: hostelRequests.kind, required: true, edit: false },
        roomTypeId: { label: 'Room type wanted', type: 'select', schema: OptionalRef, options: typeOptions, column: hostelRequests.roomTypeId },
        bedId: { label: 'Bed wanted', type: 'select', schema: OptionalRef, options: freeBedOptions, column: hostelRequests.bedId },
        reason: { label: 'Reason', type: 'textarea', schema: Text(500), column: hostelRequests.reason, required: true },
        effectiveOn: { label: 'From', type: 'date', schema: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-10-15'), column: hostelRequests.effectiveOn, required: true },
      },
      create: async (ctx, v) => {
        const s = await studentByRoll(ctx.tx, String(v.student));
        if (!(await residentOf(ctx.tx, s.id))) throw new BadRequestException('This student has no hostel bed');
        const [r] = await ctx.tx.insert(hostelRequests).values({ tenantId: ctx.p.tenantId, studentId: s.id, kind: String(v.kind), roomTypeId: (v.roomTypeId as string | null) ?? null, bedId: (v.bedId as string | null) ?? null, reason: String(v.reason), effectiveOn: String(v.effectiveOn), createdBy: ctx.p.userId }).returning({ id: hostelRequests.id });
        return r.id;
      },
      columns: [
        { key: 'rollNo', header: 'Roll no.' },
        { key: 'studentName', header: 'Student' },
        { key: 'kind', header: 'Request' },
        { key: 'currentPlace', header: 'Now in' },
        { key: 'wantedBed', header: 'Bed wanted' },
        { key: 'roomTypeName', header: 'Room type wanted' },
        { key: 'reason', header: 'Reason' },
        { key: 'effectiveOn', header: 'From' },
        { key: 'status', header: 'Status' },
        { key: 'decidedByName', header: 'Decided by' },
      ],
      actions: {
        approve: {
          label: 'Approve',
          params: z.object({ bedId: z.uuid().optional(), damages: Rupees.default(0), dues: Rupees.default(0) }).default({ damages: 0, dues: 0 }),
          apply: async (ctx, id, raw) => {
            const p = raw as { bedId?: string; damages: number; dues: number };
            const [r] = await ctx.tx.select().from(hostelRequests).where(eq(hostelRequests.id, id)).for('update');
            if (r.status !== 'pending') throw new ConflictException(`This request is ${r.status}`);
            const a = await residentOf(ctx.tx, r.studentId);
            if (!a) throw new ConflictException('This student no longer has a bed');
            let note: string | undefined;
            if (r.kind === 'vacate') {
              const today = await this.today(ctx);
              const v = await vacate(ctx.tx, ctx.p, this.clock.now(), a.id, { on: r.effectiveOn < today ? today : r.effectiveOn, reason: r.reason, damagesPaise: p.damages, duesPaise: p.dues });
              note = v.settlement ? `Refund ₹${(v.settlement.netRefundPaise / 100).toFixed(2)}` : undefined;
            } else {
              const bed = p.bedId ?? r.bedId;
              if (!bed) throw new BadRequestException('Choose the bed to move to');
              await transfer(ctx.tx, ctx.p, this.clock.now(), a.id, bed, r.reason);
            }
            await ctx.tx.update(hostelRequests).set({ status: 'approved', decidedBy: ctx.p.userId, decidedAt: this.clock.now() }).where(eq(hostelRequests.id, id));
            await auditUser(ctx.tx, ctx.p, 'hostel_request.approved', 'hostel_request', id, { changes: { status: { before: 'pending', after: 'approved' } } });
            return note;
          },
        },
        reject: { label: 'Reject', tone: 'danger', params: z.object({ note: z.string().trim().max(300).optional() }).default({}), apply: async (ctx, id, raw) => void (await this.move(ctx, hostelRequests, hostelRequests.id, hostelRequests.status, 'hostel_request', id, ['pending'], 'rejected', { decidedBy: ctx.p.userId, decidedAt: this.clock.now(), decisionNote: (raw as { note?: string }).note ?? '' })) },
      },
    };
  }

  holds(): RecordEntity {
    return {
      key: 'hostel-bed-holds',
      module: 'hostel',
      table: hostelBedHolds,
      subjectType: 'hostel_bed_hold',
      roles: { read: HOSTEL_ROLES, write: HOSTEL_ROLES },
      label: (r) => `${r.place} · ${r.reason}`,
      list: {
        select: { id: hostelBedHolds.id, bedId: hostelBedHolds.bedId, place: placeOf(hostelBedHolds.bedId), studentId: hostelBedHolds.studentId, studentName: students.fullName, rollNo: students.rollNo, reason: hostelBedHolds.reason, fromOn: hostelBedHolds.fromOn, untilOn: hostelBedHolds.untilOn, status: hostelBedHolds.status, note: hostelBedHolds.note },
        joins: (q) => q.leftJoin(students, eq(students.id, hostelBedHolds.studentId)),
        search: [students.fullName, students.rollNo, hostelBedHolds.note],
        filters: { reason: choiceFilter('Reason', hostelBedHolds.reason, HOLD_REASONS), status: choiceFilter('Status', hostelBedHolds.status, choices(['active', 'Active'], ['released', 'Released'], ['converted', 'Allotted'])) },
        sorts: { until: hostelBedHolds.untilOn, from: hostelBedHolds.fromOn, place: placeOf(hostelBedHolds.bedId) },
        defaultSort: { id: 'until', dir: 'asc' },
      },
      fields: {
        bedId: { label: 'Bed', type: 'select', schema: z.uuid(), options: allBedOptions, column: hostelBedHolds.bedId, required: true, edit: false },
        student: { label: 'For student (roll no.)', type: 'text', schema: z.string().trim().max(40), edit: false, rowKey: 'rollNo', apply: async () => undefined },
        reason: { label: 'Reason', type: 'select', schema: oneOf(HOLD_REASONS), options: HOLD_REASONS, column: hostelBedHolds.reason, required: true },
        fromOn: { label: 'From', type: 'date', schema: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-10-15'), column: hostelBedHolds.fromOn, required: true },
        untilOn: { label: 'Until', type: 'date', schema: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-10-15'), column: hostelBedHolds.untilOn, required: true, bulk: true },
        note: { label: 'Note', type: 'text', schema: z.string().trim().max(200), column: hostelBedHolds.note },
      },
      create: async (ctx, v) => {
        if (String(v.untilOn) < String(v.fromOn)) throw new BadRequestException('The end is before the start');
        const s = v.student ? await studentByRoll(ctx.tx, String(v.student)) : null;
        const [taken] = await ctx.tx.select({ studentId: hostelAllotments.studentId }).from(hostelAllotments).where(and(eq(hostelAllotments.bedId, String(v.bedId)), isNull(hostelAllotments.vacatedOn)));
        if (taken && taken.studentId !== s?.id) throw new ConflictException('Someone lives in this bed');
        const [h] = await ctx.tx.insert(hostelBedHolds).values({ tenantId: ctx.p.tenantId, bedId: String(v.bedId), studentId: s?.id ?? null, reason: String(v.reason), fromOn: String(v.fromOn), untilOn: String(v.untilOn), note: String(v.note ?? ''), createdBy: ctx.p.userId }).onConflictDoNothing().returning({ id: hostelBedHolds.id });
        if (!h) throw new ConflictException('This bed already has a hold');
        return h.id;
      },
      columns: [
        { key: 'place', header: 'Block · Room · Bed' },
        { key: 'studentName', header: 'For' },
        { key: 'reason', header: 'Reason' },
        { key: 'fromOn', header: 'From' },
        { key: 'untilOn', header: 'Until' },
        { key: 'status', header: 'Status' },
        { key: 'note', header: 'Note' },
      ],
      actions: { release: { label: 'Release', apply: async (ctx, id) => void (await this.move(ctx, hostelBedHolds, hostelBedHolds.id, hostelBedHolds.status, 'hostel_bed_hold', id, ['active'], 'released')) } },
    };
  }

  // ---- gate, visitors, complaints, discipline -------------------------------------------------------------------------

  passes(): RecordEntity {
    const overdue = sql<boolean>`${hostelGatePasses.status} = 'out' and ${hostelGatePasses.expectedBackAt} < now()`;
    return {
      key: 'hostel-gate-passes',
      module: 'hostel',
      table: hostelGatePasses,
      subjectType: 'hostel_gate_pass',
      roles: { read: HOSTEL_ROLES, write: HOSTEL_ROLES },
      label: (r) => `${r.rollNo} ${r.studentName} · ${r.destination || r.reason}`,
      list: {
        select: { id: hostelGatePasses.id, ...studentCols, reason: hostelGatePasses.reason, destination: hostelGatePasses.destination, expectedBackAt: hostelGatePasses.expectedBackAt, status: hostelGatePasses.status, parentStatus: hostelGatePasses.parentStatus, outAt: hostelGatePasses.outAt, inAt: hostelGatePasses.inAt, overdue, lateMinutes: sql<number | null>`case when ${hostelGatePasses.inAt} > ${hostelGatePasses.expectedBackAt} then (extract(epoch from (${hostelGatePasses.inAt} - ${hostelGatePasses.expectedBackAt})) / 60)::int end`, createdAt: hostelGatePasses.createdAt },
        joins: withStudent(hostelGatePasses.studentId),
        search: [...studentSearch, hostelGatePasses.destination, hostelGatePasses.reason],
        filters: {
          status: choiceFilter('Status', hostelGatePasses.status, PASS_STATUSES),
          overdue: yesNo('Late back', overdue, sql`not (${overdue})`, ['Out past the time', 'Not late']),
          when: { label: 'When', options: choices(['today', 'Today'], ['week', 'Last 7 days'], ['month', 'Last 30 days']), where: (v) => (v === 'today' ? sql`${hostelGatePasses.createdAt} > now() - interval '1 day'` : v === 'week' ? sql`${hostelGatePasses.createdAt} > now() - interval '7 days'` : v === 'month' ? sql`${hostelGatePasses.createdAt} > now() - interval '30 days'` : undefined) },
        },
        sorts: { asked: hostelGatePasses.createdAt, back: hostelGatePasses.expectedBackAt, out: hostelGatePasses.outAt, name: students.fullName },
        defaultSort: { id: 'asked', dir: 'desc' },
      },
      columns: [
        { key: 'rollNo', header: 'Roll no.' },
        { key: 'studentName', header: 'Student' },
        { key: 'destination', header: 'Going to' },
        { key: 'reason', header: 'Reason' },
        { key: 'expectedBackAt', header: 'Back by' },
        { key: 'status', header: 'Status' },
        { key: 'parentStatus', header: 'Family' },
        { key: 'outAt', header: 'Went out' },
        { key: 'inAt', header: 'Came back' },
        { key: 'lateMinutes', header: 'Minutes late' },
      ],
      actions: {
        approve: { label: 'Approve', apply: async (ctx, id) => void (await decidePass(ctx.tx, ctx.p, id, 'issued')) },
        reject: { label: 'Reject', tone: 'danger', apply: async (ctx, id) => void (await decidePass(ctx.tx, ctx.p, id, 'rejected')) },
        out: { label: 'Went out', apply: async (ctx, id) => void (await gateMove(ctx.tx, ctx.p, this.clock.now(), this.notifications, id, 'out')) },
        in: { label: 'Came back', apply: async (ctx, id) => void (await gateMove(ctx.tx, ctx.p, this.clock.now(), this.notifications, id, 'in')) },
        cancel: { label: 'Cancel', tone: 'danger', apply: async (ctx, id) => void (await this.move(ctx, hostelGatePasses, hostelGatePasses.id, hostelGatePasses.status, 'hostel_gate_pass', id, ['issued', 'approved', 'requested', 'parent_pending'], 'cancelled')) },
      },
    };
  }

  visitors(): RecordEntity {
    return {
      key: 'hostel-visitors',
      module: 'hostel',
      table: hostelVisitors,
      subjectType: 'hostel_visitor',
      roles: { read: HOSTEL_ROLES, write: HOSTEL_ROLES },
      label: (r) => `${r.visitorName} → ${r.studentName}`,
      list: {
        select: { id: hostelVisitors.id, ...studentCols, visitorName: hostelVisitors.visitorName, relation: hostelVisitors.relation, phone: hostelVisitors.phone, idProof: hostelVisitors.idProof, inAt: hostelVisitors.inAt, outAt: hostelVisitors.outAt },
        joins: withStudent(hostelVisitors.studentId),
        search: [...studentSearch, hostelVisitors.visitorName, hostelVisitors.phone],
        filters: { inside: yesNo('Inside now', isNull(hostelVisitors.outAt), sql`${hostelVisitors.outAt} is not null`, ['Inside now', 'Left']), when: { label: 'When', options: choices(['today', 'Today'], ['week', 'Last 7 days']), where: (v) => (v === 'today' ? sql`${hostelVisitors.inAt} > now() - interval '1 day'` : v === 'week' ? sql`${hostelVisitors.inAt} > now() - interval '7 days'` : undefined) } },
        sorts: { in: hostelVisitors.inAt, out: hostelVisitors.outAt, visitor: hostelVisitors.visitorName },
        defaultSort: { id: 'in', dir: 'desc' },
      },
      fields: {
        student: studentField('Visiting (roll no.)'),
        visitorName: { label: 'Visitor', type: 'text', schema: Text(120), column: hostelVisitors.visitorName, required: true },
        relation: { label: 'Relation', type: 'text', schema: z.string().trim().max(60), column: hostelVisitors.relation },
        phone: { label: 'Phone', type: 'phone', schema: z.string().trim().max(20), column: hostelVisitors.phone },
        idProof: { label: 'ID proof', type: 'text', schema: z.string().trim().max(60), column: hostelVisitors.idProof },
      },
      create: async (ctx, v) => {
        const s = await studentByRoll(ctx.tx, String(v.student));
        if (!(await residentOf(ctx.tx, s.id))) throw new BadRequestException('This student has no hostel bed');
        const [row] = await ctx.tx.insert(hostelVisitors).values({ tenantId: ctx.p.tenantId, studentId: s.id, visitorName: String(v.visitorName), relation: String(v.relation ?? ''), phone: String(v.phone ?? ''), idProof: String(v.idProof ?? ''), inAt: this.clock.now(), loggedBy: ctx.p.userId }).returning({ id: hostelVisitors.id });
        return row.id;
      },
      columns: [
        { key: 'inAt', header: 'In' },
        { key: 'outAt', header: 'Out' },
        { key: 'visitorName', header: 'Visitor' },
        { key: 'relation', header: 'Relation' },
        { key: 'phone', header: 'Phone' },
        { key: 'idProof', header: 'ID proof' },
        { key: 'studentName', header: 'Visiting' },
        { key: 'rollNo', header: 'Roll no.' },
      ],
      actions: {
        out: {
          label: 'Signed out',
          apply: async (ctx, id) => {
            const [v] = await ctx.tx.update(hostelVisitors).set({ outAt: this.clock.now() }).where(and(eq(hostelVisitors.id, id), isNull(hostelVisitors.outAt))).returning();
            if (!v) throw new ConflictException('Already signed out');
          },
        },
      },
    };
  }

  complaints(): RecordEntity {
    return {
      key: 'hostel-complaints',
      module: 'hostel',
      table: hostelComplaints,
      subjectType: 'hostel_complaint',
      roles: { read: HOSTEL_ROLES, write: HOSTEL_ROLES },
      label: (r) => `${r.category} · ${String(r.description).slice(0, 40)}`,
      list: {
        select: { id: hostelComplaints.id, studentId: hostelComplaints.studentId, studentName: students.fullName, rollNo: students.rollNo, roomId: hostelComplaints.roomId, room: sql<string | null>`(select hb.name || ' · ' || r.number from hostel_rooms r join hostel_blocks hb on hb.id = r.block_id where r.id = ${qual(hostelComplaints.roomId)})`, category: hostelComplaints.category, description: hostelComplaints.description, status: hostelComplaints.status, resolution: hostelComplaints.resolution, resolvedAt: hostelComplaints.resolvedAt, createdAt: hostelComplaints.createdAt, workOrders: sql<number>`(select count(*)::int from hostel_work_orders w where w.complaint_id = ${qual(hostelComplaints.id)})` },
        joins: (q) => q.leftJoin(students, eq(students.id, hostelComplaints.studentId)),
        search: [hostelComplaints.description, students.fullName, students.rollNo],
        filters: { category: choiceFilter('Category', hostelComplaints.category, COMPLAINT_CATS), status: choiceFilter('Status', hostelComplaints.status, COMPLAINT_STATUSES), room: { label: 'Room', options: roomOptions, where: (v) => uuidEq(hostelComplaints.roomId, v) } },
        sorts: { raised: hostelComplaints.createdAt, status: hostelComplaints.status, resolved: hostelComplaints.resolvedAt },
        defaultSort: { id: 'raised', dir: 'desc' },
      },
      fields: {
        student: { label: 'Student (roll no.)', type: 'text', schema: z.string().trim().max(40), edit: false, rowKey: 'rollNo', apply: async () => undefined },
        roomId: { label: 'Room', type: 'select', schema: OptionalRef, options: roomOptions, column: hostelComplaints.roomId },
        category: { label: 'Category', type: 'select', schema: oneOf(COMPLAINT_CATS), options: COMPLAINT_CATS, column: hostelComplaints.category, required: true, bulk: true },
        description: { label: 'Complaint', type: 'textarea', schema: Text(1000), column: hostelComplaints.description, required: true },
      },
      create: async (ctx, v) => {
        const s = v.student ? await studentByRoll(ctx.tx, String(v.student)) : null;
        if (!s && !v.roomId) throw new BadRequestException('Say which student or room this is about');
        const [c] = await ctx.tx.insert(hostelComplaints).values({ tenantId: ctx.p.tenantId, studentId: s?.id ?? null, roomId: (v.roomId as string | null) ?? null, category: String(v.category), description: String(v.description), raisedBy: ctx.p.userId }).returning({ id: hostelComplaints.id });
        return c.id;
      },
      columns: [
        { key: 'createdAt', header: 'Raised' },
        { key: 'category', header: 'Category' },
        { key: 'description', header: 'Complaint' },
        { key: 'room', header: 'Room' },
        { key: 'studentName', header: 'Student' },
        { key: 'status', header: 'Status' },
        { key: 'resolution', header: 'Resolution' },
        { key: 'resolvedAt', header: 'Resolved' },
      ],
      actions: {
        start: { label: 'Being worked on', apply: async (ctx, id) => void (await this.move(ctx, hostelComplaints, hostelComplaints.id, hostelComplaints.status, 'hostel_complaint', id, ['open'], 'in_progress')) },
        resolve: { label: 'Resolved', params: z.object({ resolution: z.string().trim().min(2, 'Say how it was resolved').max(500) }), apply: async (ctx, id, raw) => void (await this.move(ctx, hostelComplaints, hostelComplaints.id, hostelComplaints.status, 'hostel_complaint', id, ['open', 'in_progress'], 'resolved', { resolution: (raw as { resolution: string }).resolution, resolvedAt: this.clock.now() })) },
      },
    };
  }

  incidents(): RecordEntity {
    return {
      key: 'hostel-incidents',
      module: 'hostel',
      table: hostelIncidents,
      subjectType: 'hostel_incident',
      roles: { read: HOSTEL_ROLES, write: HOSTEL_ROLES },
      label: (r) => `${r.rollNo} ${r.studentName} · ${r.kind}`,
      list: {
        select: { id: hostelIncidents.id, ...studentCols, occurredOn: hostelIncidents.occurredOn, kind: hostelIncidents.kind, description: hostelIncidents.description, actionTaken: hostelIncidents.actionTaken, fineRupees: rupeesOf(hostelIncidents.finePaise), fineChargedTitle: hostelIncidents.fineChargedTitle, status: hostelIncidents.status, recordedByName: users.fullName },
        joins: (q) => withStudent(hostelIncidents.studentId)(q).leftJoin(users, eq(users.id, hostelIncidents.recordedBy)),
        search: [...studentSearch, hostelIncidents.description],
        filters: { kind: choiceFilter('Kind', hostelIncidents.kind, INCIDENT_KINDS), status: choiceFilter('Status', hostelIncidents.status, choices(['open', 'Open'], ['closed', 'Closed'])), fine: yesNo('Fine', sql`${hostelIncidents.finePaise} > 0`, sql`${hostelIncidents.finePaise} = 0`, ['Fined', 'No fine']) },
        sorts: { on: hostelIncidents.occurredOn, name: students.fullName, fine: hostelIncidents.finePaise },
        defaultSort: { id: 'on', dir: 'desc' },
      },
      fields: {
        student: studentField(),
        occurredOn: { label: 'On', type: 'date', schema: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-10-15'), column: hostelIncidents.occurredOn, required: true },
        kind: { label: 'Kind', type: 'select', schema: oneOf(INCIDENT_KINDS), options: INCIDENT_KINDS, column: hostelIncidents.kind, required: true },
        description: { label: 'What happened', type: 'textarea', schema: Text(1000), column: hostelIncidents.description, required: true },
        actionTaken: { label: 'Action taken', type: 'textarea', schema: z.string().trim().max(500), column: hostelIncidents.actionTaken },
        fine: { label: 'Fine (₹)', type: 'number', schema: Rupees, column: hostelIncidents.finePaise, rowKey: 'fineRupees' },
      },
      create: async (ctx, v) => {
        const s = await studentByRoll(ctx.tx, String(v.student));
        const [i] = await ctx.tx.insert(hostelIncidents).values({ tenantId: ctx.p.tenantId, studentId: s.id, occurredOn: String(v.occurredOn), kind: String(v.kind), description: String(v.description), actionTaken: String(v.actionTaken ?? ''), finePaise: Number(v.fine ?? 0), recordedBy: ctx.p.userId }).returning({ id: hostelIncidents.id });
        return i.id;
      },
      columns: [
        { key: 'occurredOn', header: 'On' },
        { key: 'rollNo', header: 'Roll no.' },
        { key: 'studentName', header: 'Student' },
        { key: 'kind', header: 'Kind' },
        { key: 'description', header: 'What happened' },
        { key: 'actionTaken', header: 'Action taken' },
        { key: 'fineRupees', header: 'Fine (₹)' },
        { key: 'fineChargedTitle', header: 'Charged as' },
        { key: 'status', header: 'Status' },
      ],
      actions: {
        chargeFine: {
          label: 'Charge the fine to fees',
          apply: async (ctx, id) => {
            const [i] = await ctx.tx.select().from(hostelIncidents).where(eq(hostelIncidents.id, id)).for('update');
            if (!(i.finePaise > 0)) throw new ConflictException('There is no fine');
            if (i.fineChargedTitle) throw new ConflictException('Already charged');
            const title = `Hostel fine (${i.occurredOn}, ${id.slice(0, 8)})`;
            await this.fees.chargeStudents(ctx.tx, ctx.p, title, await this.today(ctx), [{ studentId: i.studentId, amountPaise: i.finePaise }]);
            await ctx.tx.update(hostelIncidents).set({ fineChargedTitle: title }).where(eq(hostelIncidents.id, id));
            await auditUser(ctx.tx, ctx.p, 'hostel_incident.fine_charged', 'hostel_incident', id, { title, finePaise: i.finePaise });
            return title;
          },
        },
        close: { label: 'Close', apply: async (ctx, id) => void (await this.move(ctx, hostelIncidents, hostelIncidents.id, hostelIncidents.status, 'hostel_incident', id, ['open'], 'closed')) },
      },
    };
  }

  lateEntries(): RecordEntity {
    return {
      key: 'hostel-late-entries',
      module: 'hostel',
      table: hostelLateEntries,
      subjectType: 'hostel_late_entry',
      roles: { read: HOSTEL_ROLES, write: HOSTEL_ROLES },
      label: (r) => `${r.rollNo} ${r.studentName}`,
      list: {
        select: { id: hostelLateEntries.id, ...studentCols, enteredAt: hostelLateEntries.enteredAt, minutesLate: hostelLateEntries.minutesLate, reason: hostelLateEntries.reason, escalated: hostelLateEntries.escalated, recent: sql<number>`(select count(*)::int from hostel_late_entries x where x.student_id = ${qual(hostelLateEntries.studentId)} and x.entered_at > ${qual(hostelLateEntries.enteredAt)} - interval '30 days' and x.entered_at <= ${qual(hostelLateEntries.enteredAt)})` },
        joins: withStudent(hostelLateEntries.studentId),
        search: [...studentSearch, hostelLateEntries.reason],
        filters: { escalated: yesNo('Escalated', eq(hostelLateEntries.escalated, true), eq(hostelLateEntries.escalated, false)), when: { label: 'When', options: choices(['week', 'Last 7 days'], ['month', 'Last 30 days']), where: (v) => (v === 'week' ? sql`${hostelLateEntries.enteredAt} > now() - interval '7 days'` : v === 'month' ? sql`${hostelLateEntries.enteredAt} > now() - interval '30 days'` : undefined) } },
        sorts: { at: hostelLateEntries.enteredAt, minutes: hostelLateEntries.minutesLate, name: students.fullName },
        defaultSort: { id: 'at', dir: 'desc' },
      },
      fields: {
        student: studentField(),
        minutesLate: { label: 'Minutes late', type: 'number', schema: Int(0, 1440), column: hostelLateEntries.minutesLate, required: true },
        reason: { label: 'Reason given', type: 'text', schema: z.string().trim().max(300), column: hostelLateEntries.reason },
      },
      create: async (ctx, v) => {
        const s = await studentByRoll(ctx.tx, String(v.student));
        if (!(await residentOf(ctx.tx, s.id))) throw new BadRequestException('This student has no hostel bed');
        const now = this.clock.now();
        const [row] = await ctx.tx.insert(hostelLateEntries).values({ tenantId: ctx.p.tenantId, studentId: s.id, enteredAt: now, minutesLate: Number(v.minutesLate ?? 0), reason: String(v.reason ?? ''), recordedBy: ctx.p.userId }).returning();
        await this.escalate(ctx, s.id, s.fullName, row.id, now);
        return row.id;
      },
      columns: [
        { key: 'enteredAt', header: 'Came in' },
        { key: 'rollNo', header: 'Roll no.' },
        { key: 'studentName', header: 'Student' },
        { key: 'minutesLate', header: 'Minutes late' },
        { key: 'reason', header: 'Reason' },
        { key: 'recent', header: 'Late entries in 30 days' },
        { key: 'escalated', header: 'Escalated' },
      ],
    };
  }

  /** After the Nth late entry in the window, the family is told and the discipline register gets an entry (once per crossing). */
  async escalate(ctx: KitCtx, studentId: string, name: string, entryId: string, now: Date) {
    const rules = (await readSettings(ctx.tx, ctx.p.tenantId, 'hostel')).rules;
    const after = Number(rules.lateEntryEscalateAfter);
    const windowDays = Number(rules.lateEntryWindowDays);
    if (!(after > 0)) return;
    const since = new Date(now.getTime() - windowDays * 86_400_000).toISOString();
    const [{ n }] = await ctx.tx.select({ n: sql<number>`count(*)::int` }).from(hostelLateEntries).where(and(eq(hostelLateEntries.studentId, studentId), sql`${hostelLateEntries.enteredAt} > ${since}::timestamptz`));
    if (n < after || n % after !== 0) return;
    await ctx.tx.update(hostelLateEntries).set({ escalated: true }).where(eq(hostelLateEntries.id, entryId));
    await ctx.tx.insert(hostelIncidents).values({ tenantId: ctx.p.tenantId, studentId, occurredOn: await this.today(ctx), kind: 'late_entry', description: `${n} late entries in ${windowDays} days`, recordedBy: ctx.p.userId });
    const family = await familyUserIds(ctx.tx, studentId);
    await this.notifications.notifyUsers(ctx.tx, family, {
      kind: 'welfare',
      text: {
        en: { title: `${name}: late back to the hostel`, body: `${name} has come back after curfew ${n} times in ${windowDays} days.` },
        hi: { title: `${name}: छात्रावास देर से लौटे`, body: `${name} पिछले ${windowDays} दिनों में ${n} बार निर्धारित समय के बाद लौटे हैं।` },
        kn: { title: `${name}: ವಸತಿ ನಿಲಯಕ್ಕೆ ತಡವಾಗಿ ಬಂದಿದ್ದಾರೆ`, body: `${name} ಕಳೆದ ${windowDays} ದಿನಗಳಲ್ಲಿ ${n} ಬಾರಿ ನಿಗದಿತ ಸಮಯದ ನಂತರ ಬಂದಿದ್ದಾರೆ.` },
      },
      data: { studentId },
      dedupeKey: `hostel-late:${entryId}`,
    });
    await auditUser(ctx.tx, ctx.p, 'hostel_late_entry.escalated', 'hostel_late_entry', entryId, { count: n });
  }

  // ---- money -------------------------------------------------------------------------------------------------------------

  deposits(): RecordEntity {
    return {
      key: 'hostel-deposits',
      module: 'hostel',
      table: hostelDeposits,
      subjectType: 'hostel_deposit',
      roles: { read: HOSTEL_ROLES, write: [...HOSTEL_ROLES, 'accountant'] },
      label: (r) => `${r.rollNo} ${r.studentName}`,
      list: {
        select: { id: hostelDeposits.id, ...studentCols, amountRupees: rupeesOf(hostelDeposits.amountPaise), collectedOn: hostelDeposits.collectedOn, mode: hostelDeposits.mode, receiptNo: hostelDeposits.receiptNo, status: hostelDeposits.status, damagesRupees: rupeesOf(hostelDeposits.damagesPaise), refundedRupees: rupeesOf(hostelDeposits.refundedPaise), refundedOn: hostelDeposits.refundedOn, note: hostelDeposits.note },
        joins: withStudent(hostelDeposits.studentId),
        search: [...studentSearch, hostelDeposits.receiptNo],
        filters: { status: choiceFilter('Status', hostelDeposits.status, DEPOSIT_STATUSES), mode: choiceFilter('Paid by', hostelDeposits.mode, DEPOSIT_MODES) },
        sorts: { collected: hostelDeposits.collectedOn, amount: hostelDeposits.amountPaise, name: students.fullName },
        defaultSort: { id: 'collected', dir: 'desc' },
      },
      fields: {
        student: studentField(),
        amount: { label: 'Amount (₹)', type: 'number', schema: Rupees, column: hostelDeposits.amountPaise, rowKey: 'amountRupees', help: 'Empty takes the deposit set in hostel settings' },
        collectedOn: { label: 'Collected on', type: 'date', schema: DateText, column: hostelDeposits.collectedOn },
        mode: { label: 'Paid by', type: 'select', schema: oneOf(DEPOSIT_MODES), options: DEPOSIT_MODES, column: hostelDeposits.mode, required: true },
        receiptNo: { label: 'Receipt', type: 'text', schema: z.string().trim().max(60), column: hostelDeposits.receiptNo },
        note: { label: 'Note', type: 'text', schema: z.string().trim().max(300), column: hostelDeposits.note },
      },
      create: async (ctx, v) => {
        const s = await studentByRoll(ctx.tx, String(v.student));
        const amount = v.amount !== undefined ? Number(v.amount) : Number((await readSettings(ctx.tx, ctx.p.tenantId, 'hostel')).rules.cautionDepositPaise);
        if (!(amount > 0)) throw new BadRequestException('Give the deposit amount');
        const [held] = await ctx.tx.select({ id: hostelDeposits.id }).from(hostelDeposits).where(and(eq(hostelDeposits.studentId, s.id), eq(hostelDeposits.status, 'held')));
        if (held) throw new ConflictException('A deposit is already held for this student');
        const a = await residentOf(ctx.tx, s.id);
        const mode = String(v.mode ?? 'cash');
        const collectedOn = (v.collectedOn as string | null) ?? (await this.today(ctx));
        if (mode === 'fee_invoice') {
          const r = await this.fees.chargeStudents(ctx.tx, ctx.p, `Hostel caution deposit (${s.fullName.slice(0, 40)})`, collectedOn, [{ studentId: s.id, amountPaise: amount }]);
          if (!r.charged) throw new ConflictException('The deposit is already on the fee account');
        }
        const [d] = await ctx.tx.insert(hostelDeposits).values({ tenantId: ctx.p.tenantId, studentId: s.id, allotmentId: a?.id ?? null, amountPaise: amount, collectedOn, mode, receiptNo: String(v.receiptNo ?? ''), note: String(v.note ?? ''), createdBy: ctx.p.userId }).returning({ id: hostelDeposits.id });
        return d.id;
      },
      columns: [
        { key: 'rollNo', header: 'Roll no.' },
        { key: 'studentName', header: 'Student' },
        { key: 'amountRupees', header: 'Deposit (₹)' },
        { key: 'collectedOn', header: 'Collected' },
        { key: 'mode', header: 'Paid by' },
        { key: 'receiptNo', header: 'Receipt' },
        { key: 'status', header: 'Status' },
        { key: 'damagesRupees', header: 'Damages (₹)' },
        { key: 'refundedRupees', header: 'Refunded (₹)' },
        { key: 'refundedOn', header: 'Refunded on' },
      ],
      actions: {
        refund: {
          label: 'Refund',
          params: z.object({ damages: Rupees.default(0), note: z.string().trim().max(300).default('') }).default({ damages: 0, note: '' }),
          apply: async (ctx, id, raw) => {
            const p = raw as { damages: number; note: string };
            const [d] = await ctx.tx.select().from(hostelDeposits).where(eq(hostelDeposits.id, id)).for('update');
            if (d.status !== 'held') throw new ConflictException(`This deposit is ${d.status}`);
            if (await residentOf(ctx.tx, d.studentId)) throw new ConflictException('The student still has a bed; vacate first');
            if (p.damages > d.amountPaise) throw new BadRequestException('Damages are more than the deposit');
            await ctx.tx.update(hostelDeposits).set({ status: 'refunded', damagesPaise: p.damages, refundedPaise: d.amountPaise - p.damages, refundedOn: await this.today(ctx), note: p.note || d.note }).where(eq(hostelDeposits.id, id));
            await auditUser(ctx.tx, ctx.p, 'hostel_deposit.refunded', 'hostel_deposit', id, { refundedPaise: d.amountPaise - p.damages, damagesPaise: p.damages, changes: { status: { before: 'held', after: 'refunded' } } });
            return `₹${((d.amountPaise - p.damages) / 100).toFixed(2)}`;
          },
        },
        forfeit: { label: 'Forfeit', tone: 'danger', params: z.object({ note: z.string().trim().min(3, 'Say why').max(300) }), apply: async (ctx, id, raw) => void (await this.move(ctx, hostelDeposits, hostelDeposits.id, hostelDeposits.status, 'hostel_deposit', id, ['held'], 'forfeited', { note: (raw as { note: string }).note })) },
      },
    };
  }

  settlements(): RecordEntity {
    return {
      key: 'hostel-settlements',
      module: 'hostel',
      table: hostelSettlements,
      subjectType: 'hostel_settlement',
      roles: { read: [...HOSTEL_ROLES, 'accountant'], write: [...HOSTEL_ROLES, 'accountant'] },
      label: (r) => `${r.rollNo} ${r.studentName} · ${r.vacatedOn}`,
      list: {
        select: { id: hostelSettlements.id, ...studentCols, vacatedOn: hostelSettlements.vacatedOn, feeRupees: rupeesOf(hostelSettlements.monthlyFeePaise), daysUsed: hostelSettlements.daysUsed, daysInMonth: hostelSettlements.daysInMonth, prorataRupees: rupeesOf(hostelSettlements.prorataRefundPaise), depositRupees: rupeesOf(hostelSettlements.depositPaise), damagesRupees: rupeesOf(hostelSettlements.damagesPaise), duesRupees: rupeesOf(hostelSettlements.duesPaise), netRupees: rupeesOf(hostelSettlements.netRefundPaise), status: hostelSettlements.status, paidOn: hostelSettlements.paidOn, reference: hostelSettlements.reference },
        joins: withStudent(hostelSettlements.studentId),
        search: [...studentSearch, hostelSettlements.reference],
        filters: { status: choiceFilter('Status', hostelSettlements.status, choices(['pending', 'To pay'], ['paid', 'Paid'])) },
        sorts: { vacated: hostelSettlements.vacatedOn, net: hostelSettlements.netRefundPaise, name: students.fullName },
        defaultSort: { id: 'vacated', dir: 'desc' },
      },
      columns: [
        { key: 'rollNo', header: 'Roll no.' },
        { key: 'studentName', header: 'Student' },
        { key: 'vacatedOn', header: 'Vacated' },
        { key: 'feeRupees', header: 'Room fee (₹)' },
        { key: 'daysUsed', header: 'Days used' },
        { key: 'prorataRupees', header: 'Unused fee (₹)' },
        { key: 'depositRupees', header: 'Deposit (₹)' },
        { key: 'damagesRupees', header: 'Damages (₹)' },
        { key: 'duesRupees', header: 'Dues (₹)' },
        { key: 'netRupees', header: 'Net refund (₹)' },
        { key: 'status', header: 'Status' },
        { key: 'paidOn', header: 'Paid on' },
        { key: 'reference', header: 'Reference' },
      ],
      actions: {
        paid: {
          label: 'Refund paid',
          params: z.object({ reference: z.string().trim().max(80).default('') }).default({ reference: '' }),
          apply: async (ctx, id, raw) => {
            const s = await this.move<typeof hostelSettlements.$inferSelect>(ctx, hostelSettlements, hostelSettlements.id, hostelSettlements.status, 'hostel_settlement', id, ['pending'], 'paid', { paidOn: await this.today(ctx), reference: (raw as { reference: string }).reference });
            // The held deposit was part of this refund.
            await ctx.tx.update(hostelDeposits).set({ status: 'refunded', damagesPaise: s.damagesPaise, refundedPaise: sql`greatest(0, ${hostelDeposits.amountPaise} - ${s.damagesPaise})`, refundedOn: await this.today(ctx) }).where(and(eq(hostelDeposits.studentId, s.studentId), eq(hostelDeposits.status, 'held')));
          },
        },
      },
    };
  }

  // ---- people -------------------------------------------------------------------------------------------------------------

  staff(): RecordEntity {
    return {
      key: 'hostel-staff',
      module: 'hostel',
      table: hostelStaff,
      subjectType: 'hostel_staff',
      roles: { read: HOSTEL_ROLES, write: HOSTEL_ROLES },
      label: (r) => `${r.name} · ${r.hostelName}`,
      list: {
        select: { id: hostelStaff.id, hostelId: hostelStaff.hostelId, hostelName: hostels.name, userId: hostelStaff.userId, name: users.fullName, role: hostelStaff.role, fromOn: hostelStaff.fromOn, untilOn: hostelStaff.untilOn, phone: hostelStaff.phone, current: sql<boolean>`${hostelStaff.untilOn} is null or ${hostelStaff.untilOn} >= current_date` },
        joins: (q) => q.innerJoin(hostels, eq(hostels.id, hostelStaff.hostelId)).innerJoin(users, eq(users.id, hostelStaff.userId)),
        search: [users.fullName, hostels.name],
        filters: { hostel: { label: 'Hostel', options: hostelOptions, where: (v) => uuidEq(hostelStaff.hostelId, v) }, role: choiceFilter('Role', hostelStaff.role, STAFF_ROLES), current: yesNo('Current', sql`(${hostelStaff.untilOn} is null or ${hostelStaff.untilOn} >= current_date)`, sql`${hostelStaff.untilOn} < current_date`, ['Serving now', 'Past']) },
        sorts: { name: users.fullName, hostel: hostels.name, from: hostelStaff.fromOn },
        defaultSort: { id: 'hostel', dir: 'asc' },
        tiebreak: [users.fullName],
      },
      fields: {
        hostelId: { label: 'Hostel', type: 'select', schema: z.uuid(), options: hostelOptions, column: hostelStaff.hostelId, required: true },
        userId: { label: 'Person', type: 'select', schema: z.uuid(), options: (ctx) => staffOptions(ctx), column: hostelStaff.userId, required: true, edit: false },
        role: { label: 'Role', type: 'select', schema: oneOf(STAFF_ROLES), options: STAFF_ROLES, column: hostelStaff.role, required: true, bulk: true },
        fromOn: { label: 'From', type: 'date', schema: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-10-15'), column: hostelStaff.fromOn, required: true },
        untilOn: { label: 'Until', type: 'date', schema: DateText, column: hostelStaff.untilOn, bulk: true },
        phone: { label: 'Duty phone', type: 'phone', schema: z.string().trim().max(20), column: hostelStaff.phone },
      },
      move: { label: 'Move to hostel', options: hostelOptions, column: hostelStaff.hostelId },
      columns: [
        { key: 'name', header: 'Name' },
        { key: 'role', header: 'Role' },
        { key: 'hostelName', header: 'Hostel' },
        { key: 'fromOn', header: 'From' },
        { key: 'untilOn', header: 'Until' },
        { key: 'phone', header: 'Duty phone' },
      ],
    };
  }

  duties(): RecordEntity {
    return {
      key: 'hostel-duties',
      module: 'hostel',
      table: hostelDuties,
      subjectType: 'hostel_duty',
      roles: { read: HOSTEL_ROLES, write: HOSTEL_ROLES },
      label: (r) => `${r.dutyOn} ${r.shift} · ${r.name}`,
      list: {
        select: { id: hostelDuties.id, hostelId: hostelDuties.hostelId, hostelName: hostels.name, userId: hostelDuties.userId, name: users.fullName, dutyOn: hostelDuties.dutyOn, shift: hostelDuties.shift, status: hostelDuties.status, note: hostelDuties.note },
        joins: (q) => q.innerJoin(hostels, eq(hostels.id, hostelDuties.hostelId)).innerJoin(users, eq(users.id, hostelDuties.userId)),
        search: [users.fullName, hostels.name],
        filters: {
          hostel: { label: 'Hostel', options: hostelOptions, where: (v) => uuidEq(hostelDuties.hostelId, v) },
          shift: choiceFilter('Shift', hostelDuties.shift, SHIFTS),
          status: choiceFilter('Status', hostelDuties.status, DUTY_STATUSES),
          when: { label: 'When', options: choices(['upcoming', 'Today and later'], ['past', 'Past']), where: (v) => (v === 'upcoming' ? sql`${hostelDuties.dutyOn} >= current_date` : v === 'past' ? sql`${hostelDuties.dutyOn} < current_date` : undefined) },
        },
        sorts: { day: hostelDuties.dutyOn, name: users.fullName, hostel: hostels.name },
        defaultSort: { id: 'day', dir: 'asc' },
        tiebreak: [hostelDuties.shift],
      },
      fields: {
        hostelId: { label: 'Hostel', type: 'select', schema: z.uuid(), options: hostelOptions, column: hostelDuties.hostelId, required: true },
        userId: { label: 'Person', type: 'select', schema: z.uuid(), options: (ctx) => staffOptions(ctx), column: hostelDuties.userId, required: true },
        dutyOn: { label: 'Day', type: 'date', schema: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-10-15'), column: hostelDuties.dutyOn, required: true },
        shift: { label: 'Shift', type: 'select', schema: oneOf(SHIFTS), options: SHIFTS, column: hostelDuties.shift, required: true, bulk: true },
        note: { label: 'Note', type: 'text', schema: z.string().trim().max(200), column: hostelDuties.note },
      },
      columns: [
        { key: 'dutyOn', header: 'Day' },
        { key: 'shift', header: 'Shift' },
        { key: 'name', header: 'On duty' },
        { key: 'hostelName', header: 'Hostel' },
        { key: 'status', header: 'Status' },
        { key: 'note', header: 'Note' },
      ],
      actions: {
        done: { label: 'Done', apply: async (ctx, id) => void (await this.move(ctx, hostelDuties, hostelDuties.id, hostelDuties.status, 'hostel_duty', id, ['scheduled', 'missed'], 'done')) },
        missed: { label: 'Missed', tone: 'danger', apply: async (ctx, id) => void (await this.move(ctx, hostelDuties, hostelDuties.id, hostelDuties.status, 'hostel_duty', id, ['scheduled', 'done'], 'missed')) },
      },
    };
  }

  sickbay(): RecordEntity {
    return {
      key: 'hostel-sickbay',
      module: 'hostel',
      table: hostelSickbay,
      subjectType: 'hostel_sickbay',
      roles: { read: HOSTEL_ROLES, write: HOSTEL_ROLES },
      label: (r) => `${r.rollNo} ${r.studentName}`,
      list: {
        select: { id: hostelSickbay.id, ...studentCols, admittedAt: hostelSickbay.admittedAt, dischargedAt: hostelSickbay.dischargedAt, symptoms: hostelSickbay.symptoms, treatment: hostelSickbay.treatment, referredTo: hostelSickbay.referredTo, parentAlerted: hostelSickbay.parentAlerted, healthVisitId: hostelSickbay.healthVisitId },
        joins: withStudent(hostelSickbay.studentId),
        search: [...studentSearch, hostelSickbay.symptoms],
        filters: { inside: yesNo('In the sick bay', isNull(hostelSickbay.dischargedAt), sql`${hostelSickbay.dischargedAt} is not null`, ['In the sick bay now', 'Discharged']) },
        sorts: { admitted: hostelSickbay.admittedAt, discharged: hostelSickbay.dischargedAt, name: students.fullName },
        defaultSort: { id: 'admitted', dir: 'desc' },
      },
      fields: {
        student: studentField(),
        symptoms: { label: 'Symptoms', type: 'textarea', schema: Text(500), column: hostelSickbay.symptoms, required: true },
        treatment: { label: 'Treatment', type: 'textarea', schema: z.string().trim().max(500), column: hostelSickbay.treatment },
        referredTo: { label: 'Referred to', type: 'text', schema: z.string().trim().max(160), column: hostelSickbay.referredTo, help: 'A doctor or hospital, if referred' },
      },
      create: async (ctx, v) => {
        const s = await studentByRoll(ctx.tx, String(v.student));
        const now = this.clock.now();
        // The visit goes on the student's health record too.
        const [visit] = await ctx.tx.insert(healthVisits).values({ tenantId: ctx.p.tenantId, studentId: s.id, visitedAt: now, complaint: String(v.symptoms), action: [String(v.treatment ?? ''), v.referredTo ? `Referred to ${v.referredTo}` : ''].filter(Boolean).join('. '), sentHome: false, recordedBy: ctx.p.userId }).returning({ id: healthVisits.id });
        const family = await familyUserIds(ctx.tx, s.id);
        const [row] = await ctx.tx.insert(hostelSickbay).values({ tenantId: ctx.p.tenantId, studentId: s.id, healthVisitId: visit.id, admittedAt: now, symptoms: String(v.symptoms), treatment: String(v.treatment ?? ''), referredTo: String(v.referredTo ?? ''), parentAlerted: family.length > 0, recordedBy: ctx.p.userId }).returning({ id: hostelSickbay.id });
        await this.notifications.notifyUsers(ctx.tx, family, {
          kind: 'welfare',
          text: {
            en: { title: `${s.fullName} is in the hostel sick bay`, body: `${s.fullName} was admitted to the sick bay: ${String(v.symptoms).slice(0, 120)}. The warden will keep you informed.` },
            hi: { title: `${s.fullName} छात्रावास के चिकित्सा कक्ष में हैं`, body: `${s.fullName} को चिकित्सा कक्ष में भर्ती किया गया है: ${String(v.symptoms).slice(0, 120)}। वार्डन आपको जानकारी देते रहेंगे।` },
            kn: { title: `${s.fullName} ವಸತಿ ನಿಲಯದ ಆರೋಗ್ಯ ಕೊಠಡಿಯಲ್ಲಿದ್ದಾರೆ`, body: `${s.fullName} ಅವರನ್ನು ಆರೋಗ್ಯ ಕೊಠಡಿಗೆ ದಾಖಲಿಸಲಾಗಿದೆ: ${String(v.symptoms).slice(0, 120)}. ವಾರ್ಡನ್ ನಿಮಗೆ ಮಾಹಿತಿ ನೀಡುತ್ತಾರೆ.` },
          },
          data: { studentId: s.id },
          dedupeKey: `hostel-sickbay:${row.id}`,
        });
        return row.id;
      },
      columns: [
        { key: 'admittedAt', header: 'Admitted' },
        { key: 'dischargedAt', header: 'Discharged' },
        { key: 'rollNo', header: 'Roll no.' },
        { key: 'studentName', header: 'Student' },
        { key: 'symptoms', header: 'Symptoms' },
        { key: 'treatment', header: 'Treatment' },
        { key: 'referredTo', header: 'Referred to' },
        { key: 'parentAlerted', header: 'Family told' },
      ],
      actions: {
        discharge: {
          label: 'Discharge',
          params: z.object({ note: z.string().trim().max(300).default('') }).default({ note: '' }),
          apply: async (ctx, id, raw) => {
            const [r] = await ctx.tx.update(hostelSickbay).set({ dischargedAt: this.clock.now(), ...((raw as { note: string }).note && { treatment: sql`${hostelSickbay.treatment} || ${'\n' + (raw as { note: string }).note}` }) }).where(and(eq(hostelSickbay.id, id), isNull(hostelSickbay.dischargedAt))).returning();
            if (!r) throw new ConflictException('Already discharged');
            await auditUser(ctx.tx, ctx.p, 'hostel_sickbay.discharged', 'hostel_sickbay', id);
          },
        },
      },
    };
  }

  roomAssets(): RecordEntity {
    const assetOpts = async (ctx: KitCtx) => (await ctx.tx.select({ id: assets.id, tag: assets.tag, name: assets.name }).from(assets).where(eq(assets.status, 'active')).orderBy(asc(assets.tag)).limit(2000)).map((a) => ({ value: a.id, label: `${a.tag} ${a.name}` }));
    const itemOpts = async (ctx: KitCtx) => (await ctx.tx.select({ id: invItems.id, sku: invItems.sku, name: invItems.name }).from(invItems).where(eq(invItems.active, true)).orderBy(asc(invItems.name)).limit(2000)).map((a) => ({ value: a.id, label: `${a.name} (${a.sku})` }));
    return {
      key: 'hostel-room-assets',
      module: 'hostel',
      table: hostelRoomAssets,
      subjectType: 'hostel_room_asset',
      roles: { read: HOSTEL_ROLES, write: HOSTEL_ROLES },
      label: (r) => `${r.room} · ${r.name}`,
      list: {
        select: { id: hostelRoomAssets.id, roomId: hostelRoomAssets.roomId, room: sql<string>`${hostelBlocks.name} || ' · ' || ${hostelRooms.number}`, name: hostelRoomAssets.name, assetId: hostelRoomAssets.assetId, assetTag: assets.tag, invItemId: hostelRoomAssets.invItemId, itemName: invItems.name, quantity: hostelRoomAssets.quantity, condition: hostelRoomAssets.condition, checkedOn: hostelRoomAssets.checkedOn, note: hostelRoomAssets.note },
        joins: (q) => q.innerJoin(hostelRooms, eq(hostelRooms.id, hostelRoomAssets.roomId)).innerJoin(hostelBlocks, eq(hostelBlocks.id, hostelRooms.blockId)).leftJoin(assets, eq(assets.id, hostelRoomAssets.assetId)).leftJoin(invItems, eq(invItems.id, hostelRoomAssets.invItemId)),
        search: [hostelRoomAssets.name, hostelRooms.number, assets.tag],
        filters: { room: { label: 'Room', options: roomOptions, where: (v) => uuidEq(hostelRoomAssets.roomId, v) }, condition: choiceFilter('Condition', hostelRoomAssets.condition, CONDITIONS), block: { label: 'Block', options: blockOptions, where: (v) => uuidEq(hostelRooms.blockId, v) } },
        sorts: { room: sql`${hostelBlocks.name}, ${hostelRooms.number}`, name: hostelRoomAssets.name, checked: hostelRoomAssets.checkedOn },
        defaultSort: { id: 'room', dir: 'asc' },
      },
      fields: {
        roomId: { label: 'Room', type: 'select', schema: z.uuid(), options: roomOptions, column: hostelRoomAssets.roomId, required: true },
        name: { label: 'Item', type: 'text', schema: Text(120), column: hostelRoomAssets.name, required: true, help: 'Cot, mattress, table, chair, fan…' },
        assetId: { label: 'Asset register entry', type: 'select', schema: OptionalRef, options: assetOpts, column: hostelRoomAssets.assetId },
        invItemId: { label: 'Store item', type: 'select', schema: OptionalRef, options: itemOpts, column: hostelRoomAssets.invItemId },
        quantity: { label: 'Quantity', type: 'number', schema: Int(1, 500), column: hostelRoomAssets.quantity, required: true },
        condition: { label: 'Condition', type: 'select', schema: oneOf(CONDITIONS), options: CONDITIONS, column: hostelRoomAssets.condition, required: true, bulk: true },
        checkedOn: { label: 'Checked on', type: 'date', schema: DateText, column: hostelRoomAssets.checkedOn, bulk: true },
        note: { label: 'Note', type: 'text', schema: z.string().trim().max(300), column: hostelRoomAssets.note },
      },
      move: { label: 'Move to room', options: roomOptions, column: hostelRoomAssets.roomId },
      duplicate: () => ({}),
      columns: [
        { key: 'room', header: 'Room' },
        { key: 'name', header: 'Item' },
        { key: 'quantity', header: 'Quantity' },
        { key: 'condition', header: 'Condition' },
        { key: 'assetTag', header: 'Asset tag' },
        { key: 'itemName', header: 'Store item' },
        { key: 'checkedOn', header: 'Checked on' },
        { key: 'note', header: 'Note' },
      ],
    };
  }

  // ---- mess -----------------------------------------------------------------------------------------------------------------

  messPlans(): RecordEntity {
    const subscribers = sql<number>`(select count(*)::int from mess_subscriptions s where s.plan_id = ${qual(messPlans.id)} and s.ended_on is null)`;
    return {
      key: 'mess-plans',
      module: 'hostel',
      table: messPlans,
      subjectType: 'mess_plan',
      roles: { read: HOSTEL_ROLES, write: HOSTEL_ROLES },
      label: (r) => String(r.name),
      list: {
        select: { id: messPlans.id, name: messPlans.name, feeRupees: rupeesOf(messPlans.monthlyFeePaise), meals: sql<string>`(select string_agg(m, ', ') from jsonb_array_elements_text(${qual(messPlans.meals)}) m)`, active: messPlans.active, billing: messPlans.billing, perDayRupees: rupeesOf(messPlans.perDayPaise), rebateMinDays: messPlans.rebateMinDays, rebateRupees: rupeesOf(messPlans.rebatePerDayPaise), subscribers },
        search: [messPlans.name],
        filters: { active: yesNo('Offered', eq(messPlans.active, true), eq(messPlans.active, false)), billing: choiceFilter('Billing', messPlans.billing, BILLING) },
        sorts: { name: messPlans.name, fee: messPlans.monthlyFeePaise, subscribers },
        defaultSort: { id: 'name', dir: 'asc' },
      },
      fields: {
        name: { label: 'Name', type: 'text', schema: Text(60), column: messPlans.name, required: true },
        meals: {
          label: 'Meals',
          type: 'text',
          schema: z.string().trim().refine((v) => v.split(',').map((m) => m.trim().toLowerCase()).filter(Boolean).every((m) => MEALS.includes(m)), 'Use breakfast, lunch, snacks and dinner, separated by commas'),
          required: true,
          apply: async (ctx, id, value) => void (await ctx.tx.update(messPlans).set({ meals: String(value).split(',').map((m) => m.trim().toLowerCase()).filter(Boolean) }).where(eq(messPlans.id, id))),
          help: 'For example: breakfast, lunch, dinner',
        },
        billing: { label: 'Billing', type: 'select', schema: oneOf(BILLING), options: BILLING, column: messPlans.billing, required: true },
        fee: { label: 'Fee a month (₹)', type: 'number', schema: Rupees, column: messPlans.monthlyFeePaise, rowKey: 'feeRupees', required: true },
        perDay: { label: 'Rate a day (₹)', type: 'number', schema: Rupees, column: messPlans.perDayPaise, rowKey: 'perDayRupees', help: 'For per-day billing' },
        rebateMinDays: { label: 'Rebate after (days of leave)', type: 'number', schema: Int(1, 60), column: messPlans.rebateMinDays },
        rebate: { label: 'Rebate a day (₹)', type: 'number', schema: Rupees, column: messPlans.rebatePerDayPaise, rowKey: 'rebateRupees', help: 'Empty or 0 gives back the day’s share of the fee' },
        active: { label: 'Offered', type: 'boolean', schema: Bool, column: messPlans.active, create: false, bulk: true },
      },
      create: async (ctx, v) => (await ctx.tx.insert(messPlans).values({ tenantId: ctx.p.tenantId, name: String(v.name), monthlyFeePaise: Number(v.fee ?? 0), meals: String(v.meals ?? '').split(',').map((m) => m.trim().toLowerCase()).filter(Boolean), billing: String(v.billing ?? 'fixed'), perDayPaise: Number(v.perDay ?? 0), rebateMinDays: Number(v.rebateMinDays ?? 3), rebatePerDayPaise: Number(v.rebate ?? 0) }).returning({ id: messPlans.id }))[0].id,
      duplicate: async (ctx, row) => ({ name: await copyName(ctx.tx, messPlans, messPlans.name, String(row.name)) }),
      columns: [
        { key: 'name', header: 'Plan' },
        { key: 'meals', header: 'Meals' },
        { key: 'billing', header: 'Billing' },
        { key: 'feeRupees', header: 'Fee a month (₹)' },
        { key: 'perDayRupees', header: 'Rate a day (₹)' },
        { key: 'rebateMinDays', header: 'Rebate after (days)' },
        { key: 'rebateRupees', header: 'Rebate a day (₹)' },
        { key: 'subscribers', header: 'On the plan' },
      ],
    };
  }

  messSubscriptions(): RecordEntity {
    return {
      key: 'mess-subscriptions',
      module: 'hostel',
      table: messSubscriptions,
      subjectType: 'mess_subscription',
      roles: { read: HOSTEL_ROLES, write: HOSTEL_ROLES },
      label: studentLabel,
      list: {
        select: { id: messSubscriptions.id, ...studentCols, planId: messSubscriptions.planId, planName: messPlans.name, startsOn: messSubscriptions.startsOn, endedOn: messSubscriptions.endedOn },
        joins: (q) => withStudent(messSubscriptions.studentId)(q).innerJoin(messPlans, eq(messPlans.id, messSubscriptions.planId)),
        search: studentSearch,
        filters: { plan: { label: 'Plan', options: planOptions, where: (v) => uuidEq(messSubscriptions.planId, v) }, current: yesNo('Current', isNull(messSubscriptions.endedOn), sql`${messSubscriptions.endedOn} is not null`, ['On the plan', 'Ended']) },
        sorts: { name: students.fullName, plan: messPlans.name, from: messSubscriptions.startsOn },
        defaultSort: { id: 'name', dir: 'asc' },
      },
      fields: {
        student: studentField(),
        planId: { label: 'Plan', type: 'select', schema: z.uuid(), options: planOptions, column: messSubscriptions.planId, required: true, edit: false },
        startsOn: { label: 'From', type: 'date', schema: DateText, column: messSubscriptions.startsOn, edit: false },
      },
      create: async (ctx, v) => {
        const s = await studentByRoll(ctx.tx, String(v.student));
        if (!(await residentOf(ctx.tx, s.id))) throw new BadRequestException('This student has no hostel bed');
        const today = await this.today(ctx);
        const from = (v.startsOn as string | null) ?? today;
        await ctx.tx.update(messSubscriptions).set({ endedOn: from }).where(and(eq(messSubscriptions.studentId, s.id), isNull(messSubscriptions.endedOn)));
        const [row] = await ctx.tx.insert(messSubscriptions).values({ tenantId: ctx.p.tenantId, studentId: s.id, planId: String(v.planId), startsOn: from }).returning({ id: messSubscriptions.id });
        return row.id;
      },
      move: {
        label: 'Change plan',
        options: planOptions,
        apply: async (ctx, id, to) => {
          const [s] = await ctx.tx.select().from(messSubscriptions).where(eq(messSubscriptions.id, id));
          if (s.endedOn) throw new ConflictException('This subscription has ended');
          if (s.planId === to) throw new BadRequestException('Already on this plan');
          const today = await this.today(ctx);
          await ctx.tx.update(messSubscriptions).set({ endedOn: today }).where(eq(messSubscriptions.id, id));
          await ctx.tx.insert(messSubscriptions).values({ tenantId: ctx.p.tenantId, studentId: s.studentId, planId: to, startsOn: today });
          await auditUser(ctx.tx, ctx.p, 'mess_subscription.moved', 'mess_subscription', id, { changes: { planId: { before: s.planId, after: to } } });
        },
      },
      columns: [
        { key: 'rollNo', header: 'Roll no.' },
        { key: 'studentName', header: 'Student' },
        { key: 'planName', header: 'Plan' },
        { key: 'startsOn', header: 'From' },
        { key: 'endedOn', header: 'Ended' },
      ],
      actions: {
        end: {
          label: 'End',
          apply: async (ctx, id) => {
            const [s] = await ctx.tx.update(messSubscriptions).set({ endedOn: await this.today(ctx) }).where(and(eq(messSubscriptions.id, id), isNull(messSubscriptions.endedOn))).returning();
            if (!s) throw new ConflictException('Already ended');
          },
        },
      },
    };
  }

  messLeaves(): RecordEntity {
    const length = sql<number>`(${messLeaves.toOn} - ${messLeaves.fromOn} + 1)`;
    return {
      key: 'mess-leaves',
      module: 'hostel',
      table: messLeaves,
      subjectType: 'mess_leave',
      roles: { read: HOSTEL_ROLES, write: HOSTEL_ROLES },
      label: (r) => `${r.rollNo} ${r.studentName} · ${r.fromOn}`,
      list: {
        select: { id: messLeaves.id, ...studentCols, fromOn: messLeaves.fromOn, toOn: messLeaves.toOn, days: length, reason: messLeaves.reason, status: messLeaves.status, decidedByName: decider.fullName },
        joins: (q) => withStudent(messLeaves.studentId)(q).leftJoin(decider, eq(decider.id, messLeaves.decidedBy)),
        search: [...studentSearch, messLeaves.reason],
        filters: { status: choiceFilter('Status', messLeaves.status, choices(['pending', 'Pending'], ['approved', 'Approved'], ['rejected', 'Rejected'])), month: { label: 'Month', where: (v) => (/^\d{4}-\d{2}$/.test(v) ? sql`to_char(${messLeaves.fromOn}, 'YYYY-MM') <= ${v} and to_char(${messLeaves.toOn}, 'YYYY-MM') >= ${v}` : undefined) } },
        sorts: { from: messLeaves.fromOn, days: length, name: students.fullName },
        defaultSort: { id: 'from', dir: 'desc' },
      },
      fields: {
        student: studentField(),
        fromOn: { label: 'From', type: 'date', schema: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-10-15'), column: messLeaves.fromOn, required: true },
        toOn: { label: 'To', type: 'date', schema: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-10-15'), column: messLeaves.toOn, required: true },
        reason: { label: 'Reason', type: 'text', schema: z.string().trim().max(300), column: messLeaves.reason },
      },
      create: async (ctx, v) => {
        if (String(v.toOn) < String(v.fromOn)) throw new BadRequestException('The end is before the start');
        const s = await studentByRoll(ctx.tx, String(v.student));
        const [row] = await ctx.tx.insert(messLeaves).values({ tenantId: ctx.p.tenantId, studentId: s.id, fromOn: String(v.fromOn), toOn: String(v.toOn), reason: String(v.reason ?? ''), createdBy: ctx.p.userId }).returning({ id: messLeaves.id });
        return row.id;
      },
      columns: [
        { key: 'rollNo', header: 'Roll no.' },
        { key: 'studentName', header: 'Student' },
        { key: 'fromOn', header: 'From' },
        { key: 'toOn', header: 'To' },
        { key: 'days', header: 'Days' },
        { key: 'reason', header: 'Reason' },
        { key: 'status', header: 'Status' },
      ],
      actions: {
        approve: { label: 'Approve', apply: async (ctx, id) => void (await this.move(ctx, messLeaves, messLeaves.id, messLeaves.status, 'mess_leave', id, ['pending', 'rejected'], 'approved', { decidedBy: ctx.p.userId, decidedAt: this.clock.now() })) },
        reject: { label: 'Reject', tone: 'danger', apply: async (ctx, id) => void (await this.move(ctx, messLeaves, messLeaves.id, messLeaves.status, 'mess_leave', id, ['pending', 'approved'], 'rejected', { decidedBy: ctx.p.userId, decidedAt: this.clock.now() })) },
      },
    };
  }

  messBills(): RecordEntity {
    return {
      key: 'mess-bills',
      module: 'hostel',
      table: messBills,
      subjectType: 'mess_bill',
      roles: { read: [...HOSTEL_ROLES, 'accountant'], write: HOSTEL_ROLES },
      label: (r) => `${r.rollNo} ${r.studentName} · ${r.month}`,
      list: {
        select: { id: messBills.id, ...studentCols, month: messBills.month, planName: messPlans.name, days: messBills.days, leaveDays: messBills.leaveDays, rebateDays: messBills.rebateDays, grossRupees: rupeesOf(messBills.grossPaise), rebateRupees: rupeesOf(messBills.rebatePaise), netRupees: rupeesOf(messBills.netPaise), status: messBills.status, chargedTitle: messBills.chargedTitle },
        joins: (q) => withStudent(messBills.studentId)(q).leftJoin(messPlans, eq(messPlans.id, messBills.planId)),
        search: studentSearch,
        filters: { month: { label: 'Month', where: (v) => (/^\d{4}-\d{2}$/.test(v) ? eq(messBills.month, v) : undefined) }, status: choiceFilter('Status', messBills.status, choices(['draft', 'Not charged'], ['charged', 'Charged'])), plan: { label: 'Plan', options: planOptions, where: (v) => uuidEq(messBills.planId, v) } },
        sorts: { month: messBills.month, name: students.fullName, net: messBills.netPaise },
        defaultSort: { id: 'month', dir: 'desc' },
        tiebreak: [students.fullName],
      },
      columns: [
        { key: 'month', header: 'Month' },
        { key: 'rollNo', header: 'Roll no.' },
        { key: 'studentName', header: 'Student' },
        { key: 'planName', header: 'Plan' },
        { key: 'days', header: 'Days' },
        { key: 'leaveDays', header: 'Leave days' },
        { key: 'rebateDays', header: 'Rebate days' },
        { key: 'grossRupees', header: 'Gross (₹)' },
        { key: 'rebateRupees', header: 'Rebate (₹)' },
        { key: 'netRupees', header: 'Net (₹)' },
        { key: 'status', header: 'Status' },
      ],
      remove: { guard: async (ctx, id) => ((await ctx.tx.select({ s: messBills.status }).from(messBills).where(eq(messBills.id, id)))[0]?.s === 'charged' ? 'This bill is on the fee account' : null) },
      actions: {
        charge: {
          label: 'Charge to fees',
          apply: async (ctx, id) => {
            const [b] = await ctx.tx.select().from(messBills).where(eq(messBills.id, id)).for('update');
            if (b.status === 'charged') throw new ConflictException('Already charged');
            if (b.netPaise <= 0) throw new ConflictException('Nothing to charge');
            const title = `Mess bill ${b.month}`;
            await this.fees.chargeStudents(ctx.tx, ctx.p, title, await this.today(ctx), [{ studentId: b.studentId, amountPaise: b.netPaise }]);
            await ctx.tx.update(messBills).set({ status: 'charged', chargedTitle: title }).where(eq(messBills.id, id));
            await auditUser(ctx.tx, ctx.p, 'mess_bill.charged', 'mess_bill', id, { title, netPaise: b.netPaise });
          },
        },
      },
    };
  }
}

/** "1, 2" → [1, 2] for the years a hostel or block takes. */
const TermsText = z
  .string()
  .trim()
  .max(60)
  .refine((v) => v === '' || v.split(',').every((x) => /^\s*\d{1,2}\s*$/.test(x)), 'Give numbers separated by commas, like 1, 2')
  .transform((v) => (v ? [...new Set(v.split(',').map((x) => Number(x.trim())))].sort((a, b) => a - b) : []));
function setTerms(table: typeof hostels | typeof hostelBlocks, idCol: AnyColumn) {
  return async (ctx: KitCtx, id: string, value: unknown) => void (await ctx.tx.update(table).set({ allowedTerms: value as number[] }).where(eq(idCol, id)));
}

/** Recomputes every open application's priority under the current weights. */
export async function rankApplications(ctx: KitCtx): Promise<void> {
  const rules = (await readSettings(ctx.tx, ctx.p.tenantId, 'hostel')).rules;
  const w = { distance: Number(rules.allotWeightDistance), merit: Number(rules.allotWeightMerit), seniority: Number(rules.allotWeightSeniority) };
  await ctx.tx.execute(sql`
    update hostel_applications a set priority = round((${w.distance} * least(greatest(coalesce(a.distance_km, 0), 0), 1000) / 10 + ${w.merit} * least(greatest(coalesce(a.merit_score, 0), 0), 100) + ${w.seniority} * greatest(sec.term, 1) * 10)::numeric, 2)
    from students s join sections sec on sec.id = s.section_id
    where s.id = a.student_id and a.status in ('applied', 'approved', 'waitlisted')`);
}
