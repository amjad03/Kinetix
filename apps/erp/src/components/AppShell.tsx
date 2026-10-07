'use client';

import AccountTree from '@mui/icons-material/AccountTree';
import AccountTreeOutlined from '@mui/icons-material/AccountTreeOutlined';
import Assignment from '@mui/icons-material/Assignment';
import AssignmentOutlined from '@mui/icons-material/AssignmentOutlined';
import CalendarMonth from '@mui/icons-material/CalendarMonth';
import CalendarMonthOutlined from '@mui/icons-material/CalendarMonthOutlined';
import Campaign from '@mui/icons-material/Campaign';
import CampaignOutlined from '@mui/icons-material/CampaignOutlined';
import DirectionsBus from '@mui/icons-material/DirectionsBus';
import DirectionsBusOutlined from '@mui/icons-material/DirectionsBusOutlined';
import Hotel from '@mui/icons-material/Hotel';
import HotelOutlined from '@mui/icons-material/HotelOutlined';
import Inventory2 from '@mui/icons-material/Inventory2';
import Inventory2Outlined from '@mui/icons-material/Inventory2Outlined';
import QrCode2 from '@mui/icons-material/QrCode2';
import QrCode2Outlined from '@mui/icons-material/QrCode2Outlined';
import Restaurant from '@mui/icons-material/Restaurant';
import RestaurantOutlined from '@mui/icons-material/RestaurantOutlined';
import Check from '@mui/icons-material/Check';
import EventNote from '@mui/icons-material/EventNote';
import EventNoteOutlined from '@mui/icons-material/EventNoteOutlined';
import HowToReg from '@mui/icons-material/HowToReg';
import HowToRegOutlined from '@mui/icons-material/HowToRegOutlined';
import Groups from '@mui/icons-material/Groups';
import GroupsOutlined from '@mui/icons-material/GroupsOutlined';
import Settings from '@mui/icons-material/Settings';
import SettingsOutlined from '@mui/icons-material/SettingsOutlined';
import UploadFile from '@mui/icons-material/UploadFile';
import UploadFileOutlined from '@mui/icons-material/UploadFileOutlined';
import TranslateOutlined from '@mui/icons-material/TranslateOutlined';
import CastForEducation from '@mui/icons-material/CastForEducation';
import CastForEducationOutlined from '@mui/icons-material/CastForEducationOutlined';
import Class from '@mui/icons-material/Class';
import ClassOutlined from '@mui/icons-material/ClassOutlined';
import FactCheck from '@mui/icons-material/FactCheck';
import FactCheckOutlined from '@mui/icons-material/FactCheckOutlined';
import AutoAwesome from '@mui/icons-material/AutoAwesome';
import AutoAwesomeOutlined from '@mui/icons-material/AutoAwesomeOutlined';
import Forum from '@mui/icons-material/Forum';
import ForumOutlined from '@mui/icons-material/ForumOutlined';
import Grading from '@mui/icons-material/Grading';
import Quiz from '@mui/icons-material/Quiz';
import QuizOutlined from '@mui/icons-material/QuizOutlined';
import TrackChanges from '@mui/icons-material/TrackChanges';
import TrackChangesOutlined from '@mui/icons-material/TrackChangesOutlined';
import GradingOutlined from '@mui/icons-material/GradingOutlined';
import Insights from '@mui/icons-material/Insights';
import InsightsOutlined from '@mui/icons-material/InsightsOutlined';
import LocalLibrary from '@mui/icons-material/LocalLibrary';
import LocalLibraryOutlined from '@mui/icons-material/LocalLibraryOutlined';
import LiveTv from '@mui/icons-material/LiveTv';
import LiveTvOutlined from '@mui/icons-material/LiveTvOutlined';
import LockOutlined from '@mui/icons-material/LockOutlined';
import LogoutOutlined from '@mui/icons-material/LogoutOutlined';
import MenuBook from '@mui/icons-material/MenuBook';
import MenuBookOutlined from '@mui/icons-material/MenuBookOutlined';
import OndemandVideo from '@mui/icons-material/OndemandVideo';
import OndemandVideoOutlined from '@mui/icons-material/OndemandVideoOutlined';
import BadgeOutlined from '@mui/icons-material/BadgeOutlined';
import Badge from '@mui/icons-material/Badge';
import RequestQuoteOutlined from '@mui/icons-material/RequestQuoteOutlined';
import RequestQuote from '@mui/icons-material/RequestQuote';
import ReceiptLongOutlined from '@mui/icons-material/ReceiptLongOutlined';
import ReceiptLong from '@mui/icons-material/ReceiptLong';
import FolderCopyOutlined from '@mui/icons-material/FolderCopyOutlined';
import FolderCopy from '@mui/icons-material/FolderCopy';
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
import ListItemText from '@mui/material/ListItemText';
import ListSubheader from '@mui/material/ListSubheader';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useTransition, type ReactNode } from 'react';
import { setLanguage } from '@/app/language/actions';
import { signOut } from '@/app/login/actions';
import { useI18n } from '@/i18n/client';
import { LANGUAGE_NAMES, LOCALES, BCP47 } from '@/i18n/locales';
import type { MessageKey } from '@/i18n/messages';
import { canSee, homeFor, type Section } from '@/lib/access';
import { initials } from './initials';
import { Logo, LogoMark } from './Logo';

const NAV: { href: string; label: MessageKey; section: Section | 'platform'; icon: typeof TodayOutlined; active: typeof Today }[] = [
  { href: '/', label: 'nav.today', section: 'school', icon: TodayOutlined, active: Today },
  { href: '/department', label: 'nav.department', section: 'department', icon: InsightsOutlined, active: Insights },
  { href: '/classes', label: 'nav.classes', section: 'school', icon: ClassOutlined, active: Class },
  { href: '/calendar', label: 'nav.calendar', section: 'calendar', icon: EventNoteOutlined, active: EventNote },
  { href: '/timetable', label: 'nav.timetable', section: 'timetable', icon: CalendarMonthOutlined, active: CalendarMonth },
  { href: '/attendance', label: 'nav.attendance', section: 'school', icon: FactCheckOutlined, active: FactCheck },
  { href: '/homework', label: 'nav.homework', section: 'school', icon: AssignmentOutlined, active: Assignment },
  { href: '/results', label: 'nav.results', section: 'results', icon: GradingOutlined, active: Grading },
  { href: '/exams', label: 'nav.exams', section: 'exams', icon: QuizOutlined, active: Quiz },
  { href: '/obe', label: 'nav.obe', section: 'obe', icon: TrackChangesOutlined, active: TrackChanges },
  { href: '/messages', label: 'nav.messages', section: 'school', icon: CampaignOutlined, active: Campaign },
  { href: '/conversations', label: 'nav.conversations', section: 'conversations', icon: ForumOutlined, active: Forum },
  { href: '/boards', label: 'nav.boards', section: 'boards', icon: CastForEducationOutlined, active: CastForEducation },
  { href: '/live', label: 'nav.live', section: 'live', icon: LiveTvOutlined, active: LiveTv },
  { href: '/admissions', label: 'nav.admissions', section: 'admissions', icon: HowToRegOutlined, active: HowToReg },
  { href: '/students', label: 'nav.students', section: 'students', icon: GroupsOutlined, active: Groups },
  { href: '/fees', label: 'nav.fees', section: 'fees', icon: PaymentsOutlined, active: Payments },
  { href: '/hr', label: 'nav.hr', section: 'hr', icon: BadgeOutlined, active: Badge },
  { href: '/payroll', label: 'nav.payroll', section: 'payroll', icon: RequestQuoteOutlined, active: RequestQuote },
  { href: '/payroll/payslips', label: 'nav.payslips', section: 'payslips', icon: ReceiptLongOutlined, active: ReceiptLong },
  { href: '/documents', label: 'nav.documents', section: 'documents', icon: FolderCopyOutlined, active: FolderCopy },
  { href: '/library', label: 'nav.library', section: 'library', icon: LocalLibraryOutlined, active: LocalLibrary },
  { href: '/transport', label: 'nav.transport', section: 'transport', icon: DirectionsBusOutlined, active: DirectionsBus },
  { href: '/hostel', label: 'nav.hostel', section: 'hostel', icon: HotelOutlined, active: Hotel },
  { href: '/canteen', label: 'nav.canteen', section: 'canteen', icon: RestaurantOutlined, active: Restaurant },
  { href: '/inventory', label: 'nav.inventory', section: 'inventory', icon: Inventory2Outlined, active: Inventory2 },
  { href: '/assets', label: 'nav.assets', section: 'assets', icon: QrCode2Outlined, active: QrCode2 },
  { href: '/syllabus', label: 'nav.syllabus', section: 'syllabus', icon: MenuBookOutlined, active: MenuBook },
  { href: '/ai', label: 'nav.ai', section: 'ai', icon: AutoAwesomeOutlined, active: AutoAwesome },
  { href: '/departments', label: 'nav.departments', section: 'departments', icon: AccountTreeOutlined, active: AccountTree },
  { href: '/import', label: 'nav.import', section: 'import', icon: UploadFileOutlined, active: UploadFile },
  { href: '/settings', label: 'nav.settings', section: 'settings', icon: SettingsOutlined, active: Settings },
  // The KINETIX platform team only (GET /v1/me platformAdmin), not an institution's role.
  { href: '/platform/concept-videos', label: 'nav.conceptVideos', section: 'platform', icon: OndemandVideoOutlined, active: OndemandVideo },
];

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

export interface ShellUser {
  fullName: string;
  email: string | null;
  roles: string[];
  /** On the KINETIX platform team: Platform › Concept videos. */
  platformAdmin?: boolean;
}

function isActive(pathname: string, href: string) {
  return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({ user, school, children }: { user: ShellUser; school: string; children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { t, locale } = useI18n();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [switching, startSwitch] = useTransition();
  const roleText = user.roles
    .map((r) => ROLE_LABEL[r])
    .filter(Boolean)
    .map((k) => t(k))
    .join(' · ');
  const nav = NAV.filter((item) => (item.section === 'platform' ? !!user.platformAdmin : canSee(user.roles, item.section)));
  const home = homeFor(user.roles);

  return (
    <Box className="kx-shell" sx={{ minHeight: '100dvh', bgcolor: 'kx.frame', display: 'grid', gridTemplateRows: '64px 1fr', gridTemplateColumns: { xs: '80px 1fr', lg: '256px 1fr' } }}>
      {/* Top app bar */}
      <Box
        component="header"
        className="kx-chrome"
        sx={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 2, px: { xs: 2, lg: 3 }, position: 'sticky', top: 0, zIndex: 3, bgcolor: 'kx.frame' }}
      >
        <Box component={Link} href={home} aria-label={t('shell.home')} sx={{ textDecoration: 'none', display: { xs: 'none', lg: 'block' }, width: 208 }}>
          <Logo size={30} />
        </Box>
        <Box component={Link} href={home} aria-label={t('shell.home')} sx={{ display: { xs: 'block', lg: 'none' }, ml: 0.5, mr: 1 }}>
          <LogoMark size={32} />
        </Box>
        <Typography variant="h5" component="p" noWrap sx={{ fontSize: { xs: '1.0625rem', md: '1.25rem' }, color: 'text.primary', minWidth: 0 }} data-testid="school-name">
          {school}
        </Typography>
        <Box sx={{ flex: 1 }} />
        <Tooltip title={`${user.fullName}${roleText ? ` · ${roleText}` : ''}`}>
          <IconButton onClick={(e) => setAnchor(e.currentTarget)} aria-label={t('shell.account')} aria-haspopup="menu" sx={{ p: 0.5 }}>
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
          <ListSubheader sx={{ bgcolor: 'transparent', lineHeight: '36px', px: 3, display: 'flex', alignItems: 'center', gap: 1 }}>
            <TranslateOutlined fontSize="small" /> {t('shell.language')}
          </ListSubheader>
          {LOCALES.map((l) => (
            <MenuItem
              key={l}
              lang={BCP47[l]}
              selected={l === locale}
              disabled={switching}
              data-testid={`language-${l}`}
              onClick={() => {
                if (l === locale) return;
                startSwitch(async () => {
                  await setLanguage(l);
                  setAnchor(null);
                  router.refresh();
                });
              }}
              sx={{ px: 3 }}
            >
              <ListItemIcon>{l === locale && <Check fontSize="small" />}</ListItemIcon>
              <ListItemText>{LANGUAGE_NAMES[l]}</ListItemText>
            </MenuItem>
          ))}
          <Divider />
          <MenuItem component={Link} href="/account/password" onClick={() => setAnchor(null)} sx={{ mt: 1, px: 3 }} data-testid="change-password">
            <ListItemIcon>
              <LockOutlined fontSize="small" />
            </ListItemIcon>
            {t('shell.changePassword')}
          </MenuItem>
          <form action={signOut}>
            <MenuItem component="button" type="submit" sx={{ width: '100%', px: 3 }}>
              <ListItemIcon>
                <LogoutOutlined fontSize="small" />
              </ListItemIcon>
              {t('shell.signOut')}
            </MenuItem>
          </form>
        </Menu>
      </Box>

      {/* Navigation: M3 drawer on wide screens, rail on tablets */}
      <Box
        component="nav"
        aria-label={t('nav.main')}
        className="kx-chrome"
        // Scrolls on its own when the list is taller than the window (the principal sees every page).
        sx={{ position: 'sticky', top: 64, alignSelf: 'start', maxHeight: 'calc(100dvh - 64px)', overflowY: 'auto', scrollbarWidth: 'thin', px: { xs: 0, lg: 1.5 }, pt: { xs: 0.5, lg: 1 }, pb: 1 }}
      >
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
                  minHeight: 64,
                  py: 0.5,
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
                sx={{ fontSize: { xs: '0.75rem', lg: '0.875rem' }, fontWeight: active ? 700 : 500, lineHeight: { xs: '16px', lg: '20px' }, letterSpacing: '0.1px', textAlign: { xs: 'center', lg: 'left' }, px: { xs: 0.5, lg: 0 }, overflowWrap: 'anywhere' }}
              >
                {t(item.label)}
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
