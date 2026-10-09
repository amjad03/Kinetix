// Server-side helpers for the projects, careers and research actions.

import { getI18n } from '@/i18n/server';
import type { ParseError } from '@/lib/pathways-a';

/** The user-facing message for a line the typed text formats could not read. */
export async function parseFailure(e: ParseError): Promise<{ ok: false; error: string }> {
  const { t } = await getI18n();
  const key = { empty: 'pw.err.empty', line: 'pw.err.line', range: 'pw.err.range', many: 'pw.err.many', dup: 'pw.err.dup' } as const;
  return { ok: false, error: t(key[e.code], { line: e.line }) };
}

/** An error in the user's language, for checks the actions make themselves. */
export async function failure(key: 'pw.err.number' | 'pw.err.fileType' | 'pw.err.fileSize'): Promise<{ ok: false; error: string }> {
  const { t } = await getI18n();
  return { ok: false, error: t(key) };
}
