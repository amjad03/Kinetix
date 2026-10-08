import ArrowForward from '@mui/icons-material/ArrowForward';
import EventNoteOutlined from '@mui/icons-material/EventNoteOutlined';
import FactCheckOutlined from '@mui/icons-material/FactCheckOutlined';
import GradingOutlined from '@mui/icons-material/GradingOutlined';
import PublishedWithChangesOutlined from '@mui/icons-material/PublishedWithChangesOutlined';
import QuizOutlined from '@mui/icons-material/QuizOutlined';
import TrackChangesOutlined from '@mui/icons-material/TrackChangesOutlined';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
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
import { PendingTasks, QuickActions, Row } from './parts';

const TONE: Record<ExamSession['status'], Tone> = { draft: 'neutral', scheduled: 'info', processed: 'warning', published: 'success', locked: 'neutral' };

/** The examination desk: sessions in flight, papers coming up, marks waiting for verification. */
export async function ExamsDashboard({ today }: { today: string }) {
  const { t, fmt } = await getI18n();
  const [sessions, roll] = await Promise.all([load(() => api<ExamSession[]>('/v1/exam-sessions')), load(() => api<DashboardRollup>('/v1/admin/dashboard'))]);
  if (sessions.error !== undefined) return <ErrorState message={sessions.error} />;
  const all = sessions.data;
  const active = all.filter((s) => s.status !== 'published' && s.status !== 'locked');
  const running = all.filter((s) => s.startsOn <= today && s.endsOn >= today);
  const published = all.filter((s) => s.status === 'published' || s.status === 'locked');
  const p = roll.data?.pending;
  const list = [...all].sort((a, b) => b.startsOn.localeCompare(a.startsOn)).slice(0, 7);

  return (
    <>
      <StatGrid min={200}>
        <StatTile testId="stat-sessions" icon={<QuizOutlined />} label={t('dash.exm.active')} value={active.length} caption={t('dash.exm.activeCaption', { n: running.length })} href="/exams" />
        <StatTile testId="stat-papers" icon={<EventNoteOutlined />} label={t('dash.exm.papers')} value={p?.examPapers ?? '—'} caption={t('dash.exm.papersCaption')} href="/exams" />
        <StatTile testId="stat-verify" icon={<FactCheckOutlined />} label={t('dash.exm.verify')} value={p?.marksToVerify ?? '—'} tone={(p?.marksToVerify ?? 0) > 0 ? 'warning' : 'default'} caption={t('dash.exm.verifyCaption')} href="/results" />
        <StatTile testId="stat-published" icon={<PublishedWithChangesOutlined />} label={t('dash.exm.published')} value={published.length} caption={t('dash.exm.publishedCaption', { total: all.length })} />
      </StatGrid>

      <Row cols={3}>
        <Card title={t('dash.exm.sessions')} padded={false} action={<LinkButton href="/exams" size="small" endIcon={<ArrowForward />}>{t('dash.viewAll')}</LinkButton>} testId="exam-sessions" sx={{ gridColumn: { xl: 'span 2' } }}>
          {list.length === 0 ? (
            <Box sx={{ px: 2.5, pb: 2.5 }}>
              <EmptyState dense icon={<QuizOutlined />} title={t('dash.exm.noSessions')} />
            </Box>
          ) : (
            <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
              {list.map((s) => (
                <Box component="li" key={s.id} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: 2.5, py: 1.25, borderTop: 1, borderColor: 'm3.outlineVariant' }}>
                  <Box sx={{ minWidth: 0, flex: 1 }}>
                    <Typography sx={{ fontSize: '0.875rem', fontWeight: 600 }} noWrap>
                      <Link href={`/exams/${s.id}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                        {s.name}
                      </Link>
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {fmt.date(s.startsOn, 'dayMonth')} – {fmt.date(s.endsOn, 'dayMonth')}
                    </Typography>
                  </Box>
                  <StatusPill tone={TONE[s.status]}>{t(`exm.st.${s.status}` as never)}</StatusPill>
                </Box>
              ))}
            </Box>
          )}
        </Card>
        <PendingTasks
          t={t}
          tasks={[
            { key: 'papers', label: t('dash.task.papers'), count: p?.examPapers ?? null, href: '/exams', icon: <QuizOutlined /> },
            { key: 'obe', label: t('dash.task.obe'), count: p?.marksToVerify ?? null, href: '/results', icon: <TrackChangesOutlined />, tone: 'warning' },
            { key: 'process', label: t('dash.task.process'), count: all.filter((s) => s.status === 'processed').length, href: '/exams', icon: <PublishedWithChangesOutlined /> },
          ]}
        />
      </Row>
      <Row cols={3}>
        <QuickActions
          t={t}
          actions={[
            { href: '/exams', label: t('dash.qa.exams'), icon: <QuizOutlined /> },
            { href: '/exams/schemes', label: t('dash.qa.schemes'), icon: <GradingOutlined /> },
            { href: '/results', label: t('dash.qa.results'), icon: <FactCheckOutlined /> },
            { href: '/obe', label: t('dash.qa.report'), icon: <TrackChangesOutlined /> },
          ]}
        />
      </Row>
    </>
  );
}
