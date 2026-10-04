/**
 * A small RFC 4180 CSV reader for the bulk import: quoted fields (with "" for a quote and line
 * breaks inside quotes), CRLF or LF line ends, a UTF-8 byte-order mark (Excel's "CSV UTF-8"), and
 * comment lines starting with `#` (the templates explain their columns that way). Blank lines are
 * skipped. Each record keeps the line it starts on, so errors point at the line people see.
 */

export interface CsvRecord {
  /** 1-based line number in the file where the record starts. */
  line: number;
  cells: string[];
}

export function parseCsv(text: string): CsvRecord[] {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const out: CsvRecord[] = [];
  let line = 1;
  let i = 0;
  while (i < src.length) {
    const start = line;
    // A comment line: '#' as the first character of a record.
    if (src[i] === '#') {
      while (i < src.length && src[i] !== '\n') i++;
      i++;
      line++;
      continue;
    }
    const cells: string[] = [];
    let cell = '';
    let quoted = false;
    let ended = false;
    while (i < src.length && !ended) {
      const c = src[i];
      if (quoted) {
        if (c === '"') {
          if (src[i + 1] === '"') {
            cell += '"';
            i += 2;
          } else {
            quoted = false;
            i++;
          }
        } else {
          if (c === '\n') line++;
          cell += c;
          i++;
        }
      } else if (c === '"' && cell.trim() === '') {
        quoted = true;
        cell = '';
        i++;
      } else if (c === ',') {
        cells.push(cell);
        cell = '';
        i++;
      } else if (c === '\r' && src[i + 1] === '\n') {
        i += 2;
        ended = true;
      } else if (c === '\n' || c === '\r') {
        i++;
        ended = true;
      } else {
        cell += c;
        i++;
      }
    }
    cells.push(cell);
    if (ended) line++;
    const trimmed = cells.map((x) => x.trim());
    if (trimmed.some((x) => x !== '')) out.push({ line: start, cells: trimmed });
  }
  return out;
}

/** A header as a key: "Subject code", "subject_code" and "SUBJECT-CODE" are all `subject_code`. */
export function headerKey(h: string): string {
  return h
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/** Decodes an upload as UTF-8, refusing anything that is not (an Excel "CSV" in ANSI, say). */
export function decodeUtf8(bytes: Uint8Array): string | null {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

/** Records as objects keyed by header, plus the header keys. The first record is the header. */
export function readTable(text: string): { headers: string[]; rows: { line: number; get: (key: string) => string }[] } {
  const records = parseCsv(text);
  if (!records.length) return { headers: [], rows: [] };
  const headers = records[0].cells.map(headerKey);
  const rows = records.slice(1).map((r) => ({
    line: r.line,
    get: (key: string) => {
      const at = headers.indexOf(key);
      return at < 0 ? '' : (r.cells[at] ?? '').trim();
    },
  }));
  return { headers, rows };
}
