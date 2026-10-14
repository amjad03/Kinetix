'use server';

import { getI18n } from '@/i18n/server';
import { act, api } from '@/lib/api';
import type { ActionResult } from '@/lib/types';

/** Sends a public verification request to the institution (no sign-in). */
export async function askVerification(slug: string, body: { requesterName: string; organisation: string; email: string; serialNo: string; candidateName: string }): Promise<ActionResult<{ id: string; feePaise: number }>> {
  if (!/^[a-z0-9-]{1,60}$/.test(slug)) return { ok: false, error: (await getI18n()).t('error.generic') };
  return act(() => api<{ id: string; feePaise: number }>(`/v1/public/verification-requests/${slug}`, { method: 'POST', body, anonymous: true }));
}
