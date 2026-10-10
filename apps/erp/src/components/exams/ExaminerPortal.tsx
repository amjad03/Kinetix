'use client';

import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useState, useTransition } from 'react';
import { claimFor, movePaper, savePaper, sendInviteCode, valueScript, verifyInviteCode } from '@/app/examiner/[slug]/actions';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';

/** The invite page: send a code to the registered phone, enter it, and the portal opens. */
export function InviteLogin({ slug, token, who, phone, role, institution }: { slug: string; token: string; who: string; phone: string; role: string; institution: string }) {
  const { t } = useI18n();
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <Stack spacing={2}>
      <Typography>{t('uni.portal.invited', { name: who, role: t(`uni.ex.role.${role}` as MessageKey), institution })}</Typography>
      {error && <Alert severity="error">{error}</Alert>}
      {!sent ? (
        <Button variant="contained" disabled={pending} onClick={() => start(async () => { const r = await sendInviteCode(slug, token); if (r.ok) { setSent(true); setError(null); } else setError(r.error); })}>{t('uni.portal.sendCode')}</Button>
      ) : (
        <>
          <Alert severity="info">{t('uni.portal.codeSent', { phone })}</Alert>
          <TextField label={t('uni.portal.code')} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} slotProps={{ htmlInput: { inputMode: 'numeric', autoComplete: 'one-time-code' } }} />
          <Button variant="contained" disabled={pending || code.length !== 6} onClick={() => start(async () => { const r = await verifyInviteCode(slug, token, code); if (r && !r.ok) setError(r.error); })}>{t('uni.portal.enter')}</Button>
        </>
      )}
    </Stack>
  );
}

export interface PortalScript {
  id: string;
  scriptCode: string;
  maxMarks: number;
  marks: number | null;
  remarks: string | null;
  status: string;
}
export interface PortalPaper {
  id: string;
  title: string;
  content: string;
  status: string;
  scrutinyNote: string | null;
}

function ScriptRow({ s }: { s: PortalScript }) {
  const { t } = useI18n();
  const [marks, setMarks] = useState(s.marks === null ? '' : String(s.marks));
  const [remarks, setRemarks] = useState(s.remarks ?? '');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: "center", py: 0.5 }}>
      <Typography sx={{ width: 110, fontFamily: 'monospace' }}>{s.scriptCode}</Typography>
      <Typography variant="body2" sx={{ width: 70 }}>/ {s.maxMarks}</Typography>
      <TextField size="small" type="number" label={t('uni.portal.marks')} value={marks} onChange={(e) => setMarks(e.target.value)} sx={{ width: 110 }} error={!!error} helperText={error ?? undefined} />
      <TextField size="small" label={t('uni.portal.remarks')} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
      <Button size="small" variant={s.status === 'valued' ? 'outlined' : 'contained'} disabled={pending || marks === ''} onClick={() => start(async () => { const r = await valueScript(s.id, Number(marks), remarks); setError(r.ok ? null : r.error); })}>{t('uni.portal.save')}</Button>
    </Stack>
  );
}

export function ValuationPanel({ scripts }: { scripts: PortalScript[] }) {
  const { t } = useI18n();
  return (
    <Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>{t('uni.portal.valued', { done: scripts.filter((s) => s.status === 'valued').length, total: scripts.length })}</Typography>
      {scripts.map((s) => <ScriptRow key={s.id} s={s} />)}
    </Box>
  );
}

export function PaperPanel({ assignmentId, role, paper }: { assignmentId: string; role: string; paper: PortalPaper | null }) {
  const { t } = useI18n();
  const [title, setTitle] = useState(paper?.title ?? '');
  const [body, setBody] = useState(paper?.content ?? '');
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const editable = role === 'qp_setter' && (!paper || paper.status === 'draft');
  if (role === 'scrutiniser' && !paper) return <Alert severity="info">{t('uni.portal.noPaper')}</Alert>;
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) => start(async () => { const r = await fn(); setMsg(r.ok ? null : (r.error ?? null)); });
  return (
    <Stack spacing={1.5}>
      {paper && <Typography variant="body2" color="text.secondary">{t(`uni.ex.paper.status.${paper.status}` as MessageKey)}{paper.scrutinyNote ? `: ${paper.scrutinyNote}` : ''}</Typography>}
      {msg && <Alert severity="error">{msg}</Alert>}
      <TextField size="small" label={t('uni.portal.paperTitle')} value={title} onChange={(e) => setTitle(e.target.value)} disabled={!editable} />
      <TextField label={t('uni.portal.paperBody')} value={body} onChange={(e) => setBody(e.target.value)} multiline minRows={8} disabled={!editable} />
      {editable && (
        <Stack direction="row" spacing={1}>
          <Button variant="outlined" disabled={pending || !title.trim()} onClick={() => run(() => savePaper(assignmentId, title, body))}>{t('uni.portal.save')}</Button>
          <Button variant="contained" disabled={pending || !paper} onClick={() => run(() => movePaper(assignmentId, 'submit'))}>{t('uni.portal.submit')}</Button>
        </Stack>
      )}
      {role === 'scrutiniser' && paper?.status === 'scrutiny' && (
        <Stack direction="row" spacing={1}>
          <Button variant="contained" disabled={pending} onClick={() => run(() => movePaper(assignmentId, 'approve'))}>{t('uni.portal.approve')}</Button>
          <Button variant="outlined" color="warning" disabled={pending} onClick={() => { const n = window.prompt(t('uni.ex.note')); if (n) run(() => movePaper(assignmentId, 'return', n)); }}>{t('uni.portal.return')}</Button>
        </Stack>
      )}
    </Stack>
  );
}

export function ClaimButton({ assignmentId }: { assignmentId: string }) {
  const { t, locale } = useI18n();
  const [msg, setMsg] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <Box>
      <Button variant="outlined" disabled={pending} onClick={() => start(async () => { const r = await claimFor(assignmentId); setMsg(r.ok ? { tone: 'success', text: t('uni.portal.claimed', { amount: new Intl.NumberFormat(locale === 'en' ? 'en-IN' : locale, { style: 'currency', currency: 'INR' }).format(r.data.amountPaise / 100) }) } : { tone: 'error', text: r.error }); })}>{t('uni.portal.claim')}</Button>
      {msg && <Alert severity={msg.tone} sx={{ mt: 1 }}>{msg.text}</Alert>}
    </Box>
  );
}

export function PortalCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card sx={{ p: 2.5, mb: 2 }}>
      <Typography variant="h6" component="h2" sx={{ mb: 1.5 }}>{title}</Typography>
      {children}
    </Card>
  );
}
