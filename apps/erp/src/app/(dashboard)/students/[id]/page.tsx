import ArrowBack from '@mui/icons-material/ArrowBack';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Link from '@mui/material/Link';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import NextLink from 'next/link';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { StatusPill } from '@/components/admissions/Chips';
import { LinkButton } from '@/components/LinkButton';
import { PageHeader, SectionTitle } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { LifecycleTimeline } from '@/components/students/LifecycleTimeline';
import { StudentActions } from '@/components/students/StudentActions';
import { ApiError, api, load, requireSection } from '@/lib/api';
import { canChangeLifecycle } from '@/lib/access';
import type { StudentProfile } from '@/lib/admissions';
import { formatDate } from '@/lib/dates';
import type { Structure } from '@/lib/types';
import { getI18n } from '@/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('stu.profile') };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function StudentPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireSection('students');
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const { t, locale } = await getI18n();
  const res = await load(async () => {
    try {
      return await api<StudentProfile>(`/v1/students/${id}/profile`);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) notFound();
      throw e;
    }
  });
  const back = (
    <Box sx={{ ml: -1, mb: 0.5 }}>
      <LinkButton href="/students" size="small" startIcon={<ArrowBack />}>
        {t('nav.students')}
      </LinkButton>
    </Box>
  );
  if (res.error !== undefined) {
    return (
      <>
        {back}
        <ErrorState message={res.error} />
      </>
    );
  }
  const s = res.data;
  const canChange = me ? canChangeLifecycle(me.roles) : false;
  const structure = canChange ? await load(() => api<Structure>('/v1/admin/structure')) : undefined;
  const sameProgram = (structure?.data?.sections ?? []).filter((x) => x.programId === s.program.id && x.id !== s.section.id).map((x) => ({ id: x.id, name: x.displayName }));
  return (
    <>
      {back}
      <PageHeader title={s.fullName} subtitle={`${s.section.displayName} · ${t('stu.rollNo', { roll: s.rollNo })} · ${s.program.name}`} actions={<StatusPill kind="student" status={s.status} />} />
      {s.finalTerm && s.status === 'active' && (
        <Alert severity="info" sx={{ mb: 2 }}>
          {t('stu.finalTerm')}
        </Alert>
      )}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' }, gap: 3 }}>
        <Box>
          <Paper variant="outlined" sx={{ p: 2.5 }}>
            <SectionTitle flush>{t('stu.admission')}</SectionTitle>
            <Typography variant="body2">{s.enrolledOn ? t('stu.joined', { date: formatDate(s.enrolledOn, 'long', locale) }) : t('stu.noJoinDate')}</Typography>
            {s.application && (
              <Typography variant="body2" sx={{ mt: 0.5 }}>
                <Link component={NextLink} href={`/admissions/applications/${s.application.id}`}>
                  {s.application.applicationNo}
                </Link>{' '}
                · {s.application.cycleName}
              </Typography>
            )}
          </Paper>
          <StudentActions student={s} canChange={canChange} canGuardians classes={sameProgram} />
        </Box>
        <Paper variant="outlined" sx={{ p: 2.5 }}>
          <SectionTitle flush>{t('stu.timeline')}</SectionTitle>
          <LifecycleTimeline events={s.timeline} />
        </Paper>
      </Box>
    </>
  );
}
