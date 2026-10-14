import { describe, expect, it } from 'vitest';
import { fileSize, parseInline, parseRich, pctOf } from './communication';

describe('announcement rich text', () => {
  it('reads bold and http(s) links, and leaves other links as text', () => {
    expect(parseInline('Closed **today** see [notice](https://x.in/a) or [bad](javascript:alert(1))')).toEqual([
      { kind: 'text', text: 'Closed ' },
      { kind: 'bold', text: 'today' },
      { kind: 'text', text: ' see ' },
      { kind: 'link', text: 'notice', href: 'https://x.in/a' },
      { kind: 'text', text: ' or [bad](javascript:alert(1))' },
    ]);
  });

  it('groups lines into paragraphs and lists', () => {
    const blocks = parseRich('Dear parents,\nPlease note:\n\n- Bring the diary\n- Meet the class teacher\n1. First\n2. Second');
    expect(blocks.map((b) => b.kind)).toEqual(['p', 'ul', 'ol']);
    expect(blocks[0]).toMatchObject({ lines: [[{ text: 'Dear parents,' }], [{ text: 'Please note:' }]] });
    expect(blocks[1]).toMatchObject({ items: [[{ text: 'Bring the diary' }], [{ text: 'Meet the class teacher' }]] });
  });

  it('formats percentages and sizes', () => {
    expect(pctOf(2, 3)).toBe(66);
    expect(pctOf(1, 0)).toBe(0);
    expect(fileSize(2048)).toBe('2 KB');
    expect(fileSize(1_500_000)).toBe('1.5 MB');
  });
});
