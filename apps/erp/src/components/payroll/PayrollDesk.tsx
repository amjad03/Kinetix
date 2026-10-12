'use client';
import { DataTable, FormField, StatusPill, TextInput, FormRow } from '@/components/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { addComponent, createRun, loadStructures, saveSettings, saveStructure } from '@/app/(dashboard)/payroll/actions';
import { pillTone, useNotice } from '@/components/hr/Common';
import { EmptyState } from '@/components/States';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import { formatMonth, formatDate } from '@/lib/dates';
import { ptSlabs, RUN_TONE, shiftMonth, type LineDraft } from '@/lib/hr';
import { formatRupees, paiseToInput, rupeesToPaise } from '@/lib/money';
import type { PayrollRunSummary, PayrollSettings, SalaryComponent, SalaryStructure, StaffSummary, TallyLedgers } from '@/lib/hr-types';

import { Button, Checkbox, FormControlLabel, IconButton, MenuItem, Switch, Tab, Tabs } from '@/components/kx';
import { Plus as Add, ReceiptText as ReceiptLongOutlined, Trash2 as DeleteOutlined } from 'lucide-react';
export type PayrollTab = 'runs' | 'structures' | 'components' | 'settings';

export function PayrollDesk({ initialTab, runs, components, settings, staff, thisMonth, canApprove }: { initialTab: PayrollTab; runs: PayrollRunSummary[]; components: SalaryComponent[]; settings: PayrollSettings; staff: StaffSummary[]; thisMonth: string; canApprove: boolean }) {
  const { t } = useI18n();
  const [tab, setTab] = useState<PayrollTab>(initialTab);
  const switchTab = (v: PayrollTab) => {
    setTab(v);
    window.history.replaceState(null, '', v === 'runs' ? '/payroll' : `/payroll?tab=${v}`);
  };
  return (
    <>
      <div className="border-b border-border mb-6">
        <Tabs value={tab} onChange={(_, v: PayrollTab) => switchTab(v)} aria-label={t('nav.payroll')} variant="scrollable" scrollButtons={false}>
          <Tab value="runs" label={t('pay.tab.runs')} />
          <Tab value="structures" label={t('pay.tab.structures')} />
          <Tab value="components" label={t('pay.tab.components')} />
          <Tab value="settings" label={t('pay.tab.settings')} />
        </Tabs>
      </div>
      {tab === 'runs' && <Runs runs={runs} thisMonth={thisMonth} />}
      {tab === 'structures' && <Structures staff={staff} components={components} />}
      {tab === 'components' && <Components components={components} />}
      {tab === 'settings' && <Settings settings={settings} canEdit={canApprove} />}
    </>
  );
}

function Runs({ runs, thisMonth }: { runs: PayrollRunSummary[]; thisMonth: string }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const { run, view } = useNotice();
  const [month, setMonth] = useState(runs.some((r) => r.month === thisMonth) ? shiftMonth(thisMonth, 1) > thisMonth ? thisMonth : thisMonth : thisMonth);
  const [pending, start] = useTransition();
  return (
    <>
      {view}
      <FormRow className="gap-3 mb-4">
        <FormField label={t('pay.month')}>
          <TextInput type="month" value={month} onChange={(e) => setMonth(e.target.value)} slotProps={{ inputLabel: { shrink: true }, htmlInput: { max: thisMonth } }} />
        </FormField>
        <Button
          variant="contained"
          startIcon={<Add />}
          disabled={pending || !/^\d{4}-\d{2}$/.test(month) || runs.some((r) => r.month === month)}
          onClick={() =>
            start(async () => {
              const r = await run(() => createRun(month));
              if (r.ok) router.push(`/payroll/runs/${r.data.id}`);
            })
          }
        >
          {t('pay.newRun')}
        </Button>
      </FormRow>
      {runs.length === 0 ? (
        <EmptyState icon={<ReceiptLongOutlined />} title={t('pay.noRuns')}>
          {t('pay.noRunsBody')}
        </EmptyState>
      ) : (
        <DataTable
          testId="payroll-runs"
          label={t('nav.payroll')}
          rows={runs}
          rowId={(r) => String(r.id)}
          exportName="payroll-runs"
          columns={[
            { id: 'c0', header: t('pay.month'), rowHeader: true, sort: (r) => r.month, cell: (r) => formatMonth(`${r.month}-01`, locale) },
            { id: 'c1', header: t('hr.f.status'), sort: (r) => r.status, cell: (r) => (<><StatusPill tone={pillTone(RUN_TONE[r.status])}>{t(`pay.status.${r.status}` as MessageKey)}</StatusPill></>) },
            { id: 'c2', header: t('pay.staff'), align: 'right', sort: (r) => r.staffCount, cell: (r) => r.staffCount },
            { id: 'c3', header: t('pay.gross'), align: 'right', sort: (r) => r.grossPaise, cell: (r) => formatRupees(r.grossPaise) },
            { id: 'c4', header: t('pay.net'), align: 'right', sort: (r) => r.netPaise, cell: (r) => formatRupees(r.netPaise) },
            { id: 'c5', header: t('pay.cost'), align: 'right', sort: (r) => r.employerCostPaise, cell: (r) => formatRupees(r.employerCostPaise) },
            { id: 'c6', header: '', align: 'right', csv: false, cell: (r) => (<><Button size="small" component={Link} href={`/payroll/runs/${r.id}`}>
                                {t('pay.open')}
                              </Button></>) },
          ]}
        />
      )}
    </>
  );
}

function Structures({ staff, components }: { staff: StaffSummary[]; components: SalaryComponent[] }) {
  const { t, locale } = useI18n();
  const { run, view, setError } = useNotice();
  const [who, setWho] = useState('');
  const [history, setHistory] = useState<SalaryStructure[]>([]);
  const [rows, setRows] = useState<LineDraft[]>([{ componentId: '', amount: '' }]);
  const [from, setFrom] = useState('');
  const [pending, start] = useTransition();
  const active = components.filter((c) => c.active);
  const toRows = (s: SalaryStructure | null): LineDraft[] => (s ? s.lines.map((l) => ({ componentId: l.componentId, amount: paiseToInput(l.monthlyPaise) })) : [{ componentId: '', amount: '' }]);
  const gross = rows.reduce((s, r) => (active.find((c) => c.id === r.componentId)?.kind === 'earning' ? s + (rupeesToPaise(r.amount) ?? 0) : s), 0);

  const pick = (userId: string) => {
    setWho(userId);
    setError(null);
    start(async () => {
      const r = await run(() => loadStructures(userId));
      if (!r.ok) return;
      setHistory(r.data.history);
      setRows(toRows(r.data.current));
      setFrom(r.data.current?.effectiveFrom ?? '');
    });
  };

  return (
    <>
      {view}
      <FormField label={t('pay.st.staff')}>
        <TextInput className="min-w-[280px] mb-6" select value={who} onChange={(e) => pick(e.target.value)}>
          {staff.map((s) => (
            <MenuItem key={s.userId} value={s.userId} disabled={!s.employeeCode}>
              {s.fullName}
              {!s.employeeCode ? ` · ${t('hr.staff.noRecord')}` : ''}
            </MenuItem>
          ))}
        </TextInput>
      </FormField>
      {who && (
        <div className="flex flex-col gap-4 max-w-[640px]">
          <FormField label={t('pay.st.effective')}>
            <TextInput className="max-w-[220px]" type="date" value={from} onChange={(e) => setFrom(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
          </FormField>
          {rows.map((r, i) => (
            <div className="flex flex-row gap-2 items-center" key={i}>
              <FormField label={t('pay.st.component')}>
                <TextInput select fullWidth value={r.componentId} onChange={(e) => setRows(rows.map((x, k) => (k === i ? { ...x, componentId: e.target.value } : x)))}>
                  {active.map((c) => (
                    <MenuItem key={c.id} value={c.id}>
                      {c.name} ({t(`pay.co.${c.kind}` as MessageKey)})
                    </MenuItem>
                  ))}
                </TextInput>
              </FormField>
              <FormField label={t('pay.st.monthly')}>
                <TextInput className="w-[180px]" value={r.amount} onChange={(e) => setRows(rows.map((x, k) => (k === i ? { ...x, amount: e.target.value } : x)))} slotProps={{ htmlInput: { inputMode: 'decimal' } }} />
              </FormField>
              <IconButton aria-label={t('pay.st.removeLine')} onClick={() => setRows(rows.length > 1 ? rows.filter((_, k) => k !== i) : [{ componentId: '', amount: '' }])}>
                <DeleteOutlined />
              </IconButton>
            </div>
          ))}
          <div>
            <Button size="small" startIcon={<Add />} onClick={() => setRows([...rows, { componentId: '', amount: '' }])}>
              {t('pay.st.addLine')}
            </Button>
          </div>
          <p className="text-[13px] leading-[19px]">
            {t('pay.st.gross')}: <strong>{formatRupees(gross)}</strong>
          </p>
          <div>
            <Button
              variant="contained"
              disabled={pending || !from}
              onClick={() =>
                start(async () => {
                  const r = await run(() => saveStructure(who, from, rows), t('hr.saved'));
                  if (r.ok) pick(who);
                })
              }
            >
              {t('hr.save')}
            </Button>
          </div>
          {history.length > 0 && (
            <div>
              <h6 className="text-sm leading-5 font-medium tracking-[0.1px] mb-1">
                {t('pay.st.history')}
              </h6>
              {history.map((h) => (
                <p className="text-[13px] leading-[19px] text-muted-foreground" key={h.effectiveFrom}>
                  {formatDate(h.effectiveFrom, 'short', locale)} · {formatRupees(h.monthlyGrossPaise)}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}

function Components({ components }: { components: SalaryComponent[] }) {
  const { t } = useI18n();
  const { run, view } = useNotice();
  const [f, setF] = useState({ code: '', name: '', kind: 'earning' as SalaryComponent['kind'], pfWage: false, taxable: true });
  const [pending, start] = useTransition();
  return (
    <>
      {view}
      <DataTable
        testId="components"
        label={t('nav.payroll')}
        rows={components}
        rowId={(c) => String(c.id)}
        exportName="salary-components"
        columns={[
          { id: 'c0', header: t('hr.leave.code'), rowHeader: true, sort: (c) => c.code, cell: (c) => c.code },
          { id: 'c1', header: t('hr.leave.name'), sort: (c) => c.name, cell: (c) => c.name },
          { id: 'c2', header: t('pay.co.kind'), sort: (c) => t(`pay.co.${c.kind}` as MessageKey), cell: (c) => t(`pay.co.${c.kind}` as MessageKey) },
          { id: 'c3', header: t('pay.co.pfWage'), sort: (c) => c.pfWage ? t('hr.yes') : t('hr.no'), cell: (c) => c.pfWage ? t('hr.yes') : t('hr.no') },
          { id: 'c4', header: t('pay.co.taxable'), sort: (c) => c.kind === 'earning' ? (c.taxable ? t('hr.yes') : t('hr.no')) : '–', cell: (c) => c.kind === 'earning' ? (c.taxable ? t('hr.yes') : t('hr.no')) : '–' },
        ]}
      />
      <FormRow className="gap-3 mt-6">
        <FormField label={t('hr.leave.code')}>
          <TextInput className="w-[120px]" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} />
        </FormField>
        <FormField label={t('hr.leave.name')}>
          <TextInput value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        </FormField>
        <FormField label={t('pay.co.kind')}>
          <TextInput className="w-[140px]" select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as SalaryComponent['kind'] })}>
            <MenuItem value="earning">{t('pay.co.earning')}</MenuItem>
            <MenuItem value="deduction">{t('pay.co.deduction')}</MenuItem>
          </TextInput>
        </FormField>
        <FormControlLabel control={<Checkbox checked={f.pfWage} onChange={(e) => setF({ ...f, pfWage: e.target.checked })} />} label={t('pay.co.pfWage')} />
        <FormControlLabel control={<Checkbox checked={f.taxable} onChange={(e) => setF({ ...f, taxable: e.target.checked })} />} label={t('pay.co.taxable')} />
        <Button
          variant="outlined"
          startIcon={<Add />}
          disabled={pending || !f.code.trim() || !f.name.trim()}
          onClick={() =>
            start(async () => {
              const r = await run(() => addComponent(f), t('hr.saved'));
              if (r.ok) setF({ ...f, code: '', name: '' });
            })
          }
        >
          {t('hr.add')}
        </Button>
      </FormRow>
    </>
  );
}

const LEDGERS: (keyof TallyLedgers)[] = ['salaryExpense', 'employerPfExpense', 'employerEsiExpense', 'pfPayable', 'esiPayable', 'ptPayable', 'tdsPayable', 'salaryPayable', 'otherDeductions'];

function Settings({ settings, canEdit }: { settings: PayrollSettings; canEdit: boolean }) {
  const { t } = useI18n();
  const { run, view, setError } = useNotice();
  const [pfCap, setPfCap] = useState(settings.pfCapAtCeiling);
  const [pfCeil, setPfCeil] = useState(paiseToInput(settings.pfWageCeilingPaise));
  const [esiLimit, setEsiLimit] = useState(paiseToInput(settings.esiGrossLimitPaise));
  const [state, setState] = useState(settings.ptState);
  const [slabs, setSlabs] = useState(settings.ptSlabs.map((s) => ({ from: paiseToInput(s.minGrossPaise), amount: paiseToInput(s.amountPaise), february: s.februaryAmountPaise === undefined ? '' : paiseToInput(s.februaryAmountPaise) })));
  const [offs, setOffs] = useState(settings.weeklyOffs);
  const [ledgers, setLedgers] = useState(settings.ledgers);
  const [pending, start] = useTransition();
  const { t: tt } = useI18n();
  const days = [1, 2, 3, 4, 5, 6, 0];

  const save = () =>
    start(async () => {
      const slab = ptSlabs(slabs);
      const ceil = rupeesToPaise(pfCeil);
      const lim = rupeesToPaise(esiLimit);
      if (!slab.ok || ceil === null || lim === null) return setError(t('pay.set.err'));
      await run(() => saveSettings({ pfCapAtCeiling: pfCap, pfWageCeilingPaise: ceil, esiGrossLimitPaise: lim, ptState: state, ptSlabs: slab.slabs, weeklyOffs: offs, ledgers }), t('hr.saved'));
    });

  return (
    <div className="flex flex-col gap-6 max-w-[720px]">
      {view}
      {!canEdit && <p className="text-[13px] leading-[19px] text-muted-foreground">{t('pay.set.readOnly')}</p>}
      <div>
        <h2 className="font-medium tracking-[0.1px] text-[1rem] mb-2">{t('pay.set.pfEsi')}</h2>
        <div className="flex flex-col gap-4">
          <FormControlLabel control={<Switch checked={pfCap} disabled={!canEdit} onChange={(e) => setPfCap(e.target.checked)} />} label={t('pay.set.pfCap')} />
          <div className="flex flex-row gap-4">
            <FormField label={t('pay.set.pfCeiling')}>
              <TextInput value={pfCeil} disabled={!canEdit} onChange={(e) => setPfCeil(e.target.value)} />
            </FormField>
            <FormField label={t('pay.set.esiLimit')}>
              <TextInput value={esiLimit} disabled={!canEdit} onChange={(e) => setEsiLimit(e.target.value)} />
            </FormField>
          </div>
        </div>
      </div>
      <div>
        <h2 className="font-medium tracking-[0.1px] text-[1rem] mb-2">{t('pay.set.pt')}</h2>
        <FormField label={t('pay.set.ptState')}>
          <TextInput className="mb-4" value={state} disabled={!canEdit} onChange={(e) => setState(e.target.value)} />
        </FormField>
        {slabs.map((s, i) => (
          <div className="flex flex-row gap-2 items-center mb-2" key={i}>
            <FormField label={t('pay.set.slabFrom')}>
              <TextInput value={s.from} disabled={!canEdit} onChange={(e) => setSlabs(slabs.map((x, k) => (k === i ? { ...x, from: e.target.value } : x)))} />
            </FormField>
            <FormField label={t('pay.set.slabAmt')}>
              <TextInput value={s.amount} disabled={!canEdit} onChange={(e) => setSlabs(slabs.map((x, k) => (k === i ? { ...x, amount: e.target.value } : x)))} />
            </FormField>
            <FormField label={t('pay.set.slabFeb')}>
              <TextInput value={s.february} disabled={!canEdit} onChange={(e) => setSlabs(slabs.map((x, k) => (k === i ? { ...x, february: e.target.value } : x)))} />
            </FormField>
            {canEdit && slabs.length > 1 && (
              <IconButton aria-label={t('pay.st.removeLine')} onClick={() => setSlabs(slabs.filter((_, k) => k !== i))}>
                <DeleteOutlined />
              </IconButton>
            )}
          </div>
        ))}
        {canEdit && (
          <Button size="small" startIcon={<Add />} onClick={() => setSlabs([...slabs, { from: '', amount: '', february: '' }])}>
            {t('pay.st.addLine')}
          </Button>
        )}
      </div>
      <div>
        <h2 className="font-medium tracking-[0.1px] text-[1rem] mb-2">{t('pay.set.weeklyOffs')}</h2>
        <div className="flex flex-row flex-wrap">
          {days.map((d) => (
            <FormControlLabel key={d} control={<Checkbox checked={offs.includes(d)} disabled={!canEdit} onChange={(e) => setOffs(e.target.checked ? [...offs, d] : offs.filter((x) => x !== d))} />} label={tt(`pay.day.${d}` as MessageKey)} />
          ))}
        </div>
      </div>
      <div>
        <h2 className="font-medium tracking-[0.1px] text-[1rem] mb-1">{t('pay.set.ledgers')}</h2>
        <p className="text-[13px] leading-[19px] text-muted-foreground mb-3">{t('pay.set.ledgersHelp')}</p>
        <div className="grid grid-cols-[1fr] sm:grid-cols-[1fr_1fr] gap-4">
          {LEDGERS.map((k) => (
            <FormField key={k} label={t(`pay.led.${k}` as MessageKey)}>
              <TextInput value={ledgers[k]} disabled={!canEdit} onChange={(e) => setLedgers({ ...ledgers, [k]: e.target.value })} />
            </FormField>
          ))}
        </div>
      </div>
      {canEdit && (
        <div>
          <Button variant="contained" onClick={save} disabled={pending}>
            {t('hr.save')}
          </Button>
        </div>
      )}
    </div>
  );
}
