import 'server-only';
import type { ActivityItem } from '@/components/templates';
import { getI18n } from '@/i18n/server';
import type { MessageKey } from '@/i18n/messages';
import { api } from '@/lib/api';
import { HISTORY_VERBS, historyVerb, toActivity, type HrHistoryRow } from '@/lib/hr-flow';

/** The audit history of an HR record as Activity items; empty when the viewer may not see it. */
export async function historyFor(subjectType: string, id: string): Promise<ActivityItem[]> {
  const { t } = await getI18n();
  const rows = await api<HrHistoryRow[]>(`/v1/hr/history/${subjectType}/${id}`).catch(() => [] as HrHistoryRow[]);
  return toActivity(rows, (a) => {
    const v = historyVerb(a);
    return (HISTORY_VERBS as readonly string[]).includes(v) ? t(`hf.verb.${v}` as MessageKey) : a;
  });
}
