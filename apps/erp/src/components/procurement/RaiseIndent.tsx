'use client';

import { Plus, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { raiseRequisition } from '@/app/(dashboard)/inventory/actions';
import { Button } from '@/components/shadcn/button';
import { Dialog, SelectInput, TextInput, useToast } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { Option } from '@/lib/procurement';

/** Raising an indent: the items and quantities wanted, for which department and by when; it goes to its approvers. */
export function RaiseIndent({ items, departments }: { items: (Option & { unit: string })[]; departments: Option[] }) {
  const { t } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [lines, setLines] = useState<{ itemId: string; qty: string }[]>([{ itemId: '', qty: '' }]);
  const [dept, setDept] = useState('');
  const [neededBy, setNeededBy] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const reset = () => {
    setLines([{ itemId: '', qty: '' }]);
    setDept('');
    setNeededBy('');
    setReason('');
    setError(null);
  };
  const submit = () => {
    const chosen = lines.filter((l) => l.itemId);
    if (!chosen.length) return setError(t('ivd.ind.needLine'));
    if (chosen.some((l) => !/^[1-9]\d*$/.test(l.qty.trim()))) return setError(t('ivd.ind.needQty'));
    if (new Set(chosen.map((l) => l.itemId)).size !== chosen.length) return setError(t('ivd.ind.twice'));
    start(async () => {
      const v: Record<string, string> = { reason, departmentId: dept, neededBy };
      for (const l of chosen) v[`q_${l.itemId}`] = l.qty.trim();
      const r = await raiseRequisition(v);
      if (!r.ok) return setError(r.error);
      toast.success(t('ivd.ind.raised'));
      setOpen(false);
      reset();
      router.refresh();
    });
  };

  return (
    <>
      <Button onClick={() => setOpen(true)} disabled={!items.length} data-testid="raise-indent">
        <Plus /> {t('ivd.ind.raise')}
      </Button>
      {open && (
        <Dialog
          title={t('ivd.ind.raise')}
          onClose={() => setOpen(false)}
          busy={pending}
          actions={
            <>
              <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>{t('ops.cancel')}</Button>
              <Button onClick={submit} disabled={pending} data-testid="indent-submit">{t('ivd.ind.submit')}</Button>
            </>
          }
        >
          <div className="grid gap-4">
            <p className="text-sm text-muted-foreground">{t('ivd.ind.help')}</p>
            {lines.map((l, i) => (
              <div key={i} className="flex items-end gap-2">
                <SelectInput className="min-w-0 flex-1" label={t('inv.item')} value={l.itemId} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, itemId: e.target.value } : x)))} options={items} empty="" />
                <TextInput className="w-24" label={t('ops.f.qty')} inputMode="numeric" value={l.qty} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, qty: e.target.value } : x)))} />
                <Button variant="ghost" size="icon" className="size-9" aria-label={t('ivd.ind.removeLine')} disabled={lines.length === 1} onClick={() => setLines(lines.filter((_, j) => j !== i))}>
                  <Trash2 />
                </Button>
              </div>
            ))}
            <div>
              <Button variant="outline" onClick={() => setLines([...lines, { itemId: '', qty: '' }])} disabled={lines.length >= 50}>
                <Plus /> {t('ivd.ind.addLine')}
              </Button>
            </div>
            <SelectInput label={t('ivd.department')} value={dept} onChange={(e) => setDept(e.target.value)} options={departments} empty={t('ivd.ind.noDept')} />
            <TextInput type="date" label={t('ivd.neededBy')} value={neededBy} onChange={(e) => setNeededBy(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
            <TextInput label={t('ho.reason')} value={reason} onChange={(e) => setReason(e.target.value)} multiline minRows={2} />
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
          </div>
        </Dialog>
      )}
    </>
  );
}
