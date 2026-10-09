import { Body, ConflictException, Controller, ForbiddenException, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Query, Res, StreamableFile } from '@nestjs/common';
import { and, desc, eq, sql } from 'drizzle-orm';
import type { Response } from 'express';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { RoleName, UserPrincipal } from '../auth/principal.js';
import { auditUser } from '../common/audit.js';
import { Clock } from '../common/time.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService } from '../db/db.service.js';
import { qbBlueprints, qbPaperItems, qbPapers, qbQuestions, subjects, tenants, userRoles, users } from '../db/schema.js';
import { qbPaperReleases } from '../db/schema-depth.js';
import { paperPdf } from './paper-pdf.js';

const EXAM_STAFF: RoleName[] = ['tenant_admin', 'principal', 'hod', 'exam_controller'];
const ReleaseBody = z.object({ releaseAt: z.iso.datetime(), controllerId: z.uuid() });

/** What a sealed paper is released as: scheduled until its time, then released. */
export const releaseState = (status: string, releaseAt: Date, now: Date) => (status === 'cancelled' ? 'cancelled' : status === 'released' || now >= releaseAt ? 'released' : 'sealed');

/** Question usage history, and the sealed, timed release of a locked paper to the exam controller (PRD section 22). */
@Controller('v1/question-bank')
export class PaperReleaseController {
  constructor(
    private readonly db: DbService,
    private readonly clock: Clock,
  ) {}

  /** Which approved questions have been used in papers, how often and when last; unused questions come last. */
  @Get('usage')
  @Auth('user', EXAM_STAFF)
  usage(@CurrentPrincipal() p: UserPrincipal, @Query('subjectId') subjectId?: string) {
    if (subjectId && !z.uuid().safeParse(subjectId).success) throw new ConflictException('Choose a subject');
    return this.db.withTenant(p.tenantId, async (tx) => {
      const rows = await tx
        .select({
          id: qbQuestions.id,
          text: qbQuestions.text,
          topic: qbQuestions.topic,
          difficulty: qbQuestions.difficulty,
          bloom: qbQuestions.bloom,
          subject: subjects.name,
          papers: sql<number>`count(distinct ${qbPapers.id})::int`,
          lastUsedAt: sql<string | null>`max(${qbPapers.createdAt})`,
        })
        .from(qbQuestions)
        .innerJoin(subjects, eq(subjects.id, qbQuestions.subjectId))
        .leftJoin(qbPaperItems, eq(qbPaperItems.questionId, qbQuestions.id))
        .leftJoin(qbPapers, eq(qbPapers.id, qbPaperItems.paperId))
        .where(and(eq(qbQuestions.status, 'approved'), subjectId ? eq(qbQuestions.subjectId, subjectId) : undefined))
        .groupBy(qbQuestions.id, subjects.name)
        .orderBy(desc(sql`count(distinct ${qbPapers.id})`), desc(sql`max(${qbPapers.createdAt})`))
        .limit(500);
      return { questions: rows, unused: rows.filter((r) => r.papers === 0).length, total: rows.length };
    });
  }

  /** The papers one question has appeared in. */
  @Get('questions/:id/usage')
  @Auth('user', EXAM_STAFF)
  questionUsage(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) =>
      tx
        .select({ paperId: qbPapers.id, title: qbPapers.title, status: qbPapers.status, section: qbPaperItems.section, marks: qbPaperItems.marks, createdAt: qbPapers.createdAt })
        .from(qbPaperItems)
        .innerJoin(qbPapers, eq(qbPapers.id, qbPaperItems.paperId))
        .where(eq(qbPaperItems.questionId, id))
        .orderBy(desc(qbPapers.createdAt)),
    );
  }

  /** Seal a locked paper until a set time and name the exam controller who receives it. */
  @Post('papers/:id/release')
  @HttpCode(200)
  @Auth('user', EXAM_STAFF)
  schedule(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(ReleaseBody)) b: z.infer<typeof ReleaseBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [paper] = await tx.select().from(qbPapers).where(eq(qbPapers.id, id));
      if (!paper) throw new NotFoundException('Paper not found');
      if (paper.status !== 'locked') throw new ConflictException('Lock the paper before scheduling its release');
      const releaseAt = new Date(b.releaseAt);
      if (releaseAt <= this.clock.now()) throw new ConflictException('Choose a release time in the future');
      const [ctl] = await tx.select({ role: userRoles.role }).from(userRoles).where(and(eq(userRoles.userId, b.controllerId), eq(userRoles.role, 'exam_controller')));
      if (!ctl) throw new ConflictException('The recipient must be an exam controller');
      const [existing] = await tx.select().from(qbPaperReleases).where(eq(qbPaperReleases.paperId, id));
      if (existing?.status === 'released') throw new ConflictException('This paper has already been released');
      const values = { releaseAt, controllerId: b.controllerId, status: 'scheduled', createdBy: p.userId };
      const [row] = existing
        ? await tx.update(qbPaperReleases).set(values).where(eq(qbPaperReleases.id, existing.id)).returning()
        : await tx.insert(qbPaperReleases).values({ tenantId: p.tenantId, paperId: id, ...values }).returning();
      await auditUser(tx, p, 'qb.paper.release_scheduled', 'qb_paper', id, { releaseAt: b.releaseAt, controllerId: b.controllerId });
      return { ...row, state: releaseState(row.status, row.releaseAt, this.clock.now()) };
    });
  }

  @Get('papers/:id/release')
  @Auth('user', EXAM_STAFF)
  getRelease(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [row] = await tx.select().from(qbPaperReleases).where(eq(qbPaperReleases.paperId, id));
      return row ? { ...row, state: releaseState(row.status, row.releaseAt, this.clock.now()) } : null;
    });
  }

  @Post('papers/:id/release/cancel')
  @HttpCode(200)
  @Auth('user', EXAM_STAFF)
  cancel(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [row] = await tx.select().from(qbPaperReleases).where(eq(qbPaperReleases.paperId, id));
      if (!row) throw new NotFoundException('No release is scheduled');
      if (row.status === 'released' || this.clock.now() >= row.releaseAt) throw new ConflictException('The paper has already been released');
      const [saved] = await tx.update(qbPaperReleases).set({ status: 'cancelled' }).where(eq(qbPaperReleases.id, row.id)).returning();
      await auditUser(tx, p, 'qb.paper.release_cancelled', 'qb_paper', id);
      return saved;
    });
  }

  /** Every scheduled release, for the exam staff: which paper, who receives it and when. */
  @Get('releases')
  @Auth('user', EXAM_STAFF)
  releases(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const rows = await tx
        .select({ rel: qbPaperReleases, title: qbPapers.title, subject: subjects.name, controller: users.fullName })
        .from(qbPaperReleases)
        .innerJoin(qbPapers, eq(qbPapers.id, qbPaperReleases.paperId))
        .innerJoin(subjects, eq(subjects.id, qbPapers.subjectId))
        .innerJoin(users, eq(users.id, qbPaperReleases.controllerId))
        .where(sql`${qbPaperReleases.status} <> 'cancelled'`)
        .orderBy(desc(qbPaperReleases.releaseAt));
      const now = this.clock.now();
      return rows.map((r) => ({ id: r.rel.paperId, paperId: r.rel.paperId, title: r.title, subject: r.subject, controller: r.controller, controllerId: r.rel.controllerId, releaseAt: r.rel.releaseAt, state: releaseState(r.rel.status, r.rel.releaseAt, now), releasedAt: r.rel.releasedAt }));
    });
  }

  /** The papers addressed to the signed-in exam controller, sealed or released. */
  @Get('releases/mine')
  @Auth('user', ['exam_controller'])
  mine(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const rows = await tx
        .select({ rel: qbPaperReleases, title: qbPapers.title, subject: subjects.name, setter: users.fullName })
        .from(qbPaperReleases)
        .innerJoin(qbPapers, eq(qbPapers.id, qbPaperReleases.paperId))
        .innerJoin(subjects, eq(subjects.id, qbPapers.subjectId))
        .innerJoin(users, eq(users.id, qbPapers.setterId))
        .where(and(eq(qbPaperReleases.controllerId, p.userId), sql`${qbPaperReleases.status} <> 'cancelled'`))
        .orderBy(desc(qbPaperReleases.releaseAt));
      const now = this.clock.now();
      return rows.map((r) => ({ paperId: r.rel.paperId, title: r.title, subject: r.subject, setter: r.setter, releaseAt: r.rel.releaseAt, state: releaseState(r.rel.status, r.rel.releaseAt, now) }));
    });
  }

  /** The sealed copy: only the named controller, only after the release time. */
  @Get('releases/:paperId/paper.pdf')
  @Auth('user', ['exam_controller'])
  async secureCopy(@CurrentPrincipal() p: UserPrincipal, @Param('paperId', ParseUUIDPipe) paperId: string, @Res({ passthrough: true }) res: Response) {
    const out = await this.db.withTenant(p.tenantId, async (tx) => {
      const [rel] = await tx.select().from(qbPaperReleases).where(and(eq(qbPaperReleases.paperId, paperId), eq(qbPaperReleases.controllerId, p.userId)));
      if (!rel || rel.status === 'cancelled') throw new NotFoundException('No paper has been released to you');
      const now = this.clock.now();
      if (releaseState(rel.status, rel.releaseAt, now) === 'sealed') throw new ForbiddenException(`This paper is sealed until ${rel.releaseAt.toISOString()}`);
      if (rel.status === 'scheduled') await tx.update(qbPaperReleases).set({ status: 'released', releasedAt: now }).where(eq(qbPaperReleases.id, rel.id));
      const [paper] = await tx.select().from(qbPapers).where(eq(qbPapers.id, paperId));
      const [bp] = await tx.select().from(qbBlueprints).where(eq(qbBlueprints.id, paper.blueprintId));
      const [sub] = await tx.select({ name: subjects.name, code: subjects.code }).from(subjects).where(eq(subjects.id, paper.subjectId));
      const [tenant] = await tx.select({ name: tenants.name }).from(tenants).where(eq(tenants.id, p.tenantId));
      const items = await tx.select().from(qbPaperItems).where(eq(qbPaperItems.paperId, paperId));
      await auditUser(tx, p, 'qb.paper.released_copy_downloaded', 'qb_paper', paperId);
      return { buf: paperPdf({ institution: tenant?.name ?? '', title: paper.title, subject: sub.name, durationMinutes: bp.durationMinutes, totalMarks: bp.totalMarks, sections: bp.sections, items: items as never }, false), code: sub.code };
    });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="question-paper-${out.code}.pdf"`);
    res.setHeader('Cache-Control', 'no-store');
    return new StreamableFile(out.buf);
  }
}
