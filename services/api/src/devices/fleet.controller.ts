import { BadRequestException, Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { Auth, CurrentPrincipal, STAFF_ADMIN_ROLES } from '../auth/auth.decorators.js';
import type { DevicePrincipal, UserPrincipal } from '../auth/principal.js';
import { RateLimiter } from '../common/rate-limiter.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService } from '../db/db.service.js';
import { DEFAULT_OFFLINE_HOURS, FleetService } from './fleet.service.js';
import { PanelService } from './panel.service.js';

const Pct = z.number().min(0).max(100).optional();
const Temp = z.number().min(-40).max(150).optional();
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
  deviceKind: z.enum(['board', 'ifp', 'edge']).optional(),
  cpuPct: Pct,
  gpuPct: Pct,
  npuPct: Pct,
  ramPct: Pct,
  ramTotalMb: z.number().int().min(0).max(100_000_000).optional(),
  diskPct: Pct,
  cpuTempC: Temp,
  gpuTempC: Temp,
  aiInferences: z.number().int().min(0).max(10_000_000).optional(),
  aiInferenceMs: z.number().int().min(0).max(2_000_000_000).optional(),
  uptimeS: z.number().int().min(0).max(10 * 365 * 86400).optional(),
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
    private readonly panel: PanelService,
  ) {}

  /**
   * The board's periodic health report (every few minutes), on its existing device or board token.
   * The answer tells it about an app update rolled out to it and its panel home's apps (W4).
   */
  @Post('me/health')
  @HttpCode(200)
  @Auth(['device', 'board'])
  async health(@CurrentPrincipal() p: DevicePrincipal, @Body(new ZodBody(HealthBody)) body: z.infer<typeof HealthBody>) {
    await this.limiter.hit(`health:${p.deviceId}`, 30, 60_000);
    await this.fleet.report(p.tenantId, p.deviceId, body);
    return this.panel.panelConfig(p.tenantId, p.deviceId, body.appVersion);
  }

  /** The fleet: health of every board, and those offline longer than `hours` (default 4) flagged as alerts. */
  @Get('fleet')
  @Auth('user', STAFF_ADMIN_ROLES)
  list(@CurrentPrincipal() p: UserPrincipal, @Query('hours') hours?: string) {
    const n = Math.min(Math.max(Number(hours) || DEFAULT_OFFLINE_HOURS, 1), 720);
    return this.db.withTenant(p.tenantId, (tx) => this.fleet.fleet(tx, n));
  }

  /**
   * Boards and edge boxes with their compute now: online, app version, CPU/GPU/NPU/RAM and disk
   * load, temperatures, and on-device AI in the last 24 hours.
   */
  @Get('compute')
  @Auth('user', STAFF_ADMIN_ROLES)
  compute(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, (tx) => this.fleet.computeStatus(tx));
  }

  /**
   * Compute use over time (default the last 7 days) per device and day or hour (`bucket`):
   * average and peak CPU/GPU/NPU/RAM, peak temperatures and on-device AI inferences and time.
   * `deviceId` narrows it to one device.
   */
  @Get('compute/usage')
  @Auth('user', STAFF_ADMIN_ROLES)
  computeUsage(@CurrentPrincipal() p: UserPrincipal, @Query('from') from?: string, @Query('to') to?: string, @Query('bucket') bucket = 'day', @Query('deviceId') deviceId?: string) {
    if (bucket !== 'day' && bucket !== 'hour') throw new BadRequestException('bucket must be day or hour');
    if (deviceId && !z.uuid().safeParse(deviceId).success) throw new BadRequestException('Bad deviceId');
    const day = /^\d{4}-\d{2}-\d{2}$/;
    const end = to ? new Date(day.test(to) ? `${to}T00:00:00Z` : to) : new Date();
    if (to && day.test(to)) end.setUTCDate(end.getUTCDate() + 1);
    const start = from ? new Date(day.test(from) ? `${from}T00:00:00Z` : from) : new Date(end.getTime() - 7 * 86400_000);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) throw new BadRequestException('from and to must be dates like 2026-10-21');
    return this.db.withTenant(p.tenantId, (tx) => this.fleet.computeUsage(tx, { from: start, to: end, bucket, deviceId }));
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
