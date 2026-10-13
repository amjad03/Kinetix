import { Body, ConflictException, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query, UnprocessableEntityException } from '@nestjs/common';
import { and, count, desc, eq, inArray, max, sql } from 'drizzle-orm';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { UserPrincipal } from '../auth/principal.js';
import { auditUser } from '../common/audit.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService, type Tx } from '../db/db.service.js';
import { roleName, userRoles, users, workflowDefinitions, workflowRequests } from '../db/schema.js';
import { checkVersion, found } from '../placements/placements.access.js';
import { BRANCH_OPS, CHANNELS, compileGraph, graphFromSteps, MODULES, NOTIFY_WHEN, simulate, starterGraph, TEMPLATES, TRIGGER_SOURCES, validateGraph, type BuilderGraph, type BuilderNode } from './builder-graph.js';
import { WORKFLOW_ADMIN } from './workflows.controller.js';
import type { StepDef } from './workflow-rules.js';

const Id = z.string().regex(/^[a-zA-Z0-9_-]{1,40}$/);
const Name = z.string().max(80);
const Who = z.discriminatedUnion('kind', [z.object({ kind: z.literal('role'), role: z.enum(roleName.enumValues) }), z.object({ kind: z.literal('department_head') }), z.object({ kind: z.literal('user'), userId: z.uuid() })]);
const Escalate = z.discriminatedUnion('kind', [z.object({ kind: z.literal('role'), role: z.enum(roleName.enumValues) }), z.object({ kind: z.literal('user'), userId: z.uuid() })]);
const Hours = z.number().int().min(1).max(24 * 90).nullable().optional();
const Value = z.union([z.number(), z.string().max(120), z.array(z.union([z.number(), z.string().max(120)])).max(30)]).nullable();
const NodeShape: z.ZodType<BuilderNode> = z.lazy(() =>
  z.discriminatedUnion('type', [
    z.object({ id: Id, type: z.literal('approval'), name: Name, approver: Who.nullable().optional(), approvers: z.array(Who).max(8).optional(), mode: z.enum(['all', 'any']).optional(), slaHours: Hours, escalateTo: Escalate.nullable().optional(), reminderHours: Hours }),
    z.object({ id: Id, type: z.literal('condition'), name: Name, field: z.string().max(40), op: z.enum(BRANCH_OPS), value: Value, yes: z.array(NodeShape).max(40), no: z.array(NodeShape).max(40) }),
    z.object({ id: Id, type: z.literal('notify'), name: Name, channels: z.array(z.enum(CHANNELS)).max(4), template: z.union([z.enum(TEMPLATES), z.literal('')]), when: z.enum(NOTIFY_WHEN), to: z.union([z.literal('requester'), z.enum(roleName.enumValues)]) }),
  ]),
) as z.ZodType<BuilderNode>;
const GraphShape = z.object({
  trigger: z.object({ id: Id, type: z.literal('trigger'), name: Name, sources: z.array(z.enum(TRIGGER_SOURCES)).max(4) }),
  nodes: z.array(NodeShape).max(40),
});
const CreateBody = z.object({ name: z.string().trim().min(3).max(120), module: z.enum(MODULES).default('general'), description: z.string().trim().max(1000).default('') });
const DraftBody = z.object({ graph: GraphShape, name: z.string().trim().min(3).max(120).optional(), module: z.enum(MODULES).optional(), description: z.string().trim().max(1000).optional(), expectedVersion: z.number().int().optional() });
const VersionBody = z.object({ expectedVersion: z.number().int().optional() });
const ActiveBody = z.object({ active: z.boolean(), expectedVersion: z.number().int().optional() });
const TestBody = z.object({ amount: z.number().min(0).max(1_000_000_000).nullable().default(null), payload: z.record(z.string(), z.unknown()).default({}) });

type Def = typeof workflowDefinitions.$inferSelect;
/** What the builder edits: the draft when there is one, else the published graph (or one made from the old steps). */
const working = (d: Def): BuilderGraph => d.draft ?? d.graph ?? graphFromSteps(d.steps as StepDef[], d.notifyRules);
/** Draft (never published), active or paused. */
const statusOf = (d: Pick<Def, 'publishedVersion' | 'active'>) => (d.publishedVersion === 0 ? 'draft' : d.active ? 'active' : 'paused');
const slug = (name: string) => (name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').replace(/^[^a-z]+/, '') || 'workflow').slice(0, 30);

/** The visual workflow builder: the workflow list, drafts, validation, publishing, test runs and the runs list. */
@Controller('v1/workflows/builder')
export class WorkflowBuilderController {
  constructor(private readonly db: DbService) {}

  @Get()
  @Auth('user', WORKFLOW_ADMIN)
  list(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const defs = await tx.select({ d: workflowDefinitions, createdByName: users.fullName }).from(workflowDefinitions).leftJoin(users, eq(users.id, workflowDefinitions.createdBy)).orderBy(workflowDefinitions.name);
      const stats = await tx
        .select({ id: workflowRequests.definitionId, runs: count(), lastRunAt: max(workflowRequests.createdAt), open: sql<number>`count(*) filter (where ${workflowRequests.status} = 'pending')`.mapWith(Number) })
        .from(workflowRequests)
        .groupBy(workflowRequests.definitionId);
      const by = new Map(stats.map((s) => [s.id, s]));
      return defs.map(({ d, createdByName }) => ({
        id: d.id,
        name: d.name,
        requestType: d.requestType,
        module: d.module,
        trigger: working(d).trigger,
        status: statusOf(d),
        hasDraft: d.draft !== null,
        publishedVersion: d.publishedVersion,
        version: d.version,
        runs: by.get(d.id)?.runs ?? 0,
        openRuns: by.get(d.id)?.open ?? 0,
        lastRunAt: by.get(d.id)?.lastRunAt ?? null,
        createdByName,
        updatedAt: d.updatedAt,
      }));
    });
  }

  @Post()
  @Auth('user', WORKFLOW_ADMIN)
  create(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(CreateBody)) b: z.infer<typeof CreateBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const base = slug(b.name);
      const taken = new Set((await tx.select({ t: workflowDefinitions.requestType }).from(workflowDefinitions)).map((r) => r.t));
      let requestType = base;
      for (let i = 2; taken.has(requestType); i++) requestType = `${base}_${i}`;
      const [row] = await tx
        .insert(workflowDefinitions)
        .values({ tenantId: p.tenantId, requestType, name: b.name, description: b.description, module: b.module, steps: [], active: false, publishedVersion: 0, draft: starterGraph(), createdBy: p.userId })
        .returning({ id: workflowDefinitions.id });
      await auditUser(tx, p, 'workflow.builder_created', 'workflow_definition', row.id, { requestType });
      return { id: row.id, requestType };
    });
  }

  /** Every run (request) of the workflows, newest first; `definitionId` narrows it to one workflow. */
  @Get('runs')
  @Auth('user', WORKFLOW_ADMIN)
  runs(@CurrentPrincipal() p: UserPrincipal, @Query('definitionId') definitionId?: string) {
    const one = definitionId && /^[0-9a-f-]{36}$/i.test(definitionId) ? eq(workflowRequests.definitionId, definitionId) : undefined;
    return this.db.withTenant(p.tenantId, async (tx) => {
      const rows = await tx
        .select({ r: workflowRequests, workflow: workflowDefinitions.name, requesterName: users.fullName })
        .from(workflowRequests)
        .innerJoin(workflowDefinitions, eq(workflowDefinitions.id, workflowRequests.definitionId))
        .innerJoin(users, eq(users.id, workflowRequests.requesterId))
        .where(one)
        .orderBy(desc(workflowRequests.createdAt))
        .limit(300);
      return rows.map(({ r, workflow, requesterName }) => ({
        id: r.id,
        definitionId: r.definitionId,
        workflow,
        title: r.title,
        requesterName,
        status: r.status,
        stepName: r.status === 'pending' ? (r.steps[r.currentStep]?.name ?? null) : null,
        startedAt: r.createdAt,
        finishedAt: r.decidedAt,
      }));
    });
  }

  @Get(':id')
  @Auth('user', WORKFLOW_ADMIN)
  detail(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const d = await this.load(tx, id);
      const graph = working(d);
      const people = await tx
        .selectDistinct({ id: users.id, name: users.fullName })
        .from(users)
        .innerJoin(userRoles, eq(userRoles.userId, users.id))
        .where(inArray(userRoles.role, ['principal', 'tenant_admin', 'hod', 'accountant', 'hr_manager', 'teacher']))
        .orderBy(users.fullName)
        .limit(200);
      return {
        id: d.id,
        name: d.name,
        description: d.description,
        requestType: d.requestType,
        module: d.module,
        status: statusOf(d),
        hasDraft: d.draft !== null,
        publishedVersion: d.publishedVersion,
        publishedAt: d.publishedAt,
        version: d.version,
        fields: d.fields,
        graph,
        issues: validateGraph(graph, d.fields),
        people,
      };
    });
  }

  /** Saves the canvas as a draft (the live route is unchanged until it is published). Returns what still blocks publishing. */
  @Put(':id/draft')
  @Auth('user', WORKFLOW_ADMIN)
  saveDraft(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(DraftBody)) b: z.infer<typeof DraftBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const d = await this.load(tx, id, true);
      checkVersion(d.version, b.expectedVersion);
      const [row] = await tx
        .update(workflowDefinitions)
        .set({ draft: b.graph as BuilderGraph, ...(b.name ? { name: b.name } : {}), ...(b.module ? { module: b.module } : {}), ...(b.description !== undefined ? { description: b.description } : {}), version: d.version + 1, updatedAt: new Date() })
        .where(eq(workflowDefinitions.id, id))
        .returning({ version: workflowDefinitions.version });
      await auditUser(tx, p, 'workflow.draft_saved', 'workflow_definition', id);
      return { version: row.version, issues: validateGraph(b.graph as BuilderGraph, d.fields) };
    });
  }

  @Delete(':id/draft')
  @Auth('user', WORKFLOW_ADMIN)
  discardDraft(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const d = await this.load(tx, id, true);
      if (d.publishedVersion === 0) throw new ConflictException('This workflow has never been published: there is nothing to go back to');
      const [row] = await tx.update(workflowDefinitions).set({ draft: null, version: d.version + 1, updatedAt: new Date() }).where(eq(workflowDefinitions.id, id)).returning({ version: workflowDefinitions.version });
      await auditUser(tx, p, 'workflow.draft_discarded', 'workflow_definition', id);
      return row;
    });
  }

  /** Publishes the draft: refused while it has problems; the new steps apply to requests made from now on. */
  @Post(':id/publish')
  @HttpCode(200)
  @Auth('user', WORKFLOW_ADMIN)
  publish(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(VersionBody)) b: z.infer<typeof VersionBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const d = await this.load(tx, id, true);
      checkVersion(d.version, b.expectedVersion);
      const graph = working(d);
      const issues = validateGraph(graph, d.fields);
      if (issues.length) throw new UnprocessableEntityException({ message: 'Fix the highlighted steps before activating', code: 'WORKFLOW_INVALID', issues });
      const { steps, notifyRules } = compileGraph(graph);
      const named = [...new Set(steps.flatMap((s) => [...(s.approvers ?? []), ...(s.approver ? [s.approver] : []), ...(s.escalateTo ? [s.escalateTo] : [])]).flatMap((a) => (a.kind === 'user' ? [a.userId] : [])))];
      if (named.length && (await tx.select({ id: users.id }).from(users).where(inArray(users.id, named))).length !== named.length) throw new UnprocessableEntityException('A named approver was not found');
      const now = new Date();
      const [row] = await tx
        .update(workflowDefinitions)
        .set({ graph, draft: null, steps, notifyRules, active: true, publishedVersion: d.publishedVersion + 1, publishedAt: now, version: d.version + 1, updatedAt: now })
        .where(eq(workflowDefinitions.id, id))
        .returning({ version: workflowDefinitions.version, publishedVersion: workflowDefinitions.publishedVersion });
      await auditUser(tx, p, 'workflow.published', 'workflow_definition', id, { publishedVersion: row.publishedVersion });
      return { ...row, status: 'active' as const };
    });
  }

  /** Pauses or resumes a published workflow. */
  @Post(':id/active')
  @HttpCode(200)
  @Auth('user', WORKFLOW_ADMIN)
  setActive(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(ActiveBody)) b: z.infer<typeof ActiveBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const d = await this.load(tx, id, true);
      checkVersion(d.version, b.expectedVersion);
      if (d.publishedVersion === 0) throw new ConflictException('Publish the workflow first');
      const [row] = await tx.update(workflowDefinitions).set({ active: b.active, version: d.version + 1, updatedAt: new Date() }).where(eq(workflowDefinitions.id, id)).returning({ version: workflowDefinitions.version });
      await auditUser(tx, p, b.active ? 'workflow.resumed' : 'workflow.paused', 'workflow_definition', id);
      return { ...row, status: b.active ? 'active' : 'paused' };
    });
  }

  /** A test run of the canvas: the path a request with this amount and form data would take. Nothing is created. */
  @Post(':id/test')
  @HttpCode(200)
  @Auth('user', WORKFLOW_ADMIN)
  test(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(TestBody)) b: z.infer<typeof TestBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const d = await this.load(tx, id);
      const graph = working(d);
      return { path: simulate(graph, b.amount, b.payload), issues: validateGraph(graph, d.fields) };
    });
  }

  private async load(tx: Tx, id: string, lock = false): Promise<Def> {
    const q = tx.select().from(workflowDefinitions).where(and(eq(workflowDefinitions.id, id)));
    const [d] = lock ? await q.for('update') : await q;
    found(d, 'Workflow');
    return d;
  }
}
