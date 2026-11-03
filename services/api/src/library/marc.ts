/**
 * MARC21 records (ISO 2709 exchange files and MARCXML, as Koha, DELNET and publishers export them) and ISBNs.
 * Pure functions: the catalogue import and the ISBN check use them.
 */

/** A MARC record as tag → the field's values: control fields as they are, data fields as "$a … $b …". */
export type MarcRecord = Record<string, string[]>;

const FT = 0x1e; // field terminator
const RT = 0x1d; // record terminator
const SF = 0x1f; // subfield delimiter

/** Data field text "$a Title $b sub" from its raw bytes (after the two indicators). */
function subfieldsText(raw: string): string {
  return raw
    .split(String.fromCharCode(SF))
    .slice(1)
    .filter((s) => s.length > 0)
    .map((s) => `$${s[0]} ${s.slice(1).trim()}`)
    .join(' ');
}

/** Reads every record of an ISO 2709 file. A record that does not parse is skipped. */
export function parseIso2709(buf: Buffer): MarcRecord[] {
  const out: MarcRecord[] = [];
  let at = 0;
  while (at + 24 <= buf.length) {
    const len = Number(buf.subarray(at, at + 5).toString('latin1'));
    if (!Number.isInteger(len) || len < 25 || at + len > buf.length) {
      // Not a record length: move to the next record terminator, if any.
      const next = buf.indexOf(RT, at);
      if (next < 0) break;
      at = next + 1;
      continue;
    }
    const rec = buf.subarray(at, at + len);
    at += len;
    while (at < buf.length && (buf[at] === 0x0a || buf[at] === 0x0d)) at++;
    const base = Number(rec.subarray(12, 17).toString('latin1'));
    if (!Number.isInteger(base) || base < 25 || base > rec.length) continue;
    const fields: MarcRecord = { LDR: [rec.subarray(0, 24).toString('latin1')] };
    for (let d = 24; d + 12 <= base - 1; d += 12) {
      const entry = rec.subarray(d, d + 12).toString('latin1');
      const tag = entry.slice(0, 3);
      const flen = Number(entry.slice(3, 7));
      const start = Number(entry.slice(7, 12));
      if (!/^\d{3}$/.test(tag) || !Number.isInteger(flen) || !Number.isInteger(start)) continue;
      let data = rec.subarray(base + start, base + start + flen);
      if (data[data.length - 1] === FT) data = data.subarray(0, -1);
      const text = data.toString('utf8');
      const value = tag < '010' ? text : subfieldsText(text.slice(2));
      (fields[tag] ??= []).push(value);
    }
    out.push(fields);
  }
  return out;
}

const XML_ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const unescapeXml = (s: string) => s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e: string) => (e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : (XML_ENTITIES[e] ?? m)));

/** Reads every record of a MARCXML document (with or without the marc: prefix). */
export function parseMarcXml(xml: string): MarcRecord[] {
  const out: MarcRecord[] = [];
  const clean = xml.replace(/<(\/?)marc:/g, '<$1');
  for (const m of clean.matchAll(/<record\b[^>]*>([\s\S]*?)<\/record>/g)) {
    const body = m[1];
    const fields: MarcRecord = {};
    const leader = /<leader>([\s\S]*?)<\/leader>/.exec(body);
    if (leader) fields.LDR = [unescapeXml(leader[1])];
    for (const c of body.matchAll(/<controlfield\s+tag="(\d{3})"[^>]*>([\s\S]*?)<\/controlfield>/g)) (fields[c[1]] ??= []).push(unescapeXml(c[2]));
    for (const d of body.matchAll(/<datafield\s+tag="(\d{3})"[^>]*>([\s\S]*?)<\/datafield>/g)) {
      const subs = [...d[2].matchAll(/<subfield\s+code="(.)"[^>]*>([\s\S]*?)<\/subfield>/g)].map((s) => `$${s[1]} ${unescapeXml(s[2]).trim()}`);
      (fields[d[1]] ??= []).push(subs.join(' '));
    }
    out.push(fields);
  }
  return out;
}

/** Either kind of file. */
export function parseMarc(buf: Buffer): MarcRecord[] {
  const head = buf.subarray(0, 200).toString('utf8').trimStart();
  return head.startsWith('<') ? parseMarcXml(buf.toString('utf8')) : parseIso2709(buf);
}

/** The subfields of a "$a … $b …" value, by code. */
export function subfields(value: string): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const m of value.matchAll(/\$(\w) ([^$]*)/g)) (out[m[1]] ??= []).push(m[2].trim());
  return out;
}

const first = (rec: MarcRecord, tag: string, code: string): string => {
  for (const v of rec[tag] ?? []) {
    const s = subfields(v)[code]?.[0];
    if (s) return s;
  }
  return '';
};
/** Trailing ISBD punctuation (" /", " :", " ;", ",", ".") off a value. */
const tidy = (s: string) => s.replace(/\s*[/:;,=]\s*$/, '').replace(/\.\s*$/, (m) => (/\b[A-Z]\.$/.test(s) ? m : '')).trim();

export interface MarcBook {
  title: string;
  author: string;
  isbn: string;
  publisher: string;
  edition: string;
  pubYear: number | null;
  ddc: string;
  callNo: string;
  subject: string;
  keywords: string;
  pages: number | null;
  language: string;
}

/** The catalogue fields of a MARC21 bibliographic record. */
export function marcToBook(rec: MarcRecord): MarcBook {
  const title = [first(rec, '245', 'a'), first(rec, '245', 'b')].map(tidy).filter(Boolean).join(': ');
  const author = tidy(first(rec, '100', 'a') || first(rec, '110', 'a') || first(rec, '700', 'a'));
  const isbns = (rec['020'] ?? []).flatMap((v) => subfields(v).a ?? []).map((s) => normaliseIsbn(s.split(/\s/)[0])).filter((x): x is string => !!x);
  const yearText = first(rec, '264', 'c') || first(rec, '260', 'c') || (rec['008']?.[0]?.slice(7, 11) ?? '');
  const year = /(\d{4})/.exec(yearText)?.[1];
  const pages = /(\d+)\s*p/.exec(first(rec, '300', 'a'))?.[1];
  const ddc = first(rec, '082', 'a').replace(/\//g, '');
  const local = [first(rec, '090', 'a') || first(rec, '092', 'a') || first(rec, '050', 'a'), first(rec, '090', 'b') || first(rec, '092', 'b') || first(rec, '050', 'b')].filter(Boolean).join(' ');
  const subjects = (rec['650'] ?? []).map((v) => tidy(subfields(v).a?.[0] ?? '')).filter(Boolean);
  const lang = first(rec, '041', 'a') || (rec['008']?.[0]?.slice(35, 38).trim() ?? '');
  return {
    title,
    author,
    isbn: isbns[0] ?? '',
    publisher: tidy(first(rec, '264', 'b') || first(rec, '260', 'b')),
    edition: tidy(first(rec, '250', 'a')),
    pubYear: year ? Number(year) : null,
    ddc,
    callNo: local || (ddc ? callNumber(ddc, author) : ''),
    subject: subjects[0] ?? '',
    keywords: subjects.join(', '),
    pages: pages ? Number(pages) : null,
    language: lang,
  };
}

/** The holdings of a record as Koha exports them (952: $p barcode, $c shelf, $g price, $o call number). */
export function marcItems(rec: MarcRecord): { barcode: string; shelf: string; pricePaise: number; callNo: string }[] {
  return (rec['952'] ?? []).map((v) => {
    const f = subfields(v);
    const price = Number((f.g?.[0] ?? '').replace(/[^0-9.]/g, ''));
    return { barcode: (f.p?.[0] ?? '').slice(0, 60), shelf: (f.c?.[0] ?? '').slice(0, 40), pricePaise: Number.isFinite(price) ? Math.round(price * 100) : 0, callNo: f.o?.[0] ?? '' };
  });
}

/** A shelf mark from the DDC number and the first three letters of the author's surname ("657.95 GUP"). */
export function callNumber(ddc: string, author: string): string {
  return [ddc.trim(), authorMark(author)].filter(Boolean).join(' ');
}

/** The first three letters of the author's surname, in capitals (the book number under DDC, UDC and LCC). */
export function authorMark(author: string): string {
  const surname = (author.includes(',') ? author.split(',')[0] : (author.trim().split(/\s+/).pop() ?? '')).replace(/[^A-Za-z]/g, '');
  return surname.slice(0, 3).toUpperCase();
}

/**
 * The Colon Classification year of publication used in the book number: the century letter (K 1700s, L 1800s, M 1900s,
 * N 2000s, P 2100s) followed by the last two digits of the year, so 1998 is M98 and 2019 is N19.
 */
export function ccYear(year: number | null | undefined): string {
  if (!year || year < 1700 || year > 2199) return '';
  const letter = 'KLMNP'[Math.floor(year / 100) - 17];
  return `${letter}${String(year % 100).padStart(2, '0')}`;
}

export type ClassScheme = 'ddc' | 'cc' | 'udc' | 'lcc';
export const CLASS_SCHEMES: ClassScheme[] = ['ddc', 'cc', 'udc', 'lcc'];

/**
 * The call number of a title in its classification scheme: class number then book number. Under Colon Classification
 * the book number is the language number (if not the library's favoured language), the year code and the copy's
 * volume, e.g. "O111,3M8 N19"; under DDC, UDC and LCC it is the author mark, e.g. "657.95 MAH". A book number given by
 * the cataloguer is used as it is.
 */
export function callNumberFor(scheme: string, classNumber: string, o: { author?: string; year?: number | null; bookNumber?: string } = {}): string {
  const cls = classNumber.trim();
  const book = o.bookNumber?.trim() || (scheme === 'cc' ? ccYear(o.year) : authorMark(o.author ?? ''));
  return [cls, book].filter(Boolean).join(' ');
}

/** Whether a class number looks right for its scheme (DDC: three digits and decimals; CC: a main class letter first). */
export function classNumberProblem(scheme: string, classNumber: string): string | null {
  const c = classNumber.trim();
  if (!c) return null;
  if (scheme === 'ddc' && !/^\d{3}(\.\d+)?$/.test(c)) return 'A DDC number is three digits, with decimals after a point (for example 657.95)';
  if (scheme === 'cc' && !/^[A-Z∆Δ1-9][A-Za-z0-9.,:;'&()"\- ]*$/.test(c)) return 'A Colon Classification number starts with its main class (for example O111,3M8 or L:4)';
  if (scheme === 'udc' && !/^\d[\d.:+/()=\-"' ]*$/.test(c)) return 'A UDC number starts with a digit (for example 657.1:004)';
  if (scheme === 'lcc' && !/^[A-Z]{1,3}\d/.test(c)) return 'An LCC number starts with one to three capital letters and a number (for example HF5635)';
  return null;
}

/** An ISBN-13 from an ISBN-10 or ISBN-13 (spaces and hyphens allowed), or null when the check digit is wrong. */
export function normaliseIsbn(raw: string): string | null {
  const s = raw.replace(/[\s-]/g, '').toUpperCase();
  if (/^\d{9}[\dX]$/.test(s)) {
    const sum = s.split('').reduce((t, c, i) => t + (c === 'X' ? 10 : Number(c)) * (10 - i), 0);
    if (sum % 11 !== 0) return null;
    const core = `978${s.slice(0, 9)}`;
    return core + isbn13Check(core);
  }
  if (/^97[89]\d{10}$/.test(s)) return isbn13Check(s.slice(0, 12)) === s[12] ? s : null;
  return null;
}

function isbn13Check(first12: string): string {
  const sum = first12.split('').reduce((t, c, i) => t + Number(c) * (i % 2 ? 3 : 1), 0);
  return String((10 - (sum % 10)) % 10);
}

/** Writes one MARC21 record as ISO 2709 (used to export the catalogue and in tests). */
export function writeIso2709(fields: { tag: string; value: string }[]): Buffer {
  const dataParts: Buffer[] = [];
  const dir: string[] = [];
  let pos = 0;
  for (const f of fields) {
    let body: Buffer;
    if (f.tag < '010') body = Buffer.from(f.value + String.fromCharCode(FT), 'utf8');
    else {
      const subs = [...f.value.matchAll(/\$(\w) ([^$]*)/g)].map((m) => String.fromCharCode(SF) + m[1] + m[2].trim()).join('');
      body = Buffer.from(`  ${subs}${String.fromCharCode(FT)}`, 'utf8');
    }
    dir.push(`${f.tag}${String(body.length).padStart(4, '0')}${String(pos).padStart(5, '0')}`);
    dataParts.push(body);
    pos += body.length;
  }
  const directory = Buffer.from(dir.join('') + String.fromCharCode(FT), 'latin1');
  const data = Buffer.concat(dataParts);
  const base = 24 + directory.length;
  const total = base + data.length + 1;
  const leader = `${String(total).padStart(5, '0')}nam a22${String(base).padStart(5, '0')} a 4500`;
  return Buffer.concat([Buffer.from(leader, 'latin1'), directory, data, Buffer.from([RT])]);
}
