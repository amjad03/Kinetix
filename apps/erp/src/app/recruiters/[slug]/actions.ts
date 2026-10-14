'use server';

import { refuse } from '@/lib/procurement-fail';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { act, api } from '@/lib/api';
import type { Shortlist } from '@/lib/placements-depth';
import type { ActionResult } from '@/lib/types';

const SLUG = /^[a-z0-9-]{1,60}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KEY = /^[0-9a-f-]{36}\.[0-9a-f]{48}$/i;
type V = Record<string, string>;

/** The company's portal key lives in an httpOnly cookie for this institution's portal only. */
const cookieName = (slug: string) => `kx_recruiter_${slug.replace(/-/g, '_')}`;

export async function portalKey(slug: string): Promise<string | null> {
  if (!SLUG.test(slug)) return null;
  const v = (await cookies()).get(cookieName(slug))?.value ?? null;
  return v && KEY.test(v) ? v : null;
}

/** Calls the public recruiter API with the company's key. */
async function call<T>(slug: string, path: string, opts: { method?: 'GET' | 'POST' | 'PUT'; body?: unknown } = {}): Promise<ActionResult<T>> {
  if (!SLUG.test(slug)) return refuse('ivd.err.notFound');
  const key = await portalKey(slug);
  return act(() => api<T>(`/v1/public/recruiters/${slug}${path}`, { ...opts, anonymous: true, headers: key ? { 'x-recruiter-key': key } : {} }));
}

/** A company registers itself; the placement cell verifies it and sends the portal key. */
export async function registerCompany(slug: string, v: V) {
  return call<{ status: string; message: string }>(slug, '/register', {
    method: 'POST',
    body: { name: v.name, sector: v.sector ?? '', city: v.city ?? '', description: v.description ?? '', contactName: v.contactName, designation: v.designation ?? '', contactEmail: v.contactEmail, ...(v.contactPhone?.trim() ? { contactPhone: v.contactPhone.trim() } : {}), ...(v.website?.trim() ? { website: v.website.trim() } : {}) },
  });
}

/** Signs in with the portal key: it is checked against the API, then kept in the cookie. */
export async function signIn(slug: string, v: V): Promise<ActionResult<undefined>> {
  const key = (v.key ?? '').trim();
  if (!SLUG.test(slug) || !KEY.test(key)) return refuse('ivd.err.badKey');
  const r = await act(() => api(`/v1/public/recruiters/${slug}/me`, { anonymous: true, headers: { 'x-recruiter-key': key } }));
  if (!r.ok) return r;
  (await cookies()).set(cookieName(slug), key, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: `/recruiters/${slug}`, maxAge: 60 * 60 * 24 * 30 });
  revalidatePath(`/recruiters/${slug}`);
  return { ok: true, data: undefined };
}

export async function signOut(slug: string): Promise<ActionResult<undefined>> {
  if (!SLUG.test(slug)) return refuse('ivd.err.notFound');
  (await cookies()).delete({ name: cookieName(slug), path: `/recruiters/${slug}` });
  revalidatePath(`/recruiters/${slug}`);
  return { ok: true, data: undefined };
}

/** Posts a job description; the placement cell reviews the draft drive and opens it. */
export async function postJob(slug: string, v: V) {
  const n = (s: string | undefined) => (s && s.trim() ? Number(s) : undefined);
  const r = await call<{ id: string }>(slug, '/drives', {
    method: 'POST',
    body: { title: v.title, kind: v.kind || 'placement', roleTitle: v.roleTitle, description: v.description, location: v.location ?? '', skills: v.skills ?? '', bond: v.bond ?? '', ...(n(v.ctcLpa) !== undefined ? { ctcLpa: n(v.ctcLpa) } : {}), ...(n(v.stipend) !== undefined ? { stipendMonthly: Math.round(n(v.stipend)! / 100) } : {}), ...(n(v.minCgpa) !== undefined ? { minCgpa: n(v.minCgpa) } : {}), ...(n(v.maxBacklogs) !== undefined ? { maxBacklogs: n(v.maxBacklogs) } : {}), ...(v.driveDate?.trim() ? { driveDate: v.driveDate } : {}) },
  });
  if (r.ok) revalidatePath(`/recruiters/${slug}`);
  return r;
}

export async function loadShortlist(slug: string, driveId: string) {
  if (!UUID.test(driveId)) return refuse('ivd.err.notFound');
  return call<Shortlist>(slug, `/drives/${driveId}/shortlist`);
}

/** One round's results by roll number: lines of "roll number, pass|fail|absent[, note]". */
export async function uploadResults(slug: string, driveId: string, roundId: string, lines: string): Promise<ActionResult<unknown>> {
  if (!UUID.test(driveId) || !UUID.test(roundId)) return refuse('ivd.err.notFound');
  const results = lines
    .split(/\r?\n/)
    .map((l) => l.split(',').map((x) => x.trim()))
    .filter((p) => p[0])
    .map(([rollNo, result, ...note]) => ({ rollNo, result: (result ?? '').toLowerCase(), note: note.join(', ') }));
  const bad = results.find((r) => !['pass', 'fail', 'absent'].includes(r.result));
  if (!results.length || bad) return bad ? refuse('ivd.err.lines', { roll: bad.rollNo }) : refuse('ivd.err.nothing');
  const r = await call(slug, `/drives/${driveId}/rounds/${roundId}/results`, { method: 'PUT', body: { results } });
  if (r.ok) revalidatePath(`/recruiters/${slug}`);
  return r;
}

/** The employer's feedback on the institution's graduates. */
export async function giveFeedback(slug: string, v: V) {
  const r = (k: string) => Number(v[k]);
  return call(slug, '/feedback', { method: 'POST', body: { respondentName: v.respondentName, ...(v.respondentEmail?.trim() ? { respondentEmail: v.respondentEmail.trim() } : {}), year: Number(v.year), r1: r('r1'), r2: r('r2'), r3: r('r3'), r4: r('r4'), r5: r('r5'), overall: r('overall'), comments: v.comments ?? '' } });
}
