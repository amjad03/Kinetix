import { BadRequestException, ConflictException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { and, asc, eq, inArray, isNull, lte, sql, type AnyColumn } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { z } from 'zod';
import { auditUser } from '../common/audit.js';
import { Bool, choiceFilter, choices, familyUserIds, Hhmm, oneOf, OptionalDecimal, OptionalInt, OptionalRupees, qual, Rupees, rupeesOf, staffOptions, studentByRoll, todayIn, yesNo } from '../common/lht-kit.js';
import { Clock } from '../common/time.js';
import { sections, students, transportAssignments, transportDrivers, transportExpenses, transportIncidents, transportRoutes, transportStops, transportTripEvents, transportTrips, transportVehicles, userRoles, users } from '../db/schema.js';
import { transportChangeRequests, transportDriverDuty, transportHandovers, transportMaintenance, transportPickupPersons, transportRouteOverrides } from '../db/schema-lht.js';
import { FeesService } from '../fees/fees.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { RecordRegistry, type FieldOption, type KitCtx, type RecordEntity, type RecordField } from '../records/entity.js';
import { copyName, DateText, Int, OptionalRef, Text, uuidEq } from '../records/helpers.js';
import { fail, int, outcome, required } from '../import/row-helpers.js';
import { eachRow } from '../records/import.js';
import { TRANSPORT_ROLES } from './transport.controller.js';
import { changeDelta } from './transport-rules.js';

/**
 * Transport's lists as record kit entities: vehicles, drivers and conductors, routes, stops (in their running order),
 * riders (students and staff), change requests, the maintenance schedule, the fuel and expense log, incidents with
 * insurance claims, temporary route changes, authorised pick-up persons and hand-overs, driver duty, GPS alerts and trips.
 */

const VEHICLE_STATUSES = choices(['active', 'Running'], ['maintenance', 'In the workshop'], ['retired', 'Retired']);
const FUELS = choices(['diesel', 'Diesel'], ['petrol', 'Petrol'], ['cng', 'CNG'], ['electric', 'Electric']);
const OWNERSHIP = choices(['own', 'Own'], ['contract', 'On contract']);
const DRIVER_ROLES = choices(['driver', 'Driver'], ['conductor', 'Conductor']);
const RIDER_KINDS = choices(['student', 'Student'], ['staff', 'Staff']);
const REQUEST_STATUSES = choices(['pending', 'Pending'], ['approved', 'Approved'], ['rejected', 'Rejected'], ['cancelled', 'Cancelled']);
const MAINT_KINDS = choices(['service', 'Service'], ['tyres', 'Tyres'], ['battery', 'Battery'], ['brakes', 'Brakes'], ['insurance_renewal', 'Insurance renewal'], ['fitness', 'Fitness certificate'], ['permit', 'Permit'], ['other', 'Other']);
const MAINT_STATUSES = choices(['scheduled', 'Scheduled'], ['done', 'Done'], ['cancelled', 'Cancelled']);
const EXPENSE_KINDS = choices(['fuel', 'Fuel'], ['repair', 'Repair'], ['toll', 'Toll'], ['other', 'Other']);
const INCIDENT_KINDS = choices(['accident', 'Accident'], ['breakdown', 'Breakdown'], ['delay', 'Delay'], ['behaviour', 'Behaviour'], ['other', 'Other']);
const SEVERITIES = choices(['low', 'Low'], ['medium', 'Medium'], ['high', 'High']);
const CLAIM_STATUSES = choices(['none', 'No claim'], ['filed', 'Filed'], ['settled', 'Settled'], ['rejected', 'Rejected']);
const OVERRIDE_KINDS = choices(['timing', 'Different timing'], ['vehicle', 'Substitute vehicle'], ['driver', 'Substitute driver'], ['cancelled', 'Not running']);
const DUTY_STATUSES = choices(['present', 'Present'], ['absent', 'Absent'], ['leave', 'On leave']);
const ALERT_KINDS = choices(['overspeed', 'Over-speed'], ['deviation', 'Off the route']);

async function vehicleOptions(ctx: KitCtx): Promise<FieldOption[]> {
  return (await ctx.tx.select({ id: transportVehicles.id, regNo: transportVehicles.regNo, cap: transportVehicles.capacity }).from(transportVehicles).where(sql`${transportVehicles.status} <> 'retired'`).orderBy(asc(transportVehicles.regNo))).map((v) => ({ value: v.id, label: `${v.regNo} (${v.cap} seats)` }));
}
async function driverOptions(ctx: KitCtx): Promise<FieldOption[]> {
  return (await ctx.tx.select({ id: transportDrivers.id, name: transportDrivers.fullName, role: transportDrivers.role, spare: transportDrivers.isSpare }).from(transportDrivers).where(eq(transportDrivers.active, true)).orderBy(asc(transportDrivers.fullName))).map((d) => ({ value: d.id, label: d.name, group: d.spare ? 'Spare' : d.role === 'conductor' ? 'Conductors' : 'Drivers' }));
}
async function routeOptions(ctx: KitCtx): Promise<FieldOption[]> {
  return (await ctx.tx.select({ id: transportRoutes.id, name: transportRoutes.name }).from(transportRoutes).orderBy(asc(transportRoutes.name))).map((r) => ({ value: r.id, label: r.name }));
}
/** Every stop, grouped by its route. */
async function stopOptions(ctx: KitCtx): Promise<FieldOption[]> {
  return (await ctx.tx.select({ id: transportStops.id, name: transportStops.name, route: transportRoutes.name, time: transportStops.pickupTime }).from(transportStops).innerJoin(transportRoutes, eq(transportRoutes.id, transportStops.routeId)).orderBy(asc(transportRoutes.name), asc(transportStops.sortOrder), asc(transportStops.seq))).map((s) => ({ value: s.id, label: s.time ? `${s.name} (${s.time})` : s.name, group: s.route }));
}
async function driverUserOptions(ctx: KitCtx): Promise<FieldOption[]> {
  return staffOptions(ctx, ['driver', 'transport_manager', 'teacher', 'store_keeper']);
}

/** A seat's monthly fee: its own, else its stop's, else its route's. */
const seatFeeSql = sql<number>`coalesce(${qual(transportAssignments.feePaise)}, (select s.fee_paise from transport_stops s where s.id = ${qual(transportAssignments.stopId)}), (select r.monthly_fee_paise from transport_routes r where r.id = ${qual(transportAssignments.routeId)}))`;
const ridersOf = (route: AnyColumn) => sql<number>`(select count(*)::int from transport_assignments a where a.route_id = ${qual(route)} and a.ended_on is null)`;
const studentField = (label = 'Student (roll no.)'): RecordField => ({ label, type: 'text', schema: Text(40), required: true, edit: false, rowKey: 'rollNo', apply: async () => undefined });
const staffUser = alias(users, 'staff_user');
const subVehicle = alias(transportVehicles, 'sub_vehicle');
const subDriver = alias(transportDrivers, 'sub_driver');
const toRoute = alias(transportRoutes, 'to_route');
const toStop = alias(transportStops, 'to_stop');
const fromRoute = alias(transportRoutes, 'from_route');
const ackUser = alias(users, 'ack_user');

/** Seats free on a route's vehicle (null when the route has no vehicle). */
export async function seatsLeft(ctx: KitCtx, routeId: string): Promise<number | null> {
  const [r] = await ctx.tx.select({ cap: transportVehicles.capacity, riders: ridersOf(transportRoutes.id) }).from(transportRoutes).leftJoin(transportVehicles, eq(transportVehicles.id, transportRoutes.vehicleId)).where(eq(transportRoutes.id, routeId)).for('update', { of: transportRoutes });
  if (!r) throw new NotFoundException('Route not found');
  return r.cap == null ? null : r.cap - r.riders;
}

/** The fee a seat at this stop costs a month. */
export async function stopFee(ctx: KitCtx, stopId: string): Promise<number> {
  const [s] = await ctx.tx.select({ stop: transportStops.feePaise, route: transportRoutes.monthlyFeePaise }).from(transportStops).innerJoin(transportRoutes, eq(transportRoutes.id, transportStops.routeId)).where(eq(transportStops.id, stopId));
  if (!s) throw new NotFoundException('Stop not found');
  return s.stop ?? s.route;
}

/**
 * Moves a rider to another stop (on the same or another route) from `on`: the old seat ends, the new one starts after a
 * capacity check, and the fee difference for the rest of the month is charged to the student (a smaller fee is
 * reported for the fees office to credit).
 */
export async function moveRider(ctx: KitCtx, fees: FeesService, now: Date, assignmentId: string, stopId: string, on?: string, reason?: string): Promise<{ deltaPaise: number; charged: boolean }> {
  const [a] = await ctx.tx.select().from(transportAssignments).where(eq(transportAssignments.id, assignmentId)).for('update');
  if (!a) throw new NotFoundException('Seat not found');
  if (a.endedOn) throw new ConflictException('This seat has ended');
  if (a.stopId === stopId) throw new BadRequestException('Already at this stop');
  const [stop] = await ctx.tx.select().from(transportStops).where(eq(transportStops.id, stopId));
  if (!stop) throw new NotFoundException('Stop not found');
  const today = await todayIn(ctx.tx, now);
  const from = on ?? today;
  if (from < a.startsOn) throw new BadRequestException('The move is before the seat began');
  const [route] = await ctx.tx.select({ active: transportRoutes.active }).from(transportRoutes).where(eq(transportRoutes.id, stop.routeId));
  if (!route?.active) throw new BadRequestException('That route is not running');
  if (stop.routeId !== a.routeId) {
    const left = await seatsLeft(ctx, stop.routeId);
    if (left !== null && left <= 0) throw new ConflictException('The vehicle on that route is full');
  }
  const before = a.feePaise ?? (await stopFee(ctx, a.stopId));
  const after = await stopFee(ctx, stopId);
  await ctx.tx.update(transportAssignments).set({ endedOn: from }).where(eq(transportAssignments.id, assignmentId));
  await ctx.tx.insert(transportAssignments).values({ tenantId: ctx.p.tenantId, studentId: a.studentId, staffUserId: a.staffUserId, kind: a.kind, routeId: stop.routeId, stopId, startsOn: from });
  const delta = changeDelta(from, before, after);
  let charged = false;
  if (a.studentId && delta > 0) {
    const r = await fees.chargeStudents(ctx.tx, ctx.p, `Transport fee change ${from} (${assignmentId.slice(0, 8)})`, from, [{ studentId: a.studentId, amountPaise: delta }]);
    charged = r.charged > 0;
  }
  await auditUser(ctx.tx, ctx.p, 'transport_assignment.moved', 'transport_assignment', assignmentId, { reason, from, deltaPaise: delta, changes: { stopId: { before: a.stopId, after: stopId }, routeId: { before: a.routeId, after: stop.routeId } } });
  return { deltaPaise: delta, charged };
}

@Injectable()
export class TransportRecords implements OnModuleInit {
  constructor(
    private readonly registry: RecordRegistry,
    private readonly clock: Clock,
    private readonly fees: FeesService,
    private readonly notifications: NotificationsService,
  ) {}

  onModuleInit(): void {
    for (const e of [this.vehicles(), this.drivers(), this.routes(), this.stops(), this.riders(), this.requests(), this.maintenance(), this.expenses(), this.incidents(), this.overrides(), this.pickupPersons(), this.handovers(), this.duty(), this.alerts(), this.trips()]) this.registry.register(e);
  }

  private today(ctx: KitCtx) {
    return todayIn(ctx.tx, this.clock.now());
  }

  private async status(ctx: KitCtx, table: Parameters<KitCtx['tx']['update']>[0], idCol: AnyColumn, subject: string, id: string, from: string[], to: string, extra: Record<string, unknown> = {}) {
    const [row] = (await ctx.tx.select().from(table).where(eq(idCol, id)).for('update')) as unknown as { status: string }[];
    if (!row) throw new NotFoundException('Not found');
    if (!from.includes(row.status)) throw new ConflictException(`This is ${row.status.replace('_', ' ')}`);
    await ctx.tx.update(table).set({ status: to, ...extra } as never).where(eq(idCol, id));
    await auditUser(ctx.tx, ctx.p, `${subject}.${to}`, subject, id, { changes: { status: { before: row.status, after: to } } });
    return row;
  }

  // ---- fleet ------------------------------------------------------------------------------------------------------

  vehicles(): RecordEntity {
    const DOCS = ['insurance_expires_on', 'fitness_expires_on', 'puc_expires_on', 'permit_expires_on', 'road_tax_expires_on'];
    const nextExpiry = sql<string | null>`least(${sql.join(DOCS.map((d) => sql.raw(`"transport_vehicles"."${d}"`)), sql`, `)})::text`;
    const route = sql<string | null>`(select string_agg(r.name, ', ') from transport_routes r where r.vehicle_id = ${qual(transportVehicles.id)})`;
    const dateField = (label: string, col: AnyColumn): RecordField => ({ label, type: 'date', schema: DateText, column: col as never, bulk: true });
    return {
      key: 'transport-vehicles',
      module: 'transport',
      table: transportVehicles,
      subjectType: 'transport_vehicle',
      roles: { read: TRANSPORT_ROLES, write: TRANSPORT_ROLES },
      label: (r) => String(r.regNo),
      list: {
        select: { id: transportVehicles.id, regNo: transportVehicles.regNo, model: transportVehicles.model, capacity: transportVehicles.capacity, status: transportVehicles.status, fuelType: transportVehicles.fuelType, ownership: transportVehicles.ownership, gpsDevice: transportVehicles.gpsDevice, insuranceExpiresOn: transportVehicles.insuranceExpiresOn, fitnessExpiresOn: transportVehicles.fitnessExpiresOn, pucExpiresOn: transportVehicles.pucExpiresOn, permitExpiresOn: transportVehicles.permitExpiresOn, roadTaxExpiresOn: transportVehicles.roadTaxExpiresOn, nextExpiry, route, odometerKm: sql<number | null>`(select max(e.odometer_km) from transport_expenses e where e.vehicle_id = ${qual(transportVehicles.id)})` },
        search: [transportVehicles.regNo, transportVehicles.model, transportVehicles.gpsDevice],
        filters: {
          status: choiceFilter('Status', transportVehicles.status, VEHICLE_STATUSES),
          ownership: choiceFilter('Ownership', transportVehicles.ownership, OWNERSHIP),
          expiring: { label: 'Papers', options: choices(['expired', 'Something expired'], ['soon', 'Expiring in 30 days']), where: (v) => (v === 'expired' ? sql`${nextExpiry}::date < current_date` : v === 'soon' ? sql`${nextExpiry}::date < current_date + 30` : undefined) },
        },
        sorts: { regNo: transportVehicles.regNo, capacity: transportVehicles.capacity, expiry: sql`${nextExpiry}` },
        defaultSort: { id: 'regNo', dir: 'asc' },
      },
      fields: {
        regNo: { label: 'Registration number', type: 'text', schema: z.string().trim().min(3).max(20).transform((s) => s.toUpperCase().replace(/\s+/g, '')), column: transportVehicles.regNo, required: true },
        model: { label: 'Make and model', type: 'text', schema: z.string().trim().max(80), column: transportVehicles.model },
        capacity: { label: 'Seats', type: 'number', schema: Int(1, 100), column: transportVehicles.capacity, required: true },
        status: { label: 'Status', type: 'select', schema: oneOf(VEHICLE_STATUSES), options: VEHICLE_STATUSES, column: transportVehicles.status, required: true, bulk: true },
        fuelType: { label: 'Fuel', type: 'select', schema: oneOf(FUELS), options: FUELS, column: transportVehicles.fuelType, bulk: true },
        ownership: { label: 'Ownership', type: 'select', schema: oneOf(OWNERSHIP), options: OWNERSHIP, column: transportVehicles.ownership, bulk: true },
        gpsDevice: { label: 'GPS tracker', type: 'text', schema: z.string().trim().max(60), column: transportVehicles.gpsDevice },
        insuranceExpiresOn: dateField('Insurance until', transportVehicles.insuranceExpiresOn),
        fitnessExpiresOn: dateField('Fitness certificate until', transportVehicles.fitnessExpiresOn),
        pucExpiresOn: dateField('Pollution certificate until', transportVehicles.pucExpiresOn),
        permitExpiresOn: dateField('Permit until', transportVehicles.permitExpiresOn),
        roadTaxExpiresOn: dateField('Road tax until', transportVehicles.roadTaxExpiresOn),
      },
      columns: [
        { key: 'regNo', header: 'Registration' },
        { key: 'model', header: 'Model' },
        { key: 'capacity', header: 'Seats' },
        { key: 'status', header: 'Status' },
        { key: 'route', header: 'Route' },
        { key: 'fuelType', header: 'Fuel' },
        { key: 'ownership', header: 'Ownership' },
        { key: 'insuranceExpiresOn', header: 'Insurance until' },
        { key: 'fitnessExpiresOn', header: 'Fitness until' },
        { key: 'pucExpiresOn', header: 'Pollution certificate until' },
        { key: 'permitExpiresOn', header: 'Permit until' },
        { key: 'roadTaxExpiresOn', header: 'Road tax until' },
        { key: 'odometerKm', header: 'Odometer (km)' },
      ],
      import: {
        columns: [
          { key: 'reg_no', header: 'Registration number', required: true, example: 'KA01AB1234' },
          { key: 'model', header: 'Make and model', example: 'Tata Starbus 40' },
          { key: 'capacity', header: 'Seats', required: true, example: '40' },
          { key: 'fuel', header: 'Fuel', options: FUELS.map((f) => f.value), example: 'diesel' },
          { key: 'ownership', header: 'Ownership', options: OWNERSHIP.map((f) => f.value), example: 'own' },
          { key: 'insurance', header: 'Insurance until', example: '2027-03-31' },
          { key: 'fitness', header: 'Fitness until' },
          { key: 'puc', header: 'Pollution certificate until' },
          { key: 'permit', header: 'Permit until' },
          { key: 'road_tax', header: 'Road tax until' },
        ],
        key: ['reg_no'],
        exists: async (ctx, r) => !!(await ctx.tx.select({ id: transportVehicles.id }).from(transportVehicles).where(eq(transportVehicles.regNo, r.get('reg_no').toUpperCase().replace(/\s+/g, ''))).limit(1))[0],
        run: async (ctx, rows) =>
          eachRow(ctx.tx, rows, async (tx, r) => {
            const regNo = required(r, 'reg_no').toUpperCase().replace(/\s+/g, '');
            const date = (k: string) => (r.get(k) ? (/^\d{4}-\d{2}-\d{2}$/.test(r.get(k)) ? r.get(k) : fail('Use a date like 2026-10-15', r.get(k))) : undefined);
            const pick = (k: string, list: FieldOption[]) => (r.get(k) ? (list.find((o) => o.value === r.get(k).toLowerCase())?.value ?? fail('This value is not valid', r.get(k))) : undefined);
            const values = { model: r.get('model') || undefined, capacity: int(required(r, 'capacity'), 1, 100), fuelType: pick('fuel', FUELS), ownership: pick('ownership', OWNERSHIP), insuranceExpiresOn: date('insurance'), fitnessExpiresOn: date('fitness'), pucExpiresOn: date('puc'), permitExpiresOn: date('permit'), roadTaxExpiresOn: date('road_tax') };
            const set = Object.fromEntries(Object.entries(values).filter(([, v]) => v !== undefined));
            const [found] = await tx.select({ id: transportVehicles.id }).from(transportVehicles).where(eq(transportVehicles.regNo, regNo));
            if (!found) {
              await tx.insert(transportVehicles).values({ tenantId: ctx.p.tenantId, regNo, capacity: values.capacity, ...set });
              return outcome(true, false, [regNo]);
            }
            await tx.update(transportVehicles).set(set).where(eq(transportVehicles.id, found.id));
            return outcome(false, true, [regNo]);
          }),
      },
    };
  }

  drivers(): RecordEntity {
    const route = sql<string | null>`(select string_agg(r.name, ', ') from transport_routes r where r.driver_id = ${qual(transportDrivers.id)})`;
    return {
      key: 'transport-drivers',
      module: 'transport',
      table: transportDrivers,
      subjectType: 'transport_driver',
      roles: { read: TRANSPORT_ROLES, write: TRANSPORT_ROLES },
      label: (r) => String(r.fullName),
      list: {
        select: { id: transportDrivers.id, fullName: transportDrivers.fullName, phone: transportDrivers.phone, role: transportDrivers.role, licenseNo: transportDrivers.licenseNo, licenseExpiresOn: transportDrivers.licenseExpiresOn, badgeNo: transportDrivers.badgeNo, policeVerifiedOn: transportDrivers.policeVerifiedOn, isSpare: transportDrivers.isSpare, active: transportDrivers.active, userId: transportDrivers.userId, hasLogin: sql<boolean>`${transportDrivers.userId} is not null`, route },
        search: [transportDrivers.fullName, transportDrivers.phone, transportDrivers.licenseNo, transportDrivers.badgeNo],
        filters: {
          role: choiceFilter('Role', transportDrivers.role, DRIVER_ROLES),
          spare: yesNo('Spare pool', eq(transportDrivers.isSpare, true), eq(transportDrivers.isSpare, false), ['Spare', 'On a route']),
          active: yesNo('Working', eq(transportDrivers.active, true), eq(transportDrivers.active, false), ['Working', 'Left']),
          licence: { label: 'Licence', options: choices(['expired', 'Expired'], ['soon', 'Expiring in 30 days']), where: (v) => (v === 'expired' ? sql`${transportDrivers.licenseExpiresOn} < current_date` : v === 'soon' ? sql`${transportDrivers.licenseExpiresOn} < current_date + 30` : undefined) },
        },
        sorts: { name: transportDrivers.fullName, licence: transportDrivers.licenseExpiresOn },
        defaultSort: { id: 'name', dir: 'asc' },
      },
      fields: {
        fullName: { label: 'Name', type: 'text', schema: Text(120), column: transportDrivers.fullName, required: true },
        role: { label: 'Role', type: 'select', schema: oneOf(DRIVER_ROLES), options: DRIVER_ROLES, column: transportDrivers.role, required: true },
        phone: { label: 'Phone', type: 'phone', schema: z.string().trim().max(20), column: transportDrivers.phone },
        licenseNo: { label: 'Licence number', type: 'text', schema: z.string().trim().max(40), column: transportDrivers.licenseNo },
        licenseExpiresOn: { label: 'Licence until', type: 'date', schema: DateText, column: transportDrivers.licenseExpiresOn },
        badgeNo: { label: 'Badge number', type: 'text', schema: z.string().trim().max(40), column: transportDrivers.badgeNo },
        policeVerifiedOn: { label: 'Police verification on', type: 'date', schema: DateText, column: transportDrivers.policeVerifiedOn },
        isSpare: { label: 'In the spare pool', type: 'boolean', schema: Bool, column: transportDrivers.isSpare, bulk: true },
        active: { label: 'Working', type: 'boolean', schema: Bool, column: transportDrivers.active, create: false, bulk: true },
        userId: {
          label: 'App login (driver mode)',
          type: 'select',
          schema: OptionalRef,
          options: driverUserOptions,
          apply: async (ctx, id, value) => {
            await ctx.tx.update(transportDrivers).set({ userId: (value as string | null) ?? null }).where(eq(transportDrivers.id, id));
            if (value) await ctx.tx.insert(userRoles).values({ tenantId: ctx.p.tenantId, userId: String(value), role: 'driver' }).onConflictDoNothing();
          },
          help: 'Gives the person the driver role, which opens driver mode in the Teacher App',
        },
      },
      columns: [
        { key: 'fullName', header: 'Name' },
        { key: 'role', header: 'Role' },
        { key: 'phone', header: 'Phone' },
        { key: 'route', header: 'Route' },
        { key: 'licenseNo', header: 'Licence' },
        { key: 'licenseExpiresOn', header: 'Licence until' },
        { key: 'badgeNo', header: 'Badge' },
        { key: 'policeVerifiedOn', header: 'Police verified' },
        { key: 'isSpare', header: 'Spare' },
        { key: 'active', header: 'Working' },
      ],
    };
  }

  routes(): RecordEntity {
    const riders = ridersOf(transportRoutes.id);
    const stops = sql<number>`(select count(*)::int from transport_stops s where s.route_id = ${qual(transportRoutes.id)})`;
    return {
      key: 'transport-routes',
      module: 'transport',
      table: transportRoutes,
      subjectType: 'transport_route',
      roles: { read: TRANSPORT_ROLES, write: TRANSPORT_ROLES },
      label: (r) => String(r.name),
      list: {
        select: { id: transportRoutes.id, name: transportRoutes.name, code: transportRoutes.code, vehicleId: transportRoutes.vehicleId, regNo: transportVehicles.regNo, capacity: transportVehicles.capacity, driverId: transportRoutes.driverId, driverName: transportDrivers.fullName, feeRupees: rupeesOf(transportRoutes.monthlyFeePaise), active: transportRoutes.active, stops, riders, seatsLeft: sql<number | null>`${transportVehicles.capacity} - ${riders}`, live: sql<boolean>`exists (select 1 from transport_trips t where t.route_id = ${qual(transportRoutes.id)} and t.status = 'running')` },
        joins: (q) => q.leftJoin(transportVehicles, eq(transportVehicles.id, transportRoutes.vehicleId)).leftJoin(transportDrivers, eq(transportDrivers.id, transportRoutes.driverId)),
        search: [transportRoutes.name, transportRoutes.code, transportVehicles.regNo, transportDrivers.fullName],
        filters: { active: yesNo('Running', eq(transportRoutes.active, true), eq(transportRoutes.active, false), ['Running', 'Stopped']), full: yesNo('Seats', sql`${transportVehicles.capacity} <= ${riders}`, sql`${transportVehicles.capacity} > ${riders}`, ['Full', 'Seats free']) },
        sorts: { name: transportRoutes.name, riders, fee: transportRoutes.monthlyFeePaise, stops },
        defaultSort: { id: 'name', dir: 'asc' },
      },
      fields: {
        name: { label: 'Name', type: 'text', schema: Text(80), column: transportRoutes.name, required: true },
        code: { label: 'Code', type: 'text', schema: z.string().trim().max(20), column: transportRoutes.code },
        vehicleId: { label: 'Vehicle', type: 'select', schema: OptionalRef, options: vehicleOptions, column: transportRoutes.vehicleId, bulk: true },
        driverId: { label: 'Driver', type: 'select', schema: OptionalRef, options: driverOptions, column: transportRoutes.driverId, bulk: true },
        fee: { label: 'Fee a month (₹)', type: 'number', schema: Rupees, column: transportRoutes.monthlyFeePaise, rowKey: 'feeRupees', bulk: true, help: 'Stops may have their own fee' },
        active: { label: 'Running', type: 'boolean', schema: Bool, column: transportRoutes.active, create: false, bulk: true },
      },
      duplicate: async (ctx, row) => ({ name: await copyName(ctx.tx, transportRoutes, transportRoutes.name, String(row.name)), vehicle_id: null, driver_id: null }),
      columns: [
        { key: 'name', header: 'Route' },
        { key: 'code', header: 'Code' },
        { key: 'regNo', header: 'Vehicle' },
        { key: 'driverName', header: 'Driver' },
        { key: 'stops', header: 'Stops' },
        { key: 'riders', header: 'Riders' },
        { key: 'capacity', header: 'Seats' },
        { key: 'seatsLeft', header: 'Seats left' },
        { key: 'feeRupees', header: 'Fee a month (₹)' },
        { key: 'active', header: 'Running' },
      ],
    };
  }

  stops(): RecordEntity {
    const riders = sql<number>`(select count(*)::int from transport_assignments a where a.stop_id = ${qual(transportStops.id)} and a.ended_on is null)`;
    return {
      key: 'transport-stops',
      module: 'transport',
      table: transportStops,
      subjectType: 'transport_stop',
      roles: { read: TRANSPORT_ROLES, write: TRANSPORT_ROLES },
      label: (r) => `${r.routeName} · ${r.name}`,
      list: {
        select: { id: transportStops.id, routeId: transportStops.routeId, routeName: transportRoutes.name, seq: transportStops.seq, sortOrder: transportStops.sortOrder, name: transportStops.name, landmark: transportStops.landmark, lat: transportStops.lat, lng: transportStops.lng, pickupTime: transportStops.pickupTime, dropTime: transportStops.dropTime, feeRupees: rupeesOf(transportStops.feePaise), effectiveFeeRupees: rupeesOf(sql`coalesce(${transportStops.feePaise}, ${transportRoutes.monthlyFeePaise})`), riders },
        joins: (q) => q.innerJoin(transportRoutes, eq(transportRoutes.id, transportStops.routeId)),
        search: [transportStops.name, transportStops.landmark, transportRoutes.name],
        filters: { route: { label: 'Route', options: routeOptions, where: (v) => uuidEq(transportStops.routeId, v) } },
        sorts: { name: transportStops.name, route: transportRoutes.name, pickup: transportStops.pickupTime, riders },
        defaultSort: { id: 'route', dir: 'asc' },
      },
      fields: {
        routeId: { label: 'Route', type: 'select', schema: z.uuid(), options: routeOptions, column: transportStops.routeId, required: true, edit: false },
        name: { label: 'Stop', type: 'text', schema: Text(100), column: transportStops.name, required: true },
        landmark: { label: 'Landmark', type: 'text', schema: z.string().trim().max(160), column: transportStops.landmark },
        lat: { label: 'Latitude', type: 'number', schema: z.coerce.number().min(-90).max(90), column: transportStops.lat, required: true },
        lng: { label: 'Longitude', type: 'number', schema: z.coerce.number().min(-180).max(180), column: transportStops.lng, required: true },
        pickupTime: { label: 'Pick-up time', type: 'text', schema: Hhmm, column: transportStops.pickupTime, help: 'Like 07:15' },
        dropTime: { label: 'Drop time', type: 'text', schema: Hhmm, column: transportStops.dropTime, help: 'Like 16:20' },
        fee: { label: 'Fee a month (₹)', type: 'number', schema: OptionalRupees, column: transportStops.feePaise, rowKey: 'feeRupees', bulk: true, help: 'Empty takes the route’s fee' },
      },
      create: async (ctx, v) => {
        const routeId = String(v.routeId);
        const [{ seq, ord }] = await ctx.tx.select({ seq: sql<number>`coalesce(max(${transportStops.seq}), 0)::int`, ord: sql<number>`coalesce(max(${transportStops.sortOrder}), 0)::int` }).from(transportStops).where(eq(transportStops.routeId, routeId));
        const [s] = await ctx.tx.insert(transportStops).values({ tenantId: ctx.p.tenantId, routeId, name: String(v.name), landmark: String(v.landmark ?? ''), lat: Number(v.lat), lng: Number(v.lng), pickupTime: (v.pickupTime as string | null) ?? null, dropTime: (v.dropTime as string | null) ?? null, feePaise: (v.fee as number | null) ?? null, seq: seq + 1, sortOrder: ord + 10 }).returning({ id: transportStops.id });
        return s.id;
      },
      order: { column: transportStops.sortOrder, scope: [transportStops.routeId] },
      import: {
        columns: [
          { key: 'route', header: 'Route', required: true, help: 'The route’s name; it must exist', options: async (ctx) => (await routeOptions(ctx)).map((o) => o.label) },
          { key: 'stop', header: 'Stop', required: true, help: 'Stops are matched on route and name; rows come in running order', example: 'Market' },
          { key: 'lat', header: 'Latitude', required: true, example: '12.9716' },
          { key: 'lng', header: 'Longitude', required: true, example: '77.5946' },
          { key: 'pickup', header: 'Pick-up time', example: '07:15' },
          { key: 'drop', header: 'Drop time', example: '16:20' },
          { key: 'landmark', header: 'Landmark' },
          { key: 'fee', header: 'Fee a month (₹)', help: 'Empty takes the route’s fee' },
        ],
        key: ['route', 'stop'],
        exists: async (ctx, r) => !!(await ctx.tx.select({ id: transportStops.id }).from(transportStops).innerJoin(transportRoutes, eq(transportRoutes.id, transportStops.routeId)).where(and(sql`lower(${transportRoutes.name}) = ${r.get('route').toLowerCase()}`, sql`lower(${transportStops.name}) = ${r.get('stop').toLowerCase()}`)).limit(1))[0],
        run: async (ctx, rows) => {
          const routes = await routeOptions(ctx);
          return eachRow(ctx.tx, rows, async (tx, r) => {
            const routeId = routes.find((o) => o.label.toLowerCase() === required(r, 'route').toLowerCase())?.value ?? fail('No route with this name', r.get('route'));
            const name = required(r, 'stop');
            const lat = Number(required(r, 'lat'));
            const lng = Number(required(r, 'lng'));
            if (!(lat >= -90 && lat <= 90) || !(lng >= -180 && lng <= 180)) fail('This value is not valid', `${r.get('lat')}, ${r.get('lng')}`);
            const time = (k: string) => (r.get(k) ? (/^([01]\d|2[0-3]):[0-5]\d$/.test(r.get(k)) ? r.get(k) : fail('Use a time like 07:30', r.get(k))) : null);
            const fee = r.get('fee') ? Math.round(Number(r.get('fee')) * 100) : null;
            if (fee !== null && !(fee >= 0)) fail('This value is not valid', r.get('fee'));
            const values = { lat, lng, pickupTime: time('pickup'), dropTime: time('drop'), landmark: r.get('landmark'), feePaise: fee };
            const [found] = await tx.select({ id: transportStops.id }).from(transportStops).where(and(eq(transportStops.routeId, routeId), sql`lower(${transportStops.name}) = ${name.toLowerCase()}`));
            if (found) {
              await tx.update(transportStops).set(values).where(eq(transportStops.id, found.id));
              return outcome(false, true, [name]);
            }
            const [{ seq, ord }] = await tx.select({ seq: sql<number>`coalesce(max(${transportStops.seq}), 0)::int`, ord: sql<number>`coalesce(max(${transportStops.sortOrder}), 0)::int` }).from(transportStops).where(eq(transportStops.routeId, routeId));
            await tx.insert(transportStops).values({ tenantId: ctx.p.tenantId, routeId, name, seq: seq + 1, sortOrder: ord + 10, ...values });
            return outcome(true, false, [name]);
          });
        },
      },
      columns: [
        { key: 'routeName', header: 'Route' },
        { key: 'name', header: 'Stop' },
        { key: 'landmark', header: 'Landmark' },
        { key: 'pickupTime', header: 'Pick-up' },
        { key: 'dropTime', header: 'Drop' },
        { key: 'effectiveFeeRupees', header: 'Fee a month (₹)' },
        { key: 'riders', header: 'Riders' },
        { key: 'lat', header: 'Latitude' },
        { key: 'lng', header: 'Longitude' },
      ],
      remove: { guard: async (ctx, id) => ((await ctx.tx.select({ n: sql<number>`count(*)::int` }).from(transportAssignments).where(and(eq(transportAssignments.stopId, id), isNull(transportAssignments.endedOn))))[0].n > 0 ? 'Riders board at this stop; move them first' : null) },
    };
  }

  // ---- riders ---------------------------------------------------------------------------------------------------------

  riders(): RecordEntity {
    const name = sql<string>`coalesce(${students.fullName}, ${staffUser.fullName})`;
    return {
      key: 'transport-riders',
      module: 'transport',
      table: transportAssignments,
      subjectType: 'transport_assignment',
      roles: { read: TRANSPORT_ROLES, write: TRANSPORT_ROLES },
      label: (r) => `${r.name} · ${r.routeName}`,
      list: {
        select: { id: transportAssignments.id, kind: transportAssignments.kind, studentId: transportAssignments.studentId, rollNo: students.rollNo, className: sections.displayName, staffUserId: transportAssignments.staffUserId, name, routeId: transportAssignments.routeId, routeName: transportRoutes.name, stopId: transportAssignments.stopId, stopName: transportStops.name, pickupTime: transportStops.pickupTime, dropTime: transportStops.dropTime, startsOn: transportAssignments.startsOn, endedOn: transportAssignments.endedOn, feeRupees: rupeesOf(seatFeeSql), ownFeeRupees: rupeesOf(transportAssignments.feePaise), status: sql<string>`case when ${transportAssignments.endedOn} is null then 'riding' else 'ended' end` },
        joins: (q) => q.innerJoin(transportRoutes, eq(transportRoutes.id, transportAssignments.routeId)).innerJoin(transportStops, eq(transportStops.id, transportAssignments.stopId)).leftJoin(students, eq(students.id, transportAssignments.studentId)).leftJoin(sections, eq(sections.id, students.sectionId)).leftJoin(staffUser, eq(staffUser.id, transportAssignments.staffUserId)),
        search: [students.fullName, students.rollNo, staffUser.fullName, transportRoutes.name, transportStops.name],
        filters: {
          route: { label: 'Route', options: routeOptions, where: (v) => uuidEq(transportAssignments.routeId, v) },
          stop: { label: 'Stop', options: stopOptions, where: (v) => uuidEq(transportAssignments.stopId, v) },
          kind: choiceFilter('Rider', transportAssignments.kind, RIDER_KINDS),
          status: { label: 'Status', options: choices(['riding', 'Riding'], ['ended', 'Ended']), where: (v) => (v === 'riding' ? isNull(transportAssignments.endedOn) : v === 'ended' ? sql`${transportAssignments.endedOn} is not null` : undefined) },
        },
        sorts: { name, route: transportRoutes.name, stop: transportStops.sortOrder, pickup: transportStops.pickupTime, from: transportAssignments.startsOn },
        defaultSort: { id: 'route', dir: 'asc' },
        tiebreak: [transportStops.sortOrder, name],
      },
      fields: {
        kind: { label: 'Rider', type: 'select', schema: z.enum(['student', 'staff']), options: RIDER_KINDS, required: true, edit: false, apply: async () => undefined },
        student: { label: 'Student (roll no.)', type: 'text', schema: z.string().trim().max(40), edit: false, rowKey: 'rollNo', apply: async () => undefined },
        staffUserId: { label: 'Member of staff', type: 'select', schema: OptionalRef, options: (ctx) => staffOptions(ctx), edit: false, apply: async () => undefined },
        stopId: { label: 'Stop', type: 'select', schema: z.uuid(), options: stopOptions, required: true, edit: false, apply: async () => undefined },
        startsOn: { label: 'From', type: 'date', schema: DateText, edit: false, apply: async () => undefined },
        fee: { label: 'Own fee a month (₹)', type: 'number', schema: OptionalRupees, column: transportAssignments.feePaise, rowKey: 'ownFeeRupees', help: 'Empty takes the stop’s or route’s fee' },
      },
      create: async (ctx, v) => {
        const kind = String(v.kind);
        const [stop] = await ctx.tx.select().from(transportStops).where(eq(transportStops.id, String(v.stopId)));
        if (!stop) throw new NotFoundException('Stop not found');
        const [route] = await ctx.tx.select({ active: transportRoutes.active }).from(transportRoutes).where(eq(transportRoutes.id, stop.routeId));
        if (!route?.active) throw new BadRequestException('This route is not running');
        const left = await seatsLeft(ctx, stop.routeId);
        if (left !== null && left <= 0) throw new ConflictException('The vehicle is full');
        const startsOn = (v.startsOn as string | null) ?? (await this.today(ctx));
        let studentId: string | null = null;
        let staffUserId: string | null = null;
        if (kind === 'student') {
          if (!v.student) throw new BadRequestException({ formErrors: [], fieldErrors: { student: ['This value is required'] } });
          studentId = (await studentByRoll(ctx.tx, String(v.student))).id;
          const [has] = await ctx.tx.select({ id: transportAssignments.id }).from(transportAssignments).where(and(eq(transportAssignments.studentId, studentId), isNull(transportAssignments.endedOn)));
          if (has) throw new ConflictException('This student already has a seat; move them instead');
        } else {
          if (!v.staffUserId) throw new BadRequestException({ formErrors: [], fieldErrors: { staffUserId: ['This value is required'] } });
          staffUserId = String(v.staffUserId);
          const [has] = await ctx.tx.select({ id: transportAssignments.id }).from(transportAssignments).where(and(eq(transportAssignments.staffUserId, staffUserId), isNull(transportAssignments.endedOn)));
          if (has) throw new ConflictException('This member of staff already has a seat; move them instead');
        }
        const [a] = await ctx.tx.insert(transportAssignments).values({ tenantId: ctx.p.tenantId, kind, studentId, staffUserId, routeId: stop.routeId, stopId: stop.id, startsOn, feePaise: (v.fee as number | null) ?? null }).returning({ id: transportAssignments.id });
        return a.id;
      },
      move: {
        label: 'Move to stop',
        options: stopOptions,
        reason: true,
        apply: async (ctx, id, to, reason) => {
          await moveRider(ctx, this.fees, this.clock.now(), id, to, undefined, reason);
        },
      },
      columns: [
        { key: 'routeName', header: 'Route' },
        { key: 'stopName', header: 'Stop' },
        { key: 'pickupTime', header: 'Pick-up' },
        { key: 'dropTime', header: 'Drop' },
        { key: 'name', header: 'Rider' },
        { key: 'kind', header: 'Kind' },
        { key: 'rollNo', header: 'Roll no.' },
        { key: 'className', header: 'Class' },
        { key: 'startsOn', header: 'From' },
        { key: 'endedOn', header: 'Ended' },
        { key: 'feeRupees', header: 'Fee a month (₹)' },
      ],
      remove: { guard: async () => 'A seat stays in the record; end it instead' },
      import: {
        columns: [
          { key: 'roll_no', header: 'Roll no.', help: 'A student’s roll number…', example: 'R12' },
          { key: 'email', header: 'Staff email', help: '…or a member of staff’s email' },
          { key: 'route', header: 'Route', required: true, options: async (ctx) => (await routeOptions(ctx)).map((o) => o.label) },
          { key: 'stop', header: 'Stop', required: true, example: 'Market' },
          { key: 'from', header: 'From', example: '2026-06-01' },
        ],
        key: ['roll_no', 'email'],
        exists: async (ctx, r) => {
          if (r.get('roll_no')) return !!(await ctx.tx.select({ id: transportAssignments.id }).from(transportAssignments).innerJoin(students, eq(students.id, transportAssignments.studentId)).where(and(isNull(transportAssignments.endedOn), sql`lower(${students.rollNo}) = ${r.get('roll_no').toLowerCase()}`)).limit(1))[0];
          return !!(await ctx.tx.select({ id: transportAssignments.id }).from(transportAssignments).innerJoin(users, eq(users.id, transportAssignments.staffUserId)).where(and(isNull(transportAssignments.endedOn), eq(users.email, r.get('email').toLowerCase()))).limit(1))[0];
        },
        run: async (ctx, rows) => {
          const today = await this.today(ctx);
          return eachRow(ctx.tx, rows, async (tx, r) => {
            const kc = { tx, p: ctx.p };
            const [stop] = await tx.select({ id: transportStops.id, routeId: transportStops.routeId }).from(transportStops).innerJoin(transportRoutes, eq(transportRoutes.id, transportStops.routeId)).where(and(sql`lower(${transportRoutes.name}) = ${required(r, 'route').toLowerCase()}`, sql`lower(${transportStops.name}) = ${required(r, 'stop').toLowerCase()}`));
            if (!stop) fail('No such stop on this route', `${r.get('route')} / ${r.get('stop')}`);
            const from = r.get('from') ? (/^\d{4}-\d{2}-\d{2}$/.test(r.get('from')) ? r.get('from') : fail('Use a date like 2026-10-15', r.get('from'))) : today;
            let studentId: string | null = null;
            let staffUserId: string | null = null;
            let who: string;
            if (r.get('roll_no')) {
              const s = await studentByRoll(tx, r.get('roll_no')).catch((e: Error) => fail(e.message, r.get('roll_no')));
              studentId = s.id;
              who = s.fullName;
            } else {
              const [u] = await tx.select({ id: users.id, name: users.fullName }).from(users).where(eq(users.email, required(r, 'email').toLowerCase()));
              if (!u) fail('No member of staff with this email or phone', r.get('email'));
              staffUserId = u!.id;
              who = u!.name;
            }
            const [cur] = await tx.select().from(transportAssignments).where(and(studentId ? eq(transportAssignments.studentId, studentId) : eq(transportAssignments.staffUserId, staffUserId!), isNull(transportAssignments.endedOn)));
            if (cur?.stopId === stop!.id) return outcome(false, false, [who]);
            if (cur) {
              await moveRider(kc, this.fees, this.clock.now(), cur.id, stop!.id, from, 'Import');
              return outcome(false, true, [who]);
            }
            const left = await seatsLeft(kc, stop!.routeId);
            if (left !== null && left <= 0) fail('The vehicle is full', r.get('route'));
            await tx.insert(transportAssignments).values({ tenantId: ctx.p.tenantId, kind: studentId ? 'student' : 'staff', studentId, staffUserId, routeId: stop!.routeId, stopId: stop!.id, startsOn: from });
            return outcome(true, false, [who]);
          });
        },
      },
      actions: {
        end: {
          label: 'End the seat',
          tone: 'danger',
          params: z.object({ on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }).default({}),
          apply: async (ctx, id, raw) => {
            const on = (raw as { on?: string }).on ?? (await this.today(ctx));
            const [a] = await ctx.tx.update(transportAssignments).set({ endedOn: on }).where(and(eq(transportAssignments.id, id), isNull(transportAssignments.endedOn), lte(transportAssignments.startsOn, on))).returning();
            if (!a) throw new ConflictException('This seat has ended, or the date is before it began');
            await auditUser(ctx.tx, ctx.p, 'transport.unassigned', 'transport_assignment', id, { on });
          },
        },
      },
    };
  }

  requests(): RecordEntity {
    return {
      key: 'transport-change-requests',
      module: 'transport',
      table: transportChangeRequests,
      subjectType: 'transport_change_request',
      roles: { read: TRANSPORT_ROLES, write: TRANSPORT_ROLES },
      label: (r) => `${r.rollNo} ${r.studentName} → ${r.toRouteName}`,
      list: {
        select: { id: transportChangeRequests.id, studentId: transportChangeRequests.studentId, rollNo: students.rollNo, studentName: students.fullName, className: sections.displayName, fromRouteName: fromRoute.name, toRouteId: transportChangeRequests.toRouteId, toRouteName: toRoute.name, toStopName: toStop.name, effectiveOn: transportChangeRequests.effectiveOn, reason: transportChangeRequests.reason, status: transportChangeRequests.status, feeDeltaRupees: rupeesOf(transportChangeRequests.feeDeltaPaise), decisionNote: transportChangeRequests.decisionNote, createdAt: transportChangeRequests.createdAt },
        joins: (q) => q.innerJoin(students, eq(students.id, transportChangeRequests.studentId)).innerJoin(sections, eq(sections.id, students.sectionId)).innerJoin(toRoute, eq(toRoute.id, transportChangeRequests.toRouteId)).innerJoin(toStop, eq(toStop.id, transportChangeRequests.toStopId)).leftJoin(fromRoute, eq(fromRoute.id, transportChangeRequests.fromRouteId)),
        search: [students.fullName, students.rollNo, toRoute.name],
        filters: { status: choiceFilter('Status', transportChangeRequests.status, REQUEST_STATUSES) },
        sorts: { asked: transportChangeRequests.createdAt, effective: transportChangeRequests.effectiveOn, name: students.fullName },
        defaultSort: { id: 'asked', dir: 'desc' },
      },
      fields: {
        student: studentField(),
        toStopId: { label: 'New stop', type: 'select', schema: z.uuid(), options: stopOptions, required: true, edit: false, apply: async () => undefined },
        effectiveOn: { label: 'From', type: 'date', schema: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-10-15'), column: transportChangeRequests.effectiveOn, required: true },
        reason: { label: 'Reason', type: 'textarea', schema: Text(500), column: transportChangeRequests.reason, required: true },
      },
      create: async (ctx, v) => {
        const s = await studentByRoll(ctx.tx, String(v.student));
        const [stop] = await ctx.tx.select().from(transportStops).where(eq(transportStops.id, String(v.toStopId)));
        if (!stop) throw new NotFoundException('Stop not found');
        const [cur] = await ctx.tx.select().from(transportAssignments).where(and(eq(transportAssignments.studentId, s.id), isNull(transportAssignments.endedOn)));
        const [r] = await ctx.tx.insert(transportChangeRequests).values({ tenantId: ctx.p.tenantId, studentId: s.id, fromRouteId: cur?.routeId ?? null, fromStopId: cur?.stopId ?? null, toRouteId: stop.routeId, toStopId: stop.id, effectiveOn: String(v.effectiveOn), reason: String(v.reason), requestedBy: ctx.p.userId }).returning({ id: transportChangeRequests.id });
        return r.id;
      },
      columns: [
        { key: 'rollNo', header: 'Roll no.' },
        { key: 'studentName', header: 'Student' },
        { key: 'fromRouteName', header: 'From route' },
        { key: 'toRouteName', header: 'To route' },
        { key: 'toStopName', header: 'To stop' },
        { key: 'effectiveOn', header: 'From' },
        { key: 'reason', header: 'Reason' },
        { key: 'status', header: 'Status' },
        { key: 'feeDeltaRupees', header: 'Fee difference (₹)' },
      ],
      actions: {
        approve: {
          label: 'Approve',
          apply: async (ctx, id) => {
            const [r] = await ctx.tx.select().from(transportChangeRequests).where(eq(transportChangeRequests.id, id)).for('update');
            if (r.status !== 'pending') throw new ConflictException(`This request is ${r.status}`);
            const today = await this.today(ctx);
            const on = r.effectiveOn < today ? today : r.effectiveOn;
            const [cur] = await ctx.tx.select().from(transportAssignments).where(and(eq(transportAssignments.studentId, r.studentId), isNull(transportAssignments.endedOn)));
            let delta = 0;
            if (cur) delta = (await moveRider(ctx, this.fees, this.clock.now(), cur.id, r.toStopId, on, r.reason)).deltaPaise;
            else {
              const left = await seatsLeft(ctx, r.toRouteId);
              if (left !== null && left <= 0) throw new ConflictException('The vehicle on that route is full');
              await ctx.tx.insert(transportAssignments).values({ tenantId: ctx.p.tenantId, studentId: r.studentId, kind: 'student', routeId: r.toRouteId, stopId: r.toStopId, startsOn: on });
            }
            await ctx.tx.update(transportChangeRequests).set({ status: 'approved', feeDeltaPaise: delta, decidedBy: ctx.p.userId, decidedAt: this.clock.now() }).where(eq(transportChangeRequests.id, id));
            await auditUser(ctx.tx, ctx.p, 'transport_change_request.approved', 'transport_change_request', id, { deltaPaise: delta, changes: { status: { before: 'pending', after: 'approved' } } });
            return delta ? `₹${(delta / 100).toFixed(2)}` : undefined;
          },
        },
        reject: { label: 'Reject', tone: 'danger', params: z.object({ note: z.string().trim().max(300).optional() }).default({}), apply: async (ctx, id, raw) => void (await this.status(ctx, transportChangeRequests, transportChangeRequests.id, 'transport_change_request', id, ['pending'], 'rejected', { decidedBy: ctx.p.userId, decidedAt: this.clock.now(), decisionNote: (raw as { note?: string }).note ?? '' })) },
      },
    };
  }

  // ---- upkeep ----------------------------------------------------------------------------------------------------------

  maintenance(): RecordEntity {
    const overdue = sql`${transportMaintenance.status} = 'scheduled' and ${transportMaintenance.dueOn} < current_date`;
    return {
      key: 'transport-maintenance',
      module: 'transport',
      table: transportMaintenance,
      subjectType: 'transport_maintenance',
      roles: { read: TRANSPORT_ROLES, write: TRANSPORT_ROLES },
      label: (r) => `${r.regNo} · ${r.kind}`,
      list: {
        select: { id: transportMaintenance.id, vehicleId: transportMaintenance.vehicleId, regNo: transportVehicles.regNo, kind: transportMaintenance.kind, dueOn: transportMaintenance.dueOn, dueKm: transportMaintenance.dueKm, doneOn: transportMaintenance.doneOn, odometerKm: transportMaintenance.odometerKm, costRupees: rupeesOf(transportMaintenance.costPaise), vendor: transportMaintenance.vendor, note: transportMaintenance.note, status: transportMaintenance.status, overdue: sql<boolean>`${overdue}` },
        joins: (q) => q.innerJoin(transportVehicles, eq(transportVehicles.id, transportMaintenance.vehicleId)),
        search: [transportVehicles.regNo, transportMaintenance.vendor, transportMaintenance.note],
        filters: { vehicle: { label: 'Vehicle', options: vehicleOptions, where: (v) => uuidEq(transportMaintenance.vehicleId, v) }, kind: choiceFilter('Kind', transportMaintenance.kind, MAINT_KINDS), status: choiceFilter('Status', transportMaintenance.status, MAINT_STATUSES), overdue: yesNo('Overdue', overdue, sql`not (${overdue})`) },
        sorts: { due: transportMaintenance.dueOn, done: transportMaintenance.doneOn, vehicle: transportVehicles.regNo },
        defaultSort: { id: 'due', dir: 'asc' },
      },
      fields: {
        vehicleId: { label: 'Vehicle', type: 'select', schema: z.uuid(), options: vehicleOptions, column: transportMaintenance.vehicleId, required: true },
        kind: { label: 'Work', type: 'select', schema: oneOf(MAINT_KINDS), options: MAINT_KINDS, column: transportMaintenance.kind, required: true },
        dueOn: { label: 'Due on', type: 'date', schema: DateText, column: transportMaintenance.dueOn, bulk: true },
        dueKm: { label: 'Due at (km)', type: 'number', schema: OptionalInt(0, 5_000_000), column: transportMaintenance.dueKm },
        vendor: { label: 'Workshop', type: 'text', schema: z.string().trim().max(120), column: transportMaintenance.vendor, bulk: true },
        note: { label: 'Note', type: 'textarea', schema: z.string().trim().max(500), column: transportMaintenance.note },
      },
      duplicate: () => ({ status: 'scheduled', done_on: null, odometer_km: null, cost_paise: 0 }),
      columns: [
        { key: 'regNo', header: 'Vehicle' },
        { key: 'kind', header: 'Work' },
        { key: 'dueOn', header: 'Due on' },
        { key: 'dueKm', header: 'Due at (km)' },
        { key: 'status', header: 'Status' },
        { key: 'doneOn', header: 'Done on' },
        { key: 'odometerKm', header: 'Odometer (km)' },
        { key: 'costRupees', header: 'Cost (₹)' },
        { key: 'vendor', header: 'Workshop' },
      ],
      actions: {
        done: {
          label: 'Done',
          params: z.object({ doneOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), odometerKm: z.coerce.number().int().min(0).max(5_000_000).optional(), cost: Rupees.default(0) }).default({ cost: 0 }),
          apply: async (ctx, id, raw) => {
            const p = raw as { doneOn?: string; odometerKm?: number; cost: number };
            const m = await this.status(ctx, transportMaintenance, transportMaintenance.id, 'transport_maintenance', id, ['scheduled'], 'done', { doneOn: p.doneOn ?? (await this.today(ctx)), odometerKm: p.odometerKm ?? null, costPaise: p.cost });
            // The cost goes into the vehicle's expense log too.
            if (p.cost > 0) {
              const [x] = await ctx.tx.select().from(transportMaintenance).where(eq(transportMaintenance.id, id));
              await ctx.tx.insert(transportExpenses).values({ tenantId: ctx.p.tenantId, vehicleId: x.vehicleId, kind: 'repair', spentOn: x.doneOn!, amountPaise: p.cost, odometerKm: p.odometerKm ?? null, note: `Maintenance: ${x.kind}${x.vendor ? ` at ${x.vendor}` : ''}`, createdBy: ctx.p.userId });
            }
            void m;
          },
        },
        cancel: { label: 'Cancel', tone: 'danger', apply: async (ctx, id) => void (await this.status(ctx, transportMaintenance, transportMaintenance.id, 'transport_maintenance', id, ['scheduled'], 'cancelled')) },
      },
    };
  }

  expenses(): RecordEntity {
    return {
      key: 'transport-expenses',
      module: 'transport',
      table: transportExpenses,
      subjectType: 'transport_expense',
      roles: { read: TRANSPORT_ROLES, write: TRANSPORT_ROLES },
      label: (r) => `${r.regNo} · ${r.kind} · ${r.spentOn}`,
      list: {
        select: { id: transportExpenses.id, vehicleId: transportExpenses.vehicleId, regNo: transportVehicles.regNo, kind: transportExpenses.kind, spentOn: transportExpenses.spentOn, amountRupees: rupeesOf(transportExpenses.amountPaise), litres: transportExpenses.litres, odometerKm: transportExpenses.odometerKm, note: transportExpenses.note },
        joins: (q) => q.innerJoin(transportVehicles, eq(transportVehicles.id, transportExpenses.vehicleId)),
        search: [transportVehicles.regNo, transportExpenses.note],
        filters: { vehicle: { label: 'Vehicle', options: vehicleOptions, where: (v) => uuidEq(transportExpenses.vehicleId, v) }, kind: choiceFilter('Kind', transportExpenses.kind, EXPENSE_KINDS), month: { label: 'Month', where: (v) => (/^\d{4}-\d{2}$/.test(v) ? sql`to_char(${transportExpenses.spentOn}, 'YYYY-MM') = ${v}` : undefined) } },
        sorts: { on: transportExpenses.spentOn, amount: transportExpenses.amountPaise, vehicle: transportVehicles.regNo },
        defaultSort: { id: 'on', dir: 'desc' },
      },
      fields: {
        vehicleId: { label: 'Vehicle', type: 'select', schema: z.uuid(), options: vehicleOptions, column: transportExpenses.vehicleId, required: true },
        kind: { label: 'Kind', type: 'select', schema: oneOf(EXPENSE_KINDS), options: EXPENSE_KINDS, column: transportExpenses.kind, required: true },
        spentOn: { label: 'On', type: 'date', schema: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-10-15'), column: transportExpenses.spentOn, required: true },
        amount: { label: 'Amount (₹)', type: 'number', schema: Rupees.refine((v) => v >= 100, 'At least ₹1'), column: transportExpenses.amountPaise, rowKey: 'amountRupees', required: true },
        litres: { label: 'Litres (fuel)', type: 'number', schema: OptionalDecimal(0, 2000), column: transportExpenses.litres },
        odometerKm: { label: 'Odometer (km)', type: 'number', schema: OptionalInt(0, 5_000_000), column: transportExpenses.odometerKm },
        note: { label: 'Note', type: 'text', schema: z.string().trim().max(200), column: transportExpenses.note },
      },
      create: async (ctx, v) => {
        if (v.kind === 'fuel' && v.litres == null) throw new BadRequestException({ formErrors: [], fieldErrors: { litres: ['Give the litres filled'] } });
        if (v.odometerKm != null) {
          const [prev] = await ctx.tx.select({ km: sql<number | null>`max(${transportExpenses.odometerKm})` }).from(transportExpenses).where(and(eq(transportExpenses.vehicleId, String(v.vehicleId)), lte(transportExpenses.spentOn, String(v.spentOn))));
          if (prev?.km != null && Number(v.odometerKm) < prev.km) throw new BadRequestException(`The odometer was already at ${prev.km} km`);
        }
        const [e] = await ctx.tx.insert(transportExpenses).values({ tenantId: ctx.p.tenantId, vehicleId: String(v.vehicleId), kind: v.kind as 'fuel', spentOn: String(v.spentOn), amountPaise: Number(v.amount), litres: (v.litres as number | null) ?? null, odometerKm: (v.odometerKm as number | null) ?? null, note: String(v.note ?? ''), createdBy: ctx.p.userId }).returning({ id: transportExpenses.id });
        return e.id;
      },
      columns: [
        { key: 'spentOn', header: 'On' },
        { key: 'regNo', header: 'Vehicle' },
        { key: 'kind', header: 'Kind' },
        { key: 'amountRupees', header: 'Amount (₹)' },
        { key: 'litres', header: 'Litres' },
        { key: 'odometerKm', header: 'Odometer (km)' },
        { key: 'note', header: 'Note' },
      ],
    };
  }

  incidents(): RecordEntity {
    return {
      key: 'transport-incidents',
      module: 'transport',
      table: transportIncidents,
      subjectType: 'transport_incident',
      roles: { read: TRANSPORT_ROLES, write: TRANSPORT_ROLES },
      label: (r) => `${r.kind} · ${r.regNo ?? ''} · ${String(r.occurredAt).slice(0, 10)}`,
      list: {
        select: { id: transportIncidents.id, vehicleId: transportIncidents.vehicleId, regNo: transportVehicles.regNo, tripId: transportIncidents.tripId, kind: transportIncidents.kind, severity: transportIncidents.severity, description: transportIncidents.description, occurredAt: transportIncidents.occurredAt, status: transportIncidents.status, resolution: transportIncidents.resolution, injuries: transportIncidents.injuries, policeReport: transportIncidents.policeReport, insurer: transportIncidents.insurer, claimNo: transportIncidents.claimNo, claimRupees: rupeesOf(transportIncidents.claimAmountPaise), claimStatus: transportIncidents.claimStatus, claimFiledOn: transportIncidents.claimFiledOn, settledRupees: rupeesOf(transportIncidents.settledPaise) },
        joins: (q) => q.leftJoin(transportVehicles, eq(transportVehicles.id, transportIncidents.vehicleId)),
        search: [transportIncidents.description, transportVehicles.regNo, transportIncidents.claimNo],
        filters: { kind: choiceFilter('Kind', transportIncidents.kind, INCIDENT_KINDS), severity: choiceFilter('Severity', transportIncidents.severity, SEVERITIES), status: choiceFilter('Status', transportIncidents.status, choices(['open', 'Open'], ['resolved', 'Resolved'])), claim: choiceFilter('Insurance claim', transportIncidents.claimStatus, CLAIM_STATUSES) },
        sorts: { when: transportIncidents.occurredAt, severity: transportIncidents.severity, vehicle: transportVehicles.regNo },
        defaultSort: { id: 'when', dir: 'desc' },
      },
      fields: {
        vehicleId: { label: 'Vehicle', type: 'select', schema: z.uuid(), options: vehicleOptions, column: transportIncidents.vehicleId, required: true },
        kind: { label: 'Kind', type: 'select', schema: oneOf(INCIDENT_KINDS), options: INCIDENT_KINDS, column: transportIncidents.kind, required: true },
        severity: { label: 'Severity', type: 'select', schema: oneOf(SEVERITIES), options: SEVERITIES, column: transportIncidents.severity, required: true, bulk: true },
        occurredOn: { label: 'On', type: 'date', schema: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-10-15'), required: true, edit: false, apply: async () => undefined },
        description: { label: 'What happened', type: 'textarea', schema: Text(1000), column: transportIncidents.description, required: true },
        injuries: { label: 'Injuries', type: 'textarea', schema: z.string().trim().max(500), column: transportIncidents.injuries },
        policeReport: { label: 'Police report (FIR) number', type: 'text', schema: z.string().trim().max(80), column: transportIncidents.policeReport },
        insurer: { label: 'Insurer', type: 'text', schema: z.string().trim().max(120), column: transportIncidents.insurer },
      },
      create: async (ctx, v) => {
        const [i] = await ctx.tx.insert(transportIncidents).values({ tenantId: ctx.p.tenantId, vehicleId: String(v.vehicleId), kind: v.kind as 'accident', severity: v.severity as 'low', description: String(v.description), occurredAt: new Date(`${String(v.occurredOn)}T06:30:00Z`), injuries: String(v.injuries ?? ''), policeReport: String(v.policeReport ?? ''), insurer: String(v.insurer ?? ''), reportedBy: ctx.p.userId }).returning({ id: transportIncidents.id });
        return i.id;
      },
      columns: [
        { key: 'occurredAt', header: 'When' },
        { key: 'regNo', header: 'Vehicle' },
        { key: 'kind', header: 'Kind' },
        { key: 'severity', header: 'Severity' },
        { key: 'description', header: 'What happened' },
        { key: 'injuries', header: 'Injuries' },
        { key: 'status', header: 'Status' },
        { key: 'insurer', header: 'Insurer' },
        { key: 'claimNo', header: 'Claim number' },
        { key: 'claimRupees', header: 'Claimed (₹)' },
        { key: 'claimStatus', header: 'Claim' },
        { key: 'settledRupees', header: 'Settled (₹)' },
      ],
      actions: {
        resolve: { label: 'Resolve', params: z.object({ resolution: z.string().trim().min(2, 'Say how it was resolved').max(500) }), apply: async (ctx, id, raw) => void (await this.status(ctx, transportIncidents, transportIncidents.id, 'transport_incident', id, ['open'], 'resolved', { resolution: (raw as { resolution: string }).resolution, resolvedAt: this.clock.now() })) },
        fileClaim: {
          label: 'File an insurance claim',
          params: z.object({ insurer: z.string().trim().min(2, 'Name the insurer').max(120), claimNo: z.string().trim().min(1, 'Give the claim number').max(80), amount: Rupees.refine((v) => v > 0, 'Give the amount claimed') }),
          apply: async (ctx, id, raw) => {
            const p = raw as { insurer: string; claimNo: string; amount: number };
            const [i] = await ctx.tx.select().from(transportIncidents).where(eq(transportIncidents.id, id)).for('update');
            if (i.claimStatus !== 'none' && i.claimStatus !== 'rejected') throw new ConflictException(`A claim is already ${i.claimStatus}`);
            await ctx.tx.update(transportIncidents).set({ insurer: p.insurer, claimNo: p.claimNo, claimAmountPaise: p.amount, claimStatus: 'filed', claimFiledOn: await this.today(ctx) }).where(eq(transportIncidents.id, id));
            await auditUser(ctx.tx, ctx.p, 'transport_incident.claim_filed', 'transport_incident', id, { claimNo: p.claimNo, amountPaise: p.amount, changes: { claimStatus: { before: i.claimStatus, after: 'filed' } } });
          },
        },
        settleClaim: {
          label: 'Claim settled',
          params: z.object({ amount: Rupees }),
          apply: async (ctx, id, raw) => {
            const [i] = await ctx.tx.select().from(transportIncidents).where(eq(transportIncidents.id, id)).for('update');
            if (i.claimStatus !== 'filed') throw new ConflictException('No claim is waiting');
            await ctx.tx.update(transportIncidents).set({ claimStatus: 'settled', settledPaise: (raw as { amount: number }).amount }).where(eq(transportIncidents.id, id));
            await auditUser(ctx.tx, ctx.p, 'transport_incident.claim_settled', 'transport_incident', id, { settledPaise: (raw as { amount: number }).amount, changes: { claimStatus: { before: 'filed', after: 'settled' } } });
          },
        },
        rejectClaim: {
          label: 'Claim rejected',
          tone: 'danger',
          apply: async (ctx, id) => {
            const [i] = await ctx.tx.update(transportIncidents).set({ claimStatus: 'rejected' }).where(and(eq(transportIncidents.id, id), eq(transportIncidents.claimStatus, 'filed'))).returning();
            if (!i) throw new ConflictException('No claim is waiting');
            await auditUser(ctx.tx, ctx.p, 'transport_incident.claim_rejected', 'transport_incident', id, { changes: { claimStatus: { before: 'filed', after: 'rejected' } } });
          },
        },
      },
    };
  }

  // ---- changes, people at the stop, duty -----------------------------------------------------------------------------

  overrides(): RecordEntity {
    return {
      key: 'transport-overrides',
      module: 'transport',
      table: transportRouteOverrides,
      subjectType: 'transport_override',
      roles: { read: TRANSPORT_ROLES, write: TRANSPORT_ROLES },
      label: (r) => `${r.routeName} · ${r.fromOn}`,
      list: {
        select: { id: transportRouteOverrides.id, routeId: transportRouteOverrides.routeId, routeName: transportRoutes.name, fromOn: transportRouteOverrides.fromOn, untilOn: transportRouteOverrides.untilOn, kind: transportRouteOverrides.kind, substituteVehicleId: transportRouteOverrides.substituteVehicleId, substituteRegNo: subVehicle.regNo, substituteDriverId: transportRouteOverrides.substituteDriverId, substituteDriver: subDriver.fullName, shiftMinutes: transportRouteOverrides.shiftMinutes, reason: transportRouteOverrides.reason, notifiedAt: transportRouteOverrides.notifiedAt, current: sql<boolean>`current_date between ${transportRouteOverrides.fromOn} and ${transportRouteOverrides.untilOn}` },
        joins: (q) => q.innerJoin(transportRoutes, eq(transportRoutes.id, transportRouteOverrides.routeId)).leftJoin(subVehicle, eq(subVehicle.id, transportRouteOverrides.substituteVehicleId)).leftJoin(subDriver, eq(subDriver.id, transportRouteOverrides.substituteDriverId)),
        search: [transportRoutes.name, transportRouteOverrides.reason],
        filters: { route: { label: 'Route', options: routeOptions, where: (v) => uuidEq(transportRouteOverrides.routeId, v) }, kind: choiceFilter('Change', transportRouteOverrides.kind, OVERRIDE_KINDS), when: { label: 'When', options: choices(['now', 'In force now'], ['coming', 'Coming up'], ['past', 'Past']), where: (v) => (v === 'now' ? sql`current_date between ${transportRouteOverrides.fromOn} and ${transportRouteOverrides.untilOn}` : v === 'coming' ? sql`${transportRouteOverrides.fromOn} > current_date` : v === 'past' ? sql`${transportRouteOverrides.untilOn} < current_date` : undefined) } },
        sorts: { from: transportRouteOverrides.fromOn, route: transportRoutes.name },
        defaultSort: { id: 'from', dir: 'desc' },
      },
      fields: {
        routeId: { label: 'Route', type: 'select', schema: z.uuid(), options: routeOptions, column: transportRouteOverrides.routeId, required: true },
        kind: { label: 'Change', type: 'select', schema: oneOf(OVERRIDE_KINDS), options: OVERRIDE_KINDS, column: transportRouteOverrides.kind, required: true },
        fromOn: { label: 'From', type: 'date', schema: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-10-15'), column: transportRouteOverrides.fromOn, required: true },
        untilOn: { label: 'Until', type: 'date', schema: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-10-15'), column: transportRouteOverrides.untilOn, required: true },
        substituteVehicleId: { label: 'Substitute vehicle', type: 'select', schema: OptionalRef, options: vehicleOptions, column: transportRouteOverrides.substituteVehicleId },
        substituteDriverId: { label: 'Substitute driver', type: 'select', schema: OptionalRef, options: driverOptions, column: transportRouteOverrides.substituteDriverId },
        shiftMinutes: { label: 'Timings move by (minutes)', type: 'number', schema: z.coerce.number().int().min(-240).max(240), column: transportRouteOverrides.shiftMinutes, help: 'Negative for earlier, e.g. -30 on exam days' },
        reason: { label: 'Reason', type: 'text', schema: Text(300), column: transportRouteOverrides.reason, required: true },
      },
      create: async (ctx, v) => {
        if (String(v.untilOn) < String(v.fromOn)) throw new BadRequestException('The end is before the start');
        if (v.kind === 'vehicle' && !v.substituteVehicleId) throw new BadRequestException({ formErrors: [], fieldErrors: { substituteVehicleId: ['Choose the substitute vehicle'] } });
        if (v.kind === 'driver' && !v.substituteDriverId) throw new BadRequestException({ formErrors: [], fieldErrors: { substituteDriverId: ['Choose the substitute driver'] } });
        const [o] = await ctx.tx.insert(transportRouteOverrides).values({ tenantId: ctx.p.tenantId, routeId: String(v.routeId), kind: String(v.kind), fromOn: String(v.fromOn), untilOn: String(v.untilOn), substituteVehicleId: (v.substituteVehicleId as string | null) ?? null, substituteDriverId: (v.substituteDriverId as string | null) ?? null, shiftMinutes: Number(v.shiftMinutes ?? 0), reason: String(v.reason), createdBy: ctx.p.userId }).returning({ id: transportRouteOverrides.id });
        return o.id;
      },
      columns: [
        { key: 'routeName', header: 'Route' },
        { key: 'kind', header: 'Change' },
        { key: 'fromOn', header: 'From' },
        { key: 'untilOn', header: 'Until' },
        { key: 'substituteRegNo', header: 'Substitute vehicle' },
        { key: 'substituteDriver', header: 'Substitute driver' },
        { key: 'shiftMinutes', header: 'Timings move (min)' },
        { key: 'reason', header: 'Reason' },
        { key: 'notifiedAt', header: 'Families told' },
      ],
      actions: {
        notify: {
          label: 'Tell the families',
          apply: async (ctx, id) => {
            const [o] = await ctx.tx.select({ o: transportRouteOverrides, route: transportRoutes.name, reg: subVehicle.regNo }).from(transportRouteOverrides).innerJoin(transportRoutes, eq(transportRoutes.id, transportRouteOverrides.routeId)).leftJoin(subVehicle, eq(subVehicle.id, transportRouteOverrides.substituteVehicleId)).where(eq(transportRouteOverrides.id, id));
            const riders = await ctx.tx.select({ id: transportAssignments.studentId, staff: transportAssignments.staffUserId }).from(transportAssignments).where(and(eq(transportAssignments.routeId, o.o.routeId), isNull(transportAssignments.endedOn)));
            const people = new Set<string>();
            for (const r of riders) {
              if (r.id) for (const u of await familyUserIds(ctx.tx, r.id)) people.add(u);
              if (r.staff) people.add(r.staff);
            }
            const when = o.o.fromOn === o.o.untilOn ? o.o.fromOn : `${o.o.fromOn} – ${o.o.untilOn}`;
            const what = {
              en: o.o.kind === 'cancelled' ? 'will not run' : o.o.kind === 'vehicle' ? `runs with bus ${o.reg}` : o.o.kind === 'driver' ? 'has a substitute driver' : `runs ${Math.abs(o.o.shiftMinutes)} minutes ${o.o.shiftMinutes < 0 ? 'earlier' : 'later'}`,
              hi: o.o.kind === 'cancelled' ? 'नहीं चलेगा' : o.o.kind === 'vehicle' ? `बस ${o.reg} से चलेगा` : o.o.kind === 'driver' ? 'दूसरे चालक के साथ चलेगा' : `${Math.abs(o.o.shiftMinutes)} मिनट ${o.o.shiftMinutes < 0 ? 'पहले' : 'देर से'} चलेगा`,
              kn: o.o.kind === 'cancelled' ? 'ಓಡುವುದಿಲ್ಲ' : o.o.kind === 'vehicle' ? `ಬಸ್ ${o.reg} ಮೂಲಕ ಓಡುತ್ತದೆ` : o.o.kind === 'driver' ? 'ಬದಲಿ ಚಾಲಕರೊಂದಿಗೆ ಓಡುತ್ತದೆ' : `${Math.abs(o.o.shiftMinutes)} ನಿಮಿಷ ${o.o.shiftMinutes < 0 ? 'ಮುಂಚೆ' : 'ತಡವಾಗಿ'} ಓಡುತ್ತದೆ`,
            };
            await this.notifications.notifyUsers(ctx.tx, [...people], {
              kind: 'transport',
              text: {
                en: { title: `Route ${o.route}: change on ${when}`, body: `Route ${o.route} ${what.en} (${when}). ${o.o.reason}` },
                hi: { title: `मार्ग ${o.route}: ${when} को बदलाव`, body: `मार्ग ${o.route} ${what.hi} (${when})। ${o.o.reason}` },
                kn: { title: `ಮಾರ್ಗ ${o.route}: ${when} ರಂದು ಬದಲಾವಣೆ`, body: `ಮಾರ್ಗ ${o.route} ${what.kn} (${when}). ${o.o.reason}` },
              },
              data: { routeId: o.o.routeId, overrideId: id },
              dedupeKey: `transport-override:${id}`,
            });
            await ctx.tx.update(transportRouteOverrides).set({ notifiedAt: this.clock.now() }).where(eq(transportRouteOverrides.id, id));
            await auditUser(ctx.tx, ctx.p, 'transport_override.notified', 'transport_override', id, { people: people.size });
            return `${people.size}`;
          },
        },
      },
    };
  }

  pickupPersons(): RecordEntity {
    return {
      key: 'transport-pickup-persons',
      module: 'transport',
      table: transportPickupPersons,
      subjectType: 'transport_pickup_person',
      roles: { read: TRANSPORT_ROLES, write: TRANSPORT_ROLES },
      label: (r) => `${r.name} for ${r.studentName}`,
      list: {
        select: { id: transportPickupPersons.id, studentId: transportPickupPersons.studentId, rollNo: students.rollNo, studentName: students.fullName, className: sections.displayName, name: transportPickupPersons.name, relation: transportPickupPersons.relation, phone: transportPickupPersons.phone, idProof: transportPickupPersons.idProof, photoUrl: transportPickupPersons.photoUrl, active: transportPickupPersons.active },
        joins: (q) => q.innerJoin(students, eq(students.id, transportPickupPersons.studentId)).innerJoin(sections, eq(sections.id, students.sectionId)),
        search: [students.fullName, students.rollNo, transportPickupPersons.name, transportPickupPersons.phone],
        filters: { active: yesNo('Allowed', eq(transportPickupPersons.active, true), eq(transportPickupPersons.active, false), ['Allowed', 'No longer allowed']) },
        sorts: { student: students.fullName, name: transportPickupPersons.name },
        defaultSort: { id: 'student', dir: 'asc' },
      },
      fields: {
        student: studentField(),
        name: { label: 'Name', type: 'text', schema: Text(120), column: transportPickupPersons.name, required: true },
        relation: { label: 'Relation', type: 'text', schema: z.string().trim().max(60), column: transportPickupPersons.relation },
        phone: { label: 'Phone', type: 'phone', schema: z.string().trim().max(20), column: transportPickupPersons.phone },
        idProof: { label: 'ID proof', type: 'text', schema: z.string().trim().max(80), column: transportPickupPersons.idProof },
        photoUrl: { label: 'Photo link', type: 'text', schema: z.union([z.literal(''), z.url()]), column: transportPickupPersons.photoUrl },
        active: { label: 'Allowed', type: 'boolean', schema: Bool, column: transportPickupPersons.active, create: false, bulk: true },
      },
      create: async (ctx, v) => {
        const s = await studentByRoll(ctx.tx, String(v.student));
        const [row] = await ctx.tx.insert(transportPickupPersons).values({ tenantId: ctx.p.tenantId, studentId: s.id, name: String(v.name), relation: String(v.relation ?? ''), phone: String(v.phone ?? ''), idProof: String(v.idProof ?? ''), photoUrl: String(v.photoUrl ?? '') }).returning({ id: transportPickupPersons.id });
        return row.id;
      },
      columns: [
        { key: 'studentName', header: 'Student' },
        { key: 'rollNo', header: 'Roll no.' },
        { key: 'name', header: 'May receive' },
        { key: 'relation', header: 'Relation' },
        { key: 'phone', header: 'Phone' },
        { key: 'idProof', header: 'ID proof' },
        { key: 'active', header: 'Allowed' },
      ],
    };
  }

  handovers(): RecordEntity {
    return {
      key: 'transport-handovers',
      module: 'transport',
      table: transportHandovers,
      subjectType: 'transport_handover',
      roles: { read: TRANSPORT_ROLES, write: TRANSPORT_ROLES },
      label: (r) => `${r.studentName} · ${String(r.createdAt).slice(0, 10)}`,
      list: {
        select: { id: transportHandovers.id, studentId: transportHandovers.studentId, rollNo: students.rollNo, studentName: students.fullName, personName: transportPickupPersons.name, method: transportHandovers.method, status: transportHandovers.status, handedAt: transportHandovers.handedAt, attempts: transportHandovers.attempts, note: transportHandovers.note, recordedByName: users.fullName, createdAt: transportHandovers.createdAt },
        joins: (q) => q.innerJoin(students, eq(students.id, transportHandovers.studentId)).leftJoin(transportPickupPersons, eq(transportPickupPersons.id, transportHandovers.personId)).leftJoin(users, eq(users.id, transportHandovers.recordedBy)),
        search: [students.fullName, students.rollNo, transportPickupPersons.name],
        filters: { method: choiceFilter('How', transportHandovers.method, choices(['otp', 'One-time code'], ['photo', 'Photo check'])), status: choiceFilter('Status', transportHandovers.status, choices(['pending', 'Waiting'], ['done', 'Handed over'], ['refused', 'Refused'])) },
        sorts: { at: transportHandovers.createdAt, student: students.fullName },
        defaultSort: { id: 'at', dir: 'desc' },
      },
      columns: [
        { key: 'createdAt', header: 'When' },
        { key: 'studentName', header: 'Student' },
        { key: 'personName', header: 'Received by' },
        { key: 'method', header: 'How' },
        { key: 'status', header: 'Status' },
        { key: 'handedAt', header: 'Handed over' },
        { key: 'recordedByName', header: 'Recorded by' },
      ],
      remove: { guard: async () => 'Hand-overs are a safety record and are kept' },
    };
  }

  duty(): RecordEntity {
    return {
      key: 'transport-duty',
      module: 'transport',
      table: transportDriverDuty,
      subjectType: 'transport_duty',
      roles: { read: TRANSPORT_ROLES, write: TRANSPORT_ROLES },
      label: (r) => `${r.dutyOn} · ${r.driverName}`,
      list: {
        select: { id: transportDriverDuty.id, driverId: transportDriverDuty.driverId, driverName: transportDrivers.fullName, dutyOn: transportDriverDuty.dutyOn, routeId: transportDriverDuty.routeId, routeName: transportRoutes.name, status: transportDriverDuty.status, substituteDriverId: transportDriverDuty.substituteDriverId, substituteName: subDriver.fullName, note: transportDriverDuty.note, uncovered: sql<boolean>`${transportDriverDuty.status} <> 'present' and ${transportDriverDuty.routeId} is not null and ${transportDriverDuty.substituteDriverId} is null` },
        joins: (q) => q.innerJoin(transportDrivers, eq(transportDrivers.id, transportDriverDuty.driverId)).leftJoin(transportRoutes, eq(transportRoutes.id, transportDriverDuty.routeId)).leftJoin(subDriver, eq(subDriver.id, transportDriverDuty.substituteDriverId)),
        search: [transportDrivers.fullName, transportRoutes.name],
        filters: { status: choiceFilter('Status', transportDriverDuty.status, DUTY_STATUSES), day: { label: 'Day', options: choices(['today', 'Today'], ['week', 'Last 7 days']), where: (v) => (v === 'today' ? sql`${transportDriverDuty.dutyOn} = current_date` : v === 'week' ? sql`${transportDriverDuty.dutyOn} > current_date - 7` : undefined) }, uncovered: yesNo('Route uncovered', sql`${transportDriverDuty.status} <> 'present' and ${transportDriverDuty.routeId} is not null and ${transportDriverDuty.substituteDriverId} is null`, sql`not (${transportDriverDuty.status} <> 'present' and ${transportDriverDuty.routeId} is not null and ${transportDriverDuty.substituteDriverId} is null)`, ['Needs a substitute', 'Covered']) },
        sorts: { day: transportDriverDuty.dutyOn, driver: transportDrivers.fullName },
        defaultSort: { id: 'day', dir: 'desc' },
        tiebreak: [transportDrivers.fullName],
      },
      fields: {
        driverId: { label: 'Driver', type: 'select', schema: z.uuid(), options: driverOptions, column: transportDriverDuty.driverId, required: true },
        dutyOn: { label: 'Day', type: 'date', schema: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-10-15'), column: transportDriverDuty.dutyOn, required: true },
        routeId: { label: 'Route', type: 'select', schema: OptionalRef, options: routeOptions, column: transportDriverDuty.routeId },
        status: { label: 'Status', type: 'select', schema: oneOf(DUTY_STATUSES), options: DUTY_STATUSES, column: transportDriverDuty.status, required: true, bulk: true },
        substituteDriverId: { label: 'Covered by', type: 'select', schema: OptionalRef, options: driverOptions, column: transportDriverDuty.substituteDriverId, help: 'A driver from the spare pool' },
        note: { label: 'Note', type: 'text', schema: z.string().trim().max(200), column: transportDriverDuty.note },
      },
      columns: [
        { key: 'dutyOn', header: 'Day' },
        { key: 'driverName', header: 'Driver' },
        { key: 'routeName', header: 'Route' },
        { key: 'status', header: 'Status' },
        { key: 'substituteName', header: 'Covered by' },
        { key: 'note', header: 'Note' },
      ],
      actions: {
        absent: {
          label: 'Absent, covered by a spare driver',
          params: z.object({ substituteDriverId: z.uuid().optional() }).default({}),
          apply: async (ctx, id, raw) => {
            const [d] = await ctx.tx.select().from(transportDriverDuty).where(eq(transportDriverDuty.id, id)).for('update');
            let sub = (raw as { substituteDriverId?: string }).substituteDriverId ?? null;
            if (!sub) {
              // The first spare driver not already covering or driving that day.
              const [free] = await ctx.tx
                .select({ id: transportDrivers.id })
                .from(transportDrivers)
                .where(and(eq(transportDrivers.isSpare, true), eq(transportDrivers.active, true), sql`not exists (select 1 from transport_driver_duty x where x.duty_on = ${d.dutyOn}::date and (x.substitute_driver_id = ${qual(transportDrivers.id)} or (x.driver_id = ${qual(transportDrivers.id)} and x.status = 'present' and x.route_id is not null)))`))
                .orderBy(asc(transportDrivers.fullName))
                .limit(1);
              sub = free?.id ?? null;
            }
            if (!sub) throw new ConflictException('No spare driver is free that day');
            if (sub === d.driverId) throw new BadRequestException('A driver cannot cover for themselves');
            await ctx.tx.update(transportDriverDuty).set({ status: 'absent', substituteDriverId: sub }).where(eq(transportDriverDuty.id, id));
            // The route runs with the substitute that day.
            if (d.routeId) await ctx.tx.insert(transportRouteOverrides).values({ tenantId: ctx.p.tenantId, routeId: d.routeId, fromOn: d.dutyOn, untilOn: d.dutyOn, kind: 'driver', substituteDriverId: sub, reason: 'Regular driver absent', createdBy: ctx.p.userId });
            await auditUser(ctx.tx, ctx.p, 'transport_duty.absent', 'transport_duty', id, { substituteDriverId: sub, changes: { status: { before: d.status, after: 'absent' } } });
            const [n] = await ctx.tx.select({ name: transportDrivers.fullName }).from(transportDrivers).where(eq(transportDrivers.id, sub));
            return n?.name;
          },
        },
      },
    };
  }

  alerts(): RecordEntity {
    return {
      key: 'transport-alerts',
      module: 'transport',
      table: transportTripEvents,
      subjectType: 'transport_alert',
      roles: { read: TRANSPORT_ROLES, write: TRANSPORT_ROLES },
      label: (r) => `${r.kind} · ${r.routeName}`,
      list: {
        select: { id: transportTripEvents.id, tripId: transportTripEvents.tripId, kind: transportTripEvents.kind, at: transportTripEvents.at, routeName: transportRoutes.name, regNo: transportVehicles.regNo, speedKmh: transportTripEvents.speedKmh, lat: transportTripEvents.lat, lng: transportTripEvents.lng, detail: transportTripEvents.detail, acknowledgedAt: transportTripEvents.acknowledgedAt, acknowledgedBy: ackUser.fullName },
        joins: (q) => q.innerJoin(transportTrips, eq(transportTrips.id, transportTripEvents.tripId)).innerJoin(transportRoutes, eq(transportRoutes.id, transportTrips.routeId)).leftJoin(transportVehicles, eq(transportVehicles.id, transportRoutes.vehicleId)).leftJoin(ackUser, eq(ackUser.id, transportTripEvents.acknowledgedBy)),
        search: [transportRoutes.name, transportVehicles.regNo],
        filters: { kind: { label: 'Alert', options: ALERT_KINDS, where: (v) => (ALERT_KINDS.some((k) => k.value === v) ? eq(transportTripEvents.kind, v) : undefined) }, open: yesNo('Seen', sql`${transportTripEvents.acknowledgedAt} is not null`, isNull(transportTripEvents.acknowledgedAt), ['Seen', 'Not yet seen']), route: { label: 'Route', options: routeOptions, where: (v) => uuidEq(transportTrips.routeId, v) } },
        sorts: { at: transportTripEvents.at, speed: transportTripEvents.speedKmh },
        defaultSort: { id: 'at', dir: 'desc' },
        scope: () => inArray(transportTripEvents.kind, ['overspeed', 'deviation']),
      },
      columns: [
        { key: 'at', header: 'When' },
        { key: 'kind', header: 'Alert' },
        { key: 'routeName', header: 'Route' },
        { key: 'regNo', header: 'Vehicle' },
        { key: 'speedKmh', header: 'Speed (km/h)' },
        { key: 'detail', header: 'Detail' },
        { key: 'acknowledgedBy', header: 'Seen by' },
      ],
      remove: { guard: async () => 'Alerts are kept with the trip log' },
      actions: {
        acknowledge: {
          label: 'Seen',
          apply: async (ctx, id) => {
            const [e] = await ctx.tx.update(transportTripEvents).set({ acknowledgedBy: ctx.p.userId, acknowledgedAt: this.clock.now() }).where(and(eq(transportTripEvents.id, id), isNull(transportTripEvents.acknowledgedAt))).returning();
            if (!e) throw new ConflictException('Already seen');
            await auditUser(ctx.tx, ctx.p, 'transport_alert.acknowledged', 'transport_alert', id);
          },
        },
      },
    };
  }

  trips(): RecordEntity {
    return {
      key: 'transport-trips',
      module: 'transport',
      table: transportTrips,
      subjectType: 'transport_trip',
      roles: { read: TRANSPORT_ROLES, write: TRANSPORT_ROLES },
      label: (r) => `${r.routeName} · ${r.direction}`,
      list: {
        select: { id: transportTrips.id, routeId: transportTrips.routeId, routeName: transportRoutes.name, direction: transportTrips.direction, driverName: users.fullName, status: transportTrips.status, startedAt: transportTrips.startedAt, endedAt: transportTrips.endedAt, pings: transportTrips.pings, stopsReached: transportTrips.lastStopSeq, minutes: sql<number | null>`(extract(epoch from (coalesce(${transportTrips.endedAt}, now()) - ${transportTrips.startedAt})) / 60)::int`, alerts: sql<number>`(select count(*)::int from transport_trip_events e where e.trip_id = ${qual(transportTrips.id)} and e.kind in ('overspeed', 'deviation'))` },
        joins: (q) => q.innerJoin(transportRoutes, eq(transportRoutes.id, transportTrips.routeId)).innerJoin(users, eq(users.id, transportTrips.driverUserId)),
        search: [transportRoutes.name, users.fullName],
        filters: { route: { label: 'Route', options: routeOptions, where: (v) => uuidEq(transportTrips.routeId, v) }, status: choiceFilter('Status', transportTrips.status, choices(['running', 'Running'], ['ended', 'Ended'])), direction: choiceFilter('Direction', transportTrips.direction, choices(['pickup', 'Pick-up'], ['drop', 'Drop'])) },
        sorts: { started: transportTrips.startedAt, route: transportRoutes.name },
        defaultSort: { id: 'started', dir: 'desc' },
      },
      columns: [
        { key: 'startedAt', header: 'Started' },
        { key: 'endedAt', header: 'Ended' },
        { key: 'routeName', header: 'Route' },
        { key: 'direction', header: 'Direction' },
        { key: 'driverName', header: 'Driver' },
        { key: 'status', header: 'Status' },
        { key: 'stopsReached', header: 'Stops reached' },
        { key: 'minutes', header: 'Minutes' },
        { key: 'alerts', header: 'Alerts' },
      ],
      remove: { guard: async () => 'Trips are kept as the trip log' },
    };
  }
}
