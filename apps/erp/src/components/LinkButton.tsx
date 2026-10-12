import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';
import { Button } from '@/components/shadcn/button';

type Variant = 'contained' | 'outlined' | 'text';

/**
 * A button that navigates with next/link. Usable from server components. Keeps the old props
 * (variant contained/outlined/text, size, startIcon, endIcon, color) on the shadcn Button.
 */
export function LinkButton({
  href,
  variant = 'text',
  size = 'medium',
  startIcon,
  endIcon,
  color,
  children,
  className,
  fullWidth,
  disabled,
  ...rest
}: Omit<ComponentProps<typeof Link>, 'href' | 'color'> & {
  href: string;
  variant?: Variant;
  size?: 'small' | 'medium' | 'large';
  startIcon?: ReactNode;
  endIcon?: ReactNode;
  color?: 'primary' | 'secondary' | 'inherit' | 'error' | 'warning' | 'success' | 'info';
  fullWidth?: boolean;
  disabled?: boolean;
  /** Ignored (MUI styling prop kept for compatibility). */
  sx?: unknown;
}) {
  const v = color === 'error' ? (variant === 'contained' ? 'destructive' : 'outline') : variant === 'contained' ? 'default' : variant === 'outlined' ? 'outline' : 'ghost';
  delete (rest as { sx?: unknown }).sx;
  return (
    <Button asChild variant={v} size={size === 'small' ? 'sm' : size === 'large' ? 'lg' : 'default'} className={[fullWidth ? 'w-full' : '', variant === 'text' ? 'text-foreground' : '', disabled ? 'pointer-events-none opacity-50' : '', className ?? ''].join(' ')}>
      <Link href={href} aria-disabled={disabled || undefined} {...rest}>
        {startIcon && <span aria-hidden className="inline-flex [&_svg]:!size-4">{startIcon}</span>}
        {children}
        {endIcon && <span aria-hidden className="inline-flex [&_svg]:!size-4">{endIcon}</span>}
      </Link>
    </Button>
  );
}
