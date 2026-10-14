import { Injectable, OnModuleInit } from '@nestjs/common';
import { asc, eq, sql } from 'drizzle-orm';
import type { RoleName } from '../auth/principal.js';
import { academicYears, improvementActions, programs } from '../db/schema.js';
import { qualitySettings } from '../quality-hub/settings.catalogue.js';
import { RecordRegistry, type FieldOption, type KitCtx } from '../records/entity.js';
import { choices, kitEntity, rowOf } from '../research/kit.js';

const MANAGE: RoleName[] = ['tenant_admin', 'principal', 'quality_officer', 'hod'];

const programOptions = async (ctx: KitCtx): Promise<FieldOption[]> => (await ctx.tx.select({ id: programs.id, name: programs.name }).from(programs).orderBy(asc(programs.name))).map((p) => ({ value: p.id, label: p.name }));
const yearOptions = async (ctx: KitCtx): Promise<FieldOption[]> => (await ctx.tx.select({ id: academicYears.id, label: academicYears.label }).from(academicYears).orderBy(sql`${academicYears.startsOn} desc`)).map((y) => ({ value: y.id, label: y.label }));

/**
 * OBE improvement actions (the CQI loop) as a record kit list across programmes: owner, due date and status in bulk,
 * the root cause, the figure before, the target and the re-measurement for the next offering. Actions are opened from
 * attainment gaps (OBE quality page or "from gaps"), so the list has no Add.
 */
export function obeActionsEntity() {
  return kitEntity({
    key: 'obe-actions',
    module: 'obe',
    table: improvementActions,
    subjectType: 'improvement_action',
    roles: { read: MANAGE, write: MANAGE },
    title: 'title',
    fields: {
      title: { label: 'Action', kind: 'text', column: improvementActions.title, required: true, max: 200, create: false, noImport: true },
      detail: { label: 'Detail', kind: 'textarea', column: improvementActions.detail, max: 2000, create: false },
      ownerId: { label: 'Owner', kind: 'user', column: improvementActions.ownerId, bulk: true, create: false, filter: true },
      dueOn: { label: 'Due on', kind: 'date', column: improvementActions.dueOn, bulk: true, create: false },
      status: { label: 'Status', kind: 'select', column: improvementActions.status, options: choices(['open', 'in_progress', 'done']), bulk: true, create: false },
      rootCause: { label: 'Root cause', kind: 'textarea', column: improvementActions.rootCause, max: 2000, create: false },
      baselineValue: { label: 'Attainment before', kind: 'number', column: improvementActions.baselineValue, min: 0, max: 100, create: false },
      targetValue: { label: 'Target', kind: 'number', column: improvementActions.targetValue, min: 0, max: 100, create: false },
      remeasureOn: { label: 'Re-measure on', kind: 'date', column: improvementActions.remeasureOn, create: false },
      remeasuredValue: { label: 'Attainment after', kind: 'number', column: improvementActions.remeasuredValue, min: 0, max: 100, create: false },
      remeasureNote: { label: 'Re-measurement note', kind: 'textarea', column: improvementActions.remeasureNote, max: 2000, create: false },
      programId: { label: 'Programme', kind: 'ref', column: improvementActions.programId, options: programOptions, create: false, edit: false, filter: true, noImport: true },
      academicYearId: { label: 'Year of the gap', kind: 'ref', column: improvementActions.academicYearId, options: yearOptions, create: false, edit: false, filter: true, noImport: true },
    },
    extra: {
      code: improvementActions.code,
      scope: improvementActions.scope,
      program: sql<string>`(select p.name from programs p where p.id = ${improvementActions.programId})`,
      year: sql<string | null>`(select y.label from academic_years y where y.id = ${improvementActions.academicYearId})`,
      closed: sql<boolean>`${improvementActions.remeasuredValue} is not null and ${improvementActions.targetValue} is not null and ${improvementActions.remeasuredValue} >= ${improvementActions.targetValue}`,
    },
    filters: { overdue: { label: 'Overdue', options: choices(['yes']), where: (v) => (v === 'yes' ? sql`${improvementActions.status} <> 'done' and ${improvementActions.dueOn} < current_date` : undefined) } },
    search: [improvementActions.title, improvementActions.code, improvementActions.detail, improvementActions.rootCause],
    defaultSort: { id: 'dueOn', dir: 'asc' },
    noImport: true,
    validate: async (ctx, id) => {
      const r = await rowOf(ctx, improvementActions, id);
      if (r.status === 'done' && (await qualitySettings(ctx.tx, ctx.p.tenantId, 'obe')).rules.requireRootCause && !String(r.rootCause ?? '').trim()) return 'Record the root cause before closing this action';
      if (r.remeasuredValue !== null && r.remeasuredValue !== undefined && !r.remeasuredAt) await ctx.tx.update(improvementActions).set({ remeasuredAt: new Date() }).where(eq(improvementActions.id, id));
      const done = r.status === 'done';
      if (done !== !!r.closedAt) await ctx.tx.update(improvementActions).set({ closedAt: done ? new Date() : null }).where(eq(improvementActions.id, id));
      return null;
    },
  });
}

@Injectable()
export class ObeRecords implements OnModuleInit {
  constructor(private readonly registry: RecordRegistry) {}

  onModuleInit(): void {
    this.registry.register(obeActionsEntity());
  }
}
