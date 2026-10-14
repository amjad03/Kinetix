import { BadRequestException, Body, ConflictException, Controller, Get, Headers, Ip, NotFoundException, Param, ParseUUIDPipe, Post, Put, Query, Res, UnauthorizedException } from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import type { Response } from 'express';
import { z } from 'zod';
import { audit } from '../common/audit.js';
import { Day } from '../common/ops.js';
import { RateLimiter } from '../common/rate-limiter.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService, type Tx } from '../db/db.service.js';
import { SystemLookups } from '../db/system-lookups.service.js';
import { driveRegistrations, driveRounds, placementCompanies, placementDrives, students, tenants } from '../db/schema.js';
import { placementCompanyContacts, placementFeedback } from '../db/schema-placements.js';
import { keyHash } from './placements-depth.controller.js';
import { PlacementsService } from './placements.service.js';

const RegisterBody = z.object({
  name: z.string().trim().min(2).max(120),
  sector: z.string().trim().max(80).default(''),
  website: z.url().optional(),
  city: z.string().trim().max(80).default(''),
  description: z.string().trim().max(2000).default(''),
  contactName: z.string().trim().min(2).max(80),
  designation: z.string().trim().max(120).default(''),
  contactEmail: z.email(),
  contactPhone: z.string().trim().max(30).optional(),
});
const JdBody = z.object({
  title: z.string().trim().min(2).max(160),
  kind: z.enum(['placement', 'internship']).default('placement'),
  roleTitle: z.string().trim().min(1).max(120),
  ctcLpa: z.number().min(0).max(1000).optional(),
  stipendMonthly: z.number().int().min(0).max(1_000_000).optional(),
  location: z.string().trim().max(120).default(''),
  description: z.string().trim().min(10).max(4000),
  skills: z.string().trim().max(500).default(''),
  bond: z.string().trim().max(300).default(''),
  minCgpa: z.number().min(0).max(10).optional(),
  maxBacklogs: z.number().int().min(0).max(50).optional(),
  driveDate: Day.optional(),
});
const ResultsBody = z.object({ results: z.array(z.object({ rollNo: z.string().trim().min(1).max(40), result: z.enum(['pass', 'fail', 'absent']), note: z.string().trim().max(300).default('') })).min(1).max(1000) });
const Rating = z.number().int().min(1).max(5);
const FeedbackBody = z.object({ respondentName: z.string().trim().min(2).max(120), respondentEmail: z.email().optional(), year: z.number().int().min(2000).max(2100), r1: Rating, r2: Rating, r3: Rating, r4: Rating, r5: Rating, overall: Rating, comments: z.string().trim().max(2000).default('') });

/**
 * The recruiter portal, without an institution login: a company registers itself (the placement cell verifies it and
 * hands over a portal key), then with the key (`x-recruiter-key`) posts job descriptions, downloads the shortlist of
 * its drives, uploads round results by roll number and gives employer feedback. Rate limited.
 */
@Controller('v1/public/recruiters/:slug')
export class RecruiterPortalController {
  constructor(
    private readonly db: DbService,
    private readonly lookups: SystemLookups,
    private readonly limiter: RateLimiter,
    private readonly svc: PlacementsService,
  ) {}

  private async tenant(slug: string, ip: string) {
    await this.limiter.hit(`recruiter:${ip}`, 60, 60_000);
    const t = /^[a-z0-9-]{1,60}$/.test(slug) ? await this.lookups.tenantBySlug(slug) : undefined;
    if (!t) throw new NotFoundException('Institution not found');
    return t;
  }

  /** The company the key belongs to (active, key matching), inside the tenant transaction. */
  private async company(tx: Tx, key: string | undefined) {
    const [id] = (key ?? '').split('.');
    if (!key || !z.uuid().safeParse(id).success) throw new UnauthorizedException('Give your portal key');
    const [c] = await tx.select().from(placementCompanies).where(eq(placementCompanies.id, id));
    const want = Buffer.from(c?.portalTokenHash ?? '0'.repeat(64));
    const got = Buffer.from(keyHash(key));
    if (!c || c.status !== 'active' || want.length !== got.length || !timingSafeEqual(want, got)) throw new UnauthorizedException('This portal key is not valid; ask the placement cell for a new one');
    return c;
  }

  private async ownDrive(tx: Tx, companyId: string, driveId: string) {
    const [d] = await tx.select().from(placementDrives).where(and(eq(placementDrives.id, driveId), eq(placementDrives.companyId, companyId)));
    if (!d) throw new NotFoundException('Drive not found');
    return d;
  }

  /** The institution's name, for the registration page. */
  @Get('')
  async institution(@Param('slug') slug: string, @Ip() ip: string) {
    const t = await this.tenant(slug, ip);
    return this.db.withTenant(t.id, async (tx) => {
      const [row] = await tx.select({ name: tenants.name }).from(tenants);
      return { name: row?.name ?? '' };
    });
  }

  /** A company registers; it waits for the placement cell to verify it. */
  @Post('register')
  async register(@Param('slug') slug: string, @Ip() ip: string, @Body(new ZodBody(RegisterBody)) b: z.infer<typeof RegisterBody>) {
    const t = await this.tenant(slug, ip);
    await this.limiter.hit(`recruiter-register:${ip}`, 5, 3_600_000);
    return this.db.withTenant(t.id, async (tx) => {
      const [dup] = await tx.select({ id: placementCompanies.id }).from(placementCompanies).where(sql`lower(${placementCompanies.name}) = ${b.name.toLowerCase()}`);
      if (dup) throw new ConflictException('This company is already registered; ask the placement cell for your portal key');
      const [c] = await tx.insert(placementCompanies).values({ tenantId: t.id, name: b.name, sector: b.sector, website: b.website ?? null, city: b.city, description: b.description, contactName: b.contactName, contactEmail: b.contactEmail, contactPhone: b.contactPhone ?? null, status: 'pending', selfRegistered: true }).returning();
      await tx.insert(placementCompanyContacts).values({ tenantId: t.id, companyId: c.id, name: b.contactName, designation: b.designation, email: b.contactEmail, phone: b.contactPhone ?? null, isPrimary: true });
      await audit(tx, { tenantId: t.id, actorType: 'system', action: 'placement.company_self_registered', subjectType: 'company', subjectId: c.id, data: { name: b.name, contactEmail: b.contactEmail } });
      return { status: 'pending', message: 'Thank you. The placement cell will verify your company and send you a portal key.' };
    });
  }

  /** The company and its drives with how many registered and were selected. */
  @Get('me')
  async me(@Param('slug') slug: string, @Ip() ip: string, @Headers('x-recruiter-key') key?: string) {
    const t = await this.tenant(slug, ip);
    return this.db.withTenant(t.id, async (tx) => {
      const c = await this.company(tx, key);
      const drives = await tx
        .select({ id: placementDrives.id, title: placementDrives.title, kind: placementDrives.kind, roleTitle: placementDrives.roleTitle, status: placementDrives.status, driveDate: placementDrives.driveDate, ctcLpa: placementDrives.ctcLpa, registrations: sql<number>`(select count(*)::int from drive_registrations r where r.drive_id = "placement_drives"."id" and r.status <> 'withdrawn')`, selected: sql<number>`(select count(*)::int from placement_offers o where o.drive_id = "placement_drives"."id")` })
        .from(placementDrives)
        .where(eq(placementDrives.companyId, c.id))
        .orderBy(desc(placementDrives.createdAt));
      return { company: { id: c.id, name: c.name, sector: c.sector, city: c.city }, drives };
    });
  }

  /** Posts a job description: it becomes a draft drive the placement cell reviews and opens. */
  @Post('drives')
  async postJd(@Param('slug') slug: string, @Ip() ip: string, @Body(new ZodBody(JdBody)) b: z.infer<typeof JdBody>, @Headers('x-recruiter-key') key?: string) {
    const t = await this.tenant(slug, ip);
    return this.db.withTenant(t.id, async (tx) => {
      const c = await this.company(tx, key);
      const [d] = await tx.insert(placementDrives).values({ tenantId: t.id, companyId: c.id, ...b, minCgpa: b.minCgpa ?? 0, maxBacklogs: b.maxBacklogs ?? 0, status: 'draft', postedByRecruiter: true }).returning();
      await audit(tx, { tenantId: t.id, actorType: 'system', action: 'placement.jd_posted', subjectType: 'drive', subjectId: d.id, data: { company: c.name, title: b.title } });
      return { id: d.id, status: d.status };
    });
  }

  /** The shortlist of one of the company's drives, as JSON or CSV. */
  @Get('drives/:id/shortlist')
  async shortlist(@Param('slug') slug: string, @Ip() ip: string, @Param('id', ParseUUIDPipe) id: string, @Res({ passthrough: true }) res: Response, @Query('format') format?: string, @Headers('x-recruiter-key') key?: string) {
    const t = await this.tenant(slug, ip);
    return this.db.withTenant(t.id, async (tx) => {
      const c = await this.company(tx, key);
      const d = await this.ownDrive(tx, c.id, id);
      if (d.status === 'draft') throw new ConflictException('This drive has not opened yet');
      const out = await this.svc.shortlist(tx, id);
      await audit(tx, { tenantId: t.id, actorType: 'system', action: 'placement.shortlist_downloaded', subjectType: 'drive', subjectId: id, data: { company: c.name, via: 'recruiter_portal', rows: out.rows.length } });
      if (format !== 'csv') return { drive: out.drive, rounds: out.rounds, rows: out.rows.map(({ id: _i, ...r }) => r) };
      res.setHeader('content-type', 'text/csv; charset=utf-8');
      res.setHeader('content-disposition', 'attachment; filename="shortlist.csv"');
      return out.csv;
    });
  }

  /** Uploads one round's results by roll number. */
  @Put('drives/:id/rounds/:roundId/results')
  async results(@Param('slug') slug: string, @Ip() ip: string, @Param('id', ParseUUIDPipe) id: string, @Param('roundId', ParseUUIDPipe) roundId: string, @Body(new ZodBody(ResultsBody)) b: z.infer<typeof ResultsBody>, @Headers('x-recruiter-key') key?: string) {
    const t = await this.tenant(slug, ip);
    return this.db.withTenant(t.id, async (tx) => {
      const c = await this.company(tx, key);
      await this.ownDrive(tx, c.id, id);
      const [round] = await tx.select({ id: driveRounds.id }).from(driveRounds).where(and(eq(driveRounds.id, roundId), eq(driveRounds.driveId, id)));
      if (!round) throw new NotFoundException('Round not found');
      const regs = await tx.select({ id: driveRegistrations.id, rollNo: students.rollNo }).from(driveRegistrations).innerJoin(students, eq(students.id, driveRegistrations.studentId)).where(and(eq(driveRegistrations.driveId, id), inArray(sql`lower(${students.rollNo})`, b.results.map((r) => r.rollNo.toLowerCase()))));
      const unknown = b.results.filter((r) => !regs.some((x) => x.rollNo.toLowerCase() === r.rollNo.toLowerCase()));
      if (unknown.length) throw new BadRequestException({ statusCode: 400, error: 'Bad Request', message: `Not registered for this drive: ${unknown.map((u) => u.rollNo).join(', ')}`, unknown: unknown.map((u) => u.rollNo) });
      const out = await this.svc.recordResults(tx, { tenantId: t.id, userId: null }, id, roundId, b.results.map((r) => ({ registrationId: regs.find((x) => x.rollNo.toLowerCase() === r.rollNo.toLowerCase())!.id, result: r.result, note: r.note })));
      await audit(tx, { tenantId: t.id, actorType: 'system', action: 'placement.round_results', subjectType: 'drive', subjectId: id, data: { roundId, count: b.results.length, company: c.name, via: 'recruiter_portal' } });
      return out;
    });
  }

  /** The employer feedback form on the institution's graduates (NBA indirect attainment). */
  @Post('feedback')
  async feedback(@Param('slug') slug: string, @Ip() ip: string, @Body(new ZodBody(FeedbackBody)) b: z.infer<typeof FeedbackBody>, @Headers('x-recruiter-key') key?: string) {
    const t = await this.tenant(slug, ip);
    return this.db.withTenant(t.id, async (tx) => {
      const c = await this.company(tx, key);
      const [row] = await tx.insert(placementFeedback).values({ tenantId: t.id, kind: 'employer', companyId: c.id, respondentName: b.respondentName, respondentEmail: b.respondentEmail ?? null, respondentOrg: c.name, year: b.year, r1: b.r1, r2: b.r2, r3: b.r3, r4: b.r4, r5: b.r5, overall: b.overall, comments: b.comments, source: 'recruiter_portal' }).returning();
      await audit(tx, { tenantId: t.id, actorType: 'system', action: 'placement.feedback_received', subjectType: 'placement_feedback', subjectId: row.id, data: { kind: 'employer', company: c.name } });
      return { id: row.id };
    });
  }

  /** The rounds of a drive, to pick which one results are for. */
  @Get('drives/:id/rounds')
  async rounds(@Param('slug') slug: string, @Ip() ip: string, @Param('id', ParseUUIDPipe) id: string, @Headers('x-recruiter-key') key?: string) {
    const t = await this.tenant(slug, ip);
    return this.db.withTenant(t.id, async (tx) => {
      const c = await this.company(tx, key);
      await this.ownDrive(tx, c.id, id);
      return tx.select({ id: driveRounds.id, seq: driveRounds.seq, name: driveRounds.name, kind: driveRounds.kind, scheduledOn: driveRounds.scheduledOn }).from(driveRounds).where(eq(driveRounds.driveId, id)).orderBy(asc(driveRounds.seq));
    });
  }
}
