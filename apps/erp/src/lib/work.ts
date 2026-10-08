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
}

const LINE = /^(single|multiple|rating|text)(\?)?\s*:\s*(.+)$/i;

/**
 * Reads the question box, one question per line: `single: How is the pace? | Slow; Right; Fast`,
 * `multiple: What helps? | Notes; Labs`, `rating: Rate the course`, `text: Any comments?`.
 * A `?` after the type (`text?: ...`) makes the question optional. Returns the first line it cannot read.
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
    const [prompt, rest = ''] = m[3].split('|').map((x) => x.trim());
    const options = rest ? rest.split(';').map((x) => x.trim()).filter(Boolean) : [];
    if (prompt.length < 3) return { ok: false, line: i + 1 };
    if ((kind === 'single' || kind === 'multiple') && new Set(options).size < 2) return { ok: false, line: i + 1 };
    if ((kind === 'rating' || kind === 'text') && options.length > 0) return { ok: false, line: i + 1 };
    questions.push({ kind, prompt, options, required: !m[2] });
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
