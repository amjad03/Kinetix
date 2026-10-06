import { BadRequestException, Controller, Delete, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { MeResponse } from '@kinetix/shared';
import { and, eq, inArray, or } from 'drizzle-orm';
import type { Response } from 'express';
import { Readable } from 'node:stream';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { BoardPrincipal, RoleName, UserPrincipal } from '../auth/principal.js';
import { audit } from '../common/audit.js';
import { Clock } from '../common/time.js';
import { DbService, type Tx } from '../db/db.service.js';
import { guardians, students, userRoles, users } from '../db/schema.js';
import { ObjectStorage } from '../storage/storage.service.js';
import { SystemLookups } from '../db/system-lookups.service.js';
import { loadMe } from '../teacher/teacher.controller.js';

/** Photos are cropped square and compressed in the apps; this is a generous ceiling. */
export const MAX_PHOTO_BYTES = 2 * 1024 * 1024;

/** The image type from the first bytes (not the client's word for it). */
export function photoType(b: Buffer): 'image/jpeg' | 'image/png' | 'image/webp' | null {
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (b.length > 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

const FAMILY_ROLES: RoleName[] = ['student', 'guardian'];

/** Profile photos: one's own upload and removal, and showing a user's photo to those who may see it. */
@Controller()
export class ProfilePhotoController {
  constructor(
    private readonly db: DbService,
    private readonly storage: ObjectStorage,
    private readonly system: SystemLookups,
    private readonly clock: Clock,
  ) {}

  /** Multipart `photo`: a JPEG, PNG or WebP of at most 2 MB. Replaces the earlier photo. */
  @Post('v1/me/photo')
  @HttpCode(200)
  @Auth('user')
  @UseInterceptors(FileInterceptor('photo', { limits: { fileSize: MAX_PHOTO_BYTES, files: 1 } }))
  async upload(@CurrentPrincipal() p: UserPrincipal, @UploadedFile() file?: { buffer: Buffer; size: number }): Promise<MeResponse> {
    if (!file?.buffer?.length) throw new BadRequestException('Choose a photo');
    const mime = photoType(file.buffer);
    if (!mime) throw new BadRequestException('The photo must be a JPEG, PNG or WebP image');
    const now = this.clock.now();
    const key = `tenants/${p.tenantId}/users/${p.userId}/photo-${now.getTime()}.${mime.slice(6)}`;
    await this.storage.put(key, Readable.from(file.buffer), MAX_PHOTO_BYTES, mime);
    const old = await this.db.withTenant(p.tenantId, async (tx) => {
      const [u] = await tx.select({ photoKey: users.photoKey }).from(users).where(eq(users.id, p.userId));
      await tx.update(users).set({ photoKey: key, photoUpdatedAt: now, updatedAt: now }).where(eq(users.id, p.userId));
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'profile.photo_changed', subjectType: 'user', subjectId: p.userId, data: { bytes: file.size, mime } });
      return u?.photoKey;
    });
    if (old && old !== key) await this.storage.delete(old).catch(() => undefined);
    return loadMe(this.db, this.system, p);
  }

  @Delete('v1/me/photo')
  @Auth('user')
  async remove(@CurrentPrincipal() p: UserPrincipal): Promise<MeResponse> {
    const old = await this.db.withTenant(p.tenantId, async (tx) => {
      const [u] = await tx.select({ photoKey: users.photoKey }).from(users).where(eq(users.id, p.userId));
      await tx.update(users).set({ photoKey: null, photoUpdatedAt: this.clock.now() }).where(eq(users.id, p.userId));
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'profile.photo_removed', subjectType: 'user', subjectId: p.userId });
      return u?.photoKey;
    });
    if (old) await this.storage.delete(old).catch(() => undefined);
    return loadMe(this.db, this.system, p);
  }

  /**
   * A user's photo. Staff see everyone's; everyone sees staff photos; a student and their
   * guardians see each other's. Anyone else gets 404, as for a user without a photo.
   */
  @Get('v1/users/:id/photo')
  @Auth(['user', 'board'])
  async photo(@CurrentPrincipal() p: UserPrincipal | BoardPrincipal, @Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const key = await this.db.withTenant(p.tenantId, async (tx) => {
      const [u] = await tx.select({ photoKey: users.photoKey }).from(users).where(eq(users.id, id));
      if (!u?.photoKey || !(await this.maySee(tx, p, id))) throw new NotFoundException('No photo');
      return u.photoKey;
    });
    const { stream, size } = await this.storage.get(key);
    res.setHeader('content-type', `image/${key.slice(key.lastIndexOf('.') + 1)}`);
    res.setHeader('content-length', size);
    // The URL carries the version, so the photo can be cached for long.
    res.setHeader('cache-control', 'private, max-age=86400');
    stream.pipe(res);
  }

  private async maySee(tx: Tx, p: UserPrincipal | BoardPrincipal, id: string): Promise<boolean> {
    // A board shows its class with a teacher signed in.
    if (p.kind === 'board') return true;
    if (id === p.userId || p.roles.some((r) => !FAMILY_ROLES.includes(r))) return true;
    const roles = await tx.select({ role: userRoles.role }).from(userRoles).where(eq(userRoles.userId, id));
    if (roles.some((r) => !FAMILY_ROLES.includes(r.role))) return true;
    // A student and their guardians.
    const [link] = await tx
      .select({ id: guardians.id })
      .from(guardians)
      .innerJoin(students, eq(students.id, guardians.studentId))
      .where(
        or(
          and(eq(guardians.userId, p.userId), eq(students.userId, id)),
          and(eq(guardians.userId, id), eq(students.userId, p.userId)),
          // Two guardians of the same child.
          and(eq(guardians.userId, id), inArray(guardians.studentId, tx.select({ id: guardians.studentId }).from(guardians).where(eq(guardians.userId, p.userId)))),
        ),
      )
      .limit(1);
    return !!link;
  }
}
