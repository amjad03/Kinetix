'use client';

import { Plus, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { deskSend } from '@/app/(dashboard)/accounts/actions';
import { Button } from '@/components/shadcn/button';
import { Dialog, FormGrid, FormRow, SelectInput, TextInput, useToastOptional } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import { useWord } from './SpecTable';

type Line = { accountId: string; debit: string; credit: string };

/** A voucher entered for approval: type, date, narration and balanced lines. It posts once someone else approves it. */
export function NewVoucher({ accounts }: { accounts: { id: string; code: string; name: string }[] }) {
  const { t, fmt } = useI18n();
  const word = useWord();
  const router = useRouter();
  const toast = useToastOptional();
  const [open, setOpen] = useState(false);
  const [lines, setLines] = useState<Line[]>([{ accountId: '', debit: '', credit: '' }, { accountId: '', debit: '', credit: '' }]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const paise = (s: string) => Math.round((Number(s) || 0) * 100);
  const dr = lines.reduce((a, l) => a + paise(l.debit), 0);
  const cr = lines.reduce((a, l) => a + paise(l.credit), 0);
  const set = (i: number, p: Partial<Line>) => setLines(lines.map((l, j) => (j === i ? { ...l, ...p } : l)));
  const options = accounts.map((a) => ({ value: a.id, label: `${a.code} ${a.name}` }));

  const save = (form: FormData) =>
    start(async () => {
      const body = { type: form.get('type'), date: form.get('date'), narration: form.get('narration'), lines: lines.filter((l) => l.accountId).map((l) => ({ accountId: l.accountId, debitPaise: paise(l.debit), creditPaise: paise(l.credit) })) };
      const res = await deskSend<{ id: string }>('/v1/fee-accounts/vouchers', body);
      if (!res.ok) return setError(res.error);
      toast?.success(t('fd.done.requested'));
      setOpen(false);
      router.push(`/accounts/voucher-requests/${res.data.id}`);
    });

  return (
    <>
      <Button className="h-10" onClick={() => setOpen(true)}>
        {t('fd.a.newVoucher')}
      </Button>
      {open && (
        <Dialog
          title={t('fd.a.newVoucher')}
          size="lg"
          busy={pending}
          onClose={() => setOpen(false)}
          actions={
            <>
              <Button variant="outline" className="h-10" onClick={() => setOpen(false)}>
                {t('fd.cancel')}
              </Button>
              <Button className="h-10" type="submit" form="fd-new-voucher" disabled={pending || dr === 0 || dr !== cr}>
                {t('fd.a.sendForApproval')}
              </Button>
            </>
          }
        >
          <form
            id="fd-new-voucher"
            className="grid gap-6"
            onSubmit={(e) => {
              e.preventDefault();
              save(new FormData(e.currentTarget));
            }}
          >
            <FormGrid>
              <SelectInput name="type" label={t('fd.col.type')} defaultValue="payment" options={['payment', 'receipt', 'journal', 'contra'].map((v) => ({ value: v, label: word(v) }))} />
              <TextInput name="date" label={t('fd.col.date')} type="date" defaultValue={new Date().toISOString().slice(0, 10)} required />
              <TextInput name="narration" label={t('fd.col.narration')} required />
            </FormGrid>
            <div className="grid gap-3">
              {lines.map((l, i) => (
                <FormRow key={i}>
                  <SelectInput label={t('fd.col.account')} value={l.accountId} empty={t('fd.pick')} options={options} onChange={(e) => set(i, { accountId: e.target.value })} />
                  <TextInput label={t('fd.col.debit')} type="number" value={l.debit} onChange={(e) => set(i, { debit: e.target.value, credit: e.target.value ? '' : l.credit })} />
                  <TextInput label={t('fd.col.credit')} type="number" value={l.credit} onChange={(e) => set(i, { credit: e.target.value, debit: e.target.value ? '' : l.debit })} />
                  <Button type="button" variant="ghost" size="icon" className="h-10 w-10" aria-label={t('fd.remove')} disabled={lines.length <= 2} onClick={() => setLines(lines.filter((_, j) => j !== i))}>
                    <Trash2 className="size-4" />
                  </Button>
                </FormRow>
              ))}
              <div className="flex flex-wrap items-center justify-between gap-4">
                <Button type="button" variant="outline" className="h-10" onClick={() => setLines([...lines, { accountId: '', debit: '', credit: '' }])}>
                  <Plus className="size-4" /> {t('fd.a.addLine')}
                </Button>
                <span className={dr === cr ? 'text-sm' : 'text-sm text-destructive'}>
                  {t('fd.col.debit')} {fmt.rupees(dr)} · {t('fd.col.credit')} {fmt.rupees(cr)}
                </span>
              </div>
            </div>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
          </form>
        </Dialog>
      )}
    </>
  );
}
