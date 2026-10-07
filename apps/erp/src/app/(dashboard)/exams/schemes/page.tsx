import ArrowBack from '@mui/icons-material/ArrowBack';
import Box from '@mui/material/Box';
import type { Metadata } from 'next';
import { SchemeEditor } from '@/components/exams/SchemeEditor';
import { LinkButton } from '@/components/LinkButton';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { api, load, requireSection } from '@/lib/api';
import { getI18n } from '@/i18n/server';
import type { GradeScale, Scheme, SchemePresets } from '@/lib/exams';
import type { Structure } from '@/lib/types';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('exm.schemes') };
}

type StructureWithYears = Structure & { academicYears: { id: string; label: string; isCurrent: boolean }[] };

export default async function SchemesPage({ searchParams }: { searchParams: Promise<{ subjectId?: string; academicYearId?: string }> }) {
  const me = await requireSection('exams');
  const q = await searchParams;
  const [structure, scales, presets] = await Promise.all([
    load(() => api<StructureWithYears>('/v1/admin/structure')),
    load(() => api<GradeScale[]>('/v1/grade-scales')),
    load(() => api<SchemePresets>('/v1/scheme-presets')),
  ]);
  const { t } = await getI18n();
  const head = (
    <>
      <Box sx={{ ml: -1, mb: 0.5 }}>
        <LinkButton href="/exams" size="small" startIcon={<ArrowBack />}>
          {t('exm.back')}
        </LinkButton>
      </Box>
      <PageHeader title={t('exm.schemes')} subtitle={t('exm.schemesSubtitle')} />
    </>
  );
  if (structure.error !== undefined || scales.error !== undefined || presets.error !== undefined)
    return (
      <>
        {head}
        <ErrorState message={(structure.error ?? scales.error ?? presets.error)!} />
      </>
    );
  const years = structure.data.academicYears;
  const subjectId = q.subjectId ?? structure.data.subjects[0]?.id ?? '';
  const yearId = q.academicYearId ?? years.find((y) => y.isCurrent)?.id ?? years[0]?.id ?? '';
  const scheme = subjectId && yearId ? await load(() => api<Scheme | null>(`/v1/schemes?subjectId=${subjectId}&academicYearId=${yearId}`)) : { data: null };
  const canEdit = !!me && me.roles.some((r) => r === 'principal' || r === 'tenant_admin' || r === 'hod');
  return (
    <>
      {head}
      <SchemeEditor key={`${subjectId}:${yearId}:${scheme.data?.id ?? 'new'}`} structure={structure.data} years={years} scales={scales.data} presets={presets.data} scheme={scheme.data ?? null} subjectId={subjectId} yearId={yearId} canEdit={canEdit} />
    </>
  );
}
