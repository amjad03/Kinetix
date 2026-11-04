'use client';

import { ShieldCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { runLht } from '@/app/(dashboard)/lht-actions';
import { Button } from '@/components/kx';
import { Card, DataTable, EmptyState, StatGrid, StatTile, StatusPill, TabPanel, Tabs, type Column } from '@/components/ui';
import type { MessageKey } from '@/i18n/messages';
import { useI18n } from '@/i18n/client';
import type { Optimisation, Safety, SafetyRow, SlabPreview } from '@/lib/transport-pass';

type Tab = 'safety' | 'capacity' | 'fares';
type RouteRow = Optimisation['routes'][number];
type Change = SlabPreview['changes'][number];
const STATUS_TONE = { over: 'danger', full: 'warning', low: 'info', ok: 'success', no_vehicle: 'warning' } as const;

/**
 * Safety and capacity: the school-bus safety matrix vehicle by vehicle (checklist, papers, woman attendant, the
 * driver's verification), capacity against occupancy with suggestions, and fares by distance (preview, then fill the
 * stop fees); the expiry reminders can be sent from here too.
 */
export function SafetyBoard({ safety, opt, slabs, initialTab }: { safety: Safety; opt: Optimisation; slabs: SlabPreview | null; initialTab: Tab }) {
  const { t, fmt } = useI18n();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>(initialTab);
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const routeName = (id: string) => opt.routes.find((r) => r.id === id)?.name ?? '';
  const gapWord = (g: string) => t(`tp.gap.${g}` as MessageKey);
  const run = (path: string, body: Record<string, unknown>, ok: (d: Record<string, unknown>) => string) =>
    start(async () => {
      const r = await runLht(path, body);
      setMessage(r.ok ? { tone: 'success', text: ok(r.data) } : { tone: 'danger', text: r.error });
      if (r.ok) router.refresh();
    });

  const safetyCols: Column<SafetyRow>[] = [
    { id: 'vehicle', header: t('tp.safe.vehicle'), cell: (r) => <span className="font-medium">{r.regNo}</span>, sort: (r) => r.regNo, rowHeader: true },
    { id: 'routes', header: t('tp.safe.routes'), cell: (r) => r.routes.join(', ') || '—', sort: (r) => r.routes.join(', '), hideBelow: 'lg' },
    { id: 'driver', header: t('tp.safe.driver'), cell: (r) => (r.driver ? `${r.driver.name}${r.driver.licenceYears != null ? ` · ${t('tp.safe.years', { n: r.driver.licenceYears })}` : ''}` : '—'), sort: (r) => r.driver?.name ?? '', hideBelow: 'md' },
    { id: 'attendant', header: t('tp.safe.attendant'), cell: (r) => r.attendant?.name ?? '—', sort: (r) => r.attendant?.name ?? '', hideBelow: 'md' },
    { id: 'check', header: t('tp.safe.lastCheck'), cell: (r) => (r.lastCheckOn ? fmt.date(r.lastCheckOn, 'day') : '—'), sort: (r) => r.lastCheckOn ?? '' },
    { id: 'due', header: t('tp.safe.nextCheck'), cell: (r) => (r.nextCheckDue ? <StatusPill tone={r.nextCheckDue < safety.today ? 'danger' : 'neutral'}>{fmt.date(r.nextCheckDue, 'day')}</StatusPill> : '—'), sort: (r) => r.nextCheckDue ?? '', hideBelow: 'md' },
    {
      id: 'gaps',
      header: t('tp.safe.gaps'),
      cell: (r) =>
        r.gaps.length ? (
          <span className="flex min-w-[16rem] flex-wrap gap-1" title={r.gaps.map(gapWord).join(', ')}>
            {r.gaps.slice(0, 3).map((g) => (
              <StatusPill key={g} tone="warning">
                {gapWord(g)}
              </StatusPill>
            ))}
            {r.gaps.length > 3 && <StatusPill tone="neutral">{t('tp.safe.more', { n: r.gaps.length - 3 })}</StatusPill>}
          </span>
        ) : (
          t('tp.safe.ok')
        ),
      sort: (r) => r.gaps.length,
      csv: (r) => r.gaps.map(gapWord).join('; '),
    },
    { id: 'status', header: t('tp.safe.status'), cell: (r) => <StatusPill tone={r.compliant ? 'success' : 'danger'}>{r.compliant ? t('tp.safe.compliant') : t('tp.safe.notCompliant')}</StatusPill>, sort: (r) => Number(r.compliant), csv: (r) => (r.compliant ? t('tp.safe.compliant') : t('tp.safe.notCompliant')) },
  ];
  const occCols: Column<RouteRow>[] = [
    { id: 'route', header: t('tp.occ.route'), cell: (r) => <span className="font-medium">{r.name}</span>, sort: (r) => r.name, rowHeader: true },
    { id: 'vehicle', header: t('tp.safe.vehicle'), cell: (r) => r.regNo ?? '—', sort: (r) => r.regNo ?? '' },
    { id: 'seats', header: t('tp.occ.seats'), cell: (r) => (r.capacity == null ? '—' : fmt.number(r.capacity)), sort: (r) => r.capacity ?? 0, align: 'right' },
    { id: 'riders', header: t('tp.occ.riders'), cell: (r) => fmt.number(r.riders), sort: (r) => r.riders, align: 'right' },
    { id: 'pct', header: t('tp.occ.pct'), cell: (r) => (r.occupancyPct == null ? '—' : `${r.occupancyPct}%`), sort: (r) => r.occupancyPct ?? -1, align: 'right' },
    { id: 'left', header: t('tp.occ.left'), cell: (r) => (r.seatsLeft == null ? '—' : fmt.number(r.seatsLeft)), sort: (r) => r.seatsLeft ?? 0, align: 'right', hideBelow: 'md' },
    { id: 'status', header: t('tp.safe.status'), cell: (r) => <StatusPill tone={STATUS_TONE[r.status]}>{t(`tp.occ.st.${r.status}` as MessageKey)}</StatusPill>, sort: (r) => r.status, csv: (r) => t(`tp.occ.st.${r.status}` as MessageKey) },
  ];
  const fareCols: Column<Change>[] = [
    { id: 'route', header: t('tp.occ.route'), cell: (r) => r.route, sort: (r) => r.route, hideBelow: 'md' },
    { id: 'stop', header: t('tp.fare.stop'), cell: (r) => <span className="font-medium">{r.stop}</span>, sort: (r) => r.stop, rowHeader: true },
    { id: 'km', header: t('tp.fare.km'), cell: (r) => fmt.number(r.distanceKm), sort: (r) => r.distanceKm, align: 'right' },
    { id: 'before', header: t('tp.fare.before'), cell: (r) => (r.beforePaise == null ? t('tp.fare.routeFee') : fmt.rupees(r.beforePaise)), sort: (r) => r.beforePaise ?? 0, align: 'right' },
    { id: 'after', header: t('tp.fare.after'), cell: (r) => fmt.rupees(r.afterPaise), sort: (r) => r.afterPaise, align: 'right' },
  ];

  const suggestion = (s: Optimisation['suggestions'][number]): string => {
    if (s.kind === 'swap') return t('tp.sg.swap', { route: routeName(s.routeId), other: routeName(s.withRouteId) });
    if (s.kind === 'no_vehicle') return [t('tp.sg.noVehicle', { route: routeName(s.routeId), riders: s.riders }), s.vehicle && t('tp.sg.useVehicle', { vehicle: s.vehicle.regNo, seats: s.vehicle.capacity })].filter(Boolean).join(' ');
    if (s.kind === 'over') return [t('tp.sg.over', { route: routeName(s.routeId), riders: s.riders, seats: s.capacity }), s.moveTo && t('tp.sg.moveTo', { n: s.riders - s.capacity, route: routeName(s.moveTo.routeId), seats: s.moveTo.seats }), s.vehicle && t('tp.sg.bigger', { vehicle: s.vehicle.regNo, seats: s.vehicle.capacity })].filter(Boolean).join(' ');
    const pct = Math.round((s.riders * 100) / s.capacity);
    return [t('tp.sg.low', { route: routeName(s.routeId), pct, riders: s.riders, seats: s.capacity }), s.mergeInto && t('tp.sg.merge', { route: routeName(s.mergeInto.routeId), seats: s.mergeInto.seats }), s.vehicle && t('tp.sg.smaller', { vehicle: s.vehicle.regNo, seats: s.vehicle.capacity })].filter(Boolean).join(' ');
  };

  return (
    <>
      <StatGrid min={150}>
        <StatTile label={t('tp.s.compliant')} value={`${fmt.number(safety.compliant)} / ${fmt.number(safety.total)}`} tone={safety.compliant < safety.total ? 'warning' : 'default'} testId="tp-safe-compliant" />
        <StatTile label={t('tp.s.occupancy')} value={opt.totals.occupancyPct == null ? '—' : `${opt.totals.occupancyPct}%`} caption={t('tp.occ.totals', { riders: opt.totals.riders, seats: opt.totals.seats })} />
        <StatTile label={t('tp.s.suggestions')} value={fmt.number(opt.suggestions.length)} tone={opt.suggestions.length ? 'warning' : 'default'} />
        <StatTile label={t('tp.s.idle')} value={fmt.number(opt.totals.idleVehicles)} />
        <StatTile label={t('tp.s.fares')} value={fmt.number(slabs?.updated ?? 0)} caption={t('tp.fare.toFill')} />
      </StatGrid>
      {message && (
        <p role="status" className={message.tone === 'success' ? 'mb-4 text-sm text-green-ink' : 'mb-4 text-sm text-red-ink'} data-testid="tp-safe-message">
          {message.text}
        </p>
      )}
      <Tabs value={tab} onChange={setTab} label={t('tp.safe.title')} items={[{ value: 'safety', label: t('tp.safe.matrix') }, { value: 'capacity', label: t('tp.occ.title'), count: opt.suggestions.length }, { value: 'fares', label: t('tp.fare.title') }]} />
      <TabPanel value="safety" active={tab}>
        <div className="grid min-w-0 grid-cols-1 gap-6">
          <Card title={t('tp.safe.matrix')} subtitle={t('tp.safe.matrixSub', { years: safety.minDriverExperienceYears })} action={<Button variant="outlined" className="h-auto min-h-9 whitespace-normal" disabled={pending} onClick={() => run('/v1/transport/expiry-reminders/run', {}, (d) => t('tp.rem.sent', { n: Number(d.sent ?? 0) }))} data-testid="tp-rem-run">{t('tp.rem.go')}</Button>}>
            <DataTable label={t('tp.safe.matrix')} columns={safetyCols} rows={safety.vehicles} rowId={(r) => r.vehicleId} exportName="school-bus-safety" rowTone={(r) => (r.compliant ? undefined : 'warning')} rowHref={() => '/transport/records?view=transport-safety-checks'} empty={<EmptyState icon={<ShieldCheck aria-hidden />} title={t('tp.safe.none')} />} testId="tp-safety-table" />
          </Card>
        </div>
      </TabPanel>
      <TabPanel value="capacity" active={tab}>
        <div className="grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-[3fr_2fr]">
          <Card title={t('tp.occ.title')} padded={false}>
            <DataTable label={t('tp.occ.title')} columns={occCols} rows={opt.routes} rowId={(r) => r.id} exportName="route-occupancy" bare rowTone={(r) => (r.status === 'over' ? 'danger' : r.status === 'no_vehicle' ? 'warning' : undefined)} testId="tp-occ-table" />
          </Card>
          <div className="grid content-start gap-6">
            <Card title={t('tp.occ.suggestions')} testId="tp-occ-suggestions">
              {opt.suggestions.length === 0 ? (
                <p className="m-0 text-sm text-muted-foreground">{t('tp.occ.none')}</p>
              ) : (
                <ul className="m-0 grid list-none gap-3 pl-0 text-sm">
                  {opt.suggestions.map((s, i) => (
                    <li key={i} className="border-b pb-3 last:border-0 last:pb-0">
                      {suggestion(s)}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card title={t('tp.occ.emptyStops')}>
              {opt.emptyStops.length === 0 ? (
                <p className="m-0 text-sm text-muted-foreground">{t('tp.occ.noEmptyStops')}</p>
              ) : (
                <ul className="m-0 grid list-none gap-1 pl-0 text-sm">
                  {opt.emptyStops.map((s) => (
                    <li key={s.id}>
                      <span className="font-medium">{s.name}</span> <span className="text-muted-foreground">· {s.routeName}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </div>
      </TabPanel>
      <TabPanel value="fares" active={tab}>
        <Card
          title={t('tp.fare.title')}
          subtitle={t('tp.fare.hint')}
          action={
            <Button variant="contained" className="h-auto min-h-9 whitespace-normal" disabled={pending || !slabs || slabs.updated === 0} onClick={() => run('/v1/transport/fare-slabs/apply', {}, (d) => t('tp.fare.done', { n: Number(d.updated ?? 0) }))} data-testid="tp-fare-apply">
              {t('tp.fare.apply')}
            </Button>
          }
        >
          {!slabs ? (
            <EmptyState icon={<ShieldCheck aria-hidden />} title={t('tp.fare.noSlabs')} description={t('tp.fare.noSlabsHint')} />
          ) : (
            <div className="grid min-w-0 grid-cols-1 gap-4">
              {slabs.changes.length === 0 ? <p className="m-0 text-sm text-muted-foreground">{t('tp.fare.nothing')}</p> : <DataTable label={t('tp.fare.title')} columns={fareCols} rows={slabs.changes} rowId={(r) => r.stopId} bare testId="tp-fare-table" />}
              {slabs.uncovered.length > 0 && <p className="m-0 text-sm text-muted-foreground">{t('tp.fare.uncovered', { n: slabs.uncovered.length, stops: slabs.uncovered.map((u) => u.stop).join(', ') })}</p>}
            </div>
          )}
        </Card>
      </TabPanel>
    </>
  );
}
