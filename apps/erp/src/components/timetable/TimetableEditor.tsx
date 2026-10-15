'use client';
import { useMemo, useState, useTransition } from 'react';
import { FormField, TextInput } from '@/components/ui';
import { addSlot, changeSlot, removeSlot } from '@/app/(dashboard)/timetable/actions';
import { EmptyState } from '@/components/States';
import { useI18n } from '@/i18n/client';
import type { TFunction } from '@/i18n/translate';
import { weekdayName, weekdayNameShort } from '@/lib/dates';
import { addMinutes, hm, slotProblem, subjectsFor, weekGrid, type SlotInput } from '@/lib/timetable';
import type { StaffMember, Structure, TimetableSlot } from '@/lib/types';

import { Alert, Button, ButtonBase, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, MenuItem, Snackbar } from '@/components/kx';
import { CalendarDays as CalendarMonthOutlined, Plus as Add, Trash2 as DeleteOutline } from 'lucide-react';
import { cn } from '@/lib/utils';
import { size } from '@/lib/sx';
export interface TimetableView {
  kind: 'class' | 'teacher' | 'room';
  id: string;
  name: string;
}

type Editing = { slot: TimetableSlot } | { draft: Partial<SlotInput> };

const PERIOD_MINUTES = 55;

export function TimetableEditor({
  view,
  slots,
  sections,
  subjects,
  rooms,
  staff,
}: {
  view: TimetableView;
  slots: TimetableSlot[];
  sections: Structure['sections'];
  subjects: Structure['subjects'];
  rooms: Structure['rooms'];
  staff: StaffMember[];
}) {
  const { t, locale } = useI18n();
  const grid = useMemo(() => weekGrid(slots), [slots]);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const base: Partial<SlotInput> = view.kind === 'class' ? { sectionId: view.id } : view.kind === 'teacher' ? { teacherId: view.id } : { roomId: view.id };
  const hours = slots.reduce((m, s) => m + minutes(s.endsAt) - minutes(s.startsAt), 0);

  const add = (draft: Partial<SlotInput> = {}) => setEditing({ draft: { ...base, ...draft } });

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
        <div>
          <h2 className="font-medium tracking-[0.1px] text-[1.125rem]" data-testid="timetable-title">
            {view.name}
          </h2>
          <p className="text-[13px] leading-[19px] text-muted-foreground" data-testid="timetable-summary">
            {t.plural('tt.periods', slots.length)}
            {hours ? ` · ${t('tt.teaching', { time: formatHours(hours, t) })}` : ''}
          </p>
        </div>
        <Button variant="contained" startIcon={<Add />} onClick={() => add()}>
          {t('tt.addPeriod')}
        </Button>
      </div>

      {slots.length === 0 ? (
        <EmptyState icon={<CalendarMonthOutlined />} title={view.kind === 'class' ? t('tt.noPeriodsClass') : t('tt.noPeriodsTeacher')} testId="no-periods" actions={<Button variant="outlined" startIcon={<Add />} onClick={() => add()}>{t('tt.addPeriod')}</Button>}>
          {t('tt.noPeriodsBody')}
        </EmptyState>
      ) : (
        <div className="border border-border rounded-[12px] overflow-x-auto"
          data-testid="timetable-grid"
        >
          <div className="grid" style={{ gridTemplateColumns: `72px repeat(${grid.columns.length}, minmax(132px, 1fr))`, minWidth: size(72 + grid.columns.length * 132) }}
            role="table"
            aria-label={t('tt.gridLabel', { name: view.name })}
          >
            <div className="contents" role="row">
              <div className="sticky left-0 z-[2] border-b bg-muted px-3 py-2.5" role="columnheader" />
              {grid.columns.map((c) => (
                <div className="text-center border-b bg-muted px-3 py-2.5" key={c.key} role="columnheader">
                  <h6 className="text-sm leading-5 font-medium tracking-[0.1px] tabular-nums">
                    {c.startsAt}–{c.endsAt}
                  </h6>
                </div>
              ))}
            </div>
            {grid.rows.map((r) => (
              <div className="contents" key={r.day} role="row" data-testid={`day-${r.day}`}>
                <div className="flex items-center bg-muted sticky left-0 z-[1] min-h-[76px] border-b border-l p-1.5 first-of-type:border-l-0" role="rowheader">
                  <h6 className="text-sm leading-5 font-medium tracking-[0.1px]">{weekdayNameShort(r.day, locale)}</h6>
                </div>
                {grid.columns.map((c) => {
                  const here = r.cells[c.key] ?? [];
                  return (
                    <div className="grid min-w-0 gap-1 [&:hover_.kx-add]:opacity-[1] min-h-[76px] border-b border-l p-1.5 first-of-type:border-l-0" key={c.key} role="cell">
                      {here.map((s) => (
                        <SlotCard key={s.id} slot={s} view={view} onClick={() => setEditing({ slot: s })} />
                      ))}
                      {here.length === 0 && (
                        <IconButton className="kx-add justify-self-center self-center opacity-[0.35] focus-visible:opacity-[1] text-muted-foreground"
                          size="small"
                          aria-label={t('tt.addAt', { day: weekdayName(r.day, locale), time: c.startsAt })}
                          onClick={() => add({ dayOfWeek: r.day, startsAt: c.startsAt, endsAt: c.endsAt })}
                        >
                          <Add className="size-5" />
                        </IconButton>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}
      <p className="text-xs leading-4 tracking-[0.3px] text-muted-foreground mt-3">
        {t('tt.footer')}
      </p>

      {editing && (
        <PeriodDialog
          key={'slot' in editing ? editing.slot.id : 'new'}
          editing={editing}
          view={view}
          sections={sections}
          subjects={subjects}
          rooms={rooms}
          staff={staff}
          onClose={(done) => {
            setEditing(null);
            if (done) setToast(done);
          }}
        />
      )}
      <Snackbar open={!!toast} autoHideDuration={6000} onClose={() => setToast(null)} message={toast} anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }} />
    </>
  );
}


const minutes = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};
const formatHours = (m: number, t: TFunction) => (m % 60 === 0 ? t('tt.hours', { h: m / 60 }) : t('time.hoursMinutes', { h: Math.floor(m / 60), m: m % 60 }));

function SlotCard({ slot, view, onClick }: { slot: TimetableSlot; view: TimetableView; onClick: () => void }) {
  const { t, locale } = useI18n();
  const who = view.kind === 'class' ? slot.teacher.fullName : view.kind === 'room' ? `${slot.section.displayName} · ${slot.teacher.fullName}` : slot.section.displayName;
  return (
    <ButtonBase className="block min-w-0 overflow-hidden text-left w-full h-full rounded-[8px] px-2.5 py-2 bg-secondary text-secondary-foreground border-l-3 border-teal hover:bg-teal-soft hover:text-teal-ink focus-visible:[outline:2px] focus-visible:outline-teal focus-visible:[outline-style:solid]"
      onClick={onClick}
      data-testid="slot"
      aria-label={t('tt.slotLabel', { subject: slot.subject.name, who, day: weekdayName(slot.dayOfWeek, locale), time: `${hm(slot.startsAt)}–${hm(slot.endsAt)}` })}
    >
      <h6 className="font-medium tracking-[0.1px] text-[0.8125rem]">
        {slot.subject.name}
      </h6>
      <p className="text-xs tracking-[0.3px] truncate opacity-[0.85] leading-[16px]">
        {who}
      </p>
      {slot.room && view.kind !== 'room' && (
        <p className="text-xs tracking-[0.3px] truncate opacity-[0.7] leading-[16px]">
          {slot.room}
        </p>
      )}
      {(slot.batch || !!slot.combinedSectionIds?.length) && (
        <p className="text-xs tracking-[0.3px] truncate leading-[16px] font-medium">
          {[slot.batch ? t('tt.batchShort', { b: slot.batch }) : '', slot.combinedSectionIds?.length ? t('tt.combinedShort', { n: slot.combinedSectionIds.length }) : ''].filter(Boolean).join(' · ')}
        </p>
      )}
    </ButtonBase>
  );
}

function PeriodDialog({
  editing,
  view,
  sections,
  subjects,
  rooms,
  staff,
  onClose,
}: {
  editing: Editing;
  view: TimetableView;
  sections: Structure['sections'];
  subjects: Structure['subjects'];
  rooms: Structure['rooms'];
  staff: StaffMember[];
  onClose: (done?: string) => void;
}) {
  const { t, locale } = useI18n();
  const existing = 'slot' in editing ? editing.slot : null;
  const d: Partial<SlotInput> = existing
    ? {
        sectionId: existing.section.id,
        subjectId: existing.subject.id,
        teacherId: existing.teacher.id,
        roomId: existing.roomId,
        dayOfWeek: existing.dayOfWeek,
        startsAt: hm(existing.startsAt),
        endsAt: hm(existing.endsAt),
        batch: existing.batch ?? '',
        combinedSectionIds: existing.combinedSectionIds ?? [],
      }
    : (editing as { draft: Partial<SlotInput> }).draft;

  const [sectionId, setSectionId] = useState(d.sectionId ?? '');
  const classSubjects = subjectsFor({ sections, subjects }, sectionId);
  const [subjectId, setSubjectId] = useState(d.subjectId ?? (classSubjects.length === 1 ? classSubjects[0].id : ''));
  const [teacherId, setTeacherId] = useState(d.teacherId ?? '');
  const [roomId, setRoomId] = useState(d.roomId ?? '');
  const [day, setDay] = useState(d.dayOfWeek ?? 1);
  const [startsAt, setStartsAt] = useState(d.startsAt ?? '09:00');
  const [endsAt, setEndsAt] = useState(d.endsAt ?? addMinutes(d.startsAt ?? '09:00', PERIOD_MINUTES));
  const [batch, setBatch] = useState(d.batch ?? '');
  const [combined, setCombined] = useState<string[]>(d.combinedSectionIds ?? []);
  const [error, setError] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [pending, start] = useTransition();

  const input: SlotInput = { sectionId, subjectId, teacherId, roomId: roomId || null, dayOfWeek: day, startsAt, endsAt, batch: batch.trim() || null, combinedSectionIds: combined.filter((x) => x !== sectionId) };
  const problem = slotProblem(input);
  const subjectName = subjects.find((s) => s.id === subjectId)?.name ?? t('tt.thePeriod');
  const when = `${weekdayName(day, locale)} ${startsAt}–${endsAt}`;

  const save = () => {
    if (problem) {
      setError(t(problem));
      return;
    }
    setError(null);
    start(async () => {
      const res = existing ? await changeSlot(existing.id, input) : await addSlot(input);
      if (res.ok) onClose(existing ? t('tt.changed', { subject: subjectName, when }) : t('tt.added', { subject: subjectName, when }));
      else setError(res.error);
    });
  };

  const remove = () =>
    start(async () => {
      const res = await removeSlot(existing!.id);
      if (res.ok) onClose(t('tt.removed', { subject: existing!.subject.name, when: `${weekdayName(existing!.dayOfWeek, locale)} ${hm(existing!.startsAt)}` }));
      else {
        setConfirmRemove(false);
        setError(res.error);
      }
    });

  if (confirmRemove && existing)
    return (
      <Dialog open onClose={pending ? undefined : () => setConfirmRemove(false)} maxWidth="xs" fullWidth aria-labelledby="remove-period-title">
        <DialogTitle id="remove-period-title">{t('tt.remove.title')}</DialogTitle>
        <DialogContent>
          <p className="text-[13px] leading-[19px]">
            {t('tt.remove.body', { subject: existing.subject.name, className: existing.section.displayName, teacher: existing.teacher.fullName, day: weekdayName(existing.dayOfWeek, locale), time: hm(existing.startsAt) })}
          </p>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmRemove(false)} disabled={pending}>
            {t('tt.keep')}
          </Button>
          <Button variant="contained" color="error" onClick={remove} disabled={pending} startIcon={pending ? <CircularProgress size={16} color="inherit" /> : undefined}>
            {t('tt.removePeriod')}
          </Button>
        </DialogActions>
      </Dialog>
    );

  return (
    <Dialog open onClose={pending ? undefined : () => onClose()} maxWidth="sm" fullWidth aria-labelledby="period-title">
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <DialogTitle id="period-title">{existing ? t('tt.change') : t('tt.add')}</DialogTitle>
        <DialogContent>
          <div className="flex flex-col gap-5 pt-2">
            {error && (
              <Alert severity="error" data-testid="period-error">
                {error}
              </Alert>
            )}
            <FormField label={t('tt.class')} required>
              <TextInput
                select
                value={sectionId}
                onChange={(e) => {
                  setSectionId(e.target.value);
                  const next = subjectsFor({ sections, subjects }, e.target.value);
                  setSubjectId(next.length === 1 ? next[0].id : '');
                }}
                required
                disabled={view.kind === 'class' && !existing}
              >
                {sections.map((s) => (
                  <MenuItem key={s.id} value={s.id}>
                    {s.displayName}
                  </MenuItem>
                ))}
              </TextInput>
            </FormField>
            <FormField label={t('tt.subject')} required>
              <TextInput
                select
                value={classSubjects.some((s) => s.id === subjectId) ? subjectId : ''}
                onChange={(e) => setSubjectId(e.target.value)}
                required
                disabled={!sectionId}
                helperText={sectionId && classSubjects.length === 0 ? t('tt.noSubjects') : ' '}
              >
                {classSubjects.map((s) => (
                  <MenuItem key={s.id} value={s.id}>
                    {s.name}
                    <span className="text-[13px] leading-[19px] text-muted-foreground ml-2">
                      {s.code}
                    </span>
                  </MenuItem>
                ))}
              </TextInput>
            </FormField>
            <div className="grid grid-cols-[1fr] sm:grid-cols-[1fr_1fr] gap-4">
              <FormField label={t('tt.teacher')} required>
                <TextInput select value={teacherId} onChange={(e) => setTeacherId(e.target.value)} required>
                  {staff.map((p) => (
                    <MenuItem key={p.id} value={p.id}>
                      {p.fullName}
                    </MenuItem>
                  ))}
                </TextInput>
              </FormField>
              <FormField label={t('tt.room')}>
                <TextInput select value={roomId} onChange={(e) => setRoomId(e.target.value)} slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}>
                  <MenuItem value="">
                    <span className="text-sm leading-[21px] text-muted-foreground">
                      {t('tt.noRoom')}
                    </span>
                  </MenuItem>
                  {rooms.map((r) => (
                    <MenuItem key={r.id} value={r.id}>
                      {r.name}
                    </MenuItem>
                  ))}
                </TextInput>
              </FormField>
            </div>
            <div className="grid grid-cols-[1fr_1fr] sm:grid-cols-[1.4fr_1fr_1fr] gap-4">
              <FormField label={t('tt.day')} required>
                <TextInput className="col-span-full sm:col-[auto]" select value={day} onChange={(e) => setDay(Number(e.target.value))} required>
                  {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                    <MenuItem key={n} value={n}>
                      {weekdayName(n, locale)}
                    </MenuItem>
                  ))}
                </TextInput>
              </FormField>
              <FormField label={t('tt.starts')} required>
                <TextInput
                  type="time"
                  value={startsAt}
                  onChange={(e) => {
                    const v = e.target.value;
                    // Keep the period's length when the start moves.
                    if (/^\d{2}:\d{2}$/.test(v) && /^\d{2}:\d{2}$/.test(startsAt) && /^\d{2}:\d{2}$/.test(endsAt) && endsAt > startsAt) setEndsAt(addMinutes(v, minutes(endsAt) - minutes(startsAt)));
                    setStartsAt(v);
                  }}
                  required
                  slotProps={{ inputLabel: { shrink: true }, htmlInput: { step: 300 } }}
                />
              </FormField>
              <FormField label={t('tt.ends')} required>
                <TextInput
                  type="time"
                  value={endsAt}
                  onChange={(e) => setEndsAt(e.target.value)}
                  required
                  error={!!startsAt && !!endsAt && endsAt <= startsAt}
                  slotProps={{ inputLabel: { shrink: true }, htmlInput: { step: 300 } }}
                />
              </FormField>
            </div>
            <div className="grid grid-cols-[1fr] sm:grid-cols-[1fr_2fr] gap-4">
              <FormField label={t('tt.batch')} helper={t('tt.batchHelp')}>
                <TextInput value={batch} onChange={(e) => setBatch(e.target.value)} inputProps={{ maxLength: 20 }} />
              </FormField>
              <FormField label={t('tt.combined')} helper={t('tt.combinedHelp')}>
                <TextInput
                  select
                  value={combined}
                  onChange={(e) => setCombined(typeof e.target.value === 'string' ? e.target.value.split(',') : (e.target.value as unknown as string[]))}
                  slotProps={{ select: { multiple: true, renderValue: (v: unknown) => (v as string[]).map((id) => sections.find((s) => s.id === id)?.displayName ?? '').join(', ') } }}
                >
                  {sections
                    .filter((s) => s.id !== sectionId)
                    .map((s) => (
                      <MenuItem key={s.id} value={s.id}>
                        {s.displayName}
                      </MenuItem>
                    ))}
                </TextInput>
              </FormField>
            </div>
            {existing && (
              <span className="text-xs leading-4 tracking-[0.3px] text-muted-foreground">
                {t('tt.replaces')}
              </span>
            )}
          </div>
        </DialogContent>
        <DialogActions className={cn(existing ? 'justify-between' : 'justify-end')}>
          {existing && (
            <Button color="error" startIcon={<DeleteOutline />} onClick={() => setConfirmRemove(true)} disabled={pending}>
              {t('tt.remove')}
            </Button>
          )}
          <div className="flex gap-2">
            <Button onClick={() => onClose()} disabled={pending}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" variant="contained" disabled={pending || !!problem} startIcon={pending ? <CircularProgress size={16} color="inherit" /> : undefined}>
              {existing ? t('common.save') : t('tt.addPeriod')}
            </Button>
          </div>
        </DialogActions>
      </form>
    </Dialog>
  );
}
