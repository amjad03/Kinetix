'use server';

import { optNum, optStr, send } from '@/lib/ops-server';

const F = '/v1/finance';
const PAGE = '/scholarships';
type V = Record<string, string>;

export async function createScheme(v: V) {
  return send(
    `${F}/scholarship-schemes`,
    { name: v.name, kind: v.kind, value: v.kind === 'percent' ? Number(v.percent) : Number(v.amount), minPercentage: optNum(v.minPercentage) ?? null, maxIncomePaise: optNum(v.maxIncome) ?? null, validUntil: optStr(v.validUntil) ?? null },
    PAGE,
  );
}

export async function setSchemeActive(id: string, active: boolean) {
  return send(`${F}/scholarship-schemes/${encodeURIComponent(id)}`, { active }, PAGE, 'PATCH');
}

export async function decideApplication(id: string, approve: boolean, v: V = {}) {
  return send(`${F}/scholarships/${encodeURIComponent(id)}/decide`, { approve, ...(optStr(v.note) ? { note: v.note } : {}) }, PAGE);
}
