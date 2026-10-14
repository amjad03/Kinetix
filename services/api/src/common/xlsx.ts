import { inflateRawSync } from 'node:zlib';
import { zip } from '../analytics/zip.js';

/**
 * Minimal .xlsx support with no dependencies: reads the first sheet of a workbook into rows of text
 * (used by the data-migration importer) and writes one sheet of text and numbers (register exports).
 */

const xmlText = (s: string) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, '&');
const xmlEsc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** Files of a zip by name (stored or deflated entries only, which is all Excel writes). */
function unzip(buf: Buffer): Map<string, Buffer> {
  const out = new Map<string, Buffer>();
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65_557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('Not an Excel (.xlsx) file');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('Not an Excel (.xlsx) file');
    const method = buf.readUInt16LE(p + 10);
    const csize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    const dataStart = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const raw = buf.subarray(dataStart, dataStart + csize);
    if (name.startsWith('xl/') && (method === 0 || method === 8)) out.set(name, method === 0 ? Buffer.from(raw) : inflateRawSync(raw));
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

const colIndex = (ref: string) => {
  let n = 0;
  for (const ch of ref.replace(/[0-9]/g, '')) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
};

/** True for the first bytes of a zip file (an .xlsx), false for text. */
export const looksLikeXlsx = (b: Uint8Array) => b.length > 4 && b[0] === 0x50 && b[1] === 0x4b;

/** The first worksheet as rows of text; empty cells are empty strings. */
export function readXlsx(buf: Buffer): string[][] {
  const sheets = readXlsxSheets(buf);
  if (!sheets.length) throw new Error('The workbook has no sheet');
  return sheets[0].rows;
}

/** Every worksheet in workbook order, with its name, as rows of text. */
export function readXlsxSheets(buf: Buffer): { name: string; rows: string[][] }[] {
  const files = unzip(buf);
  const parts = [...files.keys()].filter((k) => /^xl\/worksheets\/sheet\d+\.xml$/.test(k)).sort((a, b) => Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0]));
  const shared: string[] = [];
  const ss = files.get('xl/sharedStrings.xml')?.toString('utf8');
  if (ss) for (const m of ss.matchAll(/<si>([\s\S]*?)<\/si>/g)) shared.push(xmlText([...m[1]!.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join('')));
  // Sheet names come from the workbook through its relationships; fall back to the part order.
  const wb = files.get('xl/workbook.xml')?.toString('utf8') ?? '';
  const rels = files.get('xl/_rels/workbook.xml.rels')?.toString('utf8') ?? '';
  const target = new Map([...rels.matchAll(/<Relationship\b[^>]*?Id="([^"]+)"[^>]*?Target="([^"]+)"/g)].map((m) => [m[1]!, `xl/${m[2]!.replace(/^\/?xl\//, '')}`]));
  const named = [...wb.matchAll(/<sheet\b[^>]*?name="([^"]+)"[^>]*?r:id="([^"]+)"/g)].map((m) => ({ name: xmlText(m[1]!), part: target.get(m[2]!) ?? '' })).filter((x) => files.has(x.part));
  const order = named.length ? named : parts.map((part, i) => ({ name: `Sheet${i + 1}`, part }));
  return order.map(({ name, part }) => ({ name, rows: sheetRows(files.get(part)!.toString('utf8'), shared) }));
}

function sheetRows(xml: string, shared: string[]): string[][] {
  const rows: string[][] = [];
  for (const rm of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const row: string[] = [];
    for (const cm of rm[1]!.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cm[1]!;
      const ref = /r="([A-Z]+\d+)"/.exec(attrs)?.[1];
      const type = /t="(\w+)"/.exec(attrs)?.[1];
      const body = cm[2] ?? '';
      let v = '';
      if (type === 's') v = shared[Number(/<v>(\d+)<\/v>/.exec(body)?.[1])] ?? '';
      else if (type === 'inlineStr') v = xmlText([...body.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join(''));
      else v = xmlText(/<v>([\s\S]*?)<\/v>/.exec(body)?.[1] ?? '');
      const at = ref ? colIndex(ref) : row.length;
      while (row.length < at) row.push('');
      row[at] = v;
    }
    rows.push(row);
  }
  return rows;
}

const colName = (i: number) => {
  let s = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
};

export interface WorkbookSheet {
  name: string;
  rows: (string | number | null)[][];
  /** The first row is bold and stays in view while scrolling. */
  header?: boolean;
  /** Column widths in characters. */
  widths?: number[];
  /** Drop-down lists: cells of `column` (0-based) from row 2 to `untilRow` accept only the values in `source` (a range such as `Lists!$A$2:$A$9`). */
  lists?: { column: number; source: string; untilRow?: number; prompt?: string }[];
  /** Hidden from the tabs (the lists behind drop-downs). */
  hidden?: boolean;
}

const cellXml = (v: string | number | null, ref: string, style: number) =>
  v === null || v === ''
    ? ''
    : typeof v === 'number'
      ? `<c r="${ref}"${style ? ` s="${style}"` : ''}><v>${v}</v></c>`
      : `<c r="${ref}" t="inlineStr"${style ? ` s="${style}"` : ''}><is><t xml:space="preserve">${xmlEsc(v)}</t></is></c>`;

/**
 * A workbook of several sheets with a bold, frozen header row, column widths and drop-down lists (Excel data
 * validation): the import templates. The first sheet is the one {@link readXlsx} reads back.
 */
export function writeWorkbook(sheets: WorkbookSheet[]): Buffer {
  const sheetXml = (s: WorkbookSheet) => {
    const rows = s.rows.map((r, ri) => `<row r="${ri + 1}">${r.map((v, ci) => cellXml(v, `${colName(ci)}${ri + 1}`, s.header && ri === 0 ? 1 : 0)).join('')}</row>`).join('');
    const view = s.header ? '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' : '';
    const cols = s.widths?.length ? `<cols>${s.widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>` : '';
    const dv = s.lists?.length
      ? `<dataValidations count="${s.lists.length}">${s.lists
          .map((l) => {
            const c = colName(l.column);
            const prompt = l.prompt ? ` showInputMessage="1" prompt="${xmlEsc(l.prompt.slice(0, 250))}"` : '';
            return `<dataValidation type="list" allowBlank="1" showErrorMessage="1"${prompt} sqref="${c}2:${c}${l.untilRow ?? 2000}"><formula1>${xmlEsc(l.source)}</formula1></dataValidation>`;
          })
          .join('')}</dataValidations>`
      : '';
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${view}${cols}<sheetData>${rows}</sheetData>${dv}</worksheet>`;
  };
  const overrides = sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('');
  const files: [string, string][] = [
    [
      '[Content_Types].xml',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${overrides}</Types>`,
    ],
    ['_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
    [
      'xl/workbook.xml',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s, i) => `<sheet name="${xmlEsc(s.name.slice(0, 31))}" sheetId="${i + 1}"${s.hidden ? ' state="hidden"' : ''} r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`,
    ],
    [
      'xl/_rels/workbook.xml.rels',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    ],
    [
      'xl/styles.xml',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE8F1F0"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>',
    ],
    ...sheets.map((s, i): [string, string] => [`xl/worksheets/sheet${i + 1}.xml`, sheetXml(s)]),
  ];
  return zip(files.map(([name, data]) => ({ name, data: Buffer.from(data, 'utf8') })));
}

/** A workbook with one sheet. Numbers stay numbers; everything else is text. */
export function writeXlsx(sheetName: string, rows: (string | number | null)[][]): Buffer {
  const sheetRows = rows
    .map((r, ri) => `<row r="${ri + 1}">${r.map((v, ci) => (v === null || v === '' ? '' : typeof v === 'number' ? `<c r="${colName(ci)}${ri + 1}"><v>${v}</v></c>` : `<c r="${colName(ci)}${ri + 1}" t="inlineStr"><is><t xml:space="preserve">${xmlEsc(v)}</t></is></c>`)).join('')}</row>`)
    .join('');
  const files = [
    ['[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>'],
    ['_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
    ['xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${xmlEsc(sheetName.slice(0, 31))}" sheetId="1" r:id="rId1"/></sheets></workbook>`],
    ['xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>'],
    ['xl/worksheets/sheet1.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheetRows}</sheetData></worksheet>`],
  ] as const;
  return zip(files.map(([name, data]) => ({ name, data: Buffer.from(data, 'utf8') })));
}
