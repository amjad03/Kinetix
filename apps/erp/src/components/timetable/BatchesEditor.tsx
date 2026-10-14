'use client';

import { Split, Users } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import { saveBatches, splitBatches } from '@/app/(dashboard)/academics/planning/actions';
import { Button } from '@/components/shadcn/button';
import { Dialog, EmptyState, StatusPill, TextInput, useToast } from '@/components/ui';
import { useI18n } from '@/i18n/client';

export interface BatchData {
  section: { id: string; name: string };
  batches: { name: string; students: number; periods: number }[];
  students: { id: string; rollNo: string; fullName: string; batch: string | null }[];
}

/**
 * Lab and tutorial batches of a class: each student's batch (typed or picked), or the class split evenly in roll
 * order. Timetable periods for a batch are attended (and marked) by its students only.
 */
export function BatchesEditor({ data, canEdit }: { data: BatchData; canEdit: boolean }) {
  const { t, fmt } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const initial = useMemo(() => Object.fromEntries(data.students.map((s) => [s.id, s.batch ?? ''])), [data]);
  const [batch, setBatch] = useState<Record<string, string>>(initial);
  const [split, setSplit] = useState(false);
  const names = [...new Set([...data.batches.map((b) => b.name), ...Object.values(batch).filter(Boolean)])].sort();
  const changed = data.students.filter((s) => (batch[s.id] ?? '') !== (s.batch ?? ''));
  const save = () =>
    start(async () => {
      const r = await saveBatches(data.section.id, changed.map((s) => ({ studentId: s.id, batch: batch[s.id]?.trim() || null })));
      if (!r.ok) return toast.error(r.error);
      toast.success(t('tts.batchesSaved', { n: fmt.number(r.data.saved) }));
      router.refresh();
    });
  if (data.students.length === 0)
    return (
      <EmptyState icon={<Users />} title={t('tts.noStudents')}>
        {t('tts.noStudentsBody')}
      </EmptyState>
    );
  return (
    <section className="grid gap-4" data-testid="batches">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {data.batches.length === 0 && <span className="text-sm text-muted-foreground">{t('tts.noBatches')}</span>}
          {data.batches.map((b) => (
            <StatusPill key={b.name} tone="info">
              {t('tts.batchSummary', { name: b.name, n: fmt.number(b.students), p: fmt.number(b.periods) })}
            </StatusPill>
          ))}
        </div>
        {canEdit && (
          <Button variant="outline" className="h-9" onClick={() => setSplit(true)} data-testid="split-batches">
            <Split />
            {t('tts.split')}
          </Button>
        )}
      </div>
      <datalist id="batch-names">
        {names.map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <caption className="sr-only">{t('tts.batchesOf', { name: data.section.name })}</caption>
          <thead className="bg-muted/50 text-left text-xs text-muted-foreground uppercase">
            <tr>
              <th scope="col" className="px-3 py-2 font-medium">
                {t('atd.col.roll')}
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                {t('atd.col.student')}
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                {t('atd.col.batch')}
              </th>
            </tr>
          </thead>
          <tbody>
            {data.students.map((s) => (
              <tr key={s.id} className="border-t">
                <td className="px-3 py-1.5 tabular-nums">{s.rollNo}</td>
                <th scope="row" className="px-3 py-1.5 text-left font-normal">
                  {s.fullName}
                </th>
                <td className="px-3 py-1.5">
                  <input
                    list="batch-names"
                    aria-label={t('tts.batchFor', { name: s.fullName })}
                    value={batch[s.id] ?? ''}
                    disabled={!canEdit}
                    maxLength={20}
                    onChange={(e) => setBatch((x) => ({ ...x, [s.id]: e.target.value }))}
                    className="h-8 w-28 rounded-md border border-input bg-card px-2 text-sm"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {canEdit && (
        <div className="flex items-center justify-end gap-3">
          {changed.length > 0 && <span className="text-sm text-muted-foreground">{t('tts.unsaved', { n: fmt.number(changed.length) })}</span>}
          <Button className="h-9" onClick={save} disabled={pending || changed.length === 0} data-testid="save-batches">
            {t('common.save')}
          </Button>
        </div>
      )}
      {split && <SplitDialog sectionId={data.section.id} size={data.students.length} onClose={() => setSplit(false)} />}
    </section>
  );
}

function SplitDialog({ sectionId, size, onClose }: { sectionId: string; size: number; onClose: () => void }) {
  const { t, fmt } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const [count, setCount] = useState('2');
  const [prefix, setPrefix] = useState('B');
  const [pending, start] = useTransition();
  const n = Number(count);
  const ok = Number.isInteger(n) && n >= 2 && n <= 8 && n <= size && prefix.trim().length > 0;
  const go = () =>
    start(async () => {
      const r = await splitBatches(sectionId, n, prefix.trim());
      if (!r.ok) return toast.error(r.error);
      toast.success(t('tts.splitDone', { n: fmt.number(r.data.batches), s: fmt.number(r.data.students) }));
      onClose();
      router.refresh();
    });
  return (
    <Dialog
      title={t('tts.split')}
      onClose={onClose}
      busy={pending}
      actions={
        <>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            {t('common.cancel')}
          </Button>
          <Button onClick={go} disabled={pending || !ok}>
            {t('tts.splitGo')}
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <p className="m-0 text-sm text-muted-foreground">{t('tts.splitHelp')}</p>
        <TextInput type="number" label={t('tts.batchCount')} value={count} onChange={(e) => setCount(e.target.value)} inputProps={{ min: 2, max: 8 }} />
        <TextInput label={t('tts.prefix')} value={prefix} onChange={(e) => setPrefix(e.target.value)} helper={t('tts.prefixHelp', { p: prefix || 'B' })} />
      </div>
    </Dialog>
  );
}
