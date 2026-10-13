'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { saveModuleSettings } from '@/app/(dashboard)/quality/actions';
import { TextField } from '@/components/kx';
import { ModuleSettingsPage, NumberingSeriesField, type SettingsSection } from '@/components/templates';
import { FormGrid, SelectInput, SwitchField, TextInput, useToastOptional } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import type { QhSettings, QhSettingsView, RuleDef } from '@/lib/quality-hub';

const k = (key: string) => `qh.s.${key}` as MessageKey;

/**
 * A module's settings on the ModuleSettingsPage template: numbering series, rules, message templates
 * and defaults from the module's catalogue. Read-only for roles that may not change them.
 */
export function QualitySettings({ view }: { view: QhSettingsView }) {
  const { t, fmt } = useI18n();
  const router = useRouter();
  const toast = useToastOptional();
  const [s, setS] = useState<QhSettings>(view.settings);
  const [dirty, setDirty] = useState(false);
  const [saving, start] = useTransition();
  const edit = (next: QhSettings) => {
    setS(next);
    setDirty(true);
  };
  const ro = !view.canEdit;

  const ruleField = (group: 'rules' | 'defaults', d: RuleDef) => {
    const v = s[group][d.key];
    const set = (x: number | boolean | string) => edit({ ...s, [group]: { ...s[group], [d.key]: x } });
    if (d.kind === 'boolean') return <SwitchField key={d.key} label={t(k(d.key))} checked={Boolean(v)} onChange={set} disabled={ro} />;
    if (d.kind === 'choice')
      return <SelectInput key={d.key} label={t(k(d.key))} value={String(v)} disabled={ro} onChange={(e) => set(e.target.value)} options={(d.choices ?? []).map((c) => ({ value: c, label: t(`qh.c.${c}` as MessageKey) }))} />;
    return (
      <TextInput
        key={d.key}
        type="number"
        label={t(k(d.key))}
        value={String(v)}
        disabled={ro}
        helperText={t('qh.range', { min: fmt.number(d.min ?? 0), max: fmt.number(d.max ?? 0) })}
        slotProps={{ htmlInput: { min: d.min, max: d.max } }}
        onChange={(e) => set(Number(e.target.value))}
      />
    );
  };

  const c = view.catalogue;
  const sections: SettingsSection[] = [];
  if (c.rules.length) sections.push({ id: 'rules', kind: 'rules', description: t('qh.rulesHelp'), content: <FormGrid>{c.rules.map((d) => ruleField('rules', d))}</FormGrid> });
  if (Object.keys(c.numbering).length)
    sections.push({
      id: 'numbering',
      kind: 'numbering',
      description: t('qh.numberingHelp'),
      content: (
        <div className="grid gap-6">
          {Object.keys(c.numbering).map((key) => (
            <NumberingSeriesField key={key} label={t(k(key))} value={s.numbering[key] ?? c.numbering[key]} onChange={(v) => !ro && edit({ ...s, numbering: { ...s.numbering, [key]: v } })} />
          ))}
        </div>
      ),
    });
  if (Object.keys(c.templates).length)
    sections.push({
      id: 'templates',
      kind: 'templates',
      description: t('qh.templatesHelp'),
      content: (
        <div className="grid gap-5">
          {Object.keys(c.templates).map((key) => (
            <TextField key={key} label={t(k(key))} multiline minRows={2} disabled={ro} value={s.templates[key] ?? ''} onChange={(e) => edit({ ...s, templates: { ...s.templates, [key]: e.target.value } })} />
          ))}
        </div>
      ),
    });
  if (c.defaults.length) sections.push({ id: 'defaults', kind: 'defaults', description: t('qh.defaultsHelp'), content: <FormGrid>{c.defaults.map((d) => ruleField('defaults', d))}</FormGrid> });

  const save = () =>
    start(async () => {
      const res = await saveModuleSettings(view.module, s);
      if (!res.ok) {
        toast?.error(res.error);
        return;
      }
      toast?.success(t('qh.saved'));
      setDirty(false);
      router.refresh();
    });

  return (
    <ModuleSettingsPage
      title={t('qh.settingsTitle', { module: t(`qh.mod.${view.module}` as MessageKey) })}
      subtitle={view.updatedAt ? t('qh.lastSaved', { who: view.updatedBy ?? '-', when: fmt.dateTime(view.updatedAt) }) : t(ro ? 'qh.readOnly' : 'qh.usingDefaults')}
      sections={sections}
      onSave={ro ? undefined : save}
      saving={saving}
      dirty={dirty}
    />
  );
}
