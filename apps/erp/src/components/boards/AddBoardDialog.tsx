'use client';

import Add from '@mui/icons-material/Add';
import CheckOutlined from '@mui/icons-material/CheckOutlined';
import ContentCopyOutlined from '@mui/icons-material/ContentCopyOutlined';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useState, useTransition } from 'react';
import { addBoard } from '@/app/(dashboard)/boards/actions';
import { useI18n } from '@/i18n/client';
import type { CreatedDevice, Structure } from '@/lib/types';

export function AddBoardButton({ structure, allowed, timeZone }: { structure: Structure; allowed: boolean; timeZone: string }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const button = (
    <Button variant="contained" startIcon={<Add />} onClick={() => setOpen(true)} disabled={!allowed || structure.campuses.length === 0}>
      {t('boards.add')}
    </Button>
  );
  return (
    <>
      {allowed ? (
        button
      ) : (
        <Tooltip title={t('boards.addOnlyLeaders')}>
          <span>{button}</span>
        </Tooltip>
      )}
      {open && <AddBoardDialog structure={structure} timeZone={timeZone} onClose={() => setOpen(false)} />}
    </>
  );
}

function AddBoardDialog({ structure, timeZone, onClose }: { structure: Structure; timeZone: string; onClose: () => void }) {
  const { t } = useI18n();
  const [name, setName] = useState('');
  const [campusId, setCampusId] = useState(structure.campuses[0]?.id ?? '');
  const [roomId, setRoomId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedDevice | null>(null);
  const [pending, start] = useTransition();
  const rooms = structure.rooms.filter((r) => r.campusId === campusId);

  const submit = () => {
    setError(null);
    start(async () => {
      const res = await addBoard({ name, campusId, roomId: roomId || undefined });
      if (res.ok) setCreated(res.data);
      else setError(res.error);
    });
  };

  if (created) return <EnrollmentCodeDialog created={created} timeZone={timeZone} onClose={onClose} />;

  return (
    <Dialog open onClose={pending ? undefined : onClose} maxWidth="xs" fullWidth aria-labelledby="add-board-title">
      <Box
        component="form"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <DialogTitle id="add-board-title">{t('boards.add.title')}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5 }}>
            {t('boards.add.help')}
          </Typography>
          <Stack spacing={2.5}>
            {error && <Alert severity="error">{error}</Alert>}
            <TextField
              label={t('boards.add.name')}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Room 105 Board"
              autoFocus
              required
              slotProps={{ htmlInput: { maxLength: 80 } }}
            />
            <TextField select label={t('boards.add.campus')} value={campusId} onChange={(e) => (setCampusId(e.target.value), setRoomId(''))} required>
              {structure.campuses.map((c) => (
                <MenuItem key={c.id} value={c.id}>
                  {c.name}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              label={t('boards.add.room')}
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              helperText={t('boards.add.roomHelp')}
              slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}
            >
              <MenuItem value="">
                <Box component="em" sx={{ color: 'text.secondary', fontStyle: 'normal' }}>
                  {t('boards.add.noRoom')}
                </Box>
              </MenuItem>
              {rooms.map((r) => (
                <MenuItem key={r.id} value={r.id}>
                  {r.name}
                </MenuItem>
              ))}
            </TextField>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} disabled={pending}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" variant="contained" disabled={pending || !name.trim() || !campusId} startIcon={pending ? <CircularProgress size={16} color="inherit" /> : undefined}>
            {t('boards.add.getCode')}
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}

/** Shows a one-time enrolment code with instructions. Used when adding a board and when re-enrolling one. */
export function EnrollmentCodeDialog({ created, timeZone, onClose }: { created: CreatedDevice; timeZone: string; onClose: () => void }) {
  const { t, fmt } = useI18n();
  const [copied, setCopied] = useState(false);
  return (
      <Dialog open onClose={onClose} maxWidth="sm" fullWidth aria-labelledby="code-title">
        <DialogTitle id="code-title">{t('boards.code.title', { name: created.name })}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            {t('boards.code.help')}
          </Typography>
          <Box
            sx={{
              mt: 2.5,
              mb: 1,
              py: 3,
              px: 2,
              borderRadius: '16px',
              bgcolor: 'm3.primaryContainer',
              color: 'm3.onPrimaryContainer',
              textAlign: 'center',
              position: 'relative',
            }}
          >
            <Typography
              data-testid="enrollment-code"
              component="p"
              sx={{ fontSize: { xs: '2rem', sm: '2.75rem' }, lineHeight: 1.2, fontWeight: 500, letterSpacing: '0.12em', fontVariantNumeric: 'tabular-nums', userSelect: 'all' }}
            >
              {created.enrollmentCode}
            </Typography>
            <Typography variant="caption" component="p" sx={{ mt: 1, opacity: 0.85 }}>
              {t('boards.code.expires', { date: fmt.dateTime(created.enrollmentExpiresAt, timeZone) })}
            </Typography>
            <Tooltip title={copied ? t('boards.code.copied') : t('boards.code.copyCode')}>
              <Button
                size="small"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(created.enrollmentCode);
                    setCopied(true);
                  } catch {
                    /* clipboard blocked: the code is selectable */
                  }
                }}
                startIcon={copied ? <CheckOutlined /> : <ContentCopyOutlined />}
                sx={{ position: 'absolute', top: 8, right: 8, color: 'inherit' }}
              >
                {copied ? t('boards.code.copied') : t('boards.code.copy')}
              </Button>
            </Tooltip>
          </Box>
          <Box component="ol" sx={{ pl: 2.5, my: 2, '& li': { mb: 1 }, typography: 'body2' }}>
            <li>{t('boards.code.step1')}</li>
            <li>{t('boards.code.step2')}</li>
            <li>{t('boards.code.step3')}</li>
          </Box>
          <Alert severity="info" variant="outlined" sx={{ borderColor: 'm3.outlineVariant' }}>
            {t('boards.code.private')}
          </Alert>
        </DialogContent>
        <DialogActions>
          <Button variant="contained" onClick={onClose}>
            {t('common.done')}
          </Button>
        </DialogActions>
      </Dialog>
  );
}
