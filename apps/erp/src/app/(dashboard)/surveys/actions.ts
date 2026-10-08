'use server';

import { getI18n } from '@/i18n/server';
import { optStr as opt, read, send } from '@/lib/ops-server';
import { parseQuestions, resolveOutcomes, type SurveyOutcome, type SurveyResults } from '@/lib/work';

const PAGE = '/surveys';
type V = Record<string, string>;

export async function createSurvey(v: V) {
  const { t } = await getI18n();
  const parsed = parseQuestions(v.questions ?? '');
  if (!parsed.ok) return { ok: false as const, error: t('wk.sv.err.line', { line: parsed.line }) };
  if (v.audience === 'section' && !opt(v.sectionId)) return { ok: false as const, error: t('wk.sv.err.section') };
  // Rating questions may measure a course outcome (OBE indirect attainment): tagged on the line or picked for the survey.
  let questions: unknown[] = parsed.questions;
  if (parsed.questions.some((q) => q.kind === 'rating' && (q.coTag || opt(v.coId)))) {
    const outcomes = await read<SurveyOutcome[]>('/v1/surveys/outcomes');
    if (!outcomes.ok) return { ok: false as const, error: outcomes.error };
    const resolved = resolveOutcomes(parsed.questions, outcomes.data, opt(v.coId));
    if (!resolved.ok) return { ok: false as const, error: t('wk.sv.err.outcome', { tag: resolved.tag }) };
    questions = resolved.questions;
  }
  return send(
    '/v1/surveys',
    {
      title: v.title,
      description: v.description ?? '',
      audience: v.audience,
      sectionId: v.audience === 'section' ? opt(v.sectionId) : undefined,
      anonymous: v.anonymous === 'yes',
      opensAt: opt(v.opensAt),
      closesAt: opt(v.closesAt),
      questions,
    },
    PAGE,
  );
}

export async function publishSurvey(id: string) {
  return send(`/v1/surveys/${encodeURIComponent(id)}/publish`, undefined, PAGE);
}

export async function closeSurvey(id: string) {
  return send(`/v1/surveys/${encodeURIComponent(id)}/close`, undefined, PAGE);
}

export async function surveyResults(id: string) {
  return read<SurveyResults>(`/v1/surveys/${encodeURIComponent(id)}/results`);
}
