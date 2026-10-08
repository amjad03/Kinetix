'use client';

import Add from '@mui/icons-material/Add';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { addExpense, addGpsSource, reportIncident, resolveIncident, revokeGpsSource, addDriver, addRoute, addStop, addVehicle, chargeFees, endSeat, loadRoute, loadTrip, seatStudent, setRouteActive, updateRoute } from '@/app/(dashboard)/transport/actions';
import { ActionButton, Bar, FormDialog, Grid, InfoDialog, Pill, Tabbed, useToast, type Field } from '@/components/ops/kit';
import { useI18n } from '@/i18n/client';
import { st } from '@/lib/ops-labels';
import type { TCompliance, TDriver, TExpenseSummary, TGpsSource, TIncident, TRoute, TRouteDetail, TTripDetail, TTripRow, TVehicle } from '@/lib/ops';

type Dialog =
  | { k: 'route' }
  | { k: 'edit'; r: TRoute }
  | { k: 'vehicle' }
  | { k: 'driver' }
  | { k: 'fees' }
  | { k: 'detail'; d: TRouteDetail }
  | { k: 'stop'; d: TRouteDetail }
  | { k: 'seat'; d: TRouteDetail; stopId: string }
  | { k: 'trip'; d: TTripDetail }
  | { k: 'gpsNew' }
  | { k: 'expense' }
  | { k: 'incident' }
  | { k: 'resolve'; i: TIncident }
  | { k: 'token'; token: string };

export function TransportDesk({ routes, vehicles, drivers, trips, compliance, expenses, incidents, sources, initialTab }: { routes: TRoute[]; vehicles: TVehicle[]; drivers: TDriver[]; trips: TTripRow[]; compliance: TCompliance; expenses: TExpenseSummary[]; incidents: TIncident[]; sources: TGpsSource[]; initialTab: string }) {
  const { t, fmt } = useI18n();
  const [dlg, setDlg] = useState<Dialog | null>(null);
  const [toast, toastNode] = useToast();
  const done = (m?: string) => {
    setDlg(null);
    if (m) toast(m);
  };
  const open = async (id: string, kind: 'detail' | 'trip') => {
    if (kind === 'detail') {
      const res = await loadRoute(id);
      if (res.ok) setDlg({ k: 'detail', d: res.data });
      else toast(res.error);
    } else {
      const res = await loadTrip(id);
      if (res.ok) setDlg({ k: 'trip', d: res.data });
      else toast(res.error);
    }
  };
  const none = { value: '', label: t('ops.none') };
  const vehicleOpts = [none, ...vehicles.filter((v) => v.status === 'active').map((v) => ({ value: v.id, label: `${v.regNo} (${v.capacity})` }))];
  const driverOpts = [none, ...drivers.filter((d) => d.active).map((d) => ({ value: d.id, label: d.fullName }))];
  const routeFields = (r?: TRoute): Field[] => [
    ...(r ? [] : [{ name: 'name', label: t('ops.f.name'), required: true } as Field]),
    { name: 'vehicleId', label: t('tr.vehicle'), kind: 'select', options: vehicleOpts, init: r?.vehicleId ?? '' },
    { name: 'driverId', label: t('tr.driver'), kind: 'select', options: driverOpts, init: r?.driverId ?? '' },
    { name: 'fee', label: t('tr.monthlyFee'), kind: 'rupees', init: r ? String(r.monthlyFeePaise / 100) : '' },
  ];
  const live = trips.filter((x) => x.trip.status === 'running');

  const routeCols = [
    { label: t('ops.f.name'), cell: (r: TRoute) => <>{r.name} {!r.active && <Pill label={t('ops.st.inactive')} />}</> },
    { label: t('tr.vehicle'), cell: (r: TRoute) => r.regNo ?? t('ops.none') },
    { label: t('tr.driver'), cell: (r: TRoute) => r.driverName ?? t('ops.none') },
    { label: t('tr.stops'), cell: (r: TRoute) => r.stops, num: true },
    { label: t('tr.riders'), cell: (r: TRoute) => (r.capacity ? `${r.riders}/${r.capacity}` : r.riders), num: true },
    { label: t('tr.monthlyFee'), cell: (r: TRoute) => fmt.rupees(r.monthlyFeePaise), num: true },
    {
      label: '',
      cell: (r: TRoute) => (
        <>
          <Button size="small" onClick={() => void open(r.id, 'detail')}>{t('ops.details')}</Button>
          <Button size="small" onClick={() => setDlg({ k: 'edit', r })}>{t('ops.edit')}</Button>
          <ActionButton label={r.active ? t('tr.stopRoute') : t('tr.runRoute')} run={() => setRouteActive(r.id, !r.active)} onDone={toast} />
        </>
      ),
    },
  ];
  const tripCols = (rows: TTripRow[]) => (
    <Grid
      testId="tr-trips"
      empty={t('tr.noTrips')}
      rows={rows}
      cols={[
        { label: t('tr.route'), cell: (x) => x.routeName },
        { label: t('tr.direction'), cell: (x) => t(x.trip.direction === 'drop' ? 'tr.drop' : 'tr.pickup') },
        { label: t('ops.f.status'), cell: (x) => <Pill label={st(t, x.trip.status)} /> },
        { label: t('tr.started'), cell: (x) => fmt.dateTime(x.trip.startedAt) },
        { label: t('tr.lastPing'), cell: (x) => (x.trip.lastPingAt ? fmt.time(x.trip.lastPingAt) : t('ops.none')) },
        { label: '', cell: (x) => <Button size="small" onClick={() => void open(x.trip.id, 'trip')}>{t('ops.details')}</Button> },
      ]}
    />
  );

  return (
    <>
      <Tabbed
        label={t('nav.transport')}
        initial={initialTab}
        actions={
          <>
            <Button variant="outlined" onClick={() => setDlg({ k: 'fees' })} disabled={routes.length === 0}>{t('tr.chargeFees')}</Button>
            <Button variant="contained" startIcon={<Add />} onClick={() => setDlg({ k: 'route' })}>{t('tr.addRoute')}</Button>
          </>
        }
        tabs={[
          { id: 'routes', label: t('tr.tab.routes', { n: routes.length }), node: <Grid testId="tr-route-list" empty={t('tr.noRoutes')} rows={routes} cols={routeCols} /> },
          {
            id: 'fleet',
            label: t('tr.tab.fleet', { n: vehicles.length + drivers.length }),
            node: (
              <>
                <Bar>
                  <Button variant="outlined" onClick={() => setDlg({ k: 'vehicle' })}>{t('tr.addVehicle')}</Button>
                  <Button variant="outlined" onClick={() => setDlg({ k: 'driver' })}>{t('tr.addDriver')}</Button>
                </Bar>
                <Grid
                  testId="tr-vehicle-list"
                  empty={t('tr.noVehicles')}
                  rows={vehicles}
                  cols={[
                    { label: t('tr.regNo'), cell: (v) => v.regNo },
                    { label: t('tr.model'), cell: (v) => v.model || t('ops.none') },
                    { label: t('tr.capacity'), cell: (v) => v.capacity, num: true },
                    { label: t('ops.f.status'), cell: (v) => <Pill label={st(t, v.status)} /> },
                  ]}
                />
                <Typography variant="h6" sx={{ fontSize: '1.125rem', mt: 3, mb: 1 }}>{t('tr.drivers')}</Typography>
                <Grid
                  testId="tr-driver-list"
                  empty={t('tr.noDrivers')}
                  rows={drivers}
                  cols={[
                    { label: t('ops.f.name'), cell: (d) => d.fullName },
                    { label: t('tr.role'), cell: (d) => t(d.role === 'conductor' ? 'tr.conductor' : 'tr.driver') },
                    { label: t('ops.f.phone'), cell: (d) => d.phone || t('ops.none') },
                    { label: t('tr.licenceExpiry'), cell: (d) => (d.licenseExpiresOn ? fmt.date(d.licenseExpiresOn, 'short') : t('ops.none')) },
                  ]}
                />
              </>
            ),
          },
          {
            id: 'trips',
            label: t('tr.tab.trips', { n: live.length }),
            node: (
              <>
                <Typography variant="h6" sx={{ fontSize: '1.125rem', mb: 1 }}>{t('tr.liveTrips')}</Typography>
                {tripCols(live)}
                <Typography variant="h6" sx={{ fontSize: '1.125rem', mt: 3, mb: 1 }}>{t('tr.tripLog')}</Typography>
                {tripCols(trips)}
              </>
            ),
          },
          {
            id: 'compliance',
            label: t('tr.tab.compliance', { n: compliance.items.length }),
            node: (
              <Grid
                testId="tr-compliance"
                empty={t('tr.nothingExpiring')}
                rows={compliance.items}
                tint={(x) => x.expired}
                cols={[
                  { label: t('tr.subject'), cell: (x) => x.subject },
                  { label: t('tr.paper'), cell: (x) => (x.kind === 'licence' ? t('tr.licence') : x.kind === 'insurance' ? t('tr.insurance') : x.kind === 'fitness' ? t('tr.fitness') : t('tr.puc')) },
                  { label: t('tr.expiresOn'), cell: (x) => fmt.date(x.expiresOn, 'short') },
                  { label: t('ops.f.status'), cell: (x) => <Pill warn={x.expired} label={x.expired ? t('tr.expired') : t('tr.dueSoon')} /> },
                ]}
              />
            ),
          },
          {
            id: 'expenses',
            label: t('tr.tab.expenses'),
            node: (
              <>
                <Bar><Button variant="outlined" onClick={() => setDlg({ k: 'expense' })} disabled={vehicles.length === 0}>{t('tr.addExpense')}</Button></Bar>
                <Grid
                  testId="tr-expenses"
                  empty={t('tr.noExpenses')}
                  rows={expenses}
                  cols={[
                    { label: t('tr.regNo'), cell: (x) => x.regNo },
                    { label: t('tr.expTotal'), cell: (x) => fmt.rupees(x.totalPaise), num: true },
                    { label: t('tr.expFuel'), cell: (x) => fmt.rupees(x.fuelPaise), num: true },
                    { label: t('tr.expLitres'), cell: (x) => x.litres, num: true },
                    { label: t('tr.expKm'), cell: (x) => x.km, num: true },
                    { label: t('tr.expPerKm'), cell: (x) => (x.costPerKmPaise == null ? t('ops.none') : fmt.rupees(x.costPerKmPaise)), num: true },
                    { label: t('tr.expMileage'), cell: (x) => x.kmPerLitre ?? t('ops.none'), num: true },
                  ]}
                />
              </>
            ),
          },
          {
            id: 'incidents',
            label: t('tr.tab.incidents', { n: incidents.filter((i) => i.status === 'open').length }),
            node: (
              <>
                <Bar><Button variant="outlined" onClick={() => setDlg({ k: 'incident' })} disabled={vehicles.length === 0}>{t('tr.reportIncident')}</Button></Bar>
                <Grid
                  testId="tr-incidents"
                  empty={t('tr.noIncidents')}
                  rows={incidents}
                  tint={(i) => i.status === 'open' && i.severity === 'high'}
                  cols={[
                    { label: t('tr.regNo'), cell: (i) => i.regNo ?? t('ops.none') },
                    { label: t('tr.incKind'), cell: (i) => st(t, i.kind) },
                    { label: t('tr.incSeverity'), cell: (i) => <Pill warn={i.severity === 'high'} label={st(t, i.severity)} /> },
                    { label: t('ops.f.note'), cell: (i) => (i.resolution ? `${i.description} — ${i.resolution}` : i.description) },
                    { label: t('ops.f.status'), cell: (i) => <Pill label={st(t, i.status)} /> },
                    { label: '', cell: (i) => (i.status === 'open' ? <Button size="small" onClick={() => setDlg({ k: 'resolve', i })}>{t('tr.resolve')}</Button> : null) },
                  ]}
                />
              </>
            ),
          },
          {
            id: 'gps',
            label: t('tr.tab.gps', { n: sources.filter((x) => x.active).length }),
            node: (
              <>
                <Bar><Button variant="outlined" onClick={() => setDlg({ k: 'gpsNew' })}>{t('tr.addGps')}</Button></Bar>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>{t('tr.gpsHelp')}</Typography>
                <Grid
                  testId="tr-gps"
                  empty={t('tr.noGps')}
                  rows={sources}
                  cols={[
                    { label: t('ops.f.name'), cell: (x) => x.name },
                    { label: t('tr.gpsSeen'), cell: (x) => (x.lastSeenAt ? fmt.dateTime(x.lastSeenAt) : t('ops.none')) },
                    { label: t('ops.f.status'), cell: (x) => <Pill label={x.active ? t('tr.gpsActive') : t('tr.gpsRevoked')} /> },
                    { label: '', cell: (x) => (x.active ? <ActionButton tone="error" label={t('tr.gpsRevoke')} run={() => revokeGpsSource(x.id)} onDone={toast} /> : null) },
                  ]}
                />
              </>
            ),
          },
        ]}
      />

      {dlg?.k === 'route' && <FormDialog title={t('tr.addRoute')} fields={routeFields()} onSubmit={addRoute} onClose={done} />}
      {dlg?.k === 'edit' && <FormDialog title={dlg.r.name} fields={routeFields(dlg.r)} onSubmit={(v) => updateRoute(dlg.r.id, v)} onClose={done} />}
      {dlg?.k === 'vehicle' && (
        <FormDialog
          title={t('tr.addVehicle')}
          onSubmit={addVehicle}
          onClose={done}
          fields={[
            { name: 'regNo', label: t('tr.regNo'), required: true },
            { name: 'model', label: t('tr.model') },
            { name: 'capacity', label: t('tr.capacity'), kind: 'number', required: true },
            { name: 'insurance', label: t('tr.insurance'), kind: 'date' },
            { name: 'fitness', label: t('tr.fitness'), kind: 'date' },
            { name: 'puc', label: t('tr.puc'), kind: 'date' },
          ]}
        />
      )}
      {dlg?.k === 'driver' && (
        <FormDialog
          title={t('tr.addDriver')}
          onSubmit={addDriver}
          onClose={done}
          fields={[
            { name: 'fullName', label: t('ops.f.name'), required: true },
            { name: 'phone', label: t('ops.f.phone') },
            { name: 'role', label: t('tr.role'), kind: 'select', init: 'driver', options: [{ value: 'driver', label: t('tr.driver') }, { value: 'conductor', label: t('tr.conductor') }] },
            { name: 'licenseNo', label: t('tr.licenceNo') },
            { name: 'licenseExpiresOn', label: t('tr.licenceExpiry'), kind: 'date' },
            { name: 'userId', label: t('tr.loginId'), kind: 'uuid' },
          ]}
        />
      )}
      {dlg?.k === 'fees' && (
        <FormDialog
          title={t('tr.chargeFees')}
          onSubmit={chargeFees}
          onClose={done}
          intro={<Typography variant="body2" color="text.secondary">{t('tr.chargeHelp')}</Typography>}
          fields={[
            { name: 'title', label: t('ops.f.title'), required: true },
            { name: 'dueOn', label: t('ops.f.dueOn'), kind: 'date', required: true },
            { name: 'routeId', label: t('tr.route'), kind: 'select', options: [{ value: '', label: t('tr.allRoutes') }, ...routes.map((r) => ({ value: r.id, label: r.name }))] },
          ]}
        />
      )}
      {dlg?.k === 'detail' && (
        <InfoDialog title={dlg.d.name} onClose={() => setDlg(null)}>
          <Bar>
            <Button variant="outlined" onClick={() => setDlg({ k: 'stop', d: dlg.d })}>{t('tr.addStop')}</Button>
          </Bar>
          <Grid
            testId="tr-stops"
            empty={t('tr.noStops')}
            rows={dlg.d.stops}
            cols={[
              { label: '#', cell: (s) => s.seq, num: true },
              { label: t('ops.f.name'), cell: (s) => s.name },
              { label: t('tr.pickupTime'), cell: (s) => s.pickupTime ?? t('ops.none') },
              { label: t('tr.riders'), cell: (s) => dlg.d.riders.filter((x) => x.stopId === s.id).length, num: true },
              { label: '', cell: (s) => <Button size="small" onClick={() => setDlg({ k: 'seat', d: dlg.d, stopId: s.id })}>{t('tr.seat')}</Button> },
            ]}
          />
          <Typography variant="h6" sx={{ fontSize: '1.125rem', mt: 3, mb: 1 }}>{t('tr.riders')}</Typography>
          <Grid
            testId="tr-riders-list"
            empty={t('tr.noRiders')}
            rows={dlg.d.riders}
            cols={[
              { label: t('ops.f.student'), cell: (x) => `${x.fullName}${x.rollNo ? ` (${x.rollNo})` : ''}` },
              { label: t('tr.stop'), cell: (x) => dlg.d.stops.find((s) => s.id === x.stopId)?.name ?? t('ops.none') },
              { label: '', cell: (x) => <ActionButton tone="error" label={t('tr.endSeat')} run={() => endSeat(x.studentId)} onDone={(m) => { setDlg(null); toast(m); }} /> },
            ]}
          />
        </InfoDialog>
      )}
      {dlg?.k === 'stop' && (
        <FormDialog
          title={t('tr.addStop')}
          onSubmit={(v) => addStop(dlg.d.id, v)}
          onClose={done}
          fields={[
            { name: 'name', label: t('ops.f.name'), required: true },
            { name: 'lat', label: t('tr.lat'), required: true },
            { name: 'lng', label: t('tr.lng'), required: true },
            { name: 'pickupTime', label: t('tr.pickupTime'), kind: 'time' },
          ]}
        />
      )}
      {dlg?.k === 'seat' && <FormDialog title={t('tr.seat')} onSubmit={(v) => seatStudent(dlg.d.id, dlg.stopId, v)} onClose={done} fields={[{ name: 'studentId', label: t('ops.f.studentId'), kind: 'uuid', required: true }, { name: 'startsOn', label: t('ops.f.startsOn'), kind: 'date' }]} />}
      {dlg?.k === 'trip' && (
        <InfoDialog title={t('tr.tripEvents')} onClose={() => setDlg(null)}>
          <Grid
            testId="tr-events"
            empty={t('tr.noEvents')}
            rows={dlg.d.events}
            cols={[
              { label: t('tr.event'), cell: (e) => st(t, e.kind) },
              { label: t('tr.stop'), cell: (e) => e.stopName ?? t('ops.none') },
              { label: t('tr.at'), cell: (e) => fmt.dateTime(e.at) },
            ]}
          />
        </InfoDialog>
      )}
      {dlg?.k === 'expense' && (
        <FormDialog
          title={t('tr.addExpense')}
          onSubmit={addExpense}
          onClose={done}
          fields={[
            { name: 'vehicleId', label: t('tr.regNo'), kind: 'select', required: true, options: vehicles.map((v) => ({ value: v.id, label: v.regNo })) },
            { name: 'kind', label: t('tr.incKind'), kind: 'select', required: true, init: 'fuel', options: ['fuel', 'repair', 'toll', 'other'].map((k) => ({ value: k, label: st(t, k) })) },
            { name: 'spentOn', label: t('ops.f.date'), kind: 'date', required: true },
            { name: 'amount', label: t('ops.f.amount'), kind: 'rupees', required: true },
            { name: 'litres', label: t('tr.expLitres'), kind: 'number' },
            { name: 'odometerKm', label: t('tr.odometer'), kind: 'number' },
          ]}
        />
      )}
      {dlg?.k === 'incident' && (
        <FormDialog
          title={t('tr.reportIncident')}
          onSubmit={reportIncident}
          onClose={done}
          fields={[
            { name: 'vehicleId', label: t('tr.regNo'), kind: 'select', required: true, options: vehicles.map((v) => ({ value: v.id, label: v.regNo })) },
            { name: 'kind', label: t('tr.incKind'), kind: 'select', required: true, options: ['accident', 'breakdown', 'delay', 'behaviour', 'other'].map((k) => ({ value: k, label: st(t, k) })) },
            { name: 'severity', label: t('tr.incSeverity'), kind: 'select', required: true, init: 'low', options: ['low', 'medium', 'high'].map((k) => ({ value: k, label: st(t, k) })) },
            { name: 'description', label: t('ops.f.note'), kind: 'multiline', required: true },
          ]}
        />
      )}
      {dlg?.k === 'resolve' && <FormDialog title={t('tr.resolve')} onSubmit={(v) => resolveIncident(dlg.i.id, v)} onClose={done} fields={[{ name: 'resolution', label: t('tr.resolution'), kind: 'multiline', required: true }]} />}
      {dlg?.k === 'gpsNew' && (
        <FormDialog
          title={t('tr.addGps')}
          onSubmit={async (v) => {
            const res = await addGpsSource(v.name);
            if (res.ok) setDlg({ k: 'token', token: res.data.token });
            return res;
          }}
          onClose={(m) => { if (m === undefined) setDlg(null); }}
          fields={[{ name: 'name', label: t('ops.f.name'), required: true }]}
        />
      )}
      {dlg?.k === 'token' && (
        <InfoDialog title={t('tr.gpsToken')} onClose={() => setDlg(null)}>
          <Typography variant="body2" sx={{ mb: 1 }}>{t('tr.gpsTokenHelp')}</Typography>
          <Typography component="code" data-testid="tr-gps-token" sx={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>{dlg.token}</Typography>
        </InfoDialog>
      )}
      {toastNode}
    </>
  );
}
