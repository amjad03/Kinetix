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

export interface DefStep {
  name: string;
  approver: DefApprover;
  minAmount?: number | null;
  maxAmount?: number | null;
  slaHours?: number | null;
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
  action: 'submitted' | 'approved' | 'rejected' | 'returned' | 'resubmitted' | 'cancelled' | 'skipped';
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

/** Steps, one per line: `Name | approver | min amount | max amount | SLA hours`, with approver `head`, `role:accountant` or `user:<id>`. */
export function parseSteps(text: string): Parsed<DefStep[]> {
  const out: DefStep[] = [];
  for (const { l, n } of lines(text)) {
    const [name, who = '', min, max, sla] = parts(l);
    const lo = num(min);
    const hi = num(max);
    const hours = num(sla);
    if (!name || lo === undefined || hi === undefined || hours === undefined) return { ok: false, line: n };
    let approver: DefApprover;
    if (who === 'head') approver = { kind: 'department_head' };
    else if (who.startsWith('role:') && who.length > 5) approver = { kind: 'role', role: who.slice(5).trim() };
    else if (who.startsWith('user:') && who.length > 5) approver = { kind: 'user', userId: who.slice(5).trim() };
    else return { ok: false, line: n };
    out.push({ name, approver, minAmount: lo, maxAmount: hi, slaHours: hours === null ? null : Math.round(hours) });
  }
  return { ok: true, value: out };
}

export function formatSteps(steps: DefStep[]): string {
  return steps
    .map((s) => {
      const who = s.approver.kind === 'department_head' ? 'head' : s.approver.kind === 'role' ? `role:${s.approver.role}` : `user:${s.approver.userId}`;
      return [s.name, who, s.minAmount ?? '', s.maxAmount ?? '', s.slaHours ?? ''].join(' | ').replace(/ {2,}/g, ' ').replace(/( \| ?)+$/, '');
    })
    .join('\n');
}

/** An amount typed by a person: whole rupees or with up to two decimals; empty means none. */
export function parseAmount(s: string): number | null | undefined {
  const v = s.trim();
  if (!v) return null;
  return /^\d{1,12}(\.\d{1,2})?$/.test(v) ? Number(v) : undefined;
}
