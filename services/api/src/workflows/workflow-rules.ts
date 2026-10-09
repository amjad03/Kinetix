// Pure rules of the workflow engine: which steps apply to a request, and checking a form payload against its fields.

export const FIELD_TYPES = ['text', 'number', 'date', 'select'] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

/** One field of a generic e-governance form, defined inside the workflow definition. */
export interface FormField {
  key: string;
  label: string;
  type: FieldType;
  required: boolean;
  /** The allowed values of a select field. */
  options?: string[];
}

export type Approver = { kind: 'role'; role: string } | { kind: 'department_head' } | { kind: 'user'; userId: string };
export type EscalateTo = { kind: 'role'; role: string } | { kind: 'user'; userId: string };

export const CONDITION_OPS = ['>', '>=', '<', '<=', '==', '!=', 'in'] as const;
export type ConditionOp = (typeof CONDITION_OPS)[number];
/** A comparison on the request amount (field `amount`) or on a form field. */
export interface Condition {
  field: string;
  op: ConditionOp;
  value: number | string | (number | string)[];
}

/**
 * A step of a definition. It applies when the request amount lies within [minAmount, maxAmount] and every
 * condition holds. A step has one `approver`, or several `approvers` asked at once (`mode` all or any).
 */
export interface StepDef {
  name: string;
  approver?: Approver;
  approvers?: Approver[];
  mode?: 'all' | 'any';
  minAmount?: number | null;
  maxAmount?: number | null;
  conditions?: Condition[];
  slaHours?: number | null;
  escalateTo?: EscalateTo | null;
  reminderHours?: number | null;
}

/** The approvers of a step: the parallel list when there is one, else the single approver. */
export const stepApprovers = (s: Pick<StepDef, 'approver' | 'approvers'>): Approver[] => (s.approvers?.length ? s.approvers : s.approver ? [s.approver] : []);

/** Whether one condition holds for the request. Numbers compare numerically; anything else as text. A missing value never matches. */
export function conditionHolds(c: Condition, amount: number | null | undefined, payload: Record<string, unknown>): boolean {
  const actual = c.field === 'amount' ? (amount ?? 0) : payload[c.field];
  if (actual === undefined || actual === null || actual === '') return false;
  if (c.op === 'in') return Array.isArray(c.value) && c.value.some((v) => String(v) === String(actual));
  if (Array.isArray(c.value)) return false;
  const numeric = typeof c.value === 'number' || (typeof actual === 'number' && Number.isFinite(Number(c.value)));
  const [l, r] = numeric ? [Number(actual), Number(c.value)] : [String(actual), String(c.value)];
  if (numeric && (Number.isNaN(l) || Number.isNaN(r))) return false;
  switch (c.op) {
    case '>': return l > r;
    case '>=': return l >= r;
    case '<': return l < r;
    case '<=': return l <= r;
    case '==': return l === r;
    default: return l !== r;
  }
}

/** The steps that apply to a request of this amount and form data, in order. A request without an amount counts as 0. */
export function applicableSteps(steps: StepDef[], amount: number | null | undefined, payload: Record<string, unknown> = {}): StepDef[] {
  const a = amount ?? 0;
  return steps.filter((s) => (s.minAmount == null || a >= s.minAmount) && (s.maxAmount == null || a <= s.maxAmount) && (s.conditions ?? []).every((c) => conditionHolds(c, amount, payload)));
}

/** Where a parallel step stands: `all` needs every approver, `any` the first. `escalated` means an escalation target already decided. */
export function parallelOutcome(mode: 'all' | 'any', rows: { decided: boolean; escalation: boolean }[]): 'done' | 'waiting' {
  if (rows.some((r) => r.escalation && r.decided)) return 'done';
  const normal = rows.filter((r) => !r.escalation);
  return (mode === 'all' ? normal.every((r) => r.decided) : normal.some((r) => r.decided)) ? 'done' : 'waiting';
}

/** Hours between two instants. */
export const hoursBetween = (from: Date, to: Date) => (to.getTime() - from.getTime()) / 3_600_000;

/** What the SLA sweep should do with a pending step: remind once after `reminderHours`, escalate once after `slaHours`. */
export function slaAction(step: { slaHours?: number | null; reminderHours?: number | null }, enteredAt: Date, now: Date, flags: { reminded: boolean; escalated: boolean }): 'escalate' | 'remind' | null {
  const waited = hoursBetween(enteredAt, now);
  if (step.slaHours && !flags.escalated && waited >= step.slaHours) return 'escalate';
  if (step.reminderHours && !flags.reminded && !flags.escalated && waited >= step.reminderHours) return 'remind';
  return null;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Checks a payload against the form fields. Returns the cleaned payload (only declared keys, numbers as
 * numbers) and one message per problem, so the caller can refuse with all of them at once.
 */
export function validatePayload(fields: FormField[], payload: Record<string, unknown>): { clean: Record<string, string | number>; errors: string[] } {
  const clean: Record<string, string | number> = {};
  const errors: string[] = [];
  for (const f of fields) {
    const raw = payload[f.key];
    const empty = raw === undefined || raw === null || (typeof raw === 'string' && raw.trim() === '');
    if (empty) {
      if (f.required) errors.push(`${f.label} is required`);
      continue;
    }
    if (f.type === 'number') {
      const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN;
      if (!Number.isFinite(n)) errors.push(`${f.label} must be a number`);
      else clean[f.key] = n;
    } else if (typeof raw !== 'string') {
      errors.push(`${f.label} must be text`);
    } else if (f.type === 'date') {
      const v = raw.trim();
      if (!ISO_DATE.test(v) || Number.isNaN(Date.parse(`${v}T00:00:00Z`)) || new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) !== v) errors.push(`${f.label} must be a date (YYYY-MM-DD)`);
      else clean[f.key] = v;
    } else if (f.type === 'select') {
      if (!(f.options ?? []).includes(raw)) errors.push(`${f.label} must be one of: ${(f.options ?? []).join(', ')}`);
      else clean[f.key] = raw;
    } else if (raw.length > 2000) {
      errors.push(`${f.label} is too long`);
    } else {
      clean[f.key] = raw.trim();
    }
  }
  return { clean, errors };
}
