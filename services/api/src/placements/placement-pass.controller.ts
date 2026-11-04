import { BadRequestException, Body, ConflictException, Controller, Delete, ForbiddenException, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Put, Query, Res, StreamableFile, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Readable } from 'node:stream';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import type { Response } from 'express';
import { z } from 'zod';
import { documentType } from '../admissions/public-admissions.controller.js';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { UserPrincipal } from '../auth/principal.js';
import { audit, auditUser } from '../common/audit.js';
import { Day } from '../common/ops.js';
import { assertCanSeeStudent } from '../common/student-access.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService, type Tx } from '../db/db.service.js';
import { alumniProfiles, driveRegistrations, driveRounds, internships, placementCompanies, placementDrives, placementOffers, programs, roundResults, sections, skillEvidence, skills, students, tenants } from '../db/schema.js';
import { studentPriorEducation } from '../db/schema-g1.js';
import { portfolioItems } from '../db/schema-pathways.js';
import { alumniJobPosts, interviewSlots, placementTrainingAttendance, placementTrainingScores, placementTrainingSessions, placementTrainings } from '../db/schema-placements.js';
import { apprenticeships, apprenticeshipStipends, placementDocuments, placementReferrals } from '../db/schema-placements-pass.js';
import { UploadScanService } from '../scanning/upload-scan.js';
import { ObjectStorage } from '../storage/storage.service.js';
import { checkEligibility, graduationYear, standingReasons } from './eligibility.js';
import { brochurePdf } from './placement-brochure.js';
import { aicteCredits, creditStanding, draftResume, monthsBetween, natsGovtSharePaise, parseResultsCsv, type ApprenticeCategory } from './placement-pass.logic.js';
import { DOC_KIND } from './placement-pass.records.js';
import { PLACEMENT_ROLES, PLACEMENT_VIEW_ROLES, found, hasRole } from './placements.access.js';
import { PlacementsService, REQUIRED_DOCS } from './placements.service.js';

const MAX_DOC = 5 * 1024 * 1024;
const DOC_KINDS = ['resume', 'marks_10', 'marks_12', 'diploma', 'semester_marks', 'id_proof', 'photo', 'other'] as const;
const UploadBody = z.object({ kind: z.enum(DOC_KINDS), title: z.string().trim().min(1).max(160).optional() });
const ImportBody = z.object({ csv: z.string().min(1).max(2_000_000), commit: z.boolean().default(false), skipErrors: z.boolean().default(false) });
const StipendBody = z.object({ month: z.string().regex(/^\d{4}-\d{2}$/, 'Use a month like 2026-08'), employerPaidPaise: z.number().int().min(0).max(100_000_000), dbtPaise: z.number().int().min(0).max(100_000_000).optional(), dbtReference: z.string().trim().max(80).default(''), paidOn: Day.optional() });
const ReferralBody = z.object({ alumniId: z.uuid(), jobPostId: z.uuid().optional(), company: z.string().trim().min(1).max(160).optional(), role: z.string().trim().max(160).default(''), message: z.string().trim().min(10).max(1000) });
const AlumniReferralBody = z.object({ status: z.enum(['referred', 'interviewing', 'hired', 'declined', 'closed']), note: z.string().trim().max(300).default('') });
const YearQ = z.object({ year: z.coerce.number().int().min(2000).max(2100).optional() });

/**
 * The placements pass: students' placement documents with the cell's verification, a recruiter's shortlist or a
 * round's results imported from a spreadsheet (checked first, then applied), the student's own placement dashboard,
 * a resume drafted from the student's record, apprenticeship stipends month by month with the DBT share, alumni
 * referrals, and the placement brochure.
 */
@Controller('v1')
export class PlacementPassController {
  constructor(
    private readonly db: DbService,
    private readonly svc: PlacementsService,
    private readonly storage: ObjectStorage,
    private readonly scans: UploadScanService,
  ) {}

  // ---- placement documents ----------------------------------------------------------------------

  /** The student's placement documents (the student, their family, or placement staff). */
  @Get('placements/students/:studentId/documents')
  @Auth('user')
  documents(@CurrentPrincipal() p: UserPrincipal, @Param('studentId', ParseUUIDPipe) studentId: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await assertCanSeeStudent(tx, p, studentId, PLACEMENT_VIEW_ROLES);
      const rows = await tx.select({ id: placementDocuments.id, kind: placementDocuments.kind, title: placementDocuments.title, contentType: placementDocuments.contentType, sizeBytes: placementDocuments.sizeBytes, status: placementDocuments.status, rejectReason: placementDocuments.rejectReason, reviewedAt: placementDocuments.reviewedAt, createdAt: placementDocuments.createdAt }).from(placementDocuments).where(eq(placementDocuments.studentId, studentId)).orderBy(asc(placementDocuments.kind), desc(placementDocuments.createdAt));
      const need = REQUIRED_DOCS[(await this.svc.rules(tx, p.tenantId)).requiredDocs] ?? REQUIRED_DOCS.resume;
      return { documents: rows, required: need.map((k) => ({ kind: k, label: DOC_KIND.find((o) => o.value === k)?.label ?? k, status: rows.find((r) => r.kind === k && r.status === 'verified') ? 'verified' : rows.find((r) => r.kind === k && r.status === 'pending') ? 'pending' : rows.find((r) => r.kind === k) ? 'rejected' : 'missing' })) };
    });
  }

  /**
   * Uploads a placement document (PDF, JPEG or PNG, at most 5 MB, virus-scanned): the student for themselves, or the
   * cell for a student. It waits for the cell's verification; an upload by the cell is verified at once.
   */
  @Post('placements/students/:studentId/documents')
  @Auth('user', [...PLACEMENT_ROLES, 'student'])
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_DOC, files: 1 } }))
  async upload(@CurrentPrincipal() p: UserPrincipal, @Param('studentId', ParseUUIDPipe) studentId: string, @Body() raw: Record<string, unknown>, @UploadedFile() file?: { buffer: Buffer; originalname: string; size: number }) {
    const b = UploadBody.safeParse(raw);
    if (!b.success) throw new BadRequestException(b.error.issues[0]?.message ?? 'Say which document this is');
    if (!file?.buffer?.length) throw new BadRequestException('Choose the file');
    const type = documentType(file.buffer);
    if (!type) throw new BadRequestException('The document must be a PDF, JPEG or PNG');
    const staff = hasRole(p, PLACEMENT_ROLES);
    await this.db.withTenant(p.tenantId, async (tx) => {
      if (!staff) {
        const me = await this.svc.ownStudent(tx, p);
        if (!me || me.id !== studentId) throw new ForbiddenException('Students upload their own documents');
      } else found((await tx.select({ id: students.id }).from(students).where(eq(students.id, studentId)))[0], 'Student');
    });
    await this.scans.assertClean(file.buffer, 'The document');
    const key = `tenants/${p.tenantId}/placements/documents/${studentId}/${Date.now()}-${b.data.kind}`;
    await this.storage.put(key, Readable.from(file.buffer), MAX_DOC, type);
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [row] = await tx
        .insert(placementDocuments)
        .values({ tenantId: p.tenantId, studentId, kind: b.data.kind, title: (b.data.title ?? file.originalname).slice(0, 160), storageKey: key, contentType: type, sizeBytes: file.buffer.length, status: staff ? 'verified' : 'pending', reviewedBy: staff ? p.userId : null, reviewedAt: staff ? new Date() : null, uploadedBy: p.userId })
        .returning();
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'placement.document_uploaded', subjectType: 'placement_document', subjectId: row.id, after: { kind: row.kind, status: row.status }, data: { studentId } });
      const { storageKey: _k, ...rest } = row;
      return rest;
    });
  }

  /** The file, for the student, their family or placement staff. */
  @Get('placements/documents/:id/file')
  @Auth('user')
  async file(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Res({ passthrough: true }) res: Response) {
    const d = await this.db.withTenant(p.tenantId, async (tx) => {
      const [row] = await tx.select().from(placementDocuments).where(eq(placementDocuments.id, id));
      if (!row) throw new NotFoundException('Document not found');
      await assertCanSeeStudent(tx, p, row.studentId, PLACEMENT_VIEW_ROLES);
      return row;
    });
    const obj = await this.storage.get(d.storageKey);
    res.setHeader('content-type', d.contentType);
    res.setHeader('content-disposition', `inline; filename="${d.title.replace(/[^\w.\- ]/g, '_')}"`);
    return new StreamableFile(obj.stream);
  }

  /** The student takes back a document the cell has not verified yet. */
  @Delete('placements/documents/:id')
  @Auth('user', ['student'])
  removeDocument(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const me = await this.svc.ownStudent(tx, p);
      const [d] = await tx.select().from(placementDocuments).where(eq(placementDocuments.id, id)).for('update');
      if (!d || !me || d.studentId !== me.id) throw new NotFoundException('Document not found');
      if (d.status === 'verified') throw new ConflictException('A verified document stays; upload a newer one instead');
      await tx.delete(placementDocuments).where(eq(placementDocuments.id, id));
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'placement.document_removed', subjectType: 'placement_document', subjectId: id, before: { kind: d.kind, status: d.status } });
      await this.storage.delete(d.storageKey).catch(() => undefined);
      return { ok: true };
    });
  }

  // ---- shortlist and results import ------------------------------------------------------------------

  /**
   * A recruiter's shortlist or a round's results from a spreadsheet saved as CSV. Without `commit` it only checks
   * each line (the roll number belongs to a registration in this drive, the result is known, the student cleared
   * the round before); with `commit` the lines are recorded as the round's results, all or nothing, unless
   * `skipErrors` leaves the bad lines out.
   */
  @Post('placements/drives/:id/rounds/:roundId/import')
  @HttpCode(200)
  @Auth('user', PLACEMENT_ROLES)
  importResults(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Param('roundId', ParseUUIDPipe) roundId: string, @Body(new ZodBody(ImportBody)) b: z.infer<typeof ImportBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const drive = found((await tx.select().from(placementDrives).where(eq(placementDrives.id, id)))[0], 'Drive');
      const round = found((await tx.select().from(driveRounds).where(and(eq(driveRounds.id, roundId), eq(driveRounds.driveId, id))))[0], 'Round');
      const parsed = parseResultsCsv(b.csv);
      if (parsed.error) throw new BadRequestException(parsed.error);
      const regs = await tx.select({ id: driveRegistrations.id, status: driveRegistrations.status, rollNo: students.rollNo, fullName: students.fullName }).from(driveRegistrations).innerJoin(students, eq(students.id, driveRegistrations.studentId)).where(eq(driveRegistrations.driveId, id));
      const byRoll = new Map(regs.map((r) => [r.rollNo.toLowerCase(), r]));
      const prev = round.seq > 1 ? (await tx.select({ id: driveRounds.id }).from(driveRounds).where(and(eq(driveRounds.driveId, id), eq(driveRounds.seq, round.seq - 1))))[0] : null;
      const cleared = prev ? new Set((await tx.select({ r: roundResults.registrationId }).from(roundResults).where(and(eq(roundResults.roundId, prev.id), eq(roundResults.result, 'pass')))).map((x) => x.r)) : null;
      const lines = parsed.lines.map((l) => {
        const reg = byRoll.get(l.rollNo.toLowerCase());
        let error = l.error;
        if (!error && !reg) error = 'Not registered for this drive';
        else if (!error && reg && ['withdrawn', 'selected'].includes(reg.status)) error = `The registration is ${reg.status}`;
        else if (!error && reg && cleared && !cleared.has(reg.id)) error = 'Did not clear the previous round';
        return { ...l, registrationId: reg?.id ?? null, fullName: reg?.fullName ?? null, error };
      });
      const good = lines.filter((l) => !l.error);
      const summary = { lines: lines.length, ok: good.length, errors: lines.length - good.length, pass: good.filter((l) => l.result === 'pass').length, fail: good.filter((l) => l.result === 'fail').length, absent: good.filter((l) => l.result === 'absent').length };
      if (!b.commit) return { drive: { id: drive.id, title: drive.title }, round: { id: round.id, name: round.name }, committed: false, summary, lines };
      if (summary.errors && !b.skipErrors) throw new ConflictException({ statusCode: 409, error: 'Conflict', code: 'IMPORT_HAS_ERRORS', message: `${summary.errors} line(s) have problems; fix them or skip them`, lines: lines.filter((l) => l.error) });
      if (!good.length) throw new BadRequestException('No line can be recorded');
      const out = await this.svc.recordResults(tx, { tenantId: p.tenantId, userId: p.userId }, id, roundId, good.map((l) => ({ registrationId: l.registrationId!, result: l.result!, note: l.note })));
      await auditUser(tx, p, 'placement.results_imported', 'drive', id, { roundId, ...summary, skipped: summary.errors, debarred: out.debarred });
      return { drive: { id: drive.id, title: drive.title }, round: { id: round.id, name: round.name }, committed: true, summary, recorded: out.recorded, debarred: out.debarred, skipped: lines.filter((l) => l.error) };
    });
  }

  // ---- the student's placement dashboard ----------------------------------------------------------

  /**
   * Everything about one student's placement in one place, for the Student and Parent apps and the cell: where they
   * stand (marks, backlogs, class 10 and 12, gap years, documents, opt-in, debarment), open drives they are eligible
   * for, every registration with each round's result and interview slot, offers, training attendance and scores,
   * internships with their AICTE credits, apprenticeships and referrals.
   */
  @Get('placements/students/:studentId/dashboard')
  @Auth('user')
  dashboard(@CurrentPrincipal() p: UserPrincipal, @Param('studentId', ParseUUIDPipe) studentId: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await assertCanSeeStudent(tx, p, studentId, PLACEMENT_VIEW_ROLES);
      const [a, standing, rules, today] = [await this.svc.academics(tx, studentId), await this.svc.standing(tx, studentId), await this.svc.rules(tx, p.tenantId), await this.svc.today(tx)];
      const open = await tx.select().from(placementDrives).where(eq(placementDrives.status, 'open'));
      const eligibleOpen = open.filter((d) => checkEligibility(d, a, today).eligible && !standingReasons(d.kind, d.category, standing, rules, today).length).length;
      const regs = await tx
        .select({ id: driveRegistrations.id, driveId: driveRegistrations.driveId, status: driveRegistrations.status, title: placementDrives.title, company: placementCompanies.name, roleTitle: placementDrives.roleTitle, kind: placementDrives.kind, driveDate: placementDrives.driveDate, registeredAt: driveRegistrations.createdAt })
        .from(driveRegistrations)
        .innerJoin(placementDrives, eq(placementDrives.id, driveRegistrations.driveId))
        .innerJoin(placementCompanies, eq(placementCompanies.id, placementDrives.companyId))
        .where(eq(driveRegistrations.studentId, studentId))
        .orderBy(desc(driveRegistrations.createdAt));
      const driveIds = [...new Set(regs.map((r) => r.driveId))];
      const rounds = driveIds.length ? await tx.select().from(driveRounds).where(inArray(driveRounds.driveId, driveIds)).orderBy(asc(driveRounds.seq)) : [];
      const results = regs.length ? await tx.select().from(roundResults).where(inArray(roundResults.registrationId, regs.map((r) => r.id))) : [];
      const slots = regs.length ? await tx.select().from(interviewSlots).where(inArray(interviewSlots.registrationId, regs.map((r) => r.id))) : [];
      const offers = await tx.select({ o: placementOffers, company: placementCompanies.name, category: placementDrives.category }).from(placementOffers).innerJoin(placementDrives, eq(placementDrives.id, placementOffers.driveId)).innerJoin(placementCompanies, eq(placementCompanies.id, placementDrives.companyId)).where(eq(placementOffers.studentId, studentId)).orderBy(desc(placementOffers.offeredOn));
      // Training: the programmes this student was marked in or scored in.
      const att = await tx.select({ trainingId: placementTrainingSessions.trainingId, present: placementTrainingAttendance.present }).from(placementTrainingAttendance).innerJoin(placementTrainingSessions, eq(placementTrainingSessions.id, placementTrainingAttendance.sessionId)).where(eq(placementTrainingAttendance.studentId, studentId));
      const scores = await tx.select().from(placementTrainingScores).where(eq(placementTrainingScores.studentId, studentId)).orderBy(asc(placementTrainingScores.takenOn));
      const tIds = [...new Set([...att.map((x) => x.trainingId), ...scores.map((x) => x.trainingId)])];
      const trainings = tIds.length ? await tx.select().from(placementTrainings).where(inArray(placementTrainings.id, tIds)).orderBy(desc(placementTrainings.startsOn)) : [];
      const interns = await tx.select().from(internships).where(eq(internships.studentId, studentId)).orderBy(desc(internships.startsOn));
      const credited = interns.filter((i) => i.status === 'completed').reduce((s, i) => s + Number(i.credits ?? aicteCredits(i.hours, rules.hoursPerCredit)), 0);
      const apps = await tx.select().from(apprenticeships).where(eq(apprenticeships.studentId, studentId)).orderBy(desc(apprenticeships.startsOn));
      const refs = await tx.select({ r: placementReferrals, alumni: alumniProfiles.fullName }).from(placementReferrals).innerJoin(alumniProfiles, eq(alumniProfiles.id, placementReferrals.alumniId)).where(eq(placementReferrals.studentId, studentId)).orderBy(desc(placementReferrals.createdAt));
      const docs = await tx.select({ kind: placementDocuments.kind, status: placementDocuments.status }).from(placementDocuments).where(eq(placementDocuments.studentId, studentId));
      const need = REQUIRED_DOCS[rules.requiredDocs] ?? REQUIRED_DOCS.resume;
      return {
        standing: { cgpa: a.cgpa, backlogs: a.backlogs, backlogHistory: a.backlogHistory ?? 0, tenthPct: a.tenthPct ?? null, twelfthPct: a.twelfthPct ?? null, gapYears: a.gapYears ?? null, batchYear: a.batchYear ?? null, optedIn: standing.optedIn, debarredUntil: standing.debarredUntil && standing.debarredUntil >= today ? standing.debarredUntil : null, placedCategory: standing.placedCategory, policy: rules.policy, docsVerified: a.docsVerified ?? false, documents: need.map((k) => ({ kind: k, status: docs.some((d) => d.kind === k && d.status === 'verified') ? 'verified' : docs.some((d) => d.kind === k && d.status === 'pending') ? 'pending' : docs.some((d) => d.kind === k) ? 'rejected' : 'missing' })) },
        counts: { eligibleOpenDrives: eligibleOpen, registered: regs.filter((r) => r.status !== 'withdrawn').length, shortlisted: regs.filter((r) => ['shortlisted', 'selected'].includes(r.status)).length, offers: offers.filter((o) => !['withdrawn', 'revoked'].includes(o.o.status)).length },
        registrations: regs.map((r) => ({
          ...r,
          rounds: rounds
            .filter((x) => x.driveId === r.driveId)
            .map((x) => {
              const res = results.find((y) => y.roundId === x.id && y.registrationId === r.id);
              const slot = slots.find((y) => y.roundId === x.id && y.registrationId === r.id);
              return { id: x.id, seq: x.seq, name: x.name, kind: x.kind, scheduledOn: x.scheduledOn, result: res?.result ?? null, slot: slot && slot.status !== 'cancelled' ? { startsAt: slot.startsAt, endsAt: slot.endsAt, venue: slot.venue, status: slot.status } : null };
            }),
        })),
        offers: offers.map((x) => ({ id: x.o.id, company: x.company, category: x.category, roleTitle: x.o.roleTitle, ctcLpa: x.o.ctcLpa, status: x.o.status, offeredOn: x.o.offeredOn, respondBy: x.o.respondBy, joiningStatus: x.o.joiningStatus, conditional: x.o.conditional, conditionNote: x.o.conditionNote, hasLetter: !!x.o.offerLetterKey })),
        training: trainings.map((t) => {
          const mine = att.filter((x) => x.trainingId === t.id);
          return { id: t.id, title: t.title, kind: t.kind, status: t.status, sessionsMarked: mine.length, present: mine.filter((x) => x.present).length, attendancePct: mine.length ? Math.round((mine.filter((x) => x.present).length / mine.length) * 1000) / 10 : null, scores: scores.filter((s) => s.trainingId === t.id).map((s) => ({ test: s.testName, score: s.score, maxScore: s.maxScore, takenOn: s.takenOn })) };
        }),
        internships: { credits: creditStanding(credited, rules.creditsRequired), hoursPerCredit: rules.hoursPerCredit, items: interns.map((i) => ({ id: i.id, title: i.title, orgName: i.orgName, startsOn: i.startsOn, endsOn: i.endsOn, status: i.status, hours: i.hours, credits: i.credits ?? (i.hours ? aicteCredits(i.hours, rules.hoursPerCredit) : null), stipendMonthly: i.stipendMonthly })) },
        apprenticeships: apps.map((x) => ({ id: x.id, establishment: x.establishment, role: x.role, startsOn: x.startsOn, endsOn: x.endsOn, status: x.status, stipendPaise: x.stipendPaise, govtSharePaise: x.govtSharePaise, natsEnrolmentNo: x.natsEnrolmentNo, certificateNo: x.certificateNo })),
        referrals: refs.map((x) => ({ id: x.r.id, alumni: x.alumni, company: x.r.company, role: x.r.role, status: x.r.status, note: x.r.note, createdAt: x.r.createdAt })),
      };
    });
  }

  // ---- resume drafted from the record ------------------------------------------------------------

  /** A resume drafted from the student's own record, to review and save (PUT /v1/careers/resume). Nothing is saved. */
  @Get('careers/resume/draft')
  @Auth('user', ['student'])
  resumeDraft(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const me = await this.svc.ownStudent(tx, p);
      if (!me) throw new NotFoundException('Only students can do this');
      const [s] = await tx.select({ program: programs.name, term: sections.term, termCount: programs.termCount, level: programs.level, institution: tenants.name, yearEnds: sql<string>`(select ay.ends_on::text from academic_years ay where ay.id = ${sections.academicYearId})` }).from(students).innerJoin(sections, eq(sections.id, students.sectionId)).innerJoin(programs, eq(programs.id, sections.programId)).innerJoin(tenants, eq(tenants.id, students.tenantId)).where(eq(students.id, me.id));
      const a = await this.svc.academics(tx, me.id);
      const prior = await tx.select({ level: studentPriorEducation.level, institution: studentPriorEducation.institution, board: studentPriorEducation.board, passingYear: studentPriorEducation.passingYear, percentage: studentPriorEducation.percentage }).from(studentPriorEducation).where(eq(studentPriorEducation.studentId, me.id));
      const interns = await tx.select({ orgName: internships.orgName, title: internships.title, startsOn: internships.startsOn, endsOn: internships.endsOn, status: internships.status }).from(internships).where(eq(internships.studentId, me.id)).orderBy(desc(internships.startsOn));
      const apps = await tx.select({ establishment: apprenticeships.establishment, role: apprenticeships.role, startsOn: apprenticeships.startsOn, endsOn: apprenticeships.endsOn }).from(apprenticeships).where(and(eq(apprenticeships.studentId, me.id), inArray(apprenticeships.status, ['ongoing', 'completed'])));
      const projects = await tx.select({ title: portfolioItems.title, summary: portfolioItems.summary }).from(portfolioItems).where(and(eq(portfolioItems.studentId, me.id), inArray(portfolioItems.kind, ['project', 'research']))).orderBy(desc(portfolioItems.createdAt));
      const sk = await tx.selectDistinct({ name: skills.name }).from(skillEvidence).innerJoin(skills, eq(skills.id, skillEvidence.skillId)).where(eq(skillEvidence.studentId, me.id));
      const tr = await tx.selectDistinct({ title: placementTrainings.title, kind: placementTrainings.kind }).from(placementTrainingAttendance).innerJoin(placementTrainingSessions, eq(placementTrainingSessions.id, placementTrainingAttendance.sessionId)).innerJoin(placementTrainings, eq(placementTrainings.id, placementTrainingSessions.trainingId)).where(and(eq(placementTrainingAttendance.studentId, me.id), eq(placementTrainingAttendance.present, true)));
      return draftResume({ programme: s.program, institution: s.institution, batchYear: s.yearEnds ? graduationYear(s.yearEnds, s.termCount, s.term, String(s.level)) : null, cgpa: a.cgpa, prior: prior.map((x) => ({ ...x, level: String(x.level), percentage: x.percentage === null ? null : Number(x.percentage) })), internships: interns, apprenticeships: apps, projects, skills: sk.map((x) => x.name), trainings: tr });
    });
  }

  // ---- apprenticeship stipends ---------------------------------------------------------------------

  /** Each month of an apprenticeship: due (the stipend and the Government share) and what was paid and credited. */
  @Get('placements/apprenticeships/:id/stipends')
  @Auth('user', PLACEMENT_VIEW_ROLES)
  stipends(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const a = found((await tx.select().from(apprenticeships).where(eq(apprenticeships.id, id)))[0], 'Apprenticeship');
      const paid = await tx.select().from(apprenticeshipStipends).where(eq(apprenticeshipStipends.apprenticeshipId, id)).orderBy(asc(apprenticeshipStipends.month));
      const today = await this.svc.today(tx);
      const months = monthsBetween(a.startsOn, a.endsOn < today ? a.endsOn : today).map((m) => {
        const x = paid.find((y) => String(y.month) === m);
        return { month: m.slice(0, 7), duePaise: a.stipendPaise, govtSharePaise: a.govtSharePaise, employerPaidPaise: x?.employerPaidPaise ?? null, dbtPaise: x?.dbtPaise ?? null, dbtReference: x?.dbtReference ?? '', paidOn: x?.paidOn ?? null };
      });
      const totals = { employerPaidPaise: paid.reduce((s, x) => s + x.employerPaidPaise, 0), dbtPaise: paid.reduce((s, x) => s + x.dbtPaise, 0), monthsUnpaid: months.filter((m) => m.employerPaidPaise === null).length };
      return { apprenticeship: { id: a.id, establishment: a.establishment, stipendPaise: a.stipendPaise, govtSharePaise: a.govtSharePaise, category: a.category }, months, totals };
    });
  }

  /** Records one month's stipend (idempotent: the same month again replaces it). The DBT share defaults to the Government share. */
  @Put('placements/apprenticeships/:id/stipends')
  @Auth('user', PLACEMENT_ROLES)
  saveStipend(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(StipendBody)) b: z.infer<typeof StipendBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const a = found((await tx.select().from(apprenticeships).where(eq(apprenticeships.id, id)))[0], 'Apprenticeship');
      const month = `${b.month}-01`;
      if (month < `${a.startsOn.slice(0, 7)}-01` || month > `${a.endsOn.slice(0, 7)}-01`) throw new BadRequestException(`The apprenticeship runs from ${a.startsOn.slice(0, 7)} to ${a.endsOn.slice(0, 7)}`);
      if (a.status === 'enrolled') throw new ConflictException('Register the contract before recording stipends');
      const dbt = b.dbtPaise ?? natsGovtSharePaise(a.category as ApprenticeCategory, b.employerPaidPaise, (await this.svc.rules(tx, p.tenantId)).nats);
      const [before] = await tx.select().from(apprenticeshipStipends).where(and(eq(apprenticeshipStipends.apprenticeshipId, id), eq(apprenticeshipStipends.month, month)));
      const values = { employerPaidPaise: b.employerPaidPaise, dbtPaise: dbt, dbtReference: b.dbtReference, paidOn: b.paidOn ?? null, recordedBy: p.userId };
      const [row] = await tx.insert(apprenticeshipStipends).values({ tenantId: p.tenantId, apprenticeshipId: id, month, ...values }).onConflictDoUpdate({ target: [apprenticeshipStipends.apprenticeshipId, apprenticeshipStipends.month], set: values }).returning();
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'placement.apprentice_stipend', subjectType: 'apprenticeship', subjectId: id, before: before ? { employerPaidPaise: before.employerPaidPaise, dbtPaise: before.dbtPaise } : undefined, after: { month: b.month, employerPaidPaise: b.employerPaidPaise, dbtPaise: dbt } });
      return row;
    });
  }

  // ---- alumni referrals --------------------------------------------------------------------------

  /** A student asks an alumnus who offers mentoring for a referral, to a job post or a company. */
  @Post('placements/referrals')
  @Auth('user', ['student'])
  requestReferral(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(ReferralBody)) b: z.infer<typeof ReferralBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const me = await this.svc.ownStudent(tx, p);
      if (!me) throw new ForbiddenException('Only students ask for referrals');
      const al = found((await tx.select().from(alumniProfiles).where(eq(alumniProfiles.id, b.alumniId)))[0], 'Alumnus');
      if (!al.directoryVisible || !al.mentorAvailable) throw new ConflictException('This alumnus is not taking requests');
      let company = b.company ?? '';
      if (b.jobPostId) {
        const job = found((await tx.select().from(alumniJobPosts).where(and(eq(alumniJobPosts.id, b.jobPostId), eq(alumniJobPosts.status, 'published'))))[0], 'Job post');
        company = company || job.company;
      }
      if (!company) throw new BadRequestException('Name the company');
      const [open] = await tx.select({ id: placementReferrals.id }).from(placementReferrals).where(and(eq(placementReferrals.studentId, me.id), eq(placementReferrals.alumniId, al.id), sql`lower(${placementReferrals.company}) = ${company.toLowerCase()}`, inArray(placementReferrals.status, ['requested', 'referred', 'interviewing'])));
      if (open) throw new ConflictException('You already have an open request with this alumnus for this company');
      const [row] = await tx.insert(placementReferrals).values({ tenantId: p.tenantId, studentId: me.id, alumniId: al.id, jobPostId: b.jobPostId ?? null, company, role: b.role, message: b.message }).returning();
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'placement.referral_requested', subjectType: 'placement_referral', subjectId: row.id, after: { company, alumniId: al.id } });
      if (al.userId) await this.svc.notifyLogins(tx, [al.userId], 'A student asks for a referral', `${me.fullName} would like a referral at ${company}${b.role ? ` for ${b.role}` : ''}`, `referral:${row.id}`, { referralId: row.id });
      return row;
    });
  }

  /** The alumni portal: referral requests sent to me. */
  @Get('alumni-portal/referrals')
  @Auth('user', ['alumni'])
  myReferrals(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [me] = await tx.select({ id: alumniProfiles.id }).from(alumniProfiles).where(eq(alumniProfiles.userId, p.userId));
      if (!me) throw new NotFoundException('No alumni profile is linked to your login; ask the alumni office');
      return tx.select({ id: placementReferrals.id, student: students.fullName, programme: programs.name, company: placementReferrals.company, role: placementReferrals.role, message: placementReferrals.message, status: placementReferrals.status, note: placementReferrals.note, createdAt: placementReferrals.createdAt }).from(placementReferrals).innerJoin(students, eq(students.id, placementReferrals.studentId)).innerJoin(sections, eq(sections.id, students.sectionId)).innerJoin(programs, eq(programs.id, sections.programId)).where(eq(placementReferrals.alumniId, me.id)).orderBy(desc(placementReferrals.createdAt));
    });
  }

  /** The alumnus says what happened: referred, interviewing, hired, declined or closed. The student is told. */
  @Post('alumni-portal/referrals/:id/status')
  @HttpCode(200)
  @Auth('user', ['alumni'])
  updateReferral(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(AlumniReferralBody)) b: z.infer<typeof AlumniReferralBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [me] = await tx.select({ id: alumniProfiles.id, name: alumniProfiles.fullName }).from(alumniProfiles).where(eq(alumniProfiles.userId, p.userId));
      const [r] = await tx.select().from(placementReferrals).where(eq(placementReferrals.id, id)).for('update');
      if (!me || !r || r.alumniId !== me.id) throw new NotFoundException('Referral not found');
      if (['hired', 'declined', 'closed'].includes(r.status)) throw new ConflictException(`This referral is ${r.status}`);
      const [row] = await tx.update(placementReferrals).set({ status: b.status, note: b.note || r.note, updatedAt: new Date() }).where(eq(placementReferrals.id, id)).returning();
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: `placement.referral_${b.status}`, subjectType: 'placement_referral', subjectId: id, before: { status: r.status }, after: { status: b.status } });
      await this.svc.notifyStudent(tx, r.studentId, `Referral: ${r.company}`, `${me.name}: ${b.status}${b.note ? ` (${b.note})` : ''}`, `referral:${id}:${b.status}`);
      return row;
    });
  }

  // ---- placement brochure --------------------------------------------------------------------------

  /** The placement brochure for recruiters (PDF): the year's results by programme, the CTC, top recruiters and the training given. */
  @Get('placements/brochure')
  @Auth('user', [...PLACEMENT_VIEW_ROLES, 'quality_officer'])
  brochure(@CurrentPrincipal() p: UserPrincipal, @Query() q: Record<string, string>, @Res({ passthrough: true }) res: Response) {
    const parsed = YearQ.safeParse(q);
    if (!parsed.success) throw new BadRequestException('Bad year');
    return this.db.withTenant(p.tenantId, async (tx: Tx) => {
      const year = parsed.data.year ?? Number((await this.svc.today(tx)).slice(0, 4));
      const pdf = await brochurePdf(tx, year);
      await auditUser(tx, p, 'placement.brochure_exported', 'placement_report', undefined, { year });
      res.setHeader('content-type', 'application/pdf');
      res.setHeader('content-disposition', `attachment; filename="placement-brochure-${year}.pdf"`);
      return new StreamableFile(pdf);
    });
  }
}
