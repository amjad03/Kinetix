import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { Auth, CurrentPrincipal, STAFF_ADMIN_ROLES } from '../auth/auth.decorators.js';
import type { DevicePrincipal, UserPrincipal } from '../auth/principal.js';
import { RateLimiter } from '../common/rate-limiter.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService } from '../db/db.service.js';
import { DEFAULT_OFFLINE_HOURS, FleetService } from './fleet.service.js';

const HealthBody = z.object({
  os: z.string().max(40),
  osVersion: z.string().max(60).optional(),
  appVersion: z.string().max(40).optional(),
  kiosk: z.enum(['on', 'off', 'unknown']),
  storageFreeMb: z.number().int().min(0).max(100_000_000).optional(),
  storageTotalMb: z.number().int().min(0).max(100_000_000).optional(),
  battery: z.object({ percent: z.number().int().min(0).max(100), charging: z.boolean() }).optional(),
  currentClass: z.string().max(120).optional(),
  locked: z.boolean().optional(),
});

const ActionBody = z.discriminatedUnion('type', [
  z.object({ type: z.enum(['lock', 'unlock', 'restart_app', 'clear_pin_profiles', 'unpair']) }),
  z.object({ type: z.literal('message'), text: z.string().trim().min(1).max(280), seconds: z.number().int().min(5).max(600).default(30) }),
  z.object({ type: z.literal('kiosk_policy'), enabled: z.boolean().nullable() }),
  z
    .object({ type: z.literal('rename_move'), name: z.string().trim().min(1).max(80).optional(), roomId: z.uuid().nullable().optional() })
    .refine((b) => b.name !== undefined || b.roomId !== undefined, 'Nothing to change'),
]);

/** The IT console: boards report their health, admins see the fleet and send remote actions (audited). */
@Controller('v1/devices')
export class FleetController {
  constructor(
    private readonly db: DbService,
    private readonly fleet: FleetService,
    private readonly limiter: RateLimiter,
  ) {}

  /** The board's periodic health report (every few minutes), on its existing device or board token. */
  @Post('me/health')
  @HttpCode(204)
  @Auth(['device', 'board'])
  async health(@CurrentPrincipal() p: DevicePrincipal, @Body(new ZodBody(HealthBody)) body: z.infer<typeof HealthBody>): Promise<void> {
    await this.limiter.hit(`health:${p.deviceId}`, 30, 60_000);
    await this.fleet.report(p.tenantId, p.deviceId, body);
  }

  /** The fleet: health of every board, and those offline longer than `hours` (default 4) flagged as alerts. */
  @Get('fleet')
  @Auth('user', STAFF_ADMIN_ROLES)
  list(@CurrentPrincipal() p: UserPrincipal, @Query('hours') hours?: string) {
    const n = Math.min(Math.max(Number(hours) || DEFAULT_OFFLINE_HOURS, 1), 720);
    return this.db.withTenant(p.tenantId, (tx) => this.fleet.fleet(tx, n));
  }

  /** Remote actions sent to boards, newest first (the audit trail of the console). */
  @Get('fleet/actions')
  @Auth('user', STAFF_ADMIN_ROLES)
  allActions(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, (tx) => this.fleet.history(tx, null));
  }

  @Get(':id/actions')
  @Auth('user', STAFF_ADMIN_ROLES)
  actions(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, (tx) => this.fleet.history(tx, id));
  }

  @Post(':id/actions')
  @HttpCode(202)
  @Auth('user', STAFF_ADMIN_ROLES)
  act(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(ActionBody)) body: z.infer<typeof ActionBody>) {
    const { type, ...params } = body;
    return this.db.withTenant(p.tenantId, (tx) => this.fleet.dispatch(tx, p, id, { type, params }));
  }
}
