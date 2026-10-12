'use client';

import { Check, ChevronDown, X } from 'lucide-react';
import { Popover as P } from 'radix-ui';
import {
  Children,
  cloneElement,
  createContext,
  isValidElement,
  useContext,
  useId,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FocusEvent,
  type HTMLAttributes,
  type KeyboardEvent,
  type MouseEvent,
  type ReactElement,
  type ReactNode,
  type Ref,
} from 'react';
import { Checkbox as ShadCheckbox } from '@/components/shadcn/checkbox';
import { RadioGroup as ShadRadioGroup, RadioGroupItem } from '@/components/shadcn/radio-group';
import { Slider as ShadSlider } from '@/components/shadcn/slider';
import { Switch as ShadSwitch } from '@/components/shadcn/switch';
import { cn } from '@/lib/utils';
import { KxSelect, optionsOf } from './select';

type Rest = { className?: string; children?: ReactNode; [prop: string]: unknown };
type AnyChange = (e: ChangeEvent<HTMLInputElement>) => void;

/** A fake change event for controls that are not <input>s (Radix checkbox, switch, radio). */
function fakeEvent(target: Record<string, unknown>) {
  return { target, currentTarget: target, preventDefault() {}, stopPropagation() {} } as unknown as ChangeEvent<HTMLInputElement>;
}

/** The text of a node tree (an <option> can hold only text). */
export function textOf(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (isValidElement(node)) return textOf((node.props as { children?: ReactNode }).children);
  return '';
}

export const fieldClass =
  'w-full min-w-0 rounded-[10px] border border-input bg-card px-3 text-sm shadow-xs transition-[color,box-shadow] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:bg-input/30';
const labelClass = 'text-[13px] leading-5 font-medium text-foreground';

type ItemCtxT = { kind: 'native' } | { kind: 'multi'; selected: unknown[]; toggle: (v: unknown) => void } | null;
const ItemCtx = createContext<ItemCtxT>(null);

const isMenuItem = (el: ReactElement) => el.type === MenuItem;

/** An option in a select, an item in a menu. */
export function MenuItem({ value, children, onClick, disabled, selected, className, divider, dense: _d, ...rest }: Rest & { value?: unknown; onClick?: (e: MouseEvent<HTMLElement>) => void; disabled?: boolean; selected?: boolean; divider?: boolean; dense?: boolean }) {
  const ctx = useContext(ItemCtx);
  if (ctx?.kind === 'native') {
    return (
      <option value={value === undefined || value === null ? '' : String(value)} disabled={disabled} {...(rest as HTMLAttributes<HTMLOptionElement>)}>
        {textOf(children)}
      </option>
    );
  }
  const on = ctx?.kind === 'multi' ? ctx.selected.includes(value) : selected;
  const role = ctx?.kind === 'multi' ? 'option' : 'menuitem';
  return (
    <div
      role={role}
      tabIndex={disabled ? undefined : -1}
      aria-disabled={disabled || undefined}
      aria-selected={role === 'option' ? !!on : undefined}
      data-selected={on || undefined}
      onClick={(e) => {
        if (disabled) return;
        if (ctx?.kind === 'multi') ctx.toggle(value);
        onClick?.(e);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          (e.currentTarget as HTMLElement).click();
        }
      }}
      className={cn(
        'flex min-h-9 cursor-pointer items-center gap-2 rounded-[8px] px-2.5 text-sm outline-none select-none hover:bg-accent focus-visible:bg-accent aria-disabled:pointer-events-none aria-disabled:opacity-50 data-selected:bg-teal-soft/70 [&_svg]:size-4 [&_svg]:text-muted-foreground',
        divider && 'mb-1 border-b',
        className,
      )}
      {...(rest as HTMLAttributes<HTMLDivElement>)}
    >
      {children}
    </div>
  );
}

export function InputAdornment({ position, className, children, ...rest }: Rest & { position: 'start' | 'end' }) {
  return (
    <span className={cn('flex shrink-0 items-center text-muted-foreground [&_svg]:size-[18px]', position === 'start' ? 'pl-3' : 'pr-2', className)} {...(rest as HTMLAttributes<HTMLSpanElement>)}>
      {children}
    </span>
  );
}

type SlotProps = {
  input?: { startAdornment?: ReactNode; endAdornment?: ReactNode; readOnly?: boolean; inputProps?: Record<string, unknown>; className?: string; [k: string]: unknown };
  htmlInput?: Record<string, unknown>;
  inputLabel?: Record<string, unknown>;
  select?: Record<string, unknown>;
  formHelperText?: Record<string, unknown>;
};

export type TextFieldProps = Rest & {
  label?: ReactNode;
  value?: unknown;
  defaultValue?: unknown;
  onChange?: AnyChange;
  onBlur?: (e: FocusEvent<HTMLInputElement>) => void;
  onFocus?: (e: FocusEvent<HTMLInputElement>) => void;
  onKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void;
  select?: boolean;
  multiline?: boolean;
  rows?: number;
  minRows?: number;
  maxRows?: number;
  type?: string;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  error?: boolean;
  helperText?: ReactNode;
  fullWidth?: boolean;
  size?: 'small' | 'medium';
  name?: string;
  id?: string;
  autoComplete?: string;
  autoFocus?: boolean;
  inputRef?: Ref<HTMLInputElement>;
  slotProps?: SlotProps;
  inputProps?: Record<string, unknown>;
  InputProps?: SlotProps['input'];
  SelectProps?: Record<string, unknown>;
  InputLabelProps?: Record<string, unknown>;
  variant?: string;
};

/** A labelled input, textarea or native select, with helper or error text linked by aria-describedby. */
export function TextField({
  label,
  value,
  defaultValue,
  onChange,
  onBlur,
  onFocus,
  onKeyDown,
  select,
  multiline,
  rows,
  minRows,
  maxRows: _mr,
  type,
  placeholder,
  required,
  disabled,
  error,
  helperText,
  fullWidth: _fw,
  size = 'small',
  name,
  id: given,
  autoComplete,
  autoFocus,
  inputRef,
  slotProps,
  inputProps,
  InputProps,
  SelectProps,
  InputLabelProps: _ilp,
  variant: _v,
  className,
  children,
  'aria-label': ariaLabel,
  'aria-describedby': ariaDescribedBy,
  'aria-invalid': ariaInvalid,
  'aria-required': ariaRequired,
  ...root
}: TextFieldProps) {
  const auto = useId();
  const id = given ?? auto;
  const hid = `${id}-helper-text`;
  const slotInput = { ...InputProps, ...slotProps?.input };
  const html = { ...inputProps, ...(slotInput.inputProps as object), ...slotProps?.htmlInput } as Record<string, unknown>;
  const { startAdornment, endAdornment, readOnly, inputProps: _ip, className: inputBoxClass, ref: boxRef, ...inputRest } = slotInput as SlotProps['input'] & { ref?: Ref<HTMLDivElement> };
  const describedBy = [ariaDescribedBy as string | undefined, helperText ? hid : undefined].filter(Boolean).join(' ') || undefined;
  const common = {
    id,
    name,
    disabled,
    required,
    autoFocus,
    readOnly,
    placeholder,
    'aria-label': ariaLabel as string | undefined,
    'aria-describedby': describedBy,
    'aria-invalid': (error || ariaInvalid ? true : undefined) as boolean | undefined,
    'aria-required': ariaRequired as boolean | undefined,
    onChange,
    onBlur,
    onFocus,
    onKeyDown,
    ...(value !== undefined ? { value: (value ?? '') as string } : {}),
    ...(defaultValue !== undefined ? { defaultValue: defaultValue as string } : {}),
    ...inputRest,
    ...html,
  } as Record<string, unknown>;
  const h = size === 'medium' ? 'h-10' : 'h-9';
  const boxed = !!(startAdornment || endAdornment);
  let control: ReactNode;
  if (select) {
    const multiple = !!(SelectProps?.multiple ?? slotProps?.select?.multiple);
    if (multiple) {
      control = (
        <MultiSelect id={id} value={(value as unknown[]) ?? []} onChange={onChange} renderValue={(SelectProps?.renderValue ?? slotProps?.select?.renderValue) as never} disabled={disabled} labelledBy={label ? `${id}-label` : undefined}>
          {children}
        </MultiSelect>
      );
    } else {
      const { id: _id, name: _nm, disabled: _ds, required: _rq, placeholder: _ph, onChange: _oc, value: _vl, defaultValue: _dv, readOnly: _ro, onBlur: _ob, onFocus: _of, onKeyDown: _ok, className: _cl, ...attrs } = common;
      control = (
        <KxSelect
          options={optionsOf(children, isMenuItem, textOf)}
          id={id}
          name={name}
          value={value}
          defaultValue={defaultValue}
          onChange={onChange}
          disabled={disabled}
          required={required}
          placeholder={placeholder}
          inputRef={inputRef as Ref<HTMLElement>}
          triggerClass={h}
          attrs={{ ...attrs, ...selectAttrs(slotProps?.select) }}
        />
      );
    }
  } else if (multiline) {
    control = <textarea ref={inputRef as unknown as Ref<HTMLTextAreaElement>} rows={rows ?? minRows ?? 3} {...(common as HTMLAttributes<HTMLTextAreaElement>)} className={cn(fieldClass, 'min-h-16 py-2 leading-[21px]')} />;
  } else {
    const input = <input ref={inputRef} type={type} autoComplete={autoComplete} {...(common as HTMLAttributes<HTMLInputElement>)} className={cn(boxed ? 'h-full min-w-0 flex-1 bg-transparent px-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed' : cn(fieldClass, h), (html.className as string) ?? '')} />;
    control = boxed ? (
      <div ref={boxRef} className={cn('kx-field-box', fieldClass, h, 'flex items-center px-0 focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50', error && 'border-destructive', disabled && 'opacity-50', inputBoxClass)}>
        {startAdornment}
        {input}
        {endAdornment}
      </div>
    ) : (
      input
    );
  }
  return (
    <div className={cn('grid min-w-0 content-start gap-1.5', className)} {...(root as HTMLAttributes<HTMLDivElement>)}>
      {label && (
        <label id={`${id}-label`} htmlFor={id} className={labelClass}>
          {label}
          {required && (
            <span aria-hidden className="ml-0.5 text-red-ink">
              *
            </span>
          )}
        </label>
      )}
      {control}
      {helperText && (
        <p id={hid} role={error ? 'alert' : undefined} className={cn('text-xs leading-4', error ? 'text-red-ink' : 'text-muted-foreground')}>
          {helperText}
        </p>
      )}
    </div>
  );
}

/** Attributes for a native select from the old select slot (test ids, aria); display options are dropped. */
function selectAttrs(o?: Record<string, unknown>) {
  if (!o) return {};
  const { displayEmpty: _d, multiple: _m, renderValue: _r, MenuProps: _mp, labelId: _l, native: _n, ...rest } = o;
  return rest as HTMLAttributes<HTMLSelectElement>;
}

/** Multi-value select: a button listing the chosen values and a popover of checkable options. */
function MultiSelect({ id, value, onChange, renderValue, disabled, labelledBy, children }: { id: string; value: unknown[]; onChange?: AnyChange; renderValue?: (v: unknown[]) => ReactNode; disabled?: boolean; labelledBy?: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const toggle = (v: unknown) => onChange?.(fakeEvent({ value: value.includes(v) ? value.filter((x) => x !== v) : [...value, v] }));
  const labels = Children.toArray(children)
    .filter((c): c is ReactElement<{ value?: unknown; children?: ReactNode }> => isValidElement(c))
    .filter((c) => value.includes(c.props.value))
    .map((c) => textOf(c.props.children));
  return (
    <P.Root open={open} onOpenChange={setOpen}>
      <P.Trigger asChild>
        <button type="button" id={id} role="combobox" aria-expanded={open} aria-controls={`${id}-list`} aria-haspopup="listbox" aria-labelledby={labelledBy} disabled={disabled} className={cn(fieldClass, 'flex h-9 items-center justify-between gap-2 text-left')}>
          <span className="truncate">{renderValue ? renderValue(value) : labels.join(', ')}</span>
          <ChevronDown aria-hidden className="size-4 shrink-0 text-muted-foreground" />
        </button>
      </P.Trigger>
      <P.Portal>
        <P.Content id={`${id}-list`} align="start" sideOffset={4} collisionPadding={8} role="listbox" aria-multiselectable className="z-50 max-h-80 min-w-[var(--radix-popover-trigger-width)] overflow-y-auto rounded-[12px] border bg-popover p-1.5 text-popover-foreground shadow-[0_20px_50px_-12px_rgba(16,24,40,.25)]">
          <ItemCtx.Provider value={{ kind: 'multi', selected: value, toggle }}>{children}</ItemCtx.Provider>
        </P.Content>
      </P.Portal>
    </P.Root>
  );
}

// FormControl + InputLabel + Select: the label and the select share an id from the control.
const ControlCtx = createContext<{ id: string } | null>(null);
export function FormControl({ className, children, fullWidth: _f, size: _s, error: _e, component = 'div', ...rest }: Rest & { fullWidth?: boolean; size?: string; error?: boolean; component?: 'div' | 'fieldset' }) {
  const id = useId();
  const Tag = component as 'div';
  return (
    <ControlCtx.Provider value={{ id }}>
      <Tag className={cn('grid min-w-0 content-start gap-1.5 border-0 p-0', className)} {...(rest as HTMLAttributes<HTMLDivElement>)}>
        {children}
      </Tag>
    </ControlCtx.Provider>
  );
}
export function InputLabel({ className, shrink: _s, id, children, ...rest }: Rest & { shrink?: boolean; id?: string }) {
  const ctx = useContext(ControlCtx);
  return (
    <label id={id} htmlFor={ctx?.id} className={cn(labelClass, className)} {...(rest as HTMLAttributes<HTMLLabelElement>)}>
      {children}
    </label>
  );
}
export function FormLabel({ className, component = 'label', ...rest }: Rest & { component?: 'label' | 'legend' }) {
  const Tag = component as 'label';
  return <Tag className={cn(labelClass, 'mb-1.5', className)} {...(rest as HTMLAttributes<HTMLLabelElement>)} />;
}
export function FormHelperText({ error, className, ...rest }: Rest & { error?: boolean; id?: string }) {
  return <p className={cn('text-xs leading-4', error ? 'text-red-ink' : 'text-muted-foreground', className)} {...(rest as HTMLAttributes<HTMLParagraphElement>)} />;
}

export function Select({
  value,
  onChange,
  multiple,
  renderValue,
  labelId,
  label: _l,
  displayEmpty: _d,
  notched: _n,
  size: _s,
  fullWidth: _f,
  disabled,
  inputProps,
  className,
  children,
  ...rest
}: Rest & { value: unknown; onChange?: AnyChange; multiple?: boolean; renderValue?: (v: string[]) => ReactNode; labelId?: string; label?: ReactNode; displayEmpty?: boolean; notched?: boolean; size?: string; fullWidth?: boolean; disabled?: boolean; inputProps?: Record<string, unknown> }) {
  const ctx = useContext(ControlCtx);
  const id = ctx?.id;
  if (multiple) {
    return (
      <MultiSelect id={id ?? ''} value={(value as unknown[]) ?? []} onChange={onChange} renderValue={renderValue as never} disabled={disabled} labelledBy={labelId}>
        {children}
      </MultiSelect>
    );
  }
  const { name, required, placeholder, defaultValue, ...attrs } = { ...(inputProps as object), ...rest } as Record<string, unknown>;
  return (
    <KxSelect
      options={optionsOf(children, isMenuItem, textOf)}
      id={id}
      name={name as string | undefined}
      value={value}
      defaultValue={defaultValue}
      onChange={onChange}
      disabled={disabled}
      required={required as boolean | undefined}
      placeholder={placeholder as string | undefined}
      className={className}
      attrs={{ 'aria-labelledby': labelId, ...attrs }}
    />
  );
}

// Checkable controls. onChange keeps the (event, checked) signature.
type CheckProps = Rest & {
  checked?: boolean;
  defaultChecked?: boolean;
  onChange?: (e: ChangeEvent<HTMLInputElement>, checked: boolean) => void;
  disabled?: boolean;
  indeterminate?: boolean;
  size?: string;
  name?: string;
  value?: unknown;
  id?: string;
  inputProps?: Record<string, unknown>;
  slotProps?: { input?: Record<string, unknown> };
  color?: string;
  edge?: string;
};

export function Checkbox({ checked, defaultChecked, onChange, disabled, indeterminate, size: _s, name, value, inputProps, slotProps, color: _c, edge: _e, className, ...rest }: CheckProps) {
  return (
    <ShadCheckbox
      checked={indeterminate ? 'indeterminate' : checked}
      defaultChecked={defaultChecked}
      disabled={disabled}
      name={name}
      value={value as string | undefined}
      onCheckedChange={(c) => onChange?.(fakeEvent({ checked: c === true, name, value }), c === true)}
      className={cn('m-1 data-[state=checked]:border-teal data-[state=checked]:bg-teal data-[state=checked]:text-white dark:data-[state=checked]:bg-teal', className)}
      {...(inputProps as object)}
      {...(slotProps?.input as object)}
      {...(rest as object)}
    />
  );
}

export function Switch({ checked, defaultChecked, onChange, disabled, size: _s, name, value: _v, inputProps, slotProps, color: _c, edge: _e, className, ...rest }: CheckProps) {
  return (
    <ShadSwitch
      checked={checked}
      defaultChecked={defaultChecked}
      disabled={disabled}
      name={name}
      onCheckedChange={(c) => onChange?.(fakeEvent({ checked: c, name }), c)}
      className={cn('m-1.5', className)}
      {...(inputProps as object)}
      {...(slotProps?.input as object)}
      {...(rest as object)}
    />
  );
}

export function RadioGroup({ value, onChange, row, className, children, name, ...rest }: Rest & { value?: unknown; onChange?: (e: ChangeEvent<HTMLInputElement>, value: string) => void; row?: boolean; name?: string }) {
  return (
    <ShadRadioGroup value={value as string} name={name} onValueChange={(v) => onChange?.(fakeEvent({ value: v, name }), v)} className={cn(row ? 'flex flex-wrap gap-x-4 gap-y-1' : 'grid gap-0.5', className)} {...(rest as object)}>
      {children}
    </ShadRadioGroup>
  );
}

export function Radio({ value, disabled, className, size: _s, inputProps, slotProps, ...rest }: CheckProps) {
  return <RadioGroupItem value={String(value ?? '')} disabled={disabled} className={cn('m-1 data-[state=checked]:border-teal [&_svg]:fill-teal', className)} {...(inputProps as object)} {...(slotProps?.input as object)} {...(rest as object)} />;
}

/** A control and its clickable label on one line. */
export function FormControlLabel({ control, label, value, disabled, labelPlacement: _p, className, ...rest }: Rest & { control: ReactElement<Record<string, unknown>>; label: ReactNode; value?: unknown; disabled?: boolean; labelPlacement?: string }) {
  const id = useId();
  const extra: Record<string, unknown> = { id };
  if (value !== undefined) extra.value = value;
  if (disabled !== undefined) extra.disabled = disabled;
  return (
    <div className={cn('inline-flex items-center gap-1.5 text-sm', disabled && 'opacity-60', className)} {...(rest as HTMLAttributes<HTMLDivElement>)}>
      {cloneElement(control, extra)}
      <label htmlFor={id} className="cursor-pointer select-none">
        {label}
      </label>
    </div>
  );
}

export function Slider({ value, onChange, min = 0, max = 100, step = 1, size: _s, className, 'aria-label': ariaLabel, valueLabelDisplay: _vd, marks: _m, ...rest }: Rest & { value: number | number[]; onChange?: (e: Event | null, v: number | number[]) => void; min?: number; max?: number; step?: number; size?: string; 'aria-label'?: string; valueLabelDisplay?: string; marks?: unknown }) {
  const arr = Array.isArray(value) ? value : [value];
  return <ShadSlider value={arr} min={min} max={max} step={step} aria-label={ariaLabel} onValueChange={(v) => onChange?.(null, Array.isArray(value) ? v : v[0])} className={cn('py-2', className)} {...(rest as object)} />;
}

// Autocomplete: an input with a filtered listbox; single or multiple values.
type AcState = { selected: boolean; index: number; inputValue: string };
export type AutocompleteRenderInputParams = {
  id: string;
  disabled?: boolean;
  fullWidth: boolean;
  size?: 'small';
  inputProps: Record<string, unknown>;
  InputProps: { ref: Ref<HTMLDivElement>; startAdornment?: ReactNode; endAdornment?: ReactNode; className?: string };
  InputLabelProps: Record<string, unknown>;
};

export function Autocomplete<T, M extends boolean | undefined = false>({
  options,
  value,
  onChange,
  getOptionLabel = (o: T) => String(o ?? ''),
  isOptionEqualToValue = (a: T, b: T) => a === b,
  multiple,
  disableCloseOnSelect,
  renderOption,
  renderValue,
  renderTags,
  renderInput,
  groupBy,
  filterOptions,
  noOptionsText = 'No options',
  inputValue: controlledInput,
  onInputChange,
  loading,
  loadingText = 'Loading…',
  disabled,
  id: given,
  className,
  ...rest
}: {
  options: readonly T[];
  value: M extends true ? T[] : T | null;
  onChange?: (e: unknown, v: M extends true ? T[] : T | null) => void;
  getOptionLabel?: (o: T) => string;
  isOptionEqualToValue?: (a: T, b: T) => boolean;
  multiple?: M;
  disableCloseOnSelect?: boolean;
  renderOption?: (props: HTMLAttributes<HTMLLIElement> & { key: string }, option: T, state: AcState) => ReactNode;
  renderValue?: (value: T[], getItemProps: (o: { index: number }) => Record<string, unknown> & { key: string; onDelete: () => void }) => ReactNode;
  renderTags?: (value: T[], getTagProps: (o: { index: number }) => Record<string, unknown> & { key: string; onDelete: () => void }) => ReactNode;
  renderInput: (params: AutocompleteRenderInputParams) => ReactNode;
  groupBy?: (o: T) => string;
  filterOptions?: (opts: T[], state: { inputValue: string; getOptionLabel: (o: T) => string }) => T[];
  noOptionsText?: ReactNode;
  inputValue?: string;
  onInputChange?: (e: unknown, v: string, reason: 'input' | 'reset' | 'clear') => void;
  loading?: boolean;
  loadingText?: ReactNode;
  disabled?: boolean;
  id?: string;
  className?: string;
  [prop: string]: unknown;
}) {
  const auto = useId();
  const id = given ?? auto;
  const listId = `${id}-listbox`;
  const values: T[] = multiple ? ((value as T[]) ?? []) : value === null || value === undefined ? [] : [value as T];
  const single = !multiple ? (value as T | null) : null;
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const anchorRef = useRef<HTMLDivElement>(null);

  const text = controlledInput ?? typed ?? (single !== null && single !== undefined ? getOptionLabel(single) : '');
  const query = controlledInput ?? typed ?? '';
  const setText = (v: string, reason: 'input' | 'reset' | 'clear') => {
    if (controlledInput === undefined) setTyped(reason === 'input' ? v : null);
    onInputChange?.(null, v, reason);
  };
  const shown = useMemo(() => {
    const all = [...options];
    if (filterOptions) return filterOptions(all, { inputValue: query, getOptionLabel });
    const q = query.trim().toLowerCase();
    return q ? all.filter((o) => getOptionLabel(o).toLowerCase().includes(q)) : all;
  }, [options, filterOptions, query, getOptionLabel]);

  const isSel = (o: T) => values.some((v) => isOptionEqualToValue(o, v));
  const choose = (o: T) => {
    if (multiple) {
      const next = isSel(o) ? values.filter((v) => !isOptionEqualToValue(o, v)) : [...values, o];
      onChange?.(null, next as never);
      setText('', 'reset');
      if (!disableCloseOnSelect) setOpen(false);
    } else {
      onChange?.(null, o as never);
      setText(getOptionLabel(o), 'reset');
      setOpen(false);
    }
  };
  const remove = (i: number) => onChange?.(null, values.filter((_, j) => j !== i) as never);

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) return setOpen(true);
      setActive((a) => (shown.length ? (a + (e.key === 'ArrowDown' ? 1 : -1) + shown.length) % shown.length : 0));
    } else if (e.key === 'Enter' && open && shown[active]) {
      e.preventDefault();
      choose(shown[active]);
    } else if (e.key === 'Escape' && open) {
      e.preventDefault();
      setOpen(false);
    } else if (e.key === 'Backspace' && multiple && !text && values.length) {
      remove(values.length - 1);
    }
  };

  const itemProps = (o: { index: number }) => ({ key: String(o.index), 'data-item-index': o.index, tabIndex: -1, onDelete: () => remove(o.index), className: '' });
  const chips = multiple && values.length ? (
    (renderValue ?? renderTags)?.(values, itemProps) ?? values.map((v, i) => (
      <span key={i} className="inline-flex h-6 items-center gap-1 rounded-full bg-secondary pr-1 pl-2 text-xs font-medium">
        {getOptionLabel(v)}
        <button type="button" aria-label="Remove" tabIndex={-1} onClick={() => remove(i)} className="rounded-full p-0.5 hover:bg-black/10">
          <X className="size-3" />
        </button>
      </span>
    ))
  ) : undefined;

  const params: AutocompleteRenderInputParams = {
    id,
    disabled,
    fullWidth: true,
    size: 'small',
    InputProps: { ref: anchorRef, startAdornment: chips ? <span className="flex flex-wrap items-center gap-1 py-1 pl-2">{chips}</span> : undefined, endAdornment: <ChevronDown aria-hidden className="mr-2.5 size-4 shrink-0 text-muted-foreground" />, className: multiple ? 'h-auto min-h-9 flex-wrap' : undefined },
    inputProps: {
      ref: inputRef,
      role: 'combobox',
      autoComplete: 'off',
      'aria-autocomplete': 'list',
      'aria-expanded': open,
      'aria-controls': open ? listId : undefined,
      'aria-activedescendant': open && shown[active] ? `${id}-opt-${active}` : undefined,
      value: text,
      onChange: (e: ChangeEvent<HTMLInputElement>) => {
        setText(e.target.value, 'input');
        setActive(0);
        setOpen(true);
      },
      onClick: () => setOpen(true),
      onBlur: () => {
        setOpen(false);
        if (!multiple && controlledInput === undefined) setTyped(null);
      },
      onKeyDown,
    },
    InputLabelProps: {},
  };

  let lastGroup: string | undefined;
  return (
    <P.Root open={open && !disabled} onOpenChange={setOpen}>
      <P.Anchor asChild>
        <div className={cn('min-w-0', className)} {...(rest as HTMLAttributes<HTMLDivElement>)}>
          {renderInput(params)}
        </div>
      </P.Anchor>
      <P.Portal>
        <P.Content
          align="start"
          sideOffset={4}
          collisionPadding={8}
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => e.preventDefault()}
          onInteractOutside={(e) => anchorRef.current?.contains(e.target as Node) && e.preventDefault()}
          className="z-50 w-[var(--radix-popover-trigger-width)] min-w-[220px] rounded-[12px] border bg-popover p-1.5 text-popover-foreground shadow-[0_20px_50px_-12px_rgba(16,24,40,.25)]"
        >
          <ul id={listId} role="listbox" aria-multiselectable={multiple || undefined} className="m-0 max-h-72 list-none overflow-y-auto p-0" onMouseDown={(e) => e.preventDefault()}>
            {loading ? (
              <li className="px-2.5 py-2 text-sm text-muted-foreground">{loadingText}</li>
            ) : shown.length === 0 ? (
              <li className="px-2.5 py-2 text-sm text-muted-foreground">{noOptionsText}</li>
            ) : (
              shown.map((o, i) => {
                const group = groupBy?.(o);
                const header = groupBy && group !== lastGroup ? group : undefined;
                lastGroup = group;
                const sel = isSel(o);
                const props = {
                  key: `${i}-${getOptionLabel(o)}`,
                  id: `${id}-opt-${i}`,
                  role: 'option',
                  'aria-selected': sel,
                  'data-focus': i === active || undefined,
                  onClick: () => choose(o),
                  onMouseMove: () => setActive(i),
                  className: 'flex min-h-9 cursor-pointer items-center gap-2 rounded-[8px] px-2.5 py-1.5 text-sm data-[focus]:bg-accent aria-selected:bg-teal-soft/70',
                };
                const { key, ...liProps } = props;
                return (
                  <li key={key} role="presentation" className="list-none">
                    {header && <div className="px-2.5 pt-2 pb-1 text-xs font-medium text-muted-foreground">{header}</div>}
                    {renderOption ? (
                      <ul role="presentation" className="m-0 list-none p-0">{renderOption(props as never, o, { selected: sel, index: i, inputValue: query })}</ul>
                    ) : (
                      <div {...(liProps as HTMLAttributes<HTMLDivElement>)}>
                        <span className="min-w-0 flex-1">{getOptionLabel(o)}</span>
                        {sel && <Check className="size-4 text-teal-ink" aria-hidden />}
                      </div>
                    )}
                  </li>
                );
              })
            )}
          </ul>
        </P.Content>
      </P.Portal>
    </P.Root>
  );
}
