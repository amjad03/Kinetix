import { describe, expect, it } from 'vitest';
import { filterThreads, senderSide } from './conversations';
import type { ConversationSummary } from './types';

const thread = (id: string, student: string, cls: string, staff: string, family: string): ConversationSummary => ({
  id,
  student: { id: `s-${id}`, fullName: student },
  className: cls,
  staff: { id: `t-${id}`, fullName: staff },
  family: { id: `f-${id}`, fullName: family },
  lastMessageAt: null,
  lastMessage: null,
});

describe('conversations', () => {
  const list = [thread('1', 'Aarav Patel', 'BCom Sem 3 A', 'Anita Sharma', 'Rajesh Patel'), thread('2', 'Diya Patel', 'BCA Sem 1 A', 'Ravi Kumar', 'Rajesh Patel')];

  it('finds threads by student, class, teacher or family', () => {
    expect(filterThreads(list, '').map((c) => c.id)).toEqual(['1', '2']);
    expect(filterThreads(list, 'rajesh').map((c) => c.id)).toEqual(['1', '2']);
    expect(filterThreads(list, 'anita').map((c) => c.id)).toEqual(['1']);
    expect(filterThreads(list, 'patel bca').map((c) => c.id)).toEqual(['2']);
    expect(filterThreads(list, 'nobody')).toEqual([]);
  });

  it('tells the teacher from the family', () => {
    expect(senderSide({ senderId: 't-1' }, list[0])).toBe('staff');
    expect(senderSide({ senderId: 'f-1' }, list[0])).toBe('family');
    expect(senderSide({ senderId: 'x' }, list[0])).toBe('other');
  });
});
