'use client';

import DriveFileRenameOutlineOutlined from '@mui/icons-material/DriveFileRenameOutlineOutlined';
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
import TextField from '@mui/material/TextField';
import { useState, useTransition } from 'react';
import { newEnrollmentCode, renameBoard } from '@/app/(dashboard)/boards/actions';
import type { CreatedDevice } from '@/lib/types';
import { EnrollmentCodeDialog } from './AddBoardDialog';

type Open = null | 'rename' | 'reenrol';

/** Per-board actions: rename, or issue a new enrolment code (replacing a tablet, lost code). */
export function BoardMenu({ id, name, enrolled, timeZone }: { id: string; name: string; enrolled: boolean; timeZone: string }) {
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
      <IconButton aria-label={`Actions for ${name}`} data-testid="board-menu" onClick={(e) => setAnchor(e.currentTarget)}>
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
          <ListItemText>Rename</ListItemText>
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
          <ListItemText primary="New enrolment code" secondary={enrolled ? 'For a replacement device' : 'If the code was lost or expired'} />
        </MenuItem>
      </Menu>

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
          <DialogTitle>Rename board</DialogTitle>
          <DialogContent>
            <TextField autoFocus fullWidth label="Name" value={value} onChange={(e) => setValue(e.target.value)} slotProps={{ htmlInput: { maxLength: 80 } }} sx={{ mt: 1 }} />
            {error && (
              <Alert severity="error" sx={{ mt: 2 }}>
                {error}
              </Alert>
            )}
          </DialogContent>
          <DialogActions>
            <Button onClick={close} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" variant="contained" disabled={pending}>
              Save
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      <Dialog open={open === 'reenrol'} onClose={pending ? undefined : close} maxWidth="xs" fullWidth>
        <DialogTitle>New enrolment code for “{name}”?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {enrolled
              ? 'The board is signed out of your school straight away. Use the new code to set up the replacement device or reinstall the app.'
              : 'The previous code stops working.'}
          </DialogContentText>
          {error && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {error}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={close} disabled={pending}>
            Cancel
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
            Issue new code
          </Button>
        </DialogActions>
      </Dialog>

      {code && <EnrollmentCodeDialog created={code} timeZone={timeZone} onClose={() => setCode(null)} />}
    </>
  );
}
