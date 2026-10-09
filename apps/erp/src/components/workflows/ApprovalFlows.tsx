'use client';

import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { setUpFlow } from '@/app/(dashboard)/workflows/bound-actions';
import { FormDialog, Grid, Pill, useToast } from '@/components/ops/kit';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import { APPROVER_ROLES, BOUND_FLOWS, type BoundFlow } from '@/lib/pathways-b';
import type { DefinitionRow } from '@/lib/workflows';

/** The five actions that can be routed for approval, whether the institution has set each one up, and a one-click setup. */
export function ApprovalFlows({ definitions, isAdmin }: { definitions: DefinitionRow[]; isAdmin: boolean }) {
  const { t } = useI18n();
  const [toast, toastNode] = useToast();
  const [setting, setSetting] = useState<BoundFlow | null>(null);
  const defOf = (f: BoundFlow) => definitions.find((d) => d.requestType === f.requestType);
  const flowName = (f: BoundFlow) => t(`pwb.flow.${f.requestType}` as MessageKey);
  return (
    <>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>{t('pwb.wf.help')}</Typography>
      <Grid
        testId="pwb-bound-flows"
        empty={t('pwb.wf.empty')}
        rows={BOUND_FLOWS}
        cols={[
          { label: t('pwb.wf.flow'), cell: (f) => flowName(f), sort: (f) => f.requestType },
          { label: t('pwb.wf.what'), cell: (f) => t(`pwb.flow.desc.${f.requestType}` as MessageKey) },
          { label: t('wf.def.requestType'), cell: (f) => <code>{f.requestType}</code> },
          {
            label: t('wf.col.status'),
            cell: (f) => {
              const d = defOf(f);
              return <Pill label={!d ? t('pwb.wf.none') : d.active ? t('wf.active') : t('wf.inactive')} warn={!d || !d.active} />;
            },
          },
          { label: t('wf.col.steps'), cell: (f) => defOf(f)?.steps.map((s) => s.name).join(' > ') || '-' },
          {
            label: '',
            cell: (f) =>
              isAdmin && !defOf(f) ? (
                <Button size="small" variant="outlined" onClick={() => setSetting(f)} data-testid={`pwb-setup-${f.requestType}`}>{t('pwb.wf.setup')}</Button>
              ) : defOf(f) && !defOf(f)!.active ? (
                <Typography variant="caption" color="text.secondary">{t('pwb.wf.switchedOff')}</Typography>
              ) : null,
          },
        ]}
      />
      {setting && (
        <FormDialog
          title={`${t('pwb.wf.setup')} · ${flowName(setting)}`}
          intro={<Typography variant="body2" color="text.secondary">{t('pwb.wf.setupHelp')}</Typography>}
          onSubmit={(v) => setUpFlow({ ...v, requestType: setting.requestType })}
          onClose={(m) => {
            setSetting(null);
            if (m) toast(m);
          }}
          fields={[
            { name: 'name', label: t('wf.def.name'), required: true, init: flowName(setting) },
            { name: 'role', label: t('pwb.wf.approver'), kind: 'select', required: true, init: 'principal', options: APPROVER_ROLES.map((r) => ({ value: r, label: t(`role.${r}` as MessageKey) })) },
          ]}
        />
      )}
      {toastNode}
    </>
  );
}
