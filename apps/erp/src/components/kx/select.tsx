'use client';

import { Check, ChevronDown } from 'lucide-react';
import { Children, Fragment, isValidElement, useId, useRef, useState, type ChangeEvent, type ReactElement, type ReactNode, type Ref } from 'react';
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@/components/shadcn/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/shadcn/popover';
import { Select as RSelect, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/shadcn/select';
import { useI18n } from '@/i18n/client';
import { cn } from '@/lib/utils';

/** Radix Select reserves "" for "nothing chosen"; an option whose value is "" travels under this key. */
const EMPTY = '__kx_empty__';
/** Above this many options the select becomes a searchable combobox. */
const SEARCH_AT = 10;

export interface Opt {
  value: string;
  label: string;
  node: ReactNode;
  disabled?: boolean;
}

/** The options a select's children describe (MenuItems, possibly inside fragments or arrays). */
export function optionsOf(children: ReactNode, isItem: (el: ReactElement) => boolean, textOf: (n: ReactNode) => string): Opt[] {
  const out: Opt[] = [];
  const walk = (nodes: ReactNode) =>
    Children.forEach(nodes, (c) => {
      if (!isValidElement(c)) return;
      const props = c.props as { value?: unknown; children?: ReactNode; disabled?: boolean };
      if (c.type === Fragment) return walk(props.children);
      if (!isItem(c) && !('value' in props)) return;
      out.push({ value: props.value === undefined || props.value === null ? '' : String(props.value), label: textOf(props.children), node: props.children, disabled: props.disabled });
    });
  walk(children);
  return out;
}

const enc = (v: string) => (v === '' ? EMPTY : v);
const dec = (v: string) => (v === EMPTY ? '' : v);

/**
 * A single-value select on shadcn/Radix: a styled trigger and listbox, or a searchable combobox
 * when there are many options. It keeps the native contract the pages rely on: `onChange` gets an
 * event whose `target.value` is the option's value as a string, and with a `name` the value is
 * submitted with the form (a hidden input that also carries `required`).
 */
export function KxSelect({
  options,
  value,
  defaultValue,
  onChange,
  name,
  id,
  disabled,
  required,
  placeholder,
  className,
  triggerClass,
  attrs,
  inputRef,
}: {
  options: Opt[];
  value?: unknown;
  defaultValue?: unknown;
  onChange?: (e: ChangeEvent<HTMLInputElement>) => void;
  name?: string;
  id?: string;
  disabled?: boolean;
  required?: boolean;
  placeholder?: string;
  className?: string;
  triggerClass?: string;
  attrs?: Record<string, unknown>;
  inputRef?: Ref<HTMLElement>;
}) {
  const { t } = useI18n();
  const controlled = value !== undefined;
  // Like a native <select>, an uncontrolled one with no default starts on its first option.
  const [inner, setInner] = useState<string>(() => (defaultValue !== undefined && defaultValue !== null ? String(defaultValue) : (options[0]?.value ?? '')));
  const current = controlled ? (value === null ? '' : String(value)) : inner;
  const chosen = options.find((o) => o.value === current);
  const hidden = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const listId = `${useId()}-list`;
  const pick = (v: string) => {
    if (!controlled) setInner(v);
    const target = { value: v, name, id };
    onChange?.({ target, currentTarget: target, preventDefault() {}, stopPropagation() {} } as unknown as ChangeEvent<HTMLInputElement>);
  };
  const searchable = options.length > SEARCH_AT;
  const box = cn('flex h-9 w-full min-w-0 items-center justify-between gap-2 rounded-[10px] border border-input bg-card px-3 text-left text-sm shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:bg-input/30 [&_svg]:shrink-0', triggerClass);
  const shown = chosen ? <span className="flex min-w-0 items-center gap-2 truncate [&_svg]:size-4">{chosen.node}</span> : <span className="truncate text-muted-foreground">{placeholder ?? ''}</span>;

  return (
    <span className={cn('relative flex min-w-0', className)}>
      {searchable ? (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button ref={inputRef as Ref<HTMLButtonElement>} type="button" id={id} role="combobox" aria-expanded={open} aria-controls={listId} disabled={disabled} className={box} {...attrs}>
              {shown}
              <ChevronDown aria-hidden className="size-4 text-muted-foreground" />
            </button>
          </PopoverTrigger>
          <PopoverContent id={listId} align="start" collisionPadding={8} className="w-[max(var(--radix-popover-trigger-width),14rem)] p-0">
            <Command>
              <CommandInput placeholder={t('common.search')} />
              <CommandList>
                <CommandEmpty>{t('common.noResults')}</CommandEmpty>
                {options.map((o, i) => (
                  <CommandItem
                    key={`${o.value}-${i}`}
                    value={`${o.label} ${i}`}
                    disabled={o.disabled}
                    onSelect={() => {
                      pick(o.value);
                      setOpen(false);
                    }}
                  >
                    <Check aria-hidden className={cn('size-4', o.value === current ? 'opacity-100' : 'opacity-0')} />
                    <span className="truncate">{o.node}</span>
                  </CommandItem>
                ))}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      ) : (
        <RSelect value={chosen ? enc(current) : ''} onValueChange={(v) => pick(dec(v))} disabled={disabled}>
          <SelectTrigger ref={inputRef as Ref<HTMLButtonElement>} id={id} className={cn(box, 'data-[size=default]:h-9')} {...attrs}>
            {chosen ? <SelectValue /> : shown}
          </SelectTrigger>
          <SelectContent position="popper" collisionPadding={8} className="max-h-80">
            {options.map((o, i) => (
              <SelectItem key={`${o.value}-${i}`} value={enc(o.value)} disabled={o.disabled}>
                {o.node}
              </SelectItem>
            ))}
          </SelectContent>
        </RSelect>
      )}
      {name !== undefined && (
        <input
          ref={hidden}
          tabIndex={-1}
          aria-hidden
          name={name}
          required={required}
          value={current}
          onChange={() => {}}
          onInvalid={() => (document.getElementById(id ?? '') as HTMLElement | null)?.focus()}
          className="pointer-events-none absolute inset-x-0 bottom-0 h-px opacity-0"
        />
      )}
    </span>
  );
}
