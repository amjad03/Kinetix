import type { Metadata } from 'next';
import { RegistrationDesk } from '@/components/course-registration/RegistrationDesk';
import { PageHeader } from '@/components/PageHeader';
import { StatGrid, StatTile } from '@/components/StatTile';
import { EmptyState, ErrorState } from '@/components/States';
import Box from '@mui/material/Box';
import { UrlSelect } from '@/components/UrlSelect';
import { api, load, requireSection } from '@/lib/api';
import { getI18n } from '@/i18n/server';
import type { ApprovalRow, OfferingRow, TermRow, WindowRow } from '@/lib/course-registration';
import type { Structure } from '@/lib/types';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.courseRegistration') };
}

export default async function CourseRegistrationPage({ searchParams }: { searchParams: Promise<{ term?: string }> }) {
  await requireSection('courseRegistration');
  const sp = await searchParams;
  const { t, fmt } = await getI18n();
  const terms = await load(() => api<TermRow[]>('/v1/course-registration/terms'));
  if (terms.error !== undefined) return <ErrorState message={terms.error} />;
  const term = terms.data.find((x) => x.id === sp.term) ?? terms.data[terms.data.length - 1];
  const header = <PageHeader title={t('nav.courseRegistration')} subtitle={t('cr.subtitle')} />;
  if (!term) return (
    <>
      {header}
      <EmptyState icon={<span>·</span>} title={t('cr.noTerms')} />
    </>
  );
  const q = `termId=${term.id}`;
  const offerings = await load(() => api<OfferingRow[]>(`/v1/course-registration/offerings?${q}`));
  const windows = await load(() => api<WindowRow[]>(`/v1/course-registration/windows?${q}`));
  const approvals = await load(() => api<ApprovalRow[]>(`/v1/course-registration/approvals?${q}`));
  const structure = await load(() => api<Structure>('/v1/admin/structure'));
  if (offerings.error !== undefined || windows.error !== undefined || approvals.error !== undefined) return <ErrorState message={offerings.error ?? windows.error ?? approvals.error ?? ''} />;
  const list = offerings.data;
  return (
    <>
      {header}
      <Box sx={{ mb: 3 }}>
        <UrlSelect label={t('cr.term')} param="term" value={term.id} minWidth={240} testId="cr-term" options={terms.data.map((x) => ({ value: x.id, label: `${x.name} (${fmt.date(x.startsOn)})` }))} />
      </Box>      <StatGrid min={140}>
        <StatTile label={t('cr.stat.offerings')} value={list.length} testId="cr-offerings" />
        <StatTile label={t('cr.stat.filled')} value={list.reduce((n, o) => n + o.registered, 0)} />
        <StatTile label={t('cr.stat.pending')} value={approvals.data.length} tone={approvals.data.length ? 'warning' : 'default'} />
        <StatTile label={t('cr.stat.waitlisted')} value={list.reduce((n, o) => n + o.waitlisted, 0)} />
      </StatGrid>
      <RegistrationDesk termId={term.id} offerings={list} windows={windows.data} approvals={approvals.data} programs={(structure.data?.programs ?? []).map((p) => ({ value: p.id, label: p.name }))} subjects={(structure.data?.subjects ?? []).map((s) => ({ value: s.id, label: `${s.code} ${s.name}` }))} />
    </>
  );
}
