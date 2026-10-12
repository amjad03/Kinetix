'use client';
import { useMemo, useState, useTransition } from 'react';
import { FormField, TextInput } from '@/components/ui';
import { sendBroadcast } from '@/app/(dashboard)/messages/actions';
import type { Priority, Structure } from '@/lib/types';
import { useI18n } from '@/i18n/client';
import { EXPIRY_OPTIONS, PRIORITIES, priorityKey } from './priorities';

import { Alert, Autocomplete, Button, ButtonBase, Card, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, MenuItem, Snackbar, Switch, ToggleButton, ToggleButtonGroup, Typography } from '@/components/kx';
import { CircleCheck as CheckCircle, OctagonAlert as ReportOutlined, Send } from 'lucide-react';
import { cn } from '@/lib/utils';
import { pal } from '@/lib/sx';
type Mode = 'all' | 'programs' | 'classes';

interface Option {
  id: string;
  label: string;
  group?: string;
}

export function ComposeMessage({ structure }: { structure: Structure }) {
  const { t } = useI18n();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [priority, setPriority] = useState<Priority>('info');
  const [mode, setMode] = useState<Mode>('all');
  const [programs, setPrograms] = useState<Option[]>([]);
  const [classes, setClasses] = useState<Option[]>([]);
  const [requiresAck, setRequiresAck] = useState(false);
  const [ttl, setTtl] = useState(60);
  const [touched, setTouched] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const programOptions = useMemo<Option[]>(
    () => structure.programs.map((p) => ({ id: p.id, label: p.name, group: p.level === 'pg' ? t('msg.group.pg') : p.level === 'ug' ? t('msg.group.ug') : p.level })),
    [structure.programs, t],
  );
  const programName = useMemo(() => new Map(structure.programs.map((p) => [p.id, p.name])), [structure.programs]);
  const classOptions = useMemo<Option[]>(
    () =>
      structure.sections
        .map((s) => ({ id: s.id, label: s.displayName, group: programName.get(s.programId) ?? t('msg.group.other') }))
        .sort((a, b) => a.group.localeCompare(b.group) || a.label.localeCompare(b.label)),
    [structure.sections, programName, t],
  );

  const emergency = priority === 'emergency';
  const titleError = touched && !title.trim() ? t('msg.err.title') : title.length > 120 ? t('msg.err.titleLong') : '';
  const bodyError = touched && !body.trim() ? t('msg.err.body') : body.length > 2000 ? t('msg.err.bodyLong') : '';
  const audienceError = touched && ((mode === 'programs' && !programs.length) || (mode === 'classes' && !classes.length)) ? t('msg.err.audience') : '';
  const audienceText =
    mode === 'all' ? t('msg.wholeSchool') : (mode === 'programs' ? programs : classes).map((o) => o.label).join(', ') || t('msg.nobodyYet');

  const valid = () => title.trim() && body.trim() && title.length <= 120 && body.length <= 2000 && (mode === 'all' || (mode === 'programs' ? programs.length : classes.length));

  const submit = () => {
    setTouched(true);
    setError(null);
    if (!valid()) return;
    if (emergency && !confirm) {
      setConfirm(true);
      return;
    }
    setConfirm(false);
    start(async () => {
      const res = await sendBroadcast({
        title,
        body,
        priority,
        requiresAck: requiresAck || emergency,
        ttlMinutes: ttl,
        audience: mode === 'all' ? { all: true } : mode === 'programs' ? { programIds: programs.map((p) => p.id) } : { sectionIds: classes.map((c) => c.id) },
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      const n = res.data.targetedBoards;
      setDone(`${t('msg.circulated', { audience: audienceText })}${n ? ` · ${t.plural('msg.boards', n)}` : ''}`);
      setTitle('');
      setBody('');
      setPriority('info');
      setRequiresAck(false);
      setTouched(false);
    });
  };

  return (
    <Card className="bg-muted border-transparent" component="section" aria-labelledby="compose-title">
      <form className="p-5 md:p-6 flex flex-col gap-5"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div>
          <h2 className="text-[1.375rem] leading-7" id="compose-title">
            {t('msg.compose.title')}
          </h2>
          <p className="text-[13px] leading-[19px] text-muted-foreground mt-1">
            {t('msg.compose.help')}
          </p>
        </div>

        {error && (
          <Alert severity="error" onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        <FormField label={t('msg.title')} required>
          <TextInput className={cn('[&>p]:bg-muted [&>p]:px-3.5 [&>p]:pt-1', !titleError && '[&>p]:text-right')}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            error={!!titleError}
            helperText={titleError || `${title.length}/120`}
            slotProps={{ htmlInput: { maxLength: 120 } }}
            required
          />
        </FormField>
        <FormField label={t('msg.body')} required>
          <TextInput className={cn('[&>p]:bg-muted [&>p]:px-3.5 [&>p]:pt-1', !bodyError && '[&>p]:text-right')}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            error={!!bodyError}
            helperText={bodyError || `${body.length}/2000`}
            multiline
            minRows={4}
            maxRows={10}
            slotProps={{ htmlInput: { maxLength: 2000 } }}
            required
          />
        </FormField>

        <fieldset className="border-0 p-0 m-0">
          <legend className="text-sm leading-5 font-medium tracking-[0.1px] mb-2">
            {t('msg.priority')}
          </legend>
          <div className="grid gap-2 grid-cols-[repeat(3,minmax(0,1fr))]" role="radiogroup" aria-label={t('msg.priority')}>
            {PRIORITIES.map((p) => {
              const on = p.value === priority;
              const danger = p.value === 'emergency';
              return (
                <ButtonBase className={cn('flex-col items-start text-left gap-1 p-3 rounded-[12px] border [transition:background-color_.15s,border-color_.15s] relative', on ? '[outline:1px_solid]' : 'outline-none', danger ? 'outline-destructive' : 'outline-teal')} style={{ borderColor: pal(on ? (danger ? 'error.main' : 'primary.main') : 'm3.outlineVariant'), backgroundColor: pal(on ? (danger ? 'm3.errorContainer' : 'm3.secondaryContainer') : 'kx.pane'), color: pal(on ? (danger ? 'm3.onErrorContainer' : 'm3.onSecondaryContainer') : 'text.primary') }}
                  key={p.value}
                  role="radio"
                  aria-checked={on}
                  title={`${t(priorityKey(p.value, 'board'))} ${t(priorityKey(p.value, 'families'))}`}
                  data-testid={`priority-${p.value}`}
                  onClick={() => setPriority(p.value)}
                >
                  <div className="flex [&_svg]:text-[22px]" style={{ color: pal(danger ? 'error.main' : on ? 'inherit' : 'text.secondary') }}>{p.icon}</div>
                  <h6 className="text-sm leading-5 font-medium tracking-[0.1px]">{t(priorityKey(p.value))}</h6>
                  <span className={cn('text-xs leading-4 tracking-[0.3px]', on ? 'text-inherit' : 'text-muted-foreground')}>
                    {t(priorityKey(p.value, 'short'))}
                  </span>
                  {on && <CheckCircle className={cn('absolute top-[10px] right-[10px] text-[18px]', danger ? 'text-red-ink' : 'text-teal-ink')} />}
                </ButtonBase>
              );
            })}
          </div>
          {(() => {
            return (
              <Typography className="mt-2" variant="body2" color={emergency ? 'error.main' : 'text.secondary'} data-testid="priority-help">
                <strong>{t('msg.onBoards')}</strong> {t(priorityKey(priority, 'board'))} {t(priorityKey(priority, 'families'))}
              </Typography>
            );
          })()}
        </fieldset>

        <fieldset className="border-0 p-0 m-0">
          <legend className="text-sm leading-5 font-medium tracking-[0.1px] mb-2">
            {t('msg.sendTo')}
          </legend>
          <ToggleButtonGroup className="bg-card" exclusive value={mode} onChange={(_, v: Mode | null) => v && setMode(v)} aria-label={t('msg.audience')}>
            <ToggleButton value="all">{t('msg.mode.all')}</ToggleButton>
            <ToggleButton value="programs">{t('msg.mode.programs')}</ToggleButton>
            <ToggleButton value="classes">{t('msg.mode.classes')}</ToggleButton>
          </ToggleButtonGroup>
          {mode !== 'all' && (
            <Autocomplete className="mt-3 bg-card"
              multiple
              options={mode === 'programs' ? programOptions : classOptions}
              groupBy={(o) => o.group ?? ''}
              value={mode === 'programs' ? programs : classes}
              onChange={(_, v) => (mode === 'programs' ? setPrograms(v) : setClasses(v))}
              isOptionEqualToValue={(a, b) => a.id === b.id}
              disableCloseOnSelect
              renderValue={(value, getItemProps) =>
                value.map((o, index) => {
                  const { key, ...rest } = getItemProps({ index });
                  return <Chip key={key} size="small" label={o.label} {...rest} />;
                })
              }
              renderInput={(params) => (
                <FormField id={params.id} label={mode === 'programs' ? t('msg.mode.programs') : t('msg.mode.classes')}>
                  <TextInput
                    {...params}
                    placeholder={(mode === 'programs' ? programs : classes).length ? undefined : mode === 'programs' ? 'BCom, BCA…' : 'BCom Sem 3 A…'}
                    error={!!audienceError}
                    helperText={audienceError || undefined}
                  />
                </FormField>
              )}
              data-testid="audience-picker"
            />
          )}
          <p className="text-xs leading-4 tracking-[0.3px] text-muted-foreground mt-2">
            {mode === 'all' ? t('msg.mode.allHelp') : t('msg.mode.someHelp')}
          </p>
        </fieldset>

        <div className="grid grid-cols-[1fr] sm:grid-cols-[1fr_1fr] gap-4 items-start">
          <FormField label={t('msg.expires')}>
            <TextInput className="[&>p]:bg-muted [&>p]:px-3.5 [&>p]:pt-1"
              select
              value={ttl}
              onChange={(e) => setTtl(Number(e.target.value))}
              helperText={t('msg.expiresHelp')}
            >
              {EXPIRY_OPTIONS.map((o) => (
                <MenuItem key={o.minutes} value={o.minutes}>
                  {t(o.label)}
                </MenuItem>
              ))}
            </TextInput>
          </FormField>
          <div>
            <FormControlLabel className="-ml-2"
              control={<Switch checked={requiresAck || emergency} disabled={emergency} onChange={(e) => setRequiresAck(e.target.checked)} />}
              label={t('msg.ack')}
            />
            <p className="text-xs leading-4 tracking-[0.3px] text-muted-foreground ml-1">
              {emergency ? t('msg.ackEmergency') : t('msg.ackHelp')}
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button
            type="submit"
            variant="contained"
            color={emergency ? 'error' : 'primary'}
            startIcon={pending ? <CircularProgress size={18} color="inherit" /> : emergency ? <ReportOutlined /> : <Send />}
            disabled={pending}
          >
            {emergency ? t('msg.circulateEmergency') : t('msg.circulate')}
          </Button>
        </div>
      </form>

      <Dialog open={confirm} onClose={() => setConfirm(false)} maxWidth="xs" aria-labelledby="confirm-emergency">
        <div className="flex justify-center pt-4 text-red-ink">
          <ReportOutlined className="text-[28px]" />
        </div>
        <DialogTitle className="text-center" id="confirm-emergency">
          {t('msg.confirm.title')}
        </DialogTitle>
        <DialogContent>
          <p className="text-[13px] leading-[19px] text-muted-foreground">
            {t('msg.confirm.body', { audience: audienceText })}
          </p>
          <div className="mt-4 p-3 rounded-[12px] bg-red-soft text-red-ink">
            <h6 className="text-sm leading-5 font-medium tracking-[0.1px]">{title}</h6>
            <p className="text-[13px] leading-[19px] whitespace-pre-wrap line-clamp-4 overflow-hidden">
              {body}
            </p>
          </div>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirm(false)}>{t('common.cancel')}</Button>
          <Button variant="contained" color="error" onClick={submit} data-testid="confirm-emergency">
            {t('msg.confirm.send')}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={!!done}
        autoHideDuration={6000}
        onClose={() => setDone(null)}
        message={done}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      />
    </Card>
  );
}
