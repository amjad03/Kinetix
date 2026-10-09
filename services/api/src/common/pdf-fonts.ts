import { readFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import * as hb from 'harfbuzzjs';

/**
 * Hindi (Devanagari) and Kannada text for the PDF writers. Noto Sans fonts (OFL, in assets/fonts)
 * are shaped with HarfBuzz so conjuncts and vowel signs come out right, then embedded as
 * Identity-H CID fonts with a ToUnicode map and ActualText spans so the text stays copyable.
 * Latin text keeps using the built-in Helvetica in the callers.
 */

export type Script = 'dev' | 'kn';

const FILES: Record<Script, [string, string]> = {
  dev: ['NotoSansDevanagari-Regular.ttf', 'NotoSansDevanagari-Bold.ttf'],
  kn: ['NotoSansKannada-Regular.ttf', 'NotoSansKannada-Bold.ttf'],
};

const scriptOf = (cp: number): Script | null => ((cp >= 0x900 && cp <= 0x97f) || (cp >= 0xa8e0 && cp <= 0xa8ff) ? 'dev' : cp >= 0xc80 && cp <= 0xcff ? 'kn' : null);

/** True when the text has any Devanagari or Kannada character. */
export const hasIndic = (s: string): boolean => /[ऀ-ॿ꣠-ꣿಀ-೿]/.test(s);

export interface Run {
  script: Script | null;
  text: string;
}

/** Splits text into runs by script; spaces, digits and punctuation join an Indic run only when it continues on both sides. */
export function splitRuns(s: string): Run[] {
  const chars = [...s];
  const sc: (Script | null | undefined)[] = chars.map((c) => {
    const cp = c.codePointAt(0)!;
    const x = scriptOf(cp);
    if (x) return x;
    return cp === 0x200c || cp === 0x200d ? undefined : cp < 0x80 && !/[A-Za-z]/.test(c) ? undefined : null;
  });
  for (let i = 0; i < chars.length; i++) {
    if (sc[i] !== undefined) continue;
    let j = i;
    while (j < chars.length && sc[j] === undefined) j++;
    const prev = i > 0 ? sc[i - 1] : null;
    const next = j < chars.length ? sc[j] : null;
    const join = prev && prev === next ? prev : null;
    for (let k = i; k < j; k++) sc[k] = join;
    i = j - 1;
  }
  const runs: Run[] = [];
  chars.forEach((c, i) => {
    const last = runs[runs.length - 1];
    if (last && last.script === sc[i]) last.text += c;
    else runs.push({ script: sc[i] as Script | null, text: c });
  });
  return runs;
}

interface Face {
  data: Buffer;
  font: hb.Font;
  upem: number;
  bbox: number[];
  ascent: number;
  descent: number;
  name: string;
}

const faces = new Map<string, Face>();

function face(script: Script, bold: boolean): Face {
  const file = FILES[script][bold ? 1 : 0];
  let f = faces.get(file);
  if (!f) {
    const data = readFileSync(new URL(`../../assets/fonts/${file}`, import.meta.url));
    const hf = new hb.Face(new hb.Blob(data));
    const font = new hb.Font(hf);
    // head table: unitsPerEm at 18, bounding box at 36..43.
    const n = data.readUInt16BE(4);
    let head = 0;
    for (let i = 0; i < n; i++) if (data.toString('latin1', 12 + i * 16, 16 + i * 16) === 'head') head = data.readUInt32BE(20 + i * 16);
    const bbox = [36, 38, 40, 42].map((o) => data.readInt16BE(head + o));
    const ext = font.hExtents();
    f = { data, font, upem: hf.upem, bbox, ascent: ext.ascender, descent: ext.descender, name: file.replace('.ttf', '') };
    faces.set(file, f);
  }
  return f;
}

export interface ShapedGlyph {
  gid: number;
  adv: number;
  dx: number;
  dy: number;
  /** Source text this glyph stands for (set on the first glyph of each cluster, '' on the rest). */
  text: string;
}

export interface Shaped {
  glyphs: ShapedGlyph[];
  /** Total advance, per 1000 em. */
  width: number;
  upem: number;
}

const shapeCache = new Map<string, Shaped>();

/** Shapes one run of a single script with HarfBuzz. */
export function shapeRun(script: Script, bold: boolean, text: string): Shaped {
  const key = `${script}${bold ? 'b' : 'r'}:${text}`;
  const hit = shapeCache.get(key);
  if (hit) return hit;
  const f = face(script, bold);
  const buf = new hb.Buffer();
  buf.addText(text);
  buf.guessSegmentProperties();
  hb.shape(f.font, buf);
  const infos = buf.getGlyphInfos();
  const pos = buf.getGlyphPositions();
  const clusters = [...new Set(infos.map((i) => i.cluster))].sort((a, b) => a - b);
  const seen = new Set<number>();
  let total = 0;
  const glyphs = infos.map((g, i) => {
    let t = '';
    if (!seen.has(g.cluster)) {
      seen.add(g.cluster);
      const nxt = clusters[clusters.indexOf(g.cluster) + 1] ?? text.length;
      t = text.slice(g.cluster, nxt);
    }
    total += pos[i].xAdvance;
    return { gid: g.codepoint, adv: pos[i].xAdvance, dx: pos[i].xOffset, dy: pos[i].yOffset, text: t };
  });
  const out = { glyphs, width: (total * 1000) / f.upem, upem: f.upem };
  shapeCache.set(key, out);
  return out;
}

const hex4 = (n: number) => n.toString(16).padStart(4, '0');
const utf16hex = (s: string) => {
  let o = '';
  for (let i = 0; i < s.length; i++) o += hex4(s.charCodeAt(i));
  return o;
};
const num = (n: number) => (Math.round(n * 100) / 100).toString();

interface Used {
  script: Script;
  bold: boolean;
  gids: Map<number, { adv: number; text: string }>;
}

/** The Indic fonts one document uses; collects glyphs while text is drawn and writes the font objects at build time. */
export class IndicFonts {
  private readonly used = new Map<string, Used>();

  get any(): boolean {
    return this.used.size > 0;
  }

  /** Resource names (for /Font dictionaries) in a stable order. */
  names(): string[] {
    return [...this.used.keys()];
  }

  private use(script: Script, bold: boolean): { name: string; u: Used } {
    const name = `FI${script}${bold ? 'B' : 'R'}`;
    let u = this.used.get(name);
    if (!u) this.used.set(name, (u = { script, bold, gids: new Map() }));
    return { name, u };
  }

  /**
   * Content-stream text (one BT…ET) for `s` starting at (x, y) in PDF coordinates, mixing Indic runs
   * with Latin runs drawn in `latinFont`. `latin` makes a Latin run safe for the page and measures it.
   */
  draw(s: string, x: number, y: number, size: number, bold: boolean, latinFont: string, latin: { clean: (t: string) => string; width: (t: string) => number; escape: (t: string) => string }): string {
    const ops: string[] = [];
    let cx = x;
    for (const r of splitRuns(s)) {
      if (!r.script) {
        const t = latin.clean(r.text);
        if (t) ops.push(`/${latinFont} ${num(size)} Tf 1 0 0 1 ${num(cx)} ${num(y)} Tm (${latin.escape(t)}) Tj`);
        cx += latin.width(t);
        continue;
      }
      const sh = shapeRun(r.script, bold, r.text);
      const { name, u } = this.use(r.script, bold);
      ops.push(`/Span << /ActualText <FEFF${utf16hex(r.text)}> >> BDC /${name} ${num(size)} Tf`);
      let gx = cx;
      for (const g of sh.glyphs) {
        if (!u.gids.has(g.gid) || (g.text && !u.gids.get(g.gid)!.text)) u.gids.set(g.gid, { adv: (g.adv * 1000) / sh.upem, text: g.text });
        ops.push(`1 0 0 1 ${num(gx + (g.dx * size) / sh.upem)} ${num(y + (g.dy * size) / sh.upem)} Tm <${hex4(g.gid)}> Tj`);
        gx += (g.adv * size) / sh.upem;
      }
      ops.push('EMC');
      cx += (sh.width * size) / 1000;
    }
    return `BT ${ops.join(' ')} ET`;
  }

  /** Width in points of `s` at `size`, Latin runs measured by `latinWidth`. */
  static width(s: string, size: number, bold: boolean, latinWidth: (t: string) => number): number {
    let w = 0;
    for (const r of splitRuns(s)) w += r.script ? (shapeRun(r.script, bold, r.text).width * size) / 1000 : latinWidth(r.text);
    return w;
  }

  /**
   * PDF objects for every used font, five each (Type0, CIDFontType2, descriptor, font file,
   * ToUnicode), numbered from `first`. Returns the objects and each font's resource name to object number.
   */
  objects(first: number): { objs: Buffer[]; refs: Record<string, number> } {
    const objs: Buffer[] = [];
    const refs: Record<string, number> = {};
    const b = (s: string) => Buffer.from(s, 'latin1');
    let n = first;
    for (const [name, u] of this.used) {
      const f = face(u.script, u.bold);
      const ps = `${f.name}`;
      const scale = 1000 / f.upem;
      refs[name] = n;
      const gids = [...u.gids.keys()].sort((a, c) => a - c);
      objs.push(b(`<< /Type /Font /Subtype /Type0 /BaseFont /${ps} /Encoding /Identity-H /DescendantFonts [${n + 1} 0 R] /ToUnicode ${n + 4} 0 R >>`));
      objs.push(b(`<< /Type /Font /Subtype /CIDFontType2 /BaseFont /${ps} /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor ${n + 2} 0 R /CIDToGIDMap /Identity /DW 0 /W [${gids.map((g) => `${g} [${num(u.gids.get(g)!.adv)}]`).join(' ')}] >>`));
      objs.push(b(`<< /Type /FontDescriptor /FontName /${ps} /Flags 4 /FontBBox [${f.bbox.map((v) => Math.round(v * scale)).join(' ')}] /ItalicAngle 0 /Ascent ${Math.round(f.ascent * scale)} /Descent ${Math.round(f.descent * scale)} /CapHeight ${Math.round(f.ascent * scale * 0.7)} /StemV ${u.bold ? 140 : 80} /FontFile2 ${n + 3} 0 R >>`));
      const z = deflateSync(f.data);
      objs.push(Buffer.concat([b(`<< /Length ${z.length} /Length1 ${f.data.length} /Filter /FlateDecode >>\nstream\n`), z, b('\nendstream')]));
      const map = gids.filter((g) => u.gids.get(g)!.text).map((g) => `<${hex4(g)}> <${utf16hex(u.gids.get(g)!.text)}>`);
      const chunks: string[] = [];
      for (let i = 0; i < map.length; i += 100) chunks.push(`${Math.min(100, map.length - i)} beginbfchar\n${map.slice(i, i + 100).join('\n')}\nendbfchar`);
      const cmap = `/CIDInit /ProcSet findresource begin 12 dict begin begincmap /CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def /CMapName /Adobe-Identity-UCS def /CMapType 2 def 1 begincodespacerange <0000> <FFFF> endcodespacerange\n${chunks.join('\n')}\nendcmap CMapName currentdict /CMap defineresource pop end end`;
      objs.push(b(`<< /Length ${cmap.length} >>\nstream\n${cmap}\nendstream`));
      n += 5;
    }
    return { objs, refs };
  }
}
