import type { Metadata } from 'next';
import { AlumniGivingDesk } from '@/components/alumni/AlumniGivingDesk';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { getI18n } from '@/i18n/server';
import { api, load, requireSection } from '@/lib/api';
import type { AlumniOption, CampaignRow, DonationRow, OpportunityRow } from '@/lib/govern';
import type { StoryRow } from '@/lib/pathways-a';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.alumni') };
}

const VOLUNTEER = ['principal', 'tenant_admin', 'placement_officer'];

/** Alumni giving: campaigns with totals, pledges, donations and receipts, and volunteering sign-ups. */
export default async function AlumniPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const me = await requireSection('alumni');
  const { tab } = await searchParams;
  const { t } = await getI18n();
  const roles = me?.roles ?? [];
  const volunteering = roles.some((r) => VOLUNTEER.includes(r));
  const [campaigns, donations, opportunities, alumni, stories] = await Promise.all([
    load(() => api<CampaignRow[]>('/v1/alumni/campaigns')),
    load(() => api<DonationRow[]>('/v1/alumni/donations')),
    volunteering ? load(() => api<OpportunityRow[]>('/v1/alumni/volunteering')) : null,
    // The accounts office may not read the directory: its donor picker is then empty and donors are typed in.
    load(() => api<AlumniOption[]>('/v1/placements/alumni')),
    // Success stories written by alumni wait in the alumni office's queue.
    volunteering ? load(() => api<StoryRow[]>('/v1/placements/success-stories')) : null,
  ]);
  const failed = campaigns.error ?? donations.error ?? opportunities?.error ?? stories?.error;
  if (failed !== undefined) return <ErrorState message={failed} />;
  return (
    <>
      <PageHeader title={t('nav.alumni')} subtitle={t('alm.subtitle')} />
      <AlumniGivingDesk campaigns={campaigns.data!} donations={donations.data!} opportunities={opportunities?.data ?? null} alumni={(alumni.data ?? []).map((a) => ({ id: a.id, fullName: a.fullName, graduationYear: a.graduationYear }))} stories={stories?.data ?? null} initialTab={tab ?? 'campaigns'} />
    </>
  );
}
