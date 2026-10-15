'use client';

import { Plus, Trash2 } from 'lucide-react';
import type { MessageKey } from '@/i18n/messages';
import { useState } from 'react';
import { Button } from '@/components/shadcn/button';
import { ModuleSettingsPage, NumberingSeriesField } from '@/components/templates';
import { CheckboxField, FormRow, SelectInput, TextInput, useToast } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { AcademicSettings } from '@/lib/academics';
import { saveSettings } from '@/app/(dashboard)/academics/actions';

type K = keyof AcademicSettings;
const KINDS: K[] = ['numbering', 'attendance', 'assessment', 'timetable', 'registration', 'workload'];

/** Academics settings: numbering series, attendance rules, assessment components, timetable and registration rules. */
export function AcademicSettingsForm({ initial }: { initial: AcademicSettings }) {
  const { t } = useI18n();
  const toast = useToast();
  const [v, setV] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [saving, setSaving] = useState(false);
  const dirty = KINDS.filter((k) => JSON.stringify(v[k]) !== JSON.stringify(saved[k]));
  const patch = <S extends K>(k: S, p: Partial<AcademicSettings[S]>) => setV((x) => ({ ...x, [k]: { ...x[k], ...p } }));
  const num = <S extends K>(k: S, f: keyof AcademicSettings[S] & string, label: string, width = 'w-[180px]') => (
    <TextInput className={width} type="number" label={label} value={String(v[k][f] as number)} onChange={(e) => patch(k, { [f]: Number(e.target.value) } as Partial<AcademicSettings[S]>)} />
  );
  const flag = <S extends K>(k: S, f: keyof AcademicSettings[S] & string, label: string) => <CheckboxField label={label} checked={v[k][f] as boolean} onChange={(c) => patch(k, { [f]: c } as Partial<AcademicSettings[S]>)} />;

  async function save() {
    setSaving(true);
    for (const k of dirty) {
      const r = await saveSettings(k, v[k]);
      if (!r.ok) {
        setSaving(false);
        toast.error(`${t(`acad.set.${k}` as MessageKey)}: ${r.error}`);
        return;
      }
      setSaved((x) => ({ ...x, [k]: r.data }));
    }
    setSaving(false);
    toast.success(t('acad.saved'));
  }

  const comps = v.assessment.components;
  const weight = comps.reduce((s, c) => s + c.weight, 0);
  return (
    <ModuleSettingsPage
      title={t('acad.settings')}
      subtitle={t('acad.settingsHelp')}
      onSave={save}
      saving={saving}
      dirty={dirty.length > 0}
      sections={[
        {
          id: 'numbering',
          kind: 'numbering',
          description: t('acad.set.numberingHelp'),
          content: (
            <div className="grid gap-6">
              {(['admission', 'roll', 'tc', 'request'] as const).map((s) => (
                <NumberingSeriesField key={s} label={t(`acad.series.${s}` as MessageKey)} value={v.numbering[s]} onChange={(x) => patch('numbering', { [s]: x })} />
              ))}
              {flag('numbering', 'rollPerSection', t('acad.set.rollPerSection'))}
            </div>
          ),
        },
        {
          id: 'attendance',
          kind: 'rules',
          title: t('acad.set.attendance'),
          description: t('acad.set.attendanceHelp'),
          content: (
            <div className="grid gap-4">
              <FormRow>
                {num('attendance', 'minPercent', t('acad.set.minPercent'))}
                {num('attendance', 'warnPercent', t('acad.set.warnPercent'))}
                {num('attendance', 'correctionWindowDays', t('acad.set.correctionWindowDays'))}
                {num('attendance', 'maxCondonationPoints', t('acad.set.maxCondonationPoints'))}
              </FormRow>
              {flag('attendance', 'lateCountsAsPresent', t('acad.set.lateCountsAsPresent'))}
              {flag('attendance', 'notifyGuardianOnAbsence', t('acad.set.notifyGuardianOnAbsence'))}
              <FormRow>
                <SelectInput className="w-[220px]" label={t('acad.set.mode')} value={v.attendance.mode} onChange={(e) => patch('attendance', { mode: e.target.value as AcademicSettings['attendance']['mode'] })} options={(['hour', 'day', 'session'] as const).map((m) => ({ value: m, label: t(`acad.set.mode.${m}`) }))} />
                {num('attendance', 'unmarkedReminderMinutes', t('acad.set.unmarkedReminderMinutes'), 'w-[min(100%,360px)]')}
                <TextInput className="w-[180px]" type="number" label={t('acad.set.condonationFee')} value={String(v.attendance.condonationFeePaise / 100)} onChange={(e) => patch('attendance', { condonationFeePaise: Math.round(Number(e.target.value) * 100) })} />
              </FormRow>
              <FormRow>
                <SelectInput className="w-[200px]" label={t('acad.set.onDutyCountsAs')} value={v.attendance.onDutyCountsAs} onChange={(e) => patch('attendance', { onDutyCountsAs: e.target.value as 'present' | 'excused' })} options={(['present', 'excused'] as const).map((m) => ({ value: m, label: t(`atd.status.${m}`) }))} />
                <SelectInput className="w-[200px]" label={t('acad.set.medicalCountsAs')} value={v.attendance.medicalCountsAs} onChange={(e) => patch('attendance', { medicalCountsAs: e.target.value as 'absent' | 'excused' })} options={(['absent', 'excused'] as const).map((m) => ({ value: m, label: t(`atd.status.${m}`) }))} />
                <SelectInput className="w-[200px]" label={t('acad.set.personalCountsAs')} value={v.attendance.personalCountsAs} onChange={(e) => patch('attendance', { personalCountsAs: e.target.value as 'absent' | 'excused' })} options={(['absent', 'excused'] as const).map((m) => ({ value: m, label: t(`atd.status.${m}`) }))} />
              </FormRow>
              {flag('attendance', 'shortageAlerts', t('acad.set.shortageAlerts'))}
              {flag('attendance', 'dailyDigest', t('acad.set.dailyDigest'))}
            </div>
          ),
        },
        {
          id: 'assessment',
          title: t('acad.set.assessment'),
          description: t('acad.set.assessmentHelp', { n: weight }),
          content: (
            <div className="grid gap-4">
              {comps.map((c, i) => {
                const set = (p: Partial<typeof c>) => patch('assessment', { components: comps.map((x, j) => (j === i ? { ...x, ...p } : x)) });
                return (
                  <FormRow key={i}>
                    <TextInput className="w-[110px]" label={t('acad.col.code')} value={c.code} onChange={(e) => set({ code: e.target.value })} />
                    <TextInput className="w-[220px]" label={t('acad.set.componentName')} value={c.name} onChange={(e) => set({ name: e.target.value })} />
                    <TextInput className="w-[120px]" type="number" label={t('acad.set.weight')} value={String(c.weight)} onChange={(e) => set({ weight: Number(e.target.value) })} />
                    <TextInput className="w-[120px]" type="number" label={t('acad.maxMarks')} value={String(c.maxMarks)} onChange={(e) => set({ maxMarks: Number(e.target.value) })} />
                    <Button variant="ghost" size="icon" aria-label={t('acad.remove')} onClick={() => patch('assessment', { components: comps.filter((_, j) => j !== i) })}>
                      <Trash2 className="size-4" />
                    </Button>
                  </FormRow>
                );
              })}
              <div>
                <Button variant="outline" onClick={() => patch('assessment', { components: [...comps, { code: `C${comps.length + 1}`, name: '', weight: 0, maxMarks: 10 }] })}>
                  <Plus className="size-4" /> {t('acad.set.addComponent')}
                </Button>
              </div>
              <FormRow>{num('assessment', 'passPercent', t('acad.set.passPercent'))}</FormRow>
              {flag('assessment', 'lockBeforePublish', t('acad.set.lockBeforePublish'))}
            </div>
          ),
        },
        {
          id: 'timetable',
          title: t('acad.set.timetable'),
          description: t('acad.set.timetableHelp'),
          content: (
            <div className="grid gap-4">
              <FormRow>
                {num('timetable', 'periodsPerDay', t('acad.set.periodsPerDay'))}
                {num('timetable', 'periodMinutes', t('acad.set.periodMinutes'))}
                {num('timetable', 'maxPeriodsPerTeacherPerDay', t('acad.set.maxPerDay'))}
                {num('timetable', 'maxPeriodsPerTeacherPerWeek', t('acad.set.maxPerWeek'))}
              </FormRow>
              {flag('timetable', 'changeNeedsApproval', t('acad.set.changeNeedsApproval'))}
              {flag('timetable', 'substitutionNeedsApproval', t('acad.set.substitutionNeedsApproval'))}
            </div>
          ),
        },
        {
          id: 'registration',
          title: t('acad.set.registration'),
          description: t('acad.set.registrationHelp'),
          content: (
            <div className="grid gap-4">
              <FormRow>
                {num('registration', 'minCredits', t('acad.set.minCredits'))}
                {num('registration', 'maxCredits', t('acad.set.maxCredits'))}
                {num('registration', 'addDropDays', t('acad.set.addDropDays'))}
              </FormRow>
              {flag('registration', 'advisorApproval', t('acad.set.advisorApproval'))}
              {flag('registration', 'waitlist', t('acad.set.waitlist'))}
            </div>
          ),
        },
        {
          id: 'workload',
          title: t('acad.set.workload'),
          description: t('acad.set.workloadHelp'),
          content: (
            <div className="grid gap-4">
              <FormRow>{num('workload', 'defaultHoursPerWeek', t('acad.set.defaultHours'))}</FormRow>
              {v.workload.norms.map((n, i) => {
                const set = (p: Partial<typeof n>) => patch('workload', { norms: v.workload.norms.map((x, j) => (j === i ? { ...x, ...p } : x)) });
                return (
                  <FormRow key={i}>
                    <TextInput className="w-[260px]" label={t('acad.set.designation')} value={n.designation} onChange={(e) => set({ designation: e.target.value })} />
                    <TextInput className="w-[160px]" type="number" label={t('acad.set.hoursPerWeek')} value={String(n.hoursPerWeek)} onChange={(e) => set({ hoursPerWeek: Number(e.target.value) })} />
                    <Button variant="ghost" size="icon" aria-label={t('acad.remove')} onClick={() => patch('workload', { norms: v.workload.norms.filter((_, j) => j !== i) })}>
                      <Trash2 className="size-4" />
                    </Button>
                  </FormRow>
                );
              })}
              <div>
                <Button variant="outline" onClick={() => patch('workload', { norms: [...v.workload.norms, { designation: '', hoursPerWeek: v.workload.defaultHoursPerWeek }] })}>
                  <Plus className="size-4" /> {t('acad.set.addNorm')}
                </Button>
              </div>
            </div>
          ),
        },
      ]}
    />
  );
}
