import type { Metadata } from 'next';
import { DepthDesk } from '@/components/depth/DepthDesk';
import { LinkButton } from '@/components/LinkButton';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import type { MessageKey } from '@/i18n/messages';
import { getI18n } from '@/i18n/server';
import { api, load, requireSection } from '@/lib/api';
import type { Panel } from '@/lib/depth';
import { safe } from '@/lib/depth-ui';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('lp.rep.title') };
}

interface NaacYear {
  year: string;
  booksAdded: number;
  booksPaise: number;
  journals: number;
  eresources: number;
  journalsPaise: number;
  totalPaise: number;
  totalLakhs: number;
  openDays: number;
  footfallStudents: number;
  footfallTeachers: number;
  footfallOthers: number;
  footfallPerDay: number;
  onlineLogins: number;
  loans: number;
  usagePct: number;
}
interface Usage {
  from: string;
  to: string;
  resources: { id: string; title: string; provider: string; costPaise: number; opens: number; readers: number; sessions: number; searches: number; downloads: number; costPerUsePaise: number | null }[];
  totals: { opens: number; sessions: number; downloads: number };
}
interface Weeding {
  years: number;
  cutoff: string;
  rows: { id: string; accessionNo: string; title: string; author: string; pubYear: number | null; status: string; lastIssued: string | null; issues: number; reason: string }[];
}
interface Notices {
  total: number;
  rows: Record<string, unknown>[];
}
interface Exits {
  students: { studentId: string; fullName: string; rollNo: string; number: string; status: string; booksOut: number; unpaidPaise: number; feesPendingPaise: number; clear: boolean; member: { id: string } }[];
  staff: { separationId: string; fullName: string; lastWorkingDay: string; clearance: string; cardNo: string | null; booksOut: number; unpaidPaise: number; clear: boolean }[];
}

/**
 * The library's reports and follow-up: NAAC criterion 4.2 by year, e-resource use and cost per use, copies to weed,
 * overdue notices (sent each day, or now), and who is leaving with what they owe the library (TC and staff exits).
 */
export default async function LibraryReportsPage() {
  await requireSection('library');
  const { t, fmt } = await getI18n();
  const data = await load(async () => {
    const [naac, usage, weeding, notices, exits] = await Promise.all([
      api<{ years: NaacYear[]; averageLakhs: number }>('/v1/library/naac?years=5'),
      safe(api<Usage>('/v1/library/eresources/usage'), null),
      safe(api<Weeding>('/v1/library/weeding?years=5'), null),
      safe(api<Notices>('/v1/library/overdue-notices'), { total: 0, rows: [] }),
      safe(api<Exits>('/v1/library/exits'), { students: [], staff: [] }),
    ]);
    return { naac, usage, weeding, notices, exits };
  });
  const header = (
    <PageHeader
      title={t('lp.rep.title')}
      subtitle={t('lp.rep.subtitle')}
      actions={
        <>
          <LinkButton href="/library/desk" variant="outlined">
            {t('lht.desk.library')}
          </LinkButton>
          <LinkButton href="/ops-reports" variant="outlined">
            {t('cops.reports')}
          </LinkButton>
        </>
      }
    />
  );
  if (data.error !== undefined)
    return (
      <>
        {header}
        <ErrorState message={data.error} />
      </>
    );
  const { naac, usage, weeding, notices, exits } = data.data;
  const latest = naac.years[0];
  const provider = (v: string) => {
    const k = `rk.o.library-eresources.provider.${v}` as MessageKey;
    const s = t(k);
    return s === k ? v : s;
  };

  const panels: Panel[] = [
    {
      id: 'naac',
      title: t('lp.rep.naac'),
      hint: t('lp.rep.naacHint'),
      empty: t('lp.rep.naacNone'),
      stats: latest
        ? [
            { label: t('lp.rep.spendYear', { y: latest.year }), value: fmt.rupees(latest.totalPaise) },
            { label: t('lp.rep.avgLakhs'), value: t('lp.rep.lakhs', { n: naac.averageLakhs.toFixed(2) }) },
            { label: t('lp.rep.perDay'), value: fmt.number(latest.footfallPerDay) },
            { label: t('lp.rep.usage'), value: `${latest.usagePct}%` },
          ]
        : [],
      columns: [
        { key: 'year', label: t('lp.rep.c.year') },
        { key: 'booksAdded', label: t('lp.rep.c.booksAdded'), kind: 'num' },
        { key: 'booksPaise', label: t('lp.rep.c.books'), kind: 'paise' },
        { key: 'journals', label: t('lp.rep.c.journals'), kind: 'num' },
        { key: 'eresources', label: t('lp.rep.c.eres'), kind: 'num' },
        { key: 'journalsPaise', label: t('lp.rep.c.journalsSpend'), kind: 'paise' },
        { key: 'totalPaise', label: t('lp.rep.c.total'), kind: 'paise' },
        { key: 'footfallStudents', label: t('lp.rep.c.fStudents'), kind: 'num' },
        { key: 'footfallTeachers', label: t('lp.rep.c.fTeachers'), kind: 'num' },
        { key: 'footfallPerDay', label: t('lp.rep.c.perDay'), kind: 'num' },
        { key: 'onlineLogins', label: t('lp.rep.c.logins'), kind: 'num' },
        { key: 'loans', label: t('lp.rep.c.loans'), kind: 'num' },
        { key: 'usagePct', label: t('lp.rep.c.usage'), kind: 'pct' },
      ],
      rows: naac.years.map((y) => ({ id: y.year, ...y })),
      downloads: [{ label: t('lp.rep.naacXlsx'), href: '/api/download?kind=ops-report&id=library.naac&format=xlsx' }],
    },
    {
      id: 'usage',
      title: t('lp.rep.eres'),
      hint: usage ? t('lp.rep.eresHint', { from: usage.from, to: usage.to }) : undefined,
      empty: t('lp.rep.eresNone'),
      stats: usage
        ? [
            { label: t('lp.rep.c.opens'), value: fmt.number(usage.totals.opens) },
            { label: t('lp.rep.c.sessions'), value: fmt.number(usage.totals.sessions) },
            { label: t('lp.rep.c.downloads'), value: fmt.number(usage.totals.downloads) },
          ]
        : [],
      columns: [
        { key: 'title', label: t('lp.rep.c.resource') },
        { key: 'providerName', label: t('lp.rep.c.through') },
        { key: 'opens', label: t('lp.rep.c.opens'), kind: 'num' },
        { key: 'readers', label: t('lp.rep.c.readers'), kind: 'num' },
        { key: 'sessions', label: t('lp.rep.c.sessions'), kind: 'num' },
        { key: 'downloads', label: t('lp.rep.c.downloads'), kind: 'num' },
        { key: 'costPaise', label: t('lp.rep.c.cost'), kind: 'paise' },
        { key: 'costPerUsePaise', label: t('lp.rep.c.perUse'), kind: 'paise' },
      ],
      rows: (usage?.resources ?? []).map((r) => ({ ...r, providerName: provider(r.provider) })),
    },
    {
      id: 'weeding',
      title: t('lp.rep.weed'),
      hint: weeding ? t('lp.rep.weedHint', { years: weeding.years, cutoff: fmt.date(weeding.cutoff) }) : undefined,
      empty: t('lp.rep.weedNone'),
      columns: [
        { key: 'accessionNo', label: t('lp.rep.c.accession') },
        { key: 'title', label: t('lp.rep.c.title') },
        { key: 'author', label: t('lp.rep.c.author') },
        { key: 'pubYear', label: t('lp.rep.c.pubYear') },
        { key: 'lastIssued', label: t('lp.rep.c.lastIssued'), kind: 'date' },
        { key: 'issues', label: t('lp.rep.c.issues'), kind: 'num' },
        { key: 'reason', label: t('lp.rep.c.reason'), kind: 'pill', words: { damaged: t('lp.rep.r.damaged'), superseded: t('lp.rep.r.superseded'), never_issued: t('lp.rep.r.never'), not_used: t('lp.rep.r.notUsed') }, tones: { damaged: 'danger', superseded: 'info', never_issued: 'warning', not_used: 'neutral' } },
      ],
      rows: (weeding?.rows ?? []).slice(0, 200),
    },
    {
      id: 'notices',
      title: t('lp.rep.notices'),
      hint: t('lp.rep.noticesHint'),
      empty: t('lp.rep.noticesNone'),
      stats: [{ label: t('lp.rep.noticesSent'), value: fmt.number(notices.total) }],
      columns: [
        { key: 'sentAt', label: t('lp.rep.c.sentAt'), kind: 'datetime' },
        { key: 'title', label: t('lp.rep.c.title') },
        { key: 'borrower', label: t('lp.rep.c.borrower') },
        { key: 'dueOn', label: t('lp.rep.c.due'), kind: 'date' },
        { key: 'step', label: t('lp.rep.c.step'), kind: 'pill', words: { due_soon: t('lp.step.due_soon'), first: t('lp.step.first'), second: t('lp.step.second'), final: t('lp.step.final') }, tones: { due_soon: 'info', first: 'warning', second: 'warning', final: 'danger' } },
        { key: 'daysOverdue', label: t('lp.rep.c.daysLate'), kind: 'num' },
        { key: 'channels', label: t('lp.rep.c.channels') },
      ],
      rows: notices.rows,
      forms: [
        {
          id: 'run',
          title: t('lp.rep.runNotices'),
          submit: t('lp.rep.runGo'),
          path: '/v1/library/overdue-notices/run',
          fields: [],
          result: [
            { key: 'byStep.due_soon', label: t('lp.step.due_soon') },
            { key: 'byStep.first', label: t('lp.step.first') },
            { key: 'byStep.second', label: t('lp.step.second') },
            { key: 'byStep.final', label: t('lp.step.final') },
            { key: 'sent.sms', label: t('lp.rep.sms') },
          ],
        },
      ],
    },
    {
      id: 'leaving',
      title: t('lp.rep.leaving'),
      hint: t('lp.rep.leavingHint'),
      empty: t('lp.rep.leavingNone'),
      columns: [
        { key: 'fullName', label: t('lp.rep.c.student') },
        { key: 'rollNo', label: t('lp.rep.c.rollNo') },
        { key: 'number', label: t('lp.rep.c.request') },
        { key: 'booksOut', label: t('lp.rep.c.booksOut'), kind: 'num' },
        { key: 'unpaidPaise', label: t('lp.rep.c.unpaid'), kind: 'paise' },
        { key: 'feesPendingPaise', label: t('lp.rep.c.onFees'), kind: 'paise' },
        { key: 'clear', label: t('lp.rep.c.clear'), kind: 'yes' },
      ],
      rows: exits.students.map((s) => ({ ...s, id: s.studentId, memberId: s.member.id })),
      actions: [
        { label: t('lp.rep.toFees'), path: '/v1/library/members/{memberId}/fines-to-fees', show: { key: 'clear', is: [false] }, confirm: t('lp.rep.toFeesConfirm') },
        { label: t('lht.lib.noDuesGo'), path: '/v1/library/no-dues/{studentId}/clear', body: { purpose: 'TC' }, show: { key: 'clear', is: [true] } },
      ],
    },
    {
      id: 'staff',
      title: t('lp.rep.staff'),
      hint: t('lp.rep.staffHint'),
      empty: t('lp.rep.staffNone'),
      columns: [
        { key: 'fullName', label: t('lp.rep.c.staff') },
        { key: 'lastWorkingDay', label: t('lp.rep.c.lwd'), kind: 'date' },
        { key: 'cardNo', label: t('lp.rep.c.card') },
        { key: 'booksOut', label: t('lp.rep.c.booksOut'), kind: 'num' },
        { key: 'unpaidPaise', label: t('lp.rep.c.unpaid'), kind: 'paise' },
        { key: 'clearance', label: t('lp.rep.c.clearance'), kind: 'pill', words: { pending: t('lp.rep.pending'), cleared: t('lp.rep.cleared') }, tones: { pending: 'warning', cleared: 'success' } },
      ],
      rows: exits.staff.map((s) => ({ ...s, id: s.separationId })),
      actions: [{ label: t('lp.rep.clearStaff'), path: '/v1/library/exits/staff/{id}/clear', show: { key: 'clearance', is: ['pending'] }, fields: [{ name: 'remarks', label: t('lp.rep.remarks'), type: 'text' }] }],
    },
  ];

  return (
    <>
      {header}
      <DepthDesk panels={panels} />
    </>
  );
}
