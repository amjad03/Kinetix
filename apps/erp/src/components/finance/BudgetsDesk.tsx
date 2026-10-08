'use client';

import Button from '@mui/material/Button';
import { useState } from 'react';
import { addExpense, setBudget } from '@/app/(dashboard)/budgets/actions';
import { Bar, FormDialog, Grid, useToast } from '@/components/ops/kit';
import { UrlSelect } from '@/components/UrlSelect';
import { useI18n } from '@/i18n/client';
import type { BudgetReport, BudgetRow } from '@/lib/finance';

export function BudgetsDesk({ report, years }: { report: BudgetReport; years: string[] }) {
  const { t, fmt } = useI18n();
  const [dlg, setDlg] = useState<'budget' | 'expense' | null>(null);
  const [toast, toastNode] = useToast();
  const done = (m?: string) => {
    setDlg(null);
    if (m) toast(m);
  };
  const depts = report.rows.map((r) => ({ value: r.departmentId, label: r.department }));
  const money = (get: (r: BudgetRow) => number) => ({ num: true, cell: (r: BudgetRow) => fmt.rupees(get(r)), sort: get });
  return (
    <>
      <Bar>
        <UrlSelect label={t('fin.bud.year')} param="fy" value={report.fiscalYear} options={years.map((y) => ({ value: y, label: y }))} minWidth={160} />
        <Button variant="contained" onClick={() => setDlg('budget')} disabled={depts.length === 0} data-testid="set-budget">{t('fin.bud.set')}</Button>
        <Button variant="outlined" onClick={() => setDlg('expense')} disabled={depts.length === 0}>{t('fin.bud.addExpense')}</Button>
      </Bar>
      <Grid
        testId="budget-table"
        empty={t('fin.bud.empty')}
        rows={report.rows}
        cols={[
          { label: t('fin.bud.dept'), cell: (r) => r.department },
          { label: t('fin.bud.budget'), ...money((r) => r.budgetPaise) },
          { label: t('fin.bud.po'), ...money((r) => r.purchaseOrdersPaise) },
          { label: t('fin.bud.payroll'), ...money((r) => r.payrollPaise) },
          { label: t('fin.bud.expenses'), ...money((r) => r.expensesPaise) },
          { label: t('fin.bud.actual'), ...money((r) => r.actualPaise) },
          { label: t('fin.bud.variance'), ...money((r) => r.varianceDeltaPaise) },
          { label: t('fin.bud.used'), num: true, cell: (r) => (r.utilisationPercent === null ? '-' : `${r.utilisationPercent}%`), sort: (r) => r.utilisationPercent },
        ]}
        tint={(r) => r.varianceDeltaPaise < 0}
      />
      {dlg === 'budget' && (
        <FormDialog
          title={t('fin.bud.set')}
          intro={t('fin.bud.setHint', { year: report.fiscalYear })}
          onSubmit={(v) => setBudget(report.fiscalYear, v)}
          onClose={done}
          fields={[{ name: 'departmentId', label: t('fin.bud.dept'), kind: 'select', required: true, options: depts }, { name: 'amount', label: t('fin.bud.budget'), kind: 'rupees', required: true }, { name: 'note', label: t('ops.f.note') }]}
        />
      )}
      {dlg === 'expense' && (
        <FormDialog
          title={t('fin.bud.addExpense')}
          onSubmit={addExpense}
          onClose={done}
          fields={[{ name: 'departmentId', label: t('fin.bud.dept'), kind: 'select', required: true, options: depts }, { name: 'spentOn', label: t('fin.bud.spentOn'), kind: 'date', required: true }, { name: 'description', label: t('fin.bud.description'), required: true }, { name: 'amount', label: t('fin.bud.amount'), kind: 'rupees', required: true }]}
        />
      )}
      {toastNode}
    </>
  );
}
