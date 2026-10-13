import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { QualitySettings } from '@/components/quality-hub/QualitySettings';
import { ErrorState } from '@/components/States';
import { getI18n } from '@/i18n/server';
import { api, load, requireSection } from '@/lib/api';
import { isQhModule, type QhSettingsView } from '@/lib/quality-hub';

type Params = Promise<{ module: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { module } = await params;
  const { t } = await getI18n();
  return { title: isQhModule(module) ? t('qh.settingsTitle', { module: t(`qh.mod.${module}`) }) : t('nav.qhSettings') };
}

/** One module's numbering series, rules, message templates and defaults. */
export default async function QualityModuleSettingsPage({ params }: { params: Params }) {
  const { module } = await params;
  if (!isQhModule(module)) notFound();
  await requireSection('qualityHub');
  const data = await load(() => api<QhSettingsView>(`/v1/quality-hub/settings/${module}`));
  if (data.error !== undefined) return <ErrorState message={data.error} />;
  return <QualitySettings key={data.data.updatedAt ?? 'defaults'} view={data.data} />;
}
