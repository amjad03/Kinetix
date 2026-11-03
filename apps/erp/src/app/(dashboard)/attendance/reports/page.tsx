import type { Metadata } from 'next';
import { GraduationCap } from 'lucide-react';
import { AccreditationView, ComplianceTable, SubjectSummary, TrendView } from '@/components/attendance-desk/PassViews';
import { AttendanceTabs, DateField, FilterForm, SelectField } from '@/components/attendance-desk/kit';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState, ErrorState } from '@/components/States';
import { LinkTabs } from '@/components/ui';
import { getI18n } from '@/i18n/server';
import { api, load, requireSection } from '@/lib/api';
import { isId, type AccreditationFigures, type ComplianceRow, type DeskClass, type SubjectSummaryRow, type TrendWeek } from '@/lib/attendance-desk';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('atdp.rep.title') };
}

const VIEWS = ['compliance', 'subjects', 'trend', 'accreditation'] as const;
type View = (typeof VIEWS)[number];
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Attendance → Reports: faculty-wise marking compliance, a class's subject-wise summary, the defaulter trend week by
 * week, and the NAAC / AISHE / UDISE+ attendance figures. Filters live in the URL.
 */
export default async function AttendanceReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireSection('school');
  const sp = await searchParams;
  const { t } = await getI18n();
  const view: View = VIEWS.includes(sp.view as View) ? (sp.view as View) : 'compliance';
  const header = (
    <>
      <PageHeader title={t('atdp.rep.title')} subtitle={t('atdp.rep.subtitle')} />
      <AttendanceTabs value="reports" t={t} />
      <LinkTabs value={view} label={t('atdp.rep.title')} items={VIEWS.map((v) => ({ value: v, label: t(`atdp.rep.view.${v}`), href: `/attendance/reports?view=${v}` }))} />
    </>
  );

  if (view === 'compliance') {
    const q = new URLSearchParams({ ...(sp.from && DAY.test(sp.from) ? { from: sp.from } : {}), ...(sp.to && DAY.test(sp.to) ? { to: sp.to } : {}) });
    const res = await load(() => api<{ from: string; to: string; total: Parameters<typeof ComplianceTable>[0]['total']; rows: ComplianceRow[] }>(`/v1/attendance-desk/reports/compliance?${q.toString()}`));
    return (
      <>
        {header}
        {res.error !== undefined ? (
          <ErrorState message={res.error} />
        ) : (
          <>
            <FilterForm submit={t('atd.show')} hidden={{ view }}>
              <DateField label={t('atd.from')} name="from" value={res.data.from} />
              <DateField label={t('atd.to')} name="to" value={res.data.to} />
            </FilterForm>
            <ComplianceTable rows={res.data.rows} total={res.data.total} />
          </>
        )}
      </>
    );
  }

  if (view === 'accreditation') {
    const res = await load(() => api<AccreditationFigures>(`/v1/attendance-desk/reports/accreditation${sp.year && /^\d{4}-\d{2}$/.test(sp.year) ? `?year=${sp.year}` : ''}`));
    const now = new Date();
    const first = now.getUTCMonth() >= 5 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
    const years = Array.from({ length: 5 }, (_, i) => first - i).map((y) => `${y}-${String((y + 1) % 100).padStart(2, '0')}`);
    return (
      <>
        {header}
        {res.error !== undefined ? (
          <ErrorState message={res.error} />
        ) : (
          <>
            <FilterForm submit={t('atd.show')} hidden={{ view }}>
              <SelectField label={t('atdp.acc.year')} name="year" value={res.data.year} options={years.map((y) => ({ value: y, label: y }))} minWidth={140} />
            </FilterForm>
            <AccreditationView data={res.data} />
          </>
        )}
      </>
    );
  }

  const res = await load(async () => {
    const classes = await api<DeskClass[]>('/v1/attendance-desk/classes');
    const section = isId(sp.section) && classes.some((c) => c.id === sp.section) ? sp.section : view === 'subjects' ? classes[0]?.id : undefined;
    if (view === 'subjects') {
      const data = section ? await api<{ section: string; thresholdPct: number; rows: SubjectSummaryRow[] }>(`/v1/attendance-desk/reports/subjects?sectionId=${section}`) : null;
      return { classes, section, subjects: data, trend: null };
    }
    const trend = await api<{ classes: number; weeks: TrendWeek[] }>(`/v1/attendance-desk/reports/trend?weeks=8${section ? `&sectionId=${section}` : ''}`);
    return { classes, section, subjects: null, trend };
  });
  return (
    <>
      {header}
      {res.error !== undefined ? (
        <ErrorState message={res.error} />
      ) : !res.data.classes.length ? (
        <EmptyState icon={<GraduationCap />} title={t('atd.noClasses')}>
          {t('atd.noClassesBody')}
        </EmptyState>
      ) : (
        <>
          <FilterForm submit={t('atd.show')} hidden={{ view }}>
            <SelectField label={t('atd.class')} name="section" value={res.data.section} options={res.data.classes.map((c) => ({ value: c.id, label: c.name, group: c.program }))} empty={view === 'trend' ? t('atd.all') : undefined} minWidth={240} />
          </FilterForm>
          {res.data.subjects && res.data.section && <SubjectSummary rows={res.data.subjects.rows} thresholdPct={res.data.subjects.thresholdPct} sectionId={res.data.section} />}
          {res.data.trend && <TrendView weeks={res.data.trend.weeks} />}
        </>
      )}
    </>
  );
}
