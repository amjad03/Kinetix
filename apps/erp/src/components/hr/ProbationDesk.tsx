'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { decideProbation, recommendProbation } from '@/app/(dashboard)/hr/staff-actions';
import { FormField, StatusPill, TextInput, type Tone } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import { formatDate } from '@/lib/dates';
import type { Probationer } from '@/lib/staff-changes';

import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@/components/kx';
const TONE: Record<string, Tone> = { pending: 'warning', recommended: 'info', confirmed: 'success', extended: 'neutral' };

/** Staff on probation: the head of department recommends, the principal confirms or extends and the letter is a PDF. */
export function ProbationDesk({ rows, showAll, canDecide }: { rows: Probationer[]; showAll: boolean; canDecide: boolean }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<{ row: Probationer; mode: 'recommend' | 'decide' } | null>(null);
  const [choice, setChoice] = useState<'confirm' | 'extend'>('confirm');
  const [remarks, setRemarks] = useState('');
  const [months, setMonths] = useState('3');

  const close = () => {
    setOpen(null);
    setRemarks('');
    setChoice('confirm');
    setError(null);
  };
  const submit = () =>
    start(async () => {
      if (!open) return;
      const res = open.mode === 'recommend' ? await recommendProbation(open.row.userId, choice, remarks) : await decideProbation(open.row.userId, choice, remarks, Number(months));
      if (res.ok) {
        close();
        router.refresh();
      } else setError(res.error);
    });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-row justify-end">
        <Button component={Link} href={showAll ? '/hr/probation' : '/hr/probation?all=1'} size="small">
          {showAll ? t('as.prob.cancel') : t('as.prob.showAll')}
        </Button>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm leading-[21px] text-muted-foreground">{t('as.prob.none')}</p>
      ) : (
        <div className="rounded-[12px] border bg-card overflow-x-auto">
          <Table size="small" data-testid="probation-list">
            <TableHead>
              <TableRow>
                <TableCell>{t('as.prob.name')}</TableCell>
                <TableCell>{t('as.prob.dept')}</TableCell>
                <TableCell>{t('as.prob.due')}</TableCell>
                <TableCell>{t('as.prob.status')}</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((r) => {
                const status = r.review?.status ?? 'none';
                return (
                  <TableRow key={r.userId}>
                    <TableCell>
                      {r.fullName}
                      <div className="text-xs leading-4 tracking-[0.3px] text-muted-foreground">
                        {r.employeeCode}
                        {r.joinedOn ? ` · ${t('as.prob.joined')} ${formatDate(r.joinedOn, 'dayMonth', locale)}` : ''}
                      </div>
                    </TableCell>
                    <TableCell>{r.department ?? '-'}</TableCell>
                    <TableCell>
                      {r.dueOn ? formatDate(r.dueOn, 'dayMonth', locale) : '-'}
                      {r.daysLeft !== null && (
                        <Typography variant="caption" color={r.daysLeft < 0 ? 'error' : 'text.secondary'} component="div">
                          {r.daysLeft < 0 ? t('as.prob.overdue', { n: -r.daysLeft }) : t('as.prob.daysLeft', { n: r.daysLeft })}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      <StatusPill tone={TONE[status] ?? 'neutral'}>{t(`as.prob.st.${status}` as MessageKey)}</StatusPill>
                      {r.review?.recommendation && (
                        <div className="text-xs leading-4 tracking-[0.3px] text-muted-foreground">
                          {t('as.prob.hodSays', { what: t(`as.prob.rec.${r.review.recommendation}` as MessageKey) })}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap" align="right">
                      <Button size="small" onClick={() => setOpen({ row: r, mode: 'recommend' })}>
                        {t('as.prob.recommend')}
                      </Button>
                      {canDecide && (
                        <Button className="ml-2" size="small" variant="contained" onClick={() => setOpen({ row: r, mode: 'decide' })}>
                          {t('as.prob.decide')}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
      <Dialog open={!!open} onClose={close} fullWidth maxWidth="xs">
        <DialogTitle>{open ? `${open.mode === 'recommend' ? t('as.prob.recommend') : t('as.prob.decide')}: ${open.row.fullName}` : ''}</DialogTitle>
        <DialogContent>
          <div className="flex flex-col gap-4 pt-2">
            {error && <Alert severity="error">{error}</Alert>}
            <FormField label={t('as.prob.recommendation')}>
              <TextInput select value={choice} onChange={(e) => setChoice(e.target.value as 'confirm' | 'extend')}>
                <MenuItem value="confirm">{open?.mode === 'decide' ? t('as.prob.confirmBtn') : t('as.prob.rec.confirm')}</MenuItem>
                <MenuItem value="extend">{open?.mode === 'decide' ? t('as.prob.extendBtn') : t('as.prob.rec.extend')}</MenuItem>
              </TextInput>
            </FormField>
            {open?.mode === 'decide' && choice === 'extend' && (
              <FormField label={t('as.prob.extendMonths')}>
                <TextInput type="number" value={months} slotProps={{ htmlInput: { min: 1, max: 12 } }} onChange={(e) => setMonths(e.target.value)} />
              </FormField>
            )}
            <FormField label={t('as.prob.remarks')}>
              <TextInput multiline minRows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} slotProps={{ htmlInput: { maxLength: 1000 } }} />
            </FormField>
            {open?.row.review && (open.row.review.status === 'confirmed' || open.row.review.status === 'extended') && (
              <Button component="a" href={`/api/download?kind=probation-letter&id=${open.row.review.id}`} size="small">
                {t('as.prob.letter')}
              </Button>
            )}
          </div>
        </DialogContent>
        <DialogActions>
          <Button onClick={close}>{t('as.prob.cancel')}</Button>
          <Button variant="contained" disabled={pending} onClick={submit}>
            {open?.mode === 'recommend' ? t('as.prob.send') : choice === 'confirm' ? t('as.prob.confirmBtn') : t('as.prob.extendBtn')}
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  );
}
