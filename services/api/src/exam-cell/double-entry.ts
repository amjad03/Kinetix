import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, HttpCode, NotFoundException, Param, ParseIntPipe, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { UserPrincipal } from '../auth/principal.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService, type Tx } from '../db/db.service.js';
import { assessments, examPapers, markEntryChecks, marks, students, subjects, supplementaryRegistrations, users } from '../db/schema.js';
import { auditCell, CELL, CELL_READ, CELL_STAFF, loadSession, rowsOf } from './common.js';
import { entryStatus } from './exam-cell.logic.js';

const EntriesBody = z.object({ entries: z.array(z.object({ studentId: z.uuid(), marks: z.number().min(0).nullable(), absent: z.boolean().default(false) })).min(1).max(1000) });
const ResolveBody = z.object({ studentId: z.uuid(), marks: z.number().min(0).nullable(), absent: z.boolean().default(false), note: z.string().trim().min(3).max(300) });

/**
 * Double entry of external marks from the valuers' mark sheets: two people key the same sheet independently; rows
 * that disagree are listed for the exam office to settle against the script, and only agreed marks are posted to the
 * paper's marks (which then go through the usual submit and verify).
 */
@Controller('v1')
export class DoubleEntryController {
  constructor(private readonly db: DbService) {}

  /** The candidates of a paper with both keyings and their state. */
  @Get('exam-papers/:paperId/double-entry')
  @Auth('user', CELL_STAFF)
  sheet(@CurrentPrincipal() p: UserPrincipal, @Param('paperId', ParseUUIDPipe) paperId: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const paper = await this.paper(tx, paperId);
      const roster = await this.candidates(tx, paper);
      const checks = await tx.select().from(markEntryChecks).where(eq(markEntryChecks.paperId, paperId));
      const names = new Map((await tx.select({ id: users.id, name: users.fullName }).from(users).where(inArray(users.id, [...new Set(checks.flatMap((c) => [c.firstBy, c.secondBy, c.resolvedBy]).filter((x): x is string => !!x)), '00000000-0000-0000-0000-000000000000']))).map((u) => [u.id, u.name]));
      const rows = roster.map((r) => {
        const c = checks.find((x) => x.studentId === r.id);
        return {
          studentId: r.id,
          rollNo: r.rollNo,
          name: r.fullName,
          first: c?.firstAt ? { marks: c.firstMarks, absent: c.firstAbsent, by: names.get(c.firstBy ?? '') ?? null } : null,
          second: c?.secondAt ? { marks: c.secondMarks, absent: c.secondAbsent, by: names.get(c.secondBy ?? '') ?? null } : null,
          status: c?.status ?? 'pending',
          resolved: c?.resolvedAt ? { marks: c.resolvedMarks, absent: c.resolvedAbsent, by: names.get(c.resolvedBy ?? '') ?? null, note: c.note } : null,
          posted: !!c?.postedAt,
        };
      });
      const [subject] = await tx.select({ name: subjects.name, code: subjects.code }).from(subjects).where(eq(subjects.id, paper.subjectId));
      const count = (st: string) => rows.filter((r) => r.status === st).length;
      return { paperId, subject: subject?.name ?? '', code: subject?.code ?? '', maxMarks: paper.maxMarks, rows, summary: { candidates: rows.length, pending: count('pending'), matched: count('matched'), mismatch: count('mismatch'), resolved: count('resolved'), posted: rows.filter((r) => r.posted).length } };
    });
  }

  /** Saves the first (round 1) or second (round 2) keying of some rows. The second keying must be by someone else. */
  @Put('exam-papers/:paperId/double-entry/:round')
  @Auth('user', CELL_STAFF)
  key(@CurrentPrincipal() p: UserPrincipal, @Param('paperId', ParseUUIDPipe) paperId: string, @Param('round', ParseIntPipe) round: number, @Body(new ZodBody(EntriesBody)) b: z.infer<typeof EntriesBody>) {
    if (round !== 1 && round !== 2) throw new BadRequestException('The round is 1 or 2');
    return this.db.withTenant(p.tenantId, async (tx) => {
      const paper = await this.paper(tx, paperId);
      const roster = new Set((await this.candidates(tx, paper)).map((r) => r.id));
      let saved = 0;
      for (const e of b.entries) {
        if (!roster.has(e.studentId)) throw new BadRequestException('A student in the sheet does not sit this paper');
        if (!e.absent && e.marks === null) continue;
        if (e.marks !== null && e.marks > paper.maxMarks) throw new BadRequestException(`Marks cannot be more than ${paper.maxMarks}`);
        const [c] = await tx.select().from(markEntryChecks).where(and(eq(markEntryChecks.paperId, paperId), eq(markEntryChecks.studentId, e.studentId)));
        if (c?.postedAt) throw new ConflictException('These marks are already posted to the paper');
        const other = round === 1 ? c?.secondBy : c?.firstBy;
        if (other && other === p.userId) throw new ForbiddenException('The second entry must be made by someone other than the first');
        const value = { marks: e.absent ? null : e.marks, absent: e.absent };
        const first = round === 1 ? value : c?.firstAt ? { marks: c.firstMarks, absent: c.firstAbsent } : null;
        const second = round === 2 ? value : c?.secondAt ? { marks: c.secondMarks, absent: c.secondAbsent } : null;
        const status = entryStatus(first, second);
        const set = round === 1 ? { firstMarks: value.marks, firstAbsent: value.absent, firstBy: p.userId, firstAt: new Date() } : { secondMarks: value.marks, secondAbsent: value.absent, secondBy: p.userId, secondAt: new Date() };
        await tx
          .insert(markEntryChecks)
          .values({ tenantId: p.tenantId, paperId, studentId: e.studentId, ...set, status })
          .onConflictDoUpdate({ target: [markEntryChecks.paperId, markEntryChecks.studentId], set: { ...set, status, resolvedMarks: null, resolvedAbsent: false, resolvedBy: null, resolvedAt: null } });
        saved++;
      }
      await auditCell(tx, p, `exam.double_entry.round${round}`, 'exam_paper', paperId, { data: { rows: saved } });
      return { saved };
    });
  }

  /** The exam office settles a mismatch from the script itself. */
  @Post('exam-papers/:paperId/double-entry/resolve')
  @HttpCode(200)
  @Auth('user', CELL)
  resolve(@CurrentPrincipal() p: UserPrincipal, @Param('paperId', ParseUUIDPipe) paperId: string, @Body(new ZodBody(ResolveBody)) b: z.infer<typeof ResolveBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const paper = await this.paper(tx, paperId);
      const [c] = await tx.select().from(markEntryChecks).where(and(eq(markEntryChecks.paperId, paperId), eq(markEntryChecks.studentId, b.studentId)));
      if (!c || c.status !== 'mismatch') throw new ConflictException('Only a mismatch is settled');
      if (!b.absent && b.marks === null) throw new BadRequestException('Give the marks or mark the candidate absent');
      if (b.marks !== null && b.marks > paper.maxMarks) throw new BadRequestException(`Marks cannot be more than ${paper.maxMarks}`);
      const [row] = await tx.update(markEntryChecks).set({ status: 'resolved', resolvedMarks: b.absent ? null : b.marks, resolvedAbsent: b.absent, resolvedBy: p.userId, resolvedAt: new Date(), note: b.note }).where(eq(markEntryChecks.id, c.id)).returning();
      await auditCell(tx, p, 'exam.double_entry.resolved', 'exam_paper', paperId, { data: { studentId: b.studentId, first: c.firstMarks, second: c.secondMarks, resolved: b.marks, note: b.note } });
      return row;
    });
  }

  /** Writes the agreed marks into the paper's marks; refused while any row is missing or in dispute, or once the marks are submitted. */
  @Post('exam-papers/:paperId/double-entry/post')
  @HttpCode(200)
  @Auth('user', CELL)
  post(@CurrentPrincipal() p: UserPrincipal, @Param('paperId', ParseUUIDPipe) paperId: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const paper = await this.paper(tx, paperId);
      if (!paper.assessmentId) throw new ConflictException('This paper has no marks sheet');
      const [a] = await tx.select({ status: assessments.markStatus }).from(assessments).where(eq(assessments.id, paper.assessmentId));
      if (a?.status !== 'draft') throw new ConflictException('The paper’s marks are already submitted; reopen them to post again');
      const roster = await this.candidates(tx, paper);
      const checks = await tx.select().from(markEntryChecks).where(eq(markEntryChecks.paperId, paperId));
      const open = roster.filter((r) => !checks.some((c) => c.studentId === r.id && (c.status === 'matched' || c.status === 'resolved')));
      if (open.length) throw new ConflictException({ message: `${open.length} candidates still need both entries to agree`, problems: open.slice(0, 20).map((r) => `${r.rollNo} ${r.fullName}`) });
      for (const c of checks) {
        const agreed = c.status === 'resolved' ? { marks: c.resolvedMarks, absent: c.resolvedAbsent } : { marks: c.firstMarks, absent: c.firstAbsent };
        await tx
          .insert(marks)
          .values({ tenantId: p.tenantId, assessmentId: paper.assessmentId, studentId: c.studentId, marks: agreed.absent ? null : agreed.marks, absent: agreed.absent })
          .onConflictDoUpdate({ target: [marks.assessmentId, marks.studentId], set: { marks: agreed.absent ? null : agreed.marks, absent: agreed.absent, updatedAt: new Date() } });
      }
      await tx.update(markEntryChecks).set({ postedAt: new Date() }).where(eq(markEntryChecks.paperId, paperId));
      await auditCell(tx, p, 'exam.double_entry.posted', 'exam_paper', paperId, { data: { rows: checks.length } });
      return { posted: checks.length };
    });
  }

  /** Every disagreement of a session, for the mismatch report. */
  @Get('exam-sessions/:id/double-entry/mismatches')
  @Auth('user', CELL_READ)
  mismatches(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await loadSession(tx, id);
      return rowsOf(
        tx,
        sql`select c.id, sub.code, sub.name as subject, st.roll_no as "rollNo", st.full_name as name, c.first_marks as "firstMarks", c.first_absent as "firstAbsent", c.second_marks as "secondMarks", c.second_absent as "secondAbsent", c.status, c.resolved_marks as "resolvedMarks", c.note
          from mark_entry_checks c join exam_papers p on p.id = c.paper_id join subjects sub on sub.id = p.subject_id join students st on st.id = c.student_id
          where p.session_id = ${id}::uuid and c.status in ('mismatch', 'resolved') order by sub.code, st.roll_no`,
      );
    });
  }

  private async paper(tx: Tx, id: string) {
    const [paper] = await tx.select().from(examPapers).where(eq(examPapers.id, id));
    if (!paper) throw new NotFoundException('Paper not found');
    return paper;
  }

  /** Who sits the paper: the class, or (in a repeat session) those registered for the subject. */
  private async candidates(tx: Tx, paper: typeof examPapers.$inferSelect) {
    const s = await loadSession(tx, paper.sessionId);
    const regs = await tx.select({ studentId: supplementaryRegistrations.studentId }).from(supplementaryRegistrations).where(and(eq(supplementaryRegistrations.sessionId, s.id), eq(supplementaryRegistrations.subjectId, paper.subjectId)));
    if (regs.length) return tx.select({ id: students.id, rollNo: students.rollNo, fullName: students.fullName }).from(students).where(inArray(students.id, regs.map((r) => r.studentId))).orderBy(asc(students.rollNo));
    return tx.select({ id: students.id, rollNo: students.rollNo, fullName: students.fullName }).from(students).where(and(eq(students.sectionId, paper.sectionId), eq(students.status, 'active'))).orderBy(asc(students.rollNo));
  }
}
