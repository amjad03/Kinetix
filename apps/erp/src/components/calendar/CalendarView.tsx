'use client';
import { usePathname, useRouter } from 'next/navigation';
import { useMemo, useState, useTransition, type ReactNode } from 'react';
import { FormField, TextInput } from '@/components/ui';
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

import { Alert, Button, ButtonBase, Checkbox, CircularProgress, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, FormControl, FormControlLabel, FormHelperText, IconButton, InputLabel, LinearProgress, ListItemText, MenuItem, Radio, RadioGroup, Select, Snackbar, ToggleButton, ToggleButtonGroup, Tooltip } from '@/components/kx';
import { Calendar as EventOutlined, Check, ChevronLeft, ChevronRight, FileQuestion as QuizOutlined, NotebookText as EventNoteOutlined, Pencil as EditOutlined, Plus as Add, Trash2 as DeleteOutlined, Umbrella as BeachAccessOutlined } from 'lucide-react';
import { cn } from '@/lib/utils';
import { pal } from '@/lib/sx';
const KIND_COLORS: Record<CalendarKind, { bg: string; fg: string; dot: string }> = {
  holiday: { bg: 'kx.warningContainer', fg: 'kx.onWarningContainer', dot: 'kx.warning' },
  exam: { bg: 'm3.errorContainer', fg: 'm3.onErrorContainer', dot: 'm3.error' },
  event: { bg: 'm3.primaryContainer', fg: 'm3.onPrimaryContainer', dot: 'm3.primary' },
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
      {pending && <LinearProgress className="fixed top-0 left-0 right-0 z-[2000] h-[3px] rounded-none" aria-label={t('common.loading')} />}
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

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <Tooltip title={t('cal.prevMonth')}>
          <IconButton onClick={() => go(addMonths(month, -1))} aria-label={t('cal.prevMonth')} data-testid="calendar-prev">
            <ChevronLeft />
          </IconButton>
        </Tooltip>
        <h2 className="sm:min-w-[200px] text-center text-[1.375rem]" data-testid="calendar-month">
          {monthLabel}
        </h2>
        <Tooltip title={t('cal.nextMonth')}>
          <IconButton onClick={() => go(addMonths(month, 1))} aria-label={t('cal.nextMonth')} data-testid="calendar-next">
            <ChevronRight />
          </IconButton>
        </Tooltip>
        <Button className="ml-2" variant="outlined" onClick={() => go(today.slice(0, 7))} disabled={month === today.slice(0, 7)}>
          {t('cal.thisMonth')}
        </Button>
        <div className="flex-1" />
        <Legend />
        <ToggleButtonGroup exclusive size="small" value={view} onChange={(_, v: 'month' | 'list' | null) => v && go(month, v)} aria-label={t('cal.view')}>
          {(['month', 'list'] as const).map((v) => (
            <ToggleButton className="gap-1.5 px-4" key={v} value={v} data-testid={`calendar-view-${v}`}>
              {view === v && <Check className="text-[18px]" />}
              {t(`cal.view.${v}`)}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      </div>

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
          <section key={m} aria-labelledby={`m-${m}`}>
            <SectionTitle id={`m-${m}`}>{fmt.month(`${m}-01`)}</SectionTitle>
            <EntryList events={list} today={today} onEdit={onEdit} onDelete={onDelete} />
          </section>
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
    <div className="hidden md:flex items-center gap-3 mr-2 text-muted-foreground" aria-label={t('cal.legend')}>
      {CALENDAR_KINDS.map((k) => (
        <div className="inline-flex items-center gap-1" key={k}>
          <div className="w-[10px] h-[10px] rounded-full" style={{ backgroundColor: pal(KIND_COLORS[k].dot) }} />
          <span className="tracking-[0.3px] text-[0.8125rem]">
            {t(`cal.kind.${k}`)}
          </span>
        </div>
      ))}
    </div>
  );
}

const MAX_CHIPS = 3;

function MonthGrid({ month, today, events, onOpen, onAdd }: { month: string; today: string; events: CalendarEvent[]; onOpen?: (e: CalendarEvent) => void; onAdd?: (date: string) => void }) {
  const { t, locale } = useI18n();
  const weeks = useMemo(() => monthGrid(month), [month]);
  return (
    <div className="border border-border rounded-[12px] overflow-x-auto" data-testid="calendar-grid">
      <div className="min-w-[640px]" role="grid" aria-label={month}>
        <div className="grid grid-cols-[repeat(7,1fr)] bg-muted border-b border-border" role="row">
          {weeks[0].map((d) => (
            <span className="tracking-[0.3px] px-2.5 py-2 text-muted-foreground font-medium text-[0.8125rem]" key={d.date} role="columnheader">
              {weekdayShort(d.date, locale)}
            </span>
          ))}
        </div>
        {weeks.map((week, wi) => (
          <div className={cn('grid grid-cols-[repeat(7,1fr)] border-border', wi === weeks.length - 1 ? 'border-b-0' : 'border-b')} key={week[0].date} role="row">
            {week.map((d, di) => {
              const list = eventsOn(d.date, events);
              const isToday = d.date === today;
              const holiday = list.some((e) => e.kind === 'holiday');
              return (
                <div className={cn('min-h-[112px] p-1.5 border-border flex flex-col gap-1 min-w-0', di === 6 ? 'border-r-0' : 'border-r', holiday && d.inMonth ? 'bg-muted' : 'bg-transparent', d.inMonth ? 'opacity-[1]' : 'opacity-[0.55]')}
                  key={d.date}
                  role="gridcell"
                  data-date={d.date}
                  data-testid="calendar-day"
                  aria-current={isToday ? 'date' : undefined}
                >
                  <ButtonBase className={cn('self-start w-[28px] h-[28px] rounded-full text-[0.8125rem] tabular-nums', isToday ? 'font-bold' : 'font-medium', isToday ? 'bg-teal' : 'bg-transparent', isToday ? 'text-white' : 'text-foreground', onAdd && !isToday && 'hover:bg-accent')}
                    onClick={onAdd ? () => onAdd(d.date) : undefined}
                    disabled={!onAdd}
                    aria-label={onAdd ? `${t('cal.add')}: ${d.date}` : undefined}
                  >
                    {Number(d.date.slice(8))}
                  </ButtonBase>
                  {list.slice(0, MAX_CHIPS).map((e) => (
                    <EventChip key={e.id} e={e} onOpen={onOpen} />
                  ))}
                  {list.length > MAX_CHIPS && (
                    <span className="text-xs leading-4 tracking-[0.3px] text-muted-foreground pl-1.5">
                      {t('cal.more', { n: list.length - MAX_CHIPS })}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function EventChip({ e, onOpen }: { e: CalendarEvent; onOpen?: (e: CalendarEvent) => void }) {
  const { t } = useI18n();
  const c = KIND_COLORS[e.kind];
  return (
    <ButtonBase className="justify-start w-full px-1.5 py-0.5 rounded-[6px] text-[0.75rem] leading-[18px] font-medium text-left overflow-hidden whitespace-nowrap text-ellipsis block" style={{ backgroundColor: pal(c.bg), color: pal(c.fg) }}
      onClick={onOpen ? () => onOpen(e) : undefined}
      disabled={!onOpen}
      title={`${t(`cal.kind.${e.kind}`)} · ${e.title}`}
      data-testid="calendar-chip"
      data-kind={e.kind}
    >
      {e.title}
    </ButtonBase>
  );
}

function EntryList({ events, today, onEdit, onDelete }: { events: CalendarEvent[]; today: string; onEdit?: (e: CalendarEvent) => void; onDelete?: (e: CalendarEvent) => void }) {
  const { t, fmt } = useI18n();
  return (
    <ul className="list-none m-0 p-0 border border-border rounded-[12px] overflow-hidden" data-testid="calendar-list">
      {events.map((e, i) => {
        const c = KIND_COLORS[e.kind];
        const days = eventDays(e);
        const past = e.endsOn < today;
        return (
          <li className={cn('flex items-center gap-4 px-4 py-3 border-border', i === 0 ? 'border-t-0' : 'border-t', past ? 'opacity-[0.7]' : 'opacity-[1]')}
            key={e.id}
            data-testid="calendar-entry"
            data-kind={e.kind}
          >
            <div className="w-[40px] h-[40px] rounded-full grid place-items-center shrink-0 [&_svg]:text-[22px]" style={{ backgroundColor: pal(c.bg), color: pal(c.fg) }}>
              {KIND_ICON[e.kind]}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-base font-medium tracking-[0.1px] leading-[24px]">
                {e.title}
              </p>
              <p className="text-[13px] leading-[19px] text-muted-foreground">
                {t(`cal.kind.${e.kind}`)} · {days === 1 ? fmt.date(e.startsOn, 'short') : t('cal.range', { from: fmt.date(e.startsOn, 'short'), to: fmt.date(e.endsOn, 'short') })}
                {days > 1 && ` · ${t.plural('cal.days', days)}`}
                {' · '}
                {e.programs?.length ? t('cal.forPrograms', { programs: e.programs.join(', ') }) : t('cal.forAll')}
              </p>
            </div>
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
          </li>
        );
      })}
    </ul>
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
        <div className="flex flex-col gap-5 pt-2">
          {error && (
            <Alert severity="error" role="alert">
              {error}
            </Alert>
          )}
          <div>
            <p className="text-[13px] leading-[19px] text-muted-foreground mb-1.5" id="cal-kind">
              {t('cal.dialog.kind')}
            </p>
            <ToggleButtonGroup className="flex-wrap" exclusive value={kind} onChange={(_, v: CalendarKind | null) => v && setKind(v)} aria-labelledby="cal-kind" size="small">
              {CALENDAR_KINDS.map((k) => (
                <ToggleButton className="gap-1.5 px-4" key={k} value={k} data-testid={`calendar-kind-${k}`}>
                  {kind === k && <Check className="text-[18px]" />}
                  {t(`cal.kind.${k}`)}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
          </div>
          <FormField label={t('cal.dialog.title')} required>
            <TextInput
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              autoFocus
              error={!!show(['title', 'titleLong'])}
              helperText={show(['title', 'titleLong']) ?? t('cal.dialog.titleHelp')}
              slotProps={{ htmlInput: { maxLength: 200, 'data-testid': 'calendar-title' } }}
            />
          </FormField>
          <div className="grid gap-4 grid-cols-[1fr] sm:grid-cols-[1fr_1fr]">
            <FormField label={t('cal.dialog.startsOn')} required>
              <TextInput
                type="date"
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
            </FormField>
            <FormField label={t('cal.dialog.endsOn')} required>
              <TextInput
                type="date"
                value={endsOn}
                onChange={(e) => setEndsOn(e.target.value)}
                required
                error={!!show(['endsOn', 'range'])}
                helperText={show(['endsOn', 'range']) ?? ' '}
                slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: startsOn || undefined, 'data-testid': 'calendar-ends' } }}
              />
            </FormField>
          </div>
          <FormControl>
            <p className="text-[13px] leading-[19px] text-muted-foreground" id="cal-who">
              {t('cal.dialog.who')}
            </p>
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
                    <Checkbox className="py-0" checked={programIds.includes(p.id)} size="small" />
                    <ListItemText primary={p.name} />
                  </MenuItem>
                ))}
              </Select>
              {show(['programs']) && <FormHelperText>{show(['programs'])}</FormHelperText>}
            </FormControl>
          )}
          {kind === 'holiday' && (
            <p className="text-[13px] leading-[19px] text-muted-foreground">
              {t('cal.dialog.holidayHelp')}
            </p>
          )}
          <div>
            <FormControlLabel
              control={<Checkbox checked={notify} onChange={(e) => setNotify(e.target.checked)} data-testid="calendar-notify" />}
              label={t('cal.dialog.notify')}
            />
            <p className="text-xs leading-4 tracking-[0.3px] text-muted-foreground ml-8">
              {t('cal.dialog.notifyHelp')}
            </p>
          </div>
        </div>
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
          <Alert className="mb-4" severity="error" role="alert">
            {error}
          </Alert>
        )}
        <DialogContentText>{t('cal.delete.body')}</DialogContentText>
        {event.kind === 'holiday' && <DialogContentText className="mt-3">{t('cal.delete.holidayBody')}</DialogContentText>}
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
