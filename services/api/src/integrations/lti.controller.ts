import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, Header, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Query, Req, Res } from '@nestjs/common';
import { createPublicKey, createSign, createVerify, generateKeyPairSync, randomBytes } from 'node:crypto';
import type { Request, Response } from 'express';
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { RoleName, UserPrincipal } from '../auth/principal.js';
import { MfaService } from '../auth/mfa.service.js';
import { userRoleNames } from '../auth/sign-in.js';
import { auditUser, audit } from '../common/audit.js';
import { Clock } from '../common/time.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService, type Tx } from '../db/db.service.js';
import { courses, users } from '../db/schema.js';
import { ltiPlatforms, ltiStates, ltiTools } from '../db/schema-integrations.js';
import { INTEGRATION_ADMIN, call, getSetting, putSetting, sha256 } from './common.js';
import { attrEsc } from './http.js';

const b64 = (b: Buffer | string) => Buffer.from(b).toString('base64url');
const CLAIM = 'https://purl.imsglobal.org/spec/lti/claim/';
const ADMIN = [...INTEGRATION_ADMIN] as RoleName[];

export function signJwt(payload: Record<string, unknown>, privatePem: string, kid: string): string {
  const head = b64(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid }));
  const body = b64(JSON.stringify(payload));
  const sig = createSign('RSA-SHA256').update(`${head}.${body}`).sign(privatePem);
  return `${head}.${body}.${b64(sig)}`;
}

/** Checks an RS256 token against a JWKS and returns its claims (throws with a plain message when anything is off). */
export function verifyJwt(token: string, jwks: { keys: Record<string, unknown>[] }): Record<string, any> {
  const [h, p, s] = token.split('.');
  if (!h || !p || !s) throw new Error('The launch token is malformed');
  const head = JSON.parse(Buffer.from(h, 'base64url').toString());
  if (head.alg !== 'RS256') throw new Error('Only RS256 launch tokens are accepted');
  const candidates = jwks.keys.filter((k) => k.kty === 'RSA' && (!head.kid || k.kid === head.kid));
  for (const jwk of candidates) {
    const ok = createVerify('RSA-SHA256').update(`${h}.${p}`).verify(createPublicKey({ key: jwk as never, format: 'jwk' }), Buffer.from(s, 'base64url'));
    if (ok) return JSON.parse(Buffer.from(p, 'base64url').toString());
  }
  throw new Error('The launch token signature does not match the platform keys');
}

const ToolBody = z.object({ name: z.string().trim().min(1).max(100), clientId: z.string().trim().min(1).max(120), loginUrl: z.url(), launchUrl: z.url(), jwksUrl: z.url().optional(), deploymentId: z.string().trim().min(1).max(60).default('1') });
const PlatformBody = z.object({ name: z.string().trim().min(1).max(100), issuer: z.url(), clientId: z.string().trim().min(1).max(120), authUrl: z.url(), jwksUrl: z.url(), deploymentId: z.string().trim().min(1).max(60).default('1') });

const form = (action: string, fields: Record<string, string>) =>
  `<!doctype html><html><body onload="document.forms[0].submit()"><form method="post" action="${attrEsc(action)}">${Object.entries(fields).map(([k, v]) => `<input type="hidden" name="${attrEsc(k)}" value="${attrEsc(v)}">`).join('')}<noscript><button>Continue</button></noscript></form></body></html>`;

/** LTI 1.3: KINETIX launches external tools (platform side) and its courses can be launched from Moodle and other LMSs (tool side). */
@Controller('v1/lti')
export class LtiController {
  constructor(private readonly db: DbService, private readonly clock: Clock, private readonly mfa: MfaService) {}

  /** The institution's LTI signing key, created on first use. */
  private async keys(tx: Tx, tenantId: string) {
    let k = await getSetting(tx, tenantId, 'lti_keys');
    if (!k.privatePem) {
      const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
      const jwk = publicKey.export({ format: 'jwk' }) as Record<string, string>;
      const kid = sha256(JSON.stringify(jwk)).slice(0, 16);
      k = await putSetting(tx, tenantId, 'lti_keys', { privatePem: privateKey.export({ type: 'pkcs8', format: 'pem' }), kid, jwk: { ...jwk, kid, alg: 'RS256', use: 'sig' } });
    }
    return { privatePem: k.privatePem as string, kid: k.kid as string, jwk: k.jwk as Record<string, string> };
  }

  private issuer(req: Request, tenantId: string) {
    return `${req.protocol}://${req.get('host')}/v1/lti/platform/${tenantId}`;
  }

  @Get('jwks/:tenantId')
  async jwks(@Param('tenantId', ParseUUIDPipe) tenantId: string) {
    return this.db.withTenant(tenantId, async (tx) => ({ keys: [(await this.keys(tx, tenantId)).jwk] }));
  }

  // ---- platform side: launch external tools ------------------------------------------------------

  @Get('tools')
  @Auth('user')
  tools(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, (tx) => tx.select().from(ltiTools).orderBy(ltiTools.name));
  }

  @Post('tools')
  @Auth('user', ADMIN)
  addTool(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(ToolBody)) b: z.infer<typeof ToolBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [dup] = await tx.select({ id: ltiTools.id }).from(ltiTools).where(eq(ltiTools.clientId, b.clientId));
      if (dup) throw new BadRequestException('A tool with that client id is already registered');
      const [row] = await tx.insert(ltiTools).values({ tenantId: p.tenantId, ...b }).returning();
      await auditUser(tx, p, 'lti.tool_added', 'lti_tool', row.id, { name: b.name });
      return row;
    });
  }

  @Delete('tools/:id')
  @HttpCode(204)
  @Auth('user', ADMIN)
  removeTool(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const gone = await tx.delete(ltiTools).where(eq(ltiTools.id, id)).returning({ id: ltiTools.id });
      if (!gone.length) throw new NotFoundException('Tool not found');
      await auditUser(tx, p, 'lti.tool_removed', 'lti_tool', id);
    });
  }

  /** Step 1 of a launch: the fields the browser posts to the tool's login URL (third-party initiated login). */
  @Post('tools/:id/launch')
  @HttpCode(200)
  @Auth('user')
  launchTool(@CurrentPrincipal() p: UserPrincipal, @Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Body() b: { courseId?: string }) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [tool] = await tx.select().from(ltiTools).where(and(eq(ltiTools.id, id), eq(ltiTools.active, true)));
      if (!tool) throw new NotFoundException('Tool not found');
      const hint = randomBytes(18).toString('base64url');
      await tx.insert(ltiStates).values({ tenantId: p.tenantId, kind: 'consumer', state: hint, nonce: '', ref: { toolId: tool.id, userId: p.userId, courseId: b?.courseId ?? null }, expiresAt: new Date(this.clock.now().getTime() + 5 * 60_000) });
      return { method: 'POST', action: tool.loginUrl, fields: { iss: this.issuer(req, p.tenantId), login_hint: p.userId, target_link_uri: tool.launchUrl, lti_message_hint: hint, client_id: tool.clientId, lti_deployment_id: tool.deploymentId } };
    });
  }

  /** Step 2: the tool sends the browser back here (authentication request); it answers with a signed id_token posted to the tool. */
  @Get('platform/:tenantId/auth')
  @Header('content-type', 'text/html; charset=utf-8')
  authGet(@Param('tenantId', ParseUUIDPipe) tenantId: string, @Query() q: Record<string, string>, @Req() req: Request) {
    return this.auth(tenantId, q, req);
  }

  @Post('platform/:tenantId/auth')
  @HttpCode(200)
  @Header('content-type', 'text/html; charset=utf-8')
  authPost(@Param('tenantId', ParseUUIDPipe) tenantId: string, @Body() q: Record<string, string>, @Req() req: Request) {
    return this.auth(tenantId, q, req);
  }

  private auth(tenantId: string, q: Record<string, string>, req: Request) {
    if (q.response_type !== 'id_token' || !q.nonce || !q.state || !q.redirect_uri || !q.lti_message_hint || !q.client_id) throw new BadRequestException('Incomplete authentication request');
    return this.db.withTenant(tenantId, async (tx) => {
      const [st] = await tx.select().from(ltiStates).where(and(eq(ltiStates.state, q.lti_message_hint), eq(ltiStates.kind, 'consumer')));
      if (!st || st.usedAt || st.expiresAt < this.clock.now()) throw new ForbiddenException('This launch has expired. Start it again');
      const ref = st.ref as { toolId: string; userId: string; courseId: string | null };
      const [tool] = await tx.select().from(ltiTools).where(eq(ltiTools.id, ref.toolId));
      if (!tool || tool.clientId !== q.client_id || q.redirect_uri !== tool.launchUrl) throw new ForbiddenException('The tool or redirect address does not match its registration');
      await tx.update(ltiStates).set({ usedAt: this.clock.now() }).where(eq(ltiStates.id, st.id));
      const [u] = await tx.select({ id: users.id, fullName: users.fullName, email: users.email }).from(users).where(eq(users.id, ref.userId));
      if (!u) throw new NotFoundException('User not found');
      const roles = await userRoleNames(tx, u.id);
      const [course] = ref.courseId ? await tx.select({ id: courses.id, title: courses.title }).from(courses).where(eq(courses.id, ref.courseId)) : [];
      const k = await this.keys(tx, tenantId);
      const now = Math.floor(this.clock.now().getTime() / 1000);
      const token = signJwt({
        iss: this.issuer(req, tenantId), aud: tool.clientId, sub: u.id, iat: now, exp: now + 300, nonce: q.nonce, name: u.fullName, email: u.email,
        [`${CLAIM}message_type`]: 'LtiResourceLinkRequest', [`${CLAIM}version`]: '1.3.0', [`${CLAIM}deployment_id`]: tool.deploymentId, [`${CLAIM}target_link_uri`]: tool.launchUrl,
        [`${CLAIM}resource_link`]: { id: ref.courseId ?? tool.id, title: course?.title ?? tool.name },
        [`${CLAIM}roles`]: roles.some((r) => ['teacher', 'hod', 'principal', 'tenant_admin'].includes(r)) ? ['http://purl.imsglobal.org/vocab/lis/v2/membership#Instructor'] : ['http://purl.imsglobal.org/vocab/lis/v2/membership#Learner'],
        ...(course ? { [`${CLAIM}context`]: { id: course.id, title: course.title, type: ['http://purl.imsglobal.org/vocab/lis/v2/course#CourseOffering'] } } : {}),
      }, k.privatePem, k.kid);
      await audit(tx, { tenantId, actorType: 'user', actorId: u.id, action: 'lti.tool_launched', subjectType: 'lti_tool', subjectId: tool.id });
      return form(tool.launchUrl, { id_token: token, state: q.state });
    });
  }

  // ---- tool side: KINETIX launched from Moodle and other LMSs ---------------------------------------

  @Get('platforms')
  @Auth('user', ADMIN)
  platforms(@CurrentPrincipal() p: UserPrincipal, @Req() req: Request) {
    return this.db.withTenant(p.tenantId, async (tx) => ({
      loginUrl: `${req.protocol}://${req.get('host')}/v1/lti/provider/${p.tenantId}/login`,
      launchUrl: `${req.protocol}://${req.get('host')}/v1/lti/provider/${p.tenantId}/launch`,
      jwksUrl: `${req.protocol}://${req.get('host')}/v1/lti/jwks/${p.tenantId}`,
      platforms: await tx.select().from(ltiPlatforms).orderBy(desc(ltiPlatforms.createdAt)),
    }));
  }

  @Post('platforms')
  @Auth('user', ADMIN)
  addPlatform(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(PlatformBody)) b: z.infer<typeof PlatformBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [dup] = await tx.select({ id: ltiPlatforms.id }).from(ltiPlatforms).where(and(eq(ltiPlatforms.issuer, b.issuer), eq(ltiPlatforms.clientId, b.clientId)));
      if (dup) throw new BadRequestException('That platform is already registered');
      const [row] = await tx.insert(ltiPlatforms).values({ tenantId: p.tenantId, ...b }).returning();
      await auditUser(tx, p, 'lti.platform_added', 'lti_platform', row.id, { issuer: b.issuer });
      return row;
    });
  }

  @Delete('platforms/:id')
  @HttpCode(204)
  @Auth('user', ADMIN)
  removePlatform(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const gone = await tx.delete(ltiPlatforms).where(eq(ltiPlatforms.id, id)).returning({ id: ltiPlatforms.id });
      if (!gone.length) throw new NotFoundException('Platform not found');
      await auditUser(tx, p, 'lti.platform_removed', 'lti_platform', id);
    });
  }

  /** OIDC login initiation from the LMS: remember a nonce and send the browser to the platform's authorisation URL. */
  @Get('provider/:tenantId/login')
  loginGet(@Param('tenantId', ParseUUIDPipe) tenantId: string, @Query() q: Record<string, string>, @Req() req: Request, @Res() res: Response) {
    return this.login(tenantId, q, req, res);
  }

  @Post('provider/:tenantId/login')
  @HttpCode(302)
  loginPost(@Param('tenantId', ParseUUIDPipe) tenantId: string, @Body() q: Record<string, string>, @Req() req: Request, @Res() res: Response) {
    return this.login(tenantId, q, req, res);
  }

  private async login(tenantId: string, q: Record<string, string>, req: Request, res: Response) {
    if (!q.iss || !q.login_hint || !q.client_id) throw new BadRequestException('Incomplete login request');
    const url = await this.db.withTenant(tenantId, async (tx) => {
      const [pl] = await tx.select().from(ltiPlatforms).where(and(eq(ltiPlatforms.issuer, q.iss), eq(ltiPlatforms.clientId, q.client_id), eq(ltiPlatforms.active, true)));
      if (!pl) throw new ForbiddenException('This platform is not registered');
      const state = randomBytes(18).toString('base64url');
      const nonce = randomBytes(18).toString('base64url');
      await tx.insert(ltiStates).values({ tenantId, kind: 'provider', state, nonce, ref: { platformId: pl.id, targetLinkUri: q.target_link_uri ?? null }, expiresAt: new Date(this.clock.now().getTime() + 10 * 60_000) });
      const u = new URL(pl.authUrl);
      const params: Record<string, string> = { scope: 'openid', response_type: 'id_token', client_id: pl.clientId, redirect_uri: `${req.protocol}://${req.get('host')}/v1/lti/provider/${tenantId}/launch`, login_hint: q.login_hint, state, response_mode: 'form_post', nonce, prompt: 'none', ...(q.lti_message_hint ? { lti_message_hint: q.lti_message_hint } : {}) };
      for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
      return u.toString();
    });
    res.redirect(302, url);
  }

  /** The LMS posts the signed launch here. A valid launch of a known user becomes a one-time ticket for the web app. */
  @Post('provider/:tenantId/launch')
  @HttpCode(200)
  async launch(@Param('tenantId', ParseUUIDPipe) tenantId: string, @Body() b: { id_token?: string; state?: string }, @Res() res: Response) {
    if (!b?.id_token || !b.state) throw new BadRequestException('A launch needs an id_token and state');
    const landing = await this.db.withTenant(tenantId, async (tx) => {
      const [st] = await tx.select().from(ltiStates).where(and(eq(ltiStates.state, b.state!), eq(ltiStates.kind, 'provider')));
      if (!st || st.usedAt || st.expiresAt < this.clock.now()) throw new ForbiddenException('This launch has expired or was already used');
      await tx.update(ltiStates).set({ usedAt: this.clock.now() }).where(eq(ltiStates.id, st.id));
      const [pl] = await tx.select().from(ltiPlatforms).where(eq(ltiPlatforms.id, (st.ref as { platformId: string }).platformId));
      if (!pl) throw new ForbiddenException('This platform is no longer registered');
      const jwks = await call(pl.jwksUrl);
      if (!jwks.ok || !Array.isArray(jwks.body?.keys)) throw new ForbiddenException('The platform keys could not be fetched');
      let c: Record<string, any>;
      try {
        c = verifyJwt(b.id_token!, jwks.body);
      } catch (e) {
        throw new ForbiddenException((e as Error).message);
      }
      const aud = Array.isArray(c.aud) ? c.aud : [c.aud];
      const nowS = this.clock.now().getTime() / 1000;
      if (c.iss !== pl.issuer || !aud.includes(pl.clientId)) throw new ForbiddenException('The launch is not for this tool');
      if (c.nonce !== st.nonce) throw new ForbiddenException('The launch nonce does not match');
      if (typeof c.exp !== 'number' || c.exp < nowS - 60) throw new ForbiddenException('The launch token has expired');
      if (c[`${CLAIM}deployment_id`] !== pl.deploymentId) throw new ForbiddenException('Unknown deployment');
      if (c[`${CLAIM}message_type`] !== 'LtiResourceLinkRequest') throw new ForbiddenException('Only resource link launches are supported');
      const email = typeof c.email === 'string' ? c.email.toLowerCase() : '';
      const [user] = email ? await tx.select().from(users).where(eq(users.email, email)) : [];
      if (!user || user.status !== 'active') throw new ForbiddenException('No KINETIX account matches this person. Ask the institution to add their email');
      const custom = (c[`${CLAIM}custom`] ?? {}) as Record<string, string>;
      const wanted = custom.kinetix_course ?? c[`${CLAIM}context`]?.label ?? '';
      const [course] = wanted ? await tx.select({ id: courses.id }).from(courses).where(/^[0-9a-f-]{36}$/.test(wanted) ? eq(courses.id, wanted) : eq(courses.code, wanted)) : [];
      const ticket = randomBytes(24).toString('base64url');
      await tx.insert(ltiStates).values({ tenantId, kind: 'ticket', state: sha256(ticket), nonce: '', ref: { userId: user.id, courseId: course?.id ?? null }, expiresAt: new Date(this.clock.now().getTime() + 60_000) });
      await audit(tx, { tenantId, actorType: 'user', actorId: user.id, action: 'lti.provider_launch', subjectType: 'lti_platform', subjectId: pl.id, data: { courseId: course?.id ?? null } });
      const base = (await getSetting(tx, tenantId, 'lti', { landingUrl: process.env.LTI_LANDING_URL })).landingUrl ?? '/lti/enter';
      return `${base}${base.includes('?') ? '&' : '?'}ticket=${ticket}&tenant=${tenantId}${course ? `&course=${course.id}` : ''}`;
    });
    res.redirect(302, landing);
  }

  /** Swaps the one-time ticket for a normal sign-in (the web app does this on its landing page). */
  @Post('provider/:tenantId/exchange')
  @HttpCode(200)
  exchange(@Param('tenantId', ParseUUIDPipe) tenantId: string, @Body() b: { ticket?: string }, @Req() req: Request) {
    if (!b?.ticket) throw new BadRequestException('A ticket is required');
    return this.db.withTenant(tenantId, async (tx) => {
      const [st] = await tx.select().from(ltiStates).where(and(eq(ltiStates.state, sha256(b.ticket!)), eq(ltiStates.kind, 'ticket')));
      if (!st || st.usedAt || st.expiresAt < this.clock.now()) throw new ForbiddenException('This sign-in link has expired');
      await tx.update(ltiStates).set({ usedAt: this.clock.now() }).where(eq(ltiStates.id, st.id));
      const ref = st.ref as { userId: string; courseId: string | null };
      const [user] = await tx.select().from(users).where(eq(users.id, ref.userId));
      const roles = await userRoleNames(tx, user.id);
      const session = await this.mfa.issue(tx, tenantId, user, roles, 'otp', { ip: req.ip, userAgent: req.get('user-agent') ?? undefined, deviceName: 'LTI launch' }, false, false);
      return { ...session, courseId: ref.courseId };
    });
  }
}
