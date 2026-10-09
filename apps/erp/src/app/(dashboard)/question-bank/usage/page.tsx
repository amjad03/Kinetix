import type { Metadata } from 'next';
import { DepthDesk } from '@/components/depth/DepthDesk';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { UrlSelect } from '@/components/UrlSelect';
import { getI18n } from '@/i18n/server';
import { api, load, requireSection } from '@/lib/api';
import type { Panel } from '@/lib/depth';
import { opt } from '@/lib/depth-ui';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('dx.qbu.title') };
}

/** Which approved questions have been used in papers, how often and when last. */
export default async function QuestionUsagePage({ searchParams }: { searchParams: Promise<{ subject?: string }> }) {
  await requireSection('questionBank');
  const { t, fmt } = await getI18n();
  const sp = await searchParams;
  const data = await load(async () => {
    const options = await api<{ subjects: { id: string; name: string }[] }>('/v1/question-bank/options');
    const subjectId = options.subjects.find((s) => s.id === sp.subject)?.id ?? options.subjects[0]?.id;
    const usage = subjectId ? await api<{ questions: Record<string, unknown>[]; unused: number; total: number }>(`/v1/question-bank/usage?subjectId=${subjectId}`) : { questions: [], unused: 0, total: 0 };
    return { options, subjectId, usage };
  });
  if (data.error !== undefined) return <ErrorState message={data.error} />;
  const { options, subjectId, usage } = data.data;
  const panels: Panel[] = [
    {
      id: 'usage',
      title: t('dx.qbu.usage'),
      hint: t('dx.qbu.hint'),
      empty: t('dx.qbu.none'),
      stats: [
        { label: t('dx.qbu.total'), value: fmt.number(usage.total) },
        { label: t('dx.qbu.unused'), value: fmt.number(usage.unused) },
      ],
      columns: [
        { key: 'text', label: t('dx.c.question') },
        { key: 'topic', label: t('dx.c.topic') },
        { key: 'difficulty', label: t('dx.c.difficulty') },
        { key: 'bloom', label: t('dx.c.bloom') },
        { key: 'papers', label: t('dx.qbu.papers'), kind: 'num' },
        { key: 'lastUsedAt', label: t('dx.qbu.last'), kind: 'datetime' },
      ],
      rows: usage.questions,
    },
  ];
  return (
    <>
      <PageHeader title={t('dx.qbu.title')} subtitle={t('dx.qbu.subtitle')} actions={<UrlSelect label={t('dx.c.subject')} param="subject" value={subjectId ?? ''} options={opt(options.subjects, (s) => s.id, (s) => s.name)} />} />
      <DepthDesk panels={panels} />
    </>
  );
}
