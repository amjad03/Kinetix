// Shapes from the survey and task endpoints (services/api), and the small rules the pages use.

export type QuestionKind = 'single' | 'multiple' | 'rating' | 'text';

export interface SurveyRow {
  id: string;
  title: string;
  description: string;
  audience: 'students' | 'section' | 'staff' | 'guardians';
  sectionId: string | null;
  anonymous: boolean;
  opensAt: string | null;
  closesAt: string | null;
  status: 'draft' | 'open' | 'closed';
  responses: number;
}

export interface SurveyQuestionResult {
  questionId: string;
  kind: QuestionKind;
  prompt: string;
  answered: number;
  counts?: { option: string; count: number }[];
  distribution?: number[];
  average?: number | null;
  texts?: string[];
}

export interface SurveyResults {
  survey: { id: string; title: string; status: string; anonymous: boolean; audience: string };
  responses: number;
  questions: SurveyQuestionResult[];
}

export interface NewQuestion {
  kind: QuestionKind;
  prompt: string;
  options: string[];
  required: boolean;
  /** The course outcome tag written on a rating line (`rating@CS101/CO2:`), not yet resolved to an id. */
  coTag?: string;
}

const LINE = /^(single|multiple|rating|text)(?:@([^\s:?]+))?(\?)?\s*:\s*(.+)$/i;

/**
 * Reads the question box, one question per line: `single: How is the pace? | Slow; Right; Fast`,
 * `multiple: What helps? | Notes; Labs`, `rating: Rate the course`, `text: Any comments?`.
 * A `?` after the type (`text?: ...`) makes the question optional. A rating can name the course
 * outcome it measures (`rating@CS101/CO2: ...`, or just `rating@CO2:` when the code is unique). Returns the first line it cannot read.
 */
export function parseQuestions(input: string): { ok: true; questions: NewQuestion[] } | { ok: false; line: number } {
  const questions: NewQuestion[] = [];
  const lines = input.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i].trim();
    if (!raw) continue;
    const m = LINE.exec(raw);
    if (!m) return { ok: false, line: i + 1 };
    const kind = m[1].toLowerCase() as QuestionKind;
    const [prompt, rest = ''] = m[4].split('|').map((x) => x.trim());
    const options = rest ? rest.split(';').map((x) => x.trim()).filter(Boolean) : [];
    if (prompt.length < 3) return { ok: false, line: i + 1 };
    if ((kind === 'single' || kind === 'multiple') && new Set(options).size < 2) return { ok: false, line: i + 1 };
    if ((kind === 'rating' || kind === 'text') && options.length > 0) return { ok: false, line: i + 1 };
    if (m[2] && kind !== 'rating') return { ok: false, line: i + 1 };
    questions.push({ kind, prompt, options, required: !m[3], ...(m[2] ? { coTag: m[2] } : {}) });
  }
  return questions.length === 0 ? { ok: false, line: 1 } : { ok: true, questions };
}

/** Share of `answered` that chose this option, as a whole percent. */
export const percent = (count: number, answered: number): number => (answered === 0 ? 0 : Math.round((count / answered) * 100));

export interface TaskRow {
  id: string;
  title: string;
  description: string;
  ownerId: string;
  ownerName: string;
  assigneeId: string;
  assigneeName: string;
  dueAt: string | null;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  status: 'open' | 'in_progress' | 'done' | 'cancelled';
  sourceModule: string | null;
  sourceId: string | null;
  slaHours: number | null;
  overdue: boolean;
  version: number;
}

/** The status changes a task offers from its current status; mirrors the API. */
export function nextStatuses(status: TaskRow['status']): TaskRow['status'][] {
  switch (status) {
    case 'open':
      return ['in_progress', 'done', 'cancelled'];
    case 'in_progress':
      return ['done', 'open', 'cancelled'];
    default:
      return ['open'];
  }
}

/** 'overdue' once past the deadline, 'soon' within a day of it, else 'ok'; finished tasks and tasks without a deadline have none. */
export function dueState(t: Pick<TaskRow, 'status' | 'dueAt'>, now: number): 'overdue' | 'soon' | 'ok' | 'none' {
  if (!t.dueAt || t.status === 'done' || t.status === 'cancelled') return 'none';
  const left = Date.parse(t.dueAt) - now;
  return left < 0 ? 'overdue' : left < 86_400_000 ? 'soon' : 'ok';
}

/** An active course outcome a rating question can measure. */
export interface SurveyOutcome {
  id: string;
  code: string;
  statement: string;
  subjectCode: string;
  subjectName: string;
}

/** `CS101/CO2`, the tag that names an outcome on a question line. */
export const outcomeTag = (o: Pick<SurveyOutcome, 'subjectCode' | 'code'>): string => `${o.subjectCode}/${o.code}`;

/**
 * Turns the outcome tags on rating questions into outcome ids. A question without a tag gets
 * `defaultId` (the dialog's picker). Returns the first tag that matches no outcome, or more than one.
 */
export function resolveOutcomes<Q extends { kind: QuestionKind; coTag?: string }>(
  questions: Q[],
  outcomes: SurveyOutcome[],
  defaultId?: string,
): { ok: true; questions: (Omit<Q, 'coTag'> & { coId?: string })[] } | { ok: false; tag: string } {
  const out: (Omit<Q, 'coTag'> & { coId?: string })[] = [];
  for (const q of questions) {
    const { coTag, ...rest } = q;
    let coId: string | undefined;
    if (q.kind === 'rating') {
      if (coTag) {
        const want = coTag.toLowerCase();
        const hits = outcomes.filter((o) => outcomeTag(o).toLowerCase() === want || o.code.toLowerCase() === want);
        if (hits.length !== 1) return { ok: false, tag: coTag };
        coId = hits[0].id;
      } else coId = defaultId;
    }
    out.push(coId ? { ...rest, coId } : rest);
  }
  return { ok: true, questions: out };
}
