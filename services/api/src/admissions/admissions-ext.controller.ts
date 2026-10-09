import { BadRequestException, Body, ConflictException, Controller, Delete, Get, Headers, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { and, asc, eq, sql } from 'drizzle-orm';
import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { UserPrincipal } from '../auth/principal.js';
import { auditUser } from '../common/audit.js';
import { ZodBody } from '../common/zod-body.js';
import { Day } from '../common/zod-fields.js';
import { DbService, type Tx } from '../db/db.service.js';
import { admissionLandingPages, studentPriorEducation } from '../db/schema-g1.js';
import { admissionCycles, applications, programs, students, tenants } from '../db/schema.js';
import { SystemLookups } from '../db/system-lookups.service.js';
import { AdmissionsService, cycleConfig, hashToken } from './admissions.service.js';
import { findDuplicates } from './dedupe.js';
import { ADMISSIONS_ROLES } from './admissions.controller.js';

const Id = z.uuid();
const CorrectionBody = z.object({ notes: z.string().trim().min(3).max(1000), items: z.array(z.string().trim().min(1).max(120)).max(20).default([]), dueOn: Day.optional() });
const PromoteBody = z.object({ count: z.number().int().min(1).max(500).optional() });
const LandingBody = z.object({
  headline: z.string().trim().min(3).max(160),
  intro: z.string().trim().max(2000).default(''),
  highlights: z.array(z.object({ title: z.string().trim().min(1).max(80), text: z.string().trim().min(1).max(400) })).max(8).default([]),
  faqs: z.array(z.object({ q: z.string().trim().min(1).max(200), a: z.string().trim().min(1).max(600) })).max(12).default([]),
  contactPhone: z.string().trim().max(20).nullable().optional(),
  contactEmail: z.email().nullable().optional(),
  accentColour: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  published: z.boolean().default(false),
});
const PriorBody = z.object({
  level: z.enum(['primary', 'secondary', 'puc', 'ug', 'pg', 'other']),
  institution: z.string().trim().min(2).max(200),
  board: z.string().trim().max(100).nullable().optional(),
  passingYear: z.number().int().min(1980).max(2100).nullable().optional(),
  percentage: z.number().min(0).max(100).nullable().optional(),
  tcNumber: z.string().trim().max(60).nullable().optional(),
  medium: z.string().trim().max(40).nullable().optional(),
  notes: z.string().trim().max(300).default(''),
});
/** The applicant fixes details of the application when it has been sent back. */
const ResubmitBody = z.object({
  applicantName: z.string().trim().min(2).max(120).optional(),
  dateOfBirth: Day.optional(),
  guardianName: z.string().trim().min(2).max(120).optional(),
  answers: z.record(z.string().max(60), z.union([z.string().max(500), z.number()])).optional(),
  note: z.string().trim().max(500).optional(),
});

/** Admissions beyond the core flow: duplicate check, correction round, ranked waitlist promotion, landing pages and prior education. */
@Controller('v1/admissions')
export class AdmissionsExtController {
  constructor(
    private readonly db: DbService,
    private readonly svc: AdmissionsService,
  ) {}

  /** Records that look like this applicant (same name and a shared birth date or phone). */
  @Get('applications/:id/duplicates')
  @Auth('user', ADMISSIONS_ROLES)
  async duplicates(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => ({ duplicates: await findDuplicates(tx, await this.svc.application(tx, id)) }));
  }

  /** Sends the application back to the applicant to fix named items; review resumes when they resubmit. */
  @Post('applications/:id/request-correction')
  @Auth('user', ADMISSIONS_ROLES)
  @HttpCode(200)
  requestCorrection(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(CorrectionBody)) b: z.infer<typeof CorrectionBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await this.svc.setStatus(tx, { tenantId: p.tenantId, userId: p.userId }, id, 'correction_requested', b.notes);
      const a = await this.svc.application(tx, id);
      const round = a.correctionNotes.map((n, i) => (i === a.correctionNotes.length - 1 ? { ...n, items: b.items } : n));
      await tx.update(applications).set({ correctionNotes: round, correctionDueOn: b.dueOn ?? null, updatedAt: new Date() }).where(eq(applications.id, id));
      return { id, status: 'correction_requested', round: round.length };
    });
  }

  /** Ranked waitlist for a cycle. */
  @Get('cycles/:id/waitlist')
  @Auth('user', ADMISSIONS_ROLES)
  waitlist(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const cycle = await this.svc.cycle(tx, id);
      return { seatsLeft: Math.max(0, await this.svc.seatsLeft(tx, cycle)), entries: await this.ranked(tx, id) };
    });
  }

  private async ranked(tx: Tx, cycleId: string) {
    const rows = await tx
      .select({ id: applications.id, applicationNo: applications.applicationNo, applicantName: applications.applicantName, meritRank: applications.meritRank, meritScore: applications.meritScore, category: applications.category })
      .from(applications)
      .where(and(eq(applications.cycleId, cycleId), eq(applications.status, 'waitlisted')))
      .orderBy(sql`${applications.meritRank} asc nulls last`, asc(applications.submittedAt));
    return rows.map((r, i) => ({ position: i + 1, ...r }));
  }

  /** Offers seats that came free (declined or lapsed offers) to the best-ranked waitlisted applicants, in order. A category with no seat left is skipped. */
  @Post('cycles/:id/waitlist/promote')
  @Auth('user', ADMISSIONS_ROLES)
  @HttpCode(200)
  promote(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(PromoteBody)) b: z.infer<typeof PromoteBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const cycle = await this.svc.cycle(tx, id);
      if (cycle.status !== 'open') throw new BadRequestException('The cycle must be open to make offers');
      const actor = { tenantId: p.tenantId, userId: p.userId };
      const promoted: string[] = [];
      const skipped: { id: string; reason: string }[] = [];
      for (const w of await this.ranked(tx, id)) {
        if (b.count && promoted.length >= b.count) break;
        if ((await this.svc.seatsLeft(tx, cycle)) < 1) break;
        try {
          await tx.execute(sql`savepoint promote_one`);
          await this.svc.setStatus(tx, actor, w.id, 'offered', 'Promoted from the waitlist', { by: 'waitlist' });
          await tx.execute(sql`release savepoint promote_one`);
          promoted.push(w.id);
        } catch (e) {
          await tx.execute(sql`rollback to savepoint promote_one`);
          if (!(e instanceof ConflictException || e instanceof BadRequestException)) throw e;
          skipped.push({ id: w.id, reason: e.message });
        }
      }
      await auditUser(tx, p, 'admissions.waitlist.promoted', 'admission_cycle', id, { promoted: promoted.length, skipped: skipped.length });
      return { promoted: promoted.length, ids: promoted, skipped, remaining: (await this.ranked(tx, id)).length };
    });
  }

  // ---- landing pages ------------------------------------------------------------------------------------------------------

  @Get('cycles/:id/landing')
  @Auth('user', ADMISSIONS_ROLES)
  landing(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const cycle = await this.svc.cycle(tx, id);
      const [row] = await tx.select().from(admissionLandingPages).where(eq(admissionLandingPages.cycleId, id));
      return row ?? { cycleId: id, headline: cycle.name, intro: '', highlights: [], faqs: [], contactPhone: null, contactEmail: null, accentColour: '#1d4ed8', published: false };
    });
  }

  @Put('cycles/:id/landing')
  @Auth('user', ADMISSIONS_ROLES)
  saveLanding(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(LandingBody)) b: z.infer<typeof LandingBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await this.svc.cycle(tx, id);
      const values = { ...b, contactPhone: b.contactPhone ?? null, contactEmail: b.contactEmail ?? null, updatedAt: new Date() };
      const [row] = await tx.insert(admissionLandingPages).values({ tenantId: p.tenantId, cycleId: id, ...values }).onConflictDoUpdate({ target: admissionLandingPages.cycleId, set: values }).returning();
      await auditUser(tx, p, 'admissions.landing.saved', 'admission_cycle', id, { published: b.published });
      return row;
    });
  }

  // ---- prior education ------------------------------------------------------------------------------------------------------

  @Get('applications/:id/prior-education')
  @Auth('user', ADMISSIONS_ROLES)
  appPrior(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, (tx) => tx.select().from(studentPriorEducation).where(eq(studentPriorEducation.applicationId, id)).orderBy(asc(studentPriorEducation.passingYear)));
  }

  @Post('applications/:id/prior-education')
  @Auth('user', ADMISSIONS_ROLES)
  addAppPrior(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(PriorBody)) b: z.infer<typeof PriorBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const a = await this.svc.application(tx, id);
      const [row] = await tx.insert(studentPriorEducation).values({ tenantId: p.tenantId, applicationId: id, studentId: a.studentId, ...b }).returning();
      await auditUser(tx, p, 'admissions.prior_education.added', 'application', id, { level: b.level });
      return row;
    });
  }

  @Get('students/:id/prior-education')
  @Auth('user', [...ADMISSIONS_ROLES, 'hod', 'teacher'])
  studentPrior(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, (tx) => tx.select().from(studentPriorEducation).where(eq(studentPriorEducation.studentId, id)).orderBy(asc(studentPriorEducation.passingYear)));
  }

  @Post('students/:id/prior-education')
  @Auth('user', ADMISSIONS_ROLES)
  addStudentPrior(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(PriorBody)) b: z.infer<typeof PriorBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [st] = await tx.select({ id: students.id }).from(students).where(eq(students.id, id));
      if (!st) throw new NotFoundException('Student not found');
      const [row] = await tx.insert(studentPriorEducation).values({ tenantId: p.tenantId, studentId: id, ...b }).returning();
      await auditUser(tx, p, 'students.prior_education.added', 'student', id, { level: b.level });
      return row;
    });
  }

  @Delete('prior-education/:id')
  @Auth('user', ADMISSIONS_ROLES)
  @HttpCode(200)
  removePrior(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [row] = await tx.delete(studentPriorEducation).where(eq(studentPriorEducation.id, id)).returning({ id: studentPriorEducation.id });
      if (!row) throw new NotFoundException('Record not found');
      return { ok: true };
    });
  }
}

/** The applicant-facing side: the cycle's landing page and fixing an application that was sent back. */
@Controller('v1/public/admissions/:slug')
export class PublicAdmissionsExtController {
  constructor(
    private readonly db: DbService,
    private readonly svc: AdmissionsService,
    private readonly system: SystemLookups,
  ) {}

  private async tenant(slug: string) {
    const t = await this.system.tenantBySlug(slug);
    if (!t) throw new NotFoundException('Institution not found');
    return t;
  }

  /** A published landing page with its open cycle, so the page can link to the form. */
  @Get('landing/:cycleId')
  async landing(@Param('slug') slug: string, @Param('cycleId', ParseUUIDPipe) cycleId: string) {
    const t = await this.tenant(slug);
    return this.db.withTenant(t.id, async (tx) => {
      const [row] = await tx
        .select({ l: admissionLandingPages, c: admissionCycles, programName: programs.name })
        .from(admissionLandingPages)
        .innerJoin(admissionCycles, eq(admissionCycles.id, admissionLandingPages.cycleId))
        .innerJoin(programs, eq(programs.id, admissionCycles.programId))
        .where(and(eq(admissionLandingPages.cycleId, cycleId), eq(admissionLandingPages.published, true)));
      if (!row) throw new NotFoundException('This page is not available');
      const [inst] = await tx.select({ name: tenants.name }).from(tenants);
      const cfg = cycleConfig(row.c);
      return {
        institution: inst?.name ?? '',
        cycle: { id: row.c.id, name: row.c.name, programName: row.programName, status: row.c.status, opensOn: row.c.opensOn, closesOn: row.c.closesOn, seats: row.c.seats, applicationFeePaise: row.c.applicationFeePaise },
        documents: cfg.documents.map((d) => ({ label: d.label, required: d.required })),
        headline: row.l.headline,
        intro: row.l.intro,
        highlights: row.l.highlights,
        faqs: row.l.faqs,
        contactPhone: row.l.contactPhone,
        contactEmail: row.l.contactEmail,
        accentColour: row.l.accentColour,
      };
    });
  }

  /** What was asked to be corrected, for an application that was sent back. */
  @Get('applications/:id/corrections')
  async corrections(@Param('slug') slug: string, @Param('id', ParseUUIDPipe) id: string, @Headers('x-application-token') token?: string) {
    const t = await this.tenant(slug);
    return this.db.withTenant(t.id, async (tx) => {
      const a = await this.mine(tx, id, token);
      const last = a.correctionNotes[a.correctionNotes.length - 1] ?? null;
      return { status: a.status, open: a.status === 'correction_requested', dueOn: a.correctionDueOn, latest: last ? { at: last.at, notes: last.notes, items: last.items } : null, rounds: a.correctionNotes.length };
    });
  }

  /** The applicant sends the corrected application back; review resumes. */
  @Post('applications/:id/resubmit')
  @HttpCode(200)
  async resubmit(@Param('slug') slug: string, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(ResubmitBody)) b: z.infer<typeof ResubmitBody>, @Headers('x-application-token') token?: string) {
    const t = await this.tenant(slug);
    return this.db.withTenant(t.id, async (tx) => {
      const a = await this.mine(tx, id, token);
      if (a.status !== 'correction_requested') throw new BadRequestException('This application has not been sent back for correction');
      const patch: Partial<typeof applications.$inferInsert> = { updatedAt: new Date() };
      if (b.applicantName) patch.applicantName = b.applicantName;
      if (b.dateOfBirth) patch.dateOfBirth = b.dateOfBirth;
      if (b.guardianName) patch.guardianName = b.guardianName;
      if (b.answers) patch.answers = { ...a.answers, ...b.answers };
      await tx.update(applications).set(patch).where(eq(applications.id, id));
      await this.svc.setStatus(tx, { tenantId: t.id, userId: null }, id, 'under_review', b.note ?? 'Corrected by the applicant', { by: 'applicant' });
      return { id, status: 'under_review' };
    });
  }

  private async mine(tx: Tx, id: string, token: string | undefined) {
    const [a] = await tx.select().from(applications).where(eq(applications.id, id));
    const ok =
      a &&
      token &&
      token.length < 200 &&
      (() => {
        const x = Buffer.from(hashToken(token));
        const y = Buffer.from(a.accessTokenHash);
        return x.length === y.length && timingSafeEqual(x, y);
      })();
    if (!a || !ok) throw new NotFoundException('Application not found');
    return a;
  }
}
