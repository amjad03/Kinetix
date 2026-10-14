import { BadRequestException, Body, ConflictException, Controller, Delete, ForbiddenException, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { UserPrincipal } from '../auth/principal.js';
import { auditUser } from '../common/audit.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService, type Tx } from '../db/db.service.js';
import { examOfficeSettings, examPapers, subjects } from '../db/schema.js';
import { examRelativeGrades } from '../db/schema-curriculum.js';
import { resolveAffiliation } from '../affiliation/resolve.js';
import { ExamsService, type SessionRow } from './exams.service.js';
import { classStats, distribution, gradeOnCurve, relativeCuts } from './relative-grading.js';
import { relativeSettings, storedRelative } from './relative-grading.store.js';
import { ADMIN } from './schemes.controller.js';

const SettingsBody = z.object({ enabled: z.boolean(), minClassSize: z.number().int().min(2).max(1000).nullable().optional() });
const ShiftBody = z.object({ shift: z.number().min(-20).max(20).default(0) });
const ApplyBody = ShiftBody.extend({ note: z.string().trim().max(500).default('') });

/** Why a candidate's mark is not part of the class's curve: absent, not eligible, malpractice or incomplete marks. */
const offCurve = (r: { externalAbsent: boolean; complete: boolean; reasons: string[] }) => r.externalAbsent || !r.complete || r.reasons.some((x) => x === 'absent' || x === 'not_eligible' || x === 'malpractice');

/**
 * Relative (curve) grading, where the regulation in force allows it (the affiliation profile's `grading.relative`, or
 * the institution's own rules): the exam office turns it on, previews a subject's mean and standard deviation, the
 * cut-offs with a moderation shift and the grade distribution against the absolute one, then applies it. Applied
 * cut-offs replace the absolute bands for passing candidates when results are processed (ExamsService.compute).
 */
@Controller('v1/relative-grading')
export class RelativeGradingController {
  constructor(
    private readonly db: DbService,
    private readonly exams: ExamsService,
  ) {}

  @Get('settings')
  @Auth('user', [...ADMIN, 'hod'])
  settings(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => ({ ...(await relativeSettings(tx, null)), stored: await storedRelative(tx) }));
  }

  /** Turns relative grading on or off; it can be turned on only where the regulation allows it. */
  @Put('settings')
  @Auth('user', ADMIN)
  save(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(SettingsBody)) b: z.infer<typeof SettingsBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const now = await relativeSettings(tx, null);
      if (b.enabled && !now.allowed) throw new ForbiddenException(`The regulation in force (${now.profile}) does not allow relative grading`);
      const [row] = await tx.select({ settings: examOfficeSettings.settings }).from(examOfficeSettings);
      const before = await storedRelative(tx);
      const settings = { ...((row?.settings as Record<string, unknown> | undefined) ?? {}), relativeGrading: { enabled: b.enabled, minClassSize: b.minClassSize ?? null } };
      await tx.insert(examOfficeSettings).values({ tenantId: p.tenantId, settings, updatedBy: p.userId }).onConflictDoUpdate({ target: examOfficeSettings.tenantId, set: { settings, updatedBy: p.userId, updatedAt: new Date() } });
      await auditUser(tx, p, 'exam.relative_grading.settings', 'exam_office_settings', undefined, { before, after: { enabled: b.enabled, minClassSize: b.minClassSize ?? null } });
      return relativeSettings(tx, null);
    });
  }

  /** The session's subjects with their candidates and, where applied, the curve. */
  @Get('sessions/:sessionId')
  @Auth('user', [...ADMIN, 'hod'])
  session(@CurrentPrincipal() p: UserPrincipal, @Param('sessionId', ParseUUIDPipe) sessionId: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const s = await this.exams.session(tx, sessionId);
      const settings = await relativeSettings(tx, s.programId);
      const subs = await tx.selectDistinct({ id: subjects.id, code: subjects.code, name: subjects.name }).from(examPapers).innerJoin(subjects, eq(subjects.id, examPapers.subjectId)).where(eq(examPapers.sessionId, sessionId)).orderBy(asc(subjects.code));
      const applied = subs.length ? await tx.select().from(examRelativeGrades).where(and(eq(examRelativeGrades.sessionId, sessionId), inArray(examRelativeGrades.subjectId, subs.map((x) => x.id)))) : [];
      return { session: { id: s.id, name: s.name, status: s.status }, settings, subjects: subs.map((x) => ({ ...x, applied: applied.find((a) => a.subjectId === x.id) ?? null })) };
    });
  }

  /** What the curve would give for a subject with a moderation shift, against the absolute grades. Saves nothing. */
  @Post('sessions/:sessionId/subjects/:subjectId/preview')
  @HttpCode(200)
  @Auth('user', [...ADMIN, 'hod'])
  preview(@CurrentPrincipal() p: UserPrincipal, @Param('sessionId', ParseUUIDPipe) sessionId: string, @Param('subjectId', ParseUUIDPipe) subjectId: string, @Body(new ZodBody(ShiftBody)) b: z.infer<typeof ShiftBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => this.curve(tx, await this.exams.session(tx, sessionId), subjectId, b.shift));
  }

  /** Applies the curve to a subject; processed results are graded again with it (published results stay as they are). */
  @Put('sessions/:sessionId/subjects/:subjectId')
  @Auth('user', ADMIN)
  apply(@CurrentPrincipal() p: UserPrincipal, @Param('sessionId', ParseUUIDPipe) sessionId: string, @Param('subjectId', ParseUUIDPipe) subjectId: string, @Body(new ZodBody(ApplyBody)) b: z.infer<typeof ApplyBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const s = await this.exams.session(tx, sessionId);
      this.assertOpen(s);
      const c = await this.curve(tx, s, subjectId, b.shift);
      if (!c.settings.enabled) throw new ConflictException('Turn relative grading on in the exam office settings first');
      if (c.stats.candidates < c.settings.minClassSize) throw new ConflictException(`The class is too small for relative grading (${c.stats.candidates} candidates; at least ${c.settings.minClassSize})`);
      const values = { candidates: c.stats.candidates, mean: c.stats.mean, sd: c.stats.sd, shift: b.shift, cuts: c.cuts, note: b.note, appliedBy: p.userId, appliedAt: new Date() };
      await tx.insert(examRelativeGrades).values({ tenantId: p.tenantId, sessionId, subjectId, ...values }).onConflictDoUpdate({ target: [examRelativeGrades.sessionId, examRelativeGrades.subjectId], set: values });
      const regraded = await this.regrade(tx, p, s);
      await auditUser(tx, p, 'exam.relative_grading.applied', 'exam_session', sessionId, { subjectId, ...values, appliedAt: undefined, regraded });
      return { ...c, regraded };
    });
  }

  /** Back to the absolute bands for the subject. */
  @Delete('sessions/:sessionId/subjects/:subjectId')
  @HttpCode(200)
  @Auth('user', ADMIN)
  clear(@CurrentPrincipal() p: UserPrincipal, @Param('sessionId', ParseUUIDPipe) sessionId: string, @Param('subjectId', ParseUUIDPipe) subjectId: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const s = await this.exams.session(tx, sessionId);
      this.assertOpen(s);
      const gone = await tx.delete(examRelativeGrades).where(and(eq(examRelativeGrades.sessionId, sessionId), eq(examRelativeGrades.subjectId, subjectId))).returning({ id: examRelativeGrades.id });
      if (!gone.length) throw new NotFoundException('This subject is not graded on a curve');
      const regraded = await this.regrade(tx, p, s);
      await auditUser(tx, p, 'exam.relative_grading.cleared', 'exam_session', sessionId, { subjectId, regraded });
      return { cleared: true, regraded };
    });
  }

  private assertOpen(s: SessionRow) {
    if (s.status === 'published' || s.status === 'locked') throw new ConflictException('Results are already published; the grading cannot change now');
    if (s.frozenAt) throw new ConflictException('The results are frozen; unfreeze them first');
  }

  /** Processed results are graded again so they show the curve at once. */
  private async regrade(tx: Tx, p: UserPrincipal, s: SessionRow): Promise<number> {
    if (s.status !== 'processed') return 0;
    const results = await this.exams.compute(tx, s);
    await this.exams.store(tx, p.tenantId, s, results);
    return results.length;
  }

  /** The class's statistics for the subject, the cut-offs with the shift, and both grade distributions. */
  private async curve(tx: Tx, s: SessionRow, subjectId: string, shift: number) {
    const settings = await relativeSettings(tx, s.programId);
    if (!settings.allowed) throw new ForbiddenException(`The regulation in force (${settings.profile}) does not allow relative grading`);
    if (Math.abs(shift) > settings.maxShift) throw new BadRequestException(`Moderation can move the cut-offs by at most ${settings.maxShift} marks`);
    const [sub] = await tx.select({ id: subjects.id, code: subjects.code, name: subjects.name }).from(subjects).where(eq(subjects.id, subjectId));
    const [paper] = await tx.select({ id: examPapers.id }).from(examPapers).where(and(eq(examPapers.sessionId, s.id), eq(examPapers.subjectId, subjectId)));
    if (!sub || !paper) throw new NotFoundException('This subject has no paper in the session');
    const bundle = await this.exams.scheme(tx, subjectId, s.academicYearId, await resolveAffiliation(tx, s.programId));
    if (!bundle) throw new ConflictException('The subject has no assessment scheme');
    // The curve never passes a candidate the absolute rules fail: its lowest grade starts at the pass mark.
    const passPercent = Math.max(bundle.pass.minTotalPercent ?? 0, [...bundle.scale.bands].filter((x) => x.pass).sort((a, c) => a.minPercent - c.minPercent)[0]?.minPercent ?? 0);
    // Absolute grading of the class as it stands (the curve itself is left out, so the comparison is fair).
    const results = await this.exams.compute(tx, s);
    const lines = results.flatMap((r) => r.lines.filter((l) => l.subjectId === subjectId).map((l) => ({ studentId: r.studentId, result: l.result })));
    const stats = classStats(lines.filter((l) => !offCurve(l.result)).map((l) => l.result.percent));
    const cuts = relativeCuts(stats, settings.bands, passPercent, shift);
    const absoluteOrder = [...bundle.scale.bands].sort((a, c) => c.minPercent - a.minPercent).map((x) => x.grade);
    const curveGrade = (r: (typeof lines)[number]['result']) => (r.passed ? gradeOnCurve(r.percent, cuts).grade : r.grade);
    const [{ applied }] = await tx.execute<{ applied: number }>(sql`select count(*)::int as applied from exam_relative_grades where session_id = ${s.id}::uuid and subject_id = ${subjectId}::uuid`).then((x) => x.rows);
    return {
      subject: sub,
      settings,
      stats,
      passPercent,
      shift,
      cuts,
      tooSmall: stats.candidates < settings.minClassSize,
      applied: applied > 0,
      absolute: distribution(lines.map((l) => (applied > 0 && l.result.passed ? absoluteGrade(l.result.percent, bundle.scale.bands) : l.result.grade)), absoluteOrder),
      relative: distribution(lines.map((l) => curveGrade(l.result)), cuts.map((c) => c.grade)),
    };
  }
}

/** The absolute band of a percentage (to compare when the stored results already use the curve). */
function absoluteGrade(percent: number, bands: { grade: string; minPercent: number }[]): string {
  return [...bands].sort((a, b) => b.minPercent - a.minPercent).find((b) => percent >= b.minPercent)?.grade ?? '';
}
