'use client';

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import Chip from '@mui/material/Chip';
import MenuItem from '@mui/material/MenuItem';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { addAction, computeAttainment, setActionStatus } from '@/app/(dashboard)/obe/actions';
import { TableFrame } from '@/components/DataTable';
import { useRun } from '@/components/exams/useRun';
import { StatGrid, StatTile } from '@/components/StatTile';
import { useI18n } from '@/i18n/client';
import { exportHref } from '@/lib/exams';
import { fmtLevel, levelTone, type Attainment, type AttainmentRow, type ImprovementAction } from '@/lib/obe';

const TONE = { met: 'success', near: 'warning', short: 'error', none: 'default' } as const;
const ARROW = { up: '▲', down: '▼', flat: '●', new: '' } as const;

export function ObeDashboard({ programs, years, programId, yearId, attainment, actions, canManage }: { programs: { id: string; name: string }[]; years: { id: string; label: string }[]; programId: string; yearId: string; attainment: Attainment | null; actions: ImprovementAction[]; canManage: boolean }) {
  const { t, fmt } = useI18n();
  const router = useRouter();
  const { pending, run, feedback } = useRun();
  const [draft, setDraft] = useState({ targetId: '', title: '', dueOn: '' });
  const go = (p: string, y: string) => router.push(`/obe?programId=${p}&academicYearId=${y}`);
  const all = [...(attainment?.cos ?? []), ...(attainment?.pos ?? [])];
  const base = `/v1/obe/programs/${programId}/report`;
  const table = (rows: AttainmentRow[], title: string, id: string) => (
    <>
      <Typography variant="h6" component="h2" sx={{ mt: 3, mb: 1 }}>
        {title}
      </Typography>
      <TableFrame testId={id}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>{t('obe.f.outcome')}</TableCell>
              <TableCell align="right">{t('obe.direct')}</TableCell>
              <TableCell align="right">{t('obe.indirect')}</TableCell>
              <TableCell align="right">{t('obe.level')}</TableCell>
              <TableCell align="right">{t('obe.target')}</TableCell>
              <TableCell align="right">{t('obe.gap')}</TableCell>
              <TableCell>{t('obe.trend')}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.targetId}>
                <TableCell>{r.code}</TableCell>
                <TableCell align="right">{fmtLevel(r.direct)}</TableCell>
                <TableCell align="right">{fmtLevel(r.indirect)}</TableCell>
                <TableCell align="right">
                  <Chip size="small" color={TONE[levelTone(r)]} label={fmtLevel(r.combined)} />
                </TableCell>
                <TableCell align="right">{r.target}</TableCell>
                <TableCell align="right">{r.gap === null ? '—' : r.gap}</TableCell>
                <TableCell>{ARROW[r.trend]}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableFrame>
    </>
  );
  return (
    <>
      <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mb: 2, alignItems: 'center' }}>
        <TextField select size="small" label={t('exm.f.program')} value={programId} onChange={(e) => go(e.target.value, yearId)} sx={{ minWidth: 200 }}>
          {programs.map((p) => (
            <MenuItem key={p.id} value={p.id}>
              {p.name}
            </MenuItem>
          ))}
        </TextField>
        <TextField select size="small" label={t('exm.f.year')} value={yearId} onChange={(e) => go(programId, e.target.value)} sx={{ minWidth: 140 }}>
          {years.map((y) => (
            <MenuItem key={y.id} value={y.id}>
              {y.label}
            </MenuItem>
          ))}
        </TextField>
        {canManage && (
          <Button variant="contained" disabled={pending || !programId || !yearId} onClick={() => run(() => computeAttainment(programId, yearId), t('obe.computed'))}>
            {t('obe.compute')}
          </Button>
        )}
        <Button href={exportHref(`${base}.csv?academicYearId=${yearId}`)} download>CSV</Button>
        <Button href={exportHref(`${base}.pdf?academicYearId=${yearId}&framework=nba`)}>{t('obe.pdfNba')}</Button>
        <Button href={exportHref(`${base}.pdf?academicYearId=${yearId}&framework=naac`)}>{t('obe.pdfNaac')}</Button>
      </Box>
      {feedback}
      {!attainment || attainment.computedAt === null ? (
        <Typography color="text.secondary">{t('obe.notComputed')}</Typography>
      ) : (
        <>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            {t('obe.computedAt', { when: fmt.dateTime(attainment.computedAt) })}
          </Typography>
          <StatGrid min={150}>
            <StatTile label={t('obe.cosMet')} value={`${attainment.summary.cosMet}/${attainment.summary.cos}`} testId="obe-cos" />
            <StatTile label={t('obe.posMet')} value={`${attainment.summary.posMet}/${attainment.summary.pos}`} testId="obe-pos" />
            <StatTile label={t('obe.target')} value={attainment.config.targetLevel} caption={t('obe.scale', { n: attainment.config.maxLevel })} />
            <StatTile label={t('obe.gaps')} value={attainment.summary.gaps.length} tone={attainment.summary.gaps.length ? 'warning' : 'default'} caption={attainment.summary.gaps[0]?.code} />
          </StatGrid>
          {table(attainment.cos, t('obe.coTitle'), 'obe-co-table')}
          {table(attainment.pos, t('obe.poTitle'), 'obe-po-table')}
        </>
      )}
      <Typography variant="h6" component="h2" sx={{ mt: 3, mb: 1 }}>
        {t('obe.actionsTitle')}
      </Typography>
      {actions.map((a) => (
        <Card key={a.id} sx={{ p: 1.5, mb: 1, display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
          <Typography sx={{ flex: 1 }}>{a.title}</Typography>
          {a.dueOn && <Typography variant="body2" color="text.secondary">{fmt.date(a.dueOn, 'short')}</Typography>}
          <TextField select size="small" value={a.status} disabled={!canManage || pending} onChange={(e) => run(() => setActionStatus(a.id, e.target.value as 'open'), t('obe.actionUpdated'))}>
            {(['open', 'in_progress', 'done'] as const).map((s) => (
              <MenuItem key={s} value={s}>
                {t(`obe.as.${s}`)}
              </MenuItem>
            ))}
          </TextField>
        </Card>
      ))}
      {canManage && all.length > 0 && (
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 1 }}>
          <TextField select size="small" label={t('obe.f.target')} value={draft.targetId} onChange={(e) => setDraft({ ...draft, targetId: e.target.value })} sx={{ minWidth: 200 }}>
            {all.filter((r) => !r.met).map((r) => (
              <MenuItem key={r.targetId} value={r.targetId}>
                {r.code}
              </MenuItem>
            ))}
          </TextField>
          <TextField size="small" label={t('obe.f.action')} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} sx={{ flex: 1, minWidth: 220 }} />
          <TextField size="small" type="date" label={t('obe.f.due')} value={draft.dueOn} onChange={(e) => setDraft({ ...draft, dueOn: e.target.value })} slotProps={{ inputLabel: { shrink: true } }} />
          <Button
            variant="outlined"
            disabled={pending || !draft.targetId}
            onClick={() => run(() => addAction(programId, { scope: all.find((r) => r.targetId === draft.targetId)!.scope, ...draft }), t('obe.actionAdded'), () => setDraft({ targetId: '', title: '', dueOn: '' }))}
          >
            {t('obe.addAction')}
          </Button>
        </Box>
      )}
    </>
  );
}
