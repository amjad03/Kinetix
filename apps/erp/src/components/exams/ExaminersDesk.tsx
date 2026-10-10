'use client';

import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useState, useTransition } from 'react';
import { DeskTable, Pill } from '@/components/campus/Desk';
import { addExaminer, assignExaminer, assignmentAction, decideClaim, paperAction } from '@/app/(dashboard)/exams/university-actions';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';

export interface ExaminerRow {
  id: string;
  fullName: string;
  organisation: string;
  phone: string | null;
  assignments: { id: string; role: string; session: string; subject: string; status: string; ratePaise: number }[];
}
export interface PaperRow {
  id: string;
  subject: string;
  title: string;
  status: string;
  scrutinyNote: string | null;
}
export interface ClaimRow {
  id: string;
  examiner: string;
  subject: string;
  units: number;
  amountPaise: number;
  status: string;
}

/** The exam office side of external examiners: add, assign with an invite link, prepare scripts, move papers, settle claims. */
export function ExaminersDesk({ examiners, papers, claims, sessions, subjects, origin, slug }: { examiners: ExaminerRow[]; papers: PaperRow[]; claims: ClaimRow[]; sessions: { id: string; name: string }[]; subjects: { id: string; label: string }[]; origin: string; slug: string }) {
  const { t, locale } = useI18n();
  const [msg, setMsg] = useState<{ tone: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [pending, start] = useTransition();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [org, setOrg] = useState('');
  const [who, setWho] = useState(examiners[0]?.id ?? '');
  const [sessionId, setSessionId] = useState(sessions[0]?.id ?? '');
  const [subjectId, setSubjectId] = useState(subjects[0]?.id ?? '');
  const [role, setRole] = useState('valuer');
  const [rate, setRate] = useState('0');

  const say = (r: { ok: boolean; error?: string }, text: string) => setMsg(r.ok ? { tone: 'success', text } : { tone: 'error', text: r.error ?? '' });
  const rupees = (p: number) => new Intl.NumberFormat(locale === 'en' ? 'en-IN' : locale, { style: 'currency', currency: 'INR' }).format(p / 100);

  return (
    <Stack spacing={3}>
      {msg && <Alert severity={msg.tone}>{msg.text}</Alert>}
      <Card sx={{ p: 2.5 }}>
        <Typography variant="h6" component="h2" sx={{ mb: 2 }}>{t('uni.ex.add')}</Typography>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
          <TextField size="small" label={t('uni.ex.name')} value={name} onChange={(e) => setName(e.target.value)} />
          <TextField size="small" label={t('uni.ex.phone')} value={phone} onChange={(e) => setPhone(e.target.value)} />
          <TextField size="small" label={t('uni.ex.org')} value={org} onChange={(e) => setOrg(e.target.value)} />
          <Button variant="contained" disabled={pending || !name.trim() || !phone.trim()} onClick={() => start(async () => say(await addExaminer({ fullName: name, phone, organisation: org }), t('uni.ex.saved')))}>{t('uni.ex.add')}</Button>
        </Stack>
      </Card>

      {examiners.length > 0 && (
        <Card sx={{ p: 2.5 }}>
          <Typography variant="h6" component="h2" sx={{ mb: 2 }}>{t('uni.ex.assign')}</Typography>
          <Stack spacing={2} sx={{ maxWidth: 520 }}>
            <TextField select size="small" label={t('uni.ex.name')} value={who} onChange={(e) => setWho(e.target.value)}>
              {examiners.map((x) => <MenuItem key={x.id} value={x.id}>{x.fullName}</MenuItem>)}
            </TextField>
            <TextField select size="small" label={t('uni.ex.session')} value={sessionId} onChange={(e) => setSessionId(e.target.value)}>
              {sessions.map((x) => <MenuItem key={x.id} value={x.id}>{x.name}</MenuItem>)}
            </TextField>
            <TextField select size="small" label={t('uni.ex.subject')} value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
              {subjects.map((x) => <MenuItem key={x.id} value={x.id}>{x.label}</MenuItem>)}
            </TextField>
            <TextField select size="small" label={t('uni.ex.role')} value={role} onChange={(e) => setRole(e.target.value)}>
              {['valuer', 'qp_setter', 'scrutiniser'].map((r) => <MenuItem key={r} value={r}>{t(`uni.ex.role.${r}` as MessageKey)}</MenuItem>)}
            </TextField>
            <TextField size="small" type="number" label={t('uni.ex.rate')} value={rate} onChange={(e) => setRate(e.target.value)} />
            <Button
              variant="contained"
              disabled={pending || !who || !sessionId || !subjectId}
              onClick={() =>
                start(async () => {
                  const r = await assignExaminer(who, { sessionId, subjectId, role, ratePaise: Math.round(Number(rate) * 100) });
                  if (r.ok) setMsg({ tone: 'info', text: t('uni.ex.invite', { link: `${origin}/examiner/${slug}?invite=${encodeURIComponent(r.data.inviteToken)}` }) });
                  else setMsg({ tone: 'error', text: r.error });
                })
              }
            >
              {t('uni.ex.assign')}
            </Button>
          </Stack>
        </Card>
      )}

      {examiners.length === 0 ? (
        <Alert severity="info">{t('uni.ex.none')}</Alert>
      ) : (
        <DeskTable
          title={t('uni.ex.assignments')}
          head={[t('uni.ex.name'), t('uni.ex.role'), t('uni.ex.session'), t('uni.ex.subject'), t('uni.doc.status'), '']}
          rows={examiners.flatMap((e) =>
            e.assignments.map((a) => [
              `${e.fullName}${e.organisation ? `, ${e.organisation}` : ''}`,
              t(`uni.ex.role.${a.role}` as MessageKey),
              a.session,
              a.subject,
              a.status,
              <Stack key={a.id} direction="row" spacing={1}>
                {a.role === 'valuer' && (
                  <>
                    <Button size="small" disabled={pending} onClick={() => start(async () => { const r = await assignmentAction(a.id, 'scripts'); say(r, r.ok ? t('uni.ex.scriptsAdded', { n: Number(r.data.added) }) : ''); })}>{t('uni.ex.prepare')}</Button>
                    <Button size="small" disabled={pending} onClick={() => start(async () => { const r = await assignmentAction(a.id, 'apply'); say(r, r.ok ? t('uni.ex.applied', { n: Number(r.data.applied) }) : ''); })}>{t('uni.ex.apply')}</Button>
                  </>
                )}
              </Stack>,
            ]),
          )}
          testId="ext-assignments"
        />
      )}

      <DeskTable
        title={t('uni.ex.papers')}
        head={[t('uni.ex.subject'), t('uni.portal.paperTitle'), t('uni.doc.status'), t('uni.ex.note'), '']}
        rows={papers.map((p) => [
          p.subject,
          p.title,
          <Pill key={p.id} tone={p.status === 'locked' || p.status === 'approved' ? 'success' : 'warning'} label={t(`uni.ex.paper.status.${p.status}` as MessageKey)} />,
          p.scrutinyNote ?? '',
          <Stack key={`p${p.id}`} direction="row" spacing={1}>
            {p.status === 'scrutiny' && <Button size="small" disabled={pending} onClick={() => start(async () => say(await paperAction(p.id, 'approve'), t('uni.ex.saved')))}>{t('uni.ex.paper.approve')}</Button>}
            {(p.status === 'scrutiny' || p.status === 'approved') && (
              <Button size="small" color="warning" disabled={pending} onClick={() => { const note = window.prompt(t('uni.ex.note')); if (note) start(async () => say(await paperAction(p.id, 'return', note), t('uni.ex.saved'))); }}>{t('uni.ex.paper.return')}</Button>
            )}
            {p.status === 'approved' && <Button size="small" disabled={pending} onClick={() => start(async () => say(await paperAction(p.id, 'lock'), t('uni.ex.saved')))}>{t('uni.ex.paper.lock')}</Button>}
          </Stack>,
        ])}
        testId="ext-papers"
      />

      <DeskTable
        title={t('uni.ex.claims')}
        head={[t('uni.ex.name'), t('uni.ex.subject'), t('uni.ex.units'), t('uni.ex.amount'), t('uni.doc.status'), '']}
        rows={claims.map((c) => [
          c.examiner,
          c.subject,
          c.units,
          rupees(c.amountPaise),
          t(`uni.ex.claim.status.${c.status}` as MessageKey),
          <Stack key={c.id} direction="row" spacing={1}>
            {c.status === 'submitted' && (
              <>
                <Button size="small" disabled={pending} onClick={() => start(async () => say(await decideClaim(c.id, 'approved'), t('uni.ex.saved')))}>{t('uni.ex.claim.approved')}</Button>
                <Button size="small" color="error" disabled={pending} onClick={() => start(async () => say(await decideClaim(c.id, 'rejected'), t('uni.ex.saved')))}>{t('uni.ex.claim.rejected')}</Button>
              </>
            )}
            {c.status === 'approved' && <Button size="small" disabled={pending} onClick={() => start(async () => say(await decideClaim(c.id, 'paid'), t('uni.ex.saved')))}>{t('uni.ex.claim.paid')}</Button>}
          </Stack>,
        ])}
        testId="ext-claims"
      />
    </Stack>
  );
}
