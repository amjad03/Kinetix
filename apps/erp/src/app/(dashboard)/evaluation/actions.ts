'use server';

import { revalidatePath } from 'next/cache';
import { getI18n } from '@/i18n/server';
import { act, api } from '@/lib/api';
import { send } from '@/lib/ops-server';
import { parseQuestions } from '@/lib/evaluation';
import type { ActionResult } from '@/lib/types';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PAGE = '/evaluation';
const base = (paperId: string) => `/v1/evaluation/papers/${encodeURIComponent(paperId)}`;

async function bad(key: Parameters<Awaited<ReturnType<typeof getI18n>>['t']>[0]): Promise<{ ok: false; error: string }> {
  return { ok: false, error: (await getI18n()).t(key) };
}

export async function saveConfig(paperId: string, v: Record<string, string>) {
  const body = { perExaminerCap: Number(v.perExaminerCap), secondSharePercent: Number(v.secondSharePercent), thresholdMarks: Number(v.thresholdMarks) };
  if (!UUID.test(paperId) || Object.values(body).some((n) => !Number.isFinite(n) || n < 0)) return bad('ev.err.numbers');
  return send(`${base(paperId)}/config`, body, PAGE, 'PUT');
}

export async function saveQuestions(paperId: string, v: Record<string, string>) {
  const questions = parseQuestions(v.questions ?? '');
  if (!UUID.test(paperId) || !questions) return bad('ev.err.questions');
  return send(`${base(paperId)}/questions`, { questions }, PAGE, 'PUT');
}

export async function uploadScript(paperId: string, form: FormData): Promise<ActionResult<{ dummyNo: string }>> {
  const files = form.getAll('files').filter((f): f is File => f instanceof File && f.size > 0);
  if (!UUID.test(paperId) || !String(form.get('rollNo') ?? '').trim() || files.length === 0) return bad('ev.err.upload');
  const res = await act(() => api<{ dummyNo: string }>(`${base(paperId)}/scripts`, { method: 'POST', form, timeoutMs: 120_000 }));
  if (res.ok) revalidatePath(PAGE);
  return res;
}

export async function allocate(paperId: string, examinerIds: string[]) {
  if (!UUID.test(paperId) || examinerIds.length === 0 || examinerIds.some((i) => !UUID.test(i))) return bad('ev.err.examiners');
  return send<{ first: number; third: number }>(`${base(paperId)}/allocate`, { examinerIds }, PAGE);
}

export async function secondValuation(paperId: string, examinerIds: string[]) {
  if (!UUID.test(paperId) || examinerIds.length === 0 || examinerIds.some((i) => !UUID.test(i))) return bad('ev.err.examiners');
  return send<{ picked: number }>(`${base(paperId)}/second-valuation`, { examinerIds }, PAGE);
}

export async function finalise(paperId: string) {
  if (!UUID.test(paperId)) return bad('ev.err.numbers');
  return send<{ pushed: number }>(`${base(paperId)}/finalise`, undefined, PAGE);
}
