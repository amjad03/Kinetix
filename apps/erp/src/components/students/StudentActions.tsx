'use client';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { FormField, TextInput, FormRow } from '@/components/ui';
import { changeStudentSection, changeStudentStatus, linkGuardian, readmitStudent, unlinkGuardian } from '@/app/(dashboard)/students/actions';
import { ReasonDialog } from '@/components/admissions/ReasonDialog';
import { SectionTitle } from '@/components/PageHeader';
import { StatusDialog } from '@/components/students/StatusDialog';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import { STUDENT_READMIT_FROM, STUDENT_REASON_REQUIRED, STUDENT_RETURN_STATUSES, type StudentProfile } from '@/lib/admissions';

import { Alert, Button, Checkbox, Chip, FormControlLabel, MenuItem } from '@/components/kx';
type Dialog = { kind: 'status'; status: string } | { kind: 'section'; sectionId: string } | { kind: 'readmit' } | null;

/** Status buttons (only the moves the rules allow), class change, and the student's guardians. */
export function StudentActions({ student: s, canChange, canGuardians, classes }: { student: StudentProfile; canChange: boolean; canGuardians: boolean; classes: { id: string; name: string }[] }) {
  const { t } = useI18n();
  const router = useRouter();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [error, setError] = useState<string | null>(null);
  const [target, setTarget] = useState('');
  const [g, setG] = useState({ fullName: '', phone: '', email: '', relation: 'mother', isPrimary: false });
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) =>
    start(async () => {
      setError(null);
      const res = await fn();
      if (res.ok) {
        after?.();
        router.refresh();
      } else setError(res.error ?? null);
    });
  return (
    <div className="flex flex-col gap-6 mt-6">
      {error && <Alert severity="error">{error}</Alert>}
      {canChange && (
        <div className="rounded-[12px] border bg-card p-5">
          <SectionTitle flush>{t('stu.changeStatus')}</SectionTitle>
          <div className="flex flex-row gap-2 flex-wrap gap-y-2">
            {s.allowedStatuses.map((to) => (
              <Button key={to} size="small" variant="outlined" color={['dropped', 'transferred', 'expelled', 'deceased'].includes(to) ? 'error' : 'primary'} disabled={pending} onClick={() => (STUDENT_REASON_REQUIRED.includes(to) ? setDialog({ kind: 'status', status: to }) : run(() => changeStudentStatus(s.id, to)))}>
                {t(`stu.moveTo.${to}` as MessageKey)}
              </Button>
            ))}
            {STUDENT_READMIT_FROM.includes(s.status) && (
              <Button size="small" variant="contained" disabled={pending} onClick={() => setDialog({ kind: 'readmit' })}>
                {t('stu.readmit')}
              </Button>
            )}
            {s.allowedStatuses.length === 0 && !STUDENT_READMIT_FROM.includes(s.status) && (
              <p className="text-[13px] leading-[19px] text-muted-foreground">
                {t('stu.final')}
              </p>
            )}
          </div>
          {classes.length > 0 && !['transferred', 'alumni', 'dropped', 'expelled', 'deceased'].includes(s.status) && (
            <FormRow className="gap-2 mt-4">
              <FormField label={t('stu.moveClass')}>
                <TextInput className="min-w-[220px]" select value={target} onChange={(e) => setTarget(e.target.value)}>
                  {classes.map((c) => (
                    <MenuItem key={c.id} value={c.id}>
                      {c.name}
                    </MenuItem>
                  ))}
                </TextInput>
              </FormField>
              <Button variant="outlined" size="small" disabled={!target || pending} onClick={() => setDialog({ kind: 'section', sectionId: target })}>
                {t('stu.moveClassGo')}
              </Button>
            </FormRow>
          )}
        </div>
      )}

      <div className="rounded-[12px] border bg-card p-5">
        <SectionTitle flush>{t('stu.guardians')}</SectionTitle>
        <div className="flex flex-col gap-3">
          {s.guardians.map((x) => (
            <div className="flex items-center gap-2 flex-wrap" key={x.id}>
              <div className="flex-[1_1_180px] min-w-0">
                <p className="text-[13px] leading-[19px] font-semibold">
                  {x.fullName} <span className="text-[13px] leading-[19px] text-muted-foreground">({x.relation})</span>
                </p>
                <span className="text-xs leading-4 tracking-[0.3px] text-muted-foreground">
                  {x.phone ?? '–'}
                  {x.email ? ` · ${x.email}` : ''}
                </span>
              </div>
              {x.isPrimary && <Chip size="small" color="primary" label={t('stu.primary')} />}
              {x.isEmergencyContact && <Chip size="small" variant="outlined" label={t('stu.emergency')} />}
              {canGuardians && s.guardians.length > 1 && (
                <Button size="small" color="error" disabled={pending} onClick={() => run(() => unlinkGuardian(s.id, x.id))}>
                  {t('stu.unlink')}
                </Button>
              )}
            </div>
          ))}
          {s.guardians.length === 0 && (
            <p className="text-[13px] leading-[19px] text-muted-foreground">
              {t('stu.noGuardians')}
            </p>
          )}
        </div>
        {canGuardians && (
          <form className="mt-5"
            onSubmit={(e: React.FormEvent) => {
              e.preventDefault();
              run(() => linkGuardian(s.id, g), () => setG({ fullName: '', phone: '', email: '', relation: 'mother', isPrimary: false }));
            }}
          >
            <h6 className="text-sm leading-5 font-medium tracking-[0.1px] mb-2">
              {t('stu.addGuardian')}
            </h6>
            <div className="grid grid-cols-[1fr] sm:grid-cols-[1fr_1fr] gap-3">
              <FormField label={t('adm.field.name')} required>
                <TextInput value={g.fullName} onChange={(e) => setG({ ...g, fullName: e.target.value })} required />
              </FormField>
              <FormField label={t('adm.field.phone')} required>
                <TextInput value={g.phone} onChange={(e) => setG({ ...g, phone: e.target.value })} required slotProps={{ htmlInput: { inputMode: 'tel' } }} />
              </FormField>
              <FormField label={t('adm.field.email')}>
                <TextInput value={g.email} onChange={(e) => setG({ ...g, email: e.target.value })} type="email" />
              </FormField>
              <FormField label={t('stu.relation')} required>
                <TextInput value={g.relation} onChange={(e) => setG({ ...g, relation: e.target.value })} required />
              </FormField>
            </div>
            <FormControlLabel control={<Checkbox size="small" checked={g.isPrimary} onChange={(e) => setG({ ...g, isPrimary: e.target.checked })} />} label={t('stu.makePrimary')} />
            <div>
              <Button type="submit" variant="contained" size="small" disabled={pending || !g.fullName.trim() || !g.phone.trim()}>
                {t('stu.linkGuardian')}
              </Button>
            </div>
          </form>
        )}
      </div>

      {dialog?.kind === 'status' && <StatusDialog studentId={s.id} status={dialog.status} withReturn={STUDENT_RETURN_STATUSES.includes(dialog.status)} onClose={(done) => { setDialog(null); if (done) router.refresh(); }} />}
      {dialog?.kind === 'readmit' && (
        <ReasonDialog
          title={t('stu.readmit')}
          help={t('stu.readmitHelp')}
          label={t('adm.field.reason')}
          required
          confirm={t('common.save')}
          onSubmit={(reason) => readmitStudent(s.id, reason)}
          onClose={(done) => {
            setDialog(null);
            if (done) router.refresh();
          }}
        />
      )}
      {dialog?.kind === 'section' && (
        <ReasonDialog
          title={t('stu.moveClass')}
          label={t('adm.field.reason')}
          required
          confirm={t('common.save')}
          onSubmit={(reason) => changeStudentSection(s.id, dialog.sectionId, reason)}
          onClose={(done) => {
            setDialog(null);
            if (done) {
              setTarget('');
              router.refresh();
            }
          }}
        />
      )}
    </div>
  );
}
