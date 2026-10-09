import { inflateRawSync, inflateSync } from 'node:zlib';

/** Text pulled out of an uploaded syllabus, with the file type found from its first bytes. */
export interface ExtractedText {
  kind: 'pdf' | 'docx';
  text: string;
}

export class UnsupportedSyllabusFile extends Error {}

export function extractSyllabusText(data: Buffer): ExtractedText {
  if (data.subarray(0, 5).toString('latin1') === '%PDF-') return { kind: 'pdf', text: pdfText(data) };
  if (data[0] === 0x50 && data[1] === 0x4b) return { kind: 'docx', text: docxText(data) };
  throw new UnsupportedSyllabusFile('Upload the syllabus as a PDF or a Word (.docx) file');
}

// ---- DOCX: a zip whose word/document.xml holds the paragraphs ----

/** Reads one entry of a zip through its central directory (stored or deflated). */
export function zipEntry(zip: Buffer, name: string): Buffer | undefined {
  let eocd = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 65_557); i--) {
    if (zip.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return undefined;
  const count = zip.readUInt16LE(eocd + 10);
  let p = zip.readUInt32LE(eocd + 16);
  for (let n = 0; n < count && p + 46 <= zip.length && zip.readUInt32LE(p) === 0x02014b50; n++) {
    const method = zip.readUInt16LE(p + 10);
    const size = zip.readUInt32LE(p + 20);
    const nameLen = zip.readUInt16LE(p + 28);
    const extraLen = zip.readUInt16LE(p + 30);
    const commentLen = zip.readUInt16LE(p + 32);
    const local = zip.readUInt32LE(p + 42);
    if (zip.toString('utf8', p + 46, p + 46 + nameLen) === name) {
      const dataStart = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
      const raw = zip.subarray(dataStart, dataStart + size);
      return method === 0 ? raw : inflateRawSync(raw, { maxOutputLength: 20_000_000 });
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  return undefined;
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function docxText(zip: Buffer): string {
  const xml = zipEntry(zip, 'word/document.xml');
  if (!xml) throw new UnsupportedSyllabusFile('This Word file has no readable text');
  return xml
    .toString('utf8')
    .replace(/<w:tab\/>/g, '\t')
    .replace(/<w:(?:br|cr)\/>/g, '\n')
    .replace(/<\/w:p>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&(#x?[0-9a-fA-F]+|[a-z]+);/g, (m, e: string) => {
      if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
      return ENTITIES[e] ?? m;
    })
    .replace(/[ \t]+\n/g, '\n');
}

// ---- PDF: inflate content streams and read the text-showing operators ----

function pdfString(raw: string): string {
  return raw.replace(/\\([nrtbf()\\]|[0-7]{1,3}|\r?\n)/g, (_, c: string) => {
    if (c === 'n') return '\n';
    if (c === 'r' || c === 't' || c === 'b' || c === 'f') return ' ';
    if (/^[0-7]+$/.test(c)) return String.fromCharCode(parseInt(c, 8));
    if (c[0] === '\r' || c === '\n') return '';
    return c;
  });
}

function streamText(content: string): string {
  const out: string[] = [];
  // Strings, arrays of strings and the operators that move to a new line.
  const re = /\[((?:[^\]\\]|\\.)*)\]\s*TJ|\(((?:[^()\\]|\\.)*)\)\s*(?:Tj|'|")|(T\*|\bTd\b|\bTD\b|\bTm\b|\bET\b)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content))) {
    if (m[1] !== undefined) {
      let line = '';
      for (const part of m[1].matchAll(/\(((?:[^()\\]|\\.)*)\)|(-?\d+(?:\.\d+)?)/g)) {
        if (part[1] !== undefined) line += pdfString(part[1]);
        else if (Number(part[2]) < -200) line += ' ';
      }
      out.push(line);
    } else if (m[2] !== undefined) out.push(pdfString(m[2]));
    else out.push('\n');
  }
  return out.join('').replace(/[ \t]*\n[ \t]*/g, '\n').replace(/\n{3,}/g, '\n\n');
}

function pdfText(data: Buffer): string {
  const s = data.toString('latin1');
  const pages: string[] = [];
  const re = /<<((?:(?!>>)[\s\S])*)>>\s*stream\r?\n/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    const start = re.lastIndex;
    const end = s.indexOf('endstream', start);
    if (end < 0) break;
    let body = Buffer.from(s.slice(start, end), 'latin1');
    if (/FlateDecode/.test(m[1])) {
      try {
        body = inflateSync(body, { maxOutputLength: 20_000_000 });
      } catch {
        continue;
      }
    } else if (/\/(?:Image|XObject|Font|FontFile)/.test(m[1])) continue;
    const text = streamText(body.toString('latin1'));
    if (text.trim()) pages.push(text.trim());
    re.lastIndex = end;
  }
  return pages.join('\n\n');
}
