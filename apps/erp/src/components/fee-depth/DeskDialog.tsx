'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition, type ReactNode } from 'react';
import { deskSend } from '@/app/(dashboard)/accounts/actions';
import type { FieldSpec } from '@/components/fee-desk/DeskAction';
import { Button } from '@/components/shadcn/button';
import { Dialog, FormGrid, SelectInput, TextInput, useToastOptional } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';

/**
 * A dialog that sends one fees or accounts request with the fields typed in it (rupee fields go as paise), opened
 * from a row's menu or a button. Fields keep their labels as i18n keys.
 */
export function DeskDialog({
  title,
  path,
  fields,
  fixed = {},
  method = 'POST',
  submit,
  done,
  intro,
  onClose,
  onDone,
}: {
  title: string;
  path: string;
  fields: FieldSpec[];
  fixed?: Record<string, unknown>;
  method?: 'POST' | 'PUT' | 'PATCH';
  submit?: string;
  /** i18n key of the toast after success. */
  done?: string;
  intro?: ReactNode;
  onClose: () => void;
  onDone?: (data: unknown) => void;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const toast = useToastOptional();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const formId = `dd-${path.replace(/\W/g, '')}`;

  const run = (form: FormData) =>
    start(async () => {
      const body: Record<string, unknown> = { ...fixed };
      for (const f of fields) {
        const raw = String(form.get(f.name) ?? '').trim();
        if (raw === '') continue;
        body[f.name] = f.kind === 'money' ? Math.round(Number(raw.replace(/[₹,\s]/g, '')) * 100) : f.kind === 'number' ? Number(raw) : f.kind === 'bool' ? raw === 'yes' : raw;
      }
      const res = await deskSend(path, body, method);
      if (!res.ok) return setError(res.error);
      toast?.success(t((done ?? 'fd.saved') as MessageKey));
      onDone?.(res.data);
      onClose();
      router.refresh();
    });

  return (
    <Dialog
      title={title}
      size="sm"
      busy={pending}
      onClose={onClose}
      actions={
        <>
          <Button variant="outline" className="h-10" onClick={onClose} disabled={pending}>
            {t('fd.cancel')}
          </Button>
          <Button className="h-10" type="submit" form={formId} disabled={pending}>
            {submit ?? t('fd.confirm')}
          </Button>
        </>
      }
    >
      <form
        id={formId}
        onSubmit={(e) => {
          e.preventDefault();
          run(new FormData(e.currentTarget));
        }}
      >
        {intro && <div className="mb-4 text-sm text-muted-foreground">{intro}</div>}
        <FormGrid cols={1}>
          {fields.map((f) =>
            f.kind === 'bool' ? (
              <SelectInput key={f.name} name={f.name} label={t(f.label as MessageKey)} defaultValue={f.defaultValue ?? 'no'} options={[{ value: 'no', label: t('fd.no') }, { value: 'yes', label: t('fd.yes') }]} />
            ) : f.kind === 'select' ? (
              <SelectInput key={f.name} name={f.name} label={t(f.label as MessageKey)} defaultValue={f.defaultValue ?? f.options?.[0]?.value ?? ''} options={f.options ?? []} required={f.required} />
            ) : (
              <TextInput
                key={f.name}
                name={f.name}
                label={t(f.label as MessageKey)}
                type={f.kind === 'date' ? 'date' : f.kind === 'number' ? 'number' : 'text'}
                multiline={f.kind === 'textarea'}
                minRows={f.kind === 'textarea' ? 3 : undefined}
                defaultValue={f.defaultValue}
                required={f.required}
                inputProps={f.kind === 'money' ? { inputMode: 'decimal' } : undefined}
              />
            ),
          )}
        </FormGrid>
        {error && (
          <p role="alert" className="mt-4 text-sm text-destructive">
            {error}
          </p>
        )}
      </form>
    </Dialog>
  );
}
