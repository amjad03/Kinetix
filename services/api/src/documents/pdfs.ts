import { A4, Pdf } from '../common/pdf-doc.js';

export interface AssetTag {
  tag: string;
  name: string;
  location: string;
  /** What a scan reads (`kinetix://asset/<tag>`). */
  qr: string;
}

const TAG_W = 170;
const TAG_H = 92;

/** Asset tags on A4, three across and eight down: the tag large, the name and place, and the QR that opens the asset. */
export function assetTagsPdf(institution: string, tags: AssetTag[]): Buffer {
  const pdf = new Pdf('Asset tags');
  const perPage = 24;
  const left = (A4.w - 3 * TAG_W - 20) / 2;
  if (!tags.length) pdf.addPage();
  tags.forEach((a, i) => {
    if (i % perPage === 0) pdf.addPage();
    const slot = i % perPage;
    const x = left + (slot % 3) * (TAG_W + 10);
    const y = 30 + Math.floor(slot / 3) * (TAG_H + 8);
    pdf.rect(x, y, TAG_W, TAG_H, { stroke: '#1f3a5f', lineWidth: 0.8 });
    pdf.text(institution.slice(0, 30), x + 8, y + 14, { size: 6.5, color: '#555555' });
    pdf.text(a.tag, x + 8, y + 36, { size: 13, bold: true });
    pdf.text(a.name.slice(0, 24), x + 8, y + 52, { size: 8 });
    if (a.location) pdf.text(a.location.slice(0, 24), x + 8, y + 64, { size: 7, color: '#555555' });
    pdf.qr(a.qr, x + TAG_W - 80, y + 10, 72);
  });
  return pdf.build();
}
