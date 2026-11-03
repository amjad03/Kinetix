import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { UserPrincipal } from '../auth/principal.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService } from '../db/db.service.js';
import { PAYROLL_APPROVERS, PAYROLL_ROLES } from './hr.access.js';
import { PayMatrixService } from './pay-matrix.service.js';

const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-07-01');
const Paise = z.number().int().min(1_000_00).max(10_00_000_00);
const LevelBody = z.object({
  scheme: z.enum(['ugc_7cpc', 'aicte_7cpc', 'state', 'custom']).default('custom'),
  level: z.string().trim().min(1).max(10),
  name: z.string().trim().min(2).max(120),
  cadre: z.string().trim().max(40).nullish(),
  entryPaise: Paise.optional(),
  count: z.number().int().min(1).max(60).optional(),
  cells: z.array(Paise).max(60).optional(),
});
const PlaceBody = z.object({
  levelId: z.uuid(),
  cell: z.number().int().min(1).max(60).optional(),
  effectiveFrom: Day,
  kind: z.enum(['placement', 'promotion']).default('placement'),
  hraClass: z.enum(['X', 'Y', 'Z']).optional(),
  orderNo: z.string().trim().max(60).default(''),
  note: z.string().trim().max(300).default(''),
});
const IncrementBody = z.object({ on: Day, apply: z.boolean().default(false), userIds: z.array(z.uuid()).max(2000).optional() });

/** The 7th CPC pay matrix (UGC/AICTE academic levels), staff placement, annual increments and pay fixation on promotion. */
@Controller('v1/payroll/pay-matrix')
export class PayMatrixController {
  constructor(
    private readonly db: DbService,
    private readonly svc: PayMatrixService,
  ) {}

  @Get()
  @Auth('user', PAYROLL_ROLES)
  levels(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => (await this.svc.levels(tx, p.tenantId)).map((l) => ({ id: l.id, scheme: l.scheme, level: l.level, name: l.name, cadre: l.cadre, cells: l.cells })));
  }

  @Post('levels')
  @Auth('user', PAYROLL_APPROVERS)
  addLevel(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(LevelBody)) b: z.infer<typeof LevelBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await this.svc.levels(tx, p.tenantId);
      return this.svc.addLevel(tx, p, { ...b, cadre: b.cadre ?? null });
    });
  }

  @Get('staff')
  @Auth('user', PAYROLL_ROLES)
  staff(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, (tx) => this.svc.staff(tx));
  }

  @Get('staff/:userId/moves')
  @Auth('user', PAYROLL_ROLES)
  moves(@CurrentPrincipal() p: UserPrincipal, @Param('userId', ParseUUIDPipe) userId: string) {
    return this.db.withTenant(p.tenantId, (tx) => this.svc.moves(tx, userId));
  }

  /** Places a staff member on the matrix, or fixes their pay on promotion; writes the salary structure from that date. */
  @Put('staff/:userId')
  @Auth('user', PAYROLL_APPROVERS)
  place(@CurrentPrincipal() p: UserPrincipal, @Param('userId', ParseUUIDPipe) userId: string, @Body(new ZodBody(PlaceBody)) b: z.infer<typeof PlaceBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await this.svc.levels(tx, p.tenantId);
      return this.svc.place(tx, p, userId, b);
    });
  }

  /** Lists (apply: false) or gives (apply: true) the annual increment due on a date. Safe to run again. */
  @Post('increments')
  @HttpCode(200)
  @Auth('user', PAYROLL_APPROVERS)
  increments(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(IncrementBody)) b: z.infer<typeof IncrementBody>) {
    return this.db.withTenant(p.tenantId, (tx) => this.svc.increments(tx, p, b.on, b.apply, b.userIds));
  }
}
