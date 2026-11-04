'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { acknowledgePolicy, policyText, reportAction } from '@/app/(dashboard)/governance/pass-actions';
import { Button } from '@/components/kx';
import { FormDialog, Grid, InfoDialog, useToast } from '@/components/ops/kit';
import { Card, StatusPill } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import type { MyPolicy, MySummary, PolicyText } from '@/lib/governance-pass';

/** The person's own governance work: policies to acknowledge, minutes to sign, committees and open actions. */
export function MyGovernance({ policies, summary }: { policies: MyPolicy[]; summary: MySummary }) {
  const { t, fmt } = useI18n();
  const router = useRouter();
  const [toast, toastNode] = useToast();
  const [pending, start] = useTransition();
  const [reading, setReading] = useState<(PolicyText & { versionId: string }) | null>(null);
  const [report, setReport] = useState<string | null>(null);
  const open = (p: MyPolicy) =>
    start(async () => {
      const r = await policyText(p.versionId);
      if (r.ok) setReading({ ...r.data, versionId: p.versionId });
      else toast(r.error);
    });
  const ack = (vid: string) =>
    start(async () => {
      const r = await acknowledgePolicy(vid);
      toast(r.ok ? t('gp.my.acked') : r.error);
      if (r.ok) {
        setReading(null);
        router.refresh();
      }
    });
  const pendingPolicies = policies.filter((p) => p.pending);
  return (
    <>
      <div className="mb-4 grid gap-4 md:grid-cols-3">
        <Card>
          <h2 className="m-0 mb-1 text-[15px] font-semibold">{t('gp.my.toAck')}</h2>
          <p className="m-0 text-2xl font-[650] tabular-nums" data-testid="my-to-ack">{fmt.number(pendingPolicies.length)}</p>
        </Card>
        <Card>
          <h2 className="m-0 mb-1 text-[15px] font-semibold">{t('gp.my.toSign')}</h2>
          <p className="m-0 text-2xl font-[650] tabular-nums" data-testid="my-to-sign">{fmt.number(summary.toSign.length)}</p>
        </Card>
        <Card>
          <h2 className="m-0 mb-1 text-[15px] font-semibold">{t('gp.my.actions')}</h2>
          <p className="m-0 text-2xl font-[650] tabular-nums">{fmt.number(summary.actions.length)}</p>
        </Card>
      </div>
      <h2 className="mt-6 mb-3 text-[17px] font-semibold">{t('gp.my.policies')}</h2>
      <Grid<MyPolicy>
        testId="my-policies"
        empty={t('gp.my.noPolicies')}
        rows={policies}
        cols={[
          { label: t('rk.f.governance-policies.title'), cell: (p) => <b className="font-[550]">{p.title}</b>, sort: (p) => p.title },
          { label: t('gp.col.version'), num: true, cell: (p) => fmt.number(p.version) },
          { label: t('gp.col.effective'), cell: (p) => (p.effectiveFrom ? fmt.date(p.effectiveFrom, 'short') : '-') },
          { label: t('gp.col.status'), cell: (p) => (p.mustAcknowledge ? <StatusPill tone={p.pending ? 'warning' : 'success'}>{p.pending ? t('gp.my.pending') : t('gp.my.ackedOn', { at: fmt.dateTime(p.acknowledgedAt ?? '') })}</StatusPill> : <StatusPill tone="neutral">{t('gp.my.forInfo')}</StatusPill>) },
          { label: '', cell: (p) => <Button size="small" disabled={pending} onClick={() => open(p)}>{p.pending ? t('gp.my.readAck') : t('gp.p.read')}</Button> },
        ]}
      />
      <h2 className="mt-6 mb-3 text-[17px] font-semibold">{t('gp.my.minutes')}</h2>
      <Grid<MySummary['toSign'][number]>
        testId="my-minutes"
        empty={t('gp.my.noMinutes')}
        rows={summary.toSign}
        cols={[
          { label: t('gp.col.committee'), cell: (m) => m.committee },
          { label: t('gp.f.meetingTitle'), cell: (m) => <Link href={`/governance/meetings/${m.meetingId}`} className="font-[550]">{m.title}</Link> },
          { label: t('gp.f.meetingOn'), cell: (m) => fmt.date(m.meetingOn, 'short') },
        ]}
      />
      <h2 className="mt-6 mb-3 text-[17px] font-semibold">{t('gp.my.myActions')}</h2>
      <Grid<MySummary['actions'][number]>
        testId="my-actions"
        empty={t('gp.my.noActions')}
        rows={summary.actions}
        tint={(a) => a.overdue}
        cols={[
          { label: t('gp.m.actionTitle'), wrap: true, cell: (a) => a.title },
          { label: t('gp.col.committee'), cell: (a) => a.committee },
          { label: t('gp.m.dueOn'), cell: (a) => fmt.date(a.dueOn, 'short'), sort: (a) => a.dueOn },
          { label: t('gp.col.status'), cell: (a) => <StatusPill tone={a.overdue ? 'danger' : 'warning'}>{t(`gp.as.${a.status}` as MessageKey)}</StatusPill> },
          { label: '', cell: (a) => <Button size="small" onClick={() => setReport(a.id)}>{t('gp.m.report')}</Button> },
        ]}
      />
      {summary.committees.length > 0 && <p className="mt-4 text-[13px] text-muted-foreground">{t('gp.my.on', { names: summary.committees.map((c) => `${c.name} (${t(`gp.role.${c.role}` as MessageKey)})`).join(', ') })}</p>}
      {reading && (
        <InfoDialog title={`${reading.title} · ${t('gp.p.versionN', { v: reading.version })}`} onClose={() => setReading(null)}>
          <p className="m-0 whitespace-pre-wrap text-[13px] leading-[20px]" data-testid="my-policy-text">{reading.body}</p>
          {reading.mustAcknowledge && !reading.acknowledgedAt && (
            <div className="mt-4">
              <Button variant="contained" disabled={pending} onClick={() => ack(reading.versionId)} data-testid="my-ack">
                {t('gp.my.ack')}
              </Button>
            </div>
          )}
        </InfoDialog>
      )}
      {report && (
        <FormDialog
          title={t('gp.m.report')}
          fields={[
            { name: 'actionTaken', label: t('gp.m.taken'), kind: 'multiline', required: true },
            { name: 'status', label: t('gp.col.status'), kind: 'select', options: [{ value: 'done', label: t('gp.as.done') }, { value: 'in_progress', label: t('gp.as.in_progress') }], init: 'done', required: true },
            { name: 'evidenceUrl', label: t('gp.m.evidence') },
          ]}
          onSubmit={(v) => reportAction(report, v, '/governance/mine')}
          onClose={(msg) => {
            setReport(null);
            if (msg) router.refresh();
          }}
        />
      )}
      {toastNode}
    </>
  );
}
