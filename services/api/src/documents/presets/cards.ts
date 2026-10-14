import type { DocLayout, PresetStyle } from '@kinetix/shared';
import { Builder, layout, stroke, style } from './kit.js';

/**
 * ID cards on CR80 (85.6 x 54 mm), front and back: photo, name, class or designation, blood
 * group, validity, a Code 128 barcode of the roll or employee number and the verification QR on
 * the back with the emergency contact. Classic and Modern are portrait; Minimal and Heritage are
 * landscape. Staff cards use the tertiary colour so the two are told apart at a glance.
 */

interface Who {
  kind: 'student' | 'staff';
  label: string;
  band: string;
  /** Under the name. */
  role: string;
  fields: [string, string][];
  barcode: string;
  back: [string, string][];
}

const STUDENT: Who = {
  kind: 'student',
  label: 'STUDENT IDENTITY CARD',
  band: 'primary',
  role: '{{student.className}}',
  fields: [['Roll no.', '{{student.rollNo}}'], ['Blood group', '{{student.bloodGroup}}'], ['Valid until', '{{student.validUntil}}']],
  barcode: '{{student.rollNo}}',
  back: [['Programme', '{{student.program}}'], ['Date of birth', '{{student.dob}}'], ['Parent / guardian', '{{student.guardianName}}'], ['Emergency contact', '{{student.emergencyContact}}, {{student.emergencyPhone}}'], ['Address', '{{student.address}}']],
};

const STAFF: Who = {
  kind: 'staff',
  label: 'STAFF IDENTITY CARD',
  band: 'tertiary',
  role: '{{staff.designation}}, {{staff.department}}',
  fields: [['Emp. code', '{{staff.employeeCode}}'], ['Blood group', '{{staff.bloodGroup}}'], ['Valid until', '{{staff.validUntil}}']],
  barcode: '{{staff.employeeCode}}',
  back: [['Department', '{{staff.department}}'], ['Date of joining', '{{staff.dateOfJoining}}'], ['Phone', '{{staff.phone}}'], ['Emergency contact', '{{staff.emergencyContact}}, {{staff.emergencyPhone}}'], ['Address', '{{staff.address}}']],
};

const W = 53.98;
const H = 85.6;
const LW = 85.6;
const LH = 53.98;
const name = (w: Who) => (w.kind === 'student' ? '{{student.name}}' : '{{staff.name}}');

function smallField(b: Builder, id: string, x: number, y: number, w: number, label: string, value: string, o: { align?: 'left' | 'center'; dark?: boolean } = {}): void {
  b.add('field', id, { x, y, w, h: 7.2, label, value, direction: 'column', labelStyle: style('body', 4.6, { color: o.dark ? 'white' : 'muted', align: o.align ?? 'left', letterSpacingPt: 0.2 }), valueStyle: style('body', 6.2, { weight: 700, align: o.align ?? 'left', color: o.dark ? 'white' : 'ink' }) });
}

function backDetails(b: Builder, who: Who, x: number, y: number, w: number, rowH: number, fontScale = 1): number {
  who.back.forEach(([l, v], i) => {
    const h = l === 'Address' ? rowH * 1.45 : rowH;
    b.add('field', `back-${i + 1}`, { x, y, w, h, label: l, value: v, direction: 'row', labelWidthMm: 19 * fontScale, separator: ':', labelStyle: style('body', 5 * fontScale, { color: 'muted' }), valueStyle: style('body', 5.6 * fontScale, { weight: 600, lineHeight: 1.2 }) });
    y += h;
  });
  return y;
}

function classic(who: Who): DocLayout {
  const f = new Builder();
  f.rect('band', { x: 0, y: 0, w: W, h: 17 }, who.band);
  f.rect('band-rule', { x: 0, y: 17, w: W, h: 0.8 }, 'secondary');
  f.ellipse('crest-ground', { x: 2.5, y: 2.3, w: 12.4, h: 12.4 }, 'white');
  f.image('crest', { x: 3.3, y: 3.1, w: 10.8, h: 10.8 }, 'emblem');
  f.text('institution', { x: 16.5, y: 2.6, w: W - 18.5, h: 8.6 }, '{{institution.name}}', style('heading', 6.6, { weight: 700, color: 'white', transform: 'uppercase', lineHeight: 1.12, letterSpacingPt: 0.2 }), { vAlign: 'middle', maxLines: 2, minSizePt: 4.6 });
  f.text('tagline', { x: 16.5, y: 11.4, w: W - 18.5, h: 4 }, '{{institution.city}}', style('heading', 5, { italic: true, color: 'secondary.40' }), { maxLines: 1 });
  f.text('card-kind', { x: 2, y: 19.4, w: W - 4, h: 3.6 }, who.label, style('body', 5, { weight: 700, color: 'secondary!20', align: 'center', letterSpacingPt: 1.1 }), { maxLines: 1 });
  f.image('photo', { x: W / 2 - 11, y: 24.2, w: 22, h: 26.5 }, 'photo', { fit: 'cover', crop: 'rect', placeholder: 'initials', border: stroke('secondary', 1.1) });
  f.text('name', { x: 3, y: 52.4, w: W - 6, h: 5.4 }, name(who), style('heading', 9.2, { weight: 700, color: who.band, align: 'center' }), { vAlign: 'middle', maxLines: 1 });
  f.text('role', { x: 3, y: 57.8, w: W - 6, h: 4 }, who.role, style('body', 5.8, { color: 'muted', align: 'center' }), { maxLines: 1 });
  f.line('rule', 6, 62.6, W - 6, 62.6, stroke('secondary.60', 0.4));
  who.fields.forEach(([l, v], i) => smallField(f, `field-${i + 1}`, 3 + i * ((W - 6) / 3), 63.6, (W - 6) / 3, l, v, { align: 'center' }));
  f.add('barcode', 'barcode', { x: 5, y: 72.3, w: W - 10, h: 9.6, value: who.barcode, symbology: 'code128', color: 'ink', showText: true, textStyle: style('body', 4.6, { align: 'center', letterSpacingPt: 1 }) });
  f.rect('bottom', { x: 0, y: H - 2.4, w: W, h: 2.4 }, who.band);

  const k = new Builder();
  k.add('pattern', 'security-background', { x: 0, y: 0, w: W, h: H, pattern: 'guilloche', color: 'primary.14', color2: 'secondary.28', lineWidthPt: 0.18, density: 6 });
  k.rect('band', { x: 0, y: 0, w: W, h: 3 }, who.band);
  k.text('card-kind', { x: 3, y: 5, w: W - 6, h: 3.6 }, who.label, style('body', 4.8, { weight: 700, color: who.band, align: 'center', letterSpacingPt: 1 }), { maxLines: 1 });
  k.rect('details-ground', { x: 2.5, y: 9.6, w: W - 5, h: 34 }, 'paper', { opacity: 0.9, stroke: stroke('secondary.60', 0.3) });
  backDetails(k, who, 4, 10.6, W - 8, 5.6, 0.95);
  k.add('qr', 'verify-qr', { x: 3, y: 46.5, w: 19, h: 19, value: '{{verify.url}}', color: 'ink', background: 'white', quietZone: 1 });
  k.text('qr-caption', { x: 3, y: 65.6, w: 19, h: 3 }, 'Scan to verify', style('body', 4.2, { color: 'muted', align: 'center' }), { maxLines: 1 });
  k.add('signature', 'signature-principal', { x: 24, y: 47, w: W - 27, h: 18, role: 'principal', showImage: true, showName: false, showDesignation: true, line: stroke('ink.60', 0.4), nameStyle: style('body', 5, { weight: 700, align: 'center' }), designationStyle: style('body', 4.8, { color: 'muted', align: 'center' }) });
  k.line('return-rule', 3, 70.5, W - 3, 70.5, stroke('secondary.60', 0.4));
  k.text('return', { x: 3, y: 71.4, w: W - 6, h: 10.5 }, 'If found, please return to **{{institution.name}}**, {{institution.address}}, {{institution.city}}. Phone {{institution.phone}}', style('body', 4.6, { align: 'center', lineHeight: 1.3 }), { markdown: true, maxLines: 4 });
  k.rect('bottom', { x: 0, y: H - 2.4, w: W, h: 2.4 }, who.band);
  return layout(who.kind === 'student' ? 'student_id_card' : 'staff_id_card', { size: 'CR80', orientation: 'portrait', marginMm: 2 }, [{ id: 'front', label: 'Front', background: 'paper', elements: f.elements }, { id: 'back', label: 'Back', background: 'paper', elements: k.elements }], 'classic', 'Portrait card, crest on a colour band, framed photo, barcode; guilloche back with QR');
}

function modern(who: Who): DocLayout {
  const f = new Builder();
  const grad = { kind: 'linear' as const, angleDeg: 35, stops: [{ at: 0, color: `${who.band}!30` }, { at: 0.55, color: who.band }, { at: 1, color: who.kind === 'student' ? 'tertiary' : 'primary' }] };
  f.rect('band', { x: 0, y: 0, w: W, h: 32 }, grad);
  f.ellipse('band-orb', { x: W - 22, y: -14, w: 34, h: 34 }, 'white', { opacity: 0.09 });
  f.ellipse('band-curve', { x: -22, y: 25, w: W + 44, h: 30 }, 'paper');
  f.image('logo', { x: 4, y: 3.6, w: 8.6, h: 8.6 }, 'logo_dark');
  f.text('institution', { x: 14.2, y: 3.4, w: W - 17, h: 9 }, '{{institution.name}}', style('body', 6, { weight: 700, color: 'white', lineHeight: 1.15 }), { vAlign: 'middle', maxLines: 2, minSizePt: 4.4 });
  f.image('photo', { x: W / 2 - 12.5, y: 13.5, w: 25, h: 25 }, 'photo', { fit: 'cover', crop: 'circle', placeholder: 'initials', border: stroke('white', 2.2) });
  f.ellipse('photo-ring', { x: W / 2 - 13.6, y: 12.4, w: 27.2, h: 27.2 }, undefined, { stroke: stroke('accent', 0.7) });
  f.text('name', { x: 3, y: 40.5, w: W - 6, h: 5.6 }, name(who), style('body', 9.6, { weight: 700, align: 'center' }), { vAlign: 'middle', maxLines: 1 });
  f.rect('chip', { x: W / 2 - 11.5, y: 46.8, w: 23, h: 4.4 }, 'accent', { radiusMm: 2.2 });
  f.text('chip-text', { x: W / 2 - 11.5, y: 46.8, w: 23, h: 4.4 }, who.kind === 'student' ? 'STUDENT' : 'STAFF', style('body', 4.8, { weight: 700, color: 'white', align: 'center', letterSpacingPt: 1.2 }), { vAlign: 'middle', maxLines: 1 });
  f.text('role', { x: 3, y: 52.2, w: W - 6, h: 4 }, who.role, style('body', 5.6, { color: 'muted', align: 'center' }), { maxLines: 1 });
  f.rect('fields-ground', { x: 3, y: 57, w: W - 6, h: 9.2 }, `${who.band}.7`, { radiusMm: 2 });
  who.fields.forEach(([l, v], i) => smallField(f, `field-${i + 1}`, 4 + i * ((W - 8) / 3), 58, (W - 8) / 3, l, v, { align: 'center' }));
  f.add('barcode', 'barcode', { x: 6, y: 68.2, w: W - 12, h: 11.5, value: who.barcode, symbology: 'code128', color: 'ink', showText: true, textStyle: style('body', 4.6, { align: 'center', letterSpacingPt: 1, color: 'muted' }) });
  f.rect('bottom', { x: 0, y: H - 3.2, w: W, h: 3.2 }, grad);

  const k = new Builder();
  k.rect('band', { x: 0, y: 0, w: W, h: 13 }, grad);
  k.ellipse('band-orb', { x: W - 16, y: -10, w: 24, h: 24 }, 'white', { opacity: 0.09 });
  k.text('institution', { x: 4, y: 2, w: W - 8, h: 9 }, '{{institution.name}}', style('body', 5.8, { weight: 700, color: 'white', align: 'center', lineHeight: 1.15 }), { vAlign: 'middle', maxLines: 2 });
  k.rect('qr-ground', { x: W / 2 - 11.5, y: 15, w: 23, h: 23 }, 'white', { radiusMm: 2.2, stroke: stroke(`${who.band}.30`, 0.5) });
  k.add('qr', 'verify-qr', { x: W / 2 - 10.2, y: 16.3, w: 20.4, h: 20.4, value: '{{verify.url}}', color: `${who.band}!40`, quietZone: 1 });
  k.text('qr-caption', { x: 3, y: 38.6, w: W - 6, h: 3.2 }, 'Scan to verify this card', style('body', 4.5, { color: 'muted', align: 'center' }), { maxLines: 1 });
  backDetails(k, who, 4, 42.6, W - 8, 4.4, 0.9);
  k.add('signature', 'signature-principal', { x: W - 24, y: H - 17, w: 20, h: 11, role: 'principal', showImage: true, showName: false, showDesignation: true, line: stroke('ink.50', 0.4), nameStyle: style('body', 5, { align: 'right' }), designationStyle: style('body', 4.4, { color: 'muted', align: 'right' }) });
  k.text('return', { x: 4, y: H - 15.5, w: W - 30, h: 11 }, 'If found, please return to\n{{institution.address}}, {{institution.city}}  ·  {{institution.phone}}', style('body', 4.2, { color: 'muted', lineHeight: 1.3 }), { maxLines: 4 });
  k.rect('bottom', { x: 0, y: H - 3.2, w: W, h: 3.2 }, grad);
  return layout(who.kind === 'student' ? 'student_id_card' : 'staff_id_card', { size: 'CR80', orientation: 'portrait', marginMm: 2 }, [{ id: 'front', label: 'Front', background: 'paper', elements: f.elements }, { id: 'back', label: 'Back', background: 'paper', elements: k.elements }], 'modern', 'Portrait card, gradient header with a round photo, role chip and barcode; QR-first back');
}

function minimal(who: Who): DocLayout {
  const f = new Builder();
  f.image('logo', { x: 4, y: 4, w: 7, h: 7 }, 'logo');
  f.text('institution', { x: 12.6, y: 3.9, w: LW - 40, h: 7.2 }, '{{institution.name}}', style('heading', 6.3, { weight: 600, lineHeight: 1.15 }), { vAlign: 'middle', maxLines: 2 });
  f.text('card-kind', { x: LW - 30, y: 4.2, w: 26, h: 3.5 }, who.kind === 'student' ? 'STUDENT' : 'STAFF', style('body', 4.6, { weight: 600, color: who.band, align: 'right', letterSpacingPt: 1.4 }), { maxLines: 1 });
  f.text('year', { x: LW - 30, y: 7.8, w: 26, h: 3.2 }, who.kind === 'student' ? '{{student.academicYear}}' : '{{staff.employeeCode}}', style('body', 4.6, { color: 'muted', align: 'right' }), { maxLines: 1 });
  f.line('rule', 4, 13, LW - 4, 13, stroke('line', 0.4));
  f.image('photo', { x: LW - 24, y: 16, w: 20, h: 24 }, 'photo', { fit: 'cover', crop: 'rect', placeholder: 'initials', border: stroke('line', 0.4) });
  f.text('name', { x: 4, y: 16, w: LW - 32, h: 6.5 }, name(who), style('body', 10, { weight: 600 }), { vAlign: 'middle', maxLines: 1 });
  f.text('role', { x: 4, y: 22.6, w: LW - 32, h: 4 }, who.role, style('body', 5.8, { color: 'muted' }), { maxLines: 1 });
  who.fields.forEach(([l, v], i) => smallField(f, `field-${i + 1}`, 4 + i * 18, 29, 17.5, l, v));
  f.add('barcode', 'barcode', { x: 3.5, y: 40.5, w: 46, h: 9, value: who.barcode, symbology: 'code128', color: 'ink', showText: true, textStyle: style('body', 4.4, { align: 'left', letterSpacingPt: 0.8, color: 'muted' }) });
  f.rect('accent', { x: LW - 24, y: 42.5, w: 20, h: 0.9 }, who.band);
  f.text('valid', { x: LW - 30, y: 44.5, w: 26, h: 3.6 }, '{{institution.website}}', style('body', 4.4, { color: 'muted', align: 'right' }), { maxLines: 1 });

  const k = new Builder();
  k.add('qr', 'verify-qr', { x: 4, y: 5, w: 21, h: 21, value: '{{verify.url}}', color: 'ink', quietZone: 1 });
  k.text('qr-caption', { x: 4, y: 26.4, w: 21, h: 3 }, 'Scan to verify', style('body', 4.2, { color: 'muted', align: 'center' }), { maxLines: 1 });
  backDetails(k, who, 29, 5, LW - 33, 4.6, 0.95);
  k.line('rule', 4, 33.5, LW - 4, 33.5, stroke('line', 0.4));
  k.text('return', { x: 4, y: 35, w: 50, h: 14 }, 'If found, please return to\n**{{institution.name}}**\n{{institution.address}}, {{institution.city}} · {{institution.phone}}', style('body', 4.5, { color: 'muted', lineHeight: 1.35 }), { markdown: true, emphasisColor: 'ink', maxLines: 4 });
  k.add('signature', 'signature-principal', { x: LW - 30, y: 35, w: 26, h: 14, role: 'principal', showImage: true, showName: false, showDesignation: true, line: stroke('ink.50', 0.35), nameStyle: style('body', 5, { align: 'right' }), designationStyle: style('body', 4.4, { color: 'muted', align: 'right' }) });
  return layout(who.kind === 'student' ? 'student_id_card' : 'staff_id_card', { size: 'CR80', orientation: 'landscape', marginMm: 2 }, [{ id: 'front', label: 'Front', background: 'paper', elements: f.elements }, { id: 'back', label: 'Back', background: 'paper', elements: k.elements }], 'minimal', 'Landscape card in hairlines and whitespace; QR and details on the back');
}

function heritage(who: Who): DocLayout {
  const f = new Builder();
  f.add('pattern', 'security-background', { x: 0, y: 0, w: LW, h: LH, pattern: 'guilloche', color: 'secondary.30', color2: `${who.band}.20`, lineWidthPt: 0.16, density: 7 });
  f.add('pattern', 'security-rosette', { x: LW / 2 - 18, y: LH / 2 - 14, w: 44, h: 44, pattern: 'rosette', color: `${who.band}.18`, color2: 'secondary.30', lineWidthPt: 0.15, density: 6, radiusMm: 22 });
  f.add('frame', 'border', { x: 1.2, y: 1.2, w: LW - 2.4, h: LH - 2.4, style: 'double', color: who.band, color2: 'secondary', widthPt: 0.9, gapMm: 0.5, radiusMm: 2.4 });
  f.image('crest', { x: 4.2, y: 3.6, w: 9.5, h: 9.5 }, 'emblem');
  f.text('institution', { x: 15, y: 3.4, w: LW - 30, h: 6 }, '{{institution.name}}', style('heading', 6.4, { weight: 700, color: who.band, align: 'center', transform: 'uppercase', letterSpacingPt: 0.4 }), { vAlign: 'middle', maxLines: 1, minSizePt: 4.4 });
  f.text('card-kind', { x: 15, y: 9.2, w: LW - 30, h: 3.4 }, who.label, style('cinzel', 4.8, { weight: 700, color: 'secondary!25', align: 'center', letterSpacingPt: 1 }), { maxLines: 1 });
  f.line('micro-top', 4, 13.7, LW - 4, 13.7, stroke(who.band, 0.3));
  f.add('pattern', 'microtext', { x: 4, y: 13.9, w: LW - 8, h: 1.6, pattern: 'microtext', color: `${who.band}.75`, density: 9, text: '{{institution.name | upper}} · IDENTITY CARD' });
  f.line('micro-bottom', 4, 15.7, LW - 4, 15.7, stroke(who.band, 0.3));
  f.rect('photo-ground', { x: 4, y: 18, w: 19.6, h: 24 }, 'paper');
  f.image('photo', { x: 4.4, y: 18.4, w: 18.8, h: 23.2 }, 'photo', { fit: 'cover', crop: 'rect', placeholder: 'initials', border: stroke('secondary', 0.9) });
  f.rect('details-ground', { x: 26, y: 18, w: LW - 45, h: 24 }, 'paper', { opacity: 0.86 });
  f.text('name', { x: 27, y: 18.6, w: LW - 47, h: 5.4 }, name(who), style('heading', 8.4, { weight: 700, color: who.band }), { vAlign: 'middle', maxLines: 1 });
  f.text('role', { x: 27, y: 24, w: LW - 47, h: 3.6 }, who.role, style('body', 5.2, { color: 'muted' }), { maxLines: 1 });
  who.fields.forEach(([l, v], i) => smallField(f, `field-${i + 1}`, 27 + i * ((LW - 47) / 3), 29.5, (LW - 47) / 3, l, v));
  f.add('seal', 'seal', { x: LW - 18, y: 22.5, w: 14.5, h: 14.5, tone: 'silver', emblem: 'emblem', ringText: '{{institution.name | upper}} • GENUINE • ', serial: '' });
  f.rect('barcode-ground', { x: 4, y: 43.6, w: 52, h: 7.4 }, 'paper', { opacity: 0.9 });
  f.add('barcode', 'barcode', { x: 4.5, y: 44, w: 51, h: 6.8, value: who.barcode, symbology: 'code128', color: 'ink', showText: false });
  f.text('barcode-text', { x: 57, y: 44.6, w: LW - 61, h: 3.6 }, who.barcode, style('body', 5.2, { weight: 700, align: 'right', letterSpacingPt: 0.8 }), { maxLines: 1 });
  f.text('website', { x: 57, y: 48, w: LW - 61, h: 3 }, '{{institution.website}}', style('body', 4.2, { color: 'muted', align: 'right' }), { maxLines: 1 });

  const k = new Builder();
  k.add('pattern', 'security-background', { x: 0, y: 0, w: LW, h: LH, pattern: 'rosette', color: `${who.band}.14`, color2: 'secondary.28', lineWidthPt: 0.15, density: 7 });
  k.add('frame', 'border', { x: 1.2, y: 1.2, w: LW - 2.4, h: LH - 2.4, style: 'double', color: who.band, color2: 'secondary', widthPt: 0.9, gapMm: 0.5, radiusMm: 2.4 });
  k.rect('details-ground', { x: 4, y: 4.5, w: 54, h: 30 }, 'paper', { opacity: 0.9, stroke: stroke('secondary.60', 0.3) });
  backDetails(k, who, 5, 5.4, 52, 4.95, 0.92);
  k.rect('qr-ground', { x: LW - 25, y: 4.5, w: 21, h: 21 }, 'white', { stroke: stroke(who.band, 0.5) });
  k.add('qr', 'verify-qr', { x: LW - 24.5, y: 5, w: 20, h: 20, value: '{{verify.url}}', color: `${who.band}!40`, quietZone: 1 });
  k.text('qr-caption', { x: LW - 26, y: 26, w: 23, h: 3 }, 'Scan to verify', style('cinzel', 4.2, { color: who.band, align: 'center' }), { maxLines: 1 });
  k.line('micro-top', 4, 36.2, LW - 4, 36.2, stroke(who.band, 0.3));
  k.add('pattern', 'microtext', { x: 4, y: 36.4, w: LW - 8, h: 1.6, pattern: 'microtext', color: `${who.band}.75`, density: 9, text: '{{institution.name | upper}} · PROPERTY OF THE INSTITUTION' });
  k.line('micro-bottom', 4, 38.2, LW - 4, 38.2, stroke(who.band, 0.3));
  k.rect('return-ground', { x: 4, y: 39.5, w: 52, h: 10.5 }, 'paper', { opacity: 0.86 });
  k.text('return', { x: 5, y: 40, w: 50, h: 10 }, 'If found, please return to **{{institution.name}}**, {{institution.address}}, {{institution.city}}. {{institution.phone}}', style('body', 4.4, { lineHeight: 1.3 }), { markdown: true, maxLines: 4 });
  k.add('signature', 'signature-principal', { x: LW - 28, y: 38.5, w: 24, h: 12, role: 'principal', showImage: true, showName: false, showDesignation: true, line: stroke(who.band, 0.35), nameStyle: style('body', 5, { align: 'center' }), designationStyle: style('cinzel', 4.2, { color: who.band, align: 'center' }) });
  return layout(who.kind === 'student' ? 'student_id_card' : 'staff_id_card', { size: 'CR80', orientation: 'landscape', marginMm: 2 }, [{ id: 'front', label: 'Front', background: 'paper', elements: f.elements }, { id: 'back', label: 'Back', background: 'paper', elements: k.elements }], 'heritage', 'Landscape card on a guilloche security ground with micro-text and a small holographic seal');
}

const BUILD: Record<PresetStyle, (w: Who) => DocLayout> = { classic, modern, minimal, heritage };

export const studentCard = (st: PresetStyle) => BUILD[st](STUDENT);
export const staffCard = (st: PresetStyle) => BUILD[st](STAFF);
