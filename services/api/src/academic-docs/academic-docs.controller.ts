import { Body, Controller, Get, HttpCode, Inject, Ip, Param, ParseUUIDPipe, Post, Query, Res } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type { Response } from 'express';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { UserPrincipal } from '../auth/principal.js';
import { RateLimiter } from '../common/rate-limiter.js';
import { localParts } from '../common/time.js';
import { ZodBody } from '../common/zod-body.js';
import { ENV, type Env } from '../config/env.js';
import { DbService } from '../db/db.service.js';
import { SystemLookups } from '../db/system-lookups.service.js';
import { academicDocRequests, students, tenants } from '../db/schema.js';
import { DOC_KINDS, DOC_TITLE, parseDocCode, type DocKind, type DocSnapshot } from './academic-docs.logic.js';
import { AcademicDocsService, DOC_ADMIN } from './academic-docs.service.js';

const CreateBody = z.object({ studentId: z.uuid(), kind: z.enum(DOC_KINDS), purpose: z.string().trim().max(300).default('') });
const DecideBody = z.object({ approve: z.boolean(), note: z.string().trim().max(500).optional() });

/**
 * Transcript, provisional certificate and consolidated grade card: a student (or parent) requests, the exam office
 * approves and issues (figures frozen, serial number, signed QR), and the PDF is downloaded from the app.
 */
@Controller('v1/academic-docs')
export class AcademicDocsController {
  constructor(private readonly svc: AcademicDocsService) {}

  @Post('requests')
  @Auth('user')
  create(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(CreateBody)) b: z.infer<typeof CreateBody>) {
    return this.svc.create(p, b);
  }

  @Get('students/:studentId/requests')
  @Auth('user')
  forStudent(@CurrentPrincipal() p: UserPrincipal, @Param('studentId', ParseUUIDPipe) studentId: string) {
    return this.svc.forStudent(p, studentId);
  }

  @Get('inbox')
  @Auth('user', DOC_ADMIN)
  inbox(@CurrentPrincipal() p: UserPrincipal, @Query('status') status?: string) {
    return this.svc.inbox(p, status);
  }

  @Post('requests/:id/decide')
  @HttpCode(200)
  @Auth('user', DOC_ADMIN)
  decide(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(DecideBody)) b: z.infer<typeof DecideBody>) {
    return this.svc.decide(p, id, b.approve, b.note);
  }

  @Post('requests/:id/issue')
  @HttpCode(200)
  @Auth('user', DOC_ADMIN)
  issue(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.issue(p, id);
  }

  @Get('requests/:id/document.pdf')
  @Auth('user')
  async download(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const out = await this.svc.download(p, id);
    res.setHeader('content-type', 'application/pdf');
    res.setHeader('content-disposition', `inline; filename="${out.name}"`);
    res.end(out.pdf);
  }
}

export interface AcademicDocVerification {
  status: 'valid' | 'not_found';
  institution?: string;
  document?: string;
  serialNo?: string;
  name?: string;
  issuedOn?: string;
  cgpa?: number;
}

/** The QR on an issued document: public, rate limited, signed so serial numbers cannot be probed; shows what the document shows. */
@Controller('v1/public')
export class AcademicDocsPublicController {
  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly db: DbService,
    private readonly lookups: SystemLookups,
    private readonly limiter: RateLimiter,
  ) {}

  @Get('verify-academic/:slug/:code')
  async verify(@Param('slug') slug: string, @Param('code') code: string, @Ip() ip: string): Promise<AcademicDocVerification> {
    await this.limiter.hit(`verify:${ip}`, 30, 60_000);
    const tenant = /^[a-z0-9-]{1,60}$/.test(slug) ? await this.lookups.tenantBySlug(slug) : undefined;
    const serial = tenant ? parseDocCode(this.env.JWT_SECRET, tenant.id, code) : null;
    if (!tenant || !serial) return { status: 'not_found' };
    return this.db.withTenant(tenant.id, async (tx) => {
      const [r] = await tx.select({ r: academicDocRequests, name: students.fullName }).from(academicDocRequests).innerJoin(students, eq(students.id, academicDocRequests.studentId)).where(eq(academicDocRequests.serialNo, serial));
      if (!r || r.r.status !== 'issued') return { status: 'not_found' as const };
      const [t] = await tx.select({ name: tenants.name }).from(tenants);
      return { status: 'valid' as const, institution: t!.name, document: DOC_TITLE[r.r.kind as DocKind], serialNo: serial, name: r.name, issuedOn: r.r.issuedAt ? localParts(r.r.issuedAt, tenant.timezone).date : undefined, cgpa: (r.r.snapshot as DocSnapshot).cgpa };
    });
  }
}
