import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { SettingsForm } from '@/components/campus-ops/SettingsForm';
import { ErrorState } from '@/components/States';
import { getI18n } from '@/i18n/server';
import { api, load, requireSection } from '@/lib/api';
import { isOpsModule } from '@/lib/campus-ops';
import type { SettingsInput } from '../../records/actions';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('cops.openSettings') };
}

/** One module's settings (admissions, library, hostel, transport, canteen, stores, assets, purchasing). */
export default async function ModuleSettingsRoute({ params }: { params: Promise<{ module: string }> }) {
  await requireSection('campusOps');
  const { module } = await params;
  if (!isOpsModule(module)) notFound();
  const s = await load(() => api<SettingsInput & { updatedAt: string | null }>(`/v1/module-settings/${module}`));
  if (!s.data) return <ErrorState message={s.error ?? ''} />;
  return <SettingsForm module={module} initial={s.data} />;
}
