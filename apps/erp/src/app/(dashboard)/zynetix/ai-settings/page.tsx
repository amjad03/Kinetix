import type { Metadata } from 'next';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { AiSettingsCard } from '@/components/zynetix/AiSettingsCard';
import { getI18n } from '@/i18n/server';
import { api, load, requireSection } from '@/lib/api';
import type { AiConnection } from '@/lib/zynetix';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.zxAiSettings') };
}

/** Zynetix → AI settings: paste the institution's Claude (Anthropic) key; the boards' AI then uses it. */
export default async function AiSettingsPage() {
  await requireSection('zynetix');
  const { t } = await getI18n();
  const conn = await load(() => api<AiConnection>('/v1/ai/admin/connection'));
  return (
    <>
      <PageHeader title={t('nav.zxAiSettings')} subtitle={t('zx.aic.subtitle')} />
      {conn.data ? <AiSettingsCard initial={conn.data} /> : <ErrorState message={conn.error ?? ''} />}
    </>
  );
}
