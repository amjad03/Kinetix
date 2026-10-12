'use client';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useState, useTransition } from 'react';
import { addBook, findStudents, issueBook, markFinePaid, returnBook } from '@/app/(dashboard)/library/actions';
import { EmptyState } from '@/components/States';
import { DataTable, FormField, StatusPill, TextInput } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import { addDays } from '@/lib/dates';
import { availableCopies, canSearchStudents, daysLate, dueLabel, finePreview, LOAN_DAYS } from '@/lib/library';
import { formatRupees } from '@/lib/money';
import type { LibraryBook, LibraryLoan, LibraryStudent } from '@/lib/types';

import { Alert, Autocomplete, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, InputAdornment, Snackbar, Tab, Tabs, TextField } from '@/components/kx';
import { Check, CircleCheck as CheckCircleOutlined, Library as LocalLibraryOutlined, LibraryBig as LibraryAddOutlined, Plus as Add, Search, Undo2 as AssignmentReturnOutlined } from 'lucide-react';
import { cn } from '@/lib/utils';
type TabName = 'loans' | 'catalogue' | 'fines';

/** A light wash of the error container on overdue loans. */

export function LibraryDesk({
  books,
  loans,
  today,
  fines,
  initialTab,
}: {
  books: LibraryBook[];
  loans: LibraryLoan[];
  today: string;
  fines: LibraryLoan[];
  initialTab: TabName;
}) {
  const pathname = usePathname();
  const { t } = useI18n();
  const [tab, setTab] = useState<TabName>(initialTab);
  const [issuing, setIssuing] = useState<{ book?: LibraryBook } | null>(null);
  const [returning, setReturning] = useState<LibraryLoan | null>(null);
  const [collecting, setCollecting] = useState<LibraryLoan | null>(null);
  const [adding, setAdding] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const overdue = loans.filter((l) => l.overdue).length;

  const switchTab = (next: TabName) => {
    setTab(next);
    // Keep the tab in the URL without a server round trip.
    window.history.replaceState(null, '', next === 'loans' ? pathname : `${pathname}?tab=${next}`);
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-3 mt-6 mb-4 border-b border-border">
        <Tabs className="flex-auto min-h-[48px]" value={tab} onChange={(_, v: TabName) => switchTab(v)} aria-label={t('lib.tabs')} variant="scrollable" scrollButtons={false}>
          <Tab value="loans" label={t('lib.tab.loans', { n: loans.length })} data-testid="tab-loans" />
          <Tab value="catalogue" label={t('lib.tab.catalogue', { n: books.length })} data-testid="tab-catalogue" />
          <Tab value="fines" label={t('lib.tab.fines', { n: fines.length })} data-testid="tab-fines" />
        </Tabs>
        <div className="grid sm:flex grid-cols-[1fr_1fr] w-full sm:w-auto gap-2 pb-2 [&_svg]:hidden sm:[&_svg]:inline">
          <Button variant="outlined" startIcon={<LibraryAddOutlined />} onClick={() => setAdding(true)}>
            {t('lib.addBook')}
          </Button>
          <Button className="whitespace-nowrap" variant="contained" startIcon={<Add />} onClick={() => setIssuing({})} disabled={books.every((b) => availableCopies(b) === 0)}>
            {t('lib.issueBook')}
          </Button>
        </div>
      </div>

      {tab === 'loans' ? (
        <Loans loans={loans} overdue={overdue} today={today} onReturn={setReturning} />
      ) : tab === 'fines' ? (
        <Fines fines={fines} onCollect={setCollecting} />
      ) : (
        <Catalogue books={books} onIssue={(book) => setIssuing({ book })} onAdd={() => setAdding(true)} />
      )}

      {issuing && (
        <IssueDialog
          books={books}
          book={issuing.book}
          today={today}
          onClose={(done) => {
            setIssuing(null);
            if (done) setToast(done);
          }}
        />
      )}
      {returning && <ReturnDialog loan={returning} today={today} onClose={() => setReturning(null)} />}
      {collecting && (
        <FinePaidDialog
          loan={collecting}
          onClose={(done) => {
            setCollecting(null);
            if (done) setToast(done);
          }}
        />
      )}
      {adding && (
        <AddBookDialog
          onClose={(done) => {
            setAdding(false);
            if (done) {
              setToast(done);
              // Show the new book; the URL is left alone while the page refreshes with it.
              setTab('catalogue');
            }
          }}
        />
      )}
      <Snackbar open={!!toast} autoHideDuration={6000} onClose={() => setToast(null)} message={toast} anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }} />
    </>
  );
}

// ---- On loan ---------------------------------------------------------------------------------

function DueText({ loan, today }: { loan: LibraryLoan; today: string }) {
  const { t, fmt } = useI18n();
  return (
    <div>
      <p className="text-[13px] leading-[19px] whitespace-nowrap">
        {fmt.date(loan.dueOn, 'short')}
      </p>
      <span className={cn('text-xs leading-4 tracking-[0.3px] whitespace-nowrap', loan.overdue ? 'text-red-ink' : 'text-muted-foreground', loan.overdue ? 'font-medium' : 'font-normal')}>
        {dueLabel(loan.dueOn, today, t)}
      </span>
    </div>
  );
}

function OverdueChip() {
  const { t } = useI18n();
  return <span data-status="overdue"><StatusPill tone="danger">{t('lib.overdueChip')}</StatusPill></span>;
}

function Loans({ loans, overdue, today, onReturn }: { loans: LibraryLoan[]; overdue: number; today: string; onReturn: (l: LibraryLoan) => void }) {
  const { t, fmt } = useI18n();
  const [only, setOnly] = useState(false);
  const [q, setQ] = useState('');
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return loans.filter(
      (l) =>
        (!only || l.overdue) &&
        (!s || l.student.fullName.toLowerCase().includes(s) || (l.student.rollNo ?? '').toLowerCase().includes(s) || l.book.title.toLowerCase().includes(s)),
    );
  }, [loans, only, q]);

  if (loans.length === 0)
    return (
      <EmptyState icon={<LocalLibraryOutlined />} title={t('lib.noLoans')} testId="no-loans">
        {t('lib.noLoansBody')}
      </EmptyState>
    );

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="flex gap-2" role="group" aria-label={t('lib.filterLoans')}>
          {[
            { on: !only, label: t('lib.all', { n: loans.length }), set: false, id: 'all' },
            { on: only, label: t('lib.overdueN', { n: overdue }), set: true, id: 'overdue' },
          ].map((c) => (
            <Chip className={cn(c.on && 'bg-secondary text-secondary-foreground [&_svg]:text-inherit')}
              key={c.id}
              label={c.label}
              variant={c.on ? 'filled' : 'outlined'}
              onClick={() => setOnly(c.set)}
              icon={c.on ? <Check className="text-[18px_!important]" /> : undefined}
              aria-pressed={c.on}
              data-testid={`loan-filter-${c.id}`}
            />
          ))}
        </div>
        <div className="flex-1" />
        <TextField className="flex-[1_1_240px] max-w-[360px]"
          size="small"
          placeholder={t('lib.searchLoans')}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          slotProps={{
            input: { startAdornment: <InputAdornment position="start"><Search className="size-5" /></InputAdornment> },
            htmlInput: { 'aria-label': t('lib.searchLoansLabel') },
          }}
        />
      </div>

      {rows.length === 0 ? (
        <EmptyState dense icon={<Search />} title={t('lib.noLoanMatch')} testId="no-loan-match">
          {t('lib.noLoanMatchBody')}
        </EmptyState>
      ) : (
        <>
          <div className="hidden md:block">
            <DataTable
              testId="loans-table"
              label={t('nav.library')}
              rows={rows}
              rowId={(l) => l.id}
              exportName="library-loans"
              rowTone={(l) => (l.overdue ? 'danger' : undefined)}
              rowAttrs={(l) => ({ 'data-testid': 'loan-row', 'data-overdue': l.overdue ? 'true' : undefined })}
              columns={[
                {
                  id: 'book',
                  header: t('lib.col.book'),
                  rowHeader: true,
                  sort: (l) => l.book.title,
                  csv: (l) => [l.book.title, l.book.author, l.book.callNo].filter(Boolean).join(' · '),
                  cell: (l) => (
                    <>
                      <h6 className="text-sm leading-5 font-medium tracking-[0.1px]">{l.book.title}</h6>
                      <span className="text-xs leading-4 tracking-[0.3px] text-muted-foreground">
                        {[l.book.author, l.book.callNo].filter(Boolean).join(' · ')}
                      </span>
                    </>
                  ),
                },
                {
                  id: 'student',
                  header: t('lib.col.student'),
                  sort: (l) => l.student.fullName,
                  csv: (l) => [l.student.fullName, l.student.rollNo, l.className].filter(Boolean).join(' · '),
                  cell: (l) => (
                    <>
                      <p className="text-[13px] leading-[19px]">{l.student.fullName}</p>
                      <span className="text-xs leading-4 tracking-[0.3px] text-muted-foreground">
                        {[l.student.rollNo, l.className].filter(Boolean).join(' · ')}
                      </span>
                    </>
                  ),
                },
                { id: 'issued', header: t('lib.col.issued'), sort: (l) => l.issuedAt, csv: (l) => l.issuedAt.slice(0, 10), cell: (l) => <div className="whitespace-nowrap">{fmt.dateTime(l.issuedAt, undefined, false)}</div> },
                {
                  id: 'due',
                  header: t('lib.col.due'),
                  sort: (l) => l.dueOn,
                  cell: (l) => (
                    <div className="flex items-center gap-3">
                      <DueText loan={l} today={today} />
                      {l.overdue && <OverdueChip />}
                    </div>
                  ),
                },
                {
                  id: 'fine',
                  header: t('lib.col.fineToday'),
                  align: 'right',
                  sort: (l) => finePreview(l.dueOn, today) / 100,
                  csv: (l) => finePreview(l.dueOn, today) / 100,
                  cell: (l) => {
                    const fine = finePreview(l.dueOn, today);
                    return (
                      <span className={cn('whitespace-nowrap', fine ? 'text-red-ink' : 'text-muted-foreground', fine ? 'font-medium' : 'font-normal', 'tabular-nums')} data-testid="loan-fine">
                        {fine ? formatRupees(fine) : '—'}
                      </span>
                    );
                  },
                },
                {
                  id: 'actions',
                  header: '',
                  csv: false,
                  align: 'right',
                  cell: (l) => (
                    <Button size="small" variant="outlined" startIcon={<AssignmentReturnOutlined />} onClick={() => onReturn(l)}>
                      {t('lib.return')}
                    </Button>
                  ),
                },
              ]}
            />
          </div>
          {/* Phones: a card per loan. */}
          <div className="grid md:hidden gap-3" data-testid="loans-list">
            {rows.map((l) => {
              const fine = finePreview(l.dueOn, today);
              return (
                <div className={cn('border rounded-[12px] p-4', l.overdue ? 'border-destructive bg-red-soft/45' : 'border-border')}
                  key={l.id}
                  data-testid="loan-card"
                >
                  <div className="flex justify-between gap-2 items-start">
                    <div className="min-w-0">
                      <h6 className="text-base tracking-[0.1px] font-medium leading-[1.3]">
                        {l.book.title}
                      </h6>
                      <p className="text-[13px] leading-[19px] text-muted-foreground">
                        {l.student.fullName} · {l.className}
                      </p>
                    </div>
                    {l.overdue && <OverdueChip />}
                  </div>
                  <div className="flex justify-between items-end mt-3 gap-2">
                    <div>
                      <DueText loan={l} today={today} />
                      {fine > 0 && (
                        <p className="text-xs leading-4 tracking-[0.3px] text-red-ink font-medium">
                          {t('lib.fine', { amount: formatRupees(fine) })}
                        </p>
                      )}
                    </div>
                    <Button size="small" variant="outlined" startIcon={<AssignmentReturnOutlined />} onClick={() => onReturn(l)}>
                      {t('lib.return')}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}

// ---- Unpaid fines --------------------------------------------------------------------------

function Fines({ fines, onCollect }: { fines: LibraryLoan[]; onCollect: (l: LibraryLoan) => void }) {
  const { t, fmt } = useI18n();
  if (fines.length === 0)
    return (
      <EmptyState icon={<CheckCircleOutlined />} title={t('lib.noFines')} testId="no-fines">
        {t('lib.noFinesBody')}
      </EmptyState>
    );
  const total = fines.reduce((s, f) => s + f.finePaise, 0);
  return (
    <>
      <p className="text-[13px] leading-[19px] text-muted-foreground mb-4" data-testid="fines-summary">
        {t.plural('lib.finesSummary', fines.length, { amount: formatRupees(total) })}
      </p>
      <DataTable
        testId="fines-table"
        label={t('lib.col.fine')}
        rows={fines}
        rowId={(f) => f.id}
        exportName="library-fines"
        rowAttrs={() => ({ 'data-testid': 'fine-row' })}
        columns={[
          {
            id: 'student',
            header: t('lib.col.student'),
            rowHeader: true,
            sort: (f) => f.student.fullName,
            csv: (f) => [f.student.fullName, f.student.rollNo, f.className].filter(Boolean).join(' · '),
            cell: (f) => (
              <>
                <h6 className="text-sm leading-5 font-medium tracking-[0.1px]">{f.student.fullName}</h6>
                <span className="text-xs leading-4 tracking-[0.3px] text-muted-foreground">
                  {[f.student.rollNo, f.className].filter(Boolean).join(' · ')}
                </span>
              </>
            ),
          },
          { id: 'book', header: t('lib.col.book'), sort: (f) => f.book.title, cell: (f) => f.book.title },
          { id: 'due', header: t('lib.col.due'), sort: (f) => f.dueOn, cell: (f) => <div className="whitespace-nowrap">{fmt.date(f.dueOn, 'short')}</div> },
          { id: 'returned', header: t('lib.col.returned'), sort: (f) => f.returnedAt ?? '', csv: (f) => f.returnedAt?.slice(0, 10) ?? '', cell: (f) => <div className="whitespace-nowrap">{f.returnedAt ? fmt.dateTime(f.returnedAt, undefined, false) : '—'}</div> },
          {
            id: 'fine',
            header: t('lib.col.fine'),
            align: 'right',
            sort: (f) => f.finePaise / 100,
            cell: (f) => (
              <span className="whitespace-nowrap text-red-ink font-medium tabular-nums">
                {formatRupees(f.finePaise)}
                <span className="ml-2" data-status="unpaid">
                  <StatusPill tone="danger">{t('lib.unpaid')}</StatusPill>
                </span>
              </span>
            ),
          },
          {
            id: 'actions',
            header: '',
            csv: false,
            align: 'right',
            cell: (f) => (
              <Button size="small" variant="outlined" onClick={() => onCollect(f)}>
                {t('lib.markPaid')}
              </Button>
            ),
          },
        ]}
      />
    </>
  );
}

function FinePaidDialog({ loan, onClose }: { loan: LibraryLoan; onClose: (done?: string) => void }) {
  const { t } = useI18n();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <Dialog open onClose={pending ? undefined : () => onClose()} maxWidth="xs" fullWidth aria-labelledby="fine-paid-title">
      <DialogTitle id="fine-paid-title">{t('lib.finePaid.title')}</DialogTitle>
      <DialogContent>
        {error && (
          <Alert className="mb-4" severity="error">
            {error}
          </Alert>
        )}
        <div className="p-4 rounded-[12px] bg-muted">
          <p className="text-[2rem] leading-[40px] tabular-nums">{formatRupees(loan.finePaise)}</p>
          <p className="text-[13px] leading-[19px]">
            {loan.student.fullName} · {[loan.student.rollNo, loan.className].filter(Boolean).join(' · ')}
          </p>
          <p className="text-[13px] leading-[19px] text-muted-foreground">
            {t('lib.finePaid.late', { title: loan.book.title })}
          </p>
        </div>
        <p className="text-[13px] leading-[19px] mt-4">
          {t('lib.finePaid.confirm', { amount: formatRupees(loan.finePaise) })}
        </p>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => onClose()} disabled={pending}>
          {t('common.cancel')}
        </Button>
        <Button
          variant="contained"
          disabled={pending}
          startIcon={pending ? <CircularProgress size={16} color="inherit" /> : undefined}
          onClick={() =>
            start(async () => {
              const res = await markFinePaid(loan.id);
              if (res.ok) onClose(t('lib.finePaid.done', { amount: formatRupees(loan.finePaise), name: loan.student.fullName }));
              else setError(res.error);
            })
          }
        >
          {t('lib.markAmountPaid', { amount: formatRupees(loan.finePaise) })}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ---- Catalogue -------------------------------------------------------------------------------

function Availability({ book }: { book: LibraryBook }) {
  const { t } = useI18n();
  const free = availableCopies(book);
  if (free === 0) return <span data-available="0"><StatusPill>{t('lib.allOut')}</StatusPill></span>;
  return <span data-available={free}><StatusPill tone="success">{t('lib.available', { n: free, d: book.copies })}</StatusPill></span>;
}

function Catalogue({ books, onIssue, onAdd }: { books: LibraryBook[]; onIssue: (b: LibraryBook) => void; onAdd: () => void }) {
  const { t } = useI18n();
  const [q, setQ] = useState('');
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return books;
    return books.filter((b) => [b.title, b.author, b.callNo ?? '', b.isbn ?? ''].some((v) => v.toLowerCase().includes(s)));
  }, [books, q]);

  if (books.length === 0)
    return (
      <EmptyState icon={<LocalLibraryOutlined />} title={t('lib.emptyCatalogue')} actions={<Button variant="contained" startIcon={<LibraryAddOutlined />} onClick={onAdd}>{t('lib.addBook')}</Button>}>
        {t('lib.emptyCatalogueBody')}
      </EmptyState>
    );

  return (
    <>
      <div className="flex flex-wrap items-center gap-4 mb-4">
        <TextField className="flex-[1_1_260px] max-w-[440px]"
          size="small"
          placeholder={t('lib.searchCatalogue')}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          slotProps={{
            input: { startAdornment: <InputAdornment position="start"><Search className="size-5" /></InputAdornment> },
            htmlInput: { 'aria-label': t('lib.searchCatalogueLabel') },
          }}
        />
        <p className="text-[13px] leading-[19px] text-muted-foreground" data-testid="book-count">
          {t.plural('lib.titles', rows.length)}
        </p>
      </div>
      {rows.length === 0 ? (
        <EmptyState dense icon={<Search />} title={t('lib.noBooks')} testId="no-books">
          {t('lib.noBooksBody')}
        </EmptyState>
      ) : (
        <>
          <div className="hidden md:block">
            <DataTable
              testId="books-table"
              label={t('nav.library')}
              rows={rows}
              rowId={(b) => b.id}
              exportName="library-books"
              rowAttrs={() => ({ 'data-testid': 'book-row' })}
              columns={[
                {
                  id: 'title',
                  header: t('lib.col.title'),
                  rowHeader: true,
                  sort: (b) => b.title,
                  csv: (b) => (b.author ? `${b.title} (${b.author})` : b.title),
                  cell: (b) => (
                    <>
                      <h6 className="text-sm leading-5 font-medium tracking-[0.1px]">{b.title}</h6>
                      <span className="text-xs leading-4 tracking-[0.3px] text-muted-foreground">
                        {b.author || t('lib.noAuthor')}
                      </span>
                    </>
                  ),
                },
                { id: 'callNo', header: t('lib.col.callNo'), sort: (b) => b.callNo ?? '', cell: (b) => <div className="whitespace-nowrap font-mono text-[0.8125rem]">{b.callNo ?? '—'}</div> },
                { id: 'isbn', header: t('lib.col.isbn'), sort: (b) => b.isbn ?? '', cell: (b) => <div className={cn('whitespace-nowrap', b.isbn ? 'text-foreground' : 'text-muted-foreground')}>{b.isbn ?? '—'}</div> },
                { id: 'copies', header: t('lib.col.copies'), align: 'right', sort: (b) => b.copies, cell: (b) => b.copies },
                { id: 'availability', header: t('lib.col.availability'), sort: (b) => availableCopies(b), cell: (b) => <Availability book={b} /> },
                {
                  id: 'actions',
                  header: '',
                  csv: false,
                  align: 'right',
                  cell: (b) => (
                    <Button size="small" onClick={() => onIssue(b)} disabled={availableCopies(b) === 0} aria-label={t('lib.issueTitle', { title: b.title })}>
                      {t('lib.issue')}
                    </Button>
                  ),
                },
              ]}
            />
          </div>
          <div className="grid md:hidden gap-3" data-testid="books-list">
            {rows.map((b) => (
              <div className="border border-border rounded-[12px] p-4" key={b.id}>
                <h6 className="text-base tracking-[0.1px] font-medium leading-[1.3]">
                  {b.title}
                </h6>
                <p className="text-[13px] leading-[19px] text-muted-foreground">
                  {[b.author, b.callNo].filter(Boolean).join(' · ')}
                </p>
                <div className="flex items-center justify-between mt-3">
                  <Availability book={b} />
                  <Button size="small" onClick={() => onIssue(b)} disabled={availableCopies(b) === 0}>
                    {t('lib.issue')}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}

// ---- Dialogs ---------------------------------------------------------------------------------

function IssueDialog({
  books,
  book: preset,
  today,
  onClose,
}: {
  books: LibraryBook[];
  book?: LibraryBook;
  today: string;
  onClose: (done?: string) => void;
}) {
  const { t, fmt } = useI18n();
  const shelf = books.filter((b) => availableCopies(b) > 0);
  const [book, setBook] = useState<LibraryBook | null>(preset ?? null);
  const [student, setStudent] = useState<LibraryStudent | null>(null);
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<{ query: string; students: LibraryStudent[] } | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const searchable = canSearchStudents(query);

  // Ask the API as the librarian types (after a short pause).
  useEffect(() => {
    if (!searchable) return;
    let live = true;
    const timer = setTimeout(() => {
      findStudents(query).then((res) => {
        if (!live) return;
        if (res.ok) {
          setFound({ query, students: res.data });
          setSearchError(null);
        } else setSearchError(res.error);
      });
    }, 250);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [query, searchable]);
  const options = searchable && found ? found.students : [];
  const searching = searchable && found?.query !== query && !searchError;
  const [dueOn, setDueOn] = useState(addDays(today, LOAN_DAYS));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const ready = !!book && !!student && dueOn >= today;

  const submit = () => {
    if (!ready) return;
    setError(null);
    start(async () => {
      const res = await issueBook({ bookId: book.id, studentId: student.id, dueOn });
      if (res.ok) onClose(t('lib.issued', { title: book.title, name: student.fullName, date: fmt.date(dueOn, 'short') }));
      else setError(res.error);
    });
  };

  return (
    <Dialog open onClose={pending ? undefined : () => onClose()} maxWidth="sm" fullWidth aria-labelledby="issue-book-title">
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <DialogTitle id="issue-book-title">{t('lib.issueBook')}</DialogTitle>
        <DialogContent>
          <p className="text-[13px] leading-[19px] text-muted-foreground mb-5">
            {t('lib.issue.help')}
          </p>
          <div className="flex flex-col gap-5">
            {error && <Alert severity="error">{error}</Alert>}
            <Autocomplete
              options={shelf}
              value={book}
              onChange={(_, v) => setBook(v)}
              getOptionLabel={(b) => b.title}
              isOptionEqualToValue={(a, b) => a.id === b.id}
              renderOption={({ key, ...props }, b) => (
                <li className="[display:block_!important]" key={key} {...props}>
                  <p className="text-[13px] leading-[19px]">{b.title}</p>
                  <span className="text-xs leading-4 tracking-[0.3px] text-muted-foreground">
                    {[b.author, b.callNo, t('lib.available', { n: availableCopies(b), d: b.copies })].filter(Boolean).join(' · ')}
                  </span>
                </li>
              )}
              renderInput={(params) => <FormField id={params.id} label={t('lib.issue.book')} required><TextInput {...params} required placeholder={t('lib.issue.bookPlaceholder')} /></FormField>}
              filterOptions={(opts, { inputValue }) => {
                const s = inputValue.trim().toLowerCase();
                return s ? opts.filter((b) => [b.title, b.author, b.callNo ?? ''].some((v) => v.toLowerCase().includes(s))) : opts;
              }}
              noOptionsText={t('lib.issue.noBook')}
            />
            <Autocomplete
              options={student && !options.some((o) => o.id === student.id) ? [student, ...options] : options}
              value={student}
              onChange={(_, v) => setStudent(v)}
              inputValue={query}
              onInputChange={(_, v, reason) => {
                if (reason !== 'reset') setQuery(v);
                else if (student) setQuery(student.fullName);
              }}
              getOptionLabel={(s) => s.fullName}
              isOptionEqualToValue={(a, b) => a.id === b.id}
              filterOptions={(opts) => opts}
              loading={searching}
              loadingText={t('lib.issue.searching')}
              renderOption={({ key, ...props }, s) => (
                <li className="[display:block_!important]" key={key} {...props}>
                  <p className="text-[13px] leading-[19px]">{s.fullName}</p>
                  <span className="text-xs leading-4 tracking-[0.3px] text-muted-foreground">
                    {[s.rollNo, s.className].filter(Boolean).join(' · ')}
                  </span>
                </li>
              )}
              renderInput={(params) => (
                <FormField id={params.id} label={t('lib.issue.student')} required>
                  <TextInput
                    {...params}
                    error={!!searchError}
                    required
                    placeholder={t('lib.issue.studentPlaceholder')}
                    helperText={
                      searchError ??
                      (student ? [student.rollNo, student.className].filter(Boolean).join(' · ') : t('lib.issue.studentHelp'))
                    }
                  />
                </FormField>
              )}
              noOptionsText={searchable ? t('lib.issue.noStudent') : t('lib.issue.type2')}
            />
            <FormField label={t('lib.issue.dueOn')} required>
              <TextInput
                type="date"
                value={dueOn}
                onChange={(e) => setDueOn(e.target.value)}
                required
                helperText={dueOn >= today ? `${dueLabel(dueOn, today, t)} · ${fmt.date(dueOn, 'long')}` : t('lib.issue.passed')}
                error={dueOn < today}
                slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: today } }}
              />
            </FormField>
          </div>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => onClose()} disabled={pending}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" variant="contained" disabled={pending || !ready} startIcon={pending ? <CircularProgress size={16} color="inherit" /> : undefined}>
            {t('lib.issue')}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

function ReturnDialog({ loan, today, onClose }: { loan: LibraryLoan; today: string; onClose: () => void }) {
  const { t, fmt } = useI18n();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ finePaise: number; paid: boolean } | null>(null);
  const [pending, start] = useTransition();
  const late = daysLate(loan.dueOn, today);
  const fine = finePreview(loan.dueOn, today);

  if (done) {
    return (
      <Dialog open onClose={onClose} maxWidth="xs" fullWidth aria-labelledby="returned-title">
        <DialogTitle className="flex items-center gap-3" id="returned-title">
          <CheckCircleOutlined className="text-green-ink" />
          {t('lib.returned.title')}
        </DialogTitle>
        <DialogContent>
          <p className="text-[13px] leading-[19px]">{t('lib.returned.body', { title: loan.book.title, name: loan.student.fullName })}</p>
          {done.finePaise > 0 ? (
            <div className="mt-4 p-4 rounded-[12px] bg-red-soft text-red-ink" data-testid="return-fine">
              <p className="text-[13px] leading-[19px]">{t('lib.returned.fineToCollect')}</p>
              <p className="text-[2rem] leading-[40px] tabular-nums">{formatRupees(done.finePaise)}</p>
              <span className="text-xs leading-4 tracking-[0.3px]">
                {t.plural('lib.returned.lateAt', late)}{' '}
                <strong data-testid="return-fine-status">
                  {done.paid ? t('lib.paid') : t('lib.unpaid')}
                </strong>
              </span>
            </div>
          ) : (
            <p className="text-[13px] leading-[19px] text-muted-foreground mt-3" data-testid="return-fine">
              {t('lib.returned.onTime')}
            </p>
          )}
        </DialogContent>
        {error && (
          <Alert className="mx-6" severity="error">
            {error}
          </Alert>
        )}
        <DialogActions>
          {done.finePaise > 0 && !done.paid ? (
            <>
              <Button onClick={onClose} disabled={pending}>
                {t('lib.returned.later')}
              </Button>
              <Button
                variant="contained"
                disabled={pending}
                startIcon={pending ? <CircularProgress size={16} color="inherit" /> : undefined}
                onClick={() =>
                  start(async () => {
                    const res = await markFinePaid(loan.id);
                    if (res.ok) {
                      setError(null);
                      setDone({ ...done, paid: true });
                    } else setError(res.error);
                  })
                }
              >
                {t('lib.markAmountPaid', { amount: formatRupees(done.finePaise) })}
              </Button>
            </>
          ) : (
            <Button variant="contained" onClick={onClose}>
              {t('common.done')}
            </Button>
          )}
        </DialogActions>
      </Dialog>
    );
  }

  return (
    <Dialog open onClose={pending ? undefined : onClose} maxWidth="xs" fullWidth aria-labelledby="return-title">
      <DialogTitle id="return-title">{t('lib.return.title')}</DialogTitle>
      <DialogContent>
        {error && (
          <Alert className="mb-4" severity="error">
            {error}
          </Alert>
        )}
        <div className="p-4 rounded-[12px] bg-muted">
          <h6 className="text-sm leading-5 font-medium tracking-[0.1px]">{loan.book.title}</h6>
          <p className="text-[13px] leading-[19px] text-muted-foreground">
            {loan.student.fullName} · {[loan.student.rollNo, loan.className].filter(Boolean).join(' · ')}
          </p>
          <p className="text-[13px] leading-[19px] mt-1">
            {t('lib.return.due', { date: fmt.date(loan.dueOn, 'short') })} <span className={cn(late ? 'text-red-ink' : 'text-inherit')}>{dueLabel(loan.dueOn, today, t)}</span>
          </p>
        </div>
        <p className="text-[13px] leading-[19px] mt-4">
          {fine > 0 ? t.plural('lib.return.fine', late, { amount: formatRupees(fine) }) : t('lib.return.noFine')}
        </p>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={pending}>
          {t('common.cancel')}
        </Button>
        <Button
          variant="contained"
          disabled={pending}
          startIcon={pending ? <CircularProgress size={16} color="inherit" /> : undefined}
          onClick={() =>
            start(async () => {
              const res = await returnBook(loan.id);
              if (res.ok) setDone({ finePaise: res.data.finePaise, paid: false });
              else setError(res.error);
            })
          }
        >
          {t('lib.return.mark')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function AddBookDialog({ onClose }: { onClose: (done?: string) => void }) {
  const { t } = useI18n();
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [callNo, setCallNo] = useState('');
  const [isbn, setIsbn] = useState('');
  const [copies, setCopies] = useState('1');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const n = Number(copies);
  const copiesOk = Number.isInteger(n) && n >= 1 && n <= 500;
  const ready = !!title.trim() && copiesOk;

  const submit = () => {
    if (!ready) return;
    setError(null);
    start(async () => {
      const res = await addBook({ title, author, callNo, isbn, copies: n });
      if (res.ok) onClose(t.plural('lib.added', res.data.copies, { title: res.data.title }));
      else setError(res.error);
    });
  };

  return (
    <Dialog open onClose={pending ? undefined : () => onClose()} maxWidth="xs" fullWidth aria-labelledby="add-book-title">
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <DialogTitle id="add-book-title">{t('lib.add.title')}</DialogTitle>
        <DialogContent>
          <div className="flex flex-col gap-5 pt-2">
            {error && <Alert severity="error">{error}</Alert>}
            <FormField label={t('lib.add.bookTitle')} required>
              <TextInput value={title} onChange={(e) => setTitle(e.target.value)} required autoFocus slotProps={{ htmlInput: { maxLength: 300 } }} />
            </FormField>
            <FormField label={t('lib.add.author')}>
              <TextInput value={author} onChange={(e) => setAuthor(e.target.value)} slotProps={{ htmlInput: { maxLength: 200 } }} />
            </FormField>
            <div className="grid grid-cols-[1fr_1fr] gap-4">
              <FormField label={t('lib.add.callNo')}>
                <TextInput value={callNo} onChange={(e) => setCallNo(e.target.value)} placeholder="657.95 MAH" slotProps={{ htmlInput: { maxLength: 40 } }} />
              </FormField>
              <FormField label={t('lib.add.copies')} required>
                <TextInput
                  value={copies}
                  onChange={(e) => setCopies(e.target.value)}
                  required
                  error={!copiesOk}
                  helperText={copiesOk ? ' ' : t('lib.add.copiesRange')}
                  slotProps={{ htmlInput: { inputMode: 'numeric' } }}
                />
              </FormField>
            </div>
            <FormField label={t('lib.add.isbn')}>
              <TextInput value={isbn} onChange={(e) => setIsbn(e.target.value)} placeholder="978-93-…" slotProps={{ htmlInput: { maxLength: 20 } }} />
            </FormField>
          </div>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => onClose()} disabled={pending}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" variant="contained" disabled={pending || !ready} startIcon={pending ? <CircularProgress size={16} color="inherit" /> : undefined}>
            {t('lib.addBook')}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
