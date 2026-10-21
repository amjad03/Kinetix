'use client';
import { useState, useTransition } from 'react';
import { reviewMaterial } from '@/app/(dashboard)/zynetix/actions';
import { Button } from '@/components/kx';
import { Card, StatusPill, useToast } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { PendingMaterial } from '@/lib/zynetix';
import { KIND_LABEL } from './MaterialDialog';

/** Teachers' materials waiting for the institution's approval. */
export function PendingMaterials({ items }: { items: PendingMaterial[] }) {
  const { t } = useI18n();
  const toast = useToast();
  const [done, setDone] = useState<string[]>([]);
  const [busy, start] = useTransition();
  const left = items.filter((m) => !done.includes(m.id));
  if (left.length === 0) return null;
  const decide = (m: PendingMaterial, approve: boolean) => {
    const reason = approve ? undefined : (window.prompt(t('zx.mat.rejectWhy')) ?? '');
    if (!approve && !reason?.trim()) return;
    start(async () => {
      const res = await reviewMaterial(m.id, approve, reason);
      if (!res.ok) return toast.error(res.error);
      setDone((d) => [...d, m.id]);
      toast.success(t(approve ? 'zx.mat.approved' : 'zx.mat.rejected'));
    });
  };
  return (
    <Card title={t('zx.lib.pending', { n: left.length })} testId="zx-pending" className="mb-4">
      <ul className="m-0 grid list-none gap-2 p-0">
        {left.map((m) => (
          <li key={m.id} className="flex flex-wrap items-center gap-2 text-sm">
            <StatusPill tone="info">{t(KIND_LABEL[m.kind])}</StatusPill>
            <span className="min-w-0 flex-1">
              <b className="font-medium">{m.title}</b> <span className="text-muted-foreground">· {m.topic.title}</span>
            </span>
            <Button size="small" variant="outlined" disabled={busy} onClick={() => decide(m, true)}>
              {t('zx.mat.approve')}
            </Button>
            <Button size="small" color="error" disabled={busy} onClick={() => decide(m, false)}>
              {t('zx.mat.reject')}
            </Button>
          </li>
        ))}
      </ul>
    </Card>
  );
}
