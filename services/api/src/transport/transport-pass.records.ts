import { BadRequestException, Injectable, OnModuleInit } from '@nestjs/common';
import { asc, eq, ne, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { z } from 'zod';
import { readSettings } from '../campus-ops/settings.js';
import { addDays, Bool, choiceFilter, choices, rupeesOf, Rupees, todayIn, yesNo } from '../common/lht-kit.js';
import { Clock } from '../common/time.js';
import { sections, students, transportRoutes, transportStops, transportTrips, transportVehicles, users } from '../db/schema.js';
import { transportBoardings } from '../db/schema-integrations.js';
import { SAFETY_ITEMS, transportFareSlabs, transportFeeAdjustments, transportSafetyChecks, type SafetyItem } from '../db/schema-transport.js';
import { RecordRegistry, type FieldOption, type KitCtx, type RecordEntity, type RecordField } from '../records/entity.js';
import { uuidEq } from '../records/helpers.js';
import { TRANSPORT_ROLES } from './transport.controller.js';
import { overlappingSlabs } from './transport-rules.js';

/** The checklist items as the forms and exports name them. */
export const SAFETY_LABELS: Record<SafetyItem, string> = {
  speedGovernor: 'Speed governor (40 km/h)',
  gpsWorking: 'GPS tracker working',
  cctvWorking: 'CCTV working',
  firstAidBox: 'First-aid box',
  fireExtinguisher: 'Fire extinguisher (in date)',
  emergencyExit: 'Emergency exit',
  windowGrills: 'Horizontal grills on windows',
  doorLocks: 'Reliable door locks',
  yellowPaint: 'Painted school-bus yellow',
  schoolBusSign: '“SCHOOL BUS” written front and back',
  schoolNamePhone: 'School name and phone on the bus',
  seatBelts: 'Seat belts (driver and front)',
  panicButton: 'Panic button',
};
const IST_TODAY = sql`(now() at time zone 'Asia/Kolkata')::date`;
const KINDS = choices(['board', 'Got on'], ['alight', 'Got off']);
const METHODS = choices(['rfid', 'RFID card'], ['qr', 'Bus pass QR'], ['manual', 'Conductor']);
const ADJ_KINDS = choices(['move_charge', 'Move: charged'], ['move_credit', 'Move: credited'], ['cancel_credit', 'Seat cancelled: credited']);
const recorder = alias(users, 'recorder');

async function vehicles(ctx: KitCtx): Promise<FieldOption[]> {
  return (await ctx.tx.select({ id: transportVehicles.id, regNo: transportVehicles.regNo }).from(transportVehicles).where(ne(transportVehicles.status, 'retired')).orderBy(asc(transportVehicles.regNo))).map((v) => ({ value: v.id, label: v.regNo }));
}
async function routes(ctx: KitCtx): Promise<FieldOption[]> {
  return (await ctx.tx.select({ id: transportRoutes.id, name: transportRoutes.name }).from(transportRoutes).orderBy(asc(transportRoutes.name))).map((r) => ({ value: r.id, label: r.name }));
}

/**
 * The production pass's lists: fare slabs by distance, vehicle safety checks (the school-bus checklist), the boarding
 * log (RFID, bus pass QR, conductor) and the ledger of transport fee changes after billing.
 */
@Injectable()
export class TransportPassRecords implements OnModuleInit {
  constructor(
    private readonly registry: RecordRegistry,
    private readonly clock: Clock,
  ) {}

  onModuleInit(): void {
    for (const e of [this.slabs(), this.safetyChecks(), this.boardings(), this.adjustments()]) this.registry.register(e);
  }

  slabs(): RecordEntity {
    const km = () => z.coerce.number().min(0, 'Cannot be negative').max(500, 'At most 500 km');
    return {
      key: 'transport-fare-slabs',
      module: 'transport',
      table: transportFareSlabs,
      subjectType: 'transport_fare_slab',
      roles: { read: TRANSPORT_ROLES, write: TRANSPORT_ROLES },
      label: (r) => `${r.fromKm}–${r.toKm} km`,
      list: {
        select: { id: transportFareSlabs.id, fromKm: transportFareSlabs.fromKm, toKm: transportFareSlabs.toKm, feeRupees: rupeesOf(transportFareSlabs.monthlyFeePaise), note: transportFareSlabs.note, stops: sql<number>`(select count(*)::int from transport_stops s where s.distance_km > ${transportFareSlabs.fromKm} and s.distance_km <= ${transportFareSlabs.toKm} or (s.distance_km = 0 and ${transportFareSlabs.fromKm} = 0))` },
        search: [transportFareSlabs.note],
        sorts: { from: transportFareSlabs.fromKm, fee: transportFareSlabs.monthlyFeePaise },
        defaultSort: { id: 'from', dir: 'asc' },
      },
      fields: {
        fromKm: { label: 'From (km, not included)', type: 'number', schema: km(), column: transportFareSlabs.fromKm, required: true },
        toKm: { label: 'Up to (km)', type: 'number', schema: km(), column: transportFareSlabs.toKm, required: true },
        fee: { label: 'Fee a month (₹)', type: 'number', schema: Rupees, column: transportFareSlabs.monthlyFeePaise, rowKey: 'feeRupees', required: true, bulk: true },
        note: { label: 'Note', type: 'text', schema: z.string().trim().max(200), column: transportFareSlabs.note },
      },
      columns: [
        { key: 'fromKm', header: 'From (km)' },
        { key: 'toKm', header: 'Up to (km)' },
        { key: 'feeRupees', header: 'Fee a month (₹)' },
        { key: 'stops', header: 'Stops in the band' },
        { key: 'note', header: 'Note' },
      ],
      // A stop must fall in at most one band.
      validate: async (ctx) => {
        const all = await ctx.tx.select({ fromKm: transportFareSlabs.fromKm, toKm: transportFareSlabs.toKm, monthlyFeePaise: transportFareSlabs.monthlyFeePaise }).from(transportFareSlabs);
        if (all.some((s) => s.toKm <= s.fromKm)) return '“Up to” must be more than “From”';
        return overlappingSlabs(all).length ? 'This band overlaps another fare slab' : null;
      },
    };
  }

  safetyChecks(): RecordEntity {
    const itemFields = Object.fromEntries(SAFETY_ITEMS.map((k) => [k, { label: SAFETY_LABELS[k], type: 'boolean', schema: Bool, edit: false, apply: async () => undefined } satisfies RecordField])) as Record<SafetyItem, RecordField>;
    const failed = sql<string>`(select coalesce(string_agg(k, ', '), '') from jsonb_each(${transportSafetyChecks.items}) as e(k, v) where v <> 'true'::jsonb)`;
    const overdue = sql`${transportSafetyChecks.nextDueOn} < ${IST_TODAY} and not exists (select 1 from transport_safety_checks n where n.vehicle_id = ${transportSafetyChecks.vehicleId} and n.checked_on > ${transportSafetyChecks.checkedOn})`;
    return {
      key: 'transport-safety-checks',
      module: 'transport',
      table: transportSafetyChecks,
      subjectType: 'transport_safety_check',
      roles: { read: TRANSPORT_ROLES, write: TRANSPORT_ROLES },
      label: (r) => `${r.regNo} · ${r.checkedOn}`,
      list: {
        select: { id: transportSafetyChecks.id, vehicleId: transportSafetyChecks.vehicleId, regNo: transportVehicles.regNo, checkedOn: transportSafetyChecks.checkedOn, passed: transportSafetyChecks.passed, nextDueOn: transportSafetyChecks.nextDueOn, note: transportSafetyChecks.note, failed, checkedByName: users.fullName, items: transportSafetyChecks.items, overdue: sql<boolean>`coalesce(${overdue}, false)` },
        joins: (q) => q.innerJoin(transportVehicles, eq(transportVehicles.id, transportSafetyChecks.vehicleId)).leftJoin(users, eq(users.id, transportSafetyChecks.checkedBy)),
        search: [transportVehicles.regNo, transportSafetyChecks.note],
        filters: {
          vehicle: { label: 'Vehicle', options: vehicles, where: (v) => uuidEq(transportSafetyChecks.vehicleId, v) },
          passed: yesNo('Result', eq(transportSafetyChecks.passed, true), eq(transportSafetyChecks.passed, false), ['Passed', 'Gaps found']),
          overdue: yesNo('Next check', overdue, sql`not (${overdue})`, ['Overdue', 'In time']),
        },
        sorts: { on: transportSafetyChecks.checkedOn, vehicle: transportVehicles.regNo, due: transportSafetyChecks.nextDueOn },
        defaultSort: { id: 'on', dir: 'desc' },
      },
      fields: {
        vehicleId: { label: 'Vehicle', type: 'select', schema: z.uuid(), options: vehicles, column: transportSafetyChecks.vehicleId, required: true, edit: false },
        checkedOn: { label: 'Checked on', type: 'date', schema: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-10-15'), column: transportSafetyChecks.checkedOn, required: true, edit: false },
        ...itemFields,
        note: { label: 'Note', type: 'textarea', schema: z.string().trim().max(500), column: transportSafetyChecks.note },
      },
      create: async (ctx, v) => {
        const today = await todayIn(ctx.tx, this.clock.now());
        const on = String(v.checkedOn);
        if (on > today) throw new BadRequestException({ formErrors: [], fieldErrors: { checkedOn: ['A check cannot be in the future'] } });
        const items = Object.fromEntries(SAFETY_ITEMS.map((k) => [k, v[k] === true])) as Record<SafetyItem, boolean>;
        const every = Number((await readSettings(ctx.tx, ctx.p.tenantId, 'transport')).rules.safetyCheckEveryDays) || 90;
        const [row] = await ctx.tx.insert(transportSafetyChecks).values({ tenantId: ctx.p.tenantId, vehicleId: String(v.vehicleId), checkedOn: on, items, passed: SAFETY_ITEMS.every((k) => items[k]), nextDueOn: addDays(on, every), note: String(v.note ?? ''), checkedBy: ctx.p.userId }).returning({ id: transportSafetyChecks.id });
        return row.id;
      },
      columns: [
        { key: 'checkedOn', header: 'Checked on' },
        { key: 'regNo', header: 'Vehicle' },
        { key: 'passed', header: 'Passed' },
        { key: 'failed', header: 'Gaps' },
        { key: 'nextDueOn', header: 'Next check' },
        { key: 'checkedByName', header: 'Checked by' },
        { key: 'note', header: 'Note' },
      ],
      remove: { guard: async () => 'Safety checks are kept as the inspection record; add a new check instead' },
    };
  }

  boardings(): RecordEntity {
    return {
      key: 'transport-boardings',
      module: 'transport',
      table: transportBoardings,
      subjectType: 'transport_boarding',
      roles: { read: TRANSPORT_ROLES, write: TRANSPORT_ROLES },
      label: (r) => `${r.studentName} · ${r.kind} · ${String(r.at).slice(0, 16)}`,
      list: {
        select: { id: transportBoardings.id, at: transportBoardings.boardedAt, onDate: transportBoardings.onDate, kind: transportBoardings.kind, method: transportBoardings.method, studentId: transportBoardings.studentId, studentName: students.fullName, rollNo: students.rollNo, className: sections.displayName, routeId: transportBoardings.routeId, routeName: transportRoutes.name, stopName: transportStops.name, tripId: transportBoardings.tripId, direction: transportTrips.direction, recordedByName: recorder.fullName },
        joins: (q) => q.innerJoin(students, eq(students.id, transportBoardings.studentId)).leftJoin(sections, eq(sections.id, students.sectionId)).leftJoin(transportRoutes, eq(transportRoutes.id, transportBoardings.routeId)).leftJoin(transportStops, eq(transportStops.id, transportBoardings.stopId)).leftJoin(transportTrips, eq(transportTrips.id, transportBoardings.tripId)).leftJoin(recorder, eq(recorder.id, transportBoardings.recordedBy)),
        search: [students.fullName, students.rollNo, transportRoutes.name, transportStops.name],
        filters: {
          route: { label: 'Route', options: routes, where: (v) => uuidEq(transportBoardings.routeId, v) },
          kind: choiceFilter('On or off', transportBoardings.kind, KINDS),
          method: choiceFilter('Marked by', transportBoardings.method, METHODS),
          day: { label: 'Day', options: choices(['today', 'Today'], ['week', 'Last 7 days']), where: (v) => (v === 'today' ? sql`${transportBoardings.onDate} = ${IST_TODAY}` : v === 'week' ? sql`${transportBoardings.onDate} > ${IST_TODAY} - 7` : /^\d{4}-\d{2}-\d{2}$/.test(v) ? sql`${transportBoardings.onDate} = ${v}::date` : undefined) },
        },
        sorts: { at: transportBoardings.boardedAt, student: students.fullName },
        defaultSort: { id: 'at', dir: 'desc' },
      },
      columns: [
        { key: 'at', header: 'When' },
        { key: 'studentName', header: 'Student' },
        { key: 'rollNo', header: 'Roll no.' },
        { key: 'routeName', header: 'Route' },
        { key: 'stopName', header: 'Stop' },
        { key: 'kind', header: 'On or off' },
        { key: 'method', header: 'Marked by' },
        { key: 'recordedByName', header: 'Recorded by' },
      ],
      remove: { guard: async () => 'The boarding log is a safety record and is kept' },
    };
  }

  adjustments(): RecordEntity {
    return {
      key: 'transport-fee-adjustments',
      module: 'transport',
      table: transportFeeAdjustments,
      subjectType: 'transport_fee_adjustment',
      roles: { read: [...TRANSPORT_ROLES, 'accountant'], write: TRANSPORT_ROLES },
      label: (r) => `${r.studentName} · ${r.month}`,
      list: {
        select: { id: transportFeeAdjustments.id, createdAt: transportFeeAdjustments.createdAt, month: transportFeeAdjustments.month, kind: transportFeeAdjustments.kind, studentId: transportFeeAdjustments.studentId, studentName: students.fullName, rollNo: students.rollNo, amountRupees: rupeesOf(transportFeeAdjustments.amountPaise), appliedRupees: rupeesOf(transportFeeAdjustments.appliedPaise), refundDueRupees: rupeesOf(transportFeeAdjustments.refundDuePaise), note: transportFeeAdjustments.note },
        joins: (q) => q.innerJoin(students, eq(students.id, transportFeeAdjustments.studentId)),
        search: [students.fullName, students.rollNo, transportFeeAdjustments.note],
        filters: {
          kind: choiceFilter('Change', transportFeeAdjustments.kind, ADJ_KINDS),
          refund: yesNo('Refund due', sql`${transportFeeAdjustments.refundDuePaise} > 0`, sql`${transportFeeAdjustments.refundDuePaise} = 0`, ['Refund due', 'No refund']),
          month: { label: 'Month', where: (v) => (/^\d{4}-\d{2}$/.test(v) ? eq(transportFeeAdjustments.month, v) : undefined) },
        },
        sorts: { at: transportFeeAdjustments.createdAt, month: transportFeeAdjustments.month, amount: transportFeeAdjustments.amountPaise },
        defaultSort: { id: 'at', dir: 'desc' },
      },
      columns: [
        { key: 'createdAt', header: 'When' },
        { key: 'studentName', header: 'Student' },
        { key: 'rollNo', header: 'Roll no.' },
        { key: 'month', header: 'Month' },
        { key: 'kind', header: 'Change' },
        { key: 'amountRupees', header: 'Amount (₹)' },
        { key: 'appliedRupees', header: 'Taken off fees (₹)' },
        { key: 'refundDueRupees', header: 'Refund due (₹)' },
        { key: 'note', header: 'Note' },
      ],
      remove: { guard: async () => 'Fee changes are kept with the fee ledger' },
    };
  }
}
