import 'server-only';
import { api, load, type Loaded } from './api';
import { apiListPath, readListState, type ListState, type RecordMeta, type RecordsPage, type Row } from './records';

/**
 * For a page that shows a kit list: its meta and the page of rows its URL asks for, loaded together.
 * `searchParams` is the page's own (the list state lives there).
 */
export async function loadRecords<R extends Row = Row>(entity: string, searchParams: Record<string, string | string[] | undefined>, defaults: { pageSize?: number; filters?: Record<string, string> } = {}): Promise<Loaded<{ meta: RecordMeta; page: RecordsPage<R>; state: ListState }>> {
  const read = readListState(searchParams, defaults);
  const state = { ...read, filters: { ...(defaults.filters ?? {}), ...read.filters } };
  return load(async () => {
    const [meta, page] = await Promise.all([api<RecordMeta>(`/v1/records/${entity}/meta`), api<RecordsPage<R>>(apiListPath(entity, state))]);
    return { meta, page, state: { ...state, page: page.page } };
  });
}
