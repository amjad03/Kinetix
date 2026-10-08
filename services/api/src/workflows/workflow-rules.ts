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

/** A step of a definition. A step applies when the request amount lies within [minAmount, maxAmount]. */
export interface StepDef {
  name: string;
  approver: Approver;
  minAmount?: number | null;
  maxAmount?: number | null;
  slaHours?: number | null;
}

/** The steps that apply to a request of this amount, in order. A request without an amount counts as 0. */
export function applicableSteps(steps: StepDef[], amount: number | null | undefined): StepDef[] {
  const a = amount ?? 0;
  return steps.filter((s) => (s.minAmount == null || a >= s.minAmount) && (s.maxAmount == null || a <= s.maxAmount));
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
