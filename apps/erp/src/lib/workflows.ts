// Shapes from the workflows endpoints (services/api) and the line formats the definition editor reads and writes.

export type FieldType = 'text' | 'number' | 'date' | 'select';
export const FIELD_TYPES: FieldType[] = ['text', 'number', 'date', 'select'];
export type RequestStatus = 'pending' | 'approved' | 'rejected' | 'returned' | 'cancelled';

export interface DefField {
  key: string;
  label: string;
  type: FieldType;
  required: boolean;
  options?: string[];
}

export type DefApprover = { kind: 'role'; role: string } | { kind: 'department_head' } | { kind: 'user'; userId: string };

export const CONDITION_OPS = ['>=', '<=', '!=', '==', '>', '<', 'in'] as const;
export type ConditionOp = (typeof CONDITION_OPS)[number];
/** A step applies only when the request amount (field `amount`) or a form field satisfies this. */
export interface DefCondition {
  field: string;
  op: ConditionOp;
  value: number | string | (number | string)[];
}
export type DefEscalate = { kind: 'role'; role: string } | { kind: 'user'; userId: string };

export interface DefStep {
  name: string;
  /** One approver, or `approvers` (two or more, asked at once; `mode` says all or any). */
  approver?: DefApprover;
  approvers?: DefApprover[];
  mode?: 'all' | 'any';
  minAmount?: number | null;
  maxAmount?: number | null;
  slaHours?: number | null;
  conditions?: DefCondition[];
  escalateTo?: DefEscalate | null;
  reminderHours?: number | null;
}

export interface DefinitionRow {
  id: string;
  requestType: string;
  name: string;
  description: string;
  fields: DefField[];
  steps: DefStep[];
  active: boolean;
  version: number;
}

export interface RequestRow {
  id: string;
  requestType: string;
  title: string;
  amount: number | null;
  status: RequestStatus;
  requesterName: string;
  stepName: string | null;
  stepNumber: number;
  stepCount: number;
  dueAt: string | null;
  version: number;
  createdAt: string;
}

export interface TimelineEntry {
  id: string;
  action: 'submitted' | 'approved' | 'rejected' | 'returned' | 'resubmitted' | 'cancelled' | 'skipped' | 'reminded' | 'escalated';
  stepName: string | null;
  comment: string;
  actorName: string | null;
  createdAt: string;
}

export interface RequestDetail extends RequestRow {
  payload: Record<string, unknown>;
  definition: { name: string; fields: DefField[] };
  timeline: TimelineEntry[];
  canDecide: boolean;
  canResubmit: boolean;
  canCancel: boolean;
}

export type Parsed<T> = { ok: true; value: T } | { ok: false; line: number };

const parts = (line: string) => line.split('|').map((x) => x.trim());
const lines = (text: string) => text.split('\n').map((l, i) => ({ l: l.trim(), n: i + 1 })).filter((x) => x.l);

/** Form fields, one per line: `key | Label | type | required | option, option`. */
export function parseFields(text: string): Parsed<DefField[]> {
  const out: DefField[] = [];
  for (const { l, n } of lines(text)) {
    const [key, label, type = 'text', required = '', options = ''] = parts(l);
    if (!key || !label || !FIELD_TYPES.includes(type as FieldType)) return { ok: false, line: n };
    const opts = options ? options.split(',').map((o) => o.trim()).filter(Boolean) : [];
    if (type === 'select' && opts.length === 0) return { ok: false, line: n };
    out.push({ key, label, type: type as FieldType, required: required === 'required', ...(type === 'select' ? { options: opts } : {}) });
  }
  return { ok: true, value: out };
}

export function formatFields(fields: DefField[]): string {
  return fields.map((f) => [f.key, f.label, f.type, f.required ? 'required' : '', (f.options ?? []).join(', ')].join(' | ').replace(/ {2,}/g, ' ').replace(/( \| ?)+$/, '')).join('\n');
}

const num = (s: string | undefined): number | null | undefined => (!s ? null : /^\d+(\.\d+)?$/.test(s) ? Number(s) : undefined);

const oneApprover = (who: string): DefApprover | null => {
  if (who === 'head') return { kind: 'department_head' };
  if (who.startsWith('role:') && who.length > 5) return { kind: 'role', role: who.slice(5).trim() };
  if (who.startsWith('user:') && who.length > 5) return { kind: 'user', userId: who.slice(5).trim() };
  return null;
};
const approverText = (a: DefApprover) => (a.kind === 'department_head' ? 'head' : a.kind === 'role' ? `role:${a.role}` : `user:${a.userId}`);

const CONDITION = /^([A-Za-z_][A-Za-z0-9_]*)\s*(>=|<=|!=|==|>|<|\sin\s)\s*(.+)$/;
const scalar = (v: string): number | string => (/^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v);

/** Conditions, separated by `;`: `amount>100000; kind==books; kind in books/grants`. */
export function parseConditions(text: string): DefCondition[] | null {
  const out: DefCondition[] = [];
  for (const part of text.split(';').map((x) => x.trim()).filter(Boolean)) {
    const m = CONDITION.exec(part);
    if (!m) return null;
    const op = m[2].trim() as ConditionOp;
    const raw = m[3].trim();
    if (op === 'in') {
      const values = raw.split('/').map((x) => x.trim()).filter(Boolean).map(scalar);
      if (values.length === 0) return null;
      out.push({ field: m[1], op, value: values });
    } else out.push({ field: m[1], op, value: scalar(raw) });
  }
  return out;
}

export const formatConditions = (cs: DefCondition[]) => cs.map((c) => (c.op === 'in' ? `${c.field} in ${(c.value as (number | string)[]).join('/')}` : `${c.field}${c.op}${c.value}`)).join('; ');

/**
 * Steps, one per line: `Name | approver | min amount | max amount | SLA hours | conditions | escalate to | remind after hours`.
 * Approver is `head`, `role:accountant`, `user:<id>`, or several at once: `all(role:accountant, role:hr_manager)` /
 * `any(head, role:principal)`. Escalate to is `role:principal` or `user:<id>` (needs the SLA hours).
 */
export function parseSteps(text: string): Parsed<DefStep[]> {
  const out: DefStep[] = [];
  for (const { l, n } of lines(text)) {
    const [name, who = '', min, max, sla, cond = '', esc = '', rem] = parts(l);
    const lo = num(min);
    const hi = num(max);
    const hours = num(sla);
    const remind = num(rem);
    if (!name || lo === undefined || hi === undefined || hours === undefined || remind === undefined) return { ok: false, line: n };
    const step: DefStep = { name, minAmount: lo, maxAmount: hi, slaHours: hours === null ? null : Math.round(hours) };
    const group = /^(all|any)\((.+)\)$/.exec(who);
    if (group) {
      const list = group[2].split(',').map((x) => oneApprover(x.trim()));
      if (list.length < 2 || list.some((a) => a === null)) return { ok: false, line: n };
      step.approvers = list as DefApprover[];
      step.mode = group[1] as 'all' | 'any';
    } else {
      const approver = oneApprover(who);
      if (!approver) return { ok: false, line: n };
      step.approver = approver;
    }
    const conditions = parseConditions(cond);
    if (conditions === null) return { ok: false, line: n };
    if (conditions.length) step.conditions = conditions;
    if (esc) {
      const target = oneApprover(esc);
      if (!target || target.kind === 'department_head' || !step.slaHours) return { ok: false, line: n };
      step.escalateTo = target;
    }
    if (remind !== null) {
      if (step.slaHours && remind >= step.slaHours) return { ok: false, line: n };
      step.reminderHours = Math.round(remind);
    }
    out.push(step);
  }
  return { ok: true, value: out };
}

export function formatSteps(steps: DefStep[]): string {
  return steps
    .map((s) => {
      const who = s.approvers?.length ? `${s.mode ?? 'all'}(${s.approvers.map(approverText).join(', ')})` : s.approver ? approverText(s.approver) : '';
      const cells = [s.name, who, s.minAmount ?? '', s.maxAmount ?? '', s.slaHours ?? '', s.conditions?.length ? formatConditions(s.conditions) : '', s.escalateTo ? approverText(s.escalateTo) : '', s.reminderHours ?? ''];
      return cells.join(' | ').replace(/ {2,}/g, ' ').replace(/( \| ?)+$/, '');
    })
    .join('\n');
}

/** A short text of who decides a step, for lists. */
export const stepWho = (s: DefStep, labels: { all: string; any: string }) => (s.approvers?.length ? `${s.mode === 'any' ? labels.any : labels.all}: ${s.approvers.map(approverText).join(', ')}` : s.approver ? approverText(s.approver) : '');

/** An amount typed by a person: whole rupees or with up to two decimals; empty means none. */
export function parseAmount(s: string): number | null | undefined {
  const v = s.trim();
  if (!v) return null;
  return /^\d{1,12}(\.\d{1,2})?$/.test(v) ? Number(v) : undefined;
}
