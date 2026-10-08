'use client';

import Add from '@mui/icons-material/Add';
import AssignmentReturnOutlined from '@mui/icons-material/AssignmentReturnOutlined';
import Check from '@mui/icons-material/Check';
import CheckCircleOutlined from '@mui/icons-material/CheckCircleOutlined';
import LibraryAddOutlined from '@mui/icons-material/LibraryAddOutlined';
import LocalLibraryOutlined from '@mui/icons-material/LocalLibraryOutlined';
import Search from '@mui/icons-material/Search';
import Alert from '@mui/material/Alert';
import Autocomplete from '@mui/material/Autocomplete';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import InputAdornment from '@mui/material/InputAdornment';
import Snackbar from '@mui/material/Snackbar';
import Stack from '@mui/material/Stack';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import type { Theme } from '@mui/material/styles';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useState, useTransition } from 'react';
import { addBook, findStudents, issueBook, markFinePaid, returnBook } from '@/app/(dashboard)/library/actions';
import { EmptyState } from '@/components/States';
import { DataTable, StatusPill } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import { addDays } from '@/lib/dates';
import { availableCopies, canSearchStudents, daysLate, dueLabel, finePreview, LOAN_DAYS } from '@/lib/library';
import { formatRupees } from '@/lib/money';
import { withAlpha } from '@/theme/scheme';
import type { LibraryBook, LibraryLoan, LibraryStudent } from '@/lib/types';

type TabName = 'loans' | 'catalogue' | 'fines';

const num = { fontVariantNumeric: 'tabular-nums' } as const;
/** A light wash of the error container on overdue loans. */
const overdueTint = (t: Theme) => withAlpha(t.palette.m3.errorContainer, 0.45);

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
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1.5, mt: 3, mb: 2, borderBottom: 1, borderColor: 'm3.outlineVariant' }}>
        <Tabs value={tab} onChange={(_, v: TabName) => switchTab(v)} aria-label={t('lib.tabs')} variant="scrollable" scrollButtons={false} sx={{ flex: '1 1 auto', minHeight: 48 }}>
          <Tab value="loans" label={t('lib.tab.loans', { n: loans.length })} data-testid="tab-loans" />
          <Tab value="catalogue" label={t('lib.tab.catalogue', { n: books.length })} data-testid="tab-catalogue" />
          <Tab value="fines" label={t('lib.tab.fines', { n: fines.length })} data-testid="tab-fines" />
        </Tabs>
        <Box sx={{ display: { xs: 'grid', sm: 'flex' }, gridTemplateColumns: '1fr 1fr', width: { xs: '100%', sm: 'auto' }, gap: 1, pb: 1, '& .MuiButton-startIcon': { display: { xs: 'none', sm: 'inherit' } } }}>
          <Button variant="outlined" startIcon={<LibraryAddOutlined />} onClick={() => setAdding(true)}>
            {t('lib.addBook')}
          </Button>
          <Button variant="contained" startIcon={<Add />} onClick={() => setIssuing({})} disabled={books.every((b) => availableCopies(b) === 0)} sx={{ whiteSpace: 'nowrap' }}>
            {t('lib.issueBook')}
          </Button>
        </Box>
      </Box>

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
    <Box>
      <Typography variant="body2" sx={{ whiteSpace: 'nowrap' }}>
        {fmt.date(loan.dueOn, 'short')}
      </Typography>
      <Typography variant="caption" sx={{ color: loan.overdue ? 'error.main' : 'text.secondary', whiteSpace: 'nowrap', fontWeight: loan.overdue ? 500 : 400 }}>
        {dueLabel(loan.dueOn, today, t)}
      </Typography>
    </Box>
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
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1, mb: 2 }}>
        <Box role="group" aria-label={t('lib.filterLoans')} sx={{ display: 'flex', gap: 1 }}>
          {[
            { on: !only, label: t('lib.all', { n: loans.length }), set: false, id: 'all' },
            { on: only, label: t('lib.overdueN', { n: overdue }), set: true, id: 'overdue' },
          ].map((c) => (
            <Chip
              key={c.id}
              label={c.label}
              variant={c.on ? 'filled' : 'outlined'}
              onClick={() => setOnly(c.set)}
              icon={c.on ? <Check sx={{ fontSize: '18px !important' }} /> : undefined}
              sx={c.on ? { bgcolor: 'm3.secondaryContainer', color: 'm3.onSecondaryContainer', '& .MuiChip-icon': { color: 'inherit' } } : undefined}
              aria-pressed={c.on}
              data-testid={`loan-filter-${c.id}`}
            />
          ))}
        </Box>
        <Box sx={{ flex: 1 }} />
        <TextField
          size="small"
          placeholder={t('lib.searchLoans')}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          sx={{ flex: '1 1 240px', maxWidth: 360 }}
          slotProps={{
            input: { startAdornment: <InputAdornment position="start"><Search fontSize="small" /></InputAdornment> },
            htmlInput: { 'aria-label': t('lib.searchLoansLabel') },
          }}
        />
      </Box>

      {rows.length === 0 ? (
        <EmptyState dense icon={<Search />} title={t('lib.noLoanMatch')} testId="no-loan-match">
          {t('lib.noLoanMatchBody')}
        </EmptyState>
      ) : (
        <>
          <Box sx={{ display: { xs: 'none', md: 'block' } }}>
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
                      <Typography variant="subtitle2">{l.book.title}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {[l.book.author, l.book.callNo].filter(Boolean).join(' · ')}
                      </Typography>
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
                      <Typography variant="body2">{l.student.fullName}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {[l.student.rollNo, l.className].filter(Boolean).join(' · ')}
                      </Typography>
                    </>
                  ),
                },
                { id: 'issued', header: t('lib.col.issued'), sort: (l) => l.issuedAt, csv: (l) => l.issuedAt.slice(0, 10), cell: (l) => <Box sx={{ whiteSpace: 'nowrap' }}>{fmt.dateTime(l.issuedAt, undefined, false)}</Box> },
                {
                  id: 'due',
                  header: t('lib.col.due'),
                  sort: (l) => l.dueOn,
                  cell: (l) => (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                      <DueText loan={l} today={today} />
                      {l.overdue && <OverdueChip />}
                    </Box>
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
                      <Box component="span" data-testid="loan-fine" sx={{ ...num, whiteSpace: 'nowrap', color: fine ? 'error.main' : 'text.secondary', fontWeight: fine ? 500 : 400 }}>
                        {fine ? formatRupees(fine) : '—'}
                      </Box>
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
          </Box>
          {/* Phones: a card per loan. */}
          <Box sx={{ display: { xs: 'grid', md: 'none' }, gap: 1.5 }} data-testid="loans-list">
            {rows.map((l) => {
              const fine = finePreview(l.dueOn, today);
              return (
                <Box
                  key={l.id}
                  data-testid="loan-card"
                  sx={{ border: 1, borderColor: l.overdue ? 'error.main' : 'm3.outlineVariant', borderRadius: '12px', p: 2, bgcolor: l.overdue ? overdueTint : undefined }}
                >
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, alignItems: 'flex-start' }}>
                    <Box sx={{ minWidth: 0 }}>
                      <Typography variant="subtitle1" sx={{ fontWeight: 500, lineHeight: 1.3 }}>
                        {l.book.title}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {l.student.fullName} · {l.className}
                      </Typography>
                    </Box>
                    {l.overdue && <OverdueChip />}
                  </Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', mt: 1.5, gap: 1 }}>
                    <Box>
                      <DueText loan={l} today={today} />
                      {fine > 0 && (
                        <Typography variant="caption" component="p" sx={{ color: 'error.main', fontWeight: 500 }}>
                          {t('lib.fine', { amount: formatRupees(fine) })}
                        </Typography>
                      )}
                    </Box>
                    <Button size="small" variant="outlined" startIcon={<AssignmentReturnOutlined />} onClick={() => onReturn(l)}>
                      {t('lib.return')}
                    </Button>
                  </Box>
                </Box>
              );
            })}
          </Box>
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
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }} data-testid="fines-summary">
        {t.plural('lib.finesSummary', fines.length, { amount: formatRupees(total) })}
      </Typography>
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
                <Typography variant="subtitle2">{f.student.fullName}</Typography>
                <Typography variant="caption" color="text.secondary">
                  {[f.student.rollNo, f.className].filter(Boolean).join(' · ')}
                </Typography>
              </>
            ),
          },
          { id: 'book', header: t('lib.col.book'), sort: (f) => f.book.title, cell: (f) => f.book.title },
          { id: 'due', header: t('lib.col.due'), sort: (f) => f.dueOn, cell: (f) => <Box sx={{ whiteSpace: 'nowrap' }}>{fmt.date(f.dueOn, 'short')}</Box> },
          { id: 'returned', header: t('lib.col.returned'), sort: (f) => f.returnedAt ?? '', csv: (f) => f.returnedAt?.slice(0, 10) ?? '', cell: (f) => <Box sx={{ whiteSpace: 'nowrap' }}>{f.returnedAt ? fmt.dateTime(f.returnedAt, undefined, false) : '—'}</Box> },
          {
            id: 'fine',
            header: t('lib.col.fine'),
            align: 'right',
            sort: (f) => f.finePaise / 100,
            cell: (f) => (
              <Box component="span" sx={{ ...num, whiteSpace: 'nowrap', color: 'error.main', fontWeight: 500 }}>
                {formatRupees(f.finePaise)}
                <Box component="span" sx={{ ml: 1 }} data-status="unpaid">
                  <StatusPill tone="danger">{t('lib.unpaid')}</StatusPill>
                </Box>
              </Box>
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
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        <Box sx={{ p: 2, borderRadius: '12px', bgcolor: 'kx.tonal' }}>
          <Typography sx={{ fontSize: '2rem', lineHeight: '40px', ...num }}>{formatRupees(loan.finePaise)}</Typography>
          <Typography variant="body2">
            {loan.student.fullName} · {[loan.student.rollNo, loan.className].filter(Boolean).join(' · ')}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {t('lib.finePaid.late', { title: loan.book.title })}
          </Typography>
        </Box>
        <Typography variant="body2" sx={{ mt: 2 }}>
          {t('lib.finePaid.confirm', { amount: formatRupees(loan.finePaise) })}
        </Typography>
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
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 2, mb: 2 }}>
        <TextField
          size="small"
          placeholder={t('lib.searchCatalogue')}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          sx={{ flex: '1 1 260px', maxWidth: 440 }}
          slotProps={{
            input: { startAdornment: <InputAdornment position="start"><Search fontSize="small" /></InputAdornment> },
            htmlInput: { 'aria-label': t('lib.searchCatalogueLabel') },
          }}
        />
        <Typography variant="body2" color="text.secondary" data-testid="book-count">
          {t.plural('lib.titles', rows.length)}
        </Typography>
      </Box>
      {rows.length === 0 ? (
        <EmptyState dense icon={<Search />} title={t('lib.noBooks')} testId="no-books">
          {t('lib.noBooksBody')}
        </EmptyState>
      ) : (
        <>
          <Box sx={{ display: { xs: 'none', md: 'block' } }}>
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
                      <Typography variant="subtitle2">{b.title}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {b.author || t('lib.noAuthor')}
                      </Typography>
                    </>
                  ),
                },
                { id: 'callNo', header: t('lib.col.callNo'), sort: (b) => b.callNo ?? '', cell: (b) => <Box sx={{ whiteSpace: 'nowrap', fontFamily: 'monospace', fontSize: '0.8125rem' }}>{b.callNo ?? '—'}</Box> },
                { id: 'isbn', header: t('lib.col.isbn'), sort: (b) => b.isbn ?? '', cell: (b) => <Box sx={{ whiteSpace: 'nowrap', color: b.isbn ? 'text.primary' : 'text.secondary' }}>{b.isbn ?? '—'}</Box> },
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
          </Box>
          <Box sx={{ display: { xs: 'grid', md: 'none' }, gap: 1.5 }} data-testid="books-list">
            {rows.map((b) => (
              <Box key={b.id} sx={{ border: 1, borderColor: 'm3.outlineVariant', borderRadius: '12px', p: 2 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 500, lineHeight: 1.3 }}>
                  {b.title}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {[b.author, b.callNo].filter(Boolean).join(' · ')}
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mt: 1.5 }}>
                  <Availability book={b} />
                  <Button size="small" onClick={() => onIssue(b)} disabled={availableCopies(b) === 0}>
                    {t('lib.issue')}
                  </Button>
                </Box>
              </Box>
            ))}
          </Box>
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
      <Box
        component="form"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <DialogTitle id="issue-book-title">{t('lib.issueBook')}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5 }}>
            {t('lib.issue.help')}
          </Typography>
          <Stack spacing={2.5}>
            {error && <Alert severity="error">{error}</Alert>}
            <Autocomplete
              options={shelf}
              value={book}
              onChange={(_, v) => setBook(v)}
              getOptionLabel={(b) => b.title}
              isOptionEqualToValue={(a, b) => a.id === b.id}
              renderOption={({ key, ...props }, b) => (
                <Box component="li" key={key} {...props} sx={{ display: 'block !important' }}>
                  <Typography variant="body2">{b.title}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {[b.author, b.callNo, t('lib.available', { n: availableCopies(b), d: b.copies })].filter(Boolean).join(' · ')}
                  </Typography>
                </Box>
              )}
              renderInput={(params) => <TextField {...params} label={t('lib.issue.book')} required placeholder={t('lib.issue.bookPlaceholder')} />}
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
                <Box component="li" key={key} {...props} sx={{ display: 'block !important' }}>
                  <Typography variant="body2">{s.fullName}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {[s.rollNo, s.className].filter(Boolean).join(' · ')}
                  </Typography>
                </Box>
              )}
              renderInput={(params) => (
                <TextField
                  {...params}
                  error={!!searchError}
                  label={t('lib.issue.student')}
                  required
                  placeholder={t('lib.issue.studentPlaceholder')}
                  helperText={
                    searchError ??
                    (student ? [student.rollNo, student.className].filter(Boolean).join(' · ') : t('lib.issue.studentHelp'))
                  }
                />
              )}
              noOptionsText={searchable ? t('lib.issue.noStudent') : t('lib.issue.type2')}
            />
            <TextField
              label={t('lib.issue.dueOn')}
              type="date"
              value={dueOn}
              onChange={(e) => setDueOn(e.target.value)}
              required
              helperText={dueOn >= today ? `${dueLabel(dueOn, today, t)} · ${fmt.date(dueOn, 'long')}` : t('lib.issue.passed')}
              error={dueOn < today}
              slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: today } }}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => onClose()} disabled={pending}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" variant="contained" disabled={pending || !ready} startIcon={pending ? <CircularProgress size={16} color="inherit" /> : undefined}>
            {t('lib.issue')}
          </Button>
        </DialogActions>
      </Box>
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
        <DialogTitle id="returned-title" sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <CheckCircleOutlined sx={{ color: 'kx.success' }} />
          {t('lib.returned.title')}
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2">{t('lib.returned.body', { title: loan.book.title, name: loan.student.fullName })}</Typography>
          {done.finePaise > 0 ? (
            <Box sx={{ mt: 2, p: 2, borderRadius: '12px', bgcolor: 'm3.errorContainer', color: 'm3.onErrorContainer' }} data-testid="return-fine">
              <Typography variant="body2">{t('lib.returned.fineToCollect')}</Typography>
              <Typography sx={{ fontSize: '2rem', lineHeight: '40px', ...num }}>{formatRupees(done.finePaise)}</Typography>
              <Typography variant="caption">
                {t.plural('lib.returned.lateAt', late)}{' '}
                <Box component="strong" data-testid="return-fine-status">
                  {done.paid ? t('lib.paid') : t('lib.unpaid')}
                </Box>
              </Typography>
            </Box>
          ) : (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }} data-testid="return-fine">
              {t('lib.returned.onTime')}
            </Typography>
          )}
        </DialogContent>
        {error && (
          <Alert severity="error" sx={{ mx: 3 }}>
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
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        <Box sx={{ p: 2, borderRadius: '12px', bgcolor: 'kx.tonal' }}>
          <Typography variant="subtitle2">{loan.book.title}</Typography>
          <Typography variant="body2" color="text.secondary">
            {loan.student.fullName} · {[loan.student.rollNo, loan.className].filter(Boolean).join(' · ')}
          </Typography>
          <Typography variant="body2" sx={{ mt: 0.5 }}>
            {t('lib.return.due', { date: fmt.date(loan.dueOn, 'short') })} <Box component="span" sx={{ color: late ? 'error.main' : 'inherit' }}>{dueLabel(loan.dueOn, today, t)}</Box>
          </Typography>
        </Box>
        <Typography variant="body2" sx={{ mt: 2 }}>
          {fine > 0 ? t.plural('lib.return.fine', late, { amount: formatRupees(fine) }) : t('lib.return.noFine')}
        </Typography>
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
      <Box
        component="form"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <DialogTitle id="add-book-title">{t('lib.add.title')}</DialogTitle>
        <DialogContent>
          <Stack spacing={2.5} sx={{ pt: 1 }}>
            {error && <Alert severity="error">{error}</Alert>}
            <TextField label={t('lib.add.bookTitle')} value={title} onChange={(e) => setTitle(e.target.value)} required autoFocus slotProps={{ htmlInput: { maxLength: 300 } }} />
            <TextField label={t('lib.add.author')} value={author} onChange={(e) => setAuthor(e.target.value)} slotProps={{ htmlInput: { maxLength: 200 } }} />
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
              <TextField label={t('lib.add.callNo')} value={callNo} onChange={(e) => setCallNo(e.target.value)} placeholder="657.95 MAH" slotProps={{ htmlInput: { maxLength: 40 } }} />
              <TextField
                label={t('lib.add.copies')}
                value={copies}
                onChange={(e) => setCopies(e.target.value)}
                required
                error={!copiesOk}
                helperText={copiesOk ? ' ' : t('lib.add.copiesRange')}
                slotProps={{ htmlInput: { inputMode: 'numeric' } }}
              />
            </Box>
            <TextField label={t('lib.add.isbn')} value={isbn} onChange={(e) => setIsbn(e.target.value)} placeholder="978-93-…" slotProps={{ htmlInput: { maxLength: 20 } }} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => onClose()} disabled={pending}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" variant="contained" disabled={pending || !ready} startIcon={pending ? <CircularProgress size={16} color="inherit" /> : undefined}>
            {t('lib.addBook')}
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}
