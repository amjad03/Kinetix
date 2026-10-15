import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/shadcn/button';
import { Card } from '@/components/ui';
import { getI18n } from '@/i18n/server';
import type { MessageKey } from '@/i18n/messages';
import { requireSection } from '@/lib/api';
import { REPORTS } from '@/lib/fee-desk';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('fd.reports') };
}

const GROUPS = ['collection', 'registers', 'books', 'statements'] as const;

/** Every accounts report, grouped: collection, registers, books of account and statements. */
export default async function DeskReportsPage() {
  await requireSection('finance');
  const { t } = await getI18n();
  return (
    <>
      <PageHeader
        title={t('fd.reports')}
        subtitle={t('fd.reports.sub')}
        actions={
          <Button asChild variant="outline">
            <Link href="/accounts">{t('fd.back')}</Link>
          </Button>
        }
      />
      <div className="grid gap-6 lg:grid-cols-2">
        {GROUPS.map((g) => (
          <Card key={g} title={t(`fd.grp.${g}` as MessageKey)}>
            <ul className="grid gap-2">
              {REPORTS.filter((r) => r.group === g).map((r) => (
                <li key={r.key}>
                  <Link href={`/accounts/reports/${r.key}`} className="block rounded-lg border p-4 transition-colors hover:bg-muted">
                    <span className="block font-medium">{t(`fd.rep.${r.key}` as MessageKey)}</span>
                    <span className="mt-1 block text-sm text-muted-foreground">{t(`fd.rep.${r.key}.sub` as MessageKey)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>
    </>
  );
}
