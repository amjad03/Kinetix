'use server';

import { optStr as opt, read, send } from '@/lib/ops-server';
import type { DiaryAck } from '@/lib/school-life';

type V = Record<string, string>;

export async function createEntry(sectionId: string, v: V) {
  return send('/v1/diary', { sectionId, entryDate: opt(v.entryDate), classwork: v.classwork ?? '', homeworkNote: v.homeworkNote ?? '', notice: v.notice ?? '' }, '/diary');
}

export async function loadAcks(id: string) {
  return read<DiaryAck[]>(`/v1/diary/${encodeURIComponent(id)}/acknowledgements`);
}
