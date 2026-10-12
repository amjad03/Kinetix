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
