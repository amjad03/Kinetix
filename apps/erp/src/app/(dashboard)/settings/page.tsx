import type { Metadata } from 'next';
import { LinkButton } from '@/components/LinkButton';
import { PageHeader } from '@/components/PageHeader';
import { ConsentSummaryView } from '@/components/settings/ConsentSummary';
import { DataRetention } from '@/components/settings/DataRetention';
import { ParentVisibility } from '@/components/settings/ParentVisibility';
import { GrievanceOfficerForm } from '@/components/settings/GrievanceOfficerForm';
import { BoardContentSection } from '@/components/settings/BoardContentSection';
import { KioskSection } from '@/components/settings/KioskSection';
import { RazorpayForm } from '@/components/settings/RazorpayForm';
import { RecordingRetentionSection } from '@/components/settings/RecordingRetentionSection';
import { SettingsForm } from '@/components/settings/SettingsForm';
import { ErrorState } from '@/components/States';
import { getI18n } from '@/i18n/server';
import { api, load, requireSection } from '@/lib/api';
import { API_URL } from '@/lib/config';
import type { ParentVisibilityRow, RetentionRules } from '@/lib/pathways-b';
import { webhookUrl, type RazorpayAccount } from '@/lib/payments';
import { DEFAULT_BOARD_KIOSK, type ConsentSummary, type InstitutionSettings } from '@/lib/settings';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.settings') };
}

export default async function SettingsPage() {
  await requireSection('settings');
  const { t } = await getI18n();
  const [settings, consents, razorpay, retention, visibility] = await Promise.all([
    load(() => api<InstitutionSettings>('/v1/admin/settings')),
    load(() => api<ConsentSummary>('/v1/admin/consents')),
    load(() => api<RazorpayAccount>('/v1/admin/payments/razorpay')),
    load(() => api<RetentionRules>('/v1/retention/rules')),
    load(() => api<ParentVisibilityRow[]>('/v1/parent-visibility')),
  ]);
  return (
    <>
      <PageHeader title={t('nav.settings')} subtitle={t('settings.subtitle')} actions={<LinkButton href="/settings/security" variant="outlined">{t('security.features')}</LinkButton>} />
      {settings.error !== undefined ? (
        <ErrorState message={settings.error} />
      ) : (
        <>
          <SettingsForm initial={settings.data} />
          <KioskSection initial={settings.data.boardKiosk ?? DEFAULT_BOARD_KIOSK} />
          <BoardContentSection initial={settings.data} />
          <GrievanceOfficerForm initial={settings.data.grievanceOfficer ?? null} />
        </>
      )}
      {/* The ERP reaches the API at its public address (docs/operations/deploy.md), which Razorpay calls too. */}
      {razorpay.error !== undefined ? <ErrorState message={razorpay.error} /> : <RazorpayForm initial={razorpay.data} webhookUrl={webhookUrl(API_URL, razorpay.data.webhookPath)} />}
      <RecordingRetentionSection />
      {retention.error !== undefined ? <ErrorState message={retention.error} /> : <DataRetention data={retention.data} />}
      {visibility.error !== undefined ? <ErrorState message={visibility.error} /> : <ParentVisibility rows={visibility.data} />}
      {consents.error !== undefined ? <ErrorState message={consents.error} /> : <ConsentSummaryView summary={consents.data} />}
    </>
  );
}
