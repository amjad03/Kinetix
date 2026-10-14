import type { Metadata } from 'next';
import { Award, CalendarCheck, Download, ListTodo, MessageSquareText, Users } from 'lucide-react';
import { IqacList } from '@/components/accreditation/IqacLists';
import { DepthDesk } from '@/components/depth/DepthDesk';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { Card, LinkTabs, StatusPill } from '@/components/ui';
import { StatGrid, StatTile } from '@/components/ui/StatTile';
import { UrlSelect } from '@/components/UrlSelect';
import { getI18n } from '@/i18n/server';
import type { MessageKey } from '@/i18n/messages';
import { cycleOptions } from '@/lib/accreditation-ui';
import { api, load, requireSection } from '@/lib/api';
import type { Panel } from '@/lib/depth';
import { dl } from '@/lib/depth-ui';
import { loadRecords } from '@/lib/records-server';

interface Analysis {
  id: string;
  title: string;
  audience: string;
  responses: number;
  average: number | null;
}
interface Summary {
  cycle: string;
  composition: { total: number; byCategory: Record<string, number>; missing: string[] };
  meetings: { held: number; scheduled: number; approved: number; norm: number; short: number };
  actions: { open: number; overdue: number; done: number; total: number };
  initiatives: { planned: number; done: number };
  feedback: { stakeholders: { stakeholder: string; status: string }[] };
  aqar: { year: string; dueOn: string | null; submittedOn: string | null; status: string; reference: string | null }[];
}

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('acc.title.iqac') };
}

const TABS = ['overview', 'iqac-members', 'iqac-meetings', 'iqac-actions', 'iqac-initiatives', 'iqac-feedback', 'iqac-practices', 'iqac-aqar'] as const;
type Tab = (typeof TABS)[number];
const LABEL: Record<Tab, MessageKey> = {
  overview: 'iqx.tab.overview',
  'iqac-members': 'iqx.list.members',
  'iqac-meetings': 'iqx.list.meetings',
  'iqac-actions': 'iqx.list.actions',
  'iqac-initiatives': 'iqx.list.initiatives',
  'iqac-feedback': 'iqx.list.feedback',
  'iqac-practices': 'iqx.list.practices',
  'iqac-aqar': 'iqx.list.aqar',
};

/**
 * The IQAC: the year at a glance (composition against NAAC's list, meetings against the quarterly norm, action points,
 * initiatives, stakeholder feedback and the AQAR), and its registers as record kit lists.
 */
export default async function IqacPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireSection('accreditation');
  const { t, fmt } = await getI18n();
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const tab: Tab = TABS.includes(one(sp.tab) as Tab) ? (one(sp.tab) as Tab) : 'overview';
  const cycleQ = one(sp.cycle);
  const tabs = <LinkTabs value={tab} label={t('acc.title.iqac')} items={TABS.map((x) => ({ value: x, label: t(LABEL[x]), href: x === 'overview' ? '/accreditation/iqac' : `/accreditation/iqac?tab=${x}` }))} />;

  if (tab !== 'overview') {
    const records = await loadRecords(tab, sp);
    return (
      <>
        <PageHeader title={t('acc.title.iqac')} subtitle={t('acc.sub.iqac')} />
        {tabs}
        {records.error !== undefined ? <ErrorState message={records.error} /> : <IqacList entity={tab} meta={records.data.meta} page={records.data.page} state={records.data.state} extraParams={{ tab }} />}
      </>
    );
  }

  const data = await load(async () => {
    const s = await api<Summary>(`/v1/accreditation/iqac/summary${cycleQ && /^\d{4}-\d{2}$/.test(cycleQ) ? `?cycle=${cycleQ}` : ''}`);
    const analysis = await api<Analysis[]>('/v1/accreditation/iqac/feedback-analysis');
    return { s, analysis };
  });
  if (data.error !== undefined)
    return (
      <>
        <PageHeader title={t('acc.title.iqac')} subtitle={t('acc.sub.iqac')} />
        {tabs}
        <ErrorState message={data.error} />
      </>
    );
  const { s, analysis } = data.data;
  const panels: Panel[] = [
    {
      id: 'feedback',
      title: t('acc.iqac.feedback'),
      hint: t('acc.iqac.feedbackHint'),
      empty: t('acc.iqac.noSurveys'),
      columns: [
        { key: 'title', label: t('acc.c.survey') },
        { key: 'audience', label: t('acc.c.audience') },
        { key: 'responses', label: t('acc.c.responses'), kind: 'num' },
        { key: 'average', label: t('acc.c.average'), kind: 'num' },
      ],
      rows: analysis.map((a) => ({ ...a })),
    },
  ];
  const st = (x: string): 'success' | 'warning' | 'danger' | 'neutral' => (x === 'action_taken' || x === 'accepted' || x === 'submitted' ? 'success' : x === 'missing' || x === 'returned' ? 'danger' : 'warning');
  return (
    <>
      <PageHeader
        title={t('acc.title.iqac')}
        subtitle={t('acc.sub.iqac')}
        actions={
          <>
            <UrlSelect label={t('acc.cycle')} param="cycle" value={s.cycle} options={cycleOptions(s.cycle)} minWidth={160} />
            <a href={dl('accreditation', 'atr', `&cycle=${s.cycle}`)} className="inline-flex h-9 items-center gap-1.5 self-end rounded-md border bg-card px-3 text-[13px] font-medium text-foreground no-underline shadow-xs hover:bg-accent" data-testid="iqac-atr">
              <Download className="size-4 text-muted-foreground" aria-hidden />
              {t('acc.dl.atr')}
            </a>
          </>
        }
      />
      {tabs}
      <StatGrid min={200}>
        <StatTile testId="iqac-members" icon={<Users />} label={t('iqx.k.members')} value={s.composition.total} caption={s.composition.missing.length ? t('iqx.k.missing', { n: s.composition.missing.length }) : t('iqx.k.complete')} tone={s.composition.missing.length ? 'warning' : 'default'} />
        <StatTile testId="iqac-meetings" icon={<CalendarCheck />} label={t('acc.iqac.kMeetings')} value={s.meetings.held} caption={t('iqx.k.meetings', { norm: s.meetings.norm, scheduled: s.meetings.scheduled })} tone={s.meetings.short > 0 ? 'warning' : 'default'} />
        <StatTile testId="iqac-actions" icon={<ListTodo />} label={t('acc.iqac.kActions')} value={s.actions.open} caption={t('iqx.k.actions', { overdue: s.actions.overdue, done: s.actions.done, total: s.actions.total })} tone={s.actions.overdue > 0 ? 'warning' : 'default'} />
        <StatTile testId="iqac-initiatives" icon={<Award />} label={t('iqx.k.initiatives')} value={s.initiatives.done} caption={t('iqx.k.planned', { n: s.initiatives.planned })} />
      </StatGrid>
      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        <Card>
          <h2 className="m-0 mb-3 text-[15px] font-semibold">{t('iqx.o.composition')}</h2>
          {s.composition.missing.length === 0 ? (
            <p className="m-0 text-[13px] text-green-ink">{t('iqx.o.compositionOk')}</p>
          ) : (
            <>
              <p className="m-0 mb-2 text-[13px] text-muted-foreground">{t('iqx.o.compositionMissing')}</p>
              <div className="flex flex-wrap gap-1.5" data-testid="iqac-missing">
                {s.composition.missing.map((c) => (
                  <StatusPill key={c} tone="warning">
                    {t(`rk.o.iqac-members.category.${c}` as MessageKey)}
                  </StatusPill>
                ))}
              </div>
            </>
          )}
        </Card>
        <Card>
          <h2 className="m-0 mb-3 text-[15px] font-semibold">
            <MessageSquareText className="mr-1.5 inline size-4 text-muted-foreground" aria-hidden />
            {t('iqx.o.feedback')}
          </h2>
          <ul className="m-0 list-none p-0 text-[13px]">
            {s.feedback.stakeholders.map((f) => (
              <li key={f.stakeholder} className="mb-1.5 flex items-center justify-between gap-2">
                <span>{t(`acc.who.${f.stakeholder}` as MessageKey)}</span>
                <StatusPill tone={st(f.status)}>{t(`iqx.fb.${f.status}` as MessageKey)}</StatusPill>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <h2 className="m-0 mb-3 text-[15px] font-semibold">{t('iqx.o.aqar')}</h2>
          {s.aqar.length === 0 ? (
            <p className="m-0 text-[13px] text-muted-foreground">{t('iqx.empty.aqar')}</p>
          ) : (
            <ul className="m-0 list-none p-0 text-[13px]">
              {s.aqar.map((a) => (
                <li key={a.year} className="mb-1.5 flex items-center justify-between gap-2">
                  <span>
                    {a.year}
                    {a.dueOn ? <span className="text-muted-foreground"> · {t('iqx.o.due', { date: fmt.date(a.dueOn, 'short') })}</span> : null}
                  </span>
                  <StatusPill tone={st(a.status)}>{t(`rk.o.iqac-aqar.status.${a.status}` as MessageKey)}</StatusPill>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      <DepthDesk panels={panels} />
    </>
  );
}
