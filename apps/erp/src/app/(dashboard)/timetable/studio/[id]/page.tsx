import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/shadcn/button';
import { ErrorState } from '@/components/States';
import { StudioEditor } from '@/components/timetable/StudioEditor';
import { getI18n } from '@/i18n/server';
import { api, load, requireSection } from '@/lib/api';
import type { VersionDetail } from '@/lib/timetable-studio';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('nav.timetableStudio') };
}

/** One version of the timetable in the studio: the editable week, its problems, workload and publishing. */
export default async function VersionPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireSection('timetableStudio');
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const { t } = await getI18n();
  const v = await load(() => api<VersionDetail>(`/v1/timetable-studio/versions/${id}`));
  return (
    <>
      <PageHeader
        title={v.data ? v.data.name : t('nav.timetableStudio')}
        subtitle={t('tts2.versionSubtitle')}
        actions={
          <Button variant="outline" asChild>
            <Link href="/timetable/studio">
              <ArrowLeft />
              {t('tts2.allVersions')}
            </Link>
          </Button>
        }
      />
      {v.error !== undefined ? <ErrorState message={v.error} /> : <StudioEditor v={v.data!} canEdit={(me?.roles ?? []).some((r) => r === 'principal' || r === 'tenant_admin')} />}
    </>
  );
}
