'use server';

import { revalidatePath } from 'next/cache';
import { getI18n } from '@/i18n/server';
import { act, api } from '@/lib/api';
import { SETTING_KEYS, type InstitutionSettings, type SettingKey } from '@/lib/settings';
import type { ActionResult } from '@/lib/types';

/** Changes one institution setting (PUT /v1/admin/settings takes a partial body). */
export async function saveSetting(key: SettingKey, value: boolean): Promise<ActionResult<InstitutionSettings>> {
  if (!SETTING_KEYS.includes(key) || typeof value !== 'boolean') return { ok: false, error: (await getI18n()).t('error.VALIDATION') };
  const res = await act(() => api<InstitutionSettings>('/v1/admin/settings', { method: 'PUT', body: { [key]: value } }));
  if (res.ok) {
    revalidatePath('/settings');
    revalidatePath('/live', 'layout');
  }
  return res;
}
