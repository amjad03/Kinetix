'use client';

import CastForEducationOutlined from '@mui/icons-material/CastForEducationOutlined';
import LiveTvOutlined from '@mui/icons-material/LiveTvOutlined';
import PrivacyTipOutlined from '@mui/icons-material/PrivacyTipOutlined';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import Divider from '@mui/material/Divider';
import Snackbar from '@mui/material/Snackbar';
import Switch from '@mui/material/Switch';
import Typography from '@mui/material/Typography';
import { useId, useState, useTransition, type ReactNode } from 'react';
import { saveSetting } from '@/app/(dashboard)/settings/actions';
import { SectionTitle } from '@/components/PageHeader';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import { needsConfirm, settingDisabled, type InstitutionSettings, type SettingKey } from '@/lib/settings';

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
        <Alert severity="error" role="alert" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      <SectionTitle flush>
        <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
          <LiveTvOutlined fontSize="small" /> {t('settings.live.title')}
        </Box>
      </SectionTitle>
      <Card data-testid="settings-live">
        {row('liveViewEnabled')}
        <Divider />
        {row('liveViewIndicator')}
        <Divider />
        {row(
          'classroomAudioToViewers',
          <Box sx={{ display: 'flex', gap: 1, mt: 1.25, p: 1.5, borderRadius: '12px', bgcolor: 'm3.surfaceContainerHigh', color: 'text.secondary' }} data-testid="audio-privacy">
            <PrivacyTipOutlined fontSize="small" sx={{ mt: '2px', color: 'm3.tertiary' }} />
            <Typography variant="body2">{t('settings.live.audioPrivacy')}</Typography>
          </Box>,
        )}
      </Card>

      <SectionTitle>
        <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
          <CastForEducationOutlined fontSize="small" /> {t('settings.board.title')}
        </Box>
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
    <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start', px: 2.5, py: 2 }} data-testid={`setting-${k}`} data-checked={checked ? 'true' : 'false'}>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="subtitle1" component="label" htmlFor={id} sx={{ display: 'block', lineHeight: '24px', cursor: disabled ? 'default' : 'pointer' }}>
          {label}
        </Typography>
        <Typography variant="body2" color="text.secondary" id={`${id}-help`} sx={{ mt: 0.5, maxWidth: 760 }}>
          {help}
        </Typography>
        {hint && (
          <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 0.5, fontStyle: 'italic' }}>
            {hint}
          </Typography>
        )}
        {children}
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexShrink: 0 }}>
        <Typography variant="body2" color="text.secondary" sx={{ minWidth: 32, textAlign: 'right' }} aria-hidden>
          {checked ? t('settings.on') : t('settings.off')}
        </Typography>
        <Switch id={id} checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} slotProps={{ input: { 'aria-describedby': `${id}-help` } }} />
      </Box>
    </Box>
  );
}
