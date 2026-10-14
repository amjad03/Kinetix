import type { Metadata } from 'next';
import Link from 'next/link';
import { FeeKitTable } from '@/components/fee-depth/FeeKitTable';
import { FeesNav } from '@/components/fees/FeesNav';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/shadcn/button';
import { ErrorState } from '@/components/States';
import { getI18n } from '@/i18n/server';
import { requireSection } from '@/lib/api';
import { loadRecords } from '@/lib/records-server';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('fd.nav.govt-scholarships') };
}

/**
 * Government scholarships: applied on the portal, sanctioned, then the money received pays the student's dues on a
 * receipt (anything more is kept as advance). Imported from the portal's sheet, tracked, exported for the register.
 */
export default async function GovtScholarshipsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireSection('fees');
  const sp = await searchParams;
  const { t } = await getI18n();
  const records = await loadRecords('fee-govt-scholarships', sp);
  return (
    <>
      <PageHeader
        title={t('fd.nav.govt-scholarships')}
        subtitle={t('fd.sub.govt-scholarships')}
        actions={
          <>
            <Button asChild variant="outline" className="h-9">
              <Link href="/scholarships">{t('fx.instituteSchemes')}</Link>
            </Button>
            <Button asChild variant="outline" className="h-9">
              <Link href="/accounts/reports/scholarships">{t('fd.rep.scholarships')}</Link>
            </Button>
          </>
        }
      />
      <FeesNav value="scholarships" />
      {records.error !== undefined ? <ErrorState message={records.error} /> : <FeeKitTable meta={records.data.meta} page={records.data.page} state={records.data.state} label={t('fd.nav.govt-scholarships')} />}
    </>
  );
}
