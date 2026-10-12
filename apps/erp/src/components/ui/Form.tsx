'use client';

import { cloneElement, useId, type HTMLAttributes, type ReactElement, type ReactNode } from 'react';
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

/**
 * Inputs and their buttons on one row (FormRow pattern, docs/product/ERP_UI_PATTERNS.md).
 * Controls and buttons share one 40px height, and buttons line up with the control, not with the
 * label above it (the label row is 20px + 6px gap, so a labelled row pushes direct buttons, links,
 * text and checkboxes down by 26px). Helper text under a field does not move the buttons.
 * `labelled={false}` for rows whose fields have no visible label (toolbars, search boxes).
 */
export function FormRow({
  children,
  labelled = true,
  component: Tag = 'div',
  className,
  ...rest
}: { children: ReactNode; labelled?: boolean; component?: 'div' | 'form'; className?: string } & Omit<HTMLAttributes<HTMLElement>, 'children'> & { method?: string; action?: string }) {
  return (
    <Tag
      {...(rest as HTMLAttributes<HTMLElement>)}
      data-form-row=""
      className={cn(
        'kx-form-row flex flex-wrap gap-3 [&>button]:shrink-0',
        labelled
          ? 'items-start [&>.kx-form-row-actions]:pt-[26px] [&>a]:mt-[26px] [&>button]:mt-[26px] [&>label]:mt-[26px] [&>label]:min-h-10 [&>p]:mt-[26px] [&>p]:leading-10'
          : 'items-center',
        className,
      )}
    >
      {children}
    </Tag>
  );
}

/** A group of buttons inside a FormRow (kept together when the row wraps). */
export function FormRowActions({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('kx-form-row-actions flex shrink-0 flex-wrap items-center gap-2', className)}>{children}</div>;
}

/** One field that fills the row and its button(s): "Code on the label [Look up]". */
export function InlineField({ children, actions, labelled = true, className }: { children: ReactNode; actions: ReactNode; labelled?: boolean; className?: string }) {
  return (
    <FormRow labelled={labelled} className={className}>
      <div className="min-w-[200px] flex-1">{children}</div>
      <FormRowActions>{actions}</FormRowActions>
    </FormRow>
  );
}

/** @deprecated Use FormRow. */
export const FieldRow = FormRow;

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
