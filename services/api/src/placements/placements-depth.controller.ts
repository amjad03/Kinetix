import { BadRequestException, Body, ConflictException, Controller, Delete, ForbiddenException, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Put, Query, Res, StreamableFile, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { createHash, randomBytes } from 'node:crypto';
import { Readable } from 'node:stream';
import { and, asc, desc, eq, inArray, ne, or, sql } from 'drizzle-orm';
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
import { academicYears, alumniProfiles, driveRegistrations, driveRounds, placementCompanies, placementDrives, placementOffers, programs, rooms, roundResults, sections, students } from '../db/schema.js';
import { alumniJobPosts, interviewSlots, placementCompanyContacts, placementOptins, placementTrainingAttendance, placementTrainingScores, placementTrainingSessions, placementTrainings } from '../db/schema-placements.js';
import { DomainEvents, EventBus } from '../events/events.js';
import { UploadScanService } from '../scanning/upload-scan.js';
import { ObjectStorage } from '../storage/storage.service.js';
import { promoteToAlumni } from './alumni-promotion.js';
import { checkEligibility, graduationYear, planSlots, standingReasons } from './eligibility.js';
import { PLACEMENT_ROLES, PLACEMENT_VIEW_ROLES, found, hasRole } from './placements.access.js';
import { PlacementsService } from './placements.service.js';

const MAX_LETTER = 5 * 1024 * 1024;
const ContactBody = z.object({ name: z.string().trim().min(1).max(120), designation: z.string().trim().max(120).default(''), email: z.email().nullish(), phone: z.string().trim().max(30).nullish(), isPrimary: z.boolean().default(false) });
const OptinBody = z.object({ optedIn: z.boolean(), reason: z.string().trim().max(300).nullish() });
const DebarBody = z.object({ until: Day, reason: z.string().trim().min(3).max(300) });
const AddRegBody = z.object({ studentId: z.uuid(), reason: z.string().trim().min(3).max(300) });
const AutoSlotsBody = z.object({ startsAt: z.iso.datetime({ offset: true }), minutes: z.number().int().min(5).max(240), gapMinutes: z.number().int().min(0).max(120).default(0), venues: z.array(z.string().trim().min(1).max(120)).min(1).max(20), panel: z.string().trim().max(200).default('') });
const SlotBody = z.object({ startsAt: z.iso.datetime({ offset: true }).optional(), minutes: z.number().int().min(5).max(240).optional(), venue: z.string().trim().max(120).optional(), roomId: z.uuid().nullish(), panel: z.string().trim().max(200).optional(), status: z.enum(['scheduled', 'done', 'no_show', 'cancelled']).optional() });
const RevokeBody = z.object({ reason: z.string().trim().min(3).max(500) });
const RecordResponseBody = z.object({ response: z.enum(['accepted', 'declined']), reason: z.string().trim().max(300).optional() });
const JoiningBody = z.object({ status: z.enum(['joined', 'not_joined']), joinedOn: Day.optional(), note: z.string().trim().max(300).optional() });
const SessionBody = z.object({ heldOn: Day, topic: z.string().trim().min(2).max(200), hours: z.number().min(0.5).max(12).default(1) });
const AttendanceBody = z.object({ present: z.array(z.uuid()).max(2000), absent: z.array(z.uuid()).max(2000) });
const ScoresBody = z.object({ testName: z.string().trim().min(2).max(120), maxScore: z.number().min(1).max(1000), takenOn: Day.optional(), scores: z.array(z.object({ studentId: z.uuid(), score: z.number().min(0).max(1000) })).min(1).max(2000) });

export const keyHash = (secret: string) => createHash('sha256').update(secret).digest('hex');

/**
 * Placement depth: company contacts and recruiter portal keys, opt-in and debarment, the auto-eligible list and late
 * registration, interview slots and venues, offer letters, revocation, joining and conditional offers, and the
 * placement training programme (sessions, attendance, test scores).
 */
@Controller('v1/placements')
export class PlacementsDepthController {
  constructor(
    private readonly db: DbService,
    private readonly svc: PlacementsService,
    private readonly events: EventBus,
    private readonly storage: ObjectStorage,
    private readonly scans: UploadScanService,
  ) {}

  // ---- companies ----------------------------------------------------------------------------

  /** A company with its contacts, drives (with registrations and offers), and whether it has a portal key. */
  @Get('companies/:id')
  @Auth('user', PLACEMENT_VIEW_ROLES)
  company(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const c = found((await tx.select().from(placementCompanies).where(eq(placementCompanies.id, id)))[0], 'Company');
      const contacts = await tx.select().from(placementCompanyContacts).where(eq(placementCompanyContacts.companyId, id)).orderBy(desc(placementCompanyContacts.isPrimary), asc(placementCompanyContacts.name));
      const drives = await tx
        .select({ id: placementDrives.id, title: placementDrives.title, kind: placementDrives.kind, status: placementDrives.status, driveDate: placementDrives.driveDate, ctcLpa: placementDrives.ctcLpa, registrations: sql<number>`(select count(*)::int from drive_registrations r where r.drive_id = "placement_drives"."id" and r.status <> 'withdrawn')`, offers: sql<number>`(select count(*)::int from placement_offers o where o.drive_id = "placement_drives"."id")` })
        .from(placementDrives)
        .where(eq(placementDrives.companyId, id))
        .orderBy(desc(placementDrives.createdAt));
      const { portalTokenHash, ...rest } = c;
      return { ...rest, hasPortalKey: !!portalTokenHash, contacts, drives };
    });
  }

  @Post('companies/:id/contacts')
  @Auth('user', PLACEMENT_ROLES)
  addContact(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(ContactBody)) b: z.infer<typeof ContactBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      found((await tx.select({ id: placementCompanies.id }).from(placementCompanies).where(eq(placementCompanies.id, id)))[0], 'Company');
      if (b.isPrimary) await tx.update(placementCompanyContacts).set({ isPrimary: false }).where(eq(placementCompanyContacts.companyId, id));
      const [row] = await tx.insert(placementCompanyContacts).values({ tenantId: p.tenantId, companyId: id, name: b.name, designation: b.designation, email: b.email ?? null, phone: b.phone ?? null, isPrimary: b.isPrimary }).returning();
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'placement.contact_added', subjectType: 'company', subjectId: id, after: { contact: b.name } });
      return row;
    });
  }

  @Put('contacts/:id')
  @Auth('user', PLACEMENT_ROLES)
  updateContact(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(ContactBody)) b: z.infer<typeof ContactBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const was = found((await tx.select().from(placementCompanyContacts).where(eq(placementCompanyContacts.id, id)))[0], 'Contact');
      if (b.isPrimary) await tx.update(placementCompanyContacts).set({ isPrimary: false }).where(eq(placementCompanyContacts.companyId, was.companyId));
      const [row] = await tx.update(placementCompanyContacts).set({ name: b.name, designation: b.designation, email: b.email ?? null, phone: b.phone ?? null, isPrimary: b.isPrimary }).where(eq(placementCompanyContacts.id, id)).returning();
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'placement.contact_updated', subjectType: 'company', subjectId: was.companyId, before: { name: was.name, email: was.email, phone: was.phone }, after: { name: row.name, email: row.email, phone: row.phone } });
      return row;
    });
  }

  @Delete('contacts/:id')
  @Auth('user', PLACEMENT_ROLES)
  removeContact(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const was = found((await tx.select().from(placementCompanyContacts).where(eq(placementCompanyContacts.id, id)))[0], 'Contact');
      await tx.delete(placementCompanyContacts).where(eq(placementCompanyContacts.id, id));
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'placement.contact_removed', subjectType: 'company', subjectId: was.companyId, before: { contact: was.name } });
      return { ok: true };
    });
  }

  /** Verifies a self-registered company (it can then have drives) and issues its recruiter portal key, shown once. */
  @Post('companies/:id/verify')
  @HttpCode(200)
  @Auth('user', PLACEMENT_ROLES)
  verify(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const c = found((await tx.select().from(placementCompanies).where(eq(placementCompanies.id, id)).for('update'))[0], 'Company');
      if (c.status !== 'pending') throw new ConflictException('This company is not waiting for verification');
      await tx.update(placementCompanies).set({ status: 'active' }).where(eq(placementCompanies.id, id));
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'placement.company_verified', subjectType: 'company', subjectId: id, before: { status: 'pending' }, after: { status: 'active' } });
      return { status: 'active', key: await this.issueKey(tx, p, id) };
    });
  }

  /** Issues a new recruiter portal key (the old one stops working); the key is shown only now. */
  @Post('companies/:id/portal-key')
  @HttpCode(200)
  @Auth('user', PLACEMENT_ROLES)
  portalKey(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const c = found((await tx.select().from(placementCompanies).where(eq(placementCompanies.id, id)))[0], 'Company');
      if (c.status !== 'active') throw new ConflictException('Only an active company gets a portal key');
      return { key: await this.issueKey(tx, p, id) };
    });
  }

  @Delete('companies/:id/portal-key')
  @Auth('user', PLACEMENT_ROLES)
  revokeKey(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      found((await tx.select({ id: placementCompanies.id }).from(placementCompanies).where(eq(placementCompanies.id, id)))[0], 'Company');
      await tx.update(placementCompanies).set({ portalTokenHash: null, portalTokenAt: null }).where(eq(placementCompanies.id, id));
      await auditUser(tx, p, 'placement.portal_key_revoked', 'company', id);
      return { ok: true };
    });
  }

  private async issueKey(tx: Tx, p: UserPrincipal, companyId: string) {
    const secret = randomBytes(24).toString('hex');
    const key = `${companyId}.${secret}`;
    await tx.update(placementCompanies).set({ portalTokenHash: keyHash(key), portalTokenAt: new Date() }).where(eq(placementCompanies.id, companyId));
    await auditUser(tx, p, 'placement.portal_key_issued', 'company', companyId);
    return key;
  }

  // ---- opt-in and debarment -----------------------------------------------------------------

  /** Every student who has opted out or is debarred, with the reason. */
  @Get('optins')
  @Auth('user', PLACEMENT_VIEW_ROLES)
  optins(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) =>
      (await tx.select({ o: placementOptins, fullName: students.fullName, rollNo: students.rollNo, className: sections.displayName }).from(placementOptins).innerJoin(students, eq(students.id, placementOptins.studentId)).innerJoin(sections, eq(sections.id, students.sectionId)).orderBy(asc(students.rollNo))).map((r) => ({ ...r.o, fullName: r.fullName, rollNo: r.rollNo, className: r.className })),
    );
  }

  /** The student opts in or out of placements (out: higher studies, a venture…); the cell can record it for them. */
  @Put('students/:studentId/optin')
  @Auth('user', [...PLACEMENT_ROLES, 'student'])
  optin(@CurrentPrincipal() p: UserPrincipal, @Param('studentId', ParseUUIDPipe) studentId: string, @Body(new ZodBody(OptinBody)) b: z.infer<typeof OptinBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      if (!hasRole(p, PLACEMENT_ROLES)) {
        const me = await this.svc.ownStudent(tx, p);
        if (!me || me.id !== studentId) throw new ForbiddenException('Students choose for themselves');
      }
      found((await tx.select({ id: students.id }).from(students).where(eq(students.id, studentId)))[0], 'Student');
      if (!b.optedIn && !b.reason?.trim()) throw new BadRequestException('Say why (higher studies, a venture, family business…)');
      const [was] = await tx.select().from(placementOptins).where(eq(placementOptins.studentId, studentId));
      const [row] = await tx.insert(placementOptins).values({ tenantId: p.tenantId, studentId, optedIn: b.optedIn, reason: b.optedIn ? null : (b.reason ?? null), updatedBy: p.userId }).onConflictDoUpdate({ target: placementOptins.studentId, set: { optedIn: b.optedIn, reason: b.optedIn ? null : (b.reason ?? null), updatedBy: p.userId, updatedAt: new Date() } }).returning();
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: b.optedIn ? 'placement.opted_in' : 'placement.opted_out', subjectType: 'placement_optin', subjectId: row.id, before: { optedIn: was?.optedIn ?? null }, after: { optedIn: b.optedIn }, data: { studentId } });
      return row;
    });
  }

  @Post('students/:studentId/debar')
  @HttpCode(200)
  @Auth('user', PLACEMENT_ROLES)
  debar(@CurrentPrincipal() p: UserPrincipal, @Param('studentId', ParseUUIDPipe) studentId: string, @Body(new ZodBody(DebarBody)) b: z.infer<typeof DebarBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      found((await tx.select({ id: students.id }).from(students).where(eq(students.id, studentId)))[0], 'Student');
      if (b.until < (await this.svc.today(tx))) throw new BadRequestException('Debar until a day from today on');
      const [row] = await tx.insert(placementOptins).values({ tenantId: p.tenantId, studentId, debarredUntil: b.until, debarReason: b.reason, updatedBy: p.userId }).onConflictDoUpdate({ target: placementOptins.studentId, set: { debarredUntil: b.until, debarReason: b.reason, updatedBy: p.userId, updatedAt: new Date() } }).returning();
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'placement.debarred', subjectType: 'placement_optin', subjectId: row.id, after: { debarredUntil: b.until }, data: { studentId, reason: b.reason } });
      await this.svc.notifyStudent(tx, studentId, 'Placement cell', `You cannot register for placement drives until ${b.until}: ${b.reason}`, `debar:${row.id}:${b.until}`);
      return row;
    });
  }

  @Post('students/:studentId/lift-debar')
  @HttpCode(200)
  @Auth('user', PLACEMENT_ROLES)
  liftDebar(@CurrentPrincipal() p: UserPrincipal, @Param('studentId', ParseUUIDPipe) studentId: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const was = found((await tx.select().from(placementOptins).where(eq(placementOptins.studentId, studentId)).for('update'))[0], 'Debarment');
      if (!was.debarredUntil) throw new ConflictException('This student is not debarred');
      const [row] = await tx.update(placementOptins).set({ debarredUntil: null, debarReason: null, updatedBy: p.userId, updatedAt: new Date() }).where(eq(placementOptins.id, was.id)).returning();
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'placement.debar_lifted', subjectType: 'placement_optin', subjectId: was.id, before: { debarredUntil: was.debarredUntil }, after: { debarredUntil: null }, data: { studentId } });
      return row;
    });
  }

  // ---- eligible list and registrations --------------------------------------------------------

  /** Every active student of the drive's programmes and batches with their eligibility now and their registration. */
  @Get('drives/:id/eligible')
  @Auth('user', PLACEMENT_VIEW_ROLES)
  eligible(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const drive = found((await tx.select().from(placementDrives).where(eq(placementDrives.id, id)))[0], 'Drive');
      const rows = await tx
        .select({ id: students.id, fullName: students.fullName, rollNo: students.rollNo, className: sections.displayName, programId: sections.programId, program: programs.name, term: sections.term, termCount: programs.termCount, level: programs.level, yearEnds: academicYears.endsOn })
        .from(students)
        .innerJoin(sections, eq(sections.id, students.sectionId))
        .innerJoin(programs, eq(programs.id, sections.programId))
        .innerJoin(academicYears, eq(academicYears.id, sections.academicYearId))
        .where(and(eq(students.status, 'active'), drive.programIds.length ? inArray(sections.programId, drive.programIds) : undefined))
        .orderBy(asc(programs.name), asc(students.rollNo));
      const inBatch = rows.filter((r) => !drive.batchYears.length || drive.batchYears.includes(graduationYear(String(r.yearEnds), r.termCount, r.term, String(r.level))));
      const regs = new Map((await tx.select().from(driveRegistrations).where(eq(driveRegistrations.driveId, id))).map((r) => [r.studentId, r]));
      const [today, rules] = [await this.svc.today(tx), await this.svc.rules(tx, p.tenantId)];
      const out = [];
      for (const r of inBatch.slice(0, 2000)) {
        const a = await this.svc.academics(tx, r.id);
        const e = checkEligibility({ ...drive, status: 'open', registrationClosesOn: null, registrationOpensOn: null }, a, today);
        const more = standingReasons(drive.kind, drive.category, await this.svc.standing(tx, r.id), rules, today);
        const reg = regs.get(r.id);
        out.push({ studentId: r.id, fullName: r.fullName, rollNo: r.rollNo, className: r.className, program: r.program, batchYear: a.batchYear, cgpa: a.cgpa, backlogs: a.backlogs, eligible: e.eligible && !more.length, reasons: [...e.reasons, ...more], registration: reg ? { id: reg.id, status: reg.status } : null });
      }
      return { drive: { id: drive.id, title: drive.title, minCgpa: drive.minCgpa, maxBacklogs: drive.maxBacklogs, batchYears: drive.batchYears, programIds: drive.programIds }, students: out, summary: { total: out.length, eligible: out.filter((x) => x.eligible).length, registered: out.filter((x) => x.registration && x.registration.status !== 'withdrawn').length } };
    });
  }

  /**
   * The cell registers a student with a reason, past the registration window: for example one whose backlog was cleared
   * after the window closed. The student must meet the drive's criteria on today's results.
   */
  @Post('drives/:id/registrations')
  @Auth('user', PLACEMENT_ROLES)
  addRegistration(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(AddRegBody)) b: z.infer<typeof AddRegBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const drive = found((await tx.select().from(placementDrives).where(eq(placementDrives.id, id)))[0], 'Drive');
      if (!['open', 'closed'].includes(drive.status)) throw new ConflictException('This drive is not running');
      const [a, today] = [await this.svc.academics(tx, b.studentId), await this.svc.today(tx)];
      const e = checkEligibility({ ...drive, status: 'open', registrationClosesOn: null, registrationOpensOn: null }, a, today);
      const more = standingReasons(drive.kind, drive.category, await this.svc.standing(tx, b.studentId), await this.svc.rules(tx, p.tenantId), today);
      if (!e.eligible || more.length) throw new ConflictException({ statusCode: 409, error: 'Conflict', code: 'NOT_ELIGIBLE', message: 'The student does not meet this drive’s criteria today', reasons: [...e.reasons, ...more] });
      const [existing] = await tx.select().from(driveRegistrations).where(and(eq(driveRegistrations.driveId, id), eq(driveRegistrations.studentId, b.studentId))).for('update');
      if (existing && existing.status !== 'withdrawn') throw new ConflictException('The student is already registered');
      const values = { cgpaAt: a.cgpa ?? 0, backlogsAt: a.backlogs, status: 'registered', createdAt: this.svc.now() };
      const [row] = existing ? await tx.update(driveRegistrations).set(values).where(eq(driveRegistrations.id, existing.id)).returning() : await tx.insert(driveRegistrations).values({ tenantId: p.tenantId, driveId: id, studentId: b.studentId, ...values }).returning();
      await auditUser(tx, p, 'placement.registered_by_office', 'drive', id, { studentId: b.studentId, reason: b.reason, cgpa: a.cgpa, backlogs: a.backlogs });
      await this.svc.notifyStudent(tx, b.studentId, drive.title, 'The placement cell registered you for this drive', `reg:${row.id}`);
      return row;
    });
  }

  /** Re-reads a registration's CGPA and backlogs from today's results (a backlog cleared after registering) and clears a conditional offer once none remain. */
  @Post('registrations/:id/recheck')
  @HttpCode(200)
  @Auth('user', PLACEMENT_ROLES)
  recheck(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const reg = found((await tx.select().from(driveRegistrations).where(eq(driveRegistrations.id, id)).for('update'))[0], 'Registration');
      const drive = found((await tx.select().from(placementDrives).where(eq(placementDrives.id, reg.driveId)))[0], 'Drive');
      const a = await this.svc.academics(tx, reg.studentId);
      const [row] = await tx.update(driveRegistrations).set({ cgpaAt: a.cgpa ?? 0, backlogsAt: a.backlogs }).where(eq(driveRegistrations.id, id)).returning();
      const e = checkEligibility({ ...drive, status: 'open', registrationClosesOn: null, registrationOpensOn: null }, a, await this.svc.today(tx));
      let cleared = 0;
      if (a.backlogs === 0) {
        const done = await tx.update(placementOffers).set({ conditional: false, conditionNote: null }).where(and(eq(placementOffers.registrationId, id), eq(placementOffers.conditional, true))).returning({ id: placementOffers.id });
        cleared = done.length;
      }
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'placement.registration_rechecked', subjectType: 'drive', subjectId: drive.id, before: { cgpaAt: reg.cgpaAt, backlogsAt: reg.backlogsAt }, after: { cgpaAt: row.cgpaAt, backlogsAt: row.backlogsAt }, data: { registrationId: id, conditionsCleared: cleared } });
      return { ...row, eligible: e.eligible, reasons: e.reasons, conditionsCleared: cleared };
    });
  }

  /** The shortlist: registrations with marks and round results, as CSV (for the recruiter) or JSON. */
  @Get('drives/:id/shortlist')
  @Auth('user', PLACEMENT_VIEW_ROLES)
  shortlist(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Query('format') format: string | undefined, @Res({ passthrough: true }) res: Response) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const out = await this.svc.shortlist(tx, id);
      await auditUser(tx, p, 'placement.shortlist_downloaded', 'drive', id, { rows: out.rows.length, format: format ?? 'json' });
      if (format !== 'csv') return out;
      res.setHeader('content-type', 'text/csv; charset=utf-8');
      res.setHeader('content-disposition', `attachment; filename="shortlist.csv"`);
      return out.csv;
    });
  }

  // ---- interview slots ------------------------------------------------------------------------

  @Get('drives/:id/slots')
  @Auth('user', PLACEMENT_VIEW_ROLES)
  slots(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) =>
      (await tx
        .select({ s: interviewSlots, round: driveRounds.name, seq: driveRounds.seq, fullName: students.fullName, rollNo: students.rollNo, room: rooms.name })
        .from(interviewSlots)
        .innerJoin(driveRounds, eq(driveRounds.id, interviewSlots.roundId))
        .innerJoin(driveRegistrations, eq(driveRegistrations.id, interviewSlots.registrationId))
        .innerJoin(students, eq(students.id, driveRegistrations.studentId))
        .leftJoin(rooms, eq(rooms.id, interviewSlots.roomId))
        .where(eq(interviewSlots.driveId, id))
        .orderBy(asc(driveRounds.seq), asc(interviewSlots.startsAt), asc(interviewSlots.venue))).map((r) => ({ ...r.s, round: r.round, seq: r.seq, fullName: r.fullName, rollNo: r.rollNo, room: r.room })),
    );
  }

  /**
   * Schedules everyone still in the running for a round (registered or shortlisted, and through the previous round),
   * in parallel venues one after another. Those already slotted for the round keep their slot; a student who has
   * another interview at that time (another drive) is moved to the next free slot.
   */
  @Post('drives/:id/rounds/:roundId/slots/auto')
  @Auth('user', PLACEMENT_ROLES)
  autoSlots(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Param('roundId', ParseUUIDPipe) roundId: string, @Body(new ZodBody(AutoSlotsBody)) b: z.infer<typeof AutoSlotsBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const drive = found((await tx.select().from(placementDrives).where(eq(placementDrives.id, id)))[0], 'Drive');
      const round = found((await tx.select().from(driveRounds).where(and(eq(driveRounds.id, roundId), eq(driveRounds.driveId, id))))[0], 'Round');
      if (['draft', 'cancelled', 'completed'].includes(drive.status)) throw new ConflictException('This drive is not running');
      let regs = await tx.select().from(driveRegistrations).where(and(eq(driveRegistrations.driveId, id), inArray(driveRegistrations.status, ['registered', 'shortlisted'])));
      if (round.seq > 1) {
        const [prev] = await tx.select({ id: driveRounds.id }).from(driveRounds).where(and(eq(driveRounds.driveId, id), eq(driveRounds.seq, round.seq - 1)));
        const passed = new Set((await tx.select({ r: roundResults.registrationId }).from(roundResults).where(and(eq(roundResults.roundId, prev.id), eq(roundResults.result, 'pass')))).map((x) => x.r));
        regs = regs.filter((r) => passed.has(r.id));
      }
      const have = new Set((await tx.select({ r: interviewSlots.registrationId }).from(interviewSlots).where(eq(interviewSlots.roundId, roundId))).map((x) => x.r));
      const todo = regs.filter((r) => !have.has(r.id));
      if (!todo.length) throw new ConflictException('Everyone in this round already has a slot');
      // A student's other interviews (other drives), so a slot never clashes with them.
      const busy = await tx.select({ studentId: driveRegistrations.studentId, startsAt: interviewSlots.startsAt, endsAt: interviewSlots.endsAt }).from(interviewSlots).innerJoin(driveRegistrations, eq(driveRegistrations.id, interviewSlots.registrationId)).where(and(inArray(driveRegistrations.studentId, todo.map((r) => r.studentId)), ne(interviewSlots.status, 'cancelled')));
      const plan = planSlots(todo.map((r) => r.id), new Date(b.startsAt), b.minutes, b.gapMinutes, b.venues);
      const step = (b.minutes + b.gapMinutes) * 60_000 * Math.ceil(todo.length / b.venues.length);
      const made = [];
      for (const s of plan) {
        const reg = todo.find((r) => r.id === s.registrationId)!;
        let { startsAt, endsAt } = s;
        for (let guard = 0; guard < 20 && busy.some((x) => x.studentId === reg.studentId && x.startsAt < endsAt && startsAt < x.endsAt); guard++) {
          startsAt = new Date(startsAt.getTime() + step);
          endsAt = new Date(endsAt.getTime() + step);
        }
        const [row] = await tx.insert(interviewSlots).values({ tenantId: p.tenantId, driveId: id, roundId, registrationId: reg.id, startsAt, endsAt, venue: s.venue, panel: b.panel }).returning();
        made.push(row);
        const when = startsAt.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' });
        await this.svc.notifyStudent(tx, reg.studentId, drive.title, `${round.name}: ${when} at ${s.venue}`, `slot:${row.id}`);
      }
      await auditUser(tx, p, 'placement.slots_scheduled', 'drive', id, { roundId, count: made.length, venues: b.venues });
      return { scheduled: made.length, slots: made };
    });
  }

  /** Moves or updates one slot; a venue cannot hold two interviews at once, nor a student two. */
  @Put('slots/:id')
  @Auth('user', PLACEMENT_ROLES)
  updateSlot(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(SlotBody)) b: z.infer<typeof SlotBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const s = found((await tx.select().from(interviewSlots).where(eq(interviewSlots.id, id)).for('update'))[0], 'Slot');
      const startsAt = b.startsAt ? new Date(b.startsAt) : s.startsAt;
      const endsAt = new Date(startsAt.getTime() + (b.minutes ?? (s.endsAt.getTime() - s.startsAt.getTime()) / 60_000) * 60_000);
      const venue = b.venue ?? s.venue;
      if (b.roomId) found((await tx.select({ id: rooms.id }).from(rooms).where(eq(rooms.id, b.roomId)))[0], 'Room');
      const [reg] = await tx.select({ studentId: driveRegistrations.studentId }).from(driveRegistrations).where(eq(driveRegistrations.id, s.registrationId));
      const clash = await tx
        .select({ id: interviewSlots.id, venue: interviewSlots.venue, studentId: driveRegistrations.studentId })
        .from(interviewSlots)
        .innerJoin(driveRegistrations, eq(driveRegistrations.id, interviewSlots.registrationId))
        .where(and(ne(interviewSlots.id, id), ne(interviewSlots.status, 'cancelled'), sql`${interviewSlots.startsAt} < ${endsAt.toISOString()}::timestamptz and ${startsAt.toISOString()}::timestamptz < ${interviewSlots.endsAt}`, or(and(eq(interviewSlots.driveId, s.driveId), eq(interviewSlots.venue, venue)), eq(driveRegistrations.studentId, reg.studentId))));
      if ((b.status ?? s.status) !== 'cancelled' && clash.length) throw new ConflictException({ statusCode: 409, error: 'Conflict', code: 'SLOT_CONFLICT', message: clash.some((c) => c.studentId === reg.studentId) ? 'The student has another interview then' : `${venue} is taken then` });
      const [row] = await tx.update(interviewSlots).set({ startsAt, endsAt, venue, roomId: b.roomId === undefined ? s.roomId : b.roomId, panel: b.panel ?? s.panel, status: b.status ?? s.status }).where(eq(interviewSlots.id, id)).returning();
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'placement.slot_updated', subjectType: 'drive', subjectId: s.driveId, before: { startsAt: s.startsAt.toISOString(), venue: s.venue, status: s.status }, after: { startsAt: row.startsAt.toISOString(), venue: row.venue, status: row.status } });
      if (b.startsAt || b.venue) {
        const when = startsAt.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' });
        await this.svc.notifyStudent(tx, reg.studentId, 'Interview moved', `New time: ${when} at ${venue}`, `slot:${id}:${startsAt.toISOString()}:${venue}`);
      }
      return row;
    });
  }

  // ---- offers ---------------------------------------------------------------------------------

  /** The company revokes an offer (made or accepted): the student is free to sit for other drives again. */
  @Post('offers/:id/revoke')
  @HttpCode(200)
  @Auth('user', PLACEMENT_ROLES)
  revoke(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(RevokeBody)) b: z.infer<typeof RevokeBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const o = found((await tx.select().from(placementOffers).where(eq(placementOffers.id, id)).for('update'))[0], 'Offer');
      if (!['offered', 'accepted'].includes(o.status)) throw new ConflictException(`A ${o.status} offer cannot be revoked`);
      const [row] = await tx.update(placementOffers).set({ status: 'revoked', revokedReason: b.reason, revokedOn: await this.svc.today(tx) }).where(eq(placementOffers.id, id)).returning();
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'placement.offer_revoked', subjectType: 'offer', subjectId: id, before: { status: o.status }, after: { status: 'revoked' }, data: { reason: b.reason } });
      await this.svc.notifyStudent(tx, o.studentId, 'Offer revoked', `The company revoked your offer for ${o.roleTitle}: ${b.reason}. You can register for other drives.`, `revoke:${id}`);
      return row;
    });
  }

  /** The cell records the student's answer given in writing (the student usually answers in the app). */
  @Post('offers/:id/record-response')
  @HttpCode(200)
  @Auth('user', PLACEMENT_ROLES)
  recordResponse(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(RecordResponseBody)) b: z.infer<typeof RecordResponseBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const o = found((await tx.select().from(placementOffers).where(eq(placementOffers.id, id)).for('update'))[0], 'Offer');
      if (o.status !== 'offered') throw new ConflictException(`This offer is ${o.status}`);
      if (b.response === 'accepted') {
        const [other] = await tx.select({ id: placementOffers.id }).from(placementOffers).innerJoin(placementDrives, eq(placementDrives.id, placementOffers.driveId)).where(and(eq(placementOffers.studentId, o.studentId), eq(placementOffers.status, 'accepted'), ne(placementOffers.id, id)));
        if (other) throw new ConflictException('The student has already accepted another offer');
      }
      const [row] = await tx.update(placementOffers).set({ status: b.response, respondedAt: new Date(), respondedVia: 'office', declineReason: b.response === 'declined' ? (b.reason ?? null) : null }).where(eq(placementOffers.id, id)).returning();
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: `placement.offer_${b.response}`, subjectType: 'offer', subjectId: id, before: { status: 'offered' }, after: { status: b.response }, data: { via: 'office', reason: b.reason } });
      if (b.response === 'accepted') {
        const [drive] = await tx.select({ companyId: placementDrives.companyId }).from(placementDrives).where(eq(placementDrives.id, o.driveId));
        const alumniId = drive ? await promoteToAlumni(tx, p.tenantId, o.studentId, { roleTitle: o.roleTitle }, drive.companyId) : null;
        await this.events.emit(tx, p.tenantId, { type: DomainEvents.PlacementAccepted, aggregateType: 'placement_offer', aggregateId: id, actorId: p.userId, payload: { driveId: o.driveId, studentId: o.studentId, alumniProfileId: alumniId } });
      }
      return row;
    });
  }

  /** The joining confirmation: the student joined the company (on a day), or did not. */
  @Post('offers/:id/joining')
  @HttpCode(200)
  @Auth('user', PLACEMENT_ROLES)
  joining(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(JoiningBody)) b: z.infer<typeof JoiningBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const o = found((await tx.select().from(placementOffers).where(eq(placementOffers.id, id)).for('update'))[0], 'Offer');
      if (o.status !== 'accepted') throw new ConflictException('Only an accepted offer is joined');
      if (b.status === 'joined' && !b.joinedOn) throw new BadRequestException('Give the joining date');
      const [row] = await tx.update(placementOffers).set({ joiningStatus: b.status, joinedOn: b.status === 'joined' ? b.joinedOn! : null, joiningNote: b.note ?? null }).where(eq(placementOffers.id, id)).returning();
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'placement.joining_recorded', subjectType: 'offer', subjectId: id, before: { joiningStatus: o.joiningStatus }, after: { joiningStatus: b.status, joinedOn: row.joinedOn } });
      return row;
    });
  }

  /** Attaches the company's offer letter (PDF or image, at most 5 MB). */
  @Post('offers/:id/letter')
  @Auth('user', PLACEMENT_ROLES)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_LETTER, files: 1 } }))
  async letter(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @UploadedFile() file?: { buffer: Buffer; originalname: string }) {
    if (!file?.buffer?.length) throw new BadRequestException('Choose the offer letter file');
    const type = documentType(file.buffer);
    if (!type) throw new BadRequestException('The offer letter must be a PDF, JPEG or PNG');
    await this.scans.assertClean(file.buffer, 'The offer letter');
    const key = `tenants/${p.tenantId}/placements/offers/${id}-${Date.now()}`;
    const exists = await this.db.withTenant(p.tenantId, async (tx) => !!(await tx.select({ id: placementOffers.id }).from(placementOffers).where(eq(placementOffers.id, id)))[0]);
    if (!exists) throw new NotFoundException('Offer not found');
    await this.storage.put(key, Readable.from(file.buffer), MAX_LETTER, type);
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [o] = await tx.select().from(placementOffers).where(eq(placementOffers.id, id)).for('update');
      const [row] = await tx.update(placementOffers).set({ offerLetterKey: `${key}|${type}`, offerLetterName: file.originalname.slice(0, 160) }).where(eq(placementOffers.id, id)).returning();
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'placement.offer_letter_attached', subjectType: 'offer', subjectId: id, data: { name: row.offerLetterName } });
      if (o.offerLetterKey) await this.storage.delete(o.offerLetterKey.split('|')[0]).catch(() => undefined);
      const { offerLetterKey: _k, ...rest } = row;
      return { ...rest, hasLetter: true };
    });
  }

  /** The offer letter, for the cell, the student or their family. */
  @Get('offers/:id/letter')
  @Auth('user')
  async getLetter(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Res({ passthrough: true }) res: Response) {
    const o = await this.db.withTenant(p.tenantId, async (tx) => {
      const [row] = await tx.select().from(placementOffers).where(eq(placementOffers.id, id));
      if (!row?.offerLetterKey) throw new NotFoundException('No offer letter');
      await assertCanSeeStudent(tx, p, row.studentId, PLACEMENT_VIEW_ROLES);
      return row;
    });
    const [key, type] = o.offerLetterKey!.split('|');
    const obj = await this.storage.get(key);
    res.setHeader('content-type', type || 'application/pdf');
    res.setHeader('content-disposition', `inline; filename="${(o.offerLetterName ?? 'offer-letter').replace(/[^\w.\- ]/g, '_')}"`);
    return new StreamableFile(obj.stream);
  }

  /** Jobs and internships alumni and the office posted, open now: what the Student App lists. */
  @Get('jobs/open')
  @Auth('user', ['student', ...PLACEMENT_VIEW_ROLES])
  openJobs(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, (tx) =>
      tx
        .select({ id: alumniJobPosts.id, title: alumniJobPosts.title, company: alumniJobPosts.company, kind: alumniJobPosts.kind, location: alumniJobPosts.location, description: alumniJobPosts.description, applyContact: alumniJobPosts.applyContact, closesOn: alumniJobPosts.closesOn, postedBy: alumniProfiles.fullName, createdAt: alumniJobPosts.createdAt })
        .from(alumniJobPosts)
        .leftJoin(alumniProfiles, eq(alumniProfiles.id, alumniJobPosts.alumniId))
        .where(and(eq(alumniJobPosts.status, 'published'), sql`(${alumniJobPosts.closesOn} is null or ${alumniJobPosts.closesOn} >= current_date)`))
        .orderBy(desc(alumniJobPosts.createdAt))
        .limit(200),
    );
  }

  // ---- placement training -----------------------------------------------------------------------

  /** A training programme: its sessions, the students it covers with attendance, and test scores. */
  @Get('trainings/:id')
  @Auth('user', PLACEMENT_VIEW_ROLES)
  training(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const t = found((await tx.select().from(placementTrainings).where(eq(placementTrainings.id, id)))[0], 'Training');
      const sessions = await tx.select().from(placementTrainingSessions).where(eq(placementTrainingSessions.trainingId, id)).orderBy(asc(placementTrainingSessions.heldOn), asc(placementTrainingSessions.createdAt));
      const roster = await this.roster(tx, t);
      const marks = sessions.length ? await tx.select().from(placementTrainingAttendance).where(inArray(placementTrainingAttendance.sessionId, sessions.map((s) => s.id))) : [];
      const scores = await tx.select().from(placementTrainingScores).where(eq(placementTrainingScores.trainingId, id)).orderBy(asc(placementTrainingScores.takenOn));
      const tests = [...new Set(scores.map((s) => s.testName))];
      const students = roster.map((s) => {
        const mine = marks.filter((m) => m.studentId === s.id);
        const present = mine.filter((m) => m.present).length;
        return { ...s, present, marked: mine.length, attendancePct: mine.length ? Math.round((present / sessions.length) * 1000) / 10 : null, attendance: Object.fromEntries(mine.map((m) => [m.sessionId, m.present])), scores: Object.fromEntries(scores.filter((x) => x.studentId === s.id).map((x) => [x.testName, { score: x.score, maxScore: x.maxScore }])) };
      });
      return { ...t, sessions, tests, students };
    });
  }

  /** The students a training covers: active students of its programme (all programmes if none) and batch. */
  private async roster(tx: Tx, t: typeof placementTrainings.$inferSelect) {
    const rows = await tx
      .select({ id: students.id, fullName: students.fullName, rollNo: students.rollNo, className: sections.displayName, term: sections.term, termCount: programs.termCount, level: programs.level, yearEnds: academicYears.endsOn })
      .from(students)
      .innerJoin(sections, eq(sections.id, students.sectionId))
      .innerJoin(programs, eq(programs.id, sections.programId))
      .innerJoin(academicYears, eq(academicYears.id, sections.academicYearId))
      .where(and(eq(students.status, 'active'), t.programId ? eq(sections.programId, t.programId) : undefined))
      .orderBy(asc(sections.displayName), asc(students.rollNo));
    return rows.filter((r) => !t.batchYear || graduationYear(String(r.yearEnds), r.termCount, r.term, String(r.level)) === t.batchYear).map((r) => ({ id: r.id, fullName: r.fullName, rollNo: r.rollNo, className: r.className }));
  }

  @Post('trainings/:id/sessions')
  @Auth('user', PLACEMENT_ROLES)
  addSession(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(SessionBody)) b: z.infer<typeof SessionBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const t = found((await tx.select().from(placementTrainings).where(eq(placementTrainings.id, id)))[0], 'Training');
      if (t.status === 'cancelled') throw new ConflictException('This training is cancelled');
      if (b.heldOn < t.startsOn || b.heldOn > t.endsOn) throw new BadRequestException(`A session falls between ${t.startsOn} and ${t.endsOn}`);
      const [row] = await tx.insert(placementTrainingSessions).values({ tenantId: p.tenantId, trainingId: id, ...b }).returning();
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'placement.training_session_added', subjectType: 'placement_training', subjectId: id, after: { heldOn: b.heldOn, topic: b.topic } });
      if (t.status === 'planned') await tx.update(placementTrainings).set({ status: 'ongoing' }).where(eq(placementTrainings.id, id));
      return row;
    });
  }

  @Delete('training-sessions/:id')
  @Auth('user', PLACEMENT_ROLES)
  removeSession(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const s = found((await tx.select().from(placementTrainingSessions).where(eq(placementTrainingSessions.id, id)))[0], 'Session');
      await tx.delete(placementTrainingSessions).where(eq(placementTrainingSessions.id, id));
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'placement.training_session_removed', subjectType: 'placement_training', subjectId: s.trainingId, before: { heldOn: s.heldOn, topic: s.topic } });
      return { ok: true };
    });
  }

  /** Marks a session's attendance: the present and absent students (others stay unmarked). */
  @Put('training-sessions/:id/attendance')
  @Auth('user', PLACEMENT_ROLES)
  attendance(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(AttendanceBody)) b: z.infer<typeof AttendanceBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const s = found((await tx.select().from(placementTrainingSessions).where(eq(placementTrainingSessions.id, id)))[0], 'Session');
      const t = found((await tx.select().from(placementTrainings).where(eq(placementTrainings.id, s.trainingId)))[0], 'Training');
      const roster = new Set((await this.roster(tx, t)).map((r) => r.id));
      const all = [...b.present.map((x) => [x, true] as const), ...b.absent.map((x) => [x, false] as const)];
      if (new Set(all.map(([x]) => x)).size !== all.length) throw new BadRequestException('A student is marked twice');
      if (all.some(([x]) => !roster.has(x))) throw new BadRequestException('A student is not part of this training');
      for (const [studentId, present] of all) await tx.insert(placementTrainingAttendance).values({ tenantId: p.tenantId, sessionId: id, studentId, present }).onConflictDoUpdate({ target: [placementTrainingAttendance.sessionId, placementTrainingAttendance.studentId], set: { present } });
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'placement.training_attendance', subjectType: 'placement_training', subjectId: t.id, data: { sessionId: id, present: b.present.length, absent: b.absent.length } });
      return { present: b.present.length, absent: b.absent.length };
    });
  }

  /** Records an aptitude or mock test's scores (again with the same test name replaces them). */
  @Put('trainings/:id/scores')
  @Auth('user', PLACEMENT_ROLES)
  scores(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(ScoresBody)) b: z.infer<typeof ScoresBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const t = found((await tx.select().from(placementTrainings).where(eq(placementTrainings.id, id)))[0], 'Training');
      const roster = new Set((await this.roster(tx, t)).map((r) => r.id));
      if (b.scores.some((s) => !roster.has(s.studentId))) throw new BadRequestException('A student is not part of this training');
      if (b.scores.some((s) => s.score > b.maxScore)) throw new BadRequestException(`A score is above the maximum of ${b.maxScore}`);
      for (const s of b.scores) await tx.insert(placementTrainingScores).values({ tenantId: p.tenantId, trainingId: id, studentId: s.studentId, testName: b.testName, score: s.score, maxScore: b.maxScore, takenOn: b.takenOn ?? null }).onConflictDoUpdate({ target: [placementTrainingScores.trainingId, placementTrainingScores.studentId, placementTrainingScores.testName], set: { score: s.score, maxScore: b.maxScore, takenOn: b.takenOn ?? null } });
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'placement.training_scores', subjectType: 'placement_training', subjectId: id, data: { testName: b.testName, count: b.scores.length } });
      return { recorded: b.scores.length };
    });
  }
}

