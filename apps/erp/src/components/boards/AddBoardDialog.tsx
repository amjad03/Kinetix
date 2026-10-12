'use client';
import { useState, useTransition } from 'react';
import { FormField, TextInput } from '@/components/ui';
import { addBoard } from '@/app/(dashboard)/boards/actions';
import { useI18n } from '@/i18n/client';
import type { CreatedDevice, Structure } from '@/lib/types';

import { Alert, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Tooltip } from '@/components/kx';
import { Check as CheckOutlined, Copy as ContentCopyOutlined, Plus as Add } from 'lucide-react';
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
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <DialogTitle id="add-board-title">{t('boards.add.title')}</DialogTitle>
        <DialogContent>
          <p className="text-[13px] leading-[19px] text-muted-foreground mb-5">
            {t('boards.add.help')}
          </p>
          <div className="flex flex-col gap-5">
            {error && <Alert severity="error">{error}</Alert>}
            <FormField label={t('boards.add.name')} required>
              <TextInput
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Room 105 Board"
                autoFocus
                required
                slotProps={{ htmlInput: { maxLength: 80 } }}
              />
            </FormField>
            <FormField label={t('boards.add.campus')} required>
              <TextInput select value={campusId} onChange={(e) => (setCampusId(e.target.value), setRoomId(''))} required>
                {structure.campuses.map((c) => (
                  <MenuItem key={c.id} value={c.id}>
                    {c.name}
                  </MenuItem>
                ))}
              </TextInput>
            </FormField>
            <FormField label={t('boards.add.room')}>
              <TextInput
                select
                value={roomId}
                onChange={(e) => setRoomId(e.target.value)}
                helperText={t('boards.add.roomHelp')}
                slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}
              >
                <MenuItem value="">
                  <em className="text-muted-foreground not-italic">
                    {t('boards.add.noRoom')}
                  </em>
                </MenuItem>
                {rooms.map((r) => (
                  <MenuItem key={r.id} value={r.id}>
                    {r.name}
                  </MenuItem>
                ))}
              </TextInput>
            </FormField>
          </div>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} disabled={pending}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" variant="contained" disabled={pending || !name.trim() || !campusId} startIcon={pending ? <CircularProgress size={16} color="inherit" /> : undefined}>
            {t('boards.add.getCode')}
          </Button>
        </DialogActions>
      </form>
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
          <p className="text-[13px] leading-[19px] text-muted-foreground">
            {t('boards.code.help')}
          </p>
          <div className="mt-5 mb-2 py-6 px-4 rounded-[16px] bg-teal-soft text-teal-ink text-center relative"
          >
            <p className="text-[2rem] sm:text-[2.75rem] leading-[1.2] font-medium tracking-[0.12em] tabular-nums select-all"
              data-testid="enrollment-code"
            >
              {created.enrollmentCode}
            </p>
            <p className="text-xs leading-4 tracking-[0.3px] mt-2 opacity-[0.85]">
              {t('boards.code.expires', { date: fmt.dateTime(created.enrollmentExpiresAt, timeZone) })}
            </p>
            <Tooltip title={copied ? t('boards.code.copied') : t('boards.code.copyCode')}>
              <Button className="absolute top-[8px] right-[8px] text-inherit"
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
              >
                {copied ? t('boards.code.copied') : t('boards.code.copy')}
              </Button>
            </Tooltip>
          </div>
          <ol className="pl-5 my-4 [&_li]:mb-2 text-[13px] leading-[19px]">
            <li>{t('boards.code.step1')}</li>
            <li>{t('boards.code.step2')}</li>
            <li>{t('boards.code.step3')}</li>
          </ol>
          <Alert className="border-border" severity="info" variant="outlined">
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
