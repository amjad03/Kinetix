import { BadRequestException, Body, ConflictException, Controller, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { RealtimeEvents, type TransportPositionEvent } from '@kinetix/shared';
import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { RoleName, UserPrincipal } from '../auth/principal.js';
import { audit } from '../common/audit.js';
import { Day, etaMinutes, haversineM, orConflict, Paise } from '../common/ops.js';
import { assertCanSeeStudent } from '../common/student-access.js';
import { Clock, localParts } from '../common/time.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService, type Tx } from '../db/db.service.js';
import { students, tenants, transportAssignments, transportDrivers, transportRoutes, transportStops, transportTripEvents, transportTrips, transportVehicles, userRoles } from '../db/schema.js';
import { FeesService } from '../fees/fees.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { RealtimeGateway } from '../realtime/realtime.gateway.js';

export const TRANSPORT_ROLES: RoleName[] = ['transport_manager', 'tenant_admin', 'principal'];
/** Within this distance of the next stop, families riding from it are told the bus is arriving. */
const APPROACH_M = 500;
/** Within this distance the stop counts as reached. */
const REACHED_M = 120;

const Lat = z.number().min(-90).max(90);
const Lng = z.number().min(-180).max(180);
const Hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

const VehicleBody = z.object({
  regNo: z.string().trim().min(3).max(20).transform((s) => s.toUpperCase()),
  model: z.string().trim().max(80).default(''),
  capacity: z.number().int().min(1).max(100),
  status: z.enum(['active', 'maintenance', 'retired']).default('active'),
  insuranceExpiresOn: Day.optional(),
  fitnessExpiresOn: Day.optional(),
  pucExpiresOn: Day.optional(),
});
const DriverBody = z.object({
  fullName: z.string().trim().min(1).max(120),
  phone: z.string().trim().max(20).default(''),
  role: z.enum(['driver', 'conductor']).default('driver'),
  licenseNo: z.string().trim().max(40).optional(),
  licenseExpiresOn: Day.optional(),
  /** A login for the Teacher App's driver mode. */
  userId: z.uuid().optional(),
});
const RouteBody = z.object({ name: z.string().trim().min(1).max(80), vehicleId: z.uuid().optional(), driverId: z.uuid().optional(), monthlyFeePaise: Paise.default(0) });
const RoutePatch = z.object({ name: z.string().trim().min(1).max(80).optional(), vehicleId: z.uuid().nullable().optional(), driverId: z.uuid().nullable().optional(), monthlyFeePaise: Paise.optional(), active: z.boolean().optional() });
const StopBody = z.object({ name: z.string().trim().min(1).max(100), lat: Lat, lng: Lng, pickupTime: Hhmm.optional(), seq: z.number().int().min(1).max(200).optional() });
const AssignBody = z.object({ studentId: z.uuid(), routeId: z.uuid(), stopId: z.uuid(), startsOn: Day.optional() });
const FeeBody = z.object({ title: z.string().trim().min(1).max(120), dueOn: Day, routeId: z.uuid().optional() });
const TripBody = z.object({ routeId: z.uuid(), direction: z.enum(['pickup', 'drop']) });
const PingBody = z.object({ lat: Lat, lng: Lng, speedKmh: z.number().min(0).max(200).optional() });

/**
 * Transport: vehicles, drivers, routes and stops, each student's seat and transport fee (charged
 * through the fees module), and live trips. The driver's phone posts its position; the server
 * fans it out over the realtime gateway to the families riding the route, tells a stop's
 * families when the bus is close, and keeps the trip log.
 */
@Controller('v1/transport')
export class TransportController {
  constructor(
    private readonly db: DbService,
    private readonly clock: Clock,
    private readonly fees: FeesService,
    private readonly notifications: NotificationsService,
    private readonly gateway: RealtimeGateway,
  ) {}

  // --- Masters ---------------------------------------------------------------------------

  @Get('vehicles')
  @Auth('user', TRANSPORT_ROLES)
  vehicles(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, (tx) => tx.select().from(transportVehicles).orderBy(asc(transportVehicles.regNo)));
  }

  @Post('vehicles')
  @Auth('user', TRANSPORT_ROLES)
  addVehicle(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(VehicleBody)) b: z.infer<typeof VehicleBody>) {
    return orConflict('A vehicle with this registration number already exists', () =>
      this.db.withTenant(p.tenantId, async (tx) => {
        const [v] = await tx.insert(transportVehicles).values({ tenantId: p.tenantId, ...b }).returning();
        await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'transport.vehicle_added', subjectType: 'transport_vehicle', subjectId: v.id });
        return v;
      }),
    );
  }

  @Get('drivers')
  @Auth('user', TRANSPORT_ROLES)
  drivers(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, (tx) => tx.select().from(transportDrivers).orderBy(asc(transportDrivers.fullName)));
  }

  @Post('drivers')
  @Auth('user', TRANSPORT_ROLES)
  addDriver(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(DriverBody)) b: z.infer<typeof DriverBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [d] = await tx.insert(transportDrivers).values({ tenantId: p.tenantId, ...b }).returning();
      // A driver with a login gets the driver role, which opens driver mode in the Teacher App.
      if (b.userId) await tx.insert(userRoles).values({ tenantId: p.tenantId, userId: b.userId, role: 'driver' }).onConflictDoNothing();
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'transport.driver_added', subjectType: 'transport_driver', subjectId: d.id });
      return d;
    });
  }

  /** Vehicle papers and licences that expire within 30 days (or already have). */
  @Get('compliance')
  @Auth('user', TRANSPORT_ROLES)
  compliance(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const today = await this.today(tx);
      const limit = sql`(${today}::date + 30)`;
      const v = await tx.select().from(transportVehicles).where(sql`${transportVehicles.status} <> 'retired' and (${transportVehicles.insuranceExpiresOn} <= ${limit} or ${transportVehicles.fitnessExpiresOn} <= ${limit} or ${transportVehicles.pucExpiresOn} <= ${limit})`);
      const d = await tx.select().from(transportDrivers).where(sql`${transportDrivers.active} and ${transportDrivers.licenseExpiresOn} <= ${limit}`);
      return {
        today,
        items: [
          ...v.flatMap((x) => (['insuranceExpiresOn', 'fitnessExpiresOn', 'pucExpiresOn'] as const).filter((k) => x[k] && x[k]! <= addDays(today, 30)).map((k) => ({ kind: k.replace('ExpiresOn', ''), subject: x.regNo, expiresOn: x[k]!, expired: x[k]! < today }))),
          ...d.map((x) => ({ kind: 'licence', subject: x.fullName, expiresOn: x.licenseExpiresOn!, expired: x.licenseExpiresOn! < today })),
        ].sort((a, b) => a.expiresOn.localeCompare(b.expiresOn)),
      };
    });
  }

  // --- Routes and stops ------------------------------------------------------------------

  @Get('routes')
  @Auth('user', TRANSPORT_ROLES)
  routes(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, (tx) =>
      tx
        .select({
          id: transportRoutes.id,
          name: transportRoutes.name,
          monthlyFeePaise: transportRoutes.monthlyFeePaise,
          active: transportRoutes.active,
          vehicleId: transportRoutes.vehicleId,
          regNo: transportVehicles.regNo,
          capacity: transportVehicles.capacity,
          driverId: transportRoutes.driverId,
          driverName: transportDrivers.fullName,
          riders: sql<number>`(select count(*)::int from transport_assignments a where a.route_id = "transport_routes"."id" and a.ended_on is null)`,
          stops: sql<number>`(select count(*)::int from transport_stops s where s.route_id = "transport_routes"."id")`,
        })
        .from(transportRoutes)
        .leftJoin(transportVehicles, eq(transportVehicles.id, transportRoutes.vehicleId))
        .leftJoin(transportDrivers, eq(transportDrivers.id, transportRoutes.driverId))
        .orderBy(asc(transportRoutes.name)),
    );
  }

  @Post('routes')
  @Auth('user', TRANSPORT_ROLES)
  addRoute(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(RouteBody)) b: z.infer<typeof RouteBody>) {
    return orConflict('A route with this name already exists', () =>
      this.db.withTenant(p.tenantId, async (tx) => {
        await this.assertRefs(tx, b);
        const [r] = await tx.insert(transportRoutes).values({ tenantId: p.tenantId, ...b }).returning();
        await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'transport.route_added', subjectType: 'transport_route', subjectId: r.id });
        return r;
      }),
    );
  }

  @Patch('routes/:id')
  @Auth('user', TRANSPORT_ROLES)
  updateRoute(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(RoutePatch)) b: z.infer<typeof RoutePatch>) {
    return orConflict('A route with this name already exists', () =>
      this.db.withTenant(p.tenantId, async (tx) => {
        await this.assertRefs(tx, b);
        const [r] = await tx.update(transportRoutes).set(b).where(eq(transportRoutes.id, id)).returning();
        if (!r) throw new NotFoundException('Route not found');
        await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'transport.route_updated', subjectType: 'transport_route', subjectId: id, data: b });
        return r;
      }),
    );
  }

  @Get('routes/:id')
  @Auth('user', TRANSPORT_ROLES)
  route(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [route] = await tx.select().from(transportRoutes).where(eq(transportRoutes.id, id));
      if (!route) throw new NotFoundException('Route not found');
      const stops = await tx.select().from(transportStops).where(eq(transportStops.routeId, id)).orderBy(asc(transportStops.seq));
      const riders = await tx
        .select({ studentId: students.id, fullName: students.fullName, rollNo: students.rollNo, stopId: transportAssignments.stopId })
        .from(transportAssignments)
        .innerJoin(students, eq(students.id, transportAssignments.studentId))
        .where(and(eq(transportAssignments.routeId, id), isNull(transportAssignments.endedOn)))
        .orderBy(asc(students.fullName));
      return { ...route, stops, riders };
    });
  }

  @Post('routes/:id/stops')
  @Auth('user', TRANSPORT_ROLES)
  addStop(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(StopBody)) b: z.infer<typeof StopBody>) {
    return orConflict('That stop number is already used on this route', () =>
      this.db.withTenant(p.tenantId, async (tx) => {
        const [route] = await tx.select({ id: transportRoutes.id }).from(transportRoutes).where(eq(transportRoutes.id, id)).for('update');
        if (!route) throw new NotFoundException('Route not found');
        const [{ max }] = await tx.select({ max: sql<number>`coalesce(max(${transportStops.seq}), 0)::int` }).from(transportStops).where(eq(transportStops.routeId, id));
        const [s] = await tx.insert(transportStops).values({ tenantId: p.tenantId, routeId: id, ...b, seq: b.seq ?? max + 1 }).returning();
        await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'transport.stop_added', subjectType: 'transport_stop', subjectId: s.id });
        return s;
      }),
    );
  }

  // --- Seats and fees --------------------------------------------------------------------

  /** Seats a student at a stop (moving them off any earlier route). */
  @Post('assignments')
  @Auth('user', TRANSPORT_ROLES)
  assign(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(AssignBody)) b: z.infer<typeof AssignBody>) {
    return orConflict('This student already has a transport seat', () =>
      this.db.withTenant(p.tenantId, async (tx) => {
        const [stop] = await tx.select().from(transportStops).where(and(eq(transportStops.id, b.stopId), eq(transportStops.routeId, b.routeId)));
        if (!stop) throw new BadRequestException('That stop is not on this route');
        const [student] = await tx.select({ id: students.id }).from(students).where(and(eq(students.id, b.studentId), eq(students.status, 'active')));
        if (!student) throw new NotFoundException('Student not found');
        const [route] = await tx
          .select({ id: transportRoutes.id, active: transportRoutes.active, capacity: transportVehicles.capacity })
          .from(transportRoutes)
          .leftJoin(transportVehicles, eq(transportVehicles.id, transportRoutes.vehicleId))
          .where(eq(transportRoutes.id, b.routeId))
          .for('update', { of: transportRoutes });
        if (!route?.active) throw new BadRequestException('This route is not running');
        const today = await this.today(tx);
        await tx.update(transportAssignments).set({ endedOn: today }).where(and(eq(transportAssignments.studentId, b.studentId), isNull(transportAssignments.endedOn)));
        const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(transportAssignments).where(and(eq(transportAssignments.routeId, b.routeId), isNull(transportAssignments.endedOn)));
        if (route.capacity != null && n >= route.capacity) throw new ConflictException(`The vehicle is full (${route.capacity} seats)`);
        const [a] = await tx.insert(transportAssignments).values({ tenantId: p.tenantId, studentId: b.studentId, routeId: b.routeId, stopId: b.stopId, startsOn: b.startsOn ?? today }).returning();
        await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'transport.assigned', subjectType: 'transport_assignment', subjectId: a.id, data: b });
        return a;
      }),
    );
  }

  @Post('assignments/:studentId/end')
  @HttpCode(200)
  @Auth('user', TRANSPORT_ROLES)
  endAssignment(@CurrentPrincipal() p: UserPrincipal, @Param('studentId', ParseUUIDPipe) studentId: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [a] = await tx.update(transportAssignments).set({ endedOn: await this.today(tx) }).where(and(eq(transportAssignments.studentId, studentId), isNull(transportAssignments.endedOn))).returning();
      if (!a) throw new NotFoundException('This student has no transport seat');
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'transport.unassigned', subjectType: 'transport_assignment', subjectId: a.id });
      return a;
    });
  }

  /** Charges each rider the route fee as a fee invoice (once per title, so a rerun skips those already charged). */
  @Post('fees')
  @Auth('user', TRANSPORT_ROLES)
  charge(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(FeeBody)) b: z.infer<typeof FeeBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const rows = await tx
        .select({ studentId: transportAssignments.studentId, amountPaise: transportRoutes.monthlyFeePaise })
        .from(transportAssignments)
        .innerJoin(transportRoutes, eq(transportRoutes.id, transportAssignments.routeId))
        .where(and(isNull(transportAssignments.endedOn), b.routeId ? eq(transportAssignments.routeId, b.routeId) : undefined));
      const res = await this.fees.chargeStudents(tx, p, b.title, b.dueOn, rows);
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'transport.fees_charged', data: { ...b, ...res } });
      return res;
    });
  }

  // --- Driver mode -----------------------------------------------------------------------

  /** The driver's route(s) with stops, and the trip under way if any. */
  @Get('me')
  @Auth('user', ['driver'])
  me(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const routes = await tx
        .select({ id: transportRoutes.id, name: transportRoutes.name, regNo: transportVehicles.regNo })
        .from(transportRoutes)
        .innerJoin(transportDrivers, and(eq(transportDrivers.id, transportRoutes.driverId), eq(transportDrivers.userId, p.userId)))
        .leftJoin(transportVehicles, eq(transportVehicles.id, transportRoutes.vehicleId))
        .where(eq(transportRoutes.active, true));
      const withStops = await Promise.all(routes.map(async (r) => ({ ...r, stops: await tx.select().from(transportStops).where(eq(transportStops.routeId, r.id)).orderBy(asc(transportStops.seq)) })));
      const [trip] = await tx.select().from(transportTrips).where(and(eq(transportTrips.driverUserId, p.userId), eq(transportTrips.status, 'running')));
      return { routes: withStops, trip: trip ?? null };
    });
  }

  @Post('trips')
  @Auth('user', ['driver'])
  startTrip(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(TripBody)) b: z.infer<typeof TripBody>) {
    return orConflict('This route already has a trip running', () =>
      this.db.withTenant(p.tenantId, async (tx) => {
        const [mine] = await tx
          .select({ id: transportRoutes.id })
          .from(transportRoutes)
          .innerJoin(transportDrivers, and(eq(transportDrivers.id, transportRoutes.driverId), eq(transportDrivers.userId, p.userId)))
          .where(eq(transportRoutes.id, b.routeId));
        if (!mine) throw new NotFoundException('That is not your route');
        await tx.update(transportTrips).set({ status: 'ended', endedAt: this.clock.now() }).where(and(eq(transportTrips.driverUserId, p.userId), eq(transportTrips.status, 'running')));
        const [trip] = await tx.insert(transportTrips).values({ tenantId: p.tenantId, routeId: b.routeId, direction: b.direction, driverUserId: p.userId, startedAt: this.clock.now() }).returning();
        await tx.insert(transportTripEvents).values({ tenantId: p.tenantId, tripId: trip.id, kind: 'started', at: this.clock.now() });
        await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'transport.trip_started', subjectType: 'transport_trip', subjectId: trip.id, data: b });
        return trip;
      }),
    );
  }

  /** The driver's phone reports where the bus is (every few seconds while the trip runs). */
  @Post('trips/:id/position')
  @HttpCode(200)
  @Auth('user', ['driver'])
  async position(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(PingBody)) b: z.infer<typeof PingBody>) {
    const { event, recipients } = await this.db.withTenant(p.tenantId, async (tx) => {
      const [trip] = await tx.select().from(transportTrips).where(and(eq(transportTrips.id, id), eq(transportTrips.driverUserId, p.userId))).for('update');
      if (!trip) throw new NotFoundException('Trip not found');
      if (trip.status !== 'running') throw new ConflictException('This trip has ended');
      const [route] = await tx.select({ name: transportRoutes.name }).from(transportRoutes).where(eq(transportRoutes.id, trip.routeId));
      const stops = await this.orderedStops(tx, trip.routeId, trip.direction);
      let reached = trip.lastStopSeq;
      const here = { lat: b.lat, lng: b.lng };
      const now = this.clock.now();
      // Stops reached since the last ping (a fast bus can pass two between pings).
      while (reached < stops.length && haversineM(here, stops[reached]) <= REACHED_M) {
        await tx.insert(transportTripEvents).values({ tenantId: p.tenantId, tripId: id, kind: 'stop_reached', stopId: stops[reached].id, at: now });
        reached++;
      }
      const next = stops[reached] ?? null;
      const dist = next ? haversineM(here, next) : null;
      if (next && dist! <= APPROACH_M) {
        const [seen] = await tx.select({ id: transportTripEvents.id }).from(transportTripEvents).where(and(eq(transportTripEvents.tripId, id), eq(transportTripEvents.stopId, next.id), eq(transportTripEvents.kind, 'approaching')));
        if (!seen) {
          await tx.insert(transportTripEvents).values({ tenantId: p.tenantId, tripId: id, kind: 'approaching', stopId: next.id, at: now });
          const riders = await tx
            .select({ id: students.id, fullName: students.fullName })
            .from(transportAssignments)
            .innerJoin(students, eq(students.id, transportAssignments.studentId))
            .where(and(eq(transportAssignments.stopId, next.id), isNull(transportAssignments.endedOn)));
          for (const r of riders) await this.notifications.transportArrival(tx, { tripId: id, stopId: next.id, stopName: next.name, routeName: route.name, studentId: r.id, studentName: r.fullName });
        }
      }
      await tx.update(transportTrips).set({ lastStopSeq: reached, lastLat: b.lat, lastLng: b.lng, lastSpeedKmh: b.speedKmh ?? null, lastPingAt: now, pings: sql`${transportTrips.pings} + 1` }).where(eq(transportTrips.id, id));
      const people = await tx.execute<{ user_id: string }>(sql`
        select g.user_id from guardians g join transport_assignments a on a.student_id = g.student_id where a.route_id = ${trip.routeId}::uuid and a.ended_on is null
        union select s.user_id from students s join transport_assignments a on a.student_id = s.id where a.route_id = ${trip.routeId}::uuid and a.ended_on is null and s.user_id is not null
        union select user_id from user_roles where role in ('transport_manager', 'tenant_admin', 'principal')`);
      const event: TransportPositionEvent = {
        tripId: id,
        routeId: trip.routeId,
        lat: b.lat,
        lng: b.lng,
        speedKmh: b.speedKmh ?? null,
        nextStop: next ? { id: next.id, name: next.name, seq: next.seq } : null,
        etaMinutes: dist == null ? null : etaMinutes(dist, b.speedKmh ?? null),
        at: now.toISOString(),
      };
      return { event, recipients: people.rows.map((r) => r.user_id) };
    });
    this.gateway.toUsers(recipients, RealtimeEvents.TransportPosition, event);
    return event;
  }

  @Post('trips/:id/end')
  @HttpCode(200)
  @Auth('user', ['driver'])
  endTrip(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [trip] = await tx.select().from(transportTrips).where(and(eq(transportTrips.id, id), eq(transportTrips.driverUserId, p.userId))).for('update');
      if (!trip) throw new NotFoundException('Trip not found');
      if (trip.status === 'ended') return trip;
      const [done] = await tx.update(transportTrips).set({ status: 'ended', endedAt: this.clock.now() }).where(eq(transportTrips.id, id)).returning();
      await tx.insert(transportTripEvents).values({ tenantId: p.tenantId, tripId: id, kind: 'ended', at: this.clock.now() });
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'transport.trip_ended', subjectType: 'transport_trip', subjectId: id });
      return done;
    });
  }

  // --- Trip logs and the family view -------------------------------------------------------

  /** Trip logs, newest first; `?live=true` for trips under way. */
  @Get('trips')
  @Auth('user', TRANSPORT_ROLES)
  trips(@CurrentPrincipal() p: UserPrincipal, @Query('live') live?: string, @Query('routeId') routeId?: string) {
    return this.db.withTenant(p.tenantId, (tx) =>
      tx
        .select({ trip: transportTrips, routeName: transportRoutes.name })
        .from(transportTrips)
        .innerJoin(transportRoutes, eq(transportRoutes.id, transportTrips.routeId))
        .where(and(live === 'true' ? eq(transportTrips.status, 'running') : undefined, routeId ? eq(transportTrips.routeId, routeId) : undefined))
        .orderBy(desc(transportTrips.startedAt))
        .limit(100),
    );
  }

  @Get('trips/:id')
  @Auth('user', TRANSPORT_ROLES)
  trip(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [trip] = await tx.select().from(transportTrips).where(eq(transportTrips.id, id));
      if (!trip) throw new NotFoundException('Trip not found');
      const events = await tx
        .select({ kind: transportTripEvents.kind, at: transportTripEvents.at, stopName: transportStops.name })
        .from(transportTripEvents)
        .leftJoin(transportStops, eq(transportStops.id, transportTripEvents.stopId))
        .where(eq(transportTripEvents.tripId, id))
        .orderBy(asc(transportTripEvents.at));
      return { ...trip, events };
    });
  }

  /** A student's bus for them and their family: the seat, the stops, and the bus right now. */
  @Get('students/:id')
  @Auth('user')
  student(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) studentId: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await assertCanSeeStudent(tx, p, studentId, TRANSPORT_ROLES);
      const [a] = await tx
        .select({ routeId: transportRoutes.id, routeName: transportRoutes.name, regNo: transportVehicles.regNo, stopId: transportStops.id, stopName: transportStops.name, stopLat: transportStops.lat, stopLng: transportStops.lng, pickupTime: transportStops.pickupTime })
        .from(transportAssignments)
        .innerJoin(transportRoutes, eq(transportRoutes.id, transportAssignments.routeId))
        .innerJoin(transportStops, eq(transportStops.id, transportAssignments.stopId))
        .leftJoin(transportVehicles, eq(transportVehicles.id, transportRoutes.vehicleId))
        .where(and(eq(transportAssignments.studentId, studentId), isNull(transportAssignments.endedOn)));
      if (!a) return { assigned: false as const };
      const stops = await tx.select({ id: transportStops.id, name: transportStops.name, seq: transportStops.seq, lat: transportStops.lat, lng: transportStops.lng }).from(transportStops).where(eq(transportStops.routeId, a.routeId)).orderBy(asc(transportStops.seq));
      const [trip] = await tx.select().from(transportTrips).where(and(eq(transportTrips.routeId, a.routeId), eq(transportTrips.status, 'running')));
      let bus: null | { tripId: string; lat: number; lng: number; speedKmh: number | null; at: Date | null; etaMinutes: number | null; stopsAway: number } = null;
      if (trip?.lastLat != null && trip.lastLng != null) {
        const ordered = await this.orderedStops(tx, a.routeId, trip.direction);
        const idx = ordered.findIndex((s) => s.id === a.stopId);
        const dist = haversineM({ lat: trip.lastLat, lng: trip.lastLng }, { lat: a.stopLat, lng: a.stopLng });
        // Already past this stop on this run: no ETA.
        const passed = idx >= 0 && idx < trip.lastStopSeq;
        bus = { tripId: trip.id, lat: trip.lastLat, lng: trip.lastLng, speedKmh: trip.lastSpeedKmh, at: trip.lastPingAt, etaMinutes: passed ? null : etaMinutes(dist, trip.lastSpeedKmh), stopsAway: passed ? 0 : Math.max(0, idx - trip.lastStopSeq) };
      }
      return { assigned: true as const, ...a, stops, bus };
    });
  }

  // --- helpers -----------------------------------------------------------------------------

  private async orderedStops(tx: Tx, routeId: string, direction: string) {
    return tx.select().from(transportStops).where(eq(transportStops.routeId, routeId)).orderBy(direction === 'drop' ? desc(transportStops.seq) : asc(transportStops.seq));
  }

  private async assertRefs(tx: Tx, b: { vehicleId?: string | null; driverId?: string | null }) {
    if (b.vehicleId) {
      const [v] = await tx.select({ id: transportVehicles.id }).from(transportVehicles).where(eq(transportVehicles.id, b.vehicleId));
      if (!v) throw new BadRequestException('Vehicle not found');
    }
    if (b.driverId) {
      const [d] = await tx.select({ id: transportDrivers.id }).from(transportDrivers).where(eq(transportDrivers.id, b.driverId));
      if (!d) throw new BadRequestException('Driver not found');
    }
  }

  private async today(tx: Tx): Promise<string> {
    const [t] = await tx.select({ tz: tenants.timezone }).from(tenants);
    return localParts(this.clock.now(), t?.tz ?? 'Asia/Kolkata').date;
  }
}

function addDays(date: string, n: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + n * 86400_000).toISOString().slice(0, 10);
}
