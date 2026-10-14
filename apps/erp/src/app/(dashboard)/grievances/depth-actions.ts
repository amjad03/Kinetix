'use server';

import { read, send } from '@/lib/ops-server';
import type { UndertakingClass } from '@/lib/life';

const PAGE = '/grievances';
const id = encodeURIComponent;

/** Opens pending undertakings for every active student (of the chosen class) for the year, and tells them. */
export async function requestUndertakings(yearLabel: string, sectionId?: string) {
  return send<{ requested: number }>('/v1/welfare/undertakings/request', { yearLabel, ...(sectionId ? { sectionIds: [sectionId] } : {}) }, PAGE);
}
export async function undertakingSummary(year: string) {
  return read<{ year: string; classes: UndertakingClass[] }>(`/v1/welfare/undertakings/summary?year=${id(year)}`);
}
export async function decideAppeal(ticketId: string, decision: 'upheld' | 'overturned', note: string) {
  return send(`/v1/grievances/${id(ticketId)}/appeal-decision`, { decision, note }, PAGE);
}
