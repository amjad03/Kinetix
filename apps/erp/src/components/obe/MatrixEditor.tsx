'use client';

import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
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
import { activateCoSet, addCo, newCoSet, removeCo, saveMatrix } from '@/app/(dashboard)/obe/actions';
import { TableFrame } from '@/components/DataTable';
import { useRun } from '@/components/exams/useRun';
import { useI18n } from '@/i18n/client';
import { nextStrength, setCell, strengthMap, uncoveredOutcomes, unmappedCos, type CoSet, type MatrixData } from '@/lib/obe';

export function MatrixEditor({ subjects, subjectId, sets, setId, matrix, canEdit }: { subjects: { id: string; code: string; name: string }[]; subjectId: string; sets: CoSet[]; setId: string | null; matrix: MatrixData | null; canEdit: boolean }) {
  const { t } = useI18n();
  const router = useRouter();
  const { pending, run, feedback } = useRun();
  const [cells, setCells] = useState(matrix?.cells ?? []);
  const [co, setCo] = useState({ code: '', statement: '', bloomLevel: '' });
  const draft = matrix?.set.status === 'draft';
  const get = strengthMap(cells);
  return (
    <>
      <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mb: 2 }}>
        <TextField select size="small" label={t('exm.f.subject')} value={subjectId} onChange={(e) => router.push(`/obe/matrix?subjectId=${e.target.value}`)} sx={{ minWidth: 280 }}>
          {subjects.map((s) => (
            <MenuItem key={s.id} value={s.id}>
              {s.code} {s.name}
            </MenuItem>
          ))}
        </TextField>
        <TextField select size="small" label={t('obe.f.version')} value={setId ?? ''} onChange={(e) => router.push(`/obe/matrix?subjectId=${subjectId}&setId=${e.target.value}`)} sx={{ minWidth: 200 }}>
          {sets.map((s) => (
            <MenuItem key={s.id} value={s.id}>
              v{s.version} · {t(`obe.cs.${s.status}`)}
            </MenuItem>
          ))}
        </TextField>
        {canEdit && (
          <Button variant="outlined" disabled={pending || sets.some((s) => s.status === 'draft')} onClick={() => run(() => newCoSet(subjectId, ''), t('obe.versionStarted'))}>
            {t('obe.newVersion')}
          </Button>
        )}
      </Box>
      {feedback}
      {!matrix ? (
        <Typography color="text.secondary">{t('obe.noVersion')}</Typography>
      ) : (
        <>
          {!draft && <Alert severity="info" sx={{ mb: 2 }}>{t('obe.frozen')}</Alert>}
          {unmappedCos(matrix.cos, cells).length > 0 && <Alert severity="warning" sx={{ mb: 1 }}>{t('obe.unmapped', { codes: unmappedCos(matrix.cos, cells).map((c) => c.code).join(', ') })}</Alert>}
          {matrix.cos.length > 0 && uncoveredOutcomes(matrix.outcomes, cells).length > 0 && <Alert severity="warning" sx={{ mb: 1 }}>{t('obe.uncovered', { codes: uncoveredOutcomes(matrix.outcomes, cells).map((c) => c.code).join(', ') })}</Alert>}
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
                    <TableCell title={c.statement}>{c.code} · {c.statement}</TableCell>
                    {matrix.outcomes.map((o) => {
                      const v = get(c.id, o.id);
                      return (
                        <TableCell key={o.id} align="center" padding="none">
                          <Button size="small" disabled={!canEdit || !draft} onClick={() => setCells(setCell(cells, c.id, o.id, nextStrength(v)))} aria-label={`${c.code} ${o.code}: ${v}`} sx={{ minWidth: 40, fontWeight: v ? 700 : 400, color: v ? 'primary.main' : 'text.disabled' }}>
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
          <Typography variant="caption" color="text.secondary">
            {t('obe.legend')}
          </Typography>
          {canEdit && draft && (
            <>
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 2 }}>
                <TextField size="small" label={t('exm.f.code')} value={co.code} onChange={(e) => setCo({ ...co, code: e.target.value })} sx={{ width: 100 }} />
                <TextField size="small" label={t('obe.f.statement')} value={co.statement} onChange={(e) => setCo({ ...co, statement: e.target.value })} sx={{ flex: 1, minWidth: 260 }} />
                <TextField size="small" label={t('obe.f.bloom')} value={co.bloomLevel} onChange={(e) => setCo({ ...co, bloomLevel: e.target.value })} sx={{ width: 140 }} />
                <Button variant="outlined" disabled={pending} onClick={() => run(() => addCo(matrix.set.id, co), t('obe.added'), () => setCo({ code: '', statement: '', bloomLevel: '' }))}>
                  {t('obe.addCo')}
                </Button>
              </Box>
              <Box sx={{ display: 'flex', gap: 1, mt: 2 }}>
                <Button variant="contained" disabled={pending} onClick={() => run(() => saveMatrix(matrix.set.id, cells), t('obe.matrixSaved'))}>
                  {t('obe.saveMatrix')}
                </Button>
                <Button variant="outlined" color="success" disabled={pending} onClick={() => run(() => activateCoSet(matrix.set.id), t('obe.activated'))}>
                  {t('obe.activate')}
                </Button>
              </Box>
            </>
          )}
        </>
      )}
    </>
  );
}
