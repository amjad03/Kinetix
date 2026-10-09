import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { PageHeader } from '@/components/PageHeader';
import { ScanDesk } from '@/components/scan/ScanDesk';
import { getI18n } from '@/i18n/server';
import { getMe } from '@/lib/api';
import { canSee, homeFor } from '@/lib/access';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('scan.title') };
}

/** Scan a book label or an asset label and see what it is, where it is and who has it. */
export default async function ScanPage() {
  const me = await getMe();
  if (!canSee(me.roles, 'library') && !canSee(me.roles, 'assets')) redirect(homeFor(me.roles));
  const { t } = await getI18n();
  return (
    <>
      <PageHeader title={t('scan.title')} subtitle={t('scan.subtitle')} />
      <ScanDesk />
    </>
  );
}
