'use client';
import { useState, useTransition } from 'react';
import { Ban, ExternalLink, FileDown, QrCode, RefreshCcw } from 'lucide-react';
import { reissueIssued, revokeIssued } from '@/app/(dashboard)/documents/designs-actions';
import { pillTone, useNotice } from '@/components/hr/Common';
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, Tooltip } from '@/components/kx';
import { DataTable, EmptyState, StatusPill, TextInput } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import { DOC_TYPES, type IssuedDocument } from '@/lib/doc-designs';

const TONE = { valid: 'success', revoked: 'error', superseded: 'default' } as const;

/** Documents > Issued: the register of every document issued with a QR, with reprint, reissue and revoke. */
export function IssuedRegister({ rows, canManage }: { rows: IssuedDocument[]; canManage: boolean }) {
  const { t, fmt } = useI18n();
  const { run, view } = useNotice();
  const [revoking, setRevoking] = useState<IssuedDocument | null>(null);
  const [reissuing, setReissuing] = useState<IssuedDocument | null>(null);
  const typeName = (x: string) => t(`dt.type.${x}` as MessageKey);
  if (!rows.length) return <EmptyState icon={<QrCode />} title={t('di.none')}>{t('di.noneBody')}</EmptyState>;
  return (
    <>
      {view}
      <DataTable
        testId="issued"
        label={t('doc.tab.issued')}
        rows={rows}
        rowId={(x) => x.id}
        exportName="issued-documents"
        initialSort={{ id: 'issued', dir: 'desc' }}
        searchText={(x) => `${x.serial} ${x.subjectName ?? ''} ${x.title} ${x.fingerprint}`}
        filters={[
          { id: 'type', label: t('di.allTypes'), options: DOC_TYPES.filter((d) => rows.some((r) => r.docType === d)).map((d) => ({ value: d, label: typeName(d) })), match: (r, v) => r.docType === v },
          { id: 'status', label: t('di.allStatuses'), options: (['valid', 'revoked', 'superseded'] as const).map((s) => ({ value: s, label: t(`di.status.${s}`) })), match: (r, v) => r.status === v },
        ]}
        rowAttrs={(x) => ({ 'data-status': x.status })}
        columns={[
          { id: 'serial', header: t('di.serial'), rowHeader: true, sort: (x) => x.serial, cell: (x) => <span className="font-mono text-[13px]">{x.serial}</span> },
          { id: 'doc', header: t('di.document'), sort: (x) => typeName(x.docType), cell: (x) => typeName(x.docType) },
          { id: 'who', header: t('di.subject'), sort: (x) => x.subjectName ?? '', cell: (x) => x.subjectName ?? '—' },
          { id: 'issued', header: t('di.issuedAt'), sort: (x) => x.issuedAt, cell: (x) => fmt.dateTime(x.issuedAt) },
          {
            id: 'status',
            header: t('di.status'),
            sort: (x) => x.status,
            cell: (x) => (
              <StatusPill tone={pillTone(TONE[x.status])} title={x.revokedReason ? t('di.reasonShown', { reason: x.revokedReason }) : undefined}>
                {t(`di.status.${x.status}`)}
              </StatusPill>
            ),
          },
          { id: 'fp', header: t('di.fingerprint'), hideBelow: 'lg', sort: (x) => x.fingerprint, cell: (x) => <span className="font-mono text-xs text-muted-foreground">{x.fingerprint}</span> },
          {
            id: 'actions',
            header: '',
            align: 'right',
            csv: false,
            cell: (x) => (
              <span className="inline-flex">
                <Tooltip title={t('di.open')}>
                  <IconButton size="small" aria-label={`${t('di.open')} ${x.serial}`} onClick={() => window.open(`/api/doc-image?kind=issued&id=${x.id}`, '_blank', 'noopener')}>
                    <FileDown className="size-4" />
                  </IconButton>
                </Tooltip>
                <Tooltip title={t('di.verify')}>
                  <IconButton size="small" aria-label={`${t('di.verify')} ${x.serial}`} onClick={() => window.open(x.verifyUrl, '_blank', 'noopener')}>
                    <ExternalLink className="size-4" />
                  </IconButton>
                </Tooltip>
                {canManage && x.status === 'valid' && (
                  <>
                    <Tooltip title={t('di.reissue')}>
                      <IconButton size="small" aria-label={`${t('di.reissue')} ${x.serial}`} onClick={() => setReissuing(x)}>
                        <RefreshCcw className="size-4" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title={t('di.revoke')}>
                      <IconButton size="small" color="error" aria-label={`${t('di.revoke')} ${x.serial}`} onClick={() => setRevoking(x)}>
                        <Ban className="size-4" />
                      </IconButton>
                    </Tooltip>
                  </>
                )}
              </span>
            ),
          },
        ]}
      />
      {revoking && <RevokeDialog doc={revoking} run={run} onClose={() => setRevoking(null)} />}
      {reissuing && <ReissueDialog doc={reissuing} run={run} onClose={() => setReissuing(null)} />}
    </>
  );
}

function RevokeDialog({ doc, run, onClose }: { doc: IssuedDocument; run: ReturnType<typeof useNotice>['run']; onClose: () => void }) {
  const { t } = useI18n();
  const [reason, setReason] = useState('');
  const [busy, start] = useTransition();
  return (
    <Dialog open onClose={onClose} aria-labelledby="revoke-title">
      <DialogTitle id="revoke-title">{t('di.revokeTitle', { serial: doc.serial })}</DialogTitle>
      <DialogContent>
        <TextInput autoFocus fullWidth multiline minRows={2} label={t('di.reason')} value={reason} onChange={(e) => setReason(e.target.value)} inputProps={{ maxLength: 300 }} />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('dt.cancel')}</Button>
        <Button variant="contained" color="error" disabled={busy || reason.trim().length < 3} onClick={() => start(async () => void ((await run(() => revokeIssued(doc.id, reason), t('di.revoked'))).ok && onClose()))}>
          {t('di.revoke')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function ReissueDialog({ doc, run, onClose }: { doc: IssuedDocument; run: ReturnType<typeof useNotice>['run']; onClose: () => void }) {
  const { t } = useI18n();
  const [busy, start] = useTransition();
  const go = () =>
    start(async () => {
      const res = await reissueIssued(doc.id);
      await run(async () => res, res.ok ? t('di.reissued', { serial: res.data.serial }) : undefined);
      if (res.ok) {
        window.open(`/api/doc-image?kind=issued&id=${res.data.id}`, '_blank', 'noopener');
        onClose();
      }
    });
  return (
    <Dialog open onClose={onClose} aria-labelledby="reissue-title">
      <DialogTitle id="reissue-title">{t('di.reissueTitle', { serial: doc.serial })}</DialogTitle>
      <DialogContent>
        <p className="m-0 text-sm text-muted-foreground">{t('di.reissueBody')}</p>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('dt.cancel')}</Button>
        <Button variant="contained" disabled={busy} onClick={go}>
          {t('di.reissue')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
