import GroupsOutlined from '@mui/icons-material/GroupsOutlined';
import SwapVert from '@mui/icons-material/SwapVert';
import type { Metadata } from 'next';
import { LinkButton } from '@/components/LinkButton';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState, ErrorState } from '@/components/States';
import { StudentsTable } from '@/components/students/StudentsTable';
import { api, load, requireSection } from '@/lib/api';
import { canChangeLifecycle } from '@/lib/access';
import type { StudentRow } from '@/lib/admissions';
import { getI18n } from '@/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.students') };
}

export default async function StudentsPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  const me = await requireSection('students');
  const sp = await searchParams;
  const q = (sp.q ?? '').trim().slice(0, 60);
  const rows = await load(() => api<StudentRow[]>('/v1/students'));
  const { t } = await getI18n();
  return (
    <>
      <PageHeader
        title={t('nav.students')}
        subtitle={t('stu.subtitle')}
        actions={
          me && canChangeLifecycle(me.roles) ? (
            <LinkButton href="/students/promotion" variant="outlined" startIcon={<SwapVert />}>
              {t('stu.promotion')}
            </LinkButton>
          ) : undefined
        }
      />
      {rows.error !== undefined ? (
        <ErrorState message={rows.error} />
      ) : rows.data.length === 0 ? (
        <EmptyState icon={<GroupsOutlined />} title={t('stu.none')} testId="no-students">
          {t('stu.noneBody')}
        </EmptyState>
      ) : (
        <StudentsTable rows={rows.data} initialQuery={q} />
      )}
    </>
  );
}
