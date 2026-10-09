import type { Metadata } from 'next';
import { LinkButton } from '@/components/LinkButton';
import { PageHeader } from '@/components/PageHeader';
import { QuestionBankDesk } from '@/components/question-bank/QuestionBankDesk';
import { ErrorState } from '@/components/States';
import { api, load, requireSection } from '@/lib/api';
import type { QbBlueprint, QbOptions, QbPaper, QbQuestion } from '@/lib/question-bank';
import { getI18n } from '@/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.questionBank') };
}

export default async function QuestionBankPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  await requireSection('questionBank');
  const { tab } = await searchParams;
  const { t } = await getI18n();
  const data = await load(async () => {
    const [options, questions, blueprints, papers] = await Promise.all([
      api<QbOptions>('/v1/question-bank/options'),
      api<QbQuestion[]>('/v1/question-bank/questions'),
      api<QbBlueprint[]>('/v1/question-bank/blueprints'),
      api<QbPaper[]>('/v1/question-bank/papers'),
    ]);
    return { options, questions, blueprints, papers };
  });
  if (data.error !== undefined) return <ErrorState message={data.error} />;
  return (
    <>
      <PageHeader title={t('nav.questionBank')} subtitle={t('qb.subtitle')} actions={<><LinkButton href="/question-bank/usage" variant="outlined">{t('dx.link.qb')}</LinkButton></>} />
      <QuestionBankDesk {...data.data} initialTab={tab ?? 'questions'} />
    </>
  );
}
