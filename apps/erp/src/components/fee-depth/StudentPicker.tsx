'use client';

import { Search } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { deskRead } from '@/app/(dashboard)/accounts/actions';
import { Input } from '@/components/shadcn/input';
import { useI18n } from '@/i18n/client';
import type { StudentHit } from '@/lib/fee-depth';

/**
 * Finds a student by name, roll number or a receipt number they paid on, with what each owes; arrow keys and
 * Enter pick one. Used by the counter, challans and other fee forms.
 */
export function StudentPicker({ onPick, autoFocus, label }: { onPick: (s: StudentHit) => void; autoFocus?: boolean; label?: string }) {
  const { t, fmt } = useI18n();
  const id = useId();
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<StudentHit[]>([]);
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    const text = q.trim();
    if (text.length < 2) return;
    const mine = ++seq.current;
    const timer = setTimeout(async () => {
      const res = await deskRead<StudentHit[]>(`/v1/fee-collect/students?q=${encodeURIComponent(text)}`);
      if (mine !== seq.current) return;
      setHits(res.ok ? res.data : []);
      setActive(0);
      setOpen(true);
    }, 200);
    return () => clearTimeout(timer);
  }, [q]);

  const pick = (s: StudentHit) => {
    onPick(s);
    setQ('');
    setHits([]);
    setOpen(false);
  };

  return (
    <div className="relative w-full max-w-xl">
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium">
        {label ?? t('fx.findStudent')}
      </label>
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          id={id}
          className="h-9 pl-9"
          value={q}
          autoFocus={autoFocus}
          autoComplete="off"
          placeholder={t('fx.findStudentHint')}
          role="combobox"
          aria-expanded={open && hits.length > 0}
          aria-controls={`${id}-list`}
          onChange={(e) => {
            setQ(e.target.value);
            if (e.target.value.trim().length < 2) {
              setHits([]);
              setOpen(false);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, hits.length - 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === 'Enter' && hits[active]) {
              e.preventDefault();
              pick(hits[active]);
            } else if (e.key === 'Escape') setOpen(false);
          }}
          data-testid="student-picker"
        />
      </div>
      {open && q.trim().length >= 2 && (
        <ul id={`${id}-list`} role="listbox" className="absolute z-30 mt-1 max-h-80 w-full overflow-y-auto rounded-md border bg-popover p-1 shadow-md">
          {hits.length === 0 && <li className="px-3 py-2 text-sm text-muted-foreground">{t('fx.noStudentFound')}</li>}
          {hits.map((s, i) => (
            <li
              key={s.id}
              role="option"
              aria-selected={i === active}
              className={`flex cursor-pointer items-center justify-between gap-3 rounded px-3 py-2 text-sm ${i === active ? 'bg-muted' : ''}`}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(s);
              }}
            >
              <span className="min-w-0">
                <b className="block truncate font-[550]">{s.fullName}</b>
                <small className="block truncate text-xs text-muted-foreground">
                  {s.rollNo} · {s.section}
                </small>
              </span>
              <span className={`shrink-0 tabular-nums ${s.duePaise > 0 ? 'font-medium' : 'text-muted-foreground'}`}>{s.duePaise > 0 ? fmt.rupees(s.duePaise) : t('fx.nothingDue')}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
