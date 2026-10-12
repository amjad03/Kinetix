'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react';
import { Toaster } from '@/components/shadcn/sonner';
import { TooltipProvider } from '@/components/shadcn/tooltip';
import type { Locale } from '@/i18n/locales';

export type Mode = 'light' | 'dark' | 'system';
const KEY = 'kx-mode';

/** Runs before paint (in <head>) so the first frame already has the right `dark` class. */
export const MODE_SCRIPT = `(function(){try{var m=localStorage.getItem('${KEY}')||'system';var d=m==='dark'||(m==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d)}catch(e){}})()`;

interface ModeApi {
  mode: Mode;
  systemMode: 'light' | 'dark';
  setMode: (m: Mode) => void;
}
const Ctx = createContext<ModeApi>({ mode: 'system', systemMode: 'light', setMode: () => {} });

/** The colour scheme (light, dark or follow the system), kept in localStorage and applied as the `dark` class on <html>. */
export function useColorScheme(): ModeApi {
  return useContext(Ctx);
}

// The saved mode and the system's scheme as external stores (read after hydration, 'system'/'light' on the server).
const listeners = new Set<() => void>();
function subscribeMode(cb: () => void) {
  listeners.add(cb);
  window.addEventListener('storage', cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener('storage', cb);
  };
}
function readMode(): Mode {
  try {
    const m = localStorage.getItem(KEY);
    return m === 'light' || m === 'dark' ? m : 'system';
  } catch {
    return 'system';
  }
}
function subscribeSystem(cb: () => void) {
  const mq = matchMedia('(prefers-color-scheme: dark)');
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
}
const readSystem = (): 'light' | 'dark' => (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');

export function ThemeRegistry({ children }: { locale?: Locale; children: ReactNode }) {
  const mode = useSyncExternalStore(subscribeMode, readMode, () => 'system' as Mode);
  const systemMode = useSyncExternalStore(subscribeSystem, readSystem, () => 'light' as const);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', (mode === 'system' ? systemMode : mode) === 'dark');
  }, [mode, systemMode]);

  const setMode = useCallback((m: Mode) => {
    try {
      localStorage.setItem(KEY, m);
    } catch {}
    listeners.forEach((l) => l());
  }, []);

  const api = useMemo(() => ({ mode, systemMode, setMode }), [mode, systemMode, setMode]);
  return (
    <Ctx.Provider value={api}>
      <TooltipProvider delayDuration={400}>
        {children}
        <Toaster position="bottom-center" />
      </TooltipProvider>
    </Ctx.Provider>
  );
}
