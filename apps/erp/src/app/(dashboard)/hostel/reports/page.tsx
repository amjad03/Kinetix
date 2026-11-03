import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { HostelLinks } from '@/components/hostel/HostelLinks';
import { LhtLinks } from '@/components/lht/LhtRecordsPage';
import { LinkButton } from '@/components/LinkButton';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { Card, LinkTabs, StatGrid, StatTile, StatusPill } from '@/components/ui';
import type { MessageKey } from '@/i18n/messages';
import { getI18n } from '@/i18n/server';
import { redirect, unstable_rethrow } from 'next/navigation';
import { canSee, homeFor } from '@/lib/access';
import { api, getMe, load } from '@/lib/api';
import type { Me } from '@/lib/types';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('hsp.rep.title') };
}

interface Compliance {
  antiRagging: { committee: boolean; squad: boolean; residents: number; received: number; verified: number; missing: number; percent: number };
  messCommittee: { constituted: boolean; inspections30d: number; openInspections: number; average: { quality: number | null; quantity: number | null; hygiene: number | null } };
  committees: { purpose: string; name: string; valid: boolean; members: number; meetingsLastYear: number; lastMeeting: string | null; helpline: string }[];
}
interface Defaulters {
  asOf: string;
  page: number;
  pageSize: number;
  total: number;
  balancePaise: number;
  rows: { studentId: string; studentName: string; rollNo: string; place: string | null; invoices: number; oldestDue: string; daysOverdue: number; balancePaise: number; ageing: { d30: number; d60: number; d90: number; over90: number } }[];
}
interface Aishe {
  year: string;
  from: string;
  to: string;
  aishe: { rows: { type: string; hostels: number; capacity: number; residing: number; male: number; female: number; other: number }[]; total: { hostels: number; capacity: number; residing: number } };
  naac: {
    hostels: number;
    blocks: number;
    rooms: number;
    beds: number;
    residents: number;
    occupancyPercent: number;
    byCategory: { category: string; residents: number }[];
    staff: { wardens: number; tutors: number; security: number; others: number };
    mess: { plans: number; diners: number };
    antiRagging: { committee: boolean; squad: boolean; undertakingsPercent: number; raggingIncidents: number };
    health: { sickbayVisits: number; emergencies: number };
    grievances: { complaints: number; resolved: number; resolvedPercent: number; meanDaysToResolve: number | null };
    discipline: { outPasses: number; lateEntries: number; incidents: number };
  };
}

type Tab = 'compliance' | 'defaulters' | 'aishe';

/** The hostel's own people, and the accountant (fee defaulters) and the IQAC (AISHE and NAAC), as the API allows. */
async function requireReports(): Promise<boolean> {
  let me: Me;
  try {
    me = await getMe();
  } catch (e) {
    unstable_rethrow(e);
    return false; // the layout shows the error
  }
  const staff = canSee(me.roles, 'hostel');
  if (!staff && !me.roles.some((r) => r === 'accountant' || r === 'quality_officer')) redirect(homeFor(me.roles));
  return staff;
}
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const YEAR = /^\d{4}-\d{2}$/;

/**
 * The hostel's reports: UGC anti-ragging and mess committee compliance, hostel and mess fee defaulters with ageing
 * (paged on the server), and the AISHE DCF-II hostel table with the NAAC hostel figures for an academic year.
 */
export default async function HostelReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const staff = await requireReports();
  const sp = await searchParams;
  const { t } = await getI18n();
  const tab: Tab = sp.tab === 'defaulters' || sp.tab === 'aishe' ? sp.tab : 'compliance';
  const items = (['compliance', 'defaulters', 'aishe'] as const).map((v) => ({ value: v, label: t(`hsp.rep.tab.${v}`), href: `/hostel/reports?tab=${v}` }));
  return (
    <>
      <PageHeader title={t('hsp.rep.title')} subtitle={t('hsp.rep.sub')} actions={staff ? <><LhtLinks module="hostel" here="home" /><HostelLinks here="reports" /></> : undefined} />
      <LinkTabs value={tab} label={t('hsp.rep.title')} items={items} />
      {tab === 'compliance' && <ComplianceTab />}
      {tab === 'defaulters' && <DefaultersTab asOf={sp.asOf && DAY.test(sp.asOf) ? sp.asOf : undefined} page={Math.max(Number(sp.page) || 1, 1)} />}
      {tab === 'aishe' && <AisheTab year={sp.year && YEAR.test(sp.year) ? sp.year : undefined} />}
    </>
  );
}

function Yes({ ok, yes, no }: { ok: boolean; yes: string; no: string }) {
  return <StatusPill tone={ok ? 'success' : 'danger'}>{ok ? yes : no}</StatusPill>;
}

function Table({ head, children, min = 520, testId }: { head: ReactNode[]; children: ReactNode; min?: number; testId?: string }) {
  return (
    <div className="overflow-x-auto" data-testid={testId}>
      <table className="w-full border-collapse text-sm" style={{ minWidth: min }}>
        <thead>
          <tr className="border-b text-left text-[13px] text-muted-foreground">
            {head.map((h, i) => (
              <th key={i} className={`py-2 pr-3 font-medium first:pl-5 last:pr-5 ${i > 0 ? 'text-right' : ''}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

const cell = (i: number) => `py-2 pr-3 first:pl-5 last:pr-5 ${i > 0 ? 'text-right tabular-nums' : ''}`;

async function ComplianceTab() {
  const { t, fmt } = await getI18n();
  const res = await load(() => api<Compliance>('/v1/hostel/compliance'));
  if (res.error !== undefined) return <ErrorState message={res.error} />;
  const { antiRagging: ar, messCommittee: mc, committees } = res.data;
  const score = (n: number | null) => (n === null ? '—' : fmt.number(n, { maximumFractionDigits: 2 }));
  return (
    <>
      <StatGrid min={150}>
        <StatTile label={t('hsp.rep.undertakings')} value={`${fmt.number(ar.percent)}%`} tone={ar.missing ? 'warning' : 'default'} caption={t('hsp.rep.undertakingsN', { done: ar.received + ar.verified, all: ar.residents })} href="/hostel/records?view=hostel-residents&f.status=resident&f.undertaking=missing" testId="hp-rep-undertakings" />
        <StatTile label={t('hsp.rep.missing')} value={fmt.number(ar.missing)} tone={ar.missing ? 'warning' : 'default'} />
        <StatTile label={t('hsp.rep.inspections')} value={fmt.number(mc.inspections30d)} caption={t('hsp.rep.openN', { n: mc.openInspections })} href="/hostel/records?view=mess-inspections" />
        <StatTile label={t('hsp.rep.hygiene')} value={score(mc.average.hygiene)} caption={t('hsp.rep.qualityN', { q: score(mc.average.quality), n: score(mc.average.quantity) })} />
      </StatGrid>
      <div className="grid items-start gap-5 lg:grid-cols-[1fr_2fr]">
        <Card title={t('hsp.rep.ugc')} subtitle={t('hsp.rep.ugcSub')} testId="hp-rep-ugc">
          <dl className="m-0 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-3 text-sm">
            <dt>{t('hsp.rep.arCommittee')}</dt>
            <dd className="m-0">
              <Yes ok={ar.committee} yes={t('hsp.rep.constituted')} no={t('hsp.rep.notConstituted')} />
            </dd>
            <dt>{t('hsp.rep.arSquad')}</dt>
            <dd className="m-0">
              <Yes ok={ar.squad} yes={t('hsp.rep.constituted')} no={t('hsp.rep.notConstituted')} />
            </dd>
            <dt>{t('hsp.rep.messCommittee')}</dt>
            <dd className="m-0">
              <Yes ok={mc.constituted} yes={t('hsp.rep.constituted')} no={t('hsp.rep.notConstituted')} />
            </dd>
            <dt>{t('hsp.rep.verified')}</dt>
            <dd className="m-0 text-right tabular-nums">{fmt.number(ar.verified)}</dd>
            <dt>{t('hsp.rep.received')}</dt>
            <dd className="m-0 text-right tabular-nums">{fmt.number(ar.received)}</dd>
          </dl>
          <p className="mb-0 text-[13px] text-muted-foreground">{t('hsp.rep.helpline')}</p>
        </Card>
        <Card title={t('hsp.rep.committees')} padded={false} action={<LinkButton href="/hostel/records?view=hostel-committees" variant="outlined">{t('hsp.rep.manage')}</LinkButton>} testId="hp-rep-committees">
          {committees.length === 0 ? (
            <p className="m-0 px-5 py-4 text-sm text-muted-foreground">{t('hsp.rep.noCommittees')}</p>
          ) : (
            <Table head={[t('hsp.c.committee'), t('hsp.c.members'), t('hsp.c.meetings'), t('hsp.c.lastMeeting'), t('hsp.c.status')]} min={560}>
              {committees.map((c, i) => (
                <tr key={i} className="border-b last:border-0">
                  <td className={cell(0)}>
                    <span className="font-medium">{c.name}</span>
                    <span className="block text-[13px] text-muted-foreground">{t(`rk.o.hostel-committees.purpose.${c.purpose}` as MessageKey)}</span>
                  </td>
                  <td className={cell(1)}>{fmt.number(c.members)}</td>
                  <td className={cell(2)}>{fmt.number(c.meetingsLastYear)}</td>
                  <td className={cell(3)}>{c.lastMeeting ? fmt.date(c.lastMeeting, 'day') : '—'}</td>
                  <td className={cell(4)}>
                    <Yes ok={c.valid} yes={t('rk.o.hostel-committees.current.yes')} no={t('rk.o.hostel-committees.current.no')} />
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      </div>
    </>
  );
}

async function DefaultersTab({ asOf, page }: { asOf?: string; page: number }) {
  const { t, fmt } = await getI18n();
  const q = new URLSearchParams({ page: String(page), pageSize: '50', ...(asOf ? { asOf } : {}) });
  const res = await load(() => api<Defaulters>(`/v1/hostel/reports/defaulters?${q}`));
  if (res.error !== undefined) return <ErrorState message={res.error} />;
  const d = res.data;
  const pages = Math.max(1, Math.ceil(d.total / d.pageSize));
  const sum = (k: keyof Defaulters['rows'][number]['ageing']) => d.rows.reduce((s, r) => s + r.ageing[k], 0);
  const link = (p: number) => `/hostel/reports?tab=defaulters&page=${p}${asOf ? `&asOf=${asOf}` : ''}`;
  return (
    <>
      <StatGrid min={150}>
        <StatTile label={t('hsp.rep.defaulters')} value={fmt.number(d.total)} tone={d.total ? 'warning' : 'default'} caption={t('hsp.rep.asOf', { date: fmt.date(d.asOf, 'day') })} testId="hp-rep-defaulters" />
        <StatTile label={t('hsp.rep.balance')} value={fmt.rupees(d.balancePaise)} />
        <StatTile label={t('hsp.rep.over90')} value={fmt.rupees(sum('over90'))} caption={t('hsp.rep.thisPage')} />
      </StatGrid>
      <Card
        title={t('hsp.rep.defaultersList')}
        subtitle={t('hsp.rep.defaultersSub')}
        padded={false}
        action={
          <form className="flex items-center gap-2" action="/hostel/reports">
            <input type="hidden" name="tab" value="defaulters" />
            <label className="text-[13px] text-muted-foreground" htmlFor="hp-asof">
              {t('hsp.rep.asOfLabel')}
            </label>
            <input id="hp-asof" name="asOf" type="date" defaultValue={d.asOf} className="h-9 rounded-md border bg-background px-2 text-sm" />
            <button type="submit" className="h-9 rounded-md border px-3 text-sm">
              {t('hsp.rep.show')}
            </button>
          </form>
        }
        testId="hp-rep-defaulters-list"
      >
        {d.rows.length === 0 ? (
          <p className="m-0 px-5 py-4 text-sm text-muted-foreground">{t('hsp.rep.noDefaulters')}</p>
        ) : (
          <Table head={[t('hsp.c.student'), t('hsp.c.bills'), t('hsp.c.oldestDue'), t('hsp.c.days'), '0–30', '31–60', '61–90', '90+', t('hsp.c.balance')]} min={860}>
            {d.rows.map((r) => (
              <tr key={r.studentId} className="border-b last:border-0">
                <td className={cell(0)}>
                  <span className="font-medium">{r.studentName}</span>
                  <span className="block text-[13px] text-muted-foreground">
                    {r.rollNo} · {r.place ?? t('hsp.rep.left')}
                  </span>
                </td>
                <td className={cell(1)}>{fmt.number(r.invoices)}</td>
                <td className={cell(2)}>{fmt.date(r.oldestDue, 'day')}</td>
                <td className={cell(3)}>{fmt.number(r.daysOverdue)}</td>
                <td className={cell(4)}>{fmt.rupees(r.ageing.d30)}</td>
                <td className={cell(5)}>{fmt.rupees(r.ageing.d60)}</td>
                <td className={cell(6)}>{fmt.rupees(r.ageing.d90)}</td>
                <td className={cell(7)}>{fmt.rupees(r.ageing.over90)}</td>
                <td className={`${cell(8)} font-medium`}>{fmt.rupees(r.balancePaise)}</td>
              </tr>
            ))}
          </Table>
        )}
        {pages > 1 && (
          <nav className="flex items-center justify-end gap-2 border-t px-5 py-3 text-sm" aria-label={t('hsp.rep.pages')}>
            {d.page > 1 && <LinkButton href={link(d.page - 1)} variant="outlined">{t('hsp.rep.prev')}</LinkButton>}
            <span className="text-muted-foreground">{t('hsp.rep.pageN', { n: d.page, of: pages })}</span>
            {d.page < pages && <LinkButton href={link(d.page + 1)} variant="outlined">{t('hsp.rep.next')}</LinkButton>}
          </nav>
        )}
      </Card>
    </>
  );
}

async function AisheTab({ year }: { year?: string }) {
  const { t, fmt } = await getI18n();
  const res = await load(() => api<Aishe>(`/v1/hostel/reports/aishe${year ? `?year=${year}` : ''}`));
  if (res.error !== undefined) return <ErrorState message={res.error} />;
  const a = res.data;
  const n = a.naac;
  const start = Number(a.year.slice(0, 4));
  const yearLink = (y: number) => `/hostel/reports?tab=aishe&year=${y}-${String((y + 1) % 100).padStart(2, '0')}`;
  const pct = (v: number) => `${fmt.number(v)}%`;
  const rows: [string, ReactNode][] = [
    [t('hsp.naac.rooms'), fmt.number(n.rooms)],
    [t('hsp.naac.wardens'), fmt.number(n.staff.wardens)],
    [t('hsp.naac.tutors'), fmt.number(n.staff.tutors)],
    [t('hsp.naac.security'), fmt.number(n.staff.security)],
    [t('hsp.naac.messPlans'), t('hsp.naac.dinersN', { plans: n.mess.plans, diners: n.mess.diners })],
    [t('hsp.rep.arCommittee'), <Yes key="c" ok={n.antiRagging.committee} yes={t('hsp.rep.constituted')} no={t('hsp.rep.notConstituted')} />],
    [t('hsp.rep.arSquad'), <Yes key="s" ok={n.antiRagging.squad} yes={t('hsp.rep.constituted')} no={t('hsp.rep.notConstituted')} />],
    [t('hsp.naac.undertakings'), pct(n.antiRagging.undertakingsPercent)],
    [t('hsp.naac.ragging'), fmt.number(n.antiRagging.raggingIncidents)],
    [t('hsp.naac.sickbay'), t('hsp.naac.emergenciesN', { visits: n.health.sickbayVisits, emergencies: n.health.emergencies })],
    [t('hsp.naac.complaints'), t('hsp.naac.resolvedN', { all: n.grievances.complaints, pct: fmt.number(n.grievances.resolvedPercent) })],
    [t('hsp.naac.meanDays'), n.grievances.meanDaysToResolve === null ? '—' : fmt.number(n.grievances.meanDaysToResolve)],
    [t('hsp.naac.passes'), fmt.number(n.discipline.outPasses)],
    [t('hsp.naac.late'), fmt.number(n.discipline.lateEntries)],
    [t('hsp.naac.incidents'), fmt.number(n.discipline.incidents)],
  ];
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <LinkButton href={yearLink(start - 1)} variant="outlined">
          {t('hsp.rep.prev')}
        </LinkButton>
        <span className="text-sm font-medium" data-testid="hp-aishe-year">
          {t('hsp.naac.year', { year: a.year, from: fmt.date(a.from, 'day'), to: fmt.date(a.to, 'day') })}
        </span>
        <LinkButton href={yearLink(start + 1)} variant="outlined">
          {t('hsp.rep.next')}
        </LinkButton>
      </div>
      <StatGrid min={140}>
        <StatTile label={t('hsp.naac.hostels')} value={fmt.number(n.hostels)} caption={t('hsp.naac.blocksN', { n: n.blocks })} />
        <StatTile label={t('hsp.naac.beds')} value={fmt.number(n.beds)} />
        <StatTile label={t('hsp.naac.residents')} value={fmt.number(n.residents)} />
        <StatTile label={t('hsp.naac.occupancy')} value={pct(n.occupancyPercent)} testId="hp-naac-occupancy" />
      </StatGrid>
      <div className="grid items-start gap-5 lg:grid-cols-2">
        <Card title={t('hsp.aishe.title')} subtitle={t('hsp.aishe.sub')} padded={false} testId="hp-aishe">
          <Table head={[t('hsp.aishe.type'), t('hsp.aishe.hostels'), t('hsp.aishe.capacity'), t('hsp.aishe.residing'), t('hsp.aishe.male'), t('hsp.aishe.female'), t('hsp.aishe.other')]} min={520}>
            {a.aishe.rows.map((r) => (
              <tr key={r.type} className="border-b">
                <td className={cell(0)}>{t(`hsp.aishe.t.${r.type}` as MessageKey)}</td>
                {[r.hostels, r.capacity, r.residing, r.male, r.female, r.other].map((v, i) => (
                  <td key={i} className={cell(i + 1)}>
                    {fmt.number(v)}
                  </td>
                ))}
              </tr>
            ))}
            <tr className="font-medium">
              <td className={cell(0)}>{t('hsp.aishe.total')}</td>
              <td className={cell(1)}>{fmt.number(a.aishe.total.hostels)}</td>
              <td className={cell(2)}>{fmt.number(a.aishe.total.capacity)}</td>
              <td className={cell(3)}>{fmt.number(a.aishe.total.residing)}</td>
              <td className={cell(4)} colSpan={3} />
            </tr>
          </Table>
        </Card>
        <Card title={t('hsp.naac.title')} subtitle={t('hsp.naac.sub')} testId="hp-naac">
          <dl className="m-0 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 text-sm">
            {rows.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-muted-foreground">{k}</dt>
                <dd className="m-0 text-right font-medium tabular-nums">{v}</dd>
              </div>
            ))}
          </dl>
          {n.byCategory.length > 0 && (
            <>
              <h3 className="mt-4 mb-2 text-sm font-medium">{t('hsp.naac.byCategory')}</h3>
              <ul className="m-0 flex list-none flex-wrap gap-2 pl-0 text-sm">
                {n.byCategory.map((c) => (
                  <li key={c.category} className="rounded-md border px-2 py-1">
                    {t(`hsp.cat.${c.category}` as MessageKey)} · {fmt.number(c.residents)}
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>
      </div>
    </>
  );
}
