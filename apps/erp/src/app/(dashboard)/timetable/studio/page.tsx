import type { Metadata } from 'next';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { StudioList } from '@/components/timetable/StudioList';
import { getI18n } from '@/i18n/server';
import { api, load, requireSection } from '@/lib/api';
import type { StudioOptions, VersionRow } from '@/lib/timetable-studio';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.timetableStudio') };
}

/** Timetable → Studio: versions of the timetable, generated under constraints, edited and published. */
export default async function StudioPage() {
  const me = await requireSection('timetableStudio');
  const { t } = await getI18n();
  const [list, options] = await Promise.all([load(() => api<{ rows: VersionRow[]; total: number }>('/v1/timetable-studio/versions?pageSize=100')), load(() => api<StudioOptions>('/v1/timetable-studio/options'))]);
  const err = list.error ?? options.error;
  return (
    <>
      <PageHeader title={t('nav.timetableStudio')} subtitle={t('tts2.subtitle')} />
      {err !== undefined ? <ErrorState message={err} /> : <StudioList rows={list.data!.rows} options={options.data!} canEdit={(me?.roles ?? []).some((r) => r === 'principal' || r === 'tenant_admin')} />}
    </>
  );
}
