import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { MeetingDesk } from '@/components/governance/MeetingDesk';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { getI18n } from '@/i18n/server';
import { api, load, requireSection } from '@/lib/api';
import type { MeetingDetail } from '@/lib/governance-pass';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('gp.title.meeting') };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A committee meeting: agenda and resolutions, attendance and quorum, minutes, the members' signatures and the actions. */
export default async function MeetingPage({ params }: { params: Promise<{ id: string }> }) {
  await requireSection('governance');
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const { t, fmt } = await getI18n();
  const res = await load(async () => ({ m: await api<MeetingDetail>(`/v1/governance/committees/meetings/${id}`), people: await api<{ id: string; name: string }[]>('/v1/governance/committees/people') }));
  if (res.error !== undefined)
    return (
      <>
        <PageHeader title={t('gp.title.meeting')} />
        <ErrorState message={res.error} />
      </>
    );
  const { m, people } = res.data;
  return (
    <>
      <PageHeader title={m.title} subtitle={`${m.committee?.name ?? ''} · ${fmt.date(m.meetingOn, 'long')}${m.startsAt ? ` · ${m.startsAt}` : ''}${m.venue ? ` · ${m.venue}` : ''}`} />
      <MeetingDesk m={m} people={people} />
    </>
  );
}
