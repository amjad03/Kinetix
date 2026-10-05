'use client';

import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import { useEffect, useState, useTransition } from 'react';
import { boardProfiles, removeProfile, resetProfilePin } from '@/app/(dashboard)/boards/actions';
import { useI18n } from '@/i18n/client';
import type { BoardProfile } from '@/lib/types';

/**
 * Teachers on a shared board (docs/architecture/board-profiles.md): whose PIN is set, who is
 * locked out after five wrong PINs, with Reset PIN and Remove.
 */
export function BoardProfilesDialog({ id, name, timeZone, onClose }: { id: string; name: string; timeZone: string; onClose: () => void }) {
  const { t, fmt } = useI18n();
  const [profiles, setProfiles] = useState<BoardProfile[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const reload = () =>
    start(async () => {
      const res = await boardProfiles(id);
      if (res.ok) setProfiles(res.data);
      else setError(res.error);
    });

  useEffect(reload, [id]);

  const act = (p: BoardProfile, kind: 'reset' | 'remove') =>
    start(async () => {
      setError(null);
      const res = kind === 'reset' ? await resetProfilePin(id, p.userId) : await removeProfile(id, p.userId);
      if (!res.ok) return setError(res.error);
      setNotice(t(kind === 'reset' ? 'boards.profiles.resetDone' : 'boards.profiles.removed', { name: p.name }));
      const list = await boardProfiles(id);
      if (list.ok) setProfiles(list.data);
    });

  const now = new Date();
  return (
    <Dialog open onClose={pending ? undefined : onClose} maxWidth="sm" fullWidth data-testid="board-profiles">
      <DialogTitle>{t('boards.profiles.title', { name })}</DialogTitle>
      <DialogContent>
        <DialogContentText>{t('boards.profiles.body')}</DialogContentText>
        {notice && (
          <Alert severity="success" sx={{ mt: 2 }} onClose={() => setNotice(null)}>
            {notice}
          </Alert>
        )}
        {error && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {error}
          </Alert>
        )}
        {profiles === null ? (
          !error && (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
              <CircularProgress size={28} />
            </Box>
          )
        ) : profiles.length === 0 ? (
          <DialogContentText sx={{ mt: 2 }}>{t('boards.profiles.none')}</DialogContentText>
        ) : (
          <List sx={{ mt: 1 }}>
            {profiles.map((p) => (
              <ListItem
                key={p.userId}
                divider
                data-testid="board-profile"
                secondaryAction={
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <Button size="small" disabled={pending || (!p.pinSet && !p.locked)} onClick={() => act(p, 'reset')}>
                      {t('boards.profiles.reset')}
                    </Button>
                    <Button size="small" color="error" disabled={pending} onClick={() => act(p, 'remove')}>
                      {t('boards.profiles.remove')}
                    </Button>
                  </Box>
                }
                sx={{ pr: 26 }}
              >
                <ListItemText
                  primary={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                      {p.name}
                      {p.locked ? (
                        <Chip size="small" color="error" label={t('boards.profiles.locked')} />
                      ) : (
                        <Chip size="small" variant="outlined" label={p.pinSet ? t('boards.profiles.pinSet') : t('boards.profiles.noPin')} />
                      )}
                      {!p.locked && p.failedAttempts > 0 && <Chip size="small" color="warning" variant="outlined" label={t('boards.profiles.attempts', { n: p.failedAttempts })} />}
                    </Box>
                  }
                  secondary={t('boards.profiles.lastUsed', { time: fmt.relative(p.lastUsedAt, now, timeZone) })}
                />
              </ListItem>
            ))}
          </List>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={pending}>
          {t('common.close')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
