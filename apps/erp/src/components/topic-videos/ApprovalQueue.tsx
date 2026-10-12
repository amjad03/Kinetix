'use client';
import { useState, useTransition } from 'react';
import { FormField, TextInput } from '@/components/ui';
import { reviewVideo } from '@/app/(dashboard)/topic-videos/actions';
import { useI18n } from '@/i18n/client';
import { thumbnail } from '@/lib/concept-videos';
import type { ManagedVideo } from '@/lib/types';

import { Button, Card, Dialog, DialogActions, DialogContent, DialogTitle, Snackbar } from '@/components/kx';
import { Check, X as Close } from 'lucide-react';
/** Teachers' videos waiting for the principal: approve to show them to the whole institution, or reject with a reason. */
export function ApprovalQueue({ items }: { items: ManagedVideo[] }) {
  const { t } = useI18n();
  const [done, setDone] = useState<Set<string>>(new Set());
  const [rejecting, setRejecting] = useState<ManagedVideo | null>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const waiting = items.filter((v) => !done.has(v.id));

  const decide = (v: ManagedVideo, decision: 'approve' | 'reject', why?: string) =>
    start(async () => {
      const res = await reviewVideo(v.id, decision, why);
      if (!res.ok) return setError(res.error);
      setError(null);
      setRejecting(null);
      setReason('');
      setDone((s) => new Set(s).add(v.id));
      setToast(t(decision === 'approve' ? 'tv.approved' : 'tv.rejected', { title: v.title }));
    });

  return (
    <>
      {waiting.length === 0 ? (
        <p className="text-sm leading-[21px] text-muted-foreground" data-testid="queue-empty">
          {t('tv.queueEmpty')}
        </p>
      ) : (
        <div className="flex flex-col gap-3" data-testid="approval-queue">
          {waiting.map((v) => (
            <Card className="p-4 flex gap-4 items-center flex-wrap" key={v.id} data-testid="approval-item">
              <img className="w-[120px] aspect-[16/9] object-cover rounded-[8px] bg-accent" src={thumbnail(v.youtubeVideoId)} alt={t('tv.thumbAlt', { title: v.title })} loading="lazy" referrerPolicy="no-referrer" />
              <div className="flex-[1_1_240px] min-w-0">
                <p className="text-sm leading-[21px] font-medium">{v.title}</p>
                <p className="text-[13px] leading-[19px] text-muted-foreground">
                  {v.topicTitle} · {t('tv.addedBy', { name: v.createdByName ?? '' })}
                  {v.sections.length ? ` · ${t('tv.forClasses', { classes: v.sections.map((s) => s.displayName).join(', ') })}` : ''}
                </p>
              </div>
              <Button startIcon={<Close />} disabled={pending} onClick={() => setRejecting(v)}>
                {t('tv.reject')}
              </Button>
              <Button variant="contained" startIcon={<Check />} disabled={pending} onClick={() => decide(v, 'approve')}>
                {t('tv.approve')}
              </Button>
            </Card>
          ))}
        </div>
      )}
      {error && !rejecting && (
        <p className="text-sm leading-[21px] text-red-ink mt-2" role="alert">
          {error}
        </p>
      )}
      <Dialog open={!!rejecting} onClose={() => setRejecting(null)} fullWidth maxWidth="xs">
        <DialogTitle>{t('tv.reasonTitle', { title: rejecting?.title ?? '' })}</DialogTitle>
        <DialogContent>
          <FormField label={t('tv.reason')}>
            <TextInput autoFocus fullWidth multiline minRows={2} margin="dense" value={reason} onChange={(e) => setReason(e.target.value)} error={!!error} helperText={error ?? undefined} slotProps={{ htmlInput: { maxLength: 500 } }} />
          </FormField>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRejecting(null)}>{t('tv.cancel')}</Button>
          <Button variant="contained" disabled={pending || !reason.trim()} onClick={() => rejecting && decide(rejecting, 'reject', reason)}>
            {t('tv.reject')}
          </Button>
        </DialogActions>
      </Dialog>
      <Snackbar open={!!toast} autoHideDuration={4000} onClose={() => setToast(null)} message={toast} />
    </>
  );
}
