'use client';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { addTraining, removeTraining, verifyTraining } from '@/app/(dashboard)/hr/talent-actions';
import { uploadCertificate } from '@/app/(dashboard)/hr/staff-actions';
import { SectionTitle } from '@/components/PageHeader';
import { FormField, StatusPill, TextInput } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import { formatDate } from '@/lib/dates';
import type { TrainingRecord, TrainingSummary } from '@/lib/hr-lifecycle';

import { Alert, Button, MenuItem, Table, TableBody, TableCell, TableHead, TableRow } from '@/components/kx';
const KINDS = ['fdp', 'workshop', 'conference', 'course'] as const;
const BLANK = { userId: '', title: '', kind: 'fdp', organiser: '', startsOn: '', endsOn: '', hours: '', certificateRef: '' };

/** Training and FDP records: staff add their own, HR adds for anyone and verifies against the certificate. */
export function TrainingDesk({ records, summary, staff, isHr, meId }: { records: TrainingRecord[]; summary: TrainingSummary[]; staff: { userId: string; fullName: string }[]; isHr: boolean; meId: string }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [f, setF] = useState(BLANK);
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) =>
    start(async () => {
      setError(null);
      const res = await fn();
      if (res.ok) {
        after?.();
        router.refresh();
      } else setError(res.error ?? null);
    });
  return (
    <div className="flex flex-col gap-6">
      {error && <Alert severity="error">{error}</Alert>}
      <div className="rounded-[12px] border bg-card p-5">
        <SectionTitle flush>{t('hl.train.add')}</SectionTitle>
        <form className="grid grid-cols-[1fr] sm:grid-cols-[repeat(3,1fr)] gap-3"
          onSubmit={(e: React.FormEvent) => {
            e.preventDefault();
            run(() => addTraining({ ...f, hours: Number(f.hours) }), () => setF(BLANK));
          }}
        >
          {isHr && (
            <FormField label={t('hl.staff')}>
              <TextInput select value={f.userId} onChange={(e) => setF({ ...f, userId: e.target.value })}>
                <MenuItem value="">{t('hl.chooseStaff')}</MenuItem>
                {staff.map((s) => (
                  <MenuItem key={s.userId} value={s.userId}>
                    {s.fullName}
                  </MenuItem>
                ))}
              </TextInput>
            </FormField>
          )}
          <FormField label={t('hl.train.title')} required>
            <TextInput value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} required />
          </FormField>
          <FormField label={t('hl.train.kind')}>
            <TextInput select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>
              {KINDS.map((k) => (
                <MenuItem key={k} value={k}>
                  {t(`hl.train.kind.${k}` as MessageKey)}
                </MenuItem>
              ))}
            </TextInput>
          </FormField>
          <FormField label={t('hl.train.organiser')}>
            <TextInput value={f.organiser} onChange={(e) => setF({ ...f, organiser: e.target.value })} />
          </FormField>
          <FormField label={t('hl.train.starts')} required>
            <TextInput type="date" value={f.startsOn} onChange={(e) => setF({ ...f, startsOn: e.target.value })} required />
          </FormField>
          <FormField label={t('hl.train.ends')} required>
            <TextInput type="date" value={f.endsOn} onChange={(e) => setF({ ...f, endsOn: e.target.value })} required />
          </FormField>
          <FormField label={t('hl.train.hours')} required>
            <TextInput type="number" value={f.hours} slotProps={{ htmlInput: { min: 0, step: 0.5 } }} onChange={(e) => setF({ ...f, hours: e.target.value })} required />
          </FormField>
          <FormField label={t('hl.train.certificate')}>
            <TextInput value={f.certificateRef} onChange={(e) => setF({ ...f, certificateRef: e.target.value })} />
          </FormField>
          <div className="self-end">
            <Button type="submit" variant="contained" disabled={pending}>
              {t('hl.train.create')}
            </Button>
          </div>
        </form>
      </div>

      {isHr && summary.length > 0 && (
        <div className="rounded-[12px] border bg-card p-5">
          <SectionTitle flush>{t('hl.train.summary')}</SectionTitle>
          <div className="flex flex-row flex-wrap gap-2">
            {summary.map((s) => (
              <StatusPill key={s.userId} tone="info">
                {s.fullName}: {s.hours} · {t('hl.train.programmes', { n: s.programmes })}
              </StatusPill>
            ))}
          </div>
        </div>
      )}

      {records.length === 0 ? (
        <p className="text-sm leading-[21px] text-muted-foreground">{t('hl.train.none')}</p>
      ) : (
        <div className="rounded-[12px] border bg-card overflow-x-auto">
          <Table size="small" data-testid="training-list">
            <TableHead>
              <TableRow>
                {isHr && <TableCell>{t('hl.staff')}</TableCell>}
                <TableCell>{t('hl.train.title')}</TableCell>
                <TableCell>{t('hl.train.starts')}</TableCell>
                <TableCell align="right">{t('hl.train.hours')}</TableCell>
                <TableCell />
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {records.map((r) => (
                <TableRow key={r.id}>
                  {isHr && <TableCell>{r.fullName}</TableCell>}
                  <TableCell>
                    {r.title}
                    <div className="text-xs leading-4 tracking-[0.3px] text-muted-foreground">
                      {t(`hl.train.kind.${r.kind}` as MessageKey)}
                      {r.organiser ? ` · ${r.organiser}` : ''}
                      {r.certificateRef ? ` · ${r.certificateRef}` : ''}
                    </div>
                  </TableCell>
                  <TableCell>{formatDate(r.startsOn, 'dayMonth', locale)}</TableCell>
                  <TableCell align="right">{r.hours}</TableCell>
                  <TableCell>{r.verified ? <StatusPill tone="success">{t('hl.train.verified')}</StatusPill> : <StatusPill tone="warning">{t('hl.train.unverified')}</StatusPill>}</TableCell>
                  <TableCell className="whitespace-nowrap" align="right">
                    {r.hasCertificate && (
                      <Button size="small" component="a" href={`/api/download?kind=training-cert&id=${r.id}`} target="_blank" rel="noopener">
                        {t('as.cert.view')}
                      </Button>
                    )}
                    {(isHr || r.userId === meId) && (
                      <Button size="small" component="label" disabled={pending}>
                        {r.hasCertificate ? t('as.cert.replace') : t('as.cert.upload')}
                        <input
                          hidden
                          type="file"
                          accept="application/pdf,image/jpeg,image/png"
                          data-testid={`cert-${r.id}`}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            e.target.value = '';
                            if (!file) return;
                            const form = new FormData();
                            form.set('file', file);
                            run(() => uploadCertificate(r.id, form));
                          }}
                        />
                      </Button>
                    )}
                    {isHr && !r.verified && (
                      <Button size="small" disabled={pending} onClick={() => run(() => verifyTraining(r.id))}>
                        {t('hl.train.verify')}
                      </Button>
                    )}
                    {(isHr || (r.userId === meId && !r.verified)) && (
                      <Button size="small" color="inherit" disabled={pending} onClick={() => run(() => removeTraining(r.id))}>
                        {t('hl.train.remove')}
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
