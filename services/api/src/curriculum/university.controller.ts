import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, HttpCode, Inject, Ip, NotFoundException, Param, ParseUUIDPipe, Post, Put, Res } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import type { Response } from 'express';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { RoleName, UserPrincipal } from '../auth/principal.js';
import { auditUser } from '../common/audit.js';
import { Day } from '../common/ops.js';
import { RateLimiter } from '../common/rate-limiter.js';
import { ZodBody } from '../common/zod-body.js';
import { ENV, type Env } from '../config/env.js';
import { DbService, type Tx } from '../db/db.service.js';
import { SystemLookups } from '../db/system-lookups.service.js';
import { examResults, examSessions, institutionProfiles, programs, sections, students, tenants } from '../db/schema.js';
import { GOVERNANCE_RULES, type GovernanceModel } from '../institution/presets.js';
import { AFFILIATION_MODELS, affiliatedInstitutions, convocationCandidates, convocations } from '../db/schema-curriculum.js';
import { found } from '../placements/placements.access.js';
import { degreeCertificatePdf } from './documents.js';

const ADMINS: RoleName[] = ['tenant_admin', 'principal', 'university_admin'];
const REGISTRAR: RoleName[] = [...ADMINS, 'exam_controller'];
const VIEW: RoleName[] = [...REGISTRAR, 'hod'];

const mac = (secret: string, tenantId: string, no: string) => createHmac('sha256', secret).update(`degree:${tenantId}:${no}`).digest('base64url').slice(0, 16);
/** The signed code on a degree certificate's QR: "<certificate no>.<mac>". */
export const degreeCode = (secret: string, tenantId: string, no: string) => `${no}.${mac(secret, tenantId, no)}`;
/** The certificate number of a code, or null when it is malformed or the mac does not match. */
export function parseDegreeCode(secret: string, tenantId: string, code: string): string | null {
  const m = /^(.{3,60})\.([A-Za-z0-9_-]{16})$/.exec(code);
  if (!m) return null;
  const want = Buffer.from(mac(secret, tenantId, m[1]));
  const got = Buffer.from(m[2]);
  return got.length === want.length && timingSafeEqual(got, want) ? m[1] : null;
}

const InstitutionBody = z.object({
  code: z.string().trim().min(2).max(30),
  name: z.string().trim().min(2).max(200),
  model: z.enum(AFFILIATION_MODELS).default('affiliated'),
  university: z.string().trim().max(200).default(''),
  city: z.string().trim().max(100).default(''),
  aisheCode: z.string().trim().max(30).optional(),
  affiliationValidTo: Day.optional(),
});
const InstitutionPatch = z.object({ active: z.boolean().optional(), affiliationValidTo: Day.nullish(), model: z.enum(AFFILIATION_MODELS).optional() });
const ConvocationBody = z.object({ name: z.string().trim().min(3).max(150), heldOn: Day, graduationYear: z.number().int().min(1990).max(2100), programId: z.uuid().optional() });
const CandidateBody = z.object({ studentId: z.uuid() });
const RegisterBody = z.object({ studentId: z.uuid().optional() });

/** Affiliated institutions and convocation: eligible graduates, registration and degree certificates with a public check. */
@Controller('v1/university')
export class UniversityController {
  constructor(
    private readonly db: DbService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  // ---- Affiliated institutions ----

  @Get('institutions')
  @Auth('user', VIEW)
  institutions(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, (tx) => tx.select().from(affiliatedInstitutions).orderBy(asc(affiliatedInstitutions.name)));
  }

  @Post('institutions')
  @Auth('user', ADMINS)
  addInstitution(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(InstitutionBody)) b: z.infer<typeof InstitutionBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [dup] = await tx.select({ id: affiliatedInstitutions.id }).from(affiliatedInstitutions).where(eq(affiliatedInstitutions.code, b.code));
      if (dup) throw new ConflictException('An institution with this code already exists');
      const [row] = await tx.insert(affiliatedInstitutions).values({ tenantId: p.tenantId, ...b, aisheCode: b.aisheCode ?? null, affiliationValidTo: b.affiliationValidTo ?? null }).returning();
      await auditUser(tx, p, 'university.institution_added', 'affiliated_institution', row.id, { code: b.code, model: b.model });
      return row;
    });
  }

  @Put('institutions/:id')
  @Auth('user', ADMINS)
  updateInstitution(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(InstitutionPatch)) b: z.infer<typeof InstitutionPatch>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      found((await tx.select({ id: affiliatedInstitutions.id }).from(affiliatedInstitutions).where(eq(affiliatedInstitutions.id, id)))[0], 'Institution');
      const set = { ...(b.active !== undefined && { active: b.active }), ...(b.model && { model: b.model }), ...(b.affiliationValidTo !== undefined && { affiliationValidTo: b.affiliationValidTo }) };
      if (!Object.keys(set).length) throw new BadRequestException('Nothing to change');
      const [row] = await tx.update(affiliatedInstitutions).set(set).where(eq(affiliatedInstitutions.id, id)).returning();
      await auditUser(tx, p, 'university.institution_updated', 'affiliated_institution', id, set);
      return row;
    });
  }

  // ---- Convocation ----

  @Get('convocations')
  @Auth('user', VIEW)
  list(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, (tx) =>
      tx
        .select({
          ...ConvocationCols,
          candidates: sql<number>`(select count(*)::int from convocation_candidates c where c.convocation_id = ${convocations.id})`,
          registered: sql<number>`(select count(*)::int from convocation_candidates c where c.convocation_id = ${convocations.id} and c.status in ('registered','degree_issued'))`,
        })
        .from(convocations)
        .orderBy(desc(convocations.heldOn)),
    );
  }

  @Post('convocations')
  @Auth('user', REGISTRAR)
  create(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(ConvocationBody)) b: z.infer<typeof ConvocationBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      if (b.programId) found((await tx.select({ id: programs.id }).from(programs).where(eq(programs.id, b.programId)))[0], 'Programme');
      const [row] = await tx.insert(convocations).values({ tenantId: p.tenantId, name: b.name, heldOn: b.heldOn, graduationYear: b.graduationYear, programId: b.programId ?? null, createdBy: p.userId }).returning();
      await auditUser(tx, p, 'convocation.created', 'convocation', row.id, { name: b.name });
      return row;
    });
  }

  @Get('convocations/:id')
  @Auth('user', VIEW)
  one(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const c = found((await tx.select().from(convocations).where(eq(convocations.id, id)))[0], 'Convocation');
      const candidates = await tx
        .select({ id: convocationCandidates.id, studentId: students.id, name: students.fullName, rollNo: students.rollNo, className: sections.displayName, status: convocationCandidates.status, cgpa: convocationCandidates.cgpa, degreeTitle: convocationCandidates.degreeTitle, certificateNo: convocationCandidates.certificateNo })
        .from(convocationCandidates)
        .innerJoin(students, eq(students.id, convocationCandidates.studentId))
        .innerJoin(sections, eq(sections.id, students.sectionId))
        .where(eq(convocationCandidates.convocationId, id))
        .orderBy(asc(students.fullName));
      return { ...c, candidates };
    });
  }

  /**
   * Builds the eligible graduates list: students of the programme in its final semester (or already alumni)
   * whose latest result is a pass. Re-running adds newly eligible students and leaves earlier ones as they are.
   */
  @Post('convocations/:id/eligible')
  @HttpCode(200)
  @Auth('user', REGISTRAR)
  generate(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const c = found((await tx.select().from(convocations).where(eq(convocations.id, id)))[0], 'Convocation');
      if (c.status === 'held') throw new ConflictException('This convocation has been held');
      const pool = await tx
        .select({ id: students.id, programName: programs.name })
        .from(students)
        .innerJoin(sections, eq(sections.id, students.sectionId))
        .innerJoin(programs, eq(programs.id, sections.programId))
        .where(and(c.programId ? eq(programs.id, c.programId) : undefined, inArray(students.status, ['active', 'alumni', 'promoted']), sql`(${sections.term} >= ${programs.termCount} or ${students.status} = 'alumni')`));
      if (!pool.length) return { added: 0, eligible: 0 };
      const results = await tx
        .select({ studentId: examResults.studentId, cgpa: examResults.cgpa, outcome: examResults.outcome, at: examResults.computedAt })
        .from(examResults)
        .innerJoin(examSessions, eq(examSessions.id, examResults.sessionId))
        .where(inArray(examResults.studentId, pool.map((s) => s.id)));
      const latest = new Map<string, (typeof results)[number]>();
      for (const r of results) if (!latest.has(r.studentId) || latest.get(r.studentId)!.at < r.at) latest.set(r.studentId, r);
      const rows = pool.flatMap((s) => {
        const r = latest.get(s.id);
        return r && r.outcome === 'pass' ? [{ tenantId: p.tenantId, convocationId: id, studentId: s.id, cgpa: r.cgpa, degreeTitle: s.programName }] : [];
      });
      const added = rows.length ? await tx.insert(convocationCandidates).values(rows).onConflictDoNothing().returning({ id: convocationCandidates.id }) : [];
      await auditUser(tx, p, 'convocation.eligible_generated', 'convocation', id, { eligible: rows.length, added: added.length });
      return { added: added.length, eligible: rows.length };
    });
  }

  /** Adds a graduate who does not show up automatically (for example, a result cleared after revaluation). */
  @Post('convocations/:id/candidates')
  @Auth('user', REGISTRAR)
  addCandidate(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(CandidateBody)) b: z.infer<typeof CandidateBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      found((await tx.select({ id: convocations.id }).from(convocations).where(eq(convocations.id, id)))[0], 'Convocation');
      const [s] = await tx.select({ programName: programs.name }).from(students).innerJoin(sections, eq(sections.id, students.sectionId)).innerJoin(programs, eq(programs.id, sections.programId)).where(eq(students.id, b.studentId));
      if (!s) throw new NotFoundException('Student not found');
      const [row] = await tx.insert(convocationCandidates).values({ tenantId: p.tenantId, convocationId: id, studentId: b.studentId, degreeTitle: s.programName }).onConflictDoNothing().returning();
      if (!row) throw new ConflictException('This student is already on the list');
      await auditUser(tx, p, 'convocation.candidate_added', 'convocation', id, { studentId: b.studentId });
      return row;
    });
  }

  private async setStatus(p: UserPrincipal, id: string, from: string[], to: 'registration_open' | 'closed' | 'held') {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const c = found((await tx.select().from(convocations).where(eq(convocations.id, id)))[0], 'Convocation');
      if (!from.includes(c.status)) throw new ConflictException(`This convocation is ${c.status.replace('_', ' ')}`);
      const [row] = await tx.update(convocations).set({ status: to }).where(eq(convocations.id, id)).returning();
      await auditUser(tx, p, `convocation.${to}`, 'convocation', id);
      return row;
    });
  }

  @Post('convocations/:id/open')
  @HttpCode(200)
  @Auth('user', REGISTRAR)
  open(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.setStatus(p, id, ['draft', 'closed'], 'registration_open');
  }

  @Post('convocations/:id/close')
  @HttpCode(200)
  @Auth('user', REGISTRAR)
  close(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.setStatus(p, id, ['registration_open'], 'closed');
  }

  /** A graduate registers to attend (the student, a guardian cannot; staff may do it for a student). */
  @Post('convocations/:id/register')
  @HttpCode(200)
  @Auth('user', ['student', ...REGISTRAR])
  register(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(RegisterBody)) b: z.infer<typeof RegisterBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const c = found((await tx.select().from(convocations).where(eq(convocations.id, id)))[0], 'Convocation');
      if (c.status !== 'registration_open') throw new ConflictException('Registration is not open for this convocation');
      const staff = p.roles.some((r) => REGISTRAR.includes(r));
      let studentId = b.studentId;
      if (!staff) {
        const [me] = await tx.select({ id: students.id }).from(students).where(eq(students.userId, p.userId));
        if (!me || (studentId && studentId !== me.id)) throw new ForbiddenException('You can only register yourself');
        studentId = me.id;
      }
      if (!studentId) throw new BadRequestException('Choose the student to register');
      const [cand] = await tx.select().from(convocationCandidates).where(and(eq(convocationCandidates.convocationId, id), eq(convocationCandidates.studentId, studentId)));
      if (!cand) throw new NotFoundException('This student is not on the eligible list');
      if (cand.status === 'withheld') throw new ForbiddenException('Your degree is on hold. Contact the examination office.');
      if (cand.status !== 'eligible') return cand;
      const [row] = await tx.update(convocationCandidates).set({ status: 'registered', registeredAt: new Date() }).where(eq(convocationCandidates.id, cand.id)).returning();
      await auditUser(tx, p, 'convocation.registered', 'convocation', id, { studentId });
      return row;
    });
  }

  @Post('convocations/:id/candidates/:candidateId/withhold')
  @HttpCode(200)
  @Auth('user', REGISTRAR)
  withhold(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Param('candidateId', ParseUUIDPipe) candidateId: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const cand = found((await tx.select().from(convocationCandidates).where(and(eq(convocationCandidates.id, candidateId), eq(convocationCandidates.convocationId, id))))[0], 'Candidate');
      if (cand.status === 'degree_issued') throw new ConflictException('The degree has already been issued');
      const [row] = await tx.update(convocationCandidates).set({ status: 'withheld' }).where(eq(convocationCandidates.id, candidateId)).returning();
      await auditUser(tx, p, 'convocation.withheld', 'convocation', id, { studentId: cand.studentId });
      return row;
    });
  }

  /** Numbers and issues the degree for every registered graduate, then marks the convocation as held. */
  @Post('convocations/:id/issue')
  @HttpCode(200)
  @Auth('user', ADMINS)
  issue(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const c = found((await tx.select().from(convocations).where(eq(convocations.id, id)))[0], 'Convocation');
      if (c.status === 'held') throw new ConflictException('Degrees were already issued for this convocation');
      const [prof] = await tx.select({ g: institutionProfiles.governanceModel }).from(institutionProfiles);
      if (prof?.g && !GOVERNANCE_RULES[prof.g as GovernanceModel].ownDegree) throw new ForbiddenException('This institution is affiliated: degrees are awarded by the affiliating university');
      const todo = await tx
        .select({ id: convocationCandidates.id })
        .from(convocationCandidates)
        .innerJoin(students, eq(students.id, convocationCandidates.studentId))
        .where(and(eq(convocationCandidates.convocationId, id), eq(convocationCandidates.status, 'registered')))
        .orderBy(asc(students.fullName));
      if (!todo.length) throw new BadRequestException('No registered graduates to issue degrees to');
      const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(convocationCandidates).where(and(sql`${convocationCandidates.certificateNo} like ${`DEG-${c.graduationYear}-%`}`));
      let seq = n;
      for (const t of todo) {
        seq += 1;
        await tx.update(convocationCandidates).set({ status: 'degree_issued', certificateNo: `DEG-${c.graduationYear}-${String(seq).padStart(4, '0')}`, issuedAt: new Date() }).where(eq(convocationCandidates.id, t.id));
      }
      await tx.update(convocations).set({ status: 'held' }).where(eq(convocations.id, id));
      await auditUser(tx, p, 'convocation.degrees_issued', 'convocation', id, { issued: todo.length });
      return { issued: todo.length };
    });
  }

  /** The degree certificate with its QR. Staff, or the graduate. */
  @Get('convocations/:id/candidates/:candidateId/certificate.pdf')
  @Auth('user', ['student', ...VIEW])
  async certificate(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Param('candidateId', ParseUUIDPipe) candidateId: string, @Res() res: Response) {
    const pdf = await this.db.withTenant(p.tenantId, async (tx) => {
      const cand = found((await tx.select().from(convocationCandidates).where(and(eq(convocationCandidates.id, candidateId), eq(convocationCandidates.convocationId, id))))[0], 'Candidate');
      const [st] = await tx.select({ name: students.fullName, userId: students.userId }).from(students).where(eq(students.id, cand.studentId));
      if (!p.roles.some((r) => VIEW.includes(r)) && st.userId !== p.userId) throw new NotFoundException('Candidate not found');
      if (cand.status !== 'degree_issued' || !cand.certificateNo) throw new ConflictException('The degree has not been issued yet');
      const c = found((await tx.select().from(convocations).where(eq(convocations.id, id)))[0], 'Convocation');
      const [t] = await tx.select({ name: tenants.name, slug: tenants.slug }).from(tenants);
      return degreeCertificatePdf({
        institution: t.name,
        student: st.name,
        degree: cand.degreeTitle,
        cgpa: cand.cgpa,
        certificateNo: cand.certificateNo,
        conferredOn: c.heldOn,
        convocation: c.name,
        verifyUrl: `${this.env.VERIFY_BASE_URL.replace(/\/$/, '')}/degree/${t.slug}/${encodeURIComponent(degreeCode(this.env.JWT_SECRET, p.tenantId, cand.certificateNo))}`,
      });
    });
    res.setHeader('content-type', 'application/pdf');
    res.setHeader('content-disposition', 'inline; filename="degree-certificate.pdf"');
    res.end(pdf);
  }
}

const ConvocationCols = {
  id: convocations.id,
  name: convocations.name,
  heldOn: convocations.heldOn,
  graduationYear: convocations.graduationYear,
  programId: convocations.programId,
  status: convocations.status,
};

/** The QR on a degree certificate. No sign-in, rate limited; shows only the institution, holder, degree and whether it is genuine. */
@Controller('v1/public')
export class DegreeVerifyController {
  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly db: DbService,
    private readonly lookups: SystemLookups,
    private readonly limiter: RateLimiter,
  ) {}

  @Get('verify-degree/:slug/:code')
  async verify(@Param('slug') slug: string, @Param('code') code: string, @Ip() ip: string): Promise<{ status: 'valid' | 'not_found'; institution?: string; name?: string; degree?: string; certificateNo?: string; conferredOn?: string }> {
    await this.limiter.hit(`verify:${ip}`, 30, 60_000);
    const tenant = /^[a-z0-9-]{1,60}$/.test(slug) ? await this.lookups.tenantBySlug(slug) : undefined;
    const no = tenant ? parseDegreeCode(this.env.JWT_SECRET, tenant.id, code) : null;
    if (!tenant || !no) return { status: 'not_found' };
    return this.db.withTenant(tenant.id, async (tx: Tx) => {
      const [r] = await tx
        .select({ name: students.fullName, degree: convocationCandidates.degreeTitle, heldOn: convocations.heldOn })
        .from(convocationCandidates)
        .innerJoin(students, eq(students.id, convocationCandidates.studentId))
        .innerJoin(convocations, eq(convocations.id, convocationCandidates.convocationId))
        .where(and(eq(convocationCandidates.certificateNo, no), eq(convocationCandidates.status, 'degree_issued')));
      if (!r) return { status: 'not_found' as const };
      const [t] = await tx.select({ name: tenants.name }).from(tenants);
      return { status: 'valid' as const, institution: t.name, name: r.name, degree: r.degree, certificateNo: no, conferredOn: r.heldOn };
    });
  }
}
