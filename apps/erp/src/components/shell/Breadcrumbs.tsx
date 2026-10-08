'use client';

import NavigateNext from '@mui/icons-material/NavigateNext';
import Box from '@mui/material/Box';
import Link from 'next/link';
import { Fragment } from 'react';
import { useI18n } from '@/i18n/client';
import type { Crumb } from '@/lib/nav';

/** Where you are: Dashboard › Group › Page › Details. The last item is the current page. */
export function Breadcrumbs({ crumbs }: { crumbs: Crumb[] }) {
  const { t } = useI18n();
  if (crumbs.length === 0) return null;
  return (
    <Box component="nav" className="kx-chrome" aria-label={t('shell.breadcrumb')} sx={{ mb: 1.5 }}>
      <Box component="ol" sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 0.25, listStyle: 'none', m: 0, p: 0, fontSize: '0.8125rem', color: 'text.secondary' }}>
        {crumbs.map((c, i) => {
          const last = i === crumbs.length - 1;
          return (
            <Fragment key={`${c.label}-${i}`}>
              <Box component="li" aria-current={last ? 'page' : undefined} sx={{ display: 'inline-flex', alignItems: 'center', color: last ? 'text.primary' : 'text.secondary', fontWeight: last ? 600 : 400 }}>
                {c.href && !last ? (
                  <Box component={Link} href={c.href} sx={{ color: 'inherit', textDecoration: 'none', borderRadius: '4px', '&:hover': { color: 'm3.primary', textDecoration: 'underline' } }}>
                    {t(c.label)}
                  </Box>
                ) : (
                  t(c.label)
                )}
              </Box>
              {!last && <NavigateNext aria-hidden sx={{ fontSize: 16 }} />}
            </Fragment>
          );
        })}
      </Box>
    </Box>
  );
}
