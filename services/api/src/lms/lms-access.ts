/** Content access rules for course items: release date, a prerequisite to finish first, and remedial audiences. */

export interface AccessRules {
  id: string;
  releaseAt: Date | null;
  prerequisiteItemId: string | null;
  audienceStudentIds: string[] | null;
}

export type Access = { visible: false } | { visible: true; locked: false } | { visible: true; locked: true; reason: 'prerequisite'; prerequisiteItemId: string };

/**
 * What a student sees of an item: hidden before its release and when it is meant for other students (remedial
 * work for a few), locked until its prerequisite is completed.
 */
export function itemAccess(item: AccessRules, studentId: string, now: Date, completed: ReadonlySet<string>): Access {
  if (item.releaseAt && item.releaseAt.getTime() > now.getTime()) return { visible: false };
  if (item.audienceStudentIds?.length && !item.audienceStudentIds.includes(studentId)) return { visible: false };
  if (item.prerequisiteItemId && !completed.has(item.prerequisiteItemId)) return { visible: true, locked: true, reason: 'prerequisite', prerequisiteItemId: item.prerequisiteItemId };
  return { visible: true, locked: false };
}

/** Item analysis for a question: difficulty (share answering correctly) and discrimination (upper 27% minus lower 27%). */
export function itemStats(scores: { total: number; correct: boolean }[]): { attempts: number; difficulty: number | null; discrimination: number | null } {
  const n = scores.length;
  if (n === 0) return { attempts: 0, difficulty: null, discrimination: null };
  const difficulty = Math.round((scores.filter((s) => s.correct).length / n) * 100) / 100;
  const k = Math.floor(n * 0.27);
  if (k < 1) return { attempts: n, difficulty, discrimination: null };
  const sorted = [...scores].sort((a, b) => b.total - a.total);
  const share = (xs: typeof scores) => xs.filter((s) => s.correct).length / xs.length;
  return { attempts: n, difficulty, discrimination: Math.round((share(sorted.slice(0, k)) - share(sorted.slice(-k))) * 100) / 100 };
}

/** Grades an answer to a choice or short question; null for questions a person must mark (code without a runner). */
export function gradeAnswer(q: { kind: string; options: { text: string; correct: boolean }[]; answer: string; marks: number }, given: unknown): { correct: boolean; marks: number } | null {
  if (q.kind === 'mcq' || q.kind === 'multi') {
    const right = q.options.map((o, i) => (o.correct ? i : -1)).filter((i) => i >= 0).sort();
    const picked = (Array.isArray(given) ? given : given === undefined || given === null || given === '' ? [] : [given]).map(Number).filter((x) => Number.isInteger(x)).sort();
    const ok = picked.length === right.length && picked.every((x, i) => x === right[i]);
    return { correct: ok, marks: ok ? q.marks : 0 };
  }
  if (q.kind === 'short') {
    const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
    const ok = typeof given === 'string' && q.answer.split('|').map(norm).filter(Boolean).includes(norm(given));
    return { correct: ok, marks: ok ? q.marks : 0 };
  }
  return null;
}
