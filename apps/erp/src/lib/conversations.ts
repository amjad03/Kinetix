// Parent–teacher threads, read-only for school leaders. Pure.

import type { ConversationMessage, ConversationSummary } from './types';

/** Every word typed must appear in the student, class, teacher or family name. */
export function filterThreads(list: ConversationSummary[], query: string): ConversationSummary[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return list;
  return list.filter((c) => {
    const hay = `${c.student.fullName} ${c.className} ${c.staff.fullName} ${c.family.fullName}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}

/** Which side of the thread wrote a message. */
export function senderSide(m: Pick<ConversationMessage, 'senderId'>, c: Pick<ConversationSummary, 'staff' | 'family'>): 'staff' | 'family' | 'other' {
  if (m.senderId === c.staff.id) return 'staff';
  if (m.senderId === c.family.id) return 'family';
  return 'other';
}
