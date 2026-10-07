import { Body, Controller, ForbiddenException, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Put, Query, Res, StreamableFile } from '@nestjs/common';
import type { CertificateRequest, CertificateStatus, CertificateTemplate } from '@kinetix/shared';
import { eq } from 'drizzle-orm';
import type { Response } from 'express';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { UserPrincipal } from '../auth/principal.js';
import { audit } from '../common/audit.js';
import { localParts } from '../common/time.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService } from '../db/db.service.js';
import { certificateTemplates, tenants } from '../db/schema.js';
import { CertificatesService, templateView } from './certificates.service.js';
import { CERT_APPROVERS, hasRole, OFFICE_ROLES } from './documents.access.js';
import { certificatePdf } from './pdfs.js';
import { longDate } from './render.js';

const Fields = z.array(z.object({ key: z.string().regex(/^[A-Za-z][A-Za-z0-9]{0,29}$/, 'Use letters and digits'), label: z.string().trim().min(1).max(80), required: z.boolean() })).max(12);
const TemplateBody = z.object({
  kind: z.enum(['transfer_certificate', 'bonafide', 'conduct', 'study', 'course_completion', 'fee_receipt', 'experience', 'custom']),
  name: z.string().trim().min(1).max(80),
  subjectType: z.enum(['student', 'staff']),
  title: z.string().trim().min(1).max(100),
  body: z.string().trim().min(10).max(4000),
  fields: Fields.default([]),
  serialPrefix: z.string().trim().toUpperCase().regex(/^[A-Z]{1,6}$/, 'Use 1 to 6 capital letters'),
  active: z.boolean().default(true),
});
const RequestBody = z.object({
  templateId: z.uuid(),
  studentId: z.uuid().optional(),
  staffUserId: z.uuid().optional(),
  purpose: z.string().trim().max(300).default(''),
  fields: z.record(z.string().max(40), z.string().max(300)).default({}),
});
const DecideBody = z.object({ note: z.string().trim().max(500).optional() });
const RevokeBody = z.object({ reason: z.string().trim().min(3).max(300) });
const BulkBody = z.object({ templateId: z.uuid(), sectionId: z.uuid().optional(), studentIds: z.array(z.uuid()).min(1).max(500).optional(), purpose: z.string().trim().max(300).default('') }).refine((b) => !!b.sectionId !== !!b.studentIds, 'Give either sectionId or studentIds');

/** Certificate templates and the request → approve → issue workflow. */
@Controller('v1/documents')
export class CertificatesController {
  constructor(
    private readonly db: DbService,
    private readonly certs: CertificatesService,
  ) {}

  @Get('templates')
  @Auth('user', OFFICE_ROLES)
  templates(@CurrentPrincipal() p: UserPrincipal): Promise<CertificateTemplate[]> {
    return this.db.withTenant(p.tenantId, async (tx) => (await this.certs.templates(tx, p.tenantId)).map(templateView));
  }

  /** Active templates anyone can ask for: the request form's list. */
  @Get('templates/available')
  @Auth('user')
  available(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) =>
      (await this.certs.templates(tx, p.tenantId)).filter((t) => t.active).filter((t) => t.subjectType === 'student' || p.roles.some((r) => r !== 'student' && r !== 'guardian')).map((t) => ({ id: t.id, kind: t.kind, name: t.name, subjectType: t.subjectType, fields: t.fields })),
    );
  }

  @Post('templates')
  @Auth('user', CERT_APPROVERS)
  createTemplate(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(TemplateBody)) b: z.infer<typeof TemplateBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await this.certs.templates(tx, p.tenantId);
      const [row] = await tx.insert(certificateTemplates).values({ tenantId: p.tenantId, ...b }).returning();
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'certificate.template_created', subjectType: 'certificate_template', subjectId: row.id, data: { kind: b.kind, name: b.name } });
      return templateView(row);
    });
  }

  /** Editing bumps the version; certificates already issued keep the text they were issued with. */
  @Put('templates/:id')
  @Auth('user', CERT_APPROVERS)
  updateTemplate(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(TemplateBody)) b: z.infer<typeof TemplateBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [cur] = await tx.select().from(certificateTemplates).where(eq(certificateTemplates.id, id));
      if (!cur) throw new NotFoundException('Certificate template not found');
      const [row] = await tx.update(certificateTemplates).set({ ...b, version: cur.version + 1, updatedAt: new Date() }).where(eq(certificateTemplates.id, id)).returning();
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'certificate.template_updated', subjectType: 'certificate_template', subjectId: id, data: { version: row.version } });
      return templateView(row);
    });
  }

  @Post('requests')
  @Auth('user')
  request(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(RequestBody)) b: z.infer<typeof RequestBody>): Promise<CertificateRequest> {
    return this.db.withTenant(p.tenantId, (tx) => this.certs.request(tx, p, b));
  }

  @Get('requests')
  @Auth('user', OFFICE_ROLES)
  requests(@CurrentPrincipal() p: UserPrincipal, @Query('status') status?: string): Promise<CertificateRequest[]> {
    const st = z.enum(['requested', 'approved', 'rejected', 'issued', 'revoked']).optional().parse(status || undefined) as CertificateStatus | undefined;
    return this.db.withTenant(p.tenantId, (tx) => this.certs.list(tx, p, { status: st }));
  }

  @Get('requests/mine')
  @Auth('user')
  mine(@CurrentPrincipal() p: UserPrincipal): Promise<CertificateRequest[]> {
    return this.db.withTenant(p.tenantId, (tx) => this.certs.list(tx, p, { mine: true }));
  }

  @Post('requests/:id/approve')
  @HttpCode(200)
  @Auth('user')
  approve(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(DecideBody)) b: z.infer<typeof DecideBody>) {
    return this.db.withTenant(p.tenantId, (tx) => this.certs.decide(tx, p, id, 'approved', b.note ?? null));
  }

  @Post('requests/:id/reject')
  @HttpCode(200)
  @Auth('user')
  reject(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(DecideBody)) b: z.infer<typeof DecideBody>) {
    return this.db.withTenant(p.tenantId, (tx) => this.certs.decide(tx, p, id, 'rejected', b.note ?? null));
  }

  @Post('requests/:id/issue')
  @HttpCode(200)
  @Auth('user', OFFICE_ROLES)
  issue(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, (tx) => this.certs.issue(tx, p, id));
  }

  @Post('requests/:id/revoke')
  @HttpCode(200)
  @Auth('user', CERT_APPROVERS)
  revoke(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(RevokeBody)) b: z.infer<typeof RevokeBody>) {
    return this.db.withTenant(p.tenantId, (tx) => this.certs.revoke(tx, p, id, b.reason));
  }

  @Post('bulk-issue')
  @HttpCode(200)
  @Auth('user', CERT_APPROVERS)
  bulk(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(BulkBody)) b: z.infer<typeof BulkBody>) {
    return this.db.withTenant(p.tenantId, (tx) => this.certs.bulkIssue(tx, p, b));
  }

  /** The certificate as a PDF with its verification QR; revoked ones are stamped. */
  @Get('requests/:id/pdf')
  @Auth('user')
  pdf(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Res({ passthrough: true }) res: Response) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const c = await this.certs.get(tx, id);
      await this.certs.assertCanSee(tx, p, c);
      if (c.status !== 'issued' && c.status !== 'revoked') throw new NotFoundException('This certificate has not been issued');
      if (!hasRole(p, OFFICE_ROLES) && c.status === 'revoked') throw new ForbiddenException('This certificate was revoked');
      const [view] = await this.certs.views(tx, [c]);
      const [tenant] = await tx.select({ name: tenants.name, tz: tenants.timezone }).from(tenants);
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'certificate.downloaded', subjectType: 'certificate', subjectId: id, data: { serialNo: c.serialNo } });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${c.serialNo!.replace(/\//g, '-')}.pdf"`);
      return new StreamableFile(certificatePdf({ institution: tenant.name, title: c.renderedTitle!, body: c.renderedBody!, serialNo: c.serialNo!, issuedOn: longDate(localParts(c.issuedAt!, tenant.tz).date), verifyUrl: view.verifyUrl!, revoked: c.status === 'revoked' }));
    });
  }
}
