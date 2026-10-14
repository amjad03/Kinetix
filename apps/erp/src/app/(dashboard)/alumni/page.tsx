import type { Metadata } from 'next';
import { AlumniGivingDesk } from '@/components/alumni/AlumniGivingDesk';
import { PageHeader } from '@/components/PageHeader';
import { KitList, type ColSpec } from '@/components/procurement/KitList';
import { options } from '@/components/records/text';
import { ErrorState } from '@/components/States';
import { LinkTabs } from '@/components/ui';
import { getI18n } from '@/i18n/server';
import { api, load, requireSection } from '@/lib/api';
import type { AlumniOption, CampaignRow, DonationRow, OpportunityRow } from '@/lib/govern';
import type { StoryRow } from '@/lib/pathways-a';
import { statusLabels } from '@/lib/procurement-labels';
import { param } from '@/lib/procurement-server';
import { loadRecords } from '@/lib/records-server';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.alumni') };
}

const VOLUNTEER = ['principal', 'tenant_admin', 'placement_officer'];
const VIEWS = ['directory', 'events', 'jobs', 'mentoring', 'giving'] as const;
type View = (typeof VIEWS)[number];
const ENTITY: Partial<Record<View, string>> = { directory: 'alumni', events: 'alumni-events', jobs: 'alumni-jobs', mentoring: 'mentoring-requests' };

/**
 * The alumni office: the directory (verified, with consent to be listed and who mentors), alumni events with RSVPs,
 * jobs and internships alumni post for students (reviewed before students see them), mentoring requests, and giving
 * (campaigns, pledges, donations with receipts, volunteering and success stories).
 */
export default async function AlumniPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const me = await requireSection('alumni');
  const roles = me?.roles ?? [];
  const office = roles.some((r) => VOLUNTEER.includes(r));
  const views = VIEWS.filter((v) => office || v === 'giving' || v === 'directory');
  const sp = await searchParams;
  // The giving desk keeps its own tab in `tab`.
  const tab = param(sp, 'tab');
  const asked = param(sp, 'view') ?? (tab ? 'giving' : undefined);
  const view: View = views.includes(asked as View) ? (asked as View) : office ? 'directory' : 'giving';
  const { t } = await getI18n();
  const entity = ENTITY[view];
  const list = entity ? await loadRecords(entity, sp) : null;
  const giving =
    view === 'giving'
      ? await load(async () => {
          const [campaigns, donations, opportunities, alumni, stories] = await Promise.all([
            api<CampaignRow[]>('/v1/alumni/campaigns'),
            api<DonationRow[]>('/v1/alumni/donations'),
            office ? api<OpportunityRow[]>('/v1/alumni/volunteering') : null,
            // The accounts office may not read the directory: its donor picker is then empty and donors are typed in.
            api<AlumniOption[]>('/v1/placements/alumni').catch(() => [] as AlumniOption[]),
            // Success stories written by alumni wait in the alumni office's queue.
            office ? api<StoryRow[]>('/v1/placements/success-stories') : null,
          ]);
          return { campaigns, donations, opportunities, alumni, stories };
        })
      : null;
  const failed = list?.error ?? giving?.error;
  const st = statusLabels(t);
  const opt = (k: string) => Object.fromEntries(options(t, entity ?? '', k, list?.data?.meta.fields.find((f) => f.key === k)?.options ?? list?.data?.meta.filters.find((f) => f.key === k)?.options).map((o) => [String(o.value), o.label]));
  const extraParams = { view };
  const cols: Record<string, ColSpec[]> = {
    directory: [
      { id: 'name', label: t('ops.f.name'), key: 'fullName', sortKey: 'name', rowHeader: true, sub: 'program' },
      { id: 'year', label: t('pd.al.year'), key: 'graduationYear', sortKey: 'year' },
      { id: 'employer', label: t('pd.al.employer'), key: 'employer', sortKey: 'employer', sub: 'designation', hideBelow: 'sm' },
      { id: 'city', label: t('pd.city'), key: 'city', hideBelow: 'md' },
      { id: 'email', label: t('inv.email'), key: 'email', hideBelow: 'lg' },
      { id: 'mentor', label: t('pd.al.mentor'), key: 'mentorAvailable', kind: 'yesno', hideBelow: 'md' },
      { id: 'listed', label: t('pd.al.listed'), key: 'directoryVisible', kind: 'yesno', hideBelow: 'lg' },
      { id: 'verified', label: t('pd.verified'), key: 'verified', kind: 'yesno' },
    ],
    events: [
      { id: 'title', label: t('ops.f.title'), key: 'title', sortKey: 'title', rowHeader: true, sub: 'venue' },
      { id: 'date', label: t('ivd.date'), key: 'startsOn', kind: 'date', sortKey: 'date' },
      { id: 'rsvps', label: t('pd.al.rsvps'), key: 'rsvps', kind: 'number', sortKey: 'rsvps' },
      { id: 'status', label: t('ops.f.status'), key: 'status', kind: 'status', labels: { ...st, completed: opt('status').completed ?? st.completed } },
    ],
    jobs: [
      { id: 'title', label: t('pl.col.role'), key: 'title', sortKey: 'title', rowHeader: true, sub: 'company' },
      { id: 'kind', label: t('pd.kind'), key: 'kind', kind: 'status', labels: opt('kind') },
      { id: 'location', label: t('pd.location'), key: 'location', hideBelow: 'md' },
      { id: 'by', label: t('pd.al.postedBy'), key: 'postedByAlumnus', hideBelow: 'sm' },
      { id: 'closes', label: t('pd.al.closes'), key: 'closesOn', kind: 'date', sortKey: 'closes', hideBelow: 'md' },
      { id: 'status', label: t('ops.f.status'), key: 'status', kind: 'status', labels: { ...st, pending: opt('status').pending ?? st.pending } },
    ],
    mentoring: [
      { id: 'student', label: t('ops.f.student'), key: 'fullName', sortKey: 'student', rowHeader: true, sub: 'rollNo' },
      { id: 'alumnus', label: t('pd.al.alumnus'), key: 'alumniName', sortKey: 'alumnus' },
      { id: 'topic', label: t('pd.al.topic'), key: 'topic', hideBelow: 'sm' },
      { id: 'created', label: t('ivd.date'), key: 'createdAt', kind: 'date', sortKey: 'created', hideBelow: 'md' },
      { id: 'status', label: t('ops.f.status'), key: 'status', kind: 'status', labels: st },
    ],
  };

  return (
    <>
      <PageHeader title={t('nav.alumni')} subtitle={t('pd.al.subtitle')} />
      <LinkTabs value={view} label={t('nav.alumni')} items={views.map((v) => ({ value: v, label: t(`pd.al.view.${v}`), href: `/alumni?view=${v}` }))} />
      {failed !== undefined ? (
        <ErrorState message={failed} />
      ) : list?.data ? (
        <KitList {...list.data} label={t(`pd.al.view.${view}`)} cols={cols[view]} extraParams={extraParams} emptyTitle={t(`pd.al.empty.${view as 'directory'}`)} emptyBody={t(`pd.al.emptyHelp.${view as 'directory'}`)} testId={`al-${view}`} />
      ) : giving?.data ? (
        <AlumniGivingDesk
          campaigns={giving.data.campaigns}
          donations={giving.data.donations}
          opportunities={giving.data.opportunities}
          alumni={giving.data.alumni.map((a) => ({ id: a.id, fullName: a.fullName, graduationYear: a.graduationYear }))}
          stories={giving.data.stories}
          initialTab={tab ?? 'campaigns'}
        />
      ) : null}
    </>
  );
}
