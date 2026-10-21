import type { Metadata } from 'next';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { TeachersDesk } from '@/components/zynetix/TeachersDesk';
import { getI18n } from '@/i18n/server';
import { api, load, requireSection } from '@/lib/api';
import type { Teacher } from '@/lib/zynetix';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.zxTeachers') };
}

/** Teacher accounts at college level (sign in to the board and the Teacher App). */
export default async function TeachersPage() {
  await requireSection('zynetix');
  const { t } = await getI18n();
  const [teachers, departments] = await Promise.all([load(() => api<Teacher[]>('/v1/admin/teachers')), load(() => api<{ id: string; name: string }[]>('/v1/admin/departments'))]);
  return (
    <>
      <PageHeader title={t('nav.zxTeachers')} subtitle={t('zx.t.subtitle')} />
      {teachers.error !== undefined ? <ErrorState message={teachers.error} /> : <TeachersDesk teachers={teachers.data} departments={(departments.data ?? []).map((d) => ({ id: d.id, name: d.name }))} />}
    </>
  );
}
