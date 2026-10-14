'use client';
import { Dialog, FormField, LinkTabs, TextInput } from '@/components/ui';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { loadStructures, saveSettings, saveStructure } from '@/app/(dashboard)/payroll/actions';
import { createPayrollRun } from '@/app/(dashboard)/hr/depth-actions';
import { useNotice } from '@/components/hr/Common';
import { HrList, type HrListData } from '@/components/hr/HrList';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import { formatDate } from '@/lib/dates';
import { downloadUrl, PAYROLL_TABS, ptSlabs, type LineDraft, type PayrollTab } from '@/lib/hr';
import { formatRupees, paiseToInput, rupeesToPaise } from '@/lib/money';
import type { PayrollRunSummary, PayrollSettings, SalaryComponent, SalaryStructure, StaffSummary, TallyLedgers } from '@/lib/hr-types';

import { Button, Checkbox, FormControlLabel, IconButton, MenuItem, Switch } from '@/components/kx';
import { Plus as Add, Download, Trash2 as DeleteOutlined } from 'lucide-react';

const TAB_LABEL: Record<PayrollTab, MessageKey> = {
  runs: 'pay.tab.runs',
  structures: 'pay.tab.structures',
  components: 'pay.tab.components',
  challans: 'rk.entity.tds-challans',
  returns: 'hk.pay.tab.returns',
  settings: 'pay.tab.settings',
};

export function PayrollDesk({ tab, runs, list, components, settings, staff, thisMonth, canApprove }: { tab: PayrollTab; runs: PayrollRunSummary[]; list?: HrListData; components: SalaryComponent[]; settings: PayrollSettings | null; staff: StaffSummary[]; thisMonth: string; canApprove: boolean }) {
  const { t } = useI18n();
  return (
    <>
      <LinkTabs value={tab} label={t('nav.payroll')} items={PAYROLL_TABS.map((v) => ({ value: v, href: v === 'runs' ? '/payroll' : `/payroll?tab=${v}`, label: t(TAB_LABEL[v]) }))} />
      {tab === 'runs' && list && <HrList entity="payroll-runs" data={list} toolbar={<NewRun runs={runs} staff={staff} thisMonth={thisMonth} />} />}
      {tab === 'structures' && <Structures staff={staff} components={components} />}
      {tab === 'components' && list && <HrList entity="salary-components" data={list} extraParams={{ tab }} />}
      {tab === 'challans' && list && <HrList entity="tds-challans" data={list} extraParams={{ tab }} />}
      {tab === 'returns' && <Returns thisMonth={thisMonth} />}
      {tab === 'settings' && settings && <Settings settings={settings} canEdit={canApprove} />}
    </>
  );
}

/**
 * Prepare a run: the month's regular run (everyone with a salary structure), or after it is locked a supplementary
 * run for chosen staff (a late joiner, arrears, a correction).
 */
function NewRun({ runs, staff, thisMonth }: { runs: PayrollRunSummary[]; staff: StaffSummary[]; thisMonth: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const { run, view } = useNotice();
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(thisMonth);
  const [kind, setKind] = useState<'regular' | 'supplementary'>('regular');
  const [who, setWho] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [pending, start] = useTransition();
  const live = runs.filter((r) => r.status !== 'reversed' && r.month === month);
  const hasRegular = live.some((r) => (r.kind ?? 'regular') === 'regular');
  const regularLocked = live.some((r) => (r.kind ?? 'regular') === 'regular' && r.status === 'locked');
  const problem = !/^\d{4}-\d{2}$/.test(month)
    ? null
    : kind === 'regular' && hasRegular
      ? t('hk.run.regularExists')
      : kind === 'supplementary' && !regularLocked
        ? t('hk.run.lockFirst')
        : kind === 'supplementary' && who.length === 0
          ? t('hk.run.pickStaff')
          : null;
  const eligible = staff.filter((s) => s.employeeCode);
  return (
    <>
      <Button variant="contained" startIcon={<Add />} onClick={() => setOpen(true)}>
        {t('pay.newRun')}
      </Button>
      {open && (
        <Dialog
          title={t('pay.newRun')}
          onClose={() => setOpen(false)}
          busy={pending}
          actions={
            <Button
              variant="contained"
              disabled={pending || problem !== null || !/^\d{4}-\d{2}$/.test(month)}
              onClick={() =>
                start(async () => {
                  const r = await run(() => createPayrollRun(month, kind, kind === 'supplementary' ? who : [], note));
                  if (r.ok) router.push(`/payroll/runs/${r.data.id}`);
                })
              }
            >
              {t('pay.newRun')}
            </Button>
          }
        >
          <div className="flex flex-col gap-4 pt-2">
            {view}
            <FormField label={t('pay.month')} required>
              <TextInput type="month" value={month} onChange={(e) => setMonth(e.target.value)} slotProps={{ inputLabel: { shrink: true }, htmlInput: { max: thisMonth } }} />
            </FormField>
            <FormField label={t('hk.col.kind')} helper={t(kind === 'regular' ? 'hk.run.regularHelp' : 'hk.run.supplementaryHelp')}>
              <TextInput select value={kind} onChange={(e) => setKind(e.target.value as 'regular' | 'supplementary')}>
                <MenuItem value="regular">{t('hk.run.regular')}</MenuItem>
                <MenuItem value="supplementary">{t('hk.run.supplementary')}</MenuItem>
              </TextInput>
            </FormField>
            {kind === 'supplementary' && (
              <FormField label={t('hk.run.staff')} required>
                <div className="max-h-[220px] overflow-y-auto rounded-[8px] border p-2 flex flex-col">
                  {eligible.map((s) => (
                    <FormControlLabel
                      key={s.userId}
                      control={<Checkbox checked={who.includes(s.userId)} onChange={(e) => setWho(e.target.checked ? [...who, s.userId] : who.filter((x) => x !== s.userId))} />}
                      label={`${s.fullName}${s.employeeCode ? ` · ${s.employeeCode}` : ''}`}
                    />
                  ))}
                </div>
              </FormField>
            )}
            <FormField label={t('hk.param.note')}>
              <TextInput value={note} onChange={(e) => setNote(e.target.value)} />
            </FormField>
            {problem && <p className="text-[13px] leading-[19px] text-muted-foreground">{problem}</p>}
          </div>
        </Dialog>
      )}
    </>
  );
}

/** Quarterly TDS return: Form 24Q annexure I each quarter and annexure II (the year's salary details) with the fourth. */
function Returns({ thisMonth }: { thisMonth: string }) {
  const { t } = useI18n();
  const [y, m] = thisMonth.split('-').map(Number);
  const currentFy = m >= 4 ? y : y - 1;
  const [fy, setFy] = useState(String(currentFy));
  const [quarter, setQuarter] = useState('1');
  const years = [currentFy, currentFy - 1, currentFy - 2];
  return (
    <div className="flex flex-col gap-4 max-w-[720px]">
      <p className="text-[13px] leading-[19px] text-muted-foreground">{t('hk.pay.returnsHelp')}</p>
      <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
        <FormField label={t('hk.pay.fy')}>
          <TextInput className="min-w-[160px]" select value={fy} onChange={(e) => setFy(e.target.value)}>
            {years.map((x) => (
              <MenuItem key={x} value={String(x)}>{`${x}-${String(x + 1).slice(2)}`}</MenuItem>
            ))}
          </TextInput>
        </FormField>
        <FormField label={t('hk.pay.quarter')}>
          <TextInput className="min-w-[160px]" select value={quarter} onChange={(e) => setQuarter(e.target.value)}>
            {[1, 2, 3, 4].map((q) => (
              <MenuItem key={q} value={String(q)}>{t(`hk.pay.q${q}` as MessageKey)}</MenuItem>
            ))}
          </TextInput>
        </FormField>
        <Button variant="outlined" startIcon={<Download />} href={downloadUrl.q24(Number(fy), Number(quarter), 1)}>
          {t('hk.pay.annexure1')}
        </Button>
        <Button variant="outlined" startIcon={<Download />} disabled={quarter !== '4'} href={quarter === '4' ? downloadUrl.q24(Number(fy), 4, 2) : undefined}>
          {t('hk.pay.annexure2')}
        </Button>
      </div>
      <p className="text-[13px] leading-[19px] text-muted-foreground">{t('hk.pay.runFilesHelp')}</p>
    </div>
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

const LEDGERS: (keyof TallyLedgers)[] = ['salaryExpense', 'employerPfExpense', 'employerEsiExpense', 'pfPayable', 'esiPayable', 'ptPayable', 'tdsPayable', 'salaryPayable', 'otherDeductions', 'lwfPayable', 'employerLwfExpense'];

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
  const [lwfOn, setLwfOn] = useState(settings.lwf?.enabled ?? false);
  const [lwfEmp, setLwfEmp] = useState(paiseToInput(settings.lwf?.employeePaise ?? 5000));
  const [lwfEr, setLwfEr] = useState(paiseToInput(settings.lwf?.employerPaise ?? 10000));
  const [lwfMonths, setLwfMonths] = useState<number[]>(settings.lwf?.months ?? [12]);
  const [pending, start] = useTransition();
  const { t: tt } = useI18n();
  const days = [1, 2, 3, 4, 5, 6, 0];

  const save = () =>
    start(async () => {
      const slab = ptSlabs(slabs);
      const ceil = rupeesToPaise(pfCeil);
      const lim = rupeesToPaise(esiLimit);
      const emp = rupeesToPaise(lwfEmp);
      const er = rupeesToPaise(lwfEr);
      if (!slab.ok || ceil === null || lim === null || emp === null || er === null) return setError(t('pay.set.err'));
      await run(() => saveSettings({ pfCapAtCeiling: pfCap, pfWageCeilingPaise: ceil, esiGrossLimitPaise: lim, ptState: state, ptSlabs: slab.slabs, weeklyOffs: offs, ledgers, lwf: { enabled: lwfOn, employeePaise: emp, employerPaise: er, months: lwfMonths } }), t('hr.saved'));
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
        <h2 className="font-medium tracking-[0.1px] text-[1rem] mb-1">{t('hk.lwf.title')}</h2>
        <p className="text-[13px] leading-[19px] text-muted-foreground mb-3">{t('hk.lwf.help')}</p>
        <div className="flex flex-col gap-4">
          <FormControlLabel control={<Switch checked={lwfOn} disabled={!canEdit} onChange={(e) => setLwfOn(e.target.checked)} />} label={t('hk.lwf.enabled')} />
          <div className="flex flex-col sm:flex-row gap-4">
            <FormField label={t('hk.lwf.employee')}>
              <TextInput value={lwfEmp} disabled={!canEdit} onChange={(e) => setLwfEmp(e.target.value)} />
            </FormField>
            <FormField label={t('hk.lwf.employer')}>
              <TextInput value={lwfEr} disabled={!canEdit} onChange={(e) => setLwfEr(e.target.value)} />
            </FormField>
          </div>
          <FormField label={t('hk.lwf.months')}>
            <div className="flex flex-row flex-wrap">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((mo) => (
                <FormControlLabel key={mo} control={<Checkbox checked={lwfMonths.includes(mo)} disabled={!canEdit} onChange={(e) => setLwfMonths(e.target.checked ? [...lwfMonths, mo].sort((a, b) => a - b) : lwfMonths.filter((x) => x !== mo))} />} label={t(`hk.month.${mo}` as MessageKey)} />
              ))}
            </div>
          </FormField>
        </div>
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
            <FormField key={k} label={t((k === 'lwfPayable' || k === 'employerLwfExpense' ? `hk.led.${k}` : `pay.led.${k}`) as MessageKey)}>
              <TextInput value={ledgers[k] ?? ''} disabled={!canEdit} onChange={(e) => setLedgers({ ...ledgers, [k]: e.target.value })} />
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
