import type { Metadata } from 'next';
import Link from 'next/link';
import { Card } from '@/components/ui';
import { PageHeader } from '@/components/PageHeader';
import { StatGrid, StatTile } from '@/components/StatTile';
import { getI18n } from '@/i18n/server';
import { api, load, requireSection } from '@/lib/api';
import { schoolToday } from '@/lib/school';
import type { Structure } from '@/lib/types';
import { bucketLabel, coverage, topTopics, type AiLogPage, type AiSummary, type Compute, type SubjectOutline } from '@/lib/zynetix';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.zxOverview') };
}

/** How many subjects' outlines the coverage figure reads (one request each). */
const MAX_SUBJECTS = 40;

/** Zynetix overview: boards online, AI answers today, refused and throttled, the peak hour, top topics and content coverage. */
export default async function ZynetixOverview() {
  await requireSection('zynetix');
  const { t, fmt } = await getI18n();
  const today = schoolToday();
  const [compute, summary, week, structure] = await Promise.all([
    load(() => api<Compute>('/v1/devices/compute')),
    load(() => api<AiSummary>(`/v1/ai/admin/logs/summary?from=${today}&to=${today}&bucket=hour`)),
    load(() => api<AiLogPage>('/v1/ai/admin/logs?pageSize=200')),
    load(() => api<Structure>('/v1/admin/structure')),
  ]);
  const linked = [...new Map((structure.data?.subjects ?? []).filter((s) => s.courseId).map((s) => [s.courseId, s])).values()].slice(0, MAX_SUBJECTS);
  const outlines = (await Promise.all(linked.map((s) => load(() => api<SubjectOutline>(`/v1/subjects/${s.id}/outline`)))))
    .map((o) => o.data)
    .filter((o): o is SubjectOutline => !!o);
  const cov = coverage(outlines);
  const c = compute.data;
  const tot = summary.data?.totals;
  const peak = summary.data?.peakHour;
  const top = topTopics(week.data?.items ?? []);
  const dash = '—';

  return (
    <>
      <PageHeader title={t('nav.zxOverview')} subtitle={t('zx.o.subtitle')} />
      <StatGrid>
        <StatTile label={t('zx.o.online')} value={c ? fmt.number(c.online) : dash} caption={c ? t('zx.o.ofBoards', { n: c.total }) : compute.error} href="/zynetix/boards" testId="zx-online" />
        <StatTile label={t('zx.o.offline')} value={c ? fmt.number(c.total - c.online) : dash} tone={c && c.total - c.online > 0 ? 'warning' : 'default'} href="/zynetix/boards" testId="zx-offline" />
        <StatTile label={t('zx.o.answers')} value={tot ? fmt.number(tot.served) : dash} caption={tot ? t('zx.o.ofRequests', { n: tot.requests }) : summary.error} href="/zynetix/ai-log" testId="zx-answers" />
        <StatTile label={t('zx.o.refused')} value={tot ? fmt.number(tot.throttled + tot.rejected) : dash} caption={tot ? t('zx.o.refusedCaption', { throttled: tot.throttled, rejected: tot.rejected }) : undefined} tone={tot && tot.throttled > 0 ? 'warning' : 'default'} testId="zx-refused" />
        <StatTile label={t('zx.o.peak')} value={peak ? bucketLabel(peak.at, 'hour', summary.data!.timezone).slice(-5) : dash} caption={peak ? t('zx.o.peakCaption', { n: peak.requests }) : t('zx.o.noPeak')} testId="zx-peak" />
        <StatTile label={t('zx.o.coverage')} value={cov.pct === null ? dash : `${cov.pct}%`} caption={t('zx.o.coverageCaption', { covered: cov.covered, topics: cov.topics })} href="/zynetix/library" testId="zx-coverage" />
      </StatGrid>
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card title={t('zx.o.topTopics')} subtitle={t('zx.o.topTopicsHelp')} testId="zx-top-topics">
          {top.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('zx.o.noTopics')}</p>
          ) : (
            <ol className="m-0 grid list-decimal gap-1 pl-5 text-sm">
              {top.map((tp) => (
                <li key={tp.id}>
                  <Link className="hover:underline" href={`/zynetix/ai-log?topicId=${tp.id}`}>
                    {tp.title}
                  </Link>{' '}
                  <span className="text-muted-foreground">· {t('zx.o.asks', { n: tp.requests })}</span>
                </li>
              ))}
            </ol>
          )}
        </Card>
        <Card title={t('zx.o.manage')}>
          <ul className="m-0 grid list-none gap-2 p-0 text-sm">
            {(
              [
                ['/zynetix/library', 'nav.zxLibrary', 'zx.o.libraryHelp'],
                ['/zynetix/youtube', 'nav.zxYoutube', 'zx.o.youtubeHelp'],
                ['/zynetix/programs', 'nav.zxPrograms', 'zx.o.programsHelp'],
                ['/timetable', 'nav.timetable', 'zx.o.timetableHelp'],
                ['/zynetix/teachers', 'nav.zxTeachers', 'zx.o.teachersHelp'],
              ] as const
            ).map(([href, label, help]) => (
              <li key={href}>
                <Link className="font-medium text-primary hover:underline" href={href}>
                  {t(label)}
                </Link>{' '}
                <span className="text-muted-foreground">· {t(help)}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
