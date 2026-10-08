import type { Metadata } from 'next';
import { PageHeader } from '@/components/PageHeader';
import { StatGrid, StatTile } from '@/components/StatTile';
import { ErrorState } from '@/components/States';
import { PtmDesk } from '@/components/school-life/PtmDesk';
import { api, load, requireSection } from '@/lib/api';
import { getI18n } from '@/i18n/server';
import type { PtmEvent, PtmSlot, StaffOption } from '@/lib/school-life';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.ptm') };
}

const ADMIN = ['principal', 'tenant_admin'];

export default async function PtmPage({ searchParams }: { searchParams: Promise<{ eventId?: string }> }) {
  const me = await requireSection('ptm');
  const sp = await searchParams;
  const { t, fmt } = await getI18n();
  const isAdmin = (me?.roles ?? []).some((r) => ADMIN.includes(r));
  const data = await load(async () => {
    const events = await api<PtmEvent[]>('/v1/ptm/events');
    const eventId = events.find((e) => e.id === sp.eventId)?.id ?? '';
    const slots = eventId ? await api<PtmSlot[]>(`/v1/ptm/events/${eventId}/slots`) : [];
    const staff = isAdmin ? await api<StaffOption[]>('/v1/admin/staff') : [];
    return { events, eventId, slots, staff };
  });
  if (data.error !== undefined) return <ErrorState message={data.error} />;
  const { events, eventId, slots, staff } = data.data;
  const open = events.filter((e) => e.status === 'open');
  return (
    <>
      <PageHeader title={t('nav.ptm')} subtitle={t('pt.subtitle')} />
      <StatGrid min={140}>
        <StatTile label={t('pt.stat.open')} value={fmt.number(open.length)} testId="pt-open-count" />
        <StatTile label={t('pt.stat.booked')} value={fmt.number(open.reduce((n, e) => n + e.booked, 0))} />
        <StatTile label={t('pt.stat.free')} value={fmt.number(open.reduce((n, e) => n + e.slots - e.booked, 0))} />
      </StatGrid>
      <PtmDesk events={events} eventId={eventId} slots={slots} staff={staff} />
    </>
  );
}
