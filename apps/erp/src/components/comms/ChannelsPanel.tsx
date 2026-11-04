'use client';

import { Copy, Plus } from 'lucide-react';
import { useState } from 'react';
import { saveChannel, topUpCredits } from '@/app/(dashboard)/communication/pass-actions';
import { Alert, Button } from '@/components/kx';
import { Bar, FormDialog, Grid, Pill, useToast, type Field } from '@/components/ops/kit';
import { LinkButton } from '@/components/LinkButton';
import { StatGrid, StatTile } from '@/components/StatTile';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import { PAID_CHANNELS, type ChannelRow, type CreditRow } from '@/lib/comms-pass';

/**
 * Communication > Channels: each channel's provider and the institution's registration (the TRAI DLT entity id and
 * header for SMS, the WhatsApp Business number, the email from-address), the price per message, hourly and daily
 * caps, the delivery-report address to give the provider, and prepaid credits with top-ups.
 */
export function ChannelsPanel({ channels, credits, canEdit, canTopUp, onlyCredits = false }: { channels: ChannelRow[]; credits: CreditRow[]; canEdit: boolean; canTopUp: boolean; /** The accounts office's page: balances and top-ups, not the providers. */ onlyCredits?: boolean }) {
  const { t, fmt } = useI18n();
  const [toast, toastNode] = useToast();
  const [editing, setEditing] = useState<ChannelRow | null>(null);
  const [topUp, setTopUp] = useState(false);
  const label = (c: string) => t(`cp.ch.${c}` as MessageKey);
  const sender = (c: ChannelRow['channel']) => t(`cp.sender.${c}` as MessageKey);

  const fields = (c: ChannelRow): Field[] => [
    { name: 'enabled', label: t('cp.f.enabled'), kind: 'select', init: c.enabled ? 'yes' : 'no', options: [{ value: 'yes', label: t('ops.yes') }, { value: 'no', label: t('ops.no') }] },
    ...(c.channel === 'push' ? [] : [{ name: 'senderId', label: sender(c.channel), init: c.senderId } satisfies Field]),
    ...(c.channel === 'sms' ? [{ name: 'dltEntityId', label: t('cp.f.entity'), init: c.dltEntityId } satisfies Field] : []),
    ...(c.channel === 'push' ? [] : [{ name: 'unitCostPaise', label: t('cp.f.price'), kind: 'rupees', init: c.unitCostPaise ? (c.unitCostPaise / 100).toFixed(2) : '0' } satisfies Field]),
    { name: 'hourlyLimit', label: t('cp.f.hourly'), kind: 'number', init: String(c.hourlyLimit) },
    { name: 'dailyLimit', label: t('cp.f.daily'), kind: 'number', init: String(c.dailyLimit) },
    ...(c.channel === 'push' ? [] : [{ name: 'lowBalanceUnits', label: t('cp.f.low'), kind: 'number', init: String(c.lowBalanceUnits) } satisfies Field]),
  ];

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <StatGrid min={180}>
        {credits.map((c) => (
          <StatTile
            key={c.channel}
            label={t('cp.balance', { channel: label(c.channel) })}
            value={c.prepaid ? fmt.number(c.balance) : t('cp.postpaid')}
            caption={c.prepaid ? t('cp.spentMonth', { n: fmt.number(c.spentUnitsThisMonth), amount: fmt.rupees(c.spentPaiseThisMonth) }) : t('cp.postpaidHelp')}
            tone={c.low ? 'warning' : 'default'}
            testId={`cp-credit-${c.channel}`}
          />
        ))}
      </StatGrid>
      {credits.some((c) => c.low) && <Alert severity="warning">{t('cp.lowAlert', { list: credits.filter((c) => c.low).map((c) => label(c.channel)).join(', ') })}</Alert>}
      <Bar>
        {canTopUp && (
          <Button variant="contained" startIcon={<Plus />} onClick={() => setTopUp(true)} data-testid="cp-topup">
            {t('cp.topUp')}
          </Button>
        )}
        {canTopUp && !onlyCredits && (
          <LinkButton href="/communication/credits" variant="outlined">
            {t('cp.ledger')}
          </LinkButton>
        )}
      </Bar>
      {!onlyCredits && (
      <Grid
        testId="cp-channels"
        empty={t('cp.noChannels')}
        rows={channels}
        cols={[
          { label: t('pwb.comms.channel'), cell: (c) => label(c.channel), sort: (c) => c.channel },
          { label: t('cp.col.provider'), cell: (c) => <span className="flex flex-wrap items-center gap-1.5">{c.provider}{!c.connected && <Pill warn label={t('cp.notConnected')} />}</span> },
          { label: t('ops.f.status'), cell: (c) => <Pill label={c.enabled ? t('pwb.ret.on') : t('pwb.ret.off')} warn={!c.enabled} /> },
          { label: t('cp.col.sender'), cell: (c) => (c.channel === 'push' ? '-' : c.senderId || <Pill warn label={t('cp.missing')} />) },
          { label: t('cp.f.entity'), cell: (c) => (c.channel === 'sms' ? c.dltEntityId || <Pill warn label={t('cp.missing')} /> : '-') },
          { label: t('cp.f.price'), cell: (c) => (c.channel === 'push' ? '-' : fmt.rupees(c.unitCostPaise)), num: true },
          { label: t('cp.col.caps'), cell: (c) => [c.hourlyLimit ? t('cp.perHour', { n: fmt.number(c.hourlyLimit) }) : null, c.dailyLimit ? t('cp.perDay', { n: fmt.number(c.dailyLimit) }) : null].filter(Boolean).join(' · ') || t('cp.noCap') },
          {
            label: t('cp.col.report'),
            cell: (c) =>
              c.reportUrl ? (
                <Button
                  size="small"
                  startIcon={<Copy />}
                  onClick={async () => {
                    await navigator.clipboard?.writeText(c.reportUrl ?? '').catch(() => undefined);
                    toast(t('cp.copied'));
                  }}
                >
                  {t('cp.copyUrl')}
                </Button>
              ) : (
                '-'
              ),
          },
          { label: '', cell: (c) => (canEdit ? <Button size="small" onClick={() => setEditing(c)} data-testid={`cp-edit-${c.channel}`}>{t('ops.edit')}</Button> : null) },
        ]}
      />
      )}
      {!onlyCredits && <p className="text-[13px] leading-[19px] text-muted-foreground">{t('cp.dltNote')}</p>}
      {editing && (
        <FormDialog
          title={t('cp.editTitle', { channel: label(editing.channel) })}
          intro={<p className="text-[13px] leading-[19px] text-muted-foreground">{t(`cp.help.${editing.channel}` as MessageKey)}</p>}
          fields={fields(editing)}
          onSubmit={(v) => saveChannel(editing.channel, v)}
          onClose={(m) => {
            setEditing(null);
            if (m) toast(m);
          }}
        />
      )}
      {topUp && (
        <FormDialog
          title={t('cp.topUp')}
          intro={<p className="text-[13px] leading-[19px] text-muted-foreground">{t('cp.topUpHelp')}</p>}
          fields={[
            { name: 'channel', label: t('pwb.comms.channel'), kind: 'select', required: true, init: 'sms', options: PAID_CHANNELS.map((c) => ({ value: c, label: label(c) })) },
            { name: 'kind', label: t('cp.f.kind'), kind: 'select', init: 'topup', options: [{ value: 'topup', label: t('cp.kind.topup') }, { value: 'adjust', label: t('cp.kind.adjust') }] },
            { name: 'direction', label: t('cp.f.direction'), kind: 'select', init: 'add', options: [{ value: 'add', label: t('cp.dir.add') }, { value: 'remove', label: t('cp.dir.remove') }] },
            { name: 'units', label: t('cp.f.units'), kind: 'number', required: true },
            { name: 'amountPaise', label: t('cp.f.amount'), kind: 'rupees' },
            { name: 'reference', label: t('cp.f.reference') },
            { name: 'note', label: t('cp.f.note'), kind: 'multiline' },
          ]}
          onSubmit={topUpCredits}
          onClose={(m) => {
            setTopUp(false);
            if (m) toast(m);
          }}
        />
      )}
      {toastNode}
    </div>
  );
}
