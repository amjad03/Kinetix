import { Injectable, OnModuleInit } from '@nestjs/common';
import { asc, desc, sql } from 'drizzle-orm';
import { z } from 'zod';
import { programs } from '../db/schema.js';
import { curriculumVersions, regulations } from '../db/schema-curriculum.js';
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

