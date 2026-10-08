'use client';

import CheckCircle from '@mui/icons-material/CheckCircle';
import ReportOutlined from '@mui/icons-material/ReportOutlined';
import Send from '@mui/icons-material/Send';
import Alert from '@mui/material/Alert';
import Autocomplete from '@mui/material/Autocomplete';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
import Card from '@mui/material/Card';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import MenuItem from '@mui/material/MenuItem';
import Snackbar from '@mui/material/Snackbar';
import Switch from '@mui/material/Switch';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import { useMemo, useState, useTransition } from 'react';
import { FormField, TextInput } from '@/components/ui';
import { sendBroadcast } from '@/app/(dashboard)/messages/actions';
import type { Priority, Structure } from '@/lib/types';
import { useI18n } from '@/i18n/client';
import { EXPIRY_OPTIONS, PRIORITIES, priorityKey } from './priorities';

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
    <Card component="section" aria-labelledby="compose-title" sx={{ bgcolor: 'kx.tonal', borderColor: 'transparent' }}>
      <Box
        component="form"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        sx={{ p: { xs: 2.5, md: 3 }, display: 'flex', flexDirection: 'column', gap: 2.5 }}
      >
        <Box>
          <Typography variant="h5" component="h2" id="compose-title">
            {t('msg.compose.title')}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {t('msg.compose.help')}
          </Typography>
        </Box>

        {error && (
          <Alert severity="error" onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        <FormField label={t('msg.title')} required>
          <TextInput
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            error={!!titleError}
            helperText={titleError || `${title.length}/120`}
            slotProps={{ htmlInput: { maxLength: 120 }, formHelperText: { sx: { textAlign: titleError ? 'left' : 'right' } } }}
            sx={{ bgcolor: 'kx.pane', '& .MuiFormHelperText-root': { bgcolor: 'kx.tonal', m: 0, px: 1.75, pt: 0.5 } }}
            required
          />
        </FormField>
        <FormField label={t('msg.body')} required>
          <TextInput
            value={body}
            onChange={(e) => setBody(e.target.value)}
            error={!!bodyError}
            helperText={bodyError || `${body.length}/2000`}
            multiline
            minRows={4}
            maxRows={10}
            slotProps={{ htmlInput: { maxLength: 2000 }, formHelperText: { sx: { textAlign: bodyError ? 'left' : 'right' } } }}
            sx={{ bgcolor: 'kx.pane', '& .MuiFormHelperText-root': { bgcolor: 'kx.tonal', m: 0, px: 1.75, pt: 0.5 } }}
            required
          />
        </FormField>

        <Box component="fieldset" sx={{ border: 0, p: 0, m: 0 }}>
          <Typography component="legend" variant="subtitle2" sx={{ mb: 1 }}>
            {t('msg.priority')}
          </Typography>
          <Box role="radiogroup" aria-label={t('msg.priority')} sx={{ display: 'grid', gap: 1, gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
            {PRIORITIES.map((p) => {
              const on = p.value === priority;
              const danger = p.value === 'emergency';
              return (
                <ButtonBase
                  key={p.value}
                  role="radio"
                  aria-checked={on}
                  title={`${t(priorityKey(p.value, 'board'))} ${t(priorityKey(p.value, 'families'))}`}
                  data-testid={`priority-${p.value}`}
                  onClick={() => setPriority(p.value)}
                  sx={{
                    flexDirection: 'column',
                    alignItems: 'flex-start',
                    textAlign: 'left',
                    gap: 0.5,
                    p: 1.5,
                    borderRadius: '12px',
                    border: 1,
                    borderColor: on ? (danger ? 'error.main' : 'primary.main') : 'm3.outlineVariant',
                    outline: on ? '1px solid' : 'none',
                    outlineColor: danger ? 'error.main' : 'primary.main',
                    bgcolor: on ? (danger ? 'm3.errorContainer' : 'm3.secondaryContainer') : 'kx.pane',
                    color: on ? (danger ? 'm3.onErrorContainer' : 'm3.onSecondaryContainer') : 'text.primary',
                    transition: 'background-color .15s, border-color .15s',
                    position: 'relative',
                  }}
                >
                  <Box sx={{ display: 'flex', color: danger ? 'error.main' : on ? 'inherit' : 'text.secondary', '& svg': { fontSize: 22 } }}>{p.icon}</Box>
                  <Typography variant="subtitle2">{t(priorityKey(p.value))}</Typography>
                  <Typography variant="caption" sx={{ color: on ? 'inherit' : 'text.secondary' }}>
                    {t(priorityKey(p.value, 'short'))}
                  </Typography>
                  {on && <CheckCircle sx={{ position: 'absolute', top: 10, right: 10, color: danger ? 'error.main' : 'primary.main', fontSize: 18 }} />}
                </ButtonBase>
              );
            })}
          </Box>
          {(() => {
            return (
              <Typography variant="body2" color={emergency ? 'error.main' : 'text.secondary'} sx={{ mt: 1 }} data-testid="priority-help">
                <strong>{t('msg.onBoards')}</strong> {t(priorityKey(priority, 'board'))} {t(priorityKey(priority, 'families'))}
              </Typography>
            );
          })()}
        </Box>

        <Box component="fieldset" sx={{ border: 0, p: 0, m: 0 }}>
          <Typography component="legend" variant="subtitle2" sx={{ mb: 1 }}>
            {t('msg.sendTo')}
          </Typography>
          <ToggleButtonGroup exclusive value={mode} onChange={(_, v: Mode | null) => v && setMode(v)} aria-label={t('msg.audience')} sx={{ bgcolor: 'kx.pane' }}>
            <ToggleButton value="all">{t('msg.mode.all')}</ToggleButton>
            <ToggleButton value="programs">{t('msg.mode.programs')}</ToggleButton>
            <ToggleButton value="classes">{t('msg.mode.classes')}</ToggleButton>
          </ToggleButtonGroup>
          {mode !== 'all' && (
            <Autocomplete
              multiple
              sx={{ mt: 1.5, bgcolor: 'kx.pane' }}
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
                <FormField label={mode === 'programs' ? t('msg.mode.programs') : t('msg.mode.classes')}>
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
          <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 1 }}>
            {mode === 'all' ? t('msg.mode.allHelp') : t('msg.mode.someHelp')}
          </Typography>
        </Box>

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2, alignItems: 'start' }}>
          <FormField label={t('msg.expires')}>
            <TextInput
              select
              value={ttl}
              onChange={(e) => setTtl(Number(e.target.value))}
              helperText={t('msg.expiresHelp')}
              sx={{ bgcolor: 'kx.pane', '& .MuiFormHelperText-root': { bgcolor: 'kx.tonal', m: 0, px: 1.75, pt: 0.5 } }}
            >
              {EXPIRY_OPTIONS.map((o) => (
                <MenuItem key={o.minutes} value={o.minutes}>
                  {t(o.label)}
                </MenuItem>
              ))}
            </TextInput>
          </FormField>
          <Box>
            <FormControlLabel
              sx={{ ml: -1 }}
              control={<Switch checked={requiresAck || emergency} disabled={emergency} onChange={(e) => setRequiresAck(e.target.checked)} />}
              label={t('msg.ack')}
            />
            <Typography variant="caption" color="text.secondary" component="p" sx={{ ml: 0.5 }}>
              {emergency ? t('msg.ackEmergency') : t('msg.ackHelp')}
            </Typography>
          </Box>
        </Box>

        <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, pt: 0.5 }}>
          <Button
            type="submit"
            variant="contained"
            color={emergency ? 'error' : 'primary'}
            startIcon={pending ? <CircularProgress size={18} color="inherit" /> : emergency ? <ReportOutlined /> : <Send />}
            disabled={pending}
          >
            {emergency ? t('msg.circulateEmergency') : t('msg.circulate')}
          </Button>
        </Box>
      </Box>

      <Dialog open={confirm} onClose={() => setConfirm(false)} maxWidth="xs" aria-labelledby="confirm-emergency">
        <Box sx={{ display: 'flex', justifyContent: 'center', pt: 2, color: 'error.main' }}>
          <ReportOutlined sx={{ fontSize: 28 }} />
        </Box>
        <DialogTitle id="confirm-emergency" sx={{ textAlign: 'center' }}>
          {t('msg.confirm.title')}
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            {t('msg.confirm.body', { audience: audienceText })}
          </Typography>
          <Box sx={{ mt: 2, p: 1.5, borderRadius: '12px', bgcolor: 'm3.errorContainer', color: 'm3.onErrorContainer' }}>
            <Typography variant="subtitle2">{title}</Typography>
            <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
              {body}
            </Typography>
          </Box>
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
