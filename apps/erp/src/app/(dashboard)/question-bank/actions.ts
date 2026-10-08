'use server';

import { act, api } from '@/lib/api';
import { optStr, read, send } from '@/lib/ops-server';
import type { QbOptions, QbPaperDetail } from '@/lib/question-bank';

const PAGE = '/question-bank';
const Q = '/v1/question-bank';
const id = encodeURIComponent;

/** "remember=1, apply=2" into { remember: 1, apply: 2 }. */
function counts(s: string | undefined): Record<string, number> | undefined {
  const out: Record<string, number> = {};
  for (const part of (s ?? '').split(',')) {
    const [k, v] = part.split('=').map((x) => x.trim());
    if (k && /^\d+$/.test(v ?? '')) out[k] = Number(v);
  }
  return Object.keys(out).length ? out : undefined;
}

/** One option per line; a leading "*" marks the correct one. */
function optionList(s: string | undefined) {
  return (s ?? '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => ({ text: l.replace(/^\*\s*/, ''), correct: l.startsWith('*') }));
}

export async function addQuestion(v: Record<string, string>) {
  const [subjectId, coId] = (v.subject ?? '').split('|');
  return send(
    `${Q}/questions`,
    { subjectId, coId: coId || null, unit: optStr(v.unit), topic: v.topic, bloom: v.bloom, difficulty: v.difficulty, marks: Number(v.marks), type: v.type, text: v.text, options: optionList(v.options), answer: v.answer ?? '', force: v.force === 'yes' },
    PAGE,
  );
}

export const reviewQuestion = (qid: string) => send(`${Q}/questions/${id(qid)}/review`, {}, PAGE);
export const approveQuestion = (qid: string) => send(`${Q}/questions/${id(qid)}/approve`, {}, PAGE);

/** Section lines: "name; count; marks; type; bloom=n,...; easy=n,...; CO1,CO2". */
export async function addBlueprint(v: Record<string, string>) {
  const opts = await act(() => api<QbOptions>(`${Q}/options`));
  if (!opts.ok) return opts;
  const subject = opts.data.subjects.find((s) => s.id === v.subjectId);
  const sections = (v.sections ?? '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const [name, count, marks, type, bloom, difficulty, cover] = line.split(';').map((x) => x.trim());
      const coverage = (cover ?? '')
        .split(',')
        .map((c) => subject?.outcomes.find((o) => o.code === c.trim())?.id)
        .filter((x): x is string => !!x);
      return { name, count: Number(count), questionMarks: Number(marks), type: type || undefined, bloom: counts(bloom), difficulty: counts(difficulty), coverage: coverage.length ? coverage : undefined };
    });
  return send(`${Q}/blueprints`, { subjectId: v.subjectId, title: v.title, totalMarks: Number(v.totalMarks), durationMinutes: Number(v.durationMinutes), sections }, PAGE);
}

export const generatePaper = (v: Record<string, string>) => send(`${Q}/papers`, { blueprintId: v.blueprintId, title: v.title, seed: optStr(v.seed), avoidLast: v.avoidLast ? Number(v.avoidLast) : 3 }, PAGE);
export const submitPaper = (pid: string, v: Record<string, string>) => send(`${Q}/papers/${id(pid)}/submit`, { moderatorId: v.moderatorId }, PAGE);
export const decidePaper = (pid: string, v: Record<string, string>) => send(`${Q}/papers/${id(pid)}/scrutiny`, { decision: v.decision, remarks: v.remarks ?? '' }, PAGE);
export const lockPaper = (pid: string) => send(`${Q}/papers/${id(pid)}/lock`, {}, PAGE);
export const loadPaper = (pid: string) => read<QbPaperDetail>(`${Q}/papers/${id(pid)}`);
