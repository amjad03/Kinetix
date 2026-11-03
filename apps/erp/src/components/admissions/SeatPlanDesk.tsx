'use client';

import { Grid3x3, Shuffle, Upload } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { applySeatPlan, dereserveSeats, importAllotments, importEntranceResults, setEligibilityPreset } from '@/app/(dashboard)/admissions/pass-actions';
import { Grid, type Col } from '@/components/ops/kit';
import { Alert } from '@/components/kx';
import { Button } from '@/components/shadcn/button';
import { Card, CheckboxField, FormField, FormRow, SelectInput, StatGrid, StatTile, StatusPill, TextInput, useToast } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import type { EligibilityOptions, Matrix, MatrixRow, PassCatalog, SeatPlan } from '@/lib/admissions-pass';

const cat = (k: string) => (k === 'merit' ? 'GM' : k.toUpperCase());

/**
 * The cycle's reservation matrix: build it from a preset (seat types, Karnataka categories, horizontal and
 * supernumerary seats), watch it fill through the counselling rounds, convert unfilled seats between rounds, take in
 * entrance results and KEA / COMEDK allotments, and pick the university's eligibility rule.
 */
export function SeatPlanDesk({ cycleId, cycleSeats, catalog, matrix, eligibility, canDereserve }: { cycleId: string; cycleSeats: number; catalog: PassCatalog; matrix: Matrix; eligibility: EligibilityOptions; canDereserve: boolean }) {
  const { t, fmt } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [presetKey, setPresetKey] = useState(catalog.planPresets[0]?.key ?? '');
  const [options, setOptions] = useState(() => {
    const seen = [...new Set(matrix.rows.filter((r) => !r.supernumerary).map((r) => r.option))];
    return seen.length ? seen.map((o) => ({ label: o, intake: matrix.rows.filter((r) => r.option === o && !r.supernumerary).reduce((n, r) => n + r.seats, 0) })) : [{ label: '', intake: cycleSeats }];
  });
  const [surrender, setSurrender] = useState(false);
  const [exam, setExam] = useState(catalog.exams[0] ?? 'kcet');
  const [matchBy, setMatchBy] = useState<'application' | 'roll'>('application');
  const [results, setResults] = useState('');
  const [authority, setAuthority] = useState<'kea' | 'comedk'>('kea');
  const [allotments, setAllotments] = useState('');
  const preset = catalog.planPresets.find((p) => p.key === presetKey);

  const run = (fn: () => Promise<{ ok: true; data: unknown } | { ok: false; error: string }>, done: (d: never) => string) =>
    start(async () => {
      const res = await fn();
      if (!res.ok) return toast.error(res.error);
      toast.success(done(res.data as never));
      router.refresh();
    });

  const apply = () => {
    if (!preset) return;
    const plan: SeatPlan = { ...preset.plan, options: options.filter((o) => o.label.trim() && o.intake > 0).map((o) => ({ label: o.label.trim(), intake: o.intake })) };
    run(() => applySeatPlan(cycleId, plan), () => t('ap.seat.applied'));
  };

  const cols: Col<MatrixRow>[] = [
    { label: t('ap.seat.option'), cell: (r) => r.option },
    { label: t('ap.seat.seatType'), cell: (r) => (catalog.seatTypes.find((s) => s.key === r.seatType)?.label ?? r.seatType).split(' (')[0], sort: (r) => r.seatType },
    { label: t('ap.seat.category'), cell: (r) => (r.supernumerary ? <StatusPill tone="info">{t(`ap.super.${r.category}` as MessageKey)}</StatusPill> : cat(r.category)), sort: (r) => r.category },
    { label: t('ap.seat.horizontal'), cell: (r) => Object.entries(r.horizontal).map(([k, n]) => `${t(`ap.hz.${k}` as MessageKey)} ${r.horizontalHeld[k] ?? 0}/${n}`).join(', ') || '-', sort: (r) => Object.keys(r.horizontal).join() },
    { label: t('ap.seat.seats'), cell: (r) => r.seats, num: true },
    { label: t('ap.seat.held'), cell: (r) => r.held, num: true },
    { label: t('ap.seat.outside'), cell: (r) => r.outside, num: true },
    { label: t('ap.seat.left'), cell: (r) => (r.left > 0 ? <b>{r.left}</b> : r.left), num: true, sort: (r) => r.left },
  ];

  return (
    <div className="grid gap-6" data-testid="seat-plan">
      <StatGrid>
        <StatTile label={t('ap.seat.intake')} value={String(matrix.totals.intake)} caption={t('ap.seat.ofCycle', { n: cycleSeats })} />
        <StatTile label={t('ap.seat.super')} value={String(matrix.totals.supernumerary)} />
        <StatTile label={t('ap.seat.filled')} value={String(matrix.totals.held)} />
        <StatTile label={t('ap.seat.vacant')} value={String(matrix.totals.left)} />
      </StatGrid>

      <Card title={t('ap.seat.matrix')} subtitle={t('ap.seat.matrixHelp')}>
        <Grid cols={cols} rows={matrix.rows} empty={t('ap.seat.none')} emptyIcon={<Grid3x3 />} exportName="reservation-matrix" testId="matrix" />
        {canDereserve && matrix.rows.length > 0 && (
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <CheckboxField label={t('ap.seat.surrender')} checked={surrender} onChange={setSurrender} />
            <Button variant="outline" className="h-9" disabled={pending} onClick={() => run(() => dereserveSeats(cycleId, surrender), (d: { moves: unknown[] }) => t('ap.seat.converted', { n: d.moves.length }))}>
              <Shuffle />
              {t('ap.seat.dereserve')}
            </Button>
          </div>
        )}
        {matrix.conversions.length > 0 && (
          <ul className="mt-3 grid gap-1 text-[13px] text-muted-foreground">
            {matrix.conversions.map((c) => (
              <li key={c.id}>{t('ap.seat.conversion', { round: c.afterRound, option: c.optionLabel, n: c.seats, from: cat(c.fromCategory), to: cat(c.toCategory), why: c.reason })}</li>
            ))}
          </ul>
        )}
      </Card>

      <Card title={t('ap.seat.plan')} subtitle={t('ap.seat.planHelp')}>
        <div className="grid gap-4">
          <FormField label={t('ap.seat.preset')}>
            <SelectInput value={presetKey} onChange={(e) => setPresetKey(e.target.value)} options={catalog.planPresets.map((p) => ({ value: p.key, label: p.label }))} fullWidth />
          </FormField>
          {preset && <p className="text-[13px] text-muted-foreground">{preset.source}</p>}
          {preset && (
            <p className="text-[13px]">
              {preset.plan.seatTypes.map((s) => `${catalog.seatTypes.find((x) => x.key === s.seatType)?.label ?? s.seatType} ${s.percent}%`).join(' · ')}
              {preset.plan.reservation.categories.length > 0 && ` · ${preset.plan.reservation.categories.map((c) => `${cat(c.key)} ${c.percent}%`).join(', ')}`}
            </p>
          )}
          {options.map((o, i) => (
            <FormRow key={i}>
              <FormField label={t('ap.seat.option')}>
                <TextInput value={o.label} onChange={(e) => setOptions(options.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} placeholder={t('ap.seat.optionHint')} />
              </FormField>
              <FormField label={t('ap.seat.intakeOf')}>
                <TextInput type="number" value={String(o.intake)} onChange={(e) => setOptions(options.map((x, j) => (j === i ? { ...x, intake: Number(e.target.value) || 0 } : x)))} className="w-28" />
              </FormField>
              {options.length > 1 && (
                <Button variant="outline" className="h-10" onClick={() => setOptions(options.filter((_, j) => j !== i))}>
                  {t('ap.remove')}
                </Button>
              )}
            </FormRow>
          ))}
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="h-9" onClick={() => setOptions([...options, { label: '', intake: 0 }])}>
              {t('ap.seat.addOption')}
            </Button>
            <Button className="h-9" disabled={pending || !preset} onClick={apply} data-testid="apply-plan">
              {t('ap.seat.apply')}
            </Button>
          </div>
        </div>
      </Card>

      <Card title={t('ap.elig.title')} subtitle={eligibility.profile ? t('ap.elig.profile', { name: eligibility.profile.name }) : t('ap.elig.noProfile')}>
        <FormField label={t('ap.elig.preset')}>
          <SelectInput
            value={eligibility.chosen?.key ?? ''}
            disabled={pending}
            onChange={(e) => run(() => setEligibilityPreset(cycleId, e.target.value || null), () => t('ap.elig.saved'))}
            options={eligibility.presets.map((p) => ({ value: p.key, label: p.label }))}
            empty={t('ap.elig.none')}
            fullWidth
          />
        </FormField>
        {eligibility.chosen && <p className="mt-2 text-[13px] text-muted-foreground">{eligibility.presets.find((p) => p.key === eligibility.chosen!.key)?.source}</p>}
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title={t('ap.ent.title')} subtitle={t('ap.ent.help')}>
          <div className="grid gap-3">
            <FormRow>
              <FormField label={t('ap.ent.exam')}>
                <SelectInput value={exam} onChange={(e) => setExam(e.target.value)} options={catalog.exams.map((x) => ({ value: x, label: t(`ap.exam.${x}` as MessageKey) }))} />
              </FormField>
              <FormField label={t('ap.ent.matchBy')}>
                <SelectInput value={matchBy} onChange={(e) => setMatchBy(e.target.value as 'application' | 'roll')} options={[{ value: 'application', label: t('ap.ent.byApplication') }, { value: 'roll', label: t('ap.ent.byRoll') }]} />
              </FormField>
            </FormRow>
            <TextInput value={results} onChange={(e) => setResults(e.target.value)} multiline minRows={4} fullWidth placeholder="APP/2026-27/00012, 15230, 132.5" />
            <Button variant="outline" className="h-9 justify-self-start" disabled={pending || !results.trim()} onClick={() => run(() => importEntranceResults(cycleId, exam, matchBy, results), (d: { updated: number; unmatched: string[] }) => t('ap.ent.done', { n: d.updated, missed: d.unmatched.length }))}>
              <Upload />
              {t('ap.ent.import')}
            </Button>
          </div>
        </Card>
        <Card title={t('ap.ext.title')} subtitle={t('ap.ext.help')}>
          <div className="grid gap-3">
            <FormField label={t('ap.ext.authority')}>
              <SelectInput value={authority} onChange={(e) => setAuthority(e.target.value as 'kea' | 'comedk')} options={[{ value: 'kea', label: 'KEA (KCET)' }, { value: 'comedk', label: 'COMEDK' }]} />
            </FormField>
            <TextInput value={allotments} onChange={(e) => setAllotments(e.target.value)} multiline minRows={4} fullWidth placeholder="KEA/E/2026/R1/0042, KC112233, 10421, Chandana R, 2008-02-14, female, +919800000001, Ravi R, +919800000002, 2A, CSE" />
            <Alert severity="info">{t('ap.ext.columns')}</Alert>
            <Button variant="outline" className="h-9 justify-self-start" disabled={pending || !allotments.trim()} onClick={() => run(() => importAllotments(cycleId, authority, allotments), (d: { created: number; skipped: string[] }) => t('ap.ext.done', { n: d.created, skipped: d.skipped.length }))}>
              <Upload />
              {t('ap.ext.import')}
            </Button>
          </div>
        </Card>
      </div>
      <p className="text-xs text-muted-foreground">{t('ap.seat.tfw', { amount: fmt.rupees(catalog.tfwIncomeLimitPaise) })}</p>
    </div>
  );
}
