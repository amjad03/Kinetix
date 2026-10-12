'use client';

import { Plus, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { deskSend } from '@/app/(dashboard)/accounts/actions';
import { Button } from '@/components/shadcn/button';
import { Dialog, FormGrid, FormRow, TextInput, useToastOptional } from '@/components/ui';
import { useI18n } from '@/i18n/client';

const nextYear = () => {
  const d = new Date();
  const s = (d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1) + 1;
  return `${s}-${String((s + 1) % 100).padStart(2, '0')}`;
};

/** A new fee structure (draft): name, year, due days and its heads with amounts. */
export function NewStructure() {
  const { t, fmt } = useI18n();
  const router = useRouter();
  const toast = useToastOptional();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([{ head: t('fd.head.tuition'), rupees: '' }, { head: t('fd.head.exam'), rupees: '' }]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const total = items.reduce((a, i) => a + (Number(i.rupees) || 0) * 100, 0);

  const save = (form: FormData) =>
    start(async () => {
      const body = { name: String(form.get('name') ?? ''), academicYear: String(form.get('year') ?? ''), dueInDays: Number(form.get('due') || 30), items: items.filter((i) => i.head.trim() && Number(i.rupees) > 0).map((i) => ({ head: i.head.trim(), amountPaise: Math.round(Number(i.rupees) * 100) })) };
      const res = await deskSend<{ id: string }>('/v1/fee-accounts/structures', body);
      if (!res.ok) return setError(res.error);
      toast?.success(t('fd.saved'));
      setOpen(false);
      router.push(`/accounts/structures/${res.data.id}`);
    });

  return (
    <>
      <Button className="h-10" onClick={() => setOpen(true)}>
        {t('fd.a.newStructure')}
      </Button>
      {open && (
        <Dialog
          title={t('fd.a.newStructure')}
          size="md"
          busy={pending}
          onClose={() => setOpen(false)}
          actions={
            <>
              <Button variant="outline" className="h-10" onClick={() => setOpen(false)}>
                {t('fd.cancel')}
              </Button>
              <Button className="h-10" type="submit" form="fd-new-structure" disabled={pending || total === 0}>
                {t('fd.a.saveDraft')}
              </Button>
            </>
          }
        >
          <form
            id="fd-new-structure"
            className="grid gap-6"
            onSubmit={(e) => {
              e.preventDefault();
              save(new FormData(e.currentTarget));
            }}
          >
            <FormGrid>
              <TextInput name="name" label={t('fd.col.name')} required />
              <TextInput name="year" label={t('fd.col.year')} defaultValue={nextYear()} required />
              <TextInput name="due" label={t('fd.col.dueInDays')} type="number" defaultValue="30" />
            </FormGrid>
            <div className="grid gap-3">
              {items.map((it, i) => (
                <FormRow key={i}>
                  <TextInput label={t('fd.col.head')} value={it.head} onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, head: e.target.value } : x)))} />
                  <TextInput label={t('fd.col.amount')} type="number" value={it.rupees} onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, rupees: e.target.value } : x)))} />
                  <Button type="button" variant="ghost" size="icon" className="h-10 w-10" aria-label={t('fd.remove')} onClick={() => setItems(items.filter((_, j) => j !== i))}>
                    <Trash2 className="size-4" />
                  </Button>
                </FormRow>
              ))}
              <div className="flex items-center justify-between gap-4">
                <Button type="button" variant="outline" className="h-10" onClick={() => setItems([...items, { head: '', rupees: '' }])}>
                  <Plus className="size-4" /> {t('fd.a.addHead')}
                </Button>
                <span className="text-sm font-medium">
                  {t('fd.col.total')}: {fmt.rupees(total)}
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
