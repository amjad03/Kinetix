import { crc32, deflateRawSync, inflateRawSync } from 'node:zlib';

export interface ZipEntry { path: string; data: Buffer }

const MAX_FILES = 2000;
const MAX_TOTAL = 200 * 1024 * 1024;

/** Reads a zip archive (stored or deflated entries) into memory, refusing path tricks and zip bombs. */
export function readZip(buf: Buffer): ZipEntry[] {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65_557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Not a zip file');
  const count = buf.readUInt16LE(eocd + 10);
  if (count > MAX_FILES) throw new Error('The package has too many files');
  let p = buf.readUInt32LE(eocd + 16);
  const out: ZipEntry[] = [];
  let total = 0;
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('Damaged zip directory');
    const method = buf.readUInt16LE(p + 10);
    const csize = buf.readUInt32LE(p + 20);
    const usize = buf.readUInt32LE(p + 24);
    const nlen = buf.readUInt16LE(p + 28);
    const xlen = buf.readUInt16LE(p + 30);
    const clen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const path = buf.subarray(p + 46, p + 46 + nlen).toString('utf8').replace(/\\/g, '/');
    p += 46 + nlen + xlen + clen;
    if (path.endsWith('/')) continue;
    if (path.startsWith('/') || path.split('/').includes('..')) throw new Error(`Unsafe path in package: ${path}`);
    total += usize;
    if (total > MAX_TOTAL) throw new Error('The package is too large when unpacked');
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const raw = buf.subarray(start, start + csize);
    out.push({ path, data: method === 0 ? Buffer.from(raw) : inflateRawSync(raw) });
  }
  return out;
}

/** Builds a zip archive (deflated); used by tests and sample packages. */
export function writeZip(entries: ZipEntry[]): Buffer {
  const files: Buffer[] = [];
  const dir: Buffer[] = [];
  let offset = 0;
  for (const e of entries) {
    const name = Buffer.from(e.path);
    const comp = deflateRawSync(e.data);
    const crc = crc32(e.data);
    const head = Buffer.alloc(30);
    head.writeUInt32LE(0x04034b50, 0); head.writeUInt16LE(20, 4); head.writeUInt16LE(8, 8); head.writeUInt32LE(crc >>> 0, 14); head.writeUInt32LE(comp.length, 18); head.writeUInt32LE(e.data.length, 22); head.writeUInt16LE(name.length, 26);
    files.push(head, name, comp);
    const ent = Buffer.alloc(46);
    ent.writeUInt32LE(0x02014b50, 0); ent.writeUInt16LE(20, 4); ent.writeUInt16LE(20, 6); ent.writeUInt16LE(8, 10); ent.writeUInt32LE(crc >>> 0, 16); ent.writeUInt32LE(comp.length, 20); ent.writeUInt32LE(e.data.length, 24); ent.writeUInt16LE(name.length, 28); ent.writeUInt32LE(offset, 42);
    dir.push(ent, name);
    offset += head.length + name.length + comp.length;
  }
  const dirBuf = Buffer.concat(dir);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(dirBuf.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...files, dirBuf, end]);
}
