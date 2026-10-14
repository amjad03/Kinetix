'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { FormField, TextInput, FormRow } from '@/components/ui';
import { activateCoSet, addCo, newCoSet, removeCo, saveMatrix } from '@/app/(dashboard)/obe/actions';
import { TableFrame } from '@/components/DataTable';
import { useRun } from '@/components/exams/useRun';
import { useI18n } from '@/i18n/client';
import { BLOOM_CODES, nextStrength, setCell, setJustification, strengthMap, uncoveredOutcomes, unmappedCos, type CoSet, type CourseOutcome, type MatrixData } from '@/lib/obe';
import type { MessageKey } from '@/i18n/messages';

import { Alert, Button, MenuItem, Table, TableBody, TableCell, TableHead, TableRow } from '@/components/kx';
import { cn } from '@/lib/utils';
export function MatrixEditor({ subjects, subjectId, sets, setId, matrix, canEdit }: { subjects: { id: string; code: string; name: string }[]; subjectId: string; sets: CoSet[]; setId: string | null; matrix: MatrixData | null; canEdit: boolean }) {
  const { t } = useI18n();
  const router = useRouter();
  const { pending, run, feedback } = useRun();
  const [cells, setCells] = useState(matrix?.cells ?? []);
  const [co, setCo] = useState({ code: '', statement: '', bloomLevel: '' });
  const draft = matrix?.set.status === 'draft';
  const get = strengthMap(cells);
  const why = (c: CourseOutcome): string | null => {
    const v = c.verbCheck;
    if (!v || v.ok) return null;
    if (v.issue === 'none') return t('obe2.verb.none');
    if (v.issue === 'vague') return t('obe2.verb.vague', { verb: v.verb ?? '' });
    if (v.issue === 'unknown') return t('obe2.verb.unknown', { verb: v.verb ?? '' });
    return t('obe2.verb.level', { verb: v.verb ?? '', levels: v.levels.map((l) => t(`obe2.bloom.${l}` as MessageKey)).join(', '), claimed: v.claimed ? t(`obe2.bloom.${v.claimed}` as MessageKey) : '' });
  };
  const flagged = matrix?.cos.filter((c) => why(c)) ?? [];
  const mapped = matrix ? cells.filter((c) => c.strength > 0) : [];
  const codeOf = (id: string) => matrix?.cos.find((c) => c.id === id)?.code ?? matrix?.outcomes.find((o) => o.id === id)?.code ?? '';
  return (
    <>
      <FormRow className="mb-4">
        <FormField label={t('exm.f.subject')}>
          <TextInput className="min-w-[280px]" select value={subjectId} onChange={(e) => router.push(`/obe/matrix?subjectId=${e.target.value}`)}>
            {subjects.map((s) => (
              <MenuItem key={s.id} value={s.id}>
                {s.code} {s.name}
              </MenuItem>
            ))}
          </TextInput>
        </FormField>
        <FormField label={t('obe.f.version')}>
          <TextInput className="min-w-[200px]" select value={setId ?? ''} onChange={(e) => router.push(`/obe/matrix?subjectId=${subjectId}&setId=${e.target.value}`)}>
            {sets.map((s) => (
              <MenuItem key={s.id} value={s.id}>
                v{s.version} · {t(`obe.cs.${s.status}`)}
              </MenuItem>
            ))}
          </TextInput>
        </FormField>
        {canEdit && (
          <Button variant="outlined" disabled={pending || sets.some((s) => s.status === 'draft')} onClick={() => run(() => newCoSet(subjectId, ''), t('obe.versionStarted'))}>
            {t('obe.newVersion')}
          </Button>
        )}
      </FormRow>
      {feedback}
      {!matrix ? (
        <p className="text-sm leading-[21px] text-muted-foreground">{t('obe.noVersion')}</p>
      ) : (
        <>
          {!draft && <Alert className="mb-4" severity="info">{t('obe.frozen')}</Alert>}
          {unmappedCos(matrix.cos, cells).length > 0 && <Alert className="mb-2" severity="warning">{t('obe.unmapped', { codes: unmappedCos(matrix.cos, cells).map((c) => c.code).join(', ') })}</Alert>}
          {matrix.cos.length > 0 && uncoveredOutcomes(matrix.outcomes, cells).length > 0 && <Alert className="mb-2" severity="warning">{t('obe.uncovered', { codes: uncoveredOutcomes(matrix.outcomes, cells).map((c) => c.code).join(', ') })}</Alert>}
          {flagged.length > 0 && <Alert className="mb-2" severity="warning">{t('obe2.verb.summary', { codes: flagged.map((c) => c.code).join(', ') })}</Alert>}
          <TableFrame testId="co-po-matrix">
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>CO</TableCell>
                  {matrix.outcomes.map((o) => (
                    <TableCell key={o.id} align="center" title={o.statement}>
                      {o.code}
                    </TableCell>
                  ))}
                  <TableCell />
                </TableRow>
              </TableHead>
              <TableBody>
                {matrix.cos.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell title={c.statement}>
                      {c.code} · {c.statement}
                      {c.bloomLevel && <span className="ml-1 text-xs text-muted-foreground">({c.bloomLevel})</span>}
                      {why(c) && <span className="block text-xs text-amber-ink" data-testid={`verb-${c.code}`}>{why(c)}</span>}
                    </TableCell>
                    {matrix.outcomes.map((o) => {
                      const v = get(c.id, o.id);
                      return (
                        <TableCell key={o.id} align="center" padding="none">
                          <Button className={cn('min-w-[40px]', v ? 'font-bold' : 'font-normal', v ? 'text-teal-ink' : 'text-faint')} size="small" disabled={!canEdit || !draft} onClick={() => setCells(setCell(cells, c.id, o.id, nextStrength(v)))} aria-label={`${c.code} ${o.code}: ${v}`}>
                            {v || '·'}
                          </Button>
                        </TableCell>
                      );
                    })}
                    <TableCell>
                      {canEdit && draft && (
                        <Button size="small" color="error" disabled={pending} onClick={() => run(() => removeCo(c.id), t('obe.removed'))}>
                          {t('exm.remove')}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableFrame>
          <span className="text-xs leading-4 tracking-[0.3px] text-muted-foreground">
            {t('obe.legend')}
          </span>
          {mapped.length > 0 && (
            <section className="mt-5" aria-labelledby="obe-justify" data-testid="obe-justify">
              <h2 id="obe-justify" className="m-0 mb-1 text-[15px] font-semibold">
                {t('obe2.justify.title')}
              </h2>
              <p className="m-0 mb-3 text-[13px] text-muted-foreground">{t('obe2.justify.help', { done: mapped.filter((c) => c.justification?.trim()).length, total: mapped.length })}</p>
              <div className="grid gap-2">
                {mapped.map((c) => (
                  <div key={`${c.coId}:${c.outcomeId}`} className="grid items-center gap-2 sm:grid-cols-[160px_1fr]">
                    <span className="text-[13px] font-medium">
                      {codeOf(c.coId)} → {codeOf(c.outcomeId)} ({c.strength})
                    </span>
                    <TextInput size="small" value={c.justification ?? ''} disabled={!canEdit || !draft} placeholder={t('obe2.justify.placeholder')} inputProps={{ 'aria-label': t('obe2.justify.label', { co: codeOf(c.coId), po: codeOf(c.outcomeId) }), maxLength: 500 }} onChange={(e) => setCells(setJustification(cells, c.coId, c.outcomeId, e.target.value))} />
                  </div>
                ))}
              </div>
            </section>
          )}
          {canEdit && draft && (
            <>
              <FormRow className="gap-2 mt-4">
                <FormField label={t('exm.f.code')}>
                  <TextInput className="w-[100px]" value={co.code} onChange={(e) => setCo({ ...co, code: e.target.value })} />
                </FormField>
                <FormField label={t('obe.f.statement')}>
                  <TextInput className="flex-1 min-w-[260px]" value={co.statement} onChange={(e) => setCo({ ...co, statement: e.target.value })} />
                </FormField>
                <FormField label={t('obe.f.bloom')}>
                  <TextInput className="w-[170px]" select value={co.bloomLevel} onChange={(e) => setCo({ ...co, bloomLevel: e.target.value })}>
                    {BLOOM_CODES.map((b, i) => (
                      <MenuItem key={b} value={b}>
                        {b} {t(`obe2.bloom.${i + 1}` as MessageKey)}
                      </MenuItem>
                    ))}
                  </TextInput>
                </FormField>
                <Button variant="outlined" disabled={pending} onClick={() => run(() => addCo(matrix.set.id, co), t('obe.added'), () => setCo({ code: '', statement: '', bloomLevel: '' }))}>
                  {t('obe.addCo')}
                </Button>
              </FormRow>
              <div className="flex gap-2 mt-4">
                <Button variant="contained" disabled={pending} onClick={() => run(() => saveMatrix(matrix.set.id, cells), t('obe.matrixSaved'))}>
                  {t('obe.saveMatrix')}
                </Button>
                <Button variant="outlined" color="success" disabled={pending} onClick={() => run(() => activateCoSet(matrix.set.id), t('obe.activated'))}>
                  {t('obe.activate')}
                </Button>
              </div>
            </>
          )}
        </>
      )}
    </>
  );
}
