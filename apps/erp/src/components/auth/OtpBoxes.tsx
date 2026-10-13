'use client';

import { useRef, useState } from 'react';

export function OtpBoxesClient({ name, label }: { name: string; label: string }) {
  const [v, setV] = useState<string[]>(['', '', '', '', '', '']);
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const set = (i: number, d: string) => setV((x) => x.map((c, j) => (j === i ? d : c)));
  return (
    <div role="group" aria-label={label} className="flex gap-2">
      <input type="hidden" name={name} value={v.join('')} />
      {v.map((c, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          value={c}
          inputMode="numeric"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          maxLength={1}
          aria-label={`${label} ${i + 1}`}
          data-testid={`otp-${i}`}
          className="h-12 w-full min-w-0 rounded-lg border bg-background text-center text-lg font-semibold outline-none focus:border-teal focus:ring-2 focus:ring-teal/30"
          onChange={(e) => {
            const d = e.target.value.replace(/\D/g, '').slice(-1);
            set(i, d);
            if (d) refs.current[i + 1]?.focus();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Backspace' && !c) refs.current[i - 1]?.focus();
          }}
          onPaste={(e) => {
            const t = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
            if (!t) return;
            e.preventDefault();
            setV(Array.from({ length: 6 }, (_, j) => t[j] ?? ''));
            refs.current[Math.min(t.length, 5)]?.focus();
          }}
        />
      ))}
    </div>
  );
}
