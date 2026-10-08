'use server';

import { getI18n } from '@/i18n/server';
import { optStr as opt, read, send } from '@/lib/ops-server';
import { parseQuestions, type SurveyResults } from '@/lib/work';

const PAGE = '/surveys';
type V = Record<string, string>;

export async function createSurvey(v: V) {
  const { t } = await getI18n();
  const parsed = parseQuestions(v.questions ?? '');
  if (!parsed.ok) return { ok: false as const, error: t('wk.sv.err.line', { line: parsed.line }) };
  if (v.audience === 'section' && !opt(v.sectionId)) return { ok: false as const, error: t('wk.sv.err.section') };
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
      questions: parsed.questions,
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
