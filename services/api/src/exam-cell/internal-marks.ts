import { BadRequestException, Body, ConflictException, Controller, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Put, Res } from '@nestjs/common';
import { and, asc, eq, inArray } from 'drizzle-orm';
import type { Response } from 'express';
import type { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { UserPrincipal } from '../auth/principal.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService } from '../db/db.service.js';
import { assessments, examOfficeSettings, marks, students, subjects } from '../db/schema.js';
import { attendanceSettings, overallAttendance } from '../attendance-governance/eligibility.js';
import { resolveAffiliation } from '../affiliation/resolve.js';
import { ExamsService } from '../exams/exams.service.js';
import { auditCell, CELL, CELL_READ, CELL_STAFF, loadSession } from './common.js';
import { attendanceMarks, csv, slabProblem } from './exam-cell.logic.js';
import { CellSettingsBody, cellSettings, cellWithDefaults, type CellSettings } from './settings.js';

/**
 * Internal (CIA) marks tools: attendance marks from the slab table, the internal marks export in the university's
 * format, and the exam cell's settings.
 */
@Controller('v1')
export class InternalMarksController {
  constructor(
    private readonly db: DbService,
    private readonly exams: ExamsService,
  ) {}

  @Get('exam-cell/settings')
  @Auth('user', CELL_READ)
  settings(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, (tx) => cellSettings(tx));
  }

  @Put('exam-cell/settings')
  @Auth('user', CELL)
  save(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(CellSettingsBody)) b: z.infer<typeof CellSettingsBody>) {
    const problem = slabProblem(b.attendanceSlabs);
    if (problem) throw new BadRequestException(problem);
    if (new Set(b.lateFeeSlabs.map((s) => s.afterDays)).size !== b.lateFeeSlabs.length) throw new BadRequestException('Two late-fee slabs start on the same day');
    return this.db.withTenant(p.tenantId, async (tx) => {
      const before = await cellSettings(tx);
      const next: CellSettings = cellWithDefaults(b);
      const [row] = await tx.select({ settings: examOfficeSettings.settings }).from(examOfficeSettings);
      const settings = { ...((row?.settings as Record<string, unknown>) ?? {}), cell: next };
      await tx.insert(examOfficeSettings).values({ tenantId: p.tenantId, settings, updatedBy: p.userId }).onConflictDoUpdate({ target: examOfficeSettings.tenantId, set: { settings, updatedBy: p.userId, updatedAt: new Date() } });
      await auditCell(tx, p, 'exam_cell.settings_saved', 'exam_office_settings', p.tenantId, { before: before as unknown as Record<string, unknown>, after: next as unknown as Record<string, unknown> });
      return next;
    });
  }

  /** Fills a draft attendance assessment from each student's attendance and the slab table. */
  @Post('assessments/:id/attendance-marks')
  @HttpCode(200)
  @Auth('user', CELL_STAFF)
  attendance(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [a] = await tx.select().from(assessments).where(eq(assessments.id, id));
      if (!a) throw new NotFoundException('Assessment not found');
      if (a.markStatus !== 'draft' || a.lockedAt) throw new ConflictException('The marks are already submitted; reopen them first');
      if (a.kind === 'exam') throw new BadRequestException('Attendance marks go to an internal assessment, not an exam paper');
      const roster = await tx.select({ id: students.id, rollNo: students.rollNo, name: students.fullName }).from(students).where(and(eq(students.sectionId, a.sectionId), eq(students.status, 'active'))).orderBy(asc(students.rollNo));
      if (roster.length === 0) throw new ConflictException('The class has no students');
      const cfg = await cellSettings(tx);
      if (cfg.attendanceSlabs.length === 0) throw new ConflictException('Set the attendance marks slabs in the exam cell settings first');
      const att = await overallAttendance(tx, roster.map((r) => r.id), (await attendanceSettings(tx, a.sectionId)).thresholdPct);
      const out = [];
      for (const r of roster) {
        const pct = att.get(r.id)?.effectivePct ?? null;
        if (pct === null) {
          out.push({ studentId: r.id, rollNo: r.rollNo, name: r.name, attendancePercent: null, marks: null });
          continue;
        }
        const m = attendanceMarks(cfg.attendanceSlabs, pct, a.maxMarks);
        await tx.insert(marks).values({ tenantId: p.tenantId, assessmentId: id, studentId: r.id, marks: m, absent: false, remark: `Attendance ${pct}%` }).onConflictDoUpdate({ target: [marks.assessmentId, marks.studentId], set: { marks: m, absent: false, remark: `Attendance ${pct}%`, updatedAt: new Date() } });
        out.push({ studentId: r.id, rollNo: r.rollNo, name: r.name, attendancePercent: pct, marks: m });
      }
      await auditCell(tx, p, 'assessment.attendance_marks', 'assessment', id, { data: { students: out.filter((x) => x.marks !== null).length } });
      return { filled: out.filter((x) => x.marks !== null).length, noAttendance: out.filter((x) => x.marks === null).length, rows: out };
    });
  }

  /**
   * The internal marks of a session in the university's upload format: one row per candidate and subject, the
   * internal components' marks scaled to the profile's internal maximum (else to their weight), with the column
   * headings of the profile's result sheet.
   */
  @Get('exam-sessions/:id/internal-marks.csv')
  @Auth('user', CELL_READ)
  async internalCsv(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const text = await this.db.withTenant(p.tenantId, async (tx) => {
      const s = await loadSession(tx, id);
      const results = await this.exams.compute(tx, s);
      const affiliation = await resolveAffiliation(tx, s.programId);
      const head = (field: string, fallback: string) => affiliation?.rules.resultSheet.columns[field as keyof typeof affiliation.rules.resultSheet.columns]?.[0] ?? fallback;
      const scaleTo = affiliation?.rules.assessment.theory.internal || null;
      const ids = results.map((r) => r.studentId);
      const people = new Map((ids.length ? await tx.select({ id: students.id, rollNo: students.rollNo, name: students.fullName }).from(students).where(inArray(students.id, ids)) : []).map((r) => [r.id, r]));
      const subs = new Map((await tx.select({ id: subjects.id, code: subjects.code, name: subjects.name }).from(subjects)).map((x) => [x.id, x]));
      const rows: unknown[][] = [[head('registerNo', 'Register No'), head('name', 'Name'), head('subjectCode', 'Subject Code'), head('subjectName', 'Subject'), head('internal', 'Internal Marks'), head('maxInternal', 'Max Internal')]];
      for (const r of [...results].sort((a, b) => (people.get(a.studentId)?.rollNo ?? '').localeCompare(people.get(b.studentId)?.rollNo ?? '', undefined, { numeric: true }))) {
        for (const l of r.lines) {
          const ia = l.result.components.filter((c) => c.kind !== 'external');
          const weight = ia.reduce((x, c) => x + c.weight, 0);
          if (weight === 0) continue;
          const got = ia.reduce((x, c) => x + c.weighted, 0);
          const max = scaleTo ?? weight;
          const sub = subs.get(l.subjectId);
          rows.push([people.get(r.studentId)?.rollNo ?? '', people.get(r.studentId)?.name ?? '', sub?.code ?? '', sub?.name ?? '', Math.round((got / weight) * max), max]);
        }
      }
      await auditCell(tx, p, 'exam.internal_marks.exported', 'exam_session', id, { data: { rows: rows.length - 1 } });
      return csv(rows);
    });
    res.setHeader('content-type', 'text/csv; charset=utf-8');
    res.setHeader('content-disposition', 'attachment; filename="internal-marks.csv"');
    res.end(text);
  }
}
