import { Body, ConflictException, Controller, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { UserPrincipal } from '../auth/principal.js';
import { readSettings } from '../campus-ops/settings.js';
import { audit, auditUser } from '../common/audit.js';
import { daysBetween, todayIn } from '../common/lht-kit.js';
import { etaMinutes, haversineM } from '../common/ops.js';
import { assertCanSeeStudent } from '../common/student-access.js';
import { Clock } from '../common/time.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService } from '../db/db.service.js';
import { students, transportAssignments, transportDrivers, transportRoutes, transportStops, transportTripEvents, transportTrips, transportVehicles, users } from '../db/schema.js';
import { transportBoardings } from '../db/schema-integrations.js';
import { SAFETY_ITEMS, transportFareSlabs, transportFeeAdjustments } from '../db/schema-transport.js';
import { TRANSPORT_ROLES } from './transport.controller.js';
import { TransportPassService } from './transport-pass.service.js';
import { occupancyPct, overlappingSlabs, routeSuggestions, slabFee } from './transport-rules.js';

const MarkBody = z
  .object({ studentId: z.uuid().optional(), code: z.string().trim().min(10).max(120).optional(), kind: z.enum(['board', 'alight']), stopId: z.uuid().optional() })
  .refine((b) => !!b.studentId !== !!b.code, { message: 'Give the student or the scanned pass code', path: ['studentId'] });
const SosBody = z.object({ lat: z.number().min(-90).max(90).optional(), lng: z.number().min(-180).max(180).optional(), note: z.string().trim().max(300).optional() }).default({});
const ApplyBody = z.object({ routeId: z.uuid().optional(), dryRun: z.boolean().default(false) }).default({ dryRun: false });
const CREW = [...TRANSPORT_ROLES, 'driver'] as const;

/**
 * The transport production pass: getting on and off the bus (by the conductor, the bus pass QR or an RFID reader) with
 * the trip's manifest, SOS from the bus, the office's live board of buses under way, capacity against occupancy with
 * suggestions, the school-bus safety compliance matrix, fare slabs by distance, and the expiry reminders.
 */
@Controller('v1/transport')
export class TransportPassController {
  constructor(
    private readonly db: DbService,
    private readonly clock: Clock,
    private readonly pass: TransportPassService,
  ) {}

  // ---- on the bus ---------------------------------------------------------------------------------------------------

  /** The conductor marks a student on or off (picked from the manifest or by scanning the bus pass QR); a repeat answers `duplicate`. */
  @Post('trips/:id/boardings')
  @HttpCode(200)
  @Auth('user', [...CREW])
  mark(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(MarkBody)) b: z.infer<typeof MarkBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const trip = await this.pass.crewTrip(tx, p, id);
      return this.pass.mark(tx, p.tenantId, p.userId, trip, { studentId: b.studentId, code: b.code, kind: b.kind, method: b.code ? 'qr' : 'manual', stopId: b.stopId });
    });
  }

  /** Who rides this trip, stop by stop, and who has got on and off. */
  @Get('trips/:id/manifest')
  @Auth('user', [...CREW])
  manifest(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => this.pass.manifest(tx, await this.pass.crewTrip(tx, p, id)));
  }

  /** SOS from the bus crew: the office is alerted at once with where the bus is. */
  @Post('trips/:id/sos')
  @HttpCode(200)
  @Auth('user', ['driver'])
  sos(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(SosBody)) b: z.infer<typeof SosBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const trip = await this.pass.crewTrip(tx, p, id);
      if (trip.status !== 'running') throw new ConflictException('This trip has ended');
      return this.pass.sos(tx, p, trip, b);
    });
  }

  // ---- the office ---------------------------------------------------------------------------------------------------

  /**
   * Every bus under way: where it is, how fast, how long since its last fix, the next stop with the minutes to it and
   * any lateness, how many are on board, open alerts and SOS; with each route's stops for the map.
   */
  @Get('live')
  @Auth('user', TRANSPORT_ROLES)
  live(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const now = this.clock.now();
      const trips = await tx
        .select({ t: transportTrips, routeName: transportRoutes.name, regNo: transportVehicles.regNo, driverName: users.fullName })
        .from(transportTrips)
        .innerJoin(transportRoutes, eq(transportRoutes.id, transportTrips.routeId))
        .leftJoin(transportVehicles, eq(transportVehicles.id, sql`coalesce(${transportTrips.vehicleId}, ${transportRoutes.vehicleId})`))
        .innerJoin(users, eq(users.id, transportTrips.driverUserId))
        .where(eq(transportTrips.status, 'running'))
        .orderBy(asc(transportRoutes.name));
      const ids = trips.map((t) => t.t.id);
      const routeIds = [...new Set(trips.map((t) => t.t.routeId))];
      const stops = routeIds.length ? await tx.select().from(transportStops).where(inArray(transportStops.routeId, routeIds)).orderBy(asc(transportStops.sortOrder), asc(transportStops.seq)) : [];
      const events = ids.length ? await tx.select({ tripId: transportTripEvents.tripId, kind: transportTripEvents.kind, detail: transportTripEvents.detail, ack: transportTripEvents.acknowledgedAt }).from(transportTripEvents).where(and(inArray(transportTripEvents.tripId, ids), inArray(transportTripEvents.kind, ['overspeed', 'deviation', 'delayed', 'sos', 'not_boarded']))) : [];
      const marks = ids.length ? await tx.select({ tripId: transportBoardings.tripId, kind: transportBoardings.kind, n: sql<number>`count(*)::int` }).from(transportBoardings).where(inArray(transportBoardings.tripId, ids)).groupBy(transportBoardings.tripId, transportBoardings.kind) : [];
      const riders = routeIds.length ? await tx.select({ routeId: transportAssignments.routeId, n: sql<number>`count(*)::int` }).from(transportAssignments).where(and(inArray(transportAssignments.routeId, routeIds), isNull(transportAssignments.endedOn), sql`${transportAssignments.studentId} is not null`)).groupBy(transportAssignments.routeId) : [];
      return {
        at: now.toISOString(),
        trips: trips.map(({ t, routeName, regNo, driverName }) => {
          const own = stops.filter((s) => s.routeId === t.routeId);
          const ordered = t.direction === 'drop' ? [...own].reverse() : own;
          const next = ordered[t.lastStopSeq] ?? null;
          const dist = next && t.lastLat != null && t.lastLng != null ? haversineM({ lat: t.lastLat, lng: t.lastLng }, next) : null;
          const ev = events.filter((e) => e.tripId === t.id);
          const delayed = ev.find((e) => e.kind === 'delayed');
          const n = (k: string) => marks.find((m) => m.tripId === t.id && m.kind === k)?.n ?? 0;
          return {
            tripId: t.id,
            routeId: t.routeId,
            routeName,
            direction: t.direction,
            regNo,
            driverName,
            startedAt: t.startedAt,
            lat: t.lastLat,
            lng: t.lastLng,
            speedKmh: t.lastSpeedKmh,
            lastPingAt: t.lastPingAt,
            silentMinutes: t.lastPingAt ? Math.floor((now.getTime() - t.lastPingAt.getTime()) / 60_000) : null,
            stopsReached: t.lastStopSeq,
            stopsTotal: ordered.length,
            nextStop: next ? { id: next.id, name: next.name } : null,
            etaMinutes: dist == null ? null : etaMinutes(dist, t.lastSpeedKmh),
            lateMinutes: delayed ? Number.parseInt(delayed.detail ?? '0', 10) || null : null,
            riders: riders.find((r) => r.routeId === t.routeId)?.n ?? 0,
            boarded: n('board'),
            alighted: n('alight'),
            alerts: ev.filter((e) => (e.kind === 'overspeed' || e.kind === 'deviation') && !e.ack).length,
            sos: ev.some((e) => e.kind === 'sos'),
            notBoarded: ev.filter((e) => e.kind === 'not_boarded').reduce((s, e) => s + (e.detail ? e.detail.split(', ').length : 0), 0),
            stops: ordered.map((s, i) => ({ id: s.id, name: s.name, lat: s.lat, lng: s.lng, reached: i < t.lastStopSeq })),
          };
        }),
      };
    });
  }

  /** Capacity against occupancy on every running route, with suggestions (move riders, swap or change vehicles, merge), and stops nobody uses. */
  @Get('optimisation')
  @Auth('user', TRANSPORT_ROLES)
  optimisation(@CurrentPrincipal() p: UserPrincipal, @Query('lowPct') lowText?: string, @Query('nearKm') nearText?: string) {
    const lowPct = Math.min(90, Math.max(5, Number(lowText) || 40));
    const nearKm = Math.min(50, Math.max(0.5, Number(nearText) || 3));
    return this.db.withTenant(p.tenantId, async (tx) => {
      const routes = await tx
        .select({ id: transportRoutes.id, name: transportRoutes.name, vehicleId: transportRoutes.vehicleId, regNo: transportVehicles.regNo, capacity: transportVehicles.capacity, riders: sql<number>`(select count(*)::int from transport_assignments a where a.route_id = "transport_routes"."id" and a.ended_on is null)` })
        .from(transportRoutes)
        .leftJoin(transportVehicles, eq(transportVehicles.id, transportRoutes.vehicleId))
        .where(eq(transportRoutes.active, true))
        .orderBy(asc(transportRoutes.name));
      const stops = routes.length ? await tx.select({ id: transportStops.id, routeId: transportStops.routeId, name: transportStops.name, lat: transportStops.lat, lng: transportStops.lng, riders: sql<number>`(select count(*)::int from transport_assignments a where a.stop_id = "transport_stops"."id" and a.ended_on is null)` }).from(transportStops).where(inArray(transportStops.routeId, routes.map((r) => r.id))).orderBy(asc(transportStops.sortOrder)) : [];
      const idle = await tx.select({ id: transportVehicles.id, regNo: transportVehicles.regNo, capacity: transportVehicles.capacity }).from(transportVehicles).where(and(eq(transportVehicles.status, 'active'), sql`not exists (select 1 from transport_routes r where r.vehicle_id = "transport_vehicles"."id" and r.active)`)).orderBy(asc(transportVehicles.capacity));
      const loads = routes.map((r) => ({ ...r, stops: stops.filter((s) => s.routeId === r.id) }));
      const totalSeats = routes.reduce((s, r) => s + (r.capacity ?? 0), 0);
      const totalRiders = routes.reduce((s, r) => s + r.riders, 0);
      return {
        lowPct,
        nearKm,
        totals: { seats: totalSeats, riders: totalRiders, occupancyPct: occupancyPct(totalRiders, totalSeats || null), idleVehicles: idle.length },
        routes: routes.map((r) => {
          const pct = occupancyPct(r.riders, r.capacity);
          return { ...r, occupancyPct: pct, seatsLeft: r.capacity == null ? null : r.capacity - r.riders, status: pct == null ? 'no_vehicle' : pct > 100 ? 'over' : pct >= 90 ? 'full' : pct < lowPct ? 'low' : 'ok' };
        }),
        suggestions: routeSuggestions(loads, idle, { lowPct, nearKm }),
        idleVehicles: idle,
        emptyStops: stops.filter((s) => s.riders === 0).map((s) => ({ id: s.id, name: s.name, routeId: s.routeId, routeName: routes.find((r) => r.id === s.routeId)?.name ?? '' })),
      };
    });
  }

  /**
   * The school-bus safety matrix, vehicle by vehicle: the latest checklist (speed governor, GPS, CCTV, first aid, fire
   * extinguisher, emergency exit, grills, locks, yellow paint and SCHOOL BUS sign, school name and phone, belts, panic
   * button) and what follows from the records: papers in force, a GPS tracker, a woman attendant on board, a conductor,
   * and a driver with a valid licence held long enough, police verification and medical fitness.
   */
  @Get('safety')
  @Auth('user', TRANSPORT_ROLES)
  safety(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const today = await todayIn(tx, this.clock.now());
      const minYears = Number((await readSettings(tx, p.tenantId, 'transport')).rules.minDriverExperienceYears) || 0;
      const vehicles = await tx.select().from(transportVehicles).where(sql`${transportVehicles.status} <> 'retired'`).orderBy(asc(transportVehicles.regNo));
      const routes = await tx.select().from(transportRoutes).where(eq(transportRoutes.active, true));
      const crew = await tx.select().from(transportDrivers);
      const checks = await this.pass.latestChecks(tx);
      const pinged = await tx.selectDistinct({ id: transportTrips.vehicleId }).from(transportTrips).where(sql`${transportTrips.lastPingAt} > now() - interval '7 days'`);
      const valid = (d: string | null) => !!d && d >= today;
      const rows = vehicles.map((v) => {
        const rs = routes.filter((r) => r.vehicleId === v.id);
        const c = checks.find((x) => x.vehicleId === v.id);
        const person = (id: string | null) => crew.find((d) => d.id === id) ?? null;
        const driver = person(rs[0]?.driverId ?? null);
        const attendant = person(rs[0]?.attendantId ?? null);
        const years = driver?.licenceIssuedOn ? Math.floor(daysBetween(driver.licenceIssuedOn, today) / 365.25) : null;
        const derived = {
          papers: valid(v.insuranceExpiresOn) && valid(v.fitnessExpiresOn) && valid(v.pucExpiresOn) && (v.permitExpiresOn == null || valid(v.permitExpiresOn)),
          gpsTracker: v.gpsDevice.trim() !== '' || pinged.some((x) => x.id === v.id),
          femaleAttendant: attendant?.gender === 'female' && attendant.active,
          conductor: !!rs[0]?.conductorId || !!attendant,
          driverLicence: !!driver && valid(driver.licenseExpiresOn),
          driverExperience: !!driver && years != null && years >= minYears,
          driverPoliceVerified: !!driver?.policeVerifiedOn,
          driverMedical: !!driver && valid(driver.medicalValidUntil),
        };
        const items = Object.fromEntries(SAFETY_ITEMS.map((k) => [k, c?.items?.[k] === true])) as Record<(typeof SAFETY_ITEMS)[number], boolean>;
        const checkCurrent = !!c && (!c.nextDueOn || c.nextDueOn >= today);
        // A vehicle on no route needs no crew to be compliant.
        const needCrew = rs.length > 0;
        const gaps = [
          ...SAFETY_ITEMS.filter((k) => !items[k]),
          ...(Object.keys(derived) as (keyof typeof derived)[]).filter((k) => !derived[k] && (needCrew || !['femaleAttendant', 'conductor', 'driverLicence', 'driverExperience', 'driverPoliceVerified', 'driverMedical'].includes(k))),
          ...(checkCurrent ? [] : ['checkDue']),
        ];
        return {
          vehicleId: v.id,
          regNo: v.regNo,
          capacity: v.capacity,
          routes: rs.map((r) => r.name),
          lastCheckOn: c?.checkedOn ?? null,
          nextCheckDue: c?.nextDueOn ?? null,
          items,
          derived,
          driver: driver ? { name: driver.fullName, licenceYears: years } : null,
          attendant: attendant ? { name: attendant.fullName, gender: attendant.gender } : null,
          gaps,
          compliant: gaps.length === 0,
        };
      });
      return { today, minDriverExperienceYears: minYears, vehicles: rows, compliant: rows.filter((r) => r.compliant).length, total: rows.length };
    });
  }

  /**
   * Fills each stop's monthly fee from the fare slab for its distance (a stop with no distance, or beyond every slab,
   * is left as it is and listed). `dryRun` shows what would change without saving.
   */
  @Post('fare-slabs/apply')
  @HttpCode(200)
  @Auth('user', TRANSPORT_ROLES)
  applySlabs(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(ApplyBody)) b: z.infer<typeof ApplyBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const slabs = await tx.select().from(transportFareSlabs).orderBy(asc(transportFareSlabs.fromKm));
      if (!slabs.length) throw new ConflictException('Add the fare slabs first');
      if (overlappingSlabs(slabs).length) throw new ConflictException('Two fare slabs overlap; fix them first');
      const stops = await tx.select({ s: transportStops, route: transportRoutes.name }).from(transportStops).innerJoin(transportRoutes, eq(transportRoutes.id, transportStops.routeId)).where(b.routeId ? eq(transportStops.routeId, b.routeId) : undefined).orderBy(asc(transportRoutes.name), asc(transportStops.sortOrder));
      const changes: { stopId: string; route: string; stop: string; distanceKm: number; beforePaise: number | null; afterPaise: number }[] = [];
      const uncovered: { route: string; stop: string; distanceKm: number | null }[] = [];
      let unchanged = 0;
      for (const { s, route } of stops) {
        const fee = slabFee(slabs, s.distanceKm);
        if (fee == null) uncovered.push({ route, stop: s.name, distanceKm: s.distanceKm });
        else if (fee === s.feePaise) unchanged++;
        else changes.push({ stopId: s.id, route, stop: s.name, distanceKm: s.distanceKm!, beforePaise: s.feePaise, afterPaise: fee });
      }
      if (!b.dryRun) {
        for (const c of changes) {
          await tx.update(transportStops).set({ feePaise: c.afterPaise }).where(eq(transportStops.id, c.stopId));
          await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'transport_stop.fare_from_slab', subjectType: 'transport_stop', subjectId: c.stopId, data: { distanceKm: c.distanceKm }, changes: { feePaise: { before: c.beforePaise, after: c.afterPaise } } });
        }
        await auditUser(tx, p, 'transport.fare_slabs_applied', 'transport_route', b.routeId, { updated: changes.length, unchanged, uncovered: uncovered.length });
      }
      return { dryRun: b.dryRun, updated: changes.length, unchanged, changes, uncovered };
    });
  }

  /** Sends today's expiry reminders now (the daily job does the same; each reminder goes once). */
  @Post('expiry-reminders/run')
  @HttpCode(200)
  @Auth('user', TRANSPORT_ROLES)
  runReminders(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const r = await this.pass.expiryReminders(tx, p.tenantId);
      await auditUser(tx, p, 'transport.expiry_reminders_sent', 'transport_vehicle', undefined, { sent: r.sent });
      return r;
    });
  }

  /** A student's transport fee changes made after billing (moves, cancellations): for the office and the family. */
  @Get('students/:id/fee-adjustments')
  @Auth('user')
  adjustments(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) studentId: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await assertCanSeeStudent(tx, p, studentId, TRANSPORT_ROLES);
      const [s] = await tx.select({ id: students.id }).from(students).where(eq(students.id, studentId));
      if (!s) throw new NotFoundException('Student not found');
      return tx.select().from(transportFeeAdjustments).where(eq(transportFeeAdjustments.studentId, studentId)).orderBy(desc(transportFeeAdjustments.createdAt)).limit(100);
    });
  }
}
