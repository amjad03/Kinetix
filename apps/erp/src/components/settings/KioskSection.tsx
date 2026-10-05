'use client';

import LockOutlined from '@mui/icons-material/LockOutlined';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CircularProgress from '@mui/material/CircularProgress';
import Divider from '@mui/material/Divider';
import Snackbar from '@mui/material/Snackbar';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useId, useState, useTransition } from 'react';
import { saveBoardKiosk } from '@/app/(dashboard)/settings/actions';
import { SectionTitle } from '@/components/PageHeader';
import { useI18n } from '@/i18n/client';
import { DEFAULT_BOARD_KIOSK, kioskPinProblem, type BoardKiosk } from '@/lib/settings';

/**
 * Settings → Board kiosk mode: keep students in the board app, and the IT PIN that lets staff
 * leave it on a board (docs/hardware/kiosk-mode.md). The PIN is typed here once and never shown again.
 */
export function KioskSection({ initial }: { initial: BoardKiosk }) {
  const { t, fmt } = useI18n();
  const id = useId();
  const [k, setK] = useState(initial);
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const typed = pin !== '' || confirm !== '';
  const problem = typed ? kioskPinProblem(pin, confirm) : null;
  // Only complain about a mismatch once the second box has as many digits as the first.
  const shown = problem === 'mismatch' && confirm.length < pin.length ? null : problem;

  const run = (change: Parameters<typeof saveBoardKiosk>[0], message: string, after?: () => void) => {
    setError(null);
    start(async () => {
      const res = await saveBoardKiosk(change);
      if (!res.ok) return setError(res.error);
      setK(res.data.boardKiosk ?? DEFAULT_BOARD_KIOSK);
      after?.();
      setToast(message);
    });
  };
  const savePin = () =>
    run({ pin: { pin, confirm } }, t('kiosk.pinSaved'), () => {
      setPin('');
      setConfirm('');
    });

  return (
    <>
      <SectionTitle>
        <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
          <LockOutlined fontSize="small" /> {t('kiosk.title')}
        </Box>
      </SectionTitle>
      <Card data-testid="kiosk" data-enabled={k.enabled ? 'true' : 'false'} data-pin-set={k.pinSet ? 'true' : 'false'} aria-busy={pending}>
        {error && (
          <Alert severity="error" role="alert" sx={{ m: 2, mb: 0 }}>
            {error}
          </Alert>
        )}
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start', px: 2.5, py: 2 }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="subtitle1" component="label" htmlFor={id} sx={{ display: 'block', lineHeight: '24px', cursor: 'pointer' }}>
              {t('kiosk.enabled')}
            </Typography>
            <Typography variant="body2" color="text.secondary" id={`${id}-help`} sx={{ mt: 0.5, maxWidth: 760 }}>
              {t('kiosk.enabledHelp')}
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexShrink: 0 }}>
            <Typography variant="body2" color="text.secondary" sx={{ minWidth: 32, textAlign: 'right' }} aria-hidden>
              {k.enabled ? t('settings.on') : t('settings.off')}
            </Typography>
            <Switch
              id={id}
              checked={k.enabled}
              disabled={pending}
              data-testid="kiosk-enabled"
              onChange={(e) => run({ enabled: e.target.checked }, t('settings.saved'))}
              slotProps={{ input: { 'aria-describedby': `${id}-help` } }}
            />
          </Box>
        </Box>
        <Divider />
        <Box sx={{ px: 2.5, py: 2 }}>
          <Typography variant="subtitle1" component="h3" sx={{ lineHeight: '24px' }}>
            {t('kiosk.pin')}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, maxWidth: 760 }}>
            {t('kiosk.pinHelp')}
          </Typography>
          {k.pinSet ? (
            <Alert severity="success" sx={{ mt: 1.5, maxWidth: 760 }} data-testid="kiosk-pin-status">
              {k.pinSetAt ? t('kiosk.pinSetAt', { when: fmt.dateTime(k.pinSetAt) }) : t('kiosk.pinSetNoDate')}
            </Alert>
          ) : (
            <Alert severity="warning" sx={{ mt: 1.5, maxWidth: 760 }} data-testid="kiosk-pin-status">
              {t('kiosk.pinNotSet')}
            </Alert>
          )}
          <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, mt: 2, flexWrap: 'wrap' }}>
            <TextField
              size="small"
              type="password"
              label={k.pinSet ? t('kiosk.newPin') : t('kiosk.pinLabel')}
              value={pin}
              onChange={(e) => setPin(e.target.value.trim())}
              autoComplete="new-password"
              error={shown !== null && shown !== 'mismatch'}
              helperText={shown && shown !== 'mismatch' ? t(`kiosk.problem.${shown}`) : t('kiosk.pinHint')}
              sx={{ width: 220 }}
              slotProps={{ htmlInput: { inputMode: 'numeric', maxLength: 8, 'data-testid': 'kiosk-pin' } }}
            />
            <TextField
              size="small"
              type="password"
              label={t('kiosk.confirmPin')}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value.trim())}
              autoComplete="new-password"
              error={shown === 'mismatch'}
              helperText={shown === 'mismatch' ? t('kiosk.problem.mismatch') : ' '}
              sx={{ width: 220 }}
              slotProps={{ htmlInput: { inputMode: 'numeric', maxLength: 8, 'data-testid': 'kiosk-pin-confirm' } }}
            />
            <Button variant="contained" onClick={savePin} disabled={pending || !typed || problem !== null} data-testid="kiosk-pin-save" sx={{ mt: '2px' }}>
              {pending ? <CircularProgress size={20} color="inherit" aria-label={t('common.saving')} /> : k.pinSet ? t('kiosk.changePin') : t('kiosk.setPin')}
            </Button>
            {k.pinSet && (
              <Button color="error" onClick={() => run({ pin: null }, t('kiosk.pinRemoved'))} disabled={pending} data-testid="kiosk-pin-remove" sx={{ mt: '2px' }}>
                {t('kiosk.removePin')}
              </Button>
            )}
          </Box>
        </Box>
      </Card>
      <Snackbar open={!!toast} autoHideDuration={3000} onClose={() => setToast(null)} message={toast} />
    </>
  );
}
