'use client';

import { BookOpen, Download, FileUp, Flag, Save, Target } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { savePeoPo, saveUnitPlan, uploadTargetsSheet } from '@/app/(dashboard)/obe/flagship-actions';
import { useRun } from '@/components/exams/useRun';
import { KitList, type ColSpec } from '@/components/registers/KitList';
import { Button } from '@/components/shadcn/button';
import { MenuItem } from '@/components/kx';
import { Card, EmptyState, StatusPill, TextInput, useToast } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import { exportHref } from '@/lib/exams';
import type { PeoPo, UnitPlan } from '@/lib/obe-flagship';
import type { ListState, RecordMeta, RecordsPage, Row } from '@/lib/records';
import { cn } from '@/lib/utils';
import { LevelCell } from './Heat';

type Props = { meta: RecordMeta; page: RecordsPage<Row>; state: ListState };

const STATEMENT_COLUMNS: ColSpec[] = [
  { key: 'kind', header: 'oa.col.kind', kind: 'choice', tone: (v) => (v === 'po' ? 'info' : v === 'pso' ? 'success' : 'neutral') },
  { key: 'code', header: 'oa.col.code', kind: 'strong' },
  { key: 'statement', header: 'oa.col.statement', kind: 'wrap' },
  { key: 'mapped', header: 'oa.col.mapped', kind: 'number', sortKey: false, hideBelow: 'md' },
  { key: 'ord', header: 'oa.col.order', kind: 'number', hideBelow: 'lg' },
  { key: 'program', header: 'oa.col.programme', sortKey: false, defaultHidden: true },
];

/**
 * A programme's vision, mission, PEOs, POs and PSOs as a record kit list: add, edit, bulk order, Excel import and
 * export, history, and delete (refused while course outcomes or the PEO-mission matrix use the statement).
 */
export function StatementsList(p: Props) {
  return <KitList {...p} label="oa.st.title" columns={STATEMENT_COLUMNS} empty={{ icon: <Flag />, title: 'oa.st.none', body: 'oa.st.noneBody' }} testId="obe-statements" />;
}

/** Download the year's targets as Excel and upload them back: checked first, saved only when there are no errors. */
export function TargetsSheet({ programId, yearId, canEdit }: { programId: string; yearId: string; canEdit: boolean }) {
  const { t } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const { pending, run, feedback } = useRun();
  const [sheet, setSheet] = useState<{ saved: boolean; rows: number; errors: { row: number; message: string }[] } | null>(null);
  const upload = (check: boolean) => {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    const form = new FormData();
    form.set('file', file);
    form.set('check', String(check));
    run(() => uploadTargetsSheet(programId, yearId, form), undefined, (r) => {
      setSheet(r);
      if (r.saved) {
        toast.success(t('oa.tg.imported', { n: r.rows }));
        router.refresh();
      }
    });
  };
  return (
    <div className="mb-4" data-testid="targets-sheet">
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild size="sm" variant="outline">
          <a href={exportHref(`/v1/obe/programs/${programId}/targets.xlsx?academicYearId=${yearId}`)} download data-testid="targets-download">
            <Download className="size-4" aria-hidden />
            {t('oa.tg.download')}
          </a>
        </Button>
        {canEdit && (
          <Button size="sm" variant="outline" disabled={pending} onClick={() => fileRef.current?.click()} data-testid="targets-upload">
            <FileUp className="size-4" aria-hidden />
            {t('oa.tg.upload')}
          </Button>
        )}
        <input ref={fileRef} type="file" accept=".xlsx" className="hidden" onChange={() => upload(true)} aria-label={t('oa.tg.upload')} />
      </div>
      {feedback}
      {sheet && (
        <div className={cn('mt-3 rounded-md border p-3 text-[13px]', sheet.errors.length ? 'border-red/40 bg-red/5' : 'bg-muted/40')} role="status" data-testid="targets-sheet-result">
          {sheet.errors.length ? (
            <>
              <b className="font-semibold">{t('oa.tg.sheetErrors', { n: sheet.errors.length })}</b>
              <ul className="m-0 mt-1 list-disc pl-5">
                {sheet.errors.slice(0, 12).map((e, i) => (
                  <li key={i}>{t('oa.tg.row', { n: e.row, msg: e.message })}</li>
                ))}
              </ul>
            </>
          ) : sheet.saved ? (
            t('oa.tg.imported', { n: sheet.rows })
          ) : (
            <span className="flex flex-wrap items-center gap-3">
              {t('oa.tg.sheetOk', { n: sheet.rows })}
              <Button size="sm" disabled={pending} onClick={() => upload(false)} data-testid="targets-apply">
                {t('oa.tg.apply')}
              </Button>
            </span>
          )}
        </div>
      )}
    </div>
  );
}

const STRENGTH = [0, 1, 2, 3];

/**
 * The PEO-PO/PSO matrix (strength 1 to 3 with a reason) and each PEO's attainment for the year: the average of its POs'
 * overall attainment weighted by the matrix.
 */
export function PeoPoEditor({ programId, data, canEdit }: { programId: string; data: PeoPo; canEdit: boolean }) {
  const { t } = useI18n();
  const { pending, run, feedback } = useRun();
  const [cells, setCells] = useState(data.cells);
  const get = (p: string, o: string) => cells.find((c) => c.peoId === p && c.outcomeId === o);
  const set = (p: string, o: string, patch: Partial<{ strength: number; justification: string }>) => {
    const cur = get(p, o) ?? { peoId: p, outcomeId: o, strength: 0, justification: '' };
    setCells([...cells.filter((c) => c !== cur), { ...cur, ...patch }].filter((c) => c.strength > 0 || c.justification));
  };
  const att = new Map(data.attainment.map((a) => [a.peoId, a]));
  return (
    <Card>
      <h2 className="m-0 mb-1 text-base font-semibold">{t('oa.pp.title')}</h2>
      <p className="m-0 mb-4 text-[13px] text-muted-foreground">{t('oa.pp.help')}</p>
      {feedback}
      {data.peos.length === 0 || data.outcomes.length === 0 ? (
        <EmptyState icon={<Target />} title={t('oa.pp.none')}>
          {t('oa.pp.noneBody')}
        </EmptyState>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-[13px]" data-testid="peo-po">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">{t('obe2.peo.peo')}</th>
                  {data.outcomes.map((o) => (
                    <th key={o.id} className="px-1 py-2 text-center font-medium" title={o.statement}>
                      {o.code}
                    </th>
                  ))}
                  <th className="py-2 pl-3 text-center font-medium">{t('oa.pp.attainment')}</th>
                </tr>
              </thead>
              <tbody>
                {data.peos.map((p) => {
                  const a = att.get(p.id);
                  return (
                    <tr key={p.id} className="border-b align-top last:border-0">
                      <th scope="row" className="max-w-[320px] py-2 pr-3 text-left font-normal">
                        <b className="font-semibold">{p.code}</b> {p.statement}
                      </th>
                      {data.outcomes.map((o) => (
                        <td key={o.id} className="px-1 py-2 text-center">
                          <TextInput size="small" select value={String(get(p.id, o.id)?.strength ?? 0)} disabled={!canEdit} onChange={(e) => set(p.id, o.id, { strength: Number(e.target.value) })} inputProps={{ 'aria-label': t('oa.pp.cell', { peo: p.code, po: o.code }) }}>
                            {STRENGTH.map((s) => (
                              <MenuItem key={s} value={String(s)}>
                                {s === 0 ? '-' : s}
                              </MenuItem>
                            ))}
                          </TextInput>
                        </td>
                      ))}
                      <td className="py-2 pl-3 text-center" data-testid={`peo-att-${p.code}`}>
                        <LevelCell value={a?.value ?? null} target={data.targetLevel} title={a ? t('oa.pp.measured', { n: a.measured, of: a.mapped }) : undefined} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {cells.filter((c) => c.strength > 0).length > 0 && (
            <div className="mt-4 grid gap-2">
              {cells
                .filter((c) => c.strength > 0)
                .map((c) => {
                  const peo = data.peos.find((x) => x.id === c.peoId)?.code ?? '';
                  const po = data.outcomes.find((x) => x.id === c.outcomeId)?.code ?? '';
                  return (
                    <div key={`${c.peoId}:${c.outcomeId}`} className="grid items-center gap-2 sm:grid-cols-[180px_1fr]">
                      <span className="text-[13px] font-medium">
                        {peo} → {po} ({c.strength})
                      </span>
                      <TextInput size="small" value={c.justification} disabled={!canEdit} placeholder={t('obe2.justify.placeholder')} inputProps={{ maxLength: 500, 'aria-label': t('obe2.justify.label', { co: peo, po }) }} onChange={(e) => set(c.peoId, c.outcomeId, { justification: e.target.value })} />
                    </div>
                  );
                })}
            </div>
          )}
          {canEdit && (
            <div className="mt-4">
              <Button disabled={pending} onClick={() => run(() => savePeoPo(programId, cells.filter((c) => c.strength > 0)), t('obe2.saved'))} data-testid="peo-po-save">
                <Save className="size-4" aria-hidden />
                {t('oa.pp.save')}
              </Button>
            </div>
          )}
        </>
      )}
    </Card>
  );
}

/** The course plan: tick the COs each unit of the syllabus serves; COs that no unit serves are called out. */
export function UnitPlanEditor({ subjectId, plan, canEdit }: { subjectId: string; plan: UnitPlan; canEdit: boolean }) {
  const { t } = useI18n();
  const router = useRouter();
  const { pending, run, feedback } = useRun();
  const [links, setLinks] = useState<Set<string>>(new Set(plan.units.flatMap((u) => u.coCodes.map((c) => `${u.id}|${c}`))));
  const toggle = (unit: string, co: string) => {
    const k = `${unit}|${co}`;
    const next = new Set(links);
    if (next.has(k)) next.delete(k);
    else next.add(k);
    setLinks(next);
  };
  const served = new Set([...links].map((k) => k.split('|')[1]));
  const uncovered = plan.cos.map((c) => c.code).filter((c) => !served.has(c));
  if (!plan.units.length || !plan.cos.length) {
    return (
      <EmptyState icon={<BookOpen />} title={t(plan.units.length ? 'oa.up.noCos' : 'oa.up.noUnits')}>
        {t(plan.units.length ? 'oa.up.noCosBody' : 'oa.up.noUnitsBody')}
      </EmptyState>
    );
  }
  return (
    <Card title={t('oa.up.title')} subtitle={t('oa.up.sub', { v: plan.coVersion ?? '-' })}>
      {feedback}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-[13px]" data-testid="unit-plan">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="py-2 pr-3 font-medium">{t('oa.up.unit')}</th>
              {plan.cos.map((c) => (
                <th key={c.code} className="px-2 py-2 text-center font-medium" title={c.statement}>
                  {c.code}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {plan.units.map((u) => (
              <tr key={u.id} className="border-b align-top last:border-0">
                <th scope="row" className="max-w-[360px] py-2 pr-3 text-left font-normal">
                  <b className="font-semibold">{u.title}</b>
                  {u.topics.length > 0 && <span className="mt-0.5 block text-xs text-muted-foreground">{u.topics.join('; ')}</span>}
                </th>
                {plan.cos.map((c) => (
                  <td key={c.code} className="px-2 py-2 text-center">
                    <input type="checkbox" className="size-4 accent-[var(--primary)]" checked={links.has(`${u.id}|${c.code}`)} disabled={!canEdit} onChange={() => toggle(u.id, c.code)} aria-label={t('oa.up.cell', { unit: u.title, co: c.code })} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        {uncovered.length ? <StatusPill tone="warning">{t('oa.up.uncovered', { cos: uncovered.join(', ') })}</StatusPill> : <StatusPill tone="success">{t('oa.up.covered')}</StatusPill>}
        {canEdit && (
          <Button disabled={pending} onClick={() => run(() => saveUnitPlan(subjectId, [...links].map((k) => ({ chapterId: k.split('|')[0], coCode: k.split('|')[1] }))), t('obe2.saved'), () => router.refresh())} data-testid="unit-plan-save">
            <Save className="size-4" aria-hidden />
            {t('oa.up.save')}
          </Button>
        )}
      </div>
    </Card>
  );
}
