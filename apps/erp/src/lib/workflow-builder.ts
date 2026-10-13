// The visual workflow builder (services/api src/workflows/builder-graph.ts): node shapes, validation and tree edits.

export const MODULES = ['general', 'hr', 'fees', 'academics', 'admissions', 'certificates', 'exams'] as const;
export const TRIGGER_SOURCES = ['staff_desk', 'parent_app', 'student_portal', 'office_counter'] as const;
export const CHANNELS = ['app', 'sms', 'email', 'whatsapp'] as const;
export const TEMPLATES = ['request_received', 'decision', 'approved', 'rejected', 'generic'] as const;
export const NOTIFY_WHEN = ['submitted', 'approved', 'rejected', 'decided'] as const;
export const BRANCH_OPS = ['>', '>=', '<', '<=', '==', '!=', 'in'] as const;
export const APPROVER_ROLES = ['principal', 'tenant_admin', 'hod', 'accountant', 'hr_manager', 'admissions_officer', 'teacher'] as const;
export const MAX_DEPTH = 4;

export type Approver = { kind: 'role'; role: string } | { kind: 'department_head' } | { kind: 'user'; userId: string };
export type EscalateTo = { kind: 'role'; role: string } | { kind: 'user'; userId: string };
export interface TriggerNode {
  id: string;
  type: 'trigger';
  name: string;
  sources: string[];
}
export interface ApprovalNode {
  id: string;
  type: 'approval';
  name: string;
  approver?: Approver | null;
  approvers?: Approver[];
  mode?: 'all' | 'any';
  slaHours?: number | null;
  escalateTo?: EscalateTo | null;
  reminderHours?: number | null;
}
export interface ConditionNode {
  id: string;
  type: 'condition';
  name: string;
  field: string;
  op: (typeof BRANCH_OPS)[number];
  value: number | string | (number | string)[] | null;
  yes: BuilderNode[];
  no: BuilderNode[];
}
export interface NotifyNode {
  id: string;
  type: 'notify';
  name: string;
  channels: string[];
  template: string;
  when: (typeof NOTIFY_WHEN)[number];
  to: string;
}
export type BuilderNode = ApprovalNode | ConditionNode | NotifyNode;
export type AnyNode = BuilderNode | TriggerNode;
export interface BuilderGraph {
  trigger: TriggerNode;
  nodes: BuilderNode[];
}
export type IssueCode = 'name_missing' | 'approver_missing' | 'escalation_needs_sla' | 'reminder_after_sla' | 'field_unknown' | 'value_missing' | 'in_needs_list' | 'in_no_branch' | 'channel_missing' | 'template_missing' | 'no_approval' | 'too_many_nodes' | 'too_deep' | 'duplicate_id';
export interface GraphIssue {
  nodeId: string;
  code: IssueCode;
}
export type WorkflowStatus = 'draft' | 'active' | 'paused';

export interface WorkflowListRow {
  id: string;
  name: string;
  requestType: string;
  module: string;
  trigger: TriggerNode;
  status: WorkflowStatus;
  hasDraft: boolean;
  publishedVersion: number;
  version: number;
  runs: number;
  openRuns: number;
  lastRunAt: string | null;
  createdByName: string | null;
  updatedAt: string;
}
export interface WorkflowDetail {
  id: string;
  name: string;
  description: string;
  requestType: string;
  module: string;
  status: WorkflowStatus;
  hasDraft: boolean;
  publishedVersion: number;
  publishedAt: string | null;
  version: number;
  fields: { key: string; label: string; type: string; options?: string[] }[];
  graph: BuilderGraph;
  issues: GraphIssue[];
  people: { id: string; name: string }[];
}
export interface RunRow {
  id: string;
  definitionId: string;
  workflow: string;
  title: string;
  requesterName: string;
  status: 'pending' | 'approved' | 'rejected' | 'returned' | 'cancelled';
  stepName: string | null;
  startedAt: string;
  finishedAt: string | null;
}
export interface TestPathStep {
  nodeId: string;
  type: AnyNode['type'];
  branch?: 'yes' | 'no';
}

function* walk(nodes: BuilderNode[], depth = 1): Generator<{ node: BuilderNode; depth: number }> {
  for (const node of nodes) {
    yield { node, depth };
    if (node.type === 'condition') {
      yield* walk(node.yes, depth + 1);
      yield* walk(node.no, depth + 1);
    }
  }
}

/** The same checks the API runs before publishing, so the canvas can mark problems as you edit. */
export function validateGraph(g: BuilderGraph, fieldKeys: string[]): GraphIssue[] {
  const issues: GraphIssue[] = [];
  const keys = new Set(['amount', ...fieldKeys]);
  const ids = new Set<string>([g.trigger.id]);
  let count = 0;
  let approvals = 0;
  for (const { node: n, depth } of walk(g.nodes)) {
    count++;
    if (ids.has(n.id)) issues.push({ nodeId: n.id, code: 'duplicate_id' });
    ids.add(n.id);
    if (depth > MAX_DEPTH) issues.push({ nodeId: n.id, code: 'too_deep' });
    if (!n.name.trim()) issues.push({ nodeId: n.id, code: 'name_missing' });
    if (n.type === 'approval') {
      approvals++;
      if (!n.approver && !(n.approvers?.length ?? 0)) issues.push({ nodeId: n.id, code: 'approver_missing' });
      if (n.escalateTo && !n.slaHours) issues.push({ nodeId: n.id, code: 'escalation_needs_sla' });
      if (n.reminderHours && n.slaHours && n.reminderHours >= n.slaHours) issues.push({ nodeId: n.id, code: 'reminder_after_sla' });
    } else if (n.type === 'condition') {
      if (!keys.has(n.field)) issues.push({ nodeId: n.id, code: 'field_unknown' });
      if (n.value === null || n.value === '' || (Array.isArray(n.value) && n.value.length === 0)) issues.push({ nodeId: n.id, code: 'value_missing' });
      else if (n.op === 'in' && !Array.isArray(n.value)) issues.push({ nodeId: n.id, code: 'in_needs_list' });
      if (n.op === 'in' && n.no.length > 0) issues.push({ nodeId: n.id, code: 'in_no_branch' });
    } else {
      if (n.channels.length === 0) issues.push({ nodeId: n.id, code: 'channel_missing' });
      if (!n.template) issues.push({ nodeId: n.id, code: 'template_missing' });
    }
  }
  if (count > 40) issues.push({ nodeId: g.trigger.id, code: 'too_many_nodes' });
  if (approvals === 0) issues.push({ nodeId: g.trigger.id, code: 'no_approval' });
  return issues;
}

/** Where a node can be inserted: the main line or a branch of a condition. */
export type Lane = { parent: null } | { parent: string; branch: 'yes' | 'no' };

const laneOf = (g: BuilderGraph, lane: Lane): BuilderNode[] | null => {
  if (lane.parent === null) return g.nodes;
  const c = findNode(g, lane.parent);
  return c && c.type === 'condition' ? c[lane.branch] : null;
};

export function findNode(g: BuilderGraph, id: string): AnyNode | null {
  if (g.trigger.id === id) return g.trigger;
  for (const { node } of walk(g.nodes)) if (node.id === id) return node;
  return null;
}

export const countNodes = (g: BuilderGraph) => [...walk(g.nodes)].length;

/** A fresh id that is not used in the graph. */
export function newId(g: BuilderGraph, prefix: string): string {
  const used = new Set([g.trigger.id, ...[...walk(g.nodes)].map((x) => x.node.id)]);
  let i = 1;
  while (used.has(`${prefix}${i}`)) i++;
  return `${prefix}${i}`;
}

export function blankNode(g: BuilderGraph, type: BuilderNode['type']): BuilderNode {
  if (type === 'approval') return { id: newId(g, 'a'), type, name: '', approver: null, slaHours: 48, escalateTo: null, reminderHours: null };
  if (type === 'condition') return { id: newId(g, 'c'), type, name: '', field: 'amount', op: '>', value: null, yes: [], no: [] };
  return { id: newId(g, 'n'), type, name: '', channels: ['app'], template: 'decision', when: 'decided', to: 'requester' };
}

const clone = (g: BuilderGraph): BuilderGraph => structuredClone(g);

/** A copy of the graph with `node` inserted at `index` of `lane`. */
export function insertNode(g: BuilderGraph, lane: Lane, index: number, node: BuilderNode): BuilderGraph {
  const next = clone(g);
  const arr = laneOf(next, lane);
  if (arr) arr.splice(Math.max(0, Math.min(index, arr.length)), 0, node);
  return next;
}

/** A copy of the graph without the node (a condition takes its branches with it). */
export function removeNode(g: BuilderGraph, id: string): BuilderGraph {
  const next = clone(g);
  const strip = (arr: BuilderNode[]): boolean => {
    const i = arr.findIndex((n) => n.id === id);
    if (i >= 0) {
      arr.splice(i, 1);
      return true;
    }
    return arr.some((n): boolean => n.type === 'condition' && (strip(n.yes) || strip(n.no)));
  };
  strip(next.nodes);
  return next;
}

/** A copy of the graph with one node changed. */
export function updateNode(g: BuilderGraph, id: string, patch: Partial<AnyNode>): BuilderGraph {
  const next = clone(g);
  const n = findNode(next, id);
  if (n) Object.assign(n, patch);
  return next;
}

/** Parses a condition value typed in the side panel: numbers become numbers, `a, b` a list for `in`. */
export function parseValue(raw: string, op: string): ConditionNode['value'] {
  const s = raw.trim();
  if (!s) return null;
  const one = (x: string) => (x !== '' && Number.isFinite(Number(x)) ? Number(x) : x);
  return op === 'in' ? s.split(',').map((x) => one(x.trim())).filter((x) => x !== '') : one(s);
}
export const formatValue = (v: ConditionNode['value']) => (v === null ? '' : Array.isArray(v) ? v.join(', ') : String(v));
