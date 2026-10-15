'use client';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { rotateSigningKey } from '@/app/(dashboard)/devices/actions';
import { useI18n } from '@/i18n/client';
import type { SigningKeyInfo } from '@/lib/staff-changes';

import { Alert, Button } from '@/components/kx';
/** The institution's offline pairing key: boards get signed codes while online, and the Teacher App checks them against it. */
export function OfflineKeyCard({ info, canRotate }: { info: SigningKeyInfo; canRotate: boolean }) {
  const { t, fmt } = useI18n();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="rounded-[12px] border bg-card p-4 mb-4" data-testid="offline-key">
      <div className="flex flex-col sm:flex-row gap-4 sm:items-center justify-between">
        <div>
          <h6 className="text-sm leading-5 font-medium tracking-[0.1px]">{t('as.off.title')}</h6>
          <p className="text-[13px] leading-[19px] text-muted-foreground">
            {t('as.off.help')}
          </p>
          <span className="text-xs leading-4 tracking-[0.3px] text-muted-foreground">
            {t('as.off.keyId')}: {info.keyId} · {info.algorithm} · {t('as.off.created')} {fmt.date(info.createdAt.slice(0, 10), 'day')}
          </span>
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
      </div>
      {error && <Alert className="mt-2" severity="error">{error}</Alert>}
    </div>
  );
}
