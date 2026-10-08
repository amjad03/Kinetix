'use client';

import Button from '@mui/material/Button';
import Link from '@mui/material/Link';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { completeAudit, raiseNc, recordResult } from '@/app/(dashboard)/academic-audit/actions';
import { ActionButton, Bar, FormDialog, Grid, Pill, useToast } from '@/components/ops/kit';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import type { AuditDetail, MentorRef } from '@/lib/quality';

type Item = AuditDetail['results'][number];
type Dialog = { record: Item } | 'raise';

/** One audit: the checklist with each finding, and the non-conformities raised from it. */
export function AuditSheet({ audit, owners }: { audit: AuditDetail; owners: MentorRef[] }) {
  const { t, fmt } = useI18n();
  const [dlg, setDlg] = useState<Dialog | null>(null);
  const [toast, toastNode] = useToast();
  const open = audit.status === 'in_progress';
  const done = (m?: string) => {
    setDlg(null);
    if (m) toast(m);
  };
  const gaps = audit.results.filter((r) => r.result === 'partial' || r.result === 'non_compliant');
  return (
    <>
      <Bar>
        <Link href="/academic-audit?tab=audits" underline="hover" sx={{ alignSelf: 'center', mr: 2 }}>
          {t('au.sheet.back')}
        </Link>
        {open && <Button variant="outlined" onClick={() => setDlg('raise')}>{t('au.raise')}</Button>}
        {open && <ActionButton label={t('au.complete')} run={() => completeAudit(audit.id)} onDone={toast} />}
      </Bar>
      {open && <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>{t('au.completeHint')}</Typography>}
      <Typography variant="h6" sx={{ fontSize: '1.125rem', mt: 2, mb: 1 }}>{t('au.sheet.checklist')}</Typography>
      <Grid
        testId="au-checklist"
        empty={t('au.empty.audits')}
        rows={audit.results}
        tint={(r) => r.result === 'non_compliant'}
        cols={[
          { label: '#', cell: (r) => r.ord, num: true },
          { label: t('au.col.checklist'), cell: (r) => (r.category ? `${r.category}: ${r.itemText}` : r.itemText) },
          { label: t('au.col.result'), cell: (r) => <Pill warn={r.result === 'non_compliant'} label={t(`au.result.${r.result}` as MessageKey)} />, sort: (r) => r.result },
          { label: t('au.col.remark'), cell: (r) => r.remark || t('ops.none') },
          { label: '', cell: (r) => (open ? <Button size="small" onClick={() => setDlg({ record: r })}>{t('au.record')}</Button> : null) },
        ]}
      />
      <Typography variant="h6" sx={{ fontSize: '1.125rem', mt: 3, mb: 1 }}>{t('au.sheet.ncs')}</Typography>
      <Grid
        testId="au-sheet-ncs"
        empty={t('au.empty.ncs')}
        rows={audit.nonConformities}
        cols={[
          { label: t('au.f.description2'), cell: (n) => n.description },
          { label: t('au.col.severity'), cell: (n) => t(`au.sev.${n.severity}` as MessageKey) },
          { label: t('au.f.correctiveAction'), cell: (n) => n.correctiveAction || t('ops.none') },
          { label: t('au.col.owner'), cell: (n) => owners.find((o) => o.id === n.ownerUserId)?.fullName ?? t('ops.none') },
          { label: t('au.col.due'), cell: (n) => (n.dueOn ? fmt.date(n.dueOn, 'short') : t('ops.none')), sort: (n) => n.dueOn },
          { label: t('au.col.status'), cell: (n) => <Pill label={t(`au.nc.${n.status}` as MessageKey)} /> },
        ]}
      />
      {dlg && typeof dlg === 'object' && 'record' in dlg && (
        <FormDialog
          title={t('au.recordTitle')}
          intro={<Typography variant="body2">{dlg.record.itemText}</Typography>}
          fields={[
            { name: 'result', label: t('au.f.result'), kind: 'select', options: (['compliant', 'partial', 'non_compliant'] as const).map((r) => ({ value: r, label: t(`au.result.${r}` as MessageKey) })), required: true, init: dlg.record.result === 'pending' ? '' : dlg.record.result },
            { name: 'remark', label: t('au.f.remark'), kind: 'multiline', init: dlg.record.remark },
          ]}
          onSubmit={(v) => recordResult(audit.id, dlg.record.id, v)}
          onClose={done}
        />
      )}
      {dlg === 'raise' && (
        <FormDialog
          title={t('au.raiseTitle')}
          fields={[
            { name: 'resultId', label: t('au.f.item'), kind: 'select', options: gaps.map((g) => ({ value: g.id, label: `${g.ord}. ${g.itemText}` })) },
            { name: 'description', label: t('au.f.description2'), kind: 'multiline', required: true },
            { name: 'severity', label: t('au.f.severity'), kind: 'select', options: (['minor', 'major'] as const).map((s) => ({ value: s, label: t(`au.sev.${s}` as MessageKey) })), init: 'minor' },
            { name: 'correctiveAction', label: t('au.f.correctiveAction'), kind: 'multiline' },
            { name: 'ownerUserId', label: t('au.f.owner'), kind: 'select', options: owners.map((o) => ({ value: o.id, label: o.fullName })) },
            { name: 'dueOn', label: t('au.f.dueOn'), kind: 'date' },
          ]}
          onSubmit={(v) => raiseNc(audit.id, v)}
          onClose={done}
        />
      )}
      {toastNode}
    </>
  );
}
