import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { LinkButton } from '@/components/LinkButton';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { PromotionTool } from '@/components/students/PromotionTool';
import { canChangeLifecycle } from '@/lib/access';
import { api, load, requireSection } from '@/lib/api';
import type { Structure } from '@/lib/types';
import { getI18n } from '@/i18n/server';

import { ArrowLeft as ArrowBack } from 'lucide-react';
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('stu.promotion') };
}

export default async function PromotionPage() {
  const me = await requireSection('students');
  if (me && !canChangeLifecycle(me.roles)) redirect('/students');
  const { t } = await getI18n();
  const structure = await load(() => api<Structure>('/v1/admin/structure'));
  const classes = (structure.data?.sections ?? []).map((s) => ({ id: s.id, name: s.displayName, programId: s.programId, term: s.term, students: s.students, final: s.term >= (structure.data!.programs.find((p) => p.id === s.programId)?.termCount ?? Infinity) }));
  return (
    <>
      <div className="-ml-2 mb-1">
        <LinkButton href="/students" size="small" startIcon={<ArrowBack />}>
          {t('nav.students')}
        </LinkButton>
      </div>
      <PageHeader title={t('stu.promotion')} subtitle={t('stu.promo.subtitle')} />
      {structure.error !== undefined ? <ErrorState message={structure.error} /> : <PromotionTool classes={classes} />}
    </>
  );
}
