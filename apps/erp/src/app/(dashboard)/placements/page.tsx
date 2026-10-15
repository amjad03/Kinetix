import type { Metadata } from 'next';
import { BarChart3 } from 'lucide-react';
import { DeskTable, Tiles } from '@/components/campus/Desk';
import { LinkButton } from '@/components/LinkButton';
import { PageHeader } from '@/components/PageHeader';
import { InternshipsDesk } from '@/components/placements/InternshipsDesk';
import { StudentStanding, type OptinRow } from '@/components/placements/StudentStanding';
import { KitList, type ColSpec, type RowActionSpec } from '@/components/procurement/KitList';
import { options } from '@/components/records/text';
import { StatTile } from '@/components/StatTile';
import { ErrorState } from '@/components/States';
import { LinkTabs } from '@/components/ui';
import { approveInternship, cancelInternship, completeInternship, recordJoining, recordOfferResponse, revokeOffer, startInternship, uploadOfferLetter, verifyCompany } from '@/app/(dashboard)/placements/actions';
import { getI18n } from '@/i18n/server';
import { api, load, requireSection } from '@/lib/api';
import { lakhs, type PlacementStats } from '@/lib/campus-life';
import type { InternshipRow } from '@/lib/pathways-a';
import { statusLabels } from '@/lib/procurement-labels';
import { metaOptions, optional, param } from '@/lib/procurement-server';
import type { RecordMeta } from '@/lib/records';
import { loadRecords } from '@/lib/records-server';
import type { Skill } from '@/lib/skills';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.placements') };
}

/** Roles that run the placement cell (a head of department reads), placements.access.ts PLACEMENT_ROLES. */
const PLACEMENT_STAFF = ['principal', 'tenant_admin', 'placement_officer'];
const VIEWS = ['overview', 'drives', 'companies', 'offers', 'internships', 'log', 'training', 'progression', 'feedback', 'students'] as const;
type View = (typeof VIEWS)[number];
const ENTITY: Partial<Record<View, string>> = { drives: 'placement-drives', companies: 'placement-companies', offers: 'placement-offers', internships: 'internships', training: 'placement-trainings', progression: 'progressions', feedback: 'placement-feedback' };

/**
 * The placement cell: recruiters (verified, with contacts and a recruiter portal key), drives (eligibility, rounds,
 * interview slots, shortlists, offers), offers with responses, joining and letters, internships, training
 * programmes, student progression, employer and alumni feedback, students who opted out or are debarred, and the
 * NIRF / NAAC / NBA reports.
 */
export default async function PlacementsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const me = await requireSection('placements');
  const canEdit = (me?.roles ?? []).some((r) => PLACEMENT_STAFF.includes(r));
  const sp = await searchParams;
  const asked = param(sp, 'view');
  const view: View = VIEWS.includes(asked as View) ? (asked as View) : 'overview';
  const { t, fmt } = await getI18n();
  const entity = ENTITY[view];
  const [list, stats] = await Promise.all([entity ? loadRecords(entity, sp) : null, load(() => api<PlacementStats>('/v1/placements/stats'))]);
  const log =
    view === 'log'
      ? await load(async () => {
          const [rows, skills] = await Promise.all([api<InternshipRow[]>('/v1/placements/internships'), optional<Skill[]>('/v1/skills', [])]);
          return { rows, skills };
        })
      : null;
  const standing =
    view === 'students'
      ? await load(async () => {
          const [rows, meta] = await Promise.all([api<OptinRow[]>('/v1/placements/optins'), api<RecordMeta>('/v1/records/progressions/meta')]);
          return { rows, students: metaOptions(meta, 'studentId') };
        })
      : null;
  const failed = list?.error ?? stats.error ?? log?.error ?? standing?.error;
  const st = statusLabels(t);
  const opt = (k: string) => Object.fromEntries(options(t, entity ?? '', k, list?.data?.meta.fields.find((f) => f.key === k)?.options ?? list?.data?.meta.filters.find((f) => f.key === k)?.options).map((o) => [String(o.value), o.label]));
  const extraParams = { view };
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

  const cols: Record<string, ColSpec[]> = {
    drives: [
      { id: 'title', label: t('pl.col.drive'), key: 'title', sortKey: 'title', rowHeader: true, href: '/placements/drives/{id}', sub: 'roleTitle' },
      { id: 'company', label: t('pl.col.company'), key: 'companyName', sortKey: 'company', href: '/placements/companies/{companyId}' },
      { id: 'category', label: t('pd.category'), key: 'category', kind: 'status', labels: opt('category'), hideBelow: 'md' },
      { id: 'ctc', label: t('pd.ctcLpa'), key: 'ctcLpa', kind: 'lpa', sortKey: 'ctc', hideBelow: 'sm' },
      { id: 'cgpa', label: t('pl.col.cgpa'), key: 'minCgpa', kind: 'lpa', hideBelow: 'lg' },
      { id: 'date', label: t('pl.col.date'), key: 'driveDate', kind: 'date', sortKey: 'date', hideBelow: 'md' },
      { id: 'registrations', label: t('pl.col.registered'), key: 'registrations', kind: 'number', sortKey: 'registrations' },
      { id: 'offers', label: t('pd.offers'), key: 'offers', kind: 'number', hideBelow: 'lg' },
      { id: 'status', label: t('pl.col.status'), key: 'status', kind: 'status', labels: st },
    ],
    companies: [
      { id: 'name', label: t('pl.col.company'), key: 'name', sortKey: 'name', rowHeader: true, href: '/placements/companies/{id}', sub: 'groupName' },
      { id: 'sector', label: t('pd.sector'), key: 'sector', sortKey: 'sector', hideBelow: 'sm' },
      { id: 'city', label: t('pd.city'), key: 'city', hideBelow: 'md' },
      { id: 'contact', label: t('pd.hrContact'), key: 'contactName', sub: 'contactEmail', hideBelow: 'lg' },
      { id: 'drives', label: t('pd.drives'), key: 'drives', kind: 'number', sortKey: 'drives' },
      { id: 'placed', label: t('pl.stat.placed'), key: 'placed', kind: 'number', sortKey: 'placed' },
      { id: 'portal', label: t('pd.portalKey'), key: 'hasPortalKey', kind: 'yesno', hideBelow: 'md' },
      { id: 'status', label: t('pl.col.status'), key: 'status', kind: 'status', labels: st },
    ],
    offers: [
      { id: 'student', label: t('ops.f.student'), key: 'fullName', sortKey: 'student', rowHeader: true, sub: 'rollNo' },
      { id: 'company', label: t('pl.col.company'), key: 'companyName', sortKey: 'company', sub: 'roleTitle' },
      { id: 'program', label: t('pd.programme'), key: 'programName', hideBelow: 'lg' },
      { id: 'ctc', label: t('pd.ctcLpa'), key: 'ctcLpa', kind: 'lpa', sortKey: 'ctc' },
      { id: 'offered', label: t('pd.offeredOn'), key: 'offeredOn', kind: 'date', sortKey: 'offered', hideBelow: 'md' },
      { id: 'respondBy', label: t('pd.respondBy'), key: 'respondBy', kind: 'date', hideBelow: 'lg' },
      { id: 'joining', label: t('pd.joining'), key: 'joiningStatus', kind: 'status', labels: { ...st, pending: t('pd.notJoinedYet') }, hideBelow: 'md' },
      { id: 'conditional', label: t('pd.conditional'), key: 'conditionNote', defaultHidden: true },
      { id: 'status', label: t('pl.col.status'), key: 'status', kind: 'status', labels: st },
    ],
    internships: [
      { id: 'student', label: t('ops.f.student'), key: 'fullName', sortKey: 'student', rowHeader: true, sub: 'rollNo' },
      { id: 'org', label: t('pd.organisation'), key: 'orgName', sortKey: 'org', sub: 'title' },
      { id: 'starts', label: t('ops.f.startsOn'), key: 'startsOn', kind: 'date', sortKey: 'starts', hideBelow: 'sm' },
      { id: 'ends', label: t('pd.endsOn'), key: 'endsOn', kind: 'date', hideBelow: 'md' },
      { id: 'mentor', label: t('pd.mentor'), key: 'mentorName', hideBelow: 'lg' },
      { id: 'credits', label: t('pd.credits'), key: 'credits', kind: 'number', hideBelow: 'lg', sub: 'creditSubject' },
      { id: 'confirmed', label: t('pd.confirmed'), key: 'companyConfirmed', kind: 'yesno', hideBelow: 'md' },
      { id: 'score', label: t('pd.score'), key: 'evaluationScore', kind: 'number', sortKey: 'score', defaultHidden: true },
      { id: 'status', label: t('pl.col.status'), key: 'status', kind: 'status', labels: st },
    ],
    training: [
      { id: 'title', label: t('pd.programmeTitle'), key: 'title', sortKey: 'title', rowHeader: true, href: '/placements/trainings/{id}', sub: 'trainer' },
      { id: 'kind', label: t('pd.kind'), key: 'kind', kind: 'status', labels: opt('kind'), sortKey: 'kind' },
      { id: 'for', label: t('pd.programme'), key: 'programName', hideBelow: 'md', sub: 'batchYear' },
      { id: 'starts', label: t('ops.f.startsOn'), key: 'startsOn', kind: 'date', sortKey: 'starts', hideBelow: 'sm' },
      { id: 'sessions', label: t('pd.sessions'), key: 'sessions', kind: 'number' },
      { id: 'hours', label: t('pd.hoursDone'), key: 'hoursDone', kind: 'number', hideBelow: 'md' },
      { id: 'status', label: t('pl.col.status'), key: 'status', kind: 'status', labels: st },
    ],
    progression: [
      { id: 'student', label: t('ops.f.student'), key: 'fullName', sortKey: 'student', rowHeader: true, sub: 'rollNo' },
      { id: 'kind', label: t('pd.progressedTo'), key: 'kind', kind: 'status', labels: opt('kind'), sortKey: 'kind' },
      { id: 'year', label: t('pd.year'), key: 'year', sortKey: 'year' },
      { id: 'where', label: t('pd.institution'), key: 'institution', sub: 'program', hideBelow: 'sm' },
      { id: 'exam', label: t('pd.exam'), key: 'exam', sub: 'examRef', hideBelow: 'md' },
      { id: 'venture', label: t('pd.venture'), key: 'ventureName', hideBelow: 'lg' },
      { id: 'verified', label: t('pd.verified'), key: 'verified', kind: 'yesno' },
    ],
    feedback: [
      { id: 'kind', label: t('pd.from'), key: 'kind', kind: 'status', labels: opt('kind'), rowHeader: true },
      { id: 'who', label: t('pd.givenBy'), key: 'respondentName', sub: 'respondentOrg' },
      { id: 'company', label: t('pl.col.company'), key: 'companyName', hideBelow: 'md' },
      { id: 'year', label: t('pd.year'), key: 'year', sortKey: 'year', hideBelow: 'sm' },
      { id: 'average', label: t('pd.average'), key: 'average', kind: 'lpa' },
      { id: 'overall', label: t('pd.overall'), key: 'overall', kind: 'number', sortKey: 'overall' },
      { id: 'source', label: t('pd.source'), key: 'source', defaultHidden: true },
    ],
  };

  const rowActions: Record<string, RowActionSpec[]> = canEdit
    ? {
        companies: [{ id: 'verify', label: t('pd.co.verify'), when: [{ key: 'status', in: ['pending'] }], confirm: t('pd.co.verifyHelp'), done: t('pd.co.verified'), run: verifyCompany }],
        offers: [
          {
            id: 'respond',
            label: t('pd.of.record'),
            when: [{ key: 'status', in: ['offered'] }],
            fields: [
              { name: 'response', label: t('pd.of.response'), kind: 'select', required: true, options: [{ value: 'accepted', label: st.accepted }, { value: 'declined', label: st.declined }] },
              { name: 'reason', label: t('ho.reason') },
            ],
            done: t('ops.saved'),
            run: recordOfferResponse,
          },
          {
            id: 'joining',
            label: t('pd.of.joining'),
            when: [{ key: 'status', in: ['accepted'] }],
            fields: [
              { name: 'status', label: t('pd.joining'), kind: 'select', required: true, options: [{ value: 'joined', label: st.joined }, { value: 'not_joined', label: st.not_joined }] },
              { name: 'joinedOn', label: t('pd.of.joinedOn'), kind: 'date' },
              { name: 'note', label: t('ops.f.note') },
            ],
            done: t('ops.saved'),
            run: recordJoining,
          },
          { id: 'letter', label: t('pd.of.attachLetter'), upload: { accept: 'application/pdf,image/jpeg,image/png', help: t('pd.of.letterHelp'), run: uploadOfferLetter }, done: t('pd.of.letterSaved') },
          { id: 'viewLetter', label: t('pd.of.viewLetter'), when: [{ key: 'hasLetter', in: [true] }], href: '/api/download?kind=placement-offer-letter&id={id}' },
          { id: 'revoke', label: t('pd.of.revoke'), danger: true, when: [{ key: 'status', in: ['offered', 'accepted'] }], fields: [{ name: 'reason', label: t('ho.reason'), kind: 'multiline', required: true }], done: t('pd.of.revoked'), run: revokeOffer },
        ],
        internships: [
          { id: 'approve', label: t('pd.in.approve'), when: [{ key: 'status', in: ['proposed'] }], confirm: t('pd.in.approveHelp'), done: t('ops.saved'), run: approveInternship },
          { id: 'start', label: t('pd.in.start'), when: [{ key: 'status', in: ['approved'] }], confirm: t('pd.in.startHelp'), done: t('ops.saved'), run: startInternship },
          { id: 'complete', label: t('pd.in.complete'), when: [{ key: 'status', in: ['ongoing'] }], confirm: t('pd.in.completeHelp'), done: t('ops.saved'), run: completeInternship },
          { id: 'cancel', label: t('pd.in.cancel'), danger: true, when: [{ key: 'status', in: ['proposed', 'approved', 'ongoing'] }], confirm: t('pd.in.cancelHelp'), done: t('ops.saved'), run: cancelInternship },
        ],
      }
    : {};
  const s = stats.data;

  return (
    <>
      <PageHeader title={t('nav.placements')} subtitle={s ? t('pl.subtitle', { year: String(s.year) }) : undefined} actions={<LinkButton href="/placements/reports" variant="outlined">{t('pd.reports')}</LinkButton>} />
      {s && (
        <Tiles>
          <StatTile label={t('pl.stat.students')} value={fmt.number(s.activeStudents)} testId="pl-students" />
          <StatTile label={t('pl.stat.registered')} value={fmt.number(s.registeredStudents)} />
          <StatTile label={t('pl.stat.placed')} value={fmt.number(s.placedStudents)} caption={`${t('pl.stat.rate')}: ${s.placementPercent}%`} testId="pl-placed" />
          <StatTile label={t('pl.stat.ctc')} value={lakhs(s.ctc.median)} unit={t('pl.lakhs')} caption={t('pl.stat.ctcCaption', { highest: lakhs(s.ctc.highest) })} />
        </Tiles>
      )}
      <LinkTabs value={view} label={t('nav.placements')} items={VIEWS.map((v) => ({ value: v, label: t(`pd.view.${v}`), href: `/placements?view=${v}` }))} />
      {failed !== undefined ? (
        <ErrorState message={failed} />
      ) : view === 'overview' && s ? (
        s.byCompany.length ? (
          <DeskTable title={t('pl.byCompany')} head={[t('pl.col.company'), t('pl.stat.placed'), t('pl.stat.ctc')]} rows={s.byCompany.map((c) => [c.name, fmt.number(c.placed), `${lakhs(c.median)} ${t('pl.lakhs')}`])} />
        ) : (
          <div className="rounded-lg border p-6 text-sm text-muted-foreground" data-testid="pl-overview-empty">
            <BarChart3 className="mb-2 h-5 w-5" aria-hidden />
            {t('pd.overviewEmpty')}
          </div>
        )
      ) : list?.data ? (
        <KitList
          {...list.data}
          label={t(`pd.view.${view}`)}
          cols={cols[view]}
          extraParams={extraParams}
          rowHref={view === 'drives' ? '/placements/drives/{id}' : view === 'companies' ? '/placements/companies/{id}' : view === 'training' ? '/placements/trainings/{id}' : undefined}
          rowActions={rowActions[view] ?? []}
          emptyTitle={t(`pd.empty.${view as 'drives'}`)}
          emptyBody={t(`pd.emptyHelp.${view as 'drives'}`)}
          testId={`pl-${view}`}
        />
      ) : log?.data ? (
        <InternshipsDesk rows={log.data.rows} skills={log.data.skills.filter((x) => x.active).map((x) => ({ id: x.id, name: x.name }))} canEdit={canEdit} />
      ) : standing?.data ? (
        <StudentStanding rows={standing.data.rows} students={standing.data.students} canEdit={canEdit} today={today} />
      ) : null}
    </>
  );
}
