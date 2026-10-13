'use server';

import { revalidatePath } from 'next/cache';
import { getI18n } from '@/i18n/server';
import { act, api } from '@/lib/api';
import type { ApplicationDetail, StudentProfile } from '@/lib/admissions';
import type { ActionResult } from '@/lib/types';
import { naturalCompare } from '@/lib/natural';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const bad = async (): Promise<ActionResult<never>> => ({ ok: false, error: (await getI18n()).t('adm.err.invalid') });
/** Optional extras: a role that cannot read them simply does not see them. */
const maybe = <T,>(p: Promise<T>): Promise<T | null> => p.catch(() => null);

export interface SheetOverview {
  profile: StudentProfile;
  cgpa: number | null;
}
export interface SheetAttendance {
  thresholdPct: number;
  rows: { subject: string; pct: number | null; effectivePct: number | null; present: number; absent: number; late: number; short: boolean }[];
}
export interface SheetMarks {
  assessments: { id: string; title: string; subject: string; maxMarks: number; marks: number | null; absent: boolean; classAverage: number | null; heldOn: string | null }[];
  subjects: { subject: string; percent: number }[];
}
export interface SheetFees {
  duePaise: number;
  invoices: { id: string; title: string; amountPaise: number; paidPaise: number; dueOn: string; status: string }[];
  payments: { id: string; title: string; amountPaise: number; method: string; receiptNo: string | null; paidAt: string | null }[];
}
export interface SheetDocuments {
  docs: { key: string; label: string; required: boolean; status: 'pending' | 'verified' | 'rejected' | 'missing' }[];
}

export async function sheetOverview(id: string): Promise<ActionResult<SheetOverview>> {
  if (!UUID.test(id)) return bad();
  return act(async () => {
    const [profile, results] = await Promise.all([api<StudentProfile>(`/v1/students/${id}/profile`), maybe(api<{ cgpa: number | null }>(`/v1/results/students/${id}`))]);
    return { profile, cgpa: results?.cgpa ?? null };
  });
}

export async function sheetAttendance(id: string, sectionId: string): Promise<ActionResult<SheetAttendance>> {
  if (!UUID.test(id) || !UUID.test(sectionId)) return bad();
  return act(async () => {
    const r = await api<{ thresholdPct: number; rows: (SheetAttendance['rows'][number] & { studentId: string })[] }>(`/v1/attendance/shortage?sectionId=${sectionId}&all=true`);
    return { thresholdPct: r.thresholdPct, rows: r.rows.filter((x) => x.studentId === id).map(({ subject, pct, effectivePct, present, absent, late, short }) => ({ subject, pct, effectivePct, present, absent, late, short })) };
  });
}

export async function sheetMarks(id: string): Promise<ActionResult<SheetMarks>> {
  if (!UUID.test(id)) return bad();
  return act(() => api<SheetMarks>(`/v1/marks/students/${id}`));
}

export async function sheetFees(id: string): Promise<ActionResult<SheetFees>> {
  if (!UUID.test(id)) return bad();
  return act(() => api<SheetFees>(`/v1/fees/students/${id}`));
}

export async function sheetDocuments(applicationId: string): Promise<ActionResult<SheetDocuments>> {
  if (!UUID.test(applicationId)) return bad();
  return act(async () => {
    const a = await api<ApplicationDetail>(`/v1/admissions/applications/${applicationId}`);
    const specs = a.cycle.documents.length ? a.cycle.documents : a.documents.map((d) => ({ key: d.docKey, label: d.docKey, required: false }));
    return {
      docs: specs.map((s) => {
        const up = a.documents.filter((d) => d.docKey === s.key).sort((x, y) => naturalCompare(y.uploadedAt, x.uploadedAt))[0];
        return { key: s.key, label: s.label, required: s.required, status: up ? up.status : 'missing' };
      }),
    };
  });
}

/** Reminds the families of these students about everything still due (POST /v1/fees/reminders). */
export async function sendFeeReminders(studentIds: string[]): Promise<ActionResult<{ reminded: number; skipped: number }>> {
  const ids = [...new Set(studentIds)].filter((x) => UUID.test(x)).slice(0, 500);
  if (ids.length === 0) return bad();
  const res = await act(() => api<{ reminded: number; skipped: number }>('/v1/fees/reminders', { method: 'POST', body: { studentIds: ids } }));
  if (res.ok) revalidatePath('/fees');
  return res;
}
