'use client';

import Add from '@mui/icons-material/Add';
import CalendarMonthOutlined from '@mui/icons-material/CalendarMonthOutlined';
import DeleteOutline from '@mui/icons-material/DeleteOutlined';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import MenuItem from '@mui/material/MenuItem';
import Snackbar from '@mui/material/Snackbar';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useMemo, useState, useTransition } from 'react';
import { addSlot, changeSlot, removeSlot } from '@/app/(dashboard)/timetable/actions';
import { EmptyState } from '@/components/States';
import { addMinutes, DAY_NAMES, DAY_SHORT, hm, slotProblem, subjectsFor, weekGrid, type SlotInput } from '@/lib/timetable';
import type { StaffMember, Structure, TimetableSlot } from '@/lib/types';

export interface TimetableView {
  kind: 'class' | 'teacher';
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
  const grid = useMemo(() => weekGrid(slots), [slots]);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const base: Partial<SlotInput> = view.kind === 'class' ? { sectionId: view.id } : { teacherId: view.id };
  const hours = slots.reduce((m, s) => m + minutes(s.endsAt) - minutes(s.startsAt), 0);

  const add = (draft: Partial<SlotInput> = {}) => setEditing({ draft: { ...base, ...draft } });

  return (
    <>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 2, mb: 2 }}>
        <Box>
          <Typography variant="h6" component="h2" sx={{ fontSize: '1.125rem' }} data-testid="timetable-title">
            {view.name}
          </Typography>
          <Typography variant="body2" color="text.secondary" data-testid="timetable-summary">
            {slots.length} period{slots.length === 1 ? '' : 's'} a week{hours ? ` · ${formatHours(hours)} of teaching` : ''}
          </Typography>
        </Box>
        <Button variant="contained" startIcon={<Add />} onClick={() => add()}>
          Add period
        </Button>
      </Box>

      {slots.length === 0 ? (
        <EmptyState icon={<CalendarMonthOutlined />} title={view.kind === 'class' ? 'No periods for this class yet' : 'No periods for this teacher yet'} testId="no-periods" actions={<Button variant="outlined" startIcon={<Add />} onClick={() => add()}>Add period</Button>}>
          Add the week&apos;s periods: subject, teacher, room, day and time. The board, the apps and attendance follow the timetable.
        </EmptyState>
      ) : (
        <Box
          data-testid="timetable-grid"
          sx={{ border: 1, borderColor: 'm3.outlineVariant', borderRadius: '12px', overflowX: 'auto' }}
        >
          <Box
            role="table"
            aria-label={`Timetable for ${view.name}`}
            sx={{ display: 'grid', gridTemplateColumns: `72px repeat(${grid.columns.length}, minmax(132px, 1fr))`, minWidth: 72 + grid.columns.length * 132 }}
          >
            <Box role="row" sx={{ display: 'contents' }}>
              <Box role="columnheader" sx={headSx} />
              {grid.columns.map((c) => (
                <Box key={c.key} role="columnheader" sx={{ ...headSx, textAlign: 'center' }}>
                  <Typography variant="subtitle2" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                    {c.startsAt}–{c.endsAt}
                  </Typography>
                </Box>
              ))}
            </Box>
            {grid.rows.map((r) => (
              <Box key={r.day} role="row" sx={{ display: 'contents' }} data-testid={`day-${r.day}`}>
                <Box role="rowheader" sx={{ ...cellSx, display: 'flex', alignItems: 'center', bgcolor: 'm3.surfaceContainerLow' }}>
                  <Typography variant="subtitle2">{DAY_SHORT[r.day]}</Typography>
                </Box>
                {grid.columns.map((c) => {
                  const here = r.cells[c.key] ?? [];
                  return (
                    <Box key={c.key} role="cell" sx={{ ...cellSx, display: 'grid', gap: 0.5, '&:hover .kx-add': { opacity: 1 } }}>
                      {here.map((s) => (
                        <SlotCard key={s.id} slot={s} view={view} onClick={() => setEditing({ slot: s })} />
                      ))}
                      {here.length === 0 && (
                        <IconButton
                          className="kx-add"
                          size="small"
                          aria-label={`Add a period on ${DAY_NAMES[r.day]} at ${c.startsAt}`}
                          onClick={() => add({ dayOfWeek: r.day, startsAt: c.startsAt, endsAt: c.endsAt })}
                          sx={{ justifySelf: 'center', alignSelf: 'center', opacity: 0.35, '&:focus-visible': { opacity: 1 }, color: 'text.secondary' }}
                        >
                          <Add fontSize="small" />
                        </IconButton>
                      )}
                    </Box>
                  );
                })}
              </Box>
            ))}
          </Box>
        </Box>
      )}
      <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 1.5 }}>
        Changes apply from the next class. Attendance and recordings already taken stay with the period as it was.
      </Typography>

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

const headSx = { px: 1.5, py: 1.25, bgcolor: 'm3.surfaceContainerLow', borderBottom: 1, borderColor: 'm3.outlineVariant' } as const;
const cellSx = { p: 0.75, minHeight: 76, borderBottom: 1, borderLeft: 1, borderColor: 'm3.outlineVariant', '&:first-of-type': { borderLeft: 0 } } as const;

const minutes = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};
const formatHours = (m: number) => (m % 60 === 0 ? `${m / 60} h` : `${Math.floor(m / 60)} h ${m % 60} min`);

function SlotCard({ slot, view, onClick }: { slot: TimetableSlot; view: TimetableView; onClick: () => void }) {
  const who = view.kind === 'class' ? slot.teacher.fullName : slot.section.displayName;
  return (
    <ButtonBase
      onClick={onClick}
      data-testid="slot"
      aria-label={`${slot.subject.name}, ${who}, ${DAY_NAMES[slot.dayOfWeek]} ${hm(slot.startsAt)}–${hm(slot.endsAt)}. Change`}
      sx={{
        display: 'block',
        textAlign: 'left',
        width: '100%',
        height: '100%',
        borderRadius: '8px',
        px: 1.25,
        py: 1,
        bgcolor: 'm3.secondaryContainer',
        color: 'm3.onSecondaryContainer',
        borderLeft: 3,
        borderColor: 'primary.main',
        '&:hover': { bgcolor: 'm3.primaryContainer', color: 'm3.onPrimaryContainer' },
        '&:focus-visible': { outline: 2, outlineColor: 'primary.main', outlineStyle: 'solid' },
      }}
    >
      <Typography variant="subtitle2" sx={{ lineHeight: '18px', fontSize: '0.8125rem' }}>
        {slot.subject.name}
      </Typography>
      <Typography variant="caption" component="p" sx={{ opacity: 0.85, lineHeight: '16px' }} noWrap>
        {who}
      </Typography>
      {slot.room && (
        <Typography variant="caption" component="p" sx={{ opacity: 0.7, lineHeight: '16px' }} noWrap>
          {slot.room}
        </Typography>
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
  const [error, setError] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [pending, start] = useTransition();

  const input: SlotInput = { sectionId, subjectId, teacherId, roomId: roomId || null, dayOfWeek: day, startsAt, endsAt };
  const problem = slotProblem(input);
  const subjectName = subjects.find((s) => s.id === subjectId)?.name ?? 'the period';
  const when = `${DAY_NAMES[day]} ${startsAt}–${endsAt}`;

  const save = () => {
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    start(async () => {
      const res = existing ? await changeSlot(existing.id, input) : await addSlot(input);
      if (res.ok) onClose(existing ? `Changed ${subjectName} to ${when}` : `Added ${subjectName} on ${when}`);
      else setError(res.error);
    });
  };

  const remove = () =>
    start(async () => {
      const res = await removeSlot(existing!.id);
      if (res.ok) onClose(`Removed ${existing!.subject.name} on ${DAY_NAMES[existing!.dayOfWeek]} ${hm(existing!.startsAt)}`);
      else {
        setConfirmRemove(false);
        setError(res.error);
      }
    });

  if (confirmRemove && existing)
    return (
      <Dialog open onClose={pending ? undefined : () => setConfirmRemove(false)} maxWidth="xs" fullWidth aria-labelledby="remove-period-title">
        <DialogTitle id="remove-period-title">Remove this period?</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            <strong>{existing.subject.name}</strong> for {existing.section.displayName} with {existing.teacher.fullName} on {DAY_NAMES[existing.dayOfWeek]} at {hm(existing.startsAt)} stops from the next class. Attendance already taken is kept.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmRemove(false)} disabled={pending}>
            Keep it
          </Button>
          <Button variant="contained" color="error" onClick={remove} disabled={pending} startIcon={pending ? <CircularProgress size={16} color="inherit" /> : undefined}>
            Remove period
          </Button>
        </DialogActions>
      </Dialog>
    );

  return (
    <Dialog open onClose={pending ? undefined : () => onClose()} maxWidth="sm" fullWidth aria-labelledby="period-title">
      <Box
        component="form"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <DialogTitle id="period-title">{existing ? 'Change period' : 'Add a period'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2.5} sx={{ pt: 1 }}>
            {error && (
              <Alert severity="error" data-testid="period-error">
                {error}
              </Alert>
            )}
            <TextField
              select
              label="Class"
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
            </TextField>
            <TextField
              select
              label="Subject"
              value={classSubjects.some((s) => s.id === subjectId) ? subjectId : ''}
              onChange={(e) => setSubjectId(e.target.value)}
              required
              disabled={!sectionId}
              helperText={sectionId && classSubjects.length === 0 ? 'This class has no subjects for its term yet.' : ' '}
            >
              {classSubjects.map((s) => (
                <MenuItem key={s.id} value={s.id}>
                  {s.name}
                  <Typography component="span" variant="body2" color="text.secondary" sx={{ ml: 1 }}>
                    {s.code}
                  </Typography>
                </MenuItem>
              ))}
            </TextField>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
              <TextField select label="Teacher" value={teacherId} onChange={(e) => setTeacherId(e.target.value)} required>
                {staff.map((p) => (
                  <MenuItem key={p.id} value={p.id}>
                    {p.fullName}
                  </MenuItem>
                ))}
              </TextField>
              <TextField select label="Room" value={roomId} onChange={(e) => setRoomId(e.target.value)} slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}>
                <MenuItem value="">
                  <Typography component="span" color="text.secondary">
                    No room
                  </Typography>
                </MenuItem>
                {rooms.map((r) => (
                  <MenuItem key={r.id} value={r.id}>
                    {r.name}
                  </MenuItem>
                ))}
              </TextField>
            </Box>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: '1.4fr 1fr 1fr' }, gap: 2 }}>
              <TextField select label="Day" value={day} onChange={(e) => setDay(Number(e.target.value))} required sx={{ gridColumn: { xs: '1 / -1', sm: 'auto' } }}>
                {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                  <MenuItem key={n} value={n}>
                    {DAY_NAMES[n]}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                label="Starts"
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
              <TextField
                label="Ends"
                type="time"
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
                required
                error={!!startsAt && !!endsAt && endsAt <= startsAt}
                slotProps={{ inputLabel: { shrink: true }, htmlInput: { step: 300 } }}
              />
            </Box>
            {existing && (
              <Typography variant="caption" color="text.secondary">
                Saving replaces this period from the next class; attendance already taken stays with the old one.
              </Typography>
            )}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ justifyContent: existing ? 'space-between' : 'flex-end' }}>
          {existing && (
            <Button color="error" startIcon={<DeleteOutline />} onClick={() => setConfirmRemove(true)} disabled={pending}>
              Remove
            </Button>
          )}
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button onClick={() => onClose()} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" variant="contained" disabled={pending || !!problem} startIcon={pending ? <CircularProgress size={16} color="inherit" /> : undefined}>
              {existing ? 'Save' : 'Add period'}
            </Button>
          </Box>
        </DialogActions>
      </Box>
    </Dialog>
  );
}
