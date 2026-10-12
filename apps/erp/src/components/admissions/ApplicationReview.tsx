'use client';
import NextLink from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { FormField, TextInput } from '@/components/ui';
import { enrollApplicant, recordApplicationFee, reviewDocument, setApplicationStatus } from '@/app/(dashboard)/admissions/actions';
import { sendWaiver } from '@/app/(dashboard)/workflows/bound-actions';
import { SendForApproval } from '@/components/pathways-b/SendForApproval';
import { SectionTitle } from '@/components/PageHeader';
import { BOUND_FLOWS } from '@/lib/pathways-b';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import { APPLICATION_REASON_REQUIRED, type ApplicationDetail } from '@/lib/admissions';
import { formatRupees, PAY_METHODS, type CounterMethod } from '@/lib/money';
import { ReasonDialog } from './ReasonDialog';

import { Alert, Button, Chip, Link, MenuItem } from '@/components/kx';
type Dialog = { kind: 'status'; status: string } | { kind: 'reject-doc'; docId: string } | { kind: 'waive' } | null;

/** The reviewer's side of an application: move it along, check documents, take the fee, enrol. */
export function ApplicationReview({ app, classes, canWaive, flows }: { app: ApplicationDetail; classes: { id: string; name: string; term: number }[]; canWaive: boolean; flows: Record<string, boolean> | null }) {
  const { t } = useI18n();
  const router = useRouter();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [error, setError] = useState<string | null>(null);
  const [method, setMethod] = useState<CounterMethod>('cash');
  const [reference, setReference] = useState('');
  const [sectionId, setSectionId] = useState('');
  const [override, setOverride] = useState('');
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      setError(null);
      const res = await fn();
      if (res.ok) router.refresh();
      else setError(res.error ?? null);
    });
  const moves = app.allowedStatuses.filter((s) => s !== 'enrolled');
  return (
    <div className="flex flex-col gap-6">
      {error && <Alert severity="error">{error}</Alert>}
      <div className="rounded-[12px] border bg-card p-5">
        <SectionTitle flush>{t('adm.review.actions')}</SectionTitle>
        <div className="flex flex-row gap-2 flex-wrap gap-y-2">
          {moves.map((s) => (
            <Button key={s} size="small" variant="outlined" color={s === 'rejected' || s === 'withdrawn' || s === 'ineligible' ? 'error' : 'primary'} disabled={pending} onClick={() => (APPLICATION_REASON_REQUIRED.includes(s) ? setDialog({ kind: 'status', status: s }) : run(() => setApplicationStatus(app.id, s)))}>
              {t(`adm.moveTo.${s}` as MessageKey)}
            </Button>
          ))}
          {moves.length === 0 && app.status !== 'accepted' && (
            <p className="text-[13px] leading-[19px] text-muted-foreground">
              {t('adm.review.noMoves')}
            </p>
          )}
        </div>
        {app.status === 'accepted' && (
          <div className="mt-4">
            <h6 className="text-sm leading-5 font-medium tracking-[0.1px] mb-2">
              {t('adm.review.enrol')}
            </h6>
            <div className="flex flex-row gap-2 items-center flex-wrap gap-y-2">
              <FormField label={t('adm.review.class')}>
                <TextInput className="min-w-[200px]" select value={sectionId} onChange={(e) => setSectionId(e.target.value)}>
                  <MenuItem value="">{t('adm.review.autoClass')}</MenuItem>
                  {classes.map((c) => (
                    <MenuItem key={c.id} value={c.id}>
                      {c.name}
                    </MenuItem>
                  ))}
                </TextInput>
              </FormField>
              <FormField label={t('g1.dup.reason')}>
                <TextInput className="min-w-[260px]" value={override} onChange={(e) => setOverride(e.target.value)} />
              </FormField>
              <Button variant="contained" disabled={pending} onClick={() => run(() => enrollApplicant(app.id, sectionId || undefined, override))}>
                {t('adm.review.enrolNow')}
              </Button>
            </div>
          </div>
        )}
        {app.studentId && (
          <div className="mt-4">
            <Link component={NextLink} href={`/students/${app.studentId}`}>
              {t('adm.review.openStudent')}
            </Link>
          </div>
        )}
      </div>

      <div className="rounded-[12px] border bg-card p-5">
        <SectionTitle flush>{t('adm.review.documents')}</SectionTitle>
        <div className="flex flex-col gap-3">
          {app.cycle.documents.map((spec) => {
            const d = app.documents.find((x) => x.docKey === spec.key);
            return (
              <div className="flex items-center gap-2 flex-wrap" key={spec.key}>
                <div className="flex-[1_1_200px] min-w-0">
                  <p className="text-[13px] leading-[19px] font-semibold">
                    {spec.label}
                    {spec.required ? ' *' : ''}
                  </p>
                  {d ? (
                    <Link href={`/admissions/applications/${app.id}/documents/${d.id}`} target="_blank" rel="noreferrer" variant="body2">
                      {d.fileName}
                    </Link>
                  ) : (
                    <p className="text-[13px] leading-[19px] text-muted-foreground">
                      {t('adm.review.notUploaded')}
                    </p>
                  )}
                  {d?.reviewNote && (
                    <div className="text-xs leading-4 tracking-[0.3px] text-muted-foreground">
                      {d.reviewNote}
                    </div>
                  )}
                </div>
                {d && <Chip size="small" color={d.status === 'verified' ? 'success' : d.status === 'rejected' ? 'error' : 'default'} label={t(`adm.doc.${d.status}` as MessageKey)} />}
                {d && d.status !== 'verified' && (
                  <Button size="small" disabled={pending} onClick={() => run(() => reviewDocument(app.id, d.id, 'verified'))}>
                    {t('adm.doc.verify')}
                  </Button>
                )}
                {d && d.status !== 'rejected' && (
                  <Button size="small" color="error" disabled={pending} onClick={() => setDialog({ kind: 'reject-doc', docId: d.id })}>
                    {t('adm.doc.reject')}
                  </Button>
                )}
              </div>
            );
          })}
          {app.cycle.documents.length === 0 && (
            <p className="text-[13px] leading-[19px] text-muted-foreground">
              {t('adm.review.noDocuments')}
            </p>
          )}
        </div>
      </div>

      <div className="rounded-[12px] border bg-card p-5">
        <SectionTitle flush>{t('adm.review.fee')}</SectionTitle>
        <p className="text-[13px] leading-[19px] mb-2">
          {formatRupees(app.cycle.applicationFeePaise)} · {t(`adm.fee.${app.feeStatus}` as MessageKey)}
        </p>
        {app.payments
          .filter((p) => p.status === 'paid')
          .map((p) => (
            <div className="text-xs leading-4 tracking-[0.3px] text-muted-foreground" key={p.id}>
              {p.receiptNo} · {p.method}
              {p.reference ? ` · ${p.reference}` : ''}
            </div>
          ))}
        {app.feeStatus === 'pending' && (
          <div className="flex flex-row gap-2 mt-3 flex-wrap gap-y-2 items-center">
            <FormField label={t('adm.fee.method')}>
              <TextInput className="min-w-[140px]" select value={method} onChange={(e) => setMethod(e.target.value as CounterMethod)}>
                {PAY_METHODS.map((m) => (
                  <MenuItem key={m} value={m}>
                    {m}
                  </MenuItem>
                ))}
              </TextInput>
            </FormField>
            <FormField label={t('adm.fee.reference')}>
              <TextInput value={reference} onChange={(e) => setReference(e.target.value)} />
            </FormField>
            <Button variant="contained" size="small" disabled={pending} onClick={() => run(() => recordApplicationFee(app.id, { kind: 'counter', method, reference }))}>
              {t('adm.fee.record')}
            </Button>
            {canWaive && (
              <Button size="small" disabled={pending} onClick={() => setDialog({ kind: 'waive' })}>
                {t('adm.fee.waive')}
              </Button>
            )}
            <SendForApproval flow={BOUND_FLOWS[3]} flows={flows} sourceId={app.id} fields={[{ name: 'reason', label: t('adm.field.reason'), required: true }]} onSend={(v) => sendWaiver(app.id, v)} />
          </div>
        )}
      </div>

      {dialog?.kind === 'status' && (
        <ReasonDialog
          title={t(`adm.moveTo.${dialog.status}` as MessageKey)}
          help={t('adm.review.reasonHelp')}
          label={t('adm.field.reason')}
          required
          confirm={t('common.save')}
          onSubmit={(reason) => setApplicationStatus(app.id, dialog.status, reason)}
          onClose={(done) => {
            setDialog(null);
            if (done) router.refresh();
          }}
        />
      )}
      {dialog?.kind === 'reject-doc' && (
        <ReasonDialog
          title={t('adm.doc.reject')}
          label={t('adm.doc.whatsWrong')}
          required
          confirm={t('adm.doc.reject')}
          onSubmit={(note) => reviewDocument(app.id, dialog.docId, 'rejected', note)}
          onClose={(done) => {
            setDialog(null);
            if (done) router.refresh();
          }}
        />
      )}
      {dialog?.kind === 'waive' && (
        <ReasonDialog
          title={t('adm.fee.waive')}
          label={t('adm.field.reason')}
          required
          confirm={t('adm.fee.waive')}
          onSubmit={(reason) => recordApplicationFee(app.id, { kind: 'waive', reason })}
          onClose={(done) => {
            setDialog(null);
            if (done) router.refresh();
          }}
        />
      )}
    </div>
  );
}
