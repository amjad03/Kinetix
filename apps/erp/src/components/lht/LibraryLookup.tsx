'use client';

import { Search } from 'lucide-react';
import { useState, useTransition, type ReactNode } from 'react';
import { readLht } from '@/app/(dashboard)/lht-actions';
import { Button } from '@/components/shadcn/button';
import { Card, FormRow, StatusPill, TextInput } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import { toneOf } from '@/lib/lht';

interface Member {
  cardNo: string;
  fullName: string;
  kind: string;
  status: string;
  validUntil: string | null;
  blockedReason: string | null;
  out: number;
  overdue: number;
  unpaidPaise: number;
  loans: { id: string; title: string; accessionNo: string | null; dueOn: string; overdue: boolean }[];
}
interface Copy {
  accessionNo: string;
  status: string;
  title: string;
  author: string | null;
  callNo: string | null;
  loan: { dueOn: string; borrower: string } | null;
}
interface Isbn {
  isbn: string;
  source: 'catalogue' | 'openlibrary' | 'none';
  inCatalogue: { title: string; author: string | null; copies: number } | null;
  found: { title: string; author: string; publisher: string; pubYear: number | null; ddc: string; callNo: string; pages: number | null } | null;
}

/** The desk's two lookups: who a card belongs to or where a copy is (one scan), and a book by its ISBN. */
export function LibraryLookup() {
  const { t, fmt } = useI18n();
  const [code, setCode] = useState('');
  const [isbn, setIsbn] = useState('');
  const [found, setFound] = useState<{ member?: Member; copy?: Copy } | null>(null);
  const [book, setBook] = useState<Isbn | null>(null);
  const [error, setError] = useState<{ code?: string; isbn?: string }>({});
  const [busy, start] = useTransition();
  const word = (key: string, v: string) => {
    const s = t(key as MessageKey);
    return s === key ? v : s;
  };

  const lookCode = () =>
    start(async () => {
      const c = code.trim();
      if (!c) return setError({ code: t('lht.fill', { field: t('lht.look.code') }) });
      const res = await readLht(`/v1/library/desk/lookup?code=${encodeURIComponent(c)}`);
      setError({});
      if (!res.ok) return (setFound(null), setError({ code: res.error }));
      setFound(res.data as { member?: Member; copy?: Copy });
    });
  const lookIsbn = () =>
    start(async () => {
      const c = isbn.replace(/[\s-]/g, '');
      if (!/^[0-9]{9}[0-9Xx]$|^[0-9]{13}$/.test(c)) return setError({ isbn: t('lht.look.badIsbn') });
      const res = await readLht(`/v1/library/isbn/${c}`);
      setError({});
      if (!res.ok) return (setBook(null), setError({ isbn: res.error }));
      setBook(res.data as unknown as Isbn);
    });

  const row = (label: string, value: ReactNode) => (
    <div className="contents">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="m-0 text-right font-medium break-words">{value}</dd>
    </div>
  );

  return (
    <div className="mb-5 grid items-start gap-5 lg:grid-cols-2">
      <Card title={t('lht.look.title')} testId="lht-lookup">
        <FormRow
          component="form"
          onSubmit={(e) => {
            e.preventDefault();
            lookCode();
          }}
        >
          <TextInput className="min-w-[200px] flex-1" label={t('lht.look.code')} value={code} onChange={(e) => setCode(e.target.value)} error={!!error.code} helperText={error.code} />
          <Button type="submit" variant="outline" disabled={busy} data-testid="lht-lookup-go">
            <Search />
            {t('lht.look.go')}
          </Button>
        </FormRow>
        {found?.member && (
          <dl className="m-0 mt-4 grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1 border-t pt-4 text-sm" data-testid="lht-lookup-member">
            {row(t('lht.r.name'), `${found.member.fullName} · ${found.member.cardNo}`)}
            {row(t('lht.look.status'), <StatusPill tone={toneOf(found.member.status)}>{word(`rk.o.library-members.status.${found.member.status}`, found.member.status)}</StatusPill>)}
            {found.member.validUntil && row(t('lht.look.validUntil'), fmt.date(found.member.validUntil, 'day'))}
            {found.member.blockedReason && row(t('lht.look.blocked'), found.member.blockedReason)}
            {row(t('lht.look.out'), t('lht.look.outN', { n: found.member.out, late: found.member.overdue }))}
            {row(t('lht.look.unpaid'), fmt.rupees(found.member.unpaidPaise))}
            {found.member.loans.map((l) => row(l.accessionNo ?? '—', <span className={l.overdue ? 'text-destructive' : undefined}>{`${l.title} · ${t('lht.dueOn', { date: fmt.date(l.dueOn, 'day') })}`}</span>))}
          </dl>
        )}
        {found?.copy && (
          <dl className="m-0 mt-4 grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1 border-t pt-4 text-sm" data-testid="lht-lookup-copy">
            {row(t('lht.look.copy'), `${found.copy.accessionNo} · ${found.copy.title}`)}
            {found.copy.callNo && row(t('lht.look.callNo'), found.copy.callNo)}
            {row(t('lht.look.status'), <StatusPill tone={toneOf(found.copy.status)}>{word(`rk.o.library-copies.status.${found.copy.status}`, found.copy.status)}</StatusPill>)}
            {found.copy.loan && row(t('lht.look.with'), `${found.copy.loan.borrower} · ${t('lht.dueOn', { date: fmt.date(found.copy.loan.dueOn, 'day') })}`)}
          </dl>
        )}
      </Card>
      <Card title={t('lht.look.isbnTitle')} testId="lht-isbn">
        <FormRow
          component="form"
          onSubmit={(e) => {
            e.preventDefault();
            lookIsbn();
          }}
        >
          <TextInput className="min-w-[200px] flex-1" label="ISBN" value={isbn} onChange={(e) => setIsbn(e.target.value)} error={!!error.isbn} helperText={error.isbn} />
          <Button type="submit" variant="outline" disabled={busy} data-testid="lht-isbn-go">
            <Search />
            {t('lht.look.go')}
          </Button>
        </FormRow>
        {book && (
          <dl className="m-0 mt-4 grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1 border-t pt-4 text-sm" data-testid="lht-isbn-result">
            {book.inCatalogue && (
              <>
                {row(t('lht.look.have'), book.inCatalogue.title)}
                {row(t('lht.look.copies'), fmt.number(book.inCatalogue.copies))}
              </>
            )}
            {book.found && (
              <>
                {row(t('rk.f.library-books.title'), book.found.title)}
                {book.found.author && row(t('rk.f.library-books.author'), book.found.author)}
                {book.found.publisher && row(t('rk.f.library-books.publisher'), book.found.publisher)}
                {book.found.pubYear && row(t('rk.f.library-books.pubYear'), String(book.found.pubYear))}
                {book.found.callNo && row(t('rk.f.library-books.callNo'), book.found.callNo)}
              </>
            )}
            {!book.inCatalogue && !book.found && row(book.isbn, book.source === 'none' ? t('lht.look.offline') : t('lht.look.notFound'))}
          </dl>
        )}
        {book?.found && <p className="m-0 mt-3 text-[13px] text-muted-foreground">{t('lht.look.addHint')}</p>}
      </Card>
    </div>
  );
}
