'use client';
import { useState, useTransition } from 'react';
import { saveAttendanceRules, saveProfile } from '@/app/(dashboard)/settings/institution/actions';
import { SectionTitle } from '@/components/PageHeader';
import { Card, FormActions, FormGrid, SelectInput, SwitchField, TextInput, useToast } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import { ACADEMIC_MODELS, NAAC_GRADES, orNull, type AttendanceRules, type InstitutionProfile } from '@/lib/institution';

import { Alert, Button } from '@/components/kx';
type Text = 'legalName' | 'affiliationBody' | 'affiliationNo' | 'aisheCode' | 'addressLine' | 'city' | 'state' | 'pincode' | 'phone' | 'email' | 'website' | 'boardOrUniversity';
const TEXT_FIELDS: Text[] = ['legalName', 'affiliationBody', 'affiliationNo', 'aisheCode', 'addressLine', 'city', 'state', 'pincode', 'phone', 'email', 'website', 'boardOrUniversity'];

/** Settings > Institution profile: details, academic model, module toggles and attendance rules. */
export function InstitutionAdmin({ initial, rules }: { initial: InstitutionProfile; rules: AttendanceRules }) {
  const { t } = useI18n();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState<Record<Text, string>>(() => Object.fromEntries(TEXT_FIELDS.map((k) => [k, initial[k] ?? ''])) as Record<Text, string>);
  const [naac, setNaac] = useState(initial.naacGrade ?? '');
  const [year, setYear] = useState(initial.establishedYear ? String(initial.establishedYear) : '');
  const [model, setModel] = useState(initial.academicModel ?? 'school');
  const [off, setOff] = useState<string[]>(initial.disabledModules ?? []);
  const [lock, setLock] = useState(rules.attendanceLockHours === null ? '' : String(rules.attendanceLockHours));
  const [pct, setPct] = useState(String(rules.attendanceThresholdPct));

  const done = (ok: boolean, err?: string) => {
    setError(ok ? null : (err ?? null));
    if (ok) toast.success(t('inst.saved'));
  };
  const saveAll = () =>
    start(async () => {
      const res = await saveProfile({
        ...Object.fromEntries(TEXT_FIELDS.map((k) => [k, orNull(text[k])])),
        naacGrade: orNull(naac),
        establishedYear: year.trim() ? Number(year) : null,
        academicModel: model,
        disabledModules: off,
      });
      if (!res.ok) return done(false, res.error);
      const r = await saveAttendanceRules({ attendanceLockHours: lock.trim() === '' ? null : Number(lock), attendanceThresholdPct: Number(pct) });
      done(r.ok, r.ok ? undefined : r.error);
    });

  const modules = initial.toggleableModules;
  return (
    <div data-testid="institution-admin" aria-busy={pending}>
      {error && (
        <Alert className="mb-4" severity="error">
          {error}
        </Alert>
      )}
      <SectionTitle>{t('inst.profile')}</SectionTitle>
      <Card className="mb-6">
        <FormGrid cols={2}>
          {TEXT_FIELDS.filter((k) => k !== 'boardOrUniversity').map((k) => (
            <TextInput key={k} label={t(`inst.f.${k}` as MessageKey)} value={text[k]} onChange={(e) => setText({ ...text, [k]: e.target.value })} />
          ))}
          <SelectInput label={t('inst.f.naacGrade')} value={naac} empty={t('inst.none')} options={NAAC_GRADES.map((g) => ({ value: g, label: g }))} onChange={(e) => setNaac(e.target.value)} />
          <TextInput label={t('inst.f.establishedYear')} value={year} inputMode="numeric" onChange={(e) => setYear(e.target.value.replace(/\D/g, '').slice(0, 4))} />
        </FormGrid>
      </Card>

      <SectionTitle>{t('inst.capability')}</SectionTitle>
      <Card className="mb-6">
        <FormGrid cols={2}>
          <SelectInput label={t('inst.f.academicModel')} value={model} options={ACADEMIC_MODELS.map((m) => ({ value: m, label: t(`inst.model.${m}` as MessageKey) }))} onChange={(e) => setModel(e.target.value as typeof model)} />
          <TextInput label={t('inst.f.boardOrUniversity')} value={text.boardOrUniversity} onChange={(e) => setText({ ...text, boardOrUniversity: e.target.value })} />
        </FormGrid>
        <p className="text-[13px] leading-[19px] text-muted-foreground mt-4 mb-2">
          {t('inst.modules.help')}
        </p>
        <div className="flex-col grid grid-cols-[1fr] sm:grid-cols-[1fr_1fr] md:grid-cols-[1fr_1fr_1fr] gap-x-6">
          {modules.map((m) => (
            <SwitchField key={m} label={t(`inst.mod.${m}` as MessageKey)} checked={!off.includes(m)} onChange={(on) => setOff(on ? off.filter((x) => x !== m) : [...off, m])} />
          ))}
        </div>
      </Card>

      <SectionTitle>{t('inst.attendance')}</SectionTitle>
      <Card className="mb-6">
        <FormGrid cols={2}>
          <TextInput label={t('inst.f.lockHours')} helper={t('inst.f.lockHours.help')} value={lock} inputMode="numeric" onChange={(e) => setLock(e.target.value.replace(/\D/g, '').slice(0, 3))} />
          <TextInput label={t('inst.f.threshold')} value={pct} inputMode="numeric" onChange={(e) => setPct(e.target.value.replace(/\D/g, '').slice(0, 3))} />
        </FormGrid>
      </Card>
      <FormActions>
        <Button variant="contained" onClick={saveAll} disabled={pending} data-testid="institution-save">
          {t('inst.save')}
        </Button>
      </FormActions>
    </div>
  );
}
