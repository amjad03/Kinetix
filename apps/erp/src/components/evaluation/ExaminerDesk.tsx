'use client';

import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useState, useTransition } from 'react';
import { saveMarks, submitValuation } from '@/app/(dashboard)/evaluation/desk/actions';
import { Bar, Grid, useToast } from '@/components/ops/kit';
import { LinkButton } from '@/components/LinkButton';
import { StatGrid, StatTile, StatusPill, TextInput } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import { draftFrom, draftTotal, entriesFrom, missingMarks, type AllocationDetail, type MarkDraft, type MyAllocation } from '@/lib/evaluation-desk';

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
      <Typography sx={{ my: 2 }}>{t('ev.anon')}</Typography>
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
export function ScriptMarking({ detail }: { detail: AllocationDetail }) {
  const { t } = useI18n();
  const [toast, toastNode] = useToast();
  const [draft, setDraft] = useState<MarkDraft>(() => draftFrom(detail));
  const [page, setPage] = useState(0);
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
        <Typography variant="h6" component="h2" data-testid="evd-dummy">
          {t('ev.desk.script', { no: detail.dummyNo })}
        </Typography>
      </Bar>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={3} sx={{ mt: 2, alignItems: 'flex-start' }}>
        <Box sx={{ flex: 1, minWidth: 0, width: '100%' }}>
          {pages.length === 0 ? (
            <Typography color="text.secondary">{t('ev.desk.noPages')}</Typography>
          ) : (
            <>
              <Stack direction="row" spacing={1} sx={{ mb: 1, flexWrap: 'wrap' }}>
                {pages.map((p) => (
                  <Button key={p.index} size="small" variant={p.index === page ? 'contained' : 'outlined'} onClick={() => setPage(p.index)} aria-label={t('ev.desk.page', { n: p.index + 1 })}>
                    {p.index + 1}
                  </Button>
                ))}
              </Stack>
              {/* The page is streamed through the download route so the session token stays in its cookie. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/download?kind=eval-page&id=${detail.id}&index=${page}`} alt={t('ev.desk.pageOf', { n: page + 1, total: pages.length })} style={{ maxWidth: '100%', border: '1px solid var(--mui-palette-divider, #ccc)' }} data-testid="evd-page" />
            </>
          )}
        </Box>
        <Stack spacing={1.5} sx={{ width: { xs: '100%', md: 360 }, flexShrink: 0 }}>
          <StatGrid min={110}>
            <StatTile label={t('ev.desk.col.total')} value={draftTotal(draft, questions)} caption={`/ ${max}`} testId="evd-total" />
            <StatTile label={t('ev.desk.stat.left')} value={missing} tone={missing ? 'warning' : 'default'} testId="evd-left" />
          </StatGrid>
          {submitted && <Alert severity="success">{t('ev.desk.locked')}</Alert>}
          {error && <Alert severity="error">{error}</Alert>}
          {questions.map((q) => (
            <Stack key={q.id} direction="row" spacing={1} sx={{ alignItems: 'flex-start' }}>
              <TextInput
                label={t('ev.desk.question', { no: q.no, max: q.maxMarks })}
                value={draft[q.id]?.marks ?? ''}
                onChange={(e) => set(q.id, { marks: e.target.value })}
                error={bad === q.id}
                disabled={submitted}
                slotProps={{ htmlInput: { inputMode: 'decimal', 'data-testid': `evd-marks-${q.no}` } }}
                sx={{ width: 150 }}
              />
              <TextInput label={t('ev.desk.comment')} value={draft[q.id]?.comment ?? ''} onChange={(e) => set(q.id, { comment: e.target.value })} disabled={submitted} fullWidth />
            </Stack>
          ))}
          {!submitted && (
            <Stack direction="row" spacing={1}>
              <Button variant="outlined" onClick={() => save()} disabled={pending} data-testid="evd-save">
                {t('ev.desk.save')}
              </Button>
              <Button variant="contained" onClick={submit} disabled={pending} data-testid="evd-submit">
                {t('ev.desk.submit')}
              </Button>
            </Stack>
          )}
        </Stack>
      </Stack>
      {toastNode}
    </>
  );
}
