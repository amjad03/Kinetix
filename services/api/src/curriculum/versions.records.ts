import { BadRequestException, Injectable, OnModuleInit } from '@nestjs/common';
import { asc, desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { programs } from '../db/schema.js';
import { curriculumEquivalences, curriculumVersions, regulations } from '../db/schema-curriculum.js';
import { qualified } from '../campus-life/kit-shared.js';
import { RecordRegistry, type FieldOption, type KitCtx, type RecordEntity } from '../records/entity.js';
import { choices, kitEntity, parseParams, rowOf } from '../research/kit.js';
import { activateVersion, approveVersion, APPROVERS, createVersion, EDITORS, READERS } from './curriculum.controller.js';

const STATUSES = ['draft', 'approved', 'active', 'archived'] as const;
const programOptions = async (ctx: KitCtx): Promise<FieldOption[]> => (await ctx.tx.select({ id: programs.id, name: programs.name }).from(programs).orderBy(asc(programs.name))).map((p) => ({ value: p.id, label: p.name }));
const regulationOptions = async (ctx: KitCtx): Promise<FieldOption[]> => (await ctx.tx.select({ id: regulations.id, name: regulations.name, year: regulations.year }).from(regulations).orderBy(desc(regulations.year))).map((r) => ({ value: r.id, label: `${r.name} (${r.year})` }));
const ApproveParams = z.object({ bosRef: z.string().trim().min(2, 'Give the Board of Studies reference').max(120), universityRef: z.string().trim().min(2).max(120).optional().or(z.literal('').transform(() => undefined)) });
const ActivateParams = z.object({ effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-06-01').optional().or(z.literal('').transform(() => undefined)) });
const ReviseParams = z.object({ label: z.string().trim().min(2, 'Name the revision').max(120) });

/**
 * Curriculum versions per programme and regulation year as a record kit list: a draft is added (or started as a revision
 * of another version), named and dated, approved by the Board of Studies and activated through actions; only a draft can
 * be deleted. The subjects, units and outcomes are edited on the version itself.
 */
@Injectable()
export class CurriculumRecords implements OnModuleInit {
  constructor(private readonly registry: RecordRegistry) {}

  onModuleInit(): void {
    this.registry.register(versionsEntity());
    this.registry.register(equivalencesEntity());
  }
}

export function versionsEntity(): RecordEntity {
  const e = kitEntity({
    key: 'curriculum-versions',
    module: 'curriculum',
    table: curriculumVersions,
    subjectType: 'curriculum_version',
    roles: { read: READERS, write: EDITORS },
    title: 'label',
    label: (r) => `${String(r.programName ?? '')} ${String(r.regulationYear ?? '')} v${String(r.versionNo ?? '')}: ${String(r.label ?? '')}`,
    fields: {
      programId: { label: 'Programme', kind: 'ref', column: curriculumVersions.programId, options: programOptions, required: true, edit: false, filter: true },
      regulationYear: { label: 'Regulation year', kind: 'number', column: curriculumVersions.regulationYear, required: true, int: true, min: 1990, max: 2100, edit: false, example: '2026' },
      label: { label: 'Name', kind: 'text', column: curriculumVersions.label, required: true, max: 120, example: 'NEP 2020 scheme' },
      regulationId: { label: 'Regulation', kind: 'ref', column: curriculumVersions.regulationId, options: regulationOptions, edit: false },
      effectiveFrom: { label: 'In force from', kind: 'date', column: curriculumVersions.effectiveFrom, create: false },
      status: { label: 'Status', kind: 'select', column: curriculumVersions.status, options: choices(STATUSES), create: false, edit: false },
    },
    extra: {
      versionNo: curriculumVersions.versionNo,
      programName: sql<string>`(select p.name from programs p where p.id = ${qualified('curriculum_versions', 'program_id')})`,
      bosRef: curriculumVersions.bosRef,
      universityRef: curriculumVersions.universityRef,
      source: curriculumVersions.source,
      subjectCount: sql<number>`(select count(*)::int from curriculum_subjects cs where cs.version_id = ${qualified('curriculum_versions', 'id')})`,
      pinnedStudents: sql<number>`(select count(*)::int from student_curriculum_pins sp where sp.version_id = ${qualified('curriculum_versions', 'id')})`,
    },
    sorts: { versionNo: curriculumVersions.versionNo },
    search: [curriculumVersions.label, curriculumVersions.bosRef],
    defaultSort: { id: 'regulationYear', dir: 'desc' },
    noImport: true,
    exportExtra: [
      { key: 'programName', header: 'Programme name' },
      { key: 'versionNo', header: 'Version' },
      { key: 'bosRef', header: 'Board of Studies reference' },
      { key: 'subjectCount', header: 'Subjects' },
      { key: 'pinnedStudents', header: 'Students following it' },
    ],
    remove: { guard: async (ctx, id) => ((await rowOf(ctx, curriculumVersions, id)).status === 'draft' ? null : 'Only a draft can be deleted; an approved version stays on record') },
    actions: {
      approve: {
        label: 'Approve (Board of Studies)',
        roles: APPROVERS,
        inputs: [
          { key: 'bosRef', label: 'Board of Studies reference', type: 'text', required: true },
          { key: 'universityRef', label: "University's adoption reference", type: 'text' },
        ],
        params: ApproveParams,
        apply: async (ctx, id, params) => void (await approveVersion(ctx.tx, ctx.p, id, parseParams(ApproveParams, params))),
      },
      activate: {
        label: 'Activate',
        roles: APPROVERS,
        inputs: [{ key: 'effectiveFrom', label: 'In force from', type: 'text', help: 'A date like 2026-06-01; empty for the regulation year' }],
        params: ActivateParams,
        apply: async (ctx, id, params) => `${(await activateVersion(ctx.tx, ctx.p, id, parseParams(ActivateParams, params))).pinnedNow} new students follow it`,
      },
      revise: {
        label: 'Start a revision',
        inputs: [{ key: 'label', label: 'Name', type: 'text', required: true }],
        params: ReviseParams,
        apply: async (ctx, id, params) => {
          const v = await rowOf(ctx, curriculumVersions, id);
          const row = await createVersion(ctx.tx, ctx.p, { programId: String(v.programId), regulationYear: Number(v.regulationYear), label: parseParams(ReviseParams, params).label, cloneFromId: id, regulationId: (v.regulationId as string | null) ?? undefined });
          return `Draft v${row.versionNo} started`;
        },
      },
    },
  });
  // A new version gets the next number for its programme and regulation year, and is audited, through the module.
  e.create = async (ctx, v) => (await createVersion(ctx.tx, ctx.p, { programId: String(v.programId), regulationYear: Number(v.regulationYear), label: String(v.label), regulationId: (v.regulationId as string | null) ?? undefined })).id;
  return e;
}

const versionOptions = async (ctx: KitCtx): Promise<FieldOption[]> =>
  (await ctx.tx.select({ id: curriculumVersions.id, label: curriculumVersions.label, year: curriculumVersions.regulationYear, no: curriculumVersions.versionNo, program: programs.name }).from(curriculumVersions).innerJoin(programs, eq(programs.id, curriculumVersions.programId)).orderBy(asc(programs.name), desc(curriculumVersions.regulationYear), desc(curriculumVersions.versionNo))).map((v) => ({ value: v.id, label: `${v.year} v${v.no}: ${v.label}`, group: v.program }));
const versionByLabel = async (ctx: KitCtx, text: string) => (await ctx.tx.select({ id: curriculumVersions.id }).from(curriculumVersions).where(sql`lower(${curriculumVersions.label}) = ${text.toLowerCase()}`).limit(1))[0]?.id ?? null;

/**
 * Equivalences between two curriculum versions: a subject of the old version (by code) counted as a subject of the new
 * one, for students who rejoin or move to the version in force. Kept by the academic office; imported from Excel.
 */
export function equivalencesEntity(): RecordEntity {
  const e = kitEntity({
    key: 'curriculum-equivalences',
    module: 'curriculum',
    table: curriculumEquivalences,
    subjectType: 'curriculum_equivalence',
    roles: { read: READERS, write: EDITORS },
    title: 'fromCode',
    label: (r) => `${String(r.fromCode)} = ${String(r.toCode)}`,
    fields: {
      fromVersionId: { label: 'Old version', kind: 'ref', column: curriculumEquivalences.fromVersionId, options: versionOptions, required: true, filter: true, lookup: versionByLabel, bulk: true },
      fromCode: { label: 'Old subject code', kind: 'text', column: curriculumEquivalences.fromCode, required: true, max: 40, example: 'BC101' },
      toVersionId: { label: 'New version', kind: 'ref', column: curriculumEquivalences.toVersionId, options: versionOptions, required: true, filter: true, lookup: versionByLabel, bulk: true },
      toCode: { label: 'New subject code', kind: 'text', column: curriculumEquivalences.toCode, required: true, max: 40, example: 'BCN101' },
      note: { label: 'Note', kind: 'text', column: curriculumEquivalences.note, max: 300 },
    },
    extra: {
      fromVersion: sql<string | null>`(select cv.regulation_year || ' v' || cv.version_no || ': ' || cv.label from curriculum_versions cv where cv.id = ${qualified('curriculum_equivalences', 'from_version_id')})`,
      toVersion: sql<string | null>`(select cv.regulation_year || ' v' || cv.version_no || ': ' || cv.label from curriculum_versions cv where cv.id = ${qualified('curriculum_equivalences', 'to_version_id')})`,
      fromName: sql<string | null>`(select cs.name from curriculum_subjects cs where cs.version_id = ${qualified('curriculum_equivalences', 'from_version_id')} and cs.code = ${qualified('curriculum_equivalences', 'from_code')})`,
      toName: sql<string | null>`(select cs.name from curriculum_subjects cs where cs.version_id = ${qualified('curriculum_equivalences', 'to_version_id')} and cs.code = ${qualified('curriculum_equivalences', 'to_code')})`,
    },
    search: [curriculumEquivalences.fromCode, curriculumEquivalences.toCode, curriculumEquivalences.note],
    defaultSort: { id: 'fromCode', dir: 'asc' },
    importKey: ['fromVersionId', 'fromCode', 'toVersionId', 'toCode'],
    exportExtra: [
      { key: 'fromName', header: 'Old subject' },
      { key: 'toName', header: 'New subject' },
    ],
  });
  e.fields!.note.schema = e.fields!.note.schema.transform((v: unknown) => (v ?? '') as string);
  e.check = async (ctx, id) => {
    const r = await rowOf(ctx, curriculumEquivalences, id);
    if (r.fromVersionId === r.toVersionId) throw new BadRequestException('Choose two different versions');
    const has = async (versionId: unknown, code: unknown) => (await ctx.tx.execute<{ n: number }>(sql`select count(*)::int as n from curriculum_subjects where version_id = ${String(versionId)}::uuid and code = ${String(code)}`)).rows[0].n > 0;
    if (!(await has(r.fromVersionId, r.fromCode))) throw new BadRequestException(`The old version has no subject ${String(r.fromCode)}`);
    if (!(await has(r.toVersionId, r.toCode))) throw new BadRequestException(`The new version has no subject ${String(r.toCode)}`);
  };
  return e;
}
