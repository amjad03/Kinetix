'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { deskSend } from '@/app/(dashboard)/accounts/actions';
import { Button } from '@/components/shadcn/button';
import { Dialog, FormGrid, SelectInput, TextInput, useToastOptional } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import { useWord } from './SpecTable';

export interface FieldSpec {
  name: string;
  /** i18n key. */
  label: string;
  kind?: 'text' | 'money' | 'date' | 'select' | 'textarea' | 'number';
  options?: { value: string; label: string }[];
  required?: boolean;
  defaultValue?: string;
}

/**
 * A button that sends one desk request, asking for fields in a dialog first when there are any.
 * Money fields are typed in rupees and sent as paise; `fixed` is merged into the body as is.
 */
export function DeskAction({
  label,
  path,
  fields = [],
  fixed = {},
  variant = 'default',
  done,
  goTo,
  method = 'POST',
}: {
  label: string;
  path: string;
  fields?: FieldSpec[];
  fixed?: Record<string, unknown>;
  variant?: 'default' | 'outline' | 'destructive' | 'secondary';
  /** i18n key of the toast after success. */
  done?: string;
  /** Where to go afterwards: a pattern with {id} from the response. */
  goTo?: string;
  method?: 'POST' | 'PUT' | 'PATCH';
}) {
  const { t } = useI18n();
  const router = useRouter();
  const toast = useToastOptional();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const word = useWord();

  const run = (form?: FormData) =>
    start(async () => {
      const body: Record<string, unknown> = { ...fixed };
      for (const f of fields) {
        const raw = String(form?.get(f.name) ?? '').trim();
        if (raw === '') continue;
        body[f.name] = f.kind === 'money' ? Math.round(Number(raw) * 100) : f.kind === 'number' ? Number(raw) : raw;
      }
      const res = await deskSend<{ id?: string }>(path, body, method);
      if (!res.ok) return setError(res.error);
      setOpen(false);
      setError(null);
      toast?.success(t((done ?? 'fd.saved') as MessageKey));
      if (goTo && res.data?.id) router.push(goTo.replace('{id}', res.data.id));
      else router.refresh();
    });

  if (fields.length === 0)
    return (
      <span className="inline-flex flex-col gap-1">
        <Button className="h-10" variant={variant} disabled={pending} onClick={() => run()}>
          {label}
        </Button>
        {error && <span className="text-xs text-destructive">{error}</span>}
      </span>
    );

  return (
    <>
      <Button className="h-10" variant={variant} onClick={() => setOpen(true)}>
        {label}
      </Button>
      {open && (
        <Dialog
          title={label}
          size="sm"
          busy={pending}
          onClose={() => setOpen(false)}
          actions={
            <>
              <Button variant="outline" className="h-10" onClick={() => setOpen(false)} disabled={pending}>
                {t('fd.cancel')}
              </Button>
              <Button className="h-10" type="submit" form={`fd-${path}`} disabled={pending}>
                {t('fd.confirm')}
              </Button>
            </>
          }
        >
          <form
            id={`fd-${path}`}
            onSubmit={(e) => {
              e.preventDefault();
              run(new FormData(e.currentTarget));
            }}
          >
            <FormGrid>
              {fields.map((f) =>
                f.kind === 'select' ? (
                  <SelectInput key={f.name} name={f.name} label={t(f.label as MessageKey)} defaultValue={f.defaultValue ?? f.options?.[0]?.value ?? ''} options={(f.options ?? []).map((o) => ({ value: o.value, label: o.label === o.value ? word(o.value) : o.label }))} required={f.required} />
                ) : (
                  <TextInput
                    key={f.name}
                    name={f.name}
                    label={t(f.label as MessageKey)}
                    type={f.kind === 'date' ? 'date' : f.kind === 'money' || f.kind === 'number' ? 'number' : 'text'}
                    multiline={f.kind === 'textarea'}
                    minRows={f.kind === 'textarea' ? 3 : undefined}
                    defaultValue={f.defaultValue}
                    required={f.required}
                    inputProps={f.kind === 'money' ? { min: 0, step: '0.01' } : undefined}
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
      )}
    </>
  );
}
