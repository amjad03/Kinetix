'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/shadcn/button';
import { Dialog, SelectInput } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import { fieldValue, type RecordMeta } from '@/lib/records';
import { FieldInput } from './RecordForm';
import { fieldText } from './text';

/**
 * Bulk edit: one field, one value, for every selected record. The values are checked once before anything is
 * saved; each record is then saved on its own and the report says which ones could not be.
 */
export function BulkEditDialog({ meta, count, onApply, onClose }: { meta: RecordMeta; count: number; onApply: (fields: Record<string, unknown>) => Promise<string | null>; onClose: () => void }) {
  const { t } = useI18n();
  const fields = meta.fields.filter((f) => f.bulk);
  const [key, setKey] = useState(fields[0]?.key ?? '');
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const field = fields.find((f) => f.key === key);
  const apply = () =>
    start(async () => {
      if (!field) return;
      setError(null);
      const err = await onApply({ [field.key]: fieldValue(field.type, value) });
      if (err) setError(err);
    });
  return (
    <Dialog
      title={t('rk.bulkEdit.title', { n: count })}
      busy={pending}
      onClose={onClose}
      actions={
        <>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            {t('common.cancel')}
          </Button>
          <Button onClick={apply} disabled={pending || !field || (field.required && value === '')} data-testid="bulk-edit-apply">
            {t('rk.bulkEdit.apply', { n: count })}
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <p className="m-0 text-[13px] text-muted-foreground">{t('rk.bulkEdit.help')}</p>
        {error && (
          <p role="alert" className="m-0 rounded-md border border-red-soft bg-red-soft/40 px-3 py-2 text-[13px] text-red-ink">
            {error}
          </p>
        )}
        <SelectInput
          label={t('rk.bulkEdit.field')}
          value={key}
          onChange={(e) => {
            setKey(String(e.target.value));
            setValue('');
          }}
          options={fields.map((f) => ({ value: f.key, label: fieldText(t, meta.key, f) }))}
          data-testid="bulk-edit-field"
        />
        {field && <FieldInput key={field.key} entity={meta.key} field={{ ...field, required: false }} value={value} onChange={setValue} />}
      </div>
    </Dialog>
  );
}
