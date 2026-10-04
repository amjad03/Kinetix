'use client';

import Add from '@mui/icons-material/Add';
import BeachAccessOutlined from '@mui/icons-material/BeachAccessOutlined';
import Check from '@mui/icons-material/Check';
import ChevronLeft from '@mui/icons-material/ChevronLeft';
import ChevronRight from '@mui/icons-material/ChevronRight';
import DeleteOutlined from '@mui/icons-material/DeleteOutlined';
import EditOutlined from '@mui/icons-material/EditOutlined';
import EventNoteOutlined from '@mui/icons-material/EventNoteOutlined';
import EventOutlined from '@mui/icons-material/EventOutlined';
import QuizOutlined from '@mui/icons-material/QuizOutlined';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
import Checkbox from '@mui/material/Checkbox';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormHelperText from '@mui/material/FormHelperText';
import IconButton from '@mui/material/IconButton';
import InputLabel from '@mui/material/InputLabel';
import LinearProgress from '@mui/material/LinearProgress';
import ListItemText from '@mui/material/ListItemText';
import MenuItem from '@mui/material/MenuItem';
import Radio from '@mui/material/Radio';
import RadioGroup from '@mui/material/RadioGroup';
import Select from '@mui/material/Select';
import Snackbar from '@mui/material/Snackbar';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { usePathname, useRouter } from 'next/navigation';
import { useMemo, useState, useTransition, type ReactNode } from 'react';
import { createCalendarEvent, deleteCalendarEvent, updateCalendarEvent } from '@/app/(dashboard)/calendar/actions';
import { PageHeader, SectionTitle } from '@/components/PageHeader';
import { EmptyState } from '@/components/States';
import { useI18n } from '@/i18n/client';
import {
  addMonths,
  CALENDAR_KINDS,
  calendarProblem,
  eventDays,
  eventsInMonth,
  eventsOn,
  groupByMonth,
  monthGrid,
  type CalendarEvent,
  type CalendarInput,
  type CalendarKind,
} from '@/lib/calendar';
import { weekdayShort } from '@/lib/dates';

const KIND_COLORS: Record<CalendarKind, { bg: string; fg: string; dot: string }> = {
  holiday: { bg: 'm3.tertiaryContainer', fg: 'm3.onTertiaryContainer', dot: 'm3.tertiary' },
  exam: { bg: 'm3.errorContainer', fg: 'm3.onErrorContainer', dot: 'error.main' },
  event: { bg: 'm3.primaryContainer', fg: 'm3.onPrimaryContainer', dot: 'primary.main' },
};

const KIND_ICON: Record<CalendarKind, ReactNode> = {
  holiday: <BeachAccessOutlined />,
  exam: <QuizOutlined />,
  event: <EventOutlined />,
};

export interface ProgramOption {
  id: string;
  name: string;
}

type Open = { kind: 'add'; date?: string } | { kind: 'edit'; event: CalendarEvent } | { kind: 'delete'; event: CalendarEvent } | null;

export function CalendarView({
  month,
  view,
  today,
  events,
  canEdit,
  programs,
}: {
  month: string;
  view: 'month' | 'list';
  today: string;
  events: CalendarEvent[];
  canEdit: boolean;
  programs: ProgramOption[];
}) {
  const { t, fmt } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState<Open>(null);
  const [toast, setToast] = useState<string | null>(null);

  const go = (m: string, v = view) => {
    const q = new URLSearchParams();
    if (m !== today.slice(0, 7)) q.set('month', m);
    if (v === 'list') q.set('view', 'list');
    const s = q.toString();
    start(() => router.push(s ? `${pathname}?${s}` : pathname, { scroll: false }));
  };
  const close = (message?: string) => {
    setOpen(null);
    if (message) setToast(message);
  };
  const onEdit = canEdit ? (e: CalendarEvent) => setOpen({ kind: 'edit', event: e }) : undefined;
  const onDelete = canEdit ? (e: CalendarEvent) => setOpen({ kind: 'delete', event: e }) : undefined;
  const monthLabel = fmt.month(`${month}-01`);

  return (
    <>
      {pending && <LinearProgress sx={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 2000, height: 3, borderRadius: 0 }} aria-label={t('common.loading')} />}
      <PageHeader
        title={t('nav.calendar')}
        subtitle={canEdit ? t('cal.subtitle') : t('cal.subtitleReadOnly')}
        actions={
          canEdit && (
            <Button variant="contained" startIcon={<Add />} onClick={() => setOpen({ kind: 'add' })} data-testid="calendar-add">
              {t('cal.add')}
            </Button>
          )
        }
      />

      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1, mb: 2 }}>
        <Tooltip title={t('cal.prevMonth')}>
          <IconButton onClick={() => go(addMonths(month, -1))} aria-label={t('cal.prevMonth')} data-testid="calendar-prev">
            <ChevronLeft />
          </IconButton>
        </Tooltip>
        <Typography variant="h5" component="h2" sx={{ minWidth: { sm: 200 }, textAlign: 'center', fontSize: '1.375rem' }} data-testid="calendar-month">
          {monthLabel}
        </Typography>
        <Tooltip title={t('cal.nextMonth')}>
          <IconButton onClick={() => go(addMonths(month, 1))} aria-label={t('cal.nextMonth')} data-testid="calendar-next">
            <ChevronRight />
          </IconButton>
        </Tooltip>
        <Button variant="outlined" size="small" onClick={() => go(today.slice(0, 7))} disabled={month === today.slice(0, 7)} sx={{ ml: 1 }}>
          {t('cal.thisMonth')}
        </Button>
        <Box sx={{ flex: 1 }} />
        <Legend />
        <ToggleButtonGroup exclusive size="small" value={view} onChange={(_, v: 'month' | 'list' | null) => v && go(month, v)} aria-label={t('cal.view')}>
          {(['month', 'list'] as const).map((v) => (
            <ToggleButton key={v} value={v} sx={{ gap: 0.75, px: 2 }} data-testid={`calendar-view-${v}`}>
              {view === v && <Check sx={{ fontSize: 18 }} />}
              {t(`cal.view.${v}`)}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      </Box>

      {view === 'month' ? (
        <>
          <MonthGrid month={month} today={today} events={events} onOpen={onEdit} onAdd={canEdit ? (date) => setOpen({ kind: 'add', date }) : undefined} />
          <SectionTitle>{t('cal.inMonth', { month: monthLabel })}</SectionTitle>
          {eventsInMonth(month, events).length === 0 ? (
            <EmptyState dense icon={<EventNoteOutlined />} title={t('cal.nothingInMonth', { month: monthLabel })} testId="calendar-empty">
              {t('cal.nothingInMonthBody')}
            </EmptyState>
          ) : (
            <EntryList events={eventsInMonth(month, events)} today={today} onEdit={onEdit} onDelete={onDelete} />
          )}
        </>
      ) : events.length === 0 ? (
        <EmptyState icon={<EventNoteOutlined />} title={t('cal.nothingAhead')} testId="calendar-empty">
          {t('cal.nothingAheadBody')}
        </EmptyState>
      ) : (
        groupByMonth(events).map(([m, list]) => (
          <Box key={m} component="section" aria-labelledby={`m-${m}`}>
            <SectionTitle id={`m-${m}`}>{fmt.month(`${m}-01`)}</SectionTitle>
            <EntryList events={list} today={today} onEdit={onEdit} onDelete={onDelete} />
          </Box>
        ))
      )}

      {(open?.kind === 'add' || open?.kind === 'edit') && (
        <EventDialog event={open.kind === 'edit' ? open.event : undefined} date={open.kind === 'add' ? (open.date ?? today) : undefined} programs={programs} onClose={close} />
      )}
      {open?.kind === 'delete' && <DeleteDialog event={open.event} onClose={close} />}
      <Snackbar open={!!toast} autoHideDuration={4000} onClose={() => setToast(null)} message={toast} />
    </>
  );
}

function Legend() {
  const { t } = useI18n();
  return (
    <Box sx={{ display: { xs: 'none', md: 'flex' }, alignItems: 'center', gap: 1.5, mr: 1, color: 'text.secondary' }} aria-label={t('cal.legend')}>
      {CALENDAR_KINDS.map((k) => (
        <Box key={k} sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
          <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: KIND_COLORS[k].dot }} />
          <Typography variant="caption" sx={{ fontSize: '0.8125rem' }}>
            {t(`cal.kind.${k}`)}
          </Typography>
        </Box>
      ))}
    </Box>
  );
}

const MAX_CHIPS = 3;

function MonthGrid({ month, today, events, onOpen, onAdd }: { month: string; today: string; events: CalendarEvent[]; onOpen?: (e: CalendarEvent) => void; onAdd?: (date: string) => void }) {
  const { t, locale } = useI18n();
  const weeks = useMemo(() => monthGrid(month), [month]);
  return (
    <Box sx={{ border: 1, borderColor: 'm3.outlineVariant', borderRadius: '12px', overflowX: 'auto' }} data-testid="calendar-grid">
      <Box role="grid" aria-label={month} sx={{ minWidth: 640 }}>
        <Box role="row" sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', bgcolor: 'm3.surfaceContainerLow', borderBottom: 1, borderColor: 'm3.outlineVariant' }}>
          {weeks[0].map((d) => (
            <Typography key={d.date} role="columnheader" variant="caption" sx={{ px: 1.25, py: 1, color: 'text.secondary', fontWeight: 500, fontSize: '0.8125rem' }}>
              {weekdayShort(d.date, locale)}
            </Typography>
          ))}
        </Box>
        {weeks.map((week, wi) => (
          <Box key={week[0].date} role="row" sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: wi === weeks.length - 1 ? 0 : 1, borderColor: 'm3.outlineVariant' }}>
            {week.map((d, di) => {
              const list = eventsOn(d.date, events);
              const isToday = d.date === today;
              const holiday = list.some((e) => e.kind === 'holiday');
              return (
                <Box
                  key={d.date}
                  role="gridcell"
                  data-date={d.date}
                  data-testid="calendar-day"
                  aria-current={isToday ? 'date' : undefined}
                  sx={{
                    minHeight: 112,
                    p: 0.75,
                    borderRight: di === 6 ? 0 : 1,
                    borderColor: 'm3.outlineVariant',
                    bgcolor: holiday && d.inMonth ? 'kx.tonal' : 'transparent',
                    opacity: d.inMonth ? 1 : 0.55,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 0.5,
                    minWidth: 0,
                  }}
                >
                  <ButtonBase
                    onClick={onAdd ? () => onAdd(d.date) : undefined}
                    disabled={!onAdd}
                    aria-label={onAdd ? `${t('cal.add')}: ${d.date}` : undefined}
                    sx={{
                      alignSelf: 'flex-start',
                      width: 28,
                      height: 28,
                      borderRadius: '50%',
                      fontSize: '0.8125rem',
                      fontWeight: isToday ? 700 : 500,
                      fontVariantNumeric: 'tabular-nums',
                      bgcolor: isToday ? 'primary.main' : 'transparent',
                      color: isToday ? 'primary.contrastText' : 'text.primary',
                      '&:hover': onAdd && !isToday ? { bgcolor: 'action.hover' } : undefined,
                    }}
                  >
                    {Number(d.date.slice(8))}
                  </ButtonBase>
                  {list.slice(0, MAX_CHIPS).map((e) => (
                    <EventChip key={e.id} e={e} onOpen={onOpen} />
                  ))}
                  {list.length > MAX_CHIPS && (
                    <Typography variant="caption" color="text.secondary" sx={{ pl: 0.75 }}>
                      {t('cal.more', { n: list.length - MAX_CHIPS })}
                    </Typography>
                  )}
                </Box>
              );
            })}
          </Box>
        ))}
      </Box>
    </Box>
  );
}

function EventChip({ e, onOpen }: { e: CalendarEvent; onOpen?: (e: CalendarEvent) => void }) {
  const { t } = useI18n();
  const c = KIND_COLORS[e.kind];
  return (
    <ButtonBase
      onClick={onOpen ? () => onOpen(e) : undefined}
      disabled={!onOpen}
      title={`${t(`cal.kind.${e.kind}`)} · ${e.title}`}
      data-testid="calendar-chip"
      data-kind={e.kind}
      sx={{
        justifyContent: 'flex-start',
        width: '100%',
        px: 0.75,
        py: 0.25,
        borderRadius: '6px',
        bgcolor: c.bg,
        color: c.fg,
        fontSize: '0.75rem',
        lineHeight: '18px',
        fontWeight: 500,
        textAlign: 'left',
        overflow: 'hidden',
        whiteSpace: 'nowrap',
        textOverflow: 'ellipsis',
        display: 'block',
      }}
    >
      {e.title}
    </ButtonBase>
  );
}

function EntryList({ events, today, onEdit, onDelete }: { events: CalendarEvent[]; today: string; onEdit?: (e: CalendarEvent) => void; onDelete?: (e: CalendarEvent) => void }) {
  const { t, fmt } = useI18n();
  return (
    <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, border: 1, borderColor: 'm3.outlineVariant', borderRadius: '12px', overflow: 'hidden' }} data-testid="calendar-list">
      {events.map((e, i) => {
        const c = KIND_COLORS[e.kind];
        const days = eventDays(e);
        const past = e.endsOn < today;
        return (
          <Box
            component="li"
            key={e.id}
            data-testid="calendar-entry"
            data-kind={e.kind}
            sx={{ display: 'flex', alignItems: 'center', gap: 2, px: 2, py: 1.5, borderTop: i === 0 ? 0 : 1, borderColor: 'm3.outlineVariant', opacity: past ? 0.7 : 1 }}
          >
            <Box sx={{ width: 40, height: 40, borderRadius: '50%', display: 'grid', placeItems: 'center', bgcolor: c.bg, color: c.fg, flexShrink: 0, '& svg': { fontSize: 22 } }}>
              {KIND_ICON[e.kind]}
            </Box>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="subtitle1" component="p" sx={{ lineHeight: '24px' }}>
                {e.title}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {t(`cal.kind.${e.kind}`)} · {days === 1 ? fmt.date(e.startsOn, 'short') : t('cal.range', { from: fmt.date(e.startsOn, 'short'), to: fmt.date(e.endsOn, 'short') })}
                {days > 1 && ` · ${t.plural('cal.days', days)}`}
                {' · '}
                {e.programs?.length ? t('cal.forPrograms', { programs: e.programs.join(', ') }) : t('cal.forAll')}
              </Typography>
            </Box>
            {onEdit && (
              <Tooltip title={t('common.edit')}>
                <IconButton onClick={() => onEdit(e)} aria-label={t('cal.editEntry', { title: e.title })}>
                  <EditOutlined />
                </IconButton>
              </Tooltip>
            )}
            {onDelete && (
              <Tooltip title={t('common.delete')}>
                <IconButton onClick={() => onDelete(e)} aria-label={t('cal.deleteEntry', { title: e.title })}>
                  <DeleteOutlined />
                </IconButton>
              </Tooltip>
            )}
          </Box>
        );
      })}
    </Box>
  );
}

function EventDialog({ event, date, programs, onClose }: { event?: CalendarEvent; date?: string; programs: ProgramOption[]; onClose: (message?: string) => void }) {
  const { t } = useI18n();
  const [kind, setKind] = useState<CalendarKind>(event?.kind ?? 'holiday');
  const [title, setTitle] = useState(event?.title ?? '');
  const [startsOn, setStartsOn] = useState(event?.startsOn ?? date ?? '');
  const [endsOn, setEndsOn] = useState(event?.endsOn ?? date ?? '');
  const [scope, setScope] = useState<'all' | 'some'>(event?.programIds?.length ? 'some' : 'all');
  const [programIds, setProgramIds] = useState<string[]>(event?.programIds ?? []);
  const [notify, setNotify] = useState(true);
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const input: CalendarInput = { kind, title, startsOn, endsOn, programIds: scope === 'all' ? null : programIds, notify };
  const problem = calendarProblem(input);
  const show = (p: ReturnType<typeof calendarProblem>[]) => (touched && problem && p.includes(problem) ? t(`cal.problem.${problem}`) : undefined);
  const names = new Map(programs.map((p) => [p.id, p.name]));

  const submit = () => {
    setTouched(true);
    if (problem) return;
    setError(null);
    start(async () => {
      const res = event ? await updateCalendarEvent(event.id, input) : await createCalendarEvent(input);
      if (res.ok) onClose(event ? t('cal.saved', { title: title.trim() }) : t('cal.added', { title: title.trim() }));
      else setError(res.error);
    });
  };

  return (
    <Dialog open onClose={() => !pending && onClose()} maxWidth="sm" fullWidth aria-labelledby="cal-dialog-title">
      <DialogTitle id="cal-dialog-title">{event ? t('cal.dialog.edit') : t('cal.dialog.add')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2.5} sx={{ pt: 1 }}>
          {error && (
            <Alert severity="error" role="alert">
              {error}
            </Alert>
          )}
          <Box>
            <Typography variant="body2" color="text.secondary" id="cal-kind" sx={{ mb: 0.75 }}>
              {t('cal.dialog.kind')}
            </Typography>
            <ToggleButtonGroup exclusive value={kind} onChange={(_, v: CalendarKind | null) => v && setKind(v)} aria-labelledby="cal-kind" size="small" sx={{ flexWrap: 'wrap' }}>
              {CALENDAR_KINDS.map((k) => (
                <ToggleButton key={k} value={k} sx={{ gap: 0.75, px: 2 }} data-testid={`calendar-kind-${k}`}>
                  {kind === k && <Check sx={{ fontSize: 18 }} />}
                  {t(`cal.kind.${k}`)}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
          </Box>
          <TextField
            label={t('cal.dialog.title')}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            autoFocus
            error={!!show(['title', 'titleLong'])}
            helperText={show(['title', 'titleLong']) ?? t('cal.dialog.titleHelp')}
            slotProps={{ htmlInput: { maxLength: 200, 'data-testid': 'calendar-title' } }}
          />
          <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}>
            <TextField
              type="date"
              label={t('cal.dialog.startsOn')}
              value={startsOn}
              onChange={(e) => {
                const v = e.target.value;
                setStartsOn(v);
                if (!endsOn || endsOn < v) setEndsOn(v);
              }}
              required
              error={!!show(['startsOn'])}
              helperText={show(['startsOn']) ?? ' '}
              slotProps={{ inputLabel: { shrink: true }, htmlInput: { 'data-testid': 'calendar-starts' } }}
            />
            <TextField
              type="date"
              label={t('cal.dialog.endsOn')}
              value={endsOn}
              onChange={(e) => setEndsOn(e.target.value)}
              required
              error={!!show(['endsOn', 'range'])}
              helperText={show(['endsOn', 'range']) ?? ' '}
              slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: startsOn || undefined, 'data-testid': 'calendar-ends' } }}
            />
          </Box>
          <FormControl>
            <Typography variant="body2" color="text.secondary" id="cal-who">
              {t('cal.dialog.who')}
            </Typography>
            <RadioGroup row aria-labelledby="cal-who" value={scope} onChange={(e) => setScope(e.target.value as 'all' | 'some')}>
              <FormControlLabel value="all" control={<Radio />} label={t('cal.dialog.everyone')} />
              <FormControlLabel value="some" control={<Radio />} label={t('cal.dialog.some')} disabled={programs.length === 0} />
            </RadioGroup>
          </FormControl>
          {scope === 'some' && (
            <FormControl error={!!show(['programs'])}>
              <InputLabel id="cal-programs">{t('cal.dialog.programs')}</InputLabel>
              <Select
                labelId="cal-programs"
                label={t('cal.dialog.programs')}
                multiple
                value={programIds}
                onChange={(e) => setProgramIds(typeof e.target.value === 'string' ? e.target.value.split(',') : e.target.value)}
                renderValue={(ids) => ids.map((id) => names.get(id) ?? id).join(', ')}
                data-testid="calendar-programs"
              >
                {programs.map((p) => (
                  <MenuItem key={p.id} value={p.id}>
                    <Checkbox checked={programIds.includes(p.id)} size="small" sx={{ py: 0 }} />
                    <ListItemText primary={p.name} />
                  </MenuItem>
                ))}
              </Select>
              {show(['programs']) && <FormHelperText>{show(['programs'])}</FormHelperText>}
            </FormControl>
          )}
          {kind === 'holiday' && (
            <Typography variant="body2" color="text.secondary">
              {t('cal.dialog.holidayHelp')}
            </Typography>
          )}
          <Box>
            <FormControlLabel
              control={<Checkbox checked={notify} onChange={(e) => setNotify(e.target.checked)} data-testid="calendar-notify" />}
              label={t('cal.dialog.notify')}
            />
            <Typography variant="caption" color="text.secondary" component="p" sx={{ ml: 4 }}>
              {t('cal.dialog.notifyHelp')}
            </Typography>
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => onClose()} disabled={pending}>
          {t('common.cancel')}
        </Button>
        <Button variant="contained" onClick={submit} disabled={pending} data-testid="calendar-submit">
          {pending ? <CircularProgress size={20} color="inherit" aria-label={t('common.saving')} /> : event ? t('cal.dialog.edit.submit') : t('cal.dialog.add.submit')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function DeleteDialog({ event, onClose }: { event: CalendarEvent; onClose: (message?: string) => void }) {
  const { t } = useI18n();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <Dialog open onClose={() => !pending && onClose()} maxWidth="xs" fullWidth aria-labelledby="cal-delete-title">
      <DialogTitle id="cal-delete-title">{t('cal.delete.title', { title: event.title })}</DialogTitle>
      <DialogContent>
        {error && (
          <Alert severity="error" role="alert" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        <DialogContentText>{t('cal.delete.body')}</DialogContentText>
        {event.kind === 'holiday' && <DialogContentText sx={{ mt: 1.5 }}>{t('cal.delete.holidayBody')}</DialogContentText>}
      </DialogContent>
      <DialogActions>
        <Button onClick={() => onClose()} disabled={pending}>
          {t('common.cancel')}
        </Button>
        <Button
          variant="contained"
          color="error"
          disabled={pending}
          data-testid="calendar-delete-confirm"
          onClick={() =>
            start(async () => {
              const res = await deleteCalendarEvent(event.id);
              if (res.ok) onClose(t('cal.deleted', { title: event.title }));
              else setError(res.error);
            })
          }
        >
          {t('cal.delete.confirm')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
