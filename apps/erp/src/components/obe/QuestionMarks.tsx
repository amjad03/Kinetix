'use client';

import { ClipboardPaste, Copy, Download, FileUp, Plus, Save, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react';
import { copyPaper, savePaper, saveQuestionMarks, uploadMarksSheet } from '@/app/(dashboard)/obe/flagship-actions';
import { useRun } from '@/components/exams/useRun';
import { MenuItem } from '@/components/kx';
import { Button } from '@/components/shadcn/button';
import { Card, EmptyState, FormRow, StatusPill, TextInput, useToast } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import { exportHref } from '@/lib/exams';
import { changedEntries, moveFrom, parseClipboard, pasteInto, rowProblems, type Difficulty, type GridState, type Paper } from '@/lib/obe-flagship';
import { cn } from '@/lib/utils';

const BLOOM = ['Remember', 'Understand', 'Apply', 'Analyse', 'Evaluate', 'Create'] as const;
const DIFFICULTY = ['easy', 'medium', 'hard'] as const;
type Q = { no: string; part: string; maxMarks: string; bloomLevel: string; difficulty: string; cos: string[] };

/** The question paper: questions with marks, Bloom level, difficulty and the COs each tests; copied from another assessment or a question bank paper. */
export function PaperEditor({ paper, others, qbPapers }: { paper: Paper; others: { id: string; title: string; section: string }[]; qbPapers: { id: string; title: string }[] }) {
  const { t } = useI18n();
  const router = useRouter();
  const { pending, run, feedback } = useRun();
  const [qs, setQs] = useState<Q[]>(paper.questions.map((q) => ({ no: q.no, part: q.part, maxMarks: String(q.maxMarks), bloomLevel: q.bloomLevel ?? '', difficulty: q.difficulty ?? '', cos: q.cos.map((c) => c.coId) })));
  const [from, setFrom] = useState('');
  const locked = paper.students.some((s) => s.questionWise);
  const total = qs.reduce((s, q) => s + (Number(q.maxMarks) || 0), 0);
  const set = (i: number, patch: Partial<Q>) => setQs(qs.map((q, j) => (j === i ? { ...q, ...patch } : q)));
  const short = qs.length > 0 && total + 1e-9 < paper.assessment.maxMarks;
  const save = () => run(() => savePaper(paper.assessment.id, qs.map((q) => ({ no: q.no, part: q.part, maxMarks: Number(q.maxMarks), bloomLevel: q.bloomLevel || null, difficulty: (q.difficulty || null) as Difficulty | null, cos: q.cos.map((coId) => ({ coId, weight: 1 })) }))), t('of.paper.saved'), () => router.refresh());
  return (
    <Card
      title={t('of.paper.title')}
      subtitle={t('of.paper.sub', { total, max: paper.assessment.maxMarks })}
      action={
        paper.canTag && qs.length === 0 ? (
          <span className="flex flex-wrap items-center gap-2">
            <TextInput size="small" select className="min-w-[200px]" value={from} onChange={(e) => setFrom(e.target.value)} aria-label={t('of.paper.copyFrom')}>
              {others.map((o) => (
                <MenuItem key={`a:${o.id}`} value={`a:${o.id}`}>
                  {o.title} · {o.section}
                </MenuItem>
              ))}
              {qbPapers.map((o) => (
                <MenuItem key={`q:${o.id}`} value={`q:${o.id}`}>
                  {t('of.paper.qb', { title: o.title })}
                </MenuItem>
              ))}
            </TextInput>
            <Button size="sm" variant="outline" disabled={pending || !from} onClick={() => run(() => copyPaper(paper.assessment.id, from.startsWith('a:') ? { fromAssessmentId: from.slice(2) } : { qbPaperId: from.slice(2) }), t('of.paper.copied'), () => router.refresh())}>
              <Copy className="size-4" aria-hidden />
              {t('of.paper.copy')}
            </Button>
          </span>
        ) : undefined
      }
      testId="of-paper"
    >
      {feedback}
      {locked && <p className="m-0 mb-3 text-[13px] text-muted-foreground">{t('of.paper.locked')}</p>}
      {qs.length === 0 ? (
        <EmptyState dense icon={<ClipboardPaste />} title={t('of.paper.none')}>
          {t(paper.assessment.evidence === 'see' ? 'of.paper.noneSee' : 'of.paper.noneBody')}
        </EmptyState>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-[13px]">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="py-2 pr-2 font-medium">{t('of.col.question')}</th>
                <th className="py-2 pr-2 font-medium">{t('of.paper.part')}</th>
                <th className="py-2 pr-2 font-medium">{t('of.col.outOf')}</th>
                <th className="py-2 pr-2 font-medium">{t('of.col.bloom')}</th>
                <th className="py-2 pr-2 font-medium">{t('oa.col.difficulty')}</th>
                <th className="py-2 pr-2 font-medium">{t('of.col.cos')}</th>
                <th className="py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {qs.map((q, i) => (
                <tr key={i} className="border-b align-top last:border-0">
                  <td className="py-1.5 pr-2">
                    <TextInput size="small" className="w-[70px]" value={q.no} disabled={locked || !paper.canTag} onChange={(e) => set(i, { no: e.target.value })} inputProps={{ 'aria-label': t('of.paper.noFor', { n: i + 1 }) }} />
                  </td>
                  <td className="py-1.5 pr-2">
                    <TextInput size="small" className="w-[100px]" value={q.part} disabled={!paper.canTag} onChange={(e) => set(i, { part: e.target.value })} inputProps={{ 'aria-label': t('of.paper.partFor', { n: q.no }) }} />
                  </td>
                  <td className="py-1.5 pr-2">
                    <TextInput size="small" className="w-[80px]" type="number" value={q.maxMarks} disabled={locked || !paper.canTag} onChange={(e) => set(i, { maxMarks: e.target.value })} inputProps={{ min: 0.5, step: 0.5, 'aria-label': t('of.paper.maxFor', { n: q.no }) }} />
                  </td>
                  <td className="py-1.5 pr-2">
                    <TextInput size="small" select className="w-[140px]" value={q.bloomLevel} disabled={!paper.canTag} onChange={(e) => set(i, { bloomLevel: e.target.value })} inputProps={{ 'aria-label': t('of.paper.bloomFor', { n: q.no }) }}>
                      <MenuItem value="">-</MenuItem>
                      {BLOOM.map((b, k) => (
                        <MenuItem key={b} value={b}>
                          {t(`obe2.bloom.${k + 1}` as MessageKey)}
                        </MenuItem>
                      ))}
                    </TextInput>
                  </td>
                  <td className="py-1.5 pr-2">
                    <TextInput size="small" select className="w-[120px]" value={q.difficulty} disabled={!paper.canTag} onChange={(e) => set(i, { difficulty: e.target.value })} inputProps={{ 'aria-label': t('oa.paper.difficultyFor', { n: q.no }) }} data-testid="of-paper-difficulty">
                      <MenuItem value="">-</MenuItem>
                      {DIFFICULTY.map((d) => (
                        <MenuItem key={d} value={d}>
                          {t(`oa.difficulty.${d}`)}
                        </MenuItem>
                      ))}
                    </TextInput>
                  </td>
                  <td className="py-1.5 pr-2">
                    <span className="flex flex-wrap gap-1.5" role="group" aria-label={t('of.paper.cosFor', { n: q.no })}>
                      {paper.cos.map((c) => {
                        const on = q.cos.includes(c.id);
                        return (
                          <button key={c.id} type="button" title={c.statement} disabled={!paper.canTag} aria-pressed={on} onClick={() => set(i, { cos: on ? q.cos.filter((x) => x !== c.id) : [...q.cos, c.id] })} className={cn('h-7 rounded-md border px-2 text-xs font-medium', on ? 'border-primary bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:bg-muted')}>
                            {c.code}
                          </button>
                        );
                      })}
                    </span>
                  </td>
                  <td className="py-1.5 text-right">
                    {!locked && paper.canTag && (
                      <Button size="icon-sm" variant="ghost" onClick={() => setQs(qs.filter((_, j) => j !== i))} aria-label={t('of.paper.remove', { n: q.no })}>
                        <Trash2 className="size-4" aria-hidden />
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {paper.canTag && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {!locked && (
            <Button variant="outline" onClick={() => setQs([...qs, { no: String(qs.length + 1), part: qs.at(-1)?.part ?? '', maxMarks: qs.at(-1)?.maxMarks ?? '5', bloomLevel: '', difficulty: '', cos: [] }])} data-testid="of-paper-add">
              <Plus className="size-4" aria-hidden />
              {t('of.paper.add')}
            </Button>
          )}
          <span className="flex-1" />
          {short && <span className="text-[13px] text-red-ink">{t('of.paper.short', { total, max: paper.assessment.maxMarks })}</span>}
          <Button disabled={pending || short || qs.some((q) => !q.no.trim() || !(Number(q.maxMarks) > 0))} onClick={save} data-testid="of-paper-save">
            <Save className="size-4" aria-hidden />
            {t('of.paper.save')}
          </Button>
        </div>
      )}
      {paper.questions.length > 0 && (
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <div>
            <h3 className="m-0 mb-2 text-sm font-semibold">{t('of.paper.weightage')}</h3>
            <ul className="m-0 grid list-none gap-1.5 p-0 text-[13px]">
              {paper.coMarks.map((c) => (
                <li key={c.coId} className="grid grid-cols-[48px_minmax(0,1fr)_auto] items-center gap-2">
                  <b className="font-semibold">{c.code}</b>
                  <span className="h-2 overflow-hidden rounded bg-muted">
                    <span className="block h-full bg-primary" style={{ width: `${c.share}%` }} />
                  </span>
                  <span className="whitespace-nowrap text-right tabular-nums">{t('of.paper.coShare', { marks: c.marks, share: c.share })}</span>
                </li>
              ))}
            </ul>
            {paper.assessment.evidence === 'see' && <p className="m-0 mt-2 text-xs text-muted-foreground">{t(`of.paper.apportion.${paper.apportion}` as MessageKey)}</p>}
          </div>
          <div>
            <h3 className="m-0 mb-2 text-sm font-semibold">{t('of.att.bloom')}</h3>
            <ul className="m-0 grid list-none gap-1.5 p-0 text-[13px]">
              {paper.bloom.map((b) => (
                <li key={b.level} className="grid grid-cols-[96px_1fr_40px] items-center gap-2">
                  <span>{t(`obe2.bloom.${b.level}` as MessageKey)}</span>
                  <span className="h-2 overflow-hidden rounded bg-muted">
                    <span className="block h-full bg-primary" style={{ width: `${paper.paperMarks ? (b.marks / paper.paperMarks) * 100 : 0}%` }} />
                  </span>
                  <span className="text-right tabular-nums">{b.marks}</span>
                </li>
              ))}
            </ul>
          </div>
          <div data-testid="of-paper-difficulty-spread">
            <h3 className="m-0 mb-2 text-sm font-semibold">{t('oa.paper.difficulty')}</h3>
            <ul className="m-0 grid list-none gap-1.5 p-0 text-[13px]">
              {(paper.difficulty ?? []).map((d) => (
                <li key={d.level} className="grid grid-cols-[96px_1fr_40px] items-center gap-2">
                  <span>{t(`oa.difficulty.${d.level}`)}</span>
                  <span className="h-2 overflow-hidden rounded bg-muted">
                    <span className="block h-full bg-primary" style={{ width: `${paper.paperMarks ? (d.marks / paper.paperMarks) * 100 : 0}%` }} />
                  </span>
                  <span className="text-right tabular-nums">{d.marks}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </Card>
  );
}

/**
 * Question-wise marks: one row per student, one column per question. Type and press Enter to go down the column (Shift+Enter
 * up), arrows move, Tab goes across, and a block copied from Excel pastes from the focused cell ("AB" marks a student absent).
 * Cells above the question's maximum turn red; the total is the sum. Save sends only the rows that changed.
 */
export function MarksGrid({ paper }: { paper: Paper }) {
  const { t, fmt } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const { pending, run, feedback } = useRun();
  const qs = paper.questions;
  const initial = useMemo<GridState>(() => ({ values: paper.students.map((s) => qs.map((q) => (s.marks[q.id] === null || s.marks[q.id] === undefined ? '' : String(s.marks[q.id])))), absent: paper.students.map((s) => s.absent) }), [paper, qs]);
  const [g, setG] = useState<GridState>(initial);
  const [sheet, setSheet] = useState<{ errors: { row: number; message: string }[]; rows: number; saved: boolean } | null>(null);
  const refs = useRef<(HTMLInputElement | null)[][]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const maxima = qs.map((q) => q.maxMarks);
  const changes = changedEntries(initial, g, paper.students.map((s) => s.id), qs.map((q) => q.id));
  const problems = g.values.map((row, r) => (g.absent[r] ? { cols: [], total: null, over: false } : rowProblems(row, maxima, paper.assessment.maxMarks)));
  const invalid = problems.some((p) => p.cols.length || p.over);
  const focus = (r: number, c: number) => refs.current[r]?.[c]?.focus();
  const onKey = (e: KeyboardEvent<HTMLInputElement>, r: number, c: number) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      if (changes.length && !invalid) save();
      return;
    }
    const caretAtEdge = e.key === 'ArrowLeft' ? e.currentTarget.selectionStart === 0 : e.key === 'ArrowRight' ? e.currentTarget.selectionEnd === e.currentTarget.value.length : true;
    if (!caretAtEdge) return;
    const next = moveFrom(e.key, r, c, g.values.length, qs.length, e.shiftKey);
    if (!next) return;
    e.preventDefault();
    focus(next.row, next.col);
    refs.current[next.row]?.[next.col]?.select();
  };
  const onPaste = (e: ClipboardEvent<HTMLInputElement>, r: number, c: number) => {
    const text = e.clipboardData.getData('text/plain');
    if (!/[\t\n]/.test(text)) return;
    e.preventDefault();
    const res = pasteInto(g, r, c, parseClipboard(text));
    setG(res.grid);
    toast.info(t('of.grid.pasted', { n: res.filled }));
  };
  const set = (r: number, c: number, v: string) => setG({ ...g, values: g.values.map((row, i) => (i === r ? row.map((x, j) => (j === c ? v : x)) : row)) });
  const save = () => run(() => saveQuestionMarks(paper.assessment.id, changes), t('of.grid.saved', { n: changes.length }), () => router.refresh());
  const upload = (check: boolean) => {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    const form = new FormData();
    form.set('file', file);
    form.set('check', String(check));
    run(() => uploadMarksSheet(paper.assessment.id, form), undefined, (r) => {
      setSheet(r);
      if (r.saved) {
        toast.success(t('of.grid.imported', { n: r.rows }));
        router.refresh();
      }
    });
  };
  if (!qs.length) return null;
  return (
    <Card
      title={t('of.grid.title')}
      subtitle={paper.editable ? t('of.grid.help') : t('of.grid.readOnly', { status: paper.assessment.markStatus })}
      action={
        <span className="flex flex-wrap gap-2">
          <Button asChild size="sm" variant="outline">
            <a href={exportHref(`/v1/obe/assessments/${paper.assessment.id}/question-marks.xlsx`)} download data-testid="of-sheet-download">
              <Download className="size-4" aria-hidden />
              {t('of.grid.template')}
            </a>
          </Button>
          {paper.editable && (
            <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()} data-testid="of-sheet-upload">
              <FileUp className="size-4" aria-hidden />
              {t('of.grid.upload')}
            </Button>
          )}
        </span>
      }
      testId="of-grid"
    >
      {feedback}
      <input ref={fileRef} type="file" accept=".xlsx" className="hidden" onChange={() => upload(true)} aria-label={t('of.grid.upload')} />
      {sheet && (
        <div className={cn('mb-3 rounded-md border p-3 text-[13px]', sheet.errors.length ? 'border-red/40 bg-red/5' : 'bg-muted/40')} role="status" data-testid="of-sheet-result">
          {sheet.errors.length ? (
            <>
              <b className="font-semibold">{t('of.grid.sheetErrors', { n: sheet.errors.length })}</b>
              <ul className="m-0 mt-1 list-disc pl-5">
                {sheet.errors.slice(0, 12).map((e, i) => (
                  <li key={i}>{e.row ? t('of.grid.row', { n: e.row, msg: e.message }) : e.message}</li>
                ))}
              </ul>
            </>
          ) : sheet.saved ? (
            t('of.grid.imported', { n: sheet.rows })
          ) : (
            <span className="flex flex-wrap items-center gap-3">
              {t('of.grid.sheetOk', { n: sheet.rows })}
              <Button size="sm" disabled={pending} onClick={() => upload(false)}>
                {t('of.grid.apply')}
              </Button>
            </span>
          )}
        </div>
      )}
      <div className="max-h-[70vh] overflow-auto rounded-md border">
        <table className="w-full border-collapse text-[13px]" data-testid="of-marks-grid">
          <thead className="sticky top-0 z-[2] bg-card">
            <tr className="border-b text-xs text-muted-foreground">
              <th className="sticky left-0 z-[3] bg-card px-2 py-2 text-left font-medium">{t('of.col.student')}</th>
              <th className="px-1 py-2 text-center font-medium">{t('of.grid.absent')}</th>
              {qs.map((q) => (
                <th key={q.id} className="px-1 py-2 text-center font-medium" title={q.cos.map((c) => paper.cos.find((x) => x.id === c.coId)?.code).join(', ')}>
                  Q{q.no}
                  <span className="block font-normal">/{q.maxMarks}</span>
                </th>
              ))}
              <th className="px-2 py-2 text-right font-medium">{t('of.grid.total')}</th>
            </tr>
          </thead>
          <tbody>
            {paper.students.map((s, r) => {
              const p = problems[r];
              const dirty = changes.some((c) => c.studentId === s.id);
              return (
                <tr key={s.id} className={cn('border-b last:border-0', dirty && 'bg-primary/5')}>
                  <th scope="row" className="sticky left-0 z-[1] max-w-[13rem] truncate bg-card px-2 py-1 text-left font-normal">
                    <span className="tabular-nums text-muted-foreground">{s.rollNo}</span> {s.name}
                  </th>
                  <td className="px-1 py-1 text-center">
                    <input type="checkbox" className="size-4 accent-[var(--primary)]" checked={g.absent[r]} disabled={!paper.editable} onChange={(e) => setG({ ...g, absent: g.absent.map((a, i) => (i === r ? e.target.checked : a)) })} aria-label={t('of.grid.absentFor', { name: s.name })} />
                  </td>
                  {qs.map((q, c) => {
                    const bad = p.cols.includes(c);
                    return (
                      <td key={q.id} className="px-0.5 py-0.5">
                        <input
                          ref={(el) => {
                            refs.current[r] = refs.current[r] ?? [];
                            refs.current[r][c] = el;
                          }}
                          value={g.values[r][c]}
                          disabled={!paper.editable || g.absent[r]}
                          inputMode="decimal"
                          aria-label={t('of.grid.cell', { name: s.name, q: q.no })}
                          aria-invalid={bad || undefined}
                          onChange={(e) => set(r, c, e.target.value)}
                          onKeyDown={(e) => onKey(e, r, c)}
                          onPaste={(e) => onPaste(e, r, c)}
                          onFocus={(e) => e.currentTarget.select()}
                          className={cn('h-8 w-14 rounded border bg-background px-1.5 text-center tabular-nums outline-none focus:border-primary focus:ring-2 focus:ring-primary/30 disabled:bg-muted/50', bad && 'border-red text-red-ink')}
                          data-cell={`${r}:${c}`}
                        />
                      </td>
                    );
                  })}
                  <td className={cn('px-2 py-1 text-right font-semibold tabular-nums', p.over && 'text-red-ink')}>{g.absent[r] ? <StatusPill tone="neutral">AB</StatusPill> : p.total === null ? '-' : fmt.number(p.total)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {paper.editable && (
        <FormRow className="mt-3">
          <span className="text-[13px] text-muted-foreground" role="status">
            {invalid ? t('of.grid.fix') : changes.length ? t('of.grid.unsaved', { n: changes.length }) : t('of.grid.clean')}
          </span>
          <span className="flex-1" />
          <Button variant="outline" disabled={pending || !changes.length} onClick={() => setG(initial)}>
            {t('of.grid.undo')}
          </Button>
          <Button disabled={pending || !changes.length || invalid} onClick={save} data-testid="of-grid-save">
            <Save className="size-4" aria-hidden />
            {t('of.grid.save')}
          </Button>
        </FormRow>
      )}
      <p className="m-0 mt-3 text-xs text-muted-foreground">{t('of.grid.keys')}</p>
    </Card>
  );
}
