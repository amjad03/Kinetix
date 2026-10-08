'use client';

import Add from '@mui/icons-material/Add';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import PrintOutlined from '@mui/icons-material/PrintOutlined';
import { allocateAsset, disposeAsset, loadAsset, logMaintenance, postDepreciation, registerAsset, returnAsset } from '@/app/(dashboard)/assets/actions';
import { assetTagsUrl } from '@/lib/documents';
import { DataTable, EmptyState } from '@/components/ui';
import { ActionButton, Bar, FormDialog, Grid, InfoDialog, Pill, useToast } from '@/components/ops/kit';
import { SectionTitle } from '@/components/PageHeader';
import { useI18n } from '@/i18n/client';
import { st } from '@/lib/ops-labels';
import type { Asset, AssetDetail, MaintDue } from '@/lib/ops';

type Dialog = 'register' | 'depr' | { detail: AssetDetail } | { allocate: AssetDetail } | { maintain: AssetDetail } | { dispose: AssetDetail };

/** The printable label: the tag large, the name, the QR code a scanner reads (`kinetix://asset/<tag>`) and that text beneath it. */
export function AssetLabel({ a }: { a: Pick<AssetDetail, 'tag' | 'name' | 'qr' | 'qrSvg'> }) {
  return (
    <Box data-testid="asset-label" sx={{ border: 2, borderStyle: 'solid', borderColor: 'text.primary', borderRadius: 1, p: 2, maxWidth: 320, textAlign: 'center', '@media print': { breakInside: 'avoid' } }}>
      <Typography variant="h5" component="div" sx={{ fontWeight: 700, letterSpacing: 2 }}>{a.tag}</Typography>
      <Typography variant="body2">{a.name}</Typography>
      {/* The SVG is drawn by our API from the tag alone, so it holds nothing a person typed. */}
      <Box data-testid="asset-qr" role="img" aria-label={a.qr} sx={{ width: 160, height: 160, mx: 'auto', my: 1, '& svg': { width: '100%', height: '100%', display: 'block' } }} dangerouslySetInnerHTML={{ __html: a.qrSvg }} />
      <Typography variant="caption" component="div" sx={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>{a.qr}</Typography>
    </Box>
  );
}

export function AssetsDesk({ assets, due }: { assets: Asset[]; due: MaintDue[] }) {
  const { t, fmt } = useI18n();
  const [dlg, setDlg] = useState<Dialog | null>(null);
  const [toast, toastNode] = useToast();
  const done = (m?: string) => {
    setDlg(null);
    if (m) toast(m);
  };
  const open = async (assetId: string) => {
    const res = await loadAsset(assetId);
    if (res.ok) setDlg({ detail: res.data });
    else toast(res.error);
  };
  const methods = [{ value: 'slm', label: t('ops.st.slm') }, { value: 'wdv', label: t('ops.st.wdv') }];

  return (
    <>
      <Bar>
        <Button variant="contained" startIcon={<Add />} onClick={() => setDlg('register')} sx={{ mt: 3 }}>{t('as.register')}</Button>
        <Button variant="outlined" startIcon={<PrintOutlined />} href={assetTagsUrl()} target="_blank" disabled={assets.length === 0} sx={{ mt: 3 }}>{t('as.printAllTags')}</Button>
        <Button variant="outlined" onClick={() => setDlg('depr')} disabled={assets.length === 0} sx={{ mt: 3 }}>{t('as.postDep')}</Button>
      </Bar>
      {assets.length === 0 ? (
        <EmptyState dense icon={<Box component="span">·</Box>} title={t('as.none')} testId="as-list-empty" />
      ) : (
        <DataTable
          testId="as-list"
          label={t('nav.assets')}
          rows={assets}
          rowId={(a) => a.id}
          selectable
          exportName="assets"
          bulkActions={[{ id: 'tags', label: t('as.printTags'), icon: <PrintOutlined />, onClick: (rows) => void window.open(assetTagsUrl(rows.map((r) => r.id)), '_blank') }]}
          filters={[{ id: 'status', label: t('ops.f.status'), options: [...new Set(assets.map((a) => a.status))].map((s) => ({ value: s, label: st(t, s) })), match: (a, v) => a.status === v }]}
          initialSort={{ id: 'tag', dir: 'asc' }}
          columns={[
            { id: 'tag', header: t('as.tag'), rowHeader: true, sort: (a) => a.tag, cell: (a) => a.tag },
            { id: 'name', header: t('ops.f.name'), sort: (a) => a.name, cell: (a) => a.name },
            { id: 'location', header: t('as.location'), hideBelow: 'md', sort: (a) => a.location, cell: (a) => a.location || t('ops.none') },
            { id: 'assignedTo', header: t('as.assignedTo'), hideBelow: 'md', sort: (a) => a.assignedTo ?? '', cell: (a) => a.assignedTo ?? t('ops.none') },
            { id: 'book', header: t('as.bookValue'), align: 'right', sort: (a) => a.bookValuePaise / 100, cell: (a) => fmt.rupees(a.bookValuePaise) },
            { id: 'status', header: t('ops.f.status'), sort: (a) => st(t, a.status), cell: (a) => <Pill label={st(t, a.status)} /> },
            { id: 'open', header: '', csv: false, align: 'right', cell: (a) => <Button size="small" onClick={() => void open(a.id)}>{t('ops.details')}</Button> },
          ]}
        />
      )}
      {due.length > 0 && (
        <>
          <SectionTitle>{t('as.serviceDue')}</SectionTitle>
          <Grid testId="as-due-list" empty="" rows={due} cols={[{ label: t('as.tag'), cell: (d) => d.tag }, { label: t('ops.f.name'), cell: (d) => d.name }, { label: t('as.nextDue'), cell: (d) => fmt.date(d.nextDueOn, 'short') }]} />
        </>
      )}

      {dlg === 'depr' && <FormDialog title={t('as.postDep')} onSubmit={postDepreciation} onClose={(m) => done(m ? t('as.postedMsg') : undefined)} fields={[{ name: 'fiscalYear', label: t('as.fy'), required: true }]} />}
      {dlg === 'register' && (
        <FormDialog
          title={t('as.register')}
          onSubmit={registerAsset}
          onClose={done}
          fields={[
            { name: 'name', label: t('ops.f.name'), required: true },
            { name: 'category', label: t('inv.category') },
            { name: 'location', label: t('as.location') },
            { name: 'purchasedOn', label: t('as.purchasedOn'), kind: 'date', required: true },
            { name: 'cost', label: t('as.cost'), kind: 'rupees', required: true },
            { name: 'salvage', label: t('as.salvage'), kind: 'rupees' },
            { name: 'life', label: t('as.life'), kind: 'number', required: true },
            { name: 'method', label: t('as.method'), kind: 'select', init: 'slm', options: methods },
            { name: 'rate', label: t('as.rate') },
          ]}
        />
      )}
      {dlg && typeof dlg === 'object' && 'detail' in dlg && (
        <InfoDialog title={`${dlg.detail.tag} · ${dlg.detail.name}`} onClose={() => setDlg(null)}>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 3, alignItems: 'flex-start', mb: 2 }}>
            <AssetLabel a={dlg.detail} />
            <Box>
              <Typography variant="body2">{t('as.bookValue')}: {fmt.rupees(dlg.detail.bookValuePaise)}</Typography>
              <Typography variant="body2">{t('as.cost')}: {fmt.rupees(dlg.detail.costPaise)}</Typography>
              <Typography variant="body2">{t('as.method')}: {st(t, dlg.detail.method)}{dlg.detail.method === 'wdv' && dlg.detail.wdvRatePct != null ? ` (${dlg.detail.wdvRatePct}%)` : ''}</Typography>
              <Typography variant="body2">{t('ops.f.status')}: {st(t, dlg.detail.status)}</Typography>
              <Button size="small" onClick={() => window.print()} sx={{ mt: 1 }}>{t('as.printLabel')}</Button>
              <Button size="small" href={assetTagsUrl([dlg.detail.id])} target="_blank" sx={{ mt: 1 }}>{t('as.printTags')}</Button>
            </Box>
          </Box>
          {dlg.detail.status !== 'disposed' && (
            <Bar>
              {dlg.detail.allocations.some((x) => !x.returnedOn) ? <ActionButton label={t('as.return')} run={() => returnAsset(dlg.detail.id)} onDone={(m) => done(m)} /> : <Button variant="outlined" onClick={() => setDlg({ allocate: dlg.detail })}>{t('as.allocate')}</Button>}
              <Button variant="outlined" onClick={() => setDlg({ maintain: dlg.detail })}>{t('as.maintenance')}</Button>
              <Button variant="outlined" color="error" onClick={() => setDlg({ dispose: dlg.detail })}>{t('as.dispose')}</Button>
            </Bar>
          )}
          <Typography variant="h6" sx={{ fontSize: '1.125rem', mb: 1 }}>{t('as.depreciation')}</Typography>
          <Grid
            testId="as-depr"
            empty={t('as.noDepr')}
            rows={dlg.detail.depreciation}
            cols={[
              { label: t('as.year'), cell: (r) => r.year, num: true },
              { label: t('as.depreciationCol'), cell: (r) => fmt.rupees(r.depreciationPaise), num: true },
              { label: t('as.bookValue'), cell: (r) => fmt.rupees(r.bookValuePaise), num: true },
            ]}
          />
          <Typography variant="h6" sx={{ fontSize: '1.125rem', mt: 3, mb: 1 }}>{t('as.allocations')}</Typography>
          <Grid testId="as-allocs" empty={t('as.noAllocs')} rows={dlg.detail.allocations} cols={[{ label: t('as.assignedTo'), cell: (r) => r.assignedTo }, { label: t('as.from'), cell: (r) => fmt.date(r.allocatedOn, 'short') }, { label: t('as.to'), cell: (r) => (r.returnedOn ? fmt.date(r.returnedOn, 'short') : t('as.current')) }]} />
          <Typography variant="h6" sx={{ fontSize: '1.125rem', mt: 3, mb: 1 }}>{t('as.maintenance')}</Typography>
          <Grid
            testId="as-maint-list"
            empty={t('as.noMaint')}
            rows={dlg.detail.maintenance}
            cols={[{ label: t('as.kind'), cell: (r) => st(t, r.kind) }, { label: t('ho.description'), cell: (r) => r.description || t('ops.none') }, { label: t('as.done'), cell: (r) => fmt.date(r.doneOn, 'short') }, { label: t('as.cost'), cell: (r) => fmt.rupees(r.costPaise), num: true }, { label: t('as.nextDue'), cell: (r) => (r.nextDueOn ? fmt.date(r.nextDueOn, 'short') : t('ops.none')) }]}
          />
        </InfoDialog>
      )}
      {dlg && typeof dlg === 'object' && 'allocate' in dlg && (
        <FormDialog title={t('as.allocate')} onSubmit={(v) => allocateAsset(dlg.allocate.id, v)} onClose={done} fields={[{ name: 'assignedTo', label: t('as.assignedTo'), required: true }, { name: 'userId', label: t('tr.loginId'), kind: 'uuid' }, { name: 'allocatedOn', label: t('as.from'), kind: 'date' }]} />
      )}
      {dlg && typeof dlg === 'object' && 'maintain' in dlg && (
        <FormDialog
          title={t('as.maintenance')}
          onSubmit={(v) => logMaintenance(dlg.maintain.id, v)}
          onClose={done}
          fields={[
            { name: 'kind', label: t('as.kind'), kind: 'select', required: true, init: 'service', options: ['service', 'repair', 'inspection'].map((k) => ({ value: k, label: st(t, k) })) },
            { name: 'description', label: t('ho.description') },
            { name: 'cost', label: t('as.cost'), kind: 'rupees' },
            { name: 'doneOn', label: t('as.done'), kind: 'date', required: true },
            { name: 'nextDueOn', label: t('as.nextDue'), kind: 'date' },
            { name: 'ongoing', label: t('as.ongoing'), kind: 'select', init: 'no', options: [{ value: 'no', label: t('ops.no') }, { value: 'yes', label: t('ops.yes') }] },
          ]}
        />
      )}
      {dlg && typeof dlg === 'object' && 'dispose' in dlg && (
        <FormDialog title={t('as.dispose')} onSubmit={(v) => disposeAsset(dlg.dispose.id, v)} onClose={done} fields={[{ name: 'disposedOn', label: t('as.disposedOn'), kind: 'date', required: true }, { name: 'proceeds', label: t('as.proceeds'), kind: 'rupees' }]} />
      )}
      {toastNode}
    </>
  );
}
