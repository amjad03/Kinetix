import type { Metadata } from 'next';
import { LibraryKiosk } from '@/components/library/LibraryKiosk';
import { LinkButton } from '@/components/LinkButton';
import { PageHeader } from '@/components/PageHeader';
import { getI18n } from '@/i18n/server';
import { requireSection } from '@/lib/api';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('lp.kiosk.title') };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The self-check kiosk station (signed in as the desk); `?branch=` names the branch the station stands in. */
export default async function KioskPage({ searchParams }: { searchParams: Promise<{ branch?: string }> }) {
  await requireSection('library');
  const { t } = await getI18n();
  const { branch } = await searchParams;
  return (
    <>
      <PageHeader title={t('lp.kiosk.title')} subtitle={t('lp.kiosk.subtitle')} actions={<LinkButton href="/library/desk" variant="outlined">{t('lht.desk.library')}</LinkButton>} />
      <LibraryKiosk branchId={branch && UUID.test(branch) ? branch : undefined} />
    </>
  );
}
