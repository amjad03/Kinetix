import { BadRequestException, Body, ConflictException, Controller, Delete, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { Auth, CurrentPrincipal, STAFF_ADMIN_ROLES } from '../auth/auth.decorators.js';
import type { UserPrincipal } from '../auth/principal.js';
import { auditUser } from '../common/audit.js';
import { Clock } from '../common/time.js';
import { tenantToday } from '../common/today.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService, type Tx } from '../db/db.service.js';
import { attendanceOverrides, campusSettings, feeStructures, schoolBoards } from '../db/schema-g1.js';
import { campuses, feeInvoices, institutionProfiles, programs, sections, students } from '../db/schema.js';
import { addDays } from '../teacher/teacher.service.js';
import { invalidateModuleGate } from './module-gate.interceptor.js';
import { GOVERNANCE_MODELS, GOVERNANCE_RULES, INSTITUTION_TYPES, PRESETS, presetByKey, STRUCTURE_MODELS, type GovernanceModel } from './presets.js';
import { TOGGLE_MODULES } from './institution.controller.js';

const opt = (max: number) => z.string().trim().max(max).nullable().optional();
const TermKey = z.string().regex(/^[a-z][a-zA-Z0-9.]{1,60}$/);
const SetupBody = z.object({
  institutionType: z.enum(INSTITUTION_TYPES).nullable().optional(),
  structureModel: z.enum(STRUCTURE_MODELS).nullable().optional(),
  governanceModel: z.enum(GOVERNANCE_MODELS).nullable().optional(),
  feeModel: opt(60),
  qualityFramework: opt(60),
  languages: z.array(z.enum(['en', 'hi', 'kn'])).min(1).max(3).optional(),
  aiPolicy: z
    .object({
      enabled: z.boolean().optional(),
      allowStudentFacing: z.boolean().optional(),
      requireTeacherReview: z.boolean().optional(),
      allowedTasks: z.array(z.string().max(40)).max(30).optional(),
    })
    .optional(),
  privacySettings: z
    .object({
      parentSeesMarks: z.boolean().optional(),
      showStudentPhotos: z.boolean().optional(),
      shareRollWithClass: z.boolean().optional(),
      retainAnalyticsDays: z.number().int().min(30).max(3650).optional(),
    })
    .optional(),
  commsChannels: z.object({ push: z.boolean().optional(), sms: z.boolean().optional(), email: z.boolean().optional(), whatsapp: z.boolean().optional() }).optional(),
  terminology: z.record(TermKey, z.string().trim().min(1).max(60)).refine((o) => Object.keys(o).length <= 40, 'At most 40 terms').optional(),
});
const BoardBody = z.object({
  code: z.string().trim().min(2).max(30),
  name: z.string().trim().min(2).max(160),
  kind: z.enum(['central', 'state', 'international', 'university']).default('central'),
  region: z.string().trim().max(80).optional(),
  medium: z.string().trim().max(60).optional(),
  gradingScheme: z.enum(['marks', 'grades', 'cgpa']).optional(),
  passRules: z
    .object({
      subjectPassPct: z.number().min(0).max(100).optional(),
      aggregatePassPct: z.number().min(0).max(100).optional(),
      graceMarks: z.number().int().min(0).max(20).optional(),
      maxCompartmentSubjects: z.number().int().min(0).max(5).optional(),
      practicalSeparate: z.boolean().optional(),
    })
    .optional(),
});
const OverrideBody = z.object({ thresholdPct: z.number().int().min(1).max(100), lockHours: z.number().int().min(1).max(720).nullable().optional(), note: z.string().trim().max(200).optional() });
const CampusBody = z.object({ feeModel: opt(60), gradingPolicy: opt(60), settings: z.record(z.string().max(40), z.union([z.string().max(200), z.number(), z.boolean()])).optional() });
const FeeStructureBody = z.object({
  name: z.string().trim().min(2).max(120),
  campusId: z.uuid().nullable().optional(),
  programId: z.uuid().nullable().optional(),
  items: z.array(z.object({ head: z.string().trim().min(1).max(80), amountPaise: z.number().int().min(100).max(100_000_000) })).min(1).max(20),
  dueInDays: z.number().int().min(1).max(365).optional(),
});

async function profile(tx: Tx) {
  const [row] = await tx.select().from(institutionProfiles);
  return row ?? null;
}

/** The institution capability engine: type, structure model, boards, presets, policies, terminology, per-programme attendance and per-campus fees. */
@Controller('v1/admin/institution')
export class InstitutionSetupController {
  constructor(
    private readonly db: DbService,
    private readonly clock: Clock,
  ) {}

  @Get('setup')
  @Auth('user', STAFF_ADMIN_ROLES)
  setup(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const r = await profile(tx);
      const boards = await tx.select().from(schoolBoards).orderBy(asc(schoolBoards.code));
      const gov = (r?.governanceModel ?? null) as GovernanceModel | null;
      return {
        institutionType: r?.institutionType ?? null,
        structureModel: r?.structureModel ?? null,
        governanceModel: gov,
        governanceRules: gov ? GOVERNANCE_RULES[gov] : null,
        feeModel: r?.feeModel ?? null,
        qualityFramework: r?.qualityFramework ?? null,
        languages: r?.languages ?? ['en'],
        aiPolicy: r?.aiPolicy ?? {},
        privacySettings: r?.privacySettings ?? {},
        commsChannels: r?.commsChannels ?? {},
        terminology: r?.terminology ?? {},
        presetKey: r?.presetKey ?? null,
        disabledModules: r?.disabledModules ?? [],
        boards,
        options: { institutionTypes: [...INSTITUTION_TYPES], structureModels: [...STRUCTURE_MODELS], governanceModels: [...GOVERNANCE_MODELS], modules: [...TOGGLE_MODULES] },
      };
    });
  }

  @Put('setup')
  @Auth('user', STAFF_ADMIN_ROLES)
  saveSetup(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(SetupBody)) b: z.infer<typeof SetupBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [row] = await tx.insert(institutionProfiles).values({ tenantId: p.tenantId, ...b, updatedAt: new Date() }).onConflictDoUpdate({ target: institutionProfiles.tenantId, set: { ...b, updatedAt: new Date() } }).returning();
      await auditUser(tx, p, 'institution.setup.updated', 'tenant', p.tenantId, { changed: Object.keys(b) });
      return { ok: true, updatedAt: row.updatedAt };
    });
  }

  // ---- presets (Appendix B) ---------------------------------------------------------------------------------------------------

  @Get('presets')
  @Auth('user', STAFF_ADMIN_ROLES)
  presets() {
    return PRESETS;
  }

  /** Loads a sample configuration: type, structure model, board, quality framework and which modules are off. */
  @Post('presets/:key/apply')
  @Auth('user', STAFF_ADMIN_ROLES)
  @HttpCode(200)
  applyPreset(@CurrentPrincipal() p: UserPrincipal, @Param('key') key: string) {
    const preset = presetByKey(key);
    if (!preset) throw new NotFoundException('That configuration does not exist');
    return this.db.withTenant(p.tenantId, async (tx) => {
      const values = {
        institutionType: preset.institutionType,
        structureModel: preset.structureModel,
        academicModel: preset.academicModel,
        governanceModel: preset.governanceModel,
        qualityFramework: preset.qualityFramework,
        feeModel: preset.feeModel,
        disabledModules: [...preset.disabledModules],
        boardOrUniversity: preset.board?.name ?? null,
        presetKey: preset.key,
        updatedAt: new Date(),
      };
      await tx.insert(institutionProfiles).values({ tenantId: p.tenantId, ...values }).onConflictDoUpdate({ target: institutionProfiles.tenantId, set: values });
      if (preset.board) {
        await tx.update(schoolBoards).set({ isPrimary: false }).where(eq(schoolBoards.isPrimary, true));
        await tx
          .insert(schoolBoards)
          .values({ tenantId: p.tenantId, ...preset.board, isPrimary: true })
          .onConflictDoUpdate({ target: [schoolBoards.tenantId, schoolBoards.code], set: { isPrimary: true } });
      }
      invalidateModuleGate(p.tenantId);
      await auditUser(tx, p, 'institution.preset.applied', 'tenant', p.tenantId, { preset: preset.key });
      return { applied: preset.key, disabledModules: preset.disabledModules };
    });
  }

  // ---- boards --------------------------------------------------------------------------------------------------------------------

  @Get('boards')
  @Auth('user', STAFF_ADMIN_ROLES)
  boards(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, (tx) => tx.select().from(schoolBoards).orderBy(asc(schoolBoards.code)));
  }

  @Post('boards')
  @Auth('user', STAFF_ADMIN_ROLES)
  addBoard(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(BoardBody)) b: z.infer<typeof BoardBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [dup] = await tx.select({ id: schoolBoards.id }).from(schoolBoards).where(eq(schoolBoards.code, b.code));
      if (dup) throw new ConflictException('A board with that code already exists');
      const [any] = await tx.select({ id: schoolBoards.id }).from(schoolBoards).limit(1);
      const [row] = await tx.insert(schoolBoards).values({ tenantId: p.tenantId, ...b, passRules: b.passRules ?? {}, isPrimary: !any }).returning();
      await auditUser(tx, p, 'institution.board.added', 'school_board', row.id, { code: b.code });
      return row;
    });
  }

  @Put('boards/:id')
  @Auth('user', STAFF_ADMIN_ROLES)
  async saveBoard(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(BoardBody.partial())) b: Partial<z.infer<typeof BoardBody>>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [row] = await tx.update(schoolBoards).set(b).where(eq(schoolBoards.id, id)).returning();
      if (!row) throw new NotFoundException('Board not found');
      await auditUser(tx, p, 'institution.board.updated', 'school_board', id, { changed: Object.keys(b) });
      return row;
    });
  }

  @Post('boards/:id/primary')
  @Auth('user', STAFF_ADMIN_ROLES)
  @HttpCode(200)
  async primary(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [b] = await tx.select().from(schoolBoards).where(eq(schoolBoards.id, id));
      if (!b) throw new NotFoundException('Board not found');
      await tx.update(schoolBoards).set({ isPrimary: false }).where(eq(schoolBoards.isPrimary, true));
      await tx.update(schoolBoards).set({ isPrimary: true }).where(eq(schoolBoards.id, id));
      await tx.update(institutionProfiles).set({ boardOrUniversity: b.name, updatedAt: new Date() }).where(eq(institutionProfiles.tenantId, p.tenantId));
      await auditUser(tx, p, 'institution.board.primary', 'school_board', id, { code: b.code });
      return { primary: b.code };
    });
  }

  // ---- attendance per programme ---------------------------------------------------------------------------------------------

  @Get('attendance-overrides')
  @Auth('user', STAFF_ADMIN_ROLES)
  overrides(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const progs = await tx.select({ id: programs.id, name: programs.name }).from(programs).orderBy(asc(programs.name));
      const rows = await tx.select().from(attendanceOverrides);
      return progs.map((g) => {
        const o = rows.find((r) => r.programId === g.id);
        return { programId: g.id, programName: g.name, thresholdPct: o?.thresholdPct ?? null, lockHours: o?.lockHours ?? null, note: o?.note ?? '' };
      });
    });
  }

  @Put('attendance-overrides/:programId')
  @Auth('user', STAFF_ADMIN_ROLES)
  saveOverride(@CurrentPrincipal() p: UserPrincipal, @Param('programId', ParseUUIDPipe) programId: string, @Body(new ZodBody(OverrideBody)) b: z.infer<typeof OverrideBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [g] = await tx.select({ id: programs.id }).from(programs).where(eq(programs.id, programId));
      if (!g) throw new NotFoundException('Programme not found');
      const values = { thresholdPct: b.thresholdPct, lockHours: b.lockHours ?? null, note: b.note ?? '', updatedAt: new Date() };
      await tx.insert(attendanceOverrides).values({ tenantId: p.tenantId, programId, ...values }).onConflictDoUpdate({ target: [attendanceOverrides.tenantId, attendanceOverrides.programId], set: values });
      await auditUser(tx, p, 'institution.attendance.override', 'program', programId, values);
      return { programId, ...values };
    });
  }

  @Delete('attendance-overrides/:programId')
  @Auth('user', STAFF_ADMIN_ROLES)
  @HttpCode(200)
  clearOverride(@CurrentPrincipal() p: UserPrincipal, @Param('programId', ParseUUIDPipe) programId: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await tx.delete(attendanceOverrides).where(eq(attendanceOverrides.programId, programId));
      await auditUser(tx, p, 'institution.attendance.override.cleared', 'program', programId);
      return { ok: true };
    });
  }

  // ---- campuses and campus fee structures ---------------------------------------------------------------------------------

  @Get('campus-settings')
  @Auth('user', STAFF_ADMIN_ROLES)
  campusRows(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const camps = await tx.select({ id: campuses.id, name: campuses.name }).from(campuses).orderBy(asc(campuses.name));
      const rows = await tx.select().from(campusSettings);
      return camps.map((c) => {
        const r = rows.find((x) => x.campusId === c.id);
        return { campusId: c.id, campusName: c.name, feeModel: r?.feeModel ?? null, gradingPolicy: r?.gradingPolicy ?? null, settings: r?.settings ?? {} };
      });
    });
  }

  @Put('campus-settings/:campusId')
  @Auth('user', STAFF_ADMIN_ROLES)
  saveCampus(@CurrentPrincipal() p: UserPrincipal, @Param('campusId', ParseUUIDPipe) campusId: string, @Body(new ZodBody(CampusBody)) b: z.infer<typeof CampusBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [c] = await tx.select({ id: campuses.id }).from(campuses).where(eq(campuses.id, campusId));
      if (!c) throw new NotFoundException('Campus not found');
      const values = { feeModel: b.feeModel ?? null, gradingPolicy: b.gradingPolicy ?? null, settings: b.settings ?? {}, updatedAt: new Date() };
      await tx.insert(campusSettings).values({ tenantId: p.tenantId, campusId, ...values }).onConflictDoUpdate({ target: [campusSettings.tenantId, campusSettings.campusId], set: values });
      await auditUser(tx, p, 'institution.campus.settings', 'campus', campusId, { changed: Object.keys(b) });
      return { campusId, ...values };
    });
  }

  @Get('fee-structures')
  @Auth('user', [...STAFF_ADMIN_ROLES, 'accountant'])
  async feeStructures(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const rows = await tx.select().from(feeStructures).orderBy(asc(feeStructures.name));
      const camps = new Map((await tx.select({ id: campuses.id, name: campuses.name }).from(campuses)).map((c) => [c.id, c.name]));
      const progs = new Map((await tx.select({ id: programs.id, name: programs.name }).from(programs)).map((g) => [g.id, g.name]));
      return rows.map((r) => ({ ...r, campusName: r.campusId ? (camps.get(r.campusId) ?? null) : null, programName: r.programId ? (progs.get(r.programId) ?? null) : null, totalPaise: r.items.reduce((s, i) => s + i.amountPaise, 0) }));
    });
  }

  @Post('fee-structures')
  @Auth('user', [...STAFF_ADMIN_ROLES, 'accountant'])
  addFeeStructure(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(FeeStructureBody)) b: z.infer<typeof FeeStructureBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [row] = await tx.insert(feeStructures).values({ tenantId: p.tenantId, name: b.name, campusId: b.campusId ?? null, programId: b.programId ?? null, items: b.items, dueInDays: b.dueInDays ?? 30, createdBy: p.userId }).returning();
      await auditUser(tx, p, 'fees.structure.created', 'fee_structure', row.id, { name: b.name });
      return row;
    });
  }

  /** Issues the plan as one invoice per active student of the campus and programme it covers. Running it twice for the same plan and year issues nothing new. */
  @Post('fee-structures/:id/issue')
  @Auth('user', [...STAFF_ADMIN_ROLES, 'accountant'])
  @HttpCode(200)
  issueFeeStructure(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [fs] = await tx.select().from(feeStructures).where(eq(feeStructures.id, id));
      if (!fs) throw new NotFoundException('Fee plan not found');
      if (!fs.active) throw new BadRequestException('This fee plan is switched off');
      const cond = [inArray(students.status, ['active', 'enrolled'])];
      if (fs.programId) cond.push(eq(sections.programId, fs.programId));
      if (fs.campusId) cond.push(eq(programs.campusId, fs.campusId));
      const targets = await tx
        .select({ studentId: students.id, sectionId: students.sectionId })
        .from(students)
        .innerJoin(sections, eq(sections.id, students.sectionId))
        .innerJoin(programs, eq(programs.id, sections.programId))
        .where(and(...cond));
      if (targets.length === 0) throw new BadRequestException('No active students match this fee plan');
      const title = fs.name;
      const have = new Set((await tx.select({ studentId: feeInvoices.studentId }).from(feeInvoices).where(and(eq(feeInvoices.title, title), sql`${feeInvoices.status} <> 'cancelled'`))).map((r) => r.studentId));
      const fresh = targets.filter((t) => !have.has(t.studentId));
      const total = fs.items.reduce((s, i) => s + i.amountPaise, 0);
      const dueOn = addDays(await tenantToday(tx, this.clock), fs.dueInDays);
      const batchId = randomUUID();
      if (fresh.length) await tx.insert(feeInvoices).values(fresh.map((t) => ({ tenantId: p.tenantId, studentId: t.studentId, sectionId: t.sectionId, batchId, title, amountPaise: total, dueOn, createdBy: p.userId })));
      await auditUser(tx, p, 'fees.structure.issued', 'fee_structure', id, { issued: fresh.length, skipped: targets.length - fresh.length });
      return { issued: fresh.length, skipped: targets.length - fresh.length, amountPaise: total };
    });
  }
}
