'use client';

import NextLink from 'next/link';
import { Hash, Pencil, Send } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { decideDetailChange, giveAdmissionNo, requestDetailChange, saveStudentDetails } from '@/app/(dashboard)/students/info-actions';
import { ReasonDialog } from '@/components/admissions/ReasonDialog';
import { Alert } from '@/components/kx';
import { Button } from '@/components/shadcn/button';
import { Card, CheckboxField, Dialog, FormField, SelectInput, StatusPill, TextInput, useToast } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import type { ChangeRequest, CustomFieldView, ProfileFieldView, StudentDetails } from '@/lib/student-info';
import { fieldName, REQUEST_TONE } from './ChangeRequests';

type Value = string | number | boolean | null;
/** Fixed fields whose values are words from a list (shown in the reader's language). */
const WORDED = new Set(['gender', 'category', 'admissionType']);

/**
 * The student's profile details: identifiers (admission and register numbers, PEN, APAAR and ABC ids, Aadhaar shown
 * only as its last four digits), personal and category details, address and the institution's own fields. Editors
 * change them here; others ask for a change, which the office approves. Brothers and sisters and the requests follow.
 */
export function StudentDetailsTab({ details, requests, canDecide }: { details: StudentDetails; requests: ChangeRequest[]; canDecide: boolean }) {
  const { t, fmt } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [asking, setAsking] = useState(false);
  const [rejecting, setRejecting] = useState<ChangeRequest | null>(null);
  const [pending, start] = useTransition();
  const fieldText = (f: { key: string; label: string }) => t(`si.f.${f.key}` as MessageKey);
  const show = (key: string, kind: string, v: Value) => {
    if (v === null || v === '') return <span className="text-muted-foreground">{t('pf.none')}</span>;
    if (kind === 'boolean') return t(v ? 'si.yes' : 'si.no');
    if (kind === 'date') return fmt.date(String(v), 'short');
    if (WORDED.has(key)) return t(`si.o.${key}.${v}` as MessageKey);
    return String(v);
  };
  const admissionNo = details.fields.find((f) => f.key === 'admissionNo')?.value;
  const give = () =>
    start(async () => {
      const res = await giveAdmissionNo(details.studentId);
      if (!res.ok) return toast.error(res.error);
      toast.success(t('si.admissionNoGiven', { no: res.data.admissionNo }));
      router.refresh();
    });
  const approve = (r: ChangeRequest) =>
    start(async () => {
      const res = await decideDetailChange(r.id, 'approve');
      if (!res.ok) return toast.error(res.error);
      toast.success(t('si.requestApproved'));
      router.refresh();
    });
  return (
    <div className="grid gap-6">
      <Card
        title={t('si.details.title')}
        subtitle={t('si.details.subtitle')}
        action={
          <span className="flex flex-wrap gap-2">
            {details.canEdit && !admissionNo && (
              <Button size="sm" variant="outline" className="h-9" onClick={give} disabled={pending} data-testid="give-admission-no">
                <Hash />
                {t('si.giveAdmissionNo')}
              </Button>
            )}
            {details.canEdit ? (
              <Button size="sm" className="h-9" onClick={() => setEditing(true)} data-testid="edit-details">
                <Pencil />
                {t('si.editDetails')}
              </Button>
            ) : (
              <Button size="sm" variant="outline" className="h-9" onClick={() => setAsking(true)}>
                <Send />
                {t('si.askChange')}
              </Button>
            )}
          </span>
        }
      >
        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
          {details.fields.map((f) => (
            <div key={f.key} className="min-w-0">
              <dt className="text-xs text-muted-foreground">{fieldText(f)}</dt>
              <dd className="truncate text-[13.5px]">{show(f.key, f.kind, f.value)}</dd>
            </div>
          ))}
          <div>
            <dt className="text-xs text-muted-foreground">{t('si.f.aadhaar')}</dt>
            <dd className="text-[13.5px] tabular-nums">{details.aadhaar ?? <span className="text-muted-foreground">{t('pf.none')}</span>}</dd>
          </div>
          {details.custom.map((c) => (
            <div key={c.key} className="min-w-0">
              <dt className="text-xs text-muted-foreground">{c.label}</dt>
              <dd className="truncate text-[13.5px]">{show(c.key, c.type, c.value)}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <Card title={t('si.siblings.title')} subtitle={t('si.siblings.subtitle')}>
        {details.siblings.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">{t('si.siblings.none')}</p>
        ) : (
          <ul className="grid gap-2">
            {details.siblings.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[13.5px]">
                <NextLink href={`/students/${s.id}`} className="font-medium hover:underline">
                  {s.fullName}
                </NextLink>
                <span className="text-muted-foreground">
                  {s.rollNo} · {s.className}
                </span>
                <StatusPill tone="neutral">{t('si.siblings.position', { n: s.position })}</StatusPill>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title={t('si.requests.forStudent')}>
        {requests.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">{t('si.requests.noneForStudent')}</p>
        ) : (
          <ul className="divide-y">
            {requests.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3">
                <span className="min-w-0 flex-1">
                  <b className="block text-[13.5px] font-[550]">
                    {fieldName(t, r.field, r.fieldLabel)}: <s className="font-normal text-muted-foreground">{r.currentValue ?? '—'}</s> → {r.newValue}
                  </b>
                  <small className="block text-xs text-muted-foreground">
                    {t(`si.o.requestedAs.${r.requestedAs}` as MessageKey)} · {fmt.date(r.createdAt.slice(0, 10), 'short')} · {r.reason}
                    {r.decisionNote ? ` · ${r.decisionNote}` : ''}
                  </small>
                </span>
                <StatusPill tone={REQUEST_TONE[r.status] ?? 'neutral'}>{t(`si.o.requestStatus.${r.status}` as MessageKey)}</StatusPill>
                {canDecide && r.status === 'pending' && (
                  <span className="flex gap-2">
                    <Button size="sm" variant="outline" className="h-9" disabled={pending} onClick={() => setRejecting(r)}>
                      {t('si.reject')}
                    </Button>
                    <Button size="sm" className="h-9" disabled={pending} onClick={() => approve(r)}>
                      {t('si.approve')}
                    </Button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {editing && <EditDetails details={details} onClose={() => setEditing(false)} />}
      {asking && <AskChange details={details} onClose={() => setAsking(false)} />}
      {rejecting && (
        <ReasonDialog
          title={t('si.rejectTitle', { field: fieldName(t, rejecting.field, rejecting.fieldLabel) })}
          label={t('si.rejectWhy')}
          required
          confirm={t('si.reject')}
          onSubmit={async (note) => {
            const res = await decideDetailChange(rejecting.id, 'reject', note);
            if (res.ok) router.refresh();
            return res;
          }}
          onClose={() => setRejecting(null)}
        />
      )}
    </div>
  );
}

/** One input for a fixed or custom field. */
function FieldInput({ f, value, onChange, t }: { f: Pick<ProfileFieldView, 'key' | 'kind' | 'options'> | (Pick<CustomFieldView, 'key' | 'options'> & { kind: string }); value: Value; onChange: (v: Value) => void; t: (k: MessageKey) => string }) {
  if (f.kind === 'boolean') return <CheckboxField label={t('si.yes')} checked={!!value} onChange={onChange} />;
  if (f.kind === 'select')
    return <SelectInput value={value === null ? '' : String(value)} onChange={(e) => onChange(e.target.value || null)} options={(f.options ?? []).map((o) => ({ value: o, label: WORDED.has(f.key) ? t(`si.o.${f.key}.${o}` as MessageKey) : o }))} empty="—" fullWidth />;
  return <TextInput value={value === null ? '' : String(value)} onChange={(e) => onChange(e.target.value)} type={f.kind === 'date' ? 'date' : f.kind === 'number' ? 'number' : 'text'} fullWidth />;
}

function EditDetails({ details, onClose }: { details: StudentDetails; onClose: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const [values, setValues] = useState<Record<string, Value>>(() => Object.fromEntries(details.fields.map((f) => [f.key, f.value])));
  const [custom, setCustom] = useState<Record<string, Value>>(() => Object.fromEntries(details.custom.map((c) => [c.key, c.value])));
  const [aadhaar, setAadhaar] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const save = () =>
    start(async () => {
      setError(null);
      const changed = Object.fromEntries(details.fields.filter((f) => (values[f.key] ?? null) !== (f.value ?? null) && !(values[f.key] === '' && f.value === null)).map((f) => [f.key, values[f.key] === '' ? null : values[f.key]]));
      const changedCustom = Object.fromEntries(details.custom.filter((c) => c.canEdit && (custom[c.key] ?? null) !== (c.value ?? null)).map((c) => [c.key, custom[c.key] === '' ? null : custom[c.key]]));
      const res = await saveStudentDetails(details.studentId, { values: changed, custom: changedCustom, ...(aadhaar.trim() ? { aadhaar: aadhaar.trim() } : {}) });
      if (!res.ok) return setError(res.error);
      toast.success(t('si.detailsSaved'));
      router.refresh();
      onClose();
    });
  return (
    <Dialog
      title={t('si.editDetails')}
      onClose={onClose}
      busy={pending}
      size="md"
      actions={
        <>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            {t('common.cancel')}
          </Button>
          <Button onClick={save} disabled={pending} data-testid="save-details">
            {t('si.save')}
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        {error && <Alert severity="error">{error}</Alert>}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {details.fields.map((f) => (
            <FormField key={f.key} label={t(`si.f.${f.key}` as MessageKey)}>
              <FieldInput f={f} value={values[f.key] ?? null} onChange={(v) => setValues({ ...values, [f.key]: v })} t={t} />
            </FormField>
          ))}
          <FormField label={t('si.f.aadhaar')} helper={details.aadhaar ? t('si.aadhaarOnFile', { masked: details.aadhaar }) : t('si.aadhaarHelp')}>
            <TextInput value={aadhaar} onChange={(e) => setAadhaar(e.target.value.replace(/[^\d ]/g, '').slice(0, 14))} inputMode="numeric" autoComplete="off" fullWidth data-testid="aadhaar" />
          </FormField>
          {details.custom.filter((c) => c.canEdit).map((c) => (
            <FormField key={c.key} label={c.label} helper={c.help ?? undefined} required={c.required}>
              <FieldInput f={{ key: c.key, kind: c.type, options: c.options }} value={custom[c.key] ?? null} onChange={(v) => setCustom({ ...custom, [c.key]: v })} t={t} />
            </FormField>
          ))}
        </div>
      </div>
    </Dialog>
  );
}

function AskChange({ details, onClose }: { details: StudentDetails; onClose: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const choices = [...details.fields.filter((f) => f.requestable).map((f) => ({ value: f.key, label: t(`si.f.${f.key}` as MessageKey) })), ...details.custom.map((c) => ({ value: `custom.${c.key}`, label: c.label }))];
  const [field, setField] = useState(choices[0]?.value ?? '');
  const [value, setValue] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const send = () =>
    start(async () => {
      setError(null);
      const res = await requestDetailChange(details.studentId, { field, newValue: value, reason });
      if (!res.ok) return setError(res.error);
      toast.success(t('si.requestSent'));
      router.refresh();
      onClose();
    });
  return (
    <Dialog
      title={t('si.askChange')}
      onClose={onClose}
      busy={pending}
      actions={
        <>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            {t('common.cancel')}
          </Button>
          <Button onClick={send} disabled={pending || !field || !value.trim() || reason.trim().length < 3}>
            {t('si.sendRequest')}
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        {error && <Alert severity="error">{error}</Alert>}
        <FormField label={t('si.whichDetail')}>
          <SelectInput value={field} onChange={(e) => setField(e.target.value)} options={choices} fullWidth />
        </FormField>
        <FormField label={t('si.newValue')}>
          <TextInput value={value} onChange={(e) => setValue(e.target.value)} fullWidth slotProps={{ htmlInput: { maxLength: 500 } }} />
        </FormField>
        <FormField label={t('si.col.reason')} required>
          <TextInput value={reason} onChange={(e) => setReason(e.target.value)} multiline minRows={2} fullWidth slotProps={{ htmlInput: { maxLength: 500 } }} />
        </FormField>
      </div>
    </Dialog>
  );
}
