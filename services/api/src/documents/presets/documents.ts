import type { DocLayout, DocType, ElementOf, PresetStyle, TextStyle } from '@zynetix/shared';
import { compactChrome, landscapeCertificateChrome, portraitChrome } from './chrome.js';
import { A4L, A4P, A5L, type Box, Builder, field, layout, panel, section, signatures, stroke, style, type Theme, THEMES, tile } from './kit.js';

/**
 * Content of every page document (everything except ID cards and report covers) in the four
 * styles. Each builder takes the style's chrome and fills its content box.
 */

const PHOTO_CROP: Record<PresetStyle, ElementOf<'image'>['crop']> = { classic: 'rect', modern: 'rounded', minimal: 'rect', heritage: 'rect' };

/** Label-over-value fields in a grid. */
function grid(b: Builder, t: Theme, name: string, box: Box, pairs: [string, string][], cols: number, rowH: number): void {
  const colW = box.w / cols;
  pairs.forEach(([label, value], i) => field(b, t, `${name}-${i + 1}`, { x: box.x + (i % cols) * colW, y: box.y + Math.floor(i / cols) * rowH, w: colW - 3, h: rowH - 1 }, label, value));
}

function photo(b: Builder, t: Theme, box: Box): void {
  b.image('photo', box, 'photo', { fit: 'cover', crop: PHOTO_CROP[t.style], radiusMm: 2.5, placeholder: 'initials', border: t.style === 'minimal' ? stroke('line', 0.5) : stroke(t.style === 'modern' ? 'primary.30' : 'secondary', t.style === 'heritage' ? 1 : 0.8) });
}

function table(b: Builder, t: Theme, name: string, box: Box, source: string, columns: ElementOf<'table'>['columns'], o: { rowH?: number; headH?: number; footer?: ElementOf<'table'>['footer']; overflow?: 'paginate' | 'shrink'; zebra?: boolean } = {}): void {
  b.add('table', name, {
    ...box,
    background: t.style === 'heritage' ? 'paper' : undefined,
    source,
    columns,
    header: { style: t.table.head, fill: t.table.headFill, heightMm: o.headH ?? 7.5 },
    body: { style: t.table.body, rowHeightMm: o.rowH ?? 6.5, zebra: o.zebra === false ? undefined : t.table.zebra },
    borders: { outer: t.table.outer, horizontal: t.table.horizontal, vertical: t.table.vertical, headerBottom: t.table.headerBottom },
    footer: o.footer,
    cellPaddingMm: 1.8,
    emptyText: 'Nothing to show',
    overflow: o.overflow ?? 'paginate',
  });
}

const footStyle = (t: Theme): TextStyle => ({ ...t.table.body, weight: 700, color: t.style === 'modern' ? 'primary' : 'ink' });

// ---------------------------------------------------------------------------------------------

function marksCard(st: PresetStyle): DocLayout {
  const t = THEMES[st];
  const { b, content: c, signs } = portraitChrome(st, 210, 297);
  const showPhoto = st !== 'minimal';
  const panelBox = { x: c.x, y: c.y, w: c.w, h: 27 };
  panel(b, t, 'student', panelBox);
  if (showPhoto) photo(b, t, { x: c.x + c.w - 22, y: c.y + 2, w: 19.5, h: 23 });
  const gw = c.w - (showPhoto ? 27 : 0) - 4;
  grid(b, t, 'student', { x: c.x + 3, y: c.y + 2.5, w: gw, h: 24 }, [['Name of the candidate', '{{student.name}}'], ['Register / roll number', '{{student.rollNo}}'], ['Semester', '{{exam.semester}}'], ['Programme', '{{student.program}}'], ['Examination', '{{exam.session}}'], ['Class', '{{student.className}}']], 3, 11.5);
  const bottom = c.y + c.h;
  const tableY = c.y + 31;
  const tableH = bottom - tableY - 26;
  table(b, t, 'marks', { x: c.x, y: tableY, w: c.w, h: tableH }, 'marks.rows', [
    { header: 'Code', value: '{{row.code}}', width: 1.1, align: 'left' },
    { header: 'Course', value: '{{row.subject}}', width: 3.8, align: 'left' },
    { header: 'Credits', value: '{{row.credits}}', width: 0.9, align: 'center' },
    { header: 'Internal', value: '{{row.internal}}', width: 1, align: 'center' },
    { header: 'External', value: '{{row.external}}', width: 1, align: 'center' },
    { header: 'Total', value: '{{row.total}}', width: 0.9, align: 'center' },
    { header: 'Grade', value: '{{row.grade}}', width: 0.9, align: 'center' },
    { header: 'Grade points', value: '{{row.gradePoint}}', width: 1.1, align: 'center' },
    { header: 'Result', value: '{{row.result}}', width: 1, align: 'center' },
  ], { footer: [{ cells: [{ text: 'Total', span: 2, align: 'right' }, { text: '{{exam.creditsAttempted}}', span: 1, align: 'center' }, { text: '', span: 2, align: 'left' }, { text: '{{exam.totalMarks}} / {{exam.maxMarks}}', span: 2, align: 'center' }, { text: '', span: 2, align: 'left' }], style: footStyle(t), fill: t.style === 'minimal' ? undefined : t.style === 'modern' ? 'primary.10' : 'secondary.15' }] });
  const ty = bottom - 22;
  const tw = (c.w - 4 * 3) / 5;
  ([['SGPA', '{{exam.sgpa}}'], ['CGPA', '{{exam.cgpa}}'], ['Credits earned', '{{exam.creditsEarned}} / {{exam.creditsAttempted}}'], ['Percentage', '{{exam.percentage}}%'], ['Result', '{{exam.result}}']] as [string, string][]).forEach(([l, v], i) => tile(b, t, `summary-${i + 1}`, { x: c.x + i * (tw + 3), y: ty, w: tw, h: 15 }, l, v));
  b.text('classification', { x: c.x, y: bottom - 6, w: c.w, h: 5 }, '**Classification:** {{exam.classification}}     ·     Grades: O 10, A+ 9, A 8, B+ 7, B 6, C 5, P 4, F fail (10-point scale)', style('body', 7.2, { color: 'muted' }), { markdown: true, emphasisColor: 'primary', maxLines: 1, pages: 'last' });
  for (const e of b.elements) if (e.id.startsWith('summary-') || e.id === 'classification') Object.assign(e, { pages: 'last', flowAfter: 'marks' });
  signatures(b, t, ['controller', 'principal'], signs.x, signs.y, signs.w, signs.h);
  return layout('marks_card', A4P, [{ id: 'page', label: 'Page', elements: b.elements }], st, 'Semester grade card: course-wise marks, grades and SGPA/CGPA');
}

function transcript(st: PresetStyle): DocLayout {
  const t = THEMES[st];
  const { b, content: c, signs } = portraitChrome(st, 210, 297);
  panel(b, t, 'student', { x: c.x, y: c.y, w: c.w, h: 15 });
  grid(b, t, 'student', { x: c.x + 3, y: c.y + 2, w: c.w - 6, h: 12 }, [['Name', '{{student.name}}'], ['Register number', '{{student.rollNo}}'], ['Programme', '{{student.program}}'], ['Completed', '{{transcript.completedOn}}']], 4, 12);
  const bottom = c.y + c.h;
  const tableY = c.y + 19;
  const summaryH = 30;
  table(b, t, 'courses', { x: c.x, y: tableY, w: c.w, h: bottom - tableY - summaryH - 3 }, 'transcript.rows', [
    { header: 'Term', value: '{{row.term}}', width: 1.4, align: 'left' },
    { header: 'Code', value: '{{row.code}}', width: 1.1, align: 'left' },
    { header: 'Course', value: '{{row.subject}}', width: 4, align: 'left' },
    { header: 'Credits', value: '{{row.credits}}', width: 0.9, align: 'center' },
    { header: 'Grade', value: '{{row.grade}}', width: 0.9, align: 'center' },
    { header: 'Points', value: '{{row.gradePoint}}', width: 0.9, align: 'center' },
    { header: 'Result', value: '{{row.result}}', width: 0.9, align: 'center' },
  ], { rowH: 5.4, headH: 6.5 });
  const sy = bottom - summaryH;
  const terms: ElementOf<'table'>['columns'] = [
    { header: 'Term', value: '{{row.label}}', width: 2.6, align: 'left' },
    { header: 'SGPA', value: '{{row.sgpa}}', width: 0.9, align: 'center' },
    { header: 'Credits', value: '{{row.creditsEarned}}/{{row.creditsAttempted}}', width: 1, align: 'center' },
  ];
  b.add('table', 'terms', { x: c.x, y: sy, w: c.w * 0.58, h: summaryH, source: 'transcript.terms', columns: terms, header: { style: t.table.head, fill: t.table.headFill, heightMm: 4.6 }, body: { style: { ...t.table.body, sizePt: 7.2 }, rowHeightMm: 4.1, zebra: t.table.zebra }, borders: { outer: t.table.outer, horizontal: t.table.horizontal, headerBottom: t.table.headerBottom }, cellPaddingMm: 1.4, overflow: 'shrink', pages: 'last' });
  const tx = c.x + c.w * 0.58 + 4;
  const tw = c.w * 0.42 - 4;
  tile(b, t, 'cgpa', { x: tx, y: sy, w: (tw - 3) / 2, h: 14 }, 'Cumulative GPA', '{{transcript.cgpa}}');
  tile(b, t, 'credits', { x: tx + (tw - 3) / 2 + 3, y: sy, w: (tw - 3) / 2, h: 14 }, 'Credits earned', '{{transcript.creditsEarned}}');
  b.text('result', { x: tx, y: sy + 16, w: tw, h: 14 }, '**{{transcript.result}}**\n{{transcript.classification}}', style(t.style === 'modern' || t.style === 'minimal' ? 'body' : 'heading', 9.5, { color: 'ink', align: t.tile.label.align === 'center' ? 'center' : 'left', lineHeight: 1.35 }), { markdown: true, emphasisColor: 'primary', vAlign: 'middle', maxLines: 3 });
  for (const e of b.elements) if (/^(cgpa|credits|result|terms)/.test(e.id)) Object.assign(e, { pages: 'last', flowAfter: 'courses' });
  signatures(b, t, ['controller', 'registrar'], signs.x, signs.y, signs.w, signs.h);
  return layout('transcript', A4P, [{ id: 'page', label: 'Page', elements: b.elements }], st, 'Consolidated marks memo: every course of every term, term-wise SGPA and the final CGPA');
}

function hallTicket(st: PresetStyle): DocLayout {
  const t = THEMES[st];
  const { b, content: c, signs } = portraitChrome(st, 210, 297);
  const ph = { x: c.x + c.w - 32, y: c.y, w: 30, h: 36 };
  panel(b, t, 'candidate', { x: c.x, y: c.y, w: c.w - 36, h: 46 });
  grid(b, t, 'candidate', { x: c.x + 3, y: c.y + 2.5, w: c.w - 42, h: 44 }, [['Name of the candidate', '{{student.name}}'], ['Hall ticket number', '{{exam.ticketNo}}'], ['Register / roll number', '{{student.rollNo}}'], ['Programme', '{{student.program}}'], ['Class', '{{student.className}}'], ['Examination centre', '{{exam.centre}}'], ['Examination', '{{exam.session}}'], ['Reporting time', '{{exam.reportingTime}}']], 2, 11);
  photo(b, t, ph);
  b.rect('candidate-sign-box', { x: ph.x, y: ph.y + 38, w: ph.w, h: 8 }, undefined, { stroke: stroke('line', 0.5) });
  b.text('candidate-sign', { x: ph.x, y: ph.y + 46.5, w: ph.w, h: 4 }, 'Signature of the candidate', style('body', 6.2, { color: 'muted', align: 'center' }), { maxLines: 1 });
  const y = c.y + 53;
  const bottom = c.y + c.h;
  const instrH = 24;
  table(b, t, 'papers', { x: c.x, y, w: c.w, h: bottom - y - instrH - 3 }, 'papers', [
    { header: 'Date', value: '{{row.date}}', width: 1.55, align: 'left' },
    { header: 'Day', value: '{{row.day}}', width: 1.1, align: 'left' },
    { header: 'Time', value: '{{row.time}}', width: 1.45, align: 'left' },
    { header: 'Code', value: '{{row.code}}', width: 0.9, align: 'left' },
    { header: 'Paper', value: '{{row.subject}}', width: 3, align: 'left' },
    { header: 'Hall', value: '{{row.room}}', width: 0.8, align: 'center' },
    { header: 'Seat', value: '{{row.seat}}', width: 0.7, align: 'center' },
    { header: 'Invigilator', value: '', width: 1.2, align: 'center' },
  ], { rowH: 8 });
  const iy = bottom - instrH;
  section(b, t, 'instructions', c.x, iy, c.w, 'Instructions to the candidate');
  b.text('instructions', { x: c.x, y: iy + 8, w: c.w, h: instrH - 8 }, '{{exam.instructions}}', style('body', 7.8, { lineHeight: 1.45, align: 'justify' }), { pages: 'last' });
  for (const e of b.elements) if (e.id.startsWith('instructions')) Object.assign(e, { pages: 'last', flowAfter: 'papers' });
  signatures(b, t, ['controller'], signs.x, signs.y, signs.w, signs.h);
  return layout('hall_ticket', A4P, [{ id: 'page', label: 'Page', elements: b.elements }], st, 'Admit card with photo, paper timetable, hall and seat, and the rules');
}

function receiptContent(b: Builder, t: Theme, c: Box, compact: boolean): void {
  const half = (c.w - 6) / 2;
  const rowH = compact ? 9.5 : 11.5;
  panel(b, t, 'payer', { x: c.x, y: c.y, w: c.w, h: rowH * 2 + 3 });
  grid(b, t, 'payer', { x: c.x + 3, y: c.y + 1.5, w: half, h: rowH * 2 }, [['Received from', '{{student.name}}'], ['Roll number', '{{student.rollNo}}'], ['Class', '{{student.className}}'], ['Towards', '{{receipt.towards}}']], 2, rowH);
  grid(b, t, 'payment', { x: c.x + half + 6, y: c.y + 1.5, w: half - 3, h: rowH * 2 }, [['Receipt number', '{{receipt.no}}'], ['Date', '{{receipt.date}}'], ['Payment mode', '{{receipt.mode}}'], ['Reference', '{{receipt.reference}}']], 2, rowH);
  const y = c.y + rowH * 2 + 6;
  const tableW = compact ? c.w * 0.62 : c.w;
  const tableH = compact ? c.y + c.h - y : c.y + c.h - y - 44;
  table(b, t, 'lines', { x: c.x, y, w: tableW, h: tableH }, 'fee.lines', [
    { header: '#', value: '{{row.no}}', width: 0.5, align: 'center' },
    { header: 'Particulars', value: '{{row.head}}', width: 4, align: 'left' },
    { header: 'Amount', value: '{{row.amount}}', width: 1.8, align: 'right' },
  ], { rowH: compact ? 5.6 : 7, headH: compact ? 6 : 7.5, overflow: 'shrink', footer: [{ cells: [{ text: 'Total received', span: 2, align: 'right' }, { text: '{{receipt.amount}}', span: 1, align: 'right' }], style: footStyle(t), fill: t.style === 'minimal' ? undefined : t.style === 'modern' ? 'primary.10' : 'secondary.15' }] });
  const flow = compact ? {} : { flowAfter: 'lines' };
  const ax = compact ? c.x + tableW + 4 : c.x;
  const aw = compact ? c.w - tableW - 4 : c.w;
  const ay = compact ? y : y + tableH + 5;
  tile(b, t, 'amount', { x: ax, y: ay, w: compact ? aw : c.w * 0.36, h: 16 }, 'Amount received', '{{receipt.amount}}');
  if (!compact) for (const e of b.elements) if (e.id.startsWith('amount-')) Object.assign(e, flow);
  b.text('amount-words', { x: compact ? ax : c.x + c.w * 0.36 + 5, y: compact ? ay + 18 : ay + 1, w: compact ? aw : c.w * 0.64 - 5, h: compact ? 12 : 9 }, '**{{receipt.amountWords}}**', style('body', compact ? 7.6 : 9, { lineHeight: 1.35 }), { markdown: true, emphasisColor: 'ink', maxLines: 3, ...flow });
  b.text('balance', { x: compact ? ax : c.x + c.w * 0.36 + 5, y: compact ? ay + 30 : ay + 10, w: compact ? aw : c.w * 0.64 - 5, h: 5 }, 'Balance due on this fee: {{receipt.balance}}', style('body', compact ? 7 : 8, { color: 'muted' }), { maxLines: 1, ...flow });
}

function feeReceipt(st: PresetStyle): DocLayout {
  const t = THEMES[st];
  const half = (copy?: string) => {
    const { b, content: c, signs } = compactChrome(st, 210, 148, { title: 'Fee Receipt', copy });
    receiptContent(b, t, c, true);
    b.add('signature', 'signature-finance', { x: signs.x, y: signs.y, w: 58, h: signs.h, role: 'finance', showImage: true, showName: false, showDesignation: true, line: t.signLine, nameStyle: { ...t.signName, align: 'left' }, designationStyle: { ...t.signRole, align: 'left' } });
    b.text('thanks', { x: signs.x + 64, y: signs.y + 10, w: st === 'heritage' ? 62 : 70, h: 8 }, 'Received with thanks. This receipt is valid only when the payment is realised.', style('body', 6.6, { color: 'muted', lineHeight: 1.35 }), { maxLines: 2 });
    return b;
  };
  if (st !== 'heritage') return layout('fee_receipt', A5L, [{ id: 'page', label: 'Page', elements: half().elements }], st, 'Half-sheet (A5) receipt with the fee lines, amount in words and the verification QR');
  // Heritage: the student's copy and the office copy on one A4 sheet, with a cut line between.
  const sheet = new Builder();
  sheet.push(...half("STUDENT'S COPY").elements);
  sheet.push(...half('OFFICE COPY').elements.map((e) => ({ ...e, id: `office-${e.id}`, name: `office ${e.name ?? e.id}`, y: e.y + 148.5 })));
  sheet.line('cut-line', 6, 148.5, 204, 148.5, stroke('muted', 0.5, { dashMm: [2, 1.4] }));
  sheet.text('cut-label', { x: 85, y: 146.6, w: 40, h: 4 }, 'cut here', style('body', 6, { color: 'muted', align: 'center' }), { maxLines: 1 });
  return layout('fee_receipt', A4P, [{ id: 'page', label: 'Page', elements: sheet.elements }], st, 'A4 sheet with the student\u2019s copy and the office copy, each on a guilloche security ground');
}

function feeInvoice(st: PresetStyle): DocLayout {
  const t = THEMES[st];
  const { b, content: c, signs } = portraitChrome(st, 210, 297, { dateLabel: 'Invoice date' });
  const half = (c.w - 5) / 2;
  panel(b, t, 'supplier', { x: c.x, y: c.y, w: half, h: 27 });
  b.text('supplier-head', { x: c.x + 3, y: c.y + 2, w: half - 6, h: 4 }, 'Supplier', t.section, { maxLines: 1 });
  b.text('supplier', { x: c.x + 3, y: c.y + 7, w: half - 6, h: 19 }, '**{{institution.legalName}}**\n{{institution.address}}, {{institution.city}} {{institution.pincode}}, {{institution.state}}\nGSTIN: **{{institution.gstin}}**', style('body', 8, { lineHeight: 1.4 }), { markdown: true, maxLines: 5 });
  panel(b, t, 'billto', { x: c.x + half + 5, y: c.y, w: half, h: 27 });
  b.text('billto-head', { x: c.x + half + 8, y: c.y + 2, w: half - 6, h: 4 }, 'Bill to', t.section, { maxLines: 1 });
  b.text('billto', { x: c.x + half + 8, y: c.y + 7, w: half - 6, h: 19 }, '**{{invoice.billTo}}**\n{{student.name}}, {{student.className}} (roll {{student.rollNo}})\n{{student.address}}', style('body', 8, { lineHeight: 1.4 }), { markdown: true, maxLines: 5 });
  const my = c.y + 30;
  grid(b, t, 'meta', { x: c.x, y: my, w: c.w, h: 11 }, [['Invoice number', '{{invoice.no}}'], ['Due date', '{{invoice.dueDate}}'], ['Billing period', '{{invoice.period}}'], ['Place of supply', '{{invoice.placeOfSupply}}']], 4, 11);
  const ty = my + 13;
  const bottom = c.y + c.h;
  const notesH = 22;
  const right = (text: string, value: string, bold = false) => ({ cells: [{ text, span: 8, align: 'right' as const }, { text: value, span: 1, align: 'right' as const }], style: bold ? footStyle(t) : { ...t.table.body, color: 'ink' }, fill: bold && t.style !== 'minimal' ? (t.style === 'modern' ? 'primary.10' : 'secondary.15') : undefined });
  table(b, t, 'lines', { x: c.x, y: ty, w: c.w, h: bottom - ty - notesH - 2 }, 'invoice.lines', [
    { header: '#', value: '{{row.no}}', width: 0.45, align: 'center' },
    { header: 'Description', value: '{{row.head}}', width: 3.4, align: 'left' },
    { header: 'SAC', value: '{{row.sac}}', width: 1, align: 'center' },
    { header: 'Qty', value: '{{row.qty}}', width: 0.55, align: 'center' },
    { header: 'Rate', value: '{{row.rate}}', width: 1.2, align: 'right' },
    { header: 'Taxable value', value: '{{row.taxable}}', width: 1.3, align: 'right' },
    { header: 'GST', value: '{{row.gstRate}}', width: 0.85, align: 'center' },
    { header: 'Tax', value: '{{row.tax}}', width: 0.95, align: 'right' },
    { header: 'Amount', value: '{{row.amount}}', width: 1.3, align: 'right' },
  ], { rowH: 6.6, footer: [right('Taxable value', '{{invoice.subtotal}}'), right('CGST', '{{invoice.cgst}}'), right('SGST', '{{invoice.sgst}}'), right('Total payable', '{{invoice.total}}', true)] });
  const ny = bottom - notesH;
  b.text('total-words', { x: c.x, y: ny, w: c.w, h: 5 }, 'Amount in words: **{{invoice.totalWords}}**', style('body', 8.5), { markdown: true, maxLines: 1, pages: 'last', flowAfter: 'lines' });
  b.text('gst-note', { x: c.x, y: ny + 6, w: c.w, h: 16 }, '{{invoice.note}} Amounts in rupees. Pay by the due date at the fee counter or online; a receipt is issued for every payment.', style('body', 7, { color: 'muted', lineHeight: 1.4 }), { maxLines: 3, pages: 'last', flowAfter: 'total-words' });
  signatures(b, t, ['finance'], signs.x, signs.y, signs.w, signs.h);
  return layout('fee_invoice', A4P, [{ id: 'page', label: 'Page', elements: b.elements }], st, 'GST-ready tax invoice: supplier and recipient, SAC codes, taxable value, CGST/SGST and totals');
}

/** Bonafide and conduct certificates: a formal paragraph, place and date, the principal's signature. */
function letterCertificate(docType: DocType, st: PresetStyle, salutation: string | null): DocLayout {
  const t = THEMES[st];
  const { b, content: c, signs } = portraitChrome(st, 210, 297);
  let y = c.y + 8;
  if (salutation) {
    b.text('salutation', { x: c.x, y, w: c.w, h: 7 }, salutation, { ...t.section, sizePt: 10.5, align: st === 'modern' || st === 'minimal' ? 'left' : 'center' }, { maxLines: 1 });
    y += 12;
  }
  if (st === 'heritage') b.rect('body-ground', { x: c.x - 2, y: y - 3, w: c.w + 4, h: c.h - (y - c.y) - 16 }, 'paper', { opacity: 0.88 });
  b.text('body', { x: c.x + (st === 'minimal' ? 0 : 4), y, w: c.w - (st === 'minimal' ? 0 : 8), h: c.h - (y - c.y) - 22 }, '{{doc.body}}', { ...t.body, sizePt: st === 'minimal' ? 11 : 12 }, { markdown: true, emphasisColor: 'primary', minSizePt: 9 });
  b.text('place', { x: c.x, y: c.y + c.h - 12, w: 90, h: 5 }, 'Place: {{institution.city}}', style('body', 9, { color: 'ink' }), { maxLines: 1 });
  b.text('dated', { x: c.x, y: c.y + c.h - 6, w: 90, h: 5 }, 'Date: {{doc.issuedOn}}', style('body', 9, { color: 'ink' }), { maxLines: 1 });
  signatures(b, t, ['principal'], signs.x, signs.y, signs.w, signs.h);
  return layout(docType, A4P, [{ id: 'page', label: 'Page', elements: b.elements }], st, 'Formal certificate text with place, date and the principal’s signature');
}

/** Certificates made of a list of particulars and a certifying line: transfer and migration certificates. */
function particularsCertificate(docType: DocType, st: PresetStyle, description: string): DocLayout {
  const t = THEMES[st];
  const { b, content: c, signs } = portraitChrome(st, 210, 297);
  const listH = c.h - 20;
  if (st === 'heritage') b.rect('list-ground', { x: c.x - 2, y: c.y - 1, w: c.w + 4, h: listH + 2 }, 'paper', { opacity: 0.9 });
  b.add('fieldList', 'particulars', { x: c.x + 2, y: c.y, w: c.w - 4, h: listH, source: 'doc.fields', columns: 1, rowHeightMm: Math.min(7.2, listH / 13), labelWidthMm: 74, separator: ':', labelStyle: style(st === 'modern' || st === 'minimal' ? 'body' : 'heading', 9.2, { color: 'ink' }), valueStyle: style(st === 'modern' || st === 'minimal' ? 'body' : 'heading', 9.6, { weight: 700 }), rule: stroke('line', 0.4, { dashMm: [0.6, 0.8] }) });
  b.text('certified', { x: c.x, y: c.y + listH + 2, w: c.w, h: 12 }, '{{doc.body}}', style(st === 'modern' || st === 'minimal' ? 'body' : 'heading', 9, { lineHeight: 1.45, align: 'justify' }), { markdown: true, maxLines: 3, flowAfter: 'particulars' });
  b.text('dated', { x: c.x, y: c.y + c.h - 4, w: 120, h: 5 }, 'Place: {{institution.city}}     Date of issue: {{doc.issuedOn}}', style('body', 8.5), { maxLines: 1 });
  signatures(b, t, ['principal'], signs.x, signs.y, signs.w, signs.h);
  return layout(docType, A4P, [{ id: 'page', label: 'Page', elements: b.elements }], st, description);
}

/** Landscape certificates: course completion and merit / participation. */
function displayCertificate(docType: DocType, st: PresetStyle, o: { heading: string; lead: string; name: string; citation: string; footnote: string; signers: ('principal' | 'registrar' | 'controller')[] }): DocLayout {
  const t = THEMES[st];
  const W = 297;
  const H = 210;
  const { b, content: c, signs } = landscapeCertificateChrome(st, W, H);
  const center = st === 'modern' ? 'left' : 'center';
  const head: TextStyle =
    st === 'classic' ? style('heading', 24, { weight: 700, color: 'primary', align: 'center', letterSpacingPt: 4, transform: 'uppercase', lineHeight: 1.1 })
    : st === 'modern' ? style('body', 30, { weight: 700, color: 'primary', lineHeight: 1.05 })
    : st === 'minimal' ? style('heading', 26, { weight: 400, color: 'ink', align: 'center', letterSpacingPt: 1, lineHeight: 1.1 })
    : style('cinzel', 26, { weight: 700, color: 'primary', align: 'center', letterSpacingPt: 3, lineHeight: 1.1 });
  let y = c.y;
  if (st === 'modern') {
    b.text('kicker', { x: c.x, y, w: c.w, h: 5 }, '{{institution.name | upper}}', style('body', 8, { weight: 700, color: 'accent', letterSpacingPt: 2 }), { maxLines: 1 });
    y += 8;
  }
  b.text('heading', { x: c.x, y, w: c.w, h: 14 }, o.heading, head, { vAlign: 'middle', maxLines: 1 });
  y += 16;
  if (st === 'classic' || st === 'heritage') {
    b.line('heading-left', W / 2 - 40, y, W / 2 - 5, y, stroke('secondary', 0.7));
    b.add('shape', 'heading-diamond', { x: W / 2 - 1.8, y: y - 1.8, w: 3.6, h: 3.6, shape: 'rect', fill: 'secondary', rotationDeg: 45 });
    b.line('heading-right', W / 2 + 5, y, W / 2 + 40, y, stroke('secondary', 0.7));
    y += 5;
  } else if (st === 'modern') {
    b.rect('heading-bar', { x: c.x, y: y - 1, w: 24, h: 1.4 }, 'accent');
    y += 5;
  } else y += 2;
  b.text('lead', { x: c.x, y, w: c.w, h: 7 }, o.lead, style(st === 'modern' ? 'body' : 'heading', 12, { italic: st !== 'modern', color: 'muted', align: center }), { maxLines: 1 });
  y += 9;
  b.text('recipient', { x: c.x, y, w: c.w, h: 16 }, o.name, { ...t.display, align: center }, { vAlign: 'middle', maxLines: 1 });
  y += 17;
  b.line('recipient-rule', st === 'modern' ? c.x : W / 2 - 70, y, st === 'modern' ? c.x + 110 : W / 2 + 70, y, stroke(st === 'minimal' ? 'line' : 'secondary', 0.6));
  y += 4;
  b.text('citation', { x: st === 'modern' ? c.x : c.x + 14, y, w: st === 'modern' ? c.w - 10 : c.w - 28, h: 24 }, o.citation, style(st === 'modern' || st === 'minimal' ? 'body' : 'heading', 12, { align: center, lineHeight: 1.55 }), { markdown: true, emphasisColor: 'primary', minSizePt: 9 });
  y += 26;
  b.text('footnote', { x: c.x, y, w: c.w, h: 5 }, o.footnote, style('body', 8.5, { color: 'muted', align: center }), { maxLines: 1 });
  // Signatures sit either side of the seal (centred styles) or in a row (modern, minimal).
  const sigW = 62;
  const sy = H - 54;
  const placeSig = (role: 'principal' | 'registrar' | 'controller', x: number, align: 'left' | 'center' | 'right') =>
    b.add('signature', `signature-${role}`, { x, y: sy, w: sigW, h: 24, role, showImage: true, showName: true, showDesignation: true, line: t.signLine, nameStyle: { ...t.signName, align }, designationStyle: { ...t.signRole, align } });
  if (st === 'modern') {
    o.signers.forEach((r, i) => placeSig(r, c.x + i * (sigW + 14), 'left'));
  } else if (st === 'minimal') {
    o.signers.forEach((r, i) => placeSig(r, 34 + i * (sigW + 14), 'left'));
  } else {
    placeSig(o.signers[0], 46, 'center');
    if (o.signers[1]) placeSig(o.signers[1], W - 46 - sigW, 'center');
  }
  const qx = st === 'modern' ? W - 38 : st === 'minimal' ? W - 82 : W - 46 - sigW - 30;
  const qy = st === 'modern' ? H - 40 : st === 'minimal' ? H - 48 : H - 50;
  b.add('qr', 'verify-qr', { x: st === 'classic' || st === 'heritage' ? 26 : qx, y: st === 'classic' || st === 'heritage' ? H - 50 : qy, w: 18, h: 18, value: '{{verify.url}}', color: st === 'minimal' ? 'ink' : 'primary!30', quietZone: 1 });
  b.text('fingerprint', { x: st === 'modern' ? c.x : 34, y: H - (st === 'modern' ? 18 : 29), w: st === 'modern' ? c.w - 40 : 200, h: 4 }, 'No. {{doc.serial}}  ·  Fingerprint {{doc.fingerprint}}  ·  scan the code to verify', style('body', 6.5, { color: 'muted', align: st === 'classic' || st === 'heritage' ? 'left' : 'left' }), { maxLines: 1 });
  if (st === 'classic' || st === 'heritage') {
    const fp = b.elements.find((e) => e.id === 'fingerprint')!;
    Object.assign(fp, { x: 46, y: H - 30, w: 120 });
  }
  void signs;
  return layout(docType, A4L, [{ id: 'page', label: 'Page', elements: b.elements }], st, o.heading.includes('{{') ? 'Landscape certificate with the recipient’s name in display type' : `${o.heading}: landscape certificate`);
}

function salarySlip(st: PresetStyle): DocLayout {
  const t = THEMES[st];
  const { b, content: c } = portraitChrome(st, 210, 297, { dateLabel: 'Issued' });
  panel(b, t, 'employee', { x: c.x, y: c.y, w: c.w, h: 26 });
  grid(b, t, 'employee', { x: c.x + 3, y: c.y + 2, w: c.w - 6, h: 24 }, [['Employee', '{{staff.name}}'], ['Employee code', '{{staff.employeeCode}}'], ['Designation', '{{staff.designation}}'], ['Department', '{{staff.department}}'], ['Pay period', '{{pay.month}}'], ['Paid days', '{{pay.paidDays}} of {{pay.daysInMonth}} (LOP {{pay.lopDays}})'], ['PAN', '{{staff.pan}}'], ['Bank account', '{{staff.bankAccount}}']], 4, 11.5);
  const ty = c.y + 30;
  const rows = 5;
  const tableH = 7.5 + rows * 7 + 7;
  table(b, t, 'pay', { x: c.x, y: ty, w: c.w, h: tableH }, 'pay.rows', [
    { header: 'Earnings', value: '{{row.earning}}', width: 2.6, align: 'left' },
    { header: 'Amount (Rs.)', value: '{{row.earningAmount}}', width: 1.4, align: 'right' },
    { header: 'Deductions', value: '{{row.deduction}}', width: 2.6, align: 'left' },
    { header: 'Amount (Rs.)', value: '{{row.deductionAmount}}', width: 1.4, align: 'right' },
  ], { rowH: 7, overflow: 'shrink', footer: [{ cells: [{ text: 'Gross earnings', span: 1, align: 'left' }, { text: '{{pay.gross}}', span: 1, align: 'right' }, { text: 'Total deductions', span: 1, align: 'left' }, { text: '{{pay.deductions}}', span: 1, align: 'right' }], style: footStyle(t), fill: t.style === 'minimal' ? undefined : t.style === 'modern' ? 'primary.10' : 'secondary.15' }] });
  const ny = ty + tableH + 6;
  tile(b, t, 'net', { x: c.x, y: ny, w: c.w * 0.38, h: 18 }, 'Net pay', '{{pay.net}}');
  b.text('net-words', { x: c.x + c.w * 0.38 + 5, y: ny + 1, w: c.w * 0.62 - 5, h: 10 }, '**{{pay.netWords}}**', style('body', 9.5, { lineHeight: 1.35 }), { markdown: true, maxLines: 2 });
  b.text('net-mode', { x: c.x + c.w * 0.38 + 5, y: ny + 11.5, w: c.w * 0.62 - 5, h: 5 }, 'Credited to {{staff.bankAccount}}  ·  Tax regime: {{pay.taxRegime}}', style('body', 7.5, { color: 'muted' }), { maxLines: 1 });
  const ey = ny + 24;
  section(b, t, 'employer', c.x, ey, c.w, 'Employer contributions and tax');
  grid(b, t, 'employer', { x: c.x, y: ey + 8, w: c.w, h: 11 }, [['Employer PF', '{{pay.employerPf}}'], ['Employer ESI', '{{pay.employerEsi}}'], ['Projected annual tax', '{{pay.annualTax}}'], ['UAN', '{{staff.uan}}']], 4, 11);
  b.text('note', { x: c.x, y: c.y + c.h - 6, w: c.w, h: 6 }, 'This is a computer-generated payslip and needs no signature. Its authenticity can be checked with the code below.', style('body', 7.5, { color: 'muted', align: st === 'classic' || st === 'heritage' ? 'center' : 'left' }), { maxLines: 2 });
  return layout('salary_slip', A4P, [{ id: 'page', label: 'Page', elements: b.elements }], st, 'Monthly payslip: earnings and deductions side by side, net pay in figures and words');
}

function letter(docType: 'offer_letter' | 'appointment_letter', st: PresetStyle): DocLayout {
  const t = THEMES[st];
  const { b, content: c, signs } = portraitChrome(st, 210, 297, { dateLabel: 'Date' });
  const name = docType === 'offer_letter' ? '{{offer.candidateName}}' : '{{appointment.name}}';
  const to = docType === 'offer_letter' ? `To\n**${name}**\n{{offer.candidateAddress}}` : `To\n**${name}**\n{{staff.address}}`;
  const font = st === 'modern' || st === 'minimal' ? 'body' : 'heading';
  if (st === 'heritage') b.rect('letter-ground', { x: c.x - 2, y: c.y - 2, w: c.w + 4, h: c.h + 4 }, 'paper', { opacity: 0.9 });
  b.text('addressee', { x: c.x, y: c.y, w: c.w * 0.6, h: 16 }, to, style(font, 9.5, { lineHeight: 1.4 }), { markdown: true, maxLines: 4 });
  const subject = docType === 'offer_letter' ? 'Offer of appointment as {{offer.position}}, {{offer.department}}' : 'Appointment as {{appointment.position}}, {{appointment.department}}';
  b.text('subject', { x: c.x, y: c.y + 19, w: c.w, h: 6 }, `**Subject: ${subject}**`, style(font, 10, { color: 'primary' }), { markdown: true, emphasisColor: 'primary', maxLines: 1 });
  b.text('salutation', { x: c.x, y: c.y + 27, w: c.w, h: 6 }, `Dear ${name},`, style(font, 10), { maxLines: 1 });
  const body =
    docType === 'offer_letter'
      ? 'We are pleased to offer you the position of **{{offer.position}}** in the **{{offer.department}}** department at {{institution.name}}, following your interview and selection.\n\nYour annual cost to the institution will be **{{offer.ctc}}** ({{offer.ctcWords}}), paid monthly with statutory deductions as applicable. You are requested to join on **{{offer.joiningDate}}**.\n\n{{offer.terms}}\n\nThis offer is valid until **{{offer.validUntil}}**. Please sign and return a copy of this letter to confirm your acceptance.'
      : 'With reference to your application and the subsequent selection process, we are pleased to appoint you as **{{appointment.position}}** in the **{{appointment.department}}** department, on the pay scale {{appointment.payScale}}, with effect from **{{appointment.joiningDate}}**.\n\nYou will be on probation for {{appointment.probation}} and will report to the {{appointment.reportingTo}}. On satisfactory completion of probation your services will be confirmed in writing.\n\n{{appointment.terms}}\n\nPlease sign the duplicate copy of this letter as a token of your acceptance and report for duty on the date of joining.';
  const bodyH = c.h - 35 - (docType === 'offer_letter' ? 24 : 12);
  b.text('body', { x: c.x, y: c.y + 35, w: c.w, h: bodyH }, body, { ...t.body, sizePt: 10, lineHeight: 1.6 }, { markdown: true, emphasisColor: 'ink', minSizePt: 8 });
  b.text('closing', { x: c.x, y: c.y + 35 + bodyH, w: c.w, h: 6 }, 'With best wishes,', style(font, 10), { maxLines: 1, flowAfter: 'body' });
  if (docType === 'offer_letter') {
    b.rect('acceptance-box', { x: c.x, y: c.y + c.h - 16, w: c.w, h: 16 }, t.style === 'modern' ? 'primary.5' : undefined, { stroke: stroke('line', 0.5, { dashMm: [1.2, 0.8] }), radiusMm: t.style === 'modern' ? 2 : 0 });
    b.text('acceptance', { x: c.x + 3, y: c.y + c.h - 14.5, w: c.w - 6, h: 5 }, 'Acceptance: I accept this offer on the terms set out above.', style('body', 8, { weight: 600 }), { maxLines: 1 });
    b.text('acceptance-sign', { x: c.x + 3, y: c.y + c.h - 7, w: c.w - 6, h: 5 }, 'Signature: ______________________________     Date: ________________', style('body', 8, { color: 'muted' }), { maxLines: 1 });
  }
  b.add('signature', 'signature-hr', { x: signs.x, y: signs.y, w: 60, h: signs.h, role: docType === 'offer_letter' ? 'hr' : 'principal', showImage: true, showName: true, showDesignation: true, line: t.signLine, nameStyle: { ...t.signName, align: 'left' }, designationStyle: { ...t.signRole, align: 'left' }, pages: 'last' });
  return layout(docType, A4P, [{ id: 'page', label: 'Page', elements: b.elements }], st, docType === 'offer_letter' ? 'Offer letter on the letterhead with the acceptance block' : 'Appointment letter on the letterhead');
}

/** Cover pages for reports exported from the ERP. */
function reportCover(st: PresetStyle): DocLayout {
  const t = THEMES[st];
  const W = 210;
  const H = 297;
  const { b } = { b: portraitChrome(st, W, H, { seal: false }).b };
  // Covers keep only the background and border of the chrome; the rest is their own.
  const keep = new Set(['watermark', 'border', 'security-background', 'security-rosette']);
  b.elements.splice(0, b.elements.length, ...b.elements.filter((e) => keep.has(e.id)));
  const meta: [string, string][] = [['Period', '{{report.period}}'], ['Prepared by', '{{report.preparedBy}}'], ['Prepared for', '{{report.preparedFor}}'], ['Date', '{{report.date}}']];
  if (st === 'classic') {
    b.image('crest', { x: W / 2 - 22, y: 40, w: 44, h: 44 }, 'emblem');
    b.text('institution', { x: 24, y: 92, w: W - 48, h: 10 }, '{{institution.name}}', { ...t.brand, sizePt: 18 }, { maxLines: 2 });
    b.text('tagline', { x: 24, y: 104, w: W - 48, h: 5 }, '{{institution.tagline}}', style('heading', 9, { italic: true, color: 'secondary!25', align: 'center' }), { maxLines: 1 });
    b.line('rule-1', 50, 122, W - 50, 122, stroke('secondary', 1));
    b.text('title', { x: 24, y: 130, w: W - 48, h: 30 }, '{{report.title}}', style('heading', 26, { weight: 700, color: 'primary', align: 'center', lineHeight: 1.15 }), { vAlign: 'middle', maxLines: 3 });
    b.text('subtitle', { x: 24, y: 162, w: W - 48, h: 8 }, '{{report.subtitle}}', style('heading', 13, { italic: true, color: 'muted', align: 'center' }), { maxLines: 1 });
    b.line('rule-2', 50, 176, W - 50, 176, stroke('secondary', 1));
    grid(b, t, 'meta', { x: 40, y: 190, w: W - 80, h: 26 }, meta, 2, 13);
    for (const e of b.elements) if (e.type === 'field') e.labelStyle = { ...e.labelStyle, align: 'center' };
    for (const e of b.elements) if (e.type === 'field') e.valueStyle = { ...e.valueStyle, align: 'center' };
    b.add('seal', 'seal', { x: W / 2 - 15, y: 228, w: 30, h: 30, tone: 'silver', emblem: 'emblem', ringText: '{{institution.name | upper}} • GENUINE • {{doc.serial}}', serial: '{{doc.serial}}' });
    b.text('confidentiality', { x: 24, y: H - 26, w: W - 48, h: 5 }, '{{report.confidentiality}}  ·  {{report.criterion}}', style('body', 8, { color: 'muted', align: 'center', letterSpacingPt: 0.8, transform: 'uppercase' }), { maxLines: 1 });
  } else if (st === 'modern') {
    b.rect('block', { x: 0, y: 0, w: W, h: 190 }, { kind: 'linear', angleDeg: 60, stops: [{ at: 0, color: 'primary!35' }, { at: 0.55, color: 'primary' }, { at: 1, color: 'tertiary' }] });
    b.ellipse('orb', { x: W - 110, y: -60, w: 190, h: 190 }, 'white', { opacity: 0.06 });
    b.ellipse('orb-2', { x: W - 70, y: 66, w: 110, h: 110 }, 'accent', { opacity: 0.24 });
    b.rect('accent', { x: 0, y: 190, w: W, h: 3 }, 'accent');
    b.image('logo', { x: 20, y: 22, w: 24, h: 24 }, 'logo_dark');
    b.text('institution', { x: 48, y: 25, w: W - 70, h: 8 }, '{{institution.name}}', { ...t.brand, sizePt: 12 }, { maxLines: 2 });
    b.text('kicker', { x: 20, y: 96, w: W - 40, h: 6 }, '{{report.subtitle | upper}}', style('body', 9, { weight: 700, color: 'accent.60', letterSpacingPt: 2 }), { maxLines: 1 });
    b.text('title', { x: 20, y: 104, w: W - 50, h: 50 }, '{{report.title}}', style('body', 34, { weight: 700, color: 'white', lineHeight: 1.08 }), { maxLines: 3 });
    b.text('period', { x: 20, y: 160, w: W - 40, h: 8 }, '{{report.period}}', style('body', 13, { color: 'primary.30' }), { maxLines: 1 });
    grid(b, t, 'meta', { x: 20, y: 206, w: W - 40, h: 24 }, meta, 2, 13);
    b.add('seal', 'seal', { x: W - 52, y: H - 62, w: 32, h: 32, tone: 'silver', emblem: 'emblem', ringText: '{{institution.name | upper}} • GENUINE • {{doc.serial}}', serial: '{{doc.serial}}' });
    b.text('confidentiality', { x: 20, y: H - 22, w: W - 80, h: 5 }, '{{report.confidentiality}}  ·  {{report.criterion}}', style('body', 8, { color: 'muted' }), { maxLines: 1 });
  } else if (st === 'minimal') {
    b.image('logo', { x: 22, y: 26, w: 16, h: 16 }, 'logo');
    b.text('institution', { x: 42, y: 29, w: W - 64, h: 6 }, '{{institution.name}}', t.brand, { maxLines: 1 });
    b.line('rule', 22, 110, 60, 110, stroke('ink', 1.2));
    b.text('title', { x: 22, y: 116, w: W - 44, h: 40 }, '{{report.title}}', style('heading', 30, { weight: 400, color: 'ink', lineHeight: 1.12 }), { maxLines: 3 });
    b.text('subtitle', { x: 22, y: 158, w: W - 44, h: 7 }, '{{report.subtitle}}  ·  {{report.period}}', style('body', 11, { color: 'muted' }), { maxLines: 1 });
    grid(b, t, 'meta', { x: 22, y: H - 62, w: W - 44, h: 12 }, meta, 4, 12);
    b.line('footer-rule', 22, H - 44, W - 22, H - 44, stroke('line', 0.4));
    b.text('confidentiality', { x: 22, y: H - 40, w: W - 80, h: 5 }, '{{report.confidentiality}}', style('body', 7.5, { color: 'muted' }), { maxLines: 1 });
    b.add('seal', 'seal', { x: W - 46, y: H - 40, w: 22, h: 22, tone: 'silver', emblem: 'emblem', ringText: '{{institution.name | upper}} • GENUINE • {{doc.serial}}', serial: '{{doc.serial}}' });
  } else {
    b.image('crest', { x: W / 2 - 20, y: 34, w: 40, h: 40 }, 'emblem');
    b.text('institution', { x: 24, y: 80, w: W - 48, h: 9 }, '{{institution.name}}', t.brand, { maxLines: 2 });
    b.text('tagline', { x: 24, y: 90, w: W - 48, h: 5 }, '{{institution.tagline}}', style('heading', 8.5, { italic: true, color: 'primary', align: 'center' }), { maxLines: 1 });
    b.rect('title-ground', { x: 26, y: 112, w: W - 52, h: 64 }, 'paper', { stroke: stroke('primary', 1.2) });
    b.add('frame', 'title-frame', { x: 29, y: 115, w: W - 58, h: 58, style: 'single', color: 'secondary', widthPt: 0.6 });
    b.text('title', { x: 34, y: 120, w: W - 68, h: 36 }, '{{report.title}}', style('cinzel', 22, { weight: 700, color: 'primary', align: 'center', lineHeight: 1.2, letterSpacingPt: 1 }), { vAlign: 'middle', maxLines: 3 });
    b.text('subtitle', { x: 34, y: 158, w: W - 68, h: 9 }, '{{report.subtitle}}  ·  {{report.period}}', style('heading', 10, { italic: true, color: 'primary', align: 'center' }), { maxLines: 1 });
    b.rect('meta-ground', { x: 40, y: 190, w: W - 80, h: 30 }, 'paper', { opacity: 0.9 });
    grid(b, t, 'meta', { x: 44, y: 193, w: W - 88, h: 26 }, meta, 2, 13);
    b.add('seal', 'seal', { x: W / 2 - 16, y: 230, w: 32, h: 32, tone: 'silver', emblem: 'emblem', ringText: '{{institution.name | upper}} • GENUINE • {{doc.serial}}', serial: '{{doc.serial}}' });
    b.text('confidentiality', { x: 24, y: H - 24, w: W - 48, h: 5 }, '{{report.confidentiality}}  ·  {{report.criterion}}', style('cinzel', 7.5, { color: 'primary', align: 'center', letterSpacingPt: 1 }), { maxLines: 1 });
  }
  return layout('report_cover', A4P, [{ id: 'page', label: 'Cover', elements: b.elements }], st, 'Cover page for exported reports and accreditation files');
}

export const PAGE_PRESETS: Partial<Record<DocType, (st: PresetStyle) => DocLayout>> = {
  marks_card: marksCard,
  transcript,
  hall_ticket: hallTicket,
  fee_receipt: feeReceipt,
  fee_invoice: feeInvoice,
  bonafide_certificate: (st) => letterCertificate('bonafide_certificate', st, null),
  conduct_certificate: (st) => letterCertificate('conduct_certificate', st, 'To whom it may concern'),
  transfer_certificate: (st) => particularsCertificate('transfer_certificate', st, 'Transfer certificate with the full list of particulars and the principal’s signature'),
  migration_certificate: (st) => particularsCertificate('migration_certificate', st, 'Migration certificate: the student’s particulars and the institution’s no-objection to migrating'),
  medium_of_instruction_certificate: (st) => letterCertificate('medium_of_instruction_certificate', st, 'To whom it may concern'),
  degree_certificate: (st) => displayCertificate('degree_certificate', st, { heading: '{{doc.title}}', lead: 'This is to certify that', name: '{{student.name}}', citation: '{{degree.citation}}', footnote: 'Register number {{student.registerNo}}  ·  {{degree.convocation}}  ·  {{institution.city}}', signers: ['principal', 'controller'] }),
  course_completion_certificate: (st) => displayCertificate('course_completion_certificate', st, { heading: '{{doc.title}}', lead: 'This is to certify that', name: '{{student.name}}', citation: '{{award.citation}}', footnote: 'Awarded on {{doc.issuedOn}}  ·  {{institution.city}}', signers: ['principal', 'registrar'] }),
  generic_certificate: (st) => displayCertificate('generic_certificate', st, { heading: '{{award.title}}', lead: 'This certificate is proudly presented to', name: '{{award.recipient}}', citation: '{{award.citation}}', footnote: '{{award.event}}  ·  {{award.date}}', signers: ['principal', 'controller'] }),
  salary_slip: salarySlip,
  offer_letter: (st) => letter('offer_letter', st),
  appointment_letter: (st) => letter('appointment_letter', st),
  report_cover: reportCover,
};
