'use client';

import { CheckCircle2, ClipboardCheck, Download, FileSpreadsheet, FileText, Lightbulb, Plus, RefreshCw, Send, Trash2, Wand2 } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { saveMatrix } from '@/app/(dashboard)/obe/actions';
import { activateDirectly, addCourseOutcome, computeProgramme, deleteCourseOutcome, editCourseOutcome, openExitSurvey, remindSurvey, reviewCos, startCoVersion, submitCos, suggestStatement } from '@/app/(dashboard)/obe/flagship-actions';
import { useRun } from '@/components/exams/useRun';
import { MenuItem, TextField } from '@/components/kx';
import { Button } from '@/components/shadcn/button';
import { WorkflowStepper, type WorkflowStep } from '@/components/templates';
import { Card, DataTable, EmptyState, FormField, FormRow, StatGrid, StatTile, StatusPill, TabPanel, Tabs, TextInput, useToast, type Column } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import { exportHref } from '@/lib/exams';
import type { CoSet, MatrixData } from '@/lib/obe';
import { lvl, type Approval, type CourseAssessment, type CourseAttainment, type ExitSurvey, type PolicyView, type Reviews, type UnitPlan } from '@/lib/obe-flagship';
import { LevelCell, LevelLegend } from './Heat';
import { UnitPlanEditor } from './ObeAudit';
import { stageLabel } from './ObeHome';

const BLOOM = ['Remember', 'Understand', 'Apply', 'Analyse', 'Evaluate', 'Create'] as const;
const STRENGTH = [0, 1, 2, 3];
type Tab = 'cos' | 'cam' | 'plan' | 'assessments' | 'attainment' | 'survey' | 'file';
const TABS: Tab[] = ['cos', 'cam', 'plan', 'assessments', 'attainment', 'survey', 'file'];

/** CO versions waiting for the person's decision, oldest first. */
export function ApprovalsList({ rows }: { rows: Approval[] }) {
  const { t, fmt } = useI18n();
  const columns: Column<Approval>[] = [
    { id: 'course', header: t('of.col.course'), rowHeader: true, sort: (r) => r.code, cell: (r) => (<span><b className="font-semibold">{r.code}</b> {r.subject}<span className="block text-xs text-muted-foreground">{r.program}{r.term ? ` · ${t('of.sem', { n: r.term })}` : ''}</span></span>) },
    { id: 'version', header: t('of.col.version'), align: 'right', sort: (r) => r.version, cell: (r) => `v${r.version}` },
    { id: 'stage', header: t('of.col.stage'), sort: (r) => r.stage, cell: (r) => <StatusPill tone="warning">{stageLabel(t, r.stage)}</StatusPill> },
    { id: 'by', header: t('of.col.submittedBy'), hideBelow: 'md', sort: (r) => r.submittedBy ?? '', cell: (r) => r.submittedBy ?? '-' },
    { id: 'at', header: t('of.col.submitted'), hideBelow: 'sm', sort: (r) => r.submittedAt ?? '', cell: (r) => (r.submittedAt ? fmt.date(r.submittedAt.slice(0, 10), 'short') : '-') },
    { id: 'cos', header: t('of.col.cos'), align: 'right', hideBelow: 'md', sort: (r) => r.cos ?? 0, cell: (r) => r.cos ?? '-' },
    { id: 'verbs', header: t('of.col.verbIssues'), align: 'right', sort: (r) => r.verbIssues ?? 0, cell: (r) => (r.verbIssues ? <StatusPill tone="warning">{r.verbIssues}</StatusPill> : <StatusPill tone="success">0</StatusPill>) },
  ];
  return <DataTable label={t('of.tab.approvals')} rows={rows} rowId={(r) => r.id} columns={columns} rowHref={(r) => `/obe/courses/${r.subjectId}?tab=cos`} exportName="obe-approvals" empty={<EmptyState icon={<ClipboardCheck />} title={t('of.home.noApprovals')}>{t('of.appr.noneBody')}</EmptyState>} />;
}

export interface WorkspaceData {
  subject: { id: string; code: string; name: string; term: number; programId: string; program: string };
  yearId: string;
  years: { id: string; label: string }[];
  sets: CoSet[];
  setId: string | null;
  matrix: MatrixData | null;
  reviews: Reviews | null;
  assessments: CourseAssessment[];
  attainment: CourseAttainment | null;
  policy: PolicyView | null;
  surveys: ExitSurvey[];
  /** The course plan (units and the COs each serves); null when the person may not edit the course. */
  plan: UnitPlan | null;
  sections: { id: string; name: string }[];
  leader: boolean;
}

/** One course's OBE workspace: its COs and their approval, the CO-PO matrix, the course plan (units and COs), assessments and papers, attainment, exit survey and course file. */
export function CourseWorkspace({ d }: { d: WorkspaceData }) {
  const { t } = useI18n();
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const tab = (TABS.includes(sp.get('tab') as Tab) ? sp.get('tab') : 'cos') as Tab;
  const setTab = (v: Tab) => {
    const q = new URLSearchParams(sp.toString());
    q.set('tab', v);
    router.replace(`${path}?${q}`, { scroll: false });
  };
  const att = d.attainment;
  const measured = att?.cos.filter((c) => c.combined !== null) ?? [];
  return (
    <>
      <StatGrid min={150}>
        <StatTile label={t('of.ws.version')} value={d.sets.find((s) => s.status === 'active') ? `v${d.sets.find((s) => s.status === 'active')!.version}` : '-'} caption={d.reviews ? stageLabel(t, d.reviews.set.reviewStage) : undefined} />
        <StatTile label={t('of.col.cos')} value={d.matrix?.cos.length ?? 0} />
        <StatTile label={t('of.ws.assessments')} value={d.assessments.length} caption={t('of.ws.tagged', { n: d.assessments.filter((a) => a.basis !== 'none').length })} />
        <StatTile label={t('of.ws.met')} value={measured.length ? `${measured.filter((c) => c.met).length}/${measured.length}` : '-'} tone={measured.some((c) => !c.met) ? 'warning' : 'default'} />
      </StatGrid>
      <div className="mt-5">
        <Tabs value={tab} onChange={setTab} label={t('of.ws.tabs')} items={TABS.map((v) => ({ value: v, label: t(`of.ws.tab.${v}` as MessageKey) }))} />
      </div>
      <TabPanel value="cos" active={tab}>
        <CosPanel d={d} />
      </TabPanel>
      <TabPanel value="cam" active={tab}>
        <CamPanel d={d} />
      </TabPanel>
      <TabPanel value="plan" active={tab}>
        {d.plan ? <UnitPlanEditor key={d.plan.units.map((u) => u.coCodes.join(',')).join('|')} subjectId={d.subject.id} plan={d.plan} canEdit /> : <EmptyState icon={<FileText />} title={t('oa.up.noAccess')}>{t('oa.up.noAccessBody')}</EmptyState>}
      </TabPanel>
      <TabPanel value="assessments" active={tab}>
        <AssessmentsPanel d={d} />
      </TabPanel>
      <TabPanel value="attainment" active={tab}>
        <AttainmentPanel d={d} />
      </TabPanel>
      <TabPanel value="survey" active={tab}>
        <SurveyPanel d={d} />
      </TabPanel>
      <TabPanel value="file" active={tab}>
        <FilesPanel d={d} />
      </TabPanel>
    </>
  );
}

function stepsOf(t: (k: MessageKey) => string, r: Reviews | null): WorkflowStep[] {
  const order = ['submitted', 'hod', 'coordinator', 'iqac'] as const;
  const stage = r?.set.reviewStage ?? 'draft';
  const last = (st: string) => [...(r?.history ?? [])].reverse().find((h) => (st === 'submitted' ? h.decision === 'submitted' : h.stage === st && (h.decision === 'approved' || h.decision === 'returned')));
  const at = order.indexOf(stage as (typeof order)[number]);
  return order.map((s, i) => {
    const h = last(s);
    const state: WorkflowStep['state'] =
      stage === 'approved' ? 'done' : stage === 'returned' ? (h?.decision === 'returned' ? 'rejected' : s === 'submitted' ? 'done' : 'upcoming') : stage === 'draft' ? 'upcoming' : i < at ? 'done' : i === at ? 'current' : 'upcoming';
    return { id: s, label: t(`of.step.${s}` as MessageKey), state: s === 'submitted' && stage !== 'draft' ? 'done' : state, by: h?.actor ?? undefined, at: h?.at, note: h?.comment ?? undefined };
  });
}

function CosPanel({ d }: { d: WorkspaceData }) {
  const { t, fmt } = useI18n();
  const router = useRouter();
  const { pending, run, feedback } = useRun();
  const set = d.sets.find((s) => s.id === d.setId) ?? null;
  const stage = d.reviews?.set.reviewStage ?? 'draft';
  const editable = !!set && set.status === 'draft' && (stage === 'draft' || stage === 'returned');
  const [draft, setDraft] = useState({ code: `CO${(set?.outcomes.length ?? 0) + 1}`, statement: '', bloomLevel: 'Apply' });
  const [edits, setEdits] = useState<Record<string, { statement: string; bloomLevel: string }>>({});
  const [hints, setHints] = useState<Record<string, { rewrites: string[]; verbs: string[]; message: string | null }>>({});
  const [comment, setComment] = useState('');
  const [coComment, setCoComment] = useState('');
  const [warnings, setWarnings] = useState<string[]>([]);
  const suggest = (key: string, statement: string, bloom: string) =>
    run(() => suggestStatement(statement, bloom), undefined, (r) => setHints({ ...hints, [key]: { rewrites: r.rewrites, verbs: r.verbs, message: r.check.message } }));
  const verb = (c: CoSet['outcomes'][number]) => c.verbCheck && !c.verbCheck.ok;
  return (
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
      <Card
        title={t('of.cos.title')}
        subtitle={set ? t('of.cos.version', { v: set.version, status: t(`obe.cs.${set.status}` as MessageKey) }) : t('of.cos.none')}
        action={
          <span className="flex flex-wrap gap-2">
            {d.sets.length > 1 && (
              <TextInput size="small" select value={set?.id ?? ''} onChange={(e) => router.push(`?tab=cos&setId=${e.target.value}`)} aria-label={t('obe.f.version')}>
                {d.sets.map((s) => (
                  <MenuItem key={s.id} value={s.id}>
                    v{s.version} · {t(`obe.cs.${s.status}` as MessageKey)}
                  </MenuItem>
                ))}
              </TextInput>
            )}
            {!d.sets.some((s) => s.status === 'draft') && (
              <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => startCoVersion(d.subject.id, ''), t('obe.versionStarted'), () => router.refresh())} data-testid="of-new-version">
                <Plus className="size-4" aria-hidden />
                {t('obe.newVersion')}
              </Button>
            )}
          </span>
        }
        testId="of-cos"
      >
        {feedback}
        {!set || set.outcomes.length === 0 ? (
          <EmptyState dense icon={<Lightbulb />} title={t('of.cos.empty')}>
            {t('of.cos.emptyBody')}
          </EmptyState>
        ) : (
          <ol className="m-0 grid list-none gap-3 p-0">
            {set.outcomes.map((c) => {
              const e = edits[c.id] ?? { statement: c.statement, bloomLevel: c.bloomLevel ?? '' };
              const h = hints[c.id];
              const changed = e.statement !== c.statement || e.bloomLevel !== (c.bloomLevel ?? '');
              return (
                <li key={c.id} className="rounded-lg border p-3" data-testid={`of-co-${c.code}`}>
                  <div className="flex flex-wrap items-start gap-3">
                    <b className="w-10 shrink-0 pt-2 font-semibold">{c.code}</b>
                    {editable ? (
                      <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-[minmax(0,1fr)_150px]">
                        <TextField multiline minRows={1} value={e.statement} onChange={(x) => setEdits({ ...edits, [c.id]: { ...e, statement: x.target.value } })} aria-label={t('of.cos.statementFor', { code: c.code })} />
                        <TextInput select value={e.bloomLevel} onChange={(x) => setEdits({ ...edits, [c.id]: { ...e, bloomLevel: x.target.value } })} aria-label={t('of.cos.bloomFor', { code: c.code })}>
                          {BLOOM.map((b, i) => (
                            <MenuItem key={b} value={b}>
                              {t(`obe2.bloom.${i + 1}` as MessageKey)}
                            </MenuItem>
                          ))}
                        </TextInput>
                      </div>
                    ) : (
                      <p className="m-0 min-w-0 flex-1 pt-2 text-sm">
                        {c.statement} <StatusPill tone="neutral">{c.bloomLevel ?? '-'}</StatusPill>
                      </p>
                    )}
                  </div>
                  {verb(c) && <p className="m-0 mt-2 pl-[3.25rem] text-xs text-amber-ink">{t('of.cos.verb', { verb: c.verbCheck?.verb ?? '' })}</p>}
                  {editable && (
                    <div className="mt-2 flex flex-wrap gap-2 pl-[3.25rem]">
                      <Button size="sm" variant="outline" disabled={pending} onClick={() => suggest(c.id, e.statement, e.bloomLevel)}>
                        <Wand2 className="size-4" aria-hidden />
                        {t('of.cos.suggest')}
                      </Button>
                      <Button size="sm" disabled={pending || !changed || e.statement.trim().length < 3} onClick={() => run(() => editCourseOutcome(c.id, e), t('obe2.saved'), () => router.refresh())}>
                        {t('of.save')}
                      </Button>
                      <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => deleteCourseOutcome(c.id), t('of.deleted'), () => router.refresh())} aria-label={t('of.cos.delete', { code: c.code })}>
                        <Trash2 className="size-4" aria-hidden />
                      </Button>
                    </div>
                  )}
                  {h && (
                    <div className="mt-2 rounded-md bg-muted/50 p-2.5 text-[13px]" data-testid={`of-hint-${c.code}`}>
                      {h.message && <p className="m-0 mb-1 text-amber-ink">{h.message}</p>}
                      {h.rewrites.length > 0 ? (
                        <ul className="m-0 grid list-none gap-1 p-0">
                          {h.rewrites.map((r) => (
                            <li key={r}>
                              <button type="button" className="text-left text-primary hover:underline" onClick={() => setEdits({ ...edits, [c.id]: { ...e, statement: r } })}>
                                {r}
                              </button>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="m-0 text-green-ink">{t('of.cos.fine')}</p>
                      )}
                      <p className="m-0 mt-1 text-xs text-muted-foreground">{t('of.cos.verbs', { verbs: h.verbs.join(', ') })}</p>
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        )}
        {editable && (
          <div className="mt-4 rounded-lg border border-dashed p-3">
            <FormRow>
              <FormField label={t('of.cos.code')}>
                <TextInput className="w-[90px]" value={draft.code} onChange={(e) => setDraft({ ...draft, code: e.target.value })} />
              </FormField>
              <FormField label={t('of.cos.statement')}>
                <TextInput className="min-w-[260px] flex-1" value={draft.statement} onChange={(e) => setDraft({ ...draft, statement: e.target.value })} placeholder={t('of.cos.placeholder')} />
              </FormField>
              <FormField label={t('of.col.bloom')}>
                <TextInput className="w-[150px]" select value={draft.bloomLevel} onChange={(e) => setDraft({ ...draft, bloomLevel: e.target.value })}>
                  {BLOOM.map((b, i) => (
                    <MenuItem key={b} value={b}>
                      {t(`obe2.bloom.${i + 1}` as MessageKey)}
                    </MenuItem>
                  ))}
                </TextInput>
              </FormField>
              <Button variant="outline" disabled={pending || !draft.statement.trim()} onClick={() => suggest('new', draft.statement, draft.bloomLevel)}>
                <Wand2 className="size-4" aria-hidden />
                {t('of.cos.suggest')}
              </Button>
              <Button disabled={pending || !set || draft.statement.trim().length < 3} onClick={() => run(() => addCourseOutcome(set!.id, draft), t('of.cos.added'), () => { setDraft({ code: `CO${(set?.outcomes.length ?? 0) + 2}`, statement: '', bloomLevel: draft.bloomLevel }); router.refresh(); })} data-testid="of-co-add">
                <Plus className="size-4" aria-hidden />
                {t('of.cos.add')}
              </Button>
            </FormRow>
            {hints.new && (
              <div className="mt-2 rounded-md bg-muted/50 p-2.5 text-[13px]">
                {hints.new.message && <p className="m-0 mb-1 text-amber-ink">{hints.new.message}</p>}
                {hints.new.rewrites.map((r) => (
                  <button key={r} type="button" className="block text-left text-primary hover:underline" onClick={() => setDraft({ ...draft, statement: r })}>
                    {r}
                  </button>
                ))}
                <p className="m-0 mt-1 text-xs text-muted-foreground">{t('of.cos.verbs', { verbs: hints.new.verbs.join(', ') })}</p>
              </div>
            )}
          </div>
        )}
      </Card>

      <Card title={t('of.wf.title')} testId="of-workflow">
        <WorkflowStepper steps={stepsOf(t, d.reviews)} label={t('of.wf.title')} />
        {warnings.length > 0 && (
          <ul className="m-0 mt-3 list-disc pl-5 text-[13px] text-amber-ink">
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        )}
        {editable && (
          <div className="mt-4 grid gap-2">
            <TextField label={t('of.wf.note')} multiline minRows={2} value={comment} onChange={(e) => setComment(e.target.value)} />
            <div className="flex flex-wrap justify-end gap-2">
              {d.leader && (
                <Button variant="outline" disabled={pending} onClick={() => run(() => activateDirectly(set!.id), t('of.wf.activated'), () => router.refresh())} data-testid="of-activate">
                  <CheckCircle2 className="size-4" aria-hidden />
                  {t('of.wf.activate')}
                </Button>
              )}
              <Button disabled={pending} onClick={() => run(() => submitCos(set!.id, comment), t('of.wf.submitted'), (r) => { setWarnings(r.warnings); setComment(''); router.refresh(); })} data-testid="of-submit">
                <Send className="size-4" aria-hidden />
                {t('of.wf.submit')}
              </Button>
            </div>
          </div>
        )}
        {d.reviews?.canDecide && (
          <div className="mt-4 grid gap-2 rounded-lg border bg-muted/40 p-3" data-testid="of-decide">
            <p className="m-0 text-sm font-semibold">{t('of.wf.yourTurn', { step: stageLabel(t, stage) })}</p>
            <TextField label={t('tpl.comment')} multiline minRows={2} value={coComment} onChange={(e) => setCoComment(e.target.value)} />
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="ghost" disabled={pending || !coComment.trim()} onClick={() => run(() => reviewCos(set!.id, 'comment', coComment), t('of.wf.commented'), () => { setCoComment(''); router.refresh(); })}>
                {t('of.wf.comment')}
              </Button>
              <Button variant="outline" disabled={pending || !coComment.trim()} onClick={() => run(() => reviewCos(set!.id, 'return', coComment), t('of.wf.returned'), () => { setCoComment(''); router.refresh(); })} data-testid="of-return">
                {t('of.wf.return')}
              </Button>
              <Button disabled={pending} onClick={() => run(() => reviewCos(set!.id, 'approve', coComment), t('of.wf.approved'), () => { setCoComment(''); router.refresh(); })} data-testid="of-approve">
                {t('tpl.approve')}
              </Button>
            </div>
          </div>
        )}
        <h3 className="m-0 mt-5 mb-2 text-sm font-semibold">{t('of.wf.history')}</h3>
        {!d.reviews?.history.length ? (
          <p className="m-0 text-[13px] text-muted-foreground">{t('of.wf.noHistory')}</p>
        ) : (
          <ol className="m-0 grid list-none gap-2 p-0" data-testid="of-history">
            {[...d.reviews.history].reverse().map((h) => (
              <li key={h.id} className="border-l-2 pl-3 text-[13px]">
                <b className="font-semibold">{t(`of.dec.${h.decision}` as MessageKey)}</b> · {stageLabel(t, h.stage)}
                {h.co ? ` · ${h.co}` : ''}
                <span className="block text-xs text-muted-foreground">
                  {h.actor ?? '-'} · {fmt.dateTime(h.at)}
                </span>
                {h.comment && <span className="block">{h.comment}</span>}
              </li>
            ))}
          </ol>
        )}
      </Card>
    </div>
  );
}

function CamPanel({ d }: { d: WorkspaceData }) {
  const { t } = useI18n();
  const router = useRouter();
  const { pending, run, feedback } = useRun();
  const m = d.matrix;
  const [cells, setCells] = useState(m?.cells ?? []);
  if (!m || !m.cos.length) return <EmptyState icon={<Lightbulb />} title={t('of.cos.empty')}>{t('of.cos.emptyBody')}</EmptyState>;
  const editable = m.set.status === 'draft' && (d.reviews?.set.reviewStage === 'draft' || d.reviews?.set.reviewStage === 'returned' || !d.reviews);
  const get = (co: string, o: string) => cells.find((c) => c.coId === co && c.outcomeId === o);
  const put = (co: string, o: string, patch: { strength?: number; justification?: string }) => {
    const cur = get(co, o) ?? { coId: co, outcomeId: o, strength: 0, justification: '' };
    setCells([...cells.filter((c) => c !== cur), { ...cur, ...patch }].filter((c) => c.strength > 0));
  };
  const avg = (o: string) => {
    const v = cells.filter((c) => c.outcomeId === o && c.strength > 0).map((c) => c.strength);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  };
  return (
    <Card title={t('of.cam.title')} subtitle={editable ? t('of.cam.edit') : t('of.cam.locked')} testId="of-cam">
      {feedback}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-[13px]">
          <thead>
            <tr className="border-b text-muted-foreground">
              <th className="sticky left-0 bg-card py-2 pr-3 text-left font-medium">{t('of.col.co')}</th>
              {m.outcomes.map((o) => (
                <th key={o.id} className="px-1 py-2 text-center font-medium" title={o.statement}>
                  {o.code}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {m.cos.map((c) => (
              <tr key={c.id} className="border-b last:border-0">
                <th scope="row" className="sticky left-0 bg-card py-1.5 pr-3 text-left font-semibold" title={c.statement}>
                  {c.code}
                </th>
                {m.outcomes.map((o) => (
                  <td key={o.id} className="px-1 py-1.5 text-center">
                    {editable ? (
                      <TextInput size="small" select value={String(get(c.id, o.id)?.strength ?? 0)} onChange={(e) => put(c.id, o.id, { strength: Number(e.target.value) })} inputProps={{ 'aria-label': t('obe2.peo.cell', { peo: c.code, mission: o.code }) }}>
                        {STRENGTH.map((s) => (
                          <MenuItem key={s} value={String(s)}>
                            {s === 0 ? '-' : s}
                          </MenuItem>
                        ))}
                      </TextInput>
                    ) : (
                      <span className="tabular-nums">{get(c.id, o.id)?.strength ?? '-'}</span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
            <tr>
              <th scope="row" className="sticky left-0 bg-card py-1.5 pr-3 text-left text-muted-foreground">
                {t('of.pam.average')}
              </th>
              {m.outcomes.map((o) => (
                <td key={o.id} className="px-1 py-1.5 text-center font-semibold tabular-nums">
                  {lvl(avg(o.id))}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      <h3 className="m-0 mt-5 mb-2 text-sm font-semibold">{t('obe2.justify.title')}</h3>
      <p className="m-0 mb-3 text-[13px] text-muted-foreground">{t('obe2.justify.help', { done: cells.filter((c) => c.justification?.trim()).length, total: cells.length })}</p>
      <div className="grid gap-2">
        {cells
          .slice()
          .sort((a, b) => (m.cos.find((x) => x.id === a.coId)?.code ?? '').localeCompare(m.cos.find((x) => x.id === b.coId)?.code ?? '', 'en', { numeric: true }))
          .map((c) => {
            const co = m.cos.find((x) => x.id === c.coId)?.code ?? '';
            const po = m.outcomes.find((x) => x.id === c.outcomeId)?.code ?? '';
            return (
              <div key={`${c.coId}:${c.outcomeId}`} className="grid items-center gap-2 sm:grid-cols-[150px_1fr]">
                <span className="text-[13px] font-medium">
                  {co} → {po} ({c.strength})
                </span>
                {editable ? <TextInput size="small" value={c.justification ?? ''} placeholder={t('obe2.justify.placeholder')} inputProps={{ maxLength: 500, 'aria-label': t('obe2.justify.label', { co, po }) }} onChange={(e) => put(c.coId, c.outcomeId, { justification: e.target.value })} /> : <span className="text-[13px] text-muted-foreground">{c.justification || '-'}</span>}
              </div>
            );
          })}
      </div>
      {editable && (
        <div className="mt-4 flex justify-end">
          <Button disabled={pending} onClick={() => run(() => saveMatrix(m.set.id, cells), t('obe2.saved'), () => router.refresh())} data-testid="of-cam-save">
            {t('of.save')}
          </Button>
        </div>
      )}
    </Card>
  );
}

const BASIS_TONE = { questions: 'success', apportioned: 'info', share: 'neutral', none: 'danger' } as const;

function AssessmentsPanel({ d }: { d: WorkspaceData }) {
  const { t, fmt } = useI18n();
  const columns: Column<CourseAssessment>[] = [
    { id: 'title', header: t('of.col.assessment'), rowHeader: true, sort: (a) => a.title, cell: (a) => (<span><b className="font-medium">{a.title}</b><span className="block text-xs text-muted-foreground">{a.section}{a.component ? ` · ${a.component}` : ''}</span></span>) },
    { id: 'ev', header: t('of.col.evidence'), sort: (a) => a.evidence, cell: (a) => <StatusPill tone={a.evidence === 'see' ? 'info' : 'neutral'}>{t(`of.ev.${a.evidence}` as MessageKey)}</StatusPill> },
    { id: 'held', header: t('of.col.heldOn'), hideBelow: 'md', sort: (a) => a.heldOn, cell: (a) => fmt.date(a.heldOn, 'short') },
    { id: 'max', header: t('of.col.outOf'), align: 'right', hideBelow: 'sm', sort: (a) => a.maxMarks, cell: (a) => a.maxMarks },
    { id: 'paper', header: t('of.col.paper'), align: 'right', sort: (a) => a.questions, cell: (a) => (a.questions ? t('of.ws.paper', { q: a.questions, tagged: a.tagged }) : '-') },
    { id: 'marks', header: t('of.col.marks'), align: 'right', sort: (a) => a.entered, cell: (a) => `${a.entered}/${a.classSize}` },
    { id: 'basis', header: t('of.col.basis'), sort: (a) => a.basis, cell: (a) => <StatusPill tone={BASIS_TONE[a.basis]}>{t(`of.basis.${a.basis}` as MessageKey)}</StatusPill> },
  ];
  return (
    <Card padded={false} testId="of-assessments">
      <DataTable label={t('of.ws.tab.assessments')} rows={d.assessments} rowId={(a) => a.id} columns={columns} rowHref={(a) => `/obe/assessments/${a.id}`} exportName={`assessments-${d.subject.code}`} empty={<EmptyState icon={<FileText />} title={t('of.ws.noAssessments')}>{t('of.ws.noAssessmentsBody')}</EmptyState>} />
    </Card>
  );
}

function AttainmentPanel({ d }: { d: WorkspaceData }) {
  const { t, fmt } = useI18n();
  const router = useRouter();
  const { pending, run, feedback } = useRun();
  const a = d.attainment;
  const policy = d.policy?.effective.config;
  const kind = (rows: CourseAttainment['cos'][number]['byKind'], k: string) => rows.find((x) => x.kind === k);
  return (
    <div className="grid gap-4">
      {feedback}
      <Card
        title={t('of.att.title')}
        subtitle={a?.computedAt ? t('of.att.computed', { when: fmt.dateTime(a.computedAt) }) : t('obe.notComputed')}
        action={
          <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => computeProgramme(d.subject.programId, d.yearId), t('obe.computed'), () => router.refresh())} data-testid="of-recompute">
            <RefreshCw className="size-4" aria-hidden />
            {t('obe.compute')}
          </Button>
        }
        testId="of-attainment"
      >
        {policy && (
          <p className="m-0 mb-4 text-[13px] text-muted-foreground" data-testid="of-policy-line">
            {t(`of.method.${policy.coMethod}` as MessageKey, { th: policy.studentThresholdPercent })} {t('of.att.weights', { cie: policy.evidenceWeights.internal ?? 0, see: policy.evidenceWeights.external ?? 0, d: policy.directWeight, i: policy.indirectWeight })} {t(`of.apportion.${policy.seeApportion}` as MessageKey)}{' '}
            <Link href={`/obe/setup?programId=${d.subject.programId}&subjectId=${d.subject.id}#policy`}>{t('of.att.rules')}</Link>
          </p>
        )}
        {!a || !a.cos.length ? (
          <EmptyState dense icon={<Lightbulb />} title={t('obe.notComputed')} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-[13px]">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">{t('of.col.co')}</th>
                  <th className="py-2 pr-3 text-right font-medium">{t('of.att.cie')}</th>
                  <th className="py-2 pr-3 text-right font-medium">{t('of.att.see')}</th>
                  <th className="py-2 pr-3 text-right font-medium">{t('obe.direct')}</th>
                  <th className="py-2 pr-3 text-right font-medium">{t('obe.indirect')}</th>
                  <th className="py-2 pr-3 text-right font-medium">{t('of.att.overall')}</th>
                  <th className="py-2 pr-3 text-right font-medium">{t('obe.target')}</th>
                  <th className="py-2 font-medium">{t('of.att.weakest')}</th>
                </tr>
              </thead>
              <tbody>
                {a.cos.map((c) => {
                  const cie = kind(c.byKind, 'internal');
                  const see = kind(c.byKind, 'external');
                  return (
                    <tr key={c.id} className="border-b align-top last:border-0">
                      <th scope="row" className="py-2 pr-3 text-left font-normal">
                        <b className="font-semibold">{c.code}</b>
                        <span className="block max-w-[18rem] text-xs text-muted-foreground">{c.statement}</span>
                      </th>
                      <td className="py-2 pr-3 text-right tabular-nums">{cie ? <>{t('of.att.pool', { a: cie.attained, n: cie.students, pct: fmt.number(cie.percentAttained) })}<span className="block text-xs text-muted-foreground">{t('of.att.level', { l: cie.level })}</span></> : '-'}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{see ? <>{t('of.att.pool', { a: see.attained, n: see.students, pct: fmt.number(see.percentAttained) })}<span className="block text-xs text-muted-foreground">{t('of.att.level', { l: see.level })}</span></> : '-'}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{lvl(c.direct)}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{lvl(c.indirect)}</td>
                      <td className="py-2 pr-3 text-right"><LevelCell value={c.combined} target={c.target} /></td>
                      <td className="py-2 pr-3 text-right tabular-nums">{lvl(c.target)}</td>
                      <td className="py-2 text-xs text-muted-foreground">{c.weakItems.slice(0, 2).map((w) => `${w.label} (${fmt.number(w.percentAttained)}%)`).join('; ') || '-'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="mt-3">
              <LevelLegend />
            </div>
          </div>
        )}
      </Card>
      {a && a.questions.length > 0 && (
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <Card title={t('of.att.questions')} padded={false} testId="of-questions">
            <DataTable
              label={t('of.att.questions')}
              rows={a.questions}
              rowId={(q) => q.id}
              exportName={`questions-${d.subject.code}`}
              pageSize={12}
              initialSort={{ id: 'pct', dir: 'asc' }}
              columns={[
                { id: 'q', header: t('of.col.question'), rowHeader: true, sort: (q) => `${q.assessment} ${q.no}`, cell: (q) => (<span><b className="font-medium">Q{q.no}</b> <span className="text-xs text-muted-foreground">{q.assessment}</span></span>) },
                { id: 'cos', header: t('of.col.cos'), sort: (q) => q.cos.join(','), cell: (q) => q.cos.join(', ') || '-' },
                { id: 'bloom', header: t('of.col.bloom'), hideBelow: 'sm', sort: (q) => q.bloomLevel ?? '', cell: (q) => q.bloomLevel ?? '-' },
                { id: 'max', header: t('of.col.outOf'), align: 'right', hideBelow: 'md', sort: (q) => q.maxMarks, cell: (q) => q.maxMarks },
                { id: 'pct', header: t('of.col.average'), align: 'right', sort: (q) => q.percent, cell: (q) => (q.percent === null ? '-' : <StatusPill tone={q.percent >= 60 ? 'success' : q.percent >= 45 ? 'warning' : 'danger'}>{fmt.number(q.percent)}%</StatusPill>) },
              ]}
            />
          </Card>
          <Card title={t('of.att.bloom')} testId="of-bloom">
            <ul className="m-0 grid list-none gap-2 p-0">
              {a.bloom.map((b) => {
                const total = a.bloom.reduce((s, x) => s + x.marks, 0) || 1;
                return (
                  <li key={b.level} className="grid grid-cols-[96px_1fr_48px] items-center gap-2 text-[13px]">
                    <span>{t(`obe2.bloom.${b.level}` as MessageKey)}</span>
                    <span className="h-2.5 overflow-hidden rounded bg-muted">
                      <span className="block h-full bg-primary" style={{ width: `${(b.marks / total) * 100}%` }} />
                    </span>
                    <span className="text-right tabular-nums">{Math.round((b.marks / total) * 100)}%</span>
                  </li>
                );
              })}
            </ul>
          </Card>
        </div>
      )}
    </div>
  );
}

function SurveyPanel({ d }: { d: WorkspaceData }) {
  const { t, fmt } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const { pending, run, feedback } = useRun();
  const [f, setF] = useState({ sectionId: d.sections[0]?.id ?? '', closesAt: '' });
  const mine = d.surveys.filter((s) => s.subjectId === d.subject.id);
  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <Card title={t('of.sv.course')} subtitle={t('of.sv.courseSub')} testId="of-course-surveys">
        {feedback}
        {mine.length === 0 ? (
          <EmptyState dense icon={<ClipboardCheck />} title={t('of.sv.none')} />
        ) : (
          <ul className="m-0 grid list-none gap-2 p-0">
            {mine.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
                <span className="min-w-0 flex-1">
                  <b className="font-medium">{s.title}</b>
                  <span className="block text-xs text-muted-foreground">
                    {s.section ?? ''} · {t('of.sv.responses', { n: s.responses, of: s.classSize })}
                    {s.mean !== null ? ` · ${t('of.sv.mean', { m: fmt.number(s.mean) })}` : ''}
                    {s.closesAt ? ` · ${t('of.sv.closes', { d: fmt.date(s.closesAt.slice(0, 10), 'short') })}` : ''}
                  </span>
                </span>
                <StatusPill tone={s.status === 'open' ? 'live' : 'neutral'}>{t(`of.sv.status.${s.status}` as MessageKey)}</StatusPill>
                {s.status === 'open' && (
                  <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => remindSurvey(s.id), undefined, (r) => { toast.success(t('of.sv.reminded', { n: r.reminded })); router.refresh(); })}>
                    {t('of.sv.remind')}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card title={t('of.sv.open')} testId="of-open-survey">
        <p className="m-0 mb-3 text-[13px] text-muted-foreground">{t('of.sv.openHelp')}</p>
        <div className="grid gap-3">
          <FormField label={t('of.col.class')}>
            <TextInput select value={f.sectionId} onChange={(e) => setF({ ...f, sectionId: e.target.value })}>
              {d.sections.map((s) => (
                <MenuItem key={s.id} value={s.id}>
                  {s.name}
                </MenuItem>
              ))}
            </TextInput>
          </FormField>
          <FormField label={t('of.sv.closesOn')}>
            <TextInput type="date" value={f.closesAt} onChange={(e) => setF({ ...f, closesAt: e.target.value })} />
          </FormField>
          <Button disabled={pending || !f.sectionId || !f.closesAt} onClick={() => run(() => openExitSurvey({ kind: 'course_exit', sectionId: f.sectionId, subjectId: d.subject.id, closesAt: f.closesAt }), t('of.sv.opened'), () => router.refresh())} data-testid="of-open-exit">
            <Send className="size-4" aria-hidden />
            {t('of.sv.openButton')}
          </Button>
        </div>
      </Card>
    </div>
  );
}

function FilesPanel({ d }: { d: WorkspaceData }) {
  const { t } = useI18n();
  const q = `academicYearId=${d.yearId}`;
  const items = useMemo(
    () => [
      { key: 'course-file', title: t('of.file.courseFile'), body: t('of.file.courseFileBody') },
      { key: 'attainment-report', title: t('of.file.report'), body: t('of.file.reportBody') },
    ],
    [t],
  );
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {items.map((i) => (
        <Card key={i.key} title={i.title} testId={`of-${i.key}`}>
          <p className="m-0 mb-4 text-[13px] text-muted-foreground">{i.body}</p>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <a href={exportHref(`/v1/obe/subjects/${d.subject.id}/${i.key}.pdf?${q}`)} target="_blank" rel="noreferrer">
                <Download className="size-4" aria-hidden />
                PDF
              </a>
            </Button>
            <Button asChild variant="outline">
              <a href={exportHref(`/v1/obe/subjects/${d.subject.id}/${i.key}.xlsx?${q}`)} download>
                <FileSpreadsheet className="size-4" aria-hidden />
                {t('of.file.excel')}
              </a>
            </Button>
          </div>
        </Card>
      ))}
    </div>
  );
}
