import { BadRequestException, Body, ConflictException, Controller, Get, NotFoundException, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { and, asc, desc, eq, ilike, inArray, lte, or } from 'drizzle-orm';
import { z } from 'zod';
import { resolveAffiliation } from '../affiliation/resolve.js';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { RoleName, UserPrincipal } from '../auth/principal.js';
import { audit } from '../common/audit.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService, type Tx } from '../db/db.service.js';
import { examResultLines, examResults, examSessions, programs, sections, students, subjects } from '../db/schema.js';
import { curriculumEquivalences, curriculumSubjects, curriculumVersions, studentCurriculumPins, studentReadmissions } from '../db/schema-curriculum.js';
import { READERS } from './curriculum.controller.js';

/** Who moves a rejoining student to the scheme in force (the academic office). */
export const READMISSION_ROLES: RoleName[] = ['tenant_admin', 'principal', 'exam_controller'];

const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-07-01');
/** Who finds a student to re-admit: the academic office and heads of department (who preview). */
const FINDERS: RoleName[] = [...READMISSION_ROLES, 'hod'];

const ApplyBody = z.object({ studentId: z.uuid(), rejoinedOn: Day, rejoinTerm: z.number().int().min(1).max(20), note: z.string().trim().max(1000).default('') });

type Version = typeof curriculumVersions.$inferSelect;

/**
 * The re-admission scheme: a student who rejoins after a break follows the curriculum version (the scheme or
 * regulation) in force for their programme when they rejoin, not the one they were admitted under. Subjects already
 * passed count through the same code in the new version, or through the equivalences the academic office keeps between
 * the two versions; the new version's subjects of earlier terms not covered must still be taken.
 */
@Controller('v1/readmissions')
export class ReadmissionController {
  constructor(private readonly db: DbService) {}

  /** Finds students to re-admit by name or roll number (`q`), or one student by `id`. */
  @Get('search')
  @Auth('user', FINDERS)
  search(@CurrentPrincipal() p: UserPrincipal, @Query('q') q?: string, @Query('id') id?: string) {
    const text = (q ?? '').trim().replace(/[%_]/g, '');
    const one = id && z.uuid().safeParse(id).success ? id : null;
    if (!one && text.length < 2) return [];
    return this.db.withTenant(p.tenantId, (tx) =>
      tx
        .select({ id: students.id, name: students.fullName, rollNo: students.rollNo, status: students.status, section: sections.displayName, program: programs.name })
        .from(students)
        .innerJoin(sections, eq(sections.id, students.sectionId))
        .innerJoin(programs, eq(programs.id, sections.programId))
        .where(one ? eq(students.id, one) : or(ilike(students.fullName, `%${text}%`), eq(students.rollNo, text)))
        .orderBy(asc(students.fullName))
        .limit(20),
    );
  }

  /** What re-admission on a date into a term would do, without changing anything. */
  @Get('students/:studentId/preview')
  @Auth('user', READERS)
  preview(@CurrentPrincipal() p: UserPrincipal, @Param('studentId', ParseUUIDPipe) studentId: string, @Query('rejoinedOn') rejoinedOn: string, @Query('rejoinTerm') rejoinTerm: string) {
    const on = Day.safeParse(rejoinedOn);
    const term = Number(rejoinTerm);
    if (!on.success || !Number.isInteger(term) || term < 1 || term > 20) throw new BadRequestException('Give the date of rejoining and the term the student rejoins');
    return this.db.withTenant(p.tenantId, (tx) => plan(tx, studentId, on.data, term));
  }

  /** Re-admits the student into the scheme in force: pins them to that version and records what counts and what is left. */
  @Post()
  @Auth('user', READMISSION_ROLES)
  apply(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(ApplyBody)) b: z.infer<typeof ApplyBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const pl = await plan(tx, b.studentId, b.rejoinedOn, b.rejoinTerm);
      await tx
        .insert(studentCurriculumPins)
        .values({ tenantId: p.tenantId, studentId: b.studentId, versionId: pl.to.id, pinnedBy: p.userId })
        .onConflictDoUpdate({ target: [studentCurriculumPins.tenantId, studentCurriculumPins.studentId], set: { versionId: pl.to.id, pinnedBy: p.userId, pinnedAt: new Date() } });
      const [row] = await tx
        .insert(studentReadmissions)
        .values({ tenantId: p.tenantId, studentId: b.studentId, rejoinedOn: b.rejoinedOn, rejoinTerm: b.rejoinTerm, fromVersionId: pl.from?.id ?? null, toVersionId: pl.to.id, scheme: pl.scheme ?? {}, credited: pl.credited, toTake: pl.toTake, note: b.note, decidedBy: p.userId })
        .returning();
      await audit(tx, {
        tenantId: p.tenantId,
        actorType: 'user',
        actorId: p.userId,
        action: 'student.readmission_scheme',
        subjectType: 'student',
        subjectId: b.studentId,
        changes: { curriculumVersion: { before: pl.from ? `${pl.from.regulationYear} v${pl.from.versionNo}: ${pl.from.label}` : null, after: `${pl.to.regulationYear} v${pl.to.versionNo}: ${pl.to.label}` } },
        data: { readmissionId: row.id, rejoinedOn: b.rejoinedOn, rejoinTerm: b.rejoinTerm, credited: pl.credited.length, toTake: pl.toTake.length },
      });
      return { ...row, plan: pl };
    });
  }

  /** The student's re-admissions, newest first. */
  @Get('students/:studentId')
  @Auth('user', READERS)
  history(@CurrentPrincipal() p: UserPrincipal, @Param('studentId', ParseUUIDPipe) studentId: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const rows = await tx.select().from(studentReadmissions).where(eq(studentReadmissions.studentId, studentId)).orderBy(desc(studentReadmissions.createdAt));
      const ids = [...new Set(rows.flatMap((r) => [r.fromVersionId, r.toVersionId]).filter((x): x is string => !!x))];
      const versions = ids.length ? await tx.select({ id: curriculumVersions.id, label: curriculumVersions.label, regulationYear: curriculumVersions.regulationYear, versionNo: curriculumVersions.versionNo }).from(curriculumVersions).where(inArray(curriculumVersions.id, ids)) : [];
      const v = new Map(versions.map((x) => [x.id, x]));
      return rows.map((r) => ({ ...r, from: r.fromVersionId ? (v.get(r.fromVersionId) ?? null) : null, to: v.get(r.toVersionId) ?? null }));
    });
  }
}

/** The version a student follows now: their pin, or the programme's version in force when they were admitted. */
async function currentVersion(tx: Tx, studentId: string, programId: string, admittedYear: number | null): Promise<Version | null> {
  const [pin] = await tx.select({ v: curriculumVersions }).from(studentCurriculumPins).innerJoin(curriculumVersions, eq(curriculumVersions.id, studentCurriculumPins.versionId)).where(eq(studentCurriculumPins.studentId, studentId));
  if (pin) return pin.v;
  if (admittedYear === null) return null;
  return (await inForce(tx, programId, admittedYear, null)) ?? null;
}

/** The programme's version in force in a year: the latest regulation year not after it, the live one first. */
async function inForce(tx: Tx, programId: string, year: number, on: string | null): Promise<Version | undefined> {
  const rows = await tx
    .select()
    .from(curriculumVersions)
    .where(and(eq(curriculumVersions.programId, programId), lte(curriculumVersions.regulationYear, year), inArray(curriculumVersions.status, ['active', 'archived'])))
    .orderBy(desc(curriculumVersions.regulationYear), asc(curriculumVersions.status), desc(curriculumVersions.versionNo));
  // A version not yet in force on the day (a later effective date) does not apply.
  return rows.find((v) => !on || !v.effectiveFrom || v.effectiveFrom <= on);
}

/** The re-admission plan for a student rejoining on a day into a term. */
export async function plan(tx: Tx, studentId: string, rejoinedOn: string, rejoinTerm: number) {
  const [st] = await tx
    .select({ id: students.id, name: students.fullName, enrolledOn: students.enrolledOn, programId: sections.programId, program: programs.name })
    .from(students)
    .innerJoin(sections, eq(sections.id, students.sectionId))
    .innerJoin(programs, eq(programs.id, sections.programId))
    .where(eq(students.id, studentId));
  if (!st) throw new NotFoundException('Student not found');
  const from = await currentVersion(tx, studentId, st.programId, st.enrolledOn ? Number(st.enrolledOn.slice(0, 4)) : null);
  const to = await inForce(tx, st.programId, Number(rejoinedOn.slice(0, 4)), rejoinedOn);
  if (!to) throw new ConflictException('No curriculum version of the programme is in force on that date; activate one first');
  const toSubjects = await tx.select().from(curriculumSubjects).where(eq(curriculumSubjects.versionId, to.id)).orderBy(asc(curriculumSubjects.term), asc(curriculumSubjects.ord));
  const fromSubjects = from ? await tx.select().from(curriculumSubjects).where(eq(curriculumSubjects.versionId, from.id)) : [];
  // Subjects passed in published results, by code (the better grade of several passes).
  const passed = await tx
    .select({ code: subjects.code, name: subjects.name, credits: examResultLines.credits, grade: examResultLines.grade, gp: examResultLines.gradePoint })
    .from(examResultLines)
    .innerJoin(examResults, eq(examResults.id, examResultLines.resultId))
    .innerJoin(examSessions, eq(examSessions.id, examResults.sessionId))
    .innerJoin(subjects, eq(subjects.id, examResultLines.subjectId))
    .where(and(eq(examResults.studentId, studentId), eq(examResultLines.passed, true), inArray(examSessions.status, ['published', 'locked'])));
  const best = new Map<string, (typeof passed)[number]>();
  for (const r of passed) if (!best.has(r.code) || best.get(r.code)!.gp < r.gp) best.set(r.code, r);
  const maps = from && from.id !== to.id ? await tx.select().from(curriculumEquivalences).where(and(eq(curriculumEquivalences.fromVersionId, from.id), eq(curriculumEquivalences.toVersionId, to.id))) : [];
  const toByCode = new Map(toSubjects.map((x) => [x.code, x]));
  const credited: { fromCode: string; fromName: string; toCode: string; toName: string; credits: number; grade: string | null }[] = [];
  const notCounted: { code: string; name: string }[] = [];
  for (const r of best.values()) {
    const same = toByCode.get(r.code);
    const mapped = maps.filter((m) => m.fromCode === r.code).map((m) => toByCode.get(m.toCode)).filter((x): x is (typeof toSubjects)[number] => !!x);
    const targets = same ? [same] : mapped;
    if (!targets.length) {
      notCounted.push({ code: r.code, name: fromSubjects.find((f) => f.code === r.code)?.name ?? r.name });
      continue;
    }
    for (const tgt of targets) if (!credited.some((c) => c.toCode === tgt.code)) credited.push({ fromCode: r.code, fromName: r.name, toCode: tgt.code, toName: tgt.name, credits: Number(tgt.credits), grade: r.grade });
  }
  const covered = new Set(credited.map((c) => c.toCode));
  const toTake = toSubjects.filter((x) => x.term < rejoinTerm && !covered.has(x.code)).map((x) => ({ code: x.code, name: x.name, term: x.term, credits: Number(x.credits) }));
  const aff = await resolveAffiliation(tx, st.programId);
  return {
    student: { id: st.id, name: st.name, program: st.program },
    rejoinedOn,
    rejoinTerm,
    from: from ? { id: from.id, label: from.label, regulationYear: from.regulationYear, versionNo: from.versionNo } : null,
    to: { id: to.id, label: to.label, regulationYear: to.regulationYear, versionNo: to.versionNo },
    sameVersion: !!from && from.id === to.id,
    scheme: aff ? { ...aff.ref, name: aff.scheme.name } : null,
    credited,
    notCounted,
    toTake,
    equivalencesUsed: maps.length,
  };
}
