import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { and, asc, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import type { UserPrincipal } from '../auth/principal.js';
import { readSettings } from '../campus-ops/settings.js';
import { audit, auditUser } from '../common/audit.js';
import { daysBetween, familyUserIds, todayIn, usersWithRoles } from '../common/lht-kit.js';
import { Clock, localParts } from '../common/time.js';
import { DbService, type Tx } from '../db/db.service.js';
import { feeInvoices, students, tenants, transportAssignments, transportDrivers, transportIncidents, transportRoutes, transportStops, transportTripEvents, transportTrips, transportVehicles } from '../db/schema.js';
import { transportBoardings } from '../db/schema-integrations.js';
import { transportRouteOverrides } from '../db/schema-lht.js';
import { transportFeeAdjustments, transportSafetyChecks } from '../db/schema-transport.js';
import { DomainEvents, EventBus } from '../events/events.js';
import { reduceCharge } from '../fees/fee-lines.js';
import { FeesService } from '../fees/fees.service.js';
import { JobsService, type Job } from '../jobs/jobs.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { cancelCredit, lateMinutes, monthsBetween, moveDelta, parsePassCode } from './transport-rules.js';

export const TRANSPORT_OFFICE = ['transport_manager', 'tenant_admin', 'principal'] as const;
export const EXPIRY_JOB = 'transport.expiry-reminders';

type Ctx = { tx: Tx; p: UserPrincipal };
type Seat = typeof transportAssignments.$inferSelect;
type Trip = typeof transportTrips.$inferSelect;
type Stop = typeof transportStops.$inferSelect;
type Words = { en: string; hi: string; kn: string };
const say = (title: Words, body: Words) => ({ en: { title: title.en, body: body.en }, hi: { title: title.hi, body: body.hi }, kn: { title: title.kn, body: body.kn } });
const rupees = (paise: number) => `₹${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: paise % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;

/** A document falling due, for the reminders. */
interface Due {
  kind: string;
  subjectId: string;
  subject: string;
  due: string;
}

/**
 * The transport workflows that several endpoints share: fee changes after a month was billed, boarding and alighting
 * with the family's notices, the delay and not-boarded alerts raised from the bus's position, the SOS, and the daily
 * reminders of papers, licences, medical fitness and safety checks falling due.
 */
@Injectable()
export class TransportPassService implements OnModuleInit {
  constructor(
    private readonly db: DbService,
    private readonly clock: Clock,
    private readonly fees: FeesService,
    private readonly notifications: NotificationsService,
    private readonly jobs: JobsService,
    private readonly events: EventBus,
  ) {}

  onModuleInit(): void {
    this.jobs.registerDaily(EXPIRY_JOB, (job: Job) => this.db.withTenant(job.tenantId, (tx) => this.expiryReminders(tx, job.tenantId)).then(() => undefined));
  }

  // ---- fees after billing -----------------------------------------------------------------------------------------

  /** The months from `fromMonth` on whose transport fee the student has already been billed. */
  async billedMonths(tx: Tx, studentId: string, fromMonth: string): Promise<string[]> {
    const rows = await tx.select({ title: feeInvoices.title }).from(feeInvoices).where(and(eq(feeInvoices.studentId, studentId), sql`${feeInvoices.title} ~ '^Transport fee \\d{4}-\\d{2}$'`, sql`${feeInvoices.status} <> 'cancelled'`));
    return rows.map((r) => r.title.slice(-7)).filter((m) => m >= fromMonth).sort();
  }

  /**
   * A seat that changes (moves on `on` from a seat at `fromPaise` to one at `toPaise`, or ends on `on` when `toPaise`
   * is null) in months already billed: each such month is charged or credited the difference, and the change is kept
   * in the adjustment ledger. Months not billed yet need nothing: the month's run works them out pro rata.
   */
  async adjustBilled(ctx: Ctx, seat: Seat, on: string, fromPaise: number, toPaise: number | null, note: string): Promise<{ chargedPaise: number; creditedPaise: number; refundDuePaise: number }> {
    const out = { chargedPaise: 0, creditedPaise: 0, refundDuePaise: 0 };
    if (!seat.studentId) return out;
    const months = await this.billedMonths(ctx.tx, seat.studentId, on.slice(0, 7));
    for (const month of months) {
      const delta = toPaise == null ? -cancelCredit(month, fromPaise, seat.startsOn, on) : moveDelta(month, fromPaise, toPaise, seat.startsOn, on);
      if (delta === 0) continue;
      const kind = toPaise == null ? 'cancel_credit' : delta > 0 ? 'move_charge' : 'move_credit';
      const [have] = await ctx.tx.select({ id: transportFeeAdjustments.id }).from(transportFeeAdjustments).where(and(eq(transportFeeAdjustments.assignmentId, seat.id), eq(transportFeeAdjustments.month, month), eq(transportFeeAdjustments.kind, kind)));
      if (have) continue;
      let invoiceId: string | null = null;
      let applied = 0;
      let refund = 0;
      if (delta > 0) {
        const title = `Transport fee change ${month} (${seat.id.slice(0, 8)})`;
        const today = await todayIn(ctx.tx, this.clock.now());
        await this.fees.chargeStudents(ctx.tx, ctx.p, title, today, [{ studentId: seat.studentId, amountPaise: delta }]);
        [{ id: invoiceId }] = await ctx.tx.select({ id: feeInvoices.id }).from(feeInvoices).where(and(eq(feeInvoices.studentId, seat.studentId), eq(feeInvoices.title, title)));
        out.chargedPaise += delta;
      } else {
        const r = await this.credit(ctx, seat.studentId, month, -delta, note);
        invoiceId = r.invoiceId;
        applied = r.applied;
        refund = -delta - r.applied;
        out.creditedPaise += r.applied;
        out.refundDuePaise += refund;
      }
      const [row] = await ctx.tx.insert(transportFeeAdjustments).values({ tenantId: ctx.p.tenantId, assignmentId: seat.id, studentId: seat.studentId, kind, month, amountPaise: delta, appliedPaise: applied, refundDuePaise: refund, invoiceId, note: note.slice(0, 300), createdBy: ctx.p.userId }).returning({ id: transportFeeAdjustments.id });
      await auditUser(ctx.tx, ctx.p, `transport_fee_adjustment.${kind}`, 'transport_fee_adjustment', row.id, { month, amountPaise: delta, appliedPaise: applied, refundDuePaise: refund, assignmentId: seat.id });
      await this.events.emit(ctx.tx, ctx.p.tenantId, { type: DomainEvents.TransportFeeAdjusted, aggregateType: 'student', aggregateId: seat.studentId, payload: { adjustmentId: row.id, kind, month, amountPaise: delta, refundDuePaise: refund }, actorId: ctx.p.userId });
    }
    return out;
  }

  /** Takes `amount` off the student's unpaid transport fees (that month's first, then the newest); returns how much came off. */
  private async credit(ctx: Ctx, studentId: string, month: string, amount: number, note: string): Promise<{ applied: number; invoiceId: string | null }> {
    const open = await ctx.tx
      .select({ id: feeInvoices.id, title: feeInvoices.title })
      .from(feeInvoices)
      .where(and(eq(feeInvoices.studentId, studentId), sql`${feeInvoices.title} ilike 'transport fee%'`, sql`${feeInvoices.status} <> 'cancelled'`, sql`${feeInvoices.amountPaise} > ${feeInvoices.paidPaise}`))
      .orderBy(sql`(${feeInvoices.title} = ${`Transport fee ${month}`}) desc`, desc(feeInvoices.dueOn));
    let left = amount;
    let first: string | null = null;
    for (const inv of open) {
      if (left <= 0) break;
      const off = await reduceCharge(ctx.tx, inv.id, left, [], { kind: 'withdrawal', userId: ctx.p.userId, note: note.slice(0, 200) });
      if (off > 0) first ??= inv.id;
      left -= off;
    }
    return { applied: amount - left, invoiceId: first };
  }

  /** A seat's monthly fee: its own, else its stop's, else its route's. */
  async seatFeeOf(tx: Tx, seat: Seat): Promise<number> {
    if (seat.feePaise != null) return seat.feePaise;
    const [s] = await tx.select({ stop: transportStops.feePaise, route: transportRoutes.monthlyFeePaise }).from(transportStops).innerJoin(transportRoutes, eq(transportRoutes.id, transportStops.routeId)).where(eq(transportStops.id, seat.stopId));
    return s?.stop ?? s?.route ?? 0;
  }

  /**
   * Cancels a seat from `on` (the first day no longer ridden): the seat ends, any month already billed is credited the
   * days given up (off unpaid transport fees; what was already paid is a refund due), and the family is told.
   */
  async endSeat(ctx: Ctx, id: string, on: string | undefined, reason = ''): Promise<{ endedOn: string; creditedPaise: number; refundDuePaise: number }> {
    const [seat] = await ctx.tx.select().from(transportAssignments).where(eq(transportAssignments.id, id)).for('update');
    if (!seat) throw new NotFoundException('Seat not found');
    const endsOn = on ?? (await todayIn(ctx.tx, this.clock.now()));
    if (seat.endedOn) throw new ConflictException('This seat has ended');
    if (endsOn < seat.startsOn) throw new BadRequestException('The date is before the seat began');
    const fee = await this.seatFeeOf(ctx.tx, seat);
    await ctx.tx.update(transportAssignments).set({ endedOn: endsOn }).where(eq(transportAssignments.id, id));
    const adj = await this.adjustBilled(ctx, seat, endsOn, fee, null, reason || 'Transport seat cancelled');
    await audit(ctx.tx, { tenantId: ctx.p.tenantId, actorType: 'user', actorId: ctx.p.userId, action: 'transport.unassigned', subjectType: 'transport_assignment', subjectId: id, data: { on: endsOn, reason, ...adj }, changes: { endedOn: { before: null, after: endsOn } } });
    if (seat.studentId) {
      const [s] = await ctx.tx.select({ name: students.fullName }).from(students).where(eq(students.id, seat.studentId));
      const money = adj.creditedPaise + adj.refundDuePaise;
      const extra: Words = money > 0 ? { en: ` ${rupees(money)} of transport fee is credited${adj.refundDuePaise ? ` (${rupees(adj.refundDuePaise)} to be refunded)` : ''}.`, hi: ` परिवहन शुल्क के ${rupees(money)} समायोजित किए गए।`, kn: ` ಸಾರಿಗೆ ಶುಲ್ಕದ ${rupees(money)} ಹೊಂದಾಣಿಕೆ ಮಾಡಲಾಗಿದೆ.` } : { en: '', hi: '', kn: '' };
      await this.notifications.notifyUsers(ctx.tx, await familyUserIds(ctx.tx, seat.studentId), {
        kind: 'transport',
        text: say({ en: `Bus seat ended for ${s?.name}`, hi: `${s?.name} की बस सीट समाप्त`, kn: `${s?.name} ಅವರ ಬಸ್ ಆಸನ ಕೊನೆಗೊಂಡಿದೆ` }, { en: `The school bus seat ends from ${endsOn}.${extra.en}`, hi: `स्कूल बस सीट ${endsOn} से समाप्त।${extra.hi}`, kn: `ಶಾಲಾ ಬಸ್ ಆಸನ ${endsOn} ರಿಂದ ಕೊನೆಗೊಳ್ಳುತ್ತದೆ.${extra.kn}` }),
        data: { studentId: seat.studentId, assignmentId: id },
        dedupeKey: `transport-seat-ended:${id}`,
      });
    }
    return { endedOn: endsOn, ...adj };
  }

  // ---- crew and boarding --------------------------------------------------------------------------------------------

  /** The trip, if the signed-in person may work it: its driver, the route's conductor or attendant (by their app login), or the transport office. */
  async crewTrip(tx: Tx, p: UserPrincipal, tripId: string): Promise<Trip> {
    const [trip] = await tx.select().from(transportTrips).where(eq(transportTrips.id, tripId));
    if (!trip) throw new NotFoundException('Trip not found');
    if (trip.driverUserId === p.userId || p.roles.some((r) => (TRANSPORT_OFFICE as readonly string[]).includes(r))) return trip;
    const [crew] = await tx
      .select({ id: transportDrivers.id })
      .from(transportRoutes)
      .innerJoin(transportDrivers, or(eq(transportDrivers.id, transportRoutes.driverId), eq(transportDrivers.id, transportRoutes.conductorId), eq(transportDrivers.id, transportRoutes.attendantId)))
      .where(and(eq(transportRoutes.id, trip.routeId), eq(transportDrivers.userId, p.userId)));
    if (!crew) throw new NotFoundException('Trip not found');
    return trip;
  }

  /** The vehicle running a route on a day: a substitute in force that day, else the route's own. */
  async vehicleFor(tx: Tx, routeId: string, day: string): Promise<string | null> {
    const [o] = await tx.select({ id: transportRouteOverrides.substituteVehicleId }).from(transportRouteOverrides).where(and(eq(transportRouteOverrides.routeId, routeId), sql`${day}::date between ${transportRouteOverrides.fromOn} and ${transportRouteOverrides.untilOn}`, sql`${transportRouteOverrides.substituteVehicleId} is not null`)).orderBy(desc(transportRouteOverrides.createdAt)).limit(1);
    if (o?.id) return o.id;
    const [r] = await tx.select({ id: transportRoutes.vehicleId }).from(transportRoutes).where(eq(transportRoutes.id, routeId));
    return r?.id ?? null;
  }

  /**
   * A student gets on or off the bus on a running trip: once per trip and direction (a second scan answers
   * `duplicate`). The student must hold a seat on the trip's route. The family is told when boarding notices are on.
   */
  async mark(tx: Tx, tenantId: string, actor: string | null, trip: Trip, input: { studentId?: string; code?: string; kind: 'board' | 'alight'; method: 'rfid' | 'qr' | 'manual'; stopId?: string; deviceId?: string | null; at?: Date }) {
    if (trip.status !== 'running') throw new ConflictException('This trip has ended');
    let studentId = input.studentId;
    let seat: Seat | undefined;
    if (input.code) {
      const code = parsePassCode(input.code);
      if (!code) throw new BadRequestException('This is not a bus pass');
      [seat] = await tx.select().from(transportAssignments).where(and(eq(transportAssignments.id, code.assignmentId), eq(transportAssignments.studentId, code.studentId), isNull(transportAssignments.endedOn)));
      if (!seat) throw new ConflictException('This bus pass is no longer valid');
      studentId = code.studentId;
    } else if (studentId) {
      [seat] = await tx.select().from(transportAssignments).where(and(eq(transportAssignments.studentId, studentId), isNull(transportAssignments.endedOn)));
    } else throw new BadRequestException('Say which student');
    if (!seat || seat.routeId !== trip.routeId) throw new ConflictException('This student does not ride this route');
    const at = input.at ?? this.clock.now();
    const [t] = await tx.select({ tz: tenants.timezone }).from(tenants);
    const local = localParts(at, t?.tz ?? 'Asia/Kolkata');
    // Where: the stop given, else (getting on for the pick-up, off for the drop) the student's own stop, else the last stop reached.
    const stopId = input.stopId ?? ((input.kind === 'board') === (trip.direction === 'pickup') ? seat.stopId : await this.lastReachedStop(tx, trip));
    const [row] = await tx
      .insert(transportBoardings)
      .values({ tenantId, studentId: studentId!, routeId: trip.routeId, tripId: trip.id, stopId: stopId ?? null, kind: input.kind, method: input.method, deviceId: input.deviceId ?? null, recordedBy: actor, boardedAt: at, onDate: local.date })
      .onConflictDoNothing()
      .returning();
    if (!row) {
      const [had] = await tx.select().from(transportBoardings).where(and(eq(transportBoardings.tripId, trip.id), eq(transportBoardings.studentId, studentId!), eq(transportBoardings.kind, input.kind)));
      return { ...had, duplicate: true as const };
    }
    await audit(tx, { tenantId, actorType: actor ? 'user' : 'device', actorId: actor ?? input.deviceId ?? undefined, action: `transport_boarding.${input.kind}`, subjectType: 'transport_boarding', subjectId: row.id, data: { tripId: trip.id, studentId, method: input.method } });
    if ((await readSettings(tx, tenantId, 'transport')).rules.boardingNotices !== false) {
      const [s] = await tx.select({ name: students.fullName }).from(students).where(eq(students.id, studentId!));
      const [stop] = stopId ? await tx.select({ name: transportStops.name }).from(transportStops).where(eq(transportStops.id, stopId)) : [];
      const where = stop?.name ?? '';
      const time = local.time.slice(0, 5);
      const text =
        input.kind === 'board'
          ? say({ en: `${s.name} boarded the bus`, hi: `${s.name} बस में चढ़े`, kn: `${s.name} ಬಸ್ ಹತ್ತಿದರು` }, { en: `${s.name} got on the bus${where ? ` at ${where}` : ''} at ${time}.`, hi: `${s.name} ${time} बजे${where ? ` ${where} पर` : ''} बस में चढ़े।`, kn: `${s.name} ${time} ಕ್ಕೆ${where ? ` ${where} ನಲ್ಲಿ` : ''} ಬಸ್ ಹತ್ತಿದರು.` })
          : say({ en: `${s.name} got off the bus`, hi: `${s.name} बस से उतरे`, kn: `${s.name} ಬಸ್‌ನಿಂದ ಇಳಿದರು` }, { en: `${s.name} got off the bus${where ? ` at ${where}` : ''} at ${time}.`, hi: `${s.name} ${time} बजे${where ? ` ${where} पर` : ''} बस से उतरे।`, kn: `${s.name} ${time} ಕ್ಕೆ${where ? ` ${where} ನಲ್ಲಿ` : ''} ಬಸ್‌ನಿಂದ ಇಳಿದರು.` });
      await this.notifications.notifyUsers(tx, await familyUserIds(tx, studentId!), { kind: 'transport', text, data: { studentId: studentId!, tripId: trip.id, boardingId: row.id, event: input.kind }, dedupeKey: `boarding:${row.id}` });
    }
    return { ...row, duplicate: false as const };
  }

  private async lastReachedStop(tx: Tx, trip: Trip): Promise<string | null> {
    const [e] = await tx.select({ stopId: transportTripEvents.stopId }).from(transportTripEvents).where(and(eq(transportTripEvents.tripId, trip.id), eq(transportTripEvents.kind, 'stop_reached'))).orderBy(desc(transportTripEvents.at)).limit(1);
    return e?.stopId ?? null;
  }

  /** Who rides the trip's route, at which stop, and whether they got on and off on this trip. */
  async manifest(tx: Tx, trip: Trip) {
    const rows = await tx
      .select({ studentId: students.id, name: students.fullName, rollNo: students.rollNo, stopId: transportStops.id, stopName: transportStops.name, sortOrder: transportStops.sortOrder, seq: transportStops.seq, assignmentId: transportAssignments.id })
      .from(transportAssignments)
      .innerJoin(students, eq(students.id, transportAssignments.studentId))
      .innerJoin(transportStops, eq(transportStops.id, transportAssignments.stopId))
      .where(and(eq(transportAssignments.routeId, trip.routeId), isNull(transportAssignments.endedOn)))
      .orderBy(...(trip.direction === 'drop' ? [desc(transportStops.sortOrder), desc(transportStops.seq)] : [asc(transportStops.sortOrder), asc(transportStops.seq)]), asc(students.fullName));
    const marks = await tx.select().from(transportBoardings).where(eq(transportBoardings.tripId, trip.id));
    const by = (sid: string, kind: string) => marks.find((m) => m.studentId === sid && m.kind === kind);
    const riders = rows.map((r) => {
      const b = by(r.studentId, 'board');
      const a = by(r.studentId, 'alight');
      return { studentId: r.studentId, name: r.name, rollNo: r.rollNo, stopId: r.stopId, stopName: r.stopName, boardedAt: b?.boardedAt ?? null, boardMethod: b?.method ?? null, alightedAt: a?.boardedAt ?? null, alightMethod: a?.method ?? null, onBoard: !!b && !a };
    });
    return { tripId: trip.id, routeId: trip.routeId, direction: trip.direction, status: trip.status, riders, counts: { riders: riders.length, boarded: riders.filter((r) => r.boardedAt).length, alighted: riders.filter((r) => r.alightedAt).length, onBoard: riders.filter((r) => r.onBoard).length } };
  }

  // ---- alerts from the bus's position --------------------------------------------------------------------------------

  /**
   * A pick-up bus has left these stops behind: a student at one of them who was not marked on board is reported to
   * the family and the office (once per trip). Only when the crew is marking boarding on this trip, so a trip run
   * without marking raises nothing.
   */
  async notBoarded(tx: Tx, tenantId: string, trip: Trip, routeName: string, left: Stop[]): Promise<number> {
    if (trip.direction !== 'pickup' || !left.length) return 0;
    if ((await readSettings(tx, tenantId, 'transport')).rules.notBoardedAlerts === false) return 0;
    const [any] = await tx.select({ id: transportBoardings.id }).from(transportBoardings).where(eq(transportBoardings.tripId, trip.id)).limit(1);
    if (!any) return 0;
    const missing = await tx
      .select({ id: students.id, name: students.fullName, stopId: transportStops.id, stopName: transportStops.name })
      .from(transportAssignments)
      .innerJoin(students, eq(students.id, transportAssignments.studentId))
      .innerJoin(transportStops, eq(transportStops.id, transportAssignments.stopId))
      .where(and(eq(transportAssignments.routeId, trip.routeId), isNull(transportAssignments.endedOn), inArray(transportAssignments.stopId, left.map((s) => s.id)), sql`not exists (select 1 from transport_boardings b where b.trip_id = ${trip.id}::uuid and b.student_id = ${students.id} and b.kind = 'board')`));
    if (!missing.length) return 0;
    const office = await usersWithRoles(tx, [...TRANSPORT_OFFICE]);
    for (const m of missing) {
      await this.notifications.notifyUsers(tx, await familyUserIds(tx, m.id), {
        kind: 'transport',
        text: say({ en: `${m.name} did not board the bus`, hi: `${m.name} बस में नहीं चढ़े`, kn: `${m.name} ಬಸ್ ಹತ್ತಲಿಲ್ಲ` }, { en: `The ${routeName} bus left ${m.stopName} without ${m.name} on board. Please call the transport office if this is unexpected.`, hi: `${routeName} की बस ${m.stopName} से ${m.name} के बिना निकल गई। अप्रत्याशित हो तो परिवहन कार्यालय को फ़ोन करें।`, kn: `${routeName} ಬಸ್ ${m.stopName} ನಿಂದ ${m.name} ಇಲ್ಲದೆ ಹೊರಟಿತು. ಅನಿರೀಕ್ಷಿತವಾದರೆ ಸಾರಿಗೆ ಕಚೇರಿಗೆ ಕರೆ ಮಾಡಿ.` }),
        data: { studentId: m.id, tripId: trip.id, stopId: m.stopId, event: 'not_boarded' },
        dedupeKey: `not-boarded:${trip.id}:${m.id}`,
      });
    }
    await tx.insert(transportTripEvents).values({ tenantId, tripId: trip.id, kind: 'not_boarded', stopId: left[left.length - 1].id, at: this.clock.now(), detail: missing.map((m) => m.name).join(', ').slice(0, 500) });
    await this.notifications.notifyUsers(tx, office, {
      kind: 'transport',
      text: say({ en: `${routeName}: ${missing.length} not on board`, hi: `${routeName}: ${missing.length} बस में नहीं`, kn: `${routeName}: ${missing.length} ಬಸ್‌ನಲ್ಲಿಲ್ಲ` }, { en: missing.map((m) => `${m.name} (${m.stopName})`).join(', '), hi: missing.map((m) => `${m.name} (${m.stopName})`).join(', '), kn: missing.map((m) => `${m.name} (${m.stopName})`).join(', ') }),
      data: { tripId: trip.id, event: 'not_boarded' },
      dedupeKey: `not-boarded-office:${trip.id}:${left[left.length - 1].id}`,
    });
    return missing.length;
  }

  /**
   * The bus is running late: once a trip, when the expected arrival at the next stop is past its timetable by the
   * delay threshold in settings, the families waiting at the stops still ahead and the office are told by how much.
   */
  async delay(tx: Tx, tenantId: string, trip: Trip, routeName: string, ahead: Stop[], eta: number | null, now: Date): Promise<number | null> {
    const next = ahead[0];
    if (!next) return null;
    const [t] = await tx.select({ tz: tenants.timezone }).from(tenants);
    const late = lateMinutes(localParts(now, t?.tz ?? 'Asia/Kolkata').time.slice(0, 5), eta, trip.direction === 'drop' ? next.dropTime : next.pickupTime);
    const threshold = Number((await readSettings(tx, tenantId, 'transport')).rules.delayAlertMinutes) || 0;
    if (late == null || threshold <= 0 || late < threshold) return late;
    const [seen] = await tx.select({ id: transportTripEvents.id }).from(transportTripEvents).where(and(eq(transportTripEvents.tripId, trip.id), eq(transportTripEvents.kind, 'delayed'))).limit(1);
    if (seen) return late;
    await tx.insert(transportTripEvents).values({ tenantId, tripId: trip.id, kind: 'delayed', stopId: next.id, at: now, detail: `${late} min` });
    const riders = await tx.select({ id: transportAssignments.studentId }).from(transportAssignments).where(and(eq(transportAssignments.routeId, trip.routeId), isNull(transportAssignments.endedOn), inArray(transportAssignments.stopId, ahead.map((s) => s.id)), sql`${transportAssignments.studentId} is not null`));
    const people = new Set<string>();
    for (const r of riders) for (const u of await familyUserIds(tx, r.id!)) people.add(u);
    for (const u of await usersWithRoles(tx, [...TRANSPORT_OFFICE])) people.add(u);
    await this.notifications.notifyUsers(tx, [...people], {
      kind: 'transport',
      text: say({ en: `${routeName}: bus running about ${late} minutes late`, hi: `${routeName}: बस लगभग ${late} मिनट देर से`, kn: `${routeName}: ಬಸ್ ಸುಮಾರು ${late} ನಿಮಿಷ ತಡ` }, { en: `The bus should reach ${next.name} about ${late} minutes after its time. Live position is in the app.`, hi: `बस ${next.name} पर अपने समय से लगभग ${late} मिनट बाद पहुँचेगी। लाइव स्थिति ऐप में देखें।`, kn: `ಬಸ್ ${next.name} ಗೆ ನಿಗದಿತ ಸಮಯಕ್ಕಿಂತ ಸುಮಾರು ${late} ನಿಮಿಷ ತಡವಾಗಿ ತಲುಪಲಿದೆ. ಲೈವ್ ಸ್ಥಳ ಆ್ಯಪ್‌ನಲ್ಲಿದೆ.` }),
      data: { tripId: trip.id, routeId: trip.routeId, lateMinutes: String(late), event: 'delayed' },
      dedupeKey: `transport-delay:${trip.id}`,
    });
    return late;
  }

  /** A drop trip ends with students marked on board and never off: the office and the crew are told at once (a child may be left on the bus). */
  async leftOnBoard(tx: Tx, tenantId: string, trip: Trip, routeName: string): Promise<number> {
    if (trip.direction !== 'drop') return 0;
    const rows = await tx.execute<{ name: string }>(sql`
      select s.full_name as name from transport_boardings b join students s on s.id = b.student_id
      where b.trip_id = ${trip.id}::uuid and b.kind = 'board'
        and not exists (select 1 from transport_boardings x where x.trip_id = b.trip_id and x.student_id = b.student_id and x.kind = 'alight')
      order by s.full_name`);
    if (!rows.rows.length) return 0;
    const names = rows.rows.map((r) => r.name).join(', ');
    await tx.insert(transportTripEvents).values({ tenantId, tripId: trip.id, kind: 'left_on_board', at: this.clock.now(), detail: names.slice(0, 500) });
    await this.notifications.notifyUsers(tx, [...new Set([...(await usersWithRoles(tx, [...TRANSPORT_OFFICE])), trip.driverUserId])], {
      kind: 'transport',
      text: say({ en: `${routeName}: check the bus, ${rows.rows.length} not marked off`, hi: `${routeName}: बस जाँचें, ${rows.rows.length} उतरे दर्ज नहीं`, kn: `${routeName}: ಬಸ್ ಪರಿಶೀಲಿಸಿ, ${rows.rows.length} ಇಳಿದಿರುವುದು ದಾಖಲಾಗಿಲ್ಲ` }, { en: names, hi: names, kn: names }),
      data: { tripId: trip.id, event: 'left_on_board' },
      dedupeKey: `left-on-board:${trip.id}`,
    });
    return rows.rows.length;
  }

  // ---- SOS ----------------------------------------------------------------------------------------------------------

  /** The crew presses SOS: a high-severity incident on the trip, its position in the trip log, and an alert to the office at once (a repeat within two minutes is the same SOS). */
  async sos(tx: Tx, p: UserPrincipal, trip: Trip, b: { lat?: number; lng?: number; note?: string }) {
    const now = this.clock.now();
    const [recent] = await tx.select().from(transportIncidents).where(and(eq(transportIncidents.tripId, trip.id), eq(transportIncidents.kind, 'sos'), sql`${transportIncidents.occurredAt} > ${new Date(now.getTime() - 120_000).toISOString()}::timestamptz`)).limit(1);
    if (recent) return { ...recent, repeated: true };
    const [route] = await tx.select({ name: transportRoutes.name, regNo: transportVehicles.regNo }).from(transportRoutes).leftJoin(transportVehicles, eq(transportVehicles.id, sql`coalesce(${trip.vehicleId}::uuid, ${transportRoutes.vehicleId})`)).where(eq(transportRoutes.id, trip.routeId));
    const lat = b.lat ?? trip.lastLat ?? null;
    const lng = b.lng ?? trip.lastLng ?? null;
    const where = lat != null && lng != null ? `${lat.toFixed(5)}, ${lng.toFixed(5)}` : '';
    const vehicleId = trip.vehicleId ?? (await this.vehicleFor(tx, trip.routeId, await todayIn(tx, now)));
    const [i] = await tx.insert(transportIncidents).values({ tenantId: p.tenantId, vehicleId, tripId: trip.id, kind: 'sos', severity: 'high', description: `SOS from the bus${b.note ? `: ${b.note}` : ''}${where ? ` (at ${where})` : ''}`.slice(0, 1000), occurredAt: now, reportedBy: p.userId }).returning();
    await tx.insert(transportTripEvents).values({ tenantId: p.tenantId, tripId: trip.id, kind: 'sos', at: now, lat, lng, detail: (b.note ?? '').slice(0, 300) });
    const map = where ? ` https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}` : '';
    await this.notifications.notifyUsers(tx, await usersWithRoles(tx, [...TRANSPORT_OFFICE]), {
      kind: 'transport',
      text: say({ en: `SOS: ${route?.name ?? 'school bus'}${route?.regNo ? ` (${route.regNo})` : ''}`, hi: `SOS: ${route?.name ?? 'स्कूल बस'}${route?.regNo ? ` (${route.regNo})` : ''}`, kn: `SOS: ${route?.name ?? 'ಶಾಲಾ ಬಸ್'}${route?.regNo ? ` (${route.regNo})` : ''}` }, { en: `The bus crew raised an SOS${b.note ? `: ${b.note}` : ''}.${map}`, hi: `बस कर्मचारियों ने SOS भेजा${b.note ? `: ${b.note}` : ''}।${map}`, kn: `ಬಸ್ ಸಿಬ್ಬಂದಿ SOS ಕಳುಹಿಸಿದ್ದಾರೆ${b.note ? `: ${b.note}` : ''}.${map}` }),
      data: { tripId: trip.id, incidentId: i.id, event: 'sos', ...(lat != null && lng != null && { lat: String(lat), lng: String(lng) }) },
      dedupeKey: `transport-sos:${i.id}`,
    });
    await auditUser(tx, p, 'transport.sos_raised', 'transport_incident', i.id, { tripId: trip.id, lat, lng });
    await this.events.emit(tx, p.tenantId, { type: DomainEvents.TransportSosRaised, aggregateType: 'transport_trip', aggregateId: trip.id, payload: { incidentId: i.id, lat, lng }, actorId: p.userId });
    return { ...i, repeated: false };
  }

  // ---- reminders ----------------------------------------------------------------------------------------------------

  /** Papers, licences, medical fitness and safety checks falling due: what is due within the reminder window (or overdue). */
  async dueDocuments(tx: Tx, today: string, withinDays: number): Promise<Due[]> {
    const rows = await tx.execute<{ kind: string; subject_id: string; subject: string; due: string }>(sql`
      select * from (
        select 'insurance' as kind, id as subject_id, reg_no as subject, insurance_expires_on::text as due from transport_vehicles where status <> 'retired' and insurance_expires_on is not null
        union all select 'fitness', id, reg_no, fitness_expires_on::text from transport_vehicles where status <> 'retired' and fitness_expires_on is not null
        union all select 'puc', id, reg_no, puc_expires_on::text from transport_vehicles where status <> 'retired' and puc_expires_on is not null
        union all select 'permit', id, reg_no, permit_expires_on::text from transport_vehicles where status <> 'retired' and permit_expires_on is not null
        union all select 'road_tax', id, reg_no, road_tax_expires_on::text from transport_vehicles where status <> 'retired' and road_tax_expires_on is not null
        union all select 'licence', id, full_name, license_expires_on::text from transport_drivers where active and license_expires_on is not null
        union all select 'medical', id, full_name, medical_valid_until::text from transport_drivers where active and medical_valid_until is not null
        union all select 'safety_check', v.id, v.reg_no, c.next_due_on::text from transport_vehicles v
          join lateral (select next_due_on from transport_safety_checks c where c.vehicle_id = v.id order by checked_on desc, created_at desc limit 1) c on true
          where v.status <> 'retired' and c.next_due_on is not null
      ) x where due::date <= ${today}::date + ${withinDays}::int order by due, subject`);
    return rows.rows.map((r) => ({ kind: r.kind, subjectId: r.subject_id, subject: r.subject, due: r.due }));
  }

  /**
   * The daily reminder to the transport office: each paper, licence, medical certificate or safety check reaching one
   * of the reminder days before it falls due (settings, e.g. 30, 15, 7, 1, 0), and every week once overdue. Each
   * reminder goes once (by document, due date and day).
   */
  async expiryReminders(tx: Tx, tenantId: string): Promise<{ today: string; sent: number; items: (Due & { daysLeft: number })[] }> {
    const today = await todayIn(tx, this.clock.now());
    const rules = (await readSettings(tx, tenantId, 'transport')).rules;
    const days = String(rules.expiryReminderDays ?? '30,15,7,1,0').split(',').map((d) => Number(d.trim())).filter((n) => Number.isInteger(n) && n >= 0);
    const max = Math.max(0, ...days);
    const items = (await this.dueDocuments(tx, today, max)).map((d) => ({ ...d, daysLeft: daysBetween(today, d.due) })).filter((d) => days.includes(d.daysLeft) || (d.daysLeft < 0 && -d.daysLeft % 7 === 0));
    if (!items.length) return { today, sent: 0, items };
    const office = await usersWithRoles(tx, [...TRANSPORT_OFFICE]);
    const WORD: Record<string, Words> = {
      insurance: { en: 'insurance', hi: 'बीमा', kn: 'ವಿಮೆ' },
      fitness: { en: 'fitness certificate', hi: 'फिटनेस प्रमाणपत्र', kn: 'ಫಿಟ್‌ನೆಸ್ ಪ್ರಮಾಣಪತ್ರ' },
      puc: { en: 'pollution certificate', hi: 'प्रदूषण प्रमाणपत्र', kn: 'ಮಾಲಿನ್ಯ ಪ್ರಮಾಣಪತ್ರ' },
      permit: { en: 'permit', hi: 'परमिट', kn: 'ಪರ್ಮಿಟ್' },
      road_tax: { en: 'road tax', hi: 'रोड टैक्स', kn: 'ರಸ್ತೆ ತೆರಿಗೆ' },
      licence: { en: 'driving licence', hi: 'ड्राइविंग लाइसेंस', kn: 'ಚಾಲನಾ ಪರವಾನಗಿ' },
      medical: { en: 'medical fitness', hi: 'चिकित्सा फिटनेस', kn: 'ವೈದ್ಯಕೀಯ ಫಿಟ್‌ನೆಸ್' },
      safety_check: { en: 'safety check', hi: 'सुरक्षा जाँच', kn: 'ಸುರಕ್ಷತಾ ತಪಾಸಣೆ' },
    };
    for (const d of items) {
      const w = WORD[d.kind];
      const when: Words = d.daysLeft < 0 ? { en: `expired on ${d.due}`, hi: `${d.due} को समाप्त`, kn: `${d.due} ರಂದು ಮುಗಿದಿದೆ` } : d.daysLeft === 0 ? { en: 'expires today', hi: 'आज समाप्त', kn: 'ಇಂದು ಮುಗಿಯುತ್ತದೆ' } : { en: `due in ${d.daysLeft} days (${d.due})`, hi: `${d.daysLeft} दिन में देय (${d.due})`, kn: `${d.daysLeft} ದಿನಗಳಲ್ಲಿ (${d.due})` };
      await this.notifications.notifyUsers(tx, office, {
        kind: 'transport',
        text: say({ en: `${d.subject}: ${w.en} ${when.en}`, hi: `${d.subject}: ${w.hi} ${when.hi}`, kn: `${d.subject}: ${w.kn} ${when.kn}` }, { en: `Renew the ${w.en} for ${d.subject} before it lapses.`, hi: `${d.subject} का ${w.hi} समय पर नवीनीकृत करें।`, kn: `${d.subject} ಅವರ ${w.kn} ಅನ್ನು ಸಮಯಕ್ಕೆ ನವೀಕರಿಸಿ.` }),
        data: { kind: d.kind, subjectId: d.subjectId, due: d.due, event: 'expiry' },
        dedupeKey: `transport-expiry:${d.kind}:${d.subjectId}:${d.due}:${d.daysLeft}`,
      });
    }
    return { today, sent: items.length, items };
  }

  /** The latest safety check of each vehicle. */
  async latestChecks(tx: Tx) {
    return tx.selectDistinctOn([transportSafetyChecks.vehicleId]).from(transportSafetyChecks).orderBy(transportSafetyChecks.vehicleId, desc(transportSafetyChecks.checkedOn), desc(transportSafetyChecks.createdAt));
  }

  /** Who may see a seat's fee changes: the office, or the student and their family. */
  async assertOfficeOrFamily(tx: Tx, p: UserPrincipal, studentId: string): Promise<void> {
    if (p.roles.some((r) => (TRANSPORT_OFFICE as readonly string[]).includes(r))) return;
    const fam = await familyUserIds(tx, studentId);
    if (!fam.includes(p.userId)) throw new ForbiddenException('Not allowed');
  }
}
