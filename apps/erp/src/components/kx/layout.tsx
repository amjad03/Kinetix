import { createElement, type CSSProperties, type ElementType, type HTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Layout and text primitives for the few places whose layout is decided at runtime (a dynamic tag,
 * direction or variant). Static markup uses plain elements with Tailwind classes instead.
 */

type Bp = 'xs' | 'sm' | 'md' | 'lg' | 'xl';
export type Responsive<T> = T | Partial<Record<Bp, T>>;
const PREFIX: Record<Bp, string> = { xs: '', sm: 'sm:', md: 'md:', lg: 'lg:', xl: 'xl:' };

/** Classes for a responsive value; the class names are listed for Tailwind in globals.css (@source inline). */
export function responsive<T>(v: Responsive<T> | undefined, cls: (x: T) => string): string {
  if (v === undefined || v === null) return '';
  if (typeof v === 'object' && !Array.isArray(v)) {
    return Object.entries(v as Record<Bp, T>)
      .filter(([, x]) => x !== undefined && x !== null)
      .map(([bp, x]) => cls(x as T).split(' ').map((c) => PREFIX[bp as Bp] + c).join(' '))
      .join(' ');
  }
  return cls(v as T);
}

export interface BoxProps extends HTMLAttributes<HTMLElement> {
  component?: ElementType;
  children?: ReactNode;
  [prop: string]: unknown;
}

export function Box({ component = 'div', ...props }: BoxProps) {
  return createElement(component, props);
}

export function Stack({
  component = 'div',
  direction = 'column',
  spacing,
  useFlexGap: _g,
  className,
  ...props
}: BoxProps & { direction?: Responsive<'row' | 'column' | 'row-reverse' | 'column-reverse'>; spacing?: Responsive<number>; useFlexGap?: boolean }) {
  const dir = responsive(direction, (d) => ({ row: 'flex-row', column: 'flex-col', 'row-reverse': 'flex-row-reverse', 'column-reverse': 'flex-col-reverse' })[d]);
  const gap = responsive(spacing, (n) => `gap-${n * 2}`);
  return createElement(component, { className: cn('flex', dir, gap, className), ...props });
}

export type TypographyVariant = 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'subtitle1' | 'subtitle2' | 'body1' | 'body2' | 'caption' | 'overline' | 'button' | 'inherit';

export const TYPO: Record<TypographyVariant, string> = {
  h1: 'font-display text-[2.25rem] leading-[44px]',
  h2: 'font-display text-[2rem] leading-10',
  h3: 'font-display text-[1.75rem] leading-9',
  h4: 'font-display text-2xl leading-8',
  h5: 'text-[1.375rem] leading-7',
  h6: 'text-base leading-6 font-medium tracking-[0.1px]',
  subtitle1: 'text-base leading-6 font-medium tracking-[0.1px]',
  subtitle2: 'text-sm leading-5 font-medium tracking-[0.1px]',
  body1: 'text-sm leading-[21px]',
  body2: 'text-[13px] leading-[19px]',
  caption: 'text-xs leading-4 tracking-[0.3px]',
  overline: 'text-[11px] leading-4 font-medium tracking-[0.5px]',
  button: 'text-sm leading-5 font-medium tracking-[0.1px]',
  inherit: '',
};

export const TYPO_TAG: Record<TypographyVariant, string> = {
  h1: 'h1', h2: 'h2', h3: 'h3', h4: 'h4', h5: 'h5', h6: 'h6', subtitle1: 'h6', subtitle2: 'h6', body1: 'p', body2: 'p', caption: 'span', overline: 'span', button: 'span', inherit: 'p',
};

/** Text colours by the names the old palette used. */
export const TEXT_COLOR: Record<string, string> = {
  'text.secondary': 'text-muted-foreground',
  textSecondary: 'text-muted-foreground',
  'text.primary': 'text-foreground',
  textPrimary: 'text-foreground',
  'text.disabled': 'text-faint',
  primary: 'text-teal-ink',
  'primary.main': 'text-teal-ink',
  secondary: 'text-muted-foreground',
  error: 'text-red-ink',
  'error.main': 'text-red-ink',
  warning: 'text-amber-ink',
  'warning.main': 'text-amber-ink',
  success: 'text-green-ink',
  'success.main': 'text-green-ink',
  info: 'text-blue-ink',
  'info.main': 'text-blue-ink',
  inherit: 'text-inherit',
};

export function Typography({
  variant = 'body1',
  component,
  color,
  noWrap,
  gutterBottom,
  className,
  ...props
}: BoxProps & { variant?: TypographyVariant; color?: string; noWrap?: boolean; gutterBottom?: boolean }) {
  return createElement(component ?? TYPO_TAG[variant], {
    className: cn(TYPO[variant], color && TEXT_COLOR[color], noWrap && 'truncate', gutterBottom && 'mb-[0.35em]', className),
    ...props,
  });
}

export function Paper({ component = 'div', variant: _v, className, ...props }: BoxProps & { variant?: 'outlined' | 'elevation' }) {
  return createElement(component, { className: cn('rounded-[12px] border bg-card', className), ...props });
}

export function Divider({ className, orientation = 'horizontal', flexItem: _f, ...props }: HTMLAttributes<HTMLHRElement> & { orientation?: 'horizontal' | 'vertical'; flexItem?: boolean }) {
  return <hr role="separator" aria-orientation={orientation} className={cn('shrink-0 border-0 bg-border', orientation === 'vertical' ? 'w-px self-stretch' : 'h-px w-full', className)} {...props} />;
}

const CONTAINER: Record<string, string> = { xs: 'max-w-[444px]', sm: 'max-w-[600px]', md: 'max-w-[900px]', lg: 'max-w-[1200px]', xl: 'max-w-[1536px]' };
export function Container({ maxWidth = 'lg', className, ...props }: BoxProps & { maxWidth?: keyof typeof CONTAINER | false }) {
  return <div className={cn('mx-auto w-full px-4 sm:px-6', maxWidth && CONTAINER[maxWidth], className)} {...(props as HTMLAttributes<HTMLDivElement>)} />;
}

export type { CSSProperties };
