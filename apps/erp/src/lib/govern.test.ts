import { describe, expect, it } from 'vitest';
import { canSee, sectionOf } from './access';
import { auditExportPath, auditPageNo, auditParams, connectorConfig, formatAggregates, formatFilters, formatSort, parseDefinition } from './govern';

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

describe('custom report builder text', () => {
  it('reads columns, totals, filters and sort', () => {
    const r = parseDefinition({ groupBy: 'title', aggregates: 'count, sum:amount', filters: 'amount gte 5000\nstatus in paid, due\nstudent is_null', sort: 'sum_amount desc', limit: '200' });
    expect(r).toEqual({
      ok: true,
      value: {
        columns: [],
        groupBy: ['title'],
        aggregates: [{ fn: 'count' }, { fn: 'sum', field: 'amount' }],
        filters: [{ field: 'amount', op: 'gte', value: '5000' }, { field: 'status', op: 'in', value: ['paid', 'due'] }, { field: 'student', op: 'is_null' }],
        sort: [{ field: 'sum_amount', dir: 'desc' }],
        limit: 200,
      },
    });
  });

  it('names the line it cannot read', () => {
    expect(parseDefinition({ aggregates: 'total:amount' })).toEqual({ ok: false, line: 'total:amount' });
    expect(parseDefinition({ filters: 'amount bigger 5' })).toEqual({ ok: false, line: 'amount bigger 5' });
    expect(parseDefinition({ filters: 'amount gte' })).toEqual({ ok: false, line: 'amount gte' });
    expect(parseDefinition({ sort: 'x sideways' })).toEqual({ ok: false, line: 'x sideways' });
    expect(parseDefinition({ limit: '9000' }).ok).toBe(false);
  });

  it('writes a saved definition back the way it reads', () => {
    const def = { aggregates: [{ fn: 'count' }, { fn: 'avg', field: 'paid' }], filters: [{ field: 'status', op: 'in', value: ['paid', 'due'] }, { field: 'x', op: 'not_null' }], sort: [{ field: 'count', dir: 'desc' as const }] };
    expect(formatAggregates(def.aggregates)).toBe('count, avg:paid');
    expect(formatFilters(def.filters)).toBe('status in paid, due\nx not_null');
    expect(formatSort(def.sort)).toBe('count desc');
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
