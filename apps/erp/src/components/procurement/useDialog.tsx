'use client';

import { useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { FormDialog, type Field } from '@/components/ops/kit';
import { useToast } from '@/components/ui';
import type { ActionResult } from '@/lib/types';

/** A form dialog opened from a row action, a bulk action or a toolbar button. */
export interface DialogSpec {
  title: string;
  fields: Field[];
  intro?: ReactNode;
  submitLabel?: string;
  run: (v: Record<string, string>) => Promise<ActionResult<unknown>>;
  /** Said after it worked (default: the dialog's "saved"). */
  done?: string;
}

/**
 * One form dialog at a time for a list's actions: `open(spec)` shows it; after the action works the toast says so
 * and the page reloads its data (the server actions also revalidate their page).
 */
export function useDialog(): [(spec: DialogSpec) => void, ReactNode] {
  const [spec, setSpec] = useState<DialogSpec | null>(null);
  const toast = useToast();
  const router = useRouter();
  const node = spec ? (
    <FormDialog
      title={spec.title}
      fields={spec.fields}
      intro={spec.intro}
      submitLabel={spec.submitLabel}
      onSubmit={spec.run}
      onClose={(msg) => {
        setSpec(null);
        if (msg) {
          toast.success(spec.done ?? msg);
          router.refresh();
        }
      }}
    />
  ) : null;
  return [setSpec, node];
}

/** Runs an action without a form, then says so and reloads. */
export function useRun() {
  const toast = useToast();
  const router = useRouter();
  return async (run: () => Promise<ActionResult<unknown>>, done: string) => {
    const r = await run();
    if (!r.ok) return toast.error(r.error);
    toast.success(done);
    router.refresh();
  };
}
