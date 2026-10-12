'use client';
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

import { Button, MenuItem, Table, TableBody, TableCell, TableHead, TableRow, TextField } from '@/components/kx';
import { Download as DownloadOutlined, Target as TrackChangesOutlined } from 'lucide-react';
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
      <div className="overflow-x-auto" data-testid={id}>
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
      </div>
    </Card>
  );

  const strength = matrix ? strengthMap(matrix.cells) : null;
  return (
    <>
      <Card className="mb-5" padded>
        <div className="flex gap-4 flex-wrap items-center">
          <FormField label={t('exm.f.program')}>
            <TextInput className="min-w-[200px] w-full sm:w-auto" select value={programId} onChange={(e) => go(e.target.value, yearId)}>
              {programs.map((p) => (
                <MenuItem key={p.id} value={p.id}>
                  {p.name}
                </MenuItem>
              ))}
            </TextInput>
          </FormField>
          <FormField label={t('exm.f.year')}>
            <TextInput className="min-w-[140px] w-full sm:w-auto" select value={yearId} onChange={(e) => go(programId, e.target.value, subjectId)}>
              {years.map((y) => (
                <MenuItem key={y.id} value={y.id}>
                  {y.label}
                </MenuItem>
              ))}
            </TextInput>
          </FormField>
          <div className="flex-1" />
          <Button startIcon={<DownloadOutlined />} href={exportHref(`${base}.csv?academicYearId=${yearId}`)} download size="small">CSV</Button>
          <Button startIcon={<DownloadOutlined />} href={exportHref(`${base}.pdf?academicYearId=${yearId}&framework=nba`)} size="small">{t('obe.pdfNba')}</Button>
          <Button startIcon={<DownloadOutlined />} href={exportHref(`${base}.pdf?academicYearId=${yearId}&framework=naac`)} size="small">{t('obe.pdfNaac')}</Button>
          {canManage && (
            <Button variant="contained" disabled={pending || !programId || !yearId} onClick={() => run(() => computeAttainment(programId, yearId), t('obe.computed'))}>
              {t('obe.compute')}
            </Button>
          )}
        </div>
      </Card>
      {feedback}
      {!attainment || attainment.computedAt === null ? (
        <EmptyState icon={<TrackChangesOutlined />} title={t('obe.notComputed')} />
      ) : (
        <>
          <p className="text-[13px] leading-[19px] text-muted-foreground mb-3">
            {t('obe.computedAt', { when: fmt.dateTime(attainment.computedAt) })}
          </p>
          <StatGrid min={170}>
            <StatTile label={t('obe.cosMet')} value={`${attainment.summary.cosMet}/${attainment.summary.cos}`} testId="obe-cos" />
            <StatTile label={t('obe.posMet')} value={`${attainment.summary.posMet}/${attainment.summary.pos}`} testId="obe-pos" />
            <StatTile label={t('obe.target')} value={attainment.config.targetLevel} caption={t('obe.scale', { n: attainment.config.maxLevel })} />
            <StatTile label={t('obe.gaps')} value={attainment.summary.gaps.length} tone={attainment.summary.gaps.length ? 'warning' : 'default'} caption={attainment.summary.gaps[0]?.code} />
          </StatGrid>

          <Card className="mt-5" title={t('obe.poTitle')} subtitle={t('obe.ringsSub', { n: attainment.config.targetLevel, max })} testId="obe-rings">
            <div className="grid gap-6 grid-cols-[repeat(auto-fill,minmax(150px,1fr))] justify-items-center">
              {attainment.pos.map((r) => (
                <DonutChart key={r.targetId} value={share(r.combined)} color={COLOR[levelTone(r)]} label={r.code} caption={<b>{r.code}</b>} />
              ))}
            </div>
          </Card>

          <div className="grid gap-5 mt-5 grid-cols-[minmax(0,1fr)] lg:grid-cols-[repeat(2,minmax(0,1fr))] items-start">
            <Card
              title={t('obe.matrixTitle')}
              testId="obe-matrix"
              action={
                subjects.length > 1 ? (
                  <TextField className="min-w-[160px]" select size="small" value={subjectId} onChange={(e) => go(programId, yearId, e.target.value)} aria-label={t('obe.f.subject')}>
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
                  <div className="overflow-x-auto">
                    <Table className="[&_:is(td,th)]:px-1.5 [&_:is(td,th)]:py-1.5 [&_:is(td,th)]:text-center [&_:is(td,th)]:border-b-0" size="small" aria-label={t('obe.matrixTitle')}>
                      <TableHead>
                        <TableRow>
                          <TableCell className="[text-align:left_!important]">{t('obe.coCol')}</TableCell>
                          {matrix.outcomes.map((o) => (
                            <TableCell key={o.id}>{o.code}</TableCell>
                          ))}
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {matrix.cos.map((c) => (
                          <TableRow key={c.id}>
                            <TableCell className="[text-align:left_!important] font-semibold" component="th" scope="row">
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
                  </div>
                  <div className="mt-3">
                    <HeatLegend labels={[t('obe.heat.3'), t('obe.heat.2'), t('obe.heat.1'), t('obe.heat.0')]} />
                  </div>
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
          </div>

          <div className="grid gap-5 mt-5">
            {table(attainment.cos, t('obe.coTitle'), 'obe-co-table')}
            {table(attainment.pos, t('obe.poTitle'), 'obe-po-table')}
          </div>
        </>
      )}

      <Card className="mt-5" title={t('obe.actionsTitle')}>
        {actions.length === 0 && <p className="text-[13px] leading-[19px] text-muted-foreground">{t('obe.noActions')}</p>}
        {actions.map((a) => (
          <div className="py-2 flex gap-3 items-center flex-wrap border-b border-border" key={a.id}>
            <p className="text-sm leading-[21px] flex-1 min-w-[200px]">{a.title}</p>
            {a.dueOn && <p className="text-[13px] leading-[19px] text-muted-foreground">{fmt.date(a.dueOn, 'short')}</p>}
            <TextField className="w-[160px]" select size="small" value={a.status} disabled={!canManage || pending} onChange={(e) => run(() => setActionStatus(a.id, e.target.value as 'open'), t('obe.actionUpdated'))}>
              {(['open', 'in_progress', 'done'] as const).map((s) => (
                <MenuItem key={s} value={s}>
                  {t(`obe.as.${s}`)}
                </MenuItem>
              ))}
            </TextField>
          </div>
        ))}
        {canManage && all.length > 0 && (
          <div className="flex gap-2 flex-wrap mt-4">
            <FormField label={t('obe.f.target')}>
              <TextInput className="min-w-[200px]" select value={draft.targetId} onChange={(e) => setDraft({ ...draft, targetId: e.target.value })}>
                {all.filter((r) => !r.met).map((r) => (
                  <MenuItem key={r.targetId} value={r.targetId}>
                    {r.code}
                  </MenuItem>
                ))}
              </TextInput>
            </FormField>
            <FormField label={t('obe.f.action')}>
              <TextInput className="flex-1 min-w-[220px]" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
            </FormField>
            <FormField label={t('obe.f.due')}>
              <TextInput className="w-[170px]" type="date" value={draft.dueOn} onChange={(e) => setDraft({ ...draft, dueOn: e.target.value })} slotProps={{ inputLabel: { shrink: true } }} />
            </FormField>
            <Button
              variant="outlined"
              disabled={pending || !draft.targetId}
              onClick={() => run(() => addAction(programId, { scope: all.find((r) => r.targetId === draft.targetId)!.scope, ...draft }), t('obe.actionAdded'), () => setDraft({ targetId: '', title: '', dueOn: '' }))}
            >
              {t('obe.addAction')}
            </Button>
          </div>
        )}
      </Card>
    </>
  );
}
