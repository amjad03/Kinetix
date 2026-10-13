// The visual workflow builder: a tree of nodes (trigger, conditions with yes/no branches, approvals and notifications)
// that compiles into the engine's steps (approval steps carrying the conditions of their branches) and notify rules.
import { conditionHolds, type Approver, type Condition, type EscalateTo, type FormField, type StepDef } from './workflow-rules.js';

export const MODULES = ['general', 'hr', 'fees', 'academics', 'admissions', 'certificates', 'exams'] as const;
export type WorkflowModule = (typeof MODULES)[number];
export const TRIGGER_SOURCES = ['staff_desk', 'parent_app', 'student_portal', 'office_counter'] as const;
export const CHANNELS = ['app', 'sms', 'email', 'whatsapp'] as const;
export const TEMPLATES = ['request_received', 'decision', 'approved', 'rejected', 'generic'] as const;
export const NOTIFY_WHEN = ['submitted', 'approved', 'rejected', 'decided'] as const;
export const BRANCH_OPS = ['>', '>=', '<', '<=', '==', '!=', 'in'] as const;
export const MAX_NODES = 40;
export const MAX_DEPTH = 4;

export interface TriggerNode {
  id: string;
  type: 'trigger';
  name: string;
  sources: (typeof TRIGGER_SOURCES)[number][];
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
  channels: (typeof CHANNELS)[number][];
  template: (typeof TEMPLATES)[number] | '';
  when: (typeof NOTIFY_WHEN)[number];
  /** `requester`, or a role whose holders are told. */
  to: string;
}
export type BuilderNode = ApprovalNode | ConditionNode | NotifyNode;
export interface BuilderGraph {
  trigger: TriggerNode;
  nodes: BuilderNode[];
}

/** A notification the engine sends when a request reaches `when` and every condition holds. */
export interface NotifyRule {
  name: string;
  channels: string[];
  template: string;
  when: (typeof NOTIFY_WHEN)[number];
  to: string;
  conditions?: Condition[];
}

/** One problem that blocks publishing; `code` is translated by the ERP. */
export interface GraphIssue {
  nodeId: string;
  code: 'name_missing' | 'approver_missing' | 'escalation_needs_sla' | 'reminder_after_sla' | 'field_unknown' | 'value_missing' | 'in_needs_list' | 'in_no_branch' | 'channel_missing' | 'template_missing' | 'no_approval' | 'too_many_nodes' | 'too_deep' | 'duplicate_id';
}

const NEGATE: Record<string, Condition['op']> = { '>': '<=', '>=': '<', '<': '>=', '<=': '>', '==': '!=', '!=': '==' };

function* walk(nodes: BuilderNode[], depth = 1): Generator<{ node: BuilderNode; depth: number }> {
  for (const node of nodes) {
    yield { node, depth };
    if (node.type === 'condition') {
      yield* walk(node.yes, depth + 1);
      yield* walk(node.no, depth + 1);
    }
  }
}

/** Every problem that blocks publishing. An empty list means the graph can go live. */
export function validateGraph(g: BuilderGraph, fields: Pick<FormField, 'key'>[]): GraphIssue[] {
  const issues: GraphIssue[] = [];
  const keys = new Set(['amount', ...fields.map((f) => f.key)]);
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
  if (count > MAX_NODES) issues.push({ nodeId: g.trigger.id, code: 'too_many_nodes' });
  if (approvals === 0) issues.push({ nodeId: g.trigger.id, code: 'no_approval' });
  return issues;
}

const conditionOf = (n: ConditionNode): Condition => ({ field: n.field, op: n.op, value: n.value as Condition['value'] });

/** The engine form of a valid graph: approval steps in order with the conditions of their branches, and notify rules. */
export function compileGraph(g: BuilderGraph): { steps: StepDef[]; notifyRules: NotifyRule[] } {
  const steps: StepDef[] = [];
  const notifyRules: NotifyRule[] = [];
  const visit = (nodes: BuilderNode[], conds: Condition[]) => {
    for (const n of nodes) {
      const conditions = conds.length ? { conditions: [...conds] } : {};
      if (n.type === 'approval') {
        const who = n.approvers && n.approvers.length >= 2 ? { approvers: n.approvers, mode: n.mode ?? 'all' } : { approver: (n.approver ?? n.approvers?.[0]) as Approver };
        steps.push({ name: n.name.trim(), ...who, slaHours: n.slaHours ?? null, escalateTo: n.escalateTo ?? null, reminderHours: n.reminderHours ?? null, ...conditions });
      } else if (n.type === 'notify') {
        notifyRules.push({ name: n.name.trim(), channels: n.channels, template: n.template, when: n.when, to: n.to, ...conditions });
      } else {
        const c = conditionOf(n);
        visit(n.yes, [...conds, c]);
        if (n.op !== 'in') visit(n.no, [...conds, { ...c, op: NEGATE[n.op] }]);
      }
    }
  };
  visit(g.nodes, []);
  return { steps, notifyRules };
}

let seq = 0;
const nextId = (prefix: string) => `${prefix}${++seq}`;

/** A builder graph for a definition made before the builder (its steps and min/max amounts become branches). */
export function graphFromSteps(steps: StepDef[], notifyRules: NotifyRule[] = []): BuilderGraph {
  seq = 0;
  const nodes: BuilderNode[] = [];
  for (const s of steps) {
    const conds: Condition[] = [...(s.minAmount != null ? [{ field: 'amount', op: '>=' as const, value: s.minAmount }] : []), ...(s.maxAmount != null ? [{ field: 'amount', op: '<=' as const, value: s.maxAmount }] : []), ...(s.conditions ?? [])];
    let node: BuilderNode = { id: nextId('a'), type: 'approval', name: s.name, approver: s.approver ?? null, ...(s.approvers ? { approvers: s.approvers, mode: s.mode ?? 'all' } : {}), slaHours: s.slaHours ?? null, escalateTo: s.escalateTo ?? null, reminderHours: s.reminderHours ?? null };
    for (const c of [...conds].reverse()) node = { id: nextId('c'), type: 'condition', name: describe(c), field: c.field, op: c.op, value: c.value, yes: [node], no: [] };
    nodes.push(node);
  }
  for (const r of notifyRules) nodes.push({ id: nextId('n'), type: 'notify', name: r.name, channels: r.channels as NotifyNode['channels'], template: r.template as NotifyNode['template'], when: r.when, to: r.to });
  return { trigger: starterTrigger(), nodes };
}

const describe = (c: Condition) => `${c.field} ${c.op} ${Array.isArray(c.value) ? c.value.join(', ') : c.value}`;
export const starterTrigger = (): TriggerNode => ({ id: 'trigger', type: 'trigger', name: 'Request submitted', sources: ['staff_desk'] });

/** A new workflow: the trigger, one principal approval and a decision message to the requester. */
export const starterGraph = (): BuilderGraph => ({
  trigger: starterTrigger(),
  nodes: [
    { id: 'a1', type: 'approval', name: 'Principal approval', approver: { kind: 'role', role: 'principal' }, slaHours: 48, escalateTo: null, reminderHours: null },
    { id: 'n1', type: 'notify', name: 'Tell the requester', channels: ['app'], template: 'decision', when: 'decided', to: 'requester' },
  ],
});

/** A test run: which nodes a request with this amount and form data passes through, without starting anything. */
export function simulate(g: BuilderGraph, amount: number | null, payload: Record<string, unknown>): { nodeId: string; type: BuilderNode['type'] | 'trigger'; branch?: 'yes' | 'no' }[] {
  const path: { nodeId: string; type: BuilderNode['type'] | 'trigger'; branch?: 'yes' | 'no' }[] = [{ nodeId: g.trigger.id, type: 'trigger' }];
  const visit = (nodes: BuilderNode[]) => {
    for (const n of nodes) {
      if (n.type === 'condition') {
        const yes = conditionHolds(conditionOf(n), amount, payload);
        path.push({ nodeId: n.id, type: 'condition', branch: yes ? 'yes' : 'no' });
        visit(yes ? n.yes : n.no);
      } else path.push({ nodeId: n.id, type: n.type });
    }
  };
  visit(g.nodes);
  return path;
}

/** Whether a notify rule applies to a request (its branch conditions hold). */
export const ruleApplies = (r: NotifyRule, amount: number | null, payload: Record<string, unknown>) => (r.conditions ?? []).every((c) => conditionHolds(c, amount, payload));
