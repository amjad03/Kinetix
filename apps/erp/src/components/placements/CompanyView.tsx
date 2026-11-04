'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { followedUp, issuePortalKey, logInteraction, removeContact, revokePortalKey, saveContact, verifyCompany } from '@/app/(dashboard)/placements/actions';
import { useDialog, useRun } from '@/components/procurement/useDialog';
import { Button } from '@/components/shadcn/button';
import { RecordPage } from '@/components/templates';
import { Card, DataTable, Dialog, StatusPill, useToast, type Column } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import { statusTone } from '@/lib/procurement';
import { statusLabel } from '@/lib/procurement-labels';
import type { CompanyDetail, Interaction } from '@/lib/placements-depth';

const KINDS = ['call', 'email', 'meeting', 'campus_visit', 'linkedin', 'other'] as const;

/**
 * A recruiter: its profile, HR contacts, drives with registrations and offers, and the recruiter portal key (shown
 * once when issued; the company posts drives and reads shortlists with it at the portal link).
 */
export function CompanyView({ c, canEdit, portalUrl, interactions = [], today }: { c: CompanyDetail; canEdit: boolean; portalUrl: string; interactions?: Interaction[]; today: string }) {
  const { t, fmt } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const [open, dialog] = useDialog();
  const run = useRun();
  const [key, setKey] = useState<string | null>(null);
  const issue = async (verify: boolean) => {
    const r = verify ? await verifyCompany(c.id) : await issuePortalKey(c.id);
    if (!r.ok) return toast.error(r.error);
    setKey(r.data.key);
    router.refresh();
  };
  const yesNo = [{ value: 'no', label: t('ops.no') }, { value: 'yes', label: t('ops.yes') }];
  const contactForm = (x?: CompanyDetail['contacts'][number]) =>
    open({
      title: x ? t('pd.co.editContact') : t('pd.co.addContact'),
      fields: [
        { name: 'name', label: t('ops.f.name'), required: true, init: x?.name },
        { name: 'designation', label: t('pd.co.designation'), init: x?.designation },
        { name: 'email', label: t('inv.email'), init: x?.email ?? '' },
        { name: 'phone', label: t('ops.f.phone'), init: x?.phone ?? '' },
        { name: 'isPrimary', label: t('pd.co.primary'), kind: 'select', init: x?.isPrimary ? 'yes' : 'no', options: yesNo },
      ],
      run: (v) => saveContact(c.id, v, x?.id),
    });

  const logForm = () =>
    open({
      title: t('pp.crm.log'),
      intro: t('pp.crm.logHelp'),
      fields: [
        { name: 'kind', label: t('pd.kind'), kind: 'select', required: true, init: 'call', options: KINDS.map((k) => ({ value: k, label: t(`pp.crm.kind.${k}`) })) },
        { name: 'happenedOn', label: t('ivd.date'), kind: 'date', required: true, init: today },
        ...(c.contacts.length ? [{ name: 'contactId', label: t('pp.crm.with'), kind: 'select' as const, options: c.contacts.map((x) => ({ value: x.id, label: x.name })) }] : []),
        { name: 'summary', label: t('pp.crm.summary'), kind: 'multiline', required: true },
        { name: 'outcome', label: t('pp.crm.outcome') },
        { name: 'nextAction', label: t('pp.crm.next') },
        { name: 'followUpOn', label: t('pp.crm.followUpOn'), kind: 'date' },
      ],
      done: t('ops.saved'),
      run: (v) => logInteraction(c.id, v),
    });
  const nextFollowUp = interactions.filter((x) => !x.followUpDone && x.followUpOn).map((x) => x.followUpOn!).sort()[0];
  const interactionCols: Column<Interaction>[] = [
    { id: 'on', header: t('ivd.date'), rowHeader: true, sort: (x) => x.happenedOn, cell: (x) => fmt.date(x.happenedOn, 'short') },
    { id: 'kind', header: t('pd.kind'), cell: (x) => t(`pp.crm.kind.${x.kind as 'call'}`) },
    { id: 'summary', header: t('pp.crm.summary'), cell: (x) => <>{x.summary}{x.outcome && <span className="block text-xs text-muted-foreground">{x.outcome}</span>}</> },
    { id: 'with', header: t('pp.crm.with'), hideBelow: 'md', cell: (x) => x.contactName ?? '—' },
    { id: 'next', header: t('pp.crm.next'), hideBelow: 'sm', cell: (x) => x.nextAction || '—' },
    { id: 'follow', header: t('pp.crm.followUpOn'), cell: (x) => (x.followUpOn ? <StatusPill tone={x.followUpDone ? 'neutral' : x.followUpOn <= today ? 'warning' : 'info'}>{x.followUpDone ? t('pp.crm.done') : fmt.date(x.followUpOn, 'short')}</StatusPill> : '—') },
    { id: 'act', header: '', csv: false, align: 'right', cell: (x) => (canEdit && x.followUpOn && !x.followUpDone ? <Button size="sm" variant="ghost" onClick={() => void run(() => followedUp(x.id), t('ops.saved'))}>{t('pp.crm.markDone')}</Button> : null) },
  ];

  type Contact = CompanyDetail['contacts'][number];
  type Drive = CompanyDetail['drives'][number];
  const contactCols: Column<Contact>[] = [
    { id: 'name', header: t('ops.f.name'), rowHeader: true, cell: (x) => <>{x.name} {x.isPrimary && <StatusPill tone="info">{t('pd.co.primary')}</StatusPill>}</> },
    { id: 'designation', header: t('pd.co.designation'), cell: (x) => x.designation || '—' },
    { id: 'email', header: t('inv.email'), hideBelow: 'sm', cell: (x) => x.email ?? '—' },
    { id: 'phone', header: t('ops.f.phone'), hideBelow: 'md', cell: (x) => x.phone ?? '—' },
    {
      id: 'act',
      header: '',
      csv: false,
      align: 'right',
      cell: (x) =>
        canEdit ? (
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => contactForm(x)}>{t('ops.edit')}</Button>
            <Button size="sm" variant="ghost" className="text-destructive" onClick={() => void run(() => removeContact(c.id, x.id), t('pd.co.contactRemoved'))}>{t('pd.co.remove')}</Button>
          </div>
        ) : null,
    },
  ];
  const driveCols: Column<Drive>[] = [
    { id: 'title', header: t('pl.col.drive'), rowHeader: true, cell: (x) => <Link className="font-medium text-primary hover:underline" href={`/placements/drives/${x.id}`}>{x.title}</Link> },
    { id: 'date', header: t('pl.col.date'), cell: (x) => (x.driveDate ? fmt.date(x.driveDate, 'short') : '—') },
    { id: 'ctc', header: t('pd.ctcLpa'), align: 'right', hideBelow: 'sm', cell: (x) => (x.ctcLpa === null ? '—' : fmt.number(x.ctcLpa, { maximumFractionDigits: 2 })) },
    { id: 'regs', header: t('pl.col.registered'), align: 'right', cell: (x) => x.registrations },
    { id: 'offers', header: t('pd.offers'), align: 'right', cell: (x) => x.offers },
    { id: 'status', header: t('ops.f.status'), cell: (x) => <StatusPill tone={statusTone(x.status)}>{statusLabel(t, x.status)}</StatusPill> },
  ];

  return (
    <>
      <RecordPage
        title={c.name}
        subtitle={[c.sector, c.city, c.groupName].filter(Boolean).join(' · ') || undefined}
        status={{ label: statusLabel(t, c.status), tone: statusTone(c.status) }}
        facts={[
          { label: t('pd.drives'), value: fmt.number(c.drives.length) },
          { label: t('pd.offers'), value: fmt.number(c.drives.reduce((s, d) => s + d.offers, 0)) },
          { label: t('pd.hrContact'), value: c.contactName ?? '—' },
          { label: t('pp.crm.stage'), value: t(`pp.stage.${(c.crmStage ?? 'prospect') as 'prospect'}`) },
          { label: t('pp.crm.nextFollowUp'), value: nextFollowUp ? fmt.date(nextFollowUp, 'short') : '—' },
          { label: t('pd.co.selfRegistered'), value: c.selfRegistered ? t('ops.yes') : t('ops.no') },
          { label: t('pd.portalKey'), value: c.hasPortalKey ? (c.portalTokenAt ? t('pd.co.keySince', { date: fmt.date(c.portalTokenAt.slice(0, 10), 'short') }) : t('ops.yes')) : t('ops.no') },
        ]}
        primary={
          canEdit ? (
            c.status === 'pending' ? (
              <Button onClick={() => void issue(true)} data-testid="company-verify">{t('pd.co.verify')}</Button>
            ) : c.status === 'active' ? (
              <Button variant="outline" onClick={() => void issue(false)} data-testid="company-key">{c.hasPortalKey ? t('pd.co.newKey') : t('pd.co.issueKey')}</Button>
            ) : undefined
          ) : undefined
        }
        secondary={
          canEdit ? (
            <>
              <Button variant="outline" onClick={logForm} data-testid="company-log">{t('pp.crm.log')}</Button>
              <Button variant="outline" onClick={() => contactForm()}>{t('pd.co.addContact')}</Button>
              {c.hasPortalKey && <Button variant="outline" className="text-destructive" onClick={() => void run(() => revokePortalKey(c.id), t('pd.co.keyRevoked'))}>{t('pd.co.revokeKey')}</Button>}
            </>
          ) : undefined
        }
        overview={
          <div className="grid gap-6">
            <Card title={t('pd.co.about')}>
              <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
                <Fact label={t('pd.co.website')} value={c.website ?? '—'} />
                <Fact label={t('pd.co.address')} value={c.address || '—'} />
                <Fact label={t('inv.email')} value={c.contactEmail ?? '—'} />
                <Fact label={t('ops.f.phone')} value={c.contactPhone ?? '—'} />
              </dl>
              {c.description && <p className="mt-4 whitespace-pre-wrap text-sm">{c.description}</p>}
            </Card>
            <Card title={t('pd.co.portal')}>
              <p className="text-sm">{t('pd.co.portalHelp')}</p>
              <p className="mt-2 break-all font-mono text-xs">{portalUrl}</p>
            </Card>
          </div>
        }
        related={[
          { value: 'interactions', label: t('pp.crm.interactions'), count: interactions.length, content: <DataTable label={t('pp.crm.interactions')} columns={interactionCols} rows={interactions} rowId={(x) => x.id} empty={t('pp.crm.none')} exportName="interactions" pageSize={25} /> },
          { value: 'contacts', label: t('pd.co.contacts'), count: c.contacts.length, content: <DataTable label={t('pd.co.contacts')} columns={contactCols} rows={c.contacts} rowId={(x) => x.id} empty={t('pd.co.noContacts')} /> },
          { value: 'drives', label: t('pd.drives'), count: c.drives.length, content: <DataTable label={t('pd.drives')} columns={driveCols} rows={c.drives} rowId={(x) => x.id} empty={t('pd.empty.drives')} /> },
        ]}
      />
      {dialog}
      {key && (
        <Dialog title={t('pd.co.keyTitle')} onClose={() => setKey(null)} actions={<Button onClick={() => setKey(null)}>{t('ops.close')}</Button>}>
          <p className="mb-3 text-sm">{t('pd.co.keyHelp')}</p>
          <p className="break-all rounded-md border bg-muted p-3 font-mono text-xs" data-testid="portal-key">{key}</p>
        </Dialog>
      )}
    </>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm break-words">{value}</dd>
    </div>
  );
}
