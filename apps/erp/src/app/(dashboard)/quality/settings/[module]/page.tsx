import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { QualitySettings } from '@/components/quality-hub/QualitySettings';
import { ErrorState } from '@/components/States';
import { getI18n } from '@/i18n/server';
import { api, load, requireSection } from '@/lib/api';
import { COLLEGE_ONLY_MODULES, QH_SETTINGS_MODULES, isQhModule, type QhSettingsView } from '@/lib/quality-hub';

type Params = Promise<{ module: string }>;

/** Schools do not see the college-only modules (accreditation, placements, alumni, research). */
async function isSchool() {
  const c = await load(() => api<{ tenantKind?: string | null }>('/v1/institution/capabilities'));
  return c.error === undefined && c.data.tenantKind === 'school';
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { module } = await params;
  const { t } = await getI18n();
  return { title: isQhModule(module) ? t('qh.settingsTitle', { module: t(`qh.mod.${module}`) }) : t('nav.qhSettings') };
}

/** One module's numbering series, rules, message templates and defaults. */
export default async function QualityModuleSettingsPage({ params }: { params: Params }) {
  const { module } = await params;
  if (!isQhModule(module) || !(QH_SETTINGS_MODULES as readonly string[]).includes(module)) notFound();
  await requireSection('qualityHub');
  if ((await isSchool()) && COLLEGE_ONLY_MODULES.includes(module)) notFound();
  const data = await load(() => api<QhSettingsView>(`/v1/quality-hub/settings/${module}`));
  if (data.error !== undefined) return <ErrorState message={data.error} />;
  return <QualitySettings key={data.data.updatedAt ?? 'defaults'} view={data.data} />;
}
