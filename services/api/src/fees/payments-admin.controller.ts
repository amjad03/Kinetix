import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Post, Put } from '@nestjs/common';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { RoleName, UserPrincipal } from '../auth/principal.js';
import { audit } from '../common/audit.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService, type Tx } from '../db/db.service.js';
import { tenants } from '../db/schema.js';
import { keyMode, PaymentGateway } from './payment-gateway.service.js';

/** Only the head of the institution and its administrator manage where fees are paid. */
export const PAYMENT_ADMIN_ROLES: RoleName[] = ['principal', 'tenant_admin'];

export const KEYS_REQUIRED = 'Enter the key secret and the webhook secret';
export const KEY_SECRET_REQUIRED = 'Enter the key secret for the new key id';

const Secret = z.string().trim().min(8, 'This secret is too short').max(200);
const RazorpayBody = z
  .object({
    keyId: z
      .string()
      .trim()
      .regex(/^rzp_(test|live)_[A-Za-z0-9]{6,40}$/, 'Enter a Razorpay key id (rzp_live_… or rzp_test_…)'),
    keySecret: Secret.optional(),
    webhookSecret: Secret.optional(),
  })
  .strict();

/**
 * The institution's own Razorpay account (Settings → Online payments in the ERP). Secrets go in
 * and are never sent back: responses carry the key id, the last four characters of the key
 * secret, the mode and when it was changed. The audit log records changes without secrets.
 */
@Controller('v1/admin/payments/razorpay')
export class PaymentsAdminController {
  constructor(
    private readonly db: DbService,
    private readonly gateway: PaymentGateway,
  ) {}

  @Get()
  @Auth('user', PAYMENT_ADMIN_ROLES)
  get(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => this.gateway.view(tx, await this.slug(tx)));
  }

  @Put()
  @Auth('user', PAYMENT_ADMIN_ROLES)
  put(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(RazorpayBody)) b: z.infer<typeof RazorpayBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const before = await this.gateway.view(tx, '');
      if (!before.configured && !(b.keySecret && b.webhookSecret)) throw new BadRequestException(KEYS_REQUIRED);
      if (before.configured && before.keyId !== b.keyId && !b.keySecret) throw new BadRequestException(KEY_SECRET_REQUIRED);
      const changed = await this.gateway.save(tx, p.tenantId, p.userId, b);
      await audit(tx, {
        tenantId: p.tenantId,
        actorType: 'user',
        actorId: p.userId,
        action: 'payments.razorpay_updated',
        subjectType: 'tenant',
        subjectId: p.tenantId,
        data: { keyId: b.keyId, mode: keyMode(b.keyId), ...changed },
      });
      return this.gateway.view(tx, await this.slug(tx));
    });
  }

  /** Stops online payments for the institution (counter payments still work). */
  @Delete()
  @Auth('user', PAYMENT_ADMIN_ROLES)
  remove(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      if (await this.gateway.remove(tx, p.tenantId)) {
        await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'payments.razorpay_removed', subjectType: 'tenant', subjectId: p.tenantId });
      }
      return this.gateway.view(tx, await this.slug(tx));
    });
  }

  /** Calls Razorpay with the stored keys (lists one order) and says whether they work. */
  @Post('test')
  @HttpCode(200)
  @Auth('user', PAYMENT_ADMIN_ROLES)
  async test(@CurrentPrincipal() p: UserPrincipal) {
    const keys = await this.db.withTenant(p.tenantId, (tx) => this.gateway.keys(tx));
    if (!keys) return { ok: false, error: 'PAYMENTS_NOT_CONFIGURED' };
    // The gateway call happens outside the transaction.
    const result = await this.gateway.ping(keys);
    await this.db.withTenant(p.tenantId, (tx) =>
      audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'payments.razorpay_tested', subjectType: 'tenant', subjectId: p.tenantId, data: { keyId: keys.keyId, ...result } }),
    );
    return { ...result, keyId: keys.keyId, mode: keyMode(keys.keyId) };
  }

  private async slug(tx: Tx): Promise<string> {
    const [t] = await tx.select({ slug: tenants.slug }).from(tenants);
    return t?.slug ?? '';
  }
}
