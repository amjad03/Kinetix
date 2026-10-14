'use client';

import { FileUp, Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { deskSend } from '@/app/(dashboard)/accounts/actions';
import { Button } from '@/components/shadcn/button';
import { DataTable, Dialog, FormGrid, StatusPill, TextInput, useToastOptional, type Column } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { StudentHit } from '@/lib/fee-depth';
import { rupeesInput } from '@/lib/fee-depth';
import { StudentPicker } from './StudentPicker';

/** A bank challan for a student's open fees (or part of them): the bank, its account and how long it is valid. */
export function NewChallan({ student: given }: { student?: StudentHit }) {
  const { t, fmt } = useI18n();
  const router = useRouter();
  const toast = useToastOptional();
  const [open, setOpen] = useState(false);
  const [student, setStudent] = useState<StudentHit | null>(given ?? null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const save = (form: FormData) =>
    start(async () => {
      if (!student) return setError(t('fx.pickStudentFirst'));
      const amount = String(form.get('amount') ?? '').trim();
      const paise = amount ? rupeesInput(amount) : null;
      if (amount && paise === null) return setError(t('fx.badAmount'));
      const res = await deskSend<{ id: string }>('/v1/fee-collect/challans', { studentId: student.id, bankName: form.get('bankName'), bankAccount: form.get('bankAccount') ?? '', validDays: Number(form.get('validDays') || 15), ...(paise ? { amountPaise: paise } : {}) });
      if (!res.ok) return setError(res.error);
      toast?.success(t('fx.done.challan'));
      setOpen(false);
      router.push(`/fees/challans/${res.data.id}`);
    });

  return (
    <>
      <Button className="h-9" onClick={() => setOpen(true)} data-testid="new-challan">
        <Plus className="size-4" /> {t('fx.newChallan')}
      </Button>
      {open && (
        <Dialog
          title={t('fx.newChallan')}
          busy={pending}
          onClose={() => setOpen(false)}
          actions={
            <>
              <Button variant="outline" className="h-10" onClick={() => setOpen(false)} disabled={pending}>
                {t('fd.cancel')}
              </Button>
              <Button className="h-10" type="submit" form="fx-new-challan" disabled={pending || !student}>
                {t('fx.issueChallan')}
              </Button>
            </>
          }
        >
          <form
            id="fx-new-challan"
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              save(new FormData(e.currentTarget));
            }}
          >
            {student ? (
              <div className="flex items-center justify-between gap-3 rounded-md border p-3 text-sm">
                <span>
                  <b className="font-[550]">{student.fullName}</b> · {student.rollNo} · {student.section}
                  <span className="block text-muted-foreground">{t('fx.dueNow', { amount: fmt.rupees(student.duePaise) })}</span>
                </span>
                {!given && (
                  <Button type="button" variant="ghost" className="h-9" onClick={() => setStudent(null)}>
                    {t('fx.change')}
                  </Button>
                )}
              </div>
            ) : (
              <StudentPicker onPick={setStudent} autoFocus />
            )}
            <FormGrid cols={1}>
              <TextInput name="bankName" label={t('fx.f.bankName')} required defaultValue="" />
              <TextInput name="bankAccount" label={t('fx.f.bankAccount')} defaultValue="" />
              <TextInput name="amount" label={t('fx.f.challanAmount')} helperText={t('fx.f.challanAmountHelp')} inputProps={{ inputMode: 'decimal' }} />
              <TextInput name="validDays" label={t('fx.f.validDays')} type="number" defaultValue="15" required />
            </FormGrid>
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

type Line = { line: number; number: string; amountPaise: number; ok: boolean; message: string; receiptNo?: string };

/** The bank's file of paid challans (CSV): each matching challan is receipted; the rest is reported. */
export function ReconcileChallans() {
  const { t, fmt } = useI18n();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<{ rows: Line[]; receipted: number; failed: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const upload = (file: File | undefined) =>
    start(async () => {
      if (!file) return;
      if (file.size > 2_000_000) return setError(t('fx.fileTooBig'));
      const csv = await file.text();
      const res = await deskSend<{ rows: Line[]; receipted: number; failed: number }>('/v1/fee-collect/challans/reconcile', { csv });
      if (!res.ok) return setError(res.error);
      setError(null);
      setResult(res.data);
      router.refresh();
    });

  const columns: Column<Line>[] = [
    { id: 'line', header: t('fx.col.line'), cell: (r) => r.line, align: 'right' },
    { id: 'number', header: t('fx.col.challan'), cell: (r) => r.number, rowHeader: true },
    { id: 'amount', header: t('fx.col.amount'), cell: (r) => fmt.rupees(r.amountPaise), align: 'right' },
    { id: 'result', header: t('fx.col.result'), cell: (r) => (r.ok ? <StatusPill tone="success">{r.receiptNo}</StatusPill> : <span className="text-destructive">{r.message}</span>) },
  ];

  return (
    <>
      <Button variant="outline" className="h-9" onClick={() => setOpen(true)}>
        <FileUp className="size-4" /> {t('fx.bankFile')}
      </Button>
      {open && (
        <Dialog title={t('fx.bankFileTitle')} size="md" busy={pending} onClose={() => { setOpen(false); setResult(null); }} actions={<Button variant="outline" className="h-10" onClick={() => { setOpen(false); setResult(null); }}>{t('common.close')}</Button>}>
          <div className="grid gap-4">
            <p className="m-0 text-sm text-muted-foreground">{t('fx.bankFileHelp')}</p>
            <input type="file" accept=".csv,text/csv" aria-label={t('fx.bankFile')} disabled={pending} onChange={(e) => upload(e.target.files?.[0])} className="text-sm" data-testid="challan-file" />
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            {result && (
              <>
                <p className="m-0 text-sm">{t('fx.bankFileDone', { ok: result.receipted, bad: result.failed })}</p>
                <DataTable columns={columns} rows={result.rows} rowId={(r) => String(r.line)} label={t('fx.bankFileTitle')} bare />
              </>
            )}
          </div>
        </Dialog>
      )}
    </>
  );
}
