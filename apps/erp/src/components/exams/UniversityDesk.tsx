'use client';

import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useState, useTransition } from 'react';
import { DeskTable } from '@/components/campus/Desk';
import { generateRegister, installSamples } from '@/app/(dashboard)/exams/university-actions';
import { useI18n } from '@/i18n/client';

export interface UniTemplate {
  id: string;
  code: string;
  name: string;
  university: string;
}
export interface UniRegister {
  id: string;
  label: string;
  template: string;
  createdAt: string;
  summary: { students: number; passed: number; failed: number; passPercent: number };
}

/** Affiliating-university formats: templates, generating a tabulation register, and exports in the university's layout. */
export function UniversityDesk({ templates, registers, sessions }: { templates: UniTemplate[]; registers: UniRegister[]; sessions: { id: string; name: string }[] }) {
  const { t } = useI18n();
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? '');
  const [label, setLabel] = useState('');
  const [kind, setKind] = useState<'legacy' | 'session'>('legacy');
  const [year, setYear] = useState('');
  const [term, setTerm] = useState('1');
  const [sessionId, setSessionId] = useState(sessions[0]?.id ?? '');
  const [msg, setMsg] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [pending, start] = useTransition();

  const samples = () =>
    start(async () => {
      const r = await installSamples();
      setMsg(r.ok ? { tone: 'success', text: t('uni.fmt.samplesAdded', { n: r.data.added }) } : { tone: 'error', text: r.error });
    });
  const generate = () =>
    start(async () => {
      const source = kind === 'legacy' ? { kind: 'legacy' as const, academicYear: year, term: Number(term) } : { kind: 'session' as const, sessionId };
      const r = await generateRegister({ templateId, label, source });
      setMsg(r.ok ? { tone: 'success', text: r.data.rulesApplied.length ? `${t('uni.fmt.generated')} ${t('uni.fmt.rules', { rules: r.data.rulesApplied.join(', ') })}` : t('uni.fmt.generated') } : { tone: 'error', text: r.error });
    });

  return (
    <Stack spacing={3}>
      {msg && <Alert severity={msg.tone}>{msg.text}</Alert>}
      <DeskTable title={t('uni.fmt.templates')} head={[t('uni.fmt.template'), 'Code', '']} rows={templates.map((x) => [x.name, x.code, x.university])} testId="uni-templates" />
      <Stack direction="row" spacing={2} sx={{ alignItems: "center" }}>
        <Button variant="outlined" disabled={pending} onClick={samples}>{t('uni.fmt.samples')}</Button>
        <Typography variant="body2" color="text.secondary">{t('uni.fmt.sampleNote')}</Typography>
      </Stack>
      {templates.length > 0 && (
        <Card sx={{ p: 2.5 }}>
          <Typography variant="h6" component="h2" sx={{ mb: 2 }}>{t('uni.fmt.generate')}</Typography>
          <Stack spacing={2} sx={{ maxWidth: 520 }}>
            <TextField select size="small" label={t('uni.fmt.template')} value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
              {templates.map((x) => <MenuItem key={x.id} value={x.id}>{x.name}</MenuItem>)}
            </TextField>
            <TextField size="small" label={t('uni.fmt.label')} value={label} onChange={(e) => setLabel(e.target.value)} />
            <TextField select size="small" label={t('uni.fmt.source')} value={kind} onChange={(e) => setKind(e.target.value as 'legacy' | 'session')}>
              <MenuItem value="legacy">{t('uni.fmt.source.legacy')}</MenuItem>
              <MenuItem value="session">{t('uni.fmt.source.session')}</MenuItem>
            </TextField>
            {kind === 'legacy' ? (
              <Stack direction="row" spacing={2}>
                <TextField size="small" label={t('uni.fmt.year')} value={year} onChange={(e) => setYear(e.target.value)} />
                <TextField size="small" type="number" label={t('uni.fmt.term')} value={term} onChange={(e) => setTerm(e.target.value)} />
              </Stack>
            ) : (
              <TextField select size="small" label={t('uni.fmt.session')} value={sessionId} onChange={(e) => setSessionId(e.target.value)}>
                {sessions.map((s) => <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>)}
              </TextField>
            )}
            <Button variant="contained" disabled={pending || !label.trim() || !templateId || (kind === 'legacy' ? !year.trim() : !sessionId)} onClick={generate}>{t('uni.fmt.run')}</Button>
          </Stack>
        </Card>
      )}
      <DeskTable
        title={t('uni.fmt.registers')}
        head={[t('uni.fmt.label'), t('uni.fmt.students'), t('uni.fmt.passed'), t('uni.fmt.failed'), t('uni.fmt.passPercent'), t('uni.fmt.export')]}
        rows={registers.map((r) => [
          r.label,
          r.summary.students,
          r.summary.passed,
          r.summary.failed,
          r.summary.passPercent,
          <Stack key={r.id} direction="row" spacing={1}>
            {(['pdf', 'xlsx', 'csv'] as const).map((f) => <Button key={f} size="small" href={`/api/download?kind=register-${f}&id=${r.id}`}>{f === 'xlsx' ? 'Excel' : f.toUpperCase()}</Button>)}
          </Stack>,
        ])}
        testId="uni-registers"
      />
    </Stack>
  );
}
