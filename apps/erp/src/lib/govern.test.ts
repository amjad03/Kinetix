import { describe, expect, it } from 'vitest';
import { canSee, sectionOf } from './access';
import { auditExportPath, auditPageNo, auditParams, connectorConfig } from './govern';

describe('audit page filters', () => {
  it('keeps only well-formed filters', () => {
    const q = auditParams({ action: 'fees.*', subjectType: 'fee_invoice', subjectId: 'nope', actorId: '3f2b8c1e-9d4a-4c55-8e0a-1b2c3d4e5f60', from: '2026-10-01', to: '10/20/2026' });
    expect(Object.fromEntries(q)).toEqual({ action: 'fees.*', subjectType: 'fee_invoice', actorId: '3f2b8c1e-9d4a-4c55-8e0a-1b2c3d4e5f60', from: '2026-10-01' });
    expect(auditParams({ action: "x'; drop table" }).toString()).toBe('');
  });

  it('numbers pages from one and builds the download link', () => {
    expect(auditPageNo(undefined)).toBe(1);
    expect(auditPageNo('0')).toBe(1);
    expect(auditPageNo('3')).toBe(3);
    expect(decodeURIComponent(auditExportPath(new URLSearchParams({ action: 'a.*' })))).toBe('/api/export?path=/v1/audit/export?action=a.*');
  });
});

describe('connector settings', () => {
  it('leaves empty secrets out so the stored one is kept, and splits events', () => {
    const fields = [
      { key: 'url', label: 'URL', kind: 'url' as const, required: true },
      { key: 'secret', label: 'Secret', kind: 'secret' as const, required: true },
      { key: 'events', label: 'Events', kind: 'events' as const, required: false },
    ];
    expect(connectorConfig(fields, { c_url: ' https://x.example/h ', c_secret: '', c_events: 'a.b\nc.*  d' })).toEqual({ url: 'https://x.example/h', events: ['a.b', 'c.*', 'd'] });
  });
});

describe('access to the new pages', () => {
  it('limits the audit log and connectors to leaders, and alumni giving to alumni relations and accounts', () => {
    expect(canSee(['principal'], 'audit')).toBe(true);
    expect(canSee(['hod'], 'audit')).toBe(false);
    expect(canSee(['accountant'], 'connectors')).toBe(false);
    expect(canSee(['accountant'], 'alumni')).toBe(true);
    expect(canSee(['placement_officer'], 'alumni')).toBe(true);
    expect(canSee(['hr_manager'], 'alumni')).toBe(false);
    expect(sectionOf('/audit')).toBe('audit');
    expect(sectionOf('/connectors')).toBe('connectors');
    expect(sectionOf('/alumni')).toBe('alumni');
    expect(sectionOf('/reports/custom')).toBe('reports');
  });
});
