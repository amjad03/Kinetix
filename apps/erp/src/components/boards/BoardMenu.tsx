'use client';

import DriveFileRenameOutlineOutlined from '@mui/icons-material/DriveFileRenameOutlineOutlined';
import GroupsOutlined from '@mui/icons-material/GroupsOutlined';
import KeyOutlined from '@mui/icons-material/KeyOutlined';
import MoreVert from '@mui/icons-material/MoreVert';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import { useState, useTransition } from 'react';
import { FormField, TextInput } from '@/components/ui';
import { newEnrollmentCode, renameBoard } from '@/app/(dashboard)/boards/actions';
import type { CreatedDevice } from '@/lib/types';
import { useI18n } from '@/i18n/client';
import { EnrollmentCodeDialog } from './AddBoardDialog';
import { BoardProfilesDialog } from './BoardProfilesDialog';

type Open = null | 'rename' | 'reenrol' | 'profiles';

/**
 * Per-board actions: rename, issue a new enrolment code (replacing a tablet, lost code), or see
 * the teachers who use the board and reset their PINs.
 */
export function BoardMenu({ id, name, enrolled, timeZone }: { id: string; name: string; enrolled: boolean; timeZone: string }) {
  const { t } = useI18n();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [open, setOpen] = useState<Open>(null);
  const [value, setValue] = useState(name);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState<CreatedDevice | null>(null);
  const [pending, start] = useTransition();

  const close = () => {
    setOpen(null);
    setError(null);
  };

  return (
    <>
      <IconButton aria-label={t('boards.menu', { name })} data-testid="board-menu" onClick={(e) => setAnchor(e.currentTarget)}>
        <MoreVert />
      </IconButton>
      <Menu anchorEl={anchor} open={!!anchor} onClose={() => setAnchor(null)}>
        <MenuItem
          onClick={() => {
            setAnchor(null);
            setValue(name);
            setOpen('rename');
          }}
        >
          <ListItemIcon>
            <DriveFileRenameOutlineOutlined fontSize="small" />
          </ListItemIcon>
          <ListItemText>{t('boards.rename')}</ListItemText>
        </MenuItem>
        <MenuItem
          data-testid="board-new-code"
          onClick={() => {
            setAnchor(null);
            setOpen('reenrol');
          }}
        >
          <ListItemIcon>
            <KeyOutlined fontSize="small" />
          </ListItemIcon>
          <ListItemText primary={t('boards.newCode')} secondary={enrolled ? t('boards.newCode.replacement') : t('boards.newCode.lost')} />
        </MenuItem>
        {enrolled && (
          <MenuItem
            data-testid="board-profiles-open"
            onClick={() => {
              setAnchor(null);
              setOpen('profiles');
            }}
          >
            <ListItemIcon>
              <GroupsOutlined fontSize="small" />
            </ListItemIcon>
            <ListItemText primary={t('boards.profiles')} secondary={t('boards.profiles.hint')} />
          </MenuItem>
        )}
      </Menu>

      {open === 'profiles' && <BoardProfilesDialog id={id} name={name} timeZone={timeZone} onClose={close} />}

      <Dialog open={open === 'rename'} onClose={pending ? undefined : close} maxWidth="xs" fullWidth>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const res = await renameBoard(id, value);
              if (res.ok) close();
              else setError(res.error);
            });
          }}
        >
          <DialogTitle>{t('boards.rename.title')}</DialogTitle>
          <DialogContent>
            <FormField label={t('boards.rename.name')}>
              <TextInput autoFocus fullWidth value={value} onChange={(e) => setValue(e.target.value)} slotProps={{ htmlInput: { maxLength: 80 } }} sx={{ mt: 1 }} />
            </FormField>
            {error && (
              <Alert severity="error" sx={{ mt: 2 }}>
                {error}
              </Alert>
            )}
          </DialogContent>
          <DialogActions>
            <Button onClick={close} disabled={pending}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" variant="contained" disabled={pending}>
              {t('common.save')}
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      <Dialog open={open === 'reenrol'} onClose={pending ? undefined : close} maxWidth="xs" fullWidth>
        <DialogTitle>{t('boards.newCode.title', { name })}</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {enrolled ? t('boards.newCode.enrolled') : t('boards.newCode.notEnrolled')}
          </DialogContentText>
          {error && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {error}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={close} disabled={pending}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="contained"
            color={enrolled ? 'error' : 'primary'}
            disabled={pending}
            data-testid="board-new-code-confirm"
            onClick={() =>
              start(async () => {
                const res = await newEnrollmentCode(id);
                if (res.ok) {
                  close();
                  setCode(res.data);
                } else setError(res.error);
              })
            }
          >
            {t('boards.newCode.issue')}
          </Button>
        </DialogActions>
      </Dialog>

      {code && <EnrollmentCodeDialog created={code} timeZone={timeZone} onClose={() => setCode(null)} />}
    </>
  );
}
