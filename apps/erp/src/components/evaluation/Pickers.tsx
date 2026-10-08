'use client';

import Typography from '@mui/material/Typography';
import { Grid } from '@/components/ops/kit';
import { LinkButton } from '@/components/LinkButton';
import { StatusPill } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import { sessionTone, type ExamSession, type ExamSessionDetail } from '@/lib/exams';

/** The exam sessions to open for evaluation. */
export function SessionPicker({ sessions }: { sessions: ExamSession[] }) {
  const { t, fmt } = useI18n();
  return (
    <>
      <Typography sx={{ mb: 2 }}>{t('ev.anon')}</Typography>
      <Grid
        testId="ev-sessions"
        empty={t('ev.noSessions')}
        rows={sessions}
        cols={[
          { label: t('ops.f.name'), cell: (s) => s.name },
          { label: t('exm.dates'), cell: (s) => `${fmt.date(s.startsOn)} – ${fmt.date(s.endsOn)}`, sort: (s) => s.startsOn },
          { label: t('exm.status'), cell: (s) => <StatusPill tone={sessionTone(s.status) === 'success' ? 'success' : sessionTone(s.status) === 'warning' ? 'warning' : 'neutral'}>{t(`exm.st.${s.status}`)}</StatusPill>, sort: (s) => s.status },
          { label: '', cell: (s) => <LinkButton size="small" href={`/evaluation?session=${s.id}`}>{t('ev.open')}</LinkButton> },
        ]}
      />
    </>
  );
}

/** The papers of one session. */
export function SessionPapers({ session }: { session: ExamSessionDetail }) {
  const { t, fmt } = useI18n();
  return (
    <>
      <Typography variant="h6" component="h2" sx={{ mb: 1.5 }}>
        {t('ev.papers', { name: session.name })}
      </Typography>
      <Grid
        testId="ev-papers"
        empty={t('ev.noPapers')}
        rows={session.papers}
        cols={[
          { label: t('exm.f.subject'), cell: (p) => p.subject },
          { label: t('exm.f.class'), cell: (p) => p.section },
          { label: t('exm.f.date'), cell: (p) => fmt.date(p.examDate), sort: (p) => p.examDate },
          { label: t('exm.f.max'), cell: (p) => p.maxMarks, num: true },
          { label: '', cell: (p) => <LinkButton size="small" href={`/evaluation?session=${session.id}&paper=${p.id}`}>{t('ev.open')}</LinkButton> },
        ]}
      />
    </>
  );
}
