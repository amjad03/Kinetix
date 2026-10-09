import type { Metadata } from 'next';
import { LinkButton } from '@/components/LinkButton';
import { LibraryDesk } from '@/components/library/LibraryDesk';
import { PageHeader } from '@/components/PageHeader';
import { StatGrid, StatTile } from '@/components/StatTile';
import { ErrorState } from '@/components/States';
import { api, load, requireSection } from '@/lib/api';
import { availableCopies, unpaidFines } from '@/lib/library';
import { formatRupees } from '@/lib/money';
import { finePreview } from '@/lib/library';
import { schoolToday } from '@/lib/school';
import { getI18n } from '@/i18n/server';
import type { LibraryBook, LibraryLoan } from '@/lib/types';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.library') };
}

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
  const { t } = await getI18n();

  return (
    <>
      <PageHeader title={t('nav.library')} subtitle={t('lib.subtitle')} actions={<><LinkButton href="/library/circulation" variant="outlined">{t('dx.link.circ')}</LinkButton><LinkButton href="/library/e-resources" variant="outlined">{t('dx.link.eres')}</LinkButton></>} />
      {books.error !== undefined || loans.error !== undefined || fines.error !== undefined ? (
        <ErrorState message={(books.error ?? loans.error ?? fines.error)!} />
      ) : (
        <>
          <StatGrid min={120}>
            <StatTile label={t('lib.titles')} value={b.length} caption={t('lib.copies', { n: copies })} testId="lib-titles" />
            <StatTile label={t('lib.onShelf')} value={onShelf} caption={t('lib.ofCopies', { n: copies })} testId="lib-shelf" />
            <StatTile label={t('lib.onLoan')} value={l.length} caption={l.length ? t('lib.withinDue', { n: l.length - overdue.length }) : t('lib.nothingOut')} testId="lib-loans" />
            <StatTile
              label={t('lib.overdue')}
              value={overdue.length}
              tone={overdue.length ? 'warning' : 'default'}
              caption={overdue.length ? t('lib.finesIfToday', { amount: formatRupees(accruing) }) : t('lib.nothingOverdue')}
              testId="lib-overdue"
            />
            <StatTile
              label={t('lib.unpaidFines')}
              value={formatRupees(unpaid.paise)}
              tone={unpaid.count ? 'warning' : 'default'}
              caption={unpaid.count ? t.plural('lib.returnsToCollect', unpaid.count) : t('lib.allCollected')}
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
