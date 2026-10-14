import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, NotFoundException, Param, ParseUUIDPipe, Post, Put, Res, ServiceUnavailableException, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { and, eq, isNotNull, sql } from 'drizzle-orm';
import type { Response } from 'express';
import { Readable } from 'node:stream';
import { z } from 'zod';
import { documentType } from '../admissions/public-admissions.controller.js';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { UserPrincipal } from '../auth/principal.js';
import { audit } from '../common/audit.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService, type Tx } from '../db/db.service.js';
import { staffDocuments, staffExperience, staffPublications } from '../db/schema-hr2.js';
import { staffProfiles } from '../db/schema.js';
import { UploadScanService } from '../scanning/upload-scan.js';
import { ObjectStorage } from '../storage/storage.service.js';
import { hasAnyRole, HR_ROLES, isHr, PAYROLL_ROLES, STAFF_ROLES } from './hr.access.js';
import { HrService, NO_SECRETS_KEY } from './hr.service.js';
import { retirementDate, serviceYears } from './hr-master.logic.js';

const MAX_DOC_BYTES = 5 * 1024 * 1024;
const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-10-15');
const Short = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));
const Yr = z.number().int().min(1950).max(2100).nullish().transform((v) => v ?? null);

export const DetailsBody = z.object({
  staffCategory: z.enum(['teaching', 'non_teaching']),
  cadre: z.enum(['professor', 'associate_professor', 'assistant_professor', 'lecturer', 'principal', 'librarian', 'physical_director', 'lab_staff', 'administrative', 'support', 'other']).nullish().transform((v) => v ?? null),
  postType: z.enum(['sanctioned', 'self_financing', 'guest']),
  socialCategory: z.enum(['general', 'ews', 'obc', 'sc', 'st']).nullish().transform((v) => v ?? null),
  religion: Short(40),
  bloodGroup: z.enum(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']).nullish().transform((v) => v ?? null),
  maritalStatus: z.enum(['single', 'married', 'widowed', 'divorced']).nullish().transform((v) => v ?? null),
  fatherOrSpouseName: Short(120),
  differentlyAbled: z.boolean().default(false),
  address: Short(500),
  emergencyContactName: Short(120),
  emergencyContactPhone: z
    .string()
    .trim()
    .regex(/^[+\d][\d\s-]{6,18}$/, 'Enter a valid phone number')
    .nullish()
    .or(z.literal(''))
    .transform((v) => (v ? v : null)),
  /** 12 digits to set or replace; leave out to keep what is on file, null to remove it. */
  aadhaar: z
    .string()
    .trim()
    .transform((v) => v.replace(/\s/g, ''))
    .pipe(z.string().regex(/^[2-9]\d{11}$/, 'An Aadhaar number has 12 digits'))
    .nullish(),
  phdStatus: z.enum(['none', 'pursuing', 'submitted', 'awarded']),
  phdYear: Yr,
  netSet: z.enum(['none', 'net', 'net_jrf', 'set', 'slet']),
  netSetYear: Yr,
  payScale: Short(80),
  payLevel: z.number().int().min(1).max(18).nullish().transform((v) => v ?? null),
  confirmedOn: Day.nullish().transform((v) => v ?? null),
  retirementAge: z.number().int().min(50).max(75).default(60),
  lwfEnabled: z.boolean().default(true),
});
export type Details = z.infer<typeof DetailsBody>;

export const aadhaarAad = (tenantId: string, userId: string) => `${tenantId}:staff.${userId}.aadhaar`;

/** The staff master beyond the employment record: personal, statutory and faculty-eligibility details, and document scans. */
@Controller('v1/hr')
export class HrMasterController {
  constructor(
    private readonly db: DbService,
    private readonly hr: HrService,
    private readonly scans: UploadScanService,
    private readonly storage: ObjectStorage,
  ) {}

  private async details(tx: Tx, userId: string) {
    const [p] = await tx.select().from(staffProfiles).where(eq(staffProfiles.userId, userId));
    if (!p) throw new NotFoundException('Create the staff record first');
    const exp = await tx.select({ kind: staffExperience.kind, from: staffExperience.fromDate, to: staffExperience.toDate }).from(staffExperience).where(eq(staffExperience.userId, userId));
    const [pubs] = await tx
      .select({ total: sql<number>`count(*)::int`, indexed: sql<number>`count(*) filter (where ${staffPublications.indexing} in ('scopus', 'wos', 'ugc_care'))::int` })
      .from(staffPublications)
      .where(eq(staffPublications.userId, userId));
    const today = await this.hr.today(tx);
    const prior = serviceYears(exp.map((e) => ({ from: e.from, to: e.to, kind: e.kind })));
    const here = p.dateOfJoining ? serviceYears([{ from: p.dateOfJoining, to: p.dateOfLeaving ?? today, kind: p.staffCategory === 'teaching' ? 'teaching' : 'administrative' }]) : { total: 0, teaching: 0 };
    return {
      userId,
      staffCategory: p.staffCategory,
      cadre: p.cadre,
      postType: p.postType,
      socialCategory: p.socialCategory,
      religion: p.religion,
      bloodGroup: p.bloodGroup,
      maritalStatus: p.maritalStatus,
      fatherOrSpouseName: p.fatherOrSpouseName,
      differentlyAbled: p.differentlyAbled,
      address: p.address,
      emergencyContactName: p.emergencyContactName,
      emergencyContactPhone: p.emergencyContactPhone,
      aadhaarLast4: p.aadhaarLast4,
      phdStatus: p.phdStatus,
      phdYear: p.phdYear,
      netSet: p.netSet,
      netSetYear: p.netSetYear,
      payScale: p.payScale,
      payLevel: p.payLevel,
      confirmedOn: p.confirmedOn,
      retirementAge: p.retirementAge,
      retiresOn: p.dateOfBirth ? retirementDate(p.dateOfBirth, p.retirementAge) : null,
      lwfEnabled: p.lwfEnabled,
      experience: { priorYears: prior.total, priorTeachingYears: prior.teaching, serviceYears: here.total, teachingYears: Math.round((prior.teaching + here.teaching) * 10) / 10, totalYears: Math.round((prior.total + here.total) * 10) / 10 },
      publications: { total: pubs?.total ?? 0, indexed: pubs?.indexed ?? 0 },
    };
  }

  /** HR, payroll and the person themselves; a head of department for their staff. */
  @Get('staff/:userId/details')
  @Auth('user', STAFF_ROLES)
  get(@CurrentPrincipal() p: UserPrincipal, @Param('userId', ParseUUIDPipe) userId: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      if (userId !== p.userId && !hasAnyRole(p, PAYROLL_ROLES) && !(p.roles.includes('hod') && (await this.heads(tx, p.userId, userId)))) throw new NotFoundException('Staff member not found');
      return this.details(tx, userId);
    });
  }

  private async heads(tx: Tx, hodId: string, staffId: string) {
    const r = await tx.execute(sql`select 1 from staff_profiles sp join departments d on d.id = sp.department_id where sp.user_id = ${staffId}::uuid and d.head_user_id = ${hodId}::uuid`);
    return r.rows.length > 0;
  }

  @Put('staff/:userId/details')
  @Auth('user', HR_ROLES)
  save(@CurrentPrincipal() p: UserPrincipal, @Param('userId', ParseUUIDPipe) userId: string, @Body(new ZodBody(DetailsBody)) b: Details) {
    if (b.aadhaar && !this.hr.box) throw new ServiceUnavailableException(NO_SECRETS_KEY);
    if (b.phdStatus === 'awarded' && !b.phdYear) throw new BadRequestException('Give the year the Ph.D. was awarded');
    if (b.netSet !== 'none' && !b.netSetYear) throw new BadRequestException('Give the year of the NET or SET');
    return this.db.withTenant(p.tenantId, async (tx) => {
      const before = await this.details(tx, userId);
      const { aadhaar, ...rest } = b;
      const patch: Partial<typeof staffProfiles.$inferInsert> = { ...rest, phdYear: b.phdStatus === 'none' ? null : b.phdYear, netSetYear: b.netSet === 'none' ? null : b.netSetYear, updatedAt: new Date(), version: sql`${staffProfiles.version} + 1` as unknown as number };
      if (aadhaar === null) Object.assign(patch, { aadhaarEnc: null, aadhaarLast4: null });
      else if (aadhaar) Object.assign(patch, { aadhaarEnc: this.hr.box!.encrypt(aadhaar, aadhaarAad(p.tenantId, userId)), aadhaarLast4: aadhaar.slice(-4) });
      await tx.update(staffProfiles).set(patch).where(eq(staffProfiles.userId, userId));
      const after = await this.details(tx, userId);
      const keys = Object.keys(rest).concat('aadhaarLast4');
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'hr.staff_details_updated', subjectType: 'user', subjectId: userId, before: before as unknown as Record<string, unknown>, after: after as unknown as Record<string, unknown>, fields: keys });
      return after;
    });
  }

  // ---- document scans ------------------------------------------------------------------------------------

  /** Attaches a scan (PDF, JPEG or PNG, up to 5 MB) to a staff document; a new upload replaces the old one. Multipart field `file`. */
  @Post('staff-documents/:id/file')
  @Auth('user', STAFF_ROLES)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_DOC_BYTES, files: 1 } }))
  async upload(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @UploadedFile() file?: { buffer: Buffer; originalname: string }) {
    if (!file?.buffer?.length) throw new BadRequestException('Choose the file');
    const type = documentType(file.buffer);
    if (!type) throw new BadRequestException('The scan must be a PDF, JPEG or PNG');
    const doc = await this.db.withTenant(p.tenantId, async (tx) => {
      const [r] = await tx.select().from(staffDocuments).where(eq(staffDocuments.id, id));
      if (!r || (!isHr(p) && r.userId !== p.userId)) throw new NotFoundException('Document not found');
      if (!isHr(p) && r.verifiedAt) throw new ForbiddenException('A verified document can be changed only by HR');
      return r;
    });
    await this.scans.assertClean(file.buffer, 'The scan');
    const key = `tenants/${p.tenantId}/hr/documents/${id}-${Date.now()}`;
    await this.storage.put(key, Readable.from(file.buffer), MAX_DOC_BYTES, type);
    try {
      const row = await this.db.withTenant(p.tenantId, async (tx) => {
        const [r] = await tx
          .update(staffDocuments)
          .set({ fileKey: key, fileType: type, fileName: file.originalname.slice(0, 200), ...(isHr(p) ? {} : { verifiedAt: null, verifiedBy: null }) })
          .where(eq(staffDocuments.id, id))
          .returning({ id: staffDocuments.id, fileName: staffDocuments.fileName, fileType: staffDocuments.fileType });
        await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'staff_document.file_attached', subjectType: 'staff_document', subjectId: id, data: { type, name: r.fileName } });
        return r;
      });
      if (doc.fileKey) await this.storage.delete(doc.fileKey).catch(() => undefined);
      return row;
    } catch (e) {
      await this.storage.delete(key).catch(() => undefined);
      throw e;
    }
  }

  @Get('staff-documents/:id/file')
  @Auth('user', STAFF_ROLES)
  async file(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const r = await this.db.withTenant(p.tenantId, async (tx) => {
      const [row] = await tx.select().from(staffDocuments).where(and(eq(staffDocuments.id, id), isNotNull(staffDocuments.fileKey)));
      if (!row || (!isHr(p) && row.userId !== p.userId)) throw new NotFoundException('No scan attached');
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'staff_document.file_viewed', subjectType: 'staff_document', subjectId: id });
      return row;
    });
    const { stream, size } = await this.storage.get(r.fileKey!);
    res.set({ 'content-type': r.fileType ?? 'application/octet-stream', 'content-length': String(size), 'content-disposition': `inline; filename="${(r.fileName ?? 'document').replace(/[^\w.-]+/g, '_')}"`, 'x-content-type-options': 'nosniff', 'cache-control': 'private, no-store' });
    stream.pipe(res);
  }

  @Post('staff-documents/:id/file/remove')
  @Auth('user', HR_ROLES)
  removeFile(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [r] = await tx.select().from(staffDocuments).where(eq(staffDocuments.id, id));
      if (!r?.fileKey) throw new ConflictException('No scan attached');
      await tx.update(staffDocuments).set({ fileKey: null, fileType: null, fileName: null }).where(eq(staffDocuments.id, id));
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'staff_document.file_removed', subjectType: 'staff_document', subjectId: id });
      await this.storage.delete(r.fileKey).catch(() => undefined);
      return { id };
    });
  }
}
