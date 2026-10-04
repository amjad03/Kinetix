import type { Metadata } from 'next';
import { PageHeader } from '@/components/PageHeader';
import { ConsentSummaryView } from '@/components/settings/ConsentSummary';
import { GrievanceOfficerForm } from '@/components/settings/GrievanceOfficerForm';
import { SettingsForm } from '@/components/settings/SettingsForm';
import { ErrorState } from '@/components/States';
import { getI18n } from '@/i18n/server';
import { api, load, requireSection } from '@/lib/api';
import type { ConsentSummary, InstitutionSettings } from '@/lib/settings';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.settings') };
}

export default async function SettingsPage() {
  await requireSection('settings');
  const { t } = await getI18n();
  const [settings, consents] = await Promise.all([load(() => api<InstitutionSettings>('/v1/admin/settings')), load(() => api<ConsentSummary>('/v1/admin/consents'))]);
  return (
    <>
      <PageHeader title={t('nav.settings')} subtitle={t('settings.subtitle')} />
      {settings.error !== undefined ? (
        <ErrorState message={settings.error} />
      ) : (
        <>
          <SettingsForm initial={settings.data} />
          <GrievanceOfficerForm initial={settings.data.grievanceOfficer ?? null} />
        </>
      )}
      {consents.error !== undefined ? <ErrorState message={consents.error} /> : <ConsentSummaryView summary={consents.data} />}
    </>
  );
}
