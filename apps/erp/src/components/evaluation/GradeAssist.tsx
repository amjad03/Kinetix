'use client';
import { useState, useTransition } from 'react';
import { decideGrade, suggestGrade } from '@/app/(dashboard)/evaluation/desk/actions';
import { StatusPill, TextInput, FormRow } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { GradeDraft } from '@/lib/staff-changes';

import { Alert, Button, Collapse, IconButton } from '@/components/kx';
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
        <div className="flex flex-col gap-3 p-3 mt-1 border border-border rounded-[10px]">
          <span className="text-xs leading-4 tracking-[0.3px] text-muted-foreground">
            {t('as.ga.notFinal')}
          </span>
          {error && <Alert severity="error">{error}</Alert>}
          {note && <Alert severity="success">{note}</Alert>}
          <TextInput label={t('as.ga.question')} value={question} onChange={(e) => setQuestion(e.target.value)} fullWidth slotProps={{ htmlInput: { maxLength: 2000 } }} />
          <TextInput label={t('as.ga.answer')} value={answer} onChange={(e) => setAnswer(e.target.value)} multiline minRows={3} fullWidth slotProps={{ htmlInput: { maxLength: 8000, 'data-testid': `ga-answer-${questionNo}` } }} />
          <h6 className="text-sm leading-5 font-medium tracking-[0.1px]">{t('as.ga.rubric')}</h6>
          {rubric.map((r, i) => (
            <div className="flex flex-row gap-2" key={i}>
              <TextInput label={t('as.ga.criterion')} value={r.criterion} onChange={(e) => setRubric(rubric.map((x, j) => (j === i ? { ...x, criterion: e.target.value } : x)))} fullWidth />
              <TextInput className="w-[110px]" label={t('as.ga.marks')} value={r.marks} onChange={(e) => setRubric(rubric.map((x, j) => (j === i ? { ...x, marks: e.target.value } : x)))} slotProps={{ htmlInput: { inputMode: 'decimal' } }} />
              <IconButton aria-label="x" size="small" onClick={() => setRubric(rubric.filter((_, j) => j !== i))}>
                ✕
              </IconButton>
            </div>
          ))}
          <div className="flex flex-row gap-2">
            <Button size="small" onClick={() => setRubric([...rubric, { criterion: '', marks: '' }])}>
              {t('as.ga.addCriterion')}
            </Button>
            <Button size="small" variant="outlined" disabled={pending} onClick={ask} data-testid={`ga-ask-${questionNo}`}>
              {t('as.ga.ask')}
            </Button>
          </div>
          {draft && (
            <div className="flex flex-col gap-2" data-testid={`ga-draft-${questionNo}`}>
              <div className="flex flex-row gap-2 items-center">
                <StatusPill tone="info">{t('as.ga.draft', { marks: draft.suggestedMarks, max: maxMarks })}</StatusPill>
              </div>
              {draft.preview && <Alert severity="warning">{t('as.ga.preview')}</Alert>}
              {draft.criteria.map((c) => (
                <p className="text-[13px] leading-[19px]" key={c.criterion}>
                  {c.criterion}: {c.awarded}/{c.max}
                  {c.comment ? ` · ${c.comment}` : ''}
                </p>
              ))}
              <p className="text-[13px] leading-[19px] text-muted-foreground">
                {draft.rationale}
              </p>
              <FormRow className="gap-2">
                <Button size="small" variant="contained" disabled={pending || draft.preview} onClick={() => decide('accept')}>
                  {t('as.ga.accept')}
                </Button>
                <TextInput className="w-[120px]" label={t('as.ga.myMarks')} value={mine} onChange={(e) => setMine(e.target.value)} slotProps={{ htmlInput: { inputMode: 'decimal' } }} />
                <Button size="small" variant="outlined" disabled={pending || mine.trim() === '' || Number.isNaN(Number(mine))} onClick={() => decide('edit')}>
                  {t('as.ga.edit')}
                </Button>
                <Button size="small" color="inherit" disabled={pending} onClick={() => decide('reject')}>
                  {t('as.ga.reject')}
                </Button>
              </FormRow>
            </div>
          )}
        </div>
      </Collapse>
    </div>
  );
}
