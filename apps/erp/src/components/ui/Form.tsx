'use client';

import Box from '@mui/material/Box';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormHelperText from '@mui/material/FormHelperText';
import MenuItem from '@mui/material/MenuItem';
import Switch from '@mui/material/Switch';
import TextField, { type TextFieldProps } from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { cloneElement, useId, type ReactElement, type ReactNode } from 'react';

/**
 * The form field set. All of them show a visible label above the control (never only a placeholder),
 * link the helper and error text with aria-describedby, and mark required fields in words for
 * screen readers as well as with the asterisk.
 */

/** A label, a control and helper or error text, for controls MUI has no field for (pickers, tag inputs). */
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
    <Box sx={{ display: 'grid', gap: 0.5 }}>
      <Typography component="label" id={`${id}-label`} htmlFor={id} variant="subtitle2" sx={{ fontWeight: 600 }}>
        {label}
        {required && (
          <Box component="span" aria-hidden sx={{ color: 'error.main', ml: 0.5 }}>
            *
          </Box>
        )}
      </Typography>
      {cloneElement(children, { id, 'aria-describedby': error || helper ? hid : undefined, 'aria-invalid': error ? true : undefined, 'aria-required': required ? true : undefined })}
      {(error || helper) && (
        <FormHelperText id={hid} error={!!error} role={error ? 'alert' : undefined} sx={{ mx: 0 }}>
          {error ?? helper}
        </FormHelperText>
      )}
    </Box>
  );
}

/** An input and its button on one row: the button lines up with the control, not with the label above it. */
export function FieldRow({ children }: { children: ReactNode }) {
  return <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, flexWrap: 'wrap', '& > .MuiButton-root': { mt: '26px', height: 40, flexShrink: 0 } }}>{children}</Box>;
}

export type TextInputProps = Omit<TextFieldProps, 'variant' | 'size'> & { helper?: ReactNode };

/** A single-line, multi-line or select input. Small by default: forms in an ERP are dense. */
export function TextInput({ helper, error, helperText, ...props }: TextInputProps) {
  // A select's combobox is a div, not the input the label's htmlFor points at: name it through the label's id (FormField sets `${id}-label`).
  const select = props.select && props.id ? { labelId: `${props.id}-label`, ...(props.slotProps?.select as object | undefined) } : props.slotProps?.select;
  return <TextField size="small" {...props} error={!!error} helperText={typeof error === 'string' ? error : (helper ?? helperText)} slotProps={{ ...props.slotProps, ...(select ? { select } : {}), formHelperText: { role: error ? 'alert' : undefined } }} />;
}

export function SelectInput({ options, empty, ...props }: Omit<TextInputProps, 'select' | 'children'> & { options: { value: string; label: string }[]; /** A leading "any" or "none" choice. */ empty?: string }) {
  return (
    <TextInput {...props} select>
      {empty !== undefined && (
        <MenuItem value="">
          <em>{empty}</em>
        </MenuItem>
      )}
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
    <Box>
      <FormControlLabel control={<Checkbox checked={checked} onChange={(e) => onChange(e.target.checked)} disabled={disabled} slotProps={{ input: { 'aria-describedby': helper ? id : undefined } }} />} label={label} />
      {helper && (
        <FormHelperText id={id} sx={{ mt: -0.5, ml: 4.5 }}>
          {helper}
        </FormHelperText>
      )}
    </Box>
  );
}

export function SwitchField({ label, checked, onChange, disabled }: { label: ReactNode; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return <FormControlLabel control={<Switch checked={checked} onChange={(e) => onChange(e.target.checked)} disabled={disabled} />} label={label} sx={{ ml: 0 }} />;
}

/** A responsive grid of fields: one column on a phone, two from tablet up (or `cols`). */
export function FormGrid({ children, cols = 2 }: { children: ReactNode; cols?: 1 | 2 | 3 }) {
  return <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: `repeat(${cols}, minmax(0, 1fr))` } }}>{children}</Box>;
}

/** The buttons under a form, right-aligned, wrapping on a phone. */
export function FormActions({ children }: { children: ReactNode }) {
  return <Box sx={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 1, mt: 3 }}>{children}</Box>;
}
