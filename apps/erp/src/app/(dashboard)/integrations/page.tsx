import type { Metadata } from 'next';
import { IntegrationsDesk, type DeviceRow, type DocRow, type FeedToken, type LtiTool, type ScormRow } from '@/components/integrations/IntegrationsDesk';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { getI18n } from '@/i18n/server';
import { api, load, requireSection } from '@/lib/api';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.integrations') };
}

/** DigiLocker documents and the NAD file, attendance and card devices, LTI tools and SCORM packages, and feed tokens. */
export default async function IntegrationsPage() {
  await requireSection('integrations');
  const { t } = await getI18n();
  const data = await load(async () => {
    const [docs, devices, tools, scorm, tokens] = await Promise.all([
      api<DocRow[]>('/v1/digilocker/documents'),
      api<DeviceRow[]>('/v1/access-devices'),
      api<LtiTool[]>('/v1/lti/tools'),
      api<ScormRow[]>('/v1/scorm/packages'),
      api<{ tokens: FeedToken[] }>('/v1/api-tokens'),
    ]);
    return { docs, devices, tools, scorm, tokens: tokens.tokens };
  });
  if (data.error !== undefined) return <ErrorState message={data.error} />;
  return (
    <>
      <PageHeader title={t('nav.integrations')} subtitle={t('itg.subtitle')} />
      <IntegrationsDesk {...data.data} />
    </>
  );
}
