import { Body, Controller, ForbiddenException, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { and, desc, eq, gte, inArray, ne } from 'drizzle-orm';
import { z } from 'zod';
import { Auth, CurrentPrincipal, TEACHING_ROLES } from '../auth/auth.decorators.js';
import type { RoleName, UserPrincipal } from '../auth/principal.js';
import { audit } from '../common/audit.js';
import { Clock } from '../common/time.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService } from '../db/db.service.js';
import { homework, homeworkSubmissions, integrityChecks, integrityMatches, students } from '../db/schema.js';
import { TasksService } from '../tasks/tasks.service.js';
import { containment, MIN_WORDS, sharedPhrase, shingles, words } from './similarity.js';

const SENIOR: RoleName[] = ['tenant_admin', 'principal', 'hod'];
const CheckBody = z.object({ threshold: z.number().min(0.2).max(1).default(0.5) });
const ReviewBody = z.object({ reviewed: z.enum(['confirmed', 'dismissed']) });

/**
 * Academic integrity (PRD section 67): compares the typed answers of a homework with each other and with the same
 * subject's earlier homework from the past year. The work stays inside the platform; a teacher reviews every flag.
 */
@Controller('v1/integrity')
export class IntegrityController {
  constructor(
    private readonly db: DbService,
    private readonly clock: Clock,
    private readonly tasks: TasksService,
  ) {}

  @Post('homework/:id/check')
  @HttpCode(200)
  @Auth('user', [...TEACHING_ROLES, 'tenant_admin'])
  check(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(CheckBody)) b: z.infer<typeof CheckBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [hw] = await tx.select().from(homework).where(eq(homework.id, id));
      if (!hw) throw new NotFoundException('Homework not found');
      if (hw.createdBy !== p.userId && !p.roles.some((r) => SENIOR.includes(r))) throw new ForbiddenException('Only the teacher who set this homework can check it');
      const subs = (await tx.select({ studentId: homeworkSubmissions.studentId, text: homeworkSubmissions.text }).from(homeworkSubmissions).where(eq(homeworkSubmissions.homeworkId, id))).map((s) => ({ ...s, w: words(s.text) })).filter((s) => s.w.length >= MIN_WORDS);
      const since = new Date(this.clock.now().getTime() - 365 * 86400_000);
      const earlierHw = await tx.select({ id: homework.id }).from(homework).where(and(eq(homework.subjectId, hw.subjectId), ne(homework.id, id), gte(homework.createdAt, since)));
      const earlier = earlierHw.length
        ? (await tx.select({ studentId: homeworkSubmissions.studentId, text: homeworkSubmissions.text }).from(homeworkSubmissions).where(inArray(homeworkSubmissions.homeworkId, earlierHw.map((h) => h.id)))).map((s) => ({ ...s, w: words(s.text) })).filter((s) => s.w.length >= MIN_WORDS)
        : [];
      const sh = new Map(subs.map((s) => [s.studentId, shingles(s.w)]));
      const found: { studentId: string; matchedStudentId: string; similarity: number; sharedPhrase: string }[] = [];
      for (let i = 0; i < subs.length; i++) {
        for (let j = i + 1; j < subs.length; j++) {
          const sim = containment(sh.get(subs[i].studentId)!, sh.get(subs[j].studentId)!);
          if (sim >= b.threshold) found.push({ studentId: subs[i].studentId, matchedStudentId: subs[j].studentId, similarity: Math.round(sim * 1000) / 1000, sharedPhrase: sharedPhrase(subs[i].w, subs[j].w) });
        }
        // Against earlier work of other students: the best match per earlier author is kept.
        const best = new Map<string, { sim: number; phrase: string }>();
        for (const e of earlier) {
          if (e.studentId === subs[i].studentId) continue;
          const sim = containment(sh.get(subs[i].studentId)!, shingles(e.w));
          if (sim >= b.threshold && sim > (best.get(e.studentId)?.sim ?? 0)) best.set(e.studentId, { sim, phrase: sharedPhrase(subs[i].w, e.w) });
        }
        for (const [other, m] of best) found.push({ studentId: subs[i].studentId, matchedStudentId: other, similarity: Math.round(m.sim * 1000) / 1000, sharedPhrase: m.phrase });
      }
      const [chk] = await tx.insert(integrityChecks).values({ tenantId: p.tenantId, sourceKind: 'homework', sourceId: id, threshold: b.threshold, compared: subs.length + earlier.length, flagged: found.length, createdBy: p.userId }).returning();
      if (found.length) await tx.insert(integrityMatches).values(found.map((f) => ({ ...f, tenantId: p.tenantId, checkId: chk.id })));
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'integrity.checked', subjectType: 'homework', subjectId: id, data: { compared: chk.compared, flagged: found.length, threshold: b.threshold } });
      if (found.length) {
        await this.tasks.create(tx, { tenantId: p.tenantId, ownerId: p.userId, assigneeId: hw.createdBy, title: `Review ${found.length} similarity flag${found.length === 1 ? '' : 's'}: ${hw.title}`, description: 'Open the integrity report and confirm or dismiss each pair.', sourceModule: 'integrity', sourceId: chk.id, priority: 'high', slaHours: 72 });
      }
      return { check: chk, flagged: found.length };
    });
  }

  /** The latest check for a homework, with names, newest similarity first. */
  @Get('homework/:id')
  @Auth('user', [...TEACHING_ROLES, 'tenant_admin'])
  report(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [hw] = await tx.select().from(homework).where(eq(homework.id, id));
      if (!hw) throw new NotFoundException('Homework not found');
      if (hw.createdBy !== p.userId && !p.roles.some((r) => SENIOR.includes(r))) throw new ForbiddenException('Only the teacher who set this homework can see its integrity report');
      const [chk] = await tx.select().from(integrityChecks).where(and(eq(integrityChecks.sourceKind, 'homework'), eq(integrityChecks.sourceId, id))).orderBy(desc(integrityChecks.createdAt)).limit(1);
      if (!chk) return { check: null, matches: [] };
      const rows = await tx.select().from(integrityMatches).where(eq(integrityMatches.checkId, chk.id)).orderBy(desc(integrityMatches.similarity));
      const ids = [...new Set(rows.flatMap((r) => [r.studentId, r.matchedStudentId]))];
      const names = ids.length ? await tx.select({ id: students.id, name: students.fullName, rollNo: students.rollNo }).from(students).where(inArray(students.id, ids)) : [];
      const nm = new Map(names.map((n) => [n.id, n]));
      return { check: chk, homework: { id: hw.id, title: hw.title }, matches: rows.map((r) => ({ ...r, student: nm.get(r.studentId)?.name ?? null, studentRollNo: nm.get(r.studentId)?.rollNo ?? null, matchedStudent: nm.get(r.matchedStudentId)?.name ?? null, matchedRollNo: nm.get(r.matchedStudentId)?.rollNo ?? null })) };
    });
  }

  /** The teacher's decision on one flag. A flag is a prompt to look, never a finding. */
  @Put('matches/:id')
  @Auth('user', [...TEACHING_ROLES, 'tenant_admin'])
  review(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(ReviewBody)) b: z.infer<typeof ReviewBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [m] = await tx.select().from(integrityMatches).where(eq(integrityMatches.id, id));
      if (!m) throw new NotFoundException('Flag not found');
      const [chk] = await tx.select().from(integrityChecks).where(eq(integrityChecks.id, m.checkId));
      const [hw] = chk?.sourceId ? await tx.select().from(homework).where(eq(homework.id, chk.sourceId)) : [];
      if (hw && hw.createdBy !== p.userId && !p.roles.some((r) => SENIOR.includes(r))) throw new ForbiddenException('Only the teacher who set this homework can review its flags');
      const [row] = await tx.update(integrityMatches).set({ reviewed: b.reviewed, reviewedBy: p.userId }).where(eq(integrityMatches.id, id)).returning();
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'integrity.reviewed', subjectType: 'integrity_match', subjectId: id, changes: { reviewed: { before: m.reviewed, after: b.reviewed } } });
      return row;
    });
  }
}
