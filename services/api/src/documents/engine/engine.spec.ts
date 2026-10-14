import { mkdirSync, writeFileSync } from 'node:fs';
import { DEFAULT_PALETTE, DOC_SAMPLES, DOC_TYPES, DocLayoutSchema, PRESET_STYLES } from '@kinetix/shared';
import { describe, expect, it } from 'vitest';
import { demoAssets } from '../demo-assets.js';
import { presetsFor } from '../presets/index.js';
import { code128, code128Values, CODE128_PATTERNS } from './barcode.js';
import { bind, indianMoney, indianWords, rupeesInWords } from './bindings.js';
import { decodePng, loadImage } from './images.js';
import { type RenderContext, renderCardSheets, renderPdf, renderSvg, svgToPng } from './index.js';
import { layoutText, subsetTrueType, loadFace } from './fonts.js';
import { mergePdfs } from './merge.js';
import { PdfWriter } from '../../common/pdf.js';

async function demoCtx(): Promise<RenderContext> {
  const a = await demoAssets();
  return {
    palette: DEFAULT_PALETTE,
    fonts: { heading: 'noto-serif', body: 'noto-sans' },
    images: { logo: loadImage(a.logo), logo_dark: loadImage(a.logoDark), emblem: loadImage(a.emblem), photo: loadImage(a.photo), 'signature:principal': loadImage(a.signatures.principal), 'signature:registrar': loadImage(a.signatures.registrar), 'signature:controller': loadImage(a.signatures.controller), 'signature:finance': loadImage(a.signatures.finance), 'signature:hr': loadImage(a.signatures.hr) },
    signatories: { principal: { name: 'Dr. Meenakshi Rao', designation: 'Principal' }, registrar: { name: 'Prof. S. Narayan', designation: 'Registrar' }, controller: { name: 'Dr. K. Prakash', designation: 'Controller of Examinations' }, finance: { name: 'Mr. Vinay Hegde', designation: 'Finance Officer' }, hr: { name: 'Ms. Lakshmi Iyer', designation: 'HR Manager' } },
  };
}

describe('document engine', () => {
  it('encodes Code 128 with the right checksum and module count', () => {
    for (const p of CODE128_PATTERNS.slice(0, 106)) expect(p.reduce((a, b) => a + b, 0)).toBe(11);
    expect(CODE128_PATTERNS[106].reduce((a, b) => a + b, 0)).toBe(13);
    // "PJJ123C" in code set B: start 104, checksum (104 + 48*1 + 42*2 + 42*3 + 17*4 + 18*5 + 19*6 + 35*7) % 103 = 879 % 103 = 55
    expect(code128Values('PJJ123C')).toEqual([104, 48, 42, 42, 17, 18, 19, 35, 55, 106]);
    expect(code128Values('2104')[0]).toBe(105);
    expect(code128('21BCA014').length % 2).toBe(1);
  });

  it('writes amounts the Indian way', () => {
    expect(indianMoney(1234567.5)).toBe('12,34,567.50');
    expect(indianWords(42500)).toBe('Forty-Two Thousand Five Hundred');
    expect(indianWords(10350075)).toBe('One Crore Three Lakh Fifty Thousand Seventy-Five');
    expect(rupeesInWords(1250.5)).toBe('Rupees One Thousand Two Hundred Fifty and Fifty Paise Only');
    expect(bind('{{a | money}} / {{a | words}} / {{n | upper}} / {{d | date}} / {{x | default:none}}', { a: 'Rs. 42,500.00', n: 'Asha', d: '2026-10-05', x: '' })).toBe('Rs. 42,500.00 / Rupees Forty-Two Thousand Five Hundred Only / ASHA / 5 October 2026 / none');
  });

  it('shapes Hindi and Kannada with their own faces and keeps Latin in the family face', () => {
    const r = layoutText('Name नाम ಹೆಸರು', { family: 'playfair', weight: 400, italic: false }, 12);
    expect(r.runs.map((x) => x.face.name)).toEqual(['PlayfairDisplay-Regular', 'NotoSerifDevanagari-Regular', 'NotoSerifKannada-Regular']);
    expect(r.width).toBeGreaterThan(40);
  });

  it('subsets a font to the glyphs used', () => {
    const f = loadFace('NotoSerif-Regular');
    const sub = subsetTrueType(f.data, [f.hbFont.nominalGlyph(65)!, f.hbFont.nominalGlyph(66)!]);
    expect(sub.length).toBeLessThan(f.data.length / 4);
    expect(sub.readUInt32BE(0)).toBe(0x00010000);
  });

  it('decodes PNG with transparency', async () => {
    const a = await demoAssets();
    const png = decodePng(a.logo)!;
    expect(png.w).toBe(400);
    expect(png.alpha).not.toBeNull();
  });

  it('validates and renders every preset of every document type', async () => {
    const ctx = await demoCtx();
    const out = process.env.WRITE_DOC_SAMPLES ? new URL('../../../../../docs/demo/samples/', import.meta.url) : null;
    if (out) mkdirSync(out, { recursive: true });
    for (const t of DOC_TYPES) {
      const presets = presetsFor(t);
      expect(presets.map((p) => p.style)).toEqual([...PRESET_STYLES]);
      for (const p of presets) {
        expect(DocLayoutSchema.safeParse(p.layout).success, p.id).toBe(true);
        const pdf = renderPdf(p.layout, [{ data: DOC_SAMPLES[t], ctx }], { title: `${t} ${p.style}` });
        expect(pdf.subarray(0, 8).toString('latin1'), p.id).toBe('%PDF-1.7');
        expect(pdf.length).toBeGreaterThan(5000);
        const svg = renderSvg(p.layout, { data: DOC_SAMPLES[t], ctx }, { animate: true, pxWidth: 300 });
        expect(svg.startsWith('<svg')).toBe(true);
        if (out && (t === 'student_id_card' || t === 'staff_id_card' || t === 'marks_card' || t === 'fee_receipt' || process.env.WRITE_DOC_SAMPLES === 'all')) {
          writeFileSync(new URL(`${t}-${p.style}.pdf`, out), pdf);
        }
      }
    }
  }, 180_000);

  it('imposes ID cards ten to an A4 sheet, fronts then backs', async () => {
    const ctx = await demoCtx();
    const [p] = presetsFor('student_id_card');
    const items = Array.from({ length: 12 }, () => ({ data: DOC_SAMPLES.student_id_card, ctx }));
    const pdf = renderCardSheets(p.layout, items, { title: 'Cards' });
    // 2 sheets x (front + back)
    expect((pdf.toString('latin1').match(/\/Type \/Page\b/g) ?? []).length).toBe(4);
    if (process.env.WRITE_DOC_SAMPLES) writeFileSync(new URL('../../../../../docs/demo/samples/student_id_card-sheet-a4.pdf', import.meta.url), pdf);
  }, 60_000);

  it('sets Hindi and Kannada text with embedded, shaped fonts', async () => {
    const ctx = { ...(await demoCtx()), fonts: { heading: 'playfair' as const, body: 'poppins' as const } };
    const [st] = presetsFor('student_id_card');
    const s = DOC_SAMPLES.student_id_card;
    const data = { ...s, institution: { ...(s.institution as object), name: 'सौंदर्य प्रबंधन एवं विज्ञान संस्थान' }, student: { ...(s.student as object), name: 'ಅನನ್ಯಾ ರಾಘವೇಂದ್ರ', className: 'बीसीए सेमेस्टर 6 - ए' } };
    const pdf = renderPdf(st.layout, [{ data, ctx }], { title: 'Indic' });
    const text = pdf.toString('latin1');
    expect(text).toMatch(/\/BaseFont \/[A-Z]{6}\+NotoSerifDevanagari-Bold/);
    expect(text).toMatch(/\/BaseFont \/[A-Z]{6}\+NotoSerifKannada-Bold/);
    if (process.env.WRITE_DOC_SAMPLES) writeFileSync(new URL('../../../../../docs/demo/samples/student_id_card-hindi-kannada.pdf', import.meta.url), pdf);
  });

  it('puts an engine cover page in front of a report from the older PDF writers', async () => {
    const ctx = await demoCtx();
    const [cover] = presetsFor('report_cover');
    const front = renderPdf(cover.layout, [{ data: DOC_SAMPLES.report_cover, ctx }], { title: 'Cover' });
    const legacy = new PdfWriter();
    legacy.text('Attendance register', { size: 14, bold: true });
    legacy.newPage();
    legacy.text('Second page');
    const merged = mergePdfs([front, legacy.build()]);
    const text = merged.toString('latin1');
    expect(text).toMatch(/\/Type \/Pages \/Kids \[\d+ 0 R \d+ 0 R \d+ 0 R\] \/Count 3/);
    expect(text).toContain('(Attendance register) Tj');
  });

  it('rasterises a preview', async () => {
    const ctx = await demoCtx();
    const [p] = presetsFor('marks_card');
    const png = await svgToPng(renderSvg(p.layout, { data: DOC_SAMPLES.marks_card, ctx }, { pxWidth: 240 }));
    expect(png.subarray(1, 4).toString('latin1')).toBe('PNG');
  });
});
