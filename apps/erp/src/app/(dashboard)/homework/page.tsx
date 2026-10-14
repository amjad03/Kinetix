import type { Metadata } from 'next';
import { ClipboardList as AssignmentOutlined } from 'lucide-react';
import { HomeworkTable } from '@/components/HomeworkTable';
import { LmsTab } from '@/components/life/LmsTab';
import { PageHeader } from '@/components/PageHeader';
import { RangeToggle } from '@/components/RangeToggle';
import { EmptyState, ErrorState } from '@/components/States';
import { LinkTabs } from '@/components/ui';
import { api, load, requireSection } from '@/lib/api';
import { getI18n } from '@/i18n/server';
import type { MessageKey } from '@/i18n/messages';
import { loadRecords } from '@/lib/records-server';
import { schoolToday, TIMEZONE } from '@/lib/school';
import type { HomeworkRow, Structure } from '@/lib/types';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.homework') };
}

const RANGES = [7, 14, 30];
const TABS = ['recent', 'assignments', 'quizzes', 'compliance'] as const;
type Tab = (typeof TABS)[number];

/**
 * Homework and assessment: what was set recently, assignments as a record kit list (rules, extensions, groups,
 * marks and the push to internal marks), online quizzes (questions, attempts, item analysis) and the submission
 * compliance report.
 */
export default async function HomeworkPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireSection('school');
  const sp = await searchParams;
  const tab: Tab = TABS.includes(sp.tab as Tab) ? (sp.tab as Tab) : 'recent';
  const { t } = await getI18n();
  const tabs = <LinkTabs label={t('nav.homework')} value={tab} items={TABS.map((x) => ({ value: x, label: t(`ld.tab.${x}` as MessageKey), href: x === 'recent' ? '/homework' : `/homework?tab=${x}` }))} />;

  if (tab !== 'recent') {
    const structure = await load(() => api<Structure>('/v1/admin/structure'));
    const sections = (structure.data?.sections ?? []).map((x) => ({ id: x.id, name: x.displayName }));
    const subjects = (structure.data?.subjects ?? []).map((x) => ({ id: x.id, name: `${x.code} ${x.name}` }));
    const header = <PageHeader title={t('nav.homework')} subtitle={t('ld.subtitle')} />;
    if (tab === 'compliance') return <>{header}{tabs}<LmsTab tab={tab} sections={sections} subjects={subjects} /></>;
    const records = await loadRecords(tab === 'assignments' ? 'assignments' : 'lms-quizzes', sp);
    return (
      <>
        {header}
        {tabs}
        {records.error !== undefined ? <ErrorState message={records.error} /> : <LmsTab tab={tab} meta={records.data.meta} page={records.data.page} state={records.data.state} sections={sections} subjects={subjects} />}
      </>
    );
  }

  const d = Number(sp.days);
  const days = RANGES.includes(d) ? d : 7;
  const today = schoolToday();
  const res = await load(() => api<HomeworkRow[]>(`/v1/admin/homework?days=${days}`));
  const rows = res.data ?? [];
  const classes = new Set(rows.map((r) => r.section)).size;
  const teachers = new Set(rows.map((r) => r.teacher)).size;
  return (
    <>
      <PageHeader
        title={t('nav.homework')}
        subtitle={
          res.data
            ? `${t.plural('hw.subtitle', rows.length, { days })}${rows.length ? ` · ${t.plural('hw.classes', classes)} · ${t.plural('hw.teachers', teachers)}` : ''}`
            : t('hw.setInLast', { days })
        }
        actions={<RangeToggle value={days} options={RANGES} />}
      />
      {tabs}
      {res.error !== undefined ? (
        <ErrorState message={res.error} />
      ) : rows.length === 0 ? (
        <EmptyState icon={<AssignmentOutlined />} title={t('hw.none', { days })} testId="no-homework">
          {t('hw.noneBody')} {days < 30 ? t('hw.tryLonger') : ''}
        </EmptyState>
      ) : (
        <HomeworkTable rows={rows} today={today} timezone={TIMEZONE} />
      )}
    </>
  );
}
