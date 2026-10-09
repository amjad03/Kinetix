'use client';

import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { addQuestion, type AttemptRow, configureOnlineTest, getAttempts, retireQuestion } from '@/app/(dashboard)/admissions/growth-actions';
import { SectionTitle } from '@/components/PageHeader';
import { CheckboxField, FormField, TextInput } from '@/components/ui';
import { useI18n } from '@/i18n/client';

export interface BankQuestion {
  id: string;
  topic: string;
  question: string;
  options: string[];
  correctIndex: number;
  marks: number;
}
export interface OnlineTest {
  id: string;
  name: string;
  testDate: string;
  durationMinutes: number;
  config: { questionCount: number; negativeMarks: number; open: boolean } | null;
}

function TestCard({ test, slug }: { test: OnlineTest; slug: string }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [count, setCount] = useState(String(test.config?.questionCount ?? 10));
  const [negative, setNegative] = useState(String(test.config?.negativeMarks ?? 0));
  const [open, setOpen] = useState(test.config?.open ?? false);
  const [attempts, setAttempts] = useState<AttemptRow[] | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const url = `${typeof window === 'undefined' ? '' : window.location.origin}/apply/${slug}/test`;
  const stamp = (iso: string | null) => (iso ? new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Kolkata' }).format(new Date(iso)) : '–');
  return (
    <Paper variant="outlined" sx={{ p: 2.5 }} data-testid="online-test-card">
      <SectionTitle flush>{test.name}</SectionTitle>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        {test.testDate} · {test.durationMinutes}
      </Typography>
      {message && (
        <Alert severity={message.ok ? 'success' : 'error'} sx={{ mb: 1.5 }}>
          {message.text}
        </Alert>
      )}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' }, gap: 1.5, alignItems: 'end' }}>
        <FormField label={t('ag.ot.test.count')}>
          <TextInput type="number" value={count} onChange={(e) => setCount(e.target.value)} />
        </FormField>
        <FormField label={t('ag.ot.test.negative')}>
          <TextInput type="number" value={negative} slotProps={{ htmlInput: { step: 0.25, min: 0 } }} onChange={(e) => setNegative(e.target.value)} />
        </FormField>
        <CheckboxField label={t('ag.ot.test.open')} checked={open} onChange={setOpen} />
      </Box>
      <Stack direction="row" spacing={1} sx={{ mt: 1.5 }}>
        <Button
          variant="contained"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const res = await configureOnlineTest(test.id, { questionCount: Number(count), negativeMarks: Number(negative), open });
              setMessage(res.ok ? { ok: true, text: t('ag.ot.saved') } : { ok: false, text: res.error });
              if (res.ok) router.refresh();
            })
          }
        >
          {t('ag.ot.test.save')}
        </Button>
        <Button
          disabled={pending}
          onClick={() =>
            start(async () => {
              const res = await getAttempts(test.id);
              if (res.ok) setAttempts(res.data);
              else setMessage({ ok: false, text: res.error });
            })
          }
        >
          {t('ag.ot.test.attempts')}
        </Button>
      </Stack>
      {test.config?.open && (
        <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 1 }}>
          {t('ag.ot.test.link', { url })}
        </Typography>
      )}
      {attempts && (
        <Box sx={{ mt: 2, overflowX: 'auto' }}>
          {attempts.length === 0 ? (
            <Typography color="text.secondary">{t('ag.ot.attempt.none')}</Typography>
          ) : (
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>{t('ag.ot.attempt.col.applicant')}</TableCell>
                  <TableCell>{t('ag.ot.attempt.col.started')}</TableCell>
                  <TableCell>{t('ag.ot.attempt.col.submitted')}</TableCell>
                  <TableCell align="right">{t('ag.ot.attempt.col.answered')}</TableCell>
                  <TableCell align="right">{t('ag.ot.attempt.col.score')}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {attempts.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell>
                      {a.applicantName}
                      <Typography variant="caption" color="text.secondary" component="div">
                        {a.applicationNo}
                      </Typography>
                    </TableCell>
                    <TableCell>{stamp(a.startedAt)}</TableCell>
                    <TableCell>{stamp(a.submittedAt)}</TableCell>
                    <TableCell align="right">{a.answered}</TableCell>
                    <TableCell align="right">{a.score ?? '–'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Box>
      )}
    </Paper>
  );
}

/** The online entrance test: the question bank, and per test how many questions, negative marking, open or closed. */
export function OnlineTestDesk({ questions, tests, slug }: { questions: BankQuestion[]; tests: OnlineTest[]; slug: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const BLANK = { topic: '', question: '', options: '', correct: '1', marks: '1' };
  const [f, setF] = useState(BLANK);
  return (
    <Stack spacing={3}>
      {error && <Alert severity="error">{error}</Alert>}
      <SectionTitle flush>{t('ag.ot.tests')}</SectionTitle>
      {tests.length === 0 ? <Typography color="text.secondary">{t('ag.ot.noTests')}</Typography> : tests.map((x) => <TestCard key={x.id} test={x} slug={slug} />)}

      <Paper variant="outlined" sx={{ p: 2.5 }}>
        <SectionTitle flush>{t('ag.ot.q.new')}</SectionTitle>
        <Box
          component="form"
          onSubmit={(e: React.FormEvent) => {
            e.preventDefault();
            start(async () => {
              setError(null);
              const res = await addQuestion({ topic: f.topic, question: f.question, options: f.options, correct: Number(f.correct), marks: Number(f.marks) });
              if (res.ok) {
                setF(BLANK);
                router.refresh();
              } else setError(res.error);
            });
          }}
          sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' }, gap: 1.5 }}
        >
          <FormField label={t('ag.ot.q.topic')}>
            <TextInput value={f.topic} onChange={(e) => setF({ ...f, topic: e.target.value })} />
          </FormField>
          <FormField label={t('ag.ot.q.marks')}>
            <TextInput type="number" value={f.marks} onChange={(e) => setF({ ...f, marks: e.target.value })} />
          </FormField>
          <FormField label={t('ag.ot.q.text')} required>
            <TextInput multiline minRows={2} value={f.question} onChange={(e) => setF({ ...f, question: e.target.value })} required />
          </FormField>
          <FormField label={t('ag.ot.q.options')} required>
            <TextInput multiline minRows={3} value={f.options} onChange={(e) => setF({ ...f, options: e.target.value })} required />
          </FormField>
          <FormField label={t('ag.ot.q.correct')}>
            <TextInput type="number" value={f.correct} slotProps={{ htmlInput: { min: 1, max: 6 } }} onChange={(e) => setF({ ...f, correct: e.target.value })} />
          </FormField>
          <Box sx={{ alignSelf: 'end' }}>
            <Button type="submit" variant="contained" disabled={pending}>
              {t('ag.ot.q.add')}
            </Button>
          </Box>
        </Box>
      </Paper>

      <Paper variant="outlined" sx={{ overflowX: 'auto' }}>
        <Box sx={{ p: 2, pb: 0 }}>
          <SectionTitle flush>
            {t('ag.ot.bank')} · {t('ag.ot.q.count', { n: questions.length })}
          </SectionTitle>
        </Box>
        {questions.length === 0 ? (
          <Typography color="text.secondary" sx={{ p: 2 }}>
            {t('ag.ot.q.none')}
          </Typography>
        ) : (
          <Table size="small" data-testid="question-bank">
            <TableBody>
              {questions.map((q) => (
                <TableRow key={q.id}>
                  <TableCell>{q.topic}</TableCell>
                  <TableCell>
                    {q.question}
                    <Typography variant="caption" color="text.secondary" component="div">
                      {q.options.map((o, i) => `${i + 1}. ${o}${i === q.correctIndex ? ' ✓' : ''}`).join('   ')}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">{q.marks}</TableCell>
                  <TableCell>
                    <Button
                      size="small"
                      color="inherit"
                      disabled={pending}
                      onClick={() =>
                        start(async () => {
                          const res = await retireQuestion(q.id);
                          if (res.ok) router.refresh();
                          else setError(res.error);
                        })
                      }
                    >
                      {t('ag.ot.q.remove')}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Paper>
    </Stack>
  );
}
