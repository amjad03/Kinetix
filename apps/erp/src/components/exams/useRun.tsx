'use client';
import { useState, useTransition, type ReactNode } from 'react';
import type { ActionResult } from '@/lib/types';

import { Alert, Snackbar } from '@/components/kx';
/** Runs a server action, then shows its error inline or a short confirmation. */
export function useRun(): { pending: boolean; run: <T>(fn: () => Promise<ActionResult<T>>, done?: string, after?: (d: T) => void) => void; feedback: ReactNode } {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  return {
    pending,
    run: (fn, done, after) =>
      start(async () => {
        setError(null);
        const res = await fn();
        if (res.ok) {
          if (done) setToast(done);
          after?.(res.data);
        } else setError(res.error);
      }),
    feedback: (
      <>
        {error && (
          <Alert className="my-3" severity="error" onClose={() => setError(null)} role="alert">
            {error}
          </Alert>
        )}
        <Snackbar open={!!toast} autoHideDuration={5000} onClose={() => setToast(null)} message={toast} anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }} />
      </>
    ),
  };
}
