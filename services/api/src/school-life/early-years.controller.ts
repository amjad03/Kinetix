import { BadRequestException, Body, ConflictException, Controller, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Put, Query, Res, StreamableFile, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import type { Response } from 'express';
import { Readable } from 'node:stream';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { UserPrincipal } from '../auth/principal.js';
import { auditUser } from '../common/audit.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService, type Tx } from '../db/db.service.js';
import { academicTerms, eyMilestones, eyMilestoneStatus, eyObservations, sections, students, tenants } from '../db/schema.js';
import { photoType } from '../profile/profile.controller.js';
import { UploadScanService } from '../scanning/upload-scan.js';
import { ObjectStorage } from '../storage/storage.service.js';
import { DEFAULT_MILESTONES, EY_AGE_BANDS, EY_DOMAINS, EY_STATUSES, type EyDomain, type EyStatus } from './early-years-framework.js';
import { learningStoryPdf } from './learning-story-pdf.js';
import { EARLY_YEARS_STAFF, SchoolLifeService } from './school-life.service.js';

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const FRAMEWORK_EDITORS = ['tenant_admin', 'principal'] as const;
const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-10-20');
const blank = (v: unknown) => (v === '' || v === null ? undefined : v);

const MilestoneBody = z.object({ domain: z.enum(EY_DOMAINS), ageBand: z.enum(EY_AGE_BANDS), title: z.string().trim().min(3).max(200), description: z.string().trim().max(1000).default('') });
const StatusBody = z.object({ status: z.enum(EY_STATUSES) });
/** Multipart fields arrive as strings, so empty ones count as absent. */
const ObservationBody = z.object({
  note: z.string().trim().min(3).max(3000),
  domain: z.preprocess(blank, z.enum(EY_DOMAINS).optional()),
  milestoneId: z.preprocess(blank, z.uuid().optional()),
  status: z.preprocess(blank, z.enum(EY_STATUSES).optional()),
  observedOn: z.preprocess(blank, Day.optional()),
});

async function readAll(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const c of stream) chunks.push(Buffer.from(c));
  return Buffer.concat(chunks);
}

/** Shared reads: a child's record, photo and learning story. Used by the staff and the Parent App controllers. */
export class EarlyYearsData {
  constructor(
    protected readonly db: DbService,
    protected readonly storage: ObjectStorage,
  ) {}

  async record(tx: Tx, studentId: string) {
    const milestones = await tx
      .select({ id: eyMilestones.id, domain: eyMilestones.domain, ageBand: eyMilestones.ageBand, title: eyMilestones.title, description: eyMilestones.description, status: eyMilestoneStatus.status, updatedAt: eyMilestoneStatus.updatedAt })
      .from(eyMilestones)
      .leftJoin(eyMilestoneStatus, and(eq(eyMilestoneStatus.milestoneId, eyMilestones.id), eq(eyMilestoneStatus.studentId, studentId)))
      .where(eq(eyMilestones.active, true))
      .orderBy(asc(eyMilestones.domain), asc(eyMilestones.ageBand), asc(eyMilestones.title));
    const observations = await tx
      .select({ id: eyObservations.id, domain: eyObservations.domain, milestoneId: eyObservations.milestoneId, note: eyObservations.note, status: eyObservations.status, observedOn: eyObservations.observedOn, hasPhoto: sql<boolean>`${eyObservations.photoKey} is not null`, createdAt: eyObservations.createdAt })
      .from(eyObservations)
      .where(eq(eyObservations.studentId, studentId))
      .orderBy(desc(eyObservations.observedOn), desc(eyObservations.createdAt))
      .limit(200);
    return { milestones, observations };
  }

  async photo(tx: Tx, studentId: string, observationId: string, res: Response) {
    const [o] = await tx.select({ key: eyObservations.photoKey }).from(eyObservations).where(and(eq(eyObservations.id, observationId), eq(eyObservations.studentId, studentId)));
    if (!o?.key) throw new NotFoundException('Photo not found');
    const { stream, size } = await this.storage.get(o.key);
    const ext = o.key.split('.').pop();
    res.setHeader('Content-Type', ext === 'jpeg' ? 'image/jpeg' : ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'application/octet-stream');
    res.setHeader('Content-Length', String(size));
    res.setHeader('Cache-Control', 'private, max-age=300');
    return new StreamableFile(stream);
  }

  /** The learning story for the child in a term (observations dated within it). */
  async story(tx: Tx, studentId: string, termId: string, res: Response) {
    const [term] = await tx.select().from(academicTerms).where(eq(academicTerms.id, termId));
    if (!term) throw new NotFoundException('Term not found');
    const [child] = await tx.select({ name: students.fullName, section: sections.displayName }).from(students).innerJoin(sections, eq(sections.id, students.sectionId)).where(eq(students.id, studentId));
    if (!child) throw new NotFoundException('Student not found');
    const [tenant] = await tx.select({ name: tenants.name }).from(tenants);
    const { milestones, observations } = await this.record(tx, studentId);
    const inTerm = observations.filter((o) => o.observedOn >= term.startsOn && o.observedOn <= term.endsOn).reverse();
    const photoKeys = new Map((await tx.select({ id: eyObservations.id, key: eyObservations.photoKey }).from(eyObservations).where(eq(eyObservations.studentId, studentId))).map((r) => [r.id, r.key]));
    const withPhotos: { date: string; domain: EyDomain; note: string; photo?: Buffer }[] = [];
    let photos = 0;
    for (const o of inTerm) {
      const key = photoKeys.get(o.id);
      let photo: Buffer | undefined;
      if (key && photos < 6) {
        photo = await readAll((await this.storage.get(key)).stream).catch(() => undefined);
        if (photo) photos++;
      }
      withPhotos.push({ date: o.observedOn, domain: o.domain as EyDomain, note: o.note, photo });
    }
    const buf = learningStoryPdf({
      institution: tenant?.name ?? '',
      student: child.name,
      section: child.section,
      term: term.name,
      from: term.startsOn,
      to: term.endsOn,
      milestones: milestones.filter((m) => m.status || withPhotos.some((o) => o.domain === m.domain)).map((m) => ({ domain: m.domain as EyDomain, title: m.title, status: m.status as EyStatus | null })),
      observations: withPhotos,
    });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="learning-story-${child.name.replace(/[^A-Za-z0-9._-]+/g, '-')}-${term.name.replace(/[^A-Za-z0-9._-]+/g, '-')}.pdf"`);
    res.setHeader('Cache-Control', 'no-store');
    return new StreamableFile(buf);
  }
}

/** Early years (Nursery to UKG): the milestone framework, observations with photos, milestone progress and the learning story. */
@Controller('v1/early-years')
export class EarlyYearsController extends EarlyYearsData {
  constructor(
    db: DbService,
    storage: ObjectStorage,
    private readonly svc: SchoolLifeService,
    private readonly scans: UploadScanService,
  ) {
    super(db, storage);
  }

  private async childFor(tx: Tx, p: UserPrincipal, studentId: string) {
    const [c] = await tx.select({ id: students.id, fullName: students.fullName, sectionId: students.sectionId }).from(students).where(eq(students.id, studentId));
    if (!c) throw new NotFoundException('Student not found');
    await this.svc.assertCanActFor(tx, p, c.sectionId);
    return c;
  }

  // ---- framework --------------------------------------------------------------------------

  @Get('framework')
  @Auth('user', EARLY_YEARS_STAFF)
  framework(@CurrentPrincipal() p: UserPrincipal, @Query('ageBand') ageBand?: string) {
    return this.db.withTenant(p.tenantId, (tx) =>
      tx
        .select()
        .from(eyMilestones)
        .where(ageBand ? eq(eyMilestones.ageBand, z.enum(EY_AGE_BANDS).parse(ageBand)) : undefined)
        .orderBy(asc(eyMilestones.domain), asc(eyMilestones.ageBand), asc(eyMilestones.title)),
    );
  }

  /** Loads the standard milestones. Safe to repeat: ones already there are kept. */
  @Post('framework/seed')
  @HttpCode(200)
  @Auth('user', [...FRAMEWORK_EDITORS])
  seed(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const made = await tx.insert(eyMilestones).values(DEFAULT_MILESTONES.map((m) => ({ ...m, tenantId: p.tenantId }))).onConflictDoNothing().returning({ id: eyMilestones.id });
      await auditUser(tx, p, 'early_years.framework_seeded', 'ey_milestone', undefined, { added: made.length });
      return { added: made.length, total: DEFAULT_MILESTONES.length };
    });
  }

  @Post('framework/milestones')
  @Auth('user', [...FRAMEWORK_EDITORS])
  addMilestone(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(MilestoneBody)) b: z.infer<typeof MilestoneBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [m] = await tx.insert(eyMilestones).values({ ...b, tenantId: p.tenantId }).onConflictDoNothing().returning();
      if (!m) throw new ConflictException('That milestone already exists');
      await auditUser(tx, p, 'early_years.milestone_added', 'ey_milestone', m.id);
      return m;
    });
  }

  @Get('terms')
  @Auth('user', EARLY_YEARS_STAFF)
  terms(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, (tx) => tx.select({ id: academicTerms.id, name: academicTerms.name, startsOn: academicTerms.startsOn, endsOn: academicTerms.endsOn }).from(academicTerms).orderBy(desc(academicTerms.startsOn)));
  }

  // ---- children ---------------------------------------------------------------------------

  /** The children of a class, each with how many milestones are achieved. */
  @Get('classes/:sectionId/students')
  @Auth('user', EARLY_YEARS_STAFF)
  roster(@CurrentPrincipal() p: UserPrincipal, @Param('sectionId', ParseUUIDPipe) sectionId: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await this.svc.assertCanActFor(tx, p, sectionId);
      return tx
        .select({
          id: students.id,
          fullName: students.fullName,
          rollNo: students.rollNo,
          achieved: sql<number>`(select count(*)::int from ey_milestone_status s where s.student_id = students.id and s.status = 'achieved')`,
          observations: sql<number>`(select count(*)::int from ey_observations o where o.student_id = students.id)`,
        })
        .from(students)
        .where(eq(students.sectionId, sectionId))
        .orderBy(asc(students.rollNo));
    });
  }

  @Get('students/:id')
  @Auth('user', EARLY_YEARS_STAFF)
  child(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const c = await this.childFor(tx, p, id);
      return { student: { id: c.id, fullName: c.fullName }, ...(await this.record(tx, id)) };
    });
  }

  /** Multipart: `note`, optional `domain`, `milestoneId`, `status`, `observedOn` and one `photo` (JPEG, PNG or WebP, up to 5 MB). */
  @Post('students/:id/observations')
  @Auth('user', EARLY_YEARS_STAFF)
  @UseInterceptors(FileInterceptor('photo', { limits: { fileSize: MAX_PHOTO_BYTES, files: 1 } }))
  async observe(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(ObservationBody)) b: z.infer<typeof ObservationBody>, @UploadedFile() file?: { buffer: Buffer; size: number }) {
    let mime: string | null = null;
    if (file?.buffer?.length) {
      mime = photoType(file.buffer);
      if (!mime) throw new BadRequestException('The photo must be a JPEG, PNG or WebP image');
      await this.scans.assertClean(file.buffer, 'This photo');
    }
    if (b.status && !b.milestoneId) throw new BadRequestException('Choose the milestone this status is for');
    const key = await this.db.withTenant(p.tenantId, async (tx) => {
      await this.childFor(tx, p, id);
      let domain = b.domain as EyDomain | undefined;
      if (b.milestoneId) {
        const [m] = await tx.select({ domain: eyMilestones.domain }).from(eyMilestones).where(eq(eyMilestones.id, b.milestoneId));
        if (!m) throw new NotFoundException('Milestone not found');
        domain = m.domain as EyDomain;
      }
      if (!domain) throw new BadRequestException('Choose a domain or a milestone');
      const observationId = crypto.randomUUID();
      const photoKey = file && mime ? `tenants/${p.tenantId}/early-years/${observationId}.${mime.slice(6)}` : null;
      if (photoKey && file && mime) await this.storage.put(photoKey, Readable.from(file.buffer), MAX_PHOTO_BYTES, mime);
      await tx.insert(eyObservations).values({ id: observationId, tenantId: p.tenantId, studentId: id, milestoneId: b.milestoneId ?? null, domain, note: b.note, photoKey, status: b.status ?? null, observedOn: b.observedOn ?? (await this.svc.today(tx)), observedBy: p.userId });
      if (b.milestoneId && b.status) await this.setStatus(tx, p, id, b.milestoneId, b.status);
      await auditUser(tx, p, 'early_years.observation_added', 'ey_observation', observationId, { studentId: id, photo: !!photoKey });
      return observationId;
    });
    return this.db.withTenant(p.tenantId, async (tx) => (await tx.select({ id: eyObservations.id, studentId: eyObservations.studentId, domain: eyObservations.domain, note: eyObservations.note, status: eyObservations.status, observedOn: eyObservations.observedOn, hasPhoto: sql<boolean>`${eyObservations.photoKey} is not null` }).from(eyObservations).where(eq(eyObservations.id, key)))[0]);
  }

  private async setStatus(tx: Tx, p: UserPrincipal, studentId: string, milestoneId: string, status: EyStatus) {
    await tx
      .insert(eyMilestoneStatus)
      .values({ tenantId: p.tenantId, studentId, milestoneId, status, updatedBy: p.userId })
      .onConflictDoUpdate({ target: [eyMilestoneStatus.studentId, eyMilestoneStatus.milestoneId], set: { status, updatedBy: p.userId, updatedAt: this.svc.now() } });
  }

  @Put('students/:id/milestones/:milestoneId')
  @Auth('user', EARLY_YEARS_STAFF)
  milestone(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Param('milestoneId', ParseUUIDPipe) milestoneId: string, @Body(new ZodBody(StatusBody)) b: z.infer<typeof StatusBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await this.childFor(tx, p, id);
      const [m] = await tx.select({ id: eyMilestones.id }).from(eyMilestones).where(eq(eyMilestones.id, milestoneId));
      if (!m) throw new NotFoundException('Milestone not found');
      await this.setStatus(tx, p, id, milestoneId, b.status);
      await auditUser(tx, p, 'early_years.milestone_status', 'ey_milestone', milestoneId, { studentId: id, status: b.status });
      return { studentId: id, milestoneId, status: b.status };
    });
  }

  @Get('students/:id/observations/:oid/photo')
  @Auth('user', EARLY_YEARS_STAFF)
  photoFile(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Param('oid', ParseUUIDPipe) oid: string, @Res({ passthrough: true }) res: Response) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await this.childFor(tx, p, id);
      return this.photo(tx, id, oid, res);
    });
  }

  @Get('students/:id/learning-story.pdf')
  @Auth('user', EARLY_YEARS_STAFF)
  storyFile(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Query('termId', ParseUUIDPipe) termId: string, @Res({ passthrough: true }) res: Response) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await this.childFor(tx, p, id);
      await auditUser(tx, p, 'early_years.story_downloaded', 'student', id, { termId });
      return this.story(tx, id, termId, res);
    });
  }
}

/** Parent App: a child's milestones, observations, photos and learning story. */
@Controller('v1/parent/children/:studentId/early-years')
export class ParentEarlyYearsController extends EarlyYearsData {
  constructor(
    db: DbService,
    storage: ObjectStorage,
    private readonly svc: SchoolLifeService,
  ) {
    super(db, storage);
  }

  @Get()
  @Auth('user', ['guardian'])
  overview(@CurrentPrincipal() p: UserPrincipal, @Param('studentId', ParseUUIDPipe) studentId: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const c = await this.svc.guardianChild(tx, p, studentId);
      const rec = await this.record(tx, studentId);
      return { student: { id: c.id, fullName: c.fullName }, milestones: rec.milestones.filter((m) => m.status), observations: rec.observations };
    });
  }

  @Get('observations/:oid/photo')
  @Auth('user', ['guardian'])
  photoFile(@CurrentPrincipal() p: UserPrincipal, @Param('studentId', ParseUUIDPipe) studentId: string, @Param('oid', ParseUUIDPipe) oid: string, @Res({ passthrough: true }) res: Response) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await this.svc.guardianChild(tx, p, studentId);
      return this.photo(tx, studentId, oid, res);
    });
  }

  @Get('learning-story.pdf')
  @Auth('user', ['guardian'])
  storyFile(@CurrentPrincipal() p: UserPrincipal, @Param('studentId', ParseUUIDPipe) studentId: string, @Query('termId', ParseUUIDPipe) termId: string, @Res({ passthrough: true }) res: Response) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await this.svc.guardianChild(tx, p, studentId);
      return this.story(tx, studentId, termId, res);
    });
  }
}
