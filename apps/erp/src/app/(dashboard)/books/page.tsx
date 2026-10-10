import type { Metadata } from 'next';
import { BooksDesk, type Account, type FyClose } from '@/components/gateway-books/BooksDesk';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { getI18n } from '@/i18n/server';
import { api, load, requireSection } from '@/lib/api';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.books') };
}

export default async function BooksPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  await requireSection('finance');
  const { tab } = await searchParams;
  const { t } = await getI18n();
  const data = await load(async () => ({ accounts: await api<Account[]>('/v1/books/accounts'), years: await api<FyClose[]>('/v1/books/years') }));
  return (
    <>
      <PageHeader title={t('nav.books')} subtitle={t('gb.books.subtitle')} />
      {data.error !== undefined ? <ErrorState message={data.error} /> : <BooksDesk accounts={data.data.accounts} years={data.data.years} initialTab={tab ?? 'accounts'} />}
    </>
  );
}
