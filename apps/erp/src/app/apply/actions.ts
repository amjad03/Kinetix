'use server';

import { getI18n } from '@/i18n/server';
import { act, api } from '@/lib/api';
import type { PublicApplication } from '@/lib/admissions';
import type { ActionResult } from '@/lib/types';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG = /^[a-z0-9-]{1,64}$/;
const base = (slug: string) => `/v1/public/admissions/${slug}`;
const bad = async (): Promise<ActionResult<never>> => ({ ok: false, error: (await getI18n()).t('adm.err.invalid') });

export async function submitEnquiry(slug: string, input: { name: string; phone: string; email?: string; programId?: string; message?: string; website?: string }): Promise<ActionResult<unknown>> {
  if (!SLUG.test(slug) || (input.programId && !UUID.test(input.programId))) return bad();
  const body = { name: input.name.trim(), phone: input.phone.trim(), website: input.website, ...(input.email?.trim() ? { email: input.email.trim() } : {}), ...(input.programId ? { programId: input.programId } : {}), ...(input.message?.trim() ? { message: input.message.trim() } : {}) };
  return act(() => api(`${base(slug)}/enquiries`, { method: 'POST', body, anonymous: true }));
}

export interface ApplyInput {
  applicantName: string;
  dateOfBirth?: string;
  gender?: string;
  phone: string;
  email?: string;
  guardianName: string;
  guardianPhone: string;
  guardianEmail?: string;
  guardianRelation: string;
  answers: Record<string, string | number>;
  website?: string;
}

/** Submits the application. The applicant's secret token comes back once, in the tracking link. */
export async function submitApplication(slug: string, cycleId: string, input: ApplyInput): Promise<ActionResult<{ id: string; token: string; applicationNo: string; feeDuePaise: number }>> {
  if (!SLUG.test(slug) || !UUID.test(cycleId)) return bad();
  const clean = (v?: string) => (v?.trim() ? v.trim() : undefined);
  const body = { ...input, dateOfBirth: clean(input.dateOfBirth), gender: clean(input.gender), email: clean(input.email), guardianEmail: clean(input.guardianEmail) };
  return act(() => api(`${base(slug)}/cycles/${cycleId}/applications`, { method: 'POST', body, anonymous: true }));
}

const guard = (slug: string, id: string, token: string) => SLUG.test(slug) && UUID.test(id) && token.length > 10 && token.length < 100;

export async function uploadDocument(slug: string, id: string, token: string, key: string, form: FormData): Promise<ActionResult<unknown>> {
  if (!guard(slug, id, token) || !/^[a-z][a-z0-9_]{1,40}$/.test(key)) return bad();
  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0) return bad();
  const out = new FormData();
  out.set('file', file, file.name);
  return act(() => api(`${base(slug)}/applications/${id}/documents/${key}`, { method: 'POST', form: out, headers: { 'x-application-token': token }, anonymous: true, timeoutMs: 60_000 }));
}

export async function respondToOffer(slug: string, id: string, token: string, to: 'accept' | 'decline' | 'withdraw'): Promise<ActionResult<PublicApplication>> {
  if (!guard(slug, id, token)) return bad();
  const path = to === 'withdraw' ? 'withdraw' : `offer/${to}`;
  return act(() => api<PublicApplication>(`${base(slug)}/applications/${id}/${path}`, { method: 'POST', body: {}, headers: { 'x-application-token': token }, anonymous: true }));
}

export interface FeeCheckout {
  paymentId: string;
  provider: string;
  keyId: string;
  orderId: string;
  amountPaise: number;
  currency: string;
  name: string;
  description: string;
  prefill: { name: string; email: string; contact: string };
}

export async function startFee(slug: string, id: string, token: string): Promise<ActionResult<FeeCheckout>> {
  if (!guard(slug, id, token)) return bad();
  return act(() => api<FeeCheckout>(`${base(slug)}/applications/${id}/fee/checkout`, { method: 'POST', body: {}, headers: { 'x-application-token': token }, anonymous: true }));
}

export async function confirmFee(slug: string, id: string, token: string, input: { paymentId: string; providerPaymentId: string; signature: string }): Promise<ActionResult<PublicApplication>> {
  if (!guard(slug, id, token) || !UUID.test(input.paymentId)) return bad();
  return act(() => api<PublicApplication>(`${base(slug)}/applications/${id}/fee/confirm`, { method: 'POST', body: input, headers: { 'x-application-token': token }, anonymous: true }));
}
