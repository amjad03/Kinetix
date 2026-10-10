import { Body, Controller, Get, Headers, HttpCode, Inject, Ip, NotFoundException, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import { OtpService } from '../auth/otp.service.js';
import type { RoleName, UserPrincipal } from '../auth/principal.js';
import { maskPhone } from '../auth/sms-sender.js';
import { RateLimiter } from '../common/rate-limiter.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService } from '../db/db.service.js';
import { SystemLookups } from '../db/system-lookups.service.js';
import { tenants } from '../db/schema.js';
import { ADMIN } from '../exams/schemes.controller.js';
import { ASSIGNMENT_ROLES } from './examiner.logic.js';
import { ExaminerService } from './examiner.service.js';

const EXAMINER: RoleName[] = ['external_examiner'];
const NewExaminer = z.object({ fullName: z.string().trim().min(2).max(120), phone: z.string().trim().min(8).max(20), email: z.email().optional(), organisation: z.string().trim().max(160).default('') });
const Assign = z.object({ sessionId: z.uuid(), subjectId: z.uuid(), role: z.enum(ASSIGNMENT_ROLES), ratePaise: z.number().int().min(0).max(100_000_000).default(0) });
const Paper = z.object({ title: z.string().trim().min(2).max(200), content: z.string().max(100_000) });
const Note = z.object({ note: z.string().trim().max(1000).optional() });
const Value = z.object({ marks: z.number().min(0).max(1000), remarks: z.string().trim().max(500).optional() });
const ClaimDecision = z.object({ to: z.enum(['approved', 'rejected', 'paid']), note: z.string().trim().max(500).optional() });
const Code = z.object({ code: z.string().regex(/^\d{6}$/) });

/** The exam office manages external examiners: invite, assign, prepare anonymous scripts, move question papers, settle claims. */
@Controller('v1/external-examiners')
export class ExaminerAdminController {
  constructor(private readonly svc: ExaminerService) {}

  @Get()
  @Auth('user', ADMIN)
  list(@CurrentPrincipal() p: UserPrincipal) {
    return this.svc.listExaminers(p);
  }

  @Post()
  @Auth('user', ADMIN)
  create(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(NewExaminer)) b: z.infer<typeof NewExaminer>) {
    return this.svc.createExaminer(p, b);
  }

  @Post(':id/assignments')
  @Auth('user', ADMIN)
  assign(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(Assign)) b: z.infer<typeof Assign>) {
    return this.svc.assign(p, id, b);
  }

  @Post('assignments/:id/reinvite')
  @HttpCode(200)
  @Auth('user', ADMIN)
  reinvite(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.reinvite(p, id);
  }

  @Post('assignments/:id/revoke')
  @HttpCode(200)
  @Auth('user', ADMIN)
  revoke(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.revoke(p, id);
  }

  @Post('assignments/:id/scripts')
  @HttpCode(200)
  @Auth('user', ADMIN)
  prepare(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.prepareScripts(p, id);
  }

  @Get('assignments/:id/scripts')
  @Auth('user', ADMIN)
  scripts(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.scriptsForOffice(p, id);
  }

  @Post('assignments/:id/apply')
  @HttpCode(200)
  @Auth('user', ADMIN)
  apply(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.applyValuations(p, id);
  }

  @Get('question-papers')
  @Auth('user', ADMIN)
  papers(@CurrentPrincipal() p: UserPrincipal, @Query('sessionId') sessionId?: string) {
    return this.svc.listPapers(p, sessionId);
  }

  @Post('question-papers/:id/:action')
  @HttpCode(200)
  @Auth('user', ADMIN)
  paperAction(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Param('action') action: string, @Body(new ZodBody(Note)) b: z.infer<typeof Note>) {
    if (action !== 'submit' && action !== 'approve' && action !== 'return' && action !== 'lock') throw new NotFoundException('Not found');
    return this.svc.officePaperAction(p, id, action, b.note);
  }

  @Get('claims')
  @Auth('user', ADMIN)
  claims(@CurrentPrincipal() p: UserPrincipal) {
    return this.svc.listClaims(p);
  }

  @Post('claims/:id/decide')
  @HttpCode(200)
  @Auth('user', ADMIN)
  decide(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(ClaimDecision)) b: z.infer<typeof ClaimDecision>) {
    return this.svc.decideClaim(p, id, b.to, b.note);
  }
}

/** What an external examiner sees: only their own assignments, anonymised scripts and papers they set or scrutinise. */
@Controller('v1/examiner-portal')
export class ExaminerPortalController {
  constructor(private readonly svc: ExaminerService) {}

  @Get('me')
  @Auth('user', EXAMINER)
  me(@CurrentPrincipal() p: UserPrincipal) {
    return this.svc.portalHome(p);
  }

  @Get('assignments/:id/scripts')
  @Auth('user', EXAMINER)
  scripts(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.portalScripts(p, id);
  }

  @Put('scripts/:id')
  @Auth('user', EXAMINER)
  value(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(Value)) b: z.infer<typeof Value>) {
    return this.svc.valueScript(p, id, b);
  }

  @Get('assignments/:id/question-paper')
  @Auth('user', EXAMINER)
  paper(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.portalPaper(p, id);
  }

  @Put('assignments/:id/question-paper')
  @Auth('user', EXAMINER)
  save(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(Paper)) b: z.infer<typeof Paper>) {
    return this.svc.savePaper(p, id, b);
  }

  @Post('assignments/:id/question-paper/:action')
  @HttpCode(200)
  @Auth('user', EXAMINER)
  action(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Param('action') action: string, @Body(new ZodBody(Note)) b: z.infer<typeof Note>) {
    if (action !== 'submit' && action !== 'approve' && action !== 'return') throw new NotFoundException('Not found');
    return this.svc.paperAction(p, id, action, b.note);
  }

  @Get('claims')
  @Auth('user', EXAMINER)
  claims(@CurrentPrincipal() p: UserPrincipal) {
    return this.svc.portalClaims(p);
  }

  @Post('assignments/:id/claims')
  @Auth('user', EXAMINER)
  claim(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.claim(p, id);
  }
}

/**
 * The invite link an examiner receives: the page shows who invited them, sends a one-time code to the phone the office
 * registered, and the code signs them in. Public and rate limited; the token is random and stored only as a hash.
 */
@Controller('v1/public/examiner-invite')
export class ExaminerInviteController {
  constructor(
    private readonly db: DbService,
    private readonly lookups: SystemLookups,
    private readonly limiter: RateLimiter,
    private readonly otp: OtpService,
    private readonly svc: ExaminerService,
  ) {}

  private async resolve(slug: string, token: string, ip: string) {
    await this.limiter.hit(`examiner-invite:${ip}`, 30, 60_000);
    const tenant = /^[a-z0-9-]{1,60}$/.test(slug) && /^[A-Za-z0-9_-]{20,60}$/.test(token) ? await this.lookups.tenantBySlug(slug) : undefined;
    if (!tenant) throw new NotFoundException('This invitation is not valid');
    const info = await this.db.withTenant(tenant.id, async (tx) => {
      const row = await this.svc.inviteInfo(tx, token);
      if (!row) return null;
      const [t] = await tx.select({ name: tenants.name }).from(tenants);
      return { assignmentId: row.a.id, role: row.a.role, name: row.name, phone: row.phone, institution: t!.name };
    });
    if (!info) throw new NotFoundException('This invitation is not valid or has expired');
    return { tenant, info };
  }

  @Get(':slug/:token')
  async show(@Param('slug') slug: string, @Param('token') token: string, @Ip() ip: string) {
    const { info } = await this.resolve(slug, token, ip);
    return { institution: info.institution, name: info.name, role: info.role, phone: maskPhone(info.phone ?? '') };
  }

  @Post(':slug/:token/otp')
  @HttpCode(202)
  async sendCode(@Param('slug') slug: string, @Param('token') token: string, @Ip() ip: string) {
    const { info } = await this.resolve(slug, token, ip);
    return this.otp.request(slug, info.phone!, ip);
  }

  @Post(':slug/:token/verify')
  @HttpCode(200)
  async verify(@Param('slug') slug: string, @Param('token') token: string, @Body(new ZodBody(Code)) b: z.infer<typeof Code>, @Ip() ip: string, @Headers('user-agent') userAgent?: string) {
    const { tenant, info } = await this.resolve(slug, token, ip);
    const session = await this.otp.verify(slug, info.phone!, b.code, ip, { userAgent, deviceName: 'Examiner portal' });
    await this.db.withTenant(tenant.id, (tx) => this.svc.accept(tx, info.assignmentId));
    return session;
  }
}
