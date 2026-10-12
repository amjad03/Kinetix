'use client';
import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { onlineLogin, onlineSave, onlineStart, onlineSubmit, onlineTests, type OnlineRun, type OnlineTestInfo } from '@/app/apply/actions';
import { FormField, TextInput } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import { formatDate } from '@/lib/dates';

import { Alert, Button, FormControlLabel, Radio, RadioGroup } from '@/components/kx';
import { cn } from '@/lib/utils';
const clock = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

/**
 * The applicant's online entrance test. The application number and access token are the sign-in;
 * answers are saved as they are chosen, and the test submits itself when the time is up.
 */
export function OnlineTestRunner({ slug }: { slug: string }) {
  const { t, locale } = useI18n();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [login, setLogin] = useState({ appNo: '', token: '' });
  const [who, setWho] = useState<{ applicationId: string; applicantName: string; token: string } | null>(null);
  const [tests, setTests] = useState<OnlineTestInfo[]>([]);
  const [run, setRun] = useState<{ testId: string; data: OnlineRun } | null>(null);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [left, setLeft] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const submitting = useRef(false);

  const refresh = useCallback(
    async (id: string, token: string) => {
      const res = await onlineTests(slug, id, token);
      if (res.ok) setTests(res.data);
      else setError(res.error);
    },
    [slug],
  );

  const submit = useCallback(
    async (timeUp: boolean) => {
      if (!who || !run || submitting.current) return;
      submitting.current = true;
      const res = await onlineSubmit(slug, who.applicationId, who.token, run.testId, answers);
      submitting.current = false;
      if (res.ok) {
        setNotice(timeUp ? t('ag.take.timeUp') : t('ag.take.done', { score: res.data.score ?? 0 }));
        setRun(null);
        await refresh(who.applicationId, who.token);
      } else setError(res.error);
    },
    [who, run, slug, answers, refresh, t],
  );

  useEffect(() => {
    if (!run) return;
    const end = new Date(run.data.deadlineAt).getTime();
    const tick = () => {
      const ms = end - Date.now();
      setLeft(ms);
      if (ms <= 0) void submit(true);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [run, submit]);

  if (!who) {
    return (
      <div className="rounded-[12px] border bg-card p-6 mt-6">
        <h1 className="text-[1.375rem] leading-7 mb-2">
          {t('ag.take.title')}
        </h1>
        <p className="text-sm leading-[21px] text-muted-foreground mb-4">
          {t('ag.take.intro')}
        </p>
        {error && (
          <Alert className="mb-4" severity="error">
            {error}
          </Alert>
        )}
        <form
          onSubmit={(e: React.FormEvent) => {
            e.preventDefault();
            setError(null);
            start(async () => {
              const res = await onlineLogin(slug, login.appNo, login.token);
              if (!res.ok) return setError(res.error);
              setWho({ applicationId: res.data.applicationId, applicantName: res.data.applicantName, token: login.token.trim() });
              await refresh(res.data.applicationId, login.token.trim());
            });
          }}
        >
          <div className="flex flex-col gap-4 max-w-[420px]">
            <FormField label={t('ag.take.appNo')} required>
              <TextInput value={login.appNo} onChange={(e) => setLogin({ ...login, appNo: e.target.value })} required />
            </FormField>
            <FormField label={t('ag.take.token')} required>
              <TextInput type="password" autoComplete="off" value={login.token} onChange={(e) => setLogin({ ...login, token: e.target.value })} required />
            </FormField>
            <div>
              <Button type="submit" variant="contained" disabled={pending}>
                {t('ag.take.signIn')}
              </Button>
            </div>
          </div>
        </form>
      </div>
    );
  }

  if (run) {
    const q = run.data.questions;
    const done = Object.keys(answers).filter((id) => q.some((x) => x.id === id)).length;
    return (
      <div className="flex flex-col gap-4 mt-6" data-testid="online-test-run">
        <div className="rounded-[12px] border bg-card p-4 sticky top-0 z-[1] flex justify-between items-center gap-4 flex-wrap">
          <p className={cn('text-sm leading-[21px] font-bold', left < 120_000 ? 'text-red-ink' : 'text-foreground')} role="timer" aria-live="off">
            {t('ag.take.timeLeft', { time: clock(left) })}
          </p>
          <p className="text-sm leading-[21px] text-muted-foreground">{t('ag.take.answered', { n: done, total: q.length })}</p>
        </div>
        {error && <Alert severity="error">{error}</Alert>}
        {q.map((x, i) => (
          <div className="rounded-[12px] border bg-card p-5" key={x.id}>
            <h6 className="text-sm leading-5 font-medium tracking-[0.1px] text-muted-foreground">
              {t('ag.take.question', { n: i + 1 })} · {t('ag.take.marks', { n: x.marks })}
            </h6>
            <p className="text-sm leading-[21px] my-2">{x.question}</p>
            <RadioGroup
              value={answers[x.id] ?? ''}
              onChange={(e) => {
                const next = { ...answers, [x.id]: Number(e.target.value) };
                setAnswers(next);
                void onlineSave(slug, who.applicationId, who.token, run.testId, next);
              }}
            >
              {x.options.map((o, k) => (
                <FormControlLabel key={k} value={k} control={<Radio />} label={o} />
              ))}
            </RadioGroup>
          </div>
        ))}
        <div>
          <Button
            variant="contained"
            disabled={pending}
            onClick={() => {
              if (window.confirm(t('ag.take.confirm'))) start(() => submit(false));
            }}
          >
            {t('ag.take.submit')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 mt-6">
      <h1 className="text-[1.375rem] leading-7">
        {t('ag.take.hello', { name: who.applicantName })}
      </h1>
      {notice && <Alert severity="success">{notice}</Alert>}
      {error && <Alert severity="error">{error}</Alert>}
      <h2 className="text-base leading-6 font-medium tracking-[0.1px]">
        {t('ag.take.tests')}
      </h2>
      {tests.length === 0 && <p className="text-sm leading-[21px] text-muted-foreground">{t('ag.take.none')}</p>}
      {tests.map((x) => (
        <div className="rounded-[12px] border bg-card p-5 flex justify-between items-center gap-4 flex-wrap" key={x.testId}>
          <div>
            <p className="text-sm leading-[21px] font-semibold">{x.name}</p>
            <p className="text-[13px] leading-[19px] text-muted-foreground">
              {t('ag.take.info', { date: formatDate(x.testDate, 'dayMonth', locale), minutes: x.durationMinutes, n: x.questionCount })}
            </p>
          </div>
          {x.status === 'submitted' || x.status === 'expired' ? (
            <p className="text-sm leading-[21px] text-muted-foreground">{t(x.status === 'submitted' ? 'ag.take.submitted' : ('ag.take.expired' as MessageKey))}</p>
          ) : (
            <Button
              variant="contained"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  setError(null);
                  setNotice(null);
                  const res = await onlineStart(slug, who.applicationId, who.token, x.testId);
                  if (!res.ok) return setError(res.error);
                  setAnswers(res.data.answers);
                  setRun({ testId: x.testId, data: res.data });
                })
              }
            >
              {x.status === 'in_progress' ? t('ag.take.resume') : t('ag.take.start')}
            </Button>
          )}
        </div>
      ))}
    </div>
  );
}
