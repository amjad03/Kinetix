import type { Metadata } from 'next';
import { RoomDayView } from '@/components/facilities/RoomDayView';
import { KitList, type ColSpec, type RowActionSpec } from '@/components/procurement/KitList';
import { options } from '@/components/records/text';
import { PageHeader } from '@/components/PageHeader';
import { StatGrid, StatTile } from '@/components/StatTile';
import { ErrorState } from '@/components/States';
import { LinkTabs } from '@/components/ui';
import { assignTicket, rateTicketRow, rejectBooking, reopenTicket, resolveTicket } from '@/app/(dashboard)/facilities/actions';
import { getI18n } from '@/i18n/server';
import { api, load, requireSection } from '@/lib/api';
import type { TicketSummary } from '@/lib/procurement';
import { statusLabels } from '@/lib/procurement-labels';
import { metaOptions, param } from '@/lib/procurement-server';
import type { RecordMeta } from '@/lib/records';
import { loadRecords } from '@/lib/records-server';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.facilities') };
}

const VIEWS = ['tickets', 'bookings', 'calendar', 'rooms'] as const;
type View = (typeof VIEWS)[number];
const ENTITY: Partial<Record<View, string>> = { tickets: 'maintenance-tickets', bookings: 'facility-bookings', rooms: 'rooms' };
const MANAGERS = ['tenant_admin', 'principal', 'store_keeper'];

/**
 * Facilities: maintenance requests any member of staff raises (electrical, IT, civil, plumbing…) worked against a
 * deadline set by priority and rated when done; booking halls, labs and rooms with clashes checked against other
 * bookings and the timetable; a room's day; and the rooms themselves (the estate office).
 */
export default async function FacilitiesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const me = await requireSection('facilities');
  const manager = (me?.roles ?? []).some((r) => MANAGERS.includes(r));
  const views = VIEWS.filter((v) => manager || v !== 'rooms');
  const sp = await searchParams;
  const asked = param(sp, 'view');
  const view: View = views.includes(asked as View) ? (asked as View) : 'tickets';
  const { t } = await getI18n();
  const entity = ENTITY[view];
  const [list, summary, bookingMeta] = await Promise.all([
    entity ? loadRecords(entity, sp) : null,
    load(() => api<TicketSummary>('/v1/facilities/tickets/summary')),
    view === 'calendar' ? load(() => api<RecordMeta>('/v1/records/facility-bookings/meta')) : null,
  ]);
  const failed = list?.error ?? summary.error ?? bookingMeta?.error;
  const st = statusLabels(t);
  const cat = (k: string) => Object.fromEntries(options(t, entity ?? '', k, list?.data?.meta.fields.find((f) => f.key === k)?.options).map((o) => [String(o.value), o.label]));
  const extraParams = { view };
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const mine = me?.id ?? '';

  const cols: Record<string, ColSpec[]> = {
    tickets: [
      { id: 'number', label: t('inv.number'), key: 'number', sortKey: 'number', rowHeader: true, sub: 'title' },
      { id: 'category', label: t('ivd.fc.category'), key: 'category', kind: 'status', labels: cat('category'), hideBelow: 'sm' },
      { id: 'priority', label: t('ivd.fc.priority'), key: 'priority', kind: 'status', labels: cat('priority'), sortKey: 'priority' },
      { id: 'where', label: t('ivd.fc.where'), key: 'roomName', sub: 'location', hideBelow: 'md' },
      { id: 'assignee', label: t('ivd.fc.assignee'), key: 'assigneeName', hideBelow: 'lg' },
      { id: 'due', label: t('ivd.fc.due'), key: 'dueAt', kind: 'datetime', sortKey: 'due', hideBelow: 'md' },
      { id: 'sla', label: t('ivd.fc.sla'), key: 'sla', kind: 'status', labels: st },
      { id: 'raisedBy', label: t('ivd.fc.raisedBy'), key: 'raisedByName', defaultHidden: true },
      { id: 'cost', label: t('as.cost'), key: 'cost', kind: 'rupees', defaultHidden: true },
      { id: 'rating', label: t('ivd.rating'), key: 'rating', kind: 'number', defaultHidden: true },
      { id: 'status', label: t('ops.f.status'), key: 'status', kind: 'status', labels: st, sortKey: 'status' },
    ],
    bookings: [
      { id: 'number', label: t('inv.number'), key: 'number', rowHeader: true, sub: 'title' },
      { id: 'room', label: t('ivd.as.room'), key: 'roomName', sortKey: 'room' },
      { id: 'date', label: t('ivd.date'), key: 'onDate', kind: 'date', sortKey: 'date' },
      { id: 'from', label: t('ivd.fc.from'), key: 'startsAt' },
      { id: 'to', label: t('ivd.fc.to'), key: 'endsAt' },
      { id: 'organiser', label: t('ivd.fc.organiser'), key: 'organiser', hideBelow: 'md', sub: 'bookedByName' },
      { id: 'attendees', label: t('ivd.fc.attendees'), key: 'attendees', kind: 'number', hideBelow: 'lg' },
      { id: 'status', label: t('ops.f.status'), key: 'status', kind: 'status', labels: st },
    ],
    rooms: [
      { id: 'name', label: t('ops.f.name'), key: 'name', sortKey: 'name', rowHeader: true, sub: 'floorLabel' },
      { id: 'kind', label: t('ivd.kind'), key: 'kind', kind: 'status', labels: cat('kind'), sortKey: 'kind' },
      { id: 'capacity', label: t('ivd.fc.seats'), key: 'capacity', kind: 'number', sortKey: 'capacity' },
      { id: 'campus', label: t('ivd.fc.campus'), key: 'campusName', hideBelow: 'md' },
      { id: 'facilities', label: t('ivd.fc.facilities'), key: 'facilities', hideBelow: 'lg' },
      { id: 'bookable', label: t('ivd.fc.bookable'), key: 'bookable', kind: 'yesno' },
      { id: 'classes', label: t('ivd.fc.classes'), key: 'classes', kind: 'number', sortKey: 'classes', hideBelow: 'md' },
      { id: 'assets', label: t('nav.assets'), key: 'assets', kind: 'number', hideBelow: 'lg' },
    ],
  };
  const rating = ['5', '4', '3', '2', '1'].map((n) => ({ value: n, label: n }));
  const rowActions: Record<string, RowActionSpec[]> = {
    tickets: [
      ...(manager
        ? [
            { id: 'assign', label: t('ivd.fc.assign'), when: [{ key: 'status', in: ['open', 'assigned', 'on_hold'] }], fields: [{ name: 'assigneeName', label: t('ivd.fc.assignee'), required: true }, { name: 'note', label: t('ops.f.note') }], done: t('ivd.fc.assigned'), run: assignTicket },
            { id: 'resolve', label: t('ivd.fc.resolve'), when: [{ key: 'status', in: ['open', 'assigned', 'in_progress', 'on_hold'] }], fields: [{ name: 'resolution', label: t('ivd.fc.resolution'), kind: 'multiline' as const, required: true }, { name: 'cost', label: t('as.cost'), kind: 'rupees' as const }], done: t('ivd.fc.resolved'), run: resolveTicket },
            { id: 'reopen', label: t('ivd.fc.reopen'), when: [{ key: 'status', in: ['resolved', 'closed'] }], fields: [{ name: 'note', label: t('ho.reason'), required: true }], done: t('ivd.fc.reopened'), run: reopenTicket },
          ]
        : []),
      {
        id: 'rate',
        label: t('ivd.fc.rate'),
        when: [{ key: 'status', in: ['resolved'] }, ...(manager ? [] : [{ key: 'raisedBy', in: [mine] }])],
        fields: [
          { name: 'rating', label: t('ivd.rating'), kind: 'select' as const, required: true, options: rating },
          { name: 'reopen', label: t('ivd.fc.notFixed'), kind: 'select' as const, init: 'no', options: [{ value: 'no', label: t('ops.no') }, { value: 'yes', label: t('ops.yes') }] },
          { name: 'note', label: t('ops.f.note') },
        ],
        done: t('ivd.fc.rated'),
        run: rateTicketRow,
      },
    ],
    bookings: manager ? [{ id: 'reject', label: t('ivd.fc.reject'), danger: true, when: [{ key: 'status', in: ['pending'] }], fields: [{ name: 'note', label: t('ho.reason'), required: true }], done: t('ivd.fc.rejected'), run: rejectBooking }] : [],
  };
  const s = summary.data;

  return (
    <>
      <PageHeader title={t('nav.facilities')} subtitle={t('ivd.fc.subtitle')} />
      {s && (
        <StatGrid min={140}>
          <StatTile label={t('ivd.fc.open')} value={s.open} testId="fc-open" />
          <StatTile label={t('ivd.fc.breached')} value={s.breached} tone={s.breached ? 'warning' : 'default'} testId="fc-breached" />
          <StatTile label={t('ivd.fc.atRisk')} value={s.atRisk} testId="fc-risk" />
          <StatTile label={t('ivd.fc.met')} value={s.metPct === null ? '—' : `${s.metPct}%`} caption={s.avgResolveHours === null ? undefined : t('ivd.fc.avgHours', { n: s.avgResolveHours })} testId="fc-met" />
          <StatTile label={t('ivd.fc.avgRating')} value={s.avgRating === null ? '—' : `${s.avgRating} / 5`} testId="fc-rating" />
        </StatGrid>
      )}
      <LinkTabs value={view} label={t('nav.facilities')} items={views.map((v) => ({ value: v, label: t(`ivd.fview.${v}`), href: `/facilities?view=${v}` }))} />
      {failed !== undefined ? (
        <ErrorState message={failed} />
      ) : list?.data ? (
        <KitList
          {...list.data}
          label={t(`ivd.fview.${view}`)}
          cols={cols[view]}
          extraParams={extraParams}
          rowActions={rowActions[view] ?? []}
          emptyTitle={t(`ivd.empty.${view as 'tickets'}`)}
          emptyBody={t(`ivd.emptyHelp.${view as 'tickets'}`)}
          testId={`fc-${view}`}
        />
      ) : (
        <RoomDayView rooms={metaOptions(bookingMeta?.data, 'roomId')} today={today} />
      )}
    </>
  );
}
