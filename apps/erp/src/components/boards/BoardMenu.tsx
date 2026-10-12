'use client';
import { useState, useTransition } from 'react';
import { FormField, TextInput } from '@/components/ui';
import { newEnrollmentCode, renameBoard } from '@/app/(dashboard)/boards/actions';
import type { CreatedDevice } from '@/lib/types';
import { useI18n } from '@/i18n/client';
import { EnrollmentCodeDialog } from './AddBoardDialog';
import { BoardProfilesDialog } from './BoardProfilesDialog';

import { Alert, Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, IconButton, ListItemIcon, ListItemText, Menu, MenuItem } from '@/components/kx';
import { EllipsisVertical as MoreVert, KeyRound as KeyOutlined, PencilLine as DriveFileRenameOutlineOutlined, UsersRound as GroupsOutlined } from 'lucide-react';
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
            <DriveFileRenameOutlineOutlined className="size-5" />
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
            <KeyOutlined className="size-5" />
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
              <GroupsOutlined className="size-5" />
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
              <TextInput className="mt-2" autoFocus fullWidth value={value} onChange={(e) => setValue(e.target.value)} slotProps={{ htmlInput: { maxLength: 80 } }} />
            </FormField>
            {error && (
              <Alert className="mt-4" severity="error">
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
            <Alert className="mt-4" severity="error">
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
