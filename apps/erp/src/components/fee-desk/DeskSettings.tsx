'use client';

import { Plus, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { deskSend } from '@/app/(dashboard)/accounts/actions';
import { ModuleSettingsPage, NumberingSeriesField } from '@/components/templates';
import { Button } from '@/components/shadcn/button';
import { FormGrid, FormRow, SelectInput, SwitchField, TextInput, useToastOptional } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import type { NumberingSeries } from '@/lib/templates';
import { useWord } from './SpecTable';

export interface DeskSettingsData {
  series: Record<string, NumberingSeries>;
  feeHeads: { code: string; name: string; gstRate: number; accountCode: string }[];
  paymentModes: { mode: string; enabled: boolean; accountCode: string }[];
  gateway: string;
  mappings: Record<string, string>;
  approvals: Record<string, number | boolean>;
}
export interface LateRule {
  graceDays: number;
  flatPaise: number;
  perDayPaise: number;
  capPaise: number | null;
}

const SERIES = ['receipt', 'invoice', 'concession', 'refund', 'writeOff', 'voucher'];
const MAPS = ['feeIncome', 'otherIncome', 'refunds', 'cash', 'bank', 'receivable'];

/** The desk's settings on the ModuleSettingsPage template: numbering, fee heads, late fees, payment modes, gateway, account mappings and approvals. */
export function DeskSettings({ initial, rule, accounts, canEditRule }: { initial: DeskSettingsData; rule: LateRule | null; accounts: { code: string; name: string }[]; canEditRule: boolean }) {
  const { t } = useI18n();
  const word = useWord();
  const router = useRouter();
  const toast = useToastOptional();
  const [s, setS] = useState(initial);
  const [late, setLate] = useState({ graceDays: String(rule?.graceDays ?? 7), flat: String((rule?.flatPaise ?? 0) / 100), perDay: String((rule?.perDayPaise ?? 0) / 100), cap: rule?.capPaise != null ? String(rule.capPaise / 100) : '' });
  const [dirty, setDirty] = useState(false);
  const [pending, start] = useTransition();
  const edit = (p: Partial<DeskSettingsData>) => {
    setS({ ...s, ...p });
    setDirty(true);
  };
  const acctOptions = accounts.map((a) => ({ value: a.code, label: `${a.code} ${a.name}` }));

  const save = () =>
    start(async () => {
      const res = await deskSend('/v1/fee-accounts/settings', s, 'PUT');
      if (!res.ok) return toast?.error(res.error);
      if (canEditRule && (Number(late.flat) > 0 || Number(late.perDay) > 0)) {
        const r = await deskSend('/v1/fees/late-fee-rule', { graceDays: Number(late.graceDays) || 0, flatPaise: Math.round(Number(late.flat) * 100), perDayPaise: Math.round(Number(late.perDay) * 100), capPaise: late.cap ? Math.round(Number(late.cap) * 100) : null }, 'PUT');
        if (!r.ok) return toast?.error(r.error);
      }
      setDirty(false);
      toast?.success(t('fd.saved'));
      router.refresh();
    });

  return (
    <ModuleSettingsPage
      title={t('fd.settings')}
      subtitle={t('fd.settings.sub')}
      onSave={save}
      saving={pending}
      dirty={dirty}
      sections={[
        {
          id: 'numbering',
          kind: 'numbering',
          description: t('fd.set.numbering'),
          content: (
            <div className="grid gap-6">
              {SERIES.map((k) => (
                <NumberingSeriesField key={k} label={t(`fd.series.${k}` as MessageKey)} value={s.series[k]} onChange={(v) => edit({ series: { ...s.series, [k]: v } })} />
              ))}
            </div>
          ),
        },
        {
          id: 'heads',
          title: t('fd.set.heads'),
          description: t('fd.set.heads.sub'),
          content: (
            <div className="grid gap-3">
              {s.feeHeads.map((h, i) => (
                <FormRow key={i}>
                  <TextInput label={t('fd.col.code')} value={h.code} onChange={(e) => edit({ feeHeads: s.feeHeads.map((x, j) => (j === i ? { ...x, code: e.target.value.toUpperCase() } : x)) })} />
                  <TextInput label={t('fd.col.head')} value={h.name} onChange={(e) => edit({ feeHeads: s.feeHeads.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} />
                  <TextInput label={t('fd.col.rate')} type="number" value={String(h.gstRate)} onChange={(e) => edit({ feeHeads: s.feeHeads.map((x, j) => (j === i ? { ...x, gstRate: Number(e.target.value) || 0 } : x)) })} />
                  <SelectInput label={t('fd.col.account')} value={h.accountCode} options={acctOptions} onChange={(e) => edit({ feeHeads: s.feeHeads.map((x, j) => (j === i ? { ...x, accountCode: e.target.value } : x)) })} />
                  <Button variant="ghost" size="icon" className="h-10 w-10" aria-label={t('fd.remove')} onClick={() => edit({ feeHeads: s.feeHeads.filter((_, j) => j !== i) })}>
                    <Trash2 className="size-4" />
                  </Button>
                </FormRow>
              ))}
              <div>
                <Button variant="outline" className="h-10" onClick={() => edit({ feeHeads: [...s.feeHeads, { code: '', name: '', gstRate: 0, accountCode: '4000' }] })}>
                  <Plus className="size-4" /> {t('fd.a.addHead')}
                </Button>
              </div>
            </div>
          ),
        },
        {
          id: 'late',
          kind: 'rules',
          title: t('fd.set.late'),
          description: canEditRule ? t('fd.set.late.sub') : t('fd.set.late.principal'),
          content: (
            <FormGrid>
              <TextInput label={t('fd.set.grace')} type="number" value={late.graceDays} disabled={!canEditRule} onChange={(e) => (setLate({ ...late, graceDays: e.target.value }), setDirty(true))} />
              <TextInput label={t('fd.set.flat')} type="number" value={late.flat} disabled={!canEditRule} onChange={(e) => (setLate({ ...late, flat: e.target.value }), setDirty(true))} />
              <TextInput label={t('fd.set.perDay')} type="number" value={late.perDay} disabled={!canEditRule} onChange={(e) => (setLate({ ...late, perDay: e.target.value }), setDirty(true))} />
              <TextInput label={t('fd.set.cap')} type="number" value={late.cap} disabled={!canEditRule} onChange={(e) => (setLate({ ...late, cap: e.target.value }), setDirty(true))} />
            </FormGrid>
          ),
        },
        {
          id: 'modes',
          title: t('fd.set.modes'),
          description: t('fd.set.modes.sub'),
          content: (
            <div className="grid gap-3">
              {s.paymentModes.map((m, i) => (
                <FormRow key={m.mode}>
                  <SwitchField label={word(m.mode)} checked={m.enabled} onChange={(v) => edit({ paymentModes: s.paymentModes.map((x, j) => (j === i ? { ...x, enabled: v } : x)) })} />
                  <SelectInput label={t('fd.col.account')} value={m.accountCode} options={acctOptions} onChange={(e) => edit({ paymentModes: s.paymentModes.map((x, j) => (j === i ? { ...x, accountCode: e.target.value } : x)) })} />
                </FormRow>
              ))}
            </div>
          ),
        },
        {
          id: 'gateway',
          title: t('fd.set.gateway'),
          description: t('fd.set.gateway.sub'),
          content: (
            <FormRow>
              <SelectInput label={t('fd.set.gateway')} value={s.gateway} options={['razorpay', 'payu', 'none'].map((g) => ({ value: g, label: word(g) }))} onChange={(e) => edit({ gateway: e.target.value })} />
              <Button asChild variant="outline" className="h-10">
                <Link href="/settings">{t('fd.set.gatewayKeys')}</Link>
              </Button>
            </FormRow>
          ),
        },
        {
          id: 'mappings',
          kind: 'defaults',
          title: t('fd.set.mappings'),
          description: t('fd.set.mappings.sub'),
          content: (
            <FormGrid>
              {MAPS.map((k) => (
                <SelectInput key={k} label={t(`fd.map.${k}` as MessageKey)} value={s.mappings[k] ?? ''} options={acctOptions} onChange={(e) => edit({ mappings: { ...s.mappings, [k]: e.target.value } })} />
              ))}
            </FormGrid>
          ),
        },
        {
          id: 'approvals',
          title: t('fd.set.approvals'),
          description: t('fd.set.approvals.sub'),
          content: (
            <div className="grid gap-4">
              <TextInput label={t('fd.set.concessionLimit')} type="number" value={String(s.approvals.concessionLimitRupees ?? 0)} onChange={(e) => edit({ approvals: { ...s.approvals, concessionLimitRupees: Number(e.target.value) || 0 } })} />
              <p className="text-sm text-muted-foreground">{t('fd.set.fourEyes')}</p>
            </div>
          ),
        },
      ]}
    />
  );
}
