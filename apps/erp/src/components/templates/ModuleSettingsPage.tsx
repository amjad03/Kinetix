'use client';

import type { ReactNode } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/shadcn/button';
import { Card, FormRow, TextInput } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import { formatSeries, type NumberingSeries } from '@/lib/templates';

export interface SettingsSection {
  id: string;
  /** The standard sections get their title from the dictionary; anything else passes `title`. */
  kind?: 'rules' | 'numbering' | 'templates' | 'defaults';
  title?: string;
  description?: ReactNode;
  content: ReactNode;
}

const TITLE = { rules: 'tpl.rules', numbering: 'tpl.numbering', templates: 'tpl.templates', defaults: 'tpl.defaults' } as const;

/** One numbering series: prefix, next number, padding and suffix, with a live preview. */
export function NumberingSeriesField({ label, value, onChange }: { label: string; value: NumberingSeries; onChange: (v: NumberingSeries) => void }) {
  const { t } = useI18n();
  return (
    <fieldset className="grid gap-2">
      <legend className="text-sm font-semibold">{label}</legend>
      <FormRow>
        <TextInput className="w-[200px]" label={t('tpl.prefix')} value={value.prefix} onChange={(e) => onChange({ ...value, prefix: e.target.value })} helperText="{FY}, {YY}, {YYYY}" />
        <TextInput className="w-[120px]" type="number" label={t('tpl.next')} value={String(value.next)} onChange={(e) => onChange({ ...value, next: Number(e.target.value) || 0 })} />
        <TextInput className="w-[100px]" type="number" label={t('tpl.digits')} value={String(value.pad)} onChange={(e) => onChange({ ...value, pad: Number(e.target.value) || 1 })} />
        <TextInput className="w-[120px]" label={t('tpl.suffix')} value={value.suffix ?? ''} onChange={(e) => onChange({ ...value, suffix: e.target.value })} />
        <p className="font-mono text-sm" aria-live="polite">
          {formatSeries(value)}
        </p>
      </FormRow>
    </fieldset>
  );
}

/**
 * ModuleSettingsPage (docs/product/ERP_UI_PATTERNS.md): a module's configuration in sections —
 * Rules, Numbering series, Templates, Defaults — with a section index on wide screens and one save
 * bar. Each section's `content` is the module's own fields; `onSave` runs the server action.
 */
export function ModuleSettingsPage({
  title,
  subtitle,
  sections,
  onSave,
  saving,
  dirty = true,
}: {
  title: string;
  subtitle?: ReactNode;
  sections: SettingsSection[];
  onSave?: () => void;
  saving?: boolean;
  dirty?: boolean;
}) {
  const { t } = useI18n();
  const name = (s: SettingsSection) => s.title ?? (s.kind ? t(TITLE[s.kind]) : s.id);
  return (
    <div className="grid gap-6" data-testid="module-settings">
      <PageHeader
        title={title}
        subtitle={subtitle}
        actions={
          onSave && (
            <Button className="h-10" onClick={onSave} disabled={saving || !dirty}>
              {t('tpl.save')}
            </Button>
          )
        }
      />
      <div className="grid gap-6 lg:grid-cols-[200px_minmax(0,1fr)]">
        <nav aria-label={title} className="hidden lg:block">
          <ul className="sticky top-32 grid gap-1">
            {sections.map((s) => (
              <li key={s.id}>
                <a href={`#set-${s.id}`} className="block rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground">
                  {name(s)}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="grid min-w-0 gap-6">
          {sections.map((s) => (
            <section key={s.id} id={`set-${s.id}`} className="scroll-mt-32">
              <Card title={name(s)} subtitle={s.description}>
                {s.content}
              </Card>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
