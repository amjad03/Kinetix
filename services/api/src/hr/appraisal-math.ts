/**
 * Faculty appraisal in the style of the UGC API / PBAS forms: a fixed set of categories, each with
 * a maximum, scored by the teacher (with evidence), reviewed by the HoD and finalised by the principal.
 */
export const APPRAISAL_CATEGORIES = [
  { key: 'teaching_learning', label: 'Teaching, learning and evaluation', max: 100 },
  { key: 'student_activities', label: 'Co-curricular, extension and student development', max: 50 },
  { key: 'research', label: 'Research, publications and academic contribution', max: 100 },
  { key: 'administration', label: 'Administration, committees and institutional service', max: 30 },
  { key: 'professional_development', label: 'Training, FDPs and professional development', max: 20 },
] as const;

export type AppraisalScores = Record<string, { score: number; evidence?: string }>;

export const APPRAISAL_MAX = APPRAISAL_CATEGORIES.reduce((n, c) => n + c.max, 0);

/** Problems with a set of scores: unknown categories or a score above its category maximum. Empty means fine. */
export function scoreProblems(scores: AppraisalScores): string[] {
  const out: string[] = [];
  for (const [key, v] of Object.entries(scores)) {
    const cat = APPRAISAL_CATEGORIES.find((c) => c.key === key);
    if (!cat) out.push(`Unknown category ${key}`);
    else if (!(v.score >= 0) || v.score > cat.max) out.push(`${cat.label}: score must be between 0 and ${cat.max}`);
  }
  return out;
}

/** The total of the scores as a percentage of the whole form (missing categories count as zero). */
export function percentOf(scores: AppraisalScores): number {
  const total = APPRAISAL_CATEGORIES.reduce((n, c) => n + Math.min(c.max, Math.max(0, scores[c.key]?.score ?? 0)), 0);
  return Math.round((total / APPRAISAL_MAX) * 10000) / 100;
}

export function gradeFor(percent: number): string {
  if (percent >= 85) return 'Outstanding';
  if (percent >= 70) return 'Very good';
  if (percent >= 55) return 'Good';
  if (percent >= 40) return 'Satisfactory';
  return 'Needs improvement';
}
