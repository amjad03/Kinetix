'use client';

import { BookCheck, BookDown, CreditCard, LogOut, Undo2 } from 'lucide-react';
import { useEffect, useRef, useState, useTransition } from 'react';
import { readLht, runLht } from '@/app/(dashboard)/lht-actions';
import { Button } from '@/components/shadcn/button';
import { Card, StatusPill } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import { KIOSK_IDLE_MS, kioskTags } from '@/lib/library-pass';

interface Reader {
  cardNo: string;
  fullName: string;
  status: string;
  out: number;
  overdue: number;
  unpaidPaise: number;
  loans: { id: string; title: string; accessionNo: string | null; dueOn: string; overdue: boolean }[];
}
interface Line {
  code: string;
  ok: boolean;
  dueOn?: string;
  finePaise?: number;
  message?: string;
}

/**
 * The self-check kiosk: a reader taps their card (or types the card or roll number), then puts books on the RFID pad
 * (or scans their barcodes) to borrow them under their own rules, or uses "Return" without a card. Each item is
 * reported on its own; the kiosk forgets the reader after a short idle time. Runs signed in as the desk.
 */
export function LibraryKiosk({ branchId }: { branchId?: string }) {
  const { t, fmt } = useI18n();
  const [mode, setMode] = useState<'card' | 'borrow' | 'return'>('card');
  const [reader, setReader] = useState<Reader | null>(null);
  const [text, setText] = useState('');
  const [lines, setLines] = useState<Line[]>([]);
  const [error, setError] = useState('');
  const [busy, start] = useTransition();
  const input = useRef<HTMLInputElement>(null);
  const idle = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reset = () => {
    setMode('card');
    setReader(null);
    setText('');
    setLines([]);
    setError('');
  };
  // Every scan restarts the idle timer; the input keeps the focus so a reader's wedge or pad types into it.
  useEffect(() => {
    if (idle.current) clearTimeout(idle.current);
    if (mode !== 'card' || lines.length) idle.current = setTimeout(reset, KIOSK_IDLE_MS);
    input.current?.focus();
    return () => {
      if (idle.current) clearTimeout(idle.current);
    };
  }, [mode, lines, reader]);

  const submit = () =>
    start(async () => {
      setError('');
      if (mode === 'card') {
        const code = text.trim();
        if (!code) return;
        const res = await readLht(`/v1/library/desk/lookup?code=${encodeURIComponent(code)}`);
        const member = res.ok ? (res.data.member as Reader | undefined) : undefined;
        if (!member) return (setError(res.ok ? t('lp.kiosk.notCard') : res.error), setText(''));
        setReader(member);
        setMode('borrow');
        setText('');
        return;
      }
      const tags = kioskTags(text);
      if (!tags.length) return;
      const res =
        mode === 'borrow'
          ? await runLht('/v1/library/desk/issue', { memberCode: reader!.cardNo, copyCodes: tags, via: 'kiosk', ...(branchId && { branchId }) })
          : await runLht('/v1/library/desk/return', { copyCodes: tags, via: 'kiosk', ...(branchId && { branchId }) });
      setText('');
      if (!res.ok) return setError(res.error);
      const results = (res.data.results as Line[] | undefined) ?? [];
      setLines((l) => [...results, ...l].slice(0, 20));
      if (mode === 'borrow' && reader) {
        const again = await readLht(`/v1/library/desk/lookup?code=${encodeURIComponent(reader.cardNo)}`);
        if (again.ok && again.data.member) setReader(again.data.member as Reader);
      }
    });

  const prompt = mode === 'card' ? t('lp.kiosk.tapCard') : mode === 'borrow' ? t('lp.kiosk.placeBooks') : t('lp.kiosk.placeReturns');
  return (
    <div className="mx-auto grid max-w-3xl gap-5" data-testid="library-kiosk">
      <Card>
        <div className="grid gap-4 text-center">
          <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-primary/10 text-primary">{mode === 'card' ? <CreditCard className="size-8" /> : mode === 'borrow' ? <BookCheck className="size-8" /> : <Undo2 className="size-8" />}</div>
          <p className="m-0 text-2xl font-semibold" data-testid="kiosk-prompt">
            {prompt}
          </p>
          {reader && mode === 'borrow' && (
            <p className="m-0 text-base" data-testid="kiosk-reader">
              {t('lp.kiosk.hello', { name: reader.fullName })} · {t('lp.kiosk.out', { n: reader.out })}
              {reader.unpaidPaise > 0 && <span className="text-destructive"> · {t('lp.kiosk.fines', { amount: fmt.rupees(reader.unpaidPaise) })}</span>}
            </p>
          )}
          <form
            className="mx-auto flex w-full max-w-xl gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <input
              ref={input}
              value={text}
              onChange={(e) => setText(e.target.value)}
              aria-label={prompt}
              autoComplete="off"
              className="h-14 min-w-0 flex-1 rounded-lg border border-input bg-background px-4 text-xl"
              placeholder={mode === 'card' ? t('lp.kiosk.cardHint') : t('lp.kiosk.tagHint')}
              data-testid="kiosk-input"
            />
            <Button type="submit" className="h-14 px-6 text-lg" disabled={busy}>
              {mode === 'card' ? t('lp.kiosk.go') : mode === 'borrow' ? t('lp.kiosk.borrow') : t('lp.kiosk.return')}
            </Button>
          </form>
          {error && (
            <p className="m-0 text-base text-destructive" role="alert">
              {error}
            </p>
          )}
          <div className="flex flex-wrap justify-center gap-3">
            {mode !== 'return' && (
              <Button variant="outline" className="h-12" onClick={() => (setMode('return'), setReader(null), setLines([]))} data-testid="kiosk-mode-return">
                <BookDown />
                {t('lp.kiosk.returnMode')}
              </Button>
            )}
            {mode !== 'card' && (
              <Button variant="outline" className="h-12" onClick={reset} data-testid="kiosk-done">
                <LogOut />
                {t('lp.kiosk.done')}
              </Button>
            )}
          </div>
        </div>
      </Card>

      {lines.length > 0 && (
        <Card title={t('lp.kiosk.receipt')} testId="kiosk-lines">
          <ul className="m-0 grid list-none gap-2 p-0">
            {lines.map((l, i) => (
              <li key={`${l.code}-${i}`} className="flex flex-wrap items-center justify-between gap-2 text-base">
                <span className="font-mono">{l.code}</span>
                {l.ok ? (
                  <StatusPill tone="success">{l.dueOn ? t('lp.kiosk.dueOn', { d: fmt.date(l.dueOn) }) : l.finePaise ? t('lp.kiosk.backFine', { amount: fmt.rupees(l.finePaise) }) : t('lp.kiosk.back')}</StatusPill>
                ) : (
                  <span className="text-destructive">{l.message}</span>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {reader && mode === 'borrow' && reader.loans.length > 0 && (
        <Card title={t('lp.kiosk.yourBooks')}>
          <ul className="m-0 grid list-none gap-1 p-0">
            {reader.loans.map((l) => (
              <li key={l.id} className="flex justify-between gap-2 text-sm">
                <span>{l.title}</span>
                <span className={l.overdue ? 'text-destructive' : 'text-muted-foreground'}>{t('lp.kiosk.dueOn', { d: fmt.date(l.dueOn) })}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
