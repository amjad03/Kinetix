'use client';

import { Bus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { refreshLive } from '@/app/(dashboard)/transport/live/actions';
import { Card, DataTable, EmptyState, StatGrid, StatTile, StatusPill, type Column } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import { tripState, type LiveBoard as Board, type LiveTrip } from '@/lib/transport-pass';
import { BusMap } from './BusMap';

const POLL_MS = 15_000;
const TONE = { sos: 'danger', silent: 'neutral', late: 'warning', alert: 'warning', ok: 'success' } as const;

/** The office's live board: every bus under way on the map and in a table, refreshed every 15 seconds while open. */
export function LiveBoard({ initial }: { initial: Board }) {
  const { t, fmt } = useI18n();
  const [board, setBoard] = useState(initial);
  const [selected, setSelected] = useState<string | null>(initial.trips[0]?.tripId ?? null);
  const [stale, setStale] = useState(false);
  useEffect(() => {
    const id = setInterval(async () => {
      if (document.hidden) return;
      const r = await refreshLive();
      if (r.ok) {
        setBoard(r.data);
        setStale(false);
      } else setStale(true);
    }, POLL_MS);
    return () => clearInterval(id);
  }, []);
  const trips = board.trips;
  const state = (tr: LiveTrip) => tripState(tr);
  const word = (tr: LiveTrip) => {
    const s = state(tr);
    return s === 'sos' ? t('tp.live.sos') : s === 'silent' ? t('tp.live.silent', { n: tr.silentMinutes ?? 0 }) : s === 'late' ? t('tp.live.lateMin', { n: tr.lateMinutes ?? 0 }) : s === 'alert' ? t('tp.live.alert') : t('tp.live.onTime');
  };
  const columns: Column<LiveTrip>[] = [
    { id: 'route', header: t('tp.live.route'), cell: (r) => <span className="font-medium">{r.routeName}</span>, sort: (r) => r.routeName, rowHeader: true },
    { id: 'run', header: t('tp.live.run'), cell: (r) => (r.direction === 'drop' ? t('tp.live.drop') : t('tp.live.pickup')), sort: (r) => r.direction, hideBelow: 'md' },
    { id: 'vehicle', header: t('tp.live.vehicle'), cell: (r) => r.regNo ?? '—', sort: (r) => r.regNo ?? '' },
    { id: 'driver', header: t('tp.live.driver'), cell: (r) => r.driverName, sort: (r) => r.driverName, hideBelow: 'lg' },
    { id: 'next', header: t('tp.live.next'), cell: (r) => (r.nextStop ? `${r.nextStop.name}${r.etaMinutes != null ? ` · ${t('tp.live.etaMin', { n: r.etaMinutes })}` : ''}` : t('tp.live.lastStopDone')), sort: (r) => r.etaMinutes ?? 999 },
    { id: 'stops', header: t('tp.live.stops'), cell: (r) => t('tp.live.stopsDone', { done: r.stopsReached, total: r.stopsTotal }), sort: (r) => r.stopsReached, hideBelow: 'md' },
    { id: 'onBoard', header: t('tp.live.onBoard'), cell: (r) => t('tp.live.boardedOf', { boarded: r.boarded, riders: r.riders }), sort: (r) => r.boarded },
    { id: 'speed', header: t('tp.live.speed'), cell: (r) => (r.speedKmh == null ? '—' : t('tp.live.kmh', { n: Math.round(r.speedKmh) })), sort: (r) => r.speedKmh ?? 0, hideBelow: 'lg' },
    { id: 'fix', header: t('tp.live.lastFix'), cell: (r) => (r.lastPingAt ? fmt.time(r.lastPingAt) : '—'), sort: (r) => r.lastPingAt ?? '', hideBelow: 'md' },
    { id: 'status', header: t('tp.live.status'), cell: (r) => <StatusPill tone={TONE[state(r)]}>{word(r)}</StatusPill>, sort: (r) => ['sos', 'silent', 'late', 'alert', 'ok'].indexOf(state(r)), csv: (r) => word(r) },
  ];
  const late = trips.filter((tr) => (tr.lateMinutes ?? 0) > 0).length;
  return (
    <>
      <StatGrid min={140}>
        <StatTile label={t('tp.s.buses')} value={fmt.number(trips.length)} tone={trips.length ? 'live' : 'default'} testId="tp-live-buses" />
        <StatTile label={t('tp.s.late')} value={fmt.number(late)} tone={late ? 'warning' : 'default'} />
        <StatTile label={t('tp.s.onBoard')} value={fmt.number(trips.reduce((s, tr) => s + tr.boarded - tr.alighted, 0))} caption={t('tp.s.ridersN', { n: trips.reduce((s, tr) => s + tr.riders, 0) })} />
        <StatTile label={t('tp.s.notBoarded')} value={fmt.number(trips.reduce((s, tr) => s + tr.notBoarded, 0))} tone={trips.some((tr) => tr.notBoarded) ? 'warning' : 'default'} />
        <StatTile label={t('tp.s.sos')} value={fmt.number(trips.filter((tr) => tr.sos).length)} tone={trips.some((tr) => tr.sos) ? 'warning' : 'default'} />
      </StatGrid>
      {trips.length === 0 ? (
        <Card testId="tp-live-empty">
          <EmptyState icon={<Bus aria-hidden />} title={t('tp.live.none')} description={t('tp.live.noneHint')} />
        </Card>
      ) : (
        <div className="grid min-w-0 grid-cols-1 gap-6">
          <Card title={t('tp.live.map')} subtitle={stale ? t('tp.live.stale') : t('tp.live.updated', { time: fmt.time(board.at) })}>
            <BusMap trips={trips} selected={selected} onSelect={setSelected} />
          </Card>
          <DataTable label={t('tp.live.title')} columns={columns} rows={trips} rowId={(r) => r.tripId} exportName="buses-on-the-road" onRowClick={(r) => setSelected(r.tripId)} highlight={(r) => r.tripId === selected} rowTone={(r) => (state(r) === 'sos' ? 'danger' : state(r) === 'late' || state(r) === 'silent' ? 'warning' : undefined)} rowHref={(r) => `/transport/records?view=transport-trips&q=${encodeURIComponent(r.routeName)}`} testId="tp-live-table" />
        </div>
      )}
    </>
  );
}
