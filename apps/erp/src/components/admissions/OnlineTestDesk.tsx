'use client';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { addQuestion, type AttemptRow, configureOnlineTest, getAttempts, retireQuestion } from '@/app/(dashboard)/admissions/growth-actions';
import { SectionTitle } from '@/components/PageHeader';
import { CheckboxField, FormField, TextInput } from '@/components/ui';
import { useI18n } from '@/i18n/client';

import { Alert, Button, Table, TableBody, TableCell, TableHead, TableRow } from '@/components/kx';
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
    <div className="rounded-[12px] border bg-card p-5" data-testid="online-test-card">
      <SectionTitle flush>{test.name}</SectionTitle>
      <p className="text-[13px] leading-[19px] text-muted-foreground mb-3">
        {test.testDate} · {test.durationMinutes}
      </p>
      {message && (
        <Alert className="mb-3" severity={message.ok ? 'success' : 'error'}>
          {message.text}
        </Alert>
      )}
      <div className="grid grid-cols-[1fr] sm:grid-cols-[repeat(3,1fr)] gap-3 items-end">
        <FormField label={t('ag.ot.test.count')}>
          <TextInput type="number" value={count} onChange={(e) => setCount(e.target.value)} />
        </FormField>
        <FormField label={t('ag.ot.test.negative')}>
          <TextInput type="number" value={negative} slotProps={{ htmlInput: { step: 0.25, min: 0 } }} onChange={(e) => setNegative(e.target.value)} />
        </FormField>
        <CheckboxField label={t('ag.ot.test.open')} checked={open} onChange={setOpen} />
      </div>
      <div className="flex flex-row gap-2 mt-3">
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
      </div>
      {test.config?.open && (
        <div className="text-xs leading-4 tracking-[0.3px] text-muted-foreground mt-2">
          {t('ag.ot.test.link', { url })}
        </div>
      )}
      {attempts && (
        <div className="mt-4 overflow-x-auto">
          {attempts.length === 0 ? (
            <p className="text-sm leading-[21px] text-muted-foreground">{t('ag.ot.attempt.none')}</p>
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
                      <div className="text-xs leading-4 tracking-[0.3px] text-muted-foreground">
                        {a.applicationNo}
                      </div>
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
        </div>
      )}
    </div>
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
    <div className="flex flex-col gap-6">
      {error && <Alert severity="error">{error}</Alert>}
      <SectionTitle flush>{t('ag.ot.tests')}</SectionTitle>
      {tests.length === 0 ? <p className="text-sm leading-[21px] text-muted-foreground">{t('ag.ot.noTests')}</p> : tests.map((x) => <TestCard key={x.id} test={x} slug={slug} />)}

      <div className="rounded-[12px] border bg-card p-5">
        <SectionTitle flush>{t('ag.ot.q.new')}</SectionTitle>
        <form className="grid grid-cols-[1fr] sm:grid-cols-[repeat(2,1fr)] gap-3"
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
          <div className="self-end">
            <Button type="submit" variant="contained" disabled={pending}>
              {t('ag.ot.q.add')}
            </Button>
          </div>
        </form>
      </div>

      <div className="rounded-[12px] border bg-card overflow-x-auto">
        <div className="p-4 pb-0">
          <SectionTitle flush>
            {t('ag.ot.bank')} · {t('ag.ot.q.count', { n: questions.length })}
          </SectionTitle>
        </div>
        {questions.length === 0 ? (
          <p className="text-sm leading-[21px] text-muted-foreground p-4">
            {t('ag.ot.q.none')}
          </p>
        ) : (
          <Table size="small" data-testid="question-bank">
            <TableBody>
              {questions.map((q) => (
                <TableRow key={q.id}>
                  <TableCell>{q.topic}</TableCell>
                  <TableCell>
                    {q.question}
                    <div className="text-xs leading-4 tracking-[0.3px] text-muted-foreground">
                      {q.options.map((o, i) => `${i + 1}. ${o}${i === q.correctIndex ? ' ✓' : ''}`).join('   ')}
                    </div>
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
      </div>
    </div>
  );
}
