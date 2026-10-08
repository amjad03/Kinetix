import { BadRequestException, Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { Auth, CurrentPrincipal, TEACHING_ROLES } from '../auth/auth.decorators.js';
import type { RoleName, UserPrincipal } from '../auth/principal.js';
import { ZodBody } from '../common/zod-body.js';
import { Day } from '../common/zod-fields.js';
import { DbService } from '../db/db.service.js';
import { SubstitutionsService } from './substitutions.service.js';

/** Who arranges substitute teachers. */
export const SUBSTITUTION_ROLES: RoleName[] = ['tenant_admin', 'principal', 'hod'];

const AssignBody = z.object({ slotId: z.uuid(), date: Day, substituteTeacherId: z.uuid(), reason: z.string().trim().max(300).default('') });

const dayOrBad = (v: string | undefined, field: string): string | undefined => {
  if (v === undefined || v === '') return undefined;
  if (!Day.safeParse(v).success) throw new BadRequestException(`${field} must be a date like 2026-10-05`);
  return v;
};

/** Substitute teachers: suggestions, assignment and the substitute's own list. */
@Controller('v1/timetable')
export class SubstitutionsController {
  constructor(
    private readonly db: DbService,
    private readonly svc: SubstitutionsService,
  ) {}

  /** Free teachers of the same subject, then department, for a period on a date. */
  @Get('substitutes')
  @Auth('user', SUBSTITUTION_ROLES)
  suggest(@CurrentPrincipal() p: UserPrincipal, @Query('slotId', ParseUUIDPipe) slotId: string, @Query('date') date: string) {
    const day = dayOrBad(date, 'date');
    if (!day) throw new BadRequestException('date is required');
    return this.db.withTenant(p.tenantId, (tx) => this.svc.suggest(tx, slotId, day));
  }

  /** Periods of teachers on approved leave that day which have no substitute yet. */
  @Get('substitutions/needed')
  @Auth('user', SUBSTITUTION_ROLES)
  needed(@CurrentPrincipal() p: UserPrincipal, @Query('date') date: string) {
    const day = dayOrBad(date, 'date');
    if (!day) throw new BadRequestException('date is required');
    return this.db.withTenant(p.tenantId, (tx) => this.svc.needed(tx, day));
  }

  @Get('substitutions')
  @Auth('user', SUBSTITUTION_ROLES)
  list(@CurrentPrincipal() p: UserPrincipal, @Query('from') from?: string, @Query('to') to?: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const today = await this.svc.today(tx);
      const f = dayOrBad(from, 'from') ?? today;
      return this.svc.list(tx, f, dayOrBad(to, 'to') ?? f);
    });
  }

  @Post('substitutions')
  @Auth('user', SUBSTITUTION_ROLES)
  assign(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(AssignBody)) body: z.infer<typeof AssignBody>) {
    return this.db.withTenant(p.tenantId, (tx) => this.svc.assign(tx, p, body));
  }

  @Post('substitutions/:id/cancel')
  @HttpCode(200)
  @Auth('user', SUBSTITUTION_ROLES)
  cancel(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, (tx) => this.svc.cancel(tx, p, id));
  }

  /** The Teacher App: periods this teacher covers for colleagues (today and the next 14 days unless a range is given). */
  @Get('me/substitutions')
  @Auth('user', TEACHING_ROLES)
  mine(@CurrentPrincipal() p: UserPrincipal, @Query('from') from?: string, @Query('to') to?: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const today = await this.svc.today(tx);
      const f = dayOrBad(from, 'from') ?? today;
      const end = new Date(new Date(`${f}T00:00:00Z`).getTime() + 14 * 86400_000).toISOString().slice(0, 10);
      return this.svc.mine(tx, p.userId, f, dayOrBad(to, 'to') ?? end);
    });
  }
}
