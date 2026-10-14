'use client';

import { useState, useTransition } from 'react';
import { planRebalance, planRollNumbers } from '@/app/(dashboard)/students/info-actions';
import { Alert, Button } from '@/components/kx';
import { Card, CheckboxField, DataTable, FormField, FormRow, SelectInput, TextInput, useToast, type Column } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import { ROLL_ORDERS, type RebalancePlan, type RollOrder, type RollPlan } from '@/lib/student-info';

export interface ToolClass {
  id: string;
  name: string;
  programId: string;
  programName: string;
  term: number;
  yearId: string;
  students: number;
}

/**
 * Roll numbers and sections: renumber a class by a rule (name order, girls then boys, date of admission or
 * admission number) and share students out between sections of one programme and term. Both show the plan first.
 */
export function RosterTools({ classes }: { classes: ToolClass[] }) {
  return (
    <div className="grid gap-6">
      <RollNumbers classes={classes} />
      <Reshuffle classes={classes} />
    </div>
  );
}

function RollNumbers({ classes }: { classes: ToolClass[] }) {
  const { t } = useI18n();
  const toast = useToast();
  const [sectionId, setSectionId] = useState('');
  const [order, setOrder] = useState<RollOrder>('alphabetic');
  const [prefix, setPrefix] = useState('');
  const [start, setStart] = useState('1');
  const [width, setWidth] = useState('2');
  const [girlsFirst, setGirlsFirst] = useState(true);
  const [plan, setPlan] = useState<RollPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, run] = useTransition();
  const reset = () => setPlan(null);
  const go = (dryRun: boolean) =>
    run(async () => {
      setError(null);
      const res = await planRollNumbers({ sectionId, order, prefix, start: Number(start) || 0, width: Number(width) || 1, girlsFirst, dryRun });
      if (!res.ok) return setError(res.error);
      setPlan(res.data);
      if (!dryRun) toast.success(t('si.tools.renumbered', { n: res.data.changed, cls: res.data.className }));
    });
  const columns: Column<RollPlan['plan'][number]>[] = [
    { id: 'name', header: t('si.col.student'), rowHeader: true, sort: (x) => x.fullName, cell: (x) => x.fullName },
    { id: 'from', header: t('si.tools.now'), sort: (x) => x.from, cell: (x) => x.from },
    { id: 'to', header: t('si.tools.new'), sort: (x) => x.to, cell: (x) => <b className={x.from === x.to ? 'font-normal text-muted-foreground' : 'font-semibold'}>{x.to}</b> },
  ];
  return (
    <Card title={t('si.tools.rollTitle')} subtitle={t('si.tools.rollHelp')}>
      <div className="grid gap-4">
        {error && <Alert severity="error">{error}</Alert>}
        <FormRow>
          <FormField label={t('si.reg.class')}>
            <SelectInput value={sectionId} onChange={(e) => (setSectionId(e.target.value), reset())} options={classes.map((c) => ({ value: c.id, label: `${c.name} (${c.students})` }))} empty="—" className="min-w-[240px]" data-testid="roll-class" />
          </FormField>
          <FormField label={t('si.tools.order')}>
            <SelectInput value={order} onChange={(e) => (setOrder(e.target.value as RollOrder), reset())} options={ROLL_ORDERS.map((o) => ({ value: o, label: t(`si.tools.order.${o}` as MessageKey) }))} className="min-w-[220px]" />
          </FormField>
          <FormField label={t('si.tools.prefix')}>
            <TextInput value={prefix} onChange={(e) => (setPrefix(e.target.value), reset())} className="w-[120px]" slotProps={{ htmlInput: { maxLength: 12 } }} />
          </FormField>
          <FormField label={t('si.tools.start')}>
            <TextInput value={start} onChange={(e) => (setStart(e.target.value.replace(/\D/g, '')), reset())} className="w-[90px]" inputMode="numeric" />
          </FormField>
          <FormField label={t('si.tools.width')}>
            <TextInput value={width} onChange={(e) => (setWidth(e.target.value.replace(/\D/g, '').slice(0, 1)), reset())} className="w-[90px]" inputMode="numeric" />
          </FormField>
        </FormRow>
        {order === 'gender' && <CheckboxField label={t('si.tools.girlsFirst')} checked={girlsFirst} onChange={(v) => (setGirlsFirst(v), reset())} />}
        <div className="flex flex-wrap gap-2">
          <Button variant="outlined" disabled={pending || !sectionId} onClick={() => go(true)} data-testid="roll-preview">
            {t('si.tools.preview')}
          </Button>
          <Button variant="contained" disabled={pending || !plan?.dryRun || plan.changed === 0} onClick={() => go(false)} data-testid="roll-apply">
            {t('si.tools.applyRoll', { n: plan?.changed ?? 0 })}
          </Button>
        </div>
        {plan && <DataTable label={t('si.tools.rollTitle')} columns={columns} rows={plan.plan} rowId={(x) => x.id} exportName="roll-numbers" bare />}
      </div>
    </Card>
  );
}

function Reshuffle({ classes }: { classes: ToolClass[] }) {
  const { t } = useI18n();
  const toast = useToast();
  const [group, setGroup] = useState('');
  const [chosen, setChosen] = useState<string[]>([]);
  const [mode, setMode] = useState<'alphabetic' | 'balanced'>('balanced');
  const [reason, setReason] = useState('');
  const [plan, setPlan] = useState<RebalancePlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, run] = useTransition();
  // Sections can be reshuffled only within one programme, year and term.
  const groups = [...new Map(classes.map((c) => [`${c.programId}:${c.yearId}:${c.term}`, { key: `${c.programId}:${c.yearId}:${c.term}`, label: t('si.tools.group', { programme: c.programName, term: c.term }) }])).values()].filter((g) => classes.filter((c) => `${c.programId}:${c.yearId}:${c.term}` === g.key).length > 1);
  const inGroup = classes.filter((c) => `${c.programId}:${c.yearId}:${c.term}` === group);
  const go = (dryRun: boolean) =>
    run(async () => {
      setError(null);
      const res = await planRebalance({ sectionIds: chosen, mode, reason: reason || t('si.tools.defaultReason'), dryRun });
      if (!res.ok) return setError(res.error);
      setPlan(res.data);
      if (!dryRun) toast.success(t('si.tools.reshuffled', { n: res.data.moves.length }));
    });
  return (
    <Card title={t('si.tools.shuffleTitle')} subtitle={t('si.tools.shuffleHelp')}>
      <div className="grid gap-4">
        {error && <Alert severity="error">{error}</Alert>}
        {groups.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">{t('si.tools.noGroups')}</p>
        ) : (
          <>
            <FormRow>
              <FormField label={t('si.tools.programmeTerm')}>
                <SelectInput
                  value={group}
                  onChange={(e) => {
                    setGroup(e.target.value);
                    setChosen(classes.filter((c) => `${c.programId}:${c.yearId}:${c.term}` === e.target.value).map((c) => c.id));
                    setPlan(null);
                  }}
                  options={groups.map((g) => ({ value: g.key, label: g.label }))}
                  empty="—"
                  className="min-w-[260px]"
                />
              </FormField>
              <FormField label={t('si.tools.how')}>
                <SelectInput value={mode} onChange={(e) => (setMode(e.target.value as 'alphabetic'), setPlan(null))} options={[{ value: 'balanced', label: t('si.tools.mode.balanced') }, { value: 'alphabetic', label: t('si.tools.mode.alphabetic') }]} className="min-w-[220px]" />
              </FormField>
              <FormField label={t('si.col.reason')}>
                <TextInput value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t('si.tools.defaultReason')} className="min-w-[240px]" slotProps={{ htmlInput: { maxLength: 300 } }} />
              </FormField>
            </FormRow>
            {inGroup.length > 0 && (
              <div className="flex flex-wrap gap-x-6 gap-y-1">
                {inGroup.map((c) => (
                  <CheckboxField key={c.id} label={`${c.name} (${c.students})`} checked={chosen.includes(c.id)} onChange={(v) => (setChosen(v ? [...chosen, c.id] : chosen.filter((x) => x !== c.id)), setPlan(null))} />
                ))}
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <Button variant="outlined" disabled={pending || chosen.length < 2} onClick={() => go(true)}>
                {t('si.tools.preview')}
              </Button>
              <Button variant="contained" disabled={pending || !plan?.dryRun || plan.moves.length === 0} onClick={() => go(false)}>
                {t('si.tools.applyShuffle', { n: plan?.moves.length ?? 0 })}
              </Button>
            </div>
            {plan && (
              <>
                <p className="text-[13px]">{plan.sizes.map((s) => t('si.tools.size', { cls: s.className, before: s.before, after: s.after })).join(' · ')}</p>
                <DataTable
                  label={t('si.tools.shuffleTitle')}
                  columns={[
                    { id: 'name', header: t('si.col.student'), rowHeader: true, sort: (x) => x.fullName, cell: (x) => x.fullName },
                    { id: 'from', header: t('si.tools.fromClass'), sort: (x) => x.fromName, cell: (x) => x.fromName },
                    { id: 'to', header: t('si.tools.toClass'), sort: (x) => x.toName, cell: (x) => <b className="font-semibold">{x.toName}</b> },
                  ]}
                  rows={plan.moves}
                  rowId={(x) => x.id}
                  exportName="section-moves"
                  bare
                />
              </>
            )}
          </>
        )}
      </div>
    </Card>
  );
}
