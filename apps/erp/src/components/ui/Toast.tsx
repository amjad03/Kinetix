'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { toast } from 'sonner';

type Kind = 'success' | 'error' | 'info' | 'warning';
interface ToastApi {
  show: (message: string, kind?: Kind) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
}

const Ctx = createContext<ToastApi | null>(null);

/**
 * Short, polite confirmations ("Saved", "Exported 120 rows") through the app's sonner toaster.
 * Errors stay longer. Mounted once in the app shell; call `useToast()` from any client component.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const api = useMemo<ToastApi>(() => {
    const show = (message: string, kind: Kind = 'success') => void toast[kind](message, { duration: kind === 'error' ? 8000 : 4000 });
    return { show, success: (m) => show(m, 'success'), error: (m) => show(m, 'error'), info: (m) => show(m, 'info') };
  }, []);
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
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
