'use client';
import { useState, useTransition, type ReactNode } from 'react';
import { sendAction, type RemoteAction } from '@/app/(dashboard)/devices/actions';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';

import { Alert, Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, FormControl, FormControlLabel, IconButton, ListItemIcon, ListItemText, Menu, MenuItem, Radio, RadioGroup, Snackbar, TextField } from '@/components/kx';
import { EllipsisVertical as MoreVert, Lock as LockOutlined, LockOpen as LockOpenOutlined, MessageSquare as SmsOutlined, PencilLine as DriveFileRenameOutlineOutlined, RotateCcw as RestartAltOutlined, SlidersHorizontal as TuneOutlined, Unlink as LinkOffOutlined, UserX as PersonOffOutlined } from 'lucide-react';
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
    <Alert className="mt-4" severity="error">
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
          ? item(<LockOpenOutlined className="size-5" />, 'devices.act.unlock', () => run({ type: 'unlock' }), 'device-unlock')
          : item(<LockOutlined className="size-5" />, 'devices.act.lock', askSimple('lock'), 'device-lock')}
        {item(<RestartAltOutlined className="size-5" />, 'devices.act.restart_app', askSimple('restart_app'), 'device-restart')}
        {item(<PersonOffOutlined className="size-5" />, 'devices.act.clear_pin_profiles', askSimple('clear_pin_profiles'))}
        {item(<SmsOutlined className="size-5" />, 'devices.act.message', () => setDlg('message'))}
        {item(<TuneOutlined className="size-5" />, 'devices.act.kiosk_policy', () => setDlg('kiosk'))}
        {item(<DriveFileRenameOutlineOutlined className="size-5" />, 'devices.act.rename_move', () => {
          setNewName(name);
          setNewRoom('keep');
          setDlg('rename');
        })}
        {item(<LinkOffOutlined className="size-5 text-red-ink" />, 'devices.act.unpair', () => setDlg('unpair'))}
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
            <TextField className="mt-2" autoFocus fullWidth multiline minRows={2} label={t('devices.message.text')} value={text} onChange={(e) => setText(e.target.value)} slotProps={{ htmlInput: { maxLength: 280 } }} />
            <TextField className="mt-4" fullWidth type="number" label={t('devices.message.seconds')} value={seconds} onChange={(e) => setSeconds(Math.min(600, Math.max(5, Number(e.target.value) || 30)))} />
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
            <TextField className="mt-2" autoFocus fullWidth label={t('devices.rename.name')} value={newName} onChange={(e) => setNewName(e.target.value)} slotProps={{ htmlInput: { maxLength: 80 } }} />
            <TextField className="mt-4" select fullWidth label={t('devices.rename.room')} value={newRoom} onChange={(e) => setNewRoom(e.target.value)}>
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
