import { BadRequestException, Body, ConflictException, Controller, Delete, Get, Headers, Inject, Injectable, Ip, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Query, Req, Res, UnauthorizedException } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import { createHash, randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import { MfaService } from '../auth/mfa.service.js';
import type { UserPrincipal } from '../auth/principal.js';
import { audit } from '../common/audit.js';
import { SecretBox } from '../common/secret-box.js';
import { Clock } from '../common/time.js';
import { ZodBody } from '../common/zod-body.js';
import { ENV, type Env } from '../config/env.js';
import { assertSafeUrl } from '../connectors/safe-url.js';
import { DbService } from '../db/db.service.js';
import { ssoIdentities, ssoLoginTickets, ssoProviders, tenants, users } from '../db/schema.js';
import { authorizationUrl, claimEmail, newNonce, newPkce, presetEndpoints, verifyIdToken } from './oidc.js';

const ADMIN: ('tenant_admin' | 'principal')[] = ['tenant_admin', 'principal'];
const aad = (tenantId: string) => `${tenantId}:sso.client_secret`;
const domain = z.string().trim().toLowerCase().regex(/^[a-z0-9.-]+\.[a-z]{2,}$/, 'Enter a domain like college.edu');
const redirect = z.string().trim().min(3).max(300);

const ProviderBody = z.object({
  kind: z.enum(['google', 'microsoft', 'generic']),
  name: z.string().trim().min(2).max(80),
  clientId: z.string().trim().min(3).max(300),
  clientSecret: z.string().trim().min(3).max(500).optional(),
  /** Microsoft Entra directory (tenant) id; empty accepts any work or school directory. */
  directoryId: z.string().trim().max(100).optional(),
  issuer: z.url().optional(),
  authorizationEndpoint: z.url().optional(),
  tokenEndpoint: z.url().optional(),
  jwksUri: z.url().optional(),
  scopes: z.string().trim().max(200).default('openid email profile'),
  allowedDomains: z.array(domain).min(1, 'Add at least one email domain').max(20),
  /** Where the browser may be sent after sign-in: the ERP callback, or an app's own scheme (kinetix://sso). */
  redirectAllowlist: z.array(redirect).min(1, 'Add at least one return address').max(20),
  enabled: z.boolean().default(true),
});
const StartBody = z.object({ tenant: z.string().trim().toLowerCase().max(64).optional(), email: z.email().optional(), providerId: z.uuid().optional(), redirectUri: redirect.optional(), /** A random id the app makes: the sign-in completes in the system browser and the app collects it by polling `exchange` with this as the ticket (no deep link needed). */ pollId: z.uuid().optional() }).refine((b) => b.redirectUri || b.pollId, 'Give a return address or a poll id');
const ExchangeBody = z.object({ tenant: z.string().trim().toLowerCase().min(1).max(64), ticket: z.uuid() });

interface StatePayload { pid: string; tid: string; v: string; n: string; ru: string; poll?: string; exp: number }

/** OpenID Connect sign-in (authorization code + PKCE) for Google Workspace, Microsoft Entra and any other provider. */
@Injectable()
export class SsoService {
  readonly box: SecretBox;
  constructor(
    @Inject(ENV) readonly env: Env,
    readonly db: DbService,
    readonly clock: Clock,
  ) {
    this.box = SecretBox.fromEnv(env) ?? new SecretBox({ 1: createHash('sha256').update(`kinetix-sso:${env.JWT_SECRET}`).digest() }, 1);
  }

  /** Which institution's provider an address belongs to: the domain is claimed by exactly one institution. */
  async byDomain(email: string) {
    const d = email.split('@')[1]?.toLowerCase();
    if (!d) return undefined;
    const rows = await this.db.system.select().from(ssoProviders).where(and(eq(ssoProviders.enabled, true), sql`${d} = any(${ssoProviders.allowedDomains})`));
    return rows.length === 1 ? rows[0] : undefined;
  }

  seal(p: StatePayload): string {
    return this.box.encrypt(JSON.stringify(p), 'sso.state');
  }
  open(state: string): StatePayload | null {
    try {
      const p = JSON.parse(this.box.decrypt(state, 'sso.state')) as StatePayload;
      return p.exp > this.clock.now().getTime() ? p : null;
    } catch {
      return null;
    }
  }
}

/** Is `uri` one of the addresses the administrator allowed? Custom schemes match by prefix, web addresses exactly. */
export const redirectAllowed = (uri: string, allow: string[]) => allow.some((a) => (/^https?:\/\//i.test(a) ? uri === a : uri === a || uri.startsWith(a.endsWith('/') ? a : `${a}/`) || uri.startsWith(`${a}?`)));

const redirectBase = (env: Env, req: Request) => (env.API_PUBLIC_URL ?? `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');

/** The public sign-in endpoints. */
@Controller('v1/auth/sso')
export class SsoAuthController {
  constructor(
    private readonly sso: SsoService,
    private readonly mfa: MfaService,
  ) {}

  /** The sign-in buttons for an institution (its slug). */
  @Get('providers')
  async providers(@Query('tenant') slug?: string) {
    if (!slug || !/^[a-z0-9-]{1,64}$/.test(slug)) return [];
    const [t] = await this.sso.db.system.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, slug));
    if (!t) return [];
    return this.sso.db.withTenant(t.id, (tx) => tx.select({ id: ssoProviders.id, kind: ssoProviders.kind, name: ssoProviders.name }).from(ssoProviders).where(eq(ssoProviders.enabled, true)));
  }

  /** Starts a sign-in and returns the provider's address to open in the system browser. */
  @Post('start')
  async start(@Body(new ZodBody(StartBody)) b: z.infer<typeof StartBody>, @Req() req: Request) {
    let provider: typeof ssoProviders.$inferSelect | undefined;
    if (b.email) provider = await this.sso.byDomain(b.email);
    else if (b.tenant) {
      const [t] = await this.sso.db.system.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, b.tenant));
      if (t) {
        const all = await this.sso.db.withTenant(t.id, (tx) => tx.select().from(ssoProviders).where(eq(ssoProviders.enabled, true)));
        provider = b.providerId ? all.find((x) => x.id === b.providerId) : all.length === 1 ? all[0] : undefined;
      }
    }
    if (!provider) throw new NotFoundException('No single-sign-on is set up for that address');
    if (b.redirectUri && !redirectAllowed(b.redirectUri, provider.redirectAllowlist)) throw new BadRequestException('That return address is not allowed');
    const pkce = newPkce();
    const nonce = newNonce();
    const state = this.sso.seal({ pid: provider.id, tid: provider.tenantId, v: pkce.verifier, n: nonce, ru: b.redirectUri ?? '', poll: b.pollId, exp: this.sso.clock.now().getTime() + 10 * 60_000 });
    const hd = provider.kind === 'google' && provider.allowedDomains.length === 1 ? provider.allowedDomains[0] : undefined;
    return {
      providerId: provider.id,
      authorizationUrl: authorizationUrl({ endpoint: provider.authorizationEndpoint, clientId: provider.clientId, redirectUri: `${redirectBase(this.sso.env, req)}/v1/auth/sso/callback`, scopes: provider.scopes, state, nonce, challenge: pkce.challenge, loginHint: b.email, hostedDomain: hd }),
    };
  }

  /** The provider sends the browser here; the API signs the person in and hands the app a one-time ticket. */
  @Get('callback')
  async callback(@Query('code') code: string | undefined, @Query('state') state: string | undefined, @Query('error') error: string | undefined, @Req() req: Request, @Res() res: Response) {
    const st = state ? this.sso.open(state) : null;
    if (!st) return res.status(400).type('text/plain').send('This sign-in link has expired. Start again from the app.');
    const back = (q: Record<string, string>) => {
      if (st.poll) return res.status(200).type('text/html').send(q.error ? '<p>Sign-in did not work. Return to the app and try again.</p>' : '<p>Signed in. You can close this page and return to the app.</p>');
      const u = new URL(st.ru);
      for (const [k, v] of Object.entries(q)) u.searchParams.set(k, v);
      return res.redirect(302, u.toString());
    };
    if (error || !code) return back({ error: 'denied' });
    try {
      const loaded = await this.sso.db.withTenant(st.tid, async (tx) => {
        const [p] = await tx.select().from(ssoProviders).where(eq(ssoProviders.id, st.pid));
        const [t] = await tx.select({ slug: tenants.slug }).from(tenants);
        return p && p.enabled ? { p, slug: t?.slug ?? '' } : null;
      });
      if (!loaded) return back({ error: 'provider' });
      const { p, slug } = loaded;
      const secret = this.sso.box.decrypt(p.clientSecretEnc, aad(p.tenantId));
      assertSafeUrl(p.tokenEndpoint);
      const tok = await fetch(p.tokenEndpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
        body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: `${redirectBase(this.sso.env, req)}/v1/auth/sso/callback`, client_id: p.clientId, client_secret: secret, code_verifier: st.v }),
        signal: AbortSignal.timeout(15_000),
      });
      const body = (await tok.json().catch(() => ({}))) as { id_token?: string };
      if (!tok.ok || !body.id_token) return back({ error: 'token' });
      const claims = await verifyIdToken(body.id_token, { jwksUri: p.jwksUri, issuer: p.issuer, clientId: p.clientId, nonce: st.n, now: this.sso.clock.now() });
      const email = claimEmail(claims);
      if (!email || !p.allowedDomains.includes(email.split('@')[1])) return back({ error: 'domain' });
      const ticket = await this.sso.db.withTenant(p.tenantId, async (tx) => {
        let [ident] = await tx.select().from(ssoIdentities).where(and(eq(ssoIdentities.providerId, p.id), eq(ssoIdentities.subject, claims.sub)));
        let userId = ident?.userId;
        if (!userId) {
          // Just-in-time link: the first time, the provider's verified address finds the existing KINETIX user.
          const [u] = await tx.select({ id: users.id, status: users.status }).from(users).where(sql`lower(${users.email}) = ${email}`);
          if (!u || u.status !== 'active') {
            await audit(tx, { tenantId: p.tenantId, actorType: 'system', action: 'auth.sso_no_account', subjectType: 'sso_provider', subjectId: p.id, data: { email } });
            return null;
          }
          [ident] = await tx.insert(ssoIdentities).values({ tenantId: p.tenantId, providerId: p.id, userId: u.id, subject: claims.sub, email }).returning();
          userId = u.id;
          await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: u.id, action: 'auth.sso_linked', subjectType: 'user', subjectId: u.id, data: { provider: p.name, email } });
        }
        const [u2] = await tx.select({ status: users.status }).from(users).where(eq(users.id, userId));
        if (u2?.status !== 'active') return null;
        const [row] = await tx.insert(ssoLoginTickets).values({ ...(st.poll ? { id: st.poll } : {}), tenantId: p.tenantId, userId, expiresAt: new Date(this.sso.clock.now().getTime() + 2 * 60_000) }).returning({ id: ssoLoginTickets.id });
        return row.id;
      });
      if (!ticket) return back({ error: 'no_account' });
      return back({ ticket, tenant: slug });
    } catch {
      return back({ error: 'failed' });
    }
  }

  /** The app trades the ticket for a session (same answer as password sign-in, so two-step verification still applies). */
  @Post('exchange')
  async exchange(@Body(new ZodBody(ExchangeBody)) b: z.infer<typeof ExchangeBody>, @Ip() ip: string, @Headers('user-agent') userAgent?: string, @Headers('x-device-name') deviceName?: string) {
    const [t] = await this.sso.db.system.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, b.tenant));
    const fail = new UnauthorizedException('This sign-in has expired. Start again.');
    if (!t) throw fail;
    return this.sso.db.withTenant(t.id, async (tx) => {
      const [tk] = await tx.select().from(ssoLoginTickets).where(eq(ssoLoginTickets.id, b.ticket)).for('update');
      if (!tk || tk.usedAt || tk.expiresAt.getTime() < this.sso.clock.now().getTime()) throw fail;
      await tx.update(ssoLoginTickets).set({ usedAt: this.sso.clock.now() }).where(eq(ssoLoginTickets.id, tk.id));
      const [user] = await tx.select().from(users).where(eq(users.id, tk.userId));
      if (!user || user.status !== 'active') throw fail;
      await audit(tx, { tenantId: t.id, actorType: 'user', actorId: user.id, action: 'auth.sso_sign_in', subjectType: 'user', subjectId: user.id });
      return this.mfa.signIn(tx, t.id, user, 'otp', { ip, userAgent, deviceName });
    });
  }
}

/** The institution's administrator sets up its identity providers. */
@Controller('v1/admin/sso/providers')
export class SsoAdminController {
  constructor(private readonly sso: SsoService) {}

  private view(r: typeof ssoProviders.$inferSelect) {
    const { clientSecretEnc, ...rest } = r;
    return { ...rest, hasSecret: !!clientSecretEnc };
  }

  @Get()
  @Auth('user', ADMIN)
  list(@CurrentPrincipal() p: UserPrincipal) {
    return this.sso.db.withTenant(p.tenantId, async (tx) => (await tx.select().from(ssoProviders)).map((r) => this.view(r)));
  }

  @Post()
  @Auth('user', ADMIN)
  async create(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(ProviderBody)) b: z.infer<typeof ProviderBody>) {
    if (!b.clientSecret) throw new BadRequestException('Enter the client secret');
    const ep = await this.endpoints(b);
    await this.assertDomainsFree(p.tenantId, b.allowedDomains, undefined);
    return this.sso.db.withTenant(p.tenantId, async (tx) => {
      const [row] = await tx
        .insert(ssoProviders)
        .values({ tenantId: p.tenantId, kind: b.kind, name: b.name, issuer: ep.issuer, clientId: b.clientId, clientSecretEnc: this.sso.box.encrypt(b.clientSecret!, aad(p.tenantId)), authorizationEndpoint: ep.authorizationEndpoint, tokenEndpoint: ep.tokenEndpoint, jwksUri: ep.jwksUri, scopes: b.scopes, allowedDomains: b.allowedDomains, redirectAllowlist: b.redirectAllowlist, enabled: b.enabled })
        .returning();
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'sso.provider_added', subjectType: 'sso_provider', subjectId: row.id, data: { kind: b.kind, domains: b.allowedDomains } });
      return this.view(row);
    });
  }

  @Patch(':id')
  @Auth('user', ADMIN)
  async update(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(ProviderBody.partial())) b: Partial<z.infer<typeof ProviderBody>>) {
    if (b.allowedDomains) await this.assertDomainsFree(p.tenantId, b.allowedDomains, id);
    return this.sso.db.withTenant(p.tenantId, async (tx) => {
      const [cur] = await tx.select().from(ssoProviders).where(eq(ssoProviders.id, id));
      if (!cur) throw new NotFoundException('Provider not found');
      const set: Partial<typeof ssoProviders.$inferInsert> = {};
      if (b.name) set.name = b.name;
      if (b.clientId) set.clientId = b.clientId;
      if (b.clientSecret) set.clientSecretEnc = this.sso.box.encrypt(b.clientSecret, aad(p.tenantId));
      if (b.scopes) set.scopes = b.scopes;
      if (b.allowedDomains) set.allowedDomains = b.allowedDomains;
      if (b.redirectAllowlist) set.redirectAllowlist = b.redirectAllowlist;
      if (b.enabled !== undefined) set.enabled = b.enabled;
      if (b.issuer || b.authorizationEndpoint || b.tokenEndpoint || b.jwksUri || b.directoryId !== undefined) {
        const ep = await this.endpoints({ kind: cur.kind as 'google' | 'microsoft' | 'generic', issuer: b.issuer ?? cur.issuer, authorizationEndpoint: b.authorizationEndpoint ?? cur.authorizationEndpoint, tokenEndpoint: b.tokenEndpoint ?? cur.tokenEndpoint, jwksUri: b.jwksUri ?? cur.jwksUri, directoryId: b.directoryId });
        Object.assign(set, { issuer: ep.issuer, authorizationEndpoint: ep.authorizationEndpoint, tokenEndpoint: ep.tokenEndpoint, jwksUri: ep.jwksUri });
      }
      const [row] = Object.keys(set).length ? await tx.update(ssoProviders).set(set).where(eq(ssoProviders.id, id)).returning() : [cur];
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'sso.provider_updated', subjectType: 'sso_provider', subjectId: id, data: { fields: Object.keys(set).filter((k) => k !== 'clientSecretEnc') } });
      return this.view(row);
    });
  }

  @Delete(':id')
  @Auth('user', ADMIN)
  remove(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.sso.db.withTenant(p.tenantId, async (tx) => {
      const gone = await tx.delete(ssoProviders).where(eq(ssoProviders.id, id)).returning({ id: ssoProviders.id });
      if (!gone.length) throw new NotFoundException('Provider not found');
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'sso.provider_removed', subjectType: 'sso_provider', subjectId: id });
      return { removed: true };
    });
  }

  /** A domain can belong to one institution only, or sign-in could not tell where a person belongs. */
  private async assertDomainsFree(tenantId: string, domains: string[], exceptId: string | undefined) {
    const rows = await this.sso.db.system.select({ id: ssoProviders.id, tenantId: ssoProviders.tenantId, d: ssoProviders.allowedDomains }).from(ssoProviders);
    const clash = rows.find((r) => r.id !== exceptId && r.tenantId !== tenantId && r.d.some((x) => domains.includes(x)));
    if (clash) throw new ConflictException('Another institution already uses one of those email domains');
  }

  /** Google and Microsoft come from presets; any other provider gives its endpoints, or its issuer for discovery. */
  private async endpoints(b: { kind: 'google' | 'microsoft' | 'generic'; directoryId?: string; issuer?: string; authorizationEndpoint?: string; tokenEndpoint?: string; jwksUri?: string }) {
    if (b.kind !== 'generic') {
      const ep = presetEndpoints(b.kind, b.directoryId);
      return { issuer: b.issuer ?? ep.issuer, authorizationEndpoint: b.authorizationEndpoint ?? ep.authorizationEndpoint, tokenEndpoint: b.tokenEndpoint ?? ep.tokenEndpoint, jwksUri: b.jwksUri ?? ep.jwksUri };
    }
    if (!b.issuer) throw new BadRequestException('Enter the issuer address');
    assertSafeUrl(b.issuer);
    let { authorizationEndpoint, tokenEndpoint, jwksUri } = b;
    if (!authorizationEndpoint || !tokenEndpoint || !jwksUri) {
      const res = await fetch(`${b.issuer.replace(/\/$/, '')}/.well-known/openid-configuration`, { signal: AbortSignal.timeout(10_000) }).catch(() => null);
      if (!res?.ok) throw new BadRequestException('Could not read the provider settings; enter the endpoints by hand');
      const d = (await res.json()) as { authorization_endpoint?: string; token_endpoint?: string; jwks_uri?: string };
      authorizationEndpoint ??= d.authorization_endpoint;
      tokenEndpoint ??= d.token_endpoint;
      jwksUri ??= d.jwks_uri;
    }
    if (!authorizationEndpoint || !tokenEndpoint || !jwksUri) throw new BadRequestException('The provider settings are incomplete');
    for (const u of [authorizationEndpoint, tokenEndpoint, jwksUri]) assertSafeUrl(u);
    return { issuer: b.issuer, authorizationEndpoint, tokenEndpoint, jwksUri };
  }
}

void randomUUID;
