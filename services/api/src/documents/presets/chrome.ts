import type { PresetStyle } from '@zynetix/shared';
import { type Box, Builder, stroke, style, THEMES } from './kit.js';

/**
 * The frame every document of a style shares: background and border, the institution's header
 * (crest or logo, name, tagline, address), the title with serial and date, and the verification
 * footer (QR code, the link, the fingerprint and the holographic seal). Content goes in `content`;
 * signatures go in the `signs` band just above the footer.
 */
export interface Chrome {
  b: Builder;
  content: Box;
  /** Where the signature row goes. */
  signs: Box;
}

const ADDRESS = '{{institution.address}}, {{institution.city}} {{institution.pincode}}  ·  {{institution.phone}}  ·  {{institution.email}}';
const VERIFY_HEAD = 'Verify this document';
const VERIFY_TEXT = 'Scan the code or open {{verify.url}}. This record is digitally signed by the institution; any change to it shows as a mismatch.';
const FP = 'Serial {{doc.serial}}  ·  Fingerprint {{doc.fingerprint}}';

/** Header, title block and footer for a portrait page (A4, or A5 scaled down). */
export function portraitChrome(st: PresetStyle, W: number, H: number, o: { title?: string; seal?: boolean; dateLabel?: string } = {}): Chrome {
  const t = THEMES[st];
  const b = new Builder();
  const title = o.title ?? '{{doc.title}}';
  const dateLabel = o.dateLabel ?? 'Date';
  const seal = o.seal ?? true;
  switch (st) {
    case 'classic': {
      b.add('watermark', 'watermark', { x: W / 2 - 55, y: H / 2 - 55, w: 110, h: 110, image: 'emblem', angleDeg: 0, repeat: 'none', opacity: 0.06 });
      b.add('frame', 'border', { x: 7, y: 7, w: W - 14, h: H - 14, style: 'ornamental', color: 'primary', color2: 'secondary', widthPt: 2.2, gapMm: 1.3 });
      b.image('crest', { x: W / 2 - 9.5, y: 14, w: 19, h: 19 }, 'emblem');
      b.text('institution', { x: 20, y: 34.5, w: W - 40, h: 8 }, '{{institution.name}}', t.brand, { maxLines: 1 });
      b.text('tagline', { x: 20, y: 42.5, w: W - 40, h: 4.5 }, '{{institution.tagline}}', style('heading', 8.5, { italic: true, color: 'secondary!25', align: 'center' }), { maxLines: 1 });
      b.text('address', { x: 20, y: 47.2, w: W - 40, h: 4 }, ADDRESS, t.small, { maxLines: 1 });
      b.line('header-rule', 22, 53.2, W - 22, 53.2, stroke('secondary', 1));
      b.line('header-rule-thin', 22, 54.5, W - 22, 54.5, stroke('secondary', 0.4));
      b.text('title', { x: 20, y: 58.5, w: W - 40, h: 9 }, title, t.title, { maxLines: 1 });
      b.line('title-left', W / 2 - 34, 70, W / 2 - 4, 70, stroke('secondary', 0.6));
      b.add('shape', 'title-diamond', { x: W / 2 - 1.6, y: 68.4, w: 3.2, h: 3.2, shape: 'rect', fill: 'secondary', rotationDeg: 45 });
      b.line('title-right', W / 2 + 4, 70, W / 2 + 34, 70, stroke('secondary', 0.6));
      b.text('serial', { x: 22, y: 73.5, w: 90, h: 4.5 }, 'No. {{doc.serial}}', style('body', 8.5, { color: 'muted' }), { maxLines: 1 });
      b.text('date', { x: W - 112, y: 73.5, w: 90, h: 4.5 }, `${dateLabel}: {{doc.issuedOn}}`, style('body', 8.5, { color: 'muted', align: 'right' }), { maxLines: 1 });
      if (seal) b.add('seal', 'seal', { x: W / 2 - 14, y: H - 78, w: 28, h: 28, tone: 'silver', emblem: 'emblem', ringText: '{{institution.name | upper}} • GENUINE • {{doc.serial}}', serial: '{{doc.serial}}', pages: 'last' });
      b.line('footer-rule', 22, H - 48, W - 22, H - 48, stroke('secondary', 0.5));
      b.add('qr', 'verify-qr', { x: W - 44, y: H - 45, w: 22, h: 22, value: '{{verify.url}}', color: 'primary!30', quietZone: 1 });
      b.text('verify-head', { x: 22, y: H - 44, w: W - 72, h: 4.5 }, VERIFY_HEAD, style('heading', 8.5, { weight: 700, color: 'primary' }), { maxLines: 1 });
      b.text('verify-text', { x: 22, y: H - 39.5, w: W - 72, h: 8 }, VERIFY_TEXT, style('body', 6.8, { color: 'muted', lineHeight: 1.35 }), { maxLines: 2 });
      b.text('fingerprint', { x: 22, y: H - 30.5, w: W - 72, h: 4 }, FP, style('body', 6.8, { color: 'primary', weight: 600 }), { maxLines: 1 });
      return { b, content: { x: 22, y: 81, w: W - 44, h: H - 81 - 80 }, signs: { x: 24, y: H - 75, w: W - 48, h: 24 } };
    }
    case 'modern': {
      b.rect('band', { x: 0, y: 0, w: W, h: 40 }, { kind: 'linear', angleDeg: 0, stops: [{ at: 0, color: 'primary!25' }, { at: 0.55, color: 'primary' }, { at: 1, color: 'tertiary' }] });
      b.ellipse('band-orb', { x: W - 70, y: -38, w: 96, h: 96 }, 'white', { opacity: 0.07 });
      b.ellipse('band-orb-2', { x: W - 30, y: -14, w: 46, h: 46 }, 'accent', { opacity: 0.2 });
      b.rect('band-accent', { x: 0, y: 40, w: W, h: 1.6 }, 'accent');
      b.image('logo', { x: 14, y: 9, w: 22, h: 22 }, 'logo_dark');
      b.text('institution', { x: 40, y: 10, w: W - 82, h: 8 }, '{{institution.name}}', t.brand, { maxLines: 2 });
      b.text('tagline', { x: 40, y: 19.5, w: W - 82, h: 4.5 }, '{{institution.tagline}}', style('body', 8, { color: 'primary.30' }), { maxLines: 1 });
      b.text('address', { x: 40, y: 25, w: W - 82, h: 8 }, ADDRESS, style('body', 6.8, { color: 'primary.30', lineHeight: 1.35 }), { maxLines: 2 });
      b.rect('title-bar', { x: 14, y: 50.5, w: 1.6, h: 9 }, 'accent');
      b.text('title', { x: 19, y: 49.5, w: W - 100, h: 11 }, title, t.title, { vAlign: 'middle', maxLines: 1 });
      b.text('serial', { x: W - 84, y: 49.5, w: 70, h: 4.5 }, 'No. {{doc.serial}}', style('body', 8, { weight: 600, color: 'primary', align: 'right' }), { maxLines: 1 });
      b.text('date', { x: W - 84, y: 55, w: 70, h: 4.5 }, `${dateLabel} {{doc.issuedOn}}`, style('body', 8, { color: 'muted', align: 'right' }), { maxLines: 1 });
      if (seal) b.add('seal', 'seal', { x: W - 46, y: H - 49, w: 30, h: 30, tone: 'silver', emblem: 'emblem', ringText: '{{institution.name | upper}} • GENUINE • {{doc.serial}}', serial: '{{doc.serial}}', pages: 'last' });
      b.add('qr', 'verify-qr', { x: 14, y: H - 46, w: 22, h: 22, value: '{{verify.url}}', color: 'primary', quietZone: 1 });
      b.text('verify-head', { x: 39, y: H - 44, w: W - 92, h: 4.5 }, VERIFY_HEAD, style('body', 8.5, { weight: 700, color: 'primary' }), { maxLines: 1 });
      b.text('verify-text', { x: 39, y: H - 39.5, w: W - 92, h: 8 }, VERIFY_TEXT, style('body', 6.8, { color: 'muted', lineHeight: 1.35 }), { maxLines: 2 });
      b.text('fingerprint', { x: 39, y: H - 30.5, w: W - 92, h: 4 }, FP, style('body', 6.8, { weight: 600, color: 'accent' }), { maxLines: 1 });
      b.rect('footer-band', { x: 0, y: H - 12, w: W, h: 12 }, { kind: 'linear', angleDeg: 0, stops: [{ at: 0, color: 'primary!25' }, { at: 1, color: 'primary' }] });
      b.text('footer-contact', { x: 14, y: H - 12, w: W - 28, h: 12 }, '{{institution.website}}   ·   {{institution.email}}   ·   {{institution.phone}}', style('body', 7.5, { color: 'white', align: 'center', letterSpacingPt: 0.4 }), { vAlign: 'middle', maxLines: 1 });
      return { b, content: { x: 14, y: 67, w: W - 28, h: H - 67 - 80 }, signs: { x: 14, y: H - 76, w: W - 28, h: 24 } };
    }
    case 'minimal': {
      b.image('logo', { x: 18, y: 15, w: 15, h: 15 }, 'logo');
      b.text('institution', { x: 36, y: 15.5, w: 100, h: 6 }, '{{institution.name}}', t.brand, { maxLines: 2 });
      b.text('tagline', { x: 36, y: 23, w: 100, h: 4 }, '{{institution.tagline}}', style('body', 7.2, { color: 'muted' }), { maxLines: 1 });
      b.text('address', { x: W - 78, y: 15.5, w: 60, h: 14 }, '{{institution.address}}\n{{institution.city}} {{institution.pincode}}\n{{institution.phone}}  ·  {{institution.website}}', style('body', 6.8, { color: 'muted', align: 'right', lineHeight: 1.4 }), { maxLines: 4 });
      b.line('header-rule', 18, 35, W - 18, 35, stroke('line', 0.4));
      b.text('title', { x: 18, y: 44, w: W - 36, h: 10 }, title, t.title, { maxLines: 1 });
      b.text('meta', { x: 18, y: 55.5, w: W - 36, h: 4.5 }, `No. {{doc.serial}}     ${dateLabel} {{doc.issuedOn}}`, style('body', 8, { color: 'muted', letterSpacingPt: 0.3 }), { maxLines: 1 });
      if (seal) b.add('seal', 'seal', { x: W - 62, y: H - 33, w: 22, h: 22, tone: 'silver', emblem: 'emblem', ringText: '{{institution.name | upper}} • GENUINE • {{doc.serial}}', serial: '{{doc.serial}}', pages: 'last' });
      b.line('footer-rule', 18, H - 37, W - 18, H - 37, stroke('line', 0.4));
      b.add('qr', 'verify-qr', { x: W - 36, y: H - 33, w: 18, h: 18, value: '{{verify.url}}', color: 'ink', quietZone: 1 });
      b.text('verify-text', { x: 18, y: H - 32, w: W - 86, h: 12 }, `${VERIFY_HEAD}. ${VERIFY_TEXT}`, style('body', 6.6, { color: 'muted', lineHeight: 1.4 }), { maxLines: 3 });
      b.text('fingerprint', { x: 18, y: H - 20, w: W - 86, h: 4 }, FP, style('body', 6.6, { color: 'ink', weight: 600 }), { maxLines: 1 });
      return { b, content: { x: 18, y: 66, w: W - 36, h: H - 66 - 72 }, signs: { x: 18, y: H - 64, w: W - 36, h: 22 } };
    }
    case 'heritage': {
      b.add('pattern', 'security-background', { x: 9, y: 9, w: W - 18, h: H - 18, pattern: 'guilloche', color: 'secondary.35', color2: 'primary.22', lineWidthPt: 0.22, density: 5, opacity: 0.7 });
      b.add('pattern', 'security-rosette', { x: W / 2 - 62, y: H / 2 - 62, w: 124, h: 124, pattern: 'rosette', color: 'primary.18', color2: 'secondary.35', lineWidthPt: 0.25, density: 6, radiusMm: 62 });
      b.add('frame', 'border', { x: 5, y: 5, w: W - 10, h: H - 10, style: 'guilloche', color: 'primary', color2: 'secondary', widthPt: 1.4, gapMm: 2 });
      b.image('crest', { x: 20, y: 19, w: 24, h: 24 }, 'emblem');
      b.text('institution', { x: 48, y: 20, w: W - 96, h: 8 }, '{{institution.name}}', t.brand, { maxLines: 1 });
      b.text('tagline', { x: 48, y: 28.5, w: W - 96, h: 4.5 }, '{{institution.tagline}}', style('heading', 8, { italic: true, color: 'primary', align: 'center' }), { maxLines: 1 });
      b.text('address', { x: 48, y: 33.5, w: W - 96, h: 4 }, ADDRESS, style('body', 6.6, { color: 'muted', align: 'center' }), { maxLines: 1 });
      if (seal) b.add('seal', 'seal', { x: W - 47, y: 16, w: 30, h: 30, tone: 'silver', emblem: 'emblem', ringText: '{{institution.name | upper}} • GENUINE • {{doc.serial}}', serial: '{{doc.serial}}' });
      b.line('micro-top', 18, 46, W - 18, 46, stroke('primary', 0.6));
      b.add('pattern', 'microtext', { x: 18, y: 46.6, w: W - 36, h: 2.6, pattern: 'microtext', color: 'primary.70', color2: 'secondary!20', density: 7, text: '{{institution.name | upper}} · {{doc.title | upper}} · {{doc.serial}}' });
      b.line('micro-bottom', 18, 49.8, W - 18, 49.8, stroke('primary', 0.6));
      b.text('title', { x: 20, y: 55, w: W - 40, h: 10 }, title, t.title, { maxLines: 1 });
      b.text('serial', { x: 20, y: 67, w: 90, h: 4.5 }, 'No. {{doc.serial}}', style('body', 8.5, { weight: 600, color: 'primary' }), { maxLines: 1 });
      b.text('date', { x: W - 110, y: 67, w: 90, h: 4.5 }, `${dateLabel}: {{doc.issuedOn}}`, style('body', 8.5, { weight: 600, color: 'primary', align: 'right' }), { maxLines: 1 });
      b.rect('footer-panel', { x: 18, y: H - 44, w: W - 36, h: 27 }, 'paper', { stroke: stroke('primary', 0.6) });
      b.add('qr', 'verify-qr', { x: 21, y: H - 41.5, w: 22, h: 22, value: '{{verify.url}}', color: 'primary!35', quietZone: 1 });
      b.text('verify-head', { x: 46, y: H - 41, w: W - 68, h: 4.5 }, VERIFY_HEAD, style('cinzel', 8.5, { weight: 700, color: 'primary' }), { maxLines: 1 });
      b.text('verify-text', { x: 46, y: H - 36.5, w: W - 68, h: 8 }, `${VERIFY_TEXT} Security features: guilloche background, micro-text, holographic seal.`, style('body', 6.6, { color: 'muted', lineHeight: 1.35 }), { maxLines: 2 });
      b.text('fingerprint', { x: 46, y: H - 27.5, w: W - 68, h: 4 }, FP, style('body', 6.8, { weight: 700, color: 'primary' }), { maxLines: 1 });
      return { b, content: { x: 20, y: 75, w: W - 40, h: H - 75 - 78 }, signs: { x: 22, y: H - 72, w: W - 44, h: 24 } };
    }
  }
}

/** Landscape certificate frame (course completion, merit and participation). */
export function landscapeCertificateChrome(st: PresetStyle, W: number, H: number): Chrome {
  const t = THEMES[st];
  const b = new Builder();
  switch (st) {
    case 'classic': {
      b.rect('paper-tone', { x: 0, y: 0, w: W, h: H }, { kind: 'radial', cx: 0.5, cy: 0.45, r: 0.75, stops: [{ at: 0, color: 'paper' }, { at: 1, color: 'secondary.12' }] });
      b.add('watermark', 'watermark', { x: W / 2 - 50, y: H / 2 - 45, w: 100, h: 100, image: 'emblem', angleDeg: 0, repeat: 'none', opacity: 0.06 });
      b.add('frame', 'border', { x: 8, y: 8, w: W - 16, h: H - 16, style: 'ornamental', color: 'primary', color2: 'secondary', widthPt: 2.6, gapMm: 1.6 });
      b.image('crest', { x: W / 2 - 11, y: 17, w: 22, h: 22 }, 'emblem');
      b.text('institution', { x: 30, y: 41, w: W - 60, h: 8 }, '{{institution.name}}', t.brand, { maxLines: 1 });
      b.text('tagline', { x: 30, y: 49.5, w: W - 60, h: 4.5 }, '{{institution.tagline}}', style('heading', 8.5, { italic: true, color: 'secondary!25', align: 'center' }), { maxLines: 1 });
      b.add('seal', 'seal', { x: W / 2 - 16, y: H - 56, w: 32, h: 32, tone: 'gold', emblem: 'emblem', ringText: '{{institution.name | upper}} • GENUINE • {{doc.serial}}', serial: '{{doc.serial}}' });
      break;
    }
    case 'modern': {
      b.rect('side-band', { x: 0, y: 0, w: 62, h: H }, { kind: 'linear', angleDeg: 90, stops: [{ at: 0, color: 'primary!30' }, { at: 0.6, color: 'primary' }, { at: 1, color: 'tertiary' }] });
      b.ellipse('orb', { x: -40, y: H - 90, w: 120, h: 120 }, 'white', { opacity: 0.06 });
      b.ellipse('orb-2', { x: 4, y: 108, w: 50, h: 50 }, 'accent', { opacity: 0.22 });
      b.rect('side-accent', { x: 62, y: 0, w: 2, h: H }, 'accent');
      b.image('logo', { x: 14, y: 18, w: 34, h: 34 }, 'logo_dark');
      b.text('institution', { x: 10, y: 58, w: 44, h: 26 }, '{{institution.name}}', style('body', 11, { weight: 700, color: 'white', align: 'center', lineHeight: 1.25 }), { maxLines: 4 });
      b.text('tagline', { x: 10, y: 86, w: 44, h: 14 }, '{{institution.tagline}}', style('body', 7, { color: 'primary.30', align: 'center', lineHeight: 1.35 }), { maxLines: 3 });
      b.add('seal', 'seal', { x: 15, y: H - 62, w: 34, h: 34, tone: 'silver', emblem: 'emblem', ringText: '{{institution.name | upper}} • GENUINE • {{doc.serial}}', serial: '{{doc.serial}}' });
      break;
    }
    case 'minimal': {
      b.image('logo', { x: W / 2 - 9, y: 20, w: 18, h: 18 }, 'logo');
      b.text('institution', { x: 40, y: 41, w: W - 80, h: 6 }, '{{institution.name}}', { ...t.brand, align: 'center', letterSpacingPt: 1.5, transform: 'uppercase', sizePt: 10 }, { maxLines: 1 });
      b.line('header-rule', W / 2 - 20, 51, W / 2 + 20, 51, stroke('ink', 0.5));
      b.add('seal', 'seal', { x: W - 52, y: H - 50, w: 26, h: 26, tone: 'silver', emblem: 'emblem', ringText: '{{institution.name | upper}} • GENUINE • {{doc.serial}}', serial: '{{doc.serial}}' });
      break;
    }
    case 'heritage': {
      b.add('pattern', 'security-background', { x: 10, y: 10, w: W - 20, h: H - 20, pattern: 'guilloche', color: 'secondary.35', color2: 'primary.20', lineWidthPt: 0.22, density: 4, opacity: 0.75 });
      b.add('pattern', 'security-rosette', { x: W / 2 - 70, y: H / 2 - 62, w: 140, h: 140, pattern: 'rosette', color: 'primary.16', color2: 'secondary.30', lineWidthPt: 0.25, density: 6, radiusMm: 70 });
      b.add('frame', 'border', { x: 5, y: 5, w: W - 10, h: H - 10, style: 'guilloche', color: 'primary', color2: 'secondary', widthPt: 1.6, gapMm: 2.4 });
      b.add('frame', 'inner-border', { x: 19, y: 19, w: W - 38, h: H - 38, style: 'double', color: 'primary', color2: 'secondary', widthPt: 0.9, gapMm: 0.9 });
      b.image('crest', { x: W / 2 - 12, y: 23, w: 24, h: 24 }, 'emblem');
      b.text('institution', { x: 40, y: 48.5, w: W - 80, h: 8 }, '{{institution.name}}', t.brand, { maxLines: 1 });
      b.text('tagline', { x: 40, y: 56.5, w: W - 80, h: 4.5 }, '{{institution.tagline}}', style('heading', 8, { italic: true, color: 'primary', align: 'center' }), { maxLines: 1 });
      b.add('seal', 'seal', { x: W / 2 - 16, y: H - 57, w: 32, h: 32, tone: 'silver', emblem: 'emblem', ringText: '{{institution.name | upper}} • GENUINE • {{doc.serial}}', serial: '{{doc.serial}}' });
      break;
    }
  }
  const content = st === 'modern' ? { x: 78, y: 22, w: W - 96, h: H - 44 } : { x: 34, y: st === 'minimal' ? 58 : st === 'heritage' ? 64 : 58, w: W - 68, h: H - 120 };
  return { b, content, signs: { x: content.x, y: H - 52, w: content.w, h: 24 } };
}

/** Compact frame for an A5 landscape receipt. */
export function compactChrome(st: PresetStyle, W: number, H: number, o: { title: string; copy?: string }): Chrome {
  const t = THEMES[st];
  const b = new Builder();
  if (st === 'minimal') {
    b.image('logo', { x: 10, y: 9, w: 12, h: 12 }, 'logo');
    b.text('institution', { x: 25, y: 9.5, w: W - 90, h: 6 }, '{{institution.name}}', { ...t.brand, sizePt: 10.5 }, { maxLines: 1 });
    b.text('address', { x: 25, y: 15.5, w: W - 90, h: 5 }, '{{institution.address}}, {{institution.city}}  ·  {{institution.phone}}', style('body', 6.4, { color: 'muted' }), { maxLines: 1 });
    b.text('title', { x: W - 70, y: 8.5, w: 60, h: 7 }, o.title, style('body', 14, { color: 'ink', align: 'right' }), { maxLines: 1 });
    b.text('title-sub', { x: W - 80, y: 16, w: 70, h: 4.5 }, 'No. {{doc.serial}}  ·  {{doc.issuedOn}}', style('body', 6.8, { color: 'muted', align: 'right' }), { maxLines: 1 });
    b.line('header-rule', 10, 25, W - 10, 25, stroke('line', 0.4));
    b.line('footer-rule', 10, H - 30, W - 10, H - 30, stroke('line', 0.4));
    b.add('qr', 'verify-qr', { x: W - 27, y: H - 27, w: 17, h: 17, value: '{{verify.url}}', color: 'ink', quietZone: 1 });
    b.add('seal', 'seal', { x: W - 49, y: H - 27, w: 18, h: 18, tone: 'silver', emblem: 'emblem', ringText: '{{institution.name | upper}} • GENUINE • {{doc.serial}}', serial: '{{doc.serial}}' });
    b.text('fingerprint', { x: 10, y: H - 9, w: W - 64, h: 4 }, 'Scan to verify  ·  Serial {{doc.serial}}  ·  Fingerprint {{doc.fingerprint}}', style('body', 6.2, { color: 'muted' }), { maxLines: 1 });
    return { b, content: { x: 10, y: 29, w: W - 20, h: H - 29 - 34 }, signs: { x: 10, y: H - 29, w: 60, h: 19 } };
  }
  if (st === 'heritage') {
    b.add('pattern', 'security-background', { x: 6, y: 6, w: W - 12, h: H - 12, pattern: 'guilloche', color: 'secondary.35', color2: 'primary.22', lineWidthPt: 0.2, density: 6, opacity: 0.7 });
    b.add('frame', 'border', { x: 3, y: 3, w: W - 6, h: H - 6, style: 'guilloche', color: 'primary', color2: 'secondary', widthPt: 1.1, gapMm: 1.4 });
    b.image('crest', { x: 13, y: 12, w: 15, h: 15 }, 'emblem');
    b.text('institution', { x: 31, y: 12, w: W - 92, h: 6 }, '{{institution.name}}', { ...t.brand, sizePt: 10, align: 'left' }, { maxLines: 1 });
    b.text('address', { x: 31, y: 18.5, w: W - 92, h: 4.5 }, '{{institution.address}}, {{institution.city}}  ·  {{institution.phone}}', style('body', 6.2, { color: 'muted' }), { maxLines: 1 });
    b.text('copy', { x: 31, y: 23, w: W - 92, h: 4 }, o.copy ?? '', style('cinzel', 6.6, { weight: 700, color: 'accent', letterSpacingPt: 1 }), { maxLines: 1 });
    b.rect('title-box', { x: W - 59, y: 11.5, w: 46, h: 15 }, 'paper', { stroke: stroke('primary', 0.9) });
    b.text('title', { x: W - 59, y: 12, w: 46, h: 8 }, o.title, style('cinzel', 11, { weight: 700, color: 'primary', align: 'center', letterSpacingPt: 1 }), { vAlign: 'middle', maxLines: 1 });
    b.text('title-sub', { x: W - 59, y: 20, w: 46, h: 5 }, 'No. {{doc.serial}}', style('body', 6.4, { color: 'primary', align: 'center', weight: 600 }), { vAlign: 'middle', maxLines: 1 });
    b.line('micro-top', 13, 29.5, W - 13, 29.5, stroke('primary', 0.5));
    b.add('pattern', 'microtext', { x: 13, y: 29.9, w: W - 26, h: 2, pattern: 'microtext', color: 'primary.70', density: 8, text: '{{institution.name | upper}} · FEE RECEIPT · {{doc.serial}}' });
    b.line('micro-bottom', 13, 32.3, W - 13, 32.3, stroke('primary', 0.5));
    b.rect('qr-ground', { x: W - 32, y: H - 33, w: 20, h: 20 }, 'paper', { stroke: stroke('primary', 0.5) });
    b.add('qr', 'verify-qr', { x: W - 31.5, y: H - 32.5, w: 19, h: 19, value: '{{verify.url}}', color: 'primary!35', quietZone: 1 });
    b.add('seal', 'seal', { x: W - 58, y: H - 34, w: 23, h: 23, tone: 'silver', emblem: 'emblem', ringText: '{{institution.name | upper}} • GENUINE • {{doc.serial}}', serial: '{{doc.serial}}' });
    b.text('fingerprint', { x: 13, y: H - 12.5, w: W - 74, h: 4 }, 'Scan to verify  ·  Serial {{doc.serial}}  ·  Fingerprint {{doc.fingerprint}}', style('body', 6.2, { color: 'primary', weight: 600 }), { maxLines: 1 });
    return { b, content: { x: 13, y: 35, w: W - 26, h: H - 35 - 38 }, signs: { x: 13, y: H - 34, w: 60, h: 20 } };
  }
  if (st === 'classic') {
    b.add('frame', 'border', { x: 5, y: 5, w: W - 10, h: H - 10, style: 'double', color: 'primary', color2: 'secondary', widthPt: 1.4, gapMm: 1 });
    b.image('crest', { x: 11, y: 10, w: 16, h: 16 }, 'emblem');
    b.text('institution', { x: 30, y: 10.5, w: W - 86, h: 6 }, '{{institution.name}}', { ...t.brand, sizePt: 12, align: 'left' }, { maxLines: 1 });
    b.text('tagline', { x: 30, y: 17, w: W - 86, h: 4 }, '{{institution.tagline}}', style('heading', 7.5, { italic: true, color: 'secondary!25' }), { maxLines: 1 });
    b.text('address', { x: 30, y: 21.2, w: W - 86, h: 4 }, '{{institution.address}}, {{institution.city}}  ·  {{institution.phone}}', style('body', 6.5, { color: 'muted' }), { maxLines: 1 });
    b.rect('title-box', { x: W - 54, y: 10.5, w: 43, h: 14 }, 'primary');
    b.text('title', { x: W - 54, y: 10.5, w: 43, h: 8.5 }, o.title, style('heading', 10.5, { weight: 700, color: 'white', align: 'center', letterSpacingPt: 1.5, transform: 'uppercase' }), { vAlign: 'middle', maxLines: 1 });
    b.text('title-sub', { x: W - 54, y: 18.2, w: 43, h: 5 }, 'No. {{doc.serial}}', style('body', 6.5, { color: 'secondary.40', align: 'center' }), { vAlign: 'middle', maxLines: 1 });
    b.line('header-rule', 11, 29, W - 11, 29, stroke('secondary', 0.8));
    b.add('qr', 'verify-qr', { x: W - 29, y: H - 33, w: 19, h: 19, value: '{{verify.url}}', color: 'primary!30', quietZone: 1 });
    b.text('fingerprint', { x: 11, y: H - 13, w: W - 42, h: 4 }, 'Scan to verify  ·  Serial {{doc.serial}}  ·  Fingerprint {{doc.fingerprint}}', style('body', 6.3, { color: 'muted' }), { maxLines: 1 });
    b.add('seal', 'seal', { x: W - 56, y: H - 34, w: 23, h: 23, tone: 'silver', emblem: 'emblem', ringText: '{{institution.name | upper}} • GENUINE • {{doc.serial}}', serial: '{{doc.serial}}' });
    return { b, content: { x: 11, y: 33, w: W - 22, h: H - 33 - 38 }, signs: { x: 11, y: H - 36, w: 60, h: 20 } };
  }
  b.rect('band', { x: 0, y: 0, w: W, h: 26 }, { kind: 'linear', angleDeg: 0, stops: [{ at: 0, color: 'primary!25' }, { at: 0.6, color: 'primary' }, { at: 1, color: 'tertiary' }] });
  b.ellipse('band-orb', { x: W - 40, y: -22, w: 60, h: 60 }, 'accent', { opacity: 0.25 });
  b.rect('band-accent', { x: 0, y: 26, w: W, h: 1.2 }, 'accent');
  b.image('logo', { x: 9, y: 5, w: 16, h: 16 }, 'logo_dark');
  b.text('institution', { x: 28, y: 6, w: W - 82, h: 6 }, '{{institution.name}}', { ...t.brand, sizePt: 11.5 }, { maxLines: 1 });
  b.text('address', { x: 28, y: 13, w: W - 82, h: 8 }, '{{institution.address}}, {{institution.city}}  ·  {{institution.phone}}  ·  {{institution.website}}', style('body', 6.4, { color: 'primary.30', lineHeight: 1.35 }), { maxLines: 2 });
  b.text('title', { x: W - 58, y: 5, w: 48, h: 8 }, o.title, style('body', 12, { weight: 700, color: 'white', align: 'right' }), { maxLines: 1 });
  b.text('title-sub', { x: W - 70, y: 13.5, w: 60, h: 4.5 }, 'No. {{doc.serial}}', style('body', 7, { color: 'primary.30', align: 'right' }), { maxLines: 1 });
  b.text('title-date', { x: W - 70, y: 18, w: 60, h: 4.5 }, '{{doc.issuedOn}}', style('body', 7, { color: 'primary.30', align: 'right' }), { maxLines: 1 });
  b.add('qr', 'verify-qr', { x: W - 28, y: H - 31, w: 19, h: 19, value: '{{verify.url}}', color: 'primary', quietZone: 1 });
  b.add('seal', 'seal', { x: W - 54, y: H - 32, w: 22, h: 22, tone: 'silver', emblem: 'emblem', ringText: '{{institution.name | upper}} • GENUINE • {{doc.serial}}', serial: '{{doc.serial}}' });
  b.rect('footer-band', { x: 0, y: H - 8, w: W, h: 8 }, 'primary');
  b.text('fingerprint', { x: 9, y: H - 8, w: W - 18, h: 8 }, 'Scan the code to verify  ·  Serial {{doc.serial}}  ·  Fingerprint {{doc.fingerprint}}', style('body', 6.3, { color: 'white', align: 'center' }), { vAlign: 'middle', maxLines: 1 });
  return { b, content: { x: 9, y: 31, w: W - 18, h: H - 31 - 38 }, signs: { x: 9, y: H - 32, w: 60, h: 20 } };
}
