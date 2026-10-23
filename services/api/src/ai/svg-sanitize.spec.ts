import { describe, expect, it } from 'vitest';
import { sanitizeSvg, SvgRejected, SVG_MAX_INPUT } from './svg-sanitize.js';
import { buildMessages, checkOutput, postProcess, previewOutput, TaskInputs } from './tasks.js';

const ok = '<svg viewBox="0 0 100 100" width="100"><g stroke="black"><circle cx="50" cy="50" r="20" fill="url(#g)"/><text x="10" y="90">V = IR &amp; more</text></g></svg>';

describe('AI draw SVG sanitiser', () => {
  it('keeps plain drawing markup and adds the namespace', () => {
    const out = sanitizeSvg('```svg\n<?xml version="1.0"?>' + ok + '\n```');
    expect(out).toBe('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100"><g stroke="black"><circle cx="50" cy="50" r="20" fill="url(#g)"/><text x="10" y="90">V = IR &amp; more</text></g></svg>');
    expect(sanitizeSvg(out)).toBe(out); // idempotent (cached replies are processed again)
  });

  it('drops scripts, handlers, foreignObject, styles, images and external links', () => {
    const evil =
      '<svg viewBox="0 0 10 10" onload="alert(1)"><script>alert(1)</script><style>@import url(http://x)</style><foreignObject><div>x</div></foreignObject>' +
      '<image href="http://x/a.png"/><a href="javascript:alert(1)"><rect width="5" height="5"/></a><use href="http://evil/#x"/><use href="#ok"/>' +
      '<rect width="2" height="2" fill="url(http://x)" style="x" onclick="y"/><path d="M0 0L5 5" stroke="javascript:1"/></svg>';
    const out = sanitizeSvg(evil);
    expect(out.replace('http://www.w3.org/2000/svg', '')).not.toMatch(/script|onload|onclick|foreignObject|style|image|http|<a/i);
    expect(out).toContain('<use href="#ok"/>');
    expect(out).toContain('<rect width="2" height="2"/>');
    expect(out).toContain('<path d="M0 0L5 5"/>');
  });

  it('refuses what is not a usable SVG', () => {
    for (const bad of [
      'no svg here',
      '<!DOCTYPE svg [<!ENTITY x "y">]><svg viewBox="0 0 1 1"><rect/></svg>',
      '<svg viewBox="0 0 1 1"><g><rect/></svg>',
      '<svg><rect width="1" height="1"/></svg>',
      '<svg viewBox="0 0 1 1"><g/></svg>',
      '<svg viewBox="0 0 1 1"><rect/> < </svg>',
      `<svg viewBox="0 0 1 1">${'<rect/>'.repeat(SVG_MAX_INPUT / 7 + 1)}</svg>`,
    ])
      expect(() => sanitizeSvg(bad), bad.slice(0, 40)).toThrow(SvgRejected);
  });

  it('asks the model again when the SVG is unusable, and sanitises the kept one', () => {
    const input = TaskInputs.draw.parse({ prompt: 'a cell' });
    expect(checkOutput('draw', input, { title: 'Cell', svg: '<svg><rect/></svg>' })).toMatch(/viewBox/);
    expect(checkOutput('draw', input, { title: 'Cell', svg: ok })).toBeNull();
    expect(postProcess('draw', input, { title: 'Cell', svg: ok.replace('<g', '<g onclick="x"') }).svg).not.toContain('onclick');
    expect(previewOutput('draw', input).svg).toMatch(/^<svg xmlns/);
    expect(() => TaskInputs.draw.parse({})).toThrow();
  });

  it('sends the sketch PNG to the vision model and tidies the labels', () => {
    const image = 'A'.repeat(200);
    const input = TaskInputs.recognizeSketch.parse({ image });
    const [, user] = buildMessages('recognizeSketch', input, { institution: 'X', institutionKind: 'college' });
    expect((user.content as { type: string }[]).map((c) => c.type)).toEqual(['text', 'image_url']);
    expect(postProcess('recognizeSketch', input, { labels: ['Heart.', 'heart', ' Sun '], latex: '$x^2$', text: ' ' })).toEqual({ labels: ['heart', 'sun'], latex: 'x^2' });
  });
});
