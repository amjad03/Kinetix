'use client';
import { useState } from 'react';
import { addSlots, cancelBooking, closeEvent, createEvent, recordMinutes, remindFamilies } from '@/app/(dashboard)/ptm/actions';
import { ActionButton, Bar, FormDialog, Grid, Pill, Tabbed, useToast, type Col, type Field } from '@/components/ops/kit';
import { UrlSelect } from '@/components/UrlSelect';
import { useI18n } from '@/i18n/client';
import type { PtmEvent, PtmReport, PtmSlot, StaffOption } from '@/lib/school-life';

import { Button } from '@/components/kx';
import { Plus as Add } from 'lucide-react';
/** Parent-teacher meetings: the meetings, each teacher's slots and who has booked them. */
export function PtmDesk({ events, eventId, slots, staff, report = null }: { events: PtmEvent[]; eventId: string; slots: PtmSlot[]; staff: StaffOption[]; report?: PtmReport | null }) {
  const { t, fmt } = useI18n();
  const [toast, toastNode] = useToast();
  const [form, setForm] = useState<'event' | 'slots' | null>(null);
  const [minutesFor, setMinutesFor] = useState<PtmSlot | null>(null);
  const now = Date.now();
  const event = events.find((e) => e.id === eventId);

  const eventFields: Field[] = [
    { name: 'title', label: t('pt.f.title'), required: true },
    { name: 'eventDate', label: t('pt.f.date'), kind: 'date', required: true },
    { name: 'location', label: t('pt.f.location') },
  ];
  const slotFields: Field[] = [
    { name: 'teacherId', label: t('pt.f.teacher'), kind: 'select', required: true, options: staff.map((s) => ({ value: s.id, label: s.fullName })) },
    { name: 'from', label: t('pt.f.from'), kind: 'time', required: true },
    { name: 'to', label: t('pt.f.to'), kind: 'time', required: true },
    { name: 'durationMinutes', label: t('pt.f.duration'), kind: 'number', required: true, init: '15' },
  ];

  const eventCols: Col<PtmEvent>[] = [
    { label: t('pt.col.title'), cell: (e) => e.title, sort: (e) => e.title },
    { label: t('pt.col.date'), cell: (e) => fmt.date(e.eventDate), sort: (e) => e.eventDate },
    { label: t('pt.col.location'), cell: (e) => e.location || '-' },
    { label: t('pt.col.slots'), cell: (e) => t('pt.booked', { booked: e.booked, slots: e.slots }), sort: (e) => e.slots },
    { label: t('pt.col.status'), cell: (e) => <Pill label={t(`pt.status.${e.status}` as 'pt.status.open')} warn={e.status === 'closed'} /> },
    { label: '', cell: (e) => (e.status === 'open' ? <ActionButton label={t('pt.close')} run={() => closeEvent(e.id)} onDone={toast} /> : null) },
  ];

  const slotCols: Col<PtmSlot>[] = [
    { label: t('pt.col.teacher'), cell: (s) => s.teacher, sort: (s) => s.teacher },
    { label: t('pt.col.time'), cell: (s) => `${fmt.dateTime(s.startsAt)} - ${fmt.time(s.endsAt)}`, sort: (s) => s.startsAt },
    { label: t('pt.col.child'), cell: (s) => s.student ?? <Pill label={t('pt.free')} /> },
    { label: t('ptm2.col.attendance'), cell: (s) => (s.attendance ? <Pill label={t(`ptm2.att.${s.attendance}` as 'ptm2.att.attended')} warn={s.attendance === 'no_show'} /> : '-') },
    { label: t('ptm2.col.actions'), cell: (s) => (s.actionPoints ? <span className="block min-w-[160px] max-w-[300px] whitespace-normal">{s.actionPoints}</span> : '-') },
    {
      label: '',
      cell: (s) =>
        s.studentId ? (
          <span className="flex flex-wrap justify-end gap-1.5">
            {new Date(s.startsAt).getTime() <= now ? (
              <Button size="small" onClick={() => setMinutesFor(s)} data-testid="pt-minutes">
                {s.minutesAt ? t('ptm2.editMinutes') : t('ptm2.minutes')}
              </Button>
            ) : (
              <ActionButton label={t('pt.cancel')} tone="error" run={() => cancelBooking(s.id)} onDone={toast} />
            )}
          </span>
        ) : null,
    },
  ];

  const tabs = [
    {
      id: 'events',
      label: t('pt.tab.events'),
      node: (
        <>
          <Bar>
            <Button variant="contained" startIcon={<Add />} onClick={() => setForm('event')} data-testid="pt-new">
              {t('pt.new')}
            </Button>
          </Bar>
          <Grid testId="pt-events" empty={t('pt.empty')} rows={events} cols={eventCols} />
        </>
      ),
    },
    {
      id: 'slots',
      label: t('pt.tab.slots'),
      node: (
        <>
          <Bar>
            <UrlSelect label={t('pt.event')} param="eventId" value={eventId} options={events.map((e) => ({ value: e.id, label: `${e.title} (${e.eventDate})` }))} testId="pt-event" />
            <Button variant="outlined" startIcon={<Add />} onClick={() => setForm('slots')} disabled={!event || event.status !== 'open'}>
              {t('pt.addSlots')}
            </Button>
            {event && event.status === 'open' && <ActionButton label={t('pt.remind')} run={() => remindFamilies(event.id)} onDone={toast} />}
          </Bar>
          <Grid testId="pt-slots" empty={t('pt.emptySlots')} rows={slots} cols={slotCols} />
        </>
      ),
    },
    ...(report && event
      ? [
          {
            id: 'report',
            label: t('ptm2.tab.report'),
            node: (
              <>
                <p className="mb-3 text-[13px] leading-[19px]" data-testid="pt-report-total">
                  {t('ptm2.totals', { slots: fmt.number(report.total.slots), booked: fmt.number(report.total.booked), attended: fmt.number(report.total.attended), noShow: fmt.number(report.total.noShow), minutes: fmt.number(report.total.minutes) })}
                </p>
                <Grid
                  testId="pt-report"
                  empty={t('pt.emptySlots')}
                  exportName="ptm-report"
                  rows={report.teachers}
                  cols={[
                    { label: t('pt.col.teacher'), cell: (r) => r.teacher, sort: (r) => r.teacher },
                    { label: t('pt.col.slots'), cell: (r) => fmt.number(r.slots), num: true, sort: (r) => r.slots },
                    { label: t('ptm2.col.booked'), cell: (r) => fmt.number(r.booked), num: true, sort: (r) => r.booked },
                    { label: t('ptm2.att.attended'), cell: (r) => fmt.number(r.attended), num: true, sort: (r) => r.attended },
                    { label: t('ptm2.att.no_show'), cell: (r) => fmt.number(r.noShow), num: true, sort: (r) => r.noShow },
                    { label: t('ptm2.col.minutes'), cell: (r) => fmt.number(r.minutes), num: true, sort: (r) => r.minutes },
                  ]}
                />
              </>
            ),
          },
        ]
      : []),
  ];

  return (
    <>
      <Tabbed label={t('nav.ptm')} initial={eventId ? 'slots' : 'events'} tabs={tabs} />
      {form === 'event' && (
        <FormDialog
          title={t('pt.new')}
          fields={eventFields}
          onSubmit={createEvent}
          onClose={(m) => {
            setForm(null);
            if (m) toast(m);
          }}
        />
      )}
      {form === 'slots' && event && (
        <FormDialog
          title={t('pt.addSlots')}
          fields={slotFields}
          intro={t('pt.slotsHelp')}
          onSubmit={(v) => addSlots(event.id, v)}
          onClose={(m) => {
            setForm(null);
            if (m) toast(m);
          }}
        />
      )}
      {minutesFor && (
        <FormDialog
          title={t('ptm2.minutesFor', { child: minutesFor.student ?? '' })}
          intro={t('ptm2.minutesHelp')}
          fields={[
            { name: 'attendance', label: t('ptm2.col.attendance'), kind: 'select', required: true, init: minutesFor.attendance ?? 'attended', options: [{ value: 'attended', label: t('ptm2.att.attended') }, { value: 'no_show', label: t('ptm2.att.no_show') }] },
            { name: 'minutes', label: t('ptm2.col.minutes'), kind: 'multiline', init: minutesFor.minutes ?? '' },
            { name: 'actionPoints', label: t('ptm2.col.actions'), kind: 'multiline', init: minutesFor.actionPoints ?? '' },
            { name: 'share', label: t('ptm2.share'), kind: 'select', init: 'yes', options: [{ value: 'yes', label: t('ptm2.shareYes') }, { value: 'no', label: t('ptm2.shareNo') }] },
          ]}
          onSubmit={(v) => recordMinutes(minutesFor.id, v)}
          onClose={(m) => {
            setMinutesFor(null);
            if (m) toast(m);
          }}
        />
      )}
      {toastNode}
    </>
  );
}
