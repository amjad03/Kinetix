'use client';

import Button, { type ButtonProps } from '@mui/material/Button';
import Link from 'next/link';

/** An MUI button that navigates with next/link. Usable from server components. */
export function LinkButton({ href, ...props }: Omit<ButtonProps, 'href'> & { href: string }) {
  return <Button component={Link} href={href} {...props} />;
}
