import ArrowBack from '@mui/icons-material/ArrowBack';
import Box from '@mui/material/Box';
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
      <Box sx={{ ml: -1, mb: 0.5 }}>
        <LinkButton href="/students" size="small" startIcon={<ArrowBack />}>
          {t('nav.students')}
        </LinkButton>
      </Box>
      <PageHeader title={t('stu.promotion')} subtitle={t('stu.promo.subtitle')} />
      {structure.error !== undefined ? <ErrorState message={structure.error} /> : <PromotionTool classes={classes} />}
    </>
  );
}
