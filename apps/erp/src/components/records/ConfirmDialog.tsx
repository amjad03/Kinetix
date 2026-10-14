'use client';

import { useId, useState, type ReactNode } from 'react';
import { Button } from '@/components/shadcn/button';
import { Input } from '@/components/shadcn/input';
import { Dialog } from '@/components/ui/Dialog';
import { useI18n } from '@/i18n/client';

/**
 * Asks before something happens. With `typeToConfirm` the confirm button stays off until the person types that word
 * (the number of records, for a destructive bulk action), so a slip of the mouse cannot delete 300 students.
 */
export function ConfirmDialog({
  title,
  children,
  confirmLabel,
  tone,
  typeToConfirm,
  busy,
  onConfirm,
  onClose,
}: {
  title: string;
  children?: ReactNode;
  confirmLabel: string;
  tone?: 'danger';
  typeToConfirm?: string;
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const id = useId();
  const [typed, setTyped] = useState('');
  const ready = !typeToConfirm || typed.trim().toLowerCase() === typeToConfirm.toLowerCase();
  return (
    <Dialog
      title={title}
      onClose={onClose}
      busy={busy}
      actions={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            {t('common.cancel')}
          </Button>
          <Button variant={tone === 'danger' ? 'destructive' : 'default'} onClick={onConfirm} disabled={!ready || busy} data-testid="confirm">
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="grid gap-3 text-[14px] leading-6">
        {children}
        {typeToConfirm && (
          <form
            className="grid gap-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              if (ready && !busy) onConfirm();
            }}
          >
            <label htmlFor={id} className="text-[13px] font-semibold">
              {t('rk.confirm.type', { word: typeToConfirm })}
            </label>
            <Input id={id} value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" autoFocus inputMode={/^\d+$/.test(typeToConfirm) ? "numeric" : undefined} data-testid="type-to-confirm" />
          </form>
        )}
      </div>
    </Dialog>
  );
}
