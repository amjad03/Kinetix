'use client';

import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { rotateSigningKey } from '@/app/(dashboard)/devices/actions';
import { useI18n } from '@/i18n/client';
import type { SigningKeyInfo } from '@/lib/staff-changes';

/** The institution's offline pairing key: boards get signed codes while online, and the Teacher App checks them against it. */
export function OfflineKeyCard({ info, canRotate }: { info: SigningKeyInfo; canRotate: boolean }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <Paper variant="outlined" sx={{ p: 2, mb: 2 }} data-testid="offline-key">
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ alignItems: { sm: 'center' }, justifyContent: 'space-between' }}>
        <div>
          <Typography variant="subtitle2">{t('as.off.title')}</Typography>
          <Typography variant="body2" color="text.secondary">
            {t('as.off.help')}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {t('as.off.keyId')}: {info.keyId} · {info.algorithm} · {t('as.off.created')} {new Date(info.createdAt).toLocaleDateString(locale)}
          </Typography>
        </div>
        {canRotate && (
          <Button
            variant="outlined"
            color="warning"
            disabled={pending}
            onClick={() => {
              if (!window.confirm(t('as.off.rotateWarn'))) return;
              start(async () => {
                const res = await rotateSigningKey();
                if (res.ok) router.refresh();
                else setError(res.error);
              });
            }}
          >
            {t('as.off.rotate')}
          </Button>
        )}
      </Stack>
      {error && <Alert severity="error" sx={{ mt: 1 }}>{error}</Alert>}
    </Paper>
  );
}
