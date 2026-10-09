// A small description language for ERP desks that are tabs of lists with forms: what a form's text boxes turn into when sent to the API.
// Every value a person types is a string; this turns them into the numbers, lists and nested objects the API expects.

import type { MessageKey } from '@/i18n/messages';

export type Coerce = 'int' | 'num' | 'bool' | 'list' | 'intlist' | 'lines' | 'pairs' | 'numpairs' | 'idpairs' | 'scorelines' | 'items' | 'rubric' | 'periods' | 'blocks' | 'faqs' | 'rupeesToPaise';

export interface DeskField {
  /** Where it goes in the request body; a dot makes a nested object ("aiPolicy.enabled"). */
  name: string;
  label: MessageKey;
  kind?: 'text' | 'multiline' | 'number' | 'date' | 'select' | 'uuid';
  to?: Coerce;
  required?: boolean;
  init?: string;
  /** Start with this property of the row the action was opened on. */
  initFrom?: string;
  /** Fixed options (value, message key or plain text) or the name of a lookup the page supplies. */
  options?: { value: string; label: MessageKey }[];
  optionsFrom?: 'sections' | 'programs' | 'campuses' | 'years' | 'departments';
  /** A blank box sends null (to clear the value) instead of leaving the key out. */
  clearable?: boolean;
}

export interface DeskAction {
  id: string;
  label: MessageKey;
  /** Request path; {key} is filled from the row or the desk filters. */
  path: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  fields: DeskField[];
  /** Body properties taken from the row: { facultyId: 'id' }; "[id]" makes a one-item list. */
  rowBody?: Record<string, string>;
  /** Body properties taken from the desk filters: { sectionId: 'sectionId' }. */
  filterBody?: Record<string, string>;
  /** Extra body properties that are always sent. */
  fixed?: Record<string, unknown>;
  scope: 'tab' | 'row';
  /** Show only for rows where row[key] is one of these. */
  when?: { key: string; in: string[] };
  danger?: boolean;
  /** Ask first, with this text (for actions with no fields). */
  confirm?: MessageKey;
  /** Show what the API answered. */
  showResult?: boolean;
}

export interface DeskColumn {
  key: string;
  label: MessageKey;
  type?: 'text' | 'date' | 'datetime' | 'bool' | 'pct' | 'paise' | 'list' | 'chip' | 'count' | 'time';
  /** For chip columns: the message-key prefix that words each value ("g1.v.type." + value). */
  words?: string;
}

export interface DeskTab {
  id: string;
  label: MessageKey;
  empty: MessageKey;
  /** GET path, with {filter} placeholders. */
  load: string;
  /** Filters that must be chosen before this tab can load. */
  needs?: string[];
  /** Where the rows are in the answer ("entries"); default is the answer itself. */
  rows?: string;
  /** A named reshaping the page applies on the server. */
  shape?: 'setup' | 'hierarchy' | 'single';
  columns: DeskColumn[];
  actions: DeskAction[];
  hint?: MessageKey;
}

export interface DeskFilter {
  param: string;
  label: MessageKey;
  from: 'sections' | 'cycles' | 'courses' | 'years' | 'static';
  /** Used in a path or body as {param}; the first option is chosen when the URL has none. */
  options?: { value: string; label: MessageKey }[];
  /** First option chosen when nothing is in the URL. */
  first?: boolean;
}

export interface DeskSpec {
  id: string;
  title: MessageKey;
  subtitle: MessageKey;
  section: string;
  filters: DeskFilter[];
  tabs: DeskTab[];
}

// ---- reading what was typed ---------------------------------------------------------------------------------------------

export const splitLines = (s: string): string[] => s.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
export const splitList = (s: string): string[] => s.split(',').map((x) => x.trim()).filter(Boolean);

/** "key=value" per line to an object. */
export function parsePairs(s: string): Record<string, string> | null {
  const out: Record<string, string> = {};
  for (const l of splitLines(s)) {
    const i = l.indexOf('=');
    if (i < 1 || i === l.length - 1) return null;
    out[l.slice(0, i).trim()] = l.slice(i + 1).trim();
  }
  return out;
}

/** "Tuition, 40000" per line (rupees) to fee items in paise. */
export function parseItems(s: string): { head: string; amountPaise: number }[] | null {
  const out: { head: string; amountPaise: number }[] = [];
  for (const l of splitLines(s)) {
    const i = l.lastIndexOf(',');
    if (i < 1) return null;
    const rupees = Number(l.slice(i + 1).replace(/[₹\s]/g, ''));
    if (!Number.isFinite(rupees) || rupees <= 0) return null;
    out.push({ head: l.slice(0, i).trim(), amountPaise: Math.round(rupees * 100) });
  }
  return out.length ? out : null;
}

/** "Method | Full=4 ; Partial=2 ; None=0" per line to rubric criteria. */
export function parseRubric(s: string): { name: string; levels: { label: string; points: number; descriptor: string }[] }[] | null {
  const out: { name: string; levels: { label: string; points: number; descriptor: string }[] }[] = [];
  for (const l of splitLines(s)) {
    const [name, rest] = l.split('|').map((x) => x.trim());
    if (!name || !rest) return null;
    const levels: { label: string; points: number; descriptor: string }[] = [];
    for (const part of rest.split(';').map((x) => x.trim()).filter(Boolean)) {
      const i = part.lastIndexOf('=');
      const points = Number(part.slice(i + 1));
      if (i < 1 || !Number.isFinite(points) || points < 0) return null;
      levels.push({ label: part.slice(0, i).trim(), points, descriptor: '' });
    }
    if (levels.length < 2) return null;
    out.push({ name, levels });
  }
  return out.length ? out : null;
}

/** "09:00-09:45" per line to periods. */
export function parsePeriods(s: string): { startsAt: string; endsAt: string }[] | null {
  const out: { startsAt: string; endsAt: string }[] = [];
  for (const l of splitLines(s)) {
    const m = /^(\d{1,2}:\d{2})\s*[-–to]+\s*(\d{1,2}:\d{2})$/.exec(l);
    if (!m) return null;
    const pad = (t: string) => t.padStart(5, '0');
    out.push({ startsAt: pad(m[1]), endsAt: pad(m[2]) });
  }
  return out.length ? out : null;
}

/** "Title | text" per line. */
export function parseBlocks(s: string): { title: string; text: string }[] | null {
  const out: { title: string; text: string }[] = [];
  for (const l of splitLines(s)) {
    const [title, ...rest] = l.split('|');
    if (!title.trim() || !rest.join('|').trim()) return null;
    out.push({ title: title.trim(), text: rest.join('|').trim() });
  }
  return out;
}

/** "Question | answer" per line. */
export function parseFaqs(s: string): { q: string; a: string }[] | null {
  const blocks = parseBlocks(s);
  return blocks ? blocks.map((b) => ({ q: b.title, a: b.text })) : null;
}

const BAD = Symbol('bad');

function coerceOne(f: DeskField, raw: string): unknown {
  const t = raw.trim();
  switch (f.to) {
    case 'int': {
      const n = Number(t);
      return Number.isInteger(n) ? n : BAD;
    }
    case 'num': {
      const n = Number(t);
      return Number.isFinite(n) ? n : BAD;
    }
    case 'bool':
      return t === 'yes' || t === 'true' ? true : t === 'no' || t === 'false' ? false : BAD;
    case 'list':
      return splitList(t);
    case 'intlist': {
      const xs = splitList(t).map(Number);
      return xs.every((n) => Number.isInteger(n)) ? xs : BAD;
    }
    case 'numpairs': {
      const p = parsePairs(t);
      if (!p) return BAD;
      const out: Record<string, number> = {};
      for (const [k, v] of Object.entries(p)) {
        const n = Number(v);
        if (!Number.isFinite(n)) return BAD;
        out[k] = n;
      }
      return out;
    }
    case 'idpairs': {
      const p = parsePairs(t);
      return p ? Object.entries(p).map(([studentId, deviceUserId]) => ({ studentId, deviceUserId })) : BAD;
    }
    case 'scorelines': {
      const out: { studentId: string; score?: number; level?: string; remarks: string }[] = [];
      for (const l of splitLines(t)) {
        const [id, value, ...rest] = l.split(',').map((x) => x.trim());
        if (!id || !value) return BAD;
        const n = Number(value);
        out.push({ studentId: id, ...(Number.isFinite(n) ? { score: n } : { level: value }), remarks: rest.join(', ') });
      }
      return out.length ? out : BAD;
    }
    case 'lines':
      return splitLines(t);
    case 'pairs':
      return parsePairs(t) ?? BAD;
    case 'items':
      return parseItems(t) ?? BAD;
    case 'rubric':
      return parseRubric(t) ?? BAD;
    case 'periods':
      return parsePeriods(t) ?? BAD;
    case 'blocks':
      return parseBlocks(t) ?? BAD;
    case 'faqs':
      return parseFaqs(t) ?? BAD;
    case 'rupeesToPaise': {
      const n = Number(t);
      return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : BAD;
    }
    default:
      return t;
  }
}

/** Sets obj.a.b = v for "a.b". */
export function setPath(obj: Record<string, unknown>, path: string, v: unknown): void {
  const parts = path.split('.');
  let cur = obj;
  for (const p of parts.slice(0, -1)) {
    if (typeof cur[p] !== 'object' || cur[p] === null) cur[p] = {};
    cur = cur[p] as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]] = v;
}

export function getPath(obj: unknown, path: string): unknown {
  let cur: unknown = obj;
  for (const p of path.split('.')) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

/** The request body for a submitted form: typed values, nested by dotted names, blank optional fields left out. `bad` names the field that could not be read. */
export function buildBody(fields: DeskField[], values: Record<string, string>, fixed: Record<string, unknown> = {}): { body: Record<string, unknown> } | { bad: DeskField } {
  const body: Record<string, unknown> = { ...fixed };
  for (const f of fields) {
    const raw = (values[f.name] ?? '').trim();
    if (!raw) {
      if (f.clearable) setPath(body, f.name, null);
      continue;
    }
    const v = coerceOne(f, raw);
    if (v === BAD) return { bad: f };
    setPath(body, f.name, v);
  }
  return { body };
}

/** What a row's value looks like in a box: lists on one line, blocks and questions one per line, booleans as yes or no. */
export function initText(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'boolean') return v ? 'yes' : 'no';
  if (Array.isArray(v)) {
    if (v.every((x) => typeof x === 'string' || typeof x === 'number')) return v.join(', ');
    return v
      .map((x) => {
        const o = x as Record<string, unknown>;
        if ('q' in o) return `${o.q} | ${o.a}`;
        if ('title' in o) return `${o.title} | ${o.text}`;
        return JSON.stringify(x);
      })
      .join('\n');
  }
  return String(v);
}

/** Fills {key} in a path from a row (first) and the desk filters. Unknown keys stay, so the API says 404 instead of the wrong thing happening. */
export function fillPath(path: string, row: Record<string, unknown> | null, filters: Record<string, string>, values: Record<string, string> = {}): string {
  return path.replace(/\{(\w+)\}/g, (m, k: string) => {
    const v = row?.[k] ?? values[k] ?? filters[k];
    return v === undefined || v === null || v === '' ? m : encodeURIComponent(String(v));
  });
}

/** Paths the generic desk actions may call: only the API areas these desks own. */
const ALLOWED = [
  '/v1/admin/institution/',
  '/v1/admin/trusted-devices',
  '/v1/university/',
  '/v1/curriculum/frameworks',
  '/v1/scheduling/',
  '/v1/admin/calendar',
  '/v1/admissions/cycles/',
  '/v1/admissions/applications/',
  '/v1/admissions/students/',
  '/v1/admissions/prior-education/',
  '/v1/school-learning/',
  '/v1/assessment-tools/',
  '/v1/lms/forum/',
  '/v1/lms/courses/',
  '/v1/admin/timetable/',
];
export const deskPathAllowed = (path: string) => path.startsWith('/v1/') && !path.includes('..') && !path.includes('//') && ALLOWED.some((p) => path.startsWith(p));
