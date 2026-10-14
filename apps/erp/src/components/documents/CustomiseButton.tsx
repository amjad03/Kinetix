'use client';
import { Loader2, Paintbrush } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { duplicateDesign } from '@/app/(dashboard)/documents/designs-actions';
import { Button } from '@/components/kx';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import type { DocTemplateSummary } from '@/lib/doc-designs';

/**
 * Opens a design in the editor. A system design is copied first (presets stay unchanged), named
 * after its style, and the copy opens.
 */
export function CustomiseButton({ design, variant = 'outlined', size = 'medium' }: { design: DocTemplateSummary; variant?: 'outlined' | 'contained' | 'text'; size?: 'small' | 'medium' }) {
  const { t } = useI18n();
  const router = useRouter();
  const [busy, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const open = () =>
    start(async () => {
      if (!design.system) return router.push(`/documents/templates/${design.id}/edit`);
      const r = await duplicateDesign(design.id, t('de.copyName', { style: t(`dt.style.${design.style}` as MessageKey) }));
      if (r.ok) router.push(`/documents/templates/${r.data.id}/edit`);
      else setError(r.error);
    });
  return (
    <>
      <Button size={size} variant={variant} startIcon={busy ? <Loader2 className="size-4 animate-spin" /> : <Paintbrush className="size-4" />} disabled={busy} onClick={open} data-testid="customise" title={error ?? undefined}>
        {design.system ? t('de.customise') : t('de.edit')}
      </Button>
      {error && (
        <span role="alert" className="text-[12px] text-destructive">
          {error}
        </span>
      )}
    </>
  );
}
