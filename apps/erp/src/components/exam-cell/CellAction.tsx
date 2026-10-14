'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition, type ReactNode } from 'react';
import { runCell } from '@/app/(dashboard)/exams/cell/actions';
import { Button } from '@/components/kx';
import { Dialog, FormField, TextInput, useToast } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import { fillPath, formBody, type Field } from '@/lib/depth';

import { Alert, MenuItem } from '@/components/kx';

/** One input of an action's form (text, number, rupees, date, choice, yes/no, long text). */
export function CellField({ f, value, onChange }: { f: Field; value: string; onChange: (v: string) => void }) {
  const { t } = useI18n();
  const common = { value, onChange: (e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value), required: f.required, fullWidth: true, slotProps: { htmlInput: { 'data-testid': `field-${f.name}` } } };
  const input = (() => {
    switch (f.type) {
      case 'select':
        return (
          <TextInput select {...common}>
            <MenuItem value="">{t('dx.choose')}</MenuItem>
            {(f.options ?? []).map((o) => (
              <MenuItem key={o.value} value={o.value}>
                {o.label}
              </MenuItem>
            ))}
          </TextInput>
        );
      case 'bool':
        return (
          <TextInput select {...common}>
            <MenuItem value="true">{t('dx.yes')}</MenuItem>
            <MenuItem value="false">{t('dx.no')}</MenuItem>
          </TextInput>
        );
      case 'textarea':
      case 'lines':
        return <TextInput multiline minRows={f.type === 'lines' ? 3 : 2} {...common} />;
      case 'date':
        return <TextInput type="date" {...common} />;
      case 'datetime':
        return <TextInput type="datetime-local" {...common} />;
      case 'number':
      case 'paise':
        return <TextInput type="number" {...common} slotProps={{ htmlInput: { step: 'any', min: 0, 'data-testid': `field-${f.name}` } }} />;
      default:
        return <TextInput {...common} />;
    }
  })();
  return (
    <FormField label={f.label} required={f.required} helper={f.hint}>
      {input}
    </FormField>
  );
}

export interface CellActionSpec {
  /** The button and dialog title. */
  label: string;
  path: string;
  method?: 'POST' | 'PUT';
  fields?: Field[];
  /** Fixed values sent with the form. */
  extra?: Record<string, unknown>;
  /** Fields that fill `{name}` in the path instead of going in the body (default: every `{name}` the path has). */
  pathFields?: string[];
  /** Asked before sending when there are no fields. */
  confirm?: string;
  /** Shown above the fields. */
  intro?: ReactNode;
  /** The words of the success message (default "Saved"). */
  done?: string;
  tone?: 'primary' | 'danger';
}

const initial = (fields: Field[]) => Object.fromEntries(fields.map((f) => [f.name, f.initial ?? '']));

/**
 * Runs an exam cell action: straight away (after a confirmation when asked), or through a dialog that asks for its
 * fields first. The page refreshes afterwards; errors are shown in the dialog.
 */
export function useCellAction(onDone?: (data: Record<string, unknown>) => void) {
  const { t } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const [spec, setSpec] = useState<CellActionSpec | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();

  const send = (s: CellActionSpec, body: Record<string, unknown>) =>
    start(async () => {
      setError(null);
      const res = await runCell(s.method ?? 'POST', s.path, body);
      if (!res.ok) {
        if (s.fields?.length) setError(res.error);
        else toast.error(res.error);
        return;
      }
      setSpec(null);
      toast.success(s.done ?? t('dx.saved'));
      onDone?.(res.data);
      router.refresh();
    });

  const open = (s: CellActionSpec) => {
    if (!s.fields?.length) {
      if (s.confirm && !window.confirm(s.confirm)) return;
      send(s, s.extra ?? {});
      return;
    }
    setValues(initial(s.fields));
    setError(null);
    setSpec(s);
  };

  const submit = () => {
    if (!spec) return;
    const inPath = spec.pathFields ?? [...spec.path.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
    if (inPath.some((name) => !(values[name] ?? '').trim())) return setError(t('dx.badValue', { field: spec.fields?.find((f) => inPath.includes(f.name) && !(values[f.name] ?? '').trim())?.label ?? '' }));
    const built = formBody(spec.fields ?? [], values, spec.extra ?? {}, inPath);
    if ('error' in built) return setError(t('dx.badValue', { field: spec.fields?.find((f) => f.name === built.error)?.label ?? built.error }));
    send({ ...spec, path: fillPath(spec.path, values) }, built.body);
  };

  const dialog = spec ? (
    <Dialog
      title={spec.label}
      onClose={() => setSpec(null)}
      busy={busy}
      actions={
        <>
          <Button onClick={() => setSpec(null)} disabled={busy}>
            {t('dx.cancel')}
          </Button>
          <Button variant="contained" color={spec.tone === 'danger' ? 'error' : 'primary'} onClick={submit} disabled={busy} data-testid="cell-action-submit">
            {spec.label}
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-3 pt-1"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        {spec.intro && <div className="text-[13px] leading-[19px] text-muted-foreground">{spec.intro}</div>}
        {spec.fields!.map((f) => (
          <CellField key={f.name} f={f} value={values[f.name] ?? ''} onChange={(v) => setValues((x) => ({ ...x, [f.name]: v }))} />
        ))}
        {error && (
          <Alert severity="error" role="alert">
            {error}
          </Alert>
        )}
      </form>
    </Dialog>
  ) : null;

  return { open, dialog, busy };
}

/** A button that runs one exam cell action. */
export function CellActionButton({ spec, variant = 'outlined', disabled, onDone, testId }: { spec: CellActionSpec; variant?: 'outlined' | 'contained' | 'text'; disabled?: boolean; onDone?: (data: Record<string, unknown>) => void; testId?: string }) {
  const { open, dialog, busy } = useCellAction(onDone);
  return (
    <>
      <Button variant={variant} color={spec.tone === 'danger' ? 'error' : 'primary'} disabled={disabled || busy} onClick={() => open(spec)} data-testid={testId}>
        {spec.label}
      </Button>
      {dialog}
    </>
  );
}
