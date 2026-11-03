'use client';

import { BookmarkPlus, RotateCw, X } from 'lucide-react';
import { useState, useTransition } from 'react';
import { myLibrary, reserveBook } from '@/app/(dashboard)/library/opac/actions';
import { Button } from '@/components/shadcn/button';
import { Dialog, TextInput, useToast } from '@/components/ui';
import { useI18n } from '@/i18n/client';

/** "Reserve" on an OPAC result: for oneself, or for a member's card at the desk. */
export function ReserveButton({ bookId, title, desk }: { bookId: string; title: string; desk: boolean }) {
  const { t } = useI18n();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [card, setCard] = useState('');
  const [error, setError] = useState('');
  const [busy, start] = useTransition();
  const send = (code: string) =>
    start(async () => {
      const res = await reserveBook(bookId, code);
      if (!res.ok) return setError(res.error);
      setOpen(false);
      setCard('');
      setError('');
      toast.success(t('lp.opac.reserved', { title }));
    });
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => (desk ? setOpen(true) : send(''))} disabled={busy} data-testid={`opac-reserve-${bookId}`}>
        <BookmarkPlus />
        {t('lp.opac.reserve')}
      </Button>
      {!desk && error && <p className="m-0 text-xs text-destructive">{error}</p>}
      {desk && open && (
        <Dialog
          title={t('lp.opac.reserveTitle', { title })}
          onClose={() => setOpen(false)}
          busy={busy}
          size="xs"
          actions={
            <>
              <Button variant="outline" onClick={() => send('')} disabled={busy}>
                {t('lp.opac.forMe')}
              </Button>
              <Button onClick={() => send(card)} disabled={busy || !card.trim()} data-testid="opac-reserve-go">
                {t('lp.opac.reserve')}
              </Button>
            </>
          }
        >
          <p className="mt-0 text-sm text-muted-foreground">{t('lp.opac.reserveHint')}</p>
          <TextInput label={t('lp.opac.card')} value={card} onChange={(e) => setCard(e.target.value)} error={!!error} helperText={error || undefined} autoFocus fullWidth />
        </Dialog>
      )}
    </>
  );
}

/** Renew a loan or cancel a reservation of one's own. */
export function MineButton({ kind, id }: { kind: 'renew' | 'cancel'; id: string }) {
  const { t } = useI18n();
  const toast = useToast();
  const [busy, start] = useTransition();
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={busy}
      data-testid={`opac-${kind}-${id}`}
      onClick={() =>
        start(async () => {
          const res = await myLibrary(kind, id);
          if (!res.ok) toast.error(res.error);
          else toast.success(kind === 'renew' ? t('lp.opac.renewed') : t('lp.opac.cancelled'));
        })
      }
    >
      {kind === 'renew' ? <RotateCw /> : <X />}
      {kind === 'renew' ? t('lp.opac.renew') : t('common.cancel')}
    </Button>
  );
}
