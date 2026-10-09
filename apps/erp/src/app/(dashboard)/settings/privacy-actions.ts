'use server';

import { getI18n } from '@/i18n/server';
import { optStr, send } from '@/lib/ops-server';
import { keepDays, type RetentionOutcome } from '@/lib/pathways-b';

const PAGE = '/settings';
const id = encodeURIComponent;
type V = Record<string, string>;

/** Creates the rule for a record kind (and category), or changes the one that is there. */
export async function saveRetentionRule(v: V) {
  const days = keepDays(v.keepDays ?? '');
  if (days === null) return { ok: false as const, error: (await getI18n()).t('pwb.ret.err.days') };
  return send('/v1/retention/rules', { target: v.target, category: (optStr(v.category) ?? '').toLowerCase(), keepDays: days, action: v.action, active: v.active !== 'no' }, PAGE, 'PUT');
}

export async function removeRetentionRule(ruleId: string) {
  return send(`/v1/retention/rules/${id(ruleId)}`, undefined, PAGE, 'DELETE');
}

/** A dry run lists what each rule would change; "run now" does it. */
export async function runRetention(dryRun: boolean) {
  return send<RetentionOutcome[]>(`/v1/retention/run?dryRun=${dryRun ? 'true' : 'false'}`, undefined, PAGE);
}

/** Shows or hides one section (attendance, class diary, report card ...) to parents. */
export async function setParentVisibility(section: string, visible: boolean) {
  return send(`/v1/parent-visibility/${id(section)}`, { visible }, PAGE, 'PUT');
}
