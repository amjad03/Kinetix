'use server';

import { getI18n } from '@/i18n/server';
import { optNum, optStr as opt, read, send } from '@/lib/ops-server';
import { parseSurveyQuestions, type SeriesRow, type SeriesTrend } from '@/lib/pathways-b';
import { resolveOutcomes, type SurveyOutcome, type SurveyResults } from '@/lib/work';

const PAGE = '/surveys';
type V = Record<string, string>;

export async function createSurvey(v: V) {
  const { t } = await getI18n();
  const parsed = parseSurveyQuestions(v.questions ?? '');
  if (!parsed.ok) return { ok: false as const, error: t('wk.sv.err.line', { line: parsed.line }) };
  if (v.audience === 'section' && !opt(v.sectionId)) return { ok: false as const, error: t('wk.sv.err.section') };
  // Schedule: opening by itself needs both times, and repeating needs opening by itself.
  const auto = v.autoPublish === 'yes';
  const repeat = optNum(v.repeatEveryDays);
  if (auto && !(opt(v.opensAt) && opt(v.closesAt))) return { ok: false as const, error: t('pwb.sv.err.auto') };
  if (repeat !== undefined && (!auto || !Number.isInteger(repeat) || repeat < 1 || repeat > 366)) return { ok: false as const, error: t('pwb.sv.err.repeat') };
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
      autoPublish: auto,
      repeatEveryDays: repeat,
      seriesKey: opt(v.seriesKey),
      questions,
    },
    PAGE,
  );
}

export async function seriesTrend(key: string) {
  return read<SeriesTrend>(`/v1/surveys/series/${encodeURIComponent(key)}/trend`);
}

export async function listSeries() {
  return read<SeriesRow[]>('/v1/surveys/series');
}

/** Opens scheduled surveys whose time has come and closes the ones that ended, now. */
export async function runSchedule() {
  return send<{ opened: string[]; closed: string[] }>('/v1/surveys/schedule/run', undefined, PAGE);
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
