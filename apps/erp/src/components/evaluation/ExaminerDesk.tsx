'use client';
import { useState, useTransition } from 'react';
import { saveMarks, submitValuation } from '@/app/(dashboard)/evaluation/desk/actions';
import { Bar, Grid, useToast } from '@/components/ops/kit';
import { LinkButton } from '@/components/LinkButton';
import { GradeAssist } from '@/components/evaluation/GradeAssist';
import { PageAnnotator } from '@/components/evaluation/PageAnnotator';
import { StatGrid, StatTile, StatusPill, TextInput } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import { annotationCounts, type AnnotationSet } from '@/lib/annotations';
import { draftFrom, draftTotal, entriesFrom, missingMarks, type AllocationDetail, type MarkDraft, type MyAllocation } from '@/lib/evaluation-desk';

import { Alert, Button } from '@/components/kx';
/** The examiner's scripts: pending first, each opening its own marking screen. */
export function MyScripts({ rows }: { rows: MyAllocation[] }) {
  const { t } = useI18n();
  const pending = rows.filter((r) => r.status === 'pending').length;
  return (
    <>
      <StatGrid min={130}>
        <StatTile label={t('ev.desk.stat.pending')} value={pending} tone={pending ? 'warning' : 'default'} testId="evd-pending" />
        <StatTile label={t('ev.desk.stat.submitted')} value={rows.length - pending} testId="evd-submitted" />
      </StatGrid>
      <p className="text-sm leading-[21px] my-4">{t('ev.anon')}</p>
      <Grid
        testId="evd-scripts"
        empty={t('ev.desk.empty')}
        rows={rows}
        cols={[
          { label: t('ev.desk.col.script'), cell: (r) => r.dummyNo, sort: (r) => r.dummyNo },
          { label: t('exm.f.subject'), cell: (r) => r.subject, sort: (r) => r.subject },
          { label: t('ev.desk.col.session'), cell: (r) => r.session },
          { label: t('ev.desk.col.round'), cell: (r) => r.round, num: true },
          { label: t('exm.status'), cell: (r) => <StatusPill tone={r.status === 'submitted' ? 'success' : 'warning'}>{t(`ev.desk.st.${r.status}`)}</StatusPill>, sort: (r) => r.status },
          { label: t('ev.desk.col.total'), cell: (r) => (r.total === null ? '—' : r.total), num: true },
          { label: '', cell: (r) => <LinkButton size="small" href={`/evaluation/desk?allocation=${r.id}`}>{t(r.status === 'submitted' ? 'ev.desk.view' : 'ev.desk.value')}</LinkButton> },
        ]}
      />
    </>
  );
}

/** One script: its pages beside a per-question marks form. Save keeps a draft; Submit locks the valuation. */
export function ScriptMarking({ detail, annotations }: { detail: AllocationDetail; annotations: AnnotationSet }) {
  const { t } = useI18n();
  const [toast, toastNode] = useToast();
  const [draft, setDraft] = useState<MarkDraft>(() => draftFrom(detail));
  const [page, setPage] = useState(0);
  const [marksOn, setMarksOn] = useState(annotations.mine);
  const [bad, setBad] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(detail.status === 'submitted');
  const [pending, start] = useTransition();
  const { questions, pages } = detail;
  const max = questions.reduce((s, q) => s + q.maxMarks, 0);
  const missing = missingMarks(draft, questions);

  const set = (id: string, patch: Partial<{ marks: string; comment: string }>) => setDraft((d) => ({ ...d, [id]: { marks: d[id]?.marks ?? '', comment: d[id]?.comment ?? '', ...patch } }));

  const save = (then?: () => void) => {
    const r = entriesFrom(draft, questions);
    if (!r.ok) {
      setBad(r.bad);
      return setError(t('ev.desk.err.marks'));
    }
    setBad(null);
    setError(null);
    if (r.entries.length === 0) return then?.();
    start(async () => {
      const res = await saveMarks(detail.id, r.entries);
      if (!res.ok) return setError(res.error);
      if (then) then();
      else toast(t('ev.desk.saved'));
    });
  };

  const submit = () => {
    if (missing > 0) return setError(t('ev.desk.err.missing', { n: missing }));
    save(() =>
      start(async () => {
        const res = await submitValuation(detail.id);
        if (!res.ok) return setError(res.error);
        setSubmitted(true);
        toast(res.data.needsThird ? t('ev.desk.thirdNeeded') : t('ev.desk.submittedOk'));
      }),
    );
  };

  return (
    <>
      <Bar>
        <LinkButton href="/evaluation/desk" size="small">
          {t('ev.desk.back')}
        </LinkButton>
        <h2 className="text-base leading-6 font-medium tracking-[0.1px]" data-testid="evd-dummy">
          {t('ev.desk.script', { no: detail.dummyNo })}
        </h2>
      </Bar>
      <div className="flex flex-col md:flex-row gap-6 mt-4 items-start">
        <div className="flex-1 min-w-0 w-full">
          {pages.length === 0 ? (
            <p className="text-sm leading-[21px] text-muted-foreground">{t('ev.desk.noPages')}</p>
          ) : (
            <>
              <div className="flex flex-row gap-2 mb-2 flex-wrap">
                {pages.map((p) => (
                  <Button key={p.index} size="small" variant={p.index === page ? 'contained' : 'outlined'} onClick={() => setPage(p.index)} aria-label={t('ev.desk.page', { n: p.index + 1 })}>
                    {p.index + 1}
                  </Button>
                ))}
              </div>
              <PageAnnotator
                allocationId={detail.id}
                pageIndex={page}
                src={`/api/download?kind=eval-page&id=${detail.id}&index=${page}`}
                alt={t('ev.desk.pageOf', { n: page + 1, total: pages.length })}
                marks={marksOn}
                earlier={annotations.earlier}
                locked={submitted}
                onChange={setMarksOn}
              />
              <span className="text-xs leading-4 tracking-[0.3px] text-muted-foreground" data-testid="ann-count">
                {t('ev.ann.count', { n: Object.values(annotationCounts(marksOn)).reduce((a, b) => a + b, 0) })}
              </span>
            </>
          )}
        </div>
        <div className="flex flex-col gap-3 w-full md:w-[360px] shrink-0">
          <StatGrid min={110}>
            <StatTile label={t('ev.desk.col.total')} value={draftTotal(draft, questions)} caption={`/ ${max}`} testId="evd-total" />
            <StatTile label={t('ev.desk.stat.left')} value={missing} tone={missing ? 'warning' : 'default'} testId="evd-left" />
          </StatGrid>
          {submitted && <Alert severity="success">{t('ev.desk.locked')}</Alert>}
          {error && <Alert severity="error">{error}</Alert>}
          {questions.map((q) => (
            <div className="flex flex-col gap-1" key={q.id}>
            <div className="flex flex-row gap-2 items-start">
              <TextInput className="w-[150px]"
                label={t('ev.desk.question', { no: q.no, max: q.maxMarks })}
                value={draft[q.id]?.marks ?? ''}
                onChange={(e) => set(q.id, { marks: e.target.value })}
                error={bad === q.id}
                disabled={submitted}
                slotProps={{ htmlInput: { inputMode: 'decimal', 'data-testid': `evd-marks-${q.no}` } }}
              />
              <TextInput label={t('ev.desk.comment')} value={draft[q.id]?.comment ?? ''} onChange={(e) => set(q.id, { comment: e.target.value })} disabled={submitted} fullWidth />
            </div>
            {!submitted && <GradeAssist allocationId={detail.id} questionId={q.id} questionNo={q.no} maxMarks={q.maxMarks} onMarks={(m) => set(q.id, { marks: String(m) })} />}
            </div>
          ))}
          {!submitted && (
            <div className="flex flex-row gap-2">
              <Button variant="outlined" onClick={() => save()} disabled={pending} data-testid="evd-save">
                {t('ev.desk.save')}
              </Button>
              <Button variant="contained" onClick={submit} disabled={pending} data-testid="evd-submit">
                {t('ev.desk.submit')}
              </Button>
            </div>
          )}
        </div>
      </div>
      {toastNode}
    </>
  );
}
