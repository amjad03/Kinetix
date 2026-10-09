import { BadRequestException, Body, ConflictException, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { and, asc, desc, eq, gte, inArray, max, sql } from 'drizzle-orm';
import { z } from 'zod';
import { AiService } from '../ai/ai.service.js';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { RoleName, UserPrincipal } from '../auth/principal.js';
import { auditUser } from '../common/audit.js';
import { Day } from '../common/ops.js';
import { assertCanSeeStudent } from '../common/student-access.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService, type Tx } from '../db/db.service.js';
import { academicYears, programs, sections, students } from '../db/schema.js';
import { curriculumCos, curriculumSubjects, curriculumUnits, curriculumVersions, regulations, studentCurriculumPins, syllabusImports } from '../db/schema-curriculum.js';
import { found } from '../placements/placements.access.js';
import { UploadScanService } from '../scanning/upload-scan.js';
import { ContentSchema, type CurriculumContent, diffContent } from './curriculum-logic.js';
import { extractSyllabusText, UnsupportedSyllabusFile } from './syllabus-text.js';

const EDITORS: RoleName[] = ['tenant_admin', 'principal', 'hod'];
/** The Board of Studies sign-off and activation. */
const APPROVERS: RoleName[] = ['tenant_admin', 'principal'];
const READERS: RoleName[] = [...EDITORS, 'teacher', 'quality_officer', 'exam_controller'];
const MAX_FILE = 15 * 1024 * 1024;

const Year = z.number().int().min(1990).max(2100);
const RegulationBody = z.object({ name: z.string().trim().min(2).max(80), year: Year, programId: z.uuid().optional(), authority: z.string().trim().max(120).optional(), effectiveFrom: Day, notes: z.string().trim().max(1000).optional() });
const VersionBody = z.object({ programId: z.uuid(), regulationYear: Year, label: z.string().trim().min(2).max(120), regulationId: z.uuid().optional(), cloneFromId: z.uuid().optional() });
const ApproveBody = z.object({ bosRef: z.string().trim().min(2).max(120) });
const ActivateBody = z.object({ effectiveFrom: Day.optional() });
const PinBody = z.object({ sectionIds: z.array(z.uuid()).min(1).max(100), replace: z.boolean().default(false) });
const ApplyBody = z.object({ label: z.string().trim().min(2).max(120).optional(), content: ContentSchema.optional() });
const Blank = (v: unknown) => (v === '' ? undefined : v);
const ImportFields = z.object({ programId: z.uuid(), regulationYear: z.preprocess((v) => Number(v), Year) });

/** Loads a version's subjects with their units and outcomes. */
export async function loadContent(tx: Tx, versionId: string): Promise<CurriculumContent> {
  const subs = await tx.select().from(curriculumSubjects).where(eq(curriculumSubjects.versionId, versionId)).orderBy(asc(curriculumSubjects.term), asc(curriculumSubjects.ord), asc(curriculumSubjects.code));
  const ids = subs.map((s) => s.id);
  const units = ids.length ? await tx.select().from(curriculumUnits).where(inArray(curriculumUnits.subjectId, ids)).orderBy(asc(curriculumUnits.ord)) : [];
  const cos = ids.length ? await tx.select().from(curriculumCos).where(inArray(curriculumCos.subjectId, ids)).orderBy(asc(curriculumCos.code)) : [];
  return {
    subjects: subs.map((s) => ({
      code: s.code,
      name: s.name,
      term: s.term,
      credits: s.credits,
      hours: s.hours,
      units: units.filter((u) => u.subjectId === s.id).map((u) => ({ title: u.title, hours: u.hours, topics: u.topics })),
      cos: cos.filter((c) => c.subjectId === s.id).map((c) => ({ code: c.code, statement: c.statement, bloomLevel: c.bloomLevel })),
    })),
  };
}

/** Replaces a version's content (drafts only). */
async function saveContent(tx: Tx, tenantId: string, versionId: string, content: CurriculumContent) {
  const codes = content.subjects.map((s) => s.code);
  if (new Set(codes).size !== codes.length) throw new BadRequestException('Two subjects have the same code');
  await tx.delete(curriculumSubjects).where(eq(curriculumSubjects.versionId, versionId));
  for (const [i, s] of content.subjects.entries()) {
    const [row] = await tx.insert(curriculumSubjects).values({ tenantId, versionId, term: s.term, code: s.code, name: s.name, credits: s.credits, hours: s.hours, ord: i }).returning({ id: curriculumSubjects.id });
    if (s.units.length) await tx.insert(curriculumUnits).values(s.units.map((u, n) => ({ tenantId, subjectId: row.id, ord: n + 1, title: u.title, hours: u.hours, topics: u.topics })));
    if (s.cos.length) await tx.insert(curriculumCos).values(s.cos.map((c) => ({ tenantId, subjectId: row.id, code: c.code, statement: c.statement, bloomLevel: c.bloomLevel ?? null })));
  }
}

async function createVersion(tx: Tx, p: UserPrincipal, b: { programId: string; regulationYear: number; label: string; regulationId?: string; cloneFromId?: string; source?: string; content?: CurriculumContent }) {
  found((await tx.select({ id: programs.id }).from(programs).where(eq(programs.id, b.programId)))[0], 'Programme');
  if (b.regulationId) found((await tx.select({ id: regulations.id }).from(regulations).where(eq(regulations.id, b.regulationId)))[0], 'Regulation');
  const [{ n }] = await tx.select({ n: max(curriculumVersions.versionNo) }).from(curriculumVersions).where(and(eq(curriculumVersions.programId, b.programId), eq(curriculumVersions.regulationYear, b.regulationYear)));
  let content = b.content;
  if (b.cloneFromId) {
    found((await tx.select({ id: curriculumVersions.id }).from(curriculumVersions).where(eq(curriculumVersions.id, b.cloneFromId)))[0], 'Version to copy');
    content = await loadContent(tx, b.cloneFromId);
  }
  const [row] = await tx
    .insert(curriculumVersions)
    .values({ tenantId: p.tenantId, programId: b.programId, regulationId: b.regulationId ?? null, regulationYear: b.regulationYear, versionNo: (n ?? 0) + 1, label: b.label, supersedesId: b.cloneFromId ?? null, source: b.source ?? 'manual', createdBy: p.userId })
    .returning();
  if (content) await saveContent(tx, p.tenantId, row.id, content);
  await auditUser(tx, p, 'curriculum.version_created', 'curriculum_version', row.id, { programId: b.programId, regulationYear: b.regulationYear, versionNo: row.versionNo });
  return row;
}

/** Curriculum versions per programme and regulation year: draft, Board of Studies approval, activation, pinning and diffs. */
@Controller('v1/curriculum')
export class CurriculumController {
  constructor(
    private readonly db: DbService,
    private readonly ai: AiService,
    private readonly scans: UploadScanService,
  ) {}

  @Get('regulations')
  @Auth('user', READERS)
  listRegulations(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, (tx) => tx.select().from(regulations).orderBy(desc(regulations.year), asc(regulations.name)));
  }

  @Post('regulations')
  @Auth('user', EDITORS)
  createRegulation(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(RegulationBody)) b: z.infer<typeof RegulationBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [dup] = await tx.select({ id: regulations.id }).from(regulations).where(and(eq(regulations.name, b.name), eq(regulations.year, b.year)));
      if (dup) throw new ConflictException('This regulation already exists for that year');
      const [row] = await tx.insert(regulations).values({ tenantId: p.tenantId, name: b.name, year: b.year, programId: b.programId ?? null, authority: b.authority ?? 'Board of Studies', effectiveFrom: b.effectiveFrom, notes: b.notes ?? '' }).returning();
      await auditUser(tx, p, 'curriculum.regulation_created', 'regulation', row.id, { name: b.name, year: b.year });
      return row;
    });
  }

  @Get('versions')
  @Auth('user', READERS)
  versions(@CurrentPrincipal() p: UserPrincipal, @Query('programId') programId?: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const rows = await tx
        .select({ version: curriculumVersions, programName: programs.name, subjects: sql<number>`(select count(*)::int from curriculum_subjects cs where cs.version_id = ${curriculumVersions.id})`, pinned: sql<number>`(select count(*)::int from student_curriculum_pins sp where sp.version_id = ${curriculumVersions.id})` })
        .from(curriculumVersions)
        .innerJoin(programs, eq(programs.id, curriculumVersions.programId))
        .where(programId && z.uuid().safeParse(programId).success ? eq(curriculumVersions.programId, programId) : undefined)
        .orderBy(desc(curriculumVersions.regulationYear), desc(curriculumVersions.versionNo));
      return rows.map((r) => ({ ...r.version, programName: r.programName, subjectCount: r.subjects, pinnedStudents: r.pinned }));
    });
  }

  @Post('versions')
  @Auth('user', EDITORS)
  create(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(VersionBody)) b: z.infer<typeof VersionBody>) {
    return this.db.withTenant(p.tenantId, (tx) => createVersion(tx, p, b));
  }

  @Get('versions/:id')
  @Auth('user', READERS)
  one(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const v = found((await tx.select().from(curriculumVersions).where(eq(curriculumVersions.id, id)))[0], 'Version');
      return { ...v, content: await loadContent(tx, id) };
    });
  }

  @Put('versions/:id/content')
  @Auth('user', EDITORS)
  setContent(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(ContentSchema)) b: CurriculumContent) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const v = found((await tx.select().from(curriculumVersions).where(eq(curriculumVersions.id, id)))[0], 'Version');
      if (v.status !== 'draft') throw new ConflictException('Only a draft can be edited. Start a new revision from this version instead.');
      await saveContent(tx, p.tenantId, id, b);
      await auditUser(tx, p, 'curriculum.content_saved', 'curriculum_version', id, { subjects: b.subjects.length });
      return { ...v, content: await loadContent(tx, id) };
    });
  }

  @Post('versions/:id/approve')
  @HttpCode(200)
  @Auth('user', APPROVERS)
  approve(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(ApproveBody)) b: z.infer<typeof ApproveBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const v = found((await tx.select().from(curriculumVersions).where(eq(curriculumVersions.id, id)))[0], 'Version');
      if (v.status !== 'draft') throw new ConflictException('Only a draft can be approved');
      const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(curriculumSubjects).where(eq(curriculumSubjects.versionId, id));
      if (!n) throw new BadRequestException('Add at least one subject before approval');
      const [row] = await tx.update(curriculumVersions).set({ status: 'approved', bosRef: b.bosRef, approvedBy: p.userId, approvedAt: new Date() }).where(eq(curriculumVersions.id, id)).returning();
      await auditUser(tx, p, 'curriculum.version_approved', 'curriculum_version', id, { bosRef: b.bosRef });
      return row;
    });
  }

  /** Makes an approved version the live one for its regulation year (the previous one is archived) and pins new entrants to it. */
  @Post('versions/:id/activate')
  @HttpCode(200)
  @Auth('user', APPROVERS)
  activate(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(ActivateBody)) b: z.infer<typeof ActivateBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const v = found((await tx.select().from(curriculumVersions).where(eq(curriculumVersions.id, id)))[0], 'Version');
      if (v.status !== 'approved') throw new ConflictException('Only an approved version can be activated');
      await tx.update(curriculumVersions).set({ status: 'archived' }).where(and(eq(curriculumVersions.programId, v.programId), eq(curriculumVersions.regulationYear, v.regulationYear), eq(curriculumVersions.status, 'active')));
      const [row] = await tx.update(curriculumVersions).set({ status: 'active', activatedAt: new Date(), effectiveFrom: b.effectiveFrom ?? v.effectiveFrom ?? `${v.regulationYear}-06-01` }).where(eq(curriculumVersions.id, id)).returning();
      // New entrants: first-term students of this programme, in an academic year starting in or after the regulation year, with no version yet.
      const entrants = await tx
        .select({ id: students.id })
        .from(students)
        .innerJoin(sections, eq(sections.id, students.sectionId))
        .innerJoin(academicYears, eq(academicYears.id, sections.academicYearId))
        .where(and(eq(sections.programId, v.programId), eq(sections.term, 1), gte(academicYears.startsOn, `${v.regulationYear}-01-01`), sql`not exists (select 1 from student_curriculum_pins sp where sp.student_id = ${students.id})`));
      if (entrants.length) await tx.insert(studentCurriculumPins).values(entrants.map((s) => ({ tenantId: p.tenantId, studentId: s.id, versionId: id, pinnedBy: p.userId })));
      await auditUser(tx, p, 'curriculum.version_activated', 'curriculum_version', id, { pinned: entrants.length });
      return { ...row, pinnedNow: entrants.length };
    });
  }

  /** Pins every student of the chosen sections to a version (those already pinned keep theirs unless `replace`). */
  @Post('versions/:id/pin')
  @HttpCode(200)
  @Auth('user', APPROVERS)
  pin(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(PinBody)) b: z.infer<typeof PinBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const v = found((await tx.select().from(curriculumVersions).where(eq(curriculumVersions.id, id)))[0], 'Version');
      if (v.status !== 'active' && v.status !== 'approved') throw new ConflictException('Pin students to an approved or active version');
      const secs = await tx.select({ id: sections.id }).from(sections).where(and(inArray(sections.id, b.sectionIds), eq(sections.programId, v.programId)));
      if (secs.length !== new Set(b.sectionIds).size) throw new BadRequestException('Every section must belong to this version\'s programme');
      const kids = await tx.select({ id: students.id }).from(students).where(inArray(students.sectionId, b.sectionIds));
      if (!kids.length) return { pinned: 0 };
      const rows = kids.map((s) => ({ tenantId: p.tenantId, studentId: s.id, versionId: id, pinnedBy: p.userId }));
      const ins = b.replace
        ? await tx.insert(studentCurriculumPins).values(rows).onConflictDoUpdate({ target: [studentCurriculumPins.tenantId, studentCurriculumPins.studentId], set: { versionId: id, pinnedBy: p.userId, pinnedAt: new Date() } }).returning({ id: studentCurriculumPins.id })
        : await tx.insert(studentCurriculumPins).values(rows).onConflictDoNothing().returning({ id: studentCurriculumPins.id });
      await auditUser(tx, p, 'curriculum.students_pinned', 'curriculum_version', id, { pinned: ins.length, replace: b.replace });
      return { pinned: ins.length };
    });
  }

  /** The version one student follows, with its subjects. Staff, the student or a guardian. */
  @Get('students/:studentId')
  @Auth('user', ['student', 'guardian', ...READERS])
  forStudent(@CurrentPrincipal() p: UserPrincipal, @Param('studentId', ParseUUIDPipe) studentId: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await assertCanSeeStudent(tx, p, studentId, READERS);
      const [pin] = await tx.select().from(studentCurriculumPins).where(eq(studentCurriculumPins.studentId, studentId));
      if (!pin) return { pinned: false as const };
      const v = found((await tx.select().from(curriculumVersions).where(eq(curriculumVersions.id, pin.versionId)))[0], 'Version');
      return { pinned: true as const, pinnedAt: pin.pinnedAt, version: v, content: await loadContent(tx, v.id) };
    });
  }

  @Get('diff')
  @Auth('user', READERS)
  diff(@CurrentPrincipal() p: UserPrincipal, @Query('from', ParseUUIDPipe) from: string, @Query('to', ParseUUIDPipe) to: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [a, b] = await Promise.all([from, to].map(async (id) => found((await tx.select().from(curriculumVersions).where(eq(curriculumVersions.id, id)))[0], 'Version')));
      return { from: { id: a.id, label: a.label, status: a.status }, to: { id: b.id, label: b.label, status: b.status }, ...diffContent(await loadContent(tx, a.id), await loadContent(tx, b.id)) };
    });
  }

  // ---- AI syllabus importer ----

  /** Reads an uploaded syllabus (PDF or Word) and asks the AI to propose subjects, units, topics and outcomes. Nothing is saved as a version until someone reviews it. */
  @Post('imports')
  @Auth('user', EDITORS)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_FILE } }))
  async upload(@CurrentPrincipal() p: UserPrincipal, @UploadedFile() file: { buffer: Buffer; originalname: string } | undefined, @Body() raw: Record<string, unknown>) {
    const parsed = ImportFields.safeParse({ programId: Blank(raw?.programId), regulationYear: raw?.regulationYear });
    if (!parsed.success) throw new BadRequestException(z.flattenError(parsed.error));
    if (!file?.buffer?.length) throw new BadRequestException('Choose the syllabus file to upload');
    await this.scans.assertClean(file.buffer, 'This syllabus');
    let text: string;
    try {
      text = extractSyllabusText(file.buffer).text.trim();
    } catch (e) {
      if (e instanceof UnsupportedSyllabusFile) throw new BadRequestException(e.message);
      throw new BadRequestException('This file could not be read. Try exporting it again as PDF or Word.');
    }
    if (text.length < 20) throw new BadRequestException('No text was found in this file. Scanned pages need OCR first.');
    const prog = await this.db.withTenant(p.tenantId, async (tx) => found((await tx.select({ name: programs.name }).from(programs).where(eq(programs.id, parsed.data.programId)))[0], 'Programme'));
    const out = await this.ai.run({ tenantId: p.tenantId, userId: p.userId }, 'syllabusImport', { text: text.slice(0, 60_000), programName: prog.name, language: 'en' }, { fresh: true });
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [row] = await tx
        .insert(syllabusImports)
        .values({ tenantId: p.tenantId, programId: parsed.data.programId, regulationYear: parsed.data.regulationYear, fileName: file.originalname.slice(0, 200), extractedChars: text.length, preview: out.meta.preview, proposal: out.result, createdBy: p.userId })
        .returning();
      await auditUser(tx, p, 'curriculum.syllabus_uploaded', 'syllabus_import', row.id, { fileName: row.fileName, chars: text.length, preview: out.meta.preview });
      return row;
    });
  }

  @Get('imports')
  @Auth('user', EDITORS)
  imports(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, (tx) => tx.select().from(syllabusImports).orderBy(desc(syllabusImports.createdAt)).limit(50));
  }

  @Get('imports/:id')
  @Auth('user', EDITORS)
  oneImport(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => found((await tx.select().from(syllabusImports).where(eq(syllabusImports.id, id)))[0], 'Import'));
  }

  /** Turns a reviewed proposal (optionally edited) into a draft version. */
  @Post('imports/:id/draft')
  @Auth('user', EDITORS)
  makeDraft(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(ApplyBody)) b: z.infer<typeof ApplyBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const imp = found((await tx.select().from(syllabusImports).where(eq(syllabusImports.id, id)))[0], 'Import');
      if (imp.versionId) throw new ConflictException('A draft was already made from this import');
      const content = b.content ?? ContentSchema.parse(imp.proposal);
      if (!content.subjects.length) throw new BadRequestException('The proposal has no subjects. Edit it or upload a clearer file.');
      const v = await createVersion(tx, p, { programId: imp.programId, regulationYear: imp.regulationYear, label: b.label ?? `Imported from ${imp.fileName}`, source: 'import', content });
      await tx.update(syllabusImports).set({ status: 'drafted', versionId: v.id }).where(eq(syllabusImports.id, id));
      return v;
    });
  }
}
