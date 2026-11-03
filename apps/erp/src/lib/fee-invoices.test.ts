import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/api', () => ({ api: vi.fn() }));
const { invoicesPath, invoicesUpTo } = await import('./fee-invoices');

describe('fee invoice pages', () => {
  it('builds the query from what is set', () => {
    expect(invoicesPath({})).toBe('/v1/fees/invoices');
    expect(invoicesPath({ status: 'due', dueBefore: '2026-11-03', sectionId: '', limit: 100 })).toBe('/v1/fees/invoices?status=due&dueBefore=2026-11-03&limit=100');
  });

  it('walks the cursor and stops at the cap', async () => {
    const paths: string[] = [];
    const pages: Record<string, { rows: number[]; nextCursor: string | null }> = { '': { rows: [1, 2], nextCursor: 'c1' }, c1: { rows: [3, 4], nextCursor: 'c2' }, c2: { rows: [5], nextCursor: null } };
    const get = async (path: string) => {
      paths.push(path);
      return pages[new URL(path, 'http://x').searchParams.get('cursor') ?? ''];
    };
    expect(await invoicesUpTo<number>({ status: 'due' }, 1000, get)).toEqual([1, 2, 3, 4, 5]);
    expect(paths).toHaveLength(3);
    paths.length = 0;
    expect(await invoicesUpTo<number>({ status: 'due' }, 3, get)).toEqual([1, 2, 3, 4]);
    expect(paths[0]).toContain('limit=3');
  });
});
