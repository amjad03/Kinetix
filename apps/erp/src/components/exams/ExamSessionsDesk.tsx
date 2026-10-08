'use client';

import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import MenuItem from '@mui/material/MenuItem';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import Link from 'next/link';
import { useState } from 'react';
import { createSession } from '@/app/(dashboard)/exams/actions';
import { TableFrame } from '@/components/DataTable';
import { StatusPill } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import { sessionTone, type ExamSession } from '@/lib/exams';
import type { Structure } from '@/lib/types';
import { useRun } from './useRun';

export function ExamSessionsDesk({ sessions, structure, canManage }: { sessions: ExamSession[]; structure: Structure & { academicYears?: { id: string; label: string; isCurrent: boolean }[] }; canManage: boolean }) {
  const { t, fmt } = useI18n();
  const { pending, run, feedback } = useRun();
  const years = structure.academicYears ?? [];
  const [f, setF] = useState({ academicYearId: years.find((y) => y.isCurrent)?.id ?? years[0]?.id ?? '', programId: structure.programs[0]?.id ?? '', term: '1', name: '', kind: 'regular' as 'regular' | 'supplementary', startsOn: '', endsOn: '' });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF((x) => ({ ...x, [k]: e.target.value }));
  return (
    <>
      {canManage && (
        <Card sx={{ p: 2.5, mb: 3 }}>
          <Typography variant="h6" component="h2" sx={{ mb: 1.5 }}>
            {t('exm.newSession')}
          </Typography>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              run(() => createSession({ ...f, term: Number(f.term) }), t('exm.sessionCreated'), () => setF((x) => ({ ...x, name: '' })));
            }}
            style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))' }}
          >
            <TextField label={t('exm.f.name')} value={f.name} onChange={set('name')} required size="small" />
            <TextField select label={t('exm.f.year')} value={f.academicYearId} onChange={set('academicYearId')} size="small" required>
              {years.map((y) => (
                <MenuItem key={y.id} value={y.id}>
                  {y.label}
                </MenuItem>
              ))}
            </TextField>
            <TextField select label={t('exm.f.program')} value={f.programId} onChange={set('programId')} size="small" required>
              {structure.programs.map((p) => (
                <MenuItem key={p.id} value={p.id}>
                  {p.name}
                </MenuItem>
              ))}
            </TextField>
            <TextField label={t('exm.f.term')} type="number" value={f.term} onChange={set('term')} size="small" slotProps={{ htmlInput: { min: 1, max: 20 } }} />
            <TextField select label={t('exm.f.kind')} value={f.kind} onChange={set('kind')} size="small">
              <MenuItem value="regular">{t('exm.kind.regular')}</MenuItem>
              <MenuItem value="supplementary">{t('exm.kind.supplementary')}</MenuItem>
            </TextField>
            <TextField label={t('exm.f.starts')} type="date" value={f.startsOn} onChange={set('startsOn')} size="small" required slotProps={{ inputLabel: { shrink: true } }} />
            <TextField label={t('exm.f.ends')} type="date" value={f.endsOn} onChange={set('endsOn')} size="small" required slotProps={{ inputLabel: { shrink: true } }} />
            <Button type="submit" variant="contained" disabled={pending} sx={{ alignSelf: 'center' }}>
              {t('exm.create')}
            </Button>
          </form>
          {feedback}
        </Card>
      )}
      {sessions.length === 0 ? (
        <Typography color="text.secondary">{t('exm.none')}</Typography>
      ) : (
        <TableFrame testId="exam-sessions">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>{t('exm.f.name')}</TableCell>
                <TableCell>{t('exm.f.term')}</TableCell>
                <TableCell>{t('exm.dates')}</TableCell>
                <TableCell>{t('exm.status')}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {sessions.map((s) => (
                <TableRow key={s.id} hover>
                  <TableCell>
                    <Link href={`/exams/${s.id}`}>{s.name}</Link>
                    {s.kind === 'supplementary' && <span style={{ marginInlineStart: 8 }}><StatusPill tone="info">{t('exm.kind.supplementary')}</StatusPill></span>}
                  </TableCell>
                  <TableCell>{s.term}</TableCell>
                  <TableCell>{fmt.date(s.startsOn)} – {fmt.date(s.endsOn)}</TableCell>
                  <TableCell>
                    <StatusPill tone={sessionTone(s.status) === 'success' ? 'success' : sessionTone(s.status) === 'warning' ? 'warning' : 'neutral'}>{t(`exm.st.${s.status}`)}</StatusPill>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableFrame>
      )}
    </>
  );
}
