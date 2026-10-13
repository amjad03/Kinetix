'use client';

import { Check } from 'lucide-react';
import { Dialog as D, Popover as P } from 'radix-ui';
import { createContext, createElement, useContext, useEffect, useRef, type ElementType, type HTMLAttributes, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { cloneElement, mapChildren } from './button';

type Rest = { className?: string; children?: ReactNode; [prop: string]: unknown };
type CloseReason = 'backdropClick' | 'escapeKeyDown';

const WIDTH: Record<string, string> = { xs: 'sm:max-w-[444px]', sm: 'sm:max-w-[600px]', md: 'sm:max-w-[900px]', lg: 'sm:max-w-[1200px]', xl: 'sm:max-w-[1536px]' };

/** A modal dialog (Radix): focus is trapped and restored; Escape and the backdrop call onClose. */
export function Dialog({
  open,
  onClose,
  maxWidth = 'sm',
  fullWidth,
  fullScreen,
  scroll: _s,
  className,
  children,
  'aria-labelledby': labelledBy,
  ...rest
}: Rest & { open: boolean; onClose?: (e: unknown, reason: CloseReason) => void; maxWidth?: keyof typeof WIDTH | false; fullWidth?: boolean; fullScreen?: boolean; scroll?: 'paper' | 'body'; 'aria-labelledby'?: string }) {
  return (
    <D.Root open={open} onOpenChange={(o) => !o && onClose?.({}, 'escapeKeyDown')}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-black/40 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
        <D.Content
          aria-labelledby={labelledBy}
          aria-describedby={undefined}
          className={cn(
            'fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100dvh-32px)] w-[calc(100%-32px)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-[14px] border bg-card p-2 text-card-foreground shadow-[0_20px_50px_-12px_rgba(16,24,40,.25)] outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
            maxWidth ? WIDTH[maxWidth] : 'sm:max-w-fit',
            !fullWidth && 'sm:w-auto sm:min-w-[360px]',
            fullScreen && 'h-dvh max-h-none w-screen max-w-none rounded-none',
            className,
          )}
          {...(rest as HTMLAttributes<HTMLDivElement>)}
        >
          {children}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

export function DialogTitle({ className, component: _c, ...rest }: Rest & { id?: string; component?: ElementType }) {
  return <D.Title className={cn('px-4 pt-3 pb-2 text-xl leading-7 font-semibold', className)} {...(rest as HTMLAttributes<HTMLHeadingElement>)} />;
}
export function DialogContent({ dividers, className, ...rest }: Rest & { dividers?: boolean }) {
  return <div className={cn('min-h-0 flex-1 overflow-y-auto px-4 py-2', dividers && 'border-y py-4', className)} {...(rest as HTMLAttributes<HTMLDivElement>)} />;
}
export function DialogContentText({ className, ...rest }: Rest) {
  return <p className={cn('text-sm leading-[21px] text-muted-foreground', className)} {...(rest as HTMLAttributes<HTMLParagraphElement>)} />;
}
export function DialogActions({ className, disableSpacing: _d, ...rest }: Rest & { disableSpacing?: boolean }) {
  return <div className={cn('flex flex-wrap items-center justify-end gap-2 px-4 pt-3 pb-4', className)} {...(rest as HTMLAttributes<HTMLDivElement>)} />;
}

// A menu opened from an anchor element (the button the user clicked).
type MenuCtxT = { close: () => void } | null;
export const MenuCtx = createContext<MenuCtxT>(null);

export function Menu({ anchorEl, open, onClose, anchorOrigin, children, className, ...rest }: Rest & { anchorEl: Element | null | undefined; open: boolean; onClose: () => void; anchorOrigin?: { horizontal?: string; vertical?: string }; transformOrigin?: unknown; slotProps?: unknown }) {
  const align = anchorOrigin?.horizontal === 'right' ? 'end' : anchorOrigin?.horizontal === 'center' ? 'center' : 'start';
  return (
    <P.Root open={open && !!anchorEl} onOpenChange={(o) => !o && onClose()}>
      <P.Anchor virtualRef={{ current: (anchorEl ?? null) as HTMLElement }} />
      <P.Portal>
        <P.Content
          align={align}
          sideOffset={4}
          collisionPadding={8}
          role="menu"
          onKeyDown={(e: KeyboardEvent<HTMLDivElement>) => {
            if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
            e.preventDefault();
            const items = [...e.currentTarget.querySelectorAll<HTMLElement>('[role=menuitem]:not([aria-disabled=true])')];
            const i = items.indexOf(document.activeElement as HTMLElement);
            items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
          }}
          className={cn('z-50 min-w-[180px] rounded-[12px] border bg-popover p-1.5 text-popover-foreground shadow-[0_20px_50px_-12px_rgba(16,24,40,.25)] outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0', className)}
          {...(rest as HTMLAttributes<HTMLDivElement>)}
        >
          <MenuCtx.Provider value={{ close: onClose }}>{children}</MenuCtx.Provider>
        </P.Content>
      </P.Portal>
    </P.Root>
  );
}

// Tabs over a value: role=tablist with arrow-key movement.
type TabsCtxT = { value: unknown; onChange?: (e: MouseEvent<HTMLElement>, v: never) => void };
const TabsCtx = createContext<TabsCtxT | null>(null);

export function Tabs({ value, onChange, className, children, variant: _v, scrollButtons: _s, allowScrollButtonsMobile: _a, centered, ...rest }: Rest & { value: unknown; onChange?: (e: MouseEvent<HTMLElement>, v: never) => void; variant?: string; scrollButtons?: unknown; allowScrollButtonsMobile?: boolean; centered?: boolean }) {
  const list = useRef<HTMLDivElement>(null);
  // Keep the selected tab in view when the row is wider than its box.
  useEffect(() => {
    const el = list.current;
    const on = el?.querySelector<HTMLElement>('[role=tab][aria-selected=true]');
    if (!el || !on) return;
    if (on.offsetLeft < el.scrollLeft || on.offsetLeft + on.offsetWidth > el.scrollLeft + el.clientWidth) el.scrollLeft = on.offsetLeft - 16;
  }, [value]);
  return (
    <TabsCtx.Provider value={{ value, onChange }}>
      <div
        ref={list}
        role="tablist"
        className={cn('flex min-w-0 max-w-full gap-1 overflow-x-auto overscroll-x-contain border-b [scrollbar-width:thin] [scrollbar-color:var(--border)_transparent]', centered && 'justify-center', className)}
        onKeyDown={(e) => {
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
          const tabs = [...e.currentTarget.querySelectorAll<HTMLElement>('[role=tab]')];
          const i = tabs.indexOf(document.activeElement as HTMLElement);
          const n = e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : (i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
          tabs[n]?.focus();
          e.preventDefault();
        }}
        {...(rest as HTMLAttributes<HTMLDivElement>)}
      >
        {mapChildren(children, (c, i) => cloneElement(c, { __index: i }))}
      </div>
    </TabsCtx.Provider>
  );
}

export function Tab({ value, label, icon, iconPosition: _p, component, href, __index, className, onClick, disabled, ...rest }: Rest & { value?: unknown; label?: ReactNode; icon?: ReactNode; iconPosition?: string; component?: ElementType; href?: string; __index?: number; onClick?: (e: MouseEvent<HTMLElement>) => void; disabled?: boolean }) {
  const ctx = useContext(TabsCtx);
  const v = value ?? __index;
  const selected = ctx?.value === v;
  const tag = component ?? (href ? 'a' : 'button');
  return createElement(
    tag,
    {
      role: 'tab',
      type: tag === 'button' ? 'button' : undefined,
      href,
      disabled,
      'aria-selected': selected,
      tabIndex: selected ? 0 : -1,
      onClick: (e: MouseEvent<HTMLElement>) => {
        onClick?.(e);
        ctx?.onChange?.(e, v as never);
      },
      className: cn(
        '-mb-px inline-flex min-h-10 shrink-0 items-center gap-1.5 border-b-2 border-transparent px-3 text-[13.5px] font-[550] whitespace-nowrap text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-selected:border-teal aria-selected:text-foreground [&_svg]:size-[18px]',
        className,
      ),
      ...rest,
    },
    icon,
    label,
  );
}

// Stepper: vertical or horizontal; Step gets its index and active/completed state from context.
type StepperCtxT = { active: number; vertical: boolean; nonLinear?: boolean };
const StepperCtx = createContext<StepperCtxT>({ active: 0, vertical: false });
type StepCtxT = { index: number; active: boolean; completed: boolean; last: boolean };
const StepCtx = createContext<StepCtxT>({ index: 0, active: false, completed: false, last: false });

export function Stepper({ activeStep = 0, orientation = 'horizontal', nonLinear, className, children, ...rest }: Rest & { activeStep?: number; orientation?: 'horizontal' | 'vertical'; nonLinear?: boolean; alternativeLabel?: boolean }) {
  const count = mapChildren(children, (c) => c)?.length ?? 0;
  return (
    <StepperCtx.Provider value={{ active: activeStep, vertical: orientation === 'vertical', nonLinear }}>
      <ol className={cn('m-0 flex list-none p-0', orientation === 'vertical' ? 'flex-col' : 'flex-row flex-wrap gap-4', className)} {...(rest as HTMLAttributes<HTMLOListElement>)}>
        {mapChildren(children, (c, i) => cloneElement(c, { __index: i, __last: i === count - 1 }))}
      </ol>
    </StepperCtx.Provider>
  );
}

export function Step({ __index = 0, __last = false, completed, active, className, children, ...rest }: Rest & { __index?: number; __last?: boolean; completed?: boolean; active?: boolean }) {
  const s = useContext(StepperCtx);
  const isActive = active ?? s.active === __index;
  const done = completed ?? (!s.nonLinear && __index < s.active);
  return (
    <StepCtx.Provider value={{ index: __index, active: isActive, completed: done, last: __last }}>
      <li className={cn('relative', s.vertical && 'pb-2', className)} data-active={isActive || undefined} data-completed={done || undefined} {...(rest as HTMLAttributes<HTMLLIElement>)}>
        {children}
      </li>
    </StepCtx.Provider>
  );
}

function StepIcon() {
  const st = useContext(StepCtx);
  return (
    <span className={cn('inline-flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold', st.completed || st.active ? 'bg-teal text-white' : 'bg-muted text-muted-foreground')}>
      {st.completed ? <Check className="size-3.5" /> : st.index + 1}
    </span>
  );
}

export function StepLabel({ className, children, optional }: Rest & { optional?: ReactNode }) {
  const st = useContext(StepCtx);
  return (
    <span className={cn('flex items-center gap-2.5 text-sm', st.active ? 'font-semibold' : 'text-muted-foreground', className)}>
      <StepIcon />
      <span>
        {children}
        {optional && <span className="block text-xs text-muted-foreground">{optional}</span>}
      </span>
    </span>
  );
}

export function StepButton({ className, children, onClick, optional, ...rest }: Rest & { onClick?: (e: MouseEvent<HTMLElement>) => void; optional?: ReactNode }) {
  const st = useContext(StepCtx);
  return (
    <button type="button" onClick={onClick} aria-current={st.active ? 'step' : undefined} className={cn('-mx-2 flex w-[calc(100%+16px)] items-center rounded-[10px] px-2 py-1.5 text-left hover:bg-accent/60', className)} {...(rest as HTMLAttributes<HTMLButtonElement>)}>
      <StepLabel optional={optional}>{children}</StepLabel>
    </button>
  );
}

export function StepContent({ className, children }: Rest) {
  const st = useContext(StepCtx);
  return <div className={cn('ml-3 border-l pl-5', st.last && 'border-l-transparent', className)}>{st.active ? <div className="py-2">{children}</div> : null}</div>;
}
