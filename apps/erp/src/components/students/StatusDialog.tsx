'use client';
import { useState, useTransition } from 'react';
import { changeStudentStatus } from '@/app/(dashboard)/students/actions';
import { FormField, TextInput } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';

import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle } from '@/components/kx';
/**
 * A status change that goes on the permanent record: the reason, the day it takes effect, and for
 * a leave of absence or suspension the day the student returns.
 */
export function StatusDialog({ studentId, status, withReturn, onClose }: { studentId: string; status: string; withReturn: boolean; onClose: (done: boolean) => void }) {
  const { t } = useI18n();
  const [reason, setReason] = useState('');
  const [effectiveOn, setEffectiveOn] = useState('');
  const [returnOn, setReturnOn] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const needsReturn = status === 'on_leave';
  const ready = reason.trim().length >= 3 && (!needsReturn || returnOn !== '');
  return (
    <Dialog open onClose={pending ? undefined : () => onClose(false)} maxWidth="xs" fullWidth>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!ready) return;
          setError(null);
          start(async () => {
            const res = await changeStudentStatus(studentId, status, reason, { effectiveOn: effectiveOn || undefined, returnOn: returnOn || undefined });
            if (res.ok) onClose(true);
            else setError(res.error);
          });
        }}
      >
        <DialogTitle>{t(`stu.moveTo.${status}` as MessageKey)}</DialogTitle>
        <DialogContent>
          <div className="flex flex-col gap-4 pt-1">
            <p className="text-[13px] leading-[19px] text-muted-foreground">
              {t('stu.reasonHelp')}
            </p>
            {error && <Alert severity="error">{error}</Alert>}
            <FormField label={t('adm.field.reason')} required>
              <TextInput value={reason} onChange={(e) => setReason(e.target.value)} required multiline minRows={2} autoFocus slotProps={{ htmlInput: { maxLength: 500 } }} />
            </FormField>
            <FormField label={t('stu.effectiveOn')} helper={t('stu.effectiveOnHelp')}>
              <TextInput type="date" value={effectiveOn} onChange={(e) => setEffectiveOn(e.target.value)} />
            </FormField>
            {withReturn && (
              <FormField label={t('stu.returnOn')} required={needsReturn}>
                <TextInput type="date" value={returnOn} onChange={(e) => setReturnOn(e.target.value)} required={needsReturn} />
              </FormField>
            )}
          </div>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => onClose(false)} disabled={pending}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" variant="contained" disabled={pending || !ready}>
            {t('common.save')}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
