import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, HttpCode, HttpException, NotFoundException, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { UserPrincipal } from '../auth/principal.js';
import { auditUser } from '../common/audit.js';
import { addDays, qual } from '../common/lht-kit.js';
import { nextNumber } from '../common/ops.js';
import { assertCanSeeStudent } from '../common/student-access.js';
import { Clock } from '../common/time.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService, type Tx } from '../db/db.service.js';
import { feeInvoices, hostelAllotments, hostelBeds, hostelBlocks, hostelComplaints, hostelGatePasses, hostelRooms, hostelVisitors, messPlans, messSubscriptions, students } from '../db/schema.js';
import { hostelApplications, hostelBedHolds, hostelDeposits, hostelDuties, hostelIncidents, hostelRequests, hostelRoomTypes, hostels, hostelSettlements, hostelSickbay, messBills, messLeaves } from '../db/schema-lht.js';
import { FeesService } from '../fees/fees.service.js';
import { allotBed, checkBed, residentOf } from './allotment.js';
import { HOSTEL_ROLES } from './hostel.controller.js';
import { rankApplications } from './hostel.records.js';
import { daysInMonth, messBill } from './hostel-rules.js';

const Month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use a month like 2026-10');
const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-10-15');
const ApplyBody = z.object({ studentId: z.uuid(), gender: z.enum(['male', 'female', 'other']), distanceKm: z.number().min(0).max(20000).optional(), hostelId: z.uuid().optional(), roomTypeId: z.uuid().optional(), needs: z.string().trim().max(300).default('') });
const RequestBody = z.object({ studentId: z.uuid(), kind: z.enum(['change', 'vacate']), roomTypeId: z.uuid().optional(), reason: z.string().trim().min(3).max(500), effectiveOn: Day });
const LeaveBody = z.object({ studentId: z.uuid(), fromOn: Day, toOn: Day, reason: z.string().trim().max(300).default('') });
const RosterBody = z.object({ hostelId: z.uuid(), from: Day, to: Day, shift: z.enum(['morning', 'evening', 'night']), userIds: z.array(z.uuid()).min(1).max(50) });
const FAMILY = ['student', 'guardian'] as const;

/**
 * The hostel's workflows beyond single records: ranked automatic allotment, applications, requests and mess leave
 * from students and families, the family's approval of out-passes, the monthly mess bill run, the occupancy
 * dashboard, planning the duty roster and the hostel's no-dues.
 */
@Controller('v1/hostel')
export class HostelOpsController {
  constructor(
    private readonly db: DbService,
    private readonly clock: Clock,
    private readonly fees: FeesService,
  ) {}

  private today(tx: Tx) {
    return tx.execute<{ d: string }>(sql`select (${this.clock.now().toISOString()}::timestamptz at time zone coalesce((select timezone from tenants limit 1), 'Asia/Kolkata'))::date::text as d`).then((r) => r.rows[0].d);
  }

  // ---- allotment --------------------------------------------------------------------------------------------------

  /**
   * Allots beds to approved applications in priority order (distance, merit, seniority weights from the settings):
   * each gets the first free bed in their preferred hostel and room type that the gender and year rules allow.
   */
  @Post('applications/auto-allot')
  @HttpCode(200)
  @Auth('user', HOSTEL_ROLES)
  autoAllot(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(z.object({ hostelId: z.uuid().optional() }))) b: { hostelId?: string }) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await rankApplications({ tx, p });
      const today = await this.today(tx);
      const apps = await tx.select().from(hostelApplications).where(and(eq(hostelApplications.status, 'approved'), b.hostelId ? eq(hostelApplications.hostelId, b.hostelId) : undefined)).orderBy(desc(hostelApplications.priority), asc(hostelApplications.createdAt));
      const placed: { number: string; bed: string }[] = [];
      const unplaced: { number: string; reason: string }[] = [];
      for (const a of apps) {
        const beds = await tx
          .select({ id: hostelBeds.id, label: sql<string>`${hostelBlocks.name} || ' · ' || ${hostelRooms.number} || ' · ' || ${hostelBeds.label}` })
          .from(hostelBeds)
          .innerJoin(hostelRooms, eq(hostelRooms.id, hostelBeds.roomId))
          .innerJoin(hostelBlocks, eq(hostelBlocks.id, hostelRooms.blockId))
          .where(and(eq(hostelRooms.status, 'available'), sql`not exists (select 1 from hostel_allotments x where x.bed_id = ${qual(hostelBeds.id)} and x.vacated_on is null)`, a.hostelId ? eq(hostelBlocks.hostelId, a.hostelId) : b.hostelId ? eq(hostelBlocks.hostelId, b.hostelId) : undefined, a.roomTypeId ? eq(hostelRooms.roomTypeId, a.roomTypeId) : undefined))
          .orderBy(asc(hostelBlocks.name), asc(hostelRooms.number), asc(hostelBeds.label));
        let done = false;
        let lastReason = 'No free bed matches the preferences';
        for (const bed of beds) {
          try {
            await tx.transaction(async (sp) => {
              await checkBed(sp, a.studentId, bed.id, today);
              const allot = await allotBed(sp, p, this.clock.now(), a.studentId, bed.id);
              await sp.update(hostelApplications).set({ status: 'allotted', allotmentId: allot.id, decidedBy: p.userId, decidedAt: this.clock.now() }).where(eq(hostelApplications.id, a.id));
            });
            placed.push({ number: a.number, bed: bed.label });
            done = true;
            break;
          } catch (e) {
            lastReason = e instanceof HttpException ? String((e.getResponse() as { message?: unknown }).message ?? e.message) : (e as Error).message;
          }
        }
        if (!done) {
          await tx.update(hostelApplications).set({ status: 'waitlisted' }).where(eq(hostelApplications.id, a.id));
          unplaced.push({ number: a.number, reason: lastReason });
        }
      }
      await auditUser(tx, p, 'hostel.auto_allotted', 'hostel_application', undefined, { placed: placed.length, waitlisted: unplaced.length });
      return { placed, unplaced };
    });
  }

  /** A student (or their family) applies for a hostel seat. */
  @Post('applications/mine')
  @Auth('user', [...FAMILY])
  apply(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(ApplyBody)) b: z.infer<typeof ApplyBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await assertCanSeeStudent(tx, p, b.studentId, []);
      if (await residentOf(tx, b.studentId)) throw new ConflictException('This student already has a bed');
      const [open] = await tx.select({ id: hostelApplications.id }).from(hostelApplications).where(and(eq(hostelApplications.studentId, b.studentId), inArray(hostelApplications.status, ['applied', 'approved', 'waitlisted'])));
      if (open) throw new ConflictException('An application is already open');
      const [row] = await tx.insert(hostelApplications).values({ tenantId: p.tenantId, number: await nextNumber(tx, p.tenantId, 'HAP'), studentId: b.studentId, gender: b.gender, distanceKm: b.distanceKm ?? null, hostelId: b.hostelId ?? null, roomTypeId: b.roomTypeId ?? null, needs: b.needs, createdBy: p.userId }).returning();
      await rankApplications({ tx, p });
      await auditUser(tx, p, 'hostel_application.created', 'hostel_application', row.id, { byFamily: true });
      return row;
    });
  }

  @Get('applications/mine')
  @Auth('user', [...FAMILY])
  myApplications(@CurrentPrincipal() p: UserPrincipal, @Query('studentId', ParseUUIDPipe) studentId: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await assertCanSeeStudent(tx, p, studentId, []);
      return tx.select({ id: hostelApplications.id, number: hostelApplications.number, status: hostelApplications.status, decisionNote: hostelApplications.decisionNote, createdAt: hostelApplications.createdAt }).from(hostelApplications).where(eq(hostelApplications.studentId, studentId)).orderBy(desc(hostelApplications.createdAt));
    });
  }

  /** A resident (or their family) asks to change room or to vacate. */
  @Post('requests/mine')
  @Auth('user', [...FAMILY])
  request(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(RequestBody)) b: z.infer<typeof RequestBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await assertCanSeeStudent(tx, p, b.studentId, []);
      if (!(await residentOf(tx, b.studentId))) throw new BadRequestException('This student has no hostel bed');
      const [open] = await tx.select({ id: hostelRequests.id }).from(hostelRequests).where(and(eq(hostelRequests.studentId, b.studentId), eq(hostelRequests.status, 'pending')));
      if (open) throw new ConflictException('A request is already waiting for the warden');
      const [row] = await tx.insert(hostelRequests).values({ tenantId: p.tenantId, studentId: b.studentId, kind: b.kind, roomTypeId: b.roomTypeId ?? null, reason: b.reason, effectiveOn: b.effectiveOn, createdBy: p.userId }).returning();
      await auditUser(tx, p, 'hostel_request.created', 'hostel_request', row.id, { kind: b.kind });
      return row;
    });
  }

  /** A resident (or their family) tells the mess they will be away. */
  @Post('mess/leaves/mine')
  @Auth('user', [...FAMILY])
  messLeave(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(LeaveBody)) b: z.infer<typeof LeaveBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await assertCanSeeStudent(tx, p, b.studentId, []);
      if (b.toOn < b.fromOn) throw new BadRequestException('The end is before the start');
      const [row] = await tx.insert(messLeaves).values({ tenantId: p.tenantId, studentId: b.studentId, fromOn: b.fromOn, toOn: b.toOn, reason: b.reason, createdBy: p.userId }).returning();
      await auditUser(tx, p, 'mess_leave.created', 'mess_leave', row.id);
      return row;
    });
  }

  // ---- the family's say on out-passes ----------------------------------------------------------------------------------

  @Post('gate-passes/:id/parent-approve')
  @HttpCode(200)
  @Auth('user', ['guardian'])
  parentApprove(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.parentDecide(p, id, true);
  }

  @Post('gate-passes/:id/parent-reject')
  @HttpCode(200)
  @Auth('user', ['guardian'])
  parentReject(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.parentDecide(p, id, false);
  }

  /** Passes waiting for this guardian's approval. */
  @Get('gate-passes/for-family')
  @Auth('user', ['guardian'])
  forFamily(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, (tx) =>
      tx
        .select({ pass: hostelGatePasses, studentName: students.fullName })
        .from(hostelGatePasses)
        .innerJoin(students, eq(students.id, hostelGatePasses.studentId))
        .where(and(eq(hostelGatePasses.status, 'parent_pending'), sql`exists (select 1 from guardians g where g.student_id = ${qual(hostelGatePasses.studentId)} and g.user_id = ${p.userId}::uuid)`))
        .orderBy(desc(hostelGatePasses.createdAt)),
    );
  }

  private parentDecide(p: UserPrincipal, id: string, approve: boolean) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [pass] = await tx.select().from(hostelGatePasses).where(eq(hostelGatePasses.id, id)).for('update');
      if (!pass) throw new NotFoundException('Pass not found');
      await assertCanSeeStudent(tx, p, pass.studentId, []);
      if (pass.status !== 'parent_pending') throw new ConflictException('This pass is not waiting for the family');
      const needsWarden = (await tx.execute<{ v: boolean }>(sql`select coalesce((settings -> 'rules' ->> 'outpassNeedsApproval')::boolean, true) as v from module_settings where module = 'hostel'`)).rows[0]?.v ?? true;
      const status = approve ? (needsWarden ? 'requested' : 'approved') : 'rejected';
      const [row] = await tx.update(hostelGatePasses).set({ status, parentStatus: approve ? 'approved' : 'rejected', parentDecidedBy: p.userId, parentDecidedAt: this.clock.now() }).where(eq(hostelGatePasses.id, id)).returning();
      await auditUser(tx, p, `hostel.pass_parent_${approve ? 'approved' : 'rejected'}`, 'hostel_gate_pass', id);
      return row;
    });
  }

  // ---- the mess bill ---------------------------------------------------------------------------------------------------

  /** Works out each resident's mess bill for a month (days on the plan, leave rebates); drafts can be run again. */
  @Post('mess/bills/run')
  @HttpCode(200)
  @Auth('user', HOSTEL_ROLES)
  runBills(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(z.object({ month: Month }))) b: { month: string }) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const first = `${b.month}-01`;
      const last = `${b.month}-${String(daysInMonth(b.month)).padStart(2, '0')}`;
      const subs = await tx.select({ s: messSubscriptions, plan: messPlans }).from(messSubscriptions).innerJoin(messPlans, eq(messPlans.id, messSubscriptions.planId)).where(and(sql`${messSubscriptions.startsOn} <= ${last}::date`, sql`(${messSubscriptions.endedOn} is null or ${messSubscriptions.endedOn} >= ${first}::date)`));
      const leaves = await tx.select().from(messLeaves).where(and(eq(messLeaves.status, 'approved'), sql`${messLeaves.fromOn} <= ${last}::date and ${messLeaves.toOn} >= ${first}::date`));
      const charged = new Set((await tx.select({ s: messBills.studentId }).from(messBills).where(and(eq(messBills.month, b.month), eq(messBills.status, 'charged')))).map((r) => r.s));
      const byStudent = new Map<string, typeof subs>();
      for (const r of subs) byStudent.set(r.s.studentId, [...(byStudent.get(r.s.studentId) ?? []), r]);
      let made = 0;
      for (const [studentId, rows] of byStudent) {
        if (charged.has(studentId)) continue;
        const total = { days: 0, leaveDays: 0, rebateDays: 0, grossPaise: 0, rebatePaise: 0, netPaise: 0 };
        for (const r of rows) {
          const bill = messBill(b.month, { startsOn: r.s.startsOn, endedOn: r.s.endedOn }, r.plan, leaves.filter((l) => l.studentId === studentId));
          for (const k of Object.keys(total) as (keyof typeof total)[]) total[k] += bill[k];
        }
        const planId = rows[rows.length - 1].plan.id;
        await tx.insert(messBills).values({ tenantId: p.tenantId, studentId, planId, month: b.month, ...total }).onConflictDoUpdate({ target: [messBills.studentId, messBills.month], set: { planId, ...total } });
        made++;
      }
      await auditUser(tx, p, 'mess_bill.run', 'mess_bill', undefined, { month: b.month, bills: made });
      return { month: b.month, bills: made, alreadyCharged: charged.size };
    });
  }

  /** Charges every uncharged bill of the month to the students' fee accounts. */
  @Post('mess/bills/charge')
  @HttpCode(200)
  @Auth('user', HOSTEL_ROLES)
  chargeBills(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(z.object({ month: Month, dueOn: Day.optional() }))) b: { month: string; dueOn?: string }) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const bills = await tx.select().from(messBills).where(and(eq(messBills.month, b.month), eq(messBills.status, 'draft'), sql`${messBills.netPaise} > 0`));
      const title = `Mess bill ${b.month}`;
      const res = await this.fees.chargeStudents(tx, p, title, b.dueOn ?? (await this.today(tx)), bills.map((x) => ({ studentId: x.studentId, amountPaise: x.netPaise })));
      if (bills.length) await tx.update(messBills).set({ status: 'charged', chargedTitle: title }).where(inArray(messBills.id, bills.map((x) => x.id)));
      await auditUser(tx, p, 'mess_bill.charged_month', 'mess_bill', undefined, { month: b.month, ...res });
      return res;
    });
  }

  // ---- dashboard, roster, no-dues ----------------------------------------------------------------------------------------

  /** Occupancy by hostel, block and room type, with today's movements and what waits for the warden. */
  @Get('occupancy')
  @Auth('user', HOSTEL_ROLES)
  occupancy(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const today = await this.today(tx);
      const beds = await tx.execute<{ hostel: string | null; gender: string; block: string; type: string | null; status: string; beds: number; occupied: number; held: number }>(sql`
        select h.name as hostel, coalesce(nullif(k.gender, 'mixed'), h.gender, 'mixed') as gender, k.name as block, t.name as type, r.status,
               count(b.id)::int as beds,
               count(a.id)::int as occupied,
               count(hd.id) filter (where a.id is null)::int as held
        from hostel_beds b join hostel_rooms r on r.id = b.room_id join hostel_blocks k on k.id = r.block_id
        left join hostels h on h.id = k.hostel_id left join hostel_room_types t on t.id = r.room_type_id
        left join hostel_allotments a on a.bed_id = b.id and a.vacated_on is null
        left join hostel_bed_holds hd on hd.bed_id = b.id and hd.status = 'active' and hd.until_on >= ${today}::date
        group by h.name, h.gender, k.gender, k.name, t.name, r.status order by h.name, k.name, t.name`);
      const rows = beds.rows;
      const sum = (f: (r: (typeof rows)[number]) => number) => rows.reduce((t, r) => t + f(r), 0);
      const count = async (q: Promise<{ n: number }[]>) => (await q)[0]?.n ?? 0;
      const n = sql<number>`count(*)::int`;
      return {
        today,
        totals: { beds: sum((r) => r.beds), occupied: sum((r) => r.occupied), held: sum((r) => r.held), closed: sum((r) => (r.status === 'available' ? 0 : r.beds - r.occupied)), free: sum((r) => (r.status === 'available' ? r.beds - r.occupied - r.held : 0)) },
        byBlock: rows,
        outNow: await count(tx.select({ n }).from(hostelGatePasses).where(eq(hostelGatePasses.status, 'out'))),
        lateBack: await count(tx.select({ n }).from(hostelGatePasses).where(and(eq(hostelGatePasses.status, 'out'), sql`${hostelGatePasses.expectedBackAt} < now()`))),
        visitorsInside: await count(tx.select({ n }).from(hostelVisitors).where(isNull(hostelVisitors.outAt))),
        passRequests: await count(tx.select({ n }).from(hostelGatePasses).where(eq(hostelGatePasses.status, 'requested'))),
        applications: await count(tx.select({ n }).from(hostelApplications).where(inArray(hostelApplications.status, ['applied', 'approved']))),
        waitlisted: await count(tx.select({ n }).from(hostelApplications).where(eq(hostelApplications.status, 'waitlisted'))),
        requests: await count(tx.select({ n }).from(hostelRequests).where(eq(hostelRequests.status, 'pending'))),
        complaintsOpen: await count(tx.select({ n }).from(hostelComplaints).where(inArray(hostelComplaints.status, ['open', 'in_progress']))),
        sickbay: await count(tx.select({ n }).from(hostelSickbay).where(isNull(hostelSickbay.dischargedAt))),
        incidentsOpen: await count(tx.select({ n }).from(hostelIncidents).where(eq(hostelIncidents.status, 'open'))),
        settlementsDue: await count(tx.select({ n }).from(hostelSettlements).where(eq(hostelSettlements.status, 'pending'))),
        depositsHeldPaise: Number((await tx.select({ n: sql<number>`coalesce(sum(${hostelDeposits.amountPaise}), 0)::bigint` }).from(hostelDeposits).where(eq(hostelDeposits.status, 'held')))[0].n),
        dutyToday: await tx.execute<{ name: string; shift: string; hostel: string }>(sql`select u.full_name as name, d.shift, h.name as hostel from hostel_duties d join users u on u.id = d.user_id join hostels h on h.id = d.hostel_id where d.duty_on = ${today}::date order by d.shift, h.name`).then((r) => r.rows),
        hostels: (await tx.select({ id: hostels.id, name: hostels.name }).from(hostels).orderBy(asc(hostels.sortOrder), asc(hostels.name))).length,
        roomTypes: (await tx.select({ id: hostelRoomTypes.id }).from(hostelRoomTypes)).length,
      };
    });
  }

  /** Plans a duty roster: the people take the shift in turn, one a day, over the days given. */
  @Post('duties/plan')
  @HttpCode(200)
  @Auth('user', HOSTEL_ROLES)
  plan(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(RosterBody)) b: z.infer<typeof RosterBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      if (b.to < b.from) throw new BadRequestException('The end is before the start');
      const [h] = await tx.select({ id: hostels.id }).from(hostels).where(eq(hostels.id, b.hostelId));
      if (!h) throw new NotFoundException('Hostel not found');
      const days: string[] = [];
      for (let d = b.from; d <= b.to && days.length < 120; d = addDays(d, 1)) days.push(d);
      let made = 0;
      for (const [i, day] of days.entries()) {
        const r = await tx.insert(hostelDuties).values({ tenantId: p.tenantId, hostelId: b.hostelId, userId: b.userIds[i % b.userIds.length], dutyOn: day, shift: b.shift }).onConflictDoNothing().returning({ id: hostelDuties.id });
        made += r.length;
      }
      await auditUser(tx, p, 'hostel_duty.planned', 'hostel_duty', undefined, { hostelId: b.hostelId, from: b.from, to: b.to, shift: b.shift, made });
      return { days: days.length, made, skipped: days.length - made };
    });
  }

  /** Whether a student owes the hostel anything: a bed still held, an unrefunded settlement, unpaid hostel or mess fees, an open fine. */
  @Get('no-dues/:studentId')
  @Auth('user')
  noDues(@CurrentPrincipal() p: UserPrincipal, @Param('studentId', ParseUUIDPipe) studentId: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await assertCanSeeStudent(tx, p, studentId, HOSTEL_ROLES);
      const bed = await residentOf(tx, studentId);
      const [fees] = await tx.select({ n: sql<number>`coalesce(sum(${feeInvoices.amountPaise} - ${feeInvoices.paidPaise}), 0)::bigint` }).from(feeInvoices).where(and(eq(feeInvoices.studentId, studentId), sql`(${feeInvoices.title} ilike 'hostel%' or ${feeInvoices.title} ilike 'mess%')`));
      const [fines] = await tx.select({ n: sql<number>`count(*)::int` }).from(hostelIncidents).where(and(eq(hostelIncidents.studentId, studentId), sql`${hostelIncidents.finePaise} > 0 and ${hostelIncidents.fineChargedTitle} is null`));
      const [held] = await tx.select({ n: sql<number>`coalesce(sum(${hostelDeposits.amountPaise}), 0)::bigint` }).from(hostelDeposits).where(and(eq(hostelDeposits.studentId, studentId), eq(hostelDeposits.status, 'held')));
      const unpaid = Number(fees.n);
      return { resident: !!bed, unpaidFeesPaise: unpaid, uncharged: fines.n, depositHeldPaise: Number(held.n), clear: !bed && unpaid <= 0 && fines.n === 0 };
    });
  }

  /** The bed a family's child has and their hostel requests (the family's view). */
  @Get('students/:id/requests')
  @Auth('user')
  studentRequests(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) studentId: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await assertCanSeeStudent(tx, p, studentId, HOSTEL_ROLES);
      const reqs = await tx.select().from(hostelRequests).where(eq(hostelRequests.studentId, studentId)).orderBy(desc(hostelRequests.createdAt)).limit(20);
      const leaves = await tx.select().from(messLeaves).where(eq(messLeaves.studentId, studentId)).orderBy(desc(messLeaves.fromOn)).limit(20);
      const bills = await tx.select().from(messBills).where(eq(messBills.studentId, studentId)).orderBy(desc(messBills.month)).limit(12);
      const holds = await tx.select().from(hostelBedHolds).where(and(eq(hostelBedHolds.studentId, studentId), eq(hostelBedHolds.status, 'active')));
      return { requests: reqs, messLeaves: leaves, messBills: bills, holds, allotments: await tx.select().from(hostelAllotments).where(eq(hostelAllotments.studentId, studentId)).orderBy(desc(hostelAllotments.startsOn)) };
    });
  }
}
