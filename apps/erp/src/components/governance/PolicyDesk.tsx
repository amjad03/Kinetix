'use client';

import { useRouter } from 'next/navigation';
import { BellRing, FilePlus2, Pencil, Users } from 'lucide-react';
import { useState, useTransition } from 'react';
import { editPolicyVersion, newPolicyVersion, policyAcks, policyStep } from '@/app/(dashboard)/governance/pass-actions';
import { Alert, Button } from '@/components/kx';
import { FormDialog, Grid, InfoDialog, useToast } from '@/components/ops/kit';
import { Card, StatusPill } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import { ackPct, versionTone, type Acks, type PolicyDetail, type PolicyVersion } from '@/lib/governance-pass';
import type { ActionResult } from '@/lib/types';

/**
 * A policy's versions: the open one moves draft, review, approval (by someone other than the author), publication;
 * the published one shows who has acknowledged it and reminds the rest. Superseded versions stay readable.
 */
export function PolicyDesk({ p }: { p: PolicyDetail }) {
  const { t, fmt } = useI18n();
  const router = useRouter();
  const [toast, toastNode] = useToast();
  const [pending, start] = useTransition();
  const [dialog, setDialog] = useState<'new' | { edit: PolicyVersion } | { acks: PolicyVersion; data: Acks | null } | { read: PolicyVersion } | null>(null);
  const open = p.versions.find((v) => ['draft', 'in_review', 'approved'].includes(v.status));
  const published = p.versions.find((v) => v.status === 'published');
  const run = (fn: () => Promise<ActionResult<unknown>>, ok?: string) =>
    start(async () => {
      const r = await fn();
      toast(r.ok ? (ok ?? t('ops.saved')) : r.error);
      if (r.ok) router.refresh();
    });
  const showAcks = (v: PolicyVersion) =>
    start(async () => {
      setDialog({ acks: v, data: null });
      const r = await policyAcks(v.id, 'pending');
      if (r.ok) setDialog({ acks: v, data: r.data });
      else toast(r.error);
    });
  const pct = published ? ackPct(published.acknowledged, p.audienceSize) : null;
  return (
    <>
      <div className="mb-4 grid gap-4 lg:grid-cols-3">
        <Card>
          <h2 className="m-0 mb-2 text-[15px] font-semibold">{t('gp.p.about')}</h2>
          <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[13px]">
            <dt className="text-muted-foreground">{t('rk.f.governance-policies.ownerUserId')}</dt>
            <dd className="m-0">{p.ownerName ?? '-'}</dd>
            <dt className="text-muted-foreground">{t('rk.f.governance-policies.reviewMonths')}</dt>
            <dd className="m-0">{fmt.number(p.reviewMonths)}</dd>
            <dt className="text-muted-foreground">{t('gp.col.review')}</dt>
            <dd className="m-0">{p.nextReviewOn ? fmt.date(p.nextReviewOn, 'short') : '-'}</dd>
            <dt className="text-muted-foreground">{t('rk.f.governance-policies.audience')}</dt>
            <dd className="m-0">{p.audience.length ? p.audience.map((r) => t(`role.${r}` as MessageKey)).join(', ') : t('gp.p.nobody')}</dd>
            <dt className="text-muted-foreground">{t('rk.f.governance-policies.public')}</dt>
            <dd className="m-0">{p.public ? t('common.yes') : t('common.no')}</dd>
          </dl>
        </Card>
        <Card>
          <h2 className="m-0 mb-2 text-[15px] font-semibold">{t('gp.p.published')}</h2>
          {published ? (
            <>
              <p className="m-0 text-[13px]">{t('gp.p.publishedLine', { v: published.version, on: fmt.date(published.effectiveFrom ?? published.publishedAt ?? '', 'short') })}</p>
              <p className="mt-1 mb-2 text-[13px] text-muted-foreground" data-testid="gov-ack-pct">{pct === null ? t('gp.p.noAudience') : t('gp.p.acked', { n: published.acknowledged, of: p.audienceSize, pct })}</p>
              <div className="flex flex-wrap gap-2">
                <Button size="small" startIcon={<Users className="size-3.5" />} onClick={() => showAcks(published)} disabled={pending} data-testid="gov-acks">
                  {t('gp.p.whoPending')}
                </Button>
                {p.audienceSize > 0 && (
                  <Button size="small" startIcon={<BellRing className="size-3.5" />} onClick={() => run(() => policyStep(p.id, published.id, 'remind'), t('gp.p.reminded'))} disabled={pending} data-testid="gov-remind">
                    {t('gp.p.remind')}
                  </Button>
                )}
              </div>
            </>
          ) : (
            <p className="m-0 text-[13px] text-muted-foreground">{t('gp.p.notPublished')}</p>
          )}
        </Card>
        <Card>
          <h2 className="m-0 mb-2 text-[15px] font-semibold">{t('gp.p.open')}</h2>
          {open ? (
            <>
              <p className="m-0 mb-2 text-[13px]">
                {t('gp.p.openLine', { v: open.version })} <StatusPill tone={versionTone(open.status)}>{t(`gp.vs.${open.status}` as MessageKey)}</StatusPill>
              </p>
              <div className="flex flex-wrap gap-2" data-testid="gov-steps">
                {open.status === 'draft' && (
                  <>
                    <Button size="small" startIcon={<Pencil className="size-3.5" />} onClick={() => setDialog({ edit: open })}>
                      {t('gp.d.edit')}
                    </Button>
                    <Button size="small" variant="contained" onClick={() => run(() => policyStep(p.id, open.id, 'review'))} disabled={pending} data-testid="gov-review">
                      {t('gp.p.review')}
                    </Button>
                  </>
                )}
                {open.status === 'in_review' && (
                  <Button size="small" variant="contained" onClick={() => run(() => policyStep(p.id, open.id, 'approve'))} disabled={pending} data-testid="gov-approve-policy">
                    {t('gp.p.approve')}
                  </Button>
                )}
                {open.status === 'approved' && (
                  <Button size="small" variant="contained" onClick={() => run(() => policyStep(p.id, open.id, 'publish'), t('gp.p.publishedDone'))} disabled={pending} data-testid="gov-publish-policy">
                    {t('gp.p.publish')}
                  </Button>
                )}
                {open.status !== 'draft' && (
                  <Button size="small" onClick={() => run(() => policyStep(p.id, open.id, 'draft'))} disabled={pending}>
                    {t('gp.p.back')}
                  </Button>
                )}
              </div>
              <p className="mt-2 mb-0 text-[12px] text-muted-foreground">{t('gp.p.fourEyes')}</p>
            </>
          ) : (
            p.status === 'active' && (
              <Button size="small" startIcon={<FilePlus2 className="size-3.5" />} onClick={() => setDialog('new')} data-testid="gov-new-version">
                {t('gp.p.newVersion')}
              </Button>
            )
          )}
        </Card>
      </div>
      {p.versions.some((v) => !v.intact) && <Alert severity="error" className="mb-4">{t('gp.p.tampered')}</Alert>}
      <h2 className="mt-6 mb-3 text-[17px] font-semibold">{t('gp.p.versions')}</h2>
      <Grid<PolicyVersion>
        testId="gov-versions"
        empty={t('gp.p.noVersions')}
        rows={p.versions}
        cols={[
          { label: t('gp.col.version'), num: true, cell: (v) => fmt.number(v.version), sort: (v) => v.version },
          { label: t('gp.col.status'), cell: (v) => <StatusPill tone={versionTone(v.status)}>{t(`gp.vs.${v.status}` as MessageKey)}</StatusPill>, sort: (v) => v.status },
          { label: t('gp.col.change'), wrap: true, cell: (v) => v.changeNote || '-' },
          { label: t('gp.col.author'), cell: (v) => v.authorName ?? '-' },
          { label: t('gp.col.approver'), cell: (v) => v.approverName ?? '-' },
          { label: t('gp.col.effective'), cell: (v) => (v.effectiveFrom ? fmt.date(v.effectiveFrom, 'short') : '-'), sort: (v) => v.effectiveFrom ?? '' },
          { label: t('gp.col.acknowledged'), num: true, cell: (v) => fmt.number(v.acknowledged), sort: (v) => v.acknowledged },
          { label: '', cell: (v) => <Button size="small" onClick={() => setDialog({ read: v })}>{t('gp.p.read')}</Button> },
        ]}
      />
      {dialog === 'new' && (
        <FormDialog
          title={t('gp.p.newVersion')}
          fields={[
            { name: 'body', label: t('gp.p.text'), kind: 'multiline', required: true, init: published?.body ?? p.versions[0]?.body ?? '' },
            { name: 'changeNote', label: t('gp.col.change'), required: true },
          ]}
          onSubmit={(v) => newPolicyVersion(p.id, v)}
          onClose={(msg) => {
            setDialog(null);
            if (msg) router.refresh();
          }}
        />
      )}
      {dialog && typeof dialog === 'object' && 'edit' in dialog && (
        <FormDialog
          title={t('gp.d.edit')}
          fields={[
            { name: 'body', label: t('gp.p.text'), kind: 'multiline', required: true, init: dialog.edit.body },
            { name: 'changeNote', label: t('gp.col.change'), init: dialog.edit.changeNote },
            { name: 'effectiveFrom', label: t('gp.col.effective'), kind: 'date', init: dialog.edit.effectiveFrom ?? '' },
          ]}
          onSubmit={(v) => editPolicyVersion(p.id, dialog.edit.id, v)}
          onClose={(msg) => {
            setDialog(null);
            if (msg) router.refresh();
          }}
        />
      )}
      {dialog && typeof dialog === 'object' && 'read' in dialog && (
        <InfoDialog title={t('gp.p.versionN', { v: dialog.read.version })} onClose={() => setDialog(null)}>
          <p className="m-0 whitespace-pre-wrap text-[13px] leading-[20px]">{dialog.read.body}</p>
          {dialog.read.contentHash && <p className="mt-3 mb-0 break-all font-mono text-[11px] text-muted-foreground">{t('gp.m.fingerprint', { hash: dialog.read.contentHash.slice(0, 16) })}</p>}
        </InfoDialog>
      )}
      {dialog && typeof dialog === 'object' && 'acks' in dialog && (
        <InfoDialog title={t('gp.p.whoPending')} onClose={() => setDialog(null)}>
          {!dialog.data ? (
            <p className="m-0 text-[13px] text-muted-foreground">{t('gp.loading')}</p>
          ) : (
            <>
              <p className="m-0 mb-2 text-[13px]">{t('gp.p.ackTotals', { done: dialog.data.acknowledged, pending: dialog.data.pending })}</p>
              <ul className="m-0 max-h-[50vh] list-none overflow-auto p-0 text-[13px]" data-testid="gov-pending-list">
                {dialog.data.rows.map((r) => (
                  <li key={r.userId} className="mb-1">{r.name}</li>
                ))}
              </ul>
            </>
          )}
        </InfoDialog>
      )}
      {toastNode}
    </>
  );
}
