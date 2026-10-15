'use client';

import { CheckCircle2, CircleDashed, Copy, Save, Send, Target } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { actionsFromGaps, copyTargets, publishStatements, savePeoMission, saveTargets } from '@/app/(dashboard)/obe/actions';
import { useRun } from '@/components/exams/useRun';
import { Button } from '@/components/shadcn/button';
import { Card, DataTable, EmptyState, FormField, FormRow, LineChart, LinkTabs, StatusPill, TextInput, type Column } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import type { ObeReadiness, PeoMission, StudentWise, TargetRow, Targets, Trend, Versions } from '@/lib/obe';

import { MenuItem } from '@/components/kx';

const TABS = ['home', 'courses', 'approvals', 'attainment', 'trends', 'peo', 'targets', 'students', 'actions', 'gaps', 'surveys', 'reports', 'setup'] as const;
export type ObeTab = (typeof TABS)[number];
const TAB_LABEL: Record<ObeTab, MessageKey> = { home: 'of.tab.home', courses: 'of.tab.courses', approvals: 'of.tab.approvals', attainment: 'obe2.tab.dashboard', trends: 'of.tab.trends', peo: 'obe2.tab.peo', targets: 'obe2.tab.targets', students: 'obe2.tab.students', actions: 'obe2.tab.actions', gaps: 'of.tab.gaps', surveys: 'of.tab.surveys', reports: 'of.tab.reports', setup: 'obe.setup' };

/** The OBE pages: the role dashboard, courses, approvals, attainment, trends, statements, targets, students, actions, gaps, surveys, reports and set-up. */
export function ObeTabs({ value }: { value: ObeTab | 'dashboard' }) {
  const { t } = useI18n();
  const items = TABS.map((v) => ({ value: v, label: t(TAB_LABEL[v]), href: v === 'home' ? '/obe' : `/obe/${v}` }));
  return <LinkTabs value={value === 'dashboard' ? 'attainment' : value} label={t('nav.obe')} items={items} />;
}

/** Programme and year pickers that keep the page's other parameters. */
export function ProgramYearBar({ base, programs, programId, years, yearId, subjects, subjectId, extra }: { base: string; programs: { id: string; name: string }[]; programId: string; years?: { id: string; label: string }[]; yearId?: string; subjects?: { id: string; code: string; name: string }[]; subjectId?: string; extra?: React.ReactNode }) {
  const { t } = useI18n();
  const router = useRouter();
  const go = (p: Record<string, string>) => router.push(`${base}?${new URLSearchParams({ programId, ...(yearId ? { academicYearId: yearId } : {}), ...(subjectId ? { subjectId } : {}), ...p })}`);
  return (
    <FormRow className="mb-4">
      <FormField label={t('obe2.f.programme')}>
        <TextInput className="min-w-[220px]" select value={programId} onChange={(e) => router.push(`${base}?programId=${e.target.value}${yearId ? `&academicYearId=${yearId}` : ''}`)} data-testid="obe2-programme">
          {programs.map((p) => (
            <MenuItem key={p.id} value={p.id}>
              {p.name}
            </MenuItem>
          ))}
        </TextInput>
      </FormField>
      {years && (
        <FormField label={t('obe2.f.year')}>
          <TextInput className="min-w-[140px]" select value={yearId ?? ''} onChange={(e) => go({ academicYearId: e.target.value })}>
            {years.map((y) => (
              <MenuItem key={y.id} value={y.id}>
                {y.label}
              </MenuItem>
            ))}
          </TextInput>
        </FormField>
      )}
      {subjects && (
        <FormField label={t('obe2.f.subject')}>
          <TextInput className="min-w-[240px]" select value={subjectId ?? ''} onChange={(e) => go({ subjectId: e.target.value })}>
            {subjects.map((s) => (
              <MenuItem key={s.id} value={s.id}>
                {s.code} {s.name}
              </MenuItem>
            ))}
          </TextInput>
        </FormField>
      )}
      {extra}
    </FormRow>
  );
}

const STRENGTH = [0, 1, 2, 3];

/** The PEO-mission consistency matrix with a justification per mapping, and the published versions of the statements. */
export function PeoMissionEditor({ programId, data, versions, canEdit }: { programId: string; data: PeoMission; versions: Versions; canEdit: boolean }) {
  const { t, fmt } = useI18n();
  const { pending, run, feedback } = useRun();
  const [cells, setCells] = useState(data.cells);
  const [pub, setPub] = useState({ effectiveFrom: '', note: '' });
  const get = (p: string, m: string) => cells.find((c) => c.peoId === p && c.missionId === m);
  const set = (p: string, m: string, patch: Partial<{ strength: number; justification: string }>) => {
    const cur = get(p, m) ?? { peoId: p, missionId: m, strength: 0, justification: '' };
    const next = { ...cur, ...patch };
    setCells([...cells.filter((c) => c !== get(p, m)), next].filter((c) => c.strength > 0 || c.justification));
  };
  const changes = versions.changedSinceLatest;
  const changeCount = changes ? changes.added.length + changes.removed.length + changes.changed.length : null;
  return (
    <div className="flex flex-col gap-6">
      {feedback}
      <Card>
        <h2 className="m-0 mb-1 text-base font-semibold">{t('obe2.peo.title')}</h2>
        <p className="m-0 mb-4 text-[13px] text-muted-foreground">{t('obe2.peo.help')}</p>
        {data.peos.length === 0 || data.missions.length === 0 ? (
          <EmptyState icon={<Target />} title={t('obe2.peo.none')}>
            {t('obe2.peo.noneBody')}
          </EmptyState>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-[13px]" data-testid="peo-mission">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">{t('obe2.peo.peo')}</th>
                    {data.missions.map((m) => (
                      <th key={m.id} className="py-2 pr-3 text-center font-medium" title={m.statement}>
                        {m.code}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.peos.map((p) => (
                    <tr key={p.id} className="border-b align-top last:border-0">
                      <th scope="row" className="py-2 pr-3 text-left font-normal">
                        <b className="font-semibold">{p.code}</b> {p.statement}
                      </th>
                      {data.missions.map((m) => (
                        <td key={m.id} className="py-2 pr-3 text-center">
                          <TextInput size="small" select value={String(get(p.id, m.id)?.strength ?? 0)} disabled={!canEdit} onChange={(e) => set(p.id, m.id, { strength: Number(e.target.value) })} inputProps={{ 'aria-label': t('obe2.peo.cell', { peo: p.code, mission: m.code }) }}>
                            {STRENGTH.map((s) => (
                              <MenuItem key={s} value={String(s)}>
                                {s === 0 ? '-' : s}
                              </MenuItem>
                            ))}
                          </TextInput>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {cells.filter((c) => c.strength > 0).length > 0 && (
              <div className="mt-4 grid gap-2">
                {cells
                  .filter((c) => c.strength > 0)
                  .map((c) => (
                    <div key={`${c.peoId}:${c.missionId}`} className="grid items-center gap-2 sm:grid-cols-[180px_1fr]">
                      <span className="text-[13px] font-medium">
                        {data.peos.find((x) => x.id === c.peoId)?.code} → {data.missions.find((x) => x.id === c.missionId)?.code} ({c.strength})
                      </span>
                      <TextInput size="small" value={c.justification} disabled={!canEdit} placeholder={t('obe2.justify.placeholder')} inputProps={{ maxLength: 500, 'aria-label': t('obe2.justify.label', { co: data.peos.find((x) => x.id === c.peoId)?.code ?? '', po: data.missions.find((x) => x.id === c.missionId)?.code ?? '' }) }} onChange={(e) => set(c.peoId, c.missionId, { justification: e.target.value })} />
                    </div>
                  ))}
              </div>
            )}
            {canEdit && (
              <div className="mt-4">
                <Button disabled={pending} onClick={() => run(() => savePeoMission(programId, cells.filter((c) => c.strength > 0)), t('obe2.saved'))} data-testid="peo-save">
                  <Save className="size-4" aria-hidden />
                  {t('obe2.peo.save')}
                </Button>
              </div>
            )}
          </>
        )}
      </Card>

      <Card>
        <h2 className="m-0 mb-1 text-base font-semibold">{t('obe2.ver.title')}</h2>
        <p className="m-0 mb-4 text-[13px] text-muted-foreground">{changeCount === null ? t('obe2.ver.never') : changeCount === 0 ? t('obe2.ver.same') : t('obe2.ver.changed', { n: changeCount })}</p>
        {changes && changeCount ? (
          <ul className="m-0 mb-4 list-none p-0 text-[13px]" data-testid="ver-changes">
            {changes.added.map((x) => (
              <li key={`a${x.kind}${x.code}`} className="mb-1">
                <StatusPill tone="success">{t('obe2.ver.added')}</StatusPill> {x.code}: {x.statement}
              </li>
            ))}
            {changes.changed.map((x) => (
              <li key={`c${x.kind}${x.code}`} className="mb-1">
                <StatusPill tone="warning">{t('obe2.ver.edited')}</StatusPill> {x.code}: <s className="text-muted-foreground">{x.before}</s> {x.statement}
              </li>
            ))}
            {changes.removed.map((x) => (
              <li key={`r${x.kind}${x.code}`} className="mb-1">
                <StatusPill tone="danger">{t('obe2.ver.removed')}</StatusPill> {x.code}: {x.statement}
              </li>
            ))}
          </ul>
        ) : null}
        {canEdit && (
          <FormRow className="mb-4">
            <FormField label={t('obe2.ver.from')}>
              <TextInput className="w-[140px]" placeholder="2026-27" value={pub.effectiveFrom} onChange={(e) => setPub({ ...pub, effectiveFrom: e.target.value })} />
            </FormField>
            <FormField label={t('obe2.ver.note')}>
              <TextInput className="min-w-[260px]" value={pub.note} onChange={(e) => setPub({ ...pub, note: e.target.value })} />
            </FormField>
            <Button disabled={pending || !/^\d{4}-\d{2}$/.test(pub.effectiveFrom) || changeCount === 0} onClick={() => run(() => publishStatements(programId, pub), t('obe2.ver.published'), () => setPub({ effectiveFrom: '', note: '' }))} data-testid="ver-publish">
              <Send className="size-4" aria-hidden />
              {t('obe2.ver.publish')}
            </Button>
          </FormRow>
        )}
        {versions.versions.length === 0 ? (
          <p className="m-0 text-[13px] text-muted-foreground">{t('obe2.ver.none')}</p>
        ) : (
          <DataTable
            label={t('obe2.ver.title')}
            rows={versions.versions}
            rowId={(v) => v.id}
            bare
            columns={[
              { id: 'v', header: t('obe2.ver.version'), rowHeader: true, cell: (v) => `v${v.version}`, sort: (v) => v.version },
              { id: 'f', header: t('obe2.ver.from'), cell: (v) => v.effectiveFrom, sort: (v) => v.effectiveFrom },
              { id: 'n', header: t('obe2.ver.statements'), align: 'right', cell: (v) => fmt.number(v.statements.length) },
              { id: 'o', header: t('obe2.ver.note'), cell: (v) => v.note ?? '-' },
              { id: 'p', header: t('obe2.ver.publishedOn'), cell: (v) => fmt.date(v.publishedAt.slice(0, 10), 'short') },
            ]}
          />
        )}
      </Card>
    </div>
  );
}

/** This year's target for each CO and PO/PSO, against the programme's default; copy to the next offering. */
export function TargetsEditor({ programId, yearId, years, data, canEdit }: { programId: string; yearId: string; years: { id: string; label: string }[]; data: Targets; canEdit: boolean }) {
  const { t, fmt } = useI18n();
  const { pending, run, feedback } = useRun();
  const [rows, setRows] = useState<TargetRow[]>(data.rows);
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [copyTo, setCopyTo] = useState('');
  const [fill, setFill] = useState({ scope: 'co' as 'co' | 'po', level: '' });
  const fillBlanks = () => {
    const level = Number(fill.level);
    if (fill.level.trim() === '' || Number.isNaN(level) || level < 0 || level > data.maxLevel) return;
    const ids = rows.filter((r) => r.scope === fill.scope && r.targetLevel === null).map((r) => r.targetId);
    setRows(rows.map((r) => (ids.includes(r.targetId) ? { ...r, targetLevel: level } : r)));
    setDirty(new Set([...dirty, ...ids]));
  };
  const edit = (id: string, patch: Partial<TargetRow>) => {
    setRows(rows.map((r) => (r.targetId === id ? { ...r, ...patch } : r)));
    setDirty(new Set(dirty).add(id));
  };
  const num = (v: string) => (v.trim() === '' ? null : Number(v));
  const invalid = rows.some((r) => dirty.has(r.targetId) && ((r.targetLevel !== null && (Number.isNaN(r.targetLevel) || r.targetLevel < 0 || r.targetLevel > data.maxLevel)) || (r.thresholdPercent !== null && (Number.isNaN(r.thresholdPercent) || r.thresholdPercent <= 0 || r.thresholdPercent > 100))));
  return (
    <>
      {feedback}
      <p className="m-0 mb-3 text-[13px] text-muted-foreground">{t('obe2.tg.help', { level: data.defaultLevel, threshold: data.defaultThreshold, max: data.maxLevel })}</p>
      {rows.length === 0 ? (
        <EmptyState icon={<Target />} title={t('obe2.tg.none')}>
          {t('obe2.tg.noneBody')}
        </EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full min-w-[720px] text-[13px]" data-testid="obe-targets">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="px-3 py-2 font-medium">{t('obe2.tg.outcome')}</th>
                <th className="px-3 py-2 font-medium">{t('obe2.tg.level')}</th>
                <th className="px-3 py-2 font-medium">{t('obe2.tg.threshold')}</th>
                <th className="px-3 py-2 font-medium">{t('obe2.tg.rationale')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.targetId} className="border-b align-top last:border-0">
                  <th scope="row" className="px-3 py-2 text-left font-normal">
                    <b className="font-semibold">{r.code}</b>
                    <span className="block max-w-[360px] text-xs text-muted-foreground">{r.statement}</span>
                  </th>
                  <td className="px-3 py-2">
                    <TextInput size="small" className="w-[110px]" type="number" disabled={!canEdit} placeholder={String(data.defaultLevel)} value={r.targetLevel ?? ''} inputProps={{ step: 0.1, min: 0, max: data.maxLevel, 'aria-label': t('obe2.tg.levelFor', { code: r.code }) }} onChange={(e) => edit(r.targetId, { targetLevel: num(e.target.value) })} />
                  </td>
                  <td className="px-3 py-2">
                    {r.scope === 'co' ? <TextInput size="small" className="w-[110px]" type="number" disabled={!canEdit} placeholder={String(data.defaultThreshold)} value={r.thresholdPercent ?? ''} inputProps={{ min: 1, max: 100, 'aria-label': t('obe2.tg.thresholdFor', { code: r.code }) }} onChange={(e) => edit(r.targetId, { thresholdPercent: num(e.target.value) })} /> : <span className="text-muted-foreground">-</span>}
                  </td>
                  <td className="px-3 py-2">
                    <TextInput size="small" fullWidth disabled={!canEdit} value={r.rationale} inputProps={{ maxLength: 500, 'aria-label': t('obe2.tg.rationaleFor', { code: r.code }) }} onChange={(e) => edit(r.targetId, { rationale: e.target.value })} />
                    {r.setBy && <span className="mt-1 block text-xs text-muted-foreground">{t('oa.tg.setBy', { name: r.setBy, date: r.updatedAt ? fmt.date(r.updatedAt.slice(0, 10), 'short') : '' })}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {canEdit && rows.length > 0 && (
        <FormRow className="mt-4" data-testid="targets-fill">
          <FormField label={t('oa.tg.fillScope')}>
            <TextInput className="min-w-[160px]" select value={fill.scope} onChange={(e) => setFill({ ...fill, scope: e.target.value as 'co' | 'po' })}>
              <MenuItem value="co">{t('oa.tg.fillCos')}</MenuItem>
              <MenuItem value="po">{t('oa.tg.fillPos')}</MenuItem>
            </TextInput>
          </FormField>
          <FormField label={t('oa.tg.fillLevel')}>
            <TextInput className="w-[110px]" type="number" value={fill.level} inputProps={{ step: 0.1, min: 0, max: data.maxLevel }} onChange={(e) => setFill({ ...fill, level: e.target.value })} />
          </FormField>
          <Button variant="outline" disabled={fill.level.trim() === ''} onClick={fillBlanks}>
            {t('oa.tg.fill')}
          </Button>
        </FormRow>
      )}
      {canEdit && rows.length > 0 && (
        <FormRow className="mt-4">
          <Button disabled={pending || dirty.size === 0 || invalid} onClick={() => run(() => saveTargets(programId, yearId, rows.filter((r) => dirty.has(r.targetId)).map((r) => ({ targetId: r.targetId, targetLevel: r.targetLevel, thresholdPercent: r.thresholdPercent, rationale: r.rationale }))), t('obe2.saved'), () => setDirty(new Set()))} data-testid="targets-save">
            <Save className="size-4" aria-hidden />
            {t('obe2.tg.save')}
          </Button>
          <FormField label={t('obe2.tg.copyTo')}>
            <TextInput className="min-w-[140px]" select value={copyTo} onChange={(e) => setCopyTo(e.target.value)}>
              {years
                .filter((y) => y.id !== yearId)
                .map((y) => (
                  <MenuItem key={y.id} value={y.id}>
                    {y.label}
                  </MenuItem>
                ))}
            </TextInput>
          </FormField>
          <Button variant="outline" disabled={pending || !copyTo} onClick={() => run(() => copyTargets(programId, yearId, copyTo), t('obe2.tg.copied'))}>
            <Copy className="size-4" aria-hidden />
            {t('obe2.tg.copy')}
          </Button>
        </FormRow>
      )}
    </>
  );
}

/** Each student's share of the marks mapped to each CO, against the threshold, and the class level it gives. */
export function StudentAttainment({ data }: { data: StudentWise }) {
  const { t, fmt } = useI18n();
  const columns = useMemo<Column<StudentWise['students'][number]>[]>(
    () => [
      { id: 'name', header: t('obe2.sw.student'), rowHeader: true, cell: (s) => `${s.rollNo} ${s.name}`, sort: (s) => s.rollNo },
      ...data.cos.map((c, i) => ({
        id: c.id,
        header: c.code,
        align: 'right' as const,
        sort: (s: StudentWise['students'][number]) => s.cos[i].percent,
        csv: (s: StudentWise['students'][number]) => s.cos[i].percent ?? '',
        cell: (s: StudentWise['students'][number]) => {
          const x = s.cos[i];
          if (x.percent === null) return <span className="text-muted-foreground">-</span>;
          return <StatusPill tone={x.attained ? 'success' : 'danger'}>{fmt.number(x.percent)}%</StatusPill>;
        },
      })),
    ],
    [data, fmt, t],
  );
  if (!data.cos.length)
    return (
      <EmptyState icon={<CircleDashed />} title={t('obe2.sw.none')}>
        {t('obe2.sw.noneBody')}
      </EmptyState>
    );
  return (
    <>
      <div className="mb-4 grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(220px, 100%), 1fr))' }} data-testid="obe-sw-summary">
        {data.cos.map((c) => (
          <Card key={c.id}>
            <b className="block text-[15px]">{c.code}</b>
            <span className="mb-2 block text-xs text-muted-foreground">{c.statement}</span>
            <span className="block text-[13px]">{c.percentAttained === null ? t('obe2.sw.notMeasured') : t('obe2.sw.share', { attained: c.attained, measured: c.measured, pct: fmt.number(c.percentAttained), threshold: c.threshold })}</span>
            {c.level !== null && (
              <StatusPill tone={c.level >= c.target ? 'success' : 'warning'}>
                {t('obe2.sw.level', { level: c.level, target: c.target })}
              </StatusPill>
            )}
          </Card>
        ))}
      </div>
      <DataTable label={t('obe2.sw.title', { subject: `${data.subject.code} ${data.subject.name}` })} rows={data.students} rowId={(s) => s.id} columns={columns} exportName={`co-attainment-${data.subject.code}`} />
    </>
  );
}

/** Opens improvement actions for every outcome short of its target in the year's latest computation. */
export function GapsButton({ programId, yearId }: { programId: string; yearId: string }) {
  const { t } = useI18n();
  const { pending, run, feedback } = useRun();
  const [dueOn, setDueOn] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <>
      <FormRow labelled className="mb-4">
        <FormField label={t('obe2.gap.due')}>
          <TextInput type="date" className="w-[170px]" value={dueOn} onChange={(e) => setDueOn(e.target.value)} />
        </FormField>
        <Button disabled={pending || !yearId} onClick={() => run(() => actionsFromGaps(programId, yearId, dueOn), undefined, (d) => setMsg(t('obe2.gap.done', { created: d.created, open: d.alreadyOpen, gaps: d.gaps })))} data-testid="obe-gaps">
          <Target className="size-4" aria-hidden />
          {t('obe2.gap.button')}
        </Button>
      </FormRow>
      {feedback}
      {msg && <p className="mb-4 text-[13px] text-green-ink" role="status">{msg}</p>}
    </>
  );
}

/** How complete the programme's OBE set-up is, and PO attainment across years. */
export function ObeReadinessCard({ readiness, trend }: { readiness: ObeReadiness | null; trend: Trend | null }) {
  const { t, fmt } = useI18n();
  return (
    <div className="mt-6 grid gap-4 lg:grid-cols-2">
      {readiness && (
        <Card>
          <h2 className="m-0 mb-1 text-base font-semibold">{t('obe2.ready.title', { score: readiness.score })}</h2>
          <ul className="m-0 mt-3 list-none p-0" data-testid="obe-readiness">
            {readiness.items.map((i) => (
              <li key={i.key} className="mb-2 flex items-start gap-2 text-[13px]">
                {i.done ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-green-ink" aria-label={t('obe2.ready.done')} /> : <CircleDashed className="mt-0.5 size-4 shrink-0 text-amber-ink" aria-label={t('obe2.ready.todo')} />}
                <span>
                  <b className="font-semibold">{t(`obe2.ready.${i.key}` as MessageKey)}</b>
                  <span className="block text-muted-foreground">{i.detail}</span>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {trend && (
        <Card>
          <h2 className="m-0 mb-3 text-base font-semibold">{t('obe2.trend.title')}</h2>
          {trend.years.length < 2 ? (
            <p className="m-0 text-[13px] text-muted-foreground">{t('obe2.trend.one')}</p>
          ) : (
            <LineChart labels={trend.years.map((y) => y.label)} series={trend.outcomes.slice(0, 8).map((o) => ({ key: o.code, label: o.code, values: o.values }))} min={0} max={3} unit="" area={false} ariaLabel={t('obe2.trend.title')} />
          )}
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-[13px]" data-testid="obe-trend">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-1.5 pr-3 font-medium">{t('obe2.trend.outcome')}</th>
                  {trend.years.map((y) => (
                    <th key={y.id} className="py-1.5 pr-3 text-right font-medium">
                      {y.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {trend.outcomes.map((o) => (
                  <tr key={o.code} className="border-b last:border-0">
                    <th scope="row" className="py-1.5 pr-3 text-left font-normal">
                      {o.code}
                    </th>
                    {o.values.map((v, i) => (
                      <td key={trend.years[i].id} className="py-1.5 pr-3 text-right tabular-nums">
                        {v === null ? '-' : fmt.number(v)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
