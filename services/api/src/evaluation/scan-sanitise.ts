/**
 * Anonymisation helpers for scanned answer scripts: strip metadata (EXIF, text chunks), black out the
 * header band of the first page (where students write their name and number) and catch file names
 * that reveal the student. PNG pages can be masked; other formats are only stripped.
 */
import { BadRequestException } from '@nestjs/common';
import { deflateSync, inflateSync } from 'node:zlib';

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const KEEP = new Set(['IHDR', 'PLTE', 'tRNS', 'IDAT', 'IEND']);
const CHANNELS: Record<number, number> = { 0: 1, 2: 3, 4: 2, 6: 4 };

const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, crc]);
}

/** PNG: keeps only the image chunks; when `maskPercent` is above 0 also blacks out that share of the height from the top. */
function cleanPng(buf: Buffer, maskPercent: number): Buffer {
  if (buf.length < 33 || !buf.subarray(0, 8).equals(PNG_SIG)) throw new BadRequestException('The page is not a valid PNG');
  const chunks: { type: string; data: Buffer }[] = [];
  for (let pos = 8; pos + 12 <= buf.length; ) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    if (pos + 12 + len > buf.length) throw new BadRequestException('The page is not a valid PNG');
    chunks.push({ type, data: buf.subarray(pos + 8, pos + 8 + len) });
    pos += 12 + len;
  }
  const kept = chunks.filter((c) => KEEP.has(c.type));
  const ihdr = kept.find((c) => c.type === 'IHDR');
  if (!ihdr) throw new BadRequestException('The page is not a valid PNG');
  if (maskPercent <= 0) return Buffer.concat([PNG_SIG, ...kept.map((c) => chunk(c.type, c.data))]);

  const width = ihdr.data.readUInt32BE(0);
  const height = ihdr.data.readUInt32BE(4);
  const depth = ihdr.data[8];
  const colour = ihdr.data[9];
  const interlace = ihdr.data[12];
  const ch = CHANNELS[colour];
  if (depth !== 8 || !ch || interlace !== 0) throw new BadRequestException('Header masking needs an 8-bit, non-interlaced grey, RGB or RGBA PNG');
  const stride = width * ch;
  const raw = inflateSync(Buffer.concat(kept.filter((c) => c.type === 'IDAT').map((c) => c.data)));
  if (raw.length < height * (stride + 1)) throw new BadRequestException('The page is not a valid PNG');
  const px = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)];
    for (let i = 0; i < stride; i++) {
      const x = raw[y * (stride + 1) + 1 + i];
      const a = i >= ch ? px[y * stride + i - ch] : 0;
      const b = y > 0 ? px[(y - 1) * stride + i] : 0;
      const c = i >= ch && y > 0 ? px[(y - 1) * stride + i - ch] : 0;
      let v: number;
      if (f === 0) v = x;
      else if (f === 1) v = x + a;
      else if (f === 2) v = x + b;
      else if (f === 3) v = x + ((a + b) >> 1);
      else if (f === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v = x + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
      } else throw new BadRequestException('The page is not a valid PNG');
      px[y * stride + i] = v & 0xff;
    }
  }
  const rows = Math.ceil((height * maskPercent) / 100);
  const hasAlpha = colour === 4 || colour === 6;
  for (let y = 0; y < rows; y++) for (let i = 0; i < stride; i++) px[y * stride + i] = hasAlpha && i % ch === ch - 1 ? 255 : 0;
  const out = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y++) px.copy(out, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  const others = kept.filter((c) => c.type !== 'IDAT' && c.type !== 'IEND');
  return Buffer.concat([PNG_SIG, ...others.map((c) => chunk(c.type, c.data)), chunk('IDAT', deflateSync(out)), chunk('IEND', Buffer.alloc(0))]);
}

/** JPEG: drops EXIF/XMP (APP1 to APP15) and comment segments before the image data. */
function cleanJpeg(buf: Buffer): Buffer {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) throw new BadRequestException('The page is not a valid JPEG');
  const parts: Buffer[] = [buf.subarray(0, 2)];
  let pos = 2;
  while (pos + 4 <= buf.length) {
    if (buf[pos] !== 0xff) throw new BadRequestException('The page is not a valid JPEG');
    const marker = buf[pos + 1];
    if (marker === 0xda) {
      parts.push(buf.subarray(pos));
      return Buffer.concat(parts);
    }
    const len = buf.readUInt16BE(pos + 2);
    const seg = buf.subarray(pos, pos + 2 + len);
    if (!((marker >= 0xe1 && marker <= 0xef) || marker === 0xfe)) parts.push(seg);
    pos += 2 + len;
  }
  return buf;
}

/**
 * Prepares one page for storage. `maskPercent` applies to the first page only and needs a PNG; a PDF or
 * JPEG first page is refused rather than stored with the name block still on it.
 */
export function sanitisePage(buf: Buffer, mime: string, firstPage: boolean, maskPercent: number): { buffer: Buffer; masked: boolean } {
  const mask = firstPage ? maskPercent : 0;
  if (mime === 'image/png') return { buffer: cleanPng(buf, mask), masked: mask > 0 };
  if (mask > 0) throw new BadRequestException('The first page must be a PNG so the header band can be blacked out; export the scan as PNG or turn masking off');
  if (mime === 'image/jpeg') return { buffer: cleanJpeg(buf), masked: false };
  return { buffer: buf, masked: false };
}

/** Why a file name gives the student away (their roll number or a part of their name), or null. */
export function nameRevealsStudent(fileName: string, student: { rollNo: string; fullName: string }): string | null {
  const name = fileName.toLowerCase().replace(/\.[a-z0-9]+$/, '');
  const roll = student.rollNo.toLowerCase();
  if (roll.length >= 2 && new RegExp(`(^|[^a-z0-9])${roll.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`).test(name)) return 'the roll number';
  const part = student.fullName.toLowerCase().split(/\s+/).find((t) => t.length >= 3 && name.includes(t));
  return part ? 'the student name' : null;
}
