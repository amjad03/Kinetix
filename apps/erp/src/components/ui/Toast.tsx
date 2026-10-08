'use client';

import Alert from '@mui/material/Alert';
import Snackbar from '@mui/material/Snackbar';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

type Kind = 'success' | 'error' | 'info' | 'warning';
interface ToastApi {
  show: (message: string, kind?: Kind) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
}

const Ctx = createContext<ToastApi | null>(null);

/**
 * Short, polite confirmations ("Saved", "Exported 120 rows"). Errors stay longer. Mounted once in
 * the app shell; call `useToast()` from any client component. Announced to screen readers (role=status / alert).
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{ id: number; message: string; kind: Kind } | null>(null);
  const show = useCallback((message: string, kind: Kind = 'success') => setToast({ id: Date.now(), message, kind }), []);
  const api = useMemo<ToastApi>(() => ({ show, success: (m) => show(m, 'success'), error: (m) => show(m, 'error'), info: (m) => show(m, 'info') }), [show]);
  return (
    <Ctx.Provider value={api}>
      {children}
      <Snackbar
        key={toast?.id}
        open={!!toast}
        autoHideDuration={toast?.kind === 'error' ? 8000 : 4000}
        onClose={(_, reason) => reason !== 'clickaway' && setToast(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        {toast ? (
          <Alert severity={toast.kind} variant="filled" onClose={() => setToast(null)} role={toast.kind === 'error' ? 'alert' : 'status'} sx={{ alignItems: 'center', boxShadow: 'var(--kx-elev-raised)' }}>
            {toast.message}
          </Alert>
        ) : undefined}
      </Snackbar>
    </Ctx.Provider>
  );
}

/** Like `useToast`, but null outside the provider (shared components that may render anywhere). */
export function useToastOptional(): ToastApi | null {
  return useContext(Ctx);
}

export function useToast(): ToastApi {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useToast outside ToastProvider');
  return ctx;
}
