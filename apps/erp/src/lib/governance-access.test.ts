import { describe, expect, it } from 'vitest';
import { approvalHref, changesOf, deviceName, draftFor, exportBusy, formatBytes, groupModules, levelOf, narrowedCount, rangeParams, toggleKind } from './governance-access';

const matrix = {
  modules: [
    { key: 'fees', label: 'Fees', group: 'finance', usedBy: ['principal', 'accountant'] },
    { key: 'tasks', label: 'Tasks', group: 'work', usedBy: ['teacher'] },
    { key: 'admissions', label: 'Admissions', group: 'students', usedBy: ['principal'] },
  ],
  rules: [{ role: 'teacher', module: 'tasks', access: 'read' as const }],
};

describe('role access editor', () => {
  it('reads a level, defaulting to full', () => {
    expect(levelOf(matrix.rules, 'teacher', 'tasks')).toBe('read');
    expect(levelOf(matrix.rules, 'teacher', 'fees')).toBe('full');
    expect(narrowedCount(matrix.rules, 'teacher')).toBe(1);
    expect(narrowedCount(matrix.rules, 'accountant')).toBe(0);
  });

  it('sends only what the draft changed', () => {
    const draft = draftFor(matrix, 'teacher');
    expect(draft).toEqual({ fees: 'full', tasks: 'read', admissions: 'full' });
    expect(changesOf(matrix, 'teacher', draft)).toEqual([]);
    expect(changesOf(matrix, 'teacher', { ...draft, tasks: 'full', fees: 'none' })).toEqual([
      { module: 'fees', access: 'none' },
      { module: 'tasks', access: 'full' },
    ]);
  });

  it('groups modules in the catalog order', () => {
    expect(groupModules(matrix.modules).map((g) => [g.group, g.modules.map((m) => m.key)])).toEqual([
      ['students', ['admissions']],
      ['finance', ['fees']],
      ['work', ['tasks']],
    ]);
  });
});

describe('notification switches', () => {
  it('turning a kind off also clears its push choice; push can be off on its own', () => {
    expect(toggleKind({ off: [], pushOff: ['fee'] }, 'fee', 'send', false)).toEqual({ off: ['fee'], pushOff: [] });
    expect(toggleKind({ off: ['fee'], pushOff: [] }, 'fee', 'send', true)).toEqual({ off: [], pushOff: [] });
    expect(toggleKind({ off: [], pushOff: [] }, 'marks', 'push', false)).toEqual({ off: [], pushOff: ['marks'] });
    expect(toggleKind({ off: [], pushOff: ['marks'] }, 'marks', 'push', true)).toEqual({ off: [], pushOff: [] });
  });
});

describe('small helpers', () => {
  it('names a device from its user agent', () => {
    expect(deviceName({ label: '', userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36' })).toBe('Chrome · Windows');
    expect(deviceName({ label: '', userAgent: 'Dart/3.4 (dart:io) Android' })).toBe('App · Android');
    expect(deviceName({ label: 'Office PC', userAgent: 'x' })).toBe('Office PC');
    expect(deviceName({ label: '', userAgent: null })).toBe('');
  });

  it('formats sizes, ranges, busy exports and approval links', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(250 * 1024 * 1024)).toBe('250 MB');
    expect(formatBytes(null)).toBe('');
    expect(rangeParams({ from: '2026-10-01', to: '2026-10-14' }).toString()).toBe('from=2026-10-01&to=2026-10-14');
    expect(rangeParams({ from: '2026-10-20', to: '2026-10-14' }).toString()).toBe('to=2026-10-14');
    expect(rangeParams({ from: 'yesterday' }).toString()).toBe('');
    expect(exportBusy([{ status: 'ready' }, { status: 'running' }])).toBe(true);
    expect(exportBusy([{ status: 'ready' }, { status: 'failed' }])).toBe(false);
    expect(approvalHref('task')).toBe('/tasks');
    expect(approvalHref('staff_leave')).toBe('/hr/leave');
    expect(approvalHref('student_leave')).toBeNull();
  });
});
