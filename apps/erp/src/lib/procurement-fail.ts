import 'server-only';
import { getI18n } from '@/i18n/server';

/** A server action's refusal before the API is called, in the person's language. */
export async function refuse(key: 'ivd.err.notFound' | 'ivd.err.nothing' | 'ivd.err.file' | 'ivd.err.scores' | 'ivd.err.badKey' | 'ivd.err.lines', vars?: Record<string, string | number>): Promise<{ ok: false; error: string }> {
  const { t } = await getI18n();
  return { ok: false, error: t(key, vars) };
}
