import type { Metadata } from 'next';
import { UniRegister, UniTemplate, UniversityDesk } from '@/components/exams/UniversityDesk';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { getI18n } from '@/i18n/server';
import { api, load, requireSection } from '@/lib/api';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.universityFormats') };
}

/** Affiliating-university mark-list and tabulation register formats (exam controller, principal, admin). */
export default async function UniversityFormatsPage() {
  await requireSection('exams');
  const { t } = await getI18n();
  const data = await load(async () => {
    const [templates, registers, sessions] = await Promise.all([api<UniTemplate[]>('/v1/university-results/templates'), api<UniRegister[]>('/v1/university-results/registers'), api<{ id: string; name: string }[]>('/v1/exam-sessions')]);
    return { templates, registers, sessions };
  });
  if (data.error !== undefined) return <ErrorState message={data.error} />;
  return (
    <>
      <PageHeader title={t('nav.universityFormats')} subtitle={t('uni.fmt.subtitle')} />
      <UniversityDesk templates={data.data.templates} registers={data.data.registers} sessions={data.data.sessions.map((s) => ({ id: s.id, name: s.name }))} />
    </>
  );
}
