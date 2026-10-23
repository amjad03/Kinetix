/**
 * Server-side check of the SVG that "AI draw" returns before it reaches a board. The SVG is
 * re-built from an allow-list: drawing elements and presentation attributes only. Scripts,
 * event handlers, foreignObject, external links, entities, CSS url()/import and anything the
 * tokenizer cannot read are dropped or refused, so what a board renders is plain vector art.
 */

export const SVG_MAX_INPUT = 200_000;
export const SVG_MAX_OUTPUT = 120_000;
const MAX_ELEMENTS = 2_000;

const ELEMENTS = new Set([
  'svg', 'g', 'defs', 'title', 'desc', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'text', 'tspan',
  'marker', 'lineargradient', 'radialgradient', 'stop', 'clippath', 'pattern', 'symbol', 'use',
]);
/** Elements whose content is dropped entirely (never rendered or copied). */
const DROP_WITH_CONTENT = new Set(['script', 'style', 'foreignobject', 'iframe', 'object', 'embed', 'image', 'a', 'animate', 'set', 'animatetransform', 'animatemotion', 'handler', 'audio', 'video']);

const ATTRIBUTES = new Set([
  'id', 'class', 'viewbox', 'width', 'height', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'd', 'points',
  'fill', 'fill-opacity', 'fill-rule', 'stroke', 'stroke-width', 'stroke-opacity', 'stroke-linecap', 'stroke-linejoin', 'stroke-dasharray',
  'stroke-dashoffset', 'stroke-miterlimit', 'opacity', 'transform', 'font-size', 'font-family', 'font-weight', 'font-style', 'text-anchor',
  'dominant-baseline', 'alignment-baseline', 'dx', 'dy', 'rotate', 'marker-start', 'marker-mid', 'marker-end', 'markerwidth', 'markerheight',
  'refx', 'refy', 'orient', 'markerunits', 'offset', 'stop-color', 'stop-opacity', 'gradientunits', 'gradienttransform', 'fx', 'fy',
  'clip-path', 'clippathunits', 'patternunits', 'preserveaspectratio', 'href', 'xlink:href', 'xmlns', 'xmlns:xlink', 'version', 'visibility', 'display',
]);

export class SvgRejected extends Error {}

const escapeAttr = (v: string) => v.replace(/&(?!(amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);)/gi, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const escapeText = (v: string) => v.replace(/&(?!(amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);)/gi, '&amp;').replace(/>/g, '&gt;');

function safeValue(name: string, value: string): boolean {
  const v = value.replace(/[\s\u0000-\u001f]+/g, '').toLowerCase();
  if (/javascript:|vbscript:|data:|expression\(|@import|<|>/.test(v)) return false;
  if (name === 'href' || name === 'xlink:href') return /^#[\w.-]+$/.test(value.trim());
  // url() only to something inside this SVG (a marker, gradient or clip path).
  for (const m of v.matchAll(/url\(([^)]*)\)/g)) if (!/^['"]?#[\w.-]+['"]?$/.test(m[1])) return false;
  return value.length <= 20_000;
}

/**
 * The SVG rebuilt from the allow-list. Throws [SvgRejected] when it is not an SVG, too big, too
 * complex or malformed (the model is then asked to try again).
 */
export function sanitizeSvg(input: string): string {
  let src = input.trim().replace(/^```(?:svg|xml)?\s*|\s*```$/g, '');
  if (src.length > SVG_MAX_INPUT) throw new SvgRejected('The SVG is too large');
  src = src.replace(/^<\?xml[^>]*\?>\s*/i, '').replace(/<!--[\s\S]*?-->/g, '');
  if (/<!|<\?/.test(src)) throw new SvgRejected('Doctype, entities, CDATA and processing instructions are not allowed');
  const start = src.search(/<svg[\s>]/i);
  if (start < 0) throw new SvgRejected('No <svg> element');
  src = src.slice(start);

  const out: string[] = [];
  const stack: string[] = [];
  let dropDepth = 0;
  let elements = 0;
  const token = /<\/?([A-Za-z][\w:.-]*)((?:\s+[A-Za-z_:][\w:.-]*\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)|(<)/g;
  for (const m of src.matchAll(token)) {
    const [whole, rawName, attrs, selfClose, text, stray] = m;
    if (stray) throw new SvgRejected('Malformed markup');
    if (text !== undefined) {
      if (!dropDepth && stack.length) out.push(escapeText(text));
      continue;
    }
    const name = rawName.toLowerCase();
    const closing = whole.startsWith('</');
    if (closing) {
      if (stack.pop() !== name) throw new SvgRejected(`Unbalanced </${name}>`);
      if (dropDepth) dropDepth--;
      else if (ELEMENTS.has(name)) out.push(`</${rawName}>`);
      if (!stack.length) break; // the root closed: ignore anything after it
      continue;
    }
    if (!stack.length && name !== 'svg') throw new SvgRejected('The root element must be <svg>');
    if (++elements > MAX_ELEMENTS) throw new SvgRejected('The SVG has too many elements');
    const dropped = dropDepth > 0 || DROP_WITH_CONTENT.has(name) || !ELEMENTS.has(name);
    if (!selfClose) {
      stack.push(name);
      if (dropped) dropDepth++;
    }
    if (dropped) continue;
    const kept: string[] = [];
    for (const a of attrs.matchAll(/([A-Za-z_:][\w:.-]*)\s*=\s*("([^"]*)"|'([^']*)')/g)) {
      const attr = a[1].toLowerCase();
      const value = a[3] ?? a[4] ?? '';
      if (attr.startsWith('on') || !ATTRIBUTES.has(attr) || !safeValue(attr, value)) continue;
      if (name === 'svg' && attr.startsWith('xmlns')) continue; // set below
      kept.push(`${a[1]}="${escapeAttr(value)}"`);
    }
    if (name === 'svg' && out.length === 0) kept.unshift('xmlns="http://www.w3.org/2000/svg"');
    out.push(`<${rawName}${kept.length ? ' ' + kept.join(' ') : ''}${selfClose ? '/' : ''}>`);
  }
  if (stack.length) throw new SvgRejected('The SVG is not closed');
  const svg = out.join('');
  if (!/^<svg[^>]*\bviewBox="/i.test(svg)) throw new SvgRejected('The <svg> needs a viewBox');
  if (svg.length > SVG_MAX_OUTPUT) throw new SvgRejected('The SVG is too large');
  if (!/<(path|rect|circle|ellipse|line|polyline|polygon|text)\b/i.test(svg)) throw new SvgRejected('The SVG draws nothing');
  return svg;
}
