import { BadRequestException, Controller, ForbiddenException, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, PayloadTooLargeException, Put, Req, Res } from '@nestjs/common';
import { RealtimeEvents, type RemoteCommand } from '@kinetix/shared';
import type { Request, Response } from 'express';
import { Auth, CurrentPrincipal, TEACHING_ROLES } from '../auth/auth.decorators.js';
import type { BoardPrincipal, UserPrincipal } from '../auth/principal.js';
import { audit } from '../common/audit.js';
import { DbService } from '../db/db.service.js';
import { RealtimeGateway } from '../realtime/realtime.gateway.js';
import { ObjectStorage, TooLargeError } from '../storage/storage.service.js';
import { RemoteService } from './remote.service.js';

/** A phone photo, after the phone has shrunk it (the Teacher App sends about 2 MB at most). */
export const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

const photoKey = (tenantId: string, deviceId: string, photoId: string) => `tenants/${tenantId}/remote-photos/${deviceId}/${photoId}`;

/**
 * "Show a photo on the board" from the phone remote. The teacher's phone uploads the photo for
 * the board it is driving; the board fetches it once (with its session token), puts it on the
 * page as an image, and the stored copy is deleted. Only the teacher whose class is open on the
 * board may send one, and only that board may fetch it.
 */
@Controller('v1/remote')
export class RemoteController {
  constructor(
    private readonly remote: RemoteService,
    private readonly storage: ObjectStorage,
    private readonly realtime: RealtimeGateway,
    private readonly db: DbService,
  ) {}

  @Put(':deviceId/photos/:photoId')
  @HttpCode(204)
  @Auth('user', TEACHING_ROLES)
  async upload(@CurrentPrincipal() p: UserPrincipal, @Param('deviceId', ParseUUIDPipe) deviceId: string, @Param('photoId', ParseUUIDPipe) photoId: string, @Req() req: Request) {
    const mime = (req.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase();
    if (!PHOTO_TYPES.includes(mime)) throw new BadRequestException('Send a JPEG, PNG or WebP photo');
    if (Number(req.headers['content-length'] ?? 0) > MAX_PHOTO_BYTES) throw new PayloadTooLargeException('This photo is too large');
    const grant = await this.remote.grant(p.tenantId, p.userId, deviceId);
    if (!grant) throw new ForbiddenException('Connect to this board from the Teacher App first');
    try {
      await this.storage.put(photoKey(p.tenantId, deviceId, photoId), req, MAX_PHOTO_BYTES, mime);
    } catch (e) {
      if (e instanceof TooLargeError) throw new PayloadTooLargeException('This photo is too large');
      throw e;
    }
    await this.db.withTenant(p.tenantId, (tx) =>
      audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'remote.photo', subjectType: 'device', subjectId: deviceId, data: { photoId, sessionId: grant.sessionId } }),
    );
    this.realtime.toDevices([deviceId], RealtimeEvents.RemoteCommand, { type: 'photo.show', photoId } satisfies RemoteCommand);
  }

  /** The board fetches a photo sent to it, once. */
  @Get('photos/:photoId')
  @Auth('board')
  async photo(@CurrentPrincipal() p: BoardPrincipal, @Param('photoId', ParseUUIDPipe) photoId: string, @Res() res: Response) {
    const key = photoKey(p.tenantId, p.deviceId, photoId);
    if ((await this.storage.size(key)) == null) throw new NotFoundException('Photo not found');
    const { stream } = await this.storage.get(key);
    const chunks: Buffer[] = [];
    for await (const c of stream) chunks.push(c as Buffer);
    // Fetched once: the photo now lives on the board's page (and in the board's saved copy).
    await this.storage.delete(key);
    res.setHeader('content-type', 'application/octet-stream');
    res.setHeader('cache-control', 'no-store');
    res.end(Buffer.concat(chunks));
  }
}
