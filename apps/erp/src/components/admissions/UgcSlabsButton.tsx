'use client';

import { Scale } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { loadUgcSlabs } from '@/app/(dashboard)/admissions/desk-actions';
import { Button } from '@/components/shadcn/button';
import { useToast } from '@/components/ui';
import { useI18n } from '@/i18n/client';

/** Adds the UGC refund slabs as the institution's own, to edit (only when none are set). */
export function UgcSlabsButton() {
  const { t } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      variant="outline"
      className="h-9 rounded-md"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await loadUgcSlabs();
          if (!res.ok) return toast.error(res.error);
          toast.success(t('adk.refund.loaded', { n: res.data.added }));
          router.refresh();
        })
      }
    >
      <Scale />
      {t('adk.refund.loadUgc')}
    </Button>
  );
}
