'use client';

import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Collapse from '@mui/material/Collapse';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useState, useTransition } from 'react';
import { decideGrade, suggestGrade } from '@/app/(dashboard)/evaluation/desk/actions';
import { StatusPill, TextInput } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { GradeDraft } from '@/lib/staff-changes';

interface Row {
  criterion: string;
  marks: string;
}

/**
 * Marking help for one descriptive answer: the examiner types or pastes the answer, optionally sets a rubric, and gets an AI
 * draft per criterion. The draft is only a suggestion: marks are entered when the examiner accepts it or types their own.
 */
export function GradeAssist({ allocationId, questionId, questionNo, maxMarks, onMarks }: { allocationId: string; questionId: string; questionNo: string; maxMarks: number; onMarks: (marks: number) => void }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [rubric, setRubric] = useState<Row[]>([]);
  const [draft, setDraft] = useState<GradeDraft | null>(null);
  const [mine, setMine] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const ask = () =>
    start(async () => {
      setError(null);
      setNote(null);
      if (!answer.trim() || question.trim().length < 3) return setError(t('as.ga.needAnswer'));
      const rows = rubric.filter((r) => r.criterion.trim() && Number(r.marks) > 0).map((r) => ({ criterion: r.criterion.trim(), marks: Number(r.marks) }));
      const res = await suggestGrade(allocationId, { questionId, question: question.trim(), answerText: answer.trim(), ...(rows.length ? { rubric: rows } : {}) });
      if (!res.ok) return setError(res.error);
      setDraft(res.data);
      setMine(String(res.data.suggestedMarks));
    });
  const decide = (action: 'accept' | 'edit' | 'reject') =>
    start(async () => {
      if (!draft) return;
      setError(null);
      const res = await decideGrade(draft.id, { action, ...(action === 'edit' ? { marks: Number(mine) } : {}) });
      if (!res.ok) return setError(res.error);
      if (res.data.finalMarks !== null) {
        onMarks(res.data.finalMarks);
        setNote(t('as.ga.done', { marks: res.data.finalMarks }));
      } else setNote(t('as.ga.rejected'));
      setDraft(null);
    });

  return (
    <div>
      <Button size="small" onClick={() => setOpen(!open)} aria-expanded={open} data-testid={`ga-open-${questionNo}`}>
        {t('as.ga.open')}
      </Button>
      <Collapse in={open} unmountOnExit>
        <Stack spacing={1.5} sx={{ p: 1.5, mt: 0.5, border: 1, borderColor: 'divider', borderRadius: 1 }}>
          <Typography variant="caption" color="text.secondary">
            {t('as.ga.notFinal')}
          </Typography>
          {error && <Alert severity="error">{error}</Alert>}
          {note && <Alert severity="success">{note}</Alert>}
          <TextInput label={t('as.ga.question')} value={question} onChange={(e) => setQuestion(e.target.value)} fullWidth slotProps={{ htmlInput: { maxLength: 2000 } }} />
          <TextInput label={t('as.ga.answer')} value={answer} onChange={(e) => setAnswer(e.target.value)} multiline minRows={3} fullWidth slotProps={{ htmlInput: { maxLength: 8000, 'data-testid': `ga-answer-${questionNo}` } }} />
          <Typography variant="subtitle2">{t('as.ga.rubric')}</Typography>
          {rubric.map((r, i) => (
            <Stack key={i} direction="row" spacing={1}>
              <TextInput label={t('as.ga.criterion')} value={r.criterion} onChange={(e) => setRubric(rubric.map((x, j) => (j === i ? { ...x, criterion: e.target.value } : x)))} fullWidth />
              <TextInput label={t('as.ga.marks')} value={r.marks} onChange={(e) => setRubric(rubric.map((x, j) => (j === i ? { ...x, marks: e.target.value } : x)))} sx={{ width: 110 }} slotProps={{ htmlInput: { inputMode: 'decimal' } }} />
              <IconButton aria-label="x" size="small" onClick={() => setRubric(rubric.filter((_, j) => j !== i))}>
                ✕
              </IconButton>
            </Stack>
          ))}
          <Stack direction="row" spacing={1}>
            <Button size="small" onClick={() => setRubric([...rubric, { criterion: '', marks: '' }])}>
              {t('as.ga.addCriterion')}
            </Button>
            <Button size="small" variant="outlined" disabled={pending} onClick={ask} data-testid={`ga-ask-${questionNo}`}>
              {t('as.ga.ask')}
            </Button>
          </Stack>
          {draft && (
            <Stack spacing={1} data-testid={`ga-draft-${questionNo}`}>
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                <StatusPill tone="info">{t('as.ga.draft', { marks: draft.suggestedMarks, max: maxMarks })}</StatusPill>
              </Stack>
              {draft.preview && <Alert severity="warning">{t('as.ga.preview')}</Alert>}
              {draft.criteria.map((c) => (
                <Typography key={c.criterion} variant="body2">
                  {c.criterion}: {c.awarded}/{c.max}
                  {c.comment ? ` · ${c.comment}` : ''}
                </Typography>
              ))}
              <Typography variant="body2" color="text.secondary">
                {draft.rationale}
              </Typography>
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
                <Button size="small" variant="contained" disabled={pending || draft.preview} onClick={() => decide('accept')}>
                  {t('as.ga.accept')}
                </Button>
                <TextInput label={t('as.ga.myMarks')} value={mine} onChange={(e) => setMine(e.target.value)} sx={{ width: 120 }} slotProps={{ htmlInput: { inputMode: 'decimal' } }} />
                <Button size="small" variant="outlined" disabled={pending || mine.trim() === '' || Number.isNaN(Number(mine))} onClick={() => decide('edit')}>
                  {t('as.ga.edit')}
                </Button>
                <Button size="small" color="inherit" disabled={pending} onClick={() => decide('reject')}>
                  {t('as.ga.reject')}
                </Button>
              </Stack>
            </Stack>
          )}
        </Stack>
      </Collapse>
    </div>
  );
}
