import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query, StreamableFile, Res } from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { UserPrincipal } from '../auth/principal.js';
import { ZodBody } from '../common/zod-body.js';
import { Day } from '../common/zod-fields.js';
import { DbService } from '../db/db.service.js';
import { AdmissionsService } from './admissions.service.js';
import { ADMISSIONS_ROLES } from './admissions.controller.js';
import { EnquiriesService } from './enquiries.service.js';
import { EntranceService, hallTicketPdf } from './entrance.service.js';

const Time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use a time like 09:30');
const Hall = z.object({ name: z.string().trim().min(1).max(60), capacity: z.number().int().min(1).max(5000) });
const TestBody = z.object({
  cycleId: z.uuid(),
  name: z.string().trim().min(3).max(120),
  testDate: Day,
  startsAt: Time,
  durationMinutes: z.number().int().min(10).max(600).default(90),
  maxScore: z.number().positive().max(10_000),
  passScore: z.number().min(0).nullable().optional(),
  venue: z.string().trim().max(200).nullable().optional(),
  halls: z.array(Hall).max(50).default([]),
});
const ScoresBody = z.object({
  scores: z.array(z.object({ applicationId: z.uuid(), score: z.number().min(0).nullable().optional(), absent: z.boolean().optional() })).min(1).max(2000),
});
const QuotaBody = z.object({ quotas: z.array(z.object({ category: z.string().trim().min(1).max(60), reservedSeats: z.number().int().min(1).max(10_000) })).max(30) });
const CategoryBody = z.object({ category: z.string().trim().max(60).nullable() });
const CampaignBody = z.object({
  name: z.string().trim().min(2).max(120),
  channel: z.string().trim().min(2).max(60),
  utmSource: z.string().trim().max(80).nullable().optional(),
  utmMedium: z.string().trim().max(80).nullable().optional(),
  utmCampaign: z.string().trim().max(80).nullable().optional(),
  startsOn: Day.nullable().optional(),
  endsOn: Day.nullable().optional(),
  budgetPaise: z.number().int().min(0).max(100_000_000_000).default(0),
});
const CampaignPatch = z.object({ active: z.boolean().optional(), budgetPaise: z.number().int().min(0).max(100_000_000_000).optional(), endsOn: Day.nullable().optional() });

/** Admissions, deeper: entrance tests with halls and hall tickets, seat quotas and campaigns. */
@Controller('v1/admissions')
export class EntranceController {
  constructor(
    private readonly db: DbService,
    private readonly entrance: EntranceService,
    private readonly svc: AdmissionsService,
    private readonly enquiries: EnquiriesService,
  ) {}

  // ---- entrance tests ----------------------------------------------------------------------------

  @Get('entrance-tests')
  @Auth('user', ADMISSIONS_ROLES)
  tests(@CurrentPrincipal() p: UserPrincipal, @Query('cycleId') cycleId?: string) {
    return this.db.withTenant(p.tenantId, (tx) => this.entrance.list(tx, cycleId && z.uuid().safeParse(cycleId).success ? cycleId : undefined));
  }

  @Post('entrance-tests')
  @Auth('user', ADMISSIONS_ROLES)
  createTest(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(TestBody)) body: z.infer<typeof TestBody>) {
    return this.db.withTenant(p.tenantId, (tx) => this.entrance.create(tx, p, body));
  }

  @Post('entrance-tests/:id/halls')
  @Auth('user', ADMISSIONS_ROLES)
  addHall(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(Hall)) body: z.infer<typeof Hall>) {
    return this.db.withTenant(p.tenantId, (tx) => this.entrance.addHall(tx, p, id, body));
  }

  /** Seats everyone who still needs one. Refused (nothing changes) when the halls are too small. */
  @Post('entrance-tests/:id/allocate')
  @HttpCode(200)
  @Auth('user', ADMISSIONS_ROLES)
  allocate(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, (tx) => this.entrance.allocate(tx, p, id));
  }

  @Get('entrance-tests/:id/seating')
  @Auth('user', ADMISSIONS_ROLES)
  seating(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, (tx) => this.entrance.seating(tx, id));
  }

  /** Enter scores (or mark absent) for seated candidates; these feed the merit list's `entrance_score` rule. */
  @Put('entrance-tests/:id/scores')
  @Auth('user', ADMISSIONS_ROLES)
  scores(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(ScoresBody)) body: z.infer<typeof ScoresBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => this.entrance.enterScores(tx, p, id, body.scores, await this.svc.today(tx)));
  }

  @Get('entrance-tests/:id/hall-ticket/:applicationId')
  @Auth('user', ADMISSIONS_ROLES)
  async hallTicket(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Param('applicationId', ParseUUIDPipe) applicationId: string, @Res({ passthrough: true }) res: Response) {
    const data = await this.db.withTenant(p.tenantId, (tx) => this.entrance.ticket(tx, id, applicationId));
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="hall-ticket-${data.applicationNo.replace(/\//g, '-')}.pdf"`);
    return new StreamableFile(hallTicketPdf(data));
  }

  // ---- seat quotas -----------------------------------------------------------------------------------

  @Get('cycles/:id/quotas')
  @Auth('user', ADMISSIONS_ROLES)
  quotas(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, (tx) => this.svc.quotaView(tx, id));
  }

  @Put('cycles/:id/quotas')
  @Auth('user', ADMISSIONS_ROLES)
  setQuotas(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(QuotaBody)) body: z.infer<typeof QuotaBody>) {
    return this.db.withTenant(p.tenantId, (tx) => this.svc.setQuotas(tx, p, id, body.quotas));
  }

  @Post('applications/:id/category')
  @HttpCode(200)
  @Auth('user', ADMISSIONS_ROLES)
  category(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(CategoryBody)) body: z.infer<typeof CategoryBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const a = await this.svc.setCategory(tx, p, id, body.category);
      return { id: a.id, category: a.category };
    });
  }

  // ---- campaigns ---------------------------------------------------------------------------------------

  @Get('campaigns')
  @Auth('user', ADMISSIONS_ROLES)
  campaigns(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => (await this.enquiries.campaignReport(tx, {})).campaigns);
  }

  @Post('campaigns')
  @Auth('user', ADMISSIONS_ROLES)
  createCampaign(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(CampaignBody)) body: z.infer<typeof CampaignBody>) {
    return this.db.withTenant(p.tenantId, (tx) => this.enquiries.createCampaign(tx, p, body));
  }

  @Patch('campaigns/:id')
  @Auth('user', ADMISSIONS_ROLES)
  patchCampaign(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(CampaignPatch)) body: z.infer<typeof CampaignPatch>) {
    return this.db.withTenant(p.tenantId, (tx) => this.enquiries.updateCampaign(tx, p, id, body));
  }

  /** Conversion per campaign: enquiries, applied, enrolled, conversion rate and spend per enrolment. */
  @Get('reports/campaigns')
  @Auth('user', ADMISSIONS_ROLES)
  report(@CurrentPrincipal() p: UserPrincipal, @Query('from') from?: string, @Query('to') to?: string) {
    const ok = (v?: string) => (v && Day.safeParse(v).success ? v : undefined);
    return this.db.withTenant(p.tenantId, (tx) => this.enquiries.campaignReport(tx, { from: ok(from), to: ok(to) }));
  }
}
