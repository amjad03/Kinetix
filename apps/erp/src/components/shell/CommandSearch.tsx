'use client';

import GroupsOutlined from '@mui/icons-material/GroupsOutlined';
import KeyboardReturn from '@mui/icons-material/KeyboardReturn';
import SearchOutlined from '@mui/icons-material/SearchOutlined';
import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import Dialog from '@mui/material/Dialog';
import InputBase from '@mui/material/InputBase';
import Typography from '@mui/material/Typography';
import type { SvgIconComponent } from '@mui/icons-material';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useMemo, useState } from 'react';
import { useI18n } from '@/i18n/client';
import { matchesQuery } from '@/lib/table';
import type { NavGroup } from '@/lib/nav';
import { NAV_ICONS } from './icons';

interface Hit {
  key: string;
  href: string;
  label: string;
  hint: string;
  icon: SvgIconComponent;
}

/**
 * Global search: a field in the top bar that opens a command palette (also Ctrl/⌘ K). It finds any
 * page the person may open, and offers to search students for what they typed. Arrow keys move,
 * Enter opens, Escape closes. The list is a listbox with aria-activedescendant.
 */
export function CommandSearch({ groups, canSearchStudents }: { groups: NavGroup[]; canSearchStudents: boolean }) {
  const { t } = useI18n();
  const router = useRouter();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen(true);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const hits = useMemo<Hit[]>(() => {
    const pages = groups.flatMap((g) => g.items.map((i) => ({ key: i.href, href: i.href, label: t(i.label), hint: t(g.label), icon: NAV_ICONS[i.icon] })));
    const found = q.trim() ? pages.filter((p) => matchesQuery(`${p.label} ${p.hint}`, q)) : pages.slice(0, 8);
    const term = q.trim();
    const extra: Hit[] = canSearchStudents && term ? [{ key: 'students-search', href: `/students?q=${encodeURIComponent(term.slice(0, 60))}`, label: t('shell.searchStudents', { q: term }), hint: t('nav.students'), icon: GroupsOutlined }] : [];
    return [...extra, ...found];
  }, [groups, q, t, canSearchStudents]);

  const close = () => {
    setOpen(false);
    setQ('');
    setActive(0);
  };
  const go = (h: Hit | undefined) => {
    if (!h) return;
    close();
    router.push(h.href);
  };

  return (
    <>
      <ButtonBase
        onClick={() => setOpen(true)}
        aria-label={t('shell.search')}
        aria-keyshortcuts="Control+K Meta+K"
        sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%', maxWidth: 440, height: 40, px: 1.5, borderRadius: '10px', bgcolor: 'm3.surfaceContainerLow', border: 1, borderColor: 'm3.outlineVariant', color: 'text.secondary', justifyContent: 'flex-start', '&:hover': { borderColor: 'm3.outline' } }}
      >
        <SearchOutlined fontSize="small" />
        <Typography component="span" noWrap sx={{ flex: 1, textAlign: 'left', fontSize: '0.875rem' }}>
          {t('shell.searchPlaceholder')}
        </Typography>
        <Box component="kbd" sx={{ display: { xs: 'none', md: 'inline-block' }, fontFamily: 'inherit', fontSize: '0.6875rem', px: 0.75, py: 0.25, borderRadius: '6px', border: 1, borderColor: 'm3.outlineVariant', bgcolor: 'kx.pane' }}>
          Ctrl K
        </Box>
      </ButtonBase>
      <Dialog open={open} onClose={close} fullWidth maxWidth="sm" aria-label={t('shell.search')} slotProps={{ paper: { sx: { alignSelf: 'flex-start', mt: { xs: 2, sm: 10 }, p: 0, overflow: 'hidden' } } }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: 2, borderBottom: 1, borderColor: 'm3.outlineVariant' }}>
          <SearchOutlined sx={{ color: 'text.secondary' }} />
          <InputBase
            autoFocus
            fullWidth
            value={q}
            placeholder={t('shell.searchPlaceholder')}
            onChange={(e) => {
              setQ(e.target.value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') setActive((a) => Math.min(a + 1, hits.length - 1));
              else if (e.key === 'ArrowUp') setActive((a) => Math.max(a - 1, 0));
              else if (e.key === 'Enter') go(hits[active]);
              else return;
              e.preventDefault();
            }}
            inputProps={{ role: 'combobox', 'aria-expanded': true, 'aria-controls': `${id}-list`, 'aria-activedescendant': hits[active] ? `${id}-${active}` : undefined, 'aria-label': t('shell.search'), autoComplete: 'off' }}
            sx={{ height: 56, fontSize: '1rem' }}
          />
        </Box>
        <Box component="ul" role="listbox" id={`${id}-list`} aria-label={t('shell.searchResults')} sx={{ listStyle: 'none', m: 0, p: 1, maxHeight: 360, overflowY: 'auto' }}>
          {hits.length === 0 && (
            <Typography role="status" variant="body2" color="text.secondary" sx={{ p: 2 }}>
              {t('shell.searchNone')}
            </Typography>
          )}
          {hits.map((h, i) => (
            <Box
              component="li"
              role="option"
              id={`${id}-${i}`}
              key={h.key}
              aria-selected={i === active}
              onMouseMove={() => setActive(i)}
              onClick={() => go(h)}
              sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: 1.5, py: 1, borderRadius: '10px', cursor: 'pointer', bgcolor: i === active ? 'm3.primaryContainer' : 'transparent', color: i === active ? 'm3.onPrimaryContainer' : 'text.primary' }}
            >
              <h.icon fontSize="small" />
              <Typography component="span" sx={{ flex: 1, fontSize: '0.9375rem' }}>
                {h.label}
              </Typography>
              <Typography component="span" variant="caption" sx={{ color: 'inherit', opacity: 0.8 }}>
                {h.hint}
              </Typography>
              {i === active && <KeyboardReturn fontSize="small" aria-hidden />}
            </Box>
          ))}
        </Box>
      </Dialog>
    </>
  );
}
