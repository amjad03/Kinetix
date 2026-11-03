import type { Metadata } from 'next';
import { AdmissionsTabs } from '@/components/admissions/AdmissionsTabs';
import { BroadcastDesk } from '@/components/admissions/PassTables';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { api, load, requireSection } from '@/lib/api';
import type { Broadcast } from '@/lib/admissions-pass';
import type { Structure } from '@/lib/types';
import { getI18n } from '@/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('ap.tab.broadcasts') };
}

interface Template { id: string; key: string; channel: string; usable: boolean; problem: string | null }

/** Campaign SMS, WhatsApp and email to lead segments, through registered templates only. */
export default async function BroadcastsPage() {
  await requireSection('admissions');
  const { t } = await getI18n();
  const [templates, structure, campaigns, list] = await Promise.all([
    load(() => api<Template[]>('/v1/admissions/lead-templates')),
    load(() => api<Structure>('/v1/admin/structure')),
    load(() => api<{ id: string; name: string }[]>('/v1/admissions/campaigns')),
    load(() => api<{ rows: Broadcast[] }>('/v1/admissions/broadcasts?pageSize=50')),
  ]);
  const err = templates.error ?? structure.error ?? campaigns.error ?? list.error;
  return (
    <>
      <PageHeader title={t('ap.tab.broadcasts')} subtitle={t('ap.bc.subtitle')} />
      <AdmissionsTabs current="broadcasts" />
      {err !== undefined ? (
        <ErrorState message={err} />
      ) : (
        <BroadcastDesk templates={templates.data!} programmes={structure.data!.programs.map((p) => ({ id: p.id, name: p.name }))} campaigns={campaigns.data!.map((c) => ({ id: c.id, name: c.name }))} rows={list.data!.rows} />
      )}
    </>
  );
}
