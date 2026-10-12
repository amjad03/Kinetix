'use client';

import { cloneElement, useId, type ReactElement, type ReactNode } from 'react';
import { Checkbox, FormControlLabel, FormHelperText, MenuItem, Switch, TextField, type TextFieldProps } from '@/components/kx';
import { cn } from '@/lib/utils';

/**
 * The form field set. All of them show a visible label above the control (never only a placeholder),
 * link the helper and error text with aria-describedby, and mark required fields in words for
 * screen readers as well as with the asterisk.
 */

/** A label, a control and helper or error text, for controls with no built-in field (pickers, tag inputs). */
export function FormField({
  label,
  helper,
  error,
  required,
  id: given,
  children,
}: {
  label: string;
  helper?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  /** The control's own id when it sets one (an Autocomplete input), so the label points at it. */
  id?: string;
  /** One control; it receives id and aria props. */
  children: ReactElement<Record<string, unknown>>;
}) {
  const generated = useId();
  const id = given ?? generated;
  const hid = `${id}-h`;
  return (
    <div className="grid gap-1.5">
      <label id={`${id}-label`} htmlFor={id} className="text-[13px] leading-5 font-semibold">
        {label}
        {required && (
          <span aria-hidden className="ml-1 text-red-ink">
            *
          </span>
        )}
      </label>
      {cloneElement(children, { id, 'aria-describedby': error || helper ? hid : undefined, 'aria-invalid': error ? true : undefined, 'aria-required': required ? true : undefined })}
      {(error || helper) && (
        <FormHelperText id={hid} error={!!error} role={error ? 'alert' : undefined}>
          {error ?? helper}
        </FormHelperText>
      )}
    </div>
  );
}

/** An input and its button on one row: the button lines up with the control, not with the label above it. */
export function FieldRow({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-start gap-3 [&>button]:mt-[26px] [&>button]:shrink-0">{children}</div>;
}

export type TextInputProps = TextFieldProps & { helper?: ReactNode };

/** A single-line, multi-line or select input. Small by default: forms in an ERP are dense. */
export function TextInput({ helper, error, helperText, ...props }: TextInputProps) {
  return <TextField size="small" {...props} error={!!error} helperText={typeof error === 'string' ? error : (helper ?? helperText)} />;
}

export function SelectInput({ options, empty, ...props }: TextInputProps & { options: { value: string; label: string }[]; /** A leading "any" or "none" choice. */ empty?: string }) {
  return (
    <TextInput {...props} select>
      {empty !== undefined && <MenuItem value="">{empty}</MenuItem>}
      {options.map((o) => (
        <MenuItem key={o.value} value={o.value}>
          {o.label}
        </MenuItem>
      ))}
    </TextInput>
  );
}

export function CheckboxField({ label, checked, onChange, helper, disabled }: { label: ReactNode; checked: boolean; onChange: (v: boolean) => void; helper?: ReactNode; disabled?: boolean }) {
  const id = useId();
  return (
    <div>
      <FormControlLabel control={<Checkbox checked={checked} onChange={(_, c) => onChange(c)} disabled={disabled} aria-describedby={helper ? id : undefined} />} label={label} />
      {helper && (
        <FormHelperText id={id} className="ml-8">
          {helper}
        </FormHelperText>
      )}
    </div>
  );
}

export function SwitchField({ label, checked, onChange, disabled }: { label: ReactNode; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return <FormControlLabel control={<Switch checked={checked} onChange={(_, c) => onChange(c)} disabled={disabled} />} label={label} />;
}

const COLS = { 1: 'sm:grid-cols-1', 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-3' } as const;

/** A responsive grid of fields: one column on a phone, two from tablet up (or `cols`). */
export function FormGrid({ children, cols = 2 }: { children: ReactNode; cols?: 1 | 2 | 3 }) {
  return <div className={cn('grid grid-cols-1 gap-4', COLS[cols])}>{children}</div>;
}

/** The buttons under a form, right-aligned, wrapping on a phone. */
export function FormActions({ children }: { children: ReactNode }) {
  return <div className="mt-6 flex flex-wrap justify-end gap-2">{children}</div>;
}
