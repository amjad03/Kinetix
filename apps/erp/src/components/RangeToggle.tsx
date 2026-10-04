'use client';

import Check from '@mui/icons-material/Check';
import LinearProgress from '@mui/material/LinearProgress';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';

/** M3 segmented button that sets `?days=`. */
export function RangeToggle({ value, options }: { value: number; options: number[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  return (
    <>
      {pending && <LinearProgress sx={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 2000, height: 3, borderRadius: 0 }} />}
      <ToggleButtonGroup
        exclusive
        value={value}
        aria-label="Time range"
        onChange={(_, v: number | null) => {
          if (!v) return;
          const q = new URLSearchParams(params.toString());
          q.set('days', String(v));
          start(() => router.push(`${pathname}?${q}`, { scroll: false }));
        }}
      >
        {options.map((d) => (
          <ToggleButton key={d} value={d} aria-label={`Last ${d} days`} sx={{ gap: 0.75 }}>
            {value === d && <Check sx={{ fontSize: 18 }} />}
            {d} days
          </ToggleButton>
        ))}
      </ToggleButtonGroup>
    </>
  );
}
