import FileDownloadOutlined from '@mui/icons-material/FileDownloadOutlined';
import InboxOutlined from '@mui/icons-material/InboxOutlined';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import Typography from '@mui/material/Typography';
import type { Metadata } from 'next';
import { FormField, TextInput } from '@/components/ui';
import { LinkButton } from '@/components/LinkButton';
import { PageHeader, SectionTitle } from '@/components/PageHeader';
import { ClassEngagementTable } from '@/components/reports/ClassEngagementTable';
import { CatalogueTable, CoverageTable, ReportResultTable, ToolUseTable } from '@/components/reports/ReportTables';
import { Schedules } from '@/components/reports/Schedules';
import { StatGrid, StatTile } from '@/components/StatTile';
import { EmptyState, ErrorState } from '@/components/States';
import { getI18n } from '@/i18n/server';
import { api, load, requireSection } from '@/lib/api';
import { accreditationPath, isDay, type ClassroomAnalytics, type Kpis, type ReportMeta, type ReportResult, type Schedule } from '@/lib/insights';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.reports') };
}

type Search = { from?: string; to?: string; report?: string };
const MAX_ROWS = 200;

/** Reports and analytics: KPIs, classroom analytics, the report catalogue (view, CSV, PDF), accreditation packs and schedules. */
export default async function ReportsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const me = await requireSection('reports');
  const i18n = await getI18n();
  const { t, fmt } = i18n;
  const sp = await searchParams;
  const from = isDay(sp.from) ? sp.from : undefined;
  const to = isDay(sp.to) ? sp.to : undefined;
  const range = new URLSearchParams([...(from ? [['from', from]] : []), ...(to ? [['to', to]] : [])]).toString();
  const roles = me?.roles ?? [];
  const leader = roles.includes('principal') || roles.includes('tenant_admin');
  const academic = leader || roles.includes('hod');

  const catalogue = await load(() => api<ReportMeta[]>('/v1/analytics/reports'));
  if (catalogue.error !== undefined) return (
    <>
      <PageHeader title={t('reports.title')} />
      <ErrorState message={catalogue.error} />
    </>
  );
  const [kpis, classroom, schedules, result] = await Promise.all([
    leader ? load(() => api<Kpis>(`/v1/analytics/kpis${range ? `?${range}` : ''}`)) : null,
    academic ? load(() => api<ClassroomAnalytics>(`/v1/analytics/classroom${range ? `?${range}` : ''}`)) : null,
    load(() => api<Schedule[]>('/v1/analytics/schedules')),
    sp.report && catalogue.data.some((r) => r.key === sp.report)
      ? load(() => api<ReportResult>(`/v1/analytics/reports/${sp.report}/run`, { method: 'POST', body: { params: { ...(from ? { from } : {}), ...(to ? { to } : {}) } } }))
      : null,
  ]);
  const k = kpis?.data;
  const dash = t('reports.kpi.none');

  return (
    <>
      <PageHeader title={t('reports.title')} subtitle={t('reports.subtitle')} />
      <Box sx={{ mb: 2 }}>
        <LinkButton href="/reports/custom" variant="outlined" data-testid="custom-reports-link">
          {t('rb.title')}
        </LinkButton>
      </Box>
      <Box component="form" method="get" sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'center', mb: 3 }}>
        <FormField label={t('reports.from')}>
          <TextInput type="date" name="from" defaultValue={from ?? ''} slotProps={{ inputLabel: { shrink: true } }} />
        </FormField>
        <FormField label={t('reports.to')}>
          <TextInput type="date" name="to" defaultValue={to ?? ''} slotProps={{ inputLabel: { shrink: true } }} />
        </FormField>
        {sp.report && <input type="hidden" name="report" value={sp.report} />}
        <Button type="submit" variant="outlined">
          {t('reports.apply')}
        </Button>
      </Box>

      {kpis?.error !== undefined && <ErrorState message={kpis.error} />}
      {k && (
        <StatGrid min={180}>
          <StatTile label={t('reports.kpi.students')} value={fmt.number(k.enrolment.active)} caption={`${fmt.number(k.enrolment.total)}`} testId="kpi-students" />
          <StatTile label={t('reports.kpi.attendance')} value={k.attendance.percent === null ? '–' : `${k.attendance.percent}%`} caption={k.attendance.percent === null ? dash : undefined} testId="kpi-attendance" />
          <StatTile label={t('reports.kpi.pass')} value={k.results.passPercent === null ? '–' : `${k.results.passPercent}%`} caption={k.results.session ?? dash} testId="kpi-pass" />
          <StatTile label={t('reports.kpi.collected')} value={fmt.rupeesShort(k.fees.collectedPaise)} caption={fmt.rupees(k.fees.collectedPaise)} testId="kpi-collected" />
          <StatTile label={t('reports.kpi.outstanding')} value={fmt.rupeesShort(k.fees.outstandingPaise)} caption={fmt.rupees(k.fees.outstandingPaise)} tone={k.fees.overduePaise > 0 ? 'warning' : 'default'} testId="kpi-outstanding" />
          <StatTile label={t('reports.kpi.staff')} value={fmt.number(k.staff.active)} testId="kpi-staff" />
          <StatTile label={t('reports.kpi.placed')} value={fmt.number(k.placement.students)} caption={`${fmt.number(k.placement.offers)}`} testId="kpi-placed" />
          <StatTile label={t('reports.kpi.research')} value={fmt.number(k.research.outputs)} testId="kpi-research" />
        </StatGrid>
      )}

      {classroom?.data && (
        <>
          <SectionTitle>{t('reports.classroom')}</SectionTitle>
          <StatGrid min={180}>
            <StatTile label={t('reports.classroom.sessions')} value={fmt.number(classroom.data.sessions.total)} testId="classroom-sessions" />
            <StatTile label={t('reports.classroom.hours')} value={fmt.number(classroom.data.sessions.hours)} />
            <StatTile label={t('reports.classroom.teachers')} value={fmt.number(classroom.data.sessions.teachers)} />
            <StatTile label={t('reports.classroom.boardsUsed')} value={fmt.number(classroom.data.sessions.boards)} />
          </StatGrid>
          <SectionTitle>{t('reports.classroom.byClass')}</SectionTitle>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            {t('reports.classroom.byClassHint')}
          </Typography>
          <ClassEngagementTable rows={classroom.data.bySection} i18n={i18n} />
          <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, mt: 2 }}>
            <ToolUseTable rows={classroom.data.tools} />
            <CoverageTable rows={classroom.data.coverage} />
          </Box>
        </>
      )}

      <SectionTitle>{t('reports.catalogue')}</SectionTitle>
      <CatalogueTable rows={catalogue.data} selected={sp.report} range={range} from={from} to={to} />

      {result?.error !== undefined && <ErrorState message={result.error} />}
      {result?.data && (
        <>
          <SectionTitle action={<LinkButton size="small" href={`/reports${range ? `?${range}` : ''}`}>{t('reports.close')}</LinkButton>}>{result.data.title}</SectionTitle>
          {result.data.rows.length === 0 ? (
            <EmptyState icon={<InboxOutlined />} title={t('reports.noRows')} />
          ) : (
            <ReportResultTable result={result.data} limit={MAX_ROWS} />
          )}
        </>
      )}

      {leader && (
        <>
          <SectionTitle>{t('reports.accreditation')}</SectionTitle>
          <Card sx={{ p: 2.5 }}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
              {t('reports.accreditation.lead')}
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              {(['naac', 'nirf', 'aishe'] as const).map((f) => (
                <Button key={f} variant="outlined" href={accreditationPath(f)} startIcon={<FileDownloadOutlined />}>
                  {f.toUpperCase()}
                </Button>
              ))}
            </Box>
          </Card>
        </>
      )}

      <SectionTitle>{t('reports.schedules')}</SectionTitle>
      <Card sx={{ p: 2.5 }}>
        {schedules.error !== undefined ? <ErrorState message={schedules.error} /> : <Schedules schedules={schedules.data} reports={catalogue.data} />}
      </Card>
    </>
  );
}
