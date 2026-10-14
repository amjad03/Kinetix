'use client';

import { useState, useTransition } from 'react';
import { createRecord, updateRecord } from '@/app/(dashboard)/records-actions';
import { Button } from '@/components/shadcn/button';
import { CheckboxField, Dialog, FormGrid, SelectInput, TextInput } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import { fieldValue, type RecordField, type RecordMeta, type Row } from '@/lib/records';
import { fieldText, options, tr } from './text';

/** One field's input, by its type: text, email, phone, number, date, long text, a choice or a yes/no. */
export function FieldInput({ entity, field, value, onChange, autoFocus }: { entity: string; field: RecordField; value: string; onChange: (v: string) => void; autoFocus?: boolean }) {
  const { t } = useI18n();
  const label = fieldText(t, entity, field);
  if (field.type === 'boolean') return <CheckboxField label={label} checked={value === 'true'} onChange={(v) => onChange(String(v))} />;
  if (field.type === 'select') {
    const opts = options(t, entity, field.key, field.options).map((o) => ({ value: o.value, label: o.group && !o.label.includes(o.group) ? `${o.group} · ${o.label}` : o.label }));
    return (
      <SelectInput
        label={label}
        required={field.required}
        value={value}
        onChange={(e) => onChange(String(e.target.value))}
        options={opts}
        empty={field.required ? undefined : t('rk.none')}
        autoFocus={autoFocus}
        data-testid={`field-${field.key}`}
      />
    );
  }
  return (
    <TextInput
      label={label}
      required={field.required}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : field.type === 'email' ? 'email' : field.type === 'phone' ? 'tel' : 'text'}
      multiline={field.type === 'textarea'}
      autoFocus={autoFocus}
      inputProps={{ 'data-testid': `field-${field.key}` }}
    />
  );
}

const asText = (v: unknown) => (v === null || v === undefined ? '' : String(v));

/**
 * Add or edit a record from the entity's own field list (GET /v1/records/:entity/meta). Only changed fields are sent
 * on edit, so the history shows exactly what the person changed.
 */
export function RecordForm({ meta, row, title, onClose, onSaved, defaults }: { meta: RecordMeta; row?: Row; title: string; onClose: () => void; onSaved: (row: Row) => void; /** Starting values of a new record (the list's own context, e.g. the person whose record it is). */ defaults?: Record<string, string> }) {
  const { t } = useI18n();
  const editing = !!row;
  const fields = meta.fields.filter((f) => (editing ? f.edit : f.create));
  const initial = Object.fromEntries(fields.map((f) => [f.key, row ? asText(row[f.rowKey]) : (defaults?.[f.key] ?? (f.type === 'boolean' ? 'false' : ''))]));
  const [values, setValues] = useState<Record<string, string>>(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const submit = () =>
    start(async () => {
      setError(null);
      const changed = fields.filter((f) => !editing || values[f.key] !== initial[f.key]);
      if (editing && !changed.length) return onClose();
      const body = Object.fromEntries(changed.filter((f) => editing || values[f.key] !== '' || f.required).map((f) => [f.key, fieldValue(f.type, values[f.key])]));
      const res = editing ? await updateRecord(meta.key, row!.id, body) : await createRecord(meta.key, body);
      if (!res.ok) return setError(res.error);
      onSaved(res.data);
    });

  return (
    <Dialog
      title={title}
      size="md"
      busy={pending}
      onClose={onClose}
      actions={
        <>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            {t('common.cancel')}
          </Button>
          <Button onClick={submit} disabled={pending} data-testid="record-save">
            {editing ? t('rk.save') : t('rk.add')}
          </Button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="grid gap-4"
      >
        {error && (
          <p role="alert" className="rounded-md border border-red-soft bg-red-soft/40 px-3 py-2 text-[13px] text-red-ink">
            {error}
          </p>
        )}
        <FormGrid>
          {fields.map((f, i) => (
            <div key={f.key} className={f.type === 'textarea' ? 'sm:col-span-2' : undefined}>
              <FieldInput entity={meta.key} field={f} value={values[f.key] ?? ''} onChange={(v) => setValues((s) => ({ ...s, [f.key]: v }))} autoFocus={i === 0} />
              {f.help && <p className="mt-1 text-xs text-muted-foreground">{tr(t, `rk.help.${meta.key}.${f.key}`, f.help)}</p>}
            </div>
          ))}
        </FormGrid>
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}
