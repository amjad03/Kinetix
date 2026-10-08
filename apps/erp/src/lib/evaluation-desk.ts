// Types and rules for the examiner's desk (v1/evaluation/allocations): value one script, question by question.

/** One of the examiner's own valuations, from GET /v1/evaluation/allocations/mine. */
export interface MyAllocation {
  id: string;
  paperId: string;
  subject: string;
  session: string;
  dummyNo: string;
  round: number;
  status: 'pending' | 'submitted';
  total: number | null;
}
export interface MarkEntry {
  questionId: string;
  marks: number;
  comment: string | null;
}
/** One script to value: its pages, the questions with maximum marks and what the examiner has entered so far. */
export interface AllocationDetail {
  id: string;
  status: 'pending' | 'submitted';
  total: number | null;
  dummyNo: string;
  pages: { index: number; name: string; mime: string }[];
  questions: { id: string; no: string; maxMarks: number }[];
  entries: MarkEntry[];
}

/** What the examiner typed per question: marks as text, and an optional comment. */
export type MarkDraft = Record<string, { marks: string; comment: string }>;

export const draftFrom = (d: Pick<AllocationDetail, 'entries'>): MarkDraft =>
  Object.fromEntries(d.entries.map((e) => [e.questionId, { marks: String(e.marks), comment: e.comment ?? '' }]));

/**
 * The entries to save, or the question whose mark is not a number from 0 to its maximum
 * (`bad`). Blank questions are left out; `missingMarks` counts them for a submit.
 */
export function entriesFrom(
  draft: MarkDraft,
  questions: { id: string; maxMarks: number }[],
): { ok: true; entries: { questionId: string; marks: number; comment?: string }[] } | { ok: false; bad: string } {
  const entries: { questionId: string; marks: number; comment?: string }[] = [];
  for (const q of questions) {
    const d = draft[q.id];
    const raw = d?.marks.trim() ?? '';
    if (!raw) continue;
    if (!/^\d+(\.\d{1,2})?$/.test(raw) || Number(raw) > q.maxMarks) return { ok: false, bad: q.id };
    const comment = d.comment.trim();
    entries.push({ questionId: q.id, marks: Number(raw), ...(comment ? { comment } : {}) });
  }
  return { ok: true, entries };
}

/** Questions with no mark entered yet (type 0 where nothing was written). */
export const missingMarks = (draft: MarkDraft, questions: { id: string }[]): number => questions.filter((q) => !(draft[q.id]?.marks ?? '').trim()).length;

/** The running total of the valid marks typed so far. */
export function draftTotal(draft: MarkDraft, questions: { id: string; maxMarks: number }[]): number {
  const r = entriesFrom(draft, questions);
  return r.ok ? Math.round(r.entries.reduce((s, e) => s + e.marks, 0) * 100) / 100 : 0;
}
