'use client';

import { Plus, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { deskSend } from '@/app/(dashboard)/accounts/actions';
import { ModuleSettingsPage, NumberingSeriesField } from '@/components/templates';
import { Button } from '@/components/shadcn/button';
import { CheckboxField, FormGrid, FormRow, SelectInput, SwitchField, TextInput, useToastOptional } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import type { NumberingSeries } from '@/lib/templates';
import { useWord } from './SpecTable';

type Step = { role: string; limitRupees: number | null };
export interface DeskSettingsData {
  series: Record<string, NumberingSeries>;
  feeHeads: { code: string; name: string; gstRate: number; accountCode: string }[];
  paymentModes: { mode: string; enabled: boolean; accountCode: string }[];
  gateway: string;
  mappings: Record<string, string>;
  approvals: Record<string, number | boolean>;
  chains: Record<string, Step[]>;
  duesBlock: { hallTicket?: boolean; results?: boolean; tc?: boolean; minRupees?: number };
  reminders: { enabled?: boolean; daysBefore?: number[]; daysAfter?: number[]; channels?: string[]; dailySummary?: boolean };
  convenience: { percent?: number; flatRupees?: number };
  refundRules: { untilDays: number | null; percent: number; deductionRupees: number }[];
}
export interface LateRule {
  mode?: 'daily' | 'slab';
  graceDays: number;
  flatPaise: number;
  perDayPaise: number;
  capPaise: number | null;
  slabs?: unknown[];
}

const SERIES = ['receipt', 'invoice', 'concession', 'refund', 'writeOff', 'voucher', 'challan', 'waiver', 'plan'];
const MAPS = ['feeIncome', 'otherIncome', 'refunds', 'cash', 'bank', 'receivable'];
const CHAINS = ['concession', 'refund', 'waiver', 'customPlan', 'receiptCancel'];
const CHAIN_ROLES = ['accountant', 'hod', 'principal', 'tenant_admin'];
/** The defaults the API uses until a chain is saved. */
const DEFAULT_CHAINS: Record<string, Step[]> = {
  concession: [{ role: 'principal', limitRupees: null }],
  refund: [
    { role: 'principal', limitRupees: 50000 },
    { role: 'tenant_admin', limitRupees: null },
  ],
  waiver: [{ role: 'principal', limitRupees: null }],
  customPlan: [{ role: 'principal', limitRupees: null }],
  receiptCancel: [{ role: 'principal', limitRupees: null }],
};
/** The UGC refund bands (2018 notification). */
const UGC = [
  { untilDays: 0, percent: 100, deductionRupees: 1000 },
  { untilDays: 15, percent: 90, deductionRupees: 0 },
  { untilDays: 30, percent: 80, deductionRupees: 0 },
  { untilDays: 60, percent: 50, deductionRupees: 0 },
  { untilDays: null, percent: 0, deductionRupees: 0 },
];
const days = (text: string) =>
  text
    .split(/[,\s]+/)
    .map((x) => Number(x))
    .filter((n) => Number.isInteger(n) && n >= 0);

/**
 * The desk's settings on the ModuleSettingsPage template: numbering, payment modes, gateway and convenience fee,
 * account mappings, approval chains, refund bands, dues blocks and the reminder schedule. Fee heads and the late-fee
 * rule live under Fees → Setup.
 */
export function DeskSettings({ initial, rule, accounts }: { initial: DeskSettingsData; rule: LateRule | null; accounts: { code: string; name: string }[] }) {
  const { t, fmt } = useI18n();
  const word = useWord();
  const router = useRouter();
  const toast = useToastOptional();
  const [s, setS] = useState<DeskSettingsData>(() => ({ ...initial, chains: { ...DEFAULT_CHAINS, ...(initial.chains ?? {}) }, duesBlock: initial.duesBlock ?? {}, reminders: initial.reminders ?? {}, convenience: initial.convenience ?? {}, refundRules: initial.refundRules ?? [] }));
  const [before, setBefore] = useState((initial.reminders?.daysBefore ?? []).join(', '));
  const [after, setAfter] = useState((initial.reminders?.daysAfter ?? []).join(', '));
  const [dirty, setDirty] = useState(false);
  const [pending, start] = useTransition();
  const edit = (p: Partial<DeskSettingsData>) => {
    setS({ ...s, ...p });
    setDirty(true);
  };
  const acctOptions = accounts.map((a) => ({ value: a.code, label: `${a.code} ${a.name}` }));
  const chain = (k: string) => s.chains[k] ?? DEFAULT_CHAINS[k];
  const setChain = (k: string, steps: Step[]) => edit({ chains: { ...s.chains, [k]: steps } });
  const num = (v: string) => (v.trim() === '' ? null : Number(v));

  const save = () =>
    start(async () => {
      const { feeHeads: _heads, ...rest } = s;
      void _heads;
      const res = await deskSend('/v1/fee-accounts/settings', { ...rest, reminders: { ...s.reminders, daysBefore: days(before), daysAfter: days(after).filter((d) => d > 0) } }, 'PUT');
      if (!res.ok) return toast?.error(res.error);
      setDirty(false);
      toast?.success(t('fd.saved'));
      router.refresh();
    });

  const ruleText = !rule ? t('fx.noRuleYet') : rule.mode === 'slab' ? t('fx.slabRuleShort', { grace: rule.graceDays, n: rule.slabs?.length ?? 0 }) : t('fx.dailyRuleShort', { grace: rule.graceDays, flat: fmt.rupees(rule.flatPaise), perDay: fmt.rupees(rule.perDayPaise) });

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
          description: t('fx.set.headsMoved'),
          content: (
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline" className="h-10">
                <Link href="/fees/setup">{t('fx.setup.heads')}</Link>
              </Button>
              <Button asChild variant="outline" className="h-10">
                <Link href="/fees/setup?tab=fines">{t('fx.setup.fines')}</Link>
              </Button>
              <p className="m-0 w-full text-sm text-muted-foreground">{ruleText}</p>
            </div>
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
            <div className="grid gap-4">
              <FormRow>
                <SelectInput label={t('fd.set.gateway')} value={s.gateway} options={['razorpay', 'payu', 'none'].map((g) => ({ value: g, label: word(g) }))} onChange={(e) => edit({ gateway: e.target.value })} />
                <Button asChild variant="outline" className="h-10">
                  <Link href="/settings">{t('fd.set.gatewayKeys')}</Link>
                </Button>
              </FormRow>
              <p className="m-0 text-sm text-muted-foreground">{t('fx.set.convenience')}</p>
              <FormGrid>
                <TextInput label={t('fx.set.conveniencePercent')} type="number" value={String(s.convenience.percent ?? '')} onChange={(e) => edit({ convenience: { ...s.convenience, percent: Number(e.target.value) || 0 } })} />
                <TextInput label={t('fx.set.convenienceFlat')} type="number" value={String(s.convenience.flatRupees ?? '')} onChange={(e) => edit({ convenience: { ...s.convenience, flatRupees: Number(e.target.value) || 0 } })} />
              </FormGrid>
            </div>
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
          description: t('fx.set.chains'),
          content: (
            <div className="grid gap-6">
              {CHAINS.map((k) => (
                <div key={k} className="grid gap-2">
                  <h4 className="m-0 text-sm font-semibold">{t(`fx.chain.${k}` as MessageKey)}</h4>
                  {chain(k).map((step, i) => (
                    <FormRow key={i}>
                      <SelectInput label={t('fx.set.level', { n: i + 1 })} value={step.role} options={CHAIN_ROLES.map((r) => ({ value: r, label: t(`role.${r}` as MessageKey) }))} onChange={(e) => setChain(k, chain(k).map((x, j) => (j === i ? { ...x, role: e.target.value } : x)))} />
                      <TextInput label={t('fx.set.limit')} type="number" value={step.limitRupees == null ? '' : String(step.limitRupees)} helperText={i === chain(k).length - 1 ? t('fx.set.lastLevel') : undefined} onChange={(e) => setChain(k, chain(k).map((x, j) => (j === i ? { ...x, limitRupees: num(e.target.value) } : x)))} />
                      <Button variant="ghost" size="icon" className="h-10 w-10" aria-label={t('fd.remove')} disabled={chain(k).length <= 1} onClick={() => setChain(k, chain(k).filter((_, j) => j !== i))}>
                        <Trash2 className="size-4" />
                      </Button>
                    </FormRow>
                  ))}
                  <div>
                    <Button variant="outline" className="h-10" disabled={chain(k).length >= 5} onClick={() => setChain(k, [...chain(k).slice(0, -1).map((x) => x), { role: 'accountant', limitRupees: 1000 }, chain(k).at(-1)!].sort((a, b) => (a.limitRupees ?? Infinity) - (b.limitRupees ?? Infinity)))}>
                      <Plus className="size-4" /> {t('fx.set.addLevel')}
                    </Button>
                  </div>
                </div>
              ))}
              <p className="m-0 text-sm text-muted-foreground">{t('fd.set.fourEyes')}</p>
            </div>
          ),
        },
        {
          id: 'refunds',
          kind: 'rules',
          title: t('fx.set.refunds'),
          description: t('fx.set.refundsSub'),
          content: (
            <div className="grid gap-3">
              {s.refundRules.map((r, i) => (
                <FormRow key={i}>
                  <TextInput label={t('fx.set.untilDays')} type="number" value={r.untilDays == null ? '' : String(r.untilDays)} helperText={r.untilDays == null ? t('fx.set.afterThat') : undefined} onChange={(e) => edit({ refundRules: s.refundRules.map((x, j) => (j === i ? { ...x, untilDays: num(e.target.value) } : x)) })} />
                  <TextInput label={t('fx.set.refundPercent')} type="number" value={String(r.percent)} onChange={(e) => edit({ refundRules: s.refundRules.map((x, j) => (j === i ? { ...x, percent: Number(e.target.value) || 0 } : x)) })} />
                  <TextInput label={t('fx.set.deduction')} type="number" value={String(r.deductionRupees)} onChange={(e) => edit({ refundRules: s.refundRules.map((x, j) => (j === i ? { ...x, deductionRupees: Number(e.target.value) || 0 } : x)) })} />
                  <Button variant="ghost" size="icon" className="h-10 w-10" aria-label={t('fd.remove')} onClick={() => edit({ refundRules: s.refundRules.filter((_, j) => j !== i) })}>
                    <Trash2 className="size-4" />
                  </Button>
                </FormRow>
              ))}
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" className="h-10" onClick={() => edit({ refundRules: [...s.refundRules, { untilDays: s.refundRules.length ? null : 0, percent: 0, deductionRupees: 0 }] })}>
                  <Plus className="size-4" /> {t('fx.set.addBand')}
                </Button>
                <Button variant="outline" className="h-10" onClick={() => edit({ refundRules: UGC })}>
                  {t('fx.set.useUgc')}
                </Button>
              </div>
            </div>
          ),
        },
        {
          id: 'dues',
          kind: 'rules',
          title: t('fx.set.dues'),
          description: t('fx.set.duesSub'),
          content: (
            <div className="grid gap-3">
              <CheckboxField label={t('fx.block.hallTicket')} checked={!!s.duesBlock.hallTicket} onChange={(v) => edit({ duesBlock: { ...s.duesBlock, hallTicket: v } })} />
              <CheckboxField label={t('fx.block.results')} checked={!!s.duesBlock.results} onChange={(v) => edit({ duesBlock: { ...s.duesBlock, results: v } })} />
              <CheckboxField label={t('fx.block.tc')} checked={!!s.duesBlock.tc} onChange={(v) => edit({ duesBlock: { ...s.duesBlock, tc: v } })} />
              <TextInput label={t('fx.set.minDues')} type="number" value={String(s.duesBlock.minRupees ?? 0)} onChange={(e) => edit({ duesBlock: { ...s.duesBlock, minRupees: Number(e.target.value) || 0 } })} />
            </div>
          ),
        },
        {
          id: 'reminders',
          title: t('fx.reminders'),
          description: t('fx.set.remindersSub'),
          content: (
            <div className="grid gap-4">
              <SwitchField label={t('fx.set.remindersOn')} checked={!!s.reminders.enabled} onChange={(v) => edit({ reminders: { ...s.reminders, enabled: v } })} />
              <FormGrid>
                <TextInput label={t('fx.set.daysBefore')} value={before} helperText={t('fx.set.daysHelp')} onChange={(e) => (setBefore(e.target.value), setDirty(true))} />
                <TextInput label={t('fx.set.daysAfter')} value={after} helperText={t('fx.set.daysHelp')} onChange={(e) => (setAfter(e.target.value), setDirty(true))} />
              </FormGrid>
              <div className="flex flex-wrap gap-4">
                {['app', 'sms', 'whatsapp'].map((c) => (
                  <CheckboxField
                    key={c}
                    label={t(`fx.ch.${c}` as MessageKey)}
                    checked={(s.reminders.channels ?? ['app']).includes(c)}
                    onChange={(v) => {
                      const cur = s.reminders.channels ?? ['app'];
                      edit({ reminders: { ...s.reminders, channels: v ? [...new Set([...cur, c])] : cur.filter((x) => x !== c) } });
                    }}
                  />
                ))}
              </div>
              <p className="m-0 text-sm text-muted-foreground">{t('fx.set.templatesNote')}</p>
              <SwitchField label={t('fx.set.dailySummary')} checked={!!s.reminders.dailySummary} onChange={(v) => edit({ reminders: { ...s.reminders, dailySummary: v } })} />
            </div>
          ),
        },
      ]}
    />
  );
}
