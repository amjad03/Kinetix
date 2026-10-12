import type { Metadata } from 'next';
import { ArrowLeft } from 'lucide-react';
import { OfficeSettings } from '@/components/exam-office/OfficeSettings';
import { LinkButton } from '@/components/LinkButton';
import { ErrorState } from '@/components/ui';
import { api, load, requireSection } from '@/lib/api';
import { getI18n } from '@/i18n/server';
import type { OfficeSettings as Settings } from '@/lib/exam-office';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('xo.set.title') };
}

/** Exam office settings; only the principal, an administrator or the controller of examinations can change them. */
export default async function OfficeSettingsPage() {
  const me = await requireSection('exams');
  const { t } = await getI18n();
  const res = await load(() => api<{ settings: Settings; gradeScales: { id: string; name: string }[] }>('/v1/exam-office/settings'));
  const canEdit = !!me?.roles.some((r) => r === 'principal' || r === 'tenant_admin' || r === 'exam_controller');
  return (
    <>
      <div className="-ml-2 mb-1">
        <LinkButton href="/exams/office" size="small" startIcon={<ArrowLeft />}>
          {t('xo.back')}
        </LinkButton>
      </div>
      {res.error !== undefined ? <ErrorState message={res.error} /> : <OfficeSettings initial={res.data.settings} scales={res.data.gradeScales} canEdit={canEdit} />}
    </>
  );
}
