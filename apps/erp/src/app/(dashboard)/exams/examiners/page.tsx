import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { ClaimRow, ExaminerRow, ExaminersDesk, PaperRow } from '@/components/exams/ExaminersDesk';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { getI18n } from '@/i18n/server';
import { api, load, requireSection } from '@/lib/api';
import type { Structure } from '@/lib/types';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.examiners') };
}

/** External examiners: invite, assign, prepare anonymous scripts, move question papers, settle claims. */
export default async function ExaminersPage() {
  const me = await requireSection('exams');
  const { t } = await getI18n();
  const h = await headers();
  const origin = `${h.get('x-forwarded-proto') ?? 'https'}://${h.get('host') ?? 'localhost:3000'}`;
  const data = await load(async () => {
    const [examiners, papers, claims, sessions, structure] = await Promise.all([
      api<ExaminerRow[]>('/v1/external-examiners'),
      api<PaperRow[]>('/v1/external-examiners/question-papers'),
      api<ClaimRow[]>('/v1/external-examiners/claims'),
      api<{ id: string; name: string }[]>('/v1/exam-sessions'),
      api<Structure>('/v1/admin/structure'),
    ]);
    return { examiners, papers, claims, sessions, structure };
  });
  if (data.error !== undefined) return <ErrorState message={data.error} />;
  const { examiners, papers, claims, sessions, structure } = data.data;
  return (
    <>
      <PageHeader title={t('nav.examiners')} subtitle={t('uni.ex.subtitle')} />
      <ExaminersDesk
        examiners={examiners}
        papers={papers}
        claims={claims}
        sessions={sessions.map((s) => ({ id: s.id, name: s.name }))}
        subjects={structure.subjects.map((s) => ({ id: s.id, label: `${s.code} ${s.name}` }))}
        origin={origin}
        slug={me?.tenant.slug ?? ''}
      />
    </>
  );
}
