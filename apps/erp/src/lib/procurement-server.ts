import 'server-only';
import { api, ApiError } from './api';
import type { Option } from './procurement';
import type { RecordMeta } from './records';

/** A field's or filter's choices from a kit list's meta (the API words them for the person's roles). */
export function metaOptions(meta: RecordMeta | undefined, key: string): Option[] {
  if (!meta) return [];
  const f = meta.fields.find((x) => x.key === key);
  if (f && 'options' in f && Array.isArray(f.options)) return f.options.map((o) => ({ value: String(o.value), label: o.label }));
  const filter = meta.filters.find((x) => x.key === key);
  return (filter?.options ?? []).map((o) => ({ value: String(o.value), label: o.label }));
}

/** A list the person may not be allowed to read comes back empty instead of failing the page. */
export async function optional<T>(path: string, empty: T): Promise<T> {
  try {
    return await api<T>(path);
  } catch (e) {
    if (e instanceof ApiError && (e.status === 403 || e.status === 404)) return empty;
    throw e;
  }
}

/** The first of the page's search parameters as a string. */
export const param = (sp: Record<string, string | string[] | undefined>, key: string) => {
  const v = sp[key];
  return Array.isArray(v) ? v[0] : v;
};
