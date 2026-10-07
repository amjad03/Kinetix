import ArrowBack from '@mui/icons-material/ArrowBack';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ApplicationReview } from '@/components/admissions/ApplicationReview';
import { StatusPill } from '@/components/admissions/Chips';
import { LinkButton } from '@/components/LinkButton';
import { PageHeader, SectionTitle } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { ApiError, api, load, requireSection } from '@/lib/api';
import type { ApplicationDetail } from '@/lib/admissions';
import { formatDate } from '@/lib/dates';
import type { Structure } from '@/lib/types';
import { getI18n } from '@/i18n/server';
import type { MessageKey } from '@/i18n/messages';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t('adm.review.title') };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ApplicationPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireSection('admissions');
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const app = await load(async () => {
    try {
      return await api<ApplicationDetail>(`/v1/admissions/applications/${id}`);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) notFound();
      throw e;
    }
  });
  const { t, locale } = await getI18n();
  const back = (
    <Box sx={{ ml: -1, mb: 0.5 }}>
      <LinkButton href="/admissions/applications" size="small" startIcon={<ArrowBack />}>
        {t('adm.tab.applications')}
      </LinkButton>
    </Box>
  );
  if (app.error !== undefined) {
    return (
      <>
        {back}
        <ErrorState message={app.error} />
      </>
    );
  }
  const a = app.data;
  const structure = a.status === 'accepted' ? await load(() => api<Structure>('/v1/admin/structure')) : undefined;
  const classes = (structure?.data?.sections ?? []).filter((s) => s.programId === a.cycle.programId && s.term === a.cycle.entryTerm).map((s) => ({ id: s.id, name: s.displayName, term: s.term }));
  const answer = (k: string) => a.answers[k];
  return (
    <>
      {back}
      <PageHeader title={a.applicantName} subtitle={`${a.applicationNo} · ${a.cycle.name}`} actions={<StatusPill kind="application" status={a.status} />} />
      {a.statusReason && (
        <Alert severity="info" sx={{ mb: 2 }}>
          {a.statusReason}
        </Alert>
      )}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' }, gap: 3 }}>
        <Paper variant="outlined" sx={{ p: 2.5 }}>
          <SectionTitle flush>{t('adm.review.details')}</SectionTitle>
          <Stack spacing={0.5}>
            <Typography variant="body2">{a.phone}{a.email ? ` · ${a.email}` : ''}</Typography>
            {a.dateOfBirth && <Typography variant="body2">{t('adm.field.dob')}: {formatDate(a.dateOfBirth, 'long', locale)}</Typography>}
            <Typography variant="body2">
              {t('adm.review.guardian')}: {a.guardianName} ({a.guardianRelation}) · {a.guardianPhone}
            </Typography>
          </Stack>
          <SectionTitle>{t('adm.review.answers')}</SectionTitle>
          <Stack spacing={0.5}>
            {a.cycle.formFields.map((f) => (
              <Typography key={f.key} variant="body2">
                <Typography component="span" variant="body2" color="text.secondary">
                  {f.label}:{' '}
                </Typography>
                {answer(f.key) ?? '–'}
              </Typography>
            ))}
            {a.cycle.formFields.length === 0 && (
              <Typography variant="body2" color="text.secondary">
                {t('adm.review.noQuestions')}
              </Typography>
            )}
          </Stack>
          <SectionTitle>{t('adm.review.eligibility')}</SectionTitle>
          {a.eligibilityCheck.length === 0 ? (
            <Alert severity="success">{t('adm.review.meets')}</Alert>
          ) : (
            <Alert severity="warning">{a.eligibilityCheck.join('; ')}</Alert>
          )}
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            {t('adm.review.score', { score: a.liveMeritScore })}
            {a.meritRank ? ` · ${t('adm.review.rank', { rank: a.meritRank })}` : ''}
          </Typography>
          <SectionTitle>{t('adm.review.history')}</SectionTitle>
          <Stack spacing={0.75}>
            {a.history.map((h, i) => (
              <Typography key={i} variant="body2">
                <Typography component="span" variant="caption" color="text.secondary">
                  {formatDate(h.at.slice(0, 10), 'short', locale)} · {h.actorName ?? t('adm.system')} ·{' '}
                </Typography>
                {h.action.replace(/^admissions\./, '').replace(/\.v1$/, '').replaceAll('.', ' ').replaceAll('_', ' ')}
                {h.data && typeof h.data === 'object' && 'to' in h.data ? ` → ${t(`adm.app.${String(h.data.to)}` as MessageKey)}` : ''}
                {h.data && typeof h.data === 'object' && typeof h.data.reason === 'string' && h.data.reason ? ` (${h.data.reason})` : ''}
              </Typography>
            ))}
          </Stack>
        </Paper>
        <ApplicationReview app={a} classes={classes} canWaive={me?.roles.some((r) => r === 'principal' || r === 'tenant_admin') ?? false} />
      </Box>
    </>
  );
}
