import { BadRequestException, Body, Controller, ForbiddenException, Get, Headers, HttpCode, Ip, NotFoundException, Param, ParseUUIDPipe, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { validateAnswers, type AdmissionDocumentSpec, type AdmissionFormField } from '@kinetix/shared';
import { timingSafeEqual } from 'node:crypto';
import { and, desc, eq, notInArray, sql } from 'drizzle-orm';
import { Readable } from 'node:stream';
import { z } from 'zod';
import { audit } from '../common/audit.js';
import { RateLimiter } from '../common/rate-limiter.js';
import { ZodBody } from '../common/zod-body.js';
import { Day, Phone } from '../common/zod-fields.js';
import { DbService, type Tx } from '../db/db.service.js';
import { admissionCycles, applicationDocuments, applicationPayments, applications, enquiries, programs, tenants } from '../db/schema.js';
import { SystemLookups } from '../db/system-lookups.service.js';
import { ApplicationFeesService } from '../fees/application-fees.service.js';
import { ObjectStorage } from '../storage/storage.service.js';
import { AdmissionsService, cycleConfig, hashToken, newToken, type Application } from './admissions.service.js';
import { EnquiriesService } from './enquiries.service.js';

const MAX_DOC_BYTES = 5 * 1024 * 1024;

/** The file type from its first bytes (not the browser's word for it). */
export function documentType(b: Buffer): 'application/pdf' | 'image/jpeg' | 'image/png' | null {
  if (b.length > 4 && b.toString('ascii', 0, 4) === '%PDF') return 'application/pdf';
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  return null;
}

const Name = z.string().trim().min(2).max(120);
const EnquiryBody = z.object({
  name: Name,
  phone: Phone,
  email: z.email().max(200).optional(),
  programId: z.uuid().optional(),
  message: z.string().trim().max(1000).optional(),
  /** A hidden field real visitors never fill: bots do. */
  website: z.string().max(200).optional(),
});
const ApplyBody = z.object({
  applicantName: Name,
  dateOfBirth: Day.optional(),
  gender: z.enum(['female', 'male', 'other']).optional(),
  phone: Phone,
  email: z.email().max(200).optional(),
  guardianName: Name,
  guardianPhone: Phone,
  guardianEmail: z.email().max(200).optional(),
  guardianRelation: z.string().trim().min(2).max(40).default('parent'),
  answers: z.record(z.string().max(60), z.union([z.string().max(500), z.number()])).default({}),
  website: z.string().max(200).optional(),
});
const ConfirmBody = z.object({ paymentId: z.uuid(), providerPaymentId: z.string().min(1).max(100), signature: z.string().min(1).max(200) });
const DeclineBody = z.object({ reason: z.string().trim().max(300).optional() });

/**
 * The public admissions front door: no sign-in. Visitors see the open programs, ask a question
 * (enquiry) or apply. After applying, the applicant's secret token (shown once, sent as
 * `x-application-token`) is their key to track, upload, pay and answer an offer.
 */
@Controller('v1/public/admissions/:slug')
export class PublicAdmissionsController {
  constructor(
    private readonly db: DbService,
    private readonly system: SystemLookups,
    private readonly svc: AdmissionsService,
    private readonly enquiriesSvc: EnquiriesService,
    private readonly fees: ApplicationFeesService,
    private readonly storage: ObjectStorage,
    private readonly limiter: RateLimiter,
  ) {}

  private async tenant(slug: string) {
    const t = /^[a-z0-9-]{1,64}$/.test(slug) ? await this.system.tenantBySlug(slug) : undefined;
    if (!t) throw new NotFoundException('Not found');
    return t;
  }

  /** The applicant's application, if the token is theirs. Always 404 otherwise, so ids reveal nothing. */
  private async mine(tx: Tx, id: string, token: string | undefined): Promise<Application> {
    const [a] = await tx.select().from(applications).where(eq(applications.id, id));
    const ok = a && token && token.length < 200 && (() => {
      const x = Buffer.from(hashToken(token));
      const y = Buffer.from(a.accessTokenHash);
      return x.length === y.length && timingSafeEqual(x, y);
    })();
    if (!a || !ok) throw new NotFoundException('Application not found');
    return a;
  }

  /** Open cycles with their form and documents; the page builds the application form from this. */
  @Get('cycles')
  async cycles(@Param('slug') slug: string) {
    const t = await this.tenant(slug);
    return this.db.withTenant(t.id, async (tx) => {
      const today = await this.svc.today(tx);
      const [inst] = await tx.select({ name: tenants.name }).from(tenants);
      const rows = await tx
        .select({ c: admissionCycles, programName: programs.name })
        .from(admissionCycles)
        .innerJoin(programs, eq(programs.id, admissionCycles.programId))
        .where(and(eq(admissionCycles.status, 'open'), sql`${admissionCycles.opensOn} <= ${today}`, sql`${admissionCycles.closesOn} >= ${today}`))
        .orderBy(programs.name);
      const progs = await tx.select({ id: programs.id, name: programs.name }).from(programs).orderBy(programs.name);
      return {
        institution: inst?.name ?? '',
        programs: progs,
        cycles: rows.map(({ c, programName }) => ({ id: c.id, name: c.name, programId: c.programId, programName, closesOn: c.closesOn, applicationFeePaise: c.applicationFeePaise, ...pick(cycleConfig(c)) })),
      };
    });
  }

  @Post('enquiries')
  async enquire(@Param('slug') slug: string, @Ip() ip: string, @Body(new ZodBody(EnquiryBody)) body: z.infer<typeof EnquiryBody>) {
    await this.limiter.hit(`enquiry:${slug}:${ip}`, 5, 60 * 60_000);
    const t = await this.tenant(slug);
    // A filled hidden field means a bot: answer as if it worked.
    if (body.website) return { received: true };
    await this.db.withTenant(t.id, async (tx) => {
      const { website: _w, ...input } = body;
      await this.enquiriesSvc.create(tx, { tenantId: t.id, userId: null }, { ...input, source: 'web' }, await this.svc.today(tx));
    });
    return { received: true };
  }

  @Post('cycles/:cycleId/applications')
  async apply(@Param('slug') slug: string, @Param('cycleId', ParseUUIDPipe) cycleId: string, @Ip() ip: string, @Body(new ZodBody(ApplyBody)) body: z.infer<typeof ApplyBody>) {
    await this.limiter.hit(`apply:${slug}:${ip}`, 10, 60 * 60_000);
    const t = await this.tenant(slug);
    if (body.website) throw new BadRequestException('Could not submit');
    return this.db.withTenant(t.id, async (tx) => {
      const cycle = await this.svc.cycle(tx, cycleId);
      const today = await this.svc.today(tx);
      if (cycle.status !== 'open' || today < cycle.opensOn || today > cycle.closesOn) throw new BadRequestException('Applications for this program are not open');
      const cfg = cycleConfig(cycle);
      const problems = validateAnswers(cfg.formFields, body.answers);
      if (Object.keys(problems).length) throw new BadRequestException({ message: 'Some answers need attention', fields: problems });
      const [dup] = await tx
        .select({ id: applications.id })
        .from(applications)
        .where(and(eq(applications.cycleId, cycleId), eq(applications.phone, body.phone), sql`lower(${applications.applicantName}) = lower(${body.applicantName})`, notInArray(applications.status, ['withdrawn', 'rejected'])))
        .limit(1);
      if (dup) throw new BadRequestException('An application for this applicant already exists: use the link you were given to track it');
      const token = newToken();
      const applicationNo = await this.svc.nextApplicationNo(tx, cycle);
      // The enquiry that led here (same phone, still open) moves to "applied".
      const [enq] = await tx.select({ id: enquiries.id }).from(enquiries).where(and(sql`${enquiries.phone} in (${body.phone}, ${body.guardianPhone})`, notInArray(enquiries.stage, ['converted', 'lost']))).orderBy(desc(enquiries.createdAt)).limit(1);
      const { website: _w, ...rest } = body;
      const [a] = await tx
        .insert(applications)
        .values({ ...rest, tenantId: t.id, cycleId, applicationNo, enquiryId: enq?.id ?? null, accessTokenHash: hashToken(token), feeStatus: cycle.applicationFeePaise > 0 ? 'pending' : 'none', email: body.email ?? null, guardianEmail: body.guardianEmail ?? null, gender: body.gender ?? null, dateOfBirth: body.dateOfBirth ?? null })
        .returning();
      if (enq) await tx.update(enquiries).set({ stage: 'applied', applicationId: a.id, updatedAt: new Date() }).where(eq(enquiries.id, enq.id));
      await audit(tx, { tenantId: t.id, actorType: 'system', action: 'admissions.application.submitted.v1', subjectType: 'application', subjectId: a.id, data: { applicationNo, cycleId, by: 'applicant' } });
      // With no fee due the application goes straight to review; otherwise when the fee is paid it waits for staff.
      return { id: a.id, applicationNo, token, feeDuePaise: cycle.applicationFeePaise, status: a.status, feeStatus: a.feeStatus };
    });
  }

  /** Where the application stands, for the applicant's tracking page. */
  @Get('applications/:id')
  status(@Param('slug') slug: string, @Param('id', ParseUUIDPipe) id: string, @Headers('x-application-token') token?: string) {
    return this.view(slug, id, token);
  }

  private async view(slug: string, id: string, token?: string) {
    const t = await this.tenant(slug);
    return this.db.withTenant(t.id, async (tx) => {
      const a = await this.mine(tx, id, token);
      const cycle = await this.svc.cycle(tx, a.cycleId);
      const docs = await tx.select({ id: applicationDocuments.id, docKey: applicationDocuments.docKey, fileName: applicationDocuments.fileName, status: applicationDocuments.status, reviewNote: applicationDocuments.reviewNote }).from(applicationDocuments).where(eq(applicationDocuments.applicationId, id));
      const [inst] = await tx.select({ name: tenants.name }).from(tenants);
      const [paid] = await tx.select({ receiptNo: applicationPayments.receiptNo, id: applicationPayments.id }).from(applicationPayments).where(and(eq(applicationPayments.applicationId, id), eq(applicationPayments.status, 'paid'))).limit(1);
      const cfg = cycleConfig(cycle);
      return {
        id: a.id,
        institution: inst?.name ?? '',
        applicationNo: a.applicationNo,
        applicantName: a.applicantName,
        cycleName: cycle.name,
        status: a.status,
        statusReason: ['rejected', 'ineligible', 'withdrawn'].includes(a.status) ? a.statusReason : null,
        feeStatus: a.feeStatus,
        feeDuePaise: a.feeStatus === 'pending' ? cycle.applicationFeePaise : 0,
        receiptNo: paid?.receiptNo ?? null,
        meritRank: ['offered', 'waitlisted', 'accepted', 'enrolled'].includes(a.status) ? a.meritRank : null,
        offerExpiresOn: a.status === 'offered' ? a.offerExpiresOn : null,
        documents: cfg.documents.map((d: AdmissionDocumentSpec) => {
          const got = docs.find((x) => x.docKey === d.key);
          return { key: d.key, label: d.label, required: d.required, uploaded: !!got, fileName: got?.fileName ?? null, status: got?.status ?? null, reviewNote: got?.reviewNote ?? null };
        }),
        submittedAt: a.submittedAt,
      };
    });
  }

  /** Multipart `file`: a PDF, JPEG or PNG of at most 5 MB, for one of the cycle's documents. Replaces an earlier upload. */
  @Post('applications/:id/documents/:key')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_DOC_BYTES, files: 1 } }))
  async upload(@Param('slug') slug: string, @Param('id', ParseUUIDPipe) id: string, @Param('key') key: string, @Ip() ip: string, @UploadedFile() file: { buffer: Buffer; originalname: string; size: number } | undefined, @Headers('x-application-token') token?: string) {
    await this.limiter.hit(`upload:${slug}:${id}`, 30, 60 * 60_000);
    if (!file?.buffer?.length) throw new BadRequestException('Choose a file');
    const type = documentType(file.buffer);
    if (!type) throw new BadRequestException('The file must be a PDF, JPEG or PNG');
    const t = await this.tenant(slug);
    const { oldKey, docKey } = await this.db.withTenant(t.id, async (tx) => {
      const a = await this.mine(tx, id, token);
      if (this.svc.isTerminal(a.status)) throw new BadRequestException('This application is closed');
      const spec = cycleConfig(await this.svc.cycle(tx, a.cycleId)).documents.find((d) => d.key === key);
      if (!spec) throw new NotFoundException('This is not one of the documents asked for');
      const [old] = await tx.select({ storageKey: applicationDocuments.storageKey }).from(applicationDocuments).where(and(eq(applicationDocuments.applicationId, id), eq(applicationDocuments.docKey, key)));
      return { oldKey: old?.storageKey, docKey: spec.key };
    });
    const storageKey = `tenants/${t.id}/admissions/${id}/${docKey}-${Date.now()}`;
    await this.storage.put(storageKey, Readable.from(file.buffer), MAX_DOC_BYTES, type);
    const name = file.originalname.replace(/[^\w.\- ]/g, '_').slice(0, 120) || 'document';
    const row = await this.db.withTenant(t.id, async (tx) => {
      const [d] = await tx
        .insert(applicationDocuments)
        .values({ tenantId: t.id, applicationId: id, docKey, fileName: name, contentType: type, sizeBytes: file.buffer.length, storageKey })
        .onConflictDoUpdate({ target: [applicationDocuments.applicationId, applicationDocuments.docKey], set: { fileName: name, contentType: type, sizeBytes: file.buffer.length, storageKey, status: 'pending', reviewNote: null, reviewedBy: null, uploadedAt: new Date() } })
        .returning({ id: applicationDocuments.id, docKey: applicationDocuments.docKey, status: applicationDocuments.status });
      await audit(tx, { tenantId: t.id, actorType: 'system', action: 'admissions.document.uploaded.v1', subjectType: 'application', subjectId: id, data: { docKey, bytes: file.buffer.length, type, by: 'applicant' } });
      return d;
    });
    if (oldKey) await this.storage.delete(oldKey).catch(() => undefined);
    return row;
  }

  /** Starts the application fee payment: the order the checkout opens (same shape as a tuition fee checkout). */
  @Post('applications/:id/fee/checkout')
  async checkout(@Param('slug') slug: string, @Param('id', ParseUUIDPipe) id: string, @Headers('x-application-token') token?: string) {
    const t = await this.tenant(slug);
    const prep = await this.db.withTenant(t.id, async (tx) => {
      await this.mine(tx, id, token);
      return this.fees.prepareCheckout(tx, id);
    });
    const order = await prep.provider.createOrder({ amountPaise: prep.amountPaise, receipt: `app_${id.slice(0, 8)}`, notes: { applicationId: id, tenantId: t.id } });
    return this.db.withTenant(t.id, async (tx) => {
      const pay = await this.fees.recordOrder(tx, { tenantId: t.id, applicationId: id, amountPaise: prep.amountPaise, provider: prep.provider.name, orderId: order.orderId });
      return {
        paymentId: pay.id,
        provider: prep.provider.name,
        keyId: prep.provider.keyId,
        orderId: order.orderId,
        amountPaise: prep.amountPaise,
        currency: 'INR',
        name: prep.institution,
        description: prep.description,
        prefill: { name: prep.app.guardianName, email: prep.app.guardianEmail ?? '', contact: prep.app.guardianPhone },
      };
    });
  }

  @Post('applications/:id/fee/confirm')
  @HttpCode(200)
  async confirm(@Param('slug') slug: string, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(ConfirmBody)) body: z.infer<typeof ConfirmBody>, @Headers('x-application-token') token?: string) {
    const t = await this.tenant(slug);
    await this.db.withTenant(t.id, async (tx) => {
      await this.mine(tx, id, token);
      await this.fees.confirm(tx, id, body.paymentId, body.providerPaymentId, body.signature);
    });
    return this.view(slug, id, token);
  }

  @Post('applications/:id/offer/accept')
  @HttpCode(200)
  async accept(@Param('slug') slug: string, @Param('id', ParseUUIDPipe) id: string, @Headers('x-application-token') token?: string) {
    return this.respond(slug, id, token, 'accepted');
  }

  @Post('applications/:id/offer/decline')
  @HttpCode(200)
  async decline(@Param('slug') slug: string, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(DeclineBody)) body: z.infer<typeof DeclineBody>, @Headers('x-application-token') token?: string) {
    return this.respond(slug, id, token, 'declined', body.reason);
  }

  @Post('applications/:id/withdraw')
  @HttpCode(200)
  async withdraw(@Param('slug') slug: string, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(DeclineBody)) body: z.infer<typeof DeclineBody>, @Headers('x-application-token') token?: string) {
    return this.respond(slug, id, token, 'withdrawn', body.reason ?? 'Withdrawn by the applicant');
  }

  private async respond(slug: string, id: string, token: string | undefined, to: 'accepted' | 'declined' | 'withdrawn', reason?: string) {
    const t = await this.tenant(slug);
    await this.db.withTenant(t.id, async (tx) => {
      const a = await this.mine(tx, id, token);
      if (to === 'accepted' && a.status !== 'offered') throw new ForbiddenException('There is no offer to accept');
      await this.svc.setStatus(tx, { tenantId: t.id, userId: null }, id, to, reason, { by: 'applicant' });
    });
    return this.view(slug, id, token);
  }
}

const pick = (c: ReturnType<typeof cycleConfig>) => ({ formFields: c.formFields as AdmissionFormField[], documents: c.documents });
