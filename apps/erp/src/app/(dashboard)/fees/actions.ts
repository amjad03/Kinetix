'use server';

import { revalidatePath } from 'next/cache';
import { act, api } from '@/lib/api';
import { isIsoDate } from '@/lib/dates';
import { PAY_METHODS, type CounterMethod } from '@/lib/money';
import type { ActionResult, FeeReceipt, StudentFees } from '@/lib/types';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** The API's limits: ₹1 to ₹10 crore. */
const MIN_PAISE = 100;
const MAX_PAISE = 100_000_000_00;

const refresh = () => {
  revalidatePath('/fees');
  revalidatePath('/fees/invoices');
};

export async function issueFee(input: { sectionId: string; title: string; amountPaise: number; dueOn: string }): Promise<ActionResult<{ batchId: string; invoices: number }>> {
  const title = input.title.trim();
  if (!UUID.test(input.sectionId)) return { ok: false, error: 'Choose a class.' };
  if (!title || title.length > 120) return { ok: false, error: 'Give the fee a name (up to 120 characters), for example “Semester 3 tuition fee”.' };
  if (!Number.isSafeInteger(input.amountPaise) || input.amountPaise < MIN_PAISE || input.amountPaise > MAX_PAISE) return { ok: false, error: 'Enter an amount between ₹1 and ₹10 crore.' };
  if (!isIsoDate(input.dueOn)) return { ok: false, error: 'Choose a due date.' };
  const res = await act(() => api<{ batchId: string; invoices: number }>('/v1/fees/invoices', { method: 'POST', body: { ...input, title } }));
  if (res.ok) refresh();
  return res;
}

export interface RecordedPayment {
  receipt: FeeReceipt;
  /** For the printable receipt page; null if it could not be found (the receipt still shows). */
  paymentId: string | null;
}

export async function recordPayment(
  invoiceId: string,
  studentId: string,
  input: { amountPaise: number; method: CounterMethod; reference?: string },
): Promise<ActionResult<RecordedPayment>> {
  if (!UUID.test(invoiceId) || !UUID.test(studentId)) return { ok: false, error: 'Unknown invoice.' };
  if (!PAY_METHODS.includes(input.method)) return { ok: false, error: 'Choose how the money was paid.' };
  if (!Number.isSafeInteger(input.amountPaise) || input.amountPaise < MIN_PAISE || input.amountPaise > MAX_PAISE) return { ok: false, error: 'Enter an amount of at least ₹1.' };
  const reference = input.reference?.trim() || undefined;
  if (reference && reference.length > 100) return { ok: false, error: 'Keep the reference under 100 characters.' };
  if (input.method !== 'cash' && !reference) return { ok: false, error: 'Add the reference so the payment can be traced.' };

  const res = await act(() =>
    api<FeeReceipt>(`/v1/fees/invoices/${invoiceId}/payments`, { method: 'POST', body: { amountPaise: input.amountPaise, method: input.method, ...(reference ? { reference } : {}) } }),
  );
  if (!res.ok) return res;
  refresh();
  // The receipt does not carry the payment's id; find it by receipt number for the print view.
  let paymentId: string | null = null;
  try {
    const fees = await api<StudentFees>(`/v1/fees/students/${studentId}`);
    paymentId = fees.payments.find((p) => p.receiptNo === res.data.receiptNo)?.id ?? null;
  } catch {
    /* the receipt is shown anyway */
  }
  return { ok: true, data: { receipt: res.data, paymentId } };
}

export async function cancelInvoice(id: string): Promise<ActionResult<{ id: string; status: string }>> {
  if (!UUID.test(id)) return { ok: false, error: 'Unknown invoice.' };
  const res = await act(() => api<{ id: string; status: string }>(`/v1/fees/invoices/${id}/cancel`, { method: 'POST' }));
  if (res.ok) refresh();
  return res;
}

/** Payments made against one invoice, for its receipts. */
export async function invoicePayments(studentId: string, invoiceId: string): Promise<ActionResult<StudentFees['payments']>> {
  if (!UUID.test(studentId) || !UUID.test(invoiceId)) return { ok: false, error: 'Unknown invoice.' };
  const res = await act(() => api<StudentFees>(`/v1/fees/students/${studentId}`));
  return res.ok ? { ok: true, data: res.data.payments.filter((p) => p.invoiceId === invoiceId) } : res;
}
