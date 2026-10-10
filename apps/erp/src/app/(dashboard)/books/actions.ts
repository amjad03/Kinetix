'use server';

import { optStr, read, send } from '@/lib/ops-server';

const PAGE = '/books';
type V = Record<string, string>;

export async function addAccount(v: V) {
  return send('/v1/books/accounts', { code: v.code, name: v.name, groupType: v.groupType, isCashBank: v.isCashBank === 'yes' }, PAGE);
}

/** A two-line voucher: the first account on the chosen side, the second on the other. */
export async function postVoucher(v: V) {
  const amount = Number(v.amount);
  const first = v.side === 'credit' ? { accountId: v.account1, debitPaise: 0, creditPaise: amount } : { accountId: v.account1, debitPaise: amount, creditPaise: 0 };
  const second = v.side === 'credit' ? { accountId: v.account2, debitPaise: amount, creditPaise: 0 } : { accountId: v.account2, debitPaise: 0, creditPaise: amount };
  return send('/v1/books/vouchers', { type: v.type, date: v.date, narration: optStr(v.narration) ?? '', lines: [first, second] }, PAGE);
}

export async function voidVoucher(id: string) {
  return send(`/v1/books/vouchers/${encodeURIComponent(id)}/void`, {}, PAGE);
}

export async function closeYear(fy: string) {
  return send(`/v1/books/years/${encodeURIComponent(fy)}/close`, {}, PAGE);
}

export async function loadReports(asOf: string, fy: string) {
  const [trial, ie, bs] = await Promise.all([read(`/v1/books/trial-balance?asOf=${asOf}`), read(`/v1/books/income-expenditure?fy=${fy}`), read(`/v1/books/balance-sheet?asOf=${asOf}`)]);
  if (!trial.ok) return trial;
  if (!ie.ok) return ie;
  if (!bs.ok) return bs;
  return { ok: true as const, data: { trial: trial.data, ie: ie.data, bs: bs.data } };
}

export async function loadDaybook(from: string, to: string) {
  return read(`/v1/books/daybook?from=${from}&to=${to}`);
}
