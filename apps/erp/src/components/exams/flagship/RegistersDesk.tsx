'use client';

import { BookOpenCheck } from 'lucide-react';
import { useState, useTransition } from 'react';
import { readCell } from '@/app/(dashboard)/exams/cell/actions';
import { Alert, Button, CircularProgress, MenuItem } from '@/components/kx';
import { LinkButton } from '@/components/LinkButton';
import { Grid, Pill } from '@/components/ops/kit';
import { Card, EmptyState, FormField, StatGrid, StatTile, TextInput } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import { registerHref, type MarksLedger } from '@/lib/exam-flagship';
import type { ExamPaper } from '@/lib/exams';
import type { SeatingPlanOverview } from '@/lib/exam-registration';
import type { CandidateOption } from './ApplicationsDesk';

const REPORTS = ['gazette', 'pass_by_section', 'pass_by_course', 'grade_distribution', 'year_comparison', 'toppers'] as const;

/**
 * The printed registers of a session: the hall attendance (signature) sheet and the D-form of every paper, the
 * tabulation register, the result analyses, and any candidate's marks ledger across every attempt.
 */
export function RegistersDesk({ sessionId, status, papers, plan, candidates }: { sessionId: string; status: string; papers: ExamPaper[]; plan: SeatingPlanOverview | null; candidates: CandidateOption[] }) {
  const { t, fmt } = useI18n();
  const processed = ['processed', 'published', 'locked'].includes(status);
  const hallsOf = (p: ExamPaper) => plan?.sittings.find((s) => s.examDate === p.examDate && s.startsAt.slice(0, 5) === p.startsAt.slice(0, 5))?.halls ?? [];
  return (
    <div className="grid gap-4">
      <Card title={t('xf.reg.session')} subtitle={t('xf.reg.sessionSub')} testId="xf-reg-session">
        <div className="flex flex-wrap gap-2">
          {processed ? (
            <Button href={registerHref('exam-tabulation', sessionId)} variant="outlined" target="_blank" rel="noopener" data-testid="xf-tabulation">
              {t('xf.reg.tabulation')}
            </Button>
          ) : (
            <span className="text-sm text-muted-foreground self-center">{t('xf.reg.notProcessed')}</span>
          )}
          {REPORTS.map((r) => (
            <LinkButton key={r} href={`/exams/results-desk/registers?report=${r}&session=${sessionId}`} variant="text">
              {t(`xc.rep.${r}` as MessageKey)}
            </LinkButton>
          ))}
        </div>
      </Card>
      <Card title={t('xf.reg.halls')} subtitle={t('xf.reg.hallsSub')} testId="xf-reg-halls">
        <Grid
          empty={t('xf.reg.noPapers')}
          rows={papers}
          cols={[
            { label: t('xf.reg.col.paper'), cell: (p) => p.subject, sort: (p) => p.subject },
            { label: t('xf.app.col.class'), cell: (p) => p.section },
            { label: t('xf.reg.col.when'), cell: (p) => `${fmt.date(p.examDate, 'short')} ${p.startsAt.slice(0, 5)}`, sort: (p) => `${p.examDate} ${p.startsAt}` },
            {
              label: t('xf.reg.col.sheets'),
              cell: (p) => (
                <div className="flex flex-wrap gap-1">
                  <Button href={registerHref('exam-attendance-sheet', sessionId, p.id)} size="small" variant="text" target="_blank" rel="noopener" data-testid={`xf-sheet-${p.id}`}>
                    {t('xf.reg.allHalls')}
                  </Button>
                  {hallsOf(p).map((h) => (
                    <Button key={h.roomId} href={registerHref('exam-attendance-sheet', sessionId, p.id, h.roomId)} size="small" variant="text" target="_blank" rel="noopener">
                      {h.room}
                    </Button>
                  ))}
                </div>
              ),
            },
            { label: t('xf.reg.col.dform'), cell: (p) => <Button href={registerHref('exam-d-form', sessionId, p.id)} size="small" variant="text" target="_blank" rel="noopener">{t('xf.reg.dform')}</Button> },
          ]}
        />
      </Card>
      <LedgerCard candidates={candidates} />
    </div>
  );
}

/** Any candidate's marks ledger: every attempt of every subject, the attempt that counts, credits and the CGPA. */
function LedgerCard({ candidates }: { candidates: CandidateOption[] }) {
  const { t, fmt } = useI18n();
  const [id, setId] = useState('');
  const [ledger, setLedger] = useState<MarksLedger | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const show = (sid: string) => {
    setId(sid);
    setLedger(null);
    if (!sid) return;
    start(async () => {
      setError(null);
      const res = await readCell<MarksLedger>(`/v1/students/${sid}/marks-ledger`);
      if (!res.ok) return setError(res.error);
      setLedger(res.data);
    });
  };
  return (
    <Card title={t('xf.ledger.title')} subtitle={t('xf.ledger.sub')} testId="xf-ledger">
      <div className="mb-4 max-w-[420px]">
        <FormField label={t('exm.f.student')}>
          <TextInput select value={id} onChange={(e) => show(e.target.value)} fullWidth slotProps={{ htmlInput: { 'data-testid': 'xf-ledger-student' } }}>
            {candidates.map((c) => (
              <MenuItem key={c.id} value={c.id}>
                {c.label}
              </MenuItem>
            ))}
          </TextInput>
        </FormField>
      </div>
      {busy && <CircularProgress size={20} />}
      {error && <Alert severity="error">{error}</Alert>}
      {!ledger && !busy && !error && <EmptyState icon={<BookOpenCheck />} title={t('xf.ledger.pick')} dense />}
      {ledger && (
        <>
          <StatGrid>
            <StatTile label={t('xf.ledger.subjects')} value={fmt.number(ledger.summary.subjects)} />
            <StatTile label={t('xf.ledger.cleared')} value={fmt.number(ledger.summary.cleared)} />
            <StatTile label={t('xf.ledger.backlogs')} value={fmt.number(ledger.summary.backlogs)} tone={ledger.summary.backlogs ? 'warning' : 'default'} />
            <StatTile label={t('xf.ledger.credits')} value={fmt.number(ledger.summary.creditsEarned)} />
            <StatTile label={t('xf.ledger.cgpa')} value={ledger.summary.cgpa === null ? '-' : fmt.number(ledger.summary.cgpa)} />
          </StatGrid>
          <Grid
            testId="xf-ledger-rows"
            exportName="marks-ledger"
            empty={t('xf.ledger.none')}
            rows={ledger.attempts}
            cols={[
              { label: t('xf.ledger.col.session'), cell: (a) => a.session },
              { label: t('xf.ledger.col.kind'), cell: (a) => a.kind },
              { label: t('xf.reg.col.paper'), cell: (a) => `${a.code} ${a.subject}`, sort: (a) => a.code },
              { label: t('xf.ledger.col.percent'), num: true, cell: (a) => fmt.number(a.percent) },
              { label: t('xf.ledger.col.grade'), cell: (a) => `${a.grade}${a.grace ? ` (+${a.grace})` : ''}` },
              { label: t('xf.ledger.col.result'), cell: (a) => <Pill label={a.passed ? t('xf.ledger.pass') : t('xf.ledger.fail')} warn={!a.passed} />, sort: (a) => (a.passed ? 1 : 0) },
              { label: t('xf.ledger.col.counts'), cell: (a) => (a.counts ? t('xf.ledger.counts') : '-') },
            ]}
          />
        </>
      )}
    </Card>
  );
}


