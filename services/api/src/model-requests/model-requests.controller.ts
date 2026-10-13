import { Body, Controller, Get, Param, ParseUUIDPipe, Put } from '@nestjs/common';
import { z } from 'zod';
import { Auth, CurrentPrincipal, TEACHING_ROLES } from '../auth/auth.decorators.js';
import type { BoardPrincipal, RoleName, UserPrincipal } from '../auth/principal.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService } from '../db/db.service.js';
import { ModelRequestsService } from './model-requests.service.js';

const RequestBody = z.object({
  name: z.string().trim().min(1).max(120),
  subject: z.string().trim().max(60).nullish(),
  classLevel: z.string().trim().max(20).nullish(),
  note: z.string().trim().max(1000).nullish(),
});

const READ_ROLES: RoleName[] = [...TEACHING_ROLES, 'tenant_admin'];

/** "Request a 3D model": sent by the board (through its offline outbox), read by the school's staff in the ERP. */
@Controller()
export class ModelRequestsController {
  constructor(
    private readonly db: DbService,
    private readonly requests: ModelRequestsService,
  ) {}

  /** The board chooses the id, so a request replayed from its outbox is kept once. */
  @Put('v1/model-requests/:id')
  @Auth('board')
  save(@CurrentPrincipal() p: BoardPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(RequestBody)) body: z.infer<typeof RequestBody>) {
    return this.db.withTenant(p.tenantId, (tx) => this.requests.save(tx, p, id, body));
  }

  /** The school's requests, newest first, each with how many asked for the same model. */
  @Get('v1/model-requests')
  @Auth('user', READ_ROLES)
  list(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => ({ requests: await this.requests.list(tx) }));
  }
}
