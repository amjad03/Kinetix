import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Query, Res } from '@nestjs/common';
import { createHash, randomInt } from 'node:crypto';
import type { Readable } from 'node:stream';
import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { Response } from 'express';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { UserPrincipal } from '../auth/principal.js';
import { readSettings } from '../campus-ops/settings.js';
import { auditUser } from '../common/audit.js';
import { familyUserIds, todayIn } from '../common/lht-kit.js';
import { PdfWriter } from '../common/pdf.js';
import { assertCanSeeStudent } from '../common/student-access.js';
import { Clock } from '../common/time.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService, type Tx } from '../db/db.service.js';
import { feeInvoices, sections, students, tenants, transportAssignments, transportDrivers, transportIncidents, transportRoutes, transportStops, transportTripEvents, transportTrips, transportVehicles, users } from '../db/schema.js';
import { payrollAdjustments } from '../db/schema-depth.js';
import { transportChangeRequests, transportDriverDuty, transportHandovers, transportMaintenance, transportPickupPersons, transportRouteOverrides } from '../db/schema-lht.js';
import { FeesService } from '../fees/fees.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { ObjectStorage } from '../storage/storage.service.js';
import { TRANSPORT_ROLES } from './transport.controller.js';
import { seatFee } from './transport-rules.js';

const Month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use a month like 2026-10');
const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-10-15');
const FeeRunBody = z.object({ month: Month, routeId: z.uuid().optional(), dueOn: Day.optional() });
const ChangeBody = z.object({ studentId: z.uuid(), toStopId: z.uuid(), effectiveOn: Day, reason: z.string().trim().min(3).max(500) });
const OtpBody = z.object({ studentId: z.uuid(), tripId: z.uuid().optional() });
const VerifyBody = z.object({ otp: z.string().regex(/^\d{6}$/, 'Give the six-digit code') });
const PhotoBody = z.object({ studentId: z.uuid(), personId: z.uuid(), tripId: z.uuid().optional() });
const STOP_STAFF = [...TRANSPORT_ROLES, 'driver'] as const;
const MAX_ATTEMPTS = 5;

async function readAll(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const c of stream) chunks.push(c as Buffer);
  return Buffer.concat(chunks);
}

const otpHash = (id: string, otp: string) => createHash('sha256').update(`${id}:${otp}`).digest('hex');

/**
 * Transport workflows beyond single records: the monthly transport fee (pro rata, students through fees, staff
 * through payroll), families' change requests and the route list they choose from, the safe hand-over at the stop
 * (a one-time code to the family, or the photo of an authorised person), bus passes with a QR code and photo, today's
 * driver duty, the expiry calendar, the dashboard and transport's no-dues.
 */
@Controller('v1/transport')
export class TransportOpsController {
  constructor(
    private readonly db: DbService,
    private readonly clock: Clock,
    private readonly fees: FeesService,
    private readonly notifications: NotificationsService,
    private readonly storage: ObjectStorage,
  ) {}

  // ---- fees ---------------------------------------------------------------------------------------------------------

  /**
   * The month's transport fee for every rider: a full month at the seat's fee, the days' share for anyone who joined,
   * left or moved during the month. Students are charged through fees (once per month); staff get a payroll recovery
   * for the month waiting for HR's approval.
   */
  @Post('fees/month')
  @HttpCode(200)
  @Auth('user', TRANSPORT_ROLES)
  runMonth(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(FeeRunBody)) b: z.infer<typeof FeeRunBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const first = `${b.month}-01`;
      const seats = await tx
        .select({ a: transportAssignments, stopFee: transportStops.feePaise, routeFee: transportRoutes.monthlyFeePaise, route: transportRoutes.name })
        .from(transportAssignments)
        .innerJoin(transportStops, eq(transportStops.id, transportAssignments.stopId))
        .innerJoin(transportRoutes, eq(transportRoutes.id, transportAssignments.routeId))
        .where(and(sql`${transportAssignments.startsOn} < (${first}::date + interval '1 month')`, sql`(${transportAssignments.endedOn} is null or ${transportAssignments.endedOn} > ${first}::date)`, b.routeId ? eq(transportAssignments.routeId, b.routeId) : undefined));
      const students = new Map<string, number>();
      const staff = new Map<string, { amount: number; routes: Set<string> }>();
      for (const s of seats) {
        const fee = seatFee(b.month, s.a.feePaise ?? s.stopFee ?? s.routeFee, s.a.startsOn, s.a.endedOn);
        if (fee <= 0) continue;
        if (s.a.studentId) students.set(s.a.studentId, (students.get(s.a.studentId) ?? 0) + fee);
        else if (s.a.staffUserId) {
          const cur = staff.get(s.a.staffUserId) ?? { amount: 0, routes: new Set<string>() };
          cur.amount += fee;
          cur.routes.add(s.route);
          staff.set(s.a.staffUserId, cur);
        }
      }
      const dueOn = b.dueOn ?? first;
      const res = await this.fees.chargeStudents(tx, p, `Transport fee ${b.month}`, dueOn < (await todayIn(tx, this.clock.now())) ? await todayIn(tx, this.clock.now()) : dueOn, [...students].map(([studentId, amountPaise]) => ({ studentId, amountPaise })));
      let recoveries = 0;
      for (const [userId, s] of staff) {
        const reason = `Transport ${b.month}: ${[...s.routes].join(', ')}`.slice(0, 200);
        const [have] = await tx.select({ id: payrollAdjustments.id }).from(payrollAdjustments).where(and(eq(payrollAdjustments.userId, userId), eq(payrollAdjustments.payMonth, b.month), eq(payrollAdjustments.kind, 'recovery'), sql`${payrollAdjustments.reason} like ${`Transport ${b.month}:%`}`));
        if (have) continue;
        await tx.insert(payrollAdjustments).values({ tenantId: p.tenantId, userId, kind: 'recovery', payMonth: b.month, amountPaise: s.amount, reason, createdBy: p.userId });
        recoveries++;
      }
      await auditUser(tx, p, 'transport.fees_month', 'transport_route', b.routeId, { month: b.month, ...res, staffRecoveries: recoveries });
      return { month: b.month, studentsCharged: res.charged, studentsSkipped: res.skipped, staffRecoveries: recoveries };
    });
  }

  // ---- families ---------------------------------------------------------------------------------------------------

  /** Running routes with their stops, timings and fees (for a family choosing a new stop). */
  @Get('routes-public')
  @Auth('user')
  publicRoutes(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const routes = await tx.select({ id: transportRoutes.id, name: transportRoutes.name, feePaise: transportRoutes.monthlyFeePaise }).from(transportRoutes).where(eq(transportRoutes.active, true)).orderBy(asc(transportRoutes.name));
      const stops = routes.length ? await tx.select({ id: transportStops.id, routeId: transportStops.routeId, name: transportStops.name, landmark: transportStops.landmark, pickupTime: transportStops.pickupTime, dropTime: transportStops.dropTime, feePaise: transportStops.feePaise }).from(transportStops).where(inArray(transportStops.routeId, routes.map((r) => r.id))).orderBy(asc(transportStops.sortOrder), asc(transportStops.seq)) : [];
      return routes.map((r) => ({ ...r, stops: stops.filter((s) => s.routeId === r.id).map((s) => ({ ...s, feePaise: s.feePaise ?? r.feePaise })) }));
    });
  }

  /** A family (or the student) asks to move to another stop or route from a date. */
  @Post('change-requests/mine')
  @Auth('user', ['student', 'guardian'])
  askChange(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(ChangeBody)) b: z.infer<typeof ChangeBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await assertCanSeeStudent(tx, p, b.studentId, []);
      const [stop] = await tx.select().from(transportStops).where(eq(transportStops.id, b.toStopId));
      if (!stop) throw new NotFoundException('Stop not found');
      if (b.effectiveOn < (await todayIn(tx, this.clock.now()))) throw new BadRequestException('The date has passed');
      const [open] = await tx.select({ id: transportChangeRequests.id }).from(transportChangeRequests).where(and(eq(transportChangeRequests.studentId, b.studentId), eq(transportChangeRequests.status, 'pending')));
      if (open) throw new ConflictException('A change request is already waiting');
      const [cur] = await tx.select().from(transportAssignments).where(and(eq(transportAssignments.studentId, b.studentId), isNull(transportAssignments.endedOn)));
      const [row] = await tx.insert(transportChangeRequests).values({ tenantId: p.tenantId, studentId: b.studentId, fromRouteId: cur?.routeId ?? null, fromStopId: cur?.stopId ?? null, toRouteId: stop.routeId, toStopId: stop.id, effectiveOn: b.effectiveOn, reason: b.reason, requestedBy: p.userId }).returning();
      await auditUser(tx, p, 'transport_change_request.created', 'transport_change_request', row.id);
      return row;
    });
  }

  @Get('change-requests/mine')
  @Auth('user', ['student', 'guardian'])
  myChanges(@CurrentPrincipal() p: UserPrincipal, @Query('studentId', ParseUUIDPipe) studentId: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await assertCanSeeStudent(tx, p, studentId, []);
      return tx.select().from(transportChangeRequests).where(eq(transportChangeRequests.studentId, studentId)).orderBy(sql`${transportChangeRequests.createdAt} desc`).limit(20);
    });
  }

  // ---- hand-over at the stop ------------------------------------------------------------------------------------------

  /** Who may receive the child (with photos), for the driver at the stop and for the family. */
  @Get('students/:id/pickup-persons')
  @Auth('user')
  persons(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) studentId: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await this.assertStopStaffOrFamily(tx, p, studentId);
      return tx.select().from(transportPickupPersons).where(and(eq(transportPickupPersons.studentId, studentId), eq(transportPickupPersons.active, true))).orderBy(asc(transportPickupPersons.name));
    });
  }

  /** At the stop: a six-digit code goes to the family; the person receiving the child reads it out to the driver. */
  @Post('handovers/otp')
  @Auth('user', [...STOP_STAFF])
  async sendOtp(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(OtpBody)) b: z.infer<typeof OtpBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [s] = await tx.select({ id: students.id, name: students.fullName }).from(students).where(eq(students.id, b.studentId));
      if (!s) throw new NotFoundException('Student not found');
      const family = await familyUserIds(tx, s.id);
      if (!family.length) throw new ConflictException('No one in the family has the app; use the photo check');
      const minutes = Number((await readSettings(tx, p.tenantId, 'transport')).rules.handoverOtpMinutes) || 30;
      const now = this.clock.now();
      const [h] = await tx.insert(transportHandovers).values({ tenantId: p.tenantId, studentId: s.id, tripId: b.tripId ?? null, method: 'otp', otpExpiresAt: new Date(now.getTime() + minutes * 60_000), recordedBy: p.userId }).returning();
      const otp = String(randomInt(0, 1_000_000)).padStart(6, '0');
      await tx.update(transportHandovers).set({ otpHash: otpHash(h.id, otp) }).where(eq(transportHandovers.id, h.id));
      await this.notifications.notifyUsers(tx, family, {
        kind: 'transport',
        text: {
          en: { title: `Code to receive ${s.name}: ${otp}`, body: `Give this code to the bus staff when you receive ${s.name} at the stop. It works for ${minutes} minutes.` },
          hi: { title: `${s.name} को लेने का कोड: ${otp}`, body: `स्टॉप पर ${s.name} को लेते समय यह कोड बस कर्मचारी को बताएँ। यह ${minutes} मिनट तक मान्य है।` },
          kn: { title: `${s.name} ಅವರನ್ನು ಕರೆದೊಯ್ಯಲು ಕೋಡ್: ${otp}`, body: `ನಿಲ್ದಾಣದಲ್ಲಿ ${s.name} ಅವರನ್ನು ಕರೆದೊಯ್ಯುವಾಗ ಈ ಕೋಡ್ ಅನ್ನು ಬಸ್ ಸಿಬ್ಬಂದಿಗೆ ತಿಳಿಸಿ. ಇದು ${minutes} ನಿಮಿಷ ಮಾನ್ಯ.` },
        },
        data: { studentId: s.id, handoverId: h.id },
        dedupeKey: `handover:${h.id}`,
      });
      await auditUser(tx, p, 'transport_handover.code_sent', 'transport_handover', h.id, { studentId: s.id });
      const persons = await tx.select({ id: transportPickupPersons.id, name: transportPickupPersons.name, relation: transportPickupPersons.relation, photoUrl: transportPickupPersons.photoUrl }).from(transportPickupPersons).where(and(eq(transportPickupPersons.studentId, s.id), eq(transportPickupPersons.active, true)));
      return { handoverId: h.id, expiresAt: h.otpExpiresAt, persons };
    });
  }

  /** The code given at the stop: the child is handed over, or (after too many wrong codes) the hand-over is refused. */
  @Post('handovers/:id/verify')
  @HttpCode(200)
  @Auth('user', [...STOP_STAFF])
  verify(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(VerifyBody)) b: z.infer<typeof VerifyBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [h] = await tx.select().from(transportHandovers).where(eq(transportHandovers.id, id)).for('update');
      if (!h) throw new NotFoundException('Hand-over not found');
      if (h.status !== 'pending') throw new ConflictException(`This hand-over is ${h.status}`);
      if (h.otpExpiresAt && h.otpExpiresAt < this.clock.now()) {
        await tx.update(transportHandovers).set({ status: 'refused', note: 'The code expired' }).where(eq(transportHandovers.id, id));
        return { ok: false, status: 'refused', reason: 'expired' };
      }
      if (h.otpHash !== otpHash(id, b.otp)) {
        const attempts = h.attempts + 1;
        const status = attempts >= MAX_ATTEMPTS ? 'refused' : 'pending';
        await tx.update(transportHandovers).set({ attempts, status, ...(status === 'refused' && { note: 'Too many wrong codes' }) }).where(eq(transportHandovers.id, id));
        await auditUser(tx, p, 'transport_handover.wrong_code', 'transport_handover', id, { attempts });
        return { ok: false, status, attemptsLeft: MAX_ATTEMPTS - attempts };
      }
      await tx.update(transportHandovers).set({ status: 'done', handedAt: this.clock.now(), recordedBy: p.userId }).where(eq(transportHandovers.id, id));
      await auditUser(tx, p, 'transport_handover.done', 'transport_handover', id, { method: 'otp' });
      return { ok: true, status: 'done' };
    });
  }

  /** The child is handed to an authorised person the driver recognised from their photo. */
  @Post('handovers/photo')
  @Auth('user', [...STOP_STAFF])
  photo(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(PhotoBody)) b: z.infer<typeof PhotoBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [person] = await tx.select().from(transportPickupPersons).where(and(eq(transportPickupPersons.id, b.personId), eq(transportPickupPersons.studentId, b.studentId), eq(transportPickupPersons.active, true)));
      if (!person) throw new ForbiddenException('This person is not allowed to receive the child');
      const [h] = await tx.insert(transportHandovers).values({ tenantId: p.tenantId, studentId: b.studentId, tripId: b.tripId ?? null, personId: person.id, method: 'photo', status: 'done', handedAt: this.clock.now(), recordedBy: p.userId }).returning();
      const family = await familyUserIds(tx, b.studentId);
      const [s] = await tx.select({ name: students.fullName }).from(students).where(eq(students.id, b.studentId));
      await this.notifications.notifyUsers(tx, family, {
        kind: 'transport',
        text: {
          en: { title: `${s.name} was handed to ${person.name}`, body: `${s.name} got off the bus and was received by ${person.name} (${person.relation || 'authorised'}).` },
          hi: { title: `${s.name} को ${person.name} को सौंपा गया`, body: `${s.name} बस से उतरे और ${person.name} ने उन्हें लिया।` },
          kn: { title: `${s.name} ಅವರನ್ನು ${person.name} ಅವರಿಗೆ ಒಪ್ಪಿಸಲಾಗಿದೆ`, body: `${s.name} ಬಸ್ಸಿನಿಂದ ಇಳಿದರು ಮತ್ತು ${person.name} ಅವರು ಕರೆದೊಯ್ದರು.` },
        },
        data: { studentId: b.studentId, handoverId: h.id },
        dedupeKey: `handover:${h.id}`,
      });
      await auditUser(tx, p, 'transport_handover.done', 'transport_handover', h.id, { method: 'photo', personId: person.id });
      return h;
    });
  }

  private async assertStopStaffOrFamily(tx: Tx, p: UserPrincipal, studentId: string) {
    if (p.roles.some((r) => (STOP_STAFF as readonly string[]).includes(r))) return;
    await assertCanSeeStudent(tx, p, studentId, []);
  }

  // ---- bus passes -------------------------------------------------------------------------------------------------------

  /** A student's bus pass: name, photo, class, route, stop and timings, and a QR code the conductor can scan. */
  @Get('passes/:studentId.pdf')
  @Auth('user')
  async pass(@CurrentPrincipal() p: UserPrincipal, @Param('studentId', ParseUUIDPipe) studentId: string, @Res() res: Response) {
    const rows = await this.db.withTenant(p.tenantId, async (tx) => {
      await assertCanSeeStudent(tx, p, studentId, TRANSPORT_ROLES);
      return this.passRows(tx, p.tenantId, eq(transportAssignments.studentId, studentId));
    });
    if (!rows.length) throw new NotFoundException('This student has no transport seat');
    res.setHeader('content-type', 'application/pdf');
    res.setHeader('content-disposition', `inline; filename="bus-pass.pdf"`);
    res.end(await this.passPdf(rows));
  }

  /** Bus passes for every student on a route, one after another. */
  @Get('passes/route/:routeId.pdf')
  @Auth('user', TRANSPORT_ROLES)
  async routePasses(@CurrentPrincipal() p: UserPrincipal, @Param('routeId', ParseUUIDPipe) routeId: string, @Res() res: Response) {
    const rows = await this.db.withTenant(p.tenantId, (tx) => this.passRows(tx, p.tenantId, eq(transportAssignments.routeId, routeId)));
    if (!rows.length) throw new NotFoundException('No students ride this route');
    res.setHeader('content-type', 'application/pdf');
    res.setHeader('content-disposition', `inline; filename="bus-passes.pdf"`);
    res.end(await this.passPdf(rows));
  }

  private async passRows(tx: Tx, tenantId: string, where: ReturnType<typeof eq>) {
    const months = Number((await readSettings(tx, tenantId, 'transport')).rules.passValidMonths) || 12;
    const rows = await tx
      .select({ id: transportAssignments.id, studentId: students.id, name: students.fullName, rollNo: students.rollNo, className: sections.displayName, route: transportRoutes.name, stop: transportStops.name, pickup: transportStops.pickupTime, drop: transportStops.dropTime, regNo: transportVehicles.regNo, from: transportAssignments.startsOn, photoKey: users.photoKey, institution: tenants.name })
      .from(transportAssignments)
      .innerJoin(students, eq(students.id, transportAssignments.studentId))
      .innerJoin(sections, eq(sections.id, students.sectionId))
      .innerJoin(transportRoutes, eq(transportRoutes.id, transportAssignments.routeId))
      .innerJoin(transportStops, eq(transportStops.id, transportAssignments.stopId))
      .innerJoin(tenants, eq(tenants.id, transportAssignments.tenantId))
      .leftJoin(transportVehicles, eq(transportVehicles.id, transportRoutes.vehicleId))
      .leftJoin(users, eq(users.id, students.userId))
      .where(and(where, isNull(transportAssignments.endedOn)))
      .orderBy(asc(transportStops.sortOrder), asc(students.fullName));
    return rows.map((r) => ({ ...r, until: new Date(Date.parse(`${r.from}T00:00:00Z`) + months * 30.44 * 86_400_000).toISOString().slice(0, 10) }));
  }

  private async passPdf(rows: Awaited<ReturnType<TransportOpsController['passRows']>>): Promise<Buffer> {
    const pdf = new PdfWriter();
    for (const [i, r] of rows.entries()) {
      if (i > 0 && i % 3 === 0) pdf.newPage();
      pdf.text(`${r.institution} · Bus pass`, { size: 12, bold: true });
      const photo = r.photoKey ? await readAll((await this.storage.get(r.photoKey)).stream).catch(() => null) : null;
      if (photo) pdf.image(photo, { x: 445, width: 70, height: 85 });
      pdf.qr(`KXBUS:${r.id}:${r.studentId}`, 70);
      pdf.text(`${r.name}  (${r.rollNo})`, { size: 11, bold: true });
      pdf.text(`${r.className}`, { size: 10 });
      pdf.text(`Route ${r.route}${r.regNo ? ` · Bus ${r.regNo}` : ''}`, { size: 10 });
      pdf.text(`Stop ${r.stop}${r.pickup ? ` · pick-up ${r.pickup}` : ''}${r.drop ? ` · drop ${r.drop}` : ''}`, { size: 10 });
      pdf.text(`Valid ${r.from} to ${r.until}`, { size: 9 });
      pdf.rule();
      pdf.gap(16);
    }
    return pdf.build();
  }

  // ---- duty, calendar, dashboard, no-dues --------------------------------------------------------------------------------

  /** Opens today's duty sheet: each running route's driver marked present (already-marked drivers are left as they are). */
  @Post('duty/today')
  @HttpCode(200)
  @Auth('user', TRANSPORT_ROLES)
  dutyToday(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const today = await todayIn(tx, this.clock.now());
      const routes = await tx.select({ id: transportRoutes.id, driverId: transportRoutes.driverId }).from(transportRoutes).where(and(eq(transportRoutes.active, true), sql`${transportRoutes.driverId} is not null`));
      let made = 0;
      for (const r of routes) made += (await tx.insert(transportDriverDuty).values({ tenantId: p.tenantId, driverId: r.driverId!, dutyOn: today, routeId: r.id, status: 'present' }).onConflictDoNothing().returning({ id: transportDriverDuty.id })).length;
      await auditUser(tx, p, 'transport_duty.opened', 'transport_duty', undefined, { day: today, made });
      return { day: today, made, routes: routes.length };
    });
  }

  /** Papers, licences and maintenance falling due in the next `days` days (or overdue), soonest first. */
  @Get('calendar')
  @Auth('user', TRANSPORT_ROLES)
  calendar(@CurrentPrincipal() p: UserPrincipal, @Query('days') daysText = '90') {
    const days = Math.max(1, Math.min(730, Number(daysText) || 90));
    return this.db.withTenant(p.tenantId, async (tx) => {
      const today = await todayIn(tx, this.clock.now());
      const rows = await tx.execute<{ kind: string; subject: string; due: string }>(sql`
        select * from (
          select 'insurance' as kind, reg_no as subject, insurance_expires_on::text as due from transport_vehicles where status <> 'retired' and insurance_expires_on is not null
          union all select 'fitness', reg_no, fitness_expires_on::text from transport_vehicles where status <> 'retired' and fitness_expires_on is not null
          union all select 'puc', reg_no, puc_expires_on::text from transport_vehicles where status <> 'retired' and puc_expires_on is not null
          union all select 'permit', reg_no, permit_expires_on::text from transport_vehicles where status <> 'retired' and permit_expires_on is not null
          union all select 'road_tax', reg_no, road_tax_expires_on::text from transport_vehicles where status <> 'retired' and road_tax_expires_on is not null
          union all select 'licence', full_name, license_expires_on::text from transport_drivers where active and license_expires_on is not null
          union all select 'maintenance:' || m.kind, v.reg_no, m.due_on::text from transport_maintenance m join transport_vehicles v on v.id = m.vehicle_id where m.status = 'scheduled' and m.due_on is not null
        ) x where due::date <= ${today}::date + ${days}::int order by due, subject`);
      return { today, items: rows.rows.map((r) => ({ ...r, overdue: r.due < today })) };
    });
  }

  @Get('dashboard')
  @Auth('user', TRANSPORT_ROLES)
  dashboard(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const today = await todayIn(tx, this.clock.now());
      const n = sql<number>`count(*)::int`;
      const one = async (q: Promise<{ n: number }[]>) => (await q)[0]?.n ?? 0;
      const warn = Number((await readSettings(tx, p.tenantId, 'transport')).rules.docExpiryWarnDays);
      return {
        today,
        routes: await one(tx.select({ n }).from(transportRoutes).where(eq(transportRoutes.active, true))),
        vehicles: await one(tx.select({ n }).from(transportVehicles).where(sql`${transportVehicles.status} <> 'retired'`)),
        studentRiders: await one(tx.select({ n }).from(transportAssignments).where(and(isNull(transportAssignments.endedOn), sql`${transportAssignments.studentId} is not null`))),
        staffRiders: await one(tx.select({ n }).from(transportAssignments).where(and(isNull(transportAssignments.endedOn), sql`${transportAssignments.staffUserId} is not null`))),
        liveTrips: await one(tx.select({ n }).from(transportTrips).where(eq(transportTrips.status, 'running'))),
        papersDue: (await tx.execute<{ n: number }>(sql`select count(*)::int as n from transport_vehicles where status <> 'retired' and least(insurance_expires_on, fitness_expires_on, puc_expires_on, permit_expires_on, road_tax_expires_on) <= ${today}::date + ${warn}::int`)).rows[0].n,
        licencesDue: await one(tx.select({ n }).from(transportDrivers).where(and(eq(transportDrivers.active, true), sql`${transportDrivers.licenseExpiresOn} <= ${today}::date + ${warn}::int`))),
        maintenanceOverdue: await one(tx.select({ n }).from(transportMaintenance).where(and(eq(transportMaintenance.status, 'scheduled'), sql`${transportMaintenance.dueOn} < ${today}::date`))),
        alertsOpen: await one(tx.select({ n }).from(transportTripEvents).where(and(inArray(transportTripEvents.kind, ['overspeed', 'deviation']), isNull(transportTripEvents.acknowledgedAt)))),
        incidentsOpen: await one(tx.select({ n }).from(transportIncidents).where(eq(transportIncidents.status, 'open'))),
        claimsOpen: await one(tx.select({ n }).from(transportIncidents).where(eq(transportIncidents.claimStatus, 'filed'))),
        changeRequests: await one(tx.select({ n }).from(transportChangeRequests).where(eq(transportChangeRequests.status, 'pending'))),
        changesToday: await one(tx.select({ n }).from(transportRouteOverrides).where(sql`${today}::date between ${transportRouteOverrides.fromOn} and ${transportRouteOverrides.untilOn}`)),
        uncovered: await one(tx.select({ n }).from(transportDriverDuty).where(and(eq(transportDriverDuty.dutyOn, today), sql`${transportDriverDuty.status} <> 'present'`, isNull(transportDriverDuty.substituteDriverId), sql`${transportDriverDuty.routeId} is not null`))),
        handoversToday: await one(tx.select({ n }).from(transportHandovers).where(and(eq(transportHandovers.status, 'done'), sql`${transportHandovers.handedAt}::date = ${today}::date`))),
      };
    });
  }

  /** Whether a student owes transport anything: a seat still held or unpaid transport fees. */
  @Get('no-dues/:studentId')
  @Auth('user')
  noDues(@CurrentPrincipal() p: UserPrincipal, @Param('studentId', ParseUUIDPipe) studentId: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await assertCanSeeStudent(tx, p, studentId, TRANSPORT_ROLES);
      const [seat] = await tx.select({ id: transportAssignments.id }).from(transportAssignments).where(and(eq(transportAssignments.studentId, studentId), isNull(transportAssignments.endedOn)));
      const [fees] = await tx.select({ n: sql<number>`coalesce(sum(${feeInvoices.amountPaise} - ${feeInvoices.paidPaise}), 0)::bigint` }).from(feeInvoices).where(and(eq(feeInvoices.studentId, studentId), sql`${feeInvoices.title} ilike 'transport%'`));
      const unpaid = Number(fees.n);
      return { seat: !!seat, unpaidFeesPaise: unpaid, clear: !seat && unpaid <= 0 };
    });
  }
}
