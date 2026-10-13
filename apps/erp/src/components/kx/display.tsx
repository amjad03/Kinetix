'use client';

import { CircleAlert, CircleCheck, Info, Loader2, TriangleAlert, X } from 'lucide-react';
import { createContext, createElement, isValidElement, useContext, useEffect, useRef, type ElementType, type HTMLAttributes, type MouseEvent, type ReactElement, type ReactNode, type TdHTMLAttributes } from 'react';
import { toast } from 'sonner';
import { Tooltip as TooltipRoot, TooltipContent, TooltipTrigger } from '@/components/shadcn/tooltip';
import { cn } from '@/lib/utils';

type Rest = { className?: string; children?: ReactNode; [prop: string]: unknown };
type Severity = 'error' | 'warning' | 'info' | 'success';

const ALERT: Record<Severity, string> = {
  error: 'bg-red-soft text-red-ink border-red/25',
  warning: 'bg-amber-soft text-amber-ink border-amber/30',
  info: 'bg-blue-soft text-blue-ink border-blue-ink/20',
  success: 'bg-green-soft text-green-ink border-green/30',
};
const ALERT_ICON: Record<Severity, ElementType> = { error: CircleAlert, warning: TriangleAlert, info: Info, success: CircleCheck };

/** A message box. role="alert" unless the caller says otherwise. */
export function Alert({ severity = 'success', variant = 'standard', icon, action, onClose, className, children, role = 'alert', ...rest }: Rest & { severity?: Severity; variant?: 'standard' | 'outlined' | 'filled'; icon?: ReactNode | false; action?: ReactNode; onClose?: (e: MouseEvent) => void; role?: string }) {
  const Icon = ALERT_ICON[severity];
  return (
    <div role={role} className={cn('flex items-start gap-2.5 rounded-[10px] border px-3.5 py-2.5 text-[13px] leading-5', ALERT[severity], variant === 'outlined' && 'bg-transparent', className)} {...rest}>
      {icon !== false && <span className="mt-px flex shrink-0 [&_svg]:size-[18px]">{icon ?? <Icon aria-hidden />}</span>}
      <div className="min-w-0 flex-1 py-px">{children}</div>
      {action && <div className="-my-1 ml-auto flex shrink-0 items-center">{action}</div>}
      {onClose && !action && (
        <button type="button" aria-label="Close" onClick={onClose} className="-my-0.5 ml-auto shrink-0 rounded-md p-0.5 opacity-70 hover:opacity-100">
          <X className="size-4" />
        </button>
      )}
    </div>
  );
}

export function AlertTitle({ className, ...rest }: Rest) {
  return <div className={cn('mb-0.5 font-semibold', className)} {...(rest as HTMLAttributes<HTMLDivElement>)} />;
}

export function CircularProgress({ size = 40, color: _c, className, thickness: _t, ...rest }: Rest & { size?: number | string; color?: string; thickness?: number }) {
  return (
    <span role="progressbar" className={cn('inline-flex shrink-0 text-teal', _c === 'inherit' && 'text-inherit', className)} {...rest}>
      <Loader2 className="animate-spin" style={{ width: size, height: size }} aria-hidden />
    </span>
  );
}

export function LinearProgress({ variant = 'indeterminate', value = 0, color: _c, className, ...rest }: Rest & { variant?: 'determinate' | 'indeterminate' | 'buffer'; value?: number; color?: string }) {
  const det = variant !== 'indeterminate';
  return (
    <div role="progressbar" aria-valuenow={det ? Math.round(value) : undefined} aria-valuemin={0} aria-valuemax={100} className={cn('relative h-1 w-full overflow-hidden rounded-full bg-teal-soft', className)} {...rest}>
      <div className={cn('h-full rounded-full bg-teal transition-[width]', !det && 'w-1/3 animate-[kx-slide_1.2s_ease-in-out_infinite]')} style={det ? { width: `${value}%` } : undefined} />
    </div>
  );
}

/** A transient message, shown through the app's sonner toaster while `open` is true. */
export function Snackbar({ open, message, children, autoHideDuration, onClose }: { open: boolean; message?: ReactNode; children?: ReactNode; autoHideDuration?: number | null; onClose?: (e: unknown, reason: 'timeout' | 'clickaway' | 'escapeKeyDown') => void; anchorOrigin?: unknown; action?: ReactNode }) {
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });
  const content = message ?? children;
  useEffect(() => {
    if (!open || !content) return;
    // An <Alert> child keeps its severity.
    const el = isValidElement(content) ? (content as ReactElement<{ severity?: Severity; children?: ReactNode }>) : null;
    const sev = el?.props.severity;
    const body = el && sev ? el.props.children : content;
    const opts = { duration: autoHideDuration ?? Infinity, onAutoClose: () => close.current?.(null, 'timeout'), onDismiss: () => close.current?.(null, 'escapeKeyDown') };
    const id = sev ? toast[sev](body, opts) : toast(body, opts);
    return () => {
      toast.dismiss(id);
    };
  }, [open, content, autoHideDuration]);
  return null;
}

export function Collapse({ in: shown, unmountOnExit: _u, className, children, timeout: _t, ...rest }: Rest & { in?: boolean; unmountOnExit?: boolean; timeout?: unknown }) {
  if (!shown) return null;
  return (
    <div className={cn('animate-in fade-in-0', className)} {...(rest as HTMLAttributes<HTMLDivElement>)}>
      {children}
    </div>
  );
}

export function Tooltip({ title, placement = 'top', children, followCursor: _f, arrow: _a, enterDelay: _e, describeChild: _d }: { title: ReactNode; placement?: string; children: ReactElement; followCursor?: boolean; arrow?: boolean; enterDelay?: number; describeChild?: boolean }) {
  if (title === '' || title === null || title === undefined || title === false) return children;
  const side = (placement.split('-')[0] as 'top' | 'bottom' | 'left' | 'right') ?? 'top';
  return (
    <TooltipRoot>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side}>{title}</TooltipContent>
    </TooltipRoot>
  );
}

export function Avatar({ className, children, src, alt, ...rest }: Rest & { src?: string; alt?: string }) {
  return (
    <span className={cn('inline-flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-sm font-medium', className)} {...(rest as HTMLAttributes<HTMLSpanElement>)}>
      {src ? <img src={src} alt={alt ?? ''} className="size-full object-cover" /> : children}
    </span>
  );
}

const CHIP_SOFT: Record<string, string> = {
  default: 'bg-secondary text-secondary-foreground',
  primary: 'bg-teal-soft text-teal-ink',
  secondary: 'bg-secondary text-secondary-foreground',
  error: 'bg-red-soft text-red-ink',
  warning: 'bg-amber-soft text-amber-ink',
  success: 'bg-green-soft text-green-ink',
  info: 'bg-blue-soft text-blue-ink',
};
const CHIP_LINE: Record<string, string> = {
  default: 'border-border-strong text-foreground',
  primary: 'border-teal/50 text-teal-ink',
  secondary: 'border-border-strong text-foreground',
  error: 'border-red/50 text-red-ink',
  warning: 'border-amber/50 text-amber-ink',
  success: 'border-green/50 text-green-ink',
  info: 'border-blue-ink/40 text-blue-ink',
};

/** A compact label (a badge); a button when it has onClick, a link with href. */
export function Chip({ label, size = 'medium', variant = 'filled', color = 'default', icon, onClick, onDelete, clickable, component, href, className, ...rest }: Rest & { label: ReactNode; size?: 'small' | 'medium'; variant?: 'filled' | 'outlined'; color?: string; icon?: ReactNode; onClick?: (e: MouseEvent<HTMLElement>) => void; onDelete?: () => void; clickable?: boolean; component?: ElementType; href?: string }) {
  const tag = component ?? (href ? 'a' : onClick ? 'button' : 'span');
  const cls = cn(
    'inline-flex max-w-full shrink-0 items-center gap-1 rounded-full border border-transparent font-medium whitespace-nowrap [&_svg]:size-3.5',
    size === 'small' ? 'h-[22px] px-2 text-[11.5px]' : 'h-7 px-3 text-[12.5px]',
    variant === 'outlined' ? cn('bg-transparent', CHIP_LINE[color] ?? CHIP_LINE.default) : (CHIP_SOFT[color] ?? CHIP_SOFT.default),
    (onClick || href || clickable) && 'cursor-pointer outline-none hover:opacity-85 focus-visible:ring-[3px] focus-visible:ring-ring/50',
    className,
  );
  return createElement(
    tag,
    { className: cls, onClick, href, type: tag === 'button' ? 'button' : undefined, ...rest },
    icon,
    <span className="truncate">{label}</span>,
    onDelete && (
      <span role="button" tabIndex={-1} aria-label="Remove" onClick={(e) => (e.stopPropagation(), onDelete())} className="-mr-1 rounded-full p-0.5 hover:bg-black/10">
        <X className="size-3" />
      </span>
    ),
  );
}

export function Card({ component = 'div', variant: _v, className, ...rest }: Rest & { component?: ElementType; variant?: string }) {
  return createElement(component, { className: cn('rounded-[14px] border bg-card shadow-card', className), ...rest });
}
export function CardContent({ className, ...rest }: Rest) {
  return <div className={cn('p-5', className)} {...(rest as HTMLAttributes<HTMLDivElement>)} />;
}
export function CardActionArea({ component, href, className, ...rest }: Rest & { component?: ElementType; href?: string; onClick?: (e: MouseEvent<HTMLElement>) => void }) {
  const tag = component ?? (href ? 'a' : 'button');
  return createElement(tag, { href, type: tag === 'button' ? 'button' : undefined, className: cn('block w-full rounded-[inherit] text-left transition-colors outline-none hover:bg-accent/50 focus-visible:ring-[3px] focus-visible:ring-ring/50', className), ...rest });
}

// Tables.
const HeadCtx = createContext(false);
const SizeCtx = createContext<'small' | 'medium'>('medium');

export function TableContainer({ component = 'div', className, ...rest }: Rest & { component?: ElementType }) {
  return createElement(component, { className: cn('w-full overflow-x-auto', className), ...rest });
}
export function Table({ size = 'medium', stickyHeader, className, ...rest }: Rest & { size?: 'small' | 'medium'; stickyHeader?: boolean }) {
  return (
    <SizeCtx.Provider value={size}>
      <table className={cn('w-full border-collapse text-[13.5px]', stickyHeader && '[&_thead_th]:sticky [&_thead_th]:top-0 [&_thead_th]:z-[1] [&_thead_th]:bg-card', className)} {...(rest as HTMLAttributes<HTMLTableElement>)} />
    </SizeCtx.Provider>
  );
}
export function TableHead({ className, ...rest }: Rest) {
  return (
    <HeadCtx.Provider value>
      <thead className={className} {...(rest as HTMLAttributes<HTMLTableSectionElement>)} />
    </HeadCtx.Provider>
  );
}
export function TableBody({ className, ...rest }: Rest) {
  return <tbody className={cn('[&>tr:last-child>td]:border-b-0', className)} {...(rest as HTMLAttributes<HTMLTableSectionElement>)} />;
}
export function TableFooter({ className, ...rest }: Rest) {
  return <tfoot className={cn('font-medium', className)} {...(rest as HTMLAttributes<HTMLTableSectionElement>)} />;
}
export function TableRow({ hover, selected, className, ...rest }: Rest & { hover?: boolean; selected?: boolean }) {
  return <tr aria-selected={selected || undefined} className={cn(hover && 'hover:bg-muted/50', selected && 'bg-teal-soft/60', className)} {...(rest as HTMLAttributes<HTMLTableRowElement>)} />;
}
export function TableCell({ align, padding, component, variant, className, ...rest }: Rest & { align?: 'left' | 'right' | 'center' | 'inherit' | 'justify'; padding?: 'none' | 'checkbox' | 'normal'; component?: ElementType; variant?: 'head' | 'body'; scope?: string; colSpan?: number }) {
  const head = useContext(HeadCtx) || variant === 'head';
  const small = useContext(SizeCtx) === 'small';
  const tag = component ?? (head ? 'th' : 'td');
  return createElement(tag, {
    scope: head && tag === 'th' ? 'col' : undefined,
    className: cn(
      'border-b text-left align-middle',
      padding === 'none' ? 'p-0' : padding === 'checkbox' ? 'w-12 px-2' : small ? 'px-3 py-2' : head ? 'px-3.5 py-2.5' : 'px-3.5 py-3',
      head && 'text-[12.5px] font-[550] whitespace-nowrap text-muted-foreground',
      align === 'right' && 'text-right',
      align === 'center' && 'text-center',
      className,
    ),
    ...(rest as TdHTMLAttributes<HTMLTableCellElement>),
  });
}

// Lists.
export function List({ dense: _d, disablePadding, component = 'ul', className, ...rest }: Rest & { dense?: boolean; disablePadding?: boolean; component?: ElementType }) {
  return createElement(component, { className: cn('m-0 list-none', !disablePadding && 'py-1', className), ...rest });
}
export function ListItem({ secondaryAction, divider, disableGutters, className, children, ...rest }: Rest & { secondaryAction?: ReactNode; divider?: boolean; disableGutters?: boolean }) {
  return (
    <li className={cn('flex items-center gap-3 py-2', !disableGutters && 'px-4', divider && 'border-b', className)} {...(rest as HTMLAttributes<HTMLLIElement>)}>
      {children}
      {secondaryAction && <div className="ml-auto shrink-0">{secondaryAction}</div>}
    </li>
  );
}
export function ListItemText({ primary, secondary, className, children }: Rest & { primary?: ReactNode; secondary?: ReactNode }) {
  return (
    <div className={cn('min-w-0 flex-1', className)}>
      <div className="text-sm">{primary ?? children}</div>
      {secondary && <div className="text-[13px] text-muted-foreground">{secondary}</div>}
    </div>
  );
}
export function ListItemIcon({ className, ...rest }: Rest) {
  return <span className={cn('inline-flex min-w-8 shrink-0 text-muted-foreground [&_svg]:size-5', className)} {...(rest as HTMLAttributes<HTMLSpanElement>)} />;
}
export function ListSubheader({ className, ...rest }: Rest) {
  return <li className={cn('px-3 pt-2 pb-1 text-xs font-medium text-muted-foreground', className)} {...(rest as HTMLAttributes<HTMLLIElement>)} />;
}
