import { BadRequestException, Body, ConflictException, Controller, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { RoleName, UserPrincipal } from '../auth/principal.js';
import { audit } from '../common/audit.js';
import { Day, orConflict, Paise } from '../common/ops.js';
import { assertCanSeeStudent } from '../common/student-access.js';
import { Clock, localParts } from '../common/time.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService, type Tx } from '../db/db.service.js';
import { hostelAllotments, hostelBeds, hostelBlocks, hostelComplaints, hostelGatePasses, hostelRooms, hostelVisitors, messMenu, messPlans, messSubscriptions, students, tenants } from '../db/schema.js';
import { FeesService } from '../fees/fees.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';

export const HOSTEL_ROLES: RoleName[] = ['hostel_warden', 'tenant_admin', 'principal'];
const MEALS = ['breakfast', 'lunch', 'snacks', 'dinner'] as const;

const BlockBody = z.object({ name: z.string().trim().min(1).max(60), gender: z.enum(['boys', 'girls', 'mixed']).default('mixed') });
const RoomBody = z.object({ number: z.string().trim().min(1).max(20), floor: z.number().int().min(0).max(50).default(0), beds: z.number().int().min(1).max(20), monthlyFeePaise: Paise.default(0) });
const AllotBody = z.object({ studentId: z.uuid(), bedId: z.uuid(), startsOn: Day.optional() });
const FeeBody = z.object({ title: z.string().trim().min(1).max(120), dueOn: Day });
const PassBody = z.object({ studentId: z.uuid(), reason: z.string().trim().min(1).max(200), destination: z.string().trim().max(200).default(''), expectedBackAt: z.iso.datetime() });
const VisitorBody = z.object({ studentId: z.uuid(), visitorName: z.string().trim().min(1).max(120), relation: z.string().trim().max(60).default(''), phone: z.string().trim().max(20).default(''), idProof: z.string().trim().max(60).default('') });
const PlanBody = z.object({ name: z.string().trim().min(1).max(60), monthlyFeePaise: Paise, meals: z.array(z.enum(MEALS)).min(1) });
const MenuBody = z.object({ dayOfWeek: z.number().int().min(0).max(6), meal: z.enum(MEALS), items: z.string().trim().min(1).max(300) });
const SubscribeBody = z.object({ studentId: z.uuid(), planId: z.uuid(), startsOn: Day.optional() });
const ComplaintBody = z.object({ studentId: z.uuid().optional(), roomId: z.uuid().optional(), category: z.enum(['maintenance', 'food', 'cleanliness', 'safety', 'other']), description: z.string().trim().min(3).max(1000) });
const ComplaintStatus = z.object({ status: z.enum(['in_progress', 'resolved']), resolution: z.string().trim().max(500).optional() });

/**
 * Hostel: blocks, rooms and beds, allotment and vacating, hostel and mess fees (charged through
 * the fees module), gate passes (families are told when a student goes out and comes back),
 * visitors, the mess plans and menu, and complaints.
 */
@Controller('v1/hostel')
export class HostelController {
  constructor(
    private readonly db: DbService,
    private readonly clock: Clock,
    private readonly fees: FeesService,
    private readonly notifications: NotificationsService,
  ) {}

  // --- Inventory of rooms -----------------------------------------------------------------

  @Get('blocks')
  @Auth('user', HOSTEL_ROLES)
  blocks(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, (tx) =>
      tx
        .select({
          id: hostelBlocks.id,
          name: hostelBlocks.name,
          gender: hostelBlocks.gender,
          rooms: sql<number>`(select count(*)::int from hostel_rooms r where r.block_id = "hostel_blocks"."id")`,
          beds: sql<number>`(select count(*)::int from hostel_beds b join hostel_rooms r on r.id = b.room_id where r.block_id = "hostel_blocks"."id")`,
          occupied: sql<number>`(select count(*)::int from hostel_allotments a join hostel_beds b on b.id = a.bed_id join hostel_rooms r on r.id = b.room_id where r.block_id = "hostel_blocks"."id" and a.vacated_on is null)`,
        })
        .from(hostelBlocks)
        .orderBy(asc(hostelBlocks.name)),
    );
  }

  @Post('blocks')
  @Auth('user', HOSTEL_ROLES)
  addBlock(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(BlockBody)) b: z.infer<typeof BlockBody>) {
    return orConflict('A block with this name already exists', () =>
      this.db.withTenant(p.tenantId, async (tx) => {
        const [r] = await tx.insert(hostelBlocks).values({ tenantId: p.tenantId, ...b }).returning();
        await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'hostel.block_added', subjectType: 'hostel_block', subjectId: r.id });
        return r;
      }),
    );
  }

  @Post('blocks/:id/rooms')
  @Auth('user', HOSTEL_ROLES)
  addRoom(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(RoomBody)) b: z.infer<typeof RoomBody>) {
    return orConflict('This block already has that room number', () =>
      this.db.withTenant(p.tenantId, async (tx) => {
        const [blk] = await tx.select({ id: hostelBlocks.id }).from(hostelBlocks).where(eq(hostelBlocks.id, id));
        if (!blk) throw new NotFoundException('Block not found');
        const { beds, ...room } = b;
        const [r] = await tx.insert(hostelRooms).values({ tenantId: p.tenantId, blockId: id, ...room }).returning();
        await tx.insert(hostelBeds).values(Array.from({ length: beds }, (_, i) => ({ tenantId: p.tenantId, roomId: r.id, label: `B${i + 1}` })));
        await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'hostel.room_added', subjectType: 'hostel_room', subjectId: r.id, data: { beds } });
        return { ...r, beds };
      }),
    );
  }

  /** Every bed with who is in it; `?free=true` for empty beds only. */
  @Get('beds')
  @Auth('user', HOSTEL_ROLES)
  beds(@CurrentPrincipal() p: UserPrincipal, @Query('blockId') blockId?: string, @Query('free') free?: string) {
    return this.db.withTenant(p.tenantId, (tx) =>
      tx
        .select({
          bedId: hostelBeds.id,
          label: hostelBeds.label,
          roomId: hostelRooms.id,
          room: hostelRooms.number,
          floor: hostelRooms.floor,
          block: hostelBlocks.name,
          monthlyFeePaise: hostelRooms.monthlyFeePaise,
          allotmentId: hostelAllotments.id,
          studentId: students.id,
          studentName: students.fullName,
        })
        .from(hostelBeds)
        .innerJoin(hostelRooms, eq(hostelRooms.id, hostelBeds.roomId))
        .innerJoin(hostelBlocks, eq(hostelBlocks.id, hostelRooms.blockId))
        .leftJoin(hostelAllotments, and(eq(hostelAllotments.bedId, hostelBeds.id), isNull(hostelAllotments.vacatedOn)))
        .leftJoin(students, eq(students.id, hostelAllotments.studentId))
        .where(and(blockId ? eq(hostelBlocks.id, blockId) : undefined, free === 'true' ? isNull(hostelAllotments.id) : undefined))
        .orderBy(asc(hostelBlocks.name), asc(hostelRooms.number), asc(hostelBeds.label))
        .limit(1000),
    );
  }

  // --- Allotment and fees -----------------------------------------------------------------

  @Post('allotments')
  @Auth('user', HOSTEL_ROLES)
  allot(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(AllotBody)) b: z.infer<typeof AllotBody>) {
    return orConflict('That bed is taken, or the student already has a bed', () =>
      this.db.withTenant(p.tenantId, async (tx) => {
        const [student] = await tx.select({ id: students.id }).from(students).where(and(eq(students.id, b.studentId), eq(students.status, 'active')));
        if (!student) throw new NotFoundException('Student not found');
        const [bed] = await tx.select({ id: hostelBeds.id }).from(hostelBeds).where(eq(hostelBeds.id, b.bedId));
        if (!bed) throw new NotFoundException('Bed not found');
        const [a] = await tx.insert(hostelAllotments).values({ tenantId: p.tenantId, studentId: b.studentId, bedId: b.bedId, startsOn: b.startsOn ?? (await this.today(tx)), createdBy: p.userId }).returning();
        await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'hostel.allotted', subjectType: 'hostel_allotment', subjectId: a.id, data: b });
        return a;
      }),
    );
  }

  @Post('allotments/:id/vacate')
  @HttpCode(200)
  @Auth('user', HOSTEL_ROLES)
  vacate(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [a] = await tx.select().from(hostelAllotments).where(eq(hostelAllotments.id, id)).for('update');
      if (!a) throw new NotFoundException('Allotment not found');
      if (a.vacatedOn) return a;
      const [open] = await tx.select({ id: hostelGatePasses.id }).from(hostelGatePasses).where(and(eq(hostelGatePasses.studentId, a.studentId), eq(hostelGatePasses.status, 'out')));
      if (open) throw new ConflictException('The student is out on a gate pass');
      const [done] = await tx.update(hostelAllotments).set({ vacatedOn: await this.today(tx) }).where(eq(hostelAllotments.id, id)).returning();
      await tx.update(hostelGatePasses).set({ status: 'cancelled' }).where(and(eq(hostelGatePasses.studentId, a.studentId), eq(hostelGatePasses.status, 'issued')));
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'hostel.vacated', subjectType: 'hostel_allotment', subjectId: id });
      return done;
    });
  }

  /** Charges each resident their room's monthly fee (once per title). */
  @Post('fees')
  @Auth('user', HOSTEL_ROLES)
  charge(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(FeeBody)) b: z.infer<typeof FeeBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const rows = await tx
        .select({ studentId: hostelAllotments.studentId, amountPaise: hostelRooms.monthlyFeePaise })
        .from(hostelAllotments)
        .innerJoin(hostelBeds, eq(hostelBeds.id, hostelAllotments.bedId))
        .innerJoin(hostelRooms, eq(hostelRooms.id, hostelBeds.roomId))
        .where(isNull(hostelAllotments.vacatedOn));
      const res = await this.fees.chargeStudents(tx, p, b.title, b.dueOn, rows);
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'hostel.fees_charged', data: { ...b, ...res } });
      return res;
    });
  }

  // --- Gate passes -------------------------------------------------------------------------

  @Post('gate-passes')
  @Auth('user', HOSTEL_ROLES)
  issuePass(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(PassBody)) b: z.infer<typeof PassBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await this.assertResident(tx, b.studentId);
      if (new Date(b.expectedBackAt) <= this.clock.now()) throw new BadRequestException('The expected return time has passed');
      const [pass] = await tx.insert(hostelGatePasses).values({ tenantId: p.tenantId, ...b, expectedBackAt: new Date(b.expectedBackAt), issuedBy: p.userId }).returning();
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'hostel.pass_issued', subjectType: 'hostel_gate_pass', subjectId: pass.id, data: { studentId: b.studentId } });
      return pass;
    });
  }

  /** The student goes out at the gate: the pass becomes `out` and the family is told. */
  @Post('gate-passes/:id/out')
  @HttpCode(200)
  @Auth('user', HOSTEL_ROLES)
  gateOut(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.gate(p, id, 'issued', 'out');
  }

  @Post('gate-passes/:id/in')
  @HttpCode(200)
  @Auth('user', HOSTEL_ROLES)
  gateIn(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.gate(p, id, 'out', 'in');
  }

  @Post('gate-passes/:id/cancel')
  @HttpCode(200)
  @Auth('user', HOSTEL_ROLES)
  cancelPass(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [pass] = await tx.update(hostelGatePasses).set({ status: 'cancelled' }).where(and(eq(hostelGatePasses.id, id), eq(hostelGatePasses.status, 'issued'))).returning();
      if (!pass) throw new ConflictException('Only a pass that has not been used can be cancelled');
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'hostel.pass_cancelled', subjectType: 'hostel_gate_pass', subjectId: id });
      return pass;
    });
  }

  /** Passes, newest first; `?status=out` for students outside now. Out and overdue are flagged. */
  @Get('gate-passes')
  @Auth('user', HOSTEL_ROLES)
  passes(@CurrentPrincipal() p: UserPrincipal, @Query('status') status?: string) {
    return this.db.withTenant(p.tenantId, (tx) =>
      tx
        .select({ pass: hostelGatePasses, studentName: students.fullName, overdue: sql<boolean>`${hostelGatePasses.status} = 'out' and ${hostelGatePasses.expectedBackAt} < ${this.clock.now().toISOString()}::timestamptz` })
        .from(hostelGatePasses)
        .innerJoin(students, eq(students.id, hostelGatePasses.studentId))
        .where(status ? eq(hostelGatePasses.status, status) : undefined)
        .orderBy(desc(hostelGatePasses.createdAt))
        .limit(200),
    );
  }

  // --- Visitors ----------------------------------------------------------------------------

  @Post('visitors')
  @Auth('user', HOSTEL_ROLES)
  visitorIn(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(VisitorBody)) b: z.infer<typeof VisitorBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await this.assertResident(tx, b.studentId);
      const [v] = await tx.insert(hostelVisitors).values({ tenantId: p.tenantId, ...b, inAt: this.clock.now(), loggedBy: p.userId }).returning();
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'hostel.visitor_in', subjectType: 'hostel_visitor', subjectId: v.id });
      return v;
    });
  }

  @Post('visitors/:id/out')
  @HttpCode(200)
  @Auth('user', HOSTEL_ROLES)
  visitorOut(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [v] = await tx.update(hostelVisitors).set({ outAt: this.clock.now() }).where(and(eq(hostelVisitors.id, id), isNull(hostelVisitors.outAt))).returning();
      if (!v) throw new ConflictException('Visitor not found or already signed out');
      return v;
    });
  }

  /** The visitor book, newest first; `?inside=true` for visitors still in. */
  @Get('visitors')
  @Auth('user', HOSTEL_ROLES)
  visitors(@CurrentPrincipal() p: UserPrincipal, @Query('inside') inside?: string) {
    return this.db.withTenant(p.tenantId, (tx) =>
      tx
        .select({ visitor: hostelVisitors, studentName: students.fullName })
        .from(hostelVisitors)
        .innerJoin(students, eq(students.id, hostelVisitors.studentId))
        .where(inside === 'true' ? isNull(hostelVisitors.outAt) : undefined)
        .orderBy(desc(hostelVisitors.inAt))
        .limit(200),
    );
  }

  // --- Mess --------------------------------------------------------------------------------

  @Get('mess/plans')
  @Auth('user', HOSTEL_ROLES)
  plans(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, (tx) =>
      tx
        .select({ id: messPlans.id, name: messPlans.name, monthlyFeePaise: messPlans.monthlyFeePaise, meals: messPlans.meals, active: messPlans.active, subscribers: sql<number>`(select count(*)::int from mess_subscriptions s where s.plan_id = "mess_plans"."id" and s.ended_on is null)` })
        .from(messPlans)
        .orderBy(asc(messPlans.name)),
    );
  }

  @Post('mess/plans')
  @Auth('user', HOSTEL_ROLES)
  addPlan(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(PlanBody)) b: z.infer<typeof PlanBody>) {
    return orConflict('A plan with this name already exists', () =>
      this.db.withTenant(p.tenantId, async (tx) => {
        const [r] = await tx.insert(messPlans).values({ tenantId: p.tenantId, ...b }).returning();
        await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'hostel.mess_plan_added', subjectType: 'mess_plan', subjectId: r.id });
        return r;
      }),
    );
  }

  /** Puts a student on a plan (replacing their earlier one). */
  @Post('mess/subscriptions')
  @Auth('user', HOSTEL_ROLES)
  subscribe(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(SubscribeBody)) b: z.infer<typeof SubscribeBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [plan] = await tx.select({ id: messPlans.id }).from(messPlans).where(and(eq(messPlans.id, b.planId), eq(messPlans.active, true)));
      if (!plan) throw new NotFoundException('Plan not found');
      await this.assertResident(tx, b.studentId);
      const today = await this.today(tx);
      await tx.update(messSubscriptions).set({ endedOn: today }).where(and(eq(messSubscriptions.studentId, b.studentId), isNull(messSubscriptions.endedOn)));
      const [s] = await tx.insert(messSubscriptions).values({ tenantId: p.tenantId, studentId: b.studentId, planId: b.planId, startsOn: b.startsOn ?? today }).returning();
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'hostel.mess_subscribed', subjectType: 'mess_subscription', subjectId: s.id, data: b });
      return s;
    });
  }

  @Post('mess/fees')
  @Auth('user', HOSTEL_ROLES)
  chargeMess(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(FeeBody)) b: z.infer<typeof FeeBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const rows = await tx
        .select({ studentId: messSubscriptions.studentId, amountPaise: messPlans.monthlyFeePaise })
        .from(messSubscriptions)
        .innerJoin(messPlans, eq(messPlans.id, messSubscriptions.planId))
        .where(isNull(messSubscriptions.endedOn));
      const res = await this.fees.chargeStudents(tx, p, b.title, b.dueOn, rows);
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'hostel.mess_fees_charged', data: { ...b, ...res } });
      return res;
    });
  }

  /** The weekly menu: readable by every signed-in user. */
  @Get('mess/menu')
  @Auth('user')
  menu(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, (tx) => tx.select({ dayOfWeek: messMenu.dayOfWeek, meal: messMenu.meal, items: messMenu.items }).from(messMenu).orderBy(asc(messMenu.dayOfWeek)));
  }

  @Put('mess/menu')
  @Auth('user', HOSTEL_ROLES)
  setMenu(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(MenuBody)) b: z.infer<typeof MenuBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [m] = await tx.insert(messMenu).values({ tenantId: p.tenantId, ...b }).onConflictDoUpdate({ target: [messMenu.tenantId, messMenu.dayOfWeek, messMenu.meal], set: { items: b.items } }).returning();
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'hostel.menu_set', subjectType: 'mess_menu', subjectId: m.id, data: b });
      return m;
    });
  }

  // --- Complaints --------------------------------------------------------------------------

  /** A resident, their family or the warden raises a complaint. */
  @Post('complaints')
  @Auth('user')
  complain(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(ComplaintBody)) b: z.infer<typeof ComplaintBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      if (b.studentId) await assertCanSeeStudent(tx, p, b.studentId, HOSTEL_ROLES);
      else if (!this.isWarden(p)) throw new BadRequestException('Say which student this is about');
      const [c] = await tx.insert(hostelComplaints).values({ tenantId: p.tenantId, ...b, raisedBy: p.userId }).returning();
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'hostel.complaint_raised', subjectType: 'hostel_complaint', subjectId: c.id });
      return c;
    });
  }

  /** The warden sees all complaints; anyone else sees their own. */
  @Get('complaints')
  @Auth('user')
  complaints(@CurrentPrincipal() p: UserPrincipal, @Query('status') status?: string) {
    return this.db.withTenant(p.tenantId, (tx) =>
      tx
        .select()
        .from(hostelComplaints)
        .where(and(this.isWarden(p) ? undefined : eq(hostelComplaints.raisedBy, p.userId), status ? eq(hostelComplaints.status, status) : undefined))
        .orderBy(desc(hostelComplaints.createdAt))
        .limit(200),
    );
  }

  @Post('complaints/:id/status')
  @HttpCode(200)
  @Auth('user', HOSTEL_ROLES)
  complaintStatus(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(ComplaintStatus)) b: z.infer<typeof ComplaintStatus>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      if (b.status === 'resolved' && !b.resolution) throw new BadRequestException('Say how it was resolved');
      const [c] = await tx
        .update(hostelComplaints)
        .set({ status: b.status, resolution: b.resolution ?? null, resolvedAt: b.status === 'resolved' ? this.clock.now() : null })
        .where(and(eq(hostelComplaints.id, id), inArray(hostelComplaints.status, ['open', 'in_progress'])))
        .returning();
      if (!c) throw new ConflictException('Complaint not found or already resolved');
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: `hostel.complaint_${b.status}`, subjectType: 'hostel_complaint', subjectId: id });
      return c;
    });
  }

  // --- The family's view -------------------------------------------------------------------

  @Get('students/:id')
  @Auth('user')
  student(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) studentId: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await assertCanSeeStudent(tx, p, studentId, HOSTEL_ROLES);
      const [bed] = await tx
        .select({ block: hostelBlocks.name, room: hostelRooms.number, bed: hostelBeds.label, since: hostelAllotments.startsOn })
        .from(hostelAllotments)
        .innerJoin(hostelBeds, eq(hostelBeds.id, hostelAllotments.bedId))
        .innerJoin(hostelRooms, eq(hostelRooms.id, hostelBeds.roomId))
        .innerJoin(hostelBlocks, eq(hostelBlocks.id, hostelRooms.blockId))
        .where(and(eq(hostelAllotments.studentId, studentId), isNull(hostelAllotments.vacatedOn)));
      const passes = await tx.select().from(hostelGatePasses).where(eq(hostelGatePasses.studentId, studentId)).orderBy(desc(hostelGatePasses.createdAt)).limit(20);
      return { resident: !!bed, bed: bed ?? null, passes };
    });
  }

  // --- helpers -----------------------------------------------------------------------------

  private isWarden(p: UserPrincipal) {
    return p.roles.some((r) => HOSTEL_ROLES.includes(r));
  }

  private async gate(p: UserPrincipal, id: string, from: string, to: 'out' | 'in') {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [pass] = await tx.select().from(hostelGatePasses).where(eq(hostelGatePasses.id, id)).for('update');
      if (!pass) throw new NotFoundException('Pass not found');
      if (pass.status !== from) throw new ConflictException(`This pass is ${pass.status}`);
      const now = this.clock.now();
      const [done] = await tx
        .update(hostelGatePasses)
        .set(to === 'out' ? { status: 'out', outAt: now } : { status: 'returned', inAt: now })
        .where(eq(hostelGatePasses.id, id))
        .returning();
      const [st] = await tx.select({ fullName: students.fullName }).from(students).where(eq(students.id, pass.studentId));
      await this.notifications.hostelGate(tx, { passId: id, studentId: pass.studentId, studentName: st?.fullName ?? 'Your child', event: to });
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: `hostel.gate_${to}`, subjectType: 'hostel_gate_pass', subjectId: id });
      return done;
    });
  }

  private async assertResident(tx: Tx, studentId: string) {
    const [a] = await tx.select({ id: hostelAllotments.id }).from(hostelAllotments).where(and(eq(hostelAllotments.studentId, studentId), isNull(hostelAllotments.vacatedOn)));
    if (!a) throw new BadRequestException('This student has no hostel bed');
  }

  private async today(tx: Tx): Promise<string> {
    const [t] = await tx.select({ tz: tenants.timezone }).from(tenants);
    return localParts(this.clock.now(), t?.tz ?? 'Asia/Kolkata').date;
  }
}
