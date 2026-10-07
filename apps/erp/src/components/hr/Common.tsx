'use client';

import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Snackbar from '@mui/material/Snackbar';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useState } from 'react';
import { useI18n } from '@/i18n/client';
import type { MessageKey } from '@/i18n/messages';
import type { ActionResult } from '@/lib/types';

/** Section tabs as links, so each part keeps its own URL. */
export function SectionTabs({ tabs, label }: { tabs: { href: string; label: MessageKey }[]; label: MessageKey }) {
  const pathname = usePathname();
  const { t } = useI18n();
  const current = tabs.find((x) => (x.href === tabs[0].href ? pathname === x.href : pathname.startsWith(x.href)))?.href ?? tabs[0].href;
  return (
    <Box sx={{ borderBottom: 1, borderColor: 'm3.outlineVariant', mb: 3 }}>
      <Tabs value={current} aria-label={t(label)} variant="scrollable" scrollButtons={false}>
        {tabs.map((x) => (
          <Tab key={x.href} value={x.href} label={t(x.label)} component={Link} href={x.href} />
        ))}
      </Tabs>
    </Box>
  );
}

export const HR_TABS: { href: string; label: MessageKey }[] = [
  { href: '/hr', label: 'hr.tab.staff' },
  { href: '/hr/attendance', label: 'hr.tab.attendance' },
  { href: '/hr/leave', label: 'hr.tab.leave' },
  { href: '/hr/recruitment', label: 'hr.tab.recruitment' },
];

/** Runs a server action and shows its outcome: a toast on success, an inline error on failure. */
export function useNotice() {
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(async <T,>(fn: () => Promise<ActionResult<T>>, ok?: string): Promise<ActionResult<T>> => {
    setError(null);
    const r = await fn();
    if (r.ok) {
      if (ok) setToast(ok);
    } else setError(r.error);
    return r;
  }, []);
  const view = (
    <>
      {error && (
        <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 2 }} role="alert">
          {error}
        </Alert>
      )}
      <Snackbar open={!!toast} autoHideDuration={3500} onClose={() => setToast(null)} message={toast} />
    </>
  );
  return { run, view, setError };
}
