import type { Metadata } from 'next';
import { LhtDesk, type DeskTask } from '@/components/lht/LhtDesk';
import { LhtLinks } from '@/components/lht/LhtRecordsPage';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { Card, StatGrid, StatTile } from '@/components/ui';
import type { MessageKey } from '@/i18n/messages';
import { getI18n } from '@/i18n/server';
import { api, load, requireSection } from '@/lib/api';
import { safe } from '@/lib/depth-ui';
import type { RecordMeta } from '@/lib/records';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('lht.desk.hostel') };
}

interface Occupancy {
  today: string;
  totals: { beds: number; occupied: number; held: number; closed: number; free: number };
  byBlock: { hostel: string | null; gender: string; block: string; type: string | null; status: string; beds: number; occupied: number; held: number }[];
  outNow: number;
  lateBack: number;
  visitorsInside: number;
  passRequests: number;
  applications: number;
  waitlisted: number;
  requests: number;
  complaintsOpen: number;
  sickbay: number;
  incidentsOpen: number;
  settlementsDue: number;
  depositsHeldPaise: number;
  dutyToday: { name: string; shift: string; hostel: string }[];
}

const opts = (meta: RecordMeta | null, field: string) => meta?.fields.find((f) => f.key === field)?.options ?? [];

/** The warden's desk: occupancy by block and room type, today's duty, auto-allotment, the mess bills and the roster. */
export default async function HostelDeskPage() {
  await requireSection('hostel');
  const { t, fmt } = await getI18n();
  const data = await load(async () => {
    const [occ, duties] = await Promise.all([api<Occupancy>('/v1/hostel/occupancy'), safe(api<RecordMeta>('/v1/records/hostel-duties/meta'), null)]);
    return { occ, duties };
  });
  if (data.error !== undefined)
    return (
      <>
        <PageHeader title={t('lht.desk.hostel')} actions={<LhtLinks module="hostel" here="desk" />} />
        <ErrorState message={data.error} />
      </>
    );
  const { occ: o, duties } = data.data;
  const hostels = opts(duties, 'hostelId');
  const month = o.today.slice(0, 7);
  const shifts = ['morning', 'evening', 'night'].map((s) => ({ value: s, label: t(`rk.o.hostel-duties.shift.${s}` as MessageKey) }));
  const word = (k: string, v: string) => t(`rk.o.${k}.${v}` as MessageKey);

  const tasks: DeskTask[] = [
    {
      id: 'allot',
      title: t('lht.ho.allot'),
      hint: t('lht.ho.allotHint'),
      path: '/v1/hostel/applications/auto-allot',
      submit: t('lht.ho.allotGo'),
      fields: [{ name: 'hostelId', label: t('lht.f.hostel'), type: 'select', options: hostels }],
      result: [
        { key: 'placed', label: t('lht.r.placed') },
        { key: 'unplaced', label: t('lht.r.waitlisted') },
      ],
    },
    {
      id: 'bills',
      title: t('lht.ho.bills'),
      hint: t('lht.ho.billsHint'),
      path: '/v1/hostel/mess/bills/run',
      submit: t('lht.ho.billsGo'),
      fields: [{ name: 'month', label: t('lht.f.month'), type: 'month', initial: month, required: true }],
      result: [
        { key: 'bills', label: t('lht.r.bills') },
        { key: 'alreadyCharged', label: t('lht.r.alreadyCharged') },
      ],
    },
    {
      id: 'charge',
      title: t('lht.ho.charge'),
      hint: t('lht.ho.chargeHint'),
      path: '/v1/hostel/mess/bills/charge',
      submit: t('lht.ho.chargeGo'),
      fields: [
        { name: 'month', label: t('lht.f.month'), type: 'month', initial: month, required: true },
        { name: 'dueOn', label: t('lht.f.dueOn'), type: 'date' },
      ],
      result: [
        { key: 'charged', label: t('lht.r.charged') },
        { key: 'skipped', label: t('lht.r.skipped') },
      ],
    },
    {
      id: 'roster',
      title: t('lht.ho.roster'),
      hint: t('lht.ho.rosterHint'),
      path: '/v1/hostel/duties/plan',
      submit: t('lht.ho.rosterGo'),
      fields: [
        { name: 'hostelId', label: t('lht.f.hostel'), type: 'select', options: hostels, required: true },
        { name: 'shift', label: t('lht.f.shift'), type: 'select', options: shifts, initial: 'night', required: true },
        { name: 'from', label: t('lht.f.from'), type: 'date', initial: o.today, required: true },
        { name: 'to', label: t('lht.f.to'), type: 'date', required: true },
        { name: 'userIds', label: t('lht.f.people'), type: 'multi', options: opts(duties, 'userId'), required: true },
      ],
      result: [{ key: 'made', label: t('lht.r.made') }],
    },
  ];

  return (
    <>
      <PageHeader title={t('lht.desk.hostel')} subtitle={t('lht.desk.hostel.sub')} actions={<LhtLinks module="hostel" here="desk" />} />
      <StatGrid min={140}>
        <StatTile label={t('lht.s.beds')} value={fmt.number(o.totals.beds)} caption={t('lht.s.occupiedN', { n: fmt.number(o.totals.occupied) })} testId="lht-ho-beds" />
        <StatTile label={t('lht.s.free')} value={fmt.number(o.totals.free)} caption={t('lht.s.heldN', { n: o.totals.held, closed: o.totals.closed })} href="/hostel/records?view=hostel-rooms&f.vacancy=yes" />
        <StatTile label={t('lht.s.applications')} value={fmt.number(o.applications)} caption={t('lht.s.waitlistN', { n: o.waitlisted })} href="/hostel/records?view=hostel-applications" />
        <StatTile label={t('lht.s.outNow')} value={fmt.number(o.outNow)} tone={o.lateBack ? 'warning' : 'default'} caption={t('lht.s.lateN', { n: o.lateBack })} href="/hostel/records?view=hostel-gate-passes&f.status=out" />
        <StatTile label={t('lht.s.passes')} value={fmt.number(o.passRequests)} caption={t('lht.s.visitorsN', { n: o.visitorsInside })} href="/hostel/records?view=hostel-gate-passes&f.status=requested" />
        <StatTile label={t('lht.s.requests')} value={fmt.number(o.requests)} href="/hostel/records?view=hostel-requests&f.status=pending" />
        <StatTile label={t('lht.s.complaints')} value={fmt.number(o.complaintsOpen)} caption={t('lht.s.incidentsN', { n: o.incidentsOpen })} href="/hostel/records?view=hostel-complaints" />
        <StatTile label={t('lht.s.sickbay')} value={fmt.number(o.sickbay)} tone={o.sickbay ? 'warning' : 'default'} href="/hostel/records?view=hostel-sickbay&f.inside=yes" />
        <StatTile label={t('lht.s.deposits')} value={fmt.rupees(o.depositsHeldPaise)} caption={t('lht.s.settleN', { n: o.settlementsDue })} href="/hostel/records?view=hostel-settlements&f.status=pending" />
      </StatGrid>
      <div className="mb-5 grid items-start gap-5 lg:grid-cols-[2fr_1fr]">
        <Card title={t('lht.ho.byBlock')} testId="lht-ho-blocks">
          {o.byBlock.length === 0 ? (
            <p className="m-0 text-sm text-muted-foreground">{t('lht.ho.noBeds')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] border-collapse text-sm">
                <thead>
                  <tr className="border-b text-left text-[13px] text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">{t('lht.c.hostel')}</th>
                    <th className="py-2 pr-3 font-medium">{t('lht.c.block')}</th>
                    <th className="py-2 pr-3 font-medium">{t('lht.c.type')}</th>
                    <th className="py-2 pr-3 font-medium">{t('lht.c.for')}</th>
                    <th className="py-2 pr-3 text-right font-medium">{t('lht.c.beds')}</th>
                    <th className="py-2 pr-3 text-right font-medium">{t('lht.c.occupied')}</th>
                    <th className="py-2 text-right font-medium">{t('lht.c.free')}</th>
                  </tr>
                </thead>
                <tbody>
                  {o.byBlock.map((r, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="py-2 pr-3">{r.hostel ?? '—'}</td>
                      <td className="py-2 pr-3">{r.block}</td>
                      <td className="py-2 pr-3">{r.type ?? '—'}</td>
                      <td className="py-2 pr-3">{word('hostels.gender', r.gender)}</td>
                      <td className="py-2 pr-3 text-right">{fmt.number(r.beds)}</td>
                      <td className="py-2 pr-3 text-right">{fmt.number(r.occupied)}</td>
                      <td className="py-2 text-right">{r.status === 'available' ? fmt.number(Math.max(0, r.beds - r.occupied - r.held)) : word('hostel-rooms.status', r.status)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
        <Card title={t('lht.ho.dutyToday')} testId="lht-ho-duty">
          {o.dutyToday.length === 0 ? (
            <p className="m-0 text-sm text-muted-foreground">{t('lht.ho.noDuty')}</p>
          ) : (
            <ul className="m-0 grid list-none gap-2 pl-0 text-sm">
              {o.dutyToday.map((d, i) => (
                <li key={i} className="flex flex-wrap justify-between gap-2">
                  <span className="font-medium">{d.name}</span>
                  <span className="text-muted-foreground">
                    {word('hostel-duties.shift', d.shift)} · {d.hostel}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      <LhtDesk tasks={tasks} />
    </>
  );
}
