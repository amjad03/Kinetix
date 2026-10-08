'use client';

import Add from '@mui/icons-material/Add';
import ReceiptLongOutlined from '@mui/icons-material/ReceiptLongOutlined';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import { DataTable, StatusPill } from '@/components/ui';
import FormControlLabel from '@mui/material/FormControlLabel';
import IconButton from '@mui/material/IconButton';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import DeleteOutlined from '@mui/icons-material/DeleteOutlined';
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
      <Box sx={{ borderBottom: 1, borderColor: 'm3.outlineVariant', mb: 3 }}>
        <Tabs value={tab} onChange={(_, v: PayrollTab) => switchTab(v)} aria-label={t('nav.payroll')} variant="scrollable" scrollButtons={false}>
          <Tab value="runs" label={t('pay.tab.runs')} />
          <Tab value="structures" label={t('pay.tab.structures')} />
          <Tab value="components" label={t('pay.tab.components')} />
          <Tab value="settings" label={t('pay.tab.settings')} />
        </Tabs>
      </Box>
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
      <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap', mb: 2 }}>
        <TextField type="month" size="small" label={t('pay.month')} value={month} onChange={(e) => setMonth(e.target.value)} slotProps={{ inputLabel: { shrink: true }, htmlInput: { max: thisMonth } }} />
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
      </Box>
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
      <TextField select size="small" label={t('pay.st.staff')} value={who} onChange={(e) => pick(e.target.value)} sx={{ minWidth: 280, mb: 3 }}>
        {staff.map((s) => (
          <MenuItem key={s.userId} value={s.userId} disabled={!s.employeeCode}>
            {s.fullName}
            {!s.employeeCode ? ` · ${t('hr.staff.noRecord')}` : ''}
          </MenuItem>
        ))}
      </TextField>
      {who && (
        <Stack spacing={2} sx={{ maxWidth: 640 }}>
          <TextField size="small" type="date" label={t('pay.st.effective')} value={from} onChange={(e) => setFrom(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} sx={{ maxWidth: 220 }} />
          {rows.map((r, i) => (
            <Stack key={i} direction="row" spacing={1} sx={{ alignItems: 'center' }}>
              <TextField select size="small" fullWidth label={t('pay.st.component')} value={r.componentId} onChange={(e) => setRows(rows.map((x, k) => (k === i ? { ...x, componentId: e.target.value } : x)))}>
                {active.map((c) => (
                  <MenuItem key={c.id} value={c.id}>
                    {c.name} ({t(`pay.co.${c.kind}` as MessageKey)})
                  </MenuItem>
                ))}
              </TextField>
              <TextField size="small" label={t('pay.st.monthly')} value={r.amount} onChange={(e) => setRows(rows.map((x, k) => (k === i ? { ...x, amount: e.target.value } : x)))} sx={{ width: 180 }} slotProps={{ htmlInput: { inputMode: 'decimal' } }} />
              <IconButton aria-label={t('pay.st.removeLine')} onClick={() => setRows(rows.length > 1 ? rows.filter((_, k) => k !== i) : [{ componentId: '', amount: '' }])}>
                <DeleteOutlined />
              </IconButton>
            </Stack>
          ))}
          <Box>
            <Button size="small" startIcon={<Add />} onClick={() => setRows([...rows, { componentId: '', amount: '' }])}>
              {t('pay.st.addLine')}
            </Button>
          </Box>
          <Typography variant="body2">
            {t('pay.st.gross')}: <strong>{formatRupees(gross)}</strong>
          </Typography>
          <Box>
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
          </Box>
          {history.length > 0 && (
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
                {t('pay.st.history')}
              </Typography>
              {history.map((h) => (
                <Typography key={h.effectiveFrom} variant="body2" color="text.secondary">
                  {formatDate(h.effectiveFrom, 'short', locale)} · {formatRupees(h.monthlyGrossPaise)}
                </Typography>
              ))}
            </Box>
          )}
        </Stack>
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
      <Stack direction="row" spacing={1.5} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap', mt: 3 }}>
        <TextField size="small" label={t('hr.leave.code')} value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} sx={{ width: 120 }} />
        <TextField size="small" label={t('hr.leave.name')} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        <TextField select size="small" label={t('pay.co.kind')} value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as SalaryComponent['kind'] })} sx={{ width: 140 }}>
          <MenuItem value="earning">{t('pay.co.earning')}</MenuItem>
          <MenuItem value="deduction">{t('pay.co.deduction')}</MenuItem>
        </TextField>
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
      </Stack>
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
    <Stack spacing={3} sx={{ maxWidth: 720 }}>
      {view}
      {!canEdit && <Typography variant="body2" color="text.secondary">{t('pay.set.readOnly')}</Typography>}
      <Box>
        <Typography variant="h6" component="h2" sx={{ fontSize: '1rem', mb: 1 }}>{t('pay.set.pfEsi')}</Typography>
        <Stack spacing={2}>
          <FormControlLabel control={<Switch checked={pfCap} disabled={!canEdit} onChange={(e) => setPfCap(e.target.checked)} />} label={t('pay.set.pfCap')} />
          <Stack direction="row" spacing={2}>
            <TextField size="small" label={t('pay.set.pfCeiling')} value={pfCeil} disabled={!canEdit} onChange={(e) => setPfCeil(e.target.value)} />
            <TextField size="small" label={t('pay.set.esiLimit')} value={esiLimit} disabled={!canEdit} onChange={(e) => setEsiLimit(e.target.value)} />
          </Stack>
        </Stack>
      </Box>
      <Box>
        <Typography variant="h6" component="h2" sx={{ fontSize: '1rem', mb: 1 }}>{t('pay.set.pt')}</Typography>
        <TextField size="small" label={t('pay.set.ptState')} value={state} disabled={!canEdit} onChange={(e) => setState(e.target.value)} sx={{ mb: 2 }} />
        {slabs.map((s, i) => (
          <Stack key={i} direction="row" spacing={1} sx={{ alignItems: 'center', mb: 1 }}>
            <TextField size="small" label={t('pay.set.slabFrom')} value={s.from} disabled={!canEdit} onChange={(e) => setSlabs(slabs.map((x, k) => (k === i ? { ...x, from: e.target.value } : x)))} />
            <TextField size="small" label={t('pay.set.slabAmt')} value={s.amount} disabled={!canEdit} onChange={(e) => setSlabs(slabs.map((x, k) => (k === i ? { ...x, amount: e.target.value } : x)))} />
            <TextField size="small" label={t('pay.set.slabFeb')} value={s.february} disabled={!canEdit} onChange={(e) => setSlabs(slabs.map((x, k) => (k === i ? { ...x, february: e.target.value } : x)))} />
            {canEdit && slabs.length > 1 && (
              <IconButton aria-label={t('pay.st.removeLine')} onClick={() => setSlabs(slabs.filter((_, k) => k !== i))}>
                <DeleteOutlined />
              </IconButton>
            )}
          </Stack>
        ))}
        {canEdit && (
          <Button size="small" startIcon={<Add />} onClick={() => setSlabs([...slabs, { from: '', amount: '', february: '' }])}>
            {t('pay.st.addLine')}
          </Button>
        )}
      </Box>
      <Box>
        <Typography variant="h6" component="h2" sx={{ fontSize: '1rem', mb: 1 }}>{t('pay.set.weeklyOffs')}</Typography>
        <Stack direction="row" sx={{ flexWrap: 'wrap' }}>
          {days.map((d) => (
            <FormControlLabel key={d} control={<Checkbox checked={offs.includes(d)} disabled={!canEdit} onChange={(e) => setOffs(e.target.checked ? [...offs, d] : offs.filter((x) => x !== d))} />} label={tt(`pay.day.${d}` as MessageKey)} />
          ))}
        </Stack>
      </Box>
      <Box>
        <Typography variant="h6" component="h2" sx={{ fontSize: '1rem', mb: 0.5 }}>{t('pay.set.ledgers')}</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>{t('pay.set.ledgersHelp')}</Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
          {LEDGERS.map((k) => (
            <TextField key={k} size="small" label={t(`pay.led.${k}` as MessageKey)} value={ledgers[k]} disabled={!canEdit} onChange={(e) => setLedgers({ ...ledgers, [k]: e.target.value })} />
          ))}
        </Box>
      </Box>
      {canEdit && (
        <Box>
          <Button variant="contained" onClick={save} disabled={pending}>
            {t('hr.save')}
          </Button>
        </Box>
      )}
    </Stack>
  );
}
