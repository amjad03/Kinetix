'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { deskPeek, deskRead, deskSend } from '@/app/(dashboard)/accounts/actions';
import { Button } from '@/components/shadcn/button';
import { Dialog, FormGrid, SelectInput, TextInput, useToast } from '@/components/ui';
import { useI18n } from '@/i18n/client';

interface Structures {
  assigned: { id: string; structureId: string; name: string; amountPaise: number; status: string }[];
  published: { id: string; name: string; academicYear: string | null }[];
}
interface Preview {
  usedPercent: number;
  keepPaise: number;
  oldAfterPaise: number;
  reduceOldPaise: number;
  newChargePaise: number;
  paidCountedOnNewPaise: number;
  totalPaise: number;
  readmissionFeePaise: number;
  oldDuesPaise: number;
  from: { name: string } | null;
  to: { name: string };
}

/**
 * Moves a student to another programme's fee structure mid-year (or readmits one): pick the new structure and the
 * date, see the recalculation (the old fee kept for the share of the year used, the new one for the rest, money
 * already paid counted), then confirm.
 */
export function TransferDialog({ studentId, student, onClose }: { studentId: string; student: string; onClose: () => void }) {
  const { t, fmt } = useI18n();
  const router = useRouter();
  const toast = useToast();
  const [data, setData] = useState<Structures | null>(null);
  const [kind, setKind] = useState<'transfer' | 'readmission'>('transfer');
  const [to, setTo] = useState('');
  const [on, setOn] = useState(new Date().toISOString().slice(0, 10));
  const [reason, setReason] = useState('');
  const [fee, setFee] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    void deskRead<Structures>(`/v1/fee-setup/students/${studentId}/structures`).then((r) => (r.ok ? setData(r.data) : toast.error(r.error)));
  }, [studentId, toast]);
  const body = () => ({ toStructureId: to, effectiveOn: on, kind, reason: reason.trim() || t('ff.tr.defaultReason'), readmissionFeePaise: Math.round((Number(fee) || 0) * 100) });
  const calc = () =>
    start(async () => {
      const r = await deskPeek<Preview>(`/v1/fee-setup/students/${studentId}/transfer`, { ...body(), preview: true });
      if (!r.ok) return toast.error(r.error);
      setPreview(r.data);
    });
  const confirm = () =>
    start(async () => {
      const r = await deskSend(`/v1/fee-setup/students/${studentId}/transfer`, body());
      if (!r.ok) return toast.error(r.error);
      toast.success(t('ff.tr.done'));
      router.refresh();
      onClose();
    });
  const current = data?.assigned.filter((a) => a.status === 'active') ?? [];
  return (
    <Dialog
      title={t('ff.tr.title', { name: student })}
      size="md"
      busy={pending}
      onClose={onClose}
      actions={
        <>
          <Button variant="outline" onClick={onClose}>
            {t('fd.cancel')}
          </Button>
          <Button variant="outline" disabled={!to || pending} onClick={calc}>
            {t('ff.tr.preview')}
          </Button>
          <Button disabled={!preview || pending || reason.trim().length < 3} onClick={confirm}>
            {t('fd.confirm')}
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <p className="m-0 text-sm text-muted-foreground">{current.length ? t('ff.tr.current', { list: current.map((a) => a.name).join(', ') }) : t('ff.tr.noneCurrent')}</p>
        <FormGrid>
          <SelectInput label={t('ff.tr.kind')} value={kind} onChange={(e) => (setKind(e.target.value as 'transfer' | 'readmission'), setPreview(null))} options={[{ value: 'transfer', label: t('ff.tr.kind.transfer') }, { value: 'readmission', label: t('ff.tr.kind.readmission') }]} />
          <SelectInput label={t('ff.tr.to')} value={to} empty={t('fd.pick')} onChange={(e) => (setTo(e.target.value), setPreview(null))} options={(data?.published ?? []).map((s) => ({ value: s.id, label: s.academicYear ? `${s.name} (${s.academicYear})` : s.name }))} />
          <TextInput label={t('ff.tr.on')} type="date" value={on} onChange={(e) => (setOn(e.target.value), setPreview(null))} />
          {kind === 'readmission' ? <TextInput label={t('ff.tr.readmissionFee')} type="number" value={fee} onChange={(e) => (setFee(e.target.value), setPreview(null))} /> : null}
        </FormGrid>
        <TextInput label={t('fd.col.reason')} value={reason} onChange={(e) => setReason(e.target.value)} />
        {preview ? (
          <dl className="m-0 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 rounded-lg border p-3 text-sm" data-testid="transfer-preview">
            <dt>{t('ff.tr.used', { pct: preview.usedPercent })}</dt>
            <dd className="m-0 text-right tabular-nums">{fmt.rupees(preview.keepPaise)}</dd>
            <dt>{t('ff.tr.oldAfter', { name: preview.from?.name ?? '—' })}</dt>
            <dd className="m-0 text-right tabular-nums">{fmt.rupees(preview.oldAfterPaise)}</dd>
            <dt>{t('ff.tr.newCharge', { name: preview.to.name })}</dt>
            <dd className="m-0 text-right tabular-nums">{fmt.rupees(preview.newChargePaise)}</dd>
            <dt>{t('ff.tr.paidCounted')}</dt>
            <dd className="m-0 text-right tabular-nums">−{fmt.rupees(preview.paidCountedOnNewPaise)}</dd>
            {preview.readmissionFeePaise ? (
              <>
                <dt>{t('ff.tr.readmissionFee')}</dt>
                <dd className="m-0 text-right tabular-nums">{fmt.rupees(preview.readmissionFeePaise)}</dd>
              </>
            ) : null}
            <dt className="font-medium">{t('ff.tr.total')}</dt>
            <dd className="m-0 text-right font-medium tabular-nums">{fmt.rupees(preview.totalPaise)}</dd>
          </dl>
        ) : null}
      </div>
    </Dialog>
  );
}
