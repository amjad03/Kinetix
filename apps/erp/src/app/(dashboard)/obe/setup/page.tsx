import type { Metadata } from 'next';
import { OutcomesEditor } from '@/components/obe/OutcomesEditor';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { api, load, requireSection } from '@/lib/api';
import { getI18n } from '@/i18n/server';
import type { AttainmentConfig, ProgramOutcome } from '@/lib/obe';
import type { Structure } from '@/lib/types';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('obe.setup') };
}

export default async function ObeSetupPage({ searchParams }: { searchParams: Promise<{ programId?: string }> }) {
  const me = await requireSection('obe');
  const q = await searchParams;
  const structure = await load(() => api<Structure>('/v1/admin/structure'));
  const { t } = await getI18n();
  const head = <PageHeader title={t('obe.setup')} subtitle={t('obe.setupSubtitle')} />;
  if (structure.error !== undefined) return <>{head}<ErrorState message={structure.error} /></>;
  const programId = q.programId ?? structure.data.programs[0]?.id ?? '';
  if (!programId) return <>{head}<ErrorState message={t('obe.noProgram')} /></>;
  const [outcomes, config] = await Promise.all([load(() => api<ProgramOutcome[]>(`/v1/obe/programs/${programId}/outcomes`)), load(() => api<AttainmentConfig>(`/v1/obe/programs/${programId}/config`))]);
  if (outcomes.error !== undefined || config.error !== undefined) return <>{head}<ErrorState message={(outcomes.error ?? config.error)!} /></>;
  const canEdit = !!me && me.roles.some((r) => r === 'principal' || r === 'tenant_admin');
  return (
    <>
      {head}
      <OutcomesEditor key={programId} programs={structure.data.programs} programId={programId} outcomes={outcomes.data} config={config.data} canEdit={canEdit} />
    </>
  );
}
