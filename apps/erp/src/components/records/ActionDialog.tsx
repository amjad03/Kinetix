'use client';

import { useState, type ReactNode } from 'react';
import { Button } from '@/components/shadcn/button';
import { Input } from '@/components/shadcn/input';
import { FormField, SelectInput, TextInput } from '@/components/ui';
import { Dialog } from '@/components/ui/Dialog';
import { useI18n } from '@/i18n/client';

/** A value a module action asks for before it runs (a reason, a template, who signed for a return). */
export interface ActionParam {
  key: string;
  label: string;
  type?: 'text' | 'textarea' | 'select' | 'date';
  required?: boolean;
  options?: { value: string; label: string }[];
  help?: string;
  /** Shortest acceptable text (a written reason is at least three characters). */
  min?: number;
}

/**
 * Confirms a module action and collects its parameters. A dangerous action on many records asks for the count to be
 * typed, like a bulk delete.
 */
export function ActionDialog({
  title,
  confirmLabel,
  tone,
  count,
  params,
  busy,
  children,
  onConfirm,
  onClose,
}: {
  title: string;
  confirmLabel: string;
  tone?: 'danger';
  count: number;
  params: ActionParam[];
  busy?: boolean;
  children?: ReactNode;
  onConfirm: (params: Record<string, string>) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [values, setValues] = useState<Record<string, string>>({});
  const [typed, setTyped] = useState('');
  const needsCount = tone === 'danger' && count > 1;
  const filled = params.every((p) => !p.required || (values[p.key] ?? '').trim().length >= (p.min ?? 1));
  const ready = filled && (!needsCount || typed.trim() === String(count));
  const set = (k: string, v: string) => setValues((x) => ({ ...x, [k]: v }));
  const submit = () => {
    if (!ready || busy) return;
    onConfirm(Object.fromEntries(Object.entries(values).filter(([, v]) => v.trim() !== '').map(([k, v]) => [k, v.trim()])));
  };
  return (
    <Dialog
      title={title}
      onClose={onClose}
      busy={busy}
      actions={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            {t('common.cancel')}
          </Button>
          <Button variant={tone === 'danger' ? 'destructive' : 'default'} onClick={submit} disabled={!ready || busy} data-testid="confirm">
            {confirmLabel}
          </Button>
        </>
      }
    >
      <form
        className="grid gap-4 text-[14px] leading-6"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        {children}
        {params.map((p) =>
          p.type === 'select' ? (
            <FormField key={p.key} label={p.label} required={p.required} helper={p.help}>
              <SelectInput value={values[p.key] ?? ''} onChange={(e) => set(p.key, e.target.value)} options={p.options ?? []} empty={p.required ? undefined : '—'} fullWidth />
            </FormField>
          ) : (
            <FormField key={p.key} label={p.label} required={p.required} helper={p.help}>
              <TextInput
                value={values[p.key] ?? ''}
                onChange={(e) => set(p.key, e.target.value)}
                type={p.type === 'date' ? 'date' : 'text'}
                multiline={p.type === 'textarea'}
                minRows={p.type === 'textarea' ? 2 : undefined}
                fullWidth
                slotProps={{ htmlInput: { maxLength: 500 } }}
              />
            </FormField>
          ),
        )}
        {needsCount && (
          <label className="grid gap-1.5">
            <span className="text-[13px] font-semibold">{t('rk.confirm.type', { word: String(count) })}</span>
            <Input value={typed} onChange={(e) => setTyped(e.target.value)} inputMode="numeric" autoComplete="off" />
          </label>
        )}
        <button type="submit" hidden aria-hidden tabIndex={-1} />
      </form>
    </Dialog>
  );
}
