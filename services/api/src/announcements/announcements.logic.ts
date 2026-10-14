import type { AnnouncementChannel } from '../db/schema.js';

/**
 * Announcement bodies are light markdown: **bold**, "- " or "1. " list items and [text](https://link).
 * Boards and push previews get plain text.
 */
export function plainText(body: string): string {
  return body
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '$1 ($2)')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/^\s*[-*]\s+/gm, '• ')
    .trim();
}

/** Only http(s) links are allowed in a body; anything else (javascript:, data:) is refused. */
export function unsafeLink(body: string): boolean {
  const links = [...body.matchAll(/\[[^\]]*\]\(([^)]*)\)/g)].map((m) => m[1].trim());
  return links.some((l) => !/^https?:\/\/[^\s]+$/i.test(l));
}

/** Percentage rounded down to a whole number (0 when nobody was targeted). */
export const pct = (n: number, of: number) => (of > 0 ? Math.floor((n * 100) / of) : 0);

export interface BuiltInTemplate {
  id: string;
  name: string;
  title: string;
  body: string;
  priority: 'normal' | 'important';
  requiresAck: boolean;
  channels: AnnouncementChannel[];
}

/** Notices most institutions send; an institution adds its own beside these. */
export const BUILT_IN_TEMPLATES: BuiltInTemplate[] = [
  {
    id: 'builtin:holiday',
    name: 'Holiday',
    title: 'Holiday on <date>',
    body: 'The institution will remain closed on **<date>** on account of <reason>.\n\nClasses resume on <date>.',
    priority: 'normal',
    requiresAck: false,
    channels: ['boards', 'teacher', 'student', 'parent'],
  },
  {
    id: 'builtin:ptm',
    name: 'Parent–teacher meeting',
    title: 'Parent–teacher meeting on <date>',
    body: 'Dear parents,\n\nA parent–teacher meeting is scheduled on **<date>** from <time> to <time> in <venue>.\n\n- Please bring the student diary\n- Meet the class teacher first, then subject teachers',
    priority: 'important',
    requiresAck: true,
    channels: ['teacher', 'parent'],
  },
  {
    id: 'builtin:exam',
    name: 'Exam schedule',
    title: '<exam> timetable published',
    body: 'The timetable for **<exam>** is attached.\n\n- Reach the exam hall 15 minutes early\n- Carry your hall ticket and ID card',
    priority: 'important',
    requiresAck: false,
    channels: ['boards', 'teacher', 'student', 'parent'],
  },
  {
    id: 'builtin:fee',
    name: 'Fee reminder',
    title: 'Fee due on <date>',
    body: 'This is a reminder that the <term> fee is due on **<date>**. Pay in the app or at the accounts office to avoid a late fee.',
    priority: 'normal',
    requiresAck: false,
    channels: ['parent', 'student'],
  },
  {
    id: 'builtin:closure',
    name: 'Emergency closure',
    title: 'Institution closed today',
    body: 'Due to <reason>, the institution is **closed today**. Students already on campus will be sent home safely. Further updates will follow.',
    priority: 'important',
    requiresAck: true,
    channels: ['boards', 'teacher', 'student', 'parent'],
  },
  {
    id: 'builtin:staff-meeting',
    name: 'Staff meeting',
    title: 'Staff meeting on <date>',
    body: 'All staff are requested to attend a meeting on **<date>** at <time> in <venue>.\n\nAgenda:\n1. <item>\n2. <item>',
    priority: 'normal',
    requiresAck: true,
    channels: ['teacher'],
  },
];
