import { Body, Controller, Delete, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { Auth, CurrentPrincipal, STAFF_ADMIN_ROLES } from '../auth/auth.decorators.js';
import type { UserPrincipal } from '../auth/principal.js';
import { audit, auditUser } from '../common/audit.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService, type Tx } from '../db/db.service.js';
import { trustedDevices } from '../db/schema-g1.js';
import { users } from '../db/schema.js';

const TrustBody = z.object({ deviceId: z.string().trim().min(8).max(128), label: z.string().trim().max(80).optional(), platform: z.enum(['web', 'android', 'ios', 'desktop', 'board']).default('web') });

/** A device is stored as a hash of its install id: the id itself cannot be read back or used to impersonate it. */
export const deviceHash = (tenantId: string, userId: string, deviceId: string) => createHash('sha256').update(`${tenantId}:${userId}:${deviceId}`).digest('hex');

/**
 * Called after a sign-in that sent `x-device-id`: a known device is touched, an unknown or revoked one is audited
 * as a new-device sign-in so security staff can see it. Never blocks the sign-in.
 */
export async function noteSignInDevice(tx: Tx, tenantId: string, userId: string, deviceId: string | undefined, record = true, platformHint = 'web'): Promise<'trusted' | 'new' | 'none'> {
  if (!deviceId || deviceId.length < 8) return 'none';
  const hash = deviceHash(tenantId, userId, deviceId);
  const [known] = await tx.select().from(trustedDevices).where(and(eq(trustedDevices.userId, userId), eq(trustedDevices.deviceHash, hash)));
  if (known && !known.revokedAt) {
    await tx.update(trustedDevices).set({ lastSeenAt: new Date() }).where(eq(trustedDevices.id, known.id));
    return 'trusted';
  }
  if (record) await audit(tx, { tenantId, actorType: 'user', actorId: userId, action: 'auth.new_device', subjectType: 'user', subjectId: userId, data: { platform: platformHint, revoked: !!known } });
  return 'new';
}

/** Trusted devices: a person lists, trusts and revokes their own; an administrator can revoke anyone's. */
@Controller('v1')
export class TrustController {
  constructor(private readonly db: DbService) {}

  @Get('me/devices')
  @Auth('user')
  mine(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, (tx) =>
      tx
        .select({ id: trustedDevices.id, label: trustedDevices.label, platform: trustedDevices.platform, trustedAt: trustedDevices.trustedAt, lastSeenAt: trustedDevices.lastSeenAt, revokedAt: trustedDevices.revokedAt })
        .from(trustedDevices)
        .where(eq(trustedDevices.userId, p.userId))
        .orderBy(desc(trustedDevices.lastSeenAt)),
    );
  }

  /** Whether this install is trusted for the signed-in person (and refreshes its last-seen time). */
  @Get('me/devices/status')
  @Auth('user')
  status(@CurrentPrincipal() p: UserPrincipal, @Query('deviceId') deviceId?: string) {
    return this.db.withTenant(p.tenantId, async (tx) => ({ state: await noteSignInDevice(tx, p.tenantId, p.userId, deviceId, false) }));
  }

  @Post('me/devices/trust')
  @Auth('user')
  @HttpCode(200)
  trust(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(TrustBody)) b: z.infer<typeof TrustBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const hash = deviceHash(p.tenantId, p.userId, b.deviceId);
      const values = { label: b.label ?? '', platform: b.platform, trustedAt: new Date(), lastSeenAt: new Date(), revokedAt: null };
      const [row] = await tx.insert(trustedDevices).values({ tenantId: p.tenantId, userId: p.userId, deviceHash: hash, ...values }).onConflictDoUpdate({ target: [trustedDevices.userId, trustedDevices.deviceHash], set: values }).returning({ id: trustedDevices.id });
      await auditUser(tx, p, 'auth.device.trusted', 'trusted_device', row.id, { platform: b.platform });
      return { id: row.id, state: 'trusted' as const };
    });
  }

  @Delete('me/devices/:id')
  @Auth('user')
  @HttpCode(200)
  revoke(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [row] = await tx.update(trustedDevices).set({ revokedAt: new Date() }).where(and(eq(trustedDevices.id, id), eq(trustedDevices.userId, p.userId), isNull(trustedDevices.revokedAt))).returning({ id: trustedDevices.id });
      if (!row) throw new NotFoundException('Device not found');
      await auditUser(tx, p, 'auth.device.revoked', 'trusted_device', id);
      return { ok: true };
    });
  }

  /** Everyone's trusted devices, or one person's, for the security desk. */
  @Get('admin/trusted-devices')
  @Auth('user', STAFF_ADMIN_ROLES)
  all(@CurrentPrincipal() p: UserPrincipal, @Query('userId') userId?: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const rows = await tx
        .select({ id: trustedDevices.id, userId: trustedDevices.userId, userName: users.fullName, label: trustedDevices.label, platform: trustedDevices.platform, trustedAt: trustedDevices.trustedAt, lastSeenAt: trustedDevices.lastSeenAt, revokedAt: trustedDevices.revokedAt })
        .from(trustedDevices)
        .innerJoin(users, eq(users.id, trustedDevices.userId))
        .where(userId ? eq(trustedDevices.userId, z.uuid().parse(userId)) : undefined)
        .orderBy(desc(trustedDevices.lastSeenAt))
        .limit(500);
      return rows;
    });
  }

  @Post('admin/trusted-devices/:id/revoke')
  @Auth('user', STAFF_ADMIN_ROLES)
  @HttpCode(200)
  adminRevoke(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [row] = await tx.update(trustedDevices).set({ revokedAt: new Date() }).where(eq(trustedDevices.id, id)).returning({ id: trustedDevices.id, userId: trustedDevices.userId });
      if (!row) throw new NotFoundException('Device not found');
      await auditUser(tx, p, 'auth.device.revoked_by_admin', 'trusted_device', id, { userId: row.userId });
      return { ok: true };
    });
  }
}
