'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

/** Refreshes the attendance page when a board marks attendance for the day shown (see /api/attendance-live). Renders nothing. */
export function LiveAttendance({ date }: { date: string }) {
  const router = useRouter();
  useEffect(() => {
    if (typeof EventSource === 'undefined') return;
    const es = new EventSource('/api/attendance-live');
    let timer: ReturnType<typeof setTimeout> | undefined;
    es.onmessage = (m) => {
      try {
        const e = JSON.parse(m.data) as { type?: string; date?: string | null };
        if (e.type !== 'attendance' || (e.date && e.date !== date)) return;
        // Many marks arrive together when a class is taken: refresh once.
        clearTimeout(timer);
        timer = setTimeout(() => router.refresh(), 800);
      } catch {
        /* ignore a malformed event */
      }
    };
    return () => {
      clearTimeout(timer);
      es.close();
    };
  }, [date, router]);
  return null;
}
