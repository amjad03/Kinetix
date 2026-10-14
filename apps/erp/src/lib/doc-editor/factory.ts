/**
 * New elements for the editor's Add panel, sized for the page they land on (an ID card is 54 mm
 * across, an A4 page 210 mm) and centred on it. Colours are palette tokens, so they follow the
 * institution's branding.
 */
import { round } from './geometry';
import type { DocBinding, DocElement, DocLayout, DocType, ImageSource, SignatoryRole, TextStyle } from './schema';
import { pageSizeMm } from './schema';

export type AddKind =
  | 'heading'
  | 'text'
  | 'field'
  | 'fieldList'
  | 'image'
  | 'signature'
  | 'qr'
  | 'barcode'
  | 'table'
  | 'rect'
  | 'rounded'
  | 'line'
  | 'circle'
  | 'band'
  | 'watermark'
  | 'guilloche'
  | 'rosette'
  | 'frame'
  | 'seal';

export interface AddOptions {
  /** For a data field: the binding it shows. */
  binding?: DocBinding;
  /** For an image: which picture. */
  source?: ImageSource;
  /** For a signature block: whose. */
  role?: SignatoryRole;
  /** For a table: the list it shows. */
  list?: DocBinding;
  /** Centre of the new element on the page, mm (default the page centre). */
  at?: { x: number; y: number };
}

const style = (o: Partial<TextStyle> & { sizePt: number }): TextStyle => ({ font: 'body', weight: 400, color: 'ink', align: 'left', lineHeight: 1.3, ...o });

/** Who a document type's barcode identifies by default. */
export function defaultBarcode(docType: DocType): string {
  if (docType === 'staff_id_card' || docType === 'salary_slip' || docType === 'appointment_letter') return '{{staff.employeeCode}}';
  if (docType === 'offer_letter' || docType === 'report_cover') return '{{doc.serial}}';
  return '{{student.rollNo}}';
}

/** A readable label for a binding: the catalogue's, without the block prefix ("Student: roll no" → "Roll no"). */
export const bindingLabel = (b: DocBinding) => {
  const l = b.label.includes(': ') ? b.label.split(': ').slice(1).join(': ') : b.label;
  return l.charAt(0).toUpperCase() + l.slice(1);
};

/** Builds a new element of `kind` for `layout` (the id is provisional; the reducer makes it unique). */
export function newElement(kind: AddKind, layout: DocLayout, o: AddOptions = {}): DocElement {
  const page = pageSizeMm(layout.page);
  const k = Math.min(page.w, page.h) / 54;
  const pt = (n: number) => round(n * Math.min(k, 2.6));
  const place = (w: number, h: number) => {
    const c = o.at ?? { x: page.w / 2, y: page.h / 2 };
    return { x: round(Math.max(0, Math.min(page.w - w, c.x - w / 2))), y: round(Math.max(0, Math.min(page.h - h, c.y - h / 2))), w: round(w), h: round(h) };
  };
  const id = kind;
  switch (kind) {
    case 'heading':
      return { id, type: 'text', name: 'Heading', ...place(page.w * 0.7, pt(9) * 0.3528 * 1.5), text: '{{doc.title}}', style: style({ font: 'heading', sizePt: pt(9), weight: 700, color: 'primary', align: 'center', lineHeight: 1.15 }), vAlign: 'middle', fit: 'shrink' };
    case 'text':
      return { id, type: 'text', name: 'Text', ...place(page.w * 0.6, pt(3.2) * 3), text: 'Type your text here', style: style({ sizePt: pt(5) }), vAlign: 'top', fit: 'none', markdown: true };
    case 'field': {
      const b = o.binding;
      const size = pt(4.2);
      return {
        id,
        type: 'field',
        name: b ? bindingLabel(b) : 'Field',
        ...place(page.w * 0.6, size * 0.3528 * 2.2),
        label: b ? bindingLabel(b) : 'Label',
        value: b ? `{{${b.key}}}` : '{{student.name}}',
        direction: 'row',
        labelWidthMm: round(page.w * 0.2),
        separator: ':',
        labelStyle: style({ sizePt: size, color: 'muted' }),
        valueStyle: style({ sizePt: size, weight: 600 }),
      };
    }
    case 'fieldList':
      return { id, type: 'fieldList', name: 'Details', ...place(page.w * 0.8, pt(4.5) * 6), source: o.list?.key ?? 'doc.fields', columns: 1, rowHeightMm: round(pt(4.5) * 0.8), labelWidthMm: round(page.w * 0.3), separator: ':', labelStyle: style({ sizePt: pt(4), color: 'muted' }), valueStyle: style({ sizePt: pt(4), weight: 600 }) };
    case 'image': {
      const src = o.source ?? 'logo';
      if (src === 'photo') return { id, type: 'image', name: 'Photo', ...place(page.w * 0.32, page.w * 0.32 * 1.25), source: 'photo', fit: 'cover', crop: 'rounded', radiusMm: round(1.5 * Math.min(k, 2)), placeholder: 'initials', border: { color: 'primary', widthPt: 1 } };
      if (src.startsWith('signature:')) return { id, type: 'image', name: 'Signature', ...place(page.w * 0.3, page.w * 0.1), source: src, fit: 'contain', crop: 'rect' };
      const side = page.w * (src === 'seal' ? 0.24 : 0.18);
      return { id, type: 'image', name: src === 'seal' ? 'Official seal' : src === 'emblem' ? 'Crest' : 'Logo', ...place(side, side), source: src, fit: 'contain', crop: 'rect' };
    }
    case 'signature': {
      const size = pt(4);
      return { id, type: 'signature', name: 'Signature', ...place(page.w * 0.32, size * 0.3528 * 6), role: o.role ?? 'principal', showImage: true, showName: true, showDesignation: true, line: { color: 'ink', widthPt: 0.6 }, nameStyle: style({ sizePt: size, weight: 600, align: 'center' }), designationStyle: style({ sizePt: size * 0.85, color: 'muted', align: 'center' }) };
    }
    case 'qr': {
      const side = Math.min(page.w, page.h) * 0.3;
      return { id, type: 'qr', name: 'Verification QR', ...place(side, side), value: '{{verify.url}}', color: 'ink', quietZone: 2 };
    }
    case 'barcode':
      return { id, type: 'barcode', name: 'Barcode', ...place(page.w * 0.6, page.w * 0.14), value: defaultBarcode(layout.docType), symbology: 'code128', color: 'ink', showText: true };
    case 'table': {
      const l = o.list;
      const keys = (l?.itemKeys ?? ['no', 'item', 'amount']).slice(0, 5);
      const size = pt(3.6);
      return {
        id,
        type: 'table',
        name: 'Table',
        ...place(page.w * 0.84, page.h * 0.3),
        source: l?.key ?? 'rows',
        columns: keys.map((key, i) => ({ header: key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase()), value: `{{row.${key}}}`, width: i === 0 ? 1 : 2, align: 'left' as const })),
        header: { style: style({ sizePt: size, weight: 700, color: 'white' }), fill: 'primary', heightMm: round(size * 0.3528 * 2.2) },
        body: { style: style({ sizePt: size }), rowHeightMm: round(size * 0.3528 * 2.2), zebra: 'primary.6' },
        borders: { outer: { color: 'line', widthPt: 0.5 }, horizontal: { color: 'line', widthPt: 0.3 } },
        cellPaddingMm: 1.6,
        overflow: 'paginate',
      };
    }
    case 'rect':
      return { id, type: 'shape', name: 'Rectangle', ...place(page.w * 0.4, page.w * 0.25), shape: 'rect', fill: 'primary.15' };
    case 'rounded':
      return { id, type: 'shape', name: 'Rounded box', ...place(page.w * 0.4, page.w * 0.25), shape: 'rect', fill: 'secondary.15', stroke: { color: 'secondary', widthPt: 0.75 }, radiusMm: round(2 * Math.min(k, 2)) };
    case 'line':
      return { id, type: 'shape', name: 'Line', ...place(page.w * 0.6, 0), shape: 'line', stroke: { color: 'primary', widthPt: 1 } };
    case 'circle': {
      const side = Math.min(page.w, page.h) * 0.25;
      return { id, type: 'shape', name: 'Circle', ...place(side, side), shape: 'ellipse', fill: 'accent.20' };
    }
    case 'band':
      return { id, type: 'shape', name: 'Colour band', x: 0, y: 0, w: round(page.w), h: round(page.h * (page.h > page.w ? 0.14 : 0.2)), shape: 'rect', fill: { kind: 'linear', angleDeg: 0, stops: [{ at: 0, color: 'primary' }, { at: 1, color: 'tertiary' }] } };
    case 'watermark':
      return { id, type: 'watermark', name: 'Watermark', x: 0, y: 0, w: round(page.w), h: round(page.h), text: '{{institution.name}}', angleDeg: -30, repeat: 'none', style: style({ font: 'heading', sizePt: pt(14), weight: 700, color: 'primary.8', align: 'center', lineHeight: 1, letterSpacingPt: 4, transform: 'uppercase' }) };
    case 'guilloche':
    case 'rosette':
      return { id, type: 'pattern', name: kind === 'guilloche' ? 'Guilloche background' : 'Rosette', x: 0, y: 0, w: round(page.w), h: round(page.h), pattern: kind, color: 'primary.25', color2: 'secondary.30', lineWidthPt: 0.25, density: 5, opacity: 0.8 };
    case 'frame':
      return { id, type: 'frame', name: 'Border', x: round(page.w * 0.03), y: round(page.w * 0.03), w: round(page.w * 0.94), h: round(page.h - page.w * 0.06), style: 'double', color: 'primary', color2: 'secondary', widthPt: round(Math.max(0.8, k * 0.6)), radiusMm: 0 };
    case 'seal': {
      const side = Math.min(page.w, page.h) * (page.w < 100 ? 0.36 : 0.18);
      return { id, type: 'seal', name: 'Holographic seal', ...place(side, side), tone: 'silver', emblem: 'emblem', ringText: '{{institution.name | upper}} • GENUINE • {{doc.serial}}', serial: '{{doc.serial}}' };
    }
  }
}
