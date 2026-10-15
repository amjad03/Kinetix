'use client';

import { BarChart3, Download, FileSpreadsheet, Layers, RefreshCw, Send, Star } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { addRatings, applyPreset, computeBatch, openExitSurvey, remindSurvey, savePolicy, setFramework } from '@/app/(dashboard)/obe/flagship-actions';
import { useRun } from '@/components/exams/useRun';
import { MenuItem, TextField } from '@/components/kx';
import { Button } from '@/components/shadcn/button';
import { Card, DataTable, Dialog, EmptyState, FormField, FormRow, LineChart, StatusPill, TextInput, useToast, type Column } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import { exportHref } from '@/lib/exams';
import type { ProgramOutcome, Trend } from '@/lib/obe';
import { FRAMEWORKS, lvl, type Batches, type ExitSurvey, type Framework, type Policy, type PolicyView, type Preset } from '@/lib/obe-flagship';
import type { Row } from '@/lib/records';
import { LevelCell, LevelLegend } from './Heat';

// ---- trends and batches --------------------------------------------------------------------------------------------

/** PO/PSO attainment year on year, and batch by batch (each intake through the years it studied). */
export function TrendsDesk({ programId, trend, batches }: { programId: string; trend: Trend | null; batches: Batches | null }) {
  const { t, fmt } = useI18n();
  const router = useRouter();
  const { pending, run, feedback } = useRun();
  const [entry, setEntry] = useState(batches?.entryYears.at(-2)?.id ?? batches?.entryYears[0]?.id ?? '');
  return (
    <div className="flex flex-col gap-6">
      <Card title={t('of.trend.title')} subtitle={t('of.trend.sub')} testId="of-trend">
        {!trend || trend.years.length === 0 ? (
          <EmptyState dense icon={<BarChart3 />} title={t('obe2.trend.one')} />
        ) : (
          <>
            {trend.years.length > 1 && <LineChart labels={trend.years.map((y) => y.label)} series={trend.outcomes.slice(0, 13).map((o) => ({ key: o.code, label: o.code, values: o.values }))} min={0} max={3} unit="" area={false} ariaLabel={t('of.trend.title')} />}
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[520px] text-[13px]" data-testid="of-trend-table">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="py-1.5 pr-3 font-medium">{t('obe2.trend.outcome')}</th>
                    {trend.years.map((y) => (
                      <th key={y.id} className="py-1.5 pr-3 text-center font-medium">
                        {y.label}
                      </th>
                    ))}
                    <th className="py-1.5 pr-3 text-right font-medium">{t('of.trend.change')}</th>
                  </tr>
                </thead>
                <tbody>
                  {trend.outcomes.map((o) => {
                    const known = o.values.filter((v): v is number => v !== null);
                    const delta = known.length > 1 ? known.at(-1)! - known[0] : null;
                    return (
                      <tr key={o.code} className="border-b last:border-0">
                        <th scope="row" className="py-1 pr-3 text-left font-semibold">
                          {o.code}
                        </th>
                        {o.values.map((v, i) => (
                          <td key={trend.years[i].id} className="py-1 pr-3 text-center">
                            <LevelCell value={v} target={o.target} />
                          </td>
                        ))}
                        <td className={`py-1 pr-3 text-right tabular-nums ${delta === null ? '' : delta >= 0 ? 'text-green-ink' : 'text-red-ink'}`}>{delta === null ? '-' : `${delta >= 0 ? '+' : ''}${fmt.number(Math.round(delta * 100) / 100)}`}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="mt-3 flex flex-wrap gap-4 text-[13px] text-muted-foreground">
              {trend.courses.map((c) => (
                <span key={c.yearId}>{t('of.trend.cos', { year: trend.years.find((y) => y.id === c.yearId)?.label ?? '', met: c.met, n: c.cos })}</span>
              ))}
            </div>
          </>
        )}
      </Card>
      <Card
        title={t('of.batch.title')}
        subtitle={t('of.batch.sub')}
        action={
          <span className="flex flex-wrap items-center gap-2">
            <TextInput size="small" select className="min-w-[150px]" value={entry} onChange={(e) => setEntry(e.target.value)} aria-label={t('of.batch.entry')}>
              {(batches?.entryYears ?? []).map((y) => (
                <MenuItem key={y.id} value={y.id}>
                  {t('of.batch.joined', { year: y.label })}
                </MenuItem>
              ))}
            </TextInput>
            <Button size="sm" variant="outline" disabled={pending || !entry} onClick={() => run(() => computeBatch(programId, entry), t('of.batch.computed'), () => router.refresh())} data-testid="of-batch-compute">
              <RefreshCw className="size-4" aria-hidden />
              {t('of.batch.compute')}
            </Button>
          </span>
        }
        testId="of-batches"
      >
        {feedback}
        {!batches || batches.batches.length === 0 ? (
          <EmptyState dense icon={<Layers />} title={t('of.batch.none')} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-[13px]">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="py-1.5 pr-3 font-medium">{t('obe2.trend.outcome')}</th>
                  {batches.batches.map((b) => (
                    <th key={b.entryYearId} className="py-1.5 pr-3 text-center font-medium" title={b.years.join(', ')}>
                      {t('of.batch.name', { batch: b.batch })}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {batches.outcomes.map((o) => (
                  <tr key={o.code} className="border-b last:border-0">
                    <th scope="row" className="py-1 pr-3 text-left font-semibold">
                      {o.code}
                    </th>
                    {o.values.map((v, i) => (
                      <td key={batches.batches[i].entryYearId} className="py-1 pr-3 text-center" title={v ? t('of.batch.cell', { d: lvl(v.direct), i: lvl(v.indirect) }) : undefined}>
                        <LevelCell value={v?.combined ?? null} target={v?.target ?? 2} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <LevelLegend />
              <span className="flex gap-2">
                <Button asChild size="sm" variant="outline">
                  <a href={exportHref(`/v1/obe/programs/${programId}/batch-report.pdf`)} target="_blank" rel="noreferrer">
                    <Download className="size-4" aria-hidden />
                    PDF
                  </a>
                </Button>
                <Button asChild size="sm" variant="outline">
                  <a href={exportHref(`/v1/obe/programs/${programId}/batch-report.xlsx`)} download>
                    <FileSpreadsheet className="size-4" aria-hidden />
                    {t('of.file.excel')}
                  </a>
                </Button>
              </span>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

// ---- reports --------------------------------------------------------------------------------------------------------

/** The OBE documents of a programme and year, each as a branded PDF or an Excel workbook. */
export function ReportsDesk({ programId, yearId, framework, courses }: { programId: string; yearId: string; framework: Framework; courses: { id: string; code: string; name: string }[] }) {
  const { t } = useI18n();
  const [courseId, setCourseId] = useState(courses[0]?.id ?? '');
  const nba = framework.startsWith('nba');
  const q = `academicYearId=${yearId}`;
  const docs: { key: string; title: MessageKey; body: MessageKey; path: string; recommended?: boolean }[] = [
    { key: 'programme', title: 'of.rep.programme', body: 'of.rep.programmeBody', path: `/v1/obe/programs/${programId}/attainment-report` },
    { key: 'sar', title: 'of.rep.sar', body: 'of.rep.sarBody', path: `/v1/obe/programs/${programId}/sar`, recommended: nba },
    { key: 'naac', title: 'of.rep.naac', body: 'of.rep.naacBody', path: `/v1/obe/programs/${programId}/naac-2-6`, recommended: !nba },
    { key: 'batch', title: 'of.rep.batch', body: 'of.rep.batchBody', path: `/v1/obe/programs/${programId}/batch-report` },
  ];
  const link = (path: string, ext: 'pdf' | 'xlsx', withYear = true) => exportHref(`${path}.${ext}${withYear ? `?${q}` : ''}`);
  return (
    <div className="grid gap-4 md:grid-cols-2" data-testid="of-reports">
      {docs.map((d) => (
        <Card key={d.key} title={t(d.title)} action={d.recommended ? <StatusPill tone="info">{t('of.rep.yourFramework')}</StatusPill> : undefined} testId={`of-rep-${d.key}`}>
          <p className="m-0 mb-4 text-[13px] text-muted-foreground">{t(d.body)}</p>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <a href={link(d.path, 'pdf', d.key !== 'batch')} target="_blank" rel="noreferrer">
                <Download className="size-4" aria-hidden />
                PDF
              </a>
            </Button>
            <Button asChild variant="outline">
              <a href={link(d.path, 'xlsx', d.key !== 'batch')} download>
                <FileSpreadsheet className="size-4" aria-hidden />
                {t('of.file.excel')}
              </a>
            </Button>
          </div>
        </Card>
      ))}
      <Card title={t('of.rep.course')} testId="of-rep-course">
        <p className="m-0 mb-3 text-[13px] text-muted-foreground">{t('of.rep.courseBody')}</p>
        <FormField label={t('of.col.course')}>
          <TextInput select value={courseId} onChange={(e) => setCourseId(e.target.value)}>
            {courses.map((c) => (
              <MenuItem key={c.id} value={c.id}>
                {c.code} {c.name}
              </MenuItem>
            ))}
          </TextInput>
        </FormField>
        <div className="mt-3 flex flex-wrap gap-2">
          {(['course-file', 'attainment-report'] as const).map((k) => (
            <Button key={k} asChild variant="outline" disabled={!courseId}>
              <a href={exportHref(`/v1/obe/subjects/${courseId}/${k}.pdf?${q}`)} target="_blank" rel="noreferrer">
                <Download className="size-4" aria-hidden />
                {t(k === 'course-file' ? 'of.file.courseFile' : 'of.file.report')}
              </a>
            </Button>
          ))}
          <Button asChild variant="outline" disabled={!courseId}>
            <a href={exportHref(`/v1/obe/subjects/${courseId}/course-file.xlsx?${q}`)} download>
              <FileSpreadsheet className="size-4" aria-hidden />
              {t('of.file.excel')}
            </a>
          </Button>
        </div>
      </Card>
    </div>
  );
}

// ---- surveys ----------------------------------------------------------------------------------------------------------

/** Course and programme exit surveys answered in the Student App, with response rates and reminders. */
export function SurveysDesk({ surveys, sections }: { surveys: ExitSurvey[]; sections: { id: string; name: string; term: number }[] }) {
  const { t, fmt } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const { pending, run, feedback } = useRun();
  const final = [...sections].sort((a, b) => b.term - a.term);
  const [f, setF] = useState({ sectionId: final[0]?.id ?? '', closesAt: '' });
  const columns: Column<ExitSurvey>[] = [
    { id: 'title', header: t('of.col.survey'), rowHeader: true, sort: (s) => s.title, cell: (s) => (<span><b className="font-medium">{s.title}</b><span className="block text-xs text-muted-foreground">{s.section ?? ''}</span></span>) },
    { id: 'kind', header: t('of.col.kind'), sort: (s) => s.kind, cell: (s) => t(`of.sv.kind.${s.kind}` as MessageKey) },
    { id: 'status', header: t('of.col.status'), sort: (s) => s.status, cell: (s) => <StatusPill tone={s.status === 'open' ? 'live' : 'neutral'}>{t(`of.sv.status.${s.status}` as MessageKey)}</StatusPill> },
    { id: 'rate', header: t('of.col.responses'), align: 'right', sort: (s) => (s.classSize ? s.responses / s.classSize : 0), cell: (s) => `${s.responses}/${s.classSize}${s.classSize ? ` (${Math.round((s.responses / s.classSize) * 100)}%)` : ''}` },
    { id: 'mean', header: t('of.col.mean'), align: 'right', hideBelow: 'sm', sort: (s) => s.mean, cell: (s) => (s.mean === null ? '-' : fmt.number(s.mean)) },
    { id: 'closes', header: t('of.col.closes'), hideBelow: 'md', sort: (s) => s.closesAt ?? '', cell: (s) => (s.closesAt ? fmt.date(s.closesAt.slice(0, 10), 'short') : '-') },
    { id: 'reminded', header: t('of.col.reminded'), hideBelow: 'lg', sort: (s) => s.lastRemindedAt ?? '', cell: (s) => (s.lastRemindedAt ? fmt.dateTime(s.lastRemindedAt) : '-') },
    { id: 'act', header: '', align: 'right', csv: false, cell: (s) => (s.status === 'open' ? <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => remindSurvey(s.id), undefined, (r) => { toast.success(t('of.sv.reminded', { n: r.reminded })); router.refresh(); })}>{t('of.sv.remind')}</Button> : null) },
  ];
  return (
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <Card title={t('of.sv.title')} subtitle={t('of.sv.sub')} padded={false} testId="of-exit-surveys">
        <div className="px-5 pt-2">{feedback}</div>
        <DataTable label={t('of.sv.title')} rows={surveys} rowId={(s) => s.id} columns={columns} exportName="obe-exit-surveys" empty={<EmptyState icon={<Send />} title={t('of.sv.none')} />} />
      </Card>
      <Card title={t('of.sv.programme')} testId="of-open-programme-survey">
        <p className="m-0 mb-3 text-[13px] text-muted-foreground">{t('of.sv.programmeHelp')}</p>
        <div className="grid gap-3">
          <FormField label={t('of.col.class')}>
            <TextInput select value={f.sectionId} onChange={(e) => setF({ ...f, sectionId: e.target.value })}>
              {final.map((s) => (
                <MenuItem key={s.id} value={s.id}>
                  {s.name}
                </MenuItem>
              ))}
            </TextInput>
          </FormField>
          <FormField label={t('of.sv.closesOn')}>
            <TextInput type="date" value={f.closesAt} onChange={(e) => setF({ ...f, closesAt: e.target.value })} />
          </FormField>
          <Button disabled={pending || !f.sectionId || !f.closesAt} onClick={() => run(() => openExitSurvey({ kind: 'programme_exit', sectionId: f.sectionId, closesAt: f.closesAt }), t('of.sv.opened'), () => router.refresh())}>
            <Send className="size-4" aria-hidden />
            {t('of.sv.openButton')}
          </Button>
        </div>
        <p className="m-0 mt-4 text-xs text-muted-foreground">{t('of.sv.courseHint')}</p>
      </Card>
    </div>
  );
}

/** Enter ratings of a paper survey: one line per respondent, one rating per PO/PSO (or CO), pasted from a sheet. */
export function RatingsDialog({ open, onClose, survey, outcomes }: { open: boolean; onClose: () => void; survey: Row | null; outcomes: ProgramOutcome[] }) {
  const { t } = useI18n();
  const router = useRouter();
  const { pending, run, feedback } = useRun();
  const [text, setText] = useState('');
  const cols = outcomes.filter((o) => o.kind === 'po' || o.kind === 'pso');
  const scale = Number(survey?.scaleMax ?? 5);
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const parsed = lines.map((l) => l.split(/[\t,; ]+/).map(Number));
  const bad = parsed.some((r) => r.length !== cols.length || r.some((v) => !Number.isFinite(v) || v < 0 || v > scale));
  const ratings = bad ? [] : parsed.flatMap((r) => r.map((v, i) => ({ outcomeId: cols[i].id, rating: v })));
  return (
    <Dialog open={open} onClose={onClose} title={t('of.inst.rateTitle', { title: String(survey?.title ?? '') })} actions={<><Button variant="outline" onClick={onClose}>{t('of.cancel')}</Button><Button disabled={pending || !ratings.length} onClick={() => survey && run(() => addRatings(String(survey.id), ratings), t('of.inst.saved', { n: lines.length }), () => { setText(''); onClose(); router.refresh(); })}>{t('of.save')}</Button></>}>
      {feedback}
      <p className="m-0 mb-2 text-[13px] text-muted-foreground">{t('of.inst.rateHelp', { cols: cols.map((c) => c.code).join(', '), max: scale })}</p>
      <TextField multiline minRows={8} value={text} onChange={(e) => setText(e.target.value)} placeholder={cols.map(() => '4').join('\t')} aria-label={t('of.inst.ratings')} />
      <p className={`m-0 mt-2 text-[13px] ${bad ? 'text-red-ink' : 'text-muted-foreground'}`}>{bad && lines.length ? t('of.inst.bad', { n: cols.length, max: scale }) : t('of.inst.count', { n: lines.length })}</p>
    </Dialog>
  );
}

// ---- set-up: framework, presets, policy --------------------------------------------------------------------------------

/** The framework the programme reports to, and outcome presets to start from (NBA graduate attributes, UGC LOCF, PSOs). */
export function FrameworkCard({ programId, framework, presets, canEdit }: { programId: string; framework: Framework; presets: Preset[]; canEdit: boolean }) {
  const { t } = useI18n();
  const router = useRouter();
  const toast = useToast();
  const { pending, run, feedback } = useRun();
  const [fw, setFw] = useState<Framework>(framework);
  const [preset, setPreset] = useState(presets.find((p) => p.framework === framework)?.key ?? presets[0]?.key ?? '');
  const chosen = presets.find((p) => p.key === preset);
  return (
    <Card title={t('of.fw.title')} subtitle={t('of.fw.sub')} testId="of-framework">
      {feedback}
      <FormRow>
        <FormField label={t('of.fw.label')}>
          <TextInput select className="min-w-[240px]" value={fw} disabled={!canEdit} onChange={(e) => setFw(e.target.value as Framework)} data-testid="of-framework-select">
            {FRAMEWORKS.map((f) => (
              <MenuItem key={f} value={f}>
                {t(`of.fw.${f}` as MessageKey)}
              </MenuItem>
            ))}
          </TextInput>
        </FormField>
        {canEdit && (
          <Button disabled={pending || fw === framework} onClick={() => run(() => setFramework(programId, fw), t('obe2.saved'), () => router.refresh())}>
            {t('of.save')}
          </Button>
        )}
      </FormRow>
      <h3 className="m-0 mt-5 mb-2 text-sm font-semibold">{t('of.preset.title')}</h3>
      <FormRow>
        <FormField label={t('of.preset.label')}>
          <TextInput select className="min-w-[300px]" value={preset} onChange={(e) => setPreset(e.target.value)}>
            {presets.map((p) => (
              <MenuItem key={p.key} value={p.key}>
                {p.label}
              </MenuItem>
            ))}
          </TextInput>
        </FormField>
        {canEdit && (
          <Button variant="outline" disabled={pending || !preset} onClick={() => run(() => applyPreset(programId, preset), undefined, (r) => { toast.success(t('of.preset.done', { added: r.added, kept: r.kept })); router.refresh(); })} data-testid="of-preset-apply">
            <Star className="size-4" aria-hidden />
            {t('of.preset.apply')}
          </Button>
        )}
      </FormRow>
      {chosen && (
        <ul className="m-0 mt-3 grid max-h-56 list-none gap-1 overflow-y-auto rounded-md border p-3 text-[13px]">
          {chosen.outcomes.map((o) => (
            <li key={o.code}>
              <b className="font-semibold">{o.code}</b> {o.statement}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

const pct = (v: string) => Math.max(0, Math.min(100, Number(v)));

/**
 * The attainment rules at one level (institution, programme or a course), saved as a new version with an optional
 * starting year, and the versions before it.
 */
export function PolicyEditor({ view, scope, programId, subjectId, years, canEdit, title }: { view: PolicyView; scope: 'institution' | 'program' | 'subject'; programId?: string; subjectId?: string; years: { id: string; label: string }[]; canEdit: boolean; title: string }) {
  const { t, fmt } = useI18n();
  const router = useRouter();
  const { pending, run, feedback } = useRun();
  const [c, setC] = useState<Policy>(view.effective.config);
  const [note, setNote] = useState('');
  const [from, setFrom] = useState('');
  const lv = (n: number) => c.levels.find((l) => l.level === n)?.minStudentsPercent ?? 0;
  const setLv = (n: number, v: string) => setC({ ...c, levels: [3, 2, 1].map((l) => ({ level: l, minStudentsPercent: l === n ? pct(v) : lv(l) })) });
  const num = (k: 'studentThresholdPercent' | 'directWeight' | 'indirectWeight' | 'targetLevel', label: MessageKey) => (
    <FormField label={t(label)}>
      <TextInput type="number" className="w-[120px]" value={c[k]} disabled={!canEdit} onChange={(e) => setC({ ...c, [k]: Number(e.target.value) })} />
    </FormField>
  );
  const weight = (k: string, label: MessageKey) => (
    <FormField label={t(label)}>
      <TextInput type="number" className="w-[120px]" value={c.evidenceWeights[k] ?? 0} disabled={!canEdit} onChange={(e) => setC({ ...c, evidenceWeights: { ...c.evidenceWeights, [k]: pct(e.target.value) } })} />
    </FormField>
  );
  const source = view.effective.source;
  return (
    <Card title={title} subtitle={t('of.pol.from', { scope: t(`of.pol.scope.${source.scope}` as MessageKey), v: source.version ?? '-' })} testId={`of-policy-${scope}`}>
      {feedback}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
        <FormRow>
          <FormField label={t('of.pol.coMethod')}>
            <TextInput select className="min-w-[240px]" value={c.coMethod} disabled={!canEdit} onChange={(e) => setC({ ...c, coMethod: e.target.value as Policy['coMethod'] })}>
              {(['threshold', 'class_average', 'percentage'] as const).map((m) => (
                <MenuItem key={m} value={m}>
                  {t(`of.pol.co.${m}` as MessageKey)}
                </MenuItem>
              ))}
            </TextInput>
          </FormField>
          {num('studentThresholdPercent', 'of.pol.threshold')}
          {num('targetLevel', 'of.pol.target')}
        </FormRow>
        <FormRow>
          <FormField label={t('of.pol.level', { n: 3 })}>
            <TextInput type="number" className="w-[110px]" value={lv(3)} disabled={!canEdit} onChange={(e) => setLv(3, e.target.value)} />
          </FormField>
          <FormField label={t('of.pol.level', { n: 2 })}>
            <TextInput type="number" className="w-[110px]" value={lv(2)} disabled={!canEdit} onChange={(e) => setLv(2, e.target.value)} />
          </FormField>
          <FormField label={t('of.pol.level', { n: 1 })}>
            <TextInput type="number" className="w-[110px]" value={lv(1)} disabled={!canEdit} onChange={(e) => setLv(1, e.target.value)} />
          </FormField>
        </FormRow>
        <FormRow>
          {weight('internal', 'of.pol.cie')}
          {weight('external', 'of.pol.see')}
          {num('directWeight', 'of.pol.direct')}
          {num('indirectWeight', 'of.pol.indirect')}
        </FormRow>
        <FormRow>
          <FormField label={t('of.pol.poMethod')}>
            <TextInput select className="min-w-[260px]" value={c.poMethod} disabled={!canEdit} onChange={(e) => setC({ ...c, poMethod: e.target.value as Policy['poMethod'] })}>
              {(['course_weighted', 'co_weighted', 'course_average'] as const).map((m) => (
                <MenuItem key={m} value={m}>
                  {t(`of.pol.po.${m}` as MessageKey)}
                </MenuItem>
              ))}
            </TextInput>
          </FormField>
          <FormField label={t('of.pol.apportion')}>
            <TextInput select className="min-w-[220px]" value={c.seeApportion} disabled={!canEdit} onChange={(e) => setC({ ...c, seeApportion: e.target.value as Policy['seeApportion'] })}>
              {(['blueprint', 'equal', 'off'] as const).map((m) => (
                <MenuItem key={m} value={m}>
                  {t(`of.pol.ap.${m}` as MessageKey)}
                </MenuItem>
              ))}
            </TextInput>
          </FormField>
          <FormField label={t('of.pol.lms')}>
            <TextInput select className="w-[120px]" value={c.includeLms ? 'yes' : 'no'} disabled={!canEdit} onChange={(e) => setC({ ...c, includeLms: e.target.value === 'yes' })}>
              <MenuItem value="yes">{t('of.yes')}</MenuItem>
              <MenuItem value="no">{t('of.no')}</MenuItem>
            </TextInput>
          </FormField>
        </FormRow>
        <p className="m-0 text-[13px] text-muted-foreground">{t(`of.method.${c.coMethod}` as MessageKey, { th: c.studentThresholdPercent })} {t('of.att.weights', { cie: c.evidenceWeights.internal ?? 0, see: c.evidenceWeights.external ?? 0, d: c.directWeight, i: c.indirectWeight })}</p>
        {canEdit && (
          <FormRow>
            <FormField label={t('of.pol.note')}>
              <TextInput className="min-w-[260px]" value={note} onChange={(e) => setNote(e.target.value)} />
            </FormField>
            <FormField label={t('of.pol.effective')}>
              <TextInput select className="min-w-[160px]" value={from} onChange={(e) => setFrom(e.target.value)}>
                <MenuItem value="">{t('of.pol.now')}</MenuItem>
                {years.map((y) => (
                  <MenuItem key={y.id} value={y.id}>
                    {y.label}
                  </MenuItem>
                ))}
              </TextInput>
            </FormField>
            <Button disabled={pending} onClick={() => run(() => savePolicy({ scope, programId, subjectId, note, effectiveFromYearId: from || undefined, config: c }), t('of.pol.saved'), () => { setNote(''); router.refresh(); })} data-testid={`of-policy-save-${scope}`}>
              {t('of.pol.save')}
            </Button>
          </FormRow>
        )}
        <div className="min-w-0 overflow-x-auto">
          <h3 className="m-0 mb-2 text-sm font-semibold">{t('of.pol.history')}</h3>
          {view.history.length === 0 ? (
            <p className="m-0 text-[13px] text-muted-foreground">{t('of.pol.noHistory')}</p>
          ) : (
            <DataTable
              bare
              label={t('of.pol.history')}
              rows={view.history}
              rowId={(h) => h.id}
              columns={[
                { id: 'v', header: t('of.col.version'), rowHeader: true, sort: (h) => h.version, cell: (h) => `v${h.version}` },
                { id: 'rules', header: t('of.pol.rules'), cell: (h) => `${t(`of.pol.co.${h.config.coMethod ?? 'threshold'}` as MessageKey)} · ${h.config.studentThresholdPercent}% · ${h.config.evidenceWeights.internal ?? 0}:${h.config.evidenceWeights.external ?? 0} · ${h.config.directWeight}:${h.config.indirectWeight}` },
                { id: 'from', header: t('of.pol.effective'), cell: (h) => h.effectiveFrom ?? t('of.pol.always') },
                { id: 'note', header: t('of.pol.note'), cell: (h) => h.note ?? '-' },
                { id: 'by', header: t('of.col.by'), hideBelow: 'md', cell: (h) => `${h.createdBy ?? '-'} · ${fmt.date(h.createdAt.slice(0, 10), 'short')}` },
              ]}
            />
          )}
        </div>
      </div>
    </Card>
  );
}
