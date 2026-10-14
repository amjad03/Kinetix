import { BadRequestException, Injectable, OnModuleInit } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { businessRules, documentRetentionPolicies, incidents } from '../db/schema.js';
import { qualified } from '../campus-life/kit-shared.js';
import { RecordRegistry, type CustomAction, type KitCtx, type RecordEntity } from '../records/entity.js';
import { choices, kitEntity, parseParams, rowOf } from '../research/kit.js';
import { GOVERNANCE_ROLES } from './governance.controller.js';
import { INCIDENT_CATEGORIES, INCIDENT_SEVERITIES, RULE_DOMAINS, type IncidentStatus, type RuleDomain } from './governance.logic.js';
import { GovernanceService } from './governance.service.js';

const RULE_STATUSES = ['draft', 'in_review', 'approved', 'retired'] as const;
const INCIDENT_STATUSES = ['open', 'investigating', 'mitigated', 'resolved', 'closed'] as const;
const today = () => new Date().toISOString().slice(0, 10);
const Note = z.object({ note: z.string().trim().min(2, 'Write a note').max(2000) });
const OptionalNote = z.object({ note: z.string().trim().max(2000).optional() });

/** Rule parameters as JSON text: an object, or empty for none. */
const ParamsText = z
  .union([z.string(), z.null()])
  .transform((v, ctx) => {
    const text = (v ?? '').trim();
    if (!text) return {};
    try {
      const parsed: unknown = JSON.parse(text);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
    } catch {
      /* reported below */
    }
    ctx.addIssue({ code: 'custom', message: 'Write the parameters as a JSON object, for example {"passMark": 40}' });
    return z.NEVER;
  });

/**
 * Governance registers as record kit lists (docs/requirements/RECORD_DEPTH_KIT.md): business rule versions (drafts are
 * edited; review, four-eyes approval, retirement and a new version are actions), the incident register (reported
 * through the kit's Add with its tasks and breach clock; status moves and notes are actions) and file retention
 * policies per category.
 */
@Injectable()
export class GovernanceRecords implements OnModuleInit {
  constructor(
    private readonly registry: RecordRegistry,
    private readonly gov: GovernanceService,
  ) {}

  onModuleInit(): void {
    this.registry.register(this.rules());
    this.registry.register(this.incidents());
    this.registry.register(this.retention());
  }

  private rules(): RecordEntity {
    const gov = this.gov;
    const move = (to: 'draft' | 'in_review' | 'retired', label: string, tone?: 'danger'): CustomAction => ({ label, tone, apply: async (ctx, id) => void (await gov.moveRule(ctx.tx, ctx.p, id, to)) });
    const e = kitEntity({
      key: 'business-rules',
      module: 'governance',
      table: businessRules,
      subjectType: 'business_rule',
      roles: { read: GOVERNANCE_ROLES, write: GOVERNANCE_ROLES },
      title: 'title',
      label: (r) => `${String(r.domain)}/${String(r.key)} v${String(r.version)}`,
      fields: {
        domain: { label: 'Domain', kind: 'select', column: businessRules.domain, options: choices(RULE_DOMAINS), required: true, edit: false, example: 'grading' },
        key: { label: 'Key', kind: 'text', column: businessRules.key, required: true, max: 60, edit: false, help: 'Lower-case letters, digits, dots, dashes or underscores, for example pass_mark', example: 'pass_mark' },
        title: { label: 'Title', kind: 'text', column: businessRules.title, required: true, max: 200, example: 'Pass mark for theory papers' },
        description: { label: 'Description', kind: 'textarea', column: businessRules.description, max: 2000 },
        effectiveFrom: { label: 'In force from', kind: 'date', column: businessRules.effectiveFrom, required: true, example: '2026-06-01' },
      },
      extra: {
        version: businessRules.version,
        status: businessRules.status,
        effectiveTo: businessRules.effectiveTo,
        authorId: businessRules.authorId,
        params: sql<string>`${businessRules.params}::text`,
        authorName: sql<string | null>`(select u.full_name from users u where u.id = ${qualified('business_rules', 'author_id')})`,
        approverName: sql<string | null>`(select u.full_name from users u where u.id = ${qualified('business_rules', 'approver_id')})`,
        inForce: sql<boolean>`${businessRules.status} = 'approved' and ${businessRules.effectiveFrom} <= current_date and (${businessRules.effectiveTo} is null or ${businessRules.effectiveTo} >= current_date)`,
      },
      filters: {
        status: { label: 'Status', options: choices(RULE_STATUSES), where: (v) => ((RULE_STATUSES as readonly string[]).includes(v) ? eq(businessRules.status, v) : undefined) },
        inForce: { label: 'In force today', options: choices(['yes']), where: (v) => (v === 'yes' ? sql`${businessRules.status} = 'approved' and ${businessRules.effectiveFrom} <= current_date and (${businessRules.effectiveTo} is null or ${businessRules.effectiveTo} >= current_date)` : undefined) },
      },
      sorts: { version: businessRules.version, status: businessRules.status },
      search: [businessRules.title, businessRules.key, businessRules.description],
      defaultSort: { id: 'domain', dir: 'asc' },
      importKey: ['domain', 'key'],
      noImport: true,
      exportExtra: [
        { key: 'version', header: 'Version' },
        { key: 'status', header: 'Status' },
        { key: 'effectiveTo', header: 'In force until' },
        { key: 'params', header: 'Parameters' },
        { key: 'authorName', header: 'Written by' },
        { key: 'approverName', header: 'Approved by' },
      ],
      remove: {
        guard: async (ctx, id) => ((await rowOf(ctx, businessRules, id)).status === 'draft' ? null : 'A rule that went for review stays on record; retire it instead'),
      },
      validate: async (ctx, id) => ((await rowOf(ctx, businessRules, id)).status === 'draft' ? null : 'Only a draft can be edited; start a new version instead'),
      actions: {
        review: move('in_review', 'Send for review'),
        back: move('draft', 'Back to draft'),
        approve: { label: 'Approve', apply: async (ctx, id) => void (await gov.approveRule(ctx.tx, ctx.p, id)) },
        retire: move('retired', 'Retire', 'danger'),
        newVersion: {
          label: 'New version',
          apply: async (ctx, id) => {
            const r = await rowOf(ctx, businessRules, id);
            const row = await gov.draftRule(ctx.tx, ctx.p, { domain: r.domain as RuleDomain, key: String(r.key), title: String(r.title), description: String(r.description ?? ''), params: (r.params ?? {}) as Record<string, unknown>, effectiveFrom: today() > String(r.effective_from ?? r.effectiveFrom) ? today() : String(r.effective_from ?? r.effectiveFrom) });
            return `Draft v${row.version} started`;
          },
        },
      },
    });
    // The parameters are JSON, edited as text; a new rule is drafted through the governance service (version, author, audit).
    e.fields!.params = { label: 'Parameters (JSON)', type: 'textarea', schema: ParamsText, help: 'A JSON object, for example {"passMark": 40}', apply: async (ctx, id, v) => void (await ctx.tx.update(businessRules).set({ params: v as Record<string, unknown> }).where(eq(businessRules.id, id))) };
    e.create = async (ctx, v) => {
      const domain = String(v.domain);
      if (!(RULE_DOMAINS as readonly string[]).includes(domain)) throw new BadRequestException('Choose one of the listed domains');
      const key = String(v.key ?? '').trim();
      if (!/^[a-z0-9_.-]{2,60}$/.test(key)) throw new BadRequestException('Use lower-case letters, digits, dots, dashes or underscores for the key');
      const row = await gov.draftRule(ctx.tx, ctx.p, { domain: domain as RuleDomain, key, title: String(v.title), description: String(v.description ?? ''), params: (v.params ?? {}) as Record<string, unknown>, effectiveFrom: String(v.effectiveFrom) });
      return row.id;
    };
    return e;
  }

  private incidents(): RecordEntity {
    const gov = this.gov;
    const to = (status: IncidentStatus, label: string, needsNote: boolean): CustomAction => ({
      label,
      inputs: [{ key: 'note', label: 'Note', type: 'textarea', required: needsNote }],
      params: needsNote ? Note : OptionalNote,
      apply: async (ctx, id, params) => {
        const { note } = parseParams(needsNote ? Note : OptionalNote, params);
        await gov.updateIncident(ctx.tx, ctx.p, id, { body: note || `Moved to ${status}`, status });
      },
    });
    const e = kitEntity({
      key: 'incidents',
      module: 'governance',
      table: incidents,
      subjectType: 'incident',
      roles: { read: GOVERNANCE_ROLES, write: GOVERNANCE_ROLES },
      title: 'title',
      fields: {
        title: { label: 'Title', kind: 'text', column: incidents.title, required: true, max: 200 },
        severity: { label: 'Severity', kind: 'select', column: incidents.severity, options: choices(INCIDENT_SEVERITIES, { sev1: 'Severity 1', sev2: 'Severity 2', sev3: 'Severity 3', sev4: 'Severity 4' }), required: true, bulk: true },
        category: { label: 'Category', kind: 'select', column: incidents.category, options: choices(INCIDENT_CATEGORIES), required: true, bulk: true },
        description: { label: 'What happened', kind: 'textarea', column: incidents.description, max: 4000 },
        impact: { label: 'Impact', kind: 'textarea', column: incidents.impact, max: 2000 },
        personalDataInvolved: { label: 'Personal data involved', kind: 'boolean', column: incidents.personalDataInvolved, edit: false },
        ownerId: { label: 'Owner', kind: 'user', column: incidents.ownerId, bulk: true },
        rootCause: { label: 'Root cause', kind: 'textarea', column: incidents.rootCause, max: 4000, create: false },
        correctiveActions: { label: 'Corrective actions', kind: 'textarea', column: incidents.correctiveActions, max: 4000, create: false },
      },
      extra: {
        status: incidents.status,
        detectedAt: sql<string>`to_char(${incidents.detectedAt} at time zone 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI')`,
        resolvedAt: sql<string | null>`to_char(${incidents.resolvedAt} at time zone 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI')`,
        reportedByName: sql<string | null>`(select u.full_name from users u where u.id = ${qualified('incidents', 'reported_by')})`,
        regulatorNotifiedAt: sql<string | null>`to_char(${incidents.regulatorNotifiedAt} at time zone 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI')`,
        regulatorDeadline: sql<string | null>`case when ${incidents.personalDataInvolved} then to_char((${incidents.detectedAt} + interval '72 hours') at time zone 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI') end`,
        regulatorOverdue: sql<boolean>`${incidents.personalDataInvolved} and ${incidents.regulatorNotifiedAt} is null and ${incidents.detectedAt} + interval '72 hours' < now()`,
      },
      filters: {
        status: { label: 'Status', options: choices(INCIDENT_STATUSES), where: (v) => (v === 'active' ? sql`${incidents.status} in ('open', 'investigating', 'mitigated')` : (INCIDENT_STATUSES as readonly string[]).includes(v) ? eq(incidents.status, v) : undefined) },
        regulator: { label: 'Regulator report', options: choices(['due', 'overdue', 'notified']), where: (v) => (v === 'due' ? sql`${incidents.personalDataInvolved} and ${incidents.regulatorNotifiedAt} is null` : v === 'overdue' ? sql`${incidents.personalDataInvolved} and ${incidents.regulatorNotifiedAt} is null and ${incidents.detectedAt} + interval '72 hours' < now()` : v === 'notified' ? sql`${incidents.regulatorNotifiedAt} is not null` : undefined) },
      },
      sorts: { detectedAt: incidents.detectedAt, status: incidents.status },
      search: [incidents.title, incidents.description, incidents.impact],
      defaultSort: { id: 'detectedAt', dir: 'desc' },
      noImport: true,
      exportExtra: [
        { key: 'status', header: 'Status' },
        { key: 'detectedAt', header: 'Detected' },
        { key: 'reportedByName', header: 'Reported by' },
        { key: 'regulatorDeadline', header: 'Report to the regulator by' },
        { key: 'regulatorNotifiedAt', header: 'Regulator told' },
        { key: 'resolvedAt', header: 'Resolved' },
      ],
      remove: { guard: async (ctx, id) => ((await rowOf(ctx, incidents, id)).status === 'open' ? null : 'An incident under way stays on the register; close it instead') },
      actions: {
        note: { label: 'Add a note', inputs: [{ key: 'note', label: 'Note', type: 'textarea', required: true }], params: Note, apply: async (ctx, id, params) => void (await gov.updateIncident(ctx.tx, ctx.p, id, { body: parseParams(Note, params).note })) },
        investigating: to('investigating', 'Investigating', false),
        mitigated: to('mitigated', 'Mitigated', false),
        resolved: to('resolved', 'Resolved', false),
        closed: to('closed', 'Close', true),
        reopen: to('open', 'Reopen', true),
        regulatorNotified: { label: 'Regulator told', apply: async (ctx, id) => void (await gov.regulatorNotified(ctx.tx, ctx.p, id)) },
      },
    });
    e.create = async (ctx, v) =>
      (
        await gov.reportIncident(ctx.tx, ctx.p, {
          title: String(v.title),
          severity: v.severity as 'sev1',
          category: String(v.category),
          description: String(v.description ?? ''),
          impact: String(v.impact ?? ''),
          personalDataInvolved: !!v.personalDataInvolved,
          ownerId: (v.ownerId as string | null | undefined) ?? null,
        })
      ).id;
    return e;
  }

  private retention(): RecordEntity {
    const e = kitEntity({
      key: 'retention-policies',
      module: 'governance',
      table: documentRetentionPolicies,
      subjectType: 'document_retention_policy',
      roles: { read: GOVERNANCE_ROLES, write: GOVERNANCE_ROLES },
      title: 'category',
      fields: {
        category: { label: 'File category', kind: 'text', column: documentRetentionPolicies.category, required: true, max: 40, help: 'The vault category, for example admission_forms', example: 'admission_forms' },
        retainMonths: { label: 'Keep for (months)', kind: 'number', column: documentRetentionPolicies.retainMonths, required: true, int: true, min: 1, max: 600, bulk: true, example: '84' },
        note: { label: 'Note', kind: 'text', column: documentRetentionPolicies.note, max: 300 },
      },
      extra: { createdByName: sql<string | null>`(select u.full_name from users u where u.id = ${qualified('document_retention_policies', 'created_by')})` },
      defaults: (ctx) => ({ createdBy: ctx.p.userId }),
      defaultSort: { id: 'category', dir: 'asc' },
      importKey: ['category'],
    });
    e.check = async (ctx: KitCtx, id: string) => {
      const r = await rowOf(ctx, documentRetentionPolicies, id);
      if (!/^[a-z0-9_]{2,40}$/.test(String(r.category))) throw new BadRequestException('Use lower-case letters, digits and underscores for the category');
      const [dup] = await ctx.tx.select({ id: documentRetentionPolicies.id }).from(documentRetentionPolicies).where(and(eq(documentRetentionPolicies.category, String(r.category)), sql`${documentRetentionPolicies.id} <> ${id}`));
      if (dup) throw new BadRequestException('This category already has a retention period');
    };
    // An empty note is stored as an empty string (the column is not null).
    const inner = e.create!;
    e.create = (ctx, v) => inner(ctx, { ...v, note: v.note ?? '' });
    e.fields!.note.schema = z.string().trim().max(300).default('');
    return e;
  }
}
