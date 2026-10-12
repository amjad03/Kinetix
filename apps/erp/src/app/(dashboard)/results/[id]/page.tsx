import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { MiniBar } from '@/components/Bars';
import { MarksListTable } from '@/components/results/ResultsTables';
import { LinkButton } from '@/components/LinkButton';
import { PageHeader, SectionTitle } from '@/components/PageHeader';
import { MarksPanel } from '@/components/results/MarksPanel';
import { Distribution } from '@/components/results/Distribution';
import { PublishButton } from '@/components/results/PublishButton';
import { PublishedChip } from '@/components/results/PublishedChip';
import { StatGrid, StatTile } from '@/components/ui';
import { ErrorState } from '@/components/States';
import { canPublishMarks } from '@/lib/access';
import { api, ApiError, load, requireSection } from '@/lib/api';
import { getI18n } from '@/i18n/server';
import { distribution, formatMarks, kindLabel, percent, resultCounts } from '@/lib/results';
import type { AssessmentDetail, Structure } from '@/lib/types';

import { Card } from '@/components/kx';
import { ArrowLeft as ArrowBack } from 'lucide-react';
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('results.marks') };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function AssessmentPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireSection('results');
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const [res, structure] = await Promise.all([
    load(async () => {
      try {
        return await api<AssessmentDetail>(`/v1/assessments/${id}`);
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) notFound();
        throw e;
      }
    }),
    load(() => api<Structure>('/v1/admin/structure')),
  ]);
  const a = res.data;
  const { t, fmt } = await getI18n();
  const className = structure.data?.sections.find((s) => s.id === a?.sectionId)?.displayName ?? t('results.class');

  const back = (
    <div className="-ml-2 mb-1">
      <LinkButton href={a ? `/results?class=${a.sectionId}` : '/results'} size="small" startIcon={<ArrowBack />}>
        {t('results.back')}
        {a ? ` · ${className}` : ''}
      </LinkButton>
    </div>
  );
  if (!a)
    return (
      <>
        {back}
        <ErrorState message={res.error!} />
      </>
    );

  const c = resultCounts(a.students);
  const s = a.stats;
  const pct = (n: number | null) => (n === null ? '' : `${percent(n, a.maxMarks).toFixed(1)}%`);
  const bands = distribution(
    a.students.map((x) => x.marks),
    a.maxMarks,
  );

  return (
    <>
      {back}
      <PageHeader
        title={a.title}
        subtitle={
          <span className="inline-flex flex-wrap items-center gap-2">
            <span>
              {className} · {a.subject.name} · {kindLabel(a.kind, t)} · {fmt.date(a.heldOn, 'short')} · {t('results.outOf', { n: formatMarks(a.maxMarks) })} · {t('results.setBy', { name: a.createdBy })}
            </span>
            <PublishedChip publishedAt={a.publishedAt} />
          </span>
        }
        actions={
          me && canPublishMarks(me.roles) ? (
            <PublishButton id={a.id} title={a.title} className={className} entered={c.entered + c.absent} missing={c.missing} published={!!a.publishedAt} />
          ) : undefined
        }
      />

      <StatGrid min={180}>
        <StatTile
          label={t('results.stat.average')}
          value={s.average === null ? '—' : formatMarks(s.average)}
          unit={s.average === null ? undefined : `/ ${formatMarks(a.maxMarks)}`}
          caption={s.average === null ? t('results.stat.noMarks') : pct(s.average)}
          bar={s.average === null ? undefined : <MiniBar value={percent(s.average, a.maxMarks)} label={t('results.classAverage', { p: pct(s.average) })} />}
          testId="stat-average"
        />
        <StatTile label={t('results.stat.highest')} value={formatMarks(s.highest)} unit={s.highest === null ? undefined : `/ ${formatMarks(a.maxMarks)}`} caption={pct(s.highest)} testId="stat-highest" />
        <StatTile label={t('results.stat.lowest')} value={formatMarks(s.lowest)} unit={s.lowest === null ? undefined : `/ ${formatMarks(a.maxMarks)}`} caption={pct(s.lowest)} testId="stat-lowest" />
        <StatTile
          label={t('results.stat.absent')}
          value={c.absent}
          caption={`${t('results.stat.marked', { n: c.entered, d: c.students })}${c.missing ? ` · ${t('results.stat.notEntered', { n: c.missing })}` : ''}`}
          tone={c.missing ? 'warning' : 'default'}
          testId="stat-absent"
        />
      </StatGrid>

      {a.markStatus && <MarksPanel assessment={a} canPublish={!!me && canPublishMarks(me.roles)} canVerify={!!me && me.roles.some((r) => r === 'principal' || r === 'tenant_admin' || r === 'hod')} />}

      <SectionTitle>{t('results.howClassDid')}</SectionTitle>
      <Card className="p-4 md:p-6">
        {c.entered === 0 ? (
          <p className="text-[13px] leading-[19px] text-muted-foreground">
            {t('results.chartLater')}
          </p>
        ) : (
          <>
            <p className="text-[13px] leading-[19px] text-muted-foreground mb-4">
              {t('results.chartHelp', { max: formatMarks(a.maxMarks) })} {c.absent ? t('results.absentNotShown', { n: c.absent }) : ''}
            </p>
            <Distribution bands={bands} total={c.entered} />
          </>
        )}
      </Card>

      <SectionTitle>{t('results.marks')}</SectionTitle>
      <MarksListTable rows={a.students} maxMarks={a.maxMarks} />
    </>
  );
}
