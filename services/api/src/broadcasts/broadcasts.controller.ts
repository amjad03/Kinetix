import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { RealtimeEvents } from '@kinetix/shared';
import { z } from 'zod';
import { Auth, BROADCAST_ROLES, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { BoardPrincipal, DevicePrincipal, UserPrincipal } from '../auth/principal.js';
import { DbService } from '../db/db.service.js';
import { RealtimeGateway } from '../realtime/realtime.gateway.js';
import { ZodBody } from '../common/zod-body.js';
import { BroadcastsService } from './broadcasts.service.js';

const CreateBody = z.object({
  title: z.string().min(1).max(120),
  body: z.string().min(1).max(2000),
  priority: z.enum(['info', 'important', 'emergency']).default('info'),
  requiresAck: z.boolean().default(false),
  ttlMinutes: z.number().int().min(1).max(7 * 24 * 60).default(60),
  audience: z
    .object({
      all: z.boolean().optional(),
      campusIds: z.array(z.uuid()).optional(),
      programIds: z.array(z.uuid()).optional(),
      sectionIds: z.array(z.uuid()).optional(),
      deviceIds: z.array(z.uuid()).optional(),
    })
    .refine((a) => a.all || a.campusIds?.length || a.programIds?.length || a.sectionIds?.length || a.deviceIds?.length, 'Choose who receives the message'),
});

@Controller('v1/broadcasts')
export class BroadcastsController {
  constructor(
    private readonly db: DbService,
    private readonly broadcasts: BroadcastsService,
    private readonly realtime: RealtimeGateway,
  ) {}

  /** Principal's dashboard: "Circulate". */
  @Post()
  @Auth('user', BROADCAST_ROLES)
  async create(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(CreateBody)) body: z.infer<typeof CreateBody>) {
    const { message, deviceIds } = await this.db.withTenant(p.tenantId, (tx) => this.broadcasts.create(tx, p, body));
    this.broadcasts.deliver(message, deviceIds);
    return { ...message, targetedBoards: deviceIds.length };
  }

  /** Recently sent messages with delivery counts, newest first. */
  @Get()
  @Auth('user', BROADCAST_ROLES)
  recent(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, (tx) => this.broadcasts.recent(tx));
  }

  @Get(':id/delivery')
  @Auth('user', BROADCAST_ROLES)
  delivery(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, (tx) => this.broadcasts.deliveryReport(tx, id));
  }

  /** Ends a broadcast early, e.g. "all clear" after an emergency. */
  @Post(':id/clear')
  @HttpCode(200)
  @Auth('user', BROADCAST_ROLES)
  async clear(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    const deviceIds = await this.db.withTenant(p.tenantId, (tx) => this.broadcasts.clear(tx, p, id));
    this.realtime.toDevices(deviceIds, RealtimeEvents.BroadcastCleared, { id });
    return { cleared: true };
  }

  /** Board: messages it still has to show (after coming online, or on startup). */
  @Get('pending')
  @Auth(['device', 'board'])
  pending(@CurrentPrincipal() p: DevicePrincipal | BoardPrincipal) {
    return this.db.withTenant(p.tenantId, (tx) => this.broadcasts.pendingForDevice(tx, p.deviceId));
  }

  @Post(':id/displayed')
  @HttpCode(204)
  @Auth(['device', 'board'])
  async displayed(@CurrentPrincipal() p: DevicePrincipal | BoardPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    await this.db.withTenant(p.tenantId, (tx) => this.broadcasts.markReceipt(tx, id, p.deviceId, 'displayed'));
  }

  @Post(':id/ack')
  @HttpCode(204)
  @Auth(['device', 'board'])
  async ack(@CurrentPrincipal() p: DevicePrincipal | BoardPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    const userId = p.kind === 'board' ? p.teacherId : undefined;
    await this.db.withTenant(p.tenantId, (tx) => this.broadcasts.markReceipt(tx, id, p.deviceId, 'acknowledged', userId));
  }
}
