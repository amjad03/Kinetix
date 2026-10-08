import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { UserPrincipal } from '../auth/principal.js';
import { auditUser } from '../common/audit.js';
import { Day, orConflict } from '../common/ops.js';
import { assertCanSeeStudent } from '../common/student-access.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService } from '../db/db.service.js';
import { driveRegistrations, driveRounds, internships, placementCompanies, placementDrives, placementOffers, programs, roundResults, sections, students } from '../db/schema.js';
import { canMoveDrive, checkEligibility, ctcSummary } from './eligibility.js';
import { PLACEMENT_ROLES, PLACEMENT_VIEW_ROLES, checkVersion, found } from './placements.access.js';
import { PlacementsService } from './placements.service.js';

const Opt = (n: number) => z.string().trim().max(n).optional();
const CompanyBody = z.object({
  name: z.string().trim().min(1).max(120),
  sector: z.string().trim().max(80).default(''),
  website: z.url().optional(),
  contactName: Opt(80),
  contactEmail: z.email().optional(),
  contactPhone: Opt(30),
  status: z.enum(['active', 'blacklisted']).default('active'),
});
const DriveBody = z.object({
  companyId: z.uuid(),
  title: z.string().trim().min(1).max(160),
  kind: z.enum(['placement', 'internship']).default('placement'),
  roleTitle: z.string().trim().min(1).max(120),
  ctcLpa: z.number().min(0).max(1000).optional(),
  stipendMonthly: z.number().int().min(0).max(1_000_000).optional(),
  location: z.string().trim().max(120).default(''),
  description: z.string().trim().max(4000).default(''),
  driveDate: Day.optional(),
  registrationClosesOn: Day.optional(),
  minCgpa: z.number().min(0).max(10).default(0),
  maxBacklogs: z.number().int().min(0).max(50).default(0),
  programIds: z.array(z.uuid()).max(50).default([]),
  expectedVersion: z.number().int().optional(),
});
const RoundBody = z.object({ name: z.string().trim().min(1).max(80), kind: z.enum(['aptitude', 'technical', 'gd', 'interview', 'hr']).default('interview'), scheduledOn: Day.optional() });
const ResultsBody = z.object({ results: z.array(z.object({ registrationId: z.uuid(), result: z.enum(['pass', 'fail', 'absent']), note: z.string().trim().max(300).default('') })).min(1).max(500) });
const OfferBody = z.object({ registrationId: z.uuid(), roleTitle: Opt(120), ctcLpa: z.number().min(0).max(1000).optional(), respondBy: Day.optional() });
const RespondBody = z.object({ response: z.enum(['accepted', 'declined']), reason: Opt(300) });

/** Companies, drives, registrations, rounds, offers and statistics (docs/architecture/placements.md). */
@Controller('v1/placements')
export class PlacementsController {
  constructor(
    private readonly db: DbService,
    private readonly svc: PlacementsService,
  ) {}

  // ---- companies ----------------------------------------------------------------------------

  @Get('companies')
  @Auth('user', PLACEMENT_VIEW_ROLES)
  companies(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, (tx) => tx.select().from(placementCompanies).orderBy(asc(placementCompanies.name)));
  }

  @Post('companies')
  @Auth('user', PLACEMENT_ROLES)
  createCompany(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(CompanyBody)) b: z.infer<typeof CompanyBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [row] = await orConflict('A company with that name already exists', () => tx.insert(placementCompanies).values({ tenantId: p.tenantId, ...b }).returning());
      await auditUser(tx, p, 'placement.company_created', 'company', row.id, { name: b.name });
      return row;
    });
  }

  @Put('companies/:id')
  @Auth('user', PLACEMENT_ROLES)
  updateCompany(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(CompanyBody)) b: z.infer<typeof CompanyBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [row] = await orConflict('A company with that name already exists', () => tx.update(placementCompanies).set(b).where(eq(placementCompanies.id, id)).returning());
      await auditUser(tx, p, 'placement.company_updated', 'company', id, b);
      return found(row, 'Company');
    });
  }

  // ---- drives -------------------------------------------------------------------------------

  @Get('drives')
  @Auth('user', PLACEMENT_VIEW_ROLES)
  drives(@CurrentPrincipal() p: UserPrincipal, @Query('status') status?: string, @Query('kind') kind?: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const rows = await tx
        .select({ d: placementDrives, company: placementCompanies.name, registrations: sql<number>`(select count(*)::int from drive_registrations r where r.drive_id = ${placementDrives.id} and r.status <> 'withdrawn')` })
        .from(placementDrives)
        .innerJoin(placementCompanies, eq(placementCompanies.id, placementDrives.companyId))
        .where(and(status ? eq(placementDrives.status, status) : undefined, kind ? eq(placementDrives.kind, kind) : undefined))
        .orderBy(desc(placementDrives.createdAt));
      return rows.map((r) => ({ ...r.d, company: r.company, registrations: r.registrations }));
    });
  }

  @Post('drives')
  @Auth('user', PLACEMENT_ROLES)
  createDrive(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(DriveBody)) b: z.infer<typeof DriveBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const company = found((await tx.select().from(placementCompanies).where(eq(placementCompanies.id, b.companyId)))[0], 'Company');
      if (company.status === 'blacklisted') throw new ConflictException('That company is blacklisted');
      const { expectedVersion: _v, ...values } = b;
      const [row] = await tx.insert(placementDrives).values({ tenantId: p.tenantId, createdBy: p.userId, ...values }).returning();
      await auditUser(tx, p, 'placement.drive_created', 'drive', row.id, { title: b.title });
      return row;
    });
  }

  @Get('drives/:id')
  @Auth('user', PLACEMENT_VIEW_ROLES)
  drive(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const d = found((await tx.select().from(placementDrives).where(eq(placementDrives.id, id)))[0], 'Drive');
      const rounds = await tx.select().from(driveRounds).where(eq(driveRounds.driveId, id)).orderBy(asc(driveRounds.seq));
      return { ...d, rounds };
    });
  }

  @Put('drives/:id')
  @Auth('user', PLACEMENT_ROLES)
  updateDrive(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(DriveBody)) b: z.infer<typeof DriveBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const cur = found((await tx.select().from(placementDrives).where(eq(placementDrives.id, id)).for('update'))[0], 'Drive');
      checkVersion(cur.version, b.expectedVersion);
      if (['completed', 'cancelled'].includes(cur.status)) throw new ConflictException('A finished drive cannot be edited');
      const { expectedVersion: _v, ...values } = b;
      const [row] = await tx.update(placementDrives).set({ ...values, version: cur.version + 1 }).where(eq(placementDrives.id, id)).returning();
      await auditUser(tx, p, 'placement.drive_updated', 'drive', id, values);
      return row;
    });
  }

  /** Moves a drive between draft, open, closed, completed and cancelled. */
  @Post('drives/:id/status')
  @Auth('user', PLACEMENT_ROLES)
  @HttpCode(200)
  moveDrive(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(z.object({ status: z.enum(['open', 'closed', 'completed', 'cancelled']) }))) b: { status: string }) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const cur = found((await tx.select().from(placementDrives).where(eq(placementDrives.id, id)).for('update'))[0], 'Drive');
      if (!canMoveDrive(cur.status, b.status)) throw new ConflictException(`A ${cur.status} drive cannot become ${b.status}`);
      const [row] = await tx.update(placementDrives).set({ status: b.status, version: cur.version + 1 }).where(eq(placementDrives.id, id)).returning();
      await auditUser(tx, p, `placement.drive_${b.status}`, 'drive', id, { from: cur.status });
      return row;
    });
  }

  @Get('drives/:id/registrations')
  @Auth('user', PLACEMENT_VIEW_ROLES)
  registrations(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const regs = await tx
        .select({ r: driveRegistrations, fullName: students.fullName, rollNo: students.rollNo })
        .from(driveRegistrations)
        .innerJoin(students, eq(students.id, driveRegistrations.studentId))
        .where(eq(driveRegistrations.driveId, id))
        .orderBy(asc(students.rollNo));
      const results = regs.length ? await tx.select().from(roundResults).where(inArray(roundResults.registrationId, regs.map((r) => r.r.id))) : [];
      return regs.map((r) => ({ ...r.r, fullName: r.fullName, rollNo: r.rollNo, rounds: results.filter((x) => x.registrationId === r.r.id).map((x) => ({ roundId: x.roundId, result: x.result, note: x.note })) }));
    });
  }

  // ---- rounds, results and offers -----------------------------------------------------------

  @Post('drives/:id/rounds')
  @Auth('user', PLACEMENT_ROLES)
  addRound(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(RoundBody)) b: z.infer<typeof RoundBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      found((await tx.select({ id: placementDrives.id }).from(placementDrives).where(eq(placementDrives.id, id)))[0], 'Drive');
      const [{ n }] = await tx.select({ n: sql<number>`coalesce(max(${driveRounds.seq}), 0)::int` }).from(driveRounds).where(eq(driveRounds.driveId, id));
      const [row] = await orConflict('Another round was added at the same time', () => tx.insert(driveRounds).values({ tenantId: p.tenantId, driveId: id, seq: n + 1, ...b }).returning());
      await auditUser(tx, p, 'placement.round_added', 'drive', id, { seq: row.seq, name: b.name });
      return row;
    });
  }

  /** Records pass/fail/absent for registrations in one round; a fail rejects the student, a pass shortlists. */
  @Put('drives/:id/rounds/:roundId/results')
  @Auth('user', PLACEMENT_ROLES)
  roundResults(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Param('roundId', ParseUUIDPipe) roundId: string, @Body(new ZodBody(ResultsBody)) b: z.infer<typeof ResultsBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const drive = found((await tx.select().from(placementDrives).where(eq(placementDrives.id, id)))[0], 'Drive');
      const round = found((await tx.select().from(driveRounds).where(and(eq(driveRounds.id, roundId), eq(driveRounds.driveId, id))))[0], 'Round');
      if (['draft', 'cancelled'].includes(drive.status)) throw new ConflictException('This drive is not running');
      const regs = await tx.select().from(driveRegistrations).where(and(eq(driveRegistrations.driveId, id), inArray(driveRegistrations.id, b.results.map((r) => r.registrationId))));
      if (regs.length !== new Set(b.results.map((r) => r.registrationId)).size) throw new BadRequestException('Some registrations do not belong to this drive');
      const prev = round.seq > 1 ? (await tx.select({ id: driveRounds.id }).from(driveRounds).where(and(eq(driveRounds.driveId, id), eq(driveRounds.seq, round.seq - 1))))[0] : null;
      const prevPassed = prev ? new Set((await tx.select({ r: roundResults.registrationId }).from(roundResults).where(and(eq(roundResults.roundId, prev.id), eq(roundResults.result, 'pass')))).map((x) => x.r)) : null;
      for (const r of b.results) {
        const reg = regs.find((x) => x.id === r.registrationId)!;
        if (['withdrawn', 'rejected', 'selected'].includes(reg.status)) throw new ConflictException(`A ${reg.status} registration cannot take a round result`);
        if (prevPassed && !prevPassed.has(reg.id)) throw new ConflictException('The student has not cleared the previous round');
        await tx.insert(roundResults).values({ tenantId: p.tenantId, roundId, registrationId: reg.id, result: r.result, note: r.note }).onConflictDoUpdate({ target: [roundResults.roundId, roundResults.registrationId], set: { result: r.result, note: r.note, recordedAt: new Date() } });
        const status = r.result === 'pass' ? 'shortlisted' : 'rejected';
        await tx.update(driveRegistrations).set({ status }).where(eq(driveRegistrations.id, reg.id));
        await this.svc.notifyStudent(tx, reg.studentId, drive.title, `${round.name}: ${r.result === 'pass' ? 'you cleared this round' : 'you were not selected'}`, `round:${roundId}:${reg.id}`);
      }
      await auditUser(tx, p, 'placement.round_results', 'drive', id, { roundId, count: b.results.length });
      return { recorded: b.results.length };
    });
  }

  @Post('drives/:id/offers')
  @Auth('user', PLACEMENT_ROLES)
  makeOffer(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(OfferBody)) b: z.infer<typeof OfferBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const drive = found((await tx.select().from(placementDrives).where(eq(placementDrives.id, id)))[0], 'Drive');
      const reg = found((await tx.select().from(driveRegistrations).where(and(eq(driveRegistrations.id, b.registrationId), eq(driveRegistrations.driveId, id))).for('update'))[0], 'Registration');
      if (reg.status !== 'shortlisted') throw new ConflictException('Only a shortlisted student can receive an offer');
      const rounds = await tx.select().from(driveRounds).where(eq(driveRounds.driveId, id)).orderBy(desc(driveRounds.seq));
      if (rounds[0]) {
        const [last] = await tx.select().from(roundResults).where(and(eq(roundResults.roundId, rounds[0].id), eq(roundResults.registrationId, reg.id)));
        if (last?.result !== 'pass') throw new ConflictException('The student has not cleared the final round');
      }
      const offeredOn = await this.svc.today(tx);
      const [row] = await orConflict('This student already has an offer from this drive', () =>
        tx.insert(placementOffers).values({ tenantId: p.tenantId, driveId: id, registrationId: reg.id, studentId: reg.studentId, roleTitle: b.roleTitle ?? drive.roleTitle, ctcLpa: b.ctcLpa ?? drive.ctcLpa, offeredOn, respondBy: b.respondBy }).returning(),
      );
      await tx.update(driveRegistrations).set({ status: 'selected' }).where(eq(driveRegistrations.id, reg.id));
      await auditUser(tx, p, 'placement.offer_made', 'offer', row.id, { driveId: id, studentId: reg.studentId, ctcLpa: row.ctcLpa });
      await this.svc.notifyStudent(tx, reg.studentId, drive.title, `You have an offer: ${row.roleTitle}`, `offer:${row.id}`);
      return row;
    });
  }

  @Post('offers/:id/withdraw')
  @Auth('user', PLACEMENT_ROLES)
  @HttpCode(200)
  withdrawOffer(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const o = found((await tx.select().from(placementOffers).where(eq(placementOffers.id, id)).for('update'))[0], 'Offer');
      if (o.status !== 'offered') throw new ConflictException(`A ${o.status} offer cannot be withdrawn`);
      const [row] = await tx.update(placementOffers).set({ status: 'withdrawn' }).where(eq(placementOffers.id, id)).returning();
      await auditUser(tx, p, 'placement.offer_withdrawn', 'offer', id);
      return row;
    });
  }

  @Get('offers')
  @Auth('user', PLACEMENT_VIEW_ROLES)
  offers(@CurrentPrincipal() p: UserPrincipal, @Query('driveId') driveId?: string) {
    return this.db.withTenant(p.tenantId, (tx) =>
      tx
        .select({ o: placementOffers, fullName: students.fullName, rollNo: students.rollNo })
        .from(placementOffers)
        .innerJoin(students, eq(students.id, placementOffers.studentId))
        .where(driveId ? eq(placementOffers.driveId, driveId) : undefined)
        .orderBy(desc(placementOffers.createdAt))
        .then((rows) => rows.map((r) => ({ ...r.o, fullName: r.fullName, rollNo: r.rollNo }))),
    );
  }

  // ---- student and family -------------------------------------------------------------------

  /** Open drives with eligibility, the student's registrations and offers: the Student and Parent apps' view. */
  @Get('students/:studentId/overview')
  @Auth('user')
  overview(@CurrentPrincipal() p: UserPrincipal, @Param('studentId', ParseUUIDPipe) studentId: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await assertCanSeeStudent(tx, p, studentId, PLACEMENT_VIEW_ROLES);
      const [academics, today] = [await this.svc.academics(tx, studentId), await this.svc.today(tx)];
      const drives = await tx
        .select({ d: placementDrives, company: placementCompanies.name })
        .from(placementDrives)
        .innerJoin(placementCompanies, eq(placementCompanies.id, placementDrives.companyId))
        .where(inArray(placementDrives.status, ['open', 'closed', 'completed']))
        .orderBy(desc(placementDrives.driveDate));
      const regs = await tx.select().from(driveRegistrations).where(eq(driveRegistrations.studentId, studentId));
      const offers = await tx.select().from(placementOffers).where(eq(placementOffers.studentId, studentId)).orderBy(desc(placementOffers.createdAt));
      const interns = await tx.select().from(internships).where(eq(internships.studentId, studentId)).orderBy(desc(internships.startsOn));
      const mine = new Map(regs.map((r) => [r.driveId, r]));
      return {
        academics: { cgpa: academics.cgpa, backlogs: academics.backlogs },
        placed: offers.some((o) => o.status === 'accepted'),
        drives: drives
          .filter((x) => x.d.status === 'open' || mine.has(x.d.id))
          .map((x) => ({ id: x.d.id, title: x.d.title, company: x.company, kind: x.d.kind, roleTitle: x.d.roleTitle, ctcLpa: x.d.ctcLpa, stipendMonthly: x.d.stipendMonthly, location: x.d.location, driveDate: x.d.driveDate, registrationClosesOn: x.d.registrationClosesOn, status: x.d.status, minCgpa: x.d.minCgpa, maxBacklogs: x.d.maxBacklogs, eligibility: checkEligibility(x.d, academics, today), registration: mine.get(x.d.id) ? { id: mine.get(x.d.id)!.id, status: mine.get(x.d.id)!.status } : null })),
        offers: offers.map((o) => ({ id: o.id, driveId: o.driveId, roleTitle: o.roleTitle, ctcLpa: o.ctcLpa, status: o.status, offeredOn: o.offeredOn, respondBy: o.respondBy })),
        internships: interns.map((i) => ({ id: i.id, title: i.title, orgName: i.orgName, startsOn: i.startsOn, endsOn: i.endsOn, status: i.status, evaluationScore: i.evaluationScore })),
      };
    });
  }

  /** The student registers themselves (a parent only views). Idempotent; re-registering after a withdrawal is allowed. */
  @Post('students/:studentId/drives/:driveId/registration')
  @Auth('user', ['student'])
  @HttpCode(200)
  register(@CurrentPrincipal() p: UserPrincipal, @Param('studentId', ParseUUIDPipe) studentId: string, @Param('driveId', ParseUUIDPipe) driveId: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const me = await this.svc.ownStudent(tx, p);
      if (!me || me.id !== studentId) throw new ForbiddenException('Students register for themselves');
      const drive = found((await tx.select().from(placementDrives).where(eq(placementDrives.id, driveId)))[0], 'Drive');
      const [existing] = await tx.select().from(driveRegistrations).where(and(eq(driveRegistrations.driveId, driveId), eq(driveRegistrations.studentId, studentId))).for('update');
      if (existing && existing.status !== 'withdrawn') return existing;
      const [a, today] = [await this.svc.academics(tx, studentId), await this.svc.today(tx)];
      const el = checkEligibility(drive, a, today);
      if (!el.eligible) throw new ConflictException({ message: 'You are not eligible for this drive', code: 'NOT_ELIGIBLE', reasons: el.reasons });
      if (drive.kind === 'placement') {
        const [placed] = await tx.select({ id: placementOffers.id }).from(placementOffers).where(and(eq(placementOffers.studentId, studentId), eq(placementOffers.status, 'accepted')));
        if (placed) throw new ConflictException('You have already accepted an offer');
      }
      const values = { cgpaAt: a.cgpa ?? 0, backlogsAt: a.backlogs, status: 'registered', createdAt: this.svc.now() };
      const [row] = existing
        ? await tx.update(driveRegistrations).set(values).where(eq(driveRegistrations.id, existing.id)).returning()
        : await tx.insert(driveRegistrations).values({ tenantId: p.tenantId, driveId, studentId, ...values }).returning();
      await auditUser(tx, p, 'placement.registered', 'drive', driveId, { studentId, cgpa: a.cgpa, backlogs: a.backlogs });
      return row;
    });
  }

  @Post('students/:studentId/drives/:driveId/withdraw')
  @Auth('user', ['student'])
  @HttpCode(200)
  withdraw(@CurrentPrincipal() p: UserPrincipal, @Param('studentId', ParseUUIDPipe) studentId: string, @Param('driveId', ParseUUIDPipe) driveId: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const me = await this.svc.ownStudent(tx, p);
      if (!me || me.id !== studentId) throw new ForbiddenException('Students withdraw for themselves');
      const [reg] = await tx.select().from(driveRegistrations).where(and(eq(driveRegistrations.driveId, driveId), eq(driveRegistrations.studentId, studentId))).for('update');
      if (!reg) throw new NotFoundException('You are not registered for this drive');
      if (reg.status === 'selected') throw new ConflictException('Respond to your offer instead');
      const [row] = await tx.update(driveRegistrations).set({ status: 'withdrawn' }).where(eq(driveRegistrations.id, reg.id)).returning();
      await auditUser(tx, p, 'placement.withdrawn', 'drive', driveId, { studentId });
      return row;
    });
  }

  /** The student accepts or declines their offer. One accepted offer per student (a unique index backs this up). */
  @Post('offers/:id/respond')
  @Auth('user', ['student'])
  @HttpCode(200)
  respond(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(RespondBody)) b: z.infer<typeof RespondBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const me = await this.svc.ownStudent(tx, p);
      const o = found((await tx.select().from(placementOffers).where(eq(placementOffers.id, id)).for('update'))[0], 'Offer');
      if (!me || o.studentId !== me.id) throw new NotFoundException('Offer not found');
      if (o.status === b.response) return o;
      if (o.status !== 'offered') throw new ConflictException(`This offer is ${o.status}`);
      if (o.respondBy && (await this.svc.today(tx)) > o.respondBy) {
        await tx.update(placementOffers).set({ status: 'expired' }).where(eq(placementOffers.id, id));
        throw new ConflictException('This offer has expired');
      }
      const [row] = await orConflict('You have already accepted another offer', () => tx.update(placementOffers).set({ status: b.response, respondedAt: new Date(), declineReason: b.response === 'declined' ? (b.reason ?? null) : null }).where(eq(placementOffers.id, id)).returning());
      await auditUser(tx, p, `placement.offer_${b.response}`, 'offer', id, { driveId: o.driveId });
      return row;
    });
  }

  // ---- statistics ---------------------------------------------------------------------------

  /** Placement statistics for a calendar year (default: this year): headcount, offers, CTC and breakdowns. */
  @Get('stats')
  @Auth('user', PLACEMENT_VIEW_ROLES)
  stats(@CurrentPrincipal() p: UserPrincipal, @Query('year') yearQ?: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const year = Number(yearQ ?? (await this.svc.today(tx)).slice(0, 4));
      if (!Number.isInteger(year) || year < 2000 || year > 2100) throw new BadRequestException('Bad year');
      const offers = await tx
        .select({ o: placementOffers, company: placementCompanies.name, program: programs.name, kind: placementDrives.kind })
        .from(placementOffers)
        .innerJoin(placementDrives, eq(placementDrives.id, placementOffers.driveId))
        .innerJoin(placementCompanies, eq(placementCompanies.id, placementDrives.companyId))
        .innerJoin(students, eq(students.id, placementOffers.studentId))
        .innerJoin(sections, eq(sections.id, students.sectionId))
        .innerJoin(programs, eq(programs.id, sections.programId))
        .where(sql`extract(year from ${placementOffers.offeredOn}) = ${year}`);
      const [{ total }] = await tx.select({ total: sql<number>`count(*)::int` }).from(students).where(eq(students.status, 'active'));
      const [{ registered }] = await tx.select({ registered: sql<number>`count(distinct ${driveRegistrations.studentId})::int` }).from(driveRegistrations).innerJoin(placementDrives, eq(placementDrives.id, driveRegistrations.driveId)).where(sql`${driveRegistrations.status} <> 'withdrawn' and extract(year from ${driveRegistrations.createdAt}) = ${year}`);
      const placements = offers.filter((x) => x.o.status === 'accepted' && x.kind === 'placement');
      const placed = new Set(placements.map((x) => x.o.studentId));
      const group = (key: (x: (typeof offers)[number]) => string) => {
        const m = new Map<string, number[]>();
        for (const x of placements) m.set(key(x), [...(m.get(key(x)) ?? []), x.o.ctcLpa ?? 0]);
        return [...m].map(([name, ctcs]) => ({ name, placed: ctcs.length, ...ctcSummary(ctcs) })).sort((a, b) => b.placed - a.placed);
      };
      return {
        year,
        activeStudents: total,
        registeredStudents: registered,
        placedStudents: placed.size,
        placementPercent: registered ? Math.round((placed.size / registered) * 1000) / 10 : 0,
        offers: { total: offers.length, accepted: offers.filter((x) => x.o.status === 'accepted').length, declined: offers.filter((x) => x.o.status === 'declined').length, pending: offers.filter((x) => x.o.status === 'offered').length },
        ctc: ctcSummary(placements.map((x) => x.o.ctcLpa ?? 0)),
        byCompany: group((x) => x.company),
        byProgram: group((x) => x.program),
      };
    });
  }
}
