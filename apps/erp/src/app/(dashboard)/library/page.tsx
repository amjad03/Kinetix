import type { Metadata } from 'next';
import { LibraryDesk } from '@/components/library/LibraryDesk';
import { PageHeader } from '@/components/PageHeader';
import { StatGrid, StatTile } from '@/components/StatTile';
import { ErrorState } from '@/components/States';
import { api, load, requireSection } from '@/lib/api';
import { availableCopies } from '@/lib/library';
import { libraryStudents } from '@/lib/library-data';
import { formatRupees } from '@/lib/money';
import { finePreview } from '@/lib/library';
import { schoolToday } from '@/lib/school';
import type { LibraryBook, LibraryLoan } from '@/lib/types';

export const metadata: Metadata = { title: 'Library' };

export default async function LibraryPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const me = await requireSection('library');
  const { tab } = await searchParams;
  const [books, loans] = await Promise.all([load(() => api<LibraryBook[]>('/v1/library/books')), load(() => api<LibraryLoan[]>('/v1/library/loans'))]);
  const today = schoolToday();
  const students = me && loans.data ? await load(() => libraryStudents(me, loans.data)) : null;

  const b = books.data ?? [];
  const l = loans.data ?? [];
  const copies = b.reduce((s, x) => s + x.copies, 0);
  const onShelf = b.reduce((s, x) => s + availableCopies(x), 0);
  const overdue = l.filter((x) => x.overdue);
  const fines = overdue.reduce((s, x) => s + finePreview(x.dueOn, today), 0);

  return (
    <>
      <PageHeader title="Library" subtitle="Lend books to students, take them back, and keep the catalogue" />
      {books.error !== undefined || loans.error !== undefined ? (
        <ErrorState message={(books.error ?? loans.error)!} />
      ) : (
        <>
          <StatGrid min={180}>
            <StatTile label="Titles" value={b.length} caption={`${copies} copies in the catalogue`} testId="lib-titles" />
            <StatTile label="On the shelf" value={onShelf} caption={`of ${copies} copies`} testId="lib-shelf" />
            <StatTile label="On loan" value={l.length} caption={l.length ? `${l.length - overdue.length} within their due date` : 'Nothing is out'} testId="lib-loans" />
            <StatTile
              label="Overdue"
              value={overdue.length}
              tone={overdue.length ? 'warning' : 'default'}
              caption={overdue.length ? `${formatRupees(fines)} in fines if returned today` : 'Nothing is overdue'}
              testId="lib-overdue"
            />
          </StatGrid>
          <LibraryDesk
            books={b}
            loans={l}
            today={today}
            students={students?.data?.students ?? []}
            studentsComplete={students?.data?.complete ?? false}
            initialTab={tab === 'catalogue' ? 'catalogue' : 'loans'}
          />
        </>
      )}
    </>
  );
}
