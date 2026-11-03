'use client';

import { ClipboardCheck, GraduationCap, KeyRound, Printer } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { admitApplicant, admitProvisionally, createChecklist, resendCredentials, setClaims, updateChecklistItem } from '@/app/(dashboard)/admissions/pass-actions';
import { Alert } from '@/components/kx';
import { Button } from '@/components/shadcn/button';
import { Card, CheckboxField, Dialog, FormField, FormRow, SelectInput, StatusPill, TextInput, useToast } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import type { AdmitResult, Checklist, ChecklistItem } from '@/lib/admissions-pass';

const TONE = { pending: 'warning', deferred: 'info', received: 'success', verified: 'success', waived: 'neutral' } as const;
const HORIZONTAL = ['pwd', 'rural', 'kannada_medium', 'hk_region', 'sports', 'ncc', 'defence'];
const SUPER = ['tfw', 'foreign', 'jk_migrant', 'pmsss'];

const plusDays = (n: number) => new Date(Date.now() + 5.5 * 3600_000 + n * 86400_000).toISOString().slice(0, 10);

/**
 * From an accepted seat to a student: the verified claims (horizontal and supernumerary seats), the admission
 * document checklist, provisional admission on an undertaking, and enrolment with the register number, the fee
 * structure and the sign-in details.
 */
export function AdmissionPanel({ applicationId, status, studentId, claims, checklist, seat }: { applicationId: string; status: string; studentId: string | null; claims: { horizontal?: string[]; supernumerary?: string[]; familyIncomePaise?: number }; checklist: Checklist | null; seat: { seatType: string | null; seatCategory: string | null; option: string | null } }) {
  const { t, fmt } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [hz, setHz] = useState<string[]>(claims.horizontal ?? []);
  const [sn, setSn] = useState<string[]>(claims.supernumerary ?? []);
  const [income, setIncome] = useState(claims.familyIncomePaise ? String(claims.familyIncomePaise / 100) : '');
  const [provisional, setProvisional] = useState(false);
  const [dueOn, setDueOn] = useState(plusDays(30));
  const [result, setResult] = useState<AdmitResult | null>(null);
  const [editing, setEditing] = useState<ChecklistItem | null>(null);
  const canAdmit = status === 'accepted';
  const toggle = (list: string[], set: (v: string[]) => void, k: string) => set(list.includes(k) ? list.filter((x) => x !== k) : [...list, k]);

  const run = <T,>(fn: () => Promise<{ ok: true; data: T } | { ok: false; error: string }>, msg: (d: T) => string, after?: (d: T) => void) =>
    start(async () => {
      const res = await fn();
      if (!res.ok) return toast.error(res.error);
      toast.success(msg(res.data));
      after?.(res.data);
      router.refresh();
    });

  return (
    <div className="grid gap-6" data-testid="admission-panel">
      <Card title={t('ap.claims.title')} subtitle={t('ap.claims.help')}>
        <div className="grid gap-3">
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {HORIZONTAL.map((k) => (
              <CheckboxField key={k} label={t(`ap.hz.${k}` as MessageKey)} checked={hz.includes(k)} onChange={() => toggle(hz, setHz, k)} />
            ))}
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {SUPER.map((k) => (
              <CheckboxField key={k} label={t(`ap.super.${k}` as MessageKey)} checked={sn.includes(k)} onChange={() => toggle(sn, setSn, k)} />
            ))}
          </div>
          <FormRow>
            <FormField label={t('ap.claims.income')}>
              <TextInput type="number" value={income} onChange={(e) => setIncome(e.target.value)} className="w-48" />
            </FormField>
            <Button variant="outline" className="h-10" disabled={pending || status === 'enrolled'} onClick={() => run(() => setClaims(applicationId, { horizontal: hz, supernumerary: sn, familyIncomeRupees: income ? Number(income) : null }), () => t('ap.claims.saved'))}>
              {t('ap.claims.save')}
            </Button>
          </FormRow>
          {(seat.seatType || seat.option) && <p className="text-[13px] text-muted-foreground">{t('ap.claims.seat', { option: seat.option ?? '-', type: seat.seatType === 'merit' ? t('ap.seat.government') : (seat.seatType ?? '-'), category: seat.seatCategory === 'merit' ? 'GM' : (seat.seatCategory ?? '-').toUpperCase() })}</p>}
        </div>
      </Card>

      <Card
        title={t('ap.check.title')}
        subtitle={checklist ? (checklist.confirmedAt ? t('ap.check.confirmed') : checklist.provisional ? t('ap.check.provisional', { date: fmt.date(checklist.provisionalUntil ?? '', 'short') }) : t('ap.check.help')) : t('ap.check.help')}
      >
        {!checklist || checklist.items.length === 0 ? (
          <Button variant="outline" className="h-9" disabled={pending || !['accepted', 'offered', 'enrolled'].includes(status)} onClick={() => run(() => createChecklist(applicationId), () => t('ap.check.made'))} data-testid="make-checklist">
            <ClipboardCheck />
            {t('ap.check.make')}
          </Button>
        ) : (
          <div className="grid gap-3">
            <ul className="divide-y rounded-[12px] border">
              {checklist.items.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5">
                  <span className="min-w-0 flex-1">
                    <b className="block text-[13.5px] font-[550]">
                      {i.label}
                      {!i.required && <span className="ml-1 font-normal text-muted-foreground">({t('ap.check.optional')})</span>}
                    </b>
                    <small className="block text-xs text-muted-foreground">{[i.why, i.referenceNo, i.dueOn ? t('ap.check.due', { date: fmt.date(i.dueOn, 'short') }) : null, i.note].filter(Boolean).join(' · ')}</small>
                  </span>
                  <StatusPill tone={checklist.overdue.includes(i.itemKey) ? 'danger' : TONE[i.status]}>{t(`ap.check.st.${i.status}` as MessageKey)}</StatusPill>
                  <Button size="sm" variant="outline" className="h-9" disabled={pending} onClick={() => setEditing(i)}>
                    {t('ap.check.record')}
                  </Button>
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-2">
              {canAdmit && !checklist.complete && !checklist.provisional && (
                <Button variant="outline" className="h-9" disabled={pending} onClick={() => setProvisional(true)}>
                  {t('ap.check.provisionalAdmit')}
                </Button>
              )}
              <Button variant="outline" className="h-9" asChild>
                <Link href={`/admissions/applications/${applicationId}/letter`}>
                  <Printer />
                  {t('ap.check.letter')}
                </Link>
              </Button>
            </div>
          </div>
        )}
      </Card>

      <Card title={t('ap.admit.title')} subtitle={t('ap.admit.help')}>
        <div className="grid gap-3">
          <div className="flex flex-wrap gap-2">
            <Button className="h-9" disabled={pending || !canAdmit} onClick={() => run(() => admitApplicant(applicationId), (d) => t('ap.admit.done', { roll: d.rollNo, cls: d.className }), setResult)} data-testid="admit">
              <GraduationCap />
              {t('ap.admit.button')}
            </Button>
            {studentId && (
              <Button variant="outline" className="h-9" disabled={pending} onClick={() => run(() => resendCredentials(studentId), () => t('ap.admit.resent'))}>
                <KeyRound />
                {t('ap.admit.resend')}
              </Button>
            )}
          </div>
          {result && (
            <Alert severity="success">
              <div className="grid gap-1 text-[13px]">
                <span>{result.registerNo ? t('ap.admit.registerNo', { no: result.registerNo }) : t('ap.admit.awaiting')}</span>
                {result.fees.map((f) => (
                  <span key={f.structure}>{t('ap.admit.fee', { name: f.structure, amount: fmt.rupees(f.amountPaise), date: fmt.date(f.dueOn, 'short') })}</span>
                ))}
                {result.credentials.map((c) => (
                  <span key={c.role}>{t('ap.admit.cred', { role: t(`ap.role.${c.role}` as MessageKey), channel: c.channel.toUpperCase(), to: c.destination, status: t(`ap.cred.${c.status}` as MessageKey) })}</span>
                ))}
              </div>
            </Alert>
          )}
        </div>
      </Card>

      {provisional && (
        <Dialog
          title={t('ap.check.provisionalAdmit')}
          onClose={() => setProvisional(false)}
          busy={pending}
          actions={
            <>
              <Button variant="outline" onClick={() => setProvisional(false)} disabled={pending}>
                {t('common.cancel')}
              </Button>
              <Button disabled={pending || !dueOn} onClick={() => run(() => admitProvisionally(applicationId, dueOn), () => t('ap.check.admitted'), () => setProvisional(false))}>
                {t('ap.check.provisionalAdmit')}
              </Button>
            </>
          }
        >
          <div className="grid gap-3">
            <p className="text-[13px] text-muted-foreground">{t('ap.check.undertaking')}</p>
            <FormField label={t('ap.check.dueOn')}>
              <TextInput type="date" value={dueOn} onChange={(e) => setDueOn(e.target.value)} />
            </FormField>
          </div>
        </Dialog>
      )}
      {editing && <ItemDialog item={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function ItemDialog({ item, onClose }: { item: ChecklistItem; onClose: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [status, setStatus] = useState<string>(item.status === 'pending' ? 'received' : item.status);
  const [dueOn, setDueOn] = useState(item.dueOn ?? plusDays(15));
  const [ref, setRef] = useState(item.referenceNo ?? '');
  const [note, setNote] = useState(item.note ?? '');
  const save = () =>
    start(async () => {
      const res = await updateChecklistItem(item.id, { status, dueOn: status === 'deferred' ? dueOn : null, referenceNo: ref, note });
      if (!res.ok) return toast.error(res.error);
      toast.success(t('ap.check.saved'));
      router.refresh();
      onClose();
    });
  return (
    <Dialog
      title={item.label}
      onClose={onClose}
      busy={pending}
      actions={
        <>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            {t('common.cancel')}
          </Button>
          <Button onClick={save} disabled={pending}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="grid gap-3">
        <FormField label={t('ap.check.status')}>
          <SelectInput value={status} onChange={(e) => setStatus(e.target.value)} options={['received', 'verified', 'deferred', 'waived', 'pending'].map((s) => ({ value: s, label: t(`ap.check.st.${s}` as MessageKey) }))} fullWidth />
        </FormField>
        {status === 'deferred' && (
          <FormField label={t('ap.check.dueOn')}>
            <TextInput type="date" value={dueOn} onChange={(e) => setDueOn(e.target.value)} />
          </FormField>
        )}
        <FormField label={t('ap.check.reference')}>
          <TextInput value={ref} onChange={(e) => setRef(e.target.value)} fullWidth slotProps={{ htmlInput: { maxLength: 80 } }} />
        </FormField>
        <FormField label={t('ap.check.note')} required={status === 'waived'}>
          <TextInput value={note} onChange={(e) => setNote(e.target.value)} fullWidth multiline minRows={2} slotProps={{ htmlInput: { maxLength: 500 } }} />
        </FormField>
        {item.original && status === 'received' && <Alert severity="info">{t('ap.check.custody')}</Alert>}
      </div>
    </Dialog>
  );
}
