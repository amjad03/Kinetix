'use client';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { saveHrSettings, setEncashable } from '@/app/(dashboard)/hr/flow-actions';
import { useNotice } from '@/components/hr/Common';
import { LinkButton } from '@/components/LinkButton';
import { ModuleSettingsPage, NumberingSeriesField } from '@/components/templates';
import { CheckboxField, DataTable, FormGrid, SelectInput, TextInput } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { HrModuleSettings, Series } from '@/lib/hr-flow';
import type { LeaveType, PayrollSettings } from '@/lib/hr-types';
import { formatRupees } from '@/lib/money';
import type { NumberingSeries } from '@/lib/templates';

const toUi = (s: Series): NumberingSeries => ({ prefix: s.prefix, next: s.next, pad: s.digits, suffix: s.suffix });
const fromUi = (s: NumberingSeries): Series => ({ prefix: s.prefix, next: Math.max(1, Math.trunc(s.next)), digits: s.pad, suffix: s.suffix ?? '' });

/** HR module settings: numbering, leave approvals and policies, attendance rules, loans; links to salary and statutory setup. */
export function HrSettingsForm({ initial, leaveTypes, payroll }: { initial: HrModuleSettings; leaveTypes: LeaveType[]; payroll: PayrollSettings | null }) {
  const { t } = useI18n();
  const router = useRouter();
  const { run, view } = useNotice();
  const [pending, start] = useTransition();
  const { preview: _p, ...rest } = initial;
  const [s, setS] = useState(rest);
  const dirty = JSON.stringify(s) !== JSON.stringify(rest);
  const num = (v: string) => (v === '' ? 0 : Number(v));
  const save = () =>
    start(async () => {
      if ((await run(() => saveHrSettings(s), t('hl.saved'))).ok) router.refresh();
    });
  const toggle = (lt: LeaveType, on: boolean) =>
    start(async () => {
      if ((await run(() => setEncashable(lt, on), t('hl.saved'))).ok) router.refresh();
    });
  return (
    <>
      {view}
      <ModuleSettingsPage
        title={t('hf.set.title')}
        subtitle={t('hf.set.subtitle')}
        onSave={save}
        saving={pending}
        dirty={dirty}
        sections={[
          {
            id: 'numbering',
            kind: 'numbering',
            title: t('hf.set.numbering'),
            description: t('hf.set.numberingHelp'),
            content: (
              <div className="grid gap-6">
                <NumberingSeriesField label={t('hf.set.employeeNo')} value={toUi(s.employeeSeries)} onChange={(v) => setS({ ...s, employeeSeries: fromUi(v) })} />
                <NumberingSeriesField label={t('hf.set.payslipNo')} value={toUi(s.payslipSeries)} onChange={(v) => setS({ ...s, payslipSeries: fromUi(v) })} />
              </div>
            ),
          },
          {
            id: 'leave',
            kind: 'rules',
            title: t('hf.set.leave'),
            description: t('hf.set.leaveHelp'),
            content: (
              <div className="grid gap-6">
                <FormGrid>
                  <SelectInput label={t('hf.set.levels')} value={String(s.leaveLevels)} onChange={(e) => setS({ ...s, leaveLevels: e.target.value === '2' ? 2 : 1 })} options={[{ value: '1', label: t('hf.set.levels1') }, { value: '2', label: t('hf.set.levels2') }]} />
                  <TextInput label={t('hf.set.encashMax')} type="number" value={String(s.encashment.maxDaysPerYear)} onChange={(e) => setS({ ...s, encashment: { ...s.encashment, maxDaysPerYear: num(e.target.value) } })} />
                  <TextInput label={t('hf.set.encashMin')} type="number" value={String(s.encashment.minBalanceAfter)} onChange={(e) => setS({ ...s, encashment: { ...s.encashment, minBalanceAfter: num(e.target.value) } })} />
                </FormGrid>
                <DataTable
                  label={t('hf.set.leaveTypes')}
                  rows={leaveTypes}
                  rowId={(x) => x.id}
                  exportName="leave-policy"
                  columns={[
                    { id: 'c', header: t('hr.leave.code'), rowHeader: true, cell: (x) => x.code },
                    { id: 'n', header: t('hr.leave.type'), cell: (x) => x.name },
                    { id: 'd', header: t('hf.set.annualDays'), align: 'right', cell: (x) => x.annualDays },
                    { id: 'cf', header: t('hf.set.carry'), align: 'right', cell: (x) => x.carryForwardMax },
                    { id: 'e', header: t('hf.set.encashable'), csv: (x) => (x.encashable ? 'yes' : 'no'), cell: (x) => <CheckboxField label={t('hf.set.encashable')} checked={!!x.encashable} disabled={pending || !x.paid} onChange={(v) => toggle(x, v)} /> },
                  ]}
                />
              </div>
            ),
          },
          {
            id: 'attendance',
            kind: 'rules',
            title: t('hf.set.attendance'),
            description: t('hf.set.attendanceHelp'),
            content: (
              <FormGrid>
                <TextInput label={t('hf.set.officeStart')} type="time" value={s.attendance.officeStart} onChange={(e) => setS({ ...s, attendance: { ...s.attendance, officeStart: e.target.value } })} slotProps={{ inputLabel: { shrink: true } }} />
                <TextInput label={t('hf.set.grace')} type="number" value={String(s.attendance.graceMinutes)} onChange={(e) => setS({ ...s, attendance: { ...s.attendance, graceMinutes: num(e.target.value) } })} />
                <TextInput label={t('hf.set.halfDayAfter')} type="number" value={String(s.attendance.halfDayAfterMinutes)} onChange={(e) => setS({ ...s, attendance: { ...s.attendance, halfDayAfterMinutes: num(e.target.value) } })} />
                <TextInput label={t('hf.set.minHours')} type="number" value={String(s.attendance.minHoursFullDay)} onChange={(e) => setS({ ...s, attendance: { ...s.attendance, minHoursFullDay: num(e.target.value) } })} />
              </FormGrid>
            ),
          },
          {
            id: 'loans',
            kind: 'defaults',
            title: t('hf.set.loans'),
            content: (
              <FormGrid cols={3}>
                <TextInput label={t('hf.set.maxAdvance')} type="number" value={String(s.loans.maxAdvancePaise / 100)} onChange={(e) => setS({ ...s, loans: { ...s.loans, maxAdvancePaise: Math.round(num(e.target.value) * 100) } })} />
                <TextInput label={t('hf.set.maxLoan')} type="number" value={String(s.loans.maxLoanPaise / 100)} onChange={(e) => setS({ ...s, loans: { ...s.loans, maxLoanPaise: Math.round(num(e.target.value) * 100) } })} />
                <TextInput label={t('hf.set.maxInstallments')} type="number" value={String(s.loans.maxInstallments)} onChange={(e) => setS({ ...s, loans: { ...s.loans, maxInstallments: num(e.target.value) } })} />
              </FormGrid>
            ),
          },
          {
            id: 'salary',
            kind: 'templates',
            title: t('hf.set.salary'),
            description: payroll ? t('hf.set.statutoryNow', { pf: formatRupees(payroll.pfWageCeilingPaise), esi: formatRupees(payroll.esiGrossLimitPaise), state: payroll.ptState }) : undefined,
            content: (
              <div className="flex flex-wrap gap-2">
                <LinkButton href="/payroll?tab=components">{t('pay.tab.components')}</LinkButton>
                <LinkButton href="/payroll?tab=structures">{t('pay.tab.structures')}</LinkButton>
                <LinkButton href="/payroll?tab=settings">{t('hf.set.statutory')}</LinkButton>
              </div>
            ),
          },
        ]}
      />
    </>
  );
}
