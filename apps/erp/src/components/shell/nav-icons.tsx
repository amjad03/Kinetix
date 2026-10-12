import {
  Award, Baby, BarChart3, Bot, BookOpen, Briefcase, Building2, Bus, CalendarDays, CalendarCheck, ClipboardCheck, ClipboardList, Cpu, FileCheck2, FileQuestion, FileText,
  FolderOpen, GitBranch, GraduationCap, HeartPulse, Home, Hotel, Inbox, Landmark, Layers, LayoutDashboard, Library, ListChecks, MessageSquare, MessagesSquare, Megaphone,
  MonitorPlay, Package, PlayCircle, Presentation, Radio, Receipt, Route, School, Settings, ShieldCheck, Sparkles, Target, Upload, UserPlus, Users, Utensils, Wallet, Wrench,
  type LucideIcon,
} from 'lucide-react';
import type { NavIcon } from '@/lib/nav';

/** Lucide icons for the navigation (sidebar, command palette). */
export const NAV_ICONS: Record<NavIcon, LucideIcon> = {
  dashboard: Home, admissions: UserPlus, students: Users, academics: GraduationCap, timetable: CalendarDays, attendance: ClipboardCheck, exams: FileCheck2, obe: Target,
  lms: BookOpen, finance: Wallet, hr: Briefcase, library: Library, campus: Bus, inventory: Package, communication: Megaphone, reports: BarChart3, settings: Settings,
  classes: School, calendar: CalendarCheck, homework: ClipboardList, results: Award, boards: Presentation, devices: Cpu, live: Radio, topicVideos: PlayCircle,
  syllabus: Layers, departments: Building2, documents: FileText, payroll: Landmark, payslips: Receipt, transport: Route, hostel: Hotel, canteen: Utensils,
  campusLife: Sparkles, assets: Wrench, placements: Briefcase, research: FileQuestion, grievances: ShieldCheck, messages: MessageSquare, conversations: MessagesSquare,
  ai: Bot, department: LayoutDashboard, import: Upload, platform: MonitorPlay, surveys: ListChecks, tasks: Inbox, work: Inbox, mentoring: Users, courseFiles: FolderOpen,
  academicAudit: ShieldCheck, courseRegistration: ClipboardList, skills: Sparkles, questionBank: FileQuestion, workflows: GitBranch, diary: BookOpen, ptm: Users,
  earlyYears: Baby, health: HeartPulse,
};

export type NavTone = 'teal' | 'amber' | 'orange' | 'red' | 'green' | 'blue' | 'violet' | 'pink' | 'sky' | 'indigo' | 'lime' | 'slate';

/** Tile colour per module (redesign v2: colourful icon tiles in the sidebar and tabs). */
export const NAV_TONES: Record<NavIcon, NavTone> = {
  dashboard: 'sky', admissions: 'green', students: 'blue', academics: 'indigo', timetable: 'indigo', attendance: 'lime', exams: 'red', obe: 'violet',
  lms: 'sky', finance: 'teal', hr: 'pink', library: 'amber', campus: 'orange', inventory: 'slate', communication: 'amber', reports: 'violet', settings: 'slate',
  classes: 'blue', calendar: 'sky', homework: 'orange', results: 'red', boards: 'violet', devices: 'slate', live: 'red', topicVideos: 'pink',
  syllabus: 'indigo', departments: 'blue', documents: 'slate', payroll: 'amber', payslips: 'amber', transport: 'orange', hostel: 'violet', canteen: 'orange',
  campusLife: 'pink', assets: 'slate', placements: 'green', research: 'violet', grievances: 'red', messages: 'teal', conversations: 'teal',
  ai: 'violet', department: 'sky', import: 'slate', platform: 'indigo', surveys: 'lime', tasks: 'orange', work: 'orange', mentoring: 'pink', courseFiles: 'amber',
  academicAudit: 'green', courseRegistration: 'blue', skills: 'lime', questionBank: 'violet', workflows: 'orange', diary: 'sky', ptm: 'pink',
  earlyYears: 'pink', health: 'red',
};

const TONE_CLASS: Record<NavTone, string> = {
  teal: 'bg-teal-500/12 text-teal-700 dark:text-teal-300', amber: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  orange: 'bg-orange-500/13 text-orange-700 dark:text-orange-300', red: 'bg-red-500/12 text-red-700 dark:text-red-300',
  green: 'bg-green-500/13 text-green-700 dark:text-green-300', blue: 'bg-blue-500/12 text-blue-700 dark:text-blue-300',
  violet: 'bg-violet-500/12 text-violet-700 dark:text-violet-300', pink: 'bg-pink-500/12 text-pink-700 dark:text-pink-300',
  sky: 'bg-sky-500/13 text-sky-700 dark:text-sky-300', indigo: 'bg-indigo-500/12 text-indigo-700 dark:text-indigo-300',
  lime: 'bg-lime-500/18 text-lime-700 dark:text-lime-300', slate: 'bg-zinc-500/12 text-zinc-700 dark:text-zinc-300',
};

/** A module icon on its coloured tile. */
export function NavTile({ icon, size = 'sm', className }: { icon: NavIcon; size?: 'xs' | 'sm' | 'md' | 'lg'; className?: string }) {
  const Icon = NAV_ICONS[icon] ?? Home;
  const box = { xs: 'size-5 rounded-md [&>svg]:size-3', sm: 'size-6 rounded-[7px] [&>svg]:size-3.5', md: 'size-[34px] rounded-[10px] [&>svg]:size-[18px]', lg: 'size-10 rounded-[11px] [&>svg]:size-5' }[size];
  return (
    <span aria-hidden className={`inline-grid shrink-0 place-items-center ${box} ${TONE_CLASS[NAV_TONES[icon] ?? 'slate']} ${className ?? ''}`}>
      <Icon />
    </span>
  );
}
