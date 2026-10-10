'use server';

import { optNum, optStr, send } from '@/lib/ops-server';
import type { PickedFile } from '@/lib/pathways-b';

const BODIES = ['naac', 'nba', 'nirf'];
const blob = (f: PickedFile | null) => (f ? { file: { filename: f.filename, contentType: f.contentType, contentBase64: f.contentBase64 } } : {});

/** Adds evidence (a link, a note or an uploaded file) to one metric. */
export async function uploadMetricEvidence(body: string, cycle: string, v: Record<string, string>, file: PickedFile | null) {
  if (!BODIES.includes(body)) return { ok: false as const, error: 'Unknown framework' };
  return send(`/v1/accreditation/${body}/metrics/${encodeURIComponent(v.code ?? '')}/evidence`, { cycle, title: v.title, ...(optStr(v.note) ? { note: v.note } : {}), ...blob(file) }, `/accreditation/${body}`);
}

/** A teacher's own evidence, with an optional file. */
export async function addMyEvidence(v: Record<string, string>, file: PickedFile | null) {
  return send('/v1/accreditation/my-evidence', { kind: v.kind, title: v.title, venue: v.venue ?? '', ...(optNum(v.year) !== undefined ? { year: optNum(v.year) } : {}), ...(optStr(v.url) ? { url: v.url } : {}), ...blob(file) }, '/accreditation/my-evidence');
}
