'use client';

import ChevronLeft from '@mui/icons-material/ChevronLeft';
import ChevronRight from '@mui/icons-material/ChevronRight';
import ExpandMore from '@mui/icons-material/ExpandMore';
import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import Collapse from '@mui/material/Collapse';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import Link from 'next/link';
import { useState } from 'react';
import { useI18n } from '@/i18n/client';
import { isActivePath, type NavGroup } from '@/lib/nav';
import { NAV_ICONS } from './icons';

/** Width of the sidebar expanded and as an icon rail (px). */
export const SIDEBAR_W = { open: 264, rail: 76 } as const;

const rowSx = (active: boolean, rail: boolean) =>
  ({
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    gap: 1.5,
    minHeight: 44,
    px: rail ? 0 : 1.5,
    justifyContent: rail ? 'center' : 'flex-start',
    borderRadius: '10px',
    textAlign: 'left',
    color: active ? 'm3.onPrimaryContainer' : 'm3.onSurfaceVariant',
    bgcolor: active ? 'm3.primaryContainer' : 'transparent',
    fontWeight: active ? 700 : 500,
    fontSize: '0.875rem',
    textDecoration: 'none',
    '&:hover': { bgcolor: active ? 'm3.primaryContainer' : 'action.hover' },
  }) as const;

/**
 * The left navigation, grouped by domain. A group with one page is a plain link; a group with
 * several expands in place (or opens a menu when the sidebar is an icon rail). The page you are
 * on has aria-current="page" and its group opens by itself.
 */
export function Sidebar({ groups, pathname, rail, onNavigate, onToggleRail, canCollapse }: { groups: NavGroup[]; pathname: string; rail: boolean; onNavigate?: () => void; onToggleRail?: () => void; canCollapse: boolean }) {
  const { t } = useI18n();
  const [opened, setOpened] = useState<Record<string, boolean>>({});
  const [menu, setMenu] = useState<{ el: HTMLElement; group: NavGroup } | null>(null);

  return (
    <Box component="nav" aria-label={t('nav.main')} sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, px: rail ? 1 : 1.5, pt: 1, flex: 1, overflowY: 'auto', scrollbarWidth: 'thin', display: 'grid', gap: 0.5, alignContent: 'start' }}>
        {groups.map((g) => {
          const Icon = NAV_ICONS[g.icon];
          const single = g.items.length === 1;
          const groupActive = g.items.some((i) => isActivePath(pathname, i.href) && !g.items.some((o) => o.href.length > i.href.length && isActivePath(pathname, o.href)));
          const isOpen = opened[g.id] ?? groupActive;

          if (single) {
            const item = g.items[0];
            const named = g.solo === false;
            const text = t(named ? item.label : g.label);
            const SoloIcon = named ? NAV_ICONS[item.icon] : Icon;
            const active = isActivePath(pathname, item.href);
            const link = (
              <ButtonBase component={Link} href={item.href} aria-current={active ? 'page' : undefined} aria-label={rail ? text : undefined} onClick={onNavigate} sx={rowSx(active, rail)}>
                <SoloIcon sx={{ fontSize: 22 }} />
                {!rail && <span>{text}</span>}
              </ButtonBase>
            );
            return (
              <li key={g.id}>
                {rail ? (
                  <Tooltip title={text} placement="right">
                    {link}
                  </Tooltip>
                ) : (
                  link
                )}
              </li>
            );
          }

          return (
            <li key={g.id}>
              {rail ? (
                <Tooltip title={t(g.label)} placement="right">
                  <ButtonBase aria-label={t(g.label)} aria-haspopup="menu" aria-expanded={menu?.group.id === g.id} onClick={(e) => setMenu({ el: e.currentTarget, group: g })} sx={rowSx(groupActive, true)}>
                    <Icon sx={{ fontSize: 22 }} />
                  </ButtonBase>
                </Tooltip>
              ) : (
                <>
                  <ButtonBase aria-expanded={isOpen} aria-controls={`nav-${g.id}`} onClick={() => setOpened({ ...opened, [g.id]: !isOpen })} sx={rowSx(groupActive && !isOpen, false)}>
                    <Icon sx={{ fontSize: 22 }} />
                    <span style={{ flex: 1 }}>{t(g.label)}</span>
                    <ExpandMore aria-hidden sx={{ fontSize: 20, transition: 'transform 150ms', transform: isOpen ? 'rotate(180deg)' : 'none' }} />
                  </ButtonBase>
                  <Collapse in={isOpen} timeout="auto" unmountOnExit>
                    <Box component="ul" id={`nav-${g.id}`} sx={{ listStyle: 'none', m: 0, p: 0, pl: 2.25, ml: 1.5, borderLeft: 1, borderColor: 'm3.outlineVariant', display: 'grid', gap: 0.25, mt: 0.25 }}>
                      {g.items.map((item) => {
                        const ItemIcon = NAV_ICONS[item.icon];
                        const active = isActivePath(pathname, item.href) && !g.items.some((o) => o.href.length > item.href.length && isActivePath(pathname, o.href));
                        return (
                          <li key={item.href}>
                            <ButtonBase component={Link} href={item.href} aria-current={active ? 'page' : undefined} onClick={onNavigate} sx={{ ...rowSx(active, false), minHeight: 38, fontSize: '0.8125rem' }}>
                              <ItemIcon sx={{ fontSize: 18 }} />
                              <span>{t(item.label)}</span>
                            </ButtonBase>
                          </li>
                        );
                      })}
                    </Box>
                  </Collapse>
                </>
              )}
            </li>
          );
        })}
      </Box>

      <Menu anchorEl={menu?.el} open={!!menu} onClose={() => setMenu(null)} anchorOrigin={{ vertical: 'top', horizontal: 'right' }} slotProps={{ list: { 'aria-label': menu ? t(menu.group.label) : undefined } }}>
        {menu?.group.items.map((item) => {
          const ItemIcon = NAV_ICONS[item.icon];
          return (
            <MenuItem
              key={item.href}
              component={Link}
              href={item.href}
              selected={isActivePath(pathname, item.href)}
              aria-current={isActivePath(pathname, item.href) ? 'page' : undefined}
              onClick={() => {
                setMenu(null);
                onNavigate?.();
              }}
              sx={{ gap: 1.5 }}
            >
              <ItemIcon fontSize="small" />
              {t(item.label)}
            </MenuItem>
          );
        })}
      </Menu>

      {canCollapse && (
        <Box sx={{ p: rail ? 1 : 1.5, borderTop: 1, borderColor: 'm3.outlineVariant' }}>
          <Tooltip title={rail ? t('shell.expand') : ''} placement="right">
            <ButtonBase onClick={onToggleRail} aria-label={rail ? t('shell.expand') : t('shell.collapse')} aria-expanded={!rail} sx={{ ...rowSx(false, rail), minHeight: 40 }}>
              {rail ? <ChevronRight /> : <ChevronLeft />}
              {!rail && (
                <Typography component="span" sx={{ fontSize: '0.8125rem', fontWeight: 500 }}>
                  {t('shell.collapse')}
                </Typography>
              )}
            </ButtonBase>
          </Tooltip>
        </Box>
      )}
    </Box>
  );
}
