'use server';

import { send } from '@/lib/ops-server';

const PAGE = '/budgets';
type V = Record<string, string>;

export async function setBudget(fiscalYear: string, v: V) {
  return send('/v1/finance/budgets', { departmentId: v.departmentId, fiscalYear, amountPaise: Number(v.amount), note: v.note ?? '' }, PAGE, 'PUT');
}

export async function addExpense(v: V) {
  return send('/v1/finance/expenses', { departmentId: v.departmentId, spentOn: v.spentOn, description: v.description, amountPaise: Number(v.amount) }, PAGE);
}
