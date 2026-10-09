'use client';

import Typography from '@mui/material/Typography';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import type { ActionResult } from '@/lib/types';

/** Loads a read-only value for a dialog or tab and reloads it after a change. */
export function useRead<T>(load: () => Promise<ActionResult<T>>) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(load, []);
  useEffect(() => {
    let live = true;
    void run().then((r) => {
      if (!live) return;
      if (r.ok) {
        setData(r.data);
        setError(null);
      } else setError(r.error);
    });
    return () => {
      live = false;
    };
  }, [run, tick]);
  return { data, error, reload: () => setTick((n) => n + 1) };
}

/** A small heading inside a dialog or tab. */
export const Heading = ({ children }: { children: ReactNode }) => (
  <Typography variant="h6" sx={{ fontSize: '1.0625rem', mt: 3, mb: 1, '&:first-of-type': { mt: 0 } }}>
    {children}
  </Typography>
);

/** The error of a read, or nothing. */
export const ReadError = ({ message }: { message: string | null }) => (message ? <Typography color="error" role="alert">{message}</Typography> : null);

/** What a file input gives, as base64 (without the data: prefix). */
export function readBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}
