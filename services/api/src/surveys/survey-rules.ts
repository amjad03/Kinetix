/** Pure survey rules: who is in the audience, when answers are accepted, how answers are checked and summed. */

export type Audience = 'students' | 'section' | 'staff' | 'guardians';
export type QuestionKind = 'single' | 'multiple' | 'rating' | 'text';

export interface QuestionDef {
  id: string;
  kind: QuestionKind;
  prompt: string;
  options: string[];
  required: boolean;
}

/** What one respondent sent for one question. */
export interface AnswerInput {
  questionId: string;
  choices?: string[];
  rating?: number;
  text?: string;
}

/** Facts about a signed-in user used to decide which surveys are theirs. */
export interface Respondent {
  roles: string[];
  /** The section of their own student record, or null when they have none. */
  studentSectionId: string | null;
  isStudent: boolean;
  isGuardian: boolean;
}

const FAMILY_ROLES = ['student', 'guardian'];

export const isStaff = (r: Pick<Respondent, 'roles'>) => r.roles.some((x) => !FAMILY_ROLES.includes(x));

export function inAudience(s: { audience: Audience; sectionId: string | null }, r: Respondent): boolean {
  switch (s.audience) {
    case 'students':
      return r.isStudent;
    case 'section':
      return r.isStudent && !!s.sectionId && r.studentSectionId === s.sectionId;
    case 'guardians':
      return r.isGuardian;
    case 'staff':
      return isStaff(r);
  }
}

/** Answers are accepted while the survey is open and the current time is inside its window. */
export function acceptsAnswers(s: { status: string; opensAt: Date | null; closesAt: Date | null }, now: Date): boolean {
  if (s.status !== 'open') return false;
  if (s.opensAt && now < s.opensAt) return false;
  if (s.closesAt && now >= s.closesAt) return false;
  return true;
}

/** A question's definition is consistent: choice questions have two or more distinct options, others none. */
export function questionProblem(q: { kind: QuestionKind; options: string[] }): string | null {
  if (q.kind === 'single' || q.kind === 'multiple') {
    const opts = q.options.map((o) => o.trim());
    if (opts.length < 2) return 'A choice question needs at least two options';
    if (opts.some((o) => !o)) return 'Options cannot be blank';
    if (new Set(opts).size !== opts.length) return 'Options must be different from each other';
  } else if (q.options.length > 0) {
    return 'Only choice questions have options';
  }
  return null;
}

export interface CleanAnswer {
  questionId: string;
  choices: string[];
  rating: number | null;
  text: string | null;
}

/** Checks a submission against the questions. Returns the cleaned answers or the first problem found. */
export function checkAnswers(questions: QuestionDef[], given: AnswerInput[]): { ok: true; answers: CleanAnswer[] } | { ok: false; error: string } {
  const byQ = new Map<string, AnswerInput>();
  for (const a of given) {
    if (byQ.has(a.questionId)) return { ok: false, error: 'A question was answered twice' };
    byQ.set(a.questionId, a);
  }
  const known = new Set(questions.map((q) => q.id));
  if ([...byQ.keys()].some((id) => !known.has(id))) return { ok: false, error: 'An answer is for a question that is not in this survey' };
  const out: CleanAnswer[] = [];
  for (const q of questions) {
    const a = byQ.get(q.id);
    const blank = !a || (q.kind === 'text' ? !a.text?.trim() : q.kind === 'rating' ? a.rating === undefined : !a.choices || a.choices.length === 0);
    if (blank) {
      if (q.required) return { ok: false, error: `Please answer: ${q.prompt}` };
      continue;
    }
    if (q.kind === 'rating') {
      if (!Number.isInteger(a!.rating) || a!.rating! < 1 || a!.rating! > 5) return { ok: false, error: 'A rating must be a whole number from 1 to 5' };
      out.push({ questionId: q.id, choices: [], rating: a!.rating!, text: null });
    } else if (q.kind === 'text') {
      out.push({ questionId: q.id, choices: [], rating: null, text: a!.text!.trim() });
    } else {
      const choices = [...new Set(a!.choices!)];
      if (choices.some((c) => !q.options.includes(c))) return { ok: false, error: 'An answer is not one of the options' };
      if (q.kind === 'single' && choices.length !== 1) return { ok: false, error: 'Choose exactly one option' };
      out.push({ questionId: q.id, choices, rating: null, text: null });
    }
  }
  return { ok: true, answers: out };
}

export interface QuestionSummary {
  questionId: string;
  kind: QuestionKind;
  prompt: string;
  answered: number;
  /** Choice questions: how many picked each option, in option order. */
  counts?: { option: string; count: number }[];
  /** Rating questions: how many gave each of 1 to 5, and the mean (null with no answers). */
  distribution?: number[];
  average?: number | null;
  /** Text questions: the answers, newest last. */
  texts?: string[];
}

/** Per-question counts, average rating and text answers. */
export function summarize(questions: QuestionDef[], answers: { questionId: string; choices: string[]; rating: number | null; text: string | null }[]): QuestionSummary[] {
  return questions.map((q) => {
    const mine = answers.filter((a) => a.questionId === q.id);
    const base = { questionId: q.id, kind: q.kind, prompt: q.prompt, answered: mine.length };
    if (q.kind === 'single' || q.kind === 'multiple') {
      return { ...base, counts: q.options.map((option) => ({ option, count: mine.filter((a) => a.choices.includes(option)).length })) };
    }
    if (q.kind === 'rating') {
      const rs = mine.map((a) => a.rating!).filter((r) => r != null);
      const distribution = [1, 2, 3, 4, 5].map((n) => rs.filter((r) => r === n).length);
      return { ...base, distribution, average: rs.length ? Math.round((rs.reduce((x, y) => x + y, 0) / rs.length) * 100) / 100 : null };
    }
    return { ...base, texts: mine.map((a) => a.text ?? '').filter(Boolean) };
  });
}
