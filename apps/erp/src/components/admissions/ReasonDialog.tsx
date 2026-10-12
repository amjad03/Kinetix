'use client';
import { useState, useTransition, type ReactNode } from 'react';
import { FormField, TextInput } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { ActionResult } from '@/lib/types';

import { Alert, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle } from '@/components/kx';
/**
 * Asks for a reason (or a note) before a change that goes on the permanent record, then runs
 * `onSubmit`. Closes on success; shows the API's message otherwise.
 */
export function ReasonDialog({
  title,
  help,
  label,
  required,
  confirm,
  extra,
  onSubmit,
  onClose,
}: {
  title: string;
  help?: string;
  label: string;
  required: boolean;
  confirm: string;
  extra?: ReactNode;
  onSubmit: (reason: string) => Promise<ActionResult<unknown>>;
  onClose: (done: boolean) => void;
}) {
  const { t } = useI18n();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const ready = !required || reason.trim().length >= 3;
  return (
    <Dialog open onClose={pending ? undefined : () => onClose(false)} maxWidth="xs" fullWidth>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!ready) return;
          setError(null);
          start(async () => {
            const res = await onSubmit(reason);
            if (res.ok) onClose(true);
            else setError(res.error);
          });
        }}
      >
        <DialogTitle>{title}</DialogTitle>
        <DialogContent>
          <div className="flex flex-col gap-4 pt-1">
            {help && (
              <p className="text-[13px] leading-[19px] text-muted-foreground">
                {help}
              </p>
            )}
            {error && <Alert severity="error">{error}</Alert>}
            {extra}
            <FormField label={label} required={required}>
              <TextInput value={reason} onChange={(e) => setReason(e.target.value)} required={required} multiline minRows={2} autoFocus slotProps={{ htmlInput: { maxLength: 500 } }} />
            </FormField>
          </div>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => onClose(false)} disabled={pending}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" variant="contained" disabled={pending || !ready} startIcon={pending ? <CircularProgress size={16} color="inherit" /> : undefined}>
            {confirm}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
