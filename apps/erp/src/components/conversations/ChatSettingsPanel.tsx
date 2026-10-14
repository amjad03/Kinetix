'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { saveChatSettings, setClassTeacher } from '@/app/(dashboard)/conversations/actions';
import { Button } from '@/components/shadcn/button';
import { DataTable, FormField, SwitchField, TextInput, useToast, type Column } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import type { ChatSettingsView } from '@/lib/communication';
import { cn } from '@/lib/utils';

const DAYS = [1, 2, 3, 4, 5, 6, 7];
type ClassRow = NonNullable<ChatSettingsView['classTeachers']>[number];

/** Family chat settings: student chat, office hours, who answers office threads, and class teachers. */
export function ChatSettingsPanel({ settings, staff, schoolKind }: { settings: ChatSettingsView; staff: { id: string; fullName: string }[]; schoolKind: boolean }) {
  const { t } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const [studentChat, setStudentChat] = useState(settings.studentChat);
  const [hoursOn, setHoursOn] = useState(!!settings.officeHours);
  const [startAt, setStartAt] = useState(settings.officeHours?.start ?? '09:00');
  const [endAt, setEndAt] = useState(settings.officeHours?.end ?? '17:00');
  const [days, setDays] = useState<number[]>(settings.officeHours?.days ?? [1, 2, 3, 4, 5, 6]);
  const [office, setOffice] = useState<string[]>(settings.officeUserIds ?? []);
  const [officeRoles, setOfficeRoles] = useState<string[]>(settings.officeRoles ?? []);
  const [busy, start] = useTransition();
  const hoursError = hoursOn && (startAt >= endAt || days.length === 0) ? t('fc.set.hoursError') : '';

  const save = () =>
    start(async () => {
      if (hoursError) return;
      const r = await saveChatSettings({ studentChat, officeHours: hoursOn ? { start: startAt, end: endAt, days } : null, officeUserIds: office, officeRoles });
      if (!r.ok) return toast.error(r.error);
      toast.success(t('fc.set.saved'));
      router.refresh();
    });

  const cols: Column<ClassRow>[] = [
    { id: 'class', header: t('fc.set.class'), rowHeader: true, cell: (r) => r.displayName, sort: (r) => r.displayName },
    {
      id: 'teacher',
      header: t('fc.set.classTeacher'),
      cell: (r) => (
        <select
          aria-label={t('fc.set.classTeacherFor', { className: r.displayName })}
          defaultValue={r.classTeacher?.id ?? ''}
          className="h-10 w-full max-w-[260px] rounded-md border bg-background px-2 text-sm"
          onChange={(e) =>
            start(async () => {
              const res = await setClassTeacher(r.sectionId, e.target.value || null);
              if (!res.ok) return toast.error(res.error);
              toast.success(t('fc.set.classTeacherSaved', { className: r.displayName }));
            })
          }
          data-testid={`fc-ct-${r.sectionId}`}
        >
          <option value="">{t('fc.set.none')}</option>
          {staff.map((s) => (
            <option key={s.id} value={s.id}>
              {s.fullName}
            </option>
          ))}
        </select>
      ),
      sort: (r) => r.classTeacher?.fullName ?? '',
      csv: (r) => r.classTeacher?.fullName ?? '',
    },
  ];

  return (
    <div className="grid gap-6 max-w-[920px]" data-testid="fc-settings">
      <section className="rounded-xl border bg-card p-5 grid gap-4">
        <h2 className="text-base font-semibold">{t('fc.set.who')}</h2>
        <div>
          <SwitchField label={t('fc.set.studentChat')} checked={studentChat} onChange={setStudentChat} />
          <p className="text-xs text-muted-foreground">{schoolKind ? t('fc.set.studentChatSchool') : t('fc.set.studentChatCollege')}</p>
        </div>
        <fieldset className="grid gap-2 border-0 p-0 m-0">
          <legend className="text-[13px] font-semibold mb-1">{t('fc.set.officeStaff')}</legend>
          <p className="text-xs text-muted-foreground">{t('fc.set.officeStaffHelp')}</p>
          <ul className="grid max-h-56 gap-0.5 overflow-auto rounded-md border p-1 sm:grid-cols-2">
            {staff.map((s) => (
              <li key={s.id}>
                <label className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted">
                  <input type="checkbox" checked={office.includes(s.id)} onChange={() => setOffice((x) => (x.includes(s.id) ? x.filter((y) => y !== s.id) : [...x, s.id]))} />
                  {s.fullName}
                </label>
              </li>
            ))}
          </ul>
        </fieldset>
        <fieldset className="grid gap-2 border-0 p-0 m-0">
          <legend className="text-[13px] font-semibold mb-1">{t('cd.officeRoles')}</legend>
          <p className="text-xs text-muted-foreground">{t('cd.officeRolesHelp')}</p>
          <div className="flex flex-wrap gap-x-4 gap-y-1" data-testid="fc-office-roles">
            {(settings.officeRoleChoices ?? []).map((r) => (
              <label key={r} className="flex cursor-pointer items-center gap-2 text-sm">
                <input type="checkbox" checked={officeRoles.includes(r)} onChange={() => setOfficeRoles((x) => (x.includes(r) ? x.filter((y) => y !== r) : [...x, r]))} />
                {t(`role.${r}` as MessageKey)}
              </label>
            ))}
          </div>
        </fieldset>
      </section>

      <section className="rounded-xl border bg-card p-5 grid gap-4">
        <h2 className="text-base font-semibold">{t('fc.set.hours')}</h2>
        <div>
          <SwitchField label={t('fc.set.hoursOn')} checked={hoursOn} onChange={setHoursOn} />
          <p className="text-xs text-muted-foreground">{t('fc.set.hoursHelp')}</p>
        </div>
        {hoursOn && (
          <>
            <div className="flex flex-wrap items-end gap-3">
              <FormField label={t('fc.set.from')}>
                <TextInput type="time" value={startAt} onChange={(e) => setStartAt(e.target.value)} data-testid="fc-hours-start" />
              </FormField>
              <FormField label={t('fc.set.to')}>
                <TextInput type="time" value={endAt} onChange={(e) => setEndAt(e.target.value)} data-testid="fc-hours-end" />
              </FormField>
            </div>
            <div role="group" aria-label={t('fc.set.days')} className="flex flex-wrap gap-1.5">
              {DAYS.map((d) => (
                <button key={d} type="button" aria-pressed={days.includes(d)} onClick={() => setDays((x) => (x.includes(d) ? x.filter((y) => y !== d) : [...x, d].sort()))} className={cn('h-9 min-w-12 rounded-md border px-2 text-sm', days.includes(d) ? 'border-primary bg-secondary font-semibold' : 'bg-background text-muted-foreground')}>
                  {t(`fc.day.${d}` as MessageKey)}
                </button>
              ))}
            </div>
            {hoursError ? <p className="text-xs text-red-ink" role="alert">{hoursError}</p> : <p className="text-xs text-muted-foreground">{t('fc.set.hoursPreview', { start: startAt, end: endAt })}</p>}
          </>
        )}
        <div className="flex justify-end">
          <Button onClick={save} disabled={busy || !!hoursError} data-testid="fc-settings-save">
            {t('common.save')}
          </Button>
        </div>
      </section>

      <section className="grid gap-3">
        <div>
          <h2 className="text-base font-semibold">{t('fc.set.classTeachers')}</h2>
          <p className="text-xs text-muted-foreground">{t('fc.set.classTeachersHelp')}</p>
        </div>
        <DataTable testId="fc-class-teachers" label={t('fc.set.classTeachers')} columns={cols} rows={settings.classTeachers ?? []} rowId={(r) => r.sectionId} exportName="class-teachers" />
      </section>
    </div>
  );
}
