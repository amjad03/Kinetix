'use client';

import DriveFileRenameOutlineOutlined from '@mui/icons-material/DriveFileRenameOutlineOutlined';
import LinkOffOutlined from '@mui/icons-material/LinkOffOutlined';
import LockOpenOutlined from '@mui/icons-material/LockOpenOutlined';
import LockOutlined from '@mui/icons-material/LockOutlined';
import MoreVert from '@mui/icons-material/MoreVert';
import PersonOffOutlined from '@mui/icons-material/PersonOffOutlined';
import RestartAltOutlined from '@mui/icons-material/RestartAltOutlined';
import SmsOutlined from '@mui/icons-material/SmsOutlined';
import TuneOutlined from '@mui/icons-material/TuneOutlined';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import IconButton from '@mui/material/IconButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Radio from '@mui/material/Radio';
import RadioGroup from '@mui/material/RadioGroup';
import Snackbar from '@mui/material/Snackbar';
import TextField from '@mui/material/TextField';
import { useState, useTransition, type ReactNode } from 'react';
import { sendAction, type RemoteAction } from '@/app/(dashboard)/devices/actions';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';

type Dlg = null | 'confirm' | 'message' | 'kiosk' | 'rename' | 'unpair';
type Simple = 'lock' | 'unlock' | 'restart_app' | 'clear_pin_profiles';

/** Remote actions for one board: each is sent over realtime and recorded in the audit log. */
export function DeviceMenu({ id, name, locked, rooms, roomId }: { id: string; name: string; locked: boolean; rooms: { id: string; name: string }[]; roomId: string | null }) {
  const { t } = useI18n();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [dlg, setDlg] = useState<Dlg>(null);
  const [simple, setSimple] = useState<Simple>('restart_app');
  const [text, setText] = useState('');
  const [seconds, setSeconds] = useState(30);
  const [kiosk, setKiosk] = useState<'follow' | 'on' | 'off'>('follow');
  const [newName, setNewName] = useState(name);
  const [newRoom, setNewRoom] = useState<string>('keep');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const close = () => {
    setDlg(null);
    setError(null);
  };
  const run = (action: RemoteAction) =>
    start(async () => {
      const res = await sendAction(id, action);
      if (res.ok) {
        close();
        setNotice(res.data.online ? t('devices.result.sent') : t('devices.result.queued'));
      } else setError(res.error);
    });
  const item = (icon: ReactNode, key: MessageKey, onClick: () => void, testId?: string) => (
    <MenuItem
      data-testid={testId}
      onClick={() => {
        setAnchor(null);
        onClick();
      }}
    >
      <ListItemIcon>{icon}</ListItemIcon>
      <ListItemText>{t(key)}</ListItemText>
    </MenuItem>
  );
  const askSimple = (a: Simple) => () => {
    setSimple(a);
    setDlg('confirm');
  };
  const errorAlert = error && (
    <Alert severity="error" sx={{ mt: 2 }}>
      {error}
    </Alert>
  );
  const cancel = (
    <Button onClick={close} disabled={pending}>
      {t('devices.confirm.cancel')}
    </Button>
  );

  return (
    <>
      <IconButton aria-label={t('devices.menu', { name })} data-testid="device-menu" onClick={(e) => setAnchor(e.currentTarget)}>
        <MoreVert />
      </IconButton>
      <Menu anchorEl={anchor} open={!!anchor} onClose={() => setAnchor(null)}>
        {locked
          ? item(<LockOpenOutlined fontSize="small" />, 'devices.act.unlock', () => run({ type: 'unlock' }), 'device-unlock')
          : item(<LockOutlined fontSize="small" />, 'devices.act.lock', askSimple('lock'), 'device-lock')}
        {item(<RestartAltOutlined fontSize="small" />, 'devices.act.restart_app', askSimple('restart_app'), 'device-restart')}
        {item(<PersonOffOutlined fontSize="small" />, 'devices.act.clear_pin_profiles', askSimple('clear_pin_profiles'))}
        {item(<SmsOutlined fontSize="small" />, 'devices.act.message', () => setDlg('message'))}
        {item(<TuneOutlined fontSize="small" />, 'devices.act.kiosk_policy', () => setDlg('kiosk'))}
        {item(<DriveFileRenameOutlineOutlined fontSize="small" />, 'devices.act.rename_move', () => {
          setNewName(name);
          setNewRoom('keep');
          setDlg('rename');
        })}
        {item(<LinkOffOutlined fontSize="small" color="error" />, 'devices.act.unpair', () => setDlg('unpair'))}
      </Menu>

      <Dialog open={dlg === 'confirm'} onClose={pending ? undefined : close} maxWidth="xs" fullWidth>
        <DialogTitle>{t(`devices.act.${simple}` as MessageKey)}</DialogTitle>
        <DialogContent>
          <DialogContentText>{t(`devices.confirm.${simple === 'unlock' ? 'lock' : simple}` as MessageKey, { name })}</DialogContentText>
          {errorAlert}
        </DialogContent>
        <DialogActions>
          {cancel}
          <Button variant="contained" disabled={pending} onClick={() => run({ type: simple })} data-testid="device-confirm">
            {t('devices.confirm.send')}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={dlg === 'message'} onClose={pending ? undefined : close} maxWidth="xs" fullWidth>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            run({ type: 'message', text, seconds });
          }}
        >
          <DialogTitle>{t('devices.message.title', { name })}</DialogTitle>
          <DialogContent>
            <TextField autoFocus fullWidth multiline minRows={2} label={t('devices.message.text')} value={text} onChange={(e) => setText(e.target.value)} slotProps={{ htmlInput: { maxLength: 280 } }} sx={{ mt: 1 }} />
            <TextField fullWidth type="number" label={t('devices.message.seconds')} value={seconds} onChange={(e) => setSeconds(Math.min(600, Math.max(5, Number(e.target.value) || 30)))} sx={{ mt: 2 }} />
            {errorAlert}
          </DialogContent>
          <DialogActions>
            {cancel}
            <Button type="submit" variant="contained" disabled={pending || !text.trim()}>
              {t('devices.confirm.send')}
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      <Dialog open={dlg === 'kiosk'} onClose={pending ? undefined : close} maxWidth="xs" fullWidth>
        <DialogTitle>{t('devices.kiosk.title', { name })}</DialogTitle>
        <DialogContent>
          <FormControl>
            <RadioGroup value={kiosk} onChange={(e) => setKiosk(e.target.value as 'follow' | 'on' | 'off')}>
              <FormControlLabel value="follow" control={<Radio />} label={t('devices.kiosk.follow')} />
              <FormControlLabel value="on" control={<Radio />} label={t('devices.kiosk.forceOn')} />
              <FormControlLabel value="off" control={<Radio />} label={t('devices.kiosk.forceOff')} />
            </RadioGroup>
          </FormControl>
          {errorAlert}
        </DialogContent>
        <DialogActions>
          {cancel}
          <Button variant="contained" disabled={pending} onClick={() => run({ type: 'kiosk_policy', enabled: kiosk === 'follow' ? null : kiosk === 'on' })}>
            {t('devices.confirm.send')}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={dlg === 'rename'} onClose={pending ? undefined : close} maxWidth="xs" fullWidth>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            run({ type: 'rename_move', name: newName.trim() !== name ? newName.trim() : undefined, ...(newRoom !== 'keep' ? { roomId: newRoom === 'none' ? null : newRoom } : {}) });
          }}
        >
          <DialogTitle>{t('devices.rename.title', { name })}</DialogTitle>
          <DialogContent>
            <TextField autoFocus fullWidth label={t('devices.rename.name')} value={newName} onChange={(e) => setNewName(e.target.value)} slotProps={{ htmlInput: { maxLength: 80 } }} sx={{ mt: 1 }} />
            <TextField select fullWidth label={t('devices.rename.room')} value={newRoom} onChange={(e) => setNewRoom(e.target.value)} sx={{ mt: 2 }}>
              <MenuItem value="keep">{t('devices.rename.keepRoom')}</MenuItem>
              <MenuItem value="none">{t('devices.rename.noRoom')}</MenuItem>
              {rooms.filter((r) => r.id !== roomId).map((r) => (
                <MenuItem key={r.id} value={r.id}>
                  {r.name}
                </MenuItem>
              ))}
            </TextField>
            {errorAlert}
          </DialogContent>
          <DialogActions>
            {cancel}
            <Button type="submit" variant="contained" disabled={pending || (newName.trim() === name && newRoom === 'keep')}>
              {t('common.save')}
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      <Dialog open={dlg === 'unpair'} onClose={pending ? undefined : close} maxWidth="xs" fullWidth>
        <DialogTitle>{t('devices.unpair.title', { name })}</DialogTitle>
        <DialogContent>
          <DialogContentText>{t('devices.unpair.body')}</DialogContentText>
          {errorAlert}
        </DialogContent>
        <DialogActions>
          {cancel}
          <Button color="error" variant="contained" disabled={pending} onClick={() => run({ type: 'unpair' })} data-testid="device-unpair-confirm">
            {t('devices.unpair.confirm')}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={notice !== null} autoHideDuration={6000} onClose={() => setNotice(null)} message={notice ?? ''} />
    </>
  );
}
