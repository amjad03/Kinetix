import { describe, expect, it } from 'vitest';
import { plainText, unsafeLink } from '../announcements/announcements.logic.js';
import { outsideOfficeHours, studentChatEnabled, tick, validOfficeHours } from './chat-rules.js';

describe('family chat rules', () => {
  const hours = { start: '09:00', end: '17:00', days: [1, 2, 3, 4, 5, 6] };

  it('knows office hours in the institution time zone', () => {
    // Tuesday 10:00 IST is inside; 18:30 IST is outside; Sunday is outside.
    expect(outsideOfficeHours(new Date('2026-10-20T04:30:00Z'), 'Asia/Kolkata', hours)).toBe(false);
    expect(outsideOfficeHours(new Date('2026-10-20T13:00:00Z'), 'Asia/Kolkata', hours)).toBe(true);
    expect(outsideOfficeHours(new Date('2026-10-25T04:30:00Z'), 'Asia/Kolkata', hours)).toBe(true);
    expect(outsideOfficeHours(new Date('2026-10-25T04:30:00Z'), 'Asia/Kolkata', null)).toBe(false);
    expect(validOfficeHours(hours)).toBe(true);
    expect(validOfficeHours({ start: '17:00', end: '09:00', days: [1] })).toBe(false);
    expect(validOfficeHours({ start: '09:00', end: '17:00', days: [] })).toBe(false);
  });

  it('turns ticks from sent to delivered to read', () => {
    const at = new Date('2026-10-20T05:00:00Z');
    expect(tick(at, { readAt: null, deliveredAt: null })).toBe('sent');
    expect(tick(at, { readAt: null, deliveredAt: new Date('2026-10-20T05:01:00Z') })).toBe('delivered');
    expect(tick(at, { readAt: new Date('2026-10-20T05:02:00Z'), deliveredAt: null })).toBe('read');
    expect(tick(at, { readAt: new Date('2026-10-20T04:00:00Z'), deliveredAt: new Date('2026-10-20T04:00:00Z') })).toBe('sent');
  });

  it('lets students chat by default at colleges, not schools', () => {
    expect(studentChatEnabled(undefined, 'college')).toBe(true);
    expect(studentChatEnabled(undefined, 'school')).toBe(false);
    expect(studentChatEnabled({ studentChat: true }, 'school')).toBe(true);
  });
});

describe('announcement text', () => {
  it('becomes plain text for boards and refuses unsafe links', () => {
    expect(plainText('**Closed** today\n- Buses off\n[Details](https://x.in/a)')).toBe('Closed today\n• Buses off\nDetails (https://x.in/a)');
    expect(unsafeLink('see [x](javascript:alert(1))')).toBe(true);
    expect(unsafeLink('see [x](https://x.in)')).toBe(false);
  });
});
