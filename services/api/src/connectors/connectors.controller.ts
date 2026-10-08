import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { RoleName, UserPrincipal } from '../auth/principal.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService } from '../db/db.service.js';
import { CONNECTOR_TYPES } from './connector-types.js';
import { ConnectorsService } from './connectors.service.js';

const ADMIN: RoleName[] = ['tenant_admin'];
const VIEW: RoleName[] = ['tenant_admin', 'principal'];

const CreateBody = z.object({ type: z.string().min(1).max(40), name: z.string().trim().min(1).max(100), config: z.record(z.string(), z.unknown()).default({}), enabled: z.boolean().default(false) });
const UpdateBody = z.object({ name: z.string().trim().min(1).max(100).optional(), config: z.record(z.string(), z.unknown()).optional() }).refine((b) => b.name !== undefined || b.config !== undefined, 'Nothing to change');

/** Connector registry: what can be connected, each institution's connectors (settings stored encrypted), test-connection and the webhook delivery log. */
@Controller('v1/connectors')
export class ConnectorsController {
  constructor(
    private readonly db: DbService,
    private readonly svc: ConnectorsService,
  ) {}

  /** The connector types with the settings form of each. */
  @Get('types')
  @Auth('user', VIEW)
  types() {
    return CONNECTOR_TYPES;
  }

  @Get()
  @Auth('user', VIEW)
  list(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, (tx) => this.svc.list(tx));
  }

  @Post()
  @Auth('user', ADMIN)
  create(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(CreateBody)) b: z.infer<typeof CreateBody>) {
    return this.db.withTenant(p.tenantId, (tx) => this.svc.create(tx, p, b));
  }

  @Patch(':id')
  @Auth('user', ADMIN)
  update(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(UpdateBody)) b: z.infer<typeof UpdateBody>) {
    return this.db.withTenant(p.tenantId, (tx) => this.svc.update(tx, p, id, b));
  }

  @Post(':id/enable')
  @HttpCode(200)
  @Auth('user', ADMIN)
  enable(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, (tx) => this.svc.setEnabled(tx, p, id, true));
  }

  @Post(':id/disable')
  @HttpCode(200)
  @Auth('user', ADMIN)
  disable(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, (tx) => this.svc.setEnabled(tx, p, id, false));
  }

  @Delete(':id')
  @HttpCode(204)
  @Auth('user', ADMIN)
  remove(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, (tx) => this.svc.remove(tx, p, id));
  }

  /** Webhooks get a signed test event; other types answer "not available in this build". */
  @Post(':id/test')
  @HttpCode(200)
  @Auth('user', ADMIN)
  test(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, (tx) => this.svc.test(tx, p, id));
  }

  /** The delivery log of a webhook: status, attempts, last error. */
  @Get(':id/deliveries')
  @Auth('user', VIEW)
  deliveries(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, (tx) => this.svc.deliveries(tx, id));
  }

  @Post('deliveries/:deliveryId/retry')
  @HttpCode(204)
  @Auth('user', ADMIN)
  retry(@CurrentPrincipal() p: UserPrincipal, @Param('deliveryId', ParseUUIDPipe) deliveryId: string) {
    return this.db.withTenant(p.tenantId, (tx) => this.svc.retry(tx, p, deliveryId));
  }
}
