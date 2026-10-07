import { Body, ConflictException, Controller, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { UserPrincipal } from '../auth/principal.js';
import { audit } from '../common/audit.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService } from '../db/db.service.js';
import { leaveTypes } from '../db/schema.js';
import { HR_ROLES, PAYROLL_ROLES, STAFF_ROLES, hasAnyRole } from './hr.access.js';
import { HrService } from './hr.service.js';
import { LeaveService } from './leave.service.js';

const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-10-15');
const Days = z.number().min(0).max(366).multipleOf(0.5);
const TypeBody = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_]{1,10}$/, 'Use up to 10 letters or digits'),
  name: z.string().trim().min(1).max(60),
  paid: z.boolean(),
  annualDays: Days,
  accrual: z.enum(['yearly', 'monthly']),
  carryForwardMax: Days,
  active: z.boolean().default(true),
});
const ApplyBody = z.object({ leaveTypeId: z.uuid(), fromDate: Day, toDate: Day, halfDay: z.boolean().default(false), reason: z.string().trim().max(500).default('') });
const DecideBody = z.object({ note: z.string().trim().max(500).optional() });
const CarryBody = z.object({ fromYear: z.number().int().min(2000).max(2100) });

/** Leave types, balances and the apply → approve workflow. */
@Controller('v1/hr')
export class LeaveController {
  constructor(
    private readonly db: DbService,
    private readonly hr: HrService,
    private readonly leave: LeaveService,
  ) {}

  @Get('leave-types')
  @Auth('user', STAFF_ROLES)
  types(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => (await this.leave.types(tx, p.tenantId)).map(this.leave.typeView));
  }

  @Post('leave-types')
  @Auth('user', HR_ROLES)
  createType(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(TypeBody)) b: z.infer<typeof TypeBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const existing = await this.leave.types(tx, p.tenantId);
      if (existing.some((t) => t.code === b.code)) throw new ConflictException('That leave code is already in use');
      const [row] = await tx.insert(leaveTypes).values({ tenantId: p.tenantId, ...b }).returning();
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'leave.type_created', subjectType: 'leave_type', subjectId: row.id, data: b });
      return this.leave.typeView(row);
    });
  }

  @Put('leave-types/:id')
  @Auth('user', HR_ROLES)
  updateType(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(TypeBody)) b: z.infer<typeof TypeBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [row] = await tx.update(leaveTypes).set(b).where(eq(leaveTypes.id, id)).returning();
      if (!row) throw new NotFoundException('Leave type not found');
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'leave.type_updated', subjectType: 'leave_type', subjectId: id, data: b });
      return this.leave.typeView(row);
    });
  }

  @Get('leave/balances/me')
  @Auth('user', STAFF_ROLES)
  myBalances(@CurrentPrincipal() p: UserPrincipal, @Query('year') year?: string) {
    return this.db.withTenant(p.tenantId, async (tx) => this.leave.balances(tx, p.tenantId, p.userId, await this.year(tx, year)));
  }

  /** Someone else's balances: HR roles, or the head of their department. */
  @Get('leave/balances')
  @Auth('user', [...PAYROLL_ROLES, 'hod'])
  balances(@CurrentPrincipal() p: UserPrincipal, @Query('userId', ParseUUIDPipe) userId: string, @Query('year') year?: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      if (!hasAnyRole(p, PAYROLL_ROLES) && !(await this.leave.headedStaff(tx, p.userId)).includes(userId)) throw new NotFoundException('Staff member not found');
      return this.leave.balances(tx, p.tenantId, userId, await this.year(tx, year));
    });
  }

  private async year(tx: Parameters<HrService['today']>[0], v?: string) {
    const y = v ? Number(v) : Number((await this.hr.today(tx)).slice(0, 4));
    if (!Number.isInteger(y) || y < 2000 || y > 2100) throw new NotFoundException('Bad year');
    return y;
  }

  @Post('leave/carry-forward')
  @HttpCode(200)
  @Auth('user', HR_ROLES)
  carry(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(CarryBody)) b: z.infer<typeof CarryBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const updated = await this.leave.carryForward(tx, p.tenantId, b.fromYear);
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'leave.carry_forward', subjectType: 'leave_balance', data: { fromYear: b.fromYear, updated } });
      return { updated };
    });
  }

  @Get('leave/requests/me')
  @Auth('user', STAFF_ROLES)
  myRequests(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, (tx) => this.leave.list(tx, p, { mine: true }));
  }

  /** HR: every request. A head of department: their staff's. */
  @Get('leave/requests')
  @Auth('user', [...HR_ROLES, 'hod'])
  requests(@CurrentPrincipal() p: UserPrincipal, @Query('status') status?: string, @Query('userId') userId?: string) {
    const st = z.enum(['pending', 'approved', 'rejected', 'cancelled']).optional().parse(status || undefined);
    const uid = userId ? z.uuid().parse(userId) : undefined;
    return this.db.withTenant(p.tenantId, (tx) => this.leave.list(tx, p, { status: st, userId: uid }));
  }

  @Post('leave/requests')
  @Auth('user', STAFF_ROLES)
  apply(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(ApplyBody)) b: z.infer<typeof ApplyBody>) {
    return this.db.withTenant(p.tenantId, (tx) => this.leave.apply(tx, p, b));
  }

  @Post('leave/requests/:id/approve')
  @HttpCode(200)
  @Auth('user', [...HR_ROLES, 'hod'])
  approve(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(DecideBody)) b: z.infer<typeof DecideBody>) {
    return this.db.withTenant(p.tenantId, (tx) => this.leave.decide(tx, p, id, 'approved', b.note ?? null));
  }

  @Post('leave/requests/:id/reject')
  @HttpCode(200)
  @Auth('user', [...HR_ROLES, 'hod'])
  reject(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(DecideBody)) b: z.infer<typeof DecideBody>) {
    return this.db.withTenant(p.tenantId, (tx) => this.leave.decide(tx, p, id, 'rejected', b.note ?? null));
  }

  @Post('leave/requests/:id/cancel')
  @HttpCode(200)
  @Auth('user', STAFF_ROLES)
  cancel(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, (tx) => this.leave.cancel(tx, p, id));
  }
}

