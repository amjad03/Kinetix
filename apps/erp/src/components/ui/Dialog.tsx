'use client';

import Close from '@mui/icons-material/Close';
import Box from '@mui/material/Box';
import MuiDialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import { useId, type ReactNode } from 'react';
import { useI18n } from '@/i18n/client';

/** A modal dialog: focus is trapped and returned by MUI; Escape and the close button dismiss it. */
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
    <MuiDialog open={open} onClose={() => !busy && onClose()} fullWidth maxWidth={size} aria-labelledby={id}>
      <DialogTitle id={id} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, fontSize: '1.25rem', fontWeight: 600, lineHeight: '28px' }}>
        {title}
        <IconButton onClick={onClose} disabled={busy} aria-label={t('common.close')} edge="end" size="small">
          <Close />
        </IconButton>
      </DialogTitle>
      <DialogContent>{children}</DialogContent>
      {actions && <DialogActions>{actions}</DialogActions>}
    </MuiDialog>
  );
}

/** A side sheet for details and long forms: from the right on a tablet or desktop, full width on a phone. */
export function Sheet({ open, title, subtitle, children, actions, onClose, width = 480 }: { open: boolean; title: string; subtitle?: ReactNode; children: ReactNode; actions?: ReactNode; onClose: () => void; width?: number }) {
  const { t } = useI18n();
  const id = useId();
  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      slotProps={{ paper: { 'aria-labelledby': id, sx: { width: { xs: '100%', sm: width }, maxWidth: '100%', bgcolor: 'kx.pane', backgroundImage: 'none' } } as never }}
    >
      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 2, px: 3, pt: 2.5, pb: 1.5, borderBottom: 1, borderColor: 'm3.outlineVariant' }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography id={id} variant="h6" component="h2" sx={{ fontWeight: 600 }}>
            {title}
          </Typography>
          {subtitle && (
            <Typography variant="body2" color="text.secondary">
              {subtitle}
            </Typography>
          )}
        </Box>
        <IconButton onClick={onClose} aria-label={t('common.close')} edge="end">
          <Close />
        </IconButton>
      </Box>
      <Box sx={{ flex: 1, overflowY: 'auto', px: 3, py: 2.5 }}>{children}</Box>
      {actions && <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, px: 3, py: 2, borderTop: 1, borderColor: 'm3.outlineVariant' }}>{actions}</Box>}
    </Drawer>
  );
}
