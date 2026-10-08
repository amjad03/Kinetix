'use client';

import Button from '@mui/material/Button';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useEffect, useState } from 'react';
import { addBlueprint, addQuestion, approveQuestion, decidePaper, generatePaper, loadPaper, lockPaper, reviewQuestion, submitPaper } from '@/app/(dashboard)/question-bank/actions';
import { ActionButton, Bar, FormDialog, Grid, InfoDialog, Pill, Tabbed, useToast } from '@/components/ops/kit';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import type { QbBlueprint, QbOptions, QbPaper, QbPaperDetail, QbQuestion } from '@/lib/question-bank';

type Dialog = 'question' | 'blueprint' | 'paper' | { submit: QbPaper } | { decide: QbPaper } | { view: QbPaper };

const BLOOM = ['remember', 'understand', 'apply', 'analyze', 'evaluate', 'create'];
const DIFFICULTY = ['easy', 'medium', 'hard'];
const TYPES = ['mcq', 'short', 'long', 'numerical', 'diagram'];

export function QuestionBankDesk({ options, questions, blueprints, papers, initialTab }: { options: QbOptions; questions: QbQuestion[]; blueprints: QbBlueprint[]; papers: QbPaper[]; initialTab: string }) {
  const { t, fmt } = useI18n();
  const [dlg, setDlg] = useState<Dialog | null>(null);
  const [toast, toastNode] = useToast();
  const done = (m?: string) => {
    setDlg(null);
    if (m) toast(m);
  };
  const subjectName = (sid: string) => options.subjects.find((s) => s.id === sid)?.name ?? '';
  const choose = (prefix: string, keys: string[]) => keys.map((k) => ({ value: k, label: t(`${prefix}.${k}` as MessageKey) }));

  return (
    <>
      <Tabbed
        label={t('nav.questionBank')}
        initial={initialTab}
        tabs={[
          {
            id: 'questions',
            label: t('qb.tab.questions', { n: questions.length }),
            node: (
              <>
                <Bar>
                  <Button variant="contained" onClick={() => setDlg('question')} data-testid="qb-add">
                    {t('qb.addQuestion')}
                  </Button>
                </Bar>
                <Grid
                  testId="qb-questions"
                  empty={t('qb.empty.questions')}
                  rows={questions}
                  cols={[
                    { label: t('qb.col.question'), cell: (q) => q.text.length > 90 ? `${q.text.slice(0, 90)}...` : q.text, sort: (q) => q.text },
                    { label: t('qb.col.subject'), cell: (q) => subjectName(q.subjectId) },
                    { label: t('qb.col.topic'), cell: (q) => q.topic },
                    { label: t('qb.col.co'), cell: (q) => q.coCode ?? t('ops.none') },
                    { label: t('qb.col.bloom'), cell: (q) => t(`qb.bloom.${q.bloom}` as MessageKey) },
                    { label: t('qb.col.difficulty'), cell: (q) => t(`qb.difficulty.${q.difficulty}` as MessageKey) },
                    { label: t('qb.col.marks'), cell: (q) => q.marks, num: true },
                    { label: t('qb.col.type'), cell: (q) => t(`qb.type.${q.type}` as MessageKey) },
                    { label: t('qb.col.pastPapers'), cell: (q) => (q.examFrequency ? <Pill warn={q.important} label={t('qb.asked', { n: q.examFrequency.count })} /> : t('ops.none')), sort: (q) => q.examFrequency?.count ?? 0 },
                    { label: t('qb.col.used'), cell: (q) => q.usedCount, num: true },
                    { label: t('qb.col.status'), cell: (q) => <Pill label={`${t(`qb.status.${q.status}` as MessageKey)} v${q.version}`} />, sort: (q) => q.status },
                    {
                      label: '',
                      cell: (q) => (
                        <>
                          {q.status === 'draft' && <ActionButton label={t('qb.review')} run={() => reviewQuestion(q.id)} onDone={toast} />}
                          {q.status === 'reviewed' && <ActionButton label={t('qb.approve')} run={() => approveQuestion(q.id)} onDone={toast} />}
                        </>
                      ),
                    },
                  ]}
                />
              </>
            ),
          },
          {
            id: 'blueprints',
            label: t('qb.tab.blueprints', { n: blueprints.length }),
            node: (
              <>
                <Bar>
                  <Button variant="contained" onClick={() => setDlg('blueprint')} data-testid="qb-add-blueprint">
                    {t('qb.addBlueprint')}
                  </Button>
                </Bar>
                <Grid
                  testId="qb-blueprints"
                  empty={t('qb.empty.blueprints')}
                  rows={blueprints}
                  cols={[
                    { label: t('qb.col.title'), cell: (b) => b.title },
                    { label: t('qb.col.subject'), cell: (b) => subjectName(b.subjectId) },
                    { label: t('qb.col.marks'), cell: (b) => b.totalMarks, num: true },
                    { label: t('qb.col.duration'), cell: (b) => b.durationMinutes, num: true },
                    { label: t('qb.col.sections'), cell: (b) => b.sections.map((s) => `${s.name}: ${s.count} x ${s.questionMarks}`).join(', ') },
                  ]}
                />
              </>
            ),
          },
          {
            id: 'papers',
            label: t('qb.tab.papers', { n: papers.length }),
            node: (
              <>
                <Bar>
                  <Button variant="contained" onClick={() => setDlg('paper')} disabled={blueprints.length === 0} data-testid="qb-generate">
                    {t('qb.generate')}
                  </Button>
                </Bar>
                <Grid
                  testId="qb-papers"
                  empty={t('qb.empty.papers')}
                  rows={papers}
                  cols={[
                    { label: t('qb.col.title'), cell: (p) => p.title },
                    { label: t('qb.col.subject'), cell: (p) => p.subject },
                    { label: t('qb.col.setter'), cell: (p) => p.setterName },
                    { label: t('qb.col.moderator'), cell: (p) => p.moderatorName ?? t('ops.none') },
                    { label: t('qb.col.created'), cell: (p) => fmt.dateTime(p.createdAt), sort: (p) => p.createdAt },
                    { label: t('qb.col.status'), cell: (p) => <Pill warn={p.status === 'returned'} label={t(`qb.paper.${p.status}` as MessageKey)} />, sort: (p) => p.status },
                    {
                      label: '',
                      cell: (p) => (
                        <>
                          <Button size="small" onClick={() => setDlg({ view: p })}>{t('qb.view')}</Button>
                          {(p.status === 'draft' || p.status === 'returned') && <Button size="small" onClick={() => setDlg({ submit: p })}>{t('qb.submit')}</Button>}
                          {p.status === 'scrutiny' && <Button size="small" onClick={() => setDlg({ decide: p })}>{t('qb.decide')}</Button>}
                          {p.status === 'approved' && <ActionButton label={t('qb.lock')} run={() => lockPaper(p.id)} onDone={toast} />}
                          {p.status === 'locked' && (
                            <>
                              <Link href={`/api/download?kind=qb-paper&id=${p.id}`} underline="hover" sx={{ mx: 1 }}>{t('qb.downloadPaper')}</Link>
                              <Link href={`/api/download?kind=qb-key&id=${p.id}`} underline="hover">{t('qb.downloadKey')}</Link>
                            </>
                          )}
                        </>
                      ),
                    },
                  ]}
                />
              </>
            ),
          },
        ]}
      />
      {dlg === 'question' && (
        <FormDialog
          title={t('qb.addQuestion')}
          intro={<Typography variant="body2">{t('qb.questionIntro')}</Typography>}
          fields={[
            { name: 'subject', label: t('qb.f.subjectCo'), kind: 'select', required: true, options: options.subjects.flatMap((s) => [{ value: `${s.id}|`, label: `${s.name} (${t('qb.noCo')})` }, ...s.outcomes.map((o) => ({ value: `${s.id}|${o.id}`, label: `${s.name} - ${o.code}` }))]) },
            { name: 'topic', label: t('qb.f.topic'), required: true },
            { name: 'unit', label: t('qb.f.unit') },
            { name: 'bloom', label: t('qb.f.bloom'), kind: 'select', required: true, options: choose('qb.bloom', BLOOM) },
            { name: 'difficulty', label: t('qb.f.difficulty'), kind: 'select', required: true, options: choose('qb.difficulty', DIFFICULTY) },
            { name: 'type', label: t('qb.f.type'), kind: 'select', required: true, options: choose('qb.type', TYPES) },
            { name: 'marks', label: t('qb.f.marks'), kind: 'number', required: true },
            { name: 'text', label: t('qb.f.text'), kind: 'multiline', required: true },
            { name: 'options', label: t('qb.f.options'), kind: 'multiline' },
            { name: 'answer', label: t('qb.f.answer'), kind: 'multiline' },
            { name: 'force', label: t('qb.f.force'), kind: 'select', init: 'no', options: [{ value: 'no', label: t('qb.no') }, { value: 'yes', label: t('qb.yes') }] },
          ]}
          onSubmit={addQuestion}
          onClose={done}
        />
      )}
      {dlg === 'blueprint' && (
        <FormDialog
          title={t('qb.addBlueprint')}
          intro={
            <>
              <Typography variant="body2">{t('qb.blueprintIntro')}</Typography>
              <Typography variant="body2" component="code" sx={{ display: 'block', mt: 0.5 }}>
                A; 4; 2; short; remember=1,apply=1; easy=1,hard=1; CO1,CO2
              </Typography>
            </>
          }
          fields={[
            { name: 'subjectId', label: t('qb.f.subject'), kind: 'select', required: true, options: options.subjects.map((s) => ({ value: s.id, label: s.name })) },
            { name: 'title', label: t('qb.f.title'), required: true },
            { name: 'totalMarks', label: t('qb.f.totalMarks'), kind: 'number', required: true },
            { name: 'durationMinutes', label: t('qb.f.duration'), kind: 'number', required: true },
            { name: 'sections', label: t('qb.f.sections'), kind: 'multiline', required: true },
          ]}
          onSubmit={addBlueprint}
          onClose={done}
        />
      )}
      {dlg === 'paper' && (
        <FormDialog
          title={t('qb.generate')}
          intro={<Typography variant="body2">{t('qb.generateIntro')}</Typography>}
          fields={[
            { name: 'blueprintId', label: t('qb.f.blueprint'), kind: 'select', required: true, options: blueprints.map((b) => ({ value: b.id, label: `${b.title} (${subjectName(b.subjectId)})` })) },
            { name: 'title', label: t('qb.f.title'), required: true },
            { name: 'seed', label: t('qb.f.seed') },
            { name: 'avoidLast', label: t('qb.f.avoidLast'), kind: 'number', init: '3' },
          ]}
          onSubmit={generatePaper}
          onClose={done}
        />
      )}
      {dlg && typeof dlg === 'object' && 'submit' in dlg && (
        <FormDialog title={`${t('qb.submit')}: ${dlg.submit.title}`} fields={[{ name: 'moderatorId', label: t('qb.f.moderator'), kind: 'select', required: true, options: options.staff.filter((s) => s.id !== dlg.submit.setterId).map((s) => ({ value: s.id, label: s.name })) }]} onSubmit={(v) => submitPaper(dlg.submit.id, v)} onClose={done} />
      )}
      {dlg && typeof dlg === 'object' && 'decide' in dlg && (
        <FormDialog
          title={`${t('qb.decide')}: ${dlg.decide.title}`}
          fields={[
            { name: 'decision', label: t('qb.f.decision'), kind: 'select', required: true, options: [{ value: 'approve', label: t('qb.decision.approve') }, { value: 'return', label: t('qb.decision.return') }] },
            { name: 'remarks', label: t('qb.f.remarks'), kind: 'multiline' },
          ]}
          onSubmit={(v) => decidePaper(dlg.decide.id, v)}
          onClose={done}
        />
      )}
      {dlg && typeof dlg === 'object' && 'view' in dlg && <PaperDialog paper={dlg.view} onClose={() => setDlg(null)} />}
      {toastNode}
    </>
  );
}

/** A paper's questions section by section, with the moderator's remarks. */
function PaperDialog({ paper, onClose }: { paper: QbPaper; onClose: () => void }) {
  const { t } = useI18n();
  const [d, setD] = useState<QbPaperDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    loadPaper(paper.id).then((r) => (r.ok ? setD(r.data) : setError(r.error)));
  }, [paper.id]);
  return (
    <InfoDialog title={paper.title} onClose={onClose}>
      {error && <Typography color="error">{error}</Typography>}
      {paper.remarks && <Typography color="warning.main">{t('qb.remarks', { text: paper.remarks })}</Typography>}
      {d && (
        <Stack spacing={2}>
          <Typography variant="body2">{t('qb.paperSummary', { marks: d.totalMarks, count: d.items.length, repeats: d.repeats })}</Typography>
          {d.blueprint.sections.map((sec, si) => (
            <div key={sec.name + si}>
              <Typography variant="subtitle2">{sec.name}</Typography>
              {d.items.filter((i) => i.section === si).map((i) => (
                <Typography key={i.id} variant="body2">
                  {i.position + 1}. {i.snapshot.text} [{i.marks}] {i.snapshot.coCode ?? ''} · {t(`qb.bloom.${i.snapshot.bloom}` as MessageKey)} · {t(`qb.difficulty.${i.snapshot.difficulty}` as MessageKey)}
                </Typography>
              ))}
            </div>
          ))}
        </Stack>
      )}
    </InfoDialog>
  );
}
