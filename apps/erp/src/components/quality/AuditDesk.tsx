'use client';

import Button from '@mui/material/Button';
import Link from '@mui/material/Link';
import { useState } from 'react';
import { archiveTemplate, closeNc, createTemplate, startAudit, updateNc } from '@/app/(dashboard)/academic-audit/actions';
import { ActionButton, Bar, FormDialog, Grid, Pill, Tabbed, useToast } from '@/components/ops/kit';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import type { AuditOptions, AuditRow, AuditSummaryRow, AuditTemplateRow, NonConformityRow } from '@/lib/quality';

type Dialog = 'template' | 'audit' | { update: NonConformityRow } | { close: NonConformityRow };

export function AuditDesk({ summary, audits, templates, ncs, options, canWriteTemplates, initialTab }: { summary: AuditSummaryRow[]; audits: AuditRow[]; templates: AuditTemplateRow[]; ncs: NonConformityRow[]; options: AuditOptions; canWriteTemplates: boolean; initialTab: string }) {
  const { t, fmt } = useI18n();
  const [dlg, setDlg] = useState<Dialog | null>(null);
  const [toast, toastNode] = useToast();
  const done = (m?: string) => {
    setDlg(null);
    if (m) toast(m);
  };
  const owners = options.owners.map((o) => ({ value: o.id, label: o.fullName }));
  const active = templates.filter((x) => x.active);

  return (
    <>
      <Tabbed
        label={t('nav.academicAudit')}
        initial={initialTab}
        tabs={[
          {
            id: 'summary',
            label: t('au.tab.summary'),
            node: (
              <Grid
                testId="au-summary"
                empty={t('au.empty.summary')}
                rows={summary}
                cols={[
                  { label: t('au.col.department'), cell: (d) => d.department },
                  { label: t('au.col.audits'), cell: (d) => `${d.completed}/${d.audits}`, num: true, sort: (d) => d.audits },
                  { label: t('au.col.compliance'), cell: (d) => (d.compliancePct === null ? t('ops.none') : t('au.pct', { pct: d.compliancePct })), num: true, sort: (d) => d.compliancePct },
                  { label: t('au.col.open'), cell: (d) => d.ncOpen, num: true },
                  { label: t('au.col.overdue'), cell: (d) => <Pill warn={d.ncOverdue > 0} label={String(d.ncOverdue)} />, sort: (d) => d.ncOverdue },
                  { label: t('au.col.closed'), cell: (d) => d.ncClosed, num: true },
                ]}
              />
            ),
          },
          {
            id: 'audits',
            label: t('au.tab.audits', { n: audits.length }),
            node: (
              <>
                <Bar>
                  <Button variant="outlined" onClick={() => setDlg('audit')} disabled={active.length === 0 || options.departments.length === 0}>
                    {t('au.startAudit')}
                  </Button>
                </Bar>
                <Grid
                  testId="au-audits"
                  empty={t('au.empty.audits')}
                  rows={audits}
                  cols={[
                    { label: t('au.col.title'), cell: (a) => a.audit.title },
                    { label: t('au.col.department'), cell: (a) => a.department },
                    { label: t('au.col.auditor'), cell: (a) => a.auditor },
                    { label: t('au.col.date'), cell: (a) => fmt.date(a.audit.conductedOn, 'short'), sort: (a) => a.audit.conductedOn },
                    { label: t('au.col.status'), cell: (a) => <Pill label={t(`au.status.${a.audit.status}` as MessageKey)} /> },
                    {
                      label: '',
                      cell: (a) => (
                        <Link href={`/academic-audit/${a.audit.id}`} underline="hover">
                          {t('au.open')}
                        </Link>
                      ),
                    },
                  ]}
                />
              </>
            ),
          },
          {
            id: 'templates',
            label: t('au.tab.templates', { n: templates.length }),
            node: (
              <>
                {canWriteTemplates && (
                  <Bar>
                    <Button variant="outlined" onClick={() => setDlg('template')}>
                      {t('au.newTemplate')}
                    </Button>
                  </Bar>
                )}
                <Grid
                  testId="au-templates"
                  empty={t('au.empty.templates')}
                  rows={templates}
                  cols={[
                    { label: t('au.col.name'), cell: (x) => x.name },
                    { label: t('au.col.description'), cell: (x) => x.description || t('ops.none') },
                    { label: t('au.col.items'), cell: (x) => x.itemCount, num: true },
                    { label: '', cell: (x) => (canWriteTemplates && x.active ? <ActionButton tone="error" label={t('au.archive')} run={() => archiveTemplate(x.id)} onDone={toast} /> : null) },
                  ]}
                />
              </>
            ),
          },
          {
            id: 'ncs',
            label: t('au.tab.ncs', { n: ncs.filter((n) => n.status !== 'closed').length }),
            node: (
              <Grid
                testId="au-ncs"
                empty={t('au.empty.ncs')}
                rows={ncs}
                tint={(n) => n.overdue}
                cols={[
                  { label: t('au.col.department'), cell: (n) => n.department },
                  { label: t('au.f.description2'), cell: (n) => n.description },
                  { label: t('au.col.severity'), cell: (n) => t(`au.sev.${n.severity}` as MessageKey) },
                  { label: t('au.col.owner'), cell: (n) => n.ownerName ?? t('ops.none') },
                  { label: t('au.col.due'), cell: (n) => (n.dueOn ? fmt.date(n.dueOn, 'short') : t('ops.none')), sort: (n) => n.dueOn },
                  { label: t('au.col.status'), cell: (n) => <Pill warn={n.overdue} label={n.overdue ? t('au.overdue') : t(`au.nc.${n.status}` as MessageKey)} /> },
                  {
                    label: '',
                    cell: (n) =>
                      n.status === 'closed' ? null : (
                        <>
                          <Button size="small" onClick={() => setDlg({ update: n })}>
                            {t('au.update')}
                          </Button>
                          <Button size="small" onClick={() => setDlg({ close: n })}>
                            {t('au.close')}
                          </Button>
                        </>
                      ),
                  },
                ]}
              />
            ),
          },
        ]}
      />
      {dlg === 'template' && (
        <FormDialog
          title={t('au.templateTitle')}
          fields={[{ name: 'name', label: t('au.f.name'), required: true }, { name: 'description', label: t('au.f.description') }, { name: 'items', label: t('au.f.items'), kind: 'multiline', required: true }]}
          onSubmit={createTemplate}
          onClose={done}
        />
      )}
      {dlg === 'audit' && (
        <FormDialog
          title={t('au.startTitle')}
          fields={[
            { name: 'templateId', label: t('au.f.template'), kind: 'select', options: active.map((x) => ({ value: x.id, label: x.name })), required: true },
            { name: 'departmentId', label: t('au.f.department'), kind: 'select', options: options.departments.map((d) => ({ value: d.id, label: d.name })), required: true },
            { name: 'title', label: t('au.f.title') },
            { name: 'conductedOn', label: t('au.f.date'), kind: 'date' },
          ]}
          onSubmit={startAudit}
          onClose={done}
        />
      )}
      {dlg && typeof dlg === 'object' && 'update' in dlg && (
        <FormDialog
          title={t('au.updateTitle')}
          fields={[
            { name: 'correctiveAction', label: t('au.f.correctiveAction'), kind: 'multiline', init: dlg.update.correctiveAction },
            { name: 'ownerUserId', label: t('au.f.owner'), kind: 'select', options: owners, init: dlg.update.ownerUserId ?? '' },
            { name: 'dueOn', label: t('au.f.dueOn'), kind: 'date', init: dlg.update.dueOn ?? '' },
            { name: 'status', label: t('au.f.status'), kind: 'select', options: (['open', 'in_progress'] as const).map((s) => ({ value: s, label: t(`au.nc.${s}` as MessageKey) })), init: dlg.update.status === 'closed' ? 'open' : dlg.update.status },
          ]}
          onSubmit={(v) => updateNc(dlg.update.id, v)}
          onClose={done}
        />
      )}
      {dlg && typeof dlg === 'object' && 'close' in dlg && <FormDialog title={t('au.closeTitle')} fields={[{ name: 'closureNote', label: t('au.f.closure'), kind: 'multiline', required: true }]} onSubmit={(v) => closeNc(dlg.close.id, v)} onClose={done} />}
      {toastNode}
    </>
  );
}
