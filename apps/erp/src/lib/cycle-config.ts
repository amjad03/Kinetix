// The cycle form takes the application form, documents and rules as one line each ("key | Label | type
// | required | options"). These turn those lines into the API's JSON and back.

import type { DocSpec, FormField } from './admissions';

const TYPES = ['text', 'number', 'date', 'select', 'email', 'phone'] as const;
const yes = (v: string | undefined) => /^(y|yes|true|1)$/i.test((v ?? '').trim());
const lines = (text: string) => text.split('\n').map((l) => l.trim()).filter(Boolean);
const KEY = /^[a-z][a-z0-9_]{1,40}$/;

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string; line: number };

/** `marks_12th | 12th marks % | number | y | 0-100`, or for a choice `stream | Stream | select | y | Commerce, Science`. */
export function parseQuestions(text: string): Parsed<FormField[]> {
  const out: FormField[] = [];
  let n = 0;
  for (const line of lines(text)) {
    n++;
    const [key, label, type = 'text', required, extra] = line.split('|').map((x) => x.trim());
    if (!KEY.test(key ?? '')) return { ok: false, error: `"${key ?? ''}" is not a valid key (lowercase letters, digits, underscores)`, line: n };
    if (!label) return { ok: false, error: 'Missing the label', line: n };
    if (!(TYPES as readonly string[]).includes(type)) return { ok: false, error: `Type must be one of ${TYPES.join(', ')}`, line: n };
    const f: FormField = { key, label, type: type as FormField['type'], required: yes(required) };
    if (type === 'select') {
      f.options = (extra ?? '').split(',').map((o) => o.trim()).filter(Boolean);
      if (f.options.length < 2) return { ok: false, error: 'A choice needs at least two options, separated by commas', line: n };
    } else if (type === 'number' && extra) {
      const m = /^(-?\d+(?:\.\d+)?)\s*-\s*(-?\d+(?:\.\d+)?)$/.exec(extra);
      if (!m) return { ok: false, error: 'A number range looks like 0-100', line: n };
      f.min = Number(m[1]);
      f.max = Number(m[2]);
    }
    out.push(f);
  }
  const dup = out.find((f, i) => out.findIndex((g) => g.key === f.key) !== i);
  return dup ? { ok: false, error: `The key "${dup.key}" is used twice`, line: out.lastIndexOf(dup) + 1 } : { ok: true, value: out };
}

/** `marksheet | Previous marksheet | y` */
export function parseDocuments(text: string): Parsed<DocSpec[]> {
  const out: DocSpec[] = [];
  let n = 0;
  for (const line of lines(text)) {
    n++;
    const [key, label, required] = line.split('|').map((x) => x.trim());
    if (!KEY.test(key ?? '')) return { ok: false, error: `"${key ?? ''}" is not a valid key`, line: n };
    if (!label) return { ok: false, error: 'Missing the label', line: n };
    out.push({ key, label, required: required === undefined ? true : yes(required) });
  }
  return { ok: true, value: out };
}

/** `marks_12th 40`: one line per number question, with the least accepted value (eligibility) or the weight (merit). */
export function parsePairs(text: string): Parsed<{ field: string; value: number }[]> {
  const out: { field: string; value: number }[] = [];
  let n = 0;
  for (const line of lines(text)) {
    n++;
    const m = /^([a-z][a-z0-9_]*)\s+(-?\d+(?:\.\d+)?)$/.exec(line);
    if (!m) return { ok: false, error: 'Write the question key, a space, then a number: marks_12th 40', line: n };
    out.push({ field: m[1], value: Number(m[2]) });
  }
  return { ok: true, value: out };
}

export const DEFAULT_QUESTIONS = 'marks_12th | 12th marks % | number | y | 0-100\nstream | Stream | select | y | Commerce, Science, Arts';
export const DEFAULT_DOCUMENTS = 'marksheet | Previous marksheet | y\nid_proof | ID proof | n';
