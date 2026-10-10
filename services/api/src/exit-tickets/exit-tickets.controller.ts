import { Body, Controller, Get, Param, ParseUUIDPipe, Put } from '@nestjs/common';
import { z } from 'zod';
import { Auth, CurrentPrincipal, TEACHING_ROLES } from '../auth/auth.decorators.js';
import type { BoardPrincipal, RoleName, UserPrincipal } from '../auth/principal.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService } from '../db/db.service.js';
import { ExitTicketsService } from './exit-tickets.service.js';

const SaveBody = z.object({
  topic: z.string().trim().min(1).max(200),
  pollIds: z.array(z.string().uuid()).min(1).max(10),
});

const READ_ROLES: RoleName[] = [...TEACHING_ROLES, 'tenant_admin', 'hod'];

/** Exit tickets: saved by the board at the end of a lesson, read by teachers and leaders (ERP, Teacher App). */
@Controller()
export class ExitTicketsController {
  constructor(
    private readonly db: DbService,
    private readonly tickets: ExitTicketsService,
  ) {}

  /** The board saves the ticket it just ran: the polls it asked, in order. The board chooses the id, so a retry saves once. */
  @Put('v1/exit-tickets/:id')
  @Auth('board')
  save(@CurrentPrincipal() p: BoardPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(SaveBody)) body: z.infer<typeof SaveBody>) {
    return this.db.withTenant(p.tenantId, (tx) => this.tickets.save(tx, p, id, body));
  }

  @Get('v1/exit-tickets/:id')
  @Auth('user', READ_ROLES)
  get(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, (tx) => this.tickets.get(tx, p, id));
  }

  @Get('v1/sections/:id/exit-tickets')
  @Auth('user', READ_ROLES)
  forSection(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => ({ tickets: await this.tickets.forSection(tx, p, id) }));
  }
}
