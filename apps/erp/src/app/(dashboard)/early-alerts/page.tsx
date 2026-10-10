import type { Metadata } from 'next';
import { EarlyAlertDesk, type AlertRow } from '@/components/integrations/EarlyAlertDesk';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { getI18n } from '@/i18n/server';
import { api, load, requireSection } from '@/lib/api';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.earlyAlerts') };
}

const MANAGERS = ['tenant_admin', 'principal', 'hod', 'counsellor'];

/** Students flagged from attendance, marks, homework and fees, with the mentor's steps. */
export default async function EarlyAlertsPage() {
  const me = await requireSection('earlyAlerts');
  const { t } = await getI18n();
  const rows = await load(() => api<AlertRow[]>('/v1/early-alerts'));
  if (rows.error !== undefined) return <ErrorState message={rows.error} />;
  const canRun = (me?.roles ?? []).some((r) => MANAGERS.includes(r));
  return (
    <>
      <PageHeader title={t('nav.earlyAlerts')} subtitle={t('ea.subtitle')} />
      <EarlyAlertDesk rows={rows.data!} canRun={canRun} />
    </>
  );
}
