import type { Metadata } from 'next';
import Link from 'next/link';
import { LinkButton } from '@/components/LinkButton';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { Card } from '@/components/ui';
import { getI18n } from '@/i18n/server';
import type { MessageKey } from '@/i18n/messages';
import { api, load, requireSection } from '@/lib/api';
import { MODULE_REPORTS, OPS_MODULES } from '@/lib/campus-ops';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.campusOps') };
}

/** Registers, statements and settings for every admissions and campus-operations module the user runs. */
export default async function OpsReportsHub() {
  await requireSection('campusOps');
  const { t } = await getI18n();
  const defs = await load(() => api<{ id: string; module: string }[]>('/v1/ops-reports'));
  if (!defs.data) return <ErrorState message={defs.error ?? ''} />;
  const mine = new Set(defs.data.map((d) => d.module));
  return (
    <>
      <PageHeader title={t('cops.title')} subtitle={t('cops.subtitle')} />
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {OPS_MODULES.filter((m) => mine.has(m)).map((m) => (
          <Card
            key={m}
            title={t(`cops.m.${m}` as MessageKey)}
            action={
              <LinkButton href={`/module-settings/${m}`} variant="outlined" size="small">
                {t('cops.settings')}
              </LinkButton>
            }
          >
            <ul className="grid gap-2">
              {MODULE_REPORTS[m].map((id) => (
                <li key={id}>
                  <Link className="text-sm font-medium text-primary hover:underline" href={`/ops-reports/${id}`}>
                    {t(`cops.r.${id}` as MessageKey)}
                  </Link>
                </li>
              ))}
              {m === 'library' && (
                <li>
                  <Link className="text-sm font-medium text-primary hover:underline" href="/library/stock-checks">
                    {t('cops.sc.title')}
                  </Link>
                </li>
              )}
            </ul>
          </Card>
        ))}
      </div>
    </>
  );
}
