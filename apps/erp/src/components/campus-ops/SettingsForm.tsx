'use client';

import { useState, useTransition } from 'react';
import { saveModuleSettings, type SettingsInput } from '@/app/(dashboard)/records/actions';
import { ModuleSettingsPage, NumberingSeriesField, type SettingsSection } from '@/components/templates';
import { SwitchField, TextInput, useToastOptional } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import { humanize } from '@/lib/campus-ops';

type Values = Record<string, string | number | boolean>;
type Part = 'rules' | 'templates' | 'defaults';

/** A module's rules, numbering series, message templates and defaults, saved together. */
export function SettingsForm({ module, initial }: { module: string; initial: SettingsInput & { updatedAt: string | null } }) {
  const { t } = useI18n();
  const toast = useToastOptional();
  const [v, setV] = useState<SettingsInput>(initial);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState('');
  const [saving, start] = useTransition();
  const tr = (key: string, fallback: string) => {
    const s = t(key as MessageKey);
    return s === key ? fallback : s;
  };
  const set = (part: Part, k: string, val: string | number | boolean) => {
    setV((x) => ({ ...x, [part]: { ...x[part], [k]: val } }));
    setDirty(true);
  };

  const fields = (part: Part, values: Values) => (
    <div className="grid gap-5 md:grid-cols-2">
      {Object.entries(values).map(([k, val]) => {
        const label = tr(`cops.set.${k}`, humanize(k));
        if (typeof val === 'boolean') return <SwitchField key={k} label={label} checked={val} onChange={(c) => set(part, k, c)} />;
        if (typeof val === 'number') return <TextInput key={k} type="number" label={label} value={String(val)} onChange={(e) => set(part, k, e.target.value === '' ? 0 : Number(e.target.value))} />;
        return <TextInput key={k} label={label} value={val} multiline={part === 'templates'} minRows={part === 'templates' ? 2 : undefined} className={part === 'templates' ? 'md:col-span-2' : undefined} onChange={(e) => set(part, k, e.target.value)} />;
      })}
    </div>
  );

  const series = Object.keys(v.numbering);
  const sections: SettingsSection[] = [
    { id: 'rules', kind: 'rules', content: fields('rules', v.rules) },
    {
      id: 'numbering',
      kind: 'numbering',
      content: series.length ? (
        <div className="grid gap-6">
          {series.map((k) => (
            <NumberingSeriesField
              key={k}
              label={tr(`cops.ser.${k}`, k)}
              value={v.numbering[k]}
              onChange={(s) => {
                setV((x) => ({ ...x, numbering: { ...x.numbering, [k]: { ...s, suffix: s.suffix ?? '' } } }));
                setDirty(true);
              }}
            />
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{t('cops.numberingNone')}</p>
      ),
    },
    { id: 'templates', kind: 'templates', content: fields('templates', v.templates) },
    { id: 'defaults', kind: 'defaults', content: fields('defaults', v.defaults) },
  ];

  const save = () =>
    start(async () => {
      setError('');
      if ([...Object.values(v.rules), ...Object.values(v.defaults)].some((x) => typeof x === 'number' && !Number.isFinite(x))) {
        setError(t('cops.badSetting'));
        return;
      }
      const res = await saveModuleSettings(module, v);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setDirty(false);
      toast?.show(t('cops.saved'));
    });

  return (
    <>
      {error && (
        <p role="alert" className="mb-4 text-sm text-destructive">
          {error}
        </p>
      )}
      <ModuleSettingsPage
        title={`${tr(`cops.m.${module}`, module)} · ${t('cops.settings')}`}
        subtitle={initial.updatedAt ? t('cops.lastSaved', { at: initial.updatedAt.slice(0, 16).replace('T', ' ') }) : undefined}
        sections={sections}
        onSave={save}
        saving={saving}
        dirty={dirty}
      />
    </>
  );
}
