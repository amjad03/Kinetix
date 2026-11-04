'use server';

import { read } from '@/lib/ops-server';
import type { LiveBoard } from '@/lib/transport-pass';
import type { ActionResult } from '@/lib/types';

/** The live board again (the page polls it while it is open). */
export async function refreshLive(): Promise<ActionResult<LiveBoard>> {
  return read<LiveBoard>('/v1/transport/live');
}
