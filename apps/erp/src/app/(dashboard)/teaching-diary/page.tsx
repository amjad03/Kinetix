import type { Metadata } from 'next';
import { BookOpenCheck } from 'lucide-react';
import { CompletionTable, DiaryRecords, RegisterView, type CompletionRow, type Register } from '@/components/academics/TeachingDiary';
import { FilterForm, SelectField } from '@/components/attendance-desk/kit';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState, ErrorState } from '@/components/States';
import { LinkTabs } from '@/components/ui';
import { getI18n } from '@/i18n/server';
import { api, load, requireSection } from '@/lib/api';
import { loadRecords } from '@/lib/records-server';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.teachingDiary') };
}

const TABS = ['completion', 'diary', 'register'] as const;
type Tab = (typeof TABS)[number];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The teaching diary for heads of department and leaders: syllabus completion by class and course, the diary entries
 * teachers write after each period (reviewed here), and one course's register of hours allotted against taken.
 */
export default async function TeachingDiaryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const me = await requireSection('teachingDiary');
  const sp = await searchParams;
  const tab: Tab = TABS.includes(sp.tab as Tab) ? (sp.tab as Tab) : 'completion';
  const { t } = await getI18n();
  const canReview = (me?.roles ?? []).some((r) => r === 'hod' || r === 'principal' || r === 'tenant_admin');
  const head = (
    <>
      <PageHeader title={t('nav.teachingDiary')} subtitle={t('td.subtitle')} />
      <LinkTabs value={tab} label={t('nav.teachingDiary')} items={TABS.map((x) => ({ value: x, label: t(`td.tab.${x}`), href: `/teaching-diary?tab=${x}` }))} />
    </>
  );
  if (tab === 'diary') {
    const list = await loadRecords('teaching-logs', sp);
    return (
      <>
        {head}
        {list.error !== undefined ? <ErrorState message={list.error} /> : <DiaryRecords meta={list.data.meta} page={list.data.page} state={list.data.state} canReview={canReview} />}
      </>
    );
  }
  const department = typeof sp.department === 'string' && UUID.test(sp.department) ? sp.department : '';
  const done = await load(() => api<{ rows: CompletionRow[] }>(`/v1/teaching-log/completion${department ? `?departmentId=${department}` : ''}`));
  const options = await load(() => api<{ departments: { id: string; name: string }[] }>('/v1/timetable-studio/options'));
  const departments = options.data?.departments ?? [];
  if (tab === 'register') {
    const rows = done.data?.rows ?? [];
    const pairs = rows.map((r) => ({ value: `${r.sectionId}|${r.subjectId}`, label: `${r.section} · ${r.code} ${r.subject}`, group: r.department ?? '' }));
    const want = typeof sp.pair === 'string' ? sp.pair : typeof sp.section === 'string' && typeof sp.subject === 'string' ? `${sp.section}|${sp.subject}` : '';
    const pick = pairs.find((p) => p.value === want)?.value ?? pairs[0]?.value;
    const [section, subject] = pick ? pick.split('|') : [];
    const reg = pick ? await load(() => api<Register>(`/v1/teaching-log/register?sectionId=${section}&subjectId=${subject}`)) : null;
    return (
      <>
        {head}
        {done.error !== undefined ? (
          <ErrorState message={done.error} />
        ) : !pick ? (
          <EmptyState icon={<BookOpenCheck />} title={t('td.noCompletion')} description={t('td.noCompletionBody')} />
        ) : (
          <>
            <FilterForm submit={t('atd.show')} hidden={{ tab: 'register' }}>
              <SelectField label={t('td.course')} name="pair" value={pick} options={pairs} minWidth={320} />
            </FilterForm>
            {reg?.error !== undefined ? <ErrorState message={reg!.error} /> : <RegisterView r={reg!.data!} />}
          </>
        )}
      </>
    );
  }
  return (
    <>
      {head}
      {departments.length > 0 && (
        <FilterForm submit={t('atd.show')} hidden={{ tab: 'completion' }}>
          <SelectField label={t('td.department')} name="department" value={department} options={[{ value: '', label: t('td.allDepartments') }, ...departments.map((d) => ({ value: d.id, label: d.name }))]} minWidth={240} />
        </FilterForm>
      )}
      {done.error !== undefined ? <ErrorState message={done.error} /> : <CompletionTable rows={done.data!.rows} />}
    </>
  );
}
