import type { Metadata } from 'next';
import { LhtDesk, type DeskTask } from '@/components/lht/LhtDesk';
import { LhtLinks } from '@/components/lht/LhtRecordsPage';
import { PassLinks } from '@/components/lht/PassLinks';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { Card, StatGrid, StatTile, StatusPill } from '@/components/ui';
import type { MessageKey } from '@/i18n/messages';
import { getI18n } from '@/i18n/server';
import { api, load, requireSection } from '@/lib/api';
import { safe } from '@/lib/depth-ui';
import type { RecordsPage } from '@/lib/records';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('lht.desk.transport') };
}

interface Dash {
  today: string;
  routes: number;
  vehicles: number;
  studentRiders: number;
  staffRiders: number;
  liveTrips: number;
  papersDue: number;
  licencesDue: number;
  maintenanceOverdue: number;
  alertsOpen: number;
  incidentsOpen: number;
  claimsOpen: number;
  changeRequests: number;
  changesToday: number;
  uncovered: number;
  handoversToday: number;
}

type R = { id: string } & Record<string, unknown>;
const empty: RecordsPage<R> = { rows: [], total: 0, page: 1, pageSize: 200 };

/** The transport office: today's numbers, papers falling due, the month's fees, the duty sheet, hand-overs and bus passes. */
export default async function TransportDeskPage() {
  await requireSection('transport');
  const { t, fmt } = await getI18n();
  const data = await load(async () => {
    const [dash, cal, riders, persons, pending, routes] = await Promise.all([
      api<Dash>('/v1/transport/dashboard'),
      api<{ today: string; items: { kind: string; subject: string; due: string; overdue: boolean }[] }>('/v1/transport/calendar?days=60'),
      safe(api<RecordsPage<R>>('/v1/records/transport-riders?f.status=riding&f.kind=student&pageSize=200&sort=name:asc'), empty),
      safe(api<RecordsPage<R>>('/v1/records/transport-pickup-persons?f.active=yes&pageSize=200'), empty),
      safe(api<RecordsPage<R>>('/v1/records/transport-handovers?f.status=pending&pageSize=200'), empty),
      safe(api<RecordsPage<R>>('/v1/records/transport-routes?pageSize=200&sort=name:asc'), empty),
    ]);
    return { dash, cal, riders, persons, pending, routes };
  });
  if (data.error !== undefined)
    return (
      <>
        <PageHeader title={t('lht.desk.transport')} actions={<LhtLinks module="transport" here="desk" />} />
        <ErrorState message={data.error} />
      </>
    );
  const { dash: d, cal, riders, persons, pending, routes } = data.data;
  const students = riders.rows.map((r) => ({ value: String(r.studentId), label: `${r.name} (${r.rollNo ?? ''}) · ${r.routeName}` }));
  const routeOpts = routes.rows.map((r) => ({ value: r.id, label: String(r.name) }));
  const docWord = (kind: string) => (kind.startsWith('maintenance:') ? `${t('lht.tr.doc.maintenance')} · ${t(`rk.o.transport-maintenance.kind.${kind.slice(12)}` as MessageKey)}` : t(`lht.tr.doc.${kind}` as MessageKey));

  const tasks: DeskTask[] = [
    {
      id: 'fees',
      title: t('lht.tr.fees'),
      hint: t('lht.tr.feesHint'),
      path: '/v1/transport/fees/month',
      submit: t('lht.tr.feesGo'),
      fields: [
        { name: 'month', label: t('lht.f.month'), type: 'month', initial: d.today.slice(0, 7), required: true },
        { name: 'routeId', label: t('lht.f.route'), type: 'select', options: routeOpts },
        { name: 'dueOn', label: t('lht.f.dueOn'), type: 'date' },
      ],
      result: [
        { key: 'studentsCharged', label: t('lht.r.studentsCharged') },
        { key: 'studentsSkipped', label: t('lht.r.skipped') },
        { key: 'staffRecoveries', label: t('lht.r.staffRecoveries') },
      ],
    },
    {
      id: 'duty',
      title: t('lht.tr.duty'),
      hint: t('lht.tr.dutyHint'),
      path: '/v1/transport/duty/today',
      submit: t('lht.tr.dutyGo'),
      fields: [],
      result: [
        { key: 'made', label: t('lht.r.made') },
        { key: 'routes', label: t('lht.r.routes') },
      ],
    },
    {
      id: 'otp',
      title: t('lht.tr.otp'),
      hint: t('lht.tr.otpHint'),
      path: '/v1/transport/handovers/otp',
      submit: t('lht.tr.otpGo'),
      fields: [{ name: 'studentId', label: t('lht.f.student'), type: 'select', options: students, required: true }],
      result: [{ key: 'persons', label: t('lht.r.persons') }],
    },
    {
      id: 'verify',
      title: t('lht.tr.verify'),
      hint: t('lht.tr.verifyHint'),
      path: '/v1/transport/handovers/{handoverId}/verify',
      submit: t('lht.tr.verifyGo'),
      fields: [
        { name: 'handoverId', label: t('lht.f.handover'), type: 'select', options: pending.rows.map((h) => ({ value: h.id, label: `${h.studentName} · ${fmt.dateTime(String(h.createdAt))}` })), required: true },
        { name: 'otp', label: t('lht.f.otp'), type: 'text', required: true },
      ],
      result: [
        { key: 'ok', label: t('lht.r.handedOver'), kind: 'yes' },
        { key: 'attemptsLeft', label: t('lht.r.attemptsLeft') },
      ],
    },
    {
      id: 'photo',
      title: t('lht.tr.photo'),
      hint: t('lht.tr.photoHint'),
      path: '/v1/transport/handovers/photo',
      submit: t('lht.tr.photoGo'),
      fields: [
        { name: 'studentId', label: t('lht.f.student'), type: 'select', options: students, required: true },
        { name: 'personId', label: t('lht.f.person'), type: 'select', options: persons.rows.map((p) => ({ value: p.id, label: `${p.name} · ${p.studentName}` })), required: true },
      ],
      result: [{ key: 'status', label: t('lht.r.status'), words: { done: t('rk.o.transport-handovers.status.done') } }],
    },
  ];

  return (
    <>
      <PageHeader title={t('lht.desk.transport')} subtitle={t('lht.desk.transport.sub')} actions={<LhtLinks module="transport" here="desk" />} />
      <StatGrid min={140}>
        <StatTile label={t('lht.s.routes')} value={fmt.number(d.routes)} caption={t('lht.s.vehiclesN', { n: d.vehicles })} testId="lht-tr-routes" href="/transport/records?view=transport-routes" />
        <StatTile label={t('lht.s.riders')} value={fmt.number(d.studentRiders)} caption={t('lht.s.staffN', { n: d.staffRiders })} href="/transport/records?view=transport-riders" />
        <StatTile label={t('lht.s.live')} value={fmt.number(d.liveTrips)} tone={d.liveTrips ? 'live' : 'default'} href="/transport/records?view=transport-trips&f.status=running" />
        <StatTile label={t('lht.s.papers')} value={fmt.number(d.papersDue)} tone={d.papersDue || d.licencesDue ? 'warning' : 'default'} caption={t('lht.s.licencesN', { n: d.licencesDue })} />
        <StatTile label={t('lht.s.service')} value={fmt.number(d.maintenanceOverdue)} tone={d.maintenanceOverdue ? 'warning' : 'default'} href="/transport/records?view=transport-maintenance&f.overdue=yes" />
        <StatTile label={t('lht.s.alerts')} value={fmt.number(d.alertsOpen)} tone={d.alertsOpen ? 'warning' : 'default'} href="/transport/records?view=transport-alerts&f.open=no" />
        <StatTile label={t('lht.s.incidents')} value={fmt.number(d.incidentsOpen)} caption={t('lht.s.claimsN', { n: d.claimsOpen })} href="/transport/records?view=transport-incidents" />
        <StatTile label={t('lht.s.changes')} value={fmt.number(d.changeRequests)} caption={t('lht.s.changesTodayN', { n: d.changesToday })} href="/transport/records?view=transport-change-requests&f.status=pending" />
        <StatTile label={t('lht.s.uncovered')} value={fmt.number(d.uncovered)} tone={d.uncovered ? 'warning' : 'default'} caption={t('lht.s.handoversN', { n: d.handoversToday })} href="/transport/records?view=transport-duty&f.day=today" />
      </StatGrid>
      <div className="mb-5 grid items-start gap-5 lg:grid-cols-[2fr_1fr]">
        <Card title={t('lht.tr.calendar')} testId="lht-tr-calendar">
          {cal.items.length === 0 ? (
            <p className="m-0 text-sm text-muted-foreground">{t('lht.tr.nothingDue')}</p>
          ) : (
            <ul className="m-0 grid max-h-96 list-none gap-2 overflow-y-auto pl-0 text-sm">
              {cal.items.map((c, i) => (
                <li key={i} className="flex flex-wrap items-center justify-between gap-2 border-b pb-2 last:border-0">
                  <span className="min-w-0">
                    <span className="font-medium">{c.subject}</span> <span className="text-muted-foreground">· {docWord(c.kind)}</span>
                  </span>
                  <StatusPill tone={c.overdue ? 'danger' : 'warning'}>{c.overdue ? t('lht.tr.expiredOn', { date: fmt.date(c.due, 'day') }) : t('lht.tr.dueOn', { date: fmt.date(c.due, 'day') })}</StatusPill>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <PassLinks riders={students} routes={routeOpts} />
      </div>
      <LhtDesk tasks={tasks} />
    </>
  );
}
