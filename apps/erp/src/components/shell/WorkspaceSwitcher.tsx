'use client';

import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { setWorkspace } from '@/app/shell/actions';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import { WORKSPACES, type Workspace } from '@/lib/workspaces';

/** Picks the console whose pages the menu lists: academic office, finance and operations, quality, content and knowledge, or AI. */
export function WorkspaceSwitcher({ value }: { value: Workspace }) {
  const { t } = useI18n();
  const router = useRouter();
  const [busy, start] = useTransition();
  return (
    <Select
      size="small"
      value={value}
      disabled={busy}
      onChange={(e) =>
        start(async () => {
          await setWorkspace(String(e.target.value));
          router.refresh();
        })
      }
      inputProps={{ 'aria-label': t('g1.ws.label') }}
      data-testid="workspace-switcher"
      sx={{ display: { xs: 'none', md: 'inline-flex' }, minWidth: 150, fontSize: '0.875rem', '.MuiSelect-select': { py: 0.75 } }}
    >
      {WORKSPACES.map((w) => (
        <MenuItem key={w} value={w}>
          {t(`g1.ws.${w}` as MessageKey)}
        </MenuItem>
      ))}
    </Select>
  );
}
