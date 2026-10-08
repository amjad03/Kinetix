import AddCircleOutline from '@mui/icons-material/AddCircleOutlineOutlined';
import ArrowForward from '@mui/icons-material/ArrowForward';
import EventRepeatOutlined from '@mui/icons-material/EventRepeatOutlined';
import FolderOpenOutlined from '@mui/icons-material/FolderOpenOutlined';
import HowToRegOutlined from '@mui/icons-material/HowToRegOutlined';
import PersonSearchOutlined from '@mui/icons-material/PersonSearchOutlined';
import PlaylistAddCheckOutlined from '@mui/icons-material/PlaylistAddCheckOutlined';
import SchoolOutlined from '@mui/icons-material/SchoolOutlined';
import TodayOutlined from '@mui/icons-material/TodayOutlined';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Link from 'next/link';
import { LinkButton } from '@/components/LinkButton';
import { EmptyState, ErrorState } from '@/components/States';
import { Card } from '@/components/ui/Card';
import { StatusPill } from '@/components/ui/Badge';
import { StatGrid, StatTile } from '@/components/ui/StatTile';
import { api, load } from '@/lib/api';
import { ENQUIRY_STAGES, type CycleRow, type Pipeline } from '@/lib/admissions';
import type { DashboardRollup } from '@/lib/dashboard';
import { getI18n } from '@/i18n/server';
import { PendingTasks, QuickActions, Row } from './parts';

/** The admissions desk: the enquiry funnel, follow-ups due, applications to review and the open cycles. */
export async function AdmissionsDashboard() {
  const { t, fmt } = await getI18n();
  const [pipe, cycles, roll] = await Promise.all([
    load(() => api<Pipeline>('/v1/admissions/pipeline')),
    load(() => api<CycleRow[]>('/v1/admissions/cycles')),
    load(() => api<DashboardRollup>('/v1/admin/dashboard')),
  ]);
  if (pipe.error !== undefined) return <ErrorState message={pipe.error} />;
  const p = pipe.data;
  const total = Object.values(p.stages).reduce((a, b) => a + b, 0);
  const open = (cycles.data ?? []).filter((c) => c.status === 'open');
  const toReview = roll.data?.pending.admissionsReview ?? null;
  const funnel = ENQUIRY_STAGES.filter((s) => s !== 'lost' && s !== 'deferred');
  const maxStage = Math.max(1, ...funnel.map((s) => p.stages[s] ?? 0));

  return (
    <>
      <StatGrid min={200}>
        <StatTile testId="stat-enquiries" icon={<PersonSearchOutlined />} label={t('dash.adm.enquiries')} value={fmt.number(total)} caption={t('dash.adm.newThisWeek', { n: p.newThisWeek })} href="/admissions" />
        <StatTile testId="stat-followups" icon={<EventRepeatOutlined />} label={t('dash.adm.followUps')} value={p.followUpsDue} tone={p.followUpsDue > 0 ? 'warning' : 'default'} caption={t('dash.adm.followUpsCaption')} href="/admissions" />
        <StatTile testId="stat-review" icon={<PlaylistAddCheckOutlined />} label={t('dash.adm.toReview')} value={toReview ?? '—'} caption={t('dash.adm.toReviewCaption')} href="/admissions/applications" />
        <StatTile testId="stat-cycles" icon={<FolderOpenOutlined />} label={t('dash.adm.openCycles')} value={open.length} caption={open.length ? t('dash.adm.seatsLeft', { n: open.reduce((s, c) => s + c.seatsLeft, 0) }) : t('dash.adm.noOpen')} href="/admissions/cycles" />
      </StatGrid>

      <Row cols={3}>
        <Card title={t('dash.adm.funnel')} subtitle={t('dash.adm.funnelSub')} testId="funnel">
          <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 1.5 }}>
            {funnel.map((s, i) => {
              const n = p.stages[s] ?? 0;
              return (
                <li key={s}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                    <Typography sx={{ fontSize: '0.8125rem', fontWeight: 600 }}>{t(`adm.stage.${s}` as never)}</Typography>
                    <Typography sx={{ fontSize: '0.8125rem', fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>{n}</Typography>
                  </Box>
                  <Box role="img" aria-label={`${t(`adm.stage.${s}` as never)}: ${n}`} sx={{ height: 12, borderRadius: 6, bgcolor: 'm3.surfaceContainerHigh', overflow: 'hidden' }}>
                    <Box sx={{ width: `${(n / maxStage) * 100}%`, height: '100%', bgcolor: `var(--kx-chart-${(i % 3) + 1})`, borderRadius: 6 }} />
                  </Box>
                </li>
              );
            })}
          </Box>
        </Card>
        <Card title={t('dash.adm.cycles')} padded={false} action={<LinkButton href="/admissions/cycles" size="small" endIcon={<ArrowForward />}>{t('dash.viewAll')}</LinkButton>} testId="cycles">
          {(cycles.data ?? []).length === 0 ? (
            <Box sx={{ px: 2.5, pb: 2.5 }}>
              <EmptyState dense icon={<SchoolOutlined />} title={t('dash.adm.noCycles')} />
            </Box>
          ) : (
            <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
              {(cycles.data ?? []).slice(0, 6).map((c) => (
                <Box component="li" key={c.id} sx={{ px: 2.5, py: 1.25, borderTop: 1, borderColor: 'm3.outlineVariant', display: 'flex', alignItems: 'center', gap: 1.5 }}>
                  <Box sx={{ minWidth: 0, flex: 1 }}>
                    <Typography sx={{ fontSize: '0.875rem', fontWeight: 600 }} noWrap>
                      <Link href={`/admissions/cycles/${c.id}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                        {c.name}
                      </Link>
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {t('dash.adm.cycleLine', { program: c.programName, left: c.seatsLeft, seats: c.seats })}
                    </Typography>
                  </Box>
                  <StatusPill tone={c.status === 'open' ? 'success' : c.status === 'draft' ? 'neutral' : 'warning'}>{t(`adm.cycleStatus.${c.status}` as never)}</StatusPill>
                </Box>
              ))}
            </Box>
          )}
        </Card>
        <PendingTasks
          t={t}
          tasks={[
            { key: 'followups', label: t('dash.task.followUps'), count: p.followUpsDue, href: '/admissions', icon: <TodayOutlined />, tone: 'warning' },
            { key: 'review', label: t('dash.task.review'), count: toReview, href: '/admissions/applications', icon: <HowToRegOutlined /> },
          ]}
        />
      </Row>
      <Row cols={3}>
        <QuickActions
          t={t}
          actions={[
            { href: '/admissions', label: t('dash.qa.newEnquiry'), icon: <AddCircleOutline /> },
            { href: '/admissions/applications', label: t('dash.qa.applications'), icon: <HowToRegOutlined /> },
            { href: '/admissions/cycles', label: t('dash.qa.cycles'), icon: <FolderOpenOutlined /> },
            { href: '/students', label: t('dash.qa.students'), icon: <SchoolOutlined /> },
          ]}
        />
      </Row>
    </>
  );
}
