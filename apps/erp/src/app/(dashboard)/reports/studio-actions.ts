'use server';

import { revalidatePath } from 'next/cache';
import { getI18n } from '@/i18n/server';
import { act, api } from '@/lib/api';
import type { Catalogue, DashboardDoc, Definition, Filter, Person, ReportDoc, ScheduleRun, Source, StudioResult, Widget, WidgetData } from '@/lib/report-studio';
import type { ActionResult } from '@/lib/types';

// Server actions of the report studio: every call goes to /v1/analytics/studio with the person's session.

const S = '/v1/analytics/studio';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KEY = /^[a-z0-9_.]{3,80}$/;
const FIELD = /^[a-z_][a-z0-9_]{0,39}$/;
const bad = <T>(): ActionResult<T> => ({ ok: false, error: 'Not found.' });
const lang = async () => (await getI18n()).locale;
const done = <T>(res: ActionResult<T>, ...paths: string[]) => {
  if (res.ok) for (const p of paths) revalidatePath(p);
  return res;
};

export async function loadCatalogue(): Promise<ActionResult<Catalogue>> {
  return act(async () => api<Catalogue>(`${S}/catalogue?lang=${await lang()}`));
}

/** The live preview of an unsaved definition. */
export async function previewReport(dataset: string, definition: Definition, runtime: Filter[] = []): Promise<ActionResult<StudioResult>> {
  if (!FIELD.test(dataset)) return bad();
  return act(async () => api<StudioResult>(`${S}/preview`, { method: 'POST', body: { dataset, definition, runtime, lang: await lang() }, timeoutMs: 30_000 }));
}

/** Runs a saved or library report with the viewer's quick filters. */
export async function runReport(source: { reportId: string } | { libraryKey: string }, runtime: Filter[] = []): Promise<ActionResult<StudioResult>> {
  const path = 'reportId' in source ? (UUID.test(source.reportId) ? `${S}/reports/${source.reportId}/run` : null) : KEY.test(source.libraryKey) ? `${S}/library/${source.libraryKey}/run` : null;
  if (!path) return bad();
  return act(async () => api<StudioResult>(path, { method: 'POST', body: { runtime, lang: await lang() }, timeoutMs: 30_000 }));
}

/** The rows behind one summary cell. */
export async function drillReport(source: Source, cell: { ref: string; value: string | number | boolean | null }[], runtime: Filter[] = []): Promise<ActionResult<StudioResult>> {
  return act(async () => api<StudioResult>(`${S}/drill`, { method: 'POST', body: { source, cell, runtime, lang: await lang() }, timeoutMs: 30_000 }));
}

export async function fieldValues(dataset: string, field: string, q = ''): Promise<ActionResult<{ value: string; label: string }[]>> {
  if (!FIELD.test(dataset) || !FIELD.test(field)) return bad();
  return act(async () => api<{ value: string; label: string }[]>(`${S}/datasets/${dataset}/values/${field}?lang=${await lang()}&q=${encodeURIComponent(q.slice(0, 60))}`));
}

export async function checkFormula(dataset: string, expr: string, kind: 'row' | 'measure', definition: Definition): Promise<ActionResult<{ ok: boolean; type?: string; error?: string }>> {
  if (!FIELD.test(dataset)) return bad();
  return act(() => api<{ ok: boolean; type?: string; error?: string }>(`${S}/formula`, { method: 'POST', body: { dataset, expr, kind, definition } }));
}

// ----- saved reports ----------------------------------------------------------------------------------

export interface SaveInput {
  name: string;
  description: string;
  folder: string;
  sharedRoles: string[];
  dataset: string;
  definition: Definition;
  sourceLibraryKey?: string;
}

export async function saveReport(input: SaveInput, id?: string): Promise<ActionResult<{ id: string }>> {
  if (id && !UUID.test(id)) return bad();
  const res = await act(() => api<{ id: string }>(id ? `${S}/reports/${id}` : `${S}/reports`, { method: id ? 'PUT' : 'POST', body: input }));
  return done(res, '/reports/custom');
}

export async function updateReportMeta(id: string, meta: { name?: string; description?: string; folder?: string; sharedRoles?: string[] }): Promise<ActionResult<undefined>> {
  if (!UUID.test(id)) return bad();
  const res = await act(() => api(`${S}/reports/${id}`, { method: 'PATCH', body: meta }));
  return done(res.ok ? { ok: true, data: undefined } : res, '/reports/custom');
}

export async function duplicateReport(id: string): Promise<ActionResult<{ id: string }>> {
  if (!UUID.test(id)) return bad();
  return done(await act(() => api<{ id: string }>(`${S}/reports/${id}/duplicate`, { method: 'POST', body: {} })), '/reports/custom');
}

export async function deleteReport(id: string): Promise<ActionResult<undefined>> {
  if (!UUID.test(id)) return bad();
  return done(await act(() => api<undefined>(`${S}/reports/${id}`, { method: 'DELETE' })), '/reports/custom', '/reports/dashboards');
}

export async function setFavourite(ref: string, on: boolean): Promise<ActionResult<undefined>> {
  if (!/^(custom:[0-9a-f-]{36}|lib:[a-z0-9_.]{3,80})$/.test(ref)) return bad();
  return done(await act(() => api<undefined>(`${S}/favourites`, { method: 'PUT', body: { ref, on } })), '/reports/custom', '/reports/library');
}

export async function renameFolder(from: string, to: string): Promise<ActionResult<{ moved: number }>> {
  return done(await act(() => api<{ moved: number }>(`${S}/folders/rename`, { method: 'POST', body: { from, to } })), '/reports/custom');
}

export async function loadReport(ref: string): Promise<ActionResult<ReportDoc>> {
  if (ref.startsWith('custom:') && UUID.test(ref.slice(7))) return act(() => api<ReportDoc>(`${S}/reports/${ref.slice(7)}`)).then((r) => (r.ok ? { ok: true as const, data: { ...r.data, title: (r.data as unknown as { name: string }).name } } : r));
  if (ref.startsWith('lib:') && KEY.test(ref.slice(4))) return act(async () => api<ReportDoc>(`${S}/library/${ref.slice(4)}?lang=${await lang()}`));
  return bad();
}

// ----- schedules --------------------------------------------------------------------------------------

export interface ScheduleInput {
  name: string;
  frequency: 'daily' | 'weekly' | 'monthly';
  hour: number;
  weekday: number;
  monthDay: number;
  format: 'csv' | 'xlsx' | 'pdf';
  runtime: Filter[];
  recipients: { emails: string[]; userIds: string[]; roles: string[] };
}

export async function createSchedule(source: { reportId: string } | { libraryKey: string }, input: ScheduleInput): Promise<ActionResult<{ id: string }>> {
  return done(await act(async () => api<{ id: string }>(`${S}/schedules`, { method: 'POST', body: { source, ...input, lang: await lang() } })), '/reports/schedules');
}

export async function updateSchedule(id: string, patch: Partial<ScheduleInput> & { active?: boolean }): Promise<ActionResult<undefined>> {
  if (!UUID.test(id)) return bad();
  const res = await act(() => api(`${S}/schedules/${id}`, { method: 'PATCH', body: patch }));
  return done(res.ok ? { ok: true, data: undefined } : res, '/reports/schedules');
}

export async function deleteSchedule(id: string): Promise<ActionResult<undefined>> {
  if (!UUID.test(id)) return bad();
  return done(await act(() => api<undefined>(`${S}/schedules/${id}`, { method: 'DELETE' })), '/reports/schedules');
}

export async function runScheduleNow(id: string): Promise<ActionResult<{ ok: boolean; error?: string; rows: number; recipients: number }>> {
  if (!UUID.test(id)) return bad();
  return done(await act(() => api<{ ok: boolean; error?: string; rows: number; recipients: number }>(`${S}/schedules/${id}/run-now`, { method: 'POST', body: {}, timeoutMs: 60_000 })), '/reports/schedules');
}

export async function scheduleRuns(id: string): Promise<ActionResult<ScheduleRun[]>> {
  if (!UUID.test(id)) return bad();
  return act(() => api<ScheduleRun[]>(`${S}/schedules/${id}/runs`));
}

export async function findPeople(q: string): Promise<ActionResult<Person[]>> {
  return act(() => api<Person[]>(`${S}/people?q=${encodeURIComponent(q.slice(0, 60))}`));
}

// ----- dashboards -------------------------------------------------------------------------------------

export interface DashboardInput {
  name: string;
  description: string;
  widgets: Widget[];
  sharedRoles: string[];
  defaultForRoles: string[];
}

export async function saveDashboard(input: DashboardInput, id?: string): Promise<ActionResult<{ id: string }>> {
  if (id && !UUID.test(id)) return bad();
  const res = await act(() => api<{ id: string }>(id ? `${S}/dashboards/${id}` : `${S}/dashboards`, { method: id ? 'PUT' : 'POST', body: input }));
  return done(res, '/reports/dashboards', ...(id ? [`/reports/dashboards/${id}`] : []));
}

export async function duplicateDashboard(id: string): Promise<ActionResult<{ id: string }>> {
  if (!UUID.test(id)) return bad();
  return done(await act(() => api<{ id: string }>(`${S}/dashboards/${id}/duplicate`, { method: 'POST', body: {} })), '/reports/dashboards');
}

export async function deleteDashboard(id: string): Promise<ActionResult<undefined>> {
  if (!UUID.test(id)) return bad();
  return done(await act(() => api<undefined>(`${S}/dashboards/${id}`, { method: 'DELETE' })), '/reports/dashboards');
}

export async function dashboardData(id: string, period?: string): Promise<ActionResult<{ widgets: WidgetData[] }>> {
  if (!UUID.test(id)) return bad();
  return act(async () => api<{ widgets: WidgetData[] }>(`${S}/dashboards/${id}/data`, { method: 'POST', body: { lang: await lang(), ...(period ? { period } : {}) }, timeoutMs: 60_000 }));
}

export async function loadDashboard(id: string): Promise<ActionResult<DashboardDoc>> {
  if (!UUID.test(id)) return bad();
  return act(() => api<DashboardDoc>(`${S}/dashboards/${id}`));
}
