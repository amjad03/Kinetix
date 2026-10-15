/**
 * Joins PDFs made by ZYNETIX's own writers (classic cross-reference tables, direct stream
 * lengths) into one file: objects are renumbered and every page goes under one page tree. Used
 * to put an engine-made cover page in front of a report.
 */

interface Parsed {
  objects: Map<number, Buffer>;
  root: number;
}

function parse(pdf: Buffer): Parsed {
  const text = pdf.toString('latin1');
  const startxref = Number(/startxref\s+(\d+)\s+%%EOF\s*$/.exec(text)?.[1]);
  if (!Number.isFinite(startxref)) throw new Error('Not a PDF this merger can read');
  const xref = text.slice(startxref);
  const head = /^xref\s+(\d+)\s+(\d+)\s+/.exec(xref);
  if (!head) throw new Error('Cross-reference streams are not supported');
  const count = Number(head[2]);
  const entries = xref.slice(head[0].length).split(/\r?\n/).filter(Boolean).slice(0, count);
  const objects = new Map<number, Buffer>();
  entries.forEach((e, i) => {
    const [off, , kind] = e.trim().split(/\s+/);
    if (kind !== 'n') return;
    const num = Number(head[1]) + i;
    const start = Number(off);
    const hdr = /^(\d+)\s+0\s+obj\s*/.exec(text.slice(start, start + 40));
    if (!hdr) return;
    let pos = start + hdr[0].length;
    const streamAt = text.indexOf('stream', pos);
    const endAt = text.indexOf('endobj', pos);
    let end = endAt;
    if (streamAt !== -1 && streamAt < endAt) {
      // Skip the stream by its length so binary data that happens to contain "endobj" is safe.
      const len = Number(/\/Length\s+(\d+)/.exec(text.slice(pos, streamAt))?.[1] ?? NaN);
      if (Number.isFinite(len)) {
        let dataStart = streamAt + 6;
        if (text[dataStart] === '\r') dataStart++;
        if (text[dataStart] === '\n') dataStart++;
        end = text.indexOf('endobj', dataStart + len);
      }
    }
    objects.set(num, pdf.subarray(pos, end));
    pos = end;
  });
  const root = Number(/\/Root\s+(\d+)\s+0\s+R/.exec(text.slice(text.lastIndexOf('trailer')))?.[1]);
  return { objects, root };
}

/** Renumbers `N 0 R` references in the dictionary part of an object (stream data untouched). */
function renumber(obj: Buffer, map: (n: number) => number): Buffer {
  const s = obj.toString('latin1');
  const at = s.search(/\bstream\r?\n/);
  const dict = at === -1 ? s : s.slice(0, at);
  const fixed = dict.replace(/(\d+)\s+0\s+R\b/g, (_, n: string) => `${map(Number(n))} 0 R`);
  return at === -1 ? Buffer.from(fixed, 'latin1') : Buffer.concat([Buffer.from(fixed, 'latin1'), obj.subarray(Buffer.byteLength(dict, 'latin1'))]);
}

export function mergePdfs(files: Buffer[]): Buffer {
  const out: Buffer[] = [];
  const kids: number[] = [];
  const pagesId = 2;
  let next = 3;
  for (const f of files) {
    const p = parse(f);
    const nums = [...p.objects.keys()];
    const remap = new Map(nums.map((n) => [n, next++]));
    const rootObj = p.objects.get(p.root)!.toString('latin1');
    const oldPages = Number(/\/Pages\s+(\d+)\s+0\s+R/.exec(rootObj)?.[1]);
    const pagesObj = p.objects.get(oldPages)!.toString('latin1');
    const pageNums = [...(/\/Kids\s*\[([^\]]*)\]/.exec(pagesObj)?.[1] ?? '').matchAll(/(\d+)\s+0\s+R/g)].map((m) => Number(m[1]));
    for (const n of nums) {
      let body = renumber(p.objects.get(n)!, (x) => remap.get(x) ?? x);
      if (pageNums.includes(n)) body = Buffer.from(body.toString('latin1').replace(/\/Parent\s+\d+\s+0\s+R/, `/Parent ${pagesId} 0 R`), 'latin1');
      out[remap.get(n)! - 1] = body;
    }
    kids.push(...pageNums.map((n) => remap.get(n)!));
  }
  out[0] = Buffer.from(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`, 'latin1');
  out[1] = Buffer.from(`<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>`, 'latin1');
  const parts: Buffer[] = [Buffer.from('%PDF-1.7\n%\xe2\xe3\xcf\xd3\n', 'latin1')];
  const offsets: number[] = [];
  let pos = parts[0].length;
  for (let i = 0; i < out.length; i++) {
    offsets.push(pos);
    const b = Buffer.concat([Buffer.from(`${i + 1} 0 obj\n`, 'latin1'), out[i] ?? Buffer.from('null'), Buffer.from('\nendobj\n', 'latin1')]);
    parts.push(b);
    pos += b.length;
  }
  parts.push(Buffer.from(`xref\n0 ${out.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${out.length + 1} /Root 1 0 R >>\nstartxref\n${pos}\n%%EOF\n`, 'latin1'));
  return Buffer.concat(parts);
}
