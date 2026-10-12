'use client';
import { useId, useState, useTransition, type ReactNode } from 'react';
import { saveSetting } from '@/app/(dashboard)/settings/actions';
import { SectionTitle } from '@/components/PageHeader';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import { needsConfirm, settingDisabled, type InstitutionSettings, type SettingKey } from '@/lib/settings';

import { Alert, Button, Card, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, Divider, Snackbar, Switch } from '@/components/kx';
import { Presentation as CastForEducationOutlined, ShieldAlert as PrivacyTipOutlined, Tv as LiveTvOutlined } from 'lucide-react';
import { cn } from '@/lib/utils';
const ROWS: Record<SettingKey, { label: MessageKey; help: MessageKey }> = {
  liveViewEnabled: { label: 'settings.live.enabled', help: 'settings.live.enabledHelp' },
  liveViewIndicator: { label: 'settings.live.indicator', help: 'settings.live.indicatorHelp' },
  classroomAudioToViewers: { label: 'settings.live.audio', help: 'settings.live.audioHelp' },
  pinFallbackEnabled: { label: 'settings.pin', help: 'settings.pinHelp' },
};

export function SettingsForm({ initial }: { initial: InstitutionSettings }) {
  const { t } = useI18n();
  const [s, setS] = useState(initial);
  const [busy, setBusy] = useState<SettingKey | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<SettingKey | null>(null);
  const [, start] = useTransition();

  const save = (key: SettingKey, value: boolean) => {
    setBusy(key);
    setError(null);
    setS((x) => ({ ...x, [key]: value }));
    start(async () => {
      const res = await saveSetting(key, value);
      setBusy(null);
      if (res.ok) {
        setS(res.data);
        setToast(t('settings.saved'));
      } else {
        setS((x) => ({ ...x, [key]: !value }));
        setError(res.error);
      }
    });
  };
  const change = (key: SettingKey, value: boolean) => (needsConfirm(key, value) ? setConfirm(key) : save(key, value));
  const row = (key: SettingKey, extra?: ReactNode) => (
    <SettingRow key={key} k={key} label={t(ROWS[key].label)} help={t(ROWS[key].help)} checked={s[key]} disabled={busy !== null || settingDisabled(s, key)} onChange={(v) => change(key, v)} hint={settingDisabled(s, key) ? t('settings.live.needsLive') : undefined}>
      {extra}
    </SettingRow>
  );

  return (
    <>
      {error && (
        <Alert className="mb-4" severity="error" role="alert">
          {error}
        </Alert>
      )}
      <SectionTitle flush>
        <span className="inline-flex items-center gap-2">
          <LiveTvOutlined className="size-5" /> {t('settings.live.title')}
        </span>
      </SectionTitle>
      <Card data-testid="settings-live">
        {row('liveViewEnabled')}
        <Divider />
        {row('liveViewIndicator')}
        <Divider />
        {row(
          'classroomAudioToViewers',
          <div className="flex gap-2 mt-2.5 p-3 rounded-[12px] bg-accent text-muted-foreground" data-testid="audio-privacy">
            <PrivacyTipOutlined className="size-5 mt-[2px] text-amber-ink" />
            <p className="text-[13px] leading-[19px]">{t('settings.live.audioPrivacy')}</p>
          </div>,
        )}
      </Card>

      <SectionTitle>
        <span className="inline-flex items-center gap-2">
          <CastForEducationOutlined className="size-5" /> {t('settings.board.title')}
        </span>
      </SectionTitle>
      <Card data-testid="settings-board">{row('pinFallbackEnabled')}</Card>

      <Dialog open={confirm !== null} onClose={() => setConfirm(null)} maxWidth="sm" aria-labelledby="audio-confirm-title">
        <DialogTitle id="audio-confirm-title">{t('settings.audio.confirmTitle')}</DialogTitle>
        <DialogContent>
          <DialogContentText>{t('settings.audio.confirmBody')}</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirm(null)}>{t('common.cancel')}</Button>
          <Button
            variant="contained"
            data-testid="audio-confirm"
            onClick={() => {
              const key = confirm!;
              setConfirm(null);
              save(key, true);
            }}
          >
            {t('settings.audio.confirm')}
          </Button>
        </DialogActions>
      </Dialog>
      <Snackbar open={!!toast} autoHideDuration={3000} onClose={() => setToast(null)} message={toast} />
    </>
  );
}

function SettingRow({
  k,
  label,
  help,
  checked,
  disabled,
  hint,
  onChange,
  children,
}: {
  k: SettingKey;
  label: string;
  help: string;
  checked: boolean;
  disabled: boolean;
  hint?: string;
  onChange: (v: boolean) => void;
  children?: ReactNode;
}) {
  const { t } = useI18n();
  const id = useId();
  return (
    <div className="flex gap-4 items-start px-5 py-4" data-testid={`setting-${k}`} data-checked={checked ? 'true' : 'false'}>
      <div className="flex-1 min-w-0">
        <label className={cn('text-base font-medium tracking-[0.1px] block leading-[24px]', disabled ? 'cursor-default' : 'cursor-pointer')} htmlFor={id}>
          {label}
        </label>
        <p className="text-[13px] leading-[19px] text-muted-foreground mt-1 max-w-[760px]" id={`${id}-help`}>
          {help}
        </p>
        {hint && (
          <p className="text-xs leading-4 tracking-[0.3px] text-muted-foreground mt-1 italic">
            {hint}
          </p>
        )}
        {children}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <p className="text-[13px] leading-[19px] text-muted-foreground min-w-[32px] text-right" aria-hidden>
          {checked ? t('settings.on') : t('settings.off')}
        </p>
        <Switch id={id} checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} slotProps={{ input: { 'aria-describedby': `${id}-help` } }} />
      </div>
    </div>
  );
}
