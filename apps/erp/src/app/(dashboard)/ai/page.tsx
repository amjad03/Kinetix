import type { Metadata } from 'next';
import { getI18n } from '@/i18n/server';
import type { TFunction } from '@/i18n/translate';
import { AI_COLORS, AiUsageTable } from '@/components/ai/AiUsageTable';
import { PageHeader, SectionTitle } from '@/components/PageHeader';
import { StatGrid, StatTile } from '@/components/StatTile';
import { EmptyState, ErrorState } from '@/components/States';
import { compactNumber, summarizeUsage } from '@/lib/ai-usage';
import { api, load, requireSection } from '@/lib/api';
import type { AiUsage } from '@/lib/types';

import { Sparkles as AutoAwesomeOutlined } from 'lucide-react';
import { pal } from '@/lib/sx';
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('ai.title') };
}

const n = (v: number) => v.toLocaleString('en-IN');



function Legend({ t }: { t: TFunction }) {
  return (
    <div className="flex gap-4 flex-wrap text-muted-foreground mb-3">
      {(
        [
          ['answered', t('ai.legend.answered')],
          ['blocked', t('ai.legend.blocked')],
          ['failed', t('ai.legend.failed')],
        ] as const
      ).map(([k, label]) => (
        <div className="inline-flex items-center gap-1.5" key={k}>
          <div className="w-[10px] h-[10px] rounded-full" style={{ backgroundColor: pal(AI_COLORS[k]) }} />
          <span className="text-xs leading-4 tracking-[0.3px]">{label}</span>
        </div>
      ))}
    </div>
  );
}

export default async function AiUsagePage() {
  await requireSection('ai');
  const usage = await load(() => api<AiUsage>('/v1/ai/usage'));
  const s = usage.data ? summarizeUsage(usage.data) : null;
  const days = usage.data?.days ?? 30;
  const { t } = await getI18n();

  return (
    <>
      <PageHeader title={t('ai.title')} subtitle={t('ai.subtitle', { days })} />
      {usage.error !== undefined ? (
        <ErrorState message={usage.error} />
      ) : s!.total.requests === 0 ? (
        <EmptyState icon={<AutoAwesomeOutlined />} title={t('ai.none', { days })} testId="no-ai-usage">
          {t('ai.noneBody')}
        </EmptyState>
      ) : (
        <>
          <StatGrid min={200}>
            <StatTile label={t('ai.requests')} value={n(s!.total.requests)} caption={t('ai.lastDays', { days })} testId="ai-requests" />
            <StatTile
              label={t('ai.answered')}
              value={`${Math.round((s!.total.answered / s!.total.requests) * 100)}%`}
              caption={t('ai.ofRequests', { n: s!.total.answered, d: s!.total.requests })}
              testId="ai-answered"
            />
            <StatTile
              label={t('ai.notAnswered')}
              value={n(s!.total.blocked + s!.total.failed)}
              tone={s!.total.failed > 0 ? 'warning' : 'default'}
              caption={t('ai.blockedFailed', { blocked: s!.total.blocked, failed: s!.total.failed })}
              testId="ai-not-answered"
            />
            <StatTile label={t('ai.tokens')} value={compactNumber(s!.total.tokens)} caption={t('ai.tokensProcessed', { n: s!.total.tokens })} testId="ai-tokens" />
          </StatGrid>

          <SectionTitle>{t('ai.byTask')}</SectionTitle>
          <Legend t={t} />
          <AiUsageTable tasks={s!.tasks} />
          <p className="text-xs leading-4 tracking-[0.3px] text-muted-foreground mt-3">
            {t('ai.tokensNote')}
          </p>
        </>
      )}
    </>
  );
}
