'use client';

import { Printer } from 'lucide-react';
import { allocateAsset, condemnAsset, disposeAsset, logMaintenance, returnAsset, transferAsset } from '@/app/(dashboard)/assets/actions';
import { useDialog, useRun } from '@/components/procurement/useDialog';
import { Button } from '@/components/shadcn/button';
import { RecordPage } from '@/components/templates';
import { Card, DataTable, StatusPill, type Column } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import { assetTagsUrl } from '@/lib/documents';
import { st } from '@/lib/ops-labels';
import type { AssetDetail } from '@/lib/ops';
import { statusTone, type Option } from '@/lib/procurement';
import { statusLabel } from '@/lib/procurement-labels';

/** The printable label: the tag large, the name, the QR code a scanner reads (`zynetix://asset/<tag>`) and that text beneath it. */
export function AssetLabel({ a }: { a: Pick<AssetDetail, 'tag' | 'name' | 'qr' | 'qrSvg'> }) {
  return (
    <div className="border-2 border-solid border-foreground rounded-[10px] p-4 max-w-[320px] text-center print:[break-inside:avoid]" data-testid="asset-label">
      <div className="text-[1.375rem] leading-7 font-bold tracking-[2px]">{a.tag}</div>
      <p className="text-[13px] leading-[19px]">{a.name}</p>
      {/* The SVG is drawn by our API from the tag alone, so it holds nothing a person typed. */}
      <div className="w-[160px] h-[160px] mx-auto my-2 [&_svg]:w-full [&_svg]:h-full [&_svg]:block" data-testid="asset-qr" role="img" aria-label={a.qr} dangerouslySetInnerHTML={{ __html: a.qrSvg }} />
      <div className="text-xs leading-4 tracking-[0.3px] font-mono break-all">{a.qr}</div>
    </div>
  );
}

export interface AssetFull extends AssetDetail {
  room: string | null;
  department: string | null;
  vendor: string | null;
  po: string | null;
  poId: string | null;
  make: string | null;
  model: string | null;
  serialNo: string | null;
  invoiceNo: string | null;
  warrantyUntil: string | null;
  transfers: { id: string; fromLocation: string; toLocation: string; reason: string; transferredOn: string }[];
  condemnations: { id: string; number: string; reason: string; status: string; createdAt: string; disposalMode: string | null; realisedPaise: number | null }[];
}

const YES_NO = (t: (k: 'ops.yes' | 'ops.no') => string) => [{ value: 'no', label: t('ops.no') }, { value: 'yes', label: t('ops.yes') }];

/**
 * One asset: its label, cost and book value, who has it, where it has been moved, servicing, the depreciation
 * schedule and any condemnation; giving it out, taking it back, servicing, moving, proposing it for condemnation
 * and disposal are here.
 */
export function AssetView({ a, rooms, departments, canEdit }: { a: AssetFull; rooms: Option[]; departments: Option[]; canEdit: boolean }) {
  const { t, fmt } = useI18n();
  const [open, dialog] = useDialog();
  const run = useRun();
  const live = a.status !== 'disposed';
  const out = a.allocations.find((x) => !x.returnedOn);

  type Dep = AssetDetail['depreciation'][number];
  type Alloc = AssetDetail['allocations'][number];
  type Maint = AssetDetail['maintenance'][number];
  type Move = AssetFull['transfers'][number];
  type Cond = AssetFull['condemnations'][number];
  const depCols: Column<Dep>[] = [
    { id: 'year', header: t('as.year'), rowHeader: true, cell: (r) => r.year },
    { id: 'dep', header: t('as.depreciationCol'), align: 'right', cell: (r) => fmt.rupees(r.depreciationPaise) },
    { id: 'book', header: t('as.bookValue'), align: 'right', cell: (r) => fmt.rupees(r.bookValuePaise) },
  ];
  const allocCols: Column<Alloc>[] = [
    { id: 'to', header: t('as.assignedTo'), rowHeader: true, cell: (r) => r.assignedTo },
    { id: 'from', header: t('as.from'), cell: (r) => fmt.date(r.allocatedOn, 'short') },
    { id: 'until', header: t('as.to'), cell: (r) => (r.returnedOn ? fmt.date(r.returnedOn, 'short') : t('as.current')) },
  ];
  const maintCols: Column<Maint>[] = [
    { id: 'kind', header: t('as.kind'), rowHeader: true, cell: (r) => st(t, r.kind) },
    { id: 'desc', header: t('ho.description'), cell: (r) => r.description || '—' },
    { id: 'done', header: t('as.done'), cell: (r) => fmt.date(r.doneOn, 'short') },
    { id: 'cost', header: t('as.cost'), align: 'right', cell: (r) => fmt.rupees(r.costPaise) },
    { id: 'next', header: t('as.nextDue'), cell: (r) => (r.nextDueOn ? fmt.date(r.nextDueOn, 'short') : '—') },
  ];
  const moveCols: Column<Move>[] = [
    { id: 'on', header: t('ivd.date'), rowHeader: true, cell: (r) => fmt.date(r.transferredOn, 'short') },
    { id: 'from', header: t('as.from'), cell: (r) => r.fromLocation || '—' },
    { id: 'to', header: t('as.to'), cell: (r) => r.toLocation || '—' },
    { id: 'reason', header: t('ho.reason'), cell: (r) => r.reason },
  ];
  const condCols: Column<Cond>[] = [
    { id: 'no', header: t('inv.number'), rowHeader: true, cell: (r) => r.number },
    { id: 'reason', header: t('ho.reason'), cell: (r) => r.reason },
    { id: 'realised', header: t('ivd.as.realised'), align: 'right', cell: (r) => (r.realisedPaise ? fmt.rupees(r.realisedPaise) : '—') },
    { id: 'status', header: t('ops.f.status'), cell: (r) => <StatusPill tone={statusTone(r.status)}>{statusLabel(t, r.status)}</StatusPill> },
  ];

  return (
    <>
      <RecordPage
        title={`${a.tag} · ${a.name}`}
        subtitle={[a.category, a.room ?? a.location, a.department].filter(Boolean).join(' · ') || undefined}
        status={{ label: statusLabel(t, a.status), tone: statusTone(a.status) }}
        facts={[
          { label: t('as.bookValue'), value: fmt.rupees(a.bookValuePaise) },
          { label: t('as.cost'), value: fmt.rupees(a.costPaise) },
          { label: t('as.purchasedOn'), value: fmt.date(a.purchasedOn, 'short') },
          { label: t('as.assignedTo'), value: out?.assignedTo ?? '—' },
          { label: t('ivd.as.warranty'), value: a.warrantyUntil ? fmt.date(a.warrantyUntil, 'short') : '—' },
          { label: t('as.method'), value: `${st(t, a.method)}${a.method === 'wdv' && a.wdvRatePct != null ? ` (${a.wdvRatePct}%)` : ''}` },
        ]}
        primary={
          canEdit && live ? (
            out ? (
              <Button onClick={() => void run(() => returnAsset(a.id), t('ivd.as.returned'))}>{t('as.return')}</Button>
            ) : (
              <Button
                onClick={() =>
                  open({
                    title: t('as.allocate'),
                    fields: [
                      { name: 'assignedTo', label: t('as.assignedTo'), required: true },
                      { name: 'allocatedOn', label: t('as.from'), kind: 'date' },
                    ],
                    run: (v) => allocateAsset(a.id, v),
                  })
                }
              >
                {t('as.allocate')}
              </Button>
            )
          ) : undefined
        }
        secondary={
          <>
            <Button variant="outline" asChild>
              <a href={assetTagsUrl([a.id])} target="_blank" rel="noopener">
                <Printer /> {t('as.printTags')}
              </a>
            </Button>
            {canEdit && live && (
              <>
                <Button
                  variant="outline"
                  onClick={() =>
                    open({
                      title: t('as.maintenance'),
                      fields: [
                        { name: 'kind', label: t('as.kind'), kind: 'select', required: true, init: 'service', options: ['service', 'repair', 'inspection'].map((k) => ({ value: k, label: st(t, k) })) },
                        { name: 'description', label: t('ho.description') },
                        { name: 'cost', label: t('as.cost'), kind: 'rupees' },
                        { name: 'doneOn', label: t('as.done'), kind: 'date', required: true },
                        { name: 'nextDueOn', label: t('as.nextDue'), kind: 'date' },
                        { name: 'ongoing', label: t('as.ongoing'), kind: 'select', init: 'no', options: YES_NO(t) },
                      ],
                      run: (v) => logMaintenance(a.id, v),
                    })
                  }
                >
                  {t('as.maintenance')}
                </Button>
                <Button
                  variant="outline"
                  onClick={() =>
                    open({
                      title: t('ivd.as.transfer'),
                      intro: t('ivd.as.transferHelp'),
                      fields: [
                        { name: 'toRoomId', label: t('ivd.as.toRoom'), kind: 'select', options: rooms },
                        { name: 'toDepartmentId', label: t('ivd.department'), kind: 'select', options: departments },
                        { name: 'toLocation', label: t('as.location') },
                        { name: 'on', label: t('ivd.date'), kind: 'date' },
                        { name: 'reason', label: t('ho.reason'), required: true },
                      ],
                      done: t('ivd.as.moved'),
                      run: (v) => transferAsset(a.id, v),
                    })
                  }
                >
                  {t('ivd.as.transfer')}
                </Button>
                {!a.condemnations.some((c) => ['proposed', 'approved'].includes(c.status)) && (
                  <Button variant="outline" onClick={() => open({ title: t('ivd.as.condemn'), intro: t('ivd.as.condemnHelp'), fields: [{ name: 'reason', label: t('ho.reason'), kind: 'multiline', required: true }, { name: 'condition', label: t('ivd.as.condition') }], done: t('ivd.as.proposed'), run: (v) => condemnAsset(a.id, v) })}>
                    {t('ivd.as.condemn')}
                  </Button>
                )}
                <Button variant="outline" className="text-destructive" onClick={() => open({ title: t('as.dispose'), fields: [{ name: 'disposedOn', label: t('as.disposedOn'), kind: 'date', required: true }, { name: 'proceeds', label: t('as.proceeds'), kind: 'rupees' }], run: (v) => disposeAsset(a.id, v) })}>
                  {t('as.dispose')}
                </Button>
              </>
            )}
          </>
        }
        overview={
          <div className="grid gap-6">
            <Card title={t('ivd.as.identity')}>
              <div className="flex flex-wrap items-start gap-6">
                <AssetLabel a={a} />
                <dl className="grid min-w-[220px] flex-1 gap-x-8 gap-y-4 sm:grid-cols-2">
                  <Fact label={t('ivd.as.make')} value={[a.make, a.model].filter(Boolean).join(' ') || '—'} />
                  <Fact label={t('ivd.as.serial')} value={a.serialNo ?? '—'} />
                  <Fact label={t('ivd.as.supplier')} value={a.vendor ?? '—'} />
                  <Fact label={t('inv.invoiceNo')} value={a.invoiceNo ?? '—'} />
                  <Fact label={t('inv.po')} value={a.po ?? '—'} />
                  <Fact label={t('as.location')} value={a.room ?? (a.location || '—')} />
                </dl>
              </div>
            </Card>
            <Card title={t('as.depreciation')}>
              <DataTable label={t('as.depreciation')} columns={depCols} rows={a.depreciation} rowId={(r) => String(r.year)} empty={t('as.noDepr')} />
            </Card>
          </div>
        }
        related={[
          { value: 'allocations', label: t('as.allocations'), count: a.allocations.length, content: <DataTable label={t('as.allocations')} columns={allocCols} rows={a.allocations} rowId={(r) => r.id} empty={t('as.noAllocs')} /> },
          { value: 'maintenance', label: t('as.maintenance'), count: a.maintenance.length, content: <DataTable label={t('as.maintenance')} columns={maintCols} rows={a.maintenance} rowId={(r) => r.id} empty={t('as.noMaint')} /> },
          { value: 'transfers', label: t('ivd.as.transfers'), count: a.transfers.length, content: <DataTable label={t('ivd.as.transfers')} columns={moveCols} rows={a.transfers} rowId={(r) => r.id} empty={t('ivd.as.noTransfers')} /> },
          { value: 'condemnations', label: t('ivd.aview.condemnations'), count: a.condemnations.length, content: <DataTable label={t('ivd.aview.condemnations')} columns={condCols} rows={a.condemnations} rowId={(r) => r.id} empty={t('ivd.empty.condemnations')} /> },
        ]}
      />
      {dialog}
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
