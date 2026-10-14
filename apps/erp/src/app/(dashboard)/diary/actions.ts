'use server';

import { read } from '@/lib/ops-server';
import type { DiaryAck } from '@/lib/school-life';

// Entries are written, corrected and deleted through the record kit (records-actions.ts).

/** Every student of the entry's class and whether a guardian has read it. */
export async function loadAcks(id: string) {
  return read<DiaryAck[]>(`/v1/diary/${encodeURIComponent(id)}/acknowledgements`);
}
