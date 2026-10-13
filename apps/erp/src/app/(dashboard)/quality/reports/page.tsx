import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { Card } from '@/components/ui';
import { getI18n } from '@/i18n/server';
import { api, load, requireSection } from '@/lib/api';
import { COLLEGE_ONLY_MODULES, QH_MODULES, REPORT_IDS, reportKey, type QhModule } from '@/lib/quality-hub';

/** Schools do not see the college-only modules (accreditation, placements, alumni, research). */
async function isSchool() {
  const c = await load(() => api<{ tenantKind?: string | null }>('/v1/institution/capabilities'));
  return c.error === undefined && c.data.tenantKind === 'school';
}

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.qhReports') };
}

interface ReportRow {
  id: string;
  module: QhModule;
  criterion: string | null;
}

/** Every report of the quality, outcomes and engagement group this person may run, by module. */
export default async function QualityReportsPage() {
  await requireSection('qualityHub');
  const { t } = await getI18n();
  const data = await load(() => api<ReportRow[]>('/v1/quality-hub/reports'));
  if (data.error !== undefined) return <ErrorState message={data.error} />;
  const school = await isSchool();
  const mine = data.data.filter((r) => (REPORT_IDS as readonly string[]).includes(r.id) && !(school && COLLEGE_ONLY_MODULES.includes(r.module)));
  const modules = QH_MODULES.filter((m) => mine.some((r) => r.module === m));
  return (
    <div className="grid gap-6">
      <PageHeader title={t('nav.qhReports')} subtitle={t('qh.reportsSubtitle')} />
      {modules.length === 0 && <p className="text-sm text-muted-foreground">{t('qh.noReports')}</p>}
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {modules.map((m) => (
          <Card key={m} title={t(`qh.mod.${m}`)}>
            <ul className="grid gap-4">
              {mine
                .filter((r) => r.module === m)
                .map((r) => (
                  <li key={r.id} className="grid gap-1">
                    <Link href={`/quality/reports/${r.id}`} className="text-sm font-semibold text-primary hover:underline" data-testid={`qh-report-${r.id}`}>
                      {t(reportKey(r.id))}
                    </Link>
                    <span className="text-xs text-muted-foreground">
                      {t(`${reportKey(r.id)}.d` as Parameters<typeof t>[0])}
                      {r.criterion && ` · ${r.criterion}`}
                    </span>
                  </li>
                ))}
            </ul>
          </Card>
        ))}
      </div>
    </div>
  );
}
