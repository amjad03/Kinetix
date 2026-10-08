'use client';

import DownloadOutlined from '@mui/icons-material/DownloadOutlined';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { DataTable, FormField, TextInput } from '@/components/ui';
import { addAction, computeAttainment, setActionStatus } from '@/app/(dashboard)/obe/actions';
import { useRun } from '@/components/exams/useRun';
import { EmptyState } from '@/components/States';
import { Card } from '@/components/ui/Card';
import { DonutChart, HeatCell, HeatLegend, SERIES, StackedBars, type HeatLevel } from '@/components/ui/Charts';
import { StatusPill, type Tone } from '@/components/ui/Badge';
import { StatGrid, StatTile } from '@/components/ui/StatTile';
import { useI18n } from '@/i18n/client';
import { exportHref } from '@/lib/exams';
import { fmtLevel, levelTone, strengthMap, type Attainment, type AttainmentRow, type ImprovementAction, type MatrixData } from '@/lib/obe';
import TrackChangesOutlined from '@mui/icons-material/TrackChangesOutlined';

const COLOR = { met: 'var(--kx-success)', near: 'var(--kx-warning)', short: 'var(--kx-danger)', none: 'var(--kx-line)' } as const;
const PILL: Record<'met' | 'near' | 'short' | 'none', Tone> = { met: 'success', near: 'warning', short: 'danger', none: 'neutral' };
const ARROW = { up: '▲', down: '▼', flat: '●', new: '' } as const;

/**
 * OBE attainment: a ring per programme outcome, the CO to PO mapping as heat cells, and direct
 * against indirect attainment per course outcome (levels are on a 0 to top-level scale, shown as a share of it).
 */
export function ObeDashboard({
  programs,
  years,
  subjects,
  programId,
  yearId,
  subjectId,
  attainment,
  matrix,
  actions,
  canManage,
}: {
  programs: { id: string; name: string }[];
  years: { id: string; label: string }[];
  subjects: { id: string; code: string; name: string }[];
  programId: string;
  yearId: string;
  subjectId: string;
  attainment: Attainment | null;
  matrix: MatrixData | null;
  actions: ImprovementAction[];
  canManage: boolean;
}) {
  const { t, fmt } = useI18n();
  const router = useRouter();
  const { pending, run, feedback } = useRun();
  const [draft, setDraft] = useState({ targetId: '', title: '', dueOn: '' });
  const go = (p: string, y: string, s = '') => router.push(`/obe?programId=${p}&academicYearId=${y}${s ? `&subjectId=${s}` : ''}`);
  const all = [...(attainment?.cos ?? []), ...(attainment?.pos ?? [])];
  const base = `/v1/obe/programs/${programId}/report`;
  const max = attainment?.config.maxLevel || 3;
  const share = (v: number | null) => (v === null ? null : Math.round((v / max) * 1000) / 10);
  const dw = attainment ? attainment.config.directWeight / (attainment.config.directWeight + attainment.config.indirectWeight || 1) : 0.8;

  const table = (rows: AttainmentRow[], title: string, id: string) => (
    <Card title={title} padded={false}>
      <Box data-testid={id} sx={{ overflowX: 'auto' }}>
        <DataTable
          label={title}
          rows={rows}
          rowId={(r) => r.targetId}
          columns={[
            { id: 'c0', header: t('obe.f.outcome'), rowHeader: true, sort: (r) => r.code, cell: (r) => r.code },
            { id: 'c1', header: t('obe.direct'), align: 'right', sort: (r) => r.direct, cell: (r) => fmtLevel(r.direct) },
            { id: 'c2', header: t('obe.indirect'), align: 'right', sort: (r) => r.indirect, cell: (r) => fmtLevel(r.indirect) },
            { id: 'c3', header: t('obe.level'), align: 'right', sort: (r) => r.combined, cell: (r) => (<><StatusPill tone={PILL[levelTone(r)]}>{fmtLevel(r.combined)}</StatusPill></>) },
            { id: 'c4', header: t('obe.target'), align: 'right', sort: (r) => r.target, cell: (r) => r.target },
            { id: 'c5', header: t('obe.gap'), align: 'right', sort: (r) => r.gap, cell: (r) => r.gap === null ? '—' : r.gap },
            { id: 'c6', header: t('obe.trend'), sort: (r) => r.trend, cell: (r) => ARROW[r.trend] },
          ]}
        />
      </Box>
    </Card>
  );

  const strength = matrix ? strengthMap(matrix.cells) : null;
  return (
    <>
      <Card padded sx={{ mb: 2.5 }}>
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
          <FormField label={t('exm.f.program')}>
            <TextInput select value={programId} onChange={(e) => go(e.target.value, yearId)} sx={{ minWidth: 200, width: { xs: '100%', sm: 'auto' } }}>
              {programs.map((p) => (
                <MenuItem key={p.id} value={p.id}>
                  {p.name}
                </MenuItem>
              ))}
            </TextInput>
          </FormField>
          <FormField label={t('exm.f.year')}>
            <TextInput select value={yearId} onChange={(e) => go(programId, e.target.value, subjectId)} sx={{ minWidth: 140, width: { xs: '100%', sm: 'auto' } }}>
              {years.map((y) => (
                <MenuItem key={y.id} value={y.id}>
                  {y.label}
                </MenuItem>
              ))}
            </TextInput>
          </FormField>
          <Box sx={{ flex: 1 }} />
          <Button startIcon={<DownloadOutlined />} href={exportHref(`${base}.csv?academicYearId=${yearId}`)} download size="small">CSV</Button>
          <Button startIcon={<DownloadOutlined />} href={exportHref(`${base}.pdf?academicYearId=${yearId}&framework=nba`)} size="small">{t('obe.pdfNba')}</Button>
          <Button startIcon={<DownloadOutlined />} href={exportHref(`${base}.pdf?academicYearId=${yearId}&framework=naac`)} size="small">{t('obe.pdfNaac')}</Button>
          {canManage && (
            <Button variant="contained" disabled={pending || !programId || !yearId} onClick={() => run(() => computeAttainment(programId, yearId), t('obe.computed'))}>
              {t('obe.compute')}
            </Button>
          )}
        </Box>
      </Card>
      {feedback}
      {!attainment || attainment.computedAt === null ? (
        <EmptyState icon={<TrackChangesOutlined />} title={t('obe.notComputed')} />
      ) : (
        <>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            {t('obe.computedAt', { when: fmt.dateTime(attainment.computedAt) })}
          </Typography>
          <StatGrid min={170}>
            <StatTile label={t('obe.cosMet')} value={`${attainment.summary.cosMet}/${attainment.summary.cos}`} testId="obe-cos" />
            <StatTile label={t('obe.posMet')} value={`${attainment.summary.posMet}/${attainment.summary.pos}`} testId="obe-pos" />
            <StatTile label={t('obe.target')} value={attainment.config.targetLevel} caption={t('obe.scale', { n: attainment.config.maxLevel })} />
            <StatTile label={t('obe.gaps')} value={attainment.summary.gaps.length} tone={attainment.summary.gaps.length ? 'warning' : 'default'} caption={attainment.summary.gaps[0]?.code} />
          </StatGrid>

          <Card title={t('obe.poTitle')} subtitle={t('obe.ringsSub', { n: attainment.config.targetLevel, max })} sx={{ mt: 2.5 }} testId="obe-rings">
            <Box sx={{ display: 'grid', gap: 3, gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', justifyItems: 'center' }}>
              {attainment.pos.map((r) => (
                <DonutChart key={r.targetId} value={share(r.combined)} color={COLOR[levelTone(r)]} label={r.code} caption={<b>{r.code}</b>} />
              ))}
            </Box>
          </Card>

          <Box sx={{ display: 'grid', gap: 2.5, mt: 2.5, gridTemplateColumns: { xs: 'minmax(0,1fr)', lg: 'repeat(2, minmax(0,1fr))' }, alignItems: 'start' }}>
            <Card
              title={t('obe.matrixTitle')}
              testId="obe-matrix"
              action={
                subjects.length > 1 ? (
                  <TextField select size="small" value={subjectId} onChange={(e) => go(programId, yearId, e.target.value)} aria-label={t('obe.f.subject')} sx={{ minWidth: 160 }}>
                    {subjects.map((s) => (
                      <MenuItem key={s.id} value={s.id}>
                        {s.code}
                      </MenuItem>
                    ))}
                  </TextField>
                ) : undefined
              }
            >
              {!matrix || matrix.cos.length === 0 || !strength ? (
                <EmptyState dense icon={<TrackChangesOutlined />} title={t('obe.noVersion')} />
              ) : (
                <>
                  <Box sx={{ overflowX: 'auto' }}>
                    <Table size="small" aria-label={t('obe.matrixTitle')} sx={{ '& td, & th': { px: 0.75, py: 0.75, textAlign: 'center', borderBottom: 0 } }}>
                      <TableHead>
                        <TableRow>
                          <TableCell sx={{ textAlign: 'left !important' }}>{t('obe.coCol')}</TableCell>
                          {matrix.outcomes.map((o) => (
                            <TableCell key={o.id}>{o.code}</TableCell>
                          ))}
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {matrix.cos.map((c) => (
                          <TableRow key={c.id}>
                            <TableCell component="th" scope="row" sx={{ textAlign: 'left !important', fontWeight: 600 }}>
                              {c.code}
                            </TableCell>
                            {matrix.outcomes.map((o) => {
                              const s = Math.min(3, Math.max(0, strength(c.id, o.id))) as HeatLevel;
                              return (
                                <TableCell key={o.id}>
                                  <HeatCell level={s} />
                                </TableCell>
                              );
                            })}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </Box>
                  <Box sx={{ mt: 1.5 }}>
                    <HeatLegend labels={[t('obe.heat.3'), t('obe.heat.2'), t('obe.heat.1'), t('obe.heat.0')]} />
                  </Box>
                </>
              )}
            </Card>
            <Card title={t('obe.barsTitle')} testId="obe-bars">
              <StackedBars
                ariaLabel={t('obe.barsTitle')}
                parts={[
                  { label: t('obe.direct'), color: SERIES[0] },
                  { label: t('obe.indirect'), color: SERIES[2] },
                ]}
                rows={attainment.cos.map((r) => ({
                  label: r.code,
                  values: [share(r.direct === null ? null : r.direct * dw), share(r.indirect === null ? null : r.indirect * (1 - dw))],
                  total: share(r.combined),
                }))}
              />
            </Card>
          </Box>

          <Box sx={{ display: 'grid', gap: 2.5, mt: 2.5 }}>
            {table(attainment.cos, t('obe.coTitle'), 'obe-co-table')}
            {table(attainment.pos, t('obe.poTitle'), 'obe-po-table')}
          </Box>
        </>
      )}

      <Card title={t('obe.actionsTitle')} sx={{ mt: 2.5 }}>
        {actions.length === 0 && <Typography variant="body2" color="text.secondary">{t('obe.noActions')}</Typography>}
        {actions.map((a) => (
          <Box key={a.id} sx={{ py: 1, display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap', borderBottom: 1, borderColor: 'm3.outlineVariant' }}>
            <Typography sx={{ flex: 1, minWidth: 200 }}>{a.title}</Typography>
            {a.dueOn && <Typography variant="body2" color="text.secondary">{fmt.date(a.dueOn, 'short')}</Typography>}
            <TextField select size="small" value={a.status} disabled={!canManage || pending} onChange={(e) => run(() => setActionStatus(a.id, e.target.value as 'open'), t('obe.actionUpdated'))} sx={{ width: 160 }}>
              {(['open', 'in_progress', 'done'] as const).map((s) => (
                <MenuItem key={s} value={s}>
                  {t(`obe.as.${s}`)}
                </MenuItem>
              ))}
            </TextField>
          </Box>
        ))}
        {canManage && all.length > 0 && (
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 2 }}>
            <FormField label={t('obe.f.target')}>
              <TextInput select value={draft.targetId} onChange={(e) => setDraft({ ...draft, targetId: e.target.value })} sx={{ minWidth: 200 }}>
                {all.filter((r) => !r.met).map((r) => (
                  <MenuItem key={r.targetId} value={r.targetId}>
                    {r.code}
                  </MenuItem>
                ))}
              </TextInput>
            </FormField>
            <FormField label={t('obe.f.action')}>
              <TextInput value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} sx={{ flex: 1, minWidth: 220 }} />
            </FormField>
            <FormField label={t('obe.f.due')}>
              <TextInput type="date" value={draft.dueOn} onChange={(e) => setDraft({ ...draft, dueOn: e.target.value })} slotProps={{ inputLabel: { shrink: true } }} sx={{ width: 170 }} />
            </FormField>
            <Button
              variant="outlined"
              disabled={pending || !draft.targetId}
              onClick={() => run(() => addAction(programId, { scope: all.find((r) => r.targetId === draft.targetId)!.scope, ...draft }), t('obe.actionAdded'), () => setDraft({ targetId: '', title: '', dueOn: '' }))}
            >
              {t('obe.addAction')}
            </Button>
          </Box>
        )}
      </Card>
    </>
  );
}
