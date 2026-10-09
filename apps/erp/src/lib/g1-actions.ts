'use server';

import { getI18n } from '@/i18n/server';
import { deskPathAllowed } from './g1-desk';
import { read, send } from './ops-server';
import type { ActionResult } from './types';

/** The one server action behind the tabbed desks: sends a typed body to an API path these desks own, then refreshes the page. */
export async function deskSend(page: string, path: string, method: 'GET' | 'POST' | 'PUT' | 'DELETE', body: unknown): Promise<ActionResult<unknown>> {
  if (!/^\/[a-z-]+$/.test(page) || !deskPathAllowed(path) || path.includes('{')) {
    const { t } = await getI18n();
    return { ok: false, error: t('error.generic') };
  }
  if (method === 'GET') return read(path);
  return send(path, method === 'DELETE' ? undefined : body, page, method);
}
