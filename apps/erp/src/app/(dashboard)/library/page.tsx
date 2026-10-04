import type { Metadata } from 'next';
import { LibraryDesk } from '@/components/library/LibraryDesk';
import { PageHeader } from '@/components/PageHeader';
import { StatGrid, StatTile } from '@/components/StatTile';
import { ErrorState } from '@/components/States';
import { api, load, requireSection } from '@/lib/api';
import { availableCopies, unpaidFines } from '@/lib/library';
import { formatRupees } from '@/lib/money';
import { finePreview } from '@/lib/library';
import { schoolToday } from '@/lib/school';
import type { LibraryBook, LibraryLoan } from '@/lib/types';

export const metadata: Metadata = { title: 'Library' };

export default async function LibraryPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  await requireSection('library');
  const { tab } = await searchParams;
  const [books, loans, fines] = await Promise.all([
    load(() => api<LibraryBook[]>('/v1/library/books')),
    load(() => api<LibraryLoan[]>('/v1/library/loans')),
    load(() => api<LibraryLoan[]>('/v1/library/fines')),
  ]);
  const today = schoolToday();

  const b = books.data ?? [];
  const l = loans.data ?? [];
  const copies = b.reduce((s, x) => s + x.copies, 0);
  const onShelf = b.reduce((s, x) => s + availableCopies(x), 0);
  const overdue = l.filter((x) => x.overdue);
  const accruing = overdue.reduce((s, x) => s + finePreview(x.dueOn, today), 0);
  const f = fines.data ?? [];
  const unpaid = unpaidFines(f);

  return (
    <>
      <PageHeader title="Library" subtitle="Lend books to students, take them back, and keep the catalogue" />
      {books.error !== undefined || loans.error !== undefined || fines.error !== undefined ? (
        <ErrorState message={(books.error ?? loans.error ?? fines.error)!} />
      ) : (
        <>
          <StatGrid min={120}>
            <StatTile label="Titles" value={b.length} caption={`${copies} copies in the catalogue`} testId="lib-titles" />
            <StatTile label="On the shelf" value={onShelf} caption={`of ${copies} copies`} testId="lib-shelf" />
            <StatTile label="On loan" value={l.length} caption={l.length ? `${l.length - overdue.length} within their due date` : 'Nothing is out'} testId="lib-loans" />
            <StatTile
              label="Overdue"
              value={overdue.length}
              tone={overdue.length ? 'warning' : 'default'}
              caption={overdue.length ? `${formatRupees(accruing)} in fines if returned today` : 'Nothing is overdue'}
              testId="lib-overdue"
            />
            <StatTile
              label="Unpaid fines"
              value={formatRupees(unpaid.paise)}
              tone={unpaid.count ? 'warning' : 'default'}
              caption={unpaid.count ? `${unpaid.count} return${unpaid.count === 1 ? '' : 's'} to collect from` : 'All fines collected'}
              testId="lib-fines"
            />
          </StatGrid>
          <LibraryDesk
            books={b}
            loans={l}
            today={today}
            fines={f}
            initialTab={tab === 'catalogue' || tab === 'fines' ? tab : 'loans'}
          />
        </>
      )}
    </>
  );
}
