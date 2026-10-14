'use client';

import { CalendarDays } from 'lucide-react';
import { useState, useTransition } from 'react';
import { loadRoomDay } from '@/app/(dashboard)/facilities/actions';
import { Button } from '@/components/shadcn/button';
import { Card, EmptyState, FormRow, SelectInput, StatusPill, TextInput } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import { statusTone, type Option, type RoomDay } from '@/lib/procurement';
import { statusLabel } from '@/lib/procurement-labels';

/** A room's day: its timetabled classes and bookings in time order, to see when it is free before booking it. */
export function RoomDayView({ rooms, today }: { rooms: Option[]; today: string }) {
  const { t } = useI18n();
  const [roomId, setRoomId] = useState(rooms[0]?.value ?? '');
  const [date, setDate] = useState(today);
  const [day, setDay] = useState<RoomDay | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const show = () =>
    start(async () => {
      const r = await loadRoomDay(roomId, date);
      if (!r.ok) {
        setDay(null);
        return setError(r.error);
      }
      setError(null);
      setDay(r.data);
    });
  const slots = day
    ? [
        ...day.classes.map((c) => ({ id: c.id, startsAt: c.startsAt, endsAt: c.endsAt, title: `${c.subject} · ${c.section}`, tag: <StatusPill tone="info">{t('ivd.fc.class')}</StatusPill> })),
        ...day.bookings.map((b) => ({ id: b.id, startsAt: b.startsAt, endsAt: b.endsAt, title: `${b.number} · ${b.title}`, tag: <StatusPill tone={statusTone(b.status)}>{statusLabel(t, b.status)}</StatusPill> })),
      ].sort((a, b) => a.startsAt.localeCompare(b.startsAt))
    : [];

  if (!rooms.length) return <EmptyState icon={<CalendarDays />} title={t('ivd.fc.noRooms')}>{t('ivd.fc.noRoomsHelp')}</EmptyState>;
  return (
    <Card title={t('ivd.fview.calendar')}>
      <FormRow>
        <SelectInput className="min-w-[220px]" label={t('ivd.as.room')} value={roomId} onChange={(e) => setRoomId(e.target.value)} options={rooms} />
        <TextInput type="date" label={t('ivd.date')} value={date} onChange={(e) => setDate(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
        <Button className="h-10" onClick={show} disabled={pending || !roomId || !date} data-testid="room-day-show">
          {t('ivd.fc.show')}
        </Button>
      </FormRow>
      {error && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      )}
      {day && (
        <ul className="mt-4 grid gap-2" data-testid="room-day">
          {slots.length === 0 && <li className="text-sm text-muted-foreground">{t('ivd.fc.free')}</li>}
          {slots.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center gap-3 rounded-md border px-3 py-2 text-sm">
              <span className="w-28 font-mono">{`${s.startsAt.slice(0, 5)}–${s.endsAt.slice(0, 5)}`}</span>
              <span className="min-w-0 flex-1">{s.title}</span>
              {s.tag}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
