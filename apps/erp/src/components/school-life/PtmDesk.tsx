'use client';

import Add from '@mui/icons-material/Add';
import Button from '@mui/material/Button';
import { useState } from 'react';
import { addSlots, cancelBooking, closeEvent, createEvent, remindFamilies } from '@/app/(dashboard)/ptm/actions';
import { ActionButton, Bar, FormDialog, Grid, Pill, Tabbed, useToast, type Col, type Field } from '@/components/ops/kit';
import { UrlSelect } from '@/components/UrlSelect';
import { useI18n } from '@/i18n/client';
import type { PtmEvent, PtmSlot, StaffOption } from '@/lib/school-life';

/** Parent-teacher meetings: the meetings, each teacher's slots and who has booked them. */
export function PtmDesk({ events, eventId, slots, staff }: { events: PtmEvent[]; eventId: string; slots: PtmSlot[]; staff: StaffOption[] }) {
  const { t, fmt } = useI18n();
  const [toast, toastNode] = useToast();
  const [form, setForm] = useState<'event' | 'slots' | null>(null);
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
    { label: '', cell: (s) => (s.studentId ? <ActionButton label={t('pt.cancel')} tone="error" run={() => cancelBooking(s.id)} onDone={toast} /> : null) },
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
      {toastNode}
    </>
  );
}
