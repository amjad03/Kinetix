'use client';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { FormField, TextInput } from '@/components/ui';
import { runPromotion } from '@/app/(dashboard)/students/actions';
import { promotionEligibility } from '@/app/(dashboard)/students/info-actions';
import { CheckboxField } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { PromotionResult } from '@/lib/admissions';

import { Alert, Button, MenuItem, TextField } from '@/components/kx';
export interface PromotionClass {
  id: string;
  name: string;
  programId: string;
  term: number;
  students: number;
  /** The program's last term: these classes graduate instead of moving on. */
  final: boolean;
}

/**
 * Yearly promotion: pick the destination for each class (or graduation for final-term classes),
 * preview the outcome, then run it. Students not active (on leave, detained) are skipped.
 */
export function PromotionTool({ classes }: { classes: PromotionClass[] }) {
  const { t, fmt } = useI18n();
  const router = useRouter();
  const [label, setLabel] = useState('');
  const [targets, setTargets] = useState<Record<string, string>>(() => {
    // A sensible default: the same-lettered class of the next term, if there is one.
    const out: Record<string, string> = {};
    for (const c of classes) {
      if (c.final) out[c.id] = 'graduate';
      else {
        const next = classes.find((x) => x.programId === c.programId && x.term === c.term + 1 && x.name.slice(-1) === c.name.slice(-1)) ?? classes.find((x) => x.programId === c.programId && x.term === c.term + 1);
        if (next) out[c.id] = next.id;
      }
    }
    return out;
  });
  const [preview, setPreview] = useState<PromotionResult | null>(null);
  const [done, setDone] = useState<PromotionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  // Held back: who misses the attendance or fee rule, found per class, and the ones the office chooses to detain.
  const [minPct, setMinPct] = useState('75');
  const [maxDues, setMaxDues] = useState('0');
  const [held, setHeld] = useState<{ studentId: string; fullName: string; rollNo: string; className: string; reasons: string[] }[] | null>(null);
  const [detain, setDetain] = useState<Record<string, boolean>>({});
  const mappings = Object.entries(targets).filter(([, v]) => v).map(([from, to]) => ({ fromSectionId: from, toSectionId: to === 'graduate' ? null : to }));
  const findHeld = () =>
    start(async () => {
      setError(null);
      const out: NonNullable<typeof held> = [];
      for (const m of mappings) {
        const res = await promotionEligibility(m.fromSectionId, Number(minPct) || 0, Number(maxDues) || 0);
        if (!res.ok) return setError(res.error);
        for (const s of res.data.students) {
          if (s.eligible) continue;
          const reasons = [
            s.attendancePct !== null && s.attendancePct < (Number(minPct) || 0) ? t('si.promo.lowAttendance', { pct: s.attendancePct, min: Number(minPct) || 0 }) : null,
            s.duesPaise > Math.round((Number(maxDues) || 0) * 100) ? t('si.promo.feesOwing', { amount: fmt.rupees(s.duesPaise) }) : null,
          ].filter((x): x is string => !!x);
          out.push({ studentId: s.studentId, fullName: s.fullName, rollNo: s.rollNo, className: res.data.className, reasons });
        }
      }
      setHeld(out);
      setDetain(Object.fromEntries(out.map((s) => [s.studentId, true])));
      setPreview(null);
    });
  const detained = (held ?? []).filter((s) => detain[s.studentId]).map((s) => ({ studentId: s.studentId, reason: s.reasons.join('; ') }));
  const go = (dryRun: boolean) =>
    start(async () => {
      setError(null);
      const res = await runPromotion({ label, mappings, detain: detained, dryRun });
      if (!res.ok) return setError(res.error);
      if (dryRun) setPreview(res.data);
      else {
        setDone(res.data);
        setPreview(null);
        router.refresh();
      }
    });
  return (
    <div className="flex flex-col gap-6">
      {error && <Alert severity="error">{error}</Alert>}
      {done && (
        <Alert severity="success">
          {t('stu.promo.done', { promoted: done.promoted, detained: done.detained, graduated: done.graduated, skipped: done.skipped })}
        </Alert>
      )}
      <FormField label={t('stu.promo.label')}>
        <TextInput className="max-w-[420px]" helperText={t('stu.promo.labelHelp')} value={label} onChange={(e) => { setLabel(e.target.value); setPreview(null); }} />
      </FormField>
      <div className="rounded-[12px] border bg-card p-5">
        <div className="grid grid-cols-[1fr] sm:grid-cols-[1fr_1fr] gap-4 items-center">
          {classes.map((c) => (
            <div className="contents" key={c.id}>
              <p className="text-[13px] leading-[19px]">
                {c.name} · {t('stu.promo.students', { n: c.students })}
              </p>
              <TextField
                select
                size="small"
                value={targets[c.id] ?? ''}
                onChange={(e) => {
                  setTargets({ ...targets, [c.id]: e.target.value });
                  setPreview(null);
                }}
                aria-label={c.name}
              >
                <MenuItem value="">{t('stu.promo.skip')}</MenuItem>
                {c.final && <MenuItem value="graduate">{t('stu.promo.graduate')}</MenuItem>}
                {!c.final &&
                  classes
                    .filter((x) => x.programId === c.programId && x.term === c.term + 1)
                    .map((x) => (
                      <MenuItem key={x.id} value={x.id}>
                        {x.name}
                      </MenuItem>
                    ))}
              </TextField>
            </div>
          ))}
        </div>
      </div>
      <div className="rounded-[12px] border bg-card p-5">
        <p className="mb-1 text-[15px] font-semibold">{t('si.promo.heldTitle')}</p>
        <p className="mb-4 text-[13px] text-muted-foreground">{t('si.promo.heldHelp')}</p>
        <div className="flex flex-wrap items-end gap-3">
          <FormField label={t('si.promo.minAttendance')}>
            <TextInput value={minPct} onChange={(e) => setMinPct(e.target.value.replace(/[^\d.]/g, ''))} className="w-[140px]" inputMode="decimal" />
          </FormField>
          <FormField label={t('si.promo.maxDues')}>
            <TextInput value={maxDues} onChange={(e) => setMaxDues(e.target.value.replace(/[^\d.]/g, ''))} className="w-[160px]" inputMode="decimal" />
          </FormField>
          <Button variant="outlined" disabled={pending || mappings.length === 0} onClick={findHeld} data-testid="find-held">
            {t('si.promo.find')}
          </Button>
        </div>
        {held && (
          <div className="mt-4 grid gap-1">
            {held.length === 0 ? (
              <p className="text-[13px]">{t('si.promo.allEligible')}</p>
            ) : (
              held.map((s) => (
                <CheckboxField
                  key={s.studentId}
                  checked={!!detain[s.studentId]}
                  onChange={(v) => {
                    setDetain({ ...detain, [s.studentId]: v });
                    setPreview(null);
                  }}
                  label={
                    <span>
                      <b className="font-[550]">{s.fullName}</b> <span className="text-muted-foreground">({s.rollNo}, {s.className})</span> · {s.reasons.join('; ')}
                    </span>
                  }
                />
              ))
            )}
          </div>
        )}
      </div>
      <div className="flex flex-row gap-2">
        <Button variant="outlined" disabled={pending || mappings.length === 0 || label.trim().length < 3} onClick={() => go(true)}>
          {t('stu.promo.preview')}
        </Button>
        <Button variant="contained" disabled={pending || !preview || label.trim().length < 3} onClick={() => go(false)}>
          {t('stu.promo.run')}
        </Button>
      </div>
      {preview && <Alert severity="info">{t('stu.promo.preview.result', { promoted: preview.promoted, detained: preview.detained, graduated: preview.graduated, skipped: preview.skipped })}</Alert>}
    </div>
  );
}
