'use client';

import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { boundStatus } from '@/app/(dashboard)/workflows/bound-actions';
import { FormDialog, useToast, type Field } from '@/components/ops/kit';
import { useLoad } from '@/components/pathways-b/common';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import type { BoundFlow, BoundStatus } from '@/lib/pathways-b';
import type { ActionResult } from '@/lib/types';

/** Where the latest approval request for this record stands (read when the dialog opens). */
function Latest({ flow, sourceId }: { flow: BoundFlow; sourceId: string }) {
  const { t } = useI18n();
  const status = useLoad<BoundStatus>(() => boundStatus(flow.module, sourceId));
  if (!status.data?.id) return null;
  return (
    <Typography variant="body2" data-testid="pwb-bound-status">
      {t('pwb.approval.latest', { title: status.data.title ?? '', status: t(`wf.status.${status.data.status ?? 'pending'}` as MessageKey) })}
    </Typography>
  );
}

/**
 * "Send for approval" beside a direct action. It is always offered: when the institution has no active flow for it
 * the dialog says so (the request is refused until the principal sets one up under Workflows), and when it has,
 * the direct action is refused by the API and this is the way to go.
 */
export function SendForApproval({ flow, flows, sourceId, fields = [], onSend }: {
  flow: BoundFlow;
  /** requestType to whether an active definition exists; null when that could not be read. */
  flows: Record<string, boolean> | null;
  /** The record being sent, to show where an earlier request stands. */
  sourceId?: string;
  fields?: Field[];
  onSend: (v: Record<string, string>) => Promise<ActionResult<unknown>>;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [toast, toastNode] = useToast();
  const name = t(`pwb.flow.${flow.requestType}` as MessageKey);
  const missing = flows !== null && !flows[flow.requestType];
  return (
    <>
      <Button size="small" onClick={() => setOpen(true)} data-testid={`pwb-send-${flow.requestType}`}>{t('pwb.approval.send')}</Button>
      {open && (
        <FormDialog
          title={`${t('pwb.approval.send')} · ${name}`}
          submitLabel={t('pwb.approval.send')}
          fields={fields}
          intro={
            <>
              <Alert severity={missing ? 'warning' : 'info'}>{missing ? t('pwb.approval.noFlow', { flow: name }) : t('pwb.approval.hasFlow', { flow: name })}</Alert>
              {sourceId && <Latest flow={flow} sourceId={sourceId} />}
            </>
          }
          onSubmit={onSend}
          onClose={(done) => {
            setOpen(false);
            if (done) toast(t('pwb.approval.sent'));
          }}
        />
      )}
      {toastNode}
    </>
  );
}
