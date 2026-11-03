import { BadRequestException, Body, Controller, Delete, Get, HttpCode, NotFoundException, Param, Post, Put, Query } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { UserPrincipal } from '../auth/principal.js';
import { audit } from '../common/audit.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService, type Tx } from '../db/db.service.js';
import { tenants } from '../db/schema.js';
import { feeAccounts } from '../db/schema-fee-flagship.js';
import { PaymentGateway } from './payment-gateway.service.js';
import { KEYS_REQUIRED, PAYMENT_ADMIN_ROLES } from './payments-admin.controller.js';

const Secret = z.string().trim().min(8, 'This secret is too short').max(300);
const Mode = z.enum(['test', 'live']).default('test');
const Scope = z.uuid().nullish();
/** Each gateway's credentials, checked the way its dashboard issues them. */
export const GatewayAccountBody = z.discriminatedUnion('provider', [
  z.object({ provider: z.literal('razorpay'), feeAccountId: Scope, keyId: z.string().trim().regex(/^rzp_(test|live)_[A-Za-z0-9]{6,40}$/, 'Enter a Razorpay key id (rzp_live_… or rzp_test_…)'), keySecret: Secret.optional(), webhookSecret: Secret.optional(), active: z.boolean().optional() }).strict(),
  z.object({ provider: z.literal('payu'), feeAccountId: Scope, mode: Mode, keyId: z.string().trim().regex(/^[A-Za-z0-9]{4,40}$/, 'Enter your PayU merchant key'), keySecret: Secret.optional(), active: z.boolean().optional() }).strict(),
  z.object({ provider: z.literal('cashfree'), feeAccountId: Scope, mode: Mode, keyId: z.string().trim().regex(/^[A-Za-z0-9_-]{6,80}$/, 'Enter your Cashfree app id (x-client-id)'), keySecret: Secret.optional(), active: z.boolean().optional() }).strict(),
  z.object({ provider: z.literal('easebuzz'), feeAccountId: Scope, mode: Mode, keyId: z.string().trim().regex(/^[A-Za-z0-9]{4,40}$/, 'Enter your Easebuzz merchant key'), keySecret: Secret.optional(), accessCode: z.email('Enter the merchant e-mail registered with Easebuzz').max(200).nullish(), active: z.boolean().optional() }).strict(),
  z.object({ provider: z.literal('ccavenue'), feeAccountId: Scope, mode: Mode, keyId: z.string().trim().regex(/^\d{3,15}$/, 'Enter your CCAvenue merchant id (digits)'), keySecret: Secret.optional(), accessCode: z.string().trim().regex(/^[A-Za-z0-9]{8,40}$/, 'Enter your CCAvenue access code'), active: z.boolean().optional() }).strict(),
]);
const ScopeQuery = z.object({ feeAccountId: z.uuid().optional() });

/**
 * Payment gateways per institution and per fee account (Settings → Online payments): Razorpay, PayU, Cashfree,
 * Easebuzz or CCAvenue, each in test (sandbox) or live mode. A fee account without its own uses the institution's
 * default. Secrets go in and never come back; changes are audited without them.
 */
@Controller('v1/admin/payments/gateways')
export class GatewayAccountsController {
  constructor(
    private readonly db: DbService,
    private readonly gateway: PaymentGateway,
  ) {}

  @Get()
  @Auth('user', PAYMENT_ADMIN_ROLES)
  list(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => ({ serverMode: this.gateway.mode, accounts: await this.gateway.list(tx, await this.slug(tx)) }));
  }

  @Put()
  @Auth('user', PAYMENT_ADMIN_ROLES)
  save(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(GatewayAccountBody)) b: z.infer<typeof GatewayAccountBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const scope = b.feeAccountId ?? null;
      if (scope && !(await tx.select({ id: feeAccounts.id }).from(feeAccounts).where(eq(feeAccounts.id, scope)))[0]) throw new NotFoundException('Fee account not found');
      const before = (await this.gateway.list(tx, '')).find((a) => a.feeAccountId === scope);
      const sameAccount = before && before.provider === b.provider && before.keyId === b.keyId;
      if (!b.keySecret && !sameAccount) throw new BadRequestException(KEYS_REQUIRED);
      if (b.provider === 'razorpay' && !before && !b.webhookSecret) throw new BadRequestException(KEYS_REQUIRED);
      // Only Razorpay has a separate webhook secret; the others sign (or encrypt) with the key secret itself.
      const input = b.provider === 'razorpay' ? { ...b, webhookSecret: b.webhookSecret } : { ...b, webhookSecret: b.keySecret };
      const changed = await this.gateway.save(tx, p.tenantId, p.userId, input, scope);
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'payments.gateway_saved', subjectType: scope ? 'fee_account' : 'tenant', subjectId: scope ?? p.tenantId, data: { provider: b.provider, keyId: b.keyId, active: b.active ?? true, ...changed } });
      return (await this.gateway.list(tx, await this.slug(tx))).find((a) => a.feeAccountId === scope);
    });
  }

  @Delete()
  @Auth('user', PAYMENT_ADMIN_ROLES)
  remove(@CurrentPrincipal() p: UserPrincipal, @Query() q: Record<string, string>) {
    const { feeAccountId } = ScopeQuery.parse(q);
    return this.db.withTenant(p.tenantId, async (tx) => {
      const removed = await this.gateway.remove(tx, p.tenantId, feeAccountId ?? null);
      if (removed) await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'payments.gateway_removed', subjectType: feeAccountId ? 'fee_account' : 'tenant', subjectId: feeAccountId ?? p.tenantId });
      return { removed };
    });
  }

  /** "Test connection": a harmless authenticated call to the gateway with the saved credentials. */
  @Post(':scope/test')
  @HttpCode(200)
  @Auth('user', PAYMENT_ADMIN_ROLES)
  async test(@CurrentPrincipal() p: UserPrincipal, @Param('scope') scope: string) {
    const feeAccountId = scope === 'default' ? null : z.uuid().safeParse(scope).success ? scope : undefined;
    if (feeAccountId === undefined) throw new NotFoundException('Not found');
    const keys = await this.db.withTenant(p.tenantId, (tx) => this.gateway.keys(tx, feeAccountId));
    if (!keys) return { ok: false, error: 'PAYMENTS_NOT_CONFIGURED' };
    // The gateway call happens outside the transaction.
    const result = await this.gateway.ping(keys);
    await this.db.withTenant(p.tenantId, (tx) => audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'payments.gateway_tested', subjectType: feeAccountId ? 'fee_account' : 'tenant', subjectId: feeAccountId ?? p.tenantId, data: { provider: keys.provider, keyId: keys.keyId, mode: keys.mode, ...result } }));
    return { ...result, provider: keys.provider, keyId: keys.keyId, mode: keys.mode };
  }

  private async slug(tx: Tx): Promise<string> {
    const [t] = await tx.select({ slug: tenants.slug }).from(tenants);
    return t?.slug ?? '';
  }
}
