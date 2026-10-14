import { zip } from './zip.js';

/**
 * A minimal XLSX (Office Open XML) writer for report exports: one sheet with a styled title block,
 * a bold filled header row that stays frozen with an auto-filter, typed cells with number formats
 * (rupees, percents, dates), tinted cells for conditional formatting and a bold totals row.
 * Text goes in as inline strings, so nothing a cell holds is ever evaluated as a formula.
 */

export type XlsxType = 'text' | 'int' | 'number' | 'money' | 'percent' | 'date' | 'bool';
export type Tone = 'red' | 'amber' | 'green' | 'blue' | 'grey';
export interface XlsxCell {
  v: string | number | boolean | null;
  type: XlsxType;
  tone?: Tone | null;
  toneStyle?: 'fill' | 'text';
}
export interface XlsxSheet {
  name: string;
  /** Lines above the table: the first is the title, the second the report name, the rest notes. */
  heading: string[];
  header: string[];
  types: XlsxType[];
  rows: XlsxCell[][];
  totals?: XlsxCell[] | null;
}

const esc = (s: string) =>
  s
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const colName = (i: number): string => {
  let s = '';
  let n = i + 1;
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
};

/** Days since 1899-12-30, Excel's date serial. */
const serial = (d: string) => (Date.parse(`${d}T00:00:00Z`) - Date.parse('1899-12-30T00:00:00Z')) / 86400_000;

const TONE_FILL: Record<Tone, string> = { red: 'FFFDE2E1', amber: 'FFFEF3C7', green: 'FFDCFCE7', blue: 'FFDBEAFE', grey: 'FFF1F5F9' };
const TONE_TEXT: Record<Tone, string> = { red: 'FFB91C1C', amber: 'FFB45309', green: 'FF15803D', blue: 'FF1D4ED8', grey: 'FF475569' };
const NUMFMT: Record<XlsxType, number> = { text: 0, bool: 0, int: 3, number: 4, money: 164, percent: 165, date: 166 };

/** Cell styles are registered as they are used and written out once. */
class Styles {
  private readonly fonts = ['<font><sz val="10"/><name val="Calibri"/></font>', '<font><b/><sz val="10"/><name val="Calibri"/></font>', '<font><b/><sz val="14"/><name val="Calibri"/></font>', '<font><b/><sz val="12"/><name val="Calibri"/></font>', '<font><i/><sz val="9"/><color rgb="FF475569"/><name val="Calibri"/></font>'];
  private readonly fills = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>', '<fill><patternFill patternType="solid"><fgColor rgb="FFE2E8F0"/><bgColor indexed="64"/></patternFill></fill>'];
  private readonly xfs: string[] = ['<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'];
  private readonly index = new Map<string, number>();

  private font(xml: string): number {
    const i = this.fonts.indexOf(xml);
    return i >= 0 ? i : this.fonts.push(xml) - 1;
  }
  private fill(rgb: string): number {
    const xml = `<fill><patternFill patternType="solid"><fgColor rgb="${rgb}"/><bgColor indexed="64"/></patternFill></fill>`;
    const i = this.fills.indexOf(xml);
    return i >= 0 ? i : this.fills.push(xml) - 1;
  }

  /** kind: title | subtitle | note | header | cell | total. */
  get(kind: 'title' | 'subtitle' | 'note' | 'header' | 'cell' | 'total', type: XlsxType = 'text', tone?: Tone | null, toneStyle: 'fill' | 'text' = 'fill'): number {
    const key = `${kind}|${type}|${tone ?? ''}|${toneStyle}`;
    const hit = this.index.get(key);
    if (hit !== undefined) return hit;
    let fontId = 0;
    let fillId = 0;
    let border = 0;
    if (kind === 'title') fontId = 2;
    if (kind === 'subtitle') fontId = 3;
    if (kind === 'note') fontId = 4;
    if (kind === 'header') {
      fontId = 1;
      fillId = 2;
      border = 1;
    }
    if (kind === 'total') {
      fontId = 1;
      border = 2;
    }
    if (tone && toneStyle === 'fill') fillId = this.fill(TONE_FILL[tone]);
    if (tone && toneStyle === 'text') fontId = this.font(`<font><b/><sz val="10"/><color rgb="${TONE_TEXT[tone]}"/><name val="Calibri"/></font>`);
    const right = kind !== 'header' && (type === 'int' || type === 'number' || type === 'money' || type === 'percent');
    const align = kind === 'header' ? '<alignment vertical="center" wrapText="1"/>' : right ? '<alignment horizontal="right"/>' : '';
    const numFmt = kind === 'cell' || kind === 'total' ? NUMFMT[type] : 0;
    this.xfs.push(`<xf numFmtId="${numFmt}" fontId="${fontId}" fillId="${fillId}" borderId="${border}" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="${align ? 1 : 0}">${align}</xf>`);
    this.index.set(key, this.xfs.length - 1);
    return this.xfs.length - 1;
  }

  xml(): string {
    return (
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<numFmts count="3"><numFmt numFmtId="164" formatCode="&quot;₹&quot;#,##0.00"/><numFmt numFmtId="165" formatCode="0.0&quot;%&quot;"/><numFmt numFmtId="166" formatCode="dd\\-mmm\\-yyyy"/></numFmts>' +
      `<fonts count="${this.fonts.length}">${this.fonts.join('')}</fonts>` +
      `<fills count="${this.fills.length}">${this.fills.join('')}</fills>` +
      '<borders count="3"><border><left/><right/><top/><bottom/><diagonal/></border><border><left/><right/><top/><bottom style="thin"><color rgb="FF94A3B8"/></bottom><diagonal/></border><border><left/><right/><top style="thin"><color rgb="FF0F172A"/></top><bottom style="double"><color rgb="FF0F172A"/></bottom><diagonal/></border></borders>' +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      `<cellXfs count="${this.xfs.length}">${this.xfs.join('')}</cellXfs>` +
      '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>'
    );
  }
}

function cellXml(ref: string, c: XlsxCell, style: number, yes: string, no: string): string {
  const v = c.v;
  if (v === null || v === undefined || v === '') return `<c r="${ref}" s="${style}"/>`;
  if (c.type === 'bool' || typeof v === 'boolean') return `<c r="${ref}" s="${style}" t="inlineStr"><is><t>${esc(v === true || v === 'true' ? yes : v === false || v === 'false' ? no : String(v))}</t></is></c>`;
  if (c.type === 'date' && typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return `<c r="${ref}" s="${style}"><v>${serial(v)}</v></c>`;
  if (typeof v === 'number' && Number.isFinite(v)) return `<c r="${ref}" s="${style}"><v>${c.type === 'money' ? v / 100 : v}</v></c>`;
  return `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${esc(String(v))}</t></is></c>`;
}

/** Builds the workbook. `yes` and `no` word yes/no cells in the reader's language. */
export function buildXlsx(sheet: XlsxSheet, opts: { yes: string; no: string; creator: string; at: Date }): Buffer {
  const styles = new Styles();
  const ncols = Math.max(1, sheet.header.length);
  const lastCol = colName(ncols - 1);
  const rows: string[] = [];
  let r = 0;
  sheet.heading.forEach((line, i) => {
    r++;
    const kind = i === 0 ? 'title' : i === 1 ? 'subtitle' : 'note';
    rows.push(`<row r="${r}"${i === 0 ? ' ht="22" customHeight="1"' : ''}><c r="A${r}" s="${styles.get(kind)}" t="inlineStr"><is><t xml:space="preserve">${esc(line)}</t></is></c></row>`);
  });
  r++; // a blank line before the table
  const headerRow = ++r;
  rows.push(`<row r="${headerRow}" ht="30" customHeight="1">${sheet.header.map((h, i) => `<c r="${colName(i)}${headerRow}" s="${styles.get('header')}" t="inlineStr"><is><t xml:space="preserve">${esc(h)}</t></is></c>`).join('')}</row>`);
  for (const row of sheet.rows) {
    r++;
    rows.push(`<row r="${r}">${row.map((c, i) => cellXml(`${colName(i)}${r}`, c, styles.get('cell', sheet.types[i] ?? c.type, c.tone, c.toneStyle), opts.yes, opts.no)).join('')}</row>`);
  }
  if (sheet.totals) {
    r++;
    rows.push(`<row r="${r}">${sheet.totals.map((c, i) => cellXml(`${colName(i)}${r}`, c, styles.get('total', sheet.types[i] ?? c.type), opts.yes, opts.no)).join('')}</row>`);
  }
  const lastDataRow = sheet.totals ? r - 1 : r;

  // Column widths from the longest value shown (capped), so the sheet opens readable.
  const widths = sheet.header.map((h, i) => {
    let w = Math.min(40, h.length + 2);
    for (const row of sheet.rows.slice(0, 500)) {
      const c = row[i];
      const s = c?.v === null || c?.v === undefined ? '' : c.type === 'money' && typeof c.v === 'number' ? (c.v / 100).toFixed(2) + '   ' : String(c.v);
      w = Math.max(w, Math.min(60, s.length + 2));
    }
    return Math.max(8, w);
  });
  const merges = sheet.heading.map((_, i) => `<mergeCell ref="A${i + 1}:${lastCol}${i + 1}"/>`).join('');
  const sheetXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${headerRow}" topLeftCell="A${headerRow + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` +
    '<sheetFormatPr defaultRowHeight="15"/>' +
    `<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>` +
    `<sheetData>${rows.join('')}</sheetData>` +
    (sheet.rows.length ? `<autoFilter ref="A${headerRow}:${lastCol}${lastDataRow}"/>` : '') +
    (merges && ncols > 1 ? `<mergeCells count="${sheet.heading.length}">${merges}</mergeCells>` : '') +
    '<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/>' +
    '<pageSetup orientation="landscape" paperSize="9" fitToWidth="1" fitToHeight="0"/>' +
    '<headerFooter><oddFooter>&amp;L&amp;8&amp;F&amp;R&amp;8&amp;P / &amp;N</oddFooter></headerFooter>' +
    '</worksheet>';

  const sheetName = esc(sheet.name.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || 'Report');
  const files = [
    {
      name: '[Content_Types].xml',
      data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>',
    },
    { name: '_rels/.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>' },
    {
      name: 'docProps/core.xml',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${esc(sheet.heading[1] ?? sheet.name)}</dc:title><dc:creator>${esc(opts.creator)}</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${opts.at.toISOString().slice(0, 19)}Z</dcterms:created></cp:coreProperties>`,
    },
    { name: 'xl/workbook.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${sheetName}" sheetId="1" r:id="rId1"/></sheets>${sheet.rows.length ? `<definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">'${sheetName.replace(/'/g, "''")}'!$A$${headerRow}:$${lastCol}$${lastDataRow}</definedName><definedName name="_xlnm.Print_Titles" localSheetId="0">'${sheetName.replace(/'/g, "''")}'!$${headerRow}:$${headerRow}</definedName></definedNames>` : ''}</workbook>` },
    { name: 'xl/_rels/workbook.xml.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>' },
    { name: 'xl/worksheets/sheet1.xml', data: sheetXml },
    { name: 'xl/styles.xml', data: styles.xml() },
  ];
  return zip(files.map((f) => ({ name: f.name, data: Buffer.from(f.data, 'utf8') })), opts.at, true);
}
