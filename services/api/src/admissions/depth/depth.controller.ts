import { Body, Controller, Delete, Get, Headers, HttpCode, Ip, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Put, Query, Req, Res, type RawBodyRequest } from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import type { Request, Response } from 'express';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../../auth/auth.decorators.js';
import type { UserPrincipal } from '../../auth/principal.js';
import { RateLimiter } from '../../common/rate-limiter.js';
import { ZodBody } from '../../common/zod-body.js';
import { Day } from '../../common/zod-fields.js';
import { DbService, type Tx } from '../../db/db.service.js';
import { applications } from '../../db/schema.js';
import { SystemLookups } from '../../db/system-lookups.service.js';
import { ADMISSIONS_ROLES } from '../admissions.controller.js';
import { AdmissionsService, hashToken } from '../admissions.service.js';
import { DepthService } from './depth.service.js';
import { INDEX_PRESETS } from './index-mark.js';
import { LeadsService } from './leads.service.js';

const Paise = z.number().int().min(0).max(1_000_000_000);
const FormulaBody = z.object({
  preset: z.enum(Object.keys(INDEX_PRESETS) as [string, ...string[]]).optional(),
  spec: z
    .object({
      preset: z.string().max(40).default('custom'),
      components: z.array(z.object({ key: z.string().regex(/^[a-z0-9_]{1,40}$/), label: z.string().min(1).max(80), max: z.number().positive().max(10000), weight: z.number().min(0).max(10000) })).max(12),
      bestOf: z.object({ keys: z.array(z.string().regex(/^[a-z0-9_]{1,40}$/)).min(1).max(12), count: z.number().int().min(1).max(12), max: z.number().positive().max(10000), weight: z.number().min(0).max(10000) }).optional(),
      bonusKeys: z.array(z.string().regex(/^[a-z0-9_]{1,40}$/)).max(8).optional(),
      bonusCap: z.number().min(0).max(1000).optional(),
      tieBreak: z.array(z.string().regex(/^[a-z0-9_]{1,40}$/)).max(8).default([]),
    })
    .optional(),
});
const MarksBody = z.object({ marks: z.record(z.string().regex(/^[a-z0-9_]{1,40}$/), z.number().min(0).max(100000)) });
const BulkMarksBody = z.object({ rows: z.array(z.object({ applicationId: z.uuid(), marks: MarksBody.shape.marks })).min(1).max(500) });
const MatrixBody = z.object({
  rows: z.array(z.object({ option: z.string().trim().min(1).max(120), category: z.string().trim().min(1).max(40), seats: z.number().int().min(0).max(5000) })).max(300).optional(),
  generate: z.array(z.object({ label: z.string().trim().min(1).max(120), seats: z.number().int().min(1).max(5000) })).min(1).max(100).optional(),
}).refine((b) => !!b.rows !== !!b.generate, 'Give either rows or generate');
const PrefsBody = z.object({ options: z.array(z.string().trim().min(1).max(120)).min(1).max(40) });
const RespondBody = z.object({ response: z.enum(['freeze', 'float', 'slide', 'reject']) });
const RuleBody = z.object({
  agentId: z.uuid().nullable().default(null),
  programId: z.uuid().nullable().default(null),
  kind: z.enum(['flat', 'percent', 'slab']),
  flatPaise: Paise.default(0),
  percentBps: z.number().int().min(0).max(10000).default(0),
  basePaise: Paise.default(0),
  slabs: z.array(z.object({ upTo: z.number().int().min(1).max(100000).nullable(), paise: Paise })).max(12).default([]),
  tdsBps: z.number().int().min(0).max(5000).default(0),
});
const PayoutBody = z.object({ commissionIds: z.array(z.uuid()).min(1).max(200), paidOn: Day, reference: z.string().trim().max(120).nullable().optional(), tdsBps: z.number().int().min(0).max(5000).optional() });
const ConnectorBody = z.object({ kind: z.enum(['meta', 'google', 'website']), name: z.string().trim().min(2).max(80), secret: z.string().trim().min(8).max(200).optional(), programId: z.uuid().nullable().optional(), campaignId: z.uuid().nullable().optional() });
const ConnectorPatch = z.object({ active: z.boolean().optional(), programId: z.uuid().nullable().optional(), campaignId: z.uuid().nullable().optional(), rotateSecret: z.boolean().optional() });
const SpendBody = z.object({ rows: z.array(z.object({ channel: z.string().trim().min(2).max(40), day: Day, spendPaise: Paise, impressions: z.number().int().min(0).optional(), clicks: z.number().int().min(0).optional() })).min(1).max(400) });

const day = (v?: string) => (v && Day.safeParse(v).success ? v : undefined);

/** Admission depth for staff: index marks, rank lists, seat matrix, CAP rounds, agent rules and payouts, lead connectors and the source ROI report. */
@Controller('v1/admissions')
export class DepthController {
  constructor(
    private readonly db: DbService,
    private readonly depth: DepthService,
    private readonly leads: LeadsService,
  ) {}

  private actor = (p: UserPrincipal) => ({ tenantId: p.tenantId, userId: p.userId });

  // ---- index marks and rank lists ----------------------------------------------------------------

  @Get('index-presets')
  @Auth('user', ADMISSIONS_ROLES)
  presets() {
    return Object.entries(INDEX_PRESETS).map(([key, v]) => ({ key, label: v.label, formula: v.formula }));
  }

  @Get('cycles/:id/index-formula')
  @Auth('user', ADMISSIONS_ROLES)
  formula(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => ({ cycleId: id, formula: await this.depth.formula(tx, id) }));
  }

  @Put('cycles/:id/index-formula')
  @Auth('user', ADMISSIONS_ROLES)
  setFormula(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(FormulaBody)) body: z.infer<typeof FormulaBody>) {
    return this.db.withTenant(p.tenantId, (tx) => this.depth.setFormula(tx, this.actor(p), id, { preset: body.preset, spec: body.spec as never }));
  }

  @Put('applications/:id/index-marks')
  @Auth('user', ADMISSIONS_ROLES)
  setMarks(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(MarksBody)) body: z.infer<typeof MarksBody>) {
    return this.db.withTenant(p.tenantId, (tx) => this.depth.setMarks(tx, this.actor(p), id, body.marks));
  }

  @Post('index-marks/bulk')
  @HttpCode(200)
  @Auth('user', ADMISSIONS_ROLES)
  bulkMarks(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(BulkMarksBody)) body: z.infer<typeof BulkMarksBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      let saved = 0;
      for (const r of body.rows) {
        await this.depth.setMarks(tx, this.actor(p), r.applicationId, r.marks);
        saved++;
      }
      return { saved };
    });
  }

  @Post('cycles/:id/rank-list')
  @HttpCode(200)
  @Auth('user', ADMISSIONS_ROLES)
  buildRankList(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, (tx) => this.depth.buildRankList(tx, this.actor(p), id));
  }

  @Get('cycles/:id/rank-list')
  @Auth('user', ADMISSIONS_ROLES)
  rankList(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Query('category') category?: string) {
    return this.db.withTenant(p.tenantId, (tx) => this.depth.rankList(tx, id, category?.slice(0, 40)));
  }

  // ---- seat matrix, preferences and CAP rounds ---------------------------------------------------

  @Get('cycles/:id/seat-matrix')
  @Auth('user', ADMISSIONS_ROLES)
  seatMatrix(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, (tx) => this.depth.seatStatus(tx, id));
  }

  @Put('cycles/:id/seat-matrix')
  @Auth('user', ADMISSIONS_ROLES)
  setSeatMatrix(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(MatrixBody)) body: z.infer<typeof MatrixBody>) {
    return this.db.withTenant(p.tenantId, (tx) => this.depth.setSeatMatrix(tx, this.actor(p), id, { rows: body.rows?.map((r) => ({ option: r.option, category: r.category, seats: r.seats })), generate: body.generate }));
  }

  @Put('applications/:id/preferences')
  @Auth('user', ADMISSIONS_ROLES)
  setPreferences(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(PrefsBody)) body: z.infer<typeof PrefsBody>) {
    return this.db.withTenant(p.tenantId, (tx) => this.depth.setPreferences(tx, this.actor(p), id, body.options));
  }

  @Get('cycles/:id/rounds')
  @Auth('user', ADMISSIONS_ROLES)
  rounds(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, (tx) => this.depth.rounds(tx, id));
  }

  @Post('cycles/:id/rounds')
  @Auth('user', ADMISSIONS_ROLES)
  startRound(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, (tx) => this.depth.startRound(tx, this.actor(p), id));
  }

  @Get('rounds/:id/allotments')
  @Auth('user', ADMISSIONS_ROLES)
  roundAllotments(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, (tx) => this.depth.roundAllotments(tx, id));
  }

  @Post('rounds/:id/publish')
  @HttpCode(200)
  @Auth('user', ADMISSIONS_ROLES)
  publishRound(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, (tx) => this.depth.publishRound(tx, this.actor(p), id));
  }

  @Post('rounds/:id/close')
  @HttpCode(200)
  @Auth('user', ADMISSIONS_ROLES)
  closeRound(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, (tx) => this.depth.closeRound(tx, this.actor(p), id));
  }

  @Post('allotments/:id/respond')
  @HttpCode(200)
  @Auth('user', ADMISSIONS_ROLES)
  respond(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(RespondBody)) body: z.infer<typeof RespondBody>) {
    return this.db.withTenant(p.tenantId, (tx) => this.depth.respond(tx, this.actor(p), id, body.response));
  }

  // ---- agent rules and payouts -------------------------------------------------------------------

  @Get('commission-rules')
  @Auth('user', ADMISSIONS_ROLES)
  rules(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, (tx) => this.depth.rules(tx));
  }

  @Post('commission-rules')
  @Auth('user', ADMISSIONS_ROLES)
  addRule(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(RuleBody)) body: z.infer<typeof RuleBody>) {
    return this.db.withTenant(p.tenantId, (tx) => this.depth.addRule(tx, this.actor(p), body));
  }

  @Delete('commission-rules/:id')
  @Auth('user', ADMISSIONS_ROLES)
  removeRule(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, (tx) => this.depth.removeRule(tx, this.actor(p), id));
  }

  @Post('agents/:id/payouts')
  @Auth('user', ADMISSIONS_ROLES)
  payout(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(PayoutBody)) body: z.infer<typeof PayoutBody>) {
    return this.db.withTenant(p.tenantId, (tx) => this.depth.payout(tx, this.actor(p), id, body));
  }

  @Get('payouts')
  @Auth('user', ADMISSIONS_ROLES)
  payouts(@CurrentPrincipal() p: UserPrincipal, @Query('agentId') agentId?: string) {
    return this.db.withTenant(p.tenantId, (tx) => this.depth.payouts(tx, agentId && z.uuid().safeParse(agentId).success ? agentId : undefined));
  }

  // ---- lead connectors, spend and source ROI -----------------------------------------------------

  @Get('lead-connectors')
  @Auth('user', ADMISSIONS_ROLES)
  connectors(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, (tx) => this.leads.list(tx));
  }

  @Post('lead-connectors')
  @Auth('user', ADMISSIONS_ROLES)
  createConnector(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(ConnectorBody)) body: z.infer<typeof ConnectorBody>) {
    return this.db.withTenant(p.tenantId, (tx) => this.leads.create(tx, this.actor(p), body));
  }

  @Patch('lead-connectors/:id')
  @Auth('user', ADMISSIONS_ROLES)
  patchConnector(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(ConnectorPatch)) body: z.infer<typeof ConnectorPatch>) {
    return this.db.withTenant(p.tenantId, (tx) => this.leads.update(tx, this.actor(p), id, body));
  }

  @Put('lead-spend')
  @Auth('user', ADMISSIONS_ROLES)
  putSpend(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(SpendBody)) body: z.infer<typeof SpendBody>) {
    return this.db.withTenant(p.tenantId, (tx) => this.leads.addSpend(tx, this.actor(p), body.rows));
  }

  @Get('lead-spend')
  @Auth('user', ADMISSIONS_ROLES)
  spend(@CurrentPrincipal() p: UserPrincipal, @Query('from') from?: string, @Query('to') to?: string) {
    return this.db.withTenant(p.tenantId, (tx) => this.leads.spendRows(tx, { from: day(from), to: day(to) }));
  }

  @Get('source-roi')
  @Auth('user', ADMISSIONS_ROLES)
  roi(@CurrentPrincipal() p: UserPrincipal, @Query('from') from?: string, @Query('to') to?: string, @Query('revenuePerEnrolmentPaise') rev?: string) {
    const r = Number(rev);
    return this.db.withTenant(p.tenantId, (tx) => this.leads.roi(tx, { from: day(from), to: day(to), revenuePerEnrolmentPaise: Number.isFinite(r) && r > 0 ? r : undefined }));
  }
}

/** Lead webhooks, no sign-in: each connector proves itself with its own secret (Meta signature, Google key, website key). */
@Controller('v1/public/leads/:slug/:connectorId')
export class LeadWebhookController {
  constructor(
    private readonly db: DbService,
    private readonly system: SystemLookups,
    private readonly leads: LeadsService,
    private readonly admissions: AdmissionsService,
    private readonly limiter: RateLimiter,
  ) {}

  private async tenant(slug: string) {
    const t = /^[a-z0-9-]{1,64}$/.test(slug) ? await this.system.tenantBySlug(slug) : undefined;
    if (!t) throw new NotFoundException('Not found');
    return t;
  }

  /** Meta's setup handshake: echo the challenge when the verify token is the connector's secret. */
  @Get()
  async verify(@Param('slug') slug: string, @Param('connectorId', ParseUUIDPipe) id: string, @Query() q: Record<string, string>, @Res() res: Response) {
    const t = await this.tenant(slug);
    const c = await this.db.withTenant(t.id, (tx) => this.leads.connector(tx, id));
    const tok = q['hub.verify_token'] ?? '';
    const ok = c?.kind === 'meta' && q['hub.mode'] === 'subscribe' && tok.length === c.secret.length && timingSafeEqual(Buffer.from(tok), Buffer.from(c.secret));
    if (!ok) throw new NotFoundException('Not found');
    res.type('text/plain').send(String(q['hub.challenge'] ?? ''));
  }

  @Post()
  @HttpCode(200)
  async receive(@Param('slug') slug: string, @Param('connectorId', ParseUUIDPipe) id: string, @Ip() ip: string, @Req() req: RawBodyRequest<Request>, @Headers() headers: Record<string, string | string[] | undefined>, @Body() body: Record<string, unknown>) {
    await this.limiter.hit(`lead:${slug}:${id}:${ip}`, 120, 60_000);
    const t = await this.tenant(slug);
    return this.db.withTenant(t.id, async (tx: Tx) => {
      const c = await this.leads.connector(tx, id);
      // The same 404 for an unknown connector, a switched-off one and a bad secret, so nothing leaks.
      if (!c || !c.active || !this.leads.authorised(c, req.rawBody, headers, body ?? {})) throw new NotFoundException('Not found');
      return this.leads.ingest(tx, c, body ?? {}, await this.admissions.today(tx));
    });
  }
}

/** What an applicant sees and does with CAP allotments, using the secret token from their application link. */
@Controller('v1/public/admissions/:slug/applications/:appId')
export class PublicAllotmentController {
  constructor(
    private readonly db: DbService,
    private readonly system: SystemLookups,
    private readonly depth: DepthService,
  ) {}

  private async mine(slug: string, appId: string, token: string | undefined, run: (tx: Tx, tenantId: string) => Promise<unknown>) {
    const t = /^[a-z0-9-]{1,64}$/.test(slug) ? await this.system.tenantBySlug(slug) : undefined;
    if (!t) throw new NotFoundException('Not found');
    return this.db.withTenant(t.id, async (tx) => {
      const [a] = await tx.select({ id: applications.id, hash: applications.accessTokenHash }).from(applications).where(eq(applications.id, appId));
      const x = Buffer.from(hashToken(token ?? ''));
      const y = Buffer.from(a?.hash ?? '');
      if (!a || !token || token.length > 200 || x.length !== y.length || !timingSafeEqual(x, y)) throw new NotFoundException('Application not found');
      return run(tx, t.id);
    });
  }

  @Get('allotments')
  allotments(@Param('slug') slug: string, @Param('appId', ParseUUIDPipe) appId: string, @Headers('x-application-token') token?: string) {
    return this.mine(slug, appId, token, (tx) => this.depth.allotmentsFor(tx, appId));
  }

  @Put('preferences')
  preferences(@Param('slug') slug: string, @Param('appId', ParseUUIDPipe) appId: string, @Headers('x-application-token') token: string | undefined, @Body(new ZodBody(PrefsBody)) body: z.infer<typeof PrefsBody>) {
    return this.mine(slug, appId, token, (tx, tenantId) => this.depth.setPreferences(tx, { tenantId, userId: null }, appId, body.options));
  }

  @Post('allotments/:id/respond')
  @HttpCode(200)
  respond(@Param('slug') slug: string, @Param('appId', ParseUUIDPipe) appId: string, @Param('id', ParseUUIDPipe) id: string, @Headers('x-application-token') token: string | undefined, @Body(new ZodBody(RespondBody)) body: z.infer<typeof RespondBody>) {
    return this.mine(slug, appId, token, async (tx, tenantId) => {
      // The allotment must be this applicant's own.
      const mineRows = await this.depth.allotmentsFor(tx, appId);
      if (!mineRows.some((r) => r.id === id)) throw new NotFoundException('Allotment not found');
      return this.depth.respond(tx, { tenantId, userId: null }, id, body.response);
    });
  }
}
