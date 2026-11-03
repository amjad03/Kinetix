import { BadRequestException, Body, ConflictException, Controller, Get, NotFoundException, Param, ParseUUIDPipe, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Readable } from 'node:stream';
import { and, asc, eq, gte, isNull, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { documentType } from '../admissions/public-admissions.controller.js';
import { normalizePhone } from '../auth/phone.js';
import { audit } from '../common/audit.js';
import { DbService, type Tx } from '../db/db.service.js';
import { departments, designations, jobApplicants, jobOpenings, tenants } from '../db/schema.js';
import { SystemLookups } from '../db/system-lookups.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { texts } from '../notifications/texts.js';
import { UploadScanService } from '../scanning/upload-scan.js';
import { ObjectStorage } from '../storage/storage.service.js';
import { HrService } from './hr.service.js';

const MAX_RESUME = 5 * 1024 * 1024;
/** Multipart fields arrive as text. */
const Flag = z.union([z.boolean(), z.enum(['true', 'false', '1', '0', 'on', ''])]).transform((v) => v === true || v === 'true' || v === '1' || v === 'on');
const ApplyBody = z.object({
  fullName: z.string().trim().min(3, 'Enter your full name').max(120),
  email: z.email('Enter a valid e-mail address').max(160),
  phone: z.string().trim().min(10, 'Enter a 10-digit mobile number').max(20),
  qualification: z.string().trim().min(2, 'Enter your highest qualification').max(200),
  experienceYears: z.coerce.number().min(0).max(60).default(0),
  phd: Flag.default(false),
  netSet: Flag.default(false),
  currentOrganisation: z.string().trim().max(160).default(''),
  notes: z.string().trim().max(2000).default(''),
  /** A field people never see: anything in it means a bot filled the form. */
  website: z.string().max(200).optional(),
});

/**
 * The institution's public careers page: openings HR has published and that are still open, and the application form.
 * No login. An application lands in the opening's pipeline as `applied` with source `portal` and tells HR.
 */
@Controller('v1/public/careers/:slug')
export class CareersController {
  constructor(
    private readonly db: DbService,
    private readonly system: SystemLookups,
    private readonly hr: HrService,
    private readonly notifications: NotificationsService,
    private readonly scans: UploadScanService,
    private readonly storage: ObjectStorage,
  ) {}

  private async tenant(slug: string) {
    const t = await this.system.tenantBySlug(slug);
    if (!t) throw new NotFoundException('Institution not found');
    return t;
  }

  private open(tx: Tx, today: string) {
    return tx
      .select({ id: jobOpenings.id, title: jobOpenings.title, department: departments.name, designation: designations.name, positions: jobOpenings.positions, description: jobOpenings.description, eligibility: jobOpenings.eligibility, closesOn: jobOpenings.closesOn })
      .from(jobOpenings)
      .leftJoin(departments, eq(departments.id, jobOpenings.departmentId))
      .leftJoin(designations, eq(designations.id, jobOpenings.designationId))
      .where(and(eq(jobOpenings.published, true), eq(jobOpenings.status, 'open'), or(isNull(jobOpenings.closesOn), gte(jobOpenings.closesOn, today))))
      .orderBy(asc(jobOpenings.closesOn), asc(jobOpenings.title));
  }

  @Get()
  async list(@Param('slug') slug: string) {
    const t = await this.tenant(slug);
    return this.db.withTenant(t.id, async (tx) => {
      const [inst] = await tx.select({ name: tenants.name }).from(tenants);
      return { institution: inst?.name ?? '', openings: await this.open(tx, await this.hr.today(tx)) };
    });
  }

  @Get('openings/:id')
  async one(@Param('slug') slug: string, @Param('id', ParseUUIDPipe) id: string) {
    const t = await this.tenant(slug);
    return this.db.withTenant(t.id, async (tx) => {
      const o = (await this.open(tx, await this.hr.today(tx))).find((x) => x.id === id);
      if (!o) throw new NotFoundException('This opening is closed or does not exist');
      return o;
    });
  }

  /** Applies to an opening. Multipart: the fields above and an optional `resume` (PDF, JPEG or PNG, up to 5 MB). */
  @Post('openings/:id/apply')
  @UseInterceptors(FileInterceptor('resume', { limits: { fileSize: MAX_RESUME, files: 1 } }))
  async apply(@Param('slug') slug: string, @Param('id', ParseUUIDPipe) id: string, @Body() raw: Record<string, unknown>, @UploadedFile() file?: { buffer: Buffer; originalname: string }) {
    const parsed = ApplyBody.safeParse(raw ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.issues[0]?.message ?? 'Check the form');
    const b = parsed.data;
    const phone = normalizePhone(b.phone);
    if (!/^\+\d{8,15}$/.test(phone)) throw new BadRequestException('Enter a 10-digit mobile number');
    const t = await this.tenant(slug);
    if (b.website) return { received: true }; // a bot: say thank you and keep nothing
    let type: string | null = null;
    if (file?.buffer?.length) {
      type = documentType(file.buffer);
      if (!type) throw new BadRequestException('The resume must be a PDF, JPEG or PNG');
      await this.scans.assertClean(file.buffer, 'The resume');
    }
    const applicant = await this.db.withTenant(t.id, async (tx) => {
      const o = (await this.open(tx, await this.hr.today(tx))).find((x) => x.id === id);
      if (!o) throw new NotFoundException('This opening is closed or does not exist');
      const [dup] = await tx.select({ id: jobApplicants.id }).from(jobApplicants).where(and(eq(jobApplicants.openingId, id), sql`lower(${jobApplicants.email}) = ${b.email.toLowerCase()}`));
      if (dup) throw new ConflictException('You have already applied for this opening');
      const now = new Date().toISOString();
      const [a] = await tx
        .insert(jobApplicants)
        .values({ tenantId: t.id, openingId: id, fullName: b.fullName, email: b.email.toLowerCase(), phone, qualification: b.qualification, experienceYears: b.experienceYears, phd: b.phd, netSet: b.netSet, currentOrganisation: b.currentOrganisation, notes: b.notes, source: 'portal', stage: 'applied', stageHistory: [{ stage: 'applied', at: now, by: 'careers page' }] })
        .returning({ id: jobApplicants.id });
      await audit(tx, { tenantId: t.id, actorType: 'system', action: 'job_applicant.applied_online', subjectType: 'job_applicant', subjectId: a.id, data: { openingId: id } });
      const hrIds = (await tx.execute<{ id: string }>(sql`select distinct user_id as id from user_roles where role = 'hr_manager'`)).rows.map((r) => r.id);
      await this.notifications.notifyUsers(tx, hrIds, { kind: 'task', text: texts.jobApplicationReceived({ title: o.title, name: b.fullName }), data: { applicantId: a.id, openingId: id }, dedupeKey: `careers-apply:${a.id}` });
      return { id: a.id, title: o.title };
    });
    if (file?.buffer?.length && type) {
      const key = `tenants/${t.id}/hr/resumes/${applicant.id}-${Date.now()}`;
      await this.storage.put(key, Readable.from(file.buffer), MAX_RESUME, type);
      await this.db.withTenant(t.id, (tx) => tx.update(jobApplicants).set({ resumeKey: key, resumeType: type, resumeName: file.originalname.slice(0, 200) }).where(eq(jobApplicants.id, applicant.id)));
    }
    return { received: true, opening: applicant.title };
  }
}
