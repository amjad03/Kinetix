import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { z } from 'zod';
import { Auth, CurrentPrincipal, STAFF_ADMIN_ROLES } from '../auth/auth.decorators.js';
import type { BoardPrincipal, DevicePrincipal, UserPrincipal } from '../auth/principal.js';
import { ZodBody } from '../common/zod-body.js';
import { BoardProfilesService } from './board-profiles.service.js';
import { PROFILE_PIN, weakPin } from './profile-pin.js';

const PinBody = z.object({ pin: z.string().regex(PROFILE_PIN, 'The PIN must be 4 to 6 digits') });

export const WEAK_PIN = 'Choose a PIN that is harder to guess';

/**
 * Shared-board profiles (docs/architecture/board-profiles.md). The board's own routes come
 * first: `me/profiles` must win over the admin routes' `:id/profiles`.
 */
@Controller('v1/devices')
export class BoardProfilesController {
  constructor(private readonly profiles: BoardProfilesService) {}

  /** The board's teachers, for the "Who is teaching?" picker, with what it needs to check PINs offline. */
  @Get('me/profiles')
  @Auth(['device', 'board'])
  list(@CurrentPrincipal() p: DevicePrincipal | BoardPrincipal) {
    return this.profiles.list(p.tenantId, p.deviceId, { forBoard: true });
  }

  /** The signed-in teacher sets their PIN for this board (after a full sign-in). */
  @Put('me/profiles/me/pin')
  @Auth('board')
  setPin(@CurrentPrincipal() p: BoardPrincipal, @Body(new ZodBody(PinBody)) body: z.infer<typeof PinBody>) {
    if (weakPin(body.pin)) throw new BadRequestException(WEAK_PIN);
    return this.profiles.setPin(p.tenantId, p.deviceId, p.teacherId, body.pin);
  }

  /** The signed-in teacher takes their profile off this board. */
  @Delete('me/profiles/me')
  @HttpCode(204)
  @Auth('board')
  async removeMine(@CurrentPrincipal() p: BoardPrincipal) {
    await this.profiles.remove(p.tenantId, p.deviceId, p.teacherId, { type: 'user', id: p.teacherId });
  }

  /** A teacher switches the board to their profile with their PIN; answers like a pairing (a session token). */
  @Post('me/profiles/:userId/unlock')
  @HttpCode(200)
  @Auth(['device', 'board'])
  unlock(
    @CurrentPrincipal() p: DevicePrincipal | BoardPrincipal,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body(new ZodBody(PinBody)) body: z.infer<typeof PinBody>,
  ) {
    return this.profiles.unlock(p.tenantId, p.deviceId, userId, body.pin);
  }

  // --- ERP ------------------------------------------------------------------------------------

  /** Who uses this board, whose PIN is set and who is locked out. */
  @Get(':id/profiles')
  @Auth('user', STAFF_ADMIN_ROLES)
  adminList(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.profiles.list(p.tenantId, id, { forBoard: false });
  }

  /** Clears a teacher's PIN and lockout on this board. */
  @Post(':id/profiles/:userId/reset-pin')
  @HttpCode(200)
  @Auth('user', STAFF_ADMIN_ROLES)
  resetPin(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Param('userId', ParseUUIDPipe) userId: string) {
    return this.profiles.resetPin(p.tenantId, id, userId, p.userId);
  }

  /** Takes a teacher off this board's list (they appear again when they next sign in on it). */
  @Delete(':id/profiles/:userId')
  @HttpCode(204)
  @Auth('user', STAFF_ADMIN_ROLES)
  async adminRemove(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Param('userId', ParseUUIDPipe) userId: string) {
    await this.profiles.remove(p.tenantId, id, userId, { type: 'user', id: p.userId });
  }
}
