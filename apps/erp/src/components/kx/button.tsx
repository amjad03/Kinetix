'use client';

import { Children, cloneElement, createContext, createElement, isValidElement, useContext, type ElementType, type HTMLAttributes, type MouseEvent, type ReactElement, type ReactNode, type Ref } from 'react';
import { buttonVariants } from '@/components/shadcn/button';
import { cn } from '@/lib/utils';

export type Color = 'primary' | 'secondary' | 'error' | 'warning' | 'success' | 'info' | 'inherit';

type Common = {
  component?: ElementType;
  href?: string;
  className?: string;
  children?: ReactNode;
  disabled?: boolean;
  ref?: Ref<HTMLElement>;
  [prop: string]: unknown;
};

/** Renders `component`, an <a> when there is an href, else a <button type="button">. */
function host({ component, href, disabled, type, ...rest }: Common & { type?: string }, className: string, children: ReactNode) {
  if (component) return createElement(component, { href, className, 'aria-disabled': disabled || undefined, disabled: component === 'button' ? disabled : undefined, ...rest }, children);
  if (href) return createElement('a', { href: disabled ? undefined : href, className, 'aria-disabled': disabled || undefined, ...rest }, children);
  return createElement('button', { type: type ?? 'button', disabled, className, ...rest }, children);
}

const CONTAINED: Partial<Record<Color, string>> = {
  error: 'bg-destructive text-white hover:bg-destructive/90',
  success: 'bg-green-ink text-white hover:opacity-90 dark:text-black',
  warning: 'bg-amber text-black hover:opacity-90',
  secondary: 'bg-secondary text-secondary-foreground hover:bg-accent',
  info: 'bg-blue-ink text-white hover:opacity-90',
};
const TONE: Partial<Record<Color, string>> = {
  error: 'text-red-ink',
  success: 'text-green-ink',
  warning: 'text-amber-ink',
  info: 'text-blue-ink',
  inherit: 'text-inherit',
};

export type ButtonProps = Common & {
  variant?: 'contained' | 'outlined' | 'text';
  color?: Color;
  size?: 'small' | 'medium' | 'large';
  startIcon?: ReactNode;
  endIcon?: ReactNode;
  fullWidth?: boolean;
  type?: 'button' | 'submit' | 'reset';
  onClick?: (e: MouseEvent<HTMLElement>) => void;
};

export function Button({ variant = 'text', color = 'primary', size = 'medium', startIcon, endIcon, fullWidth, className, children, ...rest }: ButtonProps) {
  const v = variant === 'contained' ? (color === 'error' ? 'destructive' : 'default') : variant === 'outlined' ? 'outline' : 'ghost';
  const cls = cn(
    buttonVariants({ variant: v, size: size === 'small' ? 'sm' : size === 'large' ? 'lg' : 'default' }),
    variant === 'contained' ? CONTAINED[color] : TONE[color],
    variant === 'outlined' && color === 'error' && 'border-red/40 hover:bg-red-soft hover:text-red-ink',
    fullWidth && 'w-full',
    'aria-disabled:pointer-events-none aria-disabled:opacity-50',
    className,
  );
  return host(rest, cls, (
    <>
      {startIcon}
      {children}
      {endIcon}
    </>
  ));
}

export function IconButton({ size = 'medium', color, edge, className, children, ...rest }: Common & { size?: 'small' | 'medium' | 'large'; color?: Color | 'default'; edge?: 'start' | 'end' | false; onClick?: (e: MouseEvent<HTMLElement>) => void; type?: 'button' | 'submit' }) {
  const cls = cn(
    buttonVariants({ variant: 'ghost', size: size === 'small' ? 'icon-sm' : size === 'large' ? 'icon-lg' : 'icon' }),
    'rounded-[10px] text-muted-foreground hover:text-foreground [&_svg:not([class*=size-])]:size-5',
    color && color !== 'default' && TONE[color as Color],
    edge === 'end' && '-mr-1.5',
    edge === 'start' && '-ml-1.5',
    className,
  );
  return host(rest, cls, children);
}

/** An unstyled, keyboard-accessible click target. */
export function ButtonBase({ className, children, ...rest }: Common & { onClick?: (e: MouseEvent<HTMLElement>) => void; type?: 'button' | 'submit' }) {
  return host(rest, cn('inline-flex cursor-pointer items-center justify-center text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-default disabled:opacity-50', className), children);
}

export function Link({ underline = 'hover', color, variant: _v, className, children, ...rest }: Common & { underline?: 'none' | 'hover' | 'always'; color?: string; variant?: string; target?: string; rel?: string }) {
  const cls = cn(
    'font-medium text-teal-ink underline-offset-4',
    underline === 'always' && 'underline',
    underline === 'hover' && 'hover:underline',
    color === 'inherit' && 'text-inherit',
    color === 'text.secondary' && 'text-muted-foreground',
    className,
  );
  return host({ component: rest.component ?? 'a', ...rest }, cls, children);
}

// Toggle buttons: a row of pressed/unpressed buttons sharing one value.
type ToggleCtx = { value: unknown; exclusive?: boolean; size?: string; disabled?: boolean; onToggle: (e: MouseEvent<HTMLElement>, v: unknown) => void };
const ToggleContext = createContext<ToggleCtx | null>(null);

export function ToggleButtonGroup({
  value,
  exclusive,
  onChange,
  size,
  disabled,
  orientation,
  fullWidth,
  className,
  children,
  ...rest
}: Common & { value: unknown; exclusive?: boolean; onChange?: (e: MouseEvent<HTMLElement>, v: never) => void; size?: 'small' | 'medium' | 'large'; orientation?: 'horizontal' | 'vertical'; fullWidth?: boolean }) {
  const onToggle = (e: MouseEvent<HTMLElement>, v: unknown) => {
    let next: unknown;
    if (exclusive) next = value === v ? null : v;
    else {
      const arr = Array.isArray(value) ? value : [];
      next = arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
    }
    onChange?.(e, next as never);
  };
  return (
    <ToggleContext.Provider value={{ value, exclusive, size, disabled, onToggle }}>
      <div role="group" className={cn('inline-flex rounded-[10px] border bg-card p-0.5', orientation === 'vertical' && 'flex-col', fullWidth && 'flex w-full [&>*]:flex-1', className)} {...(rest as HTMLAttributes<HTMLDivElement>)}>
        {children}
      </div>
    </ToggleContext.Provider>
  );
}

export function ToggleButton({ value, selected, onClick, disabled, className, children, ...rest }: Common & { value: unknown; selected?: boolean; onClick?: (e: MouseEvent<HTMLElement>, v: unknown) => void }) {
  const ctx = useContext(ToggleContext);
  const on = selected ?? (ctx ? (Array.isArray(ctx.value) ? ctx.value.includes(value) : ctx.value === value) : false);
  return (
    <button
      type="button"
      aria-pressed={on}
      value={typeof value === 'string' ? value : undefined}
      disabled={disabled ?? ctx?.disabled}
      onClick={(e) => {
        onClick?.(e, value);
        if (!e.defaultPrevented) ctx?.onToggle(e, value);
      }}
      className={cn(
        'inline-flex items-center justify-center gap-1.5 rounded-[8px] font-medium whitespace-nowrap text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50 aria-pressed:bg-secondary aria-pressed:text-foreground aria-pressed:shadow-sm [&_svg]:size-4',
        ctx?.size === 'small' ? 'h-7 px-2.5 text-[12.5px]' : 'h-8 px-3 text-[13px]',
        className,
      )}
      {...(rest as HTMLAttributes<HTMLButtonElement>)}
    >
      {children}
    </button>
  );
}

/** Adds props to every element child (used by the stepper and tabs to hand out indexes). */
export function mapChildren(children: ReactNode, fn: (child: ReactElement<Record<string, unknown>>, index: number) => ReactNode) {
  let i = 0;
  return Children.map(children, (c) => (isValidElement(c) ? fn(c as ReactElement<Record<string, unknown>>, i++) : c));
}
export { cloneElement };
