'use client';
import { useId, useState, useTransition } from 'react';
import { FormField, TextInput } from '@/components/ui';
import { saveBoardKiosk } from '@/app/(dashboard)/settings/actions';
import { SectionTitle } from '@/components/PageHeader';
import { useI18n } from '@/i18n/client';
import { DEFAULT_BOARD_KIOSK, kioskPinProblem, type BoardKiosk } from '@/lib/settings';

import { Alert, Button, Card, CircularProgress, Divider, Snackbar, Switch } from '@/components/kx';
import { Lock as LockOutlined } from 'lucide-react';
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
        <span className="inline-flex items-center gap-2">
          <LockOutlined className="size-5" /> {t('kiosk.title')}
        </span>
      </SectionTitle>
      <Card data-testid="kiosk" data-enabled={k.enabled ? 'true' : 'false'} data-pin-set={k.pinSet ? 'true' : 'false'} aria-busy={pending}>
        {error && (
          <Alert className="m-4 mb-0" severity="error" role="alert">
            {error}
          </Alert>
        )}
        <div className="flex gap-4 items-start px-5 py-4">
          <div className="flex-1 min-w-0">
            <label className="text-base font-medium tracking-[0.1px] block leading-[24px] cursor-pointer" htmlFor={id}>
              {t('kiosk.enabled')}
            </label>
            <p className="text-[13px] leading-[19px] text-muted-foreground mt-1 max-w-[760px]" id={`${id}-help`}>
              {t('kiosk.enabledHelp')}
            </p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <p className="text-[13px] leading-[19px] text-muted-foreground min-w-[32px] text-right" aria-hidden>
              {k.enabled ? t('settings.on') : t('settings.off')}
            </p>
            <Switch
              id={id}
              checked={k.enabled}
              disabled={pending}
              data-testid="kiosk-enabled"
              onChange={(e) => run({ enabled: e.target.checked }, t('settings.saved'))}
              slotProps={{ input: { 'aria-describedby': `${id}-help` } }}
            />
          </div>
        </div>
        <Divider />
        <div className="px-5 py-4">
          <h3 className="text-base font-medium tracking-[0.1px] leading-[24px]">
            {t('kiosk.pin')}
          </h3>
          <p className="text-[13px] leading-[19px] text-muted-foreground mt-1 max-w-[760px]">
            {t('kiosk.pinHelp')}
          </p>
          {k.pinSet ? (
            <Alert className="mt-3 max-w-[760px]" severity="success" data-testid="kiosk-pin-status">
              {k.pinSetAt ? t('kiosk.pinSetAt', { when: fmt.dateTime(k.pinSetAt) }) : t('kiosk.pinSetNoDate')}
            </Alert>
          ) : (
            <Alert className="mt-3 max-w-[760px]" severity="warning" data-testid="kiosk-pin-status">
              {t('kiosk.pinNotSet')}
            </Alert>
          )}
          <div className="flex items-start gap-3 mt-4 flex-wrap">
            <FormField label={k.pinSet ? t('kiosk.newPin') : t('kiosk.pinLabel')}>
              <TextInput className="w-[220px]"
                type="password"
                value={pin}
                onChange={(e) => setPin(e.target.value.trim())}
                autoComplete="new-password"
                error={shown !== null && shown !== 'mismatch'}
                helperText={shown && shown !== 'mismatch' ? t(`kiosk.problem.${shown}`) : t('kiosk.pinHint')}
                slotProps={{ htmlInput: { inputMode: 'numeric', maxLength: 8, 'data-testid': 'kiosk-pin' } }}
              />
            </FormField>
            <FormField label={t('kiosk.confirmPin')}>
              <TextInput className="w-[220px]"
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value.trim())}
                autoComplete="new-password"
                error={shown === 'mismatch'}
                helperText={shown === 'mismatch' ? t('kiosk.problem.mismatch') : ' '}
                slotProps={{ htmlInput: { inputMode: 'numeric', maxLength: 8, 'data-testid': 'kiosk-pin-confirm' } }}
              />
            </FormField>
            <Button className="mt-[2px]" variant="contained" onClick={savePin} disabled={pending || !typed || problem !== null} data-testid="kiosk-pin-save">
              {pending ? <CircularProgress size={20} color="inherit" aria-label={t('common.saving')} /> : k.pinSet ? t('kiosk.changePin') : t('kiosk.setPin')}
            </Button>
            {k.pinSet && (
              <Button className="mt-[2px]" color="error" onClick={() => run({ pin: null }, t('kiosk.pinRemoved'))} disabled={pending} data-testid="kiosk-pin-remove">
                {t('kiosk.removePin')}
              </Button>
            )}
          </div>
        </div>
      </Card>
      <Snackbar open={!!toast} autoHideDuration={3000} onClose={() => setToast(null)} message={toast} />
    </>
  );
}
