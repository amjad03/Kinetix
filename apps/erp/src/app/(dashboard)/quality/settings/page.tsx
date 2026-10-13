import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader } from '@/components/PageHeader';
import { Card } from '@/components/ui';
import { getI18n } from '@/i18n/server';
import { requireSection } from '@/lib/api';
import { QH_MODULES } from '@/lib/quality-hub';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.qhSettings') };
}

/** The settings of each module in the quality, outcomes and engagement group. */
export default async function QualitySettingsIndex() {
  await requireSection('qualityHub');
  const { t } = await getI18n();
  return (
    <div className="grid gap-6">
      <PageHeader title={t('nav.qhSettings')} subtitle={t('qh.settingsSubtitle')} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {QH_MODULES.map((m) => (
          <Link key={m} href={`/quality/settings/${m}`} className="rounded-lg focus-visible:outline-2" data-testid={`qh-settings-${m}`}>
            <Card title={t(`qh.mod.${m}`)} className="h-full transition-colors hover:bg-muted/40">
              <p className="text-sm text-muted-foreground">{t('qh.settingsCard')}</p>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
