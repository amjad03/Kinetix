import type { ColorRef, DocElement, DocLayout, DocType, ElementSchema, Fill, FontRef, PageSpec, PresetStyle, SignatoryRole, Stroke, TextStyle } from '@kinetix/shared';
import type { z } from 'zod';

/**
 * Helpers for writing the system presets as code: an element collector with readable ids, text
 * style shorthands and one theme per preset style (typography, rules, table and panel looks).
 * Presets are plain layout JSON in the end; this only keeps 64 of them consistent.
 */

export type Box = { x: number; y: number; w: number; h: number };

/** An element as written (schema defaults may be left out), without its id and type. */
type ElInput<T extends DocElement['type']> = Omit<Extract<z.input<typeof ElementSchema>, { type: T }>, 'id' | 'type'>;

export class Builder {
  readonly elements: DocElement[] = [];
  private readonly used = new Map<string, number>();

  private id(name: string): string {
    const n = (this.used.get(name) ?? 0) + 1;
    this.used.set(name, n);
    return n === 1 ? name : `${name}-${n}`;
  }

  add<T extends DocElement['type']>(type: T, name: string, el: ElInput<T>): this {
    this.elements.push({ id: this.id(name), type, name: name.replace(/-/g, ' '), ...el } as unknown as DocElement);
    return this;
  }

  text(name: string, b: Box, text: string, style: TextStyle, o: Partial<ElInput<'text'>> = {}): this {
    return this.add('text', name, { ...b, text, style, vAlign: 'top', fit: 'shrink', ...o });
  }

  rect(name: string, b: Box, fill?: Fill, o: { stroke?: Stroke; radiusMm?: number; opacity?: number; pages?: 'all' | 'first' | 'last' } = {}): this {
    return this.add('shape', name, { ...b, shape: 'rect', fill, ...o });
  }

  ellipse(name: string, b: Box, fill?: Fill, o: { stroke?: Stroke; opacity?: number } = {}): this {
    return this.add('shape', name, { ...b, shape: 'ellipse', fill, ...o });
  }

  line(name: string, x1: number, y1: number, x2: number, y2: number, stroke: Stroke, o: { pages?: 'all' | 'first' | 'last' } = {}): this {
    return this.add('shape', name, { x: x1, y: y1, w: x2 - x1, h: y2 - y1, shape: 'line', stroke, ...o });
  }

  image(name: string, b: Box, source: ElInput<'image'>['source'], o: Partial<ElInput<'image'>> = {}): this {
    return this.add('image', name, { ...b, source, fit: 'contain', crop: 'rect', ...o });
  }

  push(...els: DocElement[]): this {
    for (const e of els) this.elements.push({ ...e, id: this.id(e.id) });
    return this;
  }
}

export function style(font: FontRef, sizePt: number, o: Partial<TextStyle> = {}): TextStyle {
  return { font, sizePt, weight: 400, color: 'ink', align: 'left', lineHeight: 1.3, ...o };
}

export const stroke = (color: ColorRef, widthPt: number, o: Partial<Stroke> = {}): Stroke => ({ color, widthPt, ...o });

/** The look of one preset style, shared by every document of that style. */
export interface Theme {
  style: PresetStyle;
  /** Institution name in the header. */
  brand: TextStyle;
  /** The document title. */
  title: TextStyle;
  /** Section headings inside a document ("Student details", "Earnings"). */
  section: TextStyle;
  label: TextStyle;
  value: TextStyle;
  body: TextStyle;
  small: TextStyle;
  muted: TextStyle;
  /** Hairlines between sections. */
  rule: Stroke;
  /** The highlight colour of the style (badges, key figures). */
  accent: ColorRef;
  table: { headFill?: Fill; head: TextStyle; body: TextStyle; zebra?: Fill; outer?: Stroke; horizontal?: Stroke; vertical?: Stroke; headerBottom?: Stroke };
  /** A box behind grouped content. */
  panel: { fill?: Fill; stroke?: Stroke; radiusMm: number };
  /** A key figure tile (SGPA, net pay, amount received). */
  tile: { fill: Fill; label: TextStyle; value: TextStyle; stroke?: Stroke; radiusMm: number };
  signName: TextStyle;
  signRole: TextStyle;
  signLine: Stroke;
  /** Certificate display text: the recipient's name, the certificate title on landscape pages. */
  display: TextStyle;
}

export const THEMES: Record<PresetStyle, Theme> = {
  classic: {
    style: 'classic',
    brand: style('heading', 16, { weight: 700, color: 'primary', align: 'center', letterSpacingPt: 1.2, transform: 'uppercase', lineHeight: 1.1 }),
    title: style('heading', 18, { weight: 700, color: 'primary', align: 'center', letterSpacingPt: 3, transform: 'uppercase', lineHeight: 1.1 }),
    section: style('heading', 10, { weight: 700, color: 'primary', letterSpacingPt: 1.2, transform: 'uppercase' }),
    label: style('body', 8.5, { color: 'muted' }),
    value: style('heading', 10, { weight: 600 }),
    body: style('heading', 11.5, { lineHeight: 1.75, align: 'justify' }),
    small: style('body', 7.5, { color: 'muted', align: 'center' }),
    muted: style('body', 8, { color: 'muted' }),
    rule: stroke('secondary', 0.6),
    accent: 'secondary',
    table: { headFill: 'primary', head: style('heading', 8.5, { weight: 700, color: 'white', letterSpacingPt: 0.4 }), body: style('heading', 9), zebra: 'secondary.8', outer: stroke('primary', 0.8), horizontal: stroke('secondary.40', 0.35), vertical: stroke('secondary.40', 0.35) },
    panel: { stroke: stroke('secondary.70', 0.6), radiusMm: 0 },
    tile: { fill: 'secondary.10', stroke: stroke('secondary.60', 0.6), label: style('body', 7, { color: 'muted', align: 'center', transform: 'uppercase', letterSpacingPt: 0.8 }), value: style('heading', 15, { weight: 700, color: 'primary', align: 'center', lineHeight: 1.1 }), radiusMm: 0 },
    signName: style('heading', 9, { weight: 700, align: 'center' }),
    signRole: style('body', 7.5, { color: 'muted', align: 'center' }),
    signLine: stroke('ink.70', 0.6),
    display: style('playfair', 30, { italic: true, weight: 700, color: 'primary', align: 'center', lineHeight: 1.1 }),
  },
  modern: {
    style: 'modern',
    brand: style('body', 15, { weight: 700, color: 'white', lineHeight: 1.1 }),
    title: style('body', 21, { weight: 700, color: 'primary', lineHeight: 1.1 }),
    section: style('body', 9, { weight: 700, color: 'accent', letterSpacingPt: 1, transform: 'uppercase' }),
    label: style('body', 7.5, { color: 'muted', transform: 'uppercase', letterSpacingPt: 0.5 }),
    value: style('body', 10, { weight: 600 }),
    body: style('body', 11, { lineHeight: 1.7, align: 'left' }),
    small: style('body', 7, { color: 'muted' }),
    muted: style('body', 8, { color: 'muted' }),
    rule: stroke('primary.20', 0.8),
    accent: 'accent',
    table: { headFill: { kind: 'linear', angleDeg: 0, stops: [{ at: 0, color: 'primary' }, { at: 1, color: 'tertiary' }] }, head: style('body', 8, { weight: 700, color: 'white', letterSpacingPt: 0.3 }), body: style('body', 8.8), zebra: 'primary.6', horizontal: stroke('primary.12', 0.5) },
    panel: { fill: 'primary.5', radiusMm: 3 },
    tile: { fill: { kind: 'linear', angleDeg: 20, stops: [{ at: 0, color: 'primary' }, { at: 1, color: 'tertiary' }] }, label: style('body', 6.8, { color: 'primary.30', transform: 'uppercase', letterSpacingPt: 0.6 }), value: style('body', 15, { weight: 700, color: 'white', lineHeight: 1.1 }), radiusMm: 3 },
    signName: style('body', 8.5, { weight: 700 }),
    signRole: style('body', 7.5, { color: 'muted' }),
    signLine: stroke('primary.40', 0.8),
    display: style('body', 30, { weight: 700, color: 'primary', align: 'center', lineHeight: 1.1 }),
  },
  minimal: {
    style: 'minimal',
    brand: style('heading', 11.5, { weight: 600, color: 'ink', lineHeight: 1.15 }),
    title: style('body', 19, { weight: 400, color: 'ink', letterSpacingPt: 0.4, lineHeight: 1.1 }),
    section: style('body', 7.5, { weight: 600, color: 'muted', letterSpacingPt: 1.4, transform: 'uppercase' }),
    label: style('body', 7.5, { color: 'muted' }),
    value: style('body', 9.5, { weight: 400 }),
    body: style('body', 10.5, { lineHeight: 1.75, align: 'left' }),
    small: style('body', 6.8, { color: 'muted' }),
    muted: style('body', 7.5, { color: 'muted' }),
    rule: stroke('line', 0.4),
    accent: 'primary',
    table: { head: style('body', 7.2, { weight: 600, color: 'muted', letterSpacingPt: 0.6, transform: 'uppercase' }), body: style('body', 8.8), headerBottom: stroke('ink', 0.6), horizontal: stroke('line', 0.35) },
    panel: { radiusMm: 0 },
    tile: { fill: 'paper', stroke: stroke('line', 0.4), label: style('body', 6.8, { color: 'muted', transform: 'uppercase', letterSpacingPt: 0.8 }), value: style('body', 14, { weight: 400, color: 'ink', lineHeight: 1.1 }), radiusMm: 0 },
    signName: style('body', 8.5, { weight: 600 }),
    signRole: style('body', 7, { color: 'muted' }),
    signLine: stroke('ink.60', 0.4),
    display: style('heading', 28, { weight: 400, color: 'ink', align: 'center', lineHeight: 1.1, letterSpacingPt: 0.5 }),
  },
  heritage: {
    style: 'heritage',
    brand: style('heading', 15, { weight: 700, color: 'primary', align: 'center', letterSpacingPt: 1.6, transform: 'uppercase', lineHeight: 1.1 }),
    title: style('cinzel', 19, { weight: 700, color: 'primary', align: 'center', letterSpacingPt: 2.2, lineHeight: 1.1 }),
    section: style('cinzel', 9.5, { weight: 700, color: 'primary', letterSpacingPt: 1 }),
    label: style('body', 8, { color: 'muted' }),
    value: style('heading', 10, { weight: 700 }),
    body: style('heading', 11.5, { lineHeight: 1.75, align: 'justify' }),
    small: style('body', 7, { color: 'muted', align: 'center' }),
    muted: style('body', 8, { color: 'muted' }),
    rule: stroke('primary', 0.5),
    accent: 'secondary',
    table: { headFill: 'primary!20', head: style('heading', 8.5, { weight: 700, color: 'secondary.25', letterSpacingPt: 0.6 }), body: style('heading', 9), zebra: 'paper', outer: stroke('primary', 1.2), horizontal: stroke('primary.25', 0.4), vertical: stroke('primary.25', 0.4) },
    panel: { fill: 'paper', stroke: stroke('primary', 0.8), radiusMm: 0 },
    tile: { fill: 'paper', stroke: stroke('primary', 1), label: style('cinzel', 6.8, { color: 'primary', align: 'center', letterSpacingPt: 0.8 }), value: style('heading', 15, { weight: 700, color: 'primary!15', align: 'center', lineHeight: 1.1 }), radiusMm: 0 },
    signName: style('heading', 9, { weight: 700, align: 'center' }),
    signRole: style('cinzel', 7, { color: 'primary', align: 'center', letterSpacingPt: 0.4 }),
    signLine: stroke('primary', 0.6),
    display: style('eb-garamond', 32, { italic: true, color: 'primary!10', align: 'center', lineHeight: 1.1 }),
  },
};

export const A4P: PageSpec = { size: 'A4', orientation: 'portrait', marginMm: 12 };
export const A4L: PageSpec = { size: 'A4', orientation: 'landscape', marginMm: 12 };
export const A5L: PageSpec = { size: 'A5', orientation: 'landscape', marginMm: 8 };

export function layout(docType: DocType, page: PageSpec, sides: DocLayout['sides'], st: PresetStyle, description: string, fonts?: DocLayout['fonts']): DocLayout {
  return { schemaVersion: 1, docType, page, sides, meta: { style: st, description }, ...(fonts ? { fonts } : {}) };
}

/** Signature blocks in a row across [x, x + w] at y (each 52 mm wide). */
export function signatures(b: Builder, t: Theme, roles: SignatoryRole[], x: number, y: number, w: number, h = 22, o: { pages?: 'last' } = { pages: 'last' }): void {
  const bw = Math.min(56, w / Math.max(1, roles.length));
  roles.forEach((role, i) => {
    const bx = roles.length === 1 ? x + w - bw : x + (i * (w - bw)) / (roles.length - 1);
    b.add('signature', `signature-${role}`, { x: bx, y, w: bw, h, role, showImage: true, showName: true, showDesignation: true, line: t.signLine, nameStyle: { ...t.signName, align: t.style === 'modern' || t.style === 'minimal' ? (roles.length > 1 && i === roles.length - 1 ? 'right' : 'left') : 'center' }, designationStyle: { ...t.signRole, align: t.style === 'modern' || t.style === 'minimal' ? (roles.length > 1 && i === roles.length - 1 ? 'right' : 'left') : 'center' }, ...o });
  });
}

/** A label-value pair. */
export function field(b: Builder, t: Theme, name: string, box: Box, label: string, value: string, o: { direction?: 'row' | 'column'; labelWidthMm?: number; separator?: string; valueStyle?: TextStyle; rule?: Stroke } = {}): void {
  b.add('field', name, { ...box, label, value, direction: o.direction ?? 'column', labelWidthMm: o.labelWidthMm, separator: o.separator, labelStyle: t.label, valueStyle: o.valueStyle ?? t.value, rule: o.rule });
}

/** A key-figure tile: label over a big value. */
export function tile(b: Builder, t: Theme, name: string, box: Box, label: string, value: string, valueStyle?: TextStyle): void {
  b.rect(`${name}-tile`, box, t.tile.fill, { stroke: t.tile.stroke, radiusMm: t.tile.radiusMm });
  b.text(`${name}-label`, { x: box.x + 2, y: box.y + 2.2, w: box.w - 4, h: 4 }, label, { ...t.tile.label, align: t.tile.label.align === 'center' ? 'center' : 'left' }, { maxLines: 1 });
  b.text(`${name}-value`, { x: box.x + 2, y: box.y + 6.5, w: box.w - 4, h: box.h - 8 }, value, valueStyle ?? { ...t.tile.value, align: t.tile.label.align === 'center' ? 'center' : 'left' }, { vAlign: 'middle', maxLines: 1 });
}

/** A section heading with the style's rule under it. */
export function section(b: Builder, t: Theme, name: string, x: number, y: number, w: number, text: string): number {
  b.text(`${name}-heading`, { x, y, w, h: 5 }, text, t.section, { maxLines: 1 });
  if (t.style !== 'modern') b.line(`${name}-rule`, x, y + 5.6, x + w, y + 5.6, t.style === 'minimal' ? t.rule : stroke('secondary.60', 0.5));
  return y + 7.5;
}

/** A panel behind a box (heritage: white over the guilloche; modern: soft tint). */
export function panel(b: Builder, t: Theme, name: string, box: Box): void {
  if (t.panel.fill || t.panel.stroke) b.rect(`${name}-panel`, box, t.panel.fill, { stroke: t.panel.stroke, radiusMm: t.panel.radiusMm });
}
