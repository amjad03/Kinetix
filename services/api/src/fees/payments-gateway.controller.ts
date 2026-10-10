import { BadRequestException, Body, Controller, Get, Put } from '@nestjs/common';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { UserPrincipal } from '../auth/principal.js';
import { audit } from '../common/audit.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService, type Tx } from '../db/db.service.js';
import { tenants } from '../db/schema.js';
import { PaymentGateway } from './payment-gateway.service.js';
import { KEYS_REQUIRED, PAYMENT_ADMIN_ROLES } from './payments-admin.controller.js';

const Secret = z.string().trim().min(8, 'This secret is too short').max(200);
const GatewayBody = z
  .discriminatedUnion('provider', [
    z.object({
      provider: z.literal('razorpay'),
      keyId: z.string().trim().regex(/^rzp_(test|live)_[A-Za-z0-9]{6,40}$/, 'Enter a Razorpay key id (rzp_live_… or rzp_test_…)'),
      keySecret: Secret.optional(),
      webhookSecret: Secret.optional(),
    }),
    z.object({
      provider: z.literal('payu'),
      /** The PayU merchant key. */
      keyId: z.string().trim().regex(/^[A-Za-z0-9]{4,40}$/, 'Enter your PayU merchant key'),
      /** The PayU salt: it also signs PayU's responses and webhooks. */
      keySecret: Secret.optional(),
    }),
  ]);

/**
 * Which payment gateway the institution collects fees through. It picks Razorpay or PayU and
 * saves that account's credentials (one gateway at a time; secrets are never sent back).
 */
@Controller('v1/admin/payments/gateway')
export class PaymentsGatewayController {
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
  put(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(GatewayBody)) b: z.infer<typeof GatewayBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const before = await this.gateway.view(tx, '');
      const sameGateway = before.configured && before.gateway === b.provider;
      const needsSecrets = !sameGateway || before.keyId !== b.keyId;
      if (!b.keySecret && needsSecrets) throw new BadRequestException(KEYS_REQUIRED);
      if (b.provider === 'razorpay' && !before.configured && !b.webhookSecret) throw new BadRequestException(KEYS_REQUIRED);
      // PayU's salt signs its webhooks too, so it is kept as the webhook secret as well.
      const input = b.provider === 'payu' ? { provider: b.provider, keyId: b.keyId, keySecret: b.keySecret, webhookSecret: b.keySecret } : b;
      const changed = await this.gateway.save(tx, p.tenantId, p.userId, input);
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'payments.gateway_updated', subjectType: 'tenant', subjectId: p.tenantId, data: { provider: b.provider, keyId: b.keyId, ...changed } });
      return this.gateway.view(tx, await this.slug(tx));
    });
  }

  private async slug(tx: Tx): Promise<string> {
    const [t] = await tx.select({ slug: tenants.slug }).from(tenants);
    return t?.slug ?? '';
  }
}
