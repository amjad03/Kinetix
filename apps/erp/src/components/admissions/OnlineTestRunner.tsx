'use client';

import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import FormControlLabel from '@mui/material/FormControlLabel';
import Paper from '@mui/material/Paper';
import Radio from '@mui/material/Radio';
import RadioGroup from '@mui/material/RadioGroup';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { onlineLogin, onlineSave, onlineStart, onlineSubmit, onlineTests, type OnlineRun, type OnlineTestInfo } from '@/app/apply/actions';
import { FormField, TextInput } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import { formatDate } from '@/lib/dates';

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
      <Paper variant="outlined" sx={{ p: 3, mt: 3 }}>
        <Typography variant="h5" component="h1" sx={{ mb: 1 }}>
          {t('ag.take.title')}
        </Typography>
        <Typography color="text.secondary" sx={{ mb: 2 }}>
          {t('ag.take.intro')}
        </Typography>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        <Box
          component="form"
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
          <Stack spacing={2} sx={{ maxWidth: 420 }}>
            <FormField label={t('ag.take.appNo')} required>
              <TextInput value={login.appNo} onChange={(e) => setLogin({ ...login, appNo: e.target.value })} required />
            </FormField>
            <FormField label={t('ag.take.token')} required>
              <TextInput type="password" autoComplete="off" value={login.token} onChange={(e) => setLogin({ ...login, token: e.target.value })} required />
            </FormField>
            <Box>
              <Button type="submit" variant="contained" disabled={pending}>
                {t('ag.take.signIn')}
              </Button>
            </Box>
          </Stack>
        </Box>
      </Paper>
    );
  }

  if (run) {
    const q = run.data.questions;
    const done = Object.keys(answers).filter((id) => q.some((x) => x.id === id)).length;
    return (
      <Stack spacing={2} sx={{ mt: 3 }} data-testid="online-test-run">
        <Paper variant="outlined" sx={{ p: 2, position: 'sticky', top: 0, zIndex: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
          <Typography sx={{ fontWeight: 700, color: left < 120_000 ? 'error.main' : 'text.primary' }} role="timer" aria-live="off">
            {t('ag.take.timeLeft', { time: clock(left) })}
          </Typography>
          <Typography color="text.secondary">{t('ag.take.answered', { n: done, total: q.length })}</Typography>
        </Paper>
        {error && <Alert severity="error">{error}</Alert>}
        {q.map((x, i) => (
          <Paper key={x.id} variant="outlined" sx={{ p: 2.5 }}>
            <Typography variant="subtitle2" color="text.secondary">
              {t('ag.take.question', { n: i + 1 })} · {t('ag.take.marks', { n: x.marks })}
            </Typography>
            <Typography sx={{ my: 1 }}>{x.question}</Typography>
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
          </Paper>
        ))}
        <Box>
          <Button
            variant="contained"
            disabled={pending}
            onClick={() => {
              if (window.confirm(t('ag.take.confirm'))) start(() => submit(false));
            }}
          >
            {t('ag.take.submit')}
          </Button>
        </Box>
      </Stack>
    );
  }

  return (
    <Stack spacing={2} sx={{ mt: 3 }}>
      <Typography variant="h5" component="h1">
        {t('ag.take.hello', { name: who.applicantName })}
      </Typography>
      {notice && <Alert severity="success">{notice}</Alert>}
      {error && <Alert severity="error">{error}</Alert>}
      <Typography variant="h6" component="h2">
        {t('ag.take.tests')}
      </Typography>
      {tests.length === 0 && <Typography color="text.secondary">{t('ag.take.none')}</Typography>}
      {tests.map((x) => (
        <Paper key={x.testId} variant="outlined" sx={{ p: 2.5, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
          <Box>
            <Typography sx={{ fontWeight: 600 }}>{x.name}</Typography>
            <Typography variant="body2" color="text.secondary">
              {t('ag.take.info', { date: formatDate(x.testDate, 'dayMonth', locale), minutes: x.durationMinutes, n: x.questionCount })}
            </Typography>
          </Box>
          {x.status === 'submitted' || x.status === 'expired' ? (
            <Typography color="text.secondary">{t(x.status === 'submitted' ? 'ag.take.submitted' : ('ag.take.expired' as MessageKey))}</Typography>
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
        </Paper>
      ))}
    </Stack>
  );
}
