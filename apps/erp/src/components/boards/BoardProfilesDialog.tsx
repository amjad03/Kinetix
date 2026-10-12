'use client';
import { useEffect, useState, useTransition } from 'react';
import { boardProfiles, removeProfile, resetProfilePin } from '@/app/(dashboard)/boards/actions';
import { useI18n } from '@/i18n/client';
import type { BoardProfile } from '@/lib/types';

import { Alert, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, List, ListItem, ListItemText } from '@/components/kx';
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
          <Alert className="mt-4" severity="success" onClose={() => setNotice(null)}>
            {notice}
          </Alert>
        )}
        {error && (
          <Alert className="mt-4" severity="error">
            {error}
          </Alert>
        )}
        {profiles === null ? (
          !error && (
            <div className="flex justify-center py-6">
              <CircularProgress size={28} />
            </div>
          )
        ) : profiles.length === 0 ? (
          <DialogContentText className="mt-4">{t('boards.profiles.none')}</DialogContentText>
        ) : (
          <List className="mt-2">
            {profiles.map((p) => (
              <ListItem className="pr-52"
                key={p.userId}
                divider
                data-testid="board-profile"
                secondaryAction={
                  <div className="flex gap-2">
                    <Button size="small" disabled={pending || (!p.pinSet && !p.locked)} onClick={() => act(p, 'reset')}>
                      {t('boards.profiles.reset')}
                    </Button>
                    <Button size="small" color="error" disabled={pending} onClick={() => act(p, 'remove')}>
                      {t('boards.profiles.remove')}
                    </Button>
                  </div>
                }
              >
                <ListItemText
                  primary={
                    <div className="flex items-center gap-2 flex-wrap">
                      {p.name}
                      {p.locked ? (
                        <Chip size="small" color="error" label={t('boards.profiles.locked')} />
                      ) : (
                        <Chip size="small" variant="outlined" label={p.pinSet ? t('boards.profiles.pinSet') : t('boards.profiles.noPin')} />
                      )}
                      {!p.locked && p.failedAttempts > 0 && <Chip size="small" color="warning" variant="outlined" label={t('boards.profiles.attempts', { n: p.failedAttempts })} />}
                    </div>
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
