import type { Metadata } from 'next';
import { NotificationSettingsForm } from '@/components/access/NotificationSettingsForm';
import { LinkButton } from '@/components/LinkButton';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { getI18n } from '@/i18n/server';
import { api, load, requireSection } from '@/lib/api';
import type { NotificationSettings } from '@/lib/governance-access';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('ga.notif.title') };
}

/** Settings > Notifications: which app notifications the institution sends, and which also buzz the phone. */
export default async function NotificationSettingsPage() {
  await requireSection('settings');
  const { t } = await getI18n();
  const data = await load(() => Promise.all([api<NotificationSettings>('/v1/admin/notification-settings'), api<{ commsChannels: Partial<Record<'push' | 'sms' | 'email' | 'whatsapp', boolean>> }>('/v1/admin/institution/setup')]));
  return (
    <>
      <PageHeader
        title={t('ga.notif.title')}
        subtitle={t('ga.notif.sub')}
        actions={
          <LinkButton href="/communication" variant="outlined">
            {t('ga.notif.templates')}
          </LinkButton>
        }
      />
      {data.error !== undefined ? <ErrorState message={data.error} /> : <NotificationSettingsForm initial={data.data[0]} channels={{ push: data.data[1].commsChannels.push ?? true, sms: data.data[1].commsChannels.sms ?? false, email: data.data[1].commsChannels.email ?? false, whatsapp: data.data[1].commsChannels.whatsapp ?? false }} />}
    </>
  );
}
