import { BadRequestException, Body, ConflictException, Controller, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { and, asc, desc, eq, gte, inArray, lte, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { RoleName, UserPrincipal } from '../auth/principal.js';
import { auditUser } from '../common/audit.js';
import { Day, nextNumber, orConflict, Paise } from '../common/ops.js';
import { tenantToday } from '../common/tenant-today.js';
import { Clock } from '../common/time.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService, type Tx } from '../db/db.service.js';
import { conferences, grantExpenses, patents, projectMembers, projectMilestones, publications, researchGrants, researchProjects, researchProposals, researchScholars, students, userRoles } from '../db/schema.js';
import { checkVersion, found, hasRole } from '../placements/placements.access.js';
import { canMoveProposal, ethicsBlocksApproval, grantBalance, normalizeDoi, researchKpis } from './research-rules.js';

/** Approve proposals, register projects, grants and scholars. */
export const RESEARCH_ROLES: RoleName[] = ['tenant_admin', 'principal', 'research_coordinator'];
export const RESEARCH_VIEW_ROLES: RoleName[] = [...RESEARCH_ROLES, 'hod'];
/** Faculty who submit proposals and record their own publications. */
export const FACULTY_ROLES: RoleName[] = [...RESEARCH_VIEW_ROLES, 'teacher'];

const Opt = (n: number) => z.string().trim().max(n).optional();
const ProposalBody = z.object({
  title: z.string().trim().min(1).max(200),
  abstract: z.string().trim().max(5000).default(''),
  kind: z.enum(['research', 'capstone', 'industry']).default('research'),
  piUserId: z.uuid().optional(),
  departmentId: z.uuid().optional(),
  sponsorOrg: Opt(160),
  fundingSoughtPaise: Paise.default(0),
  ethicsRequired: z.boolean().default(false),
  expectedVersion: z.number().int().optional(),
});
const ProjectBody = z.object({ title: z.string().trim().min(1).max(200), kind: z.enum(['research', 'capstone', 'industry']).default('research'), piUserId: z.uuid(), departmentId: z.uuid().optional(), sponsorOrg: Opt(160), startsOn: Day, endsOn: Day.optional() });
const MemberBody = z.object({ userId: z.uuid().optional(), studentId: z.uuid().optional(), role: z.enum(['supervisor', 'co_supervisor', 'member', 'student']) }).refine((v) => !!v.userId !== !!v.studentId, 'Give a userId or a studentId');
const GrantBody = z.object({ projectId: z.uuid(), agency: z.string().trim().min(1).max(160), scheme: z.string().trim().max(160).default(''), sanctionRef: Opt(80), sanctionedPaise: Paise.min(1), startsOn: Day, endsOn: Day });
const ExpenseBody = z.object({ head: z.string().trim().min(1).max(80), amountPaise: Paise.min(1), spentOn: Day, description: z.string().trim().max(500).default(''), voucherRef: Opt(80) });
const Author = z.object({ name: z.string().trim().min(1).max(120), userId: z.uuid().optional() });
const PublicationBody = z.object({
  title: z.string().trim().min(1).max(300),
  kind: z.enum(['journal', 'conference', 'book', 'book_chapter']).default('journal'),
  venue: z.string().trim().min(1).max(200),
  year: z.number().int().min(1950).max(2100),
  doi: z.string().trim().max(200).optional(),
  issn: z.string().trim().regex(/^\d{4}-\d{3}[\dXx]$/, 'Use an ISSN like 1234-567X').optional(),
  indexedIn: z.array(z.enum(['scopus', 'wos', 'ugc_care', 'pubmed', 'other'])).max(5).default([]),
  authors: z.array(Author).min(1).max(50),
  projectId: z.uuid().optional(),
  ownerUserId: z.uuid().optional(),
});
const ConferenceBody = z.object({ name: z.string().trim().min(1).max(200), role: z.enum(['attended', 'presented', 'organised']), level: z.enum(['institutional', 'national', 'international']).default('national'), heldOn: Day, location: z.string().trim().max(120).default(''), paperTitle: Opt(300), publicationId: z.uuid().optional(), userId: z.uuid().optional() });
const PatentBody = z.object({ title: z.string().trim().min(1).max(300), kind: z.enum(['patent', 'copyright', 'design', 'trademark']).default('patent'), inventors: z.array(Author).min(1).max(20), applicationNo: Opt(80), filedOn: Day.optional(), projectId: z.uuid().optional(), status: z.enum(['draft', 'filed']).default('filed') });
const ScholarBody = z.object({ studentId: z.uuid().optional(), fullName: z.string().trim().min(1).max(120), programme: z.enum(['phd', 'mphil']), supervisorUserId: z.uuid(), projectId: z.uuid().optional(), enrolledOn: Day, thesisTitle: Opt(300) });

/** Proposals, projects, scholars, publications, grants, conferences, patents and research KPIs (docs/architecture/placements-research-welfare.md). */
@Controller('v1/research')
export class ResearchController {
  constructor(
    private readonly db: DbService,
    private readonly clock: Clock,
  ) {}

  private today(tx: Tx) {
    return tenantToday(tx, this.clock);
  }

  private async assertFaculty(tx: Tx, userId: string) {
    const [r] = await tx.select({ id: userRoles.id }).from(userRoles).where(and(eq(userRoles.userId, userId), inArray(userRoles.role, ['teacher', 'hod', 'principal'])));
    if (!r) throw new ConflictException('That person is not a faculty member');
  }

  /** Who may act on a project's records: research staff, its PI, or a supervisor member. */
  private async projectAccess(tx: Tx, p: UserPrincipal, projectId: string, write: boolean) {
    const proj = found((await tx.select().from(researchProjects).where(eq(researchProjects.id, projectId)))[0], 'Project');
    if (hasRole(p, write ? RESEARCH_ROLES : RESEARCH_VIEW_ROLES) || proj.piUserId === p.userId) return proj;
    if (!write) {
      const [m] = await tx.select({ id: projectMembers.id }).from(projectMembers).where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, p.userId)));
      if (m) return proj;
    }
    throw new NotFoundException('Project not found');
  }

  // ---- proposals ----------------------------------------------------------------------------

  @Get('proposals')
  @Auth('user', FACULTY_ROLES)
  proposals(@CurrentPrincipal() p: UserPrincipal, @Query('status') status?: string) {
    return this.db.withTenant(p.tenantId, (tx) =>
      tx.select().from(researchProposals).where(and(hasRole(p, RESEARCH_VIEW_ROLES) ? undefined : eq(researchProposals.piUserId, p.userId), status ? eq(researchProposals.status, status) : undefined)).orderBy(desc(researchProposals.createdAt)),
    );
  }

  @Post('proposals')
  @Auth('user', FACULTY_ROLES)
  createProposal(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(ProposalBody)) b: z.infer<typeof ProposalBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const pi = b.piUserId && hasRole(p, RESEARCH_ROLES) ? b.piUserId : p.userId;
      const { expectedVersion: _v, piUserId: _p, ...rest } = b;
      const [row] = await tx.insert(researchProposals).values({ tenantId: p.tenantId, piUserId: pi, ...rest, ethicsStatus: b.ethicsRequired ? 'pending' : 'not_required' }).returning();
      await auditUser(tx, p, 'research.proposal_created', 'proposal', row.id, { title: b.title });
      return row;
    });
  }

  @Put('proposals/:id')
  @Auth('user', FACULTY_ROLES)
  updateProposal(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(ProposalBody)) b: z.infer<typeof ProposalBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const cur = found((await tx.select().from(researchProposals).where(eq(researchProposals.id, id)).for('update'))[0], 'Proposal');
      if (cur.piUserId !== p.userId && !hasRole(p, RESEARCH_ROLES)) throw new NotFoundException('Proposal not found');
      checkVersion(cur.version, b.expectedVersion);
      if (cur.status !== 'draft') throw new ConflictException('Only a draft can be edited');
      const { expectedVersion: _v, piUserId: _p, ...rest } = b;
      const [row] = await tx.update(researchProposals).set({ ...rest, ethicsStatus: b.ethicsRequired ? 'pending' : 'not_required', version: cur.version + 1 }).where(eq(researchProposals.id, id)).returning();
      await auditUser(tx, p, 'research.proposal_updated', 'proposal', id);
      return row;
    });
  }

  @Post('proposals/:id/submit')
  @Auth('user', FACULTY_ROLES)
  @HttpCode(200)
  submit(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.moveProposal(p, id, 'submitted', undefined, true);
  }

  @Post('proposals/:id/withdraw')
  @Auth('user', FACULTY_ROLES)
  @HttpCode(200)
  withdraw(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.moveProposal(p, id, 'withdrawn', undefined, true);
  }

  /** The ethics committee's decision (research staff record it). */
  @Post('proposals/:id/ethics')
  @Auth('user', RESEARCH_ROLES)
  @HttpCode(200)
  ethics(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(z.object({ status: z.enum(['cleared', 'rejected']), ref: Opt(80) }))) b: { status: string; ref?: string }) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const cur = found((await tx.select().from(researchProposals).where(eq(researchProposals.id, id)).for('update'))[0], 'Proposal');
      if (!cur.ethicsRequired) throw new ConflictException('This proposal needs no ethics clearance');
      if (b.status === 'cleared' && !b.ref) throw new BadRequestException('Give the ethics clearance reference');
      const [row] = await tx.update(researchProposals).set({ ethicsStatus: b.status, ethicsRef: b.ref ?? null, version: cur.version + 1 }).where(eq(researchProposals.id, id)).returning();
      await auditUser(tx, p, `research.ethics_${b.status}`, 'proposal', id, { ref: b.ref });
      return row;
    });
  }

  /** Review decision. Approval creates the project (PRJ-0001…) with the PI as its supervisor, in one transaction. */
  @Post('proposals/:id/decision')
  @Auth('user', RESEARCH_ROLES)
  @HttpCode(200)
  decide(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(z.object({ decision: z.enum(['under_review', 'approved', 'rejected']), note: Opt(1000), startsOn: Day.optional() }))) b: { decision: string; note?: string; startsOn?: string }) {
    return this.moveProposal(p, id, b.decision, b);
  }

  private moveProposal(p: UserPrincipal, id: string, to: string, decision?: { note?: string; startsOn?: string }, ownerOnly = false) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const cur = found((await tx.select().from(researchProposals).where(eq(researchProposals.id, id)).for('update'))[0], 'Proposal');
      if (ownerOnly && cur.piUserId !== p.userId && !hasRole(p, RESEARCH_ROLES)) throw new NotFoundException('Proposal not found');
      if (!canMoveProposal(cur.status, to)) throw new ConflictException(`A ${cur.status} proposal cannot become ${to}`);
      if (to === 'approved' && ethicsBlocksApproval(cur)) throw new ConflictException('Ethics clearance is required before approval');
      if (to === 'rejected' && !decision?.note) throw new BadRequestException('Give a reason for rejecting');
      const [row] = await tx.update(researchProposals).set({ status: to, reviewNote: decision?.note ?? cur.reviewNote, decidedBy: decision ? p.userId : null, decidedAt: decision ? new Date() : null, version: cur.version + 1 }).where(eq(researchProposals.id, id)).returning();
      let project = null;
      if (to === 'approved') {
        const code = await nextNumber(tx, p.tenantId, 'PRJ');
        [project] = await tx.insert(researchProjects).values({ tenantId: p.tenantId, proposalId: id, code, title: cur.title, kind: cur.kind, piUserId: cur.piUserId, departmentId: cur.departmentId, sponsorOrg: cur.sponsorOrg, startsOn: decision?.startsOn ?? (await this.today(tx)) }).returning();
        await tx.insert(projectMembers).values({ tenantId: p.tenantId, projectId: project.id, userId: cur.piUserId, role: 'supervisor' });
      }
      await auditUser(tx, p, `research.proposal_${to}`, 'proposal', id, { note: decision?.note, projectId: project?.id });
      return { ...row, project };
    });
  }

  // ---- projects -----------------------------------------------------------------------------

  @Get('projects')
  @Auth('user', FACULTY_ROLES)
  projects(@CurrentPrincipal() p: UserPrincipal, @Query('status') status?: string, @Query('kind') kind?: string) {
    return this.db.withTenant(p.tenantId, (tx) => {
      const mine = hasRole(p, RESEARCH_VIEW_ROLES) ? undefined : or(eq(researchProjects.piUserId, p.userId), sql`exists (select 1 from project_members m where m.project_id = ${researchProjects.id} and m.user_id = ${p.userId})`);
      return tx.select().from(researchProjects).where(and(mine, status ? eq(researchProjects.status, status) : undefined, kind ? eq(researchProjects.kind, kind) : undefined)).orderBy(desc(researchProjects.createdAt));
    });
  }

  /** Direct registration: capstones and industry-sponsored projects that skip the proposal stage. */
  @Post('projects')
  @Auth('user', RESEARCH_ROLES)
  createProject(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(ProjectBody)) b: z.infer<typeof ProjectBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await this.assertFaculty(tx, b.piUserId);
      if (b.endsOn && b.endsOn < b.startsOn) throw new BadRequestException('The end date is before the start date');
      const [row] = await tx.insert(researchProjects).values({ tenantId: p.tenantId, code: await nextNumber(tx, p.tenantId, 'PRJ'), ...b }).returning();
      await tx.insert(projectMembers).values({ tenantId: p.tenantId, projectId: row.id, userId: b.piUserId, role: 'supervisor' });
      await auditUser(tx, p, 'research.project_created', 'project', row.id, { code: row.code });
      return row;
    });
  }

  @Get('projects/:id')
  @Auth('user', FACULTY_ROLES)
  project(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const proj = await this.projectAccess(tx, p, id, false);
      const members = await tx.select().from(projectMembers).where(eq(projectMembers.projectId, id));
      const milestones = await tx.select().from(projectMilestones).where(eq(projectMilestones.projectId, id)).orderBy(asc(projectMilestones.dueOn));
      const grants = await tx.select().from(researchGrants).where(eq(researchGrants.projectId, id));
      return { ...proj, members, milestones, grants };
    });
  }

  @Post('projects/:id/status')
  @Auth('user', RESEARCH_ROLES)
  @HttpCode(200)
  projectStatus(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(z.object({ status: z.enum(['active', 'on_hold', 'completed', 'cancelled']), outcomeSummary: z.string().trim().max(5000).optional() }))) b: { status: string; outcomeSummary?: string }) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const cur = found((await tx.select().from(researchProjects).where(eq(researchProjects.id, id)).for('update'))[0], 'Project');
      if (['completed', 'cancelled'].includes(cur.status)) throw new ConflictException(`A ${cur.status} project is closed`);
      if (b.status === 'completed' && !b.outcomeSummary) throw new BadRequestException('Add an outcome summary to complete the project');
      const [row] = await tx.update(researchProjects).set({ status: b.status, outcomeSummary: b.outcomeSummary ?? cur.outcomeSummary, endsOn: b.status === 'completed' ? await this.today(tx) : cur.endsOn, version: cur.version + 1 }).where(eq(researchProjects.id, id)).returning();
      await auditUser(tx, p, `research.project_${b.status}`, 'project', id);
      return row;
    });
  }

  @Post('projects/:id/members')
  @Auth('user', RESEARCH_ROLES)
  addMember(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(MemberBody)) b: z.infer<typeof MemberBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      found((await tx.select({ id: researchProjects.id }).from(researchProjects).where(eq(researchProjects.id, id)))[0], 'Project');
      if (b.userId) await this.assertFaculty(tx, b.userId);
      if (b.studentId) found((await tx.select({ id: students.id }).from(students).where(eq(students.id, b.studentId)))[0], 'Student');
      if (b.studentId && b.role !== 'student') throw new BadRequestException('A student joins with the student role');
      const [row] = await orConflict('Already a member of this project', () => tx.insert(projectMembers).values({ tenantId: p.tenantId, projectId: id, ...b }).returning());
      await auditUser(tx, p, 'research.member_added', 'project', id, b);
      return row;
    });
  }

  @Post('projects/:id/milestones')
  @Auth('user', FACULTY_ROLES)
  addMilestone(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(z.object({ title: z.string().trim().min(1).max(200), dueOn: Day }))) b: { title: string; dueOn: string }) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await this.projectAccess(tx, p, id, true);
      const [row] = await tx.insert(projectMilestones).values({ tenantId: p.tenantId, projectId: id, ...b }).returning();
      await auditUser(tx, p, 'research.milestone_added', 'project', id, b);
      return row;
    });
  }

  @Post('milestones/:id/complete')
  @Auth('user', FACULTY_ROLES)
  @HttpCode(200)
  completeMilestone(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(z.object({ evidenceRef: Opt(300) }))) b: { evidenceRef?: string }) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const m = found((await tx.select().from(projectMilestones).where(eq(projectMilestones.id, id)))[0], 'Milestone');
      await this.projectAccess(tx, p, m.projectId, true);
      if (m.completedOn) return m;
      const [row] = await tx.update(projectMilestones).set({ completedOn: await this.today(tx), evidenceRef: b.evidenceRef ?? null }).where(eq(projectMilestones.id, id)).returning();
      await auditUser(tx, p, 'research.milestone_completed', 'project', m.projectId, { milestoneId: id });
      return row;
    });
  }

  // ---- scholars -----------------------------------------------------------------------------

  @Get('scholars')
  @Auth('user', FACULTY_ROLES)
  scholars(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, (tx) => tx.select().from(researchScholars).where(hasRole(p, RESEARCH_VIEW_ROLES) ? undefined : eq(researchScholars.supervisorUserId, p.userId)).orderBy(desc(researchScholars.enrolledOn)));
  }

  @Post('scholars')
  @Auth('user', RESEARCH_ROLES)
  createScholar(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(ScholarBody)) b: z.infer<typeof ScholarBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await this.assertFaculty(tx, b.supervisorUserId);
      const [row] = await tx.insert(researchScholars).values({ tenantId: p.tenantId, ...b }).returning();
      await auditUser(tx, p, 'research.scholar_enrolled', 'scholar', row.id, { programme: b.programme, supervisor: b.supervisorUserId });
      return row;
    });
  }

  @Post('scholars/:id/status')
  @Auth('user', RESEARCH_ROLES)
  @HttpCode(200)
  scholarStatus(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(z.object({ status: z.enum(['thesis_submitted', 'awarded', 'withdrawn']), thesisTitle: Opt(300) }))) b: { status: string; thesisTitle?: string }) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const cur = found((await tx.select().from(researchScholars).where(eq(researchScholars.id, id)).for('update'))[0], 'Scholar');
      const ok = (cur.status === 'enrolled' && b.status !== 'awarded') || (cur.status === 'thesis_submitted' && b.status === 'awarded') || (cur.status !== 'awarded' && cur.status !== 'withdrawn' && b.status === 'withdrawn');
      if (!ok) throw new ConflictException(`A ${cur.status} scholar cannot become ${b.status}`);
      const title = b.thesisTitle ?? cur.thesisTitle;
      if (b.status !== 'withdrawn' && !title) throw new BadRequestException('Give the thesis title');
      const [row] = await tx.update(researchScholars).set({ status: b.status, thesisTitle: title, completedOn: ['awarded', 'withdrawn'].includes(b.status) ? await this.today(tx) : null }).where(eq(researchScholars.id, id)).returning();
      await auditUser(tx, p, `research.scholar_${b.status}`, 'scholar', id);
      return row;
    });
  }

  // ---- publications, conferences, patents ---------------------------------------------------

  @Get('publications')
  @Auth('user', FACULTY_ROLES)
  listPublications(@CurrentPrincipal() p: UserPrincipal, @Query('year') year?: string, @Query('ownerUserId') owner?: string) {
    return this.db.withTenant(p.tenantId, (tx) =>
      tx.select().from(publications).where(and(year ? eq(publications.year, Number(year)) : undefined, owner ? eq(publications.ownerUserId, owner) : undefined)).orderBy(desc(publications.year), asc(publications.title)),
    );
  }

  @Post('publications')
  @Auth('user', FACULTY_ROLES)
  createPublication(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(PublicationBody)) b: z.infer<typeof PublicationBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const doi = b.doi ? normalizeDoi(b.doi) : null;
      if (b.doi && !doi) throw new BadRequestException({ message: 'That is not a valid DOI', code: 'INVALID_DOI' });
      if (b.projectId) await this.projectAccess(tx, p, b.projectId, true);
      const { ownerUserId, doi: _d, ...rest } = b;
      const [row] = await orConflict('A publication with that DOI is already recorded', () => tx.insert(publications).values({ tenantId: p.tenantId, ownerUserId: ownerUserId && hasRole(p, RESEARCH_ROLES) ? ownerUserId : p.userId, doi, ...rest }).returning());
      await auditUser(tx, p, 'research.publication_added', 'publication', row.id, { doi, year: b.year });
      return row;
    });
  }

  @Get('conferences')
  @Auth('user', FACULTY_ROLES)
  listConferences(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, (tx) => tx.select().from(conferences).where(hasRole(p, RESEARCH_VIEW_ROLES) ? undefined : eq(conferences.userId, p.userId)).orderBy(desc(conferences.heldOn)));
  }

  @Post('conferences')
  @Auth('user', FACULTY_ROLES)
  createConference(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(ConferenceBody)) b: z.infer<typeof ConferenceBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      if (b.role === 'presented' && !b.paperTitle) throw new BadRequestException('Give the title of the paper presented');
      const { userId, ...rest } = b;
      const [row] = await tx.insert(conferences).values({ tenantId: p.tenantId, userId: userId && hasRole(p, RESEARCH_ROLES) ? userId : p.userId, ...rest }).returning();
      await auditUser(tx, p, 'research.conference_added', 'conference', row.id, { name: b.name, role: b.role });
      return row;
    });
  }

  @Get('patents')
  @Auth('user', FACULTY_ROLES)
  listPatents(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, (tx) => tx.select().from(patents).where(hasRole(p, RESEARCH_VIEW_ROLES) ? undefined : eq(patents.ownerUserId, p.userId)).orderBy(desc(patents.createdAt)));
  }

  @Post('patents')
  @Auth('user', FACULTY_ROLES)
  createPatent(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(PatentBody)) b: z.infer<typeof PatentBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      if (b.status === 'filed' && (!b.applicationNo || !b.filedOn)) throw new BadRequestException('A filed application needs its number and filing date');
      const [row] = await tx.insert(patents).values({ tenantId: p.tenantId, ownerUserId: p.userId, ...b }).returning();
      await auditUser(tx, p, 'research.patent_added', 'patent', row.id, { title: b.title });
      return row;
    });
  }

  @Post('patents/:id/status')
  @Auth('user', RESEARCH_ROLES)
  @HttpCode(200)
  patentStatus(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(z.object({ status: z.enum(['published', 'granted', 'rejected']), grantedOn: Day.optional() }))) b: { status: string; grantedOn?: string }) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const cur = found((await tx.select().from(patents).where(eq(patents.id, id)).for('update'))[0], 'Patent');
      const next: Record<string, string[]> = { draft: [], filed: ['published', 'rejected', 'granted'], published: ['granted', 'rejected'], granted: [], rejected: [] };
      if (!next[cur.status]?.includes(b.status)) throw new ConflictException(`A ${cur.status} application cannot become ${b.status}`);
      if (b.status === 'granted' && !b.grantedOn) throw new BadRequestException('Give the grant date');
      const [row] = await tx.update(patents).set({ status: b.status, grantedOn: b.grantedOn ?? null }).where(eq(patents.id, id)).returning();
      await auditUser(tx, p, `research.patent_${b.status}`, 'patent', id);
      return row;
    });
  }

  // ---- grants and expenses ------------------------------------------------------------------

  @Get('grants')
  @Auth('user', FACULTY_ROLES)
  grants(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const rows = await tx
        .select({ g: researchGrants, spent: sql<number>`coalesce((select sum(e.amount_paise) from grant_expenses e where e.grant_id = ${researchGrants.id}), 0)::bigint`.mapWith(Number), pi: researchProjects.piUserId })
        .from(researchGrants)
        .innerJoin(researchProjects, eq(researchProjects.id, researchGrants.projectId))
        .where(hasRole(p, RESEARCH_VIEW_ROLES) ? undefined : eq(researchProjects.piUserId, p.userId))
        .orderBy(desc(researchGrants.startsOn));
      return rows.map((r) => ({ ...r.g, ...grantBalance(r.g.sanctionedPaise, [r.spent]) }));
    });
  }

  @Post('grants')
  @Auth('user', RESEARCH_ROLES)
  createGrant(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(GrantBody)) b: z.infer<typeof GrantBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      if (b.endsOn < b.startsOn) throw new BadRequestException('The end date is before the start date');
      await this.projectAccess(tx, p, b.projectId, true);
      const [row] = await tx.insert(researchGrants).values({ tenantId: p.tenantId, ...b }).returning();
      await auditUser(tx, p, 'research.grant_created', 'grant', row.id, { agency: b.agency, sanctionedPaise: b.sanctionedPaise });
      return row;
    });
  }

  @Get('grants/:id')
  @Auth('user', FACULTY_ROLES)
  grant(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const g = found((await tx.select().from(researchGrants).where(eq(researchGrants.id, id)))[0], 'Grant');
      await this.projectAccess(tx, p, g.projectId, false);
      const expenses = await tx.select().from(grantExpenses).where(eq(grantExpenses.grantId, id)).orderBy(desc(grantExpenses.spentOn));
      return { ...g, ...grantBalance(g.sanctionedPaise, expenses.map((e) => e.amountPaise)), expenses };
    });
  }

  /** Records spending against a grant; the grant row is locked so concurrent entries cannot overspend the sanction. */
  @Post('grants/:id/expenses')
  @Auth('user', FACULTY_ROLES)
  addExpense(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(ExpenseBody)) b: z.infer<typeof ExpenseBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const g = found((await tx.select().from(researchGrants).where(eq(researchGrants.id, id)).for('update'))[0], 'Grant');
      await this.projectAccess(tx, p, g.projectId, true);
      if (g.status !== 'active') throw new ConflictException('This grant is closed');
      if (b.spentOn < g.startsOn || b.spentOn > g.endsOn) throw new ConflictException('The expense falls outside the grant period');
      const spent = await tx.select({ a: grantExpenses.amountPaise }).from(grantExpenses).where(eq(grantExpenses.grantId, id));
      const bal = grantBalance(g.sanctionedPaise, spent.map((x) => x.a));
      if (b.amountPaise > bal.balancePaise) throw new ConflictException({ message: 'This expense exceeds the unspent balance of the grant', code: 'GRANT_OVERSPEND', balancePaise: bal.balancePaise });
      const [row] = await tx.insert(grantExpenses).values({ tenantId: p.tenantId, grantId: id, createdBy: p.userId, ...b }).returning();
      await auditUser(tx, p, 'research.expense_recorded', 'grant', id, { amountPaise: b.amountPaise, head: b.head, voucherRef: b.voucherRef });
      return { ...row, ...grantBalance(g.sanctionedPaise, [...spent.map((x) => x.a), b.amountPaise]) };
    });
  }

  @Post('grants/:id/close')
  @Auth('user', RESEARCH_ROLES)
  @HttpCode(200)
  closeGrant(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [row] = await tx.update(researchGrants).set({ status: 'closed' }).where(and(eq(researchGrants.id, id), eq(researchGrants.status, 'active'))).returning();
      if (!row) throw new ConflictException('Only an active grant can be closed');
      await auditUser(tx, p, 'research.grant_closed', 'grant', id);
      return row;
    });
  }

  // ---- KPIs ---------------------------------------------------------------------------------

  /** Research KPIs for NAAC criterion 3 over a range of calendar years (default: the last five). */
  @Get('kpis')
  @Auth('user', RESEARCH_VIEW_ROLES)
  kpis(@CurrentPrincipal() p: UserPrincipal, @Query('fromYear') fromQ?: string, @Query('toYear') toQ?: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const to = Number(toQ ?? (await this.today(tx)).slice(0, 4));
      const from = Number(fromQ ?? to - 4);
      if (![from, to].every((y) => Number.isInteger(y) && y >= 1950 && y <= 2100) || from > to) throw new BadRequestException('Bad year range');
      const range = (col: Parameters<typeof gte>[0]) => and(gte(col, `${from}-01-01`), lte(col, `${to}-12-31`));
      const pubs = await tx.select({ kind: publications.kind, indexedIn: publications.indexedIn }).from(publications).where(and(gte(publications.year, from), lte(publications.year, to)));
      const grs = await tx.select({ sanctionedPaise: researchGrants.sanctionedPaise }).from(researchGrants).where(range(researchGrants.startsOn));
      const pats = await tx.select({ status: patents.status }).from(patents).where(range(patents.filedOn));
      const [{ n: awarded }] = await tx.select({ n: sql<number>`count(*)::int` }).from(researchScholars).where(and(eq(researchScholars.status, 'awarded'), range(researchScholars.completedOn)));
      const [{ n: projs }] = await tx.select({ n: sql<number>`count(*)::int` }).from(researchProjects).where(range(researchProjects.startsOn));
      const [{ n: confs }] = await tx.select({ n: sql<number>`count(*)::int` }).from(conferences).where(and(eq(conferences.role, 'presented'), range(conferences.heldOn)));
      const [{ n: faculty }] = await tx.select({ n: sql<number>`count(distinct ${userRoles.userId})::int` }).from(userRoles).where(inArray(userRoles.role, ['teacher', 'hod', 'principal']));
      return { fromYear: from, toYear: to, ...researchKpis({ facultyCount: faculty, publications: pubs, grants: grs, patents: pats, scholarsAwarded: awarded, projects: projs, conferencesPresented: confs }) };
    });
  }
}
