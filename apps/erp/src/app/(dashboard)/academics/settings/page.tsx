import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AcademicSettingsForm } from '@/components/academics/AcademicSettingsForm';
import { ErrorState } from '@/components/States';
import { getI18n } from '@/i18n/server';
import type { AcademicSettings } from '@/lib/academics';
import { api, load, requireSection } from '@/lib/api';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('acad.settings') };
}

export default async function AcademicSettingsPage() {
  const me = await requireSection('academics');
  if (!(me?.roles ?? []).some((r) => r === 'principal' || r === 'tenant_admin')) redirect('/academics');
  const res = await load(() => api<AcademicSettings>('/v1/academics/settings'));
  if (res.error !== undefined) return <ErrorState message={res.error} />;
  return <AcademicSettingsForm initial={res.data} />;
}
