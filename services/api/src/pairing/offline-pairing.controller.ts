import { Body, Controller, Get, HttpCode, Inject, Injectable, NotFoundException, Post } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { Auth, CurrentPrincipal, TEACHING_ROLES } from '../auth/auth.decorators.js';
import type { DevicePrincipal, UserPrincipal } from '../auth/principal.js';
import { audit } from '../common/audit.js';
import { RateLimiter } from '../common/rate-limiter.js';
import { SecretBox } from '../common/secret-box.js';
import { Clock } from '../common/time.js';
import { ZodBody } from '../common/zod-body.js';
import { ENV, type Env } from '../config/env.js';
import { DbService, type Tx } from '../db/db.service.js';
import { devices } from '../db/schema.js';
import { tenantSigningKeys } from '../db/schema-assist.js';
import { issueWindows, keyIdOf, newSigningKeyPair, rawPublicKey, verifyOfflineCode } from './offline-code.js';

const IssueBody = z.object({ hours: z.number().int().min(1).max(72).default(24), windowMinutes: z.number().int().min(15).max(240).default(60) });
const VerifyBody = z.object({ token: z.string().min(20).max(2000) });
const aad = (tenantId: string) => `${tenantId}:pairing.signing_key`;

/** The institution's signing key: made on first use, private half encrypted at rest. */
@Injectable()
export class SigningKeys {
  private readonly box: SecretBox;

  constructor(@Inject(ENV) env: Env) {
    this.box = SecretBox.fromEnv(env) ?? new SecretBox({ 1: createHash('sha256').update(`kinetix-signing-keys:${env.PAIRING_HMAC_SECRET}`).digest() }, 1);
  }

  async get(tx: Tx, tenantId: string, rotate = false) {
    const [row] = await tx.select().from(tenantSigningKeys).where(eq(tenantSigningKeys.tenantId, tenantId));
    if (row && !rotate) return { keyId: row.keyId, publicKeyPem: row.publicKeyPem, privateKeyPem: this.box.decrypt(row.privateKeyEnc, aad(tenantId)), createdAt: row.createdAt };
    const k = newSigningKeyPair();
    const values = { tenantId, keyId: k.keyId, publicKeyPem: k.publicKeyPem, privateKeyEnc: this.box.encrypt(k.privateKeyPem, aad(tenantId)), createdAt: new Date() };
    await tx.insert(tenantSigningKeys).values(values).onConflictDoUpdate({ target: tenantSigningKeys.tenantId, set: { keyId: values.keyId, publicKeyPem: values.publicKeyPem, privateKeyEnc: values.privateKeyEnc, createdAt: values.createdAt } });
    return { keyId: k.keyId, publicKeyPem: k.publicKeyPem, privateKeyPem: k.privateKeyPem, createdAt: values.createdAt };
  }
}

/**
 * Offline board pairing. The Teacher App fetches the institution's public key while online; a board that is online
 * fetches signed, time-boxed codes. Later, with no network, the app scans a code and checks it against the key.
 */
@Controller('v1/pairing')
export class OfflinePairingController {
  constructor(
    private readonly db: DbService,
    private readonly keys: SigningKeys,
    private readonly clock: Clock,
    private readonly limiter: RateLimiter,
  ) {}

  /** The public key the Teacher App stores for offline checks. Created on first request. */
  @Get('signing-key')
  @Auth('user', [...TEACHING_ROLES, 'tenant_admin'])
  async publicKey(@CurrentPrincipal() p: UserPrincipal) {
    const k = await this.db.withTenant(p.tenantId, (tx) => this.keys.get(tx, p.tenantId));
    return { keyId: k.keyId, algorithm: 'Ed25519', publicKeyPem: k.publicKeyPem, publicKeyRaw: rawPublicKey(k.publicKeyPem), tenantId: p.tenantId, createdAt: k.createdAt };
  }

  /** Replaces the key. Codes signed by the old key stop working; apps fetch the new public key the next time they are online. */
  @Post('signing-key/rotate')
  @HttpCode(200)
  @Auth('user', ['tenant_admin'])
  async rotate(@CurrentPrincipal() p: UserPrincipal) {
    const k = await this.db.withTenant(p.tenantId, async (tx) => {
      const fresh = await this.keys.get(tx, p.tenantId, true);
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'pairing.signing_key_rotated.v1', subjectType: 'tenant', subjectId: p.tenantId, data: { keyId: fresh.keyId } });
      return fresh;
    });
    return { keyId: k.keyId, algorithm: 'Ed25519', publicKeyPem: k.publicKeyPem, publicKeyRaw: rawPublicKey(k.publicKeyPem), tenantId: p.tenantId, createdAt: k.createdAt };
  }

  /** A board asks for signed codes covering the next hours; it shows the one whose window is now, even with no network. */
  @Post('offline-codes')
  @HttpCode(200)
  @Auth('device')
  async issue(@CurrentPrincipal() p: DevicePrincipal, @Body(new ZodBody(IssueBody)) b: z.infer<typeof IssueBody>) {
    await this.limiter.hit(`offline-codes:${p.deviceId}`, 10, 60_000);
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [dev] = await tx.select({ name: devices.name }).from(devices).where(eq(devices.id, p.deviceId));
      if (!dev) throw new NotFoundException('Board not found');
      const k = await this.keys.get(tx, p.tenantId);
      const start = Math.floor(this.clock.now().getTime() / 1000);
      const codes = issueWindows(k.privateKeyPem, { tenantId: p.tenantId, deviceId: p.deviceId, keyId: k.keyId }, start, b.hours, b.windowMinutes);
      await audit(tx, { tenantId: p.tenantId, actorType: 'device', actorId: p.deviceId, action: 'pairing.offline_codes_issued.v1', subjectType: 'device', subjectId: p.deviceId, data: { count: codes.length, hours: b.hours } });
      return { keyId: k.keyId, board: { id: p.deviceId, name: dev.name }, codes: codes.map((c) => ({ token: c.token, validFrom: new Date(c.validFrom * 1000).toISOString(), validUntil: new Date(c.validUntil * 1000).toISOString() })) };
    });
  }

  /** The same check the Teacher App makes offline, run on the server (for diagnostics and for apps that are online). */
  @Post('offline-verify')
  @HttpCode(200)
  @Auth('user', TEACHING_ROLES)
  async verify(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(VerifyBody)) b: z.infer<typeof VerifyBody>) {
    const k = await this.db.withTenant(p.tenantId, (tx) => this.keys.get(tx, p.tenantId));
    const r = verifyOfflineCode(k.publicKeyPem, b.token, { tenantId: p.tenantId, now: Math.floor(this.clock.now().getTime() / 1000) });
    if (!r.ok) return { valid: false, reason: r.reason };
    const [dev] = await this.db.withTenant(p.tenantId, (tx) => tx.select({ id: devices.id, name: devices.name }).from(devices).where(eq(devices.id, r.payload.d)));
    return { valid: !!dev, reason: dev ? null : 'wrong_board', board: dev ?? null, validUntil: new Date(r.payload.u * 1000).toISOString(), keyCurrent: r.payload.k === keyIdOf(k.publicKeyPem) };
  }
}
