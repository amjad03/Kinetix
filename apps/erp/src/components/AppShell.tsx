'use client';

import Assignment from '@mui/icons-material/Assignment';
import AssignmentOutlined from '@mui/icons-material/AssignmentOutlined';
import CalendarMonth from '@mui/icons-material/CalendarMonth';
import CalendarMonthOutlined from '@mui/icons-material/CalendarMonthOutlined';
import Campaign from '@mui/icons-material/Campaign';
import CampaignOutlined from '@mui/icons-material/CampaignOutlined';
import CastForEducation from '@mui/icons-material/CastForEducation';
import CastForEducationOutlined from '@mui/icons-material/CastForEducationOutlined';
import Class from '@mui/icons-material/Class';
import ClassOutlined from '@mui/icons-material/ClassOutlined';
import FactCheck from '@mui/icons-material/FactCheck';
import FactCheckOutlined from '@mui/icons-material/FactCheckOutlined';
import AutoAwesome from '@mui/icons-material/AutoAwesome';
import AutoAwesomeOutlined from '@mui/icons-material/AutoAwesomeOutlined';
import Grading from '@mui/icons-material/Grading';
import GradingOutlined from '@mui/icons-material/GradingOutlined';
import LocalLibrary from '@mui/icons-material/LocalLibrary';
import LocalLibraryOutlined from '@mui/icons-material/LocalLibraryOutlined';
import LiveTv from '@mui/icons-material/LiveTv';
import LiveTvOutlined from '@mui/icons-material/LiveTvOutlined';
import LogoutOutlined from '@mui/icons-material/LogoutOutlined';
import MenuBook from '@mui/icons-material/MenuBook';
import MenuBookOutlined from '@mui/icons-material/MenuBookOutlined';
import Payments from '@mui/icons-material/Payments';
import PaymentsOutlined from '@mui/icons-material/PaymentsOutlined';
import Today from '@mui/icons-material/Today';
import TodayOutlined from '@mui/icons-material/TodayOutlined';
import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { signOut } from '@/app/login/actions';
import { canSee, homeFor, type Section } from '@/lib/access';
import { initials } from './initials';
import { Logo, LogoMark } from './Logo';

const NAV: { href: string; label: string; section: Section; icon: typeof TodayOutlined; active: typeof Today }[] = [
  { href: '/', label: 'Today', section: 'school', icon: TodayOutlined, active: Today },
  { href: '/classes', label: 'Classes', section: 'school', icon: ClassOutlined, active: Class },
  { href: '/timetable', label: 'Timetable', section: 'timetable', icon: CalendarMonthOutlined, active: CalendarMonth },
  { href: '/attendance', label: 'Attendance', section: 'school', icon: FactCheckOutlined, active: FactCheck },
  { href: '/homework', label: 'Homework', section: 'school', icon: AssignmentOutlined, active: Assignment },
  { href: '/results', label: 'Results', section: 'results', icon: GradingOutlined, active: Grading },
  { href: '/messages', label: 'Messages', section: 'school', icon: CampaignOutlined, active: Campaign },
  { href: '/boards', label: 'Boards', section: 'boards', icon: CastForEducationOutlined, active: CastForEducation },
  { href: '/live', label: 'Live', section: 'live', icon: LiveTvOutlined, active: LiveTv },
  { href: '/fees', label: 'Fees', section: 'fees', icon: PaymentsOutlined, active: Payments },
  { href: '/library', label: 'Library', section: 'library', icon: LocalLibraryOutlined, active: LocalLibrary },
  { href: '/syllabus', label: 'Syllabus', section: 'syllabus', icon: MenuBookOutlined, active: MenuBook },
  { href: '/ai', label: 'AI usage', section: 'ai', icon: AutoAwesomeOutlined, active: AutoAwesome },
];

const ROLE_LABEL: Record<string, string> = {
  principal: 'Principal',
  tenant_admin: 'Administrator',
  hod: 'Head of department',
  teacher: 'Teacher',
  accountant: 'Accounts office',
  librarian: 'Library',
};

export interface ShellUser {
  fullName: string;
  email: string | null;
  roles: string[];
}

function isActive(pathname: string, href: string) {
  return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({ user, school, children }: { user: ShellUser; school: string; children: ReactNode }) {
  const pathname = usePathname();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const roleText = user.roles.map((r) => ROLE_LABEL[r]).filter(Boolean).join(' · ');
  const nav = NAV.filter((item) => canSee(user.roles, item.section));
  const home = homeFor(user.roles);

  return (
    <Box className="kx-shell" sx={{ minHeight: '100dvh', bgcolor: 'kx.frame', display: 'grid', gridTemplateRows: '64px 1fr', gridTemplateColumns: { xs: '80px 1fr', lg: '256px 1fr' } }}>
      {/* Top app bar */}
      <Box
        component="header"
        className="kx-chrome"
        sx={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 2, px: { xs: 2, lg: 3 }, position: 'sticky', top: 0, zIndex: 3, bgcolor: 'kx.frame' }}
      >
        <Box component={Link} href={home} aria-label="KINETIX ERP home" sx={{ textDecoration: 'none', display: { xs: 'none', lg: 'block' }, width: 208 }}>
          <Logo size={30} />
        </Box>
        <Box component={Link} href={home} aria-label="KINETIX ERP home" sx={{ display: { xs: 'block', lg: 'none' }, ml: 0.5, mr: 1 }}>
          <LogoMark size={32} />
        </Box>
        <Typography variant="h5" component="p" noWrap sx={{ fontSize: { xs: '1.0625rem', md: '1.25rem' }, color: 'text.primary', minWidth: 0 }} data-testid="school-name">
          {school}
        </Typography>
        <Box sx={{ flex: 1 }} />
        <Tooltip title={`${user.fullName}${roleText ? ` · ${roleText}` : ''}`}>
          <IconButton onClick={(e) => setAnchor(e.currentTarget)} aria-label="Account" aria-haspopup="menu" sx={{ p: 0.5 }}>
            <Avatar sx={{ width: 36, height: 36, bgcolor: 'm3.tertiaryContainer', color: 'm3.onTertiaryContainer', fontSize: 15, fontWeight: 500 }}>
              {initials(user.fullName)}
            </Avatar>
          </IconButton>
        </Tooltip>
        <Menu
          anchorEl={anchor}
          open={!!anchor}
          onClose={() => setAnchor(null)}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
          transformOrigin={{ vertical: 'top', horizontal: 'right' }}
          slotProps={{ paper: { sx: { borderRadius: '28px', minWidth: 300, mt: 1, bgcolor: 'm3.surfaceContainerHigh' } } }}
        >
          <Box sx={{ px: 3, pt: 2, pb: 2, textAlign: 'center' }}>
            <Avatar sx={{ width: 64, height: 64, mx: 'auto', mb: 1.5, bgcolor: 'm3.tertiaryContainer', color: 'm3.onTertiaryContainer', fontSize: 26 }}>
              {initials(user.fullName)}
            </Avatar>
            <Typography variant="h6" component="p">
              Hi, {user.fullName}
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
          <form action={signOut}>
            <MenuItem component="button" type="submit" sx={{ width: '100%', mt: 1, px: 3 }}>
              <ListItemIcon>
                <LogoutOutlined fontSize="small" />
              </ListItemIcon>
              Sign out
            </MenuItem>
          </form>
        </Menu>
      </Box>

      {/* Navigation: M3 drawer on wide screens, rail on tablets */}
      <Box component="nav" aria-label="Main" className="kx-chrome" sx={{ position: 'sticky', top: 64, alignSelf: 'start', px: { xs: 0, lg: 1.5 }, pt: { xs: 0.5, lg: 1 } }}>
        {nav.map((item) => {
          const active = isActive(pathname, item.href);
          const Icon = active ? item.active : item.icon;
          return (
            <ButtonBase
              key={item.href}
              component={Link}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              sx={{
                width: '100%',
                display: 'flex',
                textDecoration: 'none',
                color: active ? 'm3.onSecondaryContainer' : 'm3.onSurfaceVariant',
                // Drawer item
                '@media (min-width: 1200px)': {
                  height: 56,
                  borderRadius: '28px',
                  px: 2,
                  gap: 1.5,
                  justifyContent: 'flex-start',
                  bgcolor: active ? 'm3.secondaryContainer' : 'transparent',
                  '&:hover': { bgcolor: active ? 'm3.secondaryContainer' : 'action.hover' },
                },
                // Rail item
                '@media (max-width: 1199.95px)': {
                  flexDirection: 'column',
                  height: 64,
                  gap: 0.5,
                  '& .kx-ind': { bgcolor: active ? 'm3.secondaryContainer' : 'transparent' },
                  '&:hover .kx-ind': { bgcolor: active ? 'm3.secondaryContainer' : 'action.hover' },
                },
              }}
            >
              <Box className="kx-ind" sx={{ display: 'grid', placeItems: 'center', width: { xs: 56, lg: 'auto' }, height: { xs: 32, lg: 'auto' }, borderRadius: 16 }}>
                <Icon sx={{ fontSize: 24 }} />
              </Box>
              <Typography
                component="span"
                sx={{ fontSize: { xs: '0.75rem', lg: '0.875rem' }, fontWeight: active ? 700 : 500, lineHeight: { xs: '16px', lg: '20px' }, letterSpacing: '0.1px' }}
              >
                {item.label}
              </Typography>
            </ButtonBase>
          );
        })}
      </Box>

      {/* Content pane */}
      <Box
        component="main"
        className="kx-main"
        sx={{
          bgcolor: 'kx.pane',
          borderRadius: '16px',
          mr: { xs: 1.5, lg: 2 },
          mb: { xs: 1.5, lg: 2 },
          minWidth: 0,
          px: { xs: 2.5, md: 4 },
          py: { xs: 2.5, md: 3 },
        }}
      >
        {children}
      </Box>
    </Box>
  );
}
