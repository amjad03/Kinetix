import type { Metadata } from 'next';
import { HostelDesk } from '@/components/hostel/HostelDesk';
import { PageHeader } from '@/components/PageHeader';
import { StatGrid, StatTile } from '@/components/StatTile';
import { ErrorState } from '@/components/States';
import { api, load, requireSection } from '@/lib/api';
import { getI18n } from '@/i18n/server';
import type { HBed, HBlock, HComplaint, HMenu, HPassRow, HPlan, HVisitorRow } from '@/lib/ops';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.hostel') };
}

export default async function HostelPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  await requireSection('hostel');
  const { tab } = await searchParams;
  const [blocks, beds, passes, visitors, plans, menu, complaints] = await Promise.all([
    load(() => api<HBlock[]>('/v1/hostel/blocks')),
    load(() => api<HBed[]>('/v1/hostel/beds')),
    load(() => api<HPassRow[]>('/v1/hostel/gate-passes')),
    load(() => api<HVisitorRow[]>('/v1/hostel/visitors')),
    load(() => api<HPlan[]>('/v1/hostel/mess/plans')),
    load(() => api<HMenu[]>('/v1/hostel/mess/menu')),
    load(() => api<HComplaint[]>('/v1/hostel/complaints')),
  ]);
  const { t } = await getI18n();
  const failed = [blocks, beds, passes, visitors, plans, menu, complaints].find((x) => x.error !== undefined)?.error;
  const b = blocks.data ?? [];
  const p = passes.data ?? [];
  const totalBeds = b.reduce((s, x) => s + x.beds, 0);
  const occupied = b.reduce((s, x) => s + x.occupied, 0);
  const out = p.filter((x) => x.pass.status === 'out');
  const late = p.filter((x) => x.overdue);

  return (
    <>
      <PageHeader title={t('nav.hostel')} subtitle={t('ho.subtitle')} />
      {failed !== undefined ? (
        <ErrorState message={failed} />
      ) : (
        <>
          <StatGrid min={120}>
            <StatTile label={t('ho.beds')} value={totalBeds} caption={t('ho.occupiedN', { n: occupied })} testId="ho-beds" />
            <StatTile label={t('ho.free')} value={totalBeds - occupied} testId="ho-free" />
            <StatTile label={t('ho.outNow')} value={out.length} testId="ho-out" />
            <StatTile label={t('ho.overdue')} value={late.length} tone={late.length ? 'warning' : 'default'} caption={late.length ? t('ho.overdueHelp') : undefined} testId="ho-overdue" />
            <StatTile label={t('ho.openComplaints')} value={(complaints.data ?? []).filter((x) => x.status !== 'resolved').length} testId="ho-complaints" />
          </StatGrid>
          <HostelDesk blocks={b} beds={beds.data!} passes={p} visitors={visitors.data!} plans={plans.data!} menu={menu.data!} complaints={complaints.data!} initialTab={tab ?? 'rooms'} />
        </>
      )}
    </>
  );
}
