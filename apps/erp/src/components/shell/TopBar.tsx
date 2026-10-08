'use client';

import Check from '@mui/icons-material/Check';
import LockOutlined from '@mui/icons-material/LockOutlined';
import SecurityOutlined from '@mui/icons-material/SecurityOutlined';
import LogoutOutlined from '@mui/icons-material/LogoutOutlined';
import MenuIcon from '@mui/icons-material/Menu';
import NotificationsNoneOutlined from '@mui/icons-material/NotificationsNoneOutlined';
import TranslateOutlined from '@mui/icons-material/TranslateOutlined';
import Avatar from '@mui/material/Avatar';
import Badge from '@mui/material/Badge';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import ListSubheader from '@mui/material/ListSubheader';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Popover from '@mui/material/Popover';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { setLanguage } from '@/app/language/actions';
import { signOut } from '@/app/login/actions';
import { markNotificationsRead, setAcademicYear } from '@/app/shell/actions';
import { useI18n } from '@/i18n/client';
import { BCP47, LANGUAGE_NAMES, LOCALES } from '@/i18n/locales';
import type { MessageKey } from '@/i18n/messages';
import { canSee } from '@/lib/access';
import type { NavGroup } from '@/lib/nav';
import type { RoleName } from '@/lib/types';
import { initials } from '../initials';
import { CommandSearch } from './CommandSearch';

export interface ShellNotice {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  readAt: string | null;
}

export interface ShellYear {
  id: string;
  label: string;
  isCurrent: boolean;
}

const ROLE_LABEL: Record<string, MessageKey> = {
  principal: 'role.principal',
  tenant_admin: 'role.tenant_admin',
  hod: 'role.hod',
  teacher: 'role.teacher',
  accountant: 'role.accountant',
  librarian: 'role.librarian',
  transport_manager: 'role.transport_manager',
  hostel_warden: 'role.hostel_warden',
  canteen_manager: 'role.canteen_manager',
  store_keeper: 'role.store_keeper',
  admissions_officer: 'role.admissions_officer',
  hr_manager: 'role.hr_manager',
};

export function TopBar({
  user,
  school,
  groups,
  years,
  yearId,
  notices,
  unread,
  onMenu,
}: {
  user: { fullName: string; email: string | null; roles: RoleName[] };
  school: string;
  groups: NavGroup[];
  years: ShellYear[];
  yearId: string;
  notices: ShellNotice[];
  unread: number;
  onMenu: () => void;
}) {
  const { t, fmt, locale } = useI18n();
  const router = useRouter();
  const [profile, setProfile] = useState<HTMLElement | null>(null);
  const [lang, setLang] = useState<HTMLElement | null>(null);
  const [year, setYear] = useState<HTMLElement | null>(null);
  const [bell, setBell] = useState<HTMLElement | null>(null);
  const [busy, start] = useTransition();
  const roleText = user.roles
    .map((r) => ROLE_LABEL[r])
    .filter(Boolean)
    .map((k) => t(k))
    .join(' · ');
  const current = years.find((y) => y.id === yearId) ?? years.find((y) => y.isCurrent) ?? years[0];

  return (
    <Box
      component="header"
      className="kx-chrome"
      sx={{ position: 'sticky', top: 0, zIndex: 1100, height: 64, display: 'flex', alignItems: 'center', gap: { xs: 1, md: 2 }, px: { xs: 1.5, md: 3 }, bgcolor: 'kx.pane', borderBottom: 1, borderColor: 'm3.outlineVariant' }}
    >
      <IconButton onClick={onMenu} aria-label={t('shell.menu')} sx={{ display: { xs: 'inline-flex', md: 'none' } }}>
        <MenuIcon />
      </IconButton>
      <Typography component="p" noWrap data-testid="school-name" sx={{ display: { xs: 'none', lg: 'block' }, maxWidth: 280, fontSize: '0.875rem', fontWeight: 600, color: 'text.primary' }}>
        {school}
      </Typography>
      <Box sx={{ flex: 1, minWidth: 0, display: 'flex', justifyContent: { xs: 'flex-start', md: 'center' } }}>
        <CommandSearch groups={groups} canSearchStudents={canSee(user.roles, 'students')} />
      </Box>

      {current && (
        <>
          <Button
            onClick={(e) => setYear(e.currentTarget)}
            aria-haspopup="menu"
            aria-label={t('shell.year', { year: current.label })}
            variant="outlined"
            color="inherit"
            size="small"
            sx={{ display: { xs: 'none', sm: 'inline-flex' }, borderColor: 'm3.outlineVariant', color: 'text.primary', whiteSpace: 'nowrap' }}
          >
            {t('shell.yearShort', { year: current.label })}
          </Button>
          <Menu anchorEl={year} open={!!year} onClose={() => setYear(null)} slotProps={{ list: { 'aria-label': t('shell.yearMenu') } }}>
            {years.map((y) => (
              <MenuItem
                key={y.id}
                selected={y.id === current.id}
                disabled={busy}
                onClick={() =>
                  start(async () => {
                    await setAcademicYear(y.isCurrent ? '' : y.id);
                    setYear(null);
                    router.refresh();
                  })
                }
              >
                <ListItemText>{y.label}</ListItemText>
                {y.isCurrent && (
                  <Typography variant="caption" color="text.secondary" sx={{ ml: 2 }}>
                    {t('shell.yearCurrent')}
                  </Typography>
                )}
              </MenuItem>
            ))}
          </Menu>
        </>
      )}

      <Tooltip title={t('shell.language')}>
        <IconButton onClick={(e) => setLang(e.currentTarget)} aria-label={t('shell.language')} aria-haspopup="menu" data-testid="language-button">
          <TranslateOutlined />
        </IconButton>
      </Tooltip>
      <Menu anchorEl={lang} open={!!lang} onClose={() => setLang(null)}>
        {LOCALES.map((l) => (
          <MenuItem
            key={l}
            lang={BCP47[l]}
            selected={l === locale}
            disabled={busy}
            data-testid={`language-${l}`}
            onClick={() => {
              if (l === locale) return setLang(null);
              start(async () => {
                await setLanguage(l);
                setLang(null);
                router.refresh();
              });
            }}
          >
            <ListItemIcon>{l === locale && <Check fontSize="small" />}</ListItemIcon>
            <ListItemText>{LANGUAGE_NAMES[l]}</ListItemText>
          </MenuItem>
        ))}
      </Menu>

      <Tooltip title={t('shell.notifications')}>
        <IconButton onClick={(e) => setBell(e.currentTarget)} aria-label={unread ? t('shell.notificationsUnread', { n: unread }) : t('shell.notifications')} aria-haspopup="dialog">
          <Badge badgeContent={unread} color="error" max={99}>
            <NotificationsNoneOutlined />
          </Badge>
        </IconButton>
      </Tooltip>
      <Popover anchorEl={bell} open={!!bell} onClose={() => setBell(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }} transformOrigin={{ vertical: 'top', horizontal: 'right' }} slotProps={{ paper: { sx: { width: 360, maxWidth: 'calc(100vw - 24px)' }, 'aria-label': t('shell.notifications') } as never }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 2, py: 1.25 }}>
          <Typography variant="subtitle1" component="h2" sx={{ fontWeight: 600 }}>
            {t('shell.notifications')}
          </Typography>
          {unread > 0 && (
            <Button
              size="small"
              disabled={busy}
              onClick={() =>
                start(async () => {
                  await markNotificationsRead();
                  router.refresh();
                })
              }
            >
              {t('shell.markRead')}
            </Button>
          )}
        </Box>
        <Divider />
        {notices.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ p: 3, textAlign: 'center' }}>
            {t('shell.noNotifications')}
          </Typography>
        ) : (
          <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, maxHeight: 360, overflowY: 'auto' }}>
            {notices.map((n) => (
              <Box component="li" key={n.id} sx={{ px: 2, py: 1.25, borderBottom: 1, borderColor: 'm3.outlineVariant', bgcolor: n.readAt ? 'transparent' : 'm3.secondaryContainer' }}>
                <Typography variant="body2" sx={{ fontWeight: n.readAt ? 500 : 700 }}>
                  {n.title}
                </Typography>
                {n.body && (
                  <Typography variant="caption" color="text.secondary" component="p" sx={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {n.body}
                  </Typography>
                )}
                <Typography variant="caption" color="text.secondary">
                  {fmt.relative(n.createdAt)}
                </Typography>
              </Box>
            ))}
          </Box>
        )}
      </Popover>

      <Tooltip title={`${user.fullName}${roleText ? ` · ${roleText}` : ''}`}>
        <IconButton onClick={(e) => setProfile(e.currentTarget)} aria-label={t('shell.account')} aria-haspopup="menu" sx={{ p: 0.5, ml: 0.5 }}>
          <Avatar sx={{ width: 36, height: 36, bgcolor: 'm3.primaryContainer', color: 'm3.onPrimaryContainer', fontSize: 14, fontWeight: 700 }}>{initials(user.fullName)}</Avatar>
        </IconButton>
      </Tooltip>
      <Menu anchorEl={profile} open={!!profile} onClose={() => setProfile(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }} transformOrigin={{ vertical: 'top', horizontal: 'right' }} slotProps={{ paper: { sx: { minWidth: 280, mt: 1 } } }}>
        <Box sx={{ px: 2.5, pt: 1.5, pb: 1.5 }}>
          <Typography variant="subtitle1" component="p" sx={{ fontWeight: 600 }}>
            {t('shell.hi', { name: user.fullName })}
          </Typography>
          {user.email && (
            <Typography variant="body2" color="text.secondary">
              {user.email}
            </Typography>
          )}
          {roleText && (
            <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 0.5 }}>
              {roleText} · {school}
            </Typography>
          )}
        </Box>
        <Divider />
        <ListSubheader sx={{ bgcolor: 'transparent', lineHeight: '36px', px: 2.5, display: 'flex', alignItems: 'center', gap: 1 }}>
          <TranslateOutlined fontSize="small" /> {t('shell.language')}
        </ListSubheader>
        {LOCALES.map((l) => (
          <MenuItem
            key={`p-${l}`}
            data-testid={`language-${l}`}
            lang={BCP47[l]}
            selected={l === locale}
            disabled={busy}
            onClick={() => {
              if (l === locale) return;
              start(async () => {
                await setLanguage(l);
                setProfile(null);
                router.refresh();
              });
            }}
            sx={{ px: 2.5, minHeight: 40 }}
          >
            <ListItemIcon>{l === locale && <Check fontSize="small" />}</ListItemIcon>
            <ListItemText>{LANGUAGE_NAMES[l]}</ListItemText>
          </MenuItem>
        ))}
        <Divider />
        <MenuItem component={Link} href="/account/password" onClick={() => setProfile(null)} sx={{ px: 2.5 }} data-testid="change-password">
          <ListItemIcon>
            <LockOutlined fontSize="small" />
          </ListItemIcon>
          {t('shell.changePassword')}
        </MenuItem>
        <MenuItem component={Link} href="/account/security" onClick={() => setProfile(null)} sx={{ px: 2.5 }} data-testid="security">
          <ListItemIcon>
            <SecurityOutlined fontSize="small" />
          </ListItemIcon>
          {t('shell.security')}
        </MenuItem>
        <form action={signOut}>
          <MenuItem component="button" type="submit" sx={{ width: '100%', px: 2.5 }}>
            <ListItemIcon>
              <LogoutOutlined fontSize="small" />
            </ListItemIcon>
            {t('shell.signOut')}
          </MenuItem>
        </form>
      </Menu>
    </Box>
  );
}
