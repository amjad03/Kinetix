import { Body, ConflictException, Controller, Delete, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Put, Query, Res } from '@nestjs/common';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import type { Response } from 'express';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { UserPrincipal } from '../auth/principal.js';
import { auditUser } from '../common/audit.js';
import { BlobBody, putBlob, sendBlob } from '../common/blob.js';
import { orConflict } from '../common/ops.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService, type Tx } from '../db/db.service.js';
import { projectMembers, projectMilestones, researchProjects, skillEvidence, skills, students, users } from '../db/schema.js';
import { portfolioItems, projectComments, projectFiles, projectHub, projectJoinRequests, projectReviews, projectVivas, studentResumes } from '../db/schema-pathways.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { ObjectStorage } from '../storage/storage.service.js';
import { PROJECT_ADMIN, PROJECT_PARTICIPANTS, hasAny, ownStudent, projectRole, requireMentor, requireParticipant } from './projects.access.js';
import { canSeePortfolioItem, scoreRubric, skillFit } from './projects.logic.js';

const FileBody = z
  .object({ title: z.string().trim().min(1).max(160).optional(), kind: z.enum(['file', 'link', 'report', 'code', 'slides']).default('file'), url: z.url().max(500).optional(), file: BlobBody.optional() })
  .refine((b) => !!b.url !== !!b.file, 'Send either a link or a file')
  .refine((b) => !!b.title || !!b.file, 'A link needs a title');
const CommentBody = z.object({ body: z.string().trim().min(1).max(2000), parentId: z.uuid().optional() });
const ReviewBody = z.object({
  kind: z.enum(['mentor', 'peer', 'external']).default('mentor'),
  rubric: z.record(z.string().trim().min(1).max(60), z.number()).refine((r) => Object.keys(r).length >= 1 && Object.keys(r).length <= 12, 'Give between 1 and 12 criteria'),
  maxPerCriterion: z.number().int().min(1).max(10).default(5),
  comment: z.string().trim().max(2000).default(''),
});
const VivaBody = z.object({ scheduledAt: z.coerce.date(), venue: z.string().trim().max(120).default(''), panel: z.array(z.object({ userId: z.uuid().optional(), name: z.string().trim().min(1).max(120) })).min(1).max(8) });
const VivaResult = z.object({ outcome: z.enum(['pass', 'revise', 'fail']), score: z.number().min(0).max(100).optional(), remarks: z.string().trim().max(2000).default('') });
const HubBody = z.object({ showcase: z.boolean(), summary: z.string().trim().max(1000).default(''), recruiting: z.boolean(), lookingFor: z.array(z.string().trim().min(1).max(60)).max(12).default([]), openings: z.number().int().min(0).max(30).default(0) });
const JoinBody = z.object({ message: z.string().trim().max(500).default('') });
const DecideBody = z.object({ accept: z.boolean() });
const PortfolioBody = z.object({ title: z.string().trim().min(1).max(160), summary: z.string().trim().max(1000).default(''), url: z.url().max(500).optional(), kind: z.enum(['project', 'research', 'certificate', 'work']).default('project'), projectId: z.uuid().optional(), published: z.boolean().default(false) });

/**
 * The project workspace: files, discussion, rubric reviews and viva for a project; the showcase and recruiting board;
 * team matching by skills; and each student's portfolio. Projects themselves are created in research.
 */
@Controller('v1/projects')
export class ProjectsController {
  constructor(
    private readonly db: DbService,
    private readonly storage: ObjectStorage,
    private readonly notifications: NotificationsService,
  ) {}

  /** The projects the caller takes part in, with their part. */
  @Get('mine')
  @Auth('user', PROJECT_PARTICIPANTS)
  mine(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const stu = await ownStudent(tx, p);
      const rows = await tx
        .select({ project: researchProjects, hub: projectHub })
        .from(researchProjects)
        .leftJoin(projectHub, eq(projectHub.projectId, researchProjects.id))
        .where(
          hasAny(p, PROJECT_ADMIN)
            ? undefined
            : sql`(${researchProjects.piUserId} = ${p.userId} or exists (select 1 from project_members m where m.project_id = ${researchProjects.id} and (m.user_id = ${p.userId} ${stu ? sql`or m.student_id = ${stu.id}` : sql``})))`,
        )
        .orderBy(desc(researchProjects.createdAt));
      return rows.map((r) => ({ id: r.project.id, code: r.project.code, title: r.project.title, kind: r.project.kind, status: r.project.status, showcase: r.hub?.showcase ?? false, recruiting: r.hub?.recruiting ?? false }));
    });
  }

  /** Projects on the showcase: what the institution is proud of. Visible to everyone signed in. */
  @Get('showcase')
  @Auth('user')
  showcase(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const rows = await tx
        .select({ project: researchProjects, hub: projectHub, pi: users.fullName })
        .from(projectHub)
        .innerJoin(researchProjects, eq(researchProjects.id, projectHub.projectId))
        .innerJoin(users, eq(users.id, researchProjects.piUserId))
        .where(eq(projectHub.showcase, true))
        .orderBy(desc(projectHub.updatedAt));
      const ids = rows.map((r) => r.project.id);
      const scores = ids.length ? await tx.select({ projectId: projectReviews.projectId, avg: sql<number>`round(avg(${projectReviews.percent}), 1)::float` }).from(projectReviews).where(inArray(projectReviews.projectId, ids)).groupBy(projectReviews.projectId) : [];
      return rows.map((r) => ({ id: r.project.id, title: r.project.title, kind: r.project.kind, pi: r.pi, summary: r.hub.summary, outcomeSummary: r.project.outcomeSummary, reviewAverage: scores.find((s) => s.projectId === r.project.id)?.avg ?? null }));
    });
  }

  /** Projects that are recruiting, optionally narrowed to ones looking for a skill. */
  @Get('discover')
  @Auth('user', PROJECT_PARTICIPANTS)
  discover(@CurrentPrincipal() p: UserPrincipal, @Query('skill') skill?: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const rows = await tx
        .select({ project: researchProjects, hub: projectHub, pi: users.fullName })
        .from(projectHub)
        .innerJoin(researchProjects, eq(researchProjects.id, projectHub.projectId))
        .innerJoin(users, eq(users.id, researchProjects.piUserId))
        .where(and(eq(projectHub.recruiting, true), eq(researchProjects.status, 'active')));
      const stu = await ownStudent(tx, p);
      const mySkills = stu ? await this.skillNames(tx, stu.id) : [];
      const want = skill?.trim().toLowerCase();
      return rows
        .filter((r) => !want || r.hub.lookingFor.some((l) => l.toLowerCase().includes(want)))
        .map((r) => ({ id: r.project.id, title: r.project.title, kind: r.project.kind, pi: r.pi, summary: r.hub.summary, lookingFor: r.hub.lookingFor, openings: r.hub.openings, ...skillFit(r.hub.lookingFor, mySkills) }))
        .sort((a, b) => b.fit - a.fit);
    });
  }

  private async skillNames(tx: Tx, studentId: string): Promise<string[]> {
    const ev = await tx.select({ name: skills.name }).from(skillEvidence).innerJoin(skills, eq(skills.id, skillEvidence.skillId)).where(eq(skillEvidence.studentId, studentId));
    const [r] = await tx.select({ skills: studentResumes.skills }).from(studentResumes).where(eq(studentResumes.studentId, studentId));
    return [...new Set([...ev.map((e) => e.name), ...(r?.skills ?? [])])];
  }

  // ---- workspace ---------------------------------------------------------------------------

  @Get(':id/workspace')
  @Auth('user', PROJECT_PARTICIPANTS)
  workspace(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const { project, role } = await requireParticipant(tx, p, id);
      const members = await tx
        .select({ id: projectMembers.id, role: projectMembers.role, userName: users.fullName, studentName: students.fullName })
        .from(projectMembers)
        .leftJoin(users, eq(users.id, projectMembers.userId))
        .leftJoin(students, eq(students.id, projectMembers.studentId))
        .where(eq(projectMembers.projectId, id));
      const [pi] = await tx.select({ name: users.fullName }).from(users).where(eq(users.id, project.piUserId));
      const milestones = await tx.select().from(projectMilestones).where(eq(projectMilestones.projectId, id)).orderBy(asc(projectMilestones.dueOn));
      const files = await tx.select({ id: projectFiles.id, title: projectFiles.title, kind: projectFiles.kind, url: projectFiles.url, contentType: projectFiles.contentType, sizeBytes: projectFiles.sizeBytes, createdAt: projectFiles.createdAt }).from(projectFiles).where(eq(projectFiles.projectId, id)).orderBy(desc(projectFiles.createdAt));
      const [hub] = await tx.select().from(projectHub).where(eq(projectHub.projectId, id));
      const vivas = await tx.select().from(projectVivas).where(eq(projectVivas.projectId, id)).orderBy(desc(projectVivas.scheduledAt));
      const [rv] = await tx.select({ n: sql<number>`count(*)::int`, avg: sql<number | null>`round(avg(${projectReviews.percent}), 1)::float` }).from(projectReviews).where(eq(projectReviews.projectId, id));
      return {
        project: { id: project.id, code: project.code, title: project.title, kind: project.kind, status: project.status, outcomeSummary: project.outcomeSummary, pi: pi?.name ?? '' },
        myRole: role,
        members: members.map((m) => ({ id: m.id, role: m.role, name: m.userName ?? m.studentName ?? '' })),
        milestones,
        files,
        hub: hub ?? { showcase: false, summary: '', recruiting: false, lookingFor: [], openings: 0 },
        vivas,
        reviews: { count: rv?.n ?? 0, average: rv?.avg ?? null },
      };
    });
  }

  @Post(':id/files')
  @Auth('user', PROJECT_PARTICIPANTS)
  addFile(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(FileBody)) b: z.infer<typeof FileBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await requireParticipant(tx, p, id);
      const stored = b.file ? await putBlob(this.storage, p.tenantId, `projects/${id}`, b.file) : null;
      const [row] = await tx
        .insert(projectFiles)
        .values({ tenantId: p.tenantId, projectId: id, title: b.title ?? stored?.title ?? 'File', kind: b.url ? 'link' : b.kind, url: b.url ?? null, storageKey: stored?.storageKey ?? null, contentType: stored?.contentType ?? null, sizeBytes: stored?.sizeBytes ?? null, uploadedBy: p.userId })
        .returning({ id: projectFiles.id, title: projectFiles.title, kind: projectFiles.kind, url: projectFiles.url, sizeBytes: projectFiles.sizeBytes });
      await auditUser(tx, p, 'project.file_added', 'research_project', id, { fileId: row.id });
      return row;
    });
  }

  @Get('files/:fileId/download')
  @Auth('user', PROJECT_PARTICIPANTS)
  download(@CurrentPrincipal() p: UserPrincipal, @Param('fileId', ParseUUIDPipe) fileId: string, @Res({ passthrough: true }) res: Response) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [f] = await tx.select().from(projectFiles).where(eq(projectFiles.id, fileId));
      if (!f) throw new NotFoundException('File not found');
      await requireParticipant(tx, p, f.projectId);
      return sendBlob(this.storage, res, f);
    });
  }

  @Delete('files/:fileId')
  @HttpCode(204)
  @Auth('user', PROJECT_PARTICIPANTS)
  removeFile(@CurrentPrincipal() p: UserPrincipal, @Param('fileId', ParseUUIDPipe) fileId: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [f] = await tx.select().from(projectFiles).where(eq(projectFiles.id, fileId));
      if (!f) throw new NotFoundException('File not found');
      const r = await requireParticipant(tx, p, f.projectId);
      if (f.uploadedBy !== p.userId && r.role === 'member') throw new NotFoundException('File not found');
      await tx.delete(projectFiles).where(eq(projectFiles.id, fileId));
      if (f.storageKey) await this.storage.delete(f.storageKey);
    });
  }

  @Get(':id/comments')
  @Auth('user', PROJECT_PARTICIPANTS)
  comments(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await requireParticipant(tx, p, id);
      return tx
        .select({ id: projectComments.id, parentId: projectComments.parentId, body: projectComments.body, author: users.fullName, authorUserId: projectComments.authorUserId, createdAt: projectComments.createdAt })
        .from(projectComments)
        .innerJoin(users, eq(users.id, projectComments.authorUserId))
        .where(eq(projectComments.projectId, id))
        .orderBy(asc(projectComments.createdAt));
    });
  }

  @Post(':id/comments')
  @Auth('user', PROJECT_PARTICIPANTS)
  addComment(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(CommentBody)) b: z.infer<typeof CommentBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const { project } = await requireParticipant(tx, p, id);
      if (b.parentId) {
        const [par] = await tx.select({ id: projectComments.id }).from(projectComments).where(and(eq(projectComments.id, b.parentId), eq(projectComments.projectId, id)));
        if (!par) throw new NotFoundException('Comment not found');
      }
      const [row] = await tx.insert(projectComments).values({ tenantId: p.tenantId, projectId: id, authorUserId: p.userId, parentId: b.parentId ?? null, body: b.body }).returning();
      // Tell the rest of the team.
      const members = await tx.select({ userId: projectMembers.userId, studentId: projectMembers.studentId }).from(projectMembers).where(eq(projectMembers.projectId, id));
      const studentIds = members.map((m) => m.studentId).filter((x): x is string => !!x);
      const studs = studentIds.length ? await tx.select({ userId: students.userId }).from(students).where(inArray(students.id, studentIds)) : [];
      const others = [...new Set([project.piUserId, ...members.map((m) => m.userId), ...studs.map((s) => s.userId)].filter((x): x is string => !!x && x !== p.userId))];
      await this.notifications.notifyUsers(tx, others, { kind: 'task', text: { title: `New comment on ${project.title}`, body: b.body.slice(0, 120) }, data: { projectId: id }, dedupeKey: `project-comment:${row.id}` });
      return row;
    });
  }

  // ---- reviews and viva ----------------------------------------------------------------------

  @Get(':id/reviews')
  @Auth('user', PROJECT_PARTICIPANTS)
  reviews(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await requireParticipant(tx, p, id);
      const rows = await tx.select({ r: projectReviews, name: users.fullName }).from(projectReviews).innerJoin(users, eq(users.id, projectReviews.reviewerUserId)).where(eq(projectReviews.projectId, id)).orderBy(desc(projectReviews.createdAt));
      // Peer reviewers stay anonymous to the team.
      return rows.map((x) => ({ id: x.r.id, kind: x.r.kind, rubric: x.r.rubric, maxPerCriterion: x.r.maxPerCriterion, total: x.r.total, percent: x.r.percent, comment: x.r.comment, reviewer: x.r.kind === 'peer' ? 'A classmate' : x.name, createdAt: x.r.createdAt }));
    });
  }

  /** A mentor or external review on a project the caller mentors, or a peer review of a showcase project by a student who is not on it. */
  @Post(':id/reviews')
  @Auth('user', PROJECT_PARTICIPANTS)
  review(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(ReviewBody)) b: z.infer<typeof ReviewBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const r = await projectRole(tx, p, id);
      if (b.kind === 'peer') {
        if (!r.studentId || r.role) throw new ConflictException('Peer reviews are written by students who are not on the project');
        const [hub] = await tx.select().from(projectHub).where(eq(projectHub.projectId, id));
        if (!hub?.showcase) throw new NotFoundException('Project not found');
      } else {
        if (!r.role || r.role === 'member') throw new NotFoundException('Project not found');
      }
      const score = scoreRubric(b.rubric, b.maxPerCriterion);
      if (!score) throw new ConflictException(`Each criterion needs a score from 0 to ${b.maxPerCriterion}`);
      const [row] = await orConflict('You have already reviewed this project', async () => {
        if (b.kind === 'peer') {
          const [dup] = await tx.select({ id: projectReviews.id }).from(projectReviews).where(and(eq(projectReviews.projectId, id), eq(projectReviews.reviewerUserId, p.userId), eq(projectReviews.kind, 'peer')));
          if (dup) throw new ConflictException('You have already reviewed this project');
        }
        return tx.insert(projectReviews).values({ tenantId: p.tenantId, projectId: id, reviewerUserId: p.userId, kind: b.kind, rubric: b.rubric, maxPerCriterion: b.maxPerCriterion, total: score.total, percent: score.percent, comment: b.comment }).returning();
      });
      await auditUser(tx, p, 'project.reviewed', 'research_project', id, { kind: b.kind, percent: score.percent });
      return row;
    });
  }

  @Post(':id/viva')
  @Auth('user', PROJECT_PARTICIPANTS)
  scheduleViva(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(VivaBody)) b: z.infer<typeof VivaBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const { project } = await requireMentor(tx, p, id);
      const [row] = await tx.insert(projectVivas).values({ tenantId: p.tenantId, projectId: id, scheduledAt: b.scheduledAt, venue: b.venue, panel: b.panel, createdBy: p.userId }).returning();
      const members = await tx.select({ studentId: projectMembers.studentId, userId: projectMembers.userId }).from(projectMembers).where(eq(projectMembers.projectId, id));
      const sids = members.map((m) => m.studentId).filter((x): x is string => !!x);
      const studs = sids.length ? await tx.select({ userId: students.userId }).from(students).where(inArray(students.id, sids)) : [];
      const who = [...studs.map((s) => s.userId), ...b.panel.map((x) => x.userId), ...members.map((m) => m.userId)].filter((x): x is string => !!x && x !== p.userId);
      await this.notifications.notifyUsers(tx, [...new Set(who)], { kind: 'calendar', text: { title: `Viva for ${project.title}`, body: `${b.scheduledAt.toISOString().slice(0, 16).replace('T', ' ')} UTC${b.venue ? `, ${b.venue}` : ''}` }, data: { projectId: id }, dedupeKey: `project-viva:${row.id}` });
      await auditUser(tx, p, 'project.viva_scheduled', 'research_project', id, { vivaId: row.id });
      return row;
    });
  }

  @Post('viva/:vivaId/result')
  @HttpCode(200)
  @Auth('user', PROJECT_PARTICIPANTS)
  vivaResult(@CurrentPrincipal() p: UserPrincipal, @Param('vivaId', ParseUUIDPipe) vivaId: string, @Body(new ZodBody(VivaResult)) b: z.infer<typeof VivaResult>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [v] = await tx.select().from(projectVivas).where(eq(projectVivas.id, vivaId));
      if (!v) throw new NotFoundException('Viva not found');
      const r = await projectRole(tx, p, v.projectId);
      const onPanel = v.panel.some((x) => x.userId === p.userId);
      if (!onPanel && (!r.role || r.role === 'member')) throw new NotFoundException('Viva not found');
      if (v.status !== 'scheduled') throw new ConflictException('This viva has already been recorded');
      const [row] = await tx.update(projectVivas).set({ status: 'held', outcome: b.outcome, score: b.score ?? null, remarks: b.remarks }).where(eq(projectVivas.id, vivaId)).returning();
      await auditUser(tx, p, 'project.viva_recorded', 'research_project', v.projectId, { vivaId, outcome: b.outcome });
      return row;
    });
  }

  // ---- showcase, recruiting and matching -----------------------------------------------------

  @Put(':id/hub')
  @Auth('user', PROJECT_PARTICIPANTS)
  setHub(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(HubBody)) b: z.infer<typeof HubBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await requireMentor(tx, p, id);
      const [row] = await tx
        .insert(projectHub)
        .values({ tenantId: p.tenantId, projectId: id, ...b })
        .onConflictDoUpdate({ target: projectHub.projectId, set: { ...b, updatedAt: sql`now()` } })
        .returning();
      await auditUser(tx, p, 'project.hub_updated', 'research_project', id, { showcase: b.showcase, recruiting: b.recruiting });
      return row;
    });
  }

  /** Students ranked by how well their skills cover what the project looks for. */
  @Get(':id/matches')
  @Auth('user', PROJECT_PARTICIPANTS)
  matches(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await requireMentor(tx, p, id);
      const [hub] = await tx.select().from(projectHub).where(eq(projectHub.projectId, id));
      const looking = hub?.lookingFor ?? [];
      if (looking.length === 0) return [];
      const members = await tx.select({ studentId: projectMembers.studentId }).from(projectMembers).where(eq(projectMembers.projectId, id));
      const taken = new Set(members.map((m) => m.studentId));
      const all = await tx.select({ id: students.id, fullName: students.fullName, rollNo: students.rollNo }).from(students).where(eq(students.status, 'active'));
      const ev = await tx.select({ studentId: skillEvidence.studentId, name: skills.name }).from(skillEvidence).innerJoin(skills, eq(skills.id, skillEvidence.skillId));
      const res = await tx.select({ studentId: studentResumes.studentId, skills: studentResumes.skills }).from(studentResumes);
      return all
        .filter((s) => !taken.has(s.id))
        .map((s) => {
          const names = [...ev.filter((e) => e.studentId === s.id).map((e) => e.name), ...(res.find((r) => r.studentId === s.id)?.skills ?? [])];
          return { studentId: s.id, fullName: s.fullName, rollNo: s.rollNo, ...skillFit(looking, names) };
        })
        .filter((s) => s.fit > 0)
        .sort((a, b) => b.fit - a.fit)
        .slice(0, 20);
    });
  }

  @Post(':id/join')
  @Auth('user', ['student'])
  join(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(JoinBody)) b: z.infer<typeof JoinBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const stu = await ownStudent(tx, p);
      if (!stu) throw new NotFoundException('Student not found');
      const [hub] = await tx.select().from(projectHub).where(eq(projectHub.projectId, id));
      if (!hub?.recruiting) throw new NotFoundException('Project not found');
      const r = await projectRole(tx, p, id);
      if (r.role) throw new ConflictException('You are already on this project');
      const [row] = await orConflict('You have already asked to join this project', () => tx.insert(projectJoinRequests).values({ tenantId: p.tenantId, projectId: id, studentId: stu.id, message: b.message }).returning());
      await this.notifications.notifyUsers(tx, [r.project.piUserId], { kind: 'task', text: { title: `${stu.fullName} wants to join ${r.project.title}`, body: b.message.slice(0, 120) }, data: { projectId: id }, dedupeKey: `project-join:${row.id}` });
      return row;
    });
  }

  @Get(':id/requests')
  @Auth('user', PROJECT_PARTICIPANTS)
  requests(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await requireMentor(tx, p, id);
      return tx
        .select({ id: projectJoinRequests.id, studentId: projectJoinRequests.studentId, fullName: students.fullName, message: projectJoinRequests.message, status: projectJoinRequests.status, createdAt: projectJoinRequests.createdAt })
        .from(projectJoinRequests)
        .innerJoin(students, eq(students.id, projectJoinRequests.studentId))
        .where(eq(projectJoinRequests.projectId, id))
        .orderBy(desc(projectJoinRequests.createdAt));
    });
  }

  @Post('requests/:rid/decide')
  @HttpCode(200)
  @Auth('user', PROJECT_PARTICIPANTS)
  decide(@CurrentPrincipal() p: UserPrincipal, @Param('rid', ParseUUIDPipe) rid: string, @Body(new ZodBody(DecideBody)) b: z.infer<typeof DecideBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [req] = await tx.select().from(projectJoinRequests).where(eq(projectJoinRequests.id, rid));
      if (!req) throw new NotFoundException('Request not found');
      const { project } = await requireMentor(tx, p, req.projectId);
      if (req.status !== 'pending') throw new ConflictException('That request was already decided');
      await tx.update(projectJoinRequests).set({ status: b.accept ? 'accepted' : 'declined', decidedBy: p.userId, decidedAt: sql`now()` }).where(eq(projectJoinRequests.id, rid));
      if (b.accept) {
        await tx.insert(projectMembers).values({ tenantId: p.tenantId, projectId: req.projectId, studentId: req.studentId, role: 'student' });
        await tx.update(projectHub).set({ openings: sql`greatest(${projectHub.openings} - 1, 0)` }).where(eq(projectHub.projectId, req.projectId));
      }
      const [stu] = await tx.select({ userId: students.userId }).from(students).where(eq(students.id, req.studentId));
      if (stu?.userId) await this.notifications.notifyUsers(tx, [stu.userId], { kind: 'task', text: { title: b.accept ? `You joined ${project.title}` : `Your request for ${project.title} was declined`, body: '' }, data: { projectId: req.projectId }, dedupeKey: `project-join-decision:${rid}` });
      await auditUser(tx, p, 'project.join_decided', 'research_project', req.projectId, { requestId: rid, accept: b.accept });
      return { id: rid, status: b.accept ? 'accepted' : 'declined' };
    });
  }

  // ---- portfolio --------------------------------------------------------------------------------

  @Get('portfolio/mine')
  @Auth('user', ['student'])
  myPortfolio(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const stu = await ownStudent(tx, p);
      if (!stu) throw new NotFoundException('Student not found');
      return tx.select().from(portfolioItems).where(eq(portfolioItems.studentId, stu.id)).orderBy(desc(portfolioItems.createdAt));
    });
  }

  @Post('portfolio')
  @Auth('user', ['student'])
  addPortfolio(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(PortfolioBody)) b: z.infer<typeof PortfolioBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const stu = await ownStudent(tx, p);
      if (!stu) throw new NotFoundException('Student not found');
      if (b.projectId) {
        const r = await projectRole(tx, p, b.projectId);
        if (!r.role) throw new NotFoundException('Project not found');
      }
      const [row] = await tx.insert(portfolioItems).values({ tenantId: p.tenantId, studentId: stu.id, ...b, projectId: b.projectId ?? null, url: b.url ?? null }).returning();
      return row;
    });
  }

  @Post('portfolio/:itemId/publish')
  @HttpCode(200)
  @Auth('user', ['student'])
  publishPortfolio(@CurrentPrincipal() p: UserPrincipal, @Param('itemId', ParseUUIDPipe) itemId: string, @Body(new ZodBody(z.object({ published: z.boolean() }))) b: { published: boolean }) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const stu = await ownStudent(tx, p);
      const [row] = await tx.update(portfolioItems).set({ published: b.published }).where(and(eq(portfolioItems.id, itemId), eq(portfolioItems.studentId, stu?.id ?? '00000000-0000-0000-0000-000000000000'))).returning();
      if (!row) throw new NotFoundException('Portfolio item not found');
      return row;
    });
  }

  @Delete('portfolio/:itemId')
  @HttpCode(204)
  @Auth('user', ['student'])
  removePortfolio(@CurrentPrincipal() p: UserPrincipal, @Param('itemId', ParseUUIDPipe) itemId: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const stu = await ownStudent(tx, p);
      const gone = await tx.delete(portfolioItems).where(and(eq(portfolioItems.id, itemId), eq(portfolioItems.studentId, stu?.id ?? '00000000-0000-0000-0000-000000000000'))).returning({ id: portfolioItems.id });
      if (gone.length === 0) throw new NotFoundException('Portfolio item not found');
    });
  }

  /** A student's portfolio: published items for anyone signed in, everything for the student and staff. */
  @Get('portfolio/student/:studentId')
  @Auth('user')
  async portfolioOf(@CurrentPrincipal() p: UserPrincipal, @Param('studentId', ParseUUIDPipe) studentId: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [s] = await tx.select({ id: students.id, userId: students.userId, fullName: students.fullName }).from(students).where(eq(students.id, studentId));
      if (!s) throw new NotFoundException('Student not found');
      const viewer = { isOwner: s.userId === p.userId, isStaff: hasAny(p, [...PROJECT_ADMIN, 'teacher', 'placement_officer']) };
      const items = await tx.select().from(portfolioItems).where(eq(portfolioItems.studentId, studentId)).orderBy(desc(portfolioItems.createdAt));
      return { student: { id: s.id, fullName: s.fullName }, items: items.filter((i) => canSeePortfolioItem(i, viewer)) };
    });
  }
}
