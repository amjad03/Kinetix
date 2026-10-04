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
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Tabs from '@mui/material/Tabs';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import type { Theme } from '@mui/material/styles';
import { usePathname } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import { addBook, issueBook, returnBook } from '@/app/(dashboard)/library/actions';
import { TableFrame } from '@/components/DataTable';
import { EmptyState } from '@/components/States';
import { addDays, formatDate, formatDateTime } from '@/lib/dates';
import { availableCopies, daysLate, dueLabel, finePreview, LOAN_DAYS, searchStudents } from '@/lib/library';
import { formatRupees } from '@/lib/money';
import { withAlpha } from '@/theme/scheme';
import type { LibraryBook, LibraryLoan, LibraryStudent } from '@/lib/types';

type TabName = 'loans' | 'catalogue';

const num = { fontVariantNumeric: 'tabular-nums' } as const;
/** A light wash of the error container on overdue loans. */
const overdueTint = (t: Theme) => withAlpha(t.palette.m3.errorContainer, 0.45);

export function LibraryDesk({
  books,
  loans,
  today,
  students,
  studentsComplete,
  initialTab,
}: {
  books: LibraryBook[];
  loans: LibraryLoan[];
  today: string;
  students: LibraryStudent[];
  studentsComplete: boolean;
  initialTab: TabName;
}) {
  const pathname = usePathname();
  const [tab, setTab] = useState<TabName>(initialTab);
  const [issuing, setIssuing] = useState<{ book?: LibraryBook } | null>(null);
  const [returning, setReturning] = useState<LibraryLoan | null>(null);
  const [adding, setAdding] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const overdue = loans.filter((l) => l.overdue).length;

  const switchTab = (t: TabName) => {
    setTab(t);
    // Keep the tab in the URL without a server round trip.
    window.history.replaceState(null, '', t === 'loans' ? pathname : `${pathname}?tab=${t}`);
  };

  return (
    <>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1.5, mt: 3, mb: 2, borderBottom: 1, borderColor: 'm3.outlineVariant' }}>
        <Tabs value={tab} onChange={(_, v: TabName) => switchTab(v)} aria-label="Library" sx={{ flex: '1 1 auto', minHeight: 48 }}>
          <Tab value="loans" label={`On loan · ${loans.length}`} data-testid="tab-loans" />
          <Tab value="catalogue" label={`Catalogue · ${books.length}`} data-testid="tab-catalogue" />
        </Tabs>
        <Box sx={{ display: { xs: 'grid', sm: 'flex' }, gridTemplateColumns: '1fr 1fr', width: { xs: '100%', sm: 'auto' }, gap: 1, pb: 1, '& .MuiButton-startIcon': { display: { xs: 'none', sm: 'inherit' } } }}>
          <Button variant="outlined" startIcon={<LibraryAddOutlined />} onClick={() => setAdding(true)}>
            Add book
          </Button>
          <Button variant="contained" startIcon={<Add />} onClick={() => setIssuing({})} disabled={books.every((b) => availableCopies(b) === 0)} sx={{ whiteSpace: 'nowrap' }}>
            Issue
            <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>
              &nbsp;a
            </Box>
            &nbsp;book
          </Button>
        </Box>
      </Box>

      {tab === 'loans' ? (
        <Loans loans={loans} overdue={overdue} today={today} onReturn={setReturning} />
      ) : (
        <Catalogue books={books} onIssue={(book) => setIssuing({ book })} onAdd={() => setAdding(true)} />
      )}

      {issuing && (
        <IssueDialog
          books={books}
          book={issuing.book}
          students={students}
          studentsComplete={studentsComplete}
          today={today}
          onClose={(done) => {
            setIssuing(null);
            if (done) setToast(done);
          }}
        />
      )}
      {returning && <ReturnDialog loan={returning} today={today} onClose={() => setReturning(null)} />}
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
  return (
    <Box>
      <Typography variant="body2" sx={{ whiteSpace: 'nowrap' }}>
        {formatDate(loan.dueOn, 'short')}
      </Typography>
      <Typography variant="caption" sx={{ color: loan.overdue ? 'error.main' : 'text.secondary', whiteSpace: 'nowrap', fontWeight: loan.overdue ? 500 : 400 }}>
        {dueLabel(loan.dueOn, today)}
      </Typography>
    </Box>
  );
}

function OverdueChip() {
  return <Chip size="small" label="Overdue" sx={{ bgcolor: 'm3.errorContainer', color: 'm3.onErrorContainer' }} data-status="overdue" />;
}

function Loans({ loans, overdue, today, onReturn }: { loans: LibraryLoan[]; overdue: number; today: string; onReturn: (l: LibraryLoan) => void }) {
  const [only, setOnly] = useState(false);
  const [q, setQ] = useState('');
  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    return loans.filter(
      (l) =>
        (!only || l.overdue) &&
        (!t || l.student.fullName.toLowerCase().includes(t) || (l.student.rollNo ?? '').toLowerCase().includes(t) || l.book.title.toLowerCase().includes(t)),
    );
  }, [loans, only, q]);

  if (loans.length === 0)
    return (
      <EmptyState icon={<LocalLibraryOutlined />} title="No books are out" testId="no-loans">
        Books you issue to students appear here with their due dates. Late returns are fined ₹2 a day.
      </EmptyState>
    );

  return (
    <>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1, mb: 2 }}>
        <Box role="group" aria-label="Filter loans" sx={{ display: 'flex', gap: 1 }}>
          {[
            { on: !only, label: `All · ${loans.length}`, set: false, id: 'all' },
            { on: only, label: `Overdue · ${overdue}`, set: true, id: 'overdue' },
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
          placeholder="Student, roll number or book"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          sx={{ flex: '1 1 240px', maxWidth: 360 }}
          slotProps={{
            input: { startAdornment: <InputAdornment position="start"><Search fontSize="small" /></InputAdornment> },
            htmlInput: { 'aria-label': 'Search loans' },
          }}
        />
      </Box>

      {rows.length === 0 ? (
        <EmptyState dense icon={<Search />} title="No loans match" testId="no-loan-match">
          Try another name, roll number or title.
        </EmptyState>
      ) : (
        <>
          <Box sx={{ display: { xs: 'none', md: 'block' } }}>
            <TableFrame testId="loans-table">
              <Table sx={{ minWidth: 860 }} size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Book</TableCell>
                    <TableCell>Student</TableCell>
                    <TableCell>Issued</TableCell>
                    <TableCell>Due</TableCell>
                    <TableCell align="right">Fine today</TableCell>
                    <TableCell aria-label="Actions" />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rows.map((l) => {
                    const fine = finePreview(l.dueOn, today);
                    return (
                      <TableRow key={l.id} hover data-testid="loan-row" data-overdue={l.overdue || undefined} sx={{ '& td': { py: 1.25 }, ...(l.overdue ? { '& > td': { bgcolor: overdueTint } } : {}) }}>
                        <TableCell>
                          <Typography variant="subtitle2">{l.book.title}</Typography>
                          <Typography variant="caption" color="text.secondary">
                            {[l.book.author, l.book.callNo].filter(Boolean).join(' · ')}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2">{l.student.fullName}</Typography>
                          <Typography variant="caption" color="text.secondary">
                            {[l.student.rollNo, l.className].filter(Boolean).join(' · ')}
                          </Typography>
                        </TableCell>
                        <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatDateTime(l.issuedAt, undefined, false)}</TableCell>
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                            <DueText loan={l} today={today} />
                            {l.overdue && <OverdueChip />}
                          </Box>
                        </TableCell>
                        <TableCell align="right" sx={{ ...num, whiteSpace: 'nowrap', color: fine ? 'error.main' : 'text.secondary', fontWeight: fine ? 500 : 400 }} data-testid="loan-fine">
                          {fine ? formatRupees(fine) : '—'}
                        </TableCell>
                        <TableCell align="right" sx={{ pr: 1.5 }}>
                          <Button size="small" variant="outlined" startIcon={<AssignmentReturnOutlined />} onClick={() => onReturn(l)}>
                            Return
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableFrame>
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
                          Fine {formatRupees(fine)}
                        </Typography>
                      )}
                    </Box>
                    <Button size="small" variant="outlined" startIcon={<AssignmentReturnOutlined />} onClick={() => onReturn(l)}>
                      Return
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

// ---- Catalogue -------------------------------------------------------------------------------

function Availability({ book }: { book: LibraryBook }) {
  const free = availableCopies(book);
  if (free === 0) return <Chip size="small" label="All out" variant="outlined" sx={{ color: 'text.secondary' }} data-available="0" />;
  return <Chip size="small" label={`${free} of ${book.copies} available`} sx={{ bgcolor: 'kx.successContainer', color: 'kx.onSuccessContainer' }} data-available={free} />;
}

function Catalogue({ books, onIssue, onAdd }: { books: LibraryBook[]; onIssue: (b: LibraryBook) => void; onAdd: () => void }) {
  const [q, setQ] = useState('');
  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return books;
    return books.filter((b) => [b.title, b.author, b.callNo ?? '', b.isbn ?? ''].some((v) => v.toLowerCase().includes(t)));
  }, [books, q]);

  if (books.length === 0)
    return (
      <EmptyState icon={<LocalLibraryOutlined />} title="The catalogue is empty" actions={<Button variant="contained" startIcon={<LibraryAddOutlined />} onClick={onAdd}>Add book</Button>}>
        Add the library&apos;s books with their call numbers and copies, then issue them to students.
      </EmptyState>
    );

  return (
    <>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 2, mb: 2 }}>
        <TextField
          size="small"
          placeholder="Search by title, author, call number or ISBN"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          sx={{ flex: '1 1 260px', maxWidth: 440 }}
          slotProps={{
            input: { startAdornment: <InputAdornment position="start"><Search fontSize="small" /></InputAdornment> },
            htmlInput: { 'aria-label': 'Search the catalogue' },
          }}
        />
        <Typography variant="body2" color="text.secondary" data-testid="book-count">
          {rows.length} title{rows.length === 1 ? '' : 's'}
        </Typography>
      </Box>
      {rows.length === 0 ? (
        <EmptyState dense icon={<Search />} title="No books match your search" testId="no-books">
          Try part of the title, the author&apos;s surname or the call number.
        </EmptyState>
      ) : (
        <>
          <Box sx={{ display: { xs: 'none', md: 'block' } }}>
            <TableFrame testId="books-table">
              <Table sx={{ minWidth: 820 }} size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Title</TableCell>
                    <TableCell>Call no.</TableCell>
                    <TableCell>ISBN</TableCell>
                    <TableCell align="right">Copies</TableCell>
                    <TableCell>Availability</TableCell>
                    <TableCell aria-label="Actions" />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rows.map((b) => (
                    <TableRow key={b.id} hover data-testid="book-row" sx={{ '& td': { py: 1.25 } }}>
                      <TableCell>
                        <Typography variant="subtitle2">{b.title}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {b.author || 'Author not recorded'}
                        </Typography>
                      </TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap', fontFamily: 'monospace', fontSize: '0.8125rem' }}>{b.callNo ?? '—'}</TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap', color: b.isbn ? 'text.primary' : 'text.secondary' }}>{b.isbn ?? '—'}</TableCell>
                      <TableCell align="right" sx={num}>
                        {b.copies}
                      </TableCell>
                      <TableCell>
                        <Availability book={b} />
                      </TableCell>
                      <TableCell align="right" sx={{ pr: 1.5 }}>
                        <Button size="small" onClick={() => onIssue(b)} disabled={availableCopies(b) === 0} aria-label={`Issue ${b.title}`}>
                          Issue
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableFrame>
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
                    Issue
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
  students,
  studentsComplete,
  today,
  onClose,
}: {
  books: LibraryBook[];
  book?: LibraryBook;
  students: LibraryStudent[];
  studentsComplete: boolean;
  today: string;
  onClose: (done?: string) => void;
}) {
  const shelf = books.filter((b) => availableCopies(b) > 0);
  const [book, setBook] = useState<LibraryBook | null>(preset ?? null);
  const [student, setStudent] = useState<LibraryStudent | null>(null);
  const [dueOn, setDueOn] = useState(addDays(today, LOAN_DAYS));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const ready = !!book && !!student && dueOn >= today;

  const submit = () => {
    if (!ready) return;
    setError(null);
    start(async () => {
      const res = await issueBook({ bookId: book.id, studentId: student.id, dueOn });
      if (res.ok) onClose(`Issued “${book.title}” to ${student.fullName} · due ${formatDate(dueOn, 'short')}`);
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
        <DialogTitle id="issue-book-title">Issue a book</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5 }}>
            The student and their family see the book and its due date in their apps. Late returns are fined ₹2 a day.
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
                    {[b.author, b.callNo, `${availableCopies(b)} of ${b.copies} available`].filter(Boolean).join(' · ')}
                  </Typography>
                </Box>
              )}
              renderInput={(params) => <TextField {...params} label="Book" required placeholder="Title, author or call number" />}
              filterOptions={(opts, { inputValue }) => {
                const t = inputValue.trim().toLowerCase();
                return t ? opts.filter((b) => [b.title, b.author, b.callNo ?? ''].some((v) => v.toLowerCase().includes(t))) : opts;
              }}
              noOptionsText="No book on the shelf matches"
            />
            <Autocomplete
              options={students}
              value={student}
              onChange={(_, v) => setStudent(v)}
              getOptionLabel={(s) => s.fullName}
              isOptionEqualToValue={(a, b) => a.id === b.id}
              filterOptions={(opts, { inputValue }) => searchStudents(opts, inputValue)}
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
                  label="Student"
                  required
                  placeholder="Name or roll number"
                  helperText={
                    student
                      ? [student.rollNo, student.className].filter(Boolean).join(' · ')
                      : studentsComplete
                        ? `${students.length} students`
                        : 'Only students who already have a book out are listed for now.'
                  }
                />
              )}
              noOptionsText="No student matches"
            />
            <TextField
              label="Due on"
              type="date"
              value={dueOn}
              onChange={(e) => setDueOn(e.target.value)}
              required
              helperText={dueOn >= today ? `${dueLabel(dueOn, today)} · ${formatDate(dueOn, 'long')}` : 'The due date has already passed'}
              error={dueOn < today}
              slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: today } }}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => onClose()} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" variant="contained" disabled={pending || !ready} startIcon={pending ? <CircularProgress size={16} color="inherit" /> : undefined}>
            Issue
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}

function ReturnDialog({ loan, today, onClose }: { loan: LibraryLoan; today: string; onClose: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ finePaise: number } | null>(null);
  const [pending, start] = useTransition();
  const late = daysLate(loan.dueOn, today);
  const fine = finePreview(loan.dueOn, today);

  if (done) {
    return (
      <Dialog open onClose={onClose} maxWidth="xs" fullWidth aria-labelledby="returned-title">
        <DialogTitle id="returned-title" sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <CheckCircleOutlined sx={{ color: 'kx.success' }} />
          Book returned
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            <strong>{loan.book.title}</strong> is back on the shelf from {loan.student.fullName}.
          </Typography>
          {done.finePaise > 0 ? (
            <Box sx={{ mt: 2, p: 2, borderRadius: '12px', bgcolor: 'm3.errorContainer', color: 'm3.onErrorContainer' }} data-testid="return-fine">
              <Typography variant="body2">Late fine to collect</Typography>
              <Typography sx={{ fontSize: '2rem', lineHeight: '40px', ...num }}>{formatRupees(done.finePaise)}</Typography>
              <Typography variant="caption">
                {late} day{late === 1 ? '' : 's'} late at ₹2 a day
              </Typography>
            </Box>
          ) : (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }} data-testid="return-fine">
              Returned on time · no fine.
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button variant="contained" onClick={onClose}>
            Done
          </Button>
        </DialogActions>
      </Dialog>
    );
  }

  return (
    <Dialog open onClose={pending ? undefined : onClose} maxWidth="xs" fullWidth aria-labelledby="return-title">
      <DialogTitle id="return-title">Return this book?</DialogTitle>
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
            Due {formatDate(loan.dueOn, 'short')} · <Box component="span" sx={{ color: late ? 'error.main' : 'inherit' }}>{dueLabel(loan.dueOn, today)}</Box>
          </Typography>
        </Box>
        <Typography variant="body2" sx={{ mt: 2 }}>
          {fine > 0 ? (
            <>
              A late fine of <strong>{formatRupees(fine)}</strong> will be recorded ({late} day{late === 1 ? '' : 's'} at ₹2 a day).
            </>
          ) : (
            'No fine: it is back on time.'
          )}
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={pending}>
          Cancel
        </Button>
        <Button
          variant="contained"
          disabled={pending}
          startIcon={pending ? <CircularProgress size={16} color="inherit" /> : undefined}
          onClick={() =>
            start(async () => {
              const res = await returnBook(loan.id);
              if (res.ok) setDone({ finePaise: res.data.finePaise });
              else setError(res.error);
            })
          }
        >
          Mark returned
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function AddBookDialog({ onClose }: { onClose: (done?: string) => void }) {
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
      if (res.ok) onClose(`Added “${res.data.title}” · ${res.data.copies} cop${res.data.copies === 1 ? 'y' : 'ies'}`);
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
        <DialogTitle id="add-book-title">Add a book</DialogTitle>
        <DialogContent>
          <Stack spacing={2.5} sx={{ pt: 1 }}>
            {error && <Alert severity="error">{error}</Alert>}
            <TextField label="Title" value={title} onChange={(e) => setTitle(e.target.value)} required autoFocus slotProps={{ htmlInput: { maxLength: 300 } }} />
            <TextField label="Author" value={author} onChange={(e) => setAuthor(e.target.value)} slotProps={{ htmlInput: { maxLength: 200 } }} />
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
              <TextField label="Call number" value={callNo} onChange={(e) => setCallNo(e.target.value)} placeholder="657.95 MAH" slotProps={{ htmlInput: { maxLength: 40 } }} />
              <TextField
                label="Copies"
                value={copies}
                onChange={(e) => setCopies(e.target.value)}
                required
                error={!copiesOk}
                helperText={copiesOk ? ' ' : '1 to 500'}
                slotProps={{ htmlInput: { inputMode: 'numeric' } }}
              />
            </Box>
            <TextField label="ISBN (optional)" value={isbn} onChange={(e) => setIsbn(e.target.value)} placeholder="978-93-…" slotProps={{ htmlInput: { maxLength: 20 } }} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => onClose()} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" variant="contained" disabled={pending || !ready} startIcon={pending ? <CircularProgress size={16} color="inherit" /> : undefined}>
            Add book
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}
