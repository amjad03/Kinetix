import { describe, expect, it } from 'vitest';
import type { SearchHit } from './insights';
import { groupHits, safeHitUrl } from './search';

const hit = (type: SearchHit['type'], id: string, score: number): SearchHit => ({ type, id, title: id, subtitle: '', url: `/x/${id}`, score });

describe('search results', () => {
  it('groups by kind in a fixed order, best match first', () => {
    const g = groupHits([hit('reports', 'r1', 0.5), hit('students', 's1', 0.4), hit('students', 's2', 0.9), hit('topics', 't1', 0.3)]);
    expect(g.map((x) => x.type)).toEqual(['students', 'topics', 'reports']);
    expect(g[0].hits.map((h) => h.id)).toEqual(['s2', 's1']);
  });
  it('returns nothing for no hits', () => {
    expect(groupHits([])).toEqual([]);
  });
  it('only follows paths on this site', () => {
    expect(safeHitUrl('/students/1')).toBe('/students/1');
    expect(safeHitUrl('//evil.example')).toBeNull();
    expect(safeHitUrl('https://evil.example')).toBeNull();
  });
});
