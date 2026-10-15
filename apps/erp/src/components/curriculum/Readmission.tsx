'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { readmitStudent } from '@/app/(dashboard)/curriculum/readmission/actions';
import { Button } from '@/components/shadcn/button';
import { Card, Dialog, StatusPill, TextInput, useToastOptional } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import { versionText, type ReadmissionPlan, type ReadmissionRow } from '@/lib/relative-grading';

/** What re-admission does: the version left and the one in force, subjects that count and those still to take. */
export function ReadmissionPlanView({ plan, canApply }: { plan: ReadmissionPlan; canApply: boolean }) {
  const { t, fmt } = useI18n();
  const [ask, setAsk] = useState(false);
  return (
    <Card
      title={t('ra.planTitle', { name: plan.student.name })}
      subtitle={t('ra.planSub', { date: fmt.date(plan.rejoinedOn), term: String(plan.rejoinTerm), program: plan.student.program })}
      action={
        canApply ? (
          <Button className="h-9" onClick={() => setAsk(true)} data-testid="ra-apply">
            {t('ra.apply')}
          </Button>
        ) : undefined
      }
      testId="ra-plan"
    >
      <dl className="m-0 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground">{t('ra.from')}</dt>
          <dd className="m-0 font-medium">{plan.from ? versionText(plan.from) : t('ra.noVersion')}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{t('ra.to')}</dt>
          <dd className="m-0 font-medium" data-testid="ra-to">
            {versionText(plan.to)}
          </dd>
        </div>
        {plan.scheme && (
          <div className="sm:col-span-2">
            <dt className="text-muted-foreground">{t('ra.scheme')}</dt>
            <dd className="m-0">{plan.scheme.name}</dd>
          </div>
        )}
      </dl>
      {plan.sameVersion && <p className="mt-3 mb-0 text-sm text-muted-foreground">{t('ra.same')}</p>}
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <section>
          <h3 className="mt-0 mb-2 text-sm font-semibold">
            {t('ra.credited')} <StatusPill tone="success">{plan.credited.length}</StatusPill>
          </h3>
          {plan.credited.length === 0 ? (
            <p className="m-0 text-sm text-muted-foreground">{t('ra.noneCredited')}</p>
          ) : (
            <ul className="m-0 grid list-none gap-1.5 p-0 text-sm" data-testid="ra-credited">
              {plan.credited.map((c) => (
                <li key={c.toCode} className="rounded-md border px-3 py-2">
                  <b className="font-medium">{c.toCode}</b> {c.toName}
                  <span className="block text-[13px] text-muted-foreground">{c.fromCode === c.toCode ? t('ra.sameCode', { grade: c.grade ?? '-' }) : t('ra.through', { code: c.fromCode, name: c.fromName, grade: c.grade ?? '-' })}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section>
          <h3 className="mt-0 mb-2 text-sm font-semibold">
            {t('ra.toTake')} <StatusPill tone={plan.toTake.length ? 'warning' : 'neutral'}>{plan.toTake.length}</StatusPill>
          </h3>
          {plan.toTake.length === 0 ? (
            <p className="m-0 text-sm text-muted-foreground">{t('ra.noneToTake')}</p>
          ) : (
            <ul className="m-0 grid list-none gap-1.5 p-0 text-sm" data-testid="ra-totake">
              {plan.toTake.map((c) => (
                <li key={c.code} className="rounded-md border px-3 py-2">
                  <b className="font-medium">{c.code}</b> {c.name}
                  <span className="block text-[13px] text-muted-foreground">{t('ra.termCredits', { term: String(c.term), credits: String(c.credits) })}</span>
                </li>
              ))}
            </ul>
          )}
          {plan.notCounted.length > 0 && (
            <p className="mt-3 mb-0 text-[13px] text-muted-foreground">
              {t('ra.notCounted', { list: plan.notCounted.map((x) => x.code).join(', ') })}
            </p>
          )}
        </section>
      </div>
      {ask && <ApplyDialog plan={plan} onClose={() => setAsk(false)} />}
    </Card>
  );
}

function ApplyDialog({ plan, onClose }: { plan: ReadmissionPlan; onClose: () => void }) {
  const { t } = useI18n();
  const router = useRouter();
  const toast = useToastOptional();
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const submit = () =>
    start(async () => {
      const res = await readmitStudent(plan.student.id, plan.rejoinedOn, plan.rejoinTerm, note.trim());
      if (!res.ok) return setError(res.error);
      toast?.success(t('ra.done'));
      onClose();
      router.refresh();
    });
  return (
    <Dialog
      title={t('ra.applyTitle')}
      size="sm"
      busy={pending}
      onClose={onClose}
      actions={
        <>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            {t('ra.cancel')}
          </Button>
          <Button onClick={submit} disabled={pending} data-testid="ra-confirm">
            {t('ra.apply')}
          </Button>
        </>
      }
    >
      <p className="mt-0 mb-4 text-sm text-muted-foreground">{t('ra.applyIntro', { version: versionText(plan.to) })}</p>
      <TextInput label={t('ra.note')} multiline minRows={2} value={note} onChange={(e) => setNote(e.target.value)} fullWidth />
      {error && (
        <p role="alert" className="mt-3 mb-0 text-sm text-destructive">
          {error}
        </p>
      )}
    </Dialog>
  );
}

/** The student's earlier re-admissions. */
export function ReadmissionHistory({ rows }: { rows: ReadmissionRow[] }) {
  const { t, fmt } = useI18n();
  if (!rows.length) return <p className="m-0 text-sm text-muted-foreground">{t('ra.noHistory')}</p>;
  return (
    <ul className="m-0 grid list-none gap-2 p-0" data-testid="ra-history">
      {rows.map((r) => (
        <li key={r.id} className="rounded-lg border px-3 py-2.5 text-sm">
          <b className="font-medium">{t('ra.historyLine', { date: fmt.date(r.rejoinedOn), term: String(r.rejoinTerm) })}</b>
          <span className="block text-muted-foreground">
            {versionText(r.from) || t('ra.noVersion')} → {versionText(r.to)}
          </span>
          <span className="block text-[13px] text-muted-foreground">{t('ra.historyCounts', { credited: String(r.credited.length), toTake: String(r.toTake.length) })}</span>
          {r.note && <span className="block text-[13px]">{r.note}</span>}
        </li>
      ))}
    </ul>
  );
}
