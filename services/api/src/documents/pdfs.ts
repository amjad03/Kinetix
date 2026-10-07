import { A4, Pdf } from '../common/pdf-doc.js';

/** An issued certificate on A4: border, institution, title, text, signature line and the QR to verify it. */
export function certificatePdf(c: { institution: string; title: string; body: string; serialNo: string; issuedOn: string; verifyUrl: string; revoked: boolean }): Buffer {
  const pdf = new Pdf(`${c.title} ${c.serialNo}`).addPage();
  pdf.rect(28, 28, A4.w - 56, A4.h - 56, { stroke: '#1f3a5f', lineWidth: 2 }).rect(36, 36, A4.w - 72, A4.h - 72, { stroke: '#1f3a5f', lineWidth: 0.5 });
  pdf.text(c.institution, A4.w / 2, 110, { size: 20, bold: true, align: 'center', color: '#1f3a5f' });
  pdf.text(c.title.toUpperCase(), A4.w / 2, 170, { size: 16, bold: true, align: 'center' });
  pdf.line(A4.w / 2 - 70, 180, A4.w / 2 + 70, 180, { width: 1, color: '#1f3a5f' });
  pdf.text(`Serial No. ${c.serialNo}`, 70, 220, { size: 10 }).text(`Date: ${c.issuedOn}`, A4.w - 70, 220, { size: 10, align: 'right' });
  pdf.paragraph(c.body, 70, 280, A4.w - 140, { size: 12, leading: 20 });
  pdf.line(A4.w - 220, A4.h - 140, A4.w - 70, A4.h - 140);
  pdf.text('Principal', A4.w - 145, A4.h - 124, { size: 10, align: 'center' });
  pdf.qr(c.verifyUrl, 62, A4.h - 190, 100);
  pdf.text('Scan to verify this certificate', 112, A4.h - 80, { size: 8, align: 'center', color: '#555555' });
  if (c.revoked) pdf.text('REVOKED', A4.w / 2, A4.h / 2, { size: 72, bold: true, align: 'center', color: '#d9a0a0' });
  return pdf.build();
}

export interface CardData {
  institution: string;
  kind: 'student' | 'staff';
  name: string;
  lines: [string, string][];
  qrUrl: string;
}

const CARD_W = 242.6;
const CARD_H = 153;

function drawCard(pdf: Pdf, x: number, y: number, c: CardData) {
  pdf.rect(x, y, CARD_W, CARD_H, { stroke: '#1f3a5f', lineWidth: 0.8 });
  pdf.rect(x, y, CARD_W, 28, { fill: '#1f3a5f' });
  pdf.text(c.institution, x + CARD_W / 2, y + 18, { size: c.institution.length > 34 ? 8 : 10, bold: true, align: 'center', color: '#ffffff' });
  pdf.text(c.kind === 'student' ? 'STUDENT IDENTITY CARD' : 'STAFF IDENTITY CARD', x + 10, y + 44, { size: 7, color: '#555555' });
  pdf.text(c.name, x + 10, y + 62, { size: 12, bold: true });
  c.lines.forEach(([k, v], i) => pdf.text(`${k}: `, x + 10, y + 82 + i * 14, { size: 8, color: '#555555' }).text(v, x + 10 + 48, y + 82 + i * 14, { size: 8.5, bold: true }));
  pdf.qr(c.qrUrl, x + CARD_W - 78, y + CARD_H - 82, 70);
}

/** Cards on A4, two across and four down, ready to print and cut. */
export function idCardsPdf(cards: CardData[]): Buffer {
  const pdf = new Pdf('ID cards');
  const perPage = 8;
  const left = (A4.w - 2 * CARD_W - 10) / 2;
  if (!cards.length) pdf.addPage();
  cards.forEach((c, i) => {
    if (i % perPage === 0) pdf.addPage();
    const slot = i % perPage;
    drawCard(pdf, left + (slot % 2) * (CARD_W + 10), 40 + Math.floor(slot / 2) * (CARD_H + 10), c);
  });
  return pdf.build();
}

export interface ReceiptData {
  institution: string;
  receiptNo: string;
  studentName: string;
  rollNo: string;
  className: string;
  invoiceTitle: string;
  amountPaise: number;
  balancePaise: number;
  method: string;
  reference: string | null;
  paidOn: string;
}

const money = (paise: number) => (paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function feeReceiptPdf(r: ReceiptData): Buffer {
  const pdf = new Pdf(`Fee receipt ${r.receiptNo}`).addPage();
  pdf.text(r.institution, A4.w / 2, 70, { size: 18, bold: true, align: 'center', color: '#1f3a5f' });
  pdf.text('FEE RECEIPT', A4.w / 2, 100, { size: 12, bold: true, align: 'center' });
  pdf.line(50, 112, A4.w - 50, 112, { width: 1 });
  const rows: [string, string][] = [
    ['Receipt No.', r.receiptNo],
    ['Date', r.paidOn],
    ['Student', r.studentName],
    ['Class', `${r.className} (Roll ${r.rollNo})`],
    ['Towards', r.invoiceTitle],
    ['Payment mode', r.method.replace('_', ' ')],
    ['Reference', r.reference ?? '-'],
  ];
  rows.forEach(([k, v], i) => pdf.text(k, 60, 145 + i * 22, { size: 10, color: '#555555' }).text(v, 180, 145 + i * 22, { size: 11, bold: true }));
  pdf.rect(50, 310, A4.w - 100, 36, { fill: '#e8f5ee', stroke: '#9ccfb2' });
  pdf.text('Amount received', 62, 333, { size: 12, bold: true }).text(`Rs. ${money(r.amountPaise)}`, A4.w - 62, 333, { size: 12, bold: true, align: 'right' });
  pdf.text(`Balance on this fee after this payment: Rs. ${money(r.balancePaise)}`, 60, 370, { size: 10, color: '#555555' });
  pdf.text('This is a computer-generated receipt and needs no signature.', A4.w / 2, A4.h - 50, { size: 8, align: 'center', color: '#888888' });
  return pdf.build();
}
