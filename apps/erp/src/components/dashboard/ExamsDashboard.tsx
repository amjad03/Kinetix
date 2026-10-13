import Link from 'next/link';
import { LinkButton } from '@/components/LinkButton';
import { EmptyState, ErrorState } from '@/components/States';
import { Card } from '@/components/ui/Card';
import { StatusPill, type Tone } from '@/components/ui/Badge';
import { StatGrid, StatTile } from '@/components/ui/StatTile';
import { api, load } from '@/lib/api';
import type { DashboardRollup } from '@/lib/dashboard';
import type { ExamSession } from '@/lib/exams';
import { getI18n } from '@/i18n/server';
import { AttentionInbox, ChartCard, DrillBars, MiniBars, MiniMeter, type InboxItem } from './home';
import { QuickActions, Row } from './parts';

import { ArrowRight as ArrowForward, CalendarClock, ClipboardCheck as GradingOutlined, FileQuestion as QuizOutlined, ListChecks as FactCheckOutlined, Percent, RefreshCcwDot as PublishedWithChangesOutlined, Stamp, Target as TrackChangesOutlined, TriangleAlert } from 'lucide-react';
import { naturalCompare } from '@/lib/natural';

const TONE: Record<ExamSession['status'], Tone> = { draft: 'neutral', scheduled: 'info', processed: 'warning', published: 'success', locked: 'neutral' };
const ORDER: ExamSession['status'][] = ['draft', 'scheduled', 'processed', 'published', 'locked'];

interface ResultRow {
  outcome: string;
  lines: { code: string; subject: string; passed: boolean }[];
}

/** The examination desk (exam controller): sessions in flight, pass rates of the latest results, and what waits for moderation or publication. */
export async function ExamsDashboard({ today }: { today: string }) {
  const { t, fmt } = await getI18n();
  const [sessions, roll] = await Promise.all([load(() => api<ExamSession[]>('/v1/exam-sessions')), load(() => api<DashboardRollup>('/v1/admin/dashboard'))]);
  if (sessions.error !== undefined) return <ErrorState message={sessions.error} />;
  const all = sessions.data;
  const active = all.filter((s) => s.status !== 'published' && s.status !== 'locked');
  const running = all.filter((s) => s.startsOn <= today && s.endsOn >= today);
  const published = all.filter((s) => s.status === 'published' || s.status === 'locked');
  const processed = all.filter((s) => s.status === 'processed');
  const awaiting = all.filter((s) => s.approvalRequestedAt && !s.approvedAt && s.status === 'processed');
  const p = roll.data?.pending;
  const list = [...all].sort((a, b) => naturalCompare(b.startsOn, a.startsOn)).slice(0, 6);

  // The latest session with results: pass percentage overall and by subject.
  const latest = [...all].filter((s) => s.status !== 'draft' && s.status !== 'scheduled').sort((a, b) => naturalCompare(b.endsOn, a.endsOn))[0];
  const res = latest ? await load(() => api<ResultRow[]>(`/v1/exam-sessions/${latest.id}/results`)) : null;
  const rows = res?.data ?? [];
  const lines = rows.flatMap((r) => r.lines);
  const passPct = lines.length ? Math.round((lines.filter((l) => l.passed).length / lines.length) * 1000) / 10 : null;
  const failed = rows.filter((r) => r.lines.some((l) => !l.passed)).length;
  const bySubject = [...new Map(lines.map((l) => [l.code, l.subject])).entries()]
    .map(([code, subject]) => {
      const ls = lines.filter((l) => l.code === code);
      return { id: code, label: subject || code, value: Math.round((ls.filter((l) => l.passed).length / ls.length) * 1000) / 10, href: `/exams/${latest?.id}` };
    })
    .sort((a, b) => a.value - b.value)
    .slice(0, 10);
  const weak = bySubject.filter((s) => s.value < 75);
  const byStatus = ORDER.map((st) => ({ id: st, label: t(`exm.st.${st}` as never), value: all.filter((s) => s.status === st).length, href: '/exams' }));

  const inbox = (
    [
      awaiting.length > 0 && { key: 'approve', kind: 'approval', tone: 'blue', icon: <Stamp />, title: t('dash.exm.inbox.approval', { n: awaiting.length }), detail: awaiting.map((s) => s.name).join(', '), action: t('home.review'), href: `/exams/${awaiting[0].id}` },
      processed.length - awaiting.length > 0 && { key: 'publish', kind: 'task', tone: 'amber', icon: <PublishedWithChangesOutlined />, title: t('dash.exm.inbox.publish', { n: processed.length - awaiting.length }), detail: processed.filter((s) => !awaiting.includes(s)).map((s) => s.name).join(', '), action: t('home.open'), href: '/exams' },
      weak.length > 0 && { key: 'weak', kind: 'alert', tone: 'red', icon: <TriangleAlert />, title: t('dash.exm.inbox.weak', { n: weak.length }), detail: weak.slice(0, 3).map((s) => `${s.label} ${s.value}%`).join(' · '), action: t('home.open'), href: `/exams/${latest?.id}` },
      running.length > 0 && { key: 'running', kind: 'task', tone: 'teal', icon: <CalendarClock />, title: t('dash.exm.inbox.running', { n: running.length }), detail: running.map((s) => s.name).join(', '), action: t('home.open'), href: `/exams/${running[0].id}` },
      (p?.marksToVerify ?? 0) > 0 && { key: 'verify', kind: 'task', tone: 'amber', icon: <FactCheckOutlined />, title: `${fmt.number(p?.marksToVerify ?? 0)} · ${t('dash.task.obe')}`, action: t('home.open'), href: '/results' },
      (p?.examPapers ?? 0) > 0 && { key: 'papers', kind: 'approval', tone: 'blue', icon: <QuizOutlined />, title: `${fmt.number(p?.examPapers ?? 0)} · ${t('dash.task.papers')}`, action: t('home.review'), href: '/exams' },
    ] as (InboxItem | false)[]
  ).filter((x): x is InboxItem => !!x);

  return (
    <>
      <StatGrid min={200}>
        <StatTile testId="stat-sessions" icon={<QuizOutlined />} label={t('dash.exm.active')} value={active.length} spark={all.length ? <MiniBars values={byStatus.map((s) => s.value)} label={t('dash.exm.byStatus')} /> : undefined} caption={t('dash.exm.activeCaption', { n: running.length })} href="/exams" />
        <StatTile testId="stat-pass" icon={<Percent />} label={t('dash.exm.pass')} value={passPct === null ? '—' : `${passPct}%`} spark={passPct !== null ? <MiniMeter value={passPct} tone={passPct < 75 ? 'amber' : 'teal'} /> : undefined} caption={latest ? latest.name : t('dash.exm.noResults')} href={latest ? `/exams/${latest.id}` : undefined} />
        <StatTile testId="stat-backlogs" icon={<TriangleAlert />} label={t('dash.exm.failed')} value={rows.length ? failed : '—'} tone={failed > 0 ? 'warning' : 'default'} caption={rows.length ? t('dash.exm.failedCaption', { n: rows.length }) : t('dash.exm.noResults')} href={latest ? `/exams/${latest.id}` : undefined} />
        <StatTile testId="stat-published" icon={<PublishedWithChangesOutlined />} label={t('dash.exm.published')} value={published.length} spark={all.length ? <MiniMeter value={(published.length / all.length) * 100} /> : undefined} caption={t('dash.exm.publishedCaption', { total: all.length })} href="/exams" />
      </StatGrid>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <ChartCard title={t('dash.exm.passBySubject')} subtitle={latest ? t('dash.exm.passBySubjectSub', { name: latest.name }) : undefined} className="xl:col-span-2" testId="pass-chart">
          {bySubject.length ? <DrillBars rows={bySubject} ariaLabel={t('dash.exm.passBySubject')} unit="%" max={100} refValue={75} refLabel={t('dash.exm.target75')} /> : res && res.error !== undefined ? <ErrorState message={res.error} /> : <EmptyState dense icon={<Percent />} title={t('dash.exm.noResults')} />}
        </ChartCard>
        <AttentionInbox items={inbox} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <ChartCard title={t('dash.exm.byStatus')} subtitle={t('dash.exm.byStatusSub')} testId="status-chart">
          {all.length ? <DrillBars rows={byStatus} ariaLabel={t('dash.exm.byStatus')} /> : <EmptyState dense icon={<QuizOutlined />} title={t('dash.exm.noSessions')} />}
        </ChartCard>
        <Card className="xl:col-span-2" title={t('dash.exm.sessions')} padded={false} action={<LinkButton href="/exams" size="small" endIcon={<ArrowForward />}>{t('dash.viewAll')}</LinkButton>} testId="exam-sessions">
          {list.length === 0 ? (
            <div className="px-5 pb-5">
              <EmptyState dense icon={<QuizOutlined />} title={t('dash.exm.noSessions')} />
            </div>
          ) : (
            <ul className="m-0 list-none p-0">
              {list.map((s) => (
                <li className="flex items-center gap-3 border-t px-5 py-2.5" key={s.id}>
                  <div className="min-w-0 flex-1">
                    <p className="m-0 truncate text-sm font-semibold">
                      <Link href={`/exams/${s.id}`} className="text-inherit no-underline hover:underline">
                        {s.name}
                      </Link>
                    </p>
                    <span className="text-xs text-muted-foreground">
                      {fmt.date(s.startsOn, 'dayMonth')} – {fmt.date(s.endsOn, 'dayMonth')}
                    </span>
                  </div>
                  <StatusPill tone={TONE[s.status]}>{t(`exm.st.${s.status}` as never)}</StatusPill>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      <Row cols={3}>
        <QuickActions
          t={t}
          actions={[
            { href: '/exams', label: t('dash.qa.exams'), icon: <QuizOutlined /> },
            { href: '/exams/schemes', label: t('dash.qa.schemes'), icon: <GradingOutlined /> },
            { href: '/exams/operations', label: t('dash.exm.operations'), icon: <CalendarClock /> },
            { href: '/results', label: t('dash.qa.results'), icon: <FactCheckOutlined /> },
            { href: '/obe', label: t('dash.qa.report'), icon: <TrackChangesOutlined /> },
          ]}
        />
      </Row>
    </>
  );
}
