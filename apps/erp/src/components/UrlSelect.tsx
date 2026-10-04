'use client';

import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import LinearProgress from '@mui/material/LinearProgress';
import ListSubheader from '@mui/material/ListSubheader';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import { usePathname, useRouter } from 'next/navigation';
import { useId, useTransition } from 'react';
import { useI18n } from '@/i18n/client';

export interface UrlOption {
  value: string;
  label: string;
  /** Options with a group get a subheader. */
  group?: string;
}

/**
 * A select whose value lives in the URL (`?param=value`), so the view can be bookmarked.
 * Choosing a value replaces the whole query string. Without `param`, each option's value is
 * itself the query string (`class=…` or `teacher=…`), for one picker over two kinds of thing.
 */
export function UrlSelect({ label, param, value, options, minWidth = 220, testId }: { label: string; param?: string; value: string; options: UrlOption[]; minWidth?: number; testId?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, start] = useTransition();
  const id = useId();
  const { t } = useI18n();
  const items: React.ReactNode[] = [];
  let group: string | undefined;
  for (const o of options) {
    if (o.group && o.group !== group) {
      group = o.group;
      items.push(<ListSubheader key={`g-${o.group}`}>{o.group}</ListSubheader>);
    }
    items.push(
      <MenuItem key={`${o.group ?? ''}${o.value}`} value={o.value}>
        {o.label}
      </MenuItem>,
    );
  }
  return (
    <>
      {pending && <LinearProgress sx={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 2000, height: 3, borderRadius: 0 }} aria-label={t('common.loading')} />}
      <FormControl size="small" sx={{ minWidth }}>
        <InputLabel id={id}>{label}</InputLabel>
        <Select
          labelId={id}
          label={label}
          value={options.some((o) => o.value === value) ? value : ''}
          onChange={(e) => start(() => router.push(`${pathname}?${param ? new URLSearchParams({ [param]: e.target.value }) : e.target.value}`, { scroll: false }))}
          data-testid={testId}
        >
          {items}
        </Select>
      </FormControl>
    </>
  );
}
