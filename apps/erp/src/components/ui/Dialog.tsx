'use client';

import { X } from 'lucide-react';
import { useId, type ReactNode } from 'react';
import { Dialog as KxDialog, DialogActions, DialogContent, DialogTitle, IconButton } from '@/components/kx';
import { Sheet as ShadSheet, SheetContent, SheetDescription, SheetTitle } from '@/components/shadcn/sheet';
import { useI18n } from '@/i18n/client';

/** A modal dialog: focus is trapped and returned; Escape and the close button dismiss it. */
export function Dialog({
  open = true,
  title,
  children,
  actions,
  onClose,
  size = 'sm',
  busy,
}: {
  open?: boolean;
  title: string;
  children: ReactNode;
  actions?: ReactNode;
  onClose: () => void;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  /** While true the dialog cannot be dismissed (a save is running). */
  busy?: boolean;
}) {
  const { t } = useI18n();
  const id = useId();
  return (
    <KxDialog open={open} onClose={() => !busy && onClose()} fullWidth maxWidth={size} aria-labelledby={id}>
      <DialogTitle id={id} className="flex items-center justify-between gap-4 text-xl leading-7 font-semibold">
        {title}
        <IconButton onClick={onClose} disabled={busy} aria-label={t('common.close')} edge="end" size="small">
          <X />
        </IconButton>
      </DialogTitle>
      <DialogContent>{children}</DialogContent>
      {actions && <DialogActions>{actions}</DialogActions>}
    </KxDialog>
  );
}

const WIDTH: Record<number, string> = { 420: 'sm:max-w-[420px]', 480: 'sm:max-w-[480px]', 520: 'sm:max-w-[520px]', 560: 'sm:max-w-[560px]', 600: 'sm:max-w-[600px]', 640: 'sm:max-w-[640px]', 720: 'sm:max-w-[720px]' };

/** A side sheet for details and long forms: from the right on a tablet or desktop, full width on a phone. */
export function Sheet({ open, title, subtitle, children, actions, onClose, width = 480 }: { open: boolean; title: string; subtitle?: ReactNode; children: ReactNode; actions?: ReactNode; onClose: () => void; width?: number }) {
  const { t } = useI18n();
  return (
    <ShadSheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" showCloseButton={false} {...(subtitle ? {} : { "aria-describedby": undefined })} className={`w-full max-w-full gap-0 bg-card p-0 ${WIDTH[width] ?? 'sm:max-w-[480px]'}`} style={WIDTH[width] ? undefined : { maxWidth: `min(100%, ${width}px)` }}>
        <div className="flex items-start justify-between gap-4 border-b px-6 pt-5 pb-3">
          <div className="min-w-0">
            <SheetTitle className="text-base leading-6 font-semibold">{title}</SheetTitle>
            {subtitle && <SheetDescription className="text-[13px] text-muted-foreground">{subtitle}</SheetDescription>}
          </div>
          <IconButton onClick={onClose} aria-label={t('common.close')} edge="end">
            <X />
          </IconButton>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {actions && <div className="flex justify-end gap-2 border-t px-6 py-4">{actions}</div>}
      </SheetContent>
    </ShadSheet>
  );
}
