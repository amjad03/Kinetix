'use client';

import { Download, Scale } from 'lucide-react';
import { useState, useTransition } from 'react';
import { readLht } from '@/app/(dashboard)/lht-actions';
import { Button } from '@/components/shadcn/button';
import { Card, FormRow, FormRowActions, SelectInput, TextInput } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import { copyFileQuery } from '@/lib/library-pass';

/** Spine and barcode label sheets, and the RFID encoder's list, for a range of accession numbers or new copies. */
export function CopyFiles() {
  const { t } = useI18n();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [since, setSince] = useState('');
  const [kind, setKind] = useState('both');
  const q = copyFileQuery({ from, to, since, kind: '' });
  const labels = `/api/lht-file?kind=copy-labels&id=x${q ? `&${q}` : ''}&labels=${kind}`;
  const rfid = `/api/lht-file?kind=rfid-list&id=x${q ? `&${q}` : ''}`;
  return (
    <Card title={t('lp.desk.files')} subtitle={t('lp.desk.filesHint')} testId="lib-copy-files">
      <div className="grid gap-4">
        <FormRow>
          <TextInput label={t('lp.desk.from')} value={from} onChange={(e) => setFrom(e.target.value)} placeholder="ACC-0001" />
          <TextInput label={t('lp.desk.to')} value={to} onChange={(e) => setTo(e.target.value)} placeholder="ACC-0100" />
          <TextInput label={t('lp.desk.since')} type="date" value={since} onChange={(e) => setSince(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
        </FormRow>
        <FormRow>
          <SelectInput label={t('lp.desk.labelKind')} value={kind} onChange={(e) => setKind(e.target.value)} options={['both', 'spine', 'barcode'].map((k) => ({ value: k, label: t(`lp.desk.kind.${k}` as MessageKey) }))} className="min-w-48" />
          <FormRowActions>
            <Button asChild variant="outline" data-testid="lib-labels">
              <a href={labels} target="_blank" rel="noopener">
                <Download />
                {t('lp.desk.labels')}
              </a>
            </Button>
            <Button asChild variant="outline" data-testid="lib-rfid">
              <a href={rfid} download>
                <Download />
                {t('lp.desk.rfid')}
              </a>
            </Button>
          </FormRowActions>
        </FormRow>
      </div>
    </Card>
  );
}

interface Preview {
  member: { cardNo: string; fullName: string };
  loanDays: number;
  maxBooks: number;
  maxItems: number | null;
  finePerDayPaise: number;
  graceDays: number;
  maxFinePaise: number;
  maxRenewals: number;
  canReserve: boolean;
  ruleId: string | null;
  closedWeekdays: string;
  skipsHolidays: boolean;
}

const MATERIALS = ['book', 'reference', 'thesis', 'cd', 'map', 'other'] as const;

/** Which rule a member gets for a material: the category, the matrix cell that applies, and how fines count days. */
export function RulesPreview() {
  const { t, fmt } = useI18n();
  const [code, setCode] = useState('');
  const [material, setMaterial] = useState<string>('book');
  const [shown, setShown] = useState<Preview | null>(null);
  const [error, setError] = useState('');
  const [busy, start] = useTransition();
  const look = () =>
    start(async () => {
      const c = code.trim();
      if (!c) return setError(t('lht.fill', { field: t('lp.desk.card') }));
      const res = await readLht(`/v1/library/rules/preview?memberCode=${encodeURIComponent(c)}&material=${material}`);
      if (!res.ok) return (setShown(null), setError(res.error));
      setError('');
      setShown(res.data as unknown as Preview);
    });
  const row = (label: string, value: string) => (
    <div className="flex justify-between gap-3 border-b border-border py-1.5 text-sm last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
  return (
    <Card title={t('lp.desk.rules')} subtitle={t('lp.desk.rulesHint')} testId="lib-rules-preview">
      <FormRow
        component="form"
        onSubmit={(e: React.FormEvent) => {
          e.preventDefault();
          look();
        }}
      >
        <TextInput label={t('lp.desk.card')} value={code} onChange={(e) => setCode(e.target.value)} error={!!error} helperText={error || undefined} />
        <SelectInput label={t('lp.desk.material')} value={material} onChange={(e) => setMaterial(e.target.value)} options={MATERIALS.map((m) => ({ value: m, label: t(`rk.o.library-books.material.${m}` as MessageKey) }))} className="min-w-40" />
        <FormRowActions>
          <Button type="submit" variant="outline" disabled={busy} data-testid="lib-rules-go">
            <Scale />
            {t('lp.desk.check')}
          </Button>
        </FormRowActions>
      </FormRow>
      {shown && (
        <div className="mt-4" data-testid="lib-rules-result">
          <p className="m-0 mb-2 text-sm font-semibold">
            {shown.member.fullName} · {shown.member.cardNo} · {shown.ruleId ? t('lp.desk.fromMatrix') : t('lp.desk.fromCategory')}
          </p>
          {row(t('lp.desk.loanDays'), shown.loanDays === 0 ? t('lp.desk.inLibrary') : t('lp.desk.days', { n: shown.loanDays }))}
          {row(t('lp.desk.limit'), shown.maxItems === null ? String(shown.maxBooks) : t('lp.desk.limitBoth', { items: shown.maxItems, books: shown.maxBooks }))}
          {row(t('lp.desk.fine'), t('lp.desk.finePer', { amount: fmt.rupees(shown.finePerDayPaise) }))}
          {row(t('lp.desk.grace'), t('lp.desk.days', { n: shown.graceDays }))}
          {row(t('lp.desk.cap'), shown.maxFinePaise ? fmt.rupees(shown.maxFinePaise) : t('lp.desk.noCap'))}
          {row(t('lp.desk.renewals'), String(shown.maxRenewals))}
          {row(t('lp.desk.reserve'), shown.canReserve ? t('common.yes') : t('common.no'))}
          {row(t('lp.desk.closed'), shown.skipsHolidays ? t('lp.desk.skips') : t('lp.desk.counts'))}
        </div>
      )}
    </Card>
  );
}
