import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { z } from 'zod';
import { ZodBody } from '../common/zod-body.js';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { BoardPrincipal, DevicePrincipal } from '../auth/principal.js';
import { DbService } from '../db/db.service.js';
import { BoardSyncService } from './board-sync.service.js';

/** What a board asks the cloud as time passes in a room: which class is on now, and whether an exam is being sat here. */
const TagBody = z.object({ coIds: z.array(z.uuid()).max(10) });

@Controller('v1')
export class BoardSyncController {
  constructor(
    private readonly db: DbService,
    private readonly svc: BoardSyncService,
  ) {}

  /** The signed-in teacher's current period in this room (null between periods). */
  @Get('classroom/now')
  @Auth('board')
  now(@CurrentPrincipal() p: BoardPrincipal) {
    return this.db.withTenant(p.tenantId, (tx) => this.svc.now(tx, p));
  }

  /** Switches the board to the current period, keeping the period so attendance lands against it. */
  @Post('classroom/now/open')
  @HttpCode(200)
  @Auth('board')
  openNow(@CurrentPrincipal() p: BoardPrincipal) {
    return this.db.withTenant(p.tenantId, (tx) => this.svc.openNow(tx, p));
  }

  /** Exam room mode: works with the device token alone, so the room shows the paper before any teacher signs in. */
  @Get('devices/me/exam-room')
  @Auth('device')
  examRoom(@CurrentPrincipal() p: DevicePrincipal) {
    return this.db.withTenant(p.tenantId, (tx) => this.svc.examRoom(tx, p.deviceId));
  }

  /** Course outcomes of the open subject, for tagging a question. */
  @Get('classroom/course-outcomes')
  @Auth('board')
  courseOutcomes(@CurrentPrincipal() p: BoardPrincipal) {
    return this.db.withTenant(p.tenantId, (tx) => this.svc.courseOutcomes(tx, p));
  }

  /** The teacher tags the question just asked with course outcomes; its results then count as classroom evidence in OBE. */
  @Put('polls/:id/cos')
  @Auth('board')
  tagPoll(@CurrentPrincipal() p: BoardPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(TagBody)) body: z.infer<typeof TagBody>) {
    return this.db.withTenant(p.tenantId, (tx) => this.svc.tagPoll(tx, p, id, body.coIds));
  }
}
