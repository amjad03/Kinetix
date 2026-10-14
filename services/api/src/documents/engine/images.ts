import { createHash } from 'node:crypto';
import { deflateSync, inflateSync } from 'node:zlib';

/**
 * Images for documents: JPEG passes through (DCT) and PNG is decoded into colour and alpha planes
 * (a PDF soft mask), so logos with transparency print cleanly. The original bytes are kept for
 * the SVG preview. Uploads are normalised to 8-bit PNG or JPEG first (branding.service.ts).
 */
export interface ImageRes {
  /** Content hash: one PDF object per distinct image. */
  key: string;
  width: number;
  height: number;
  mime: 'image/jpeg' | 'image/png';
  original: Buffer;
  pdf: { filter: 'DCTDecode' | 'FlateDecode'; colorSpace: 'DeviceRGB' | 'DeviceGray' | 'DeviceCMYK'; data: Buffer; alpha?: Buffer; invertCmyk?: boolean };
}

/** Width, height and colour components of a JPEG. */
export function jpegInfo(b: Buffer): { w: number; h: number; comps: number; adobe: boolean } | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;
  let i = 2;
  let adobe = false;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) return null;
    const m = b[i + 1];
    if (m === 0xee && b.toString('latin1', i + 4, i + 9) === 'Adobe') adobe = true;
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7), comps: b[i + 9], adobe };
    if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) i += 2;
    else i += 2 + b.readUInt16BE(i + 2);
  }
  return null;
}

const paeth = (a: number, b: number, c: number) => {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
};

/** Decodes a non-interlaced PNG (any colour type, 1 to 16 bits) into 8-bit RGB (or grey) and alpha. */
export function decodePng(buf: Buffer): { w: number; h: number; channels: 1 | 3; color: Buffer; alpha: Buffer | null } | null {
  if (buf.length < 33 || buf.readUInt32BE(0) !== 0x89504e47) return null;
  let p = 8;
  let w = 0;
  let h = 0;
  let depth = 8;
  let type = 0;
  let interlace = 0;
  let palette: Buffer | null = null;
  let trns: Buffer | null = null;
  const idat: Buffer[] = [];
  while (p + 8 <= buf.length) {
    const len = buf.readUInt32BE(p);
    const kind = buf.toString('latin1', p + 4, p + 8);
    const body = buf.subarray(p + 8, p + 8 + len);
    if (kind === 'IHDR') {
      w = body.readUInt32BE(0);
      h = body.readUInt32BE(4);
      depth = body[8];
      type = body[9];
      interlace = body[12];
    } else if (kind === 'PLTE') palette = body;
    else if (kind === 'tRNS') trns = body;
    else if (kind === 'IDAT') idat.push(body);
    else if (kind === 'IEND') break;
    p += 12 + len;
  }
  if (!w || !h || interlace || w * h > 40_000_000) return null;
  const chans = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[type as 0 | 2 | 3 | 4 | 6];
  if (!chans) return null;
  const raw = inflateSync(Buffer.concat(idat));
  const bpp = Math.max(1, (chans * depth) / 8);
  const stride = Math.ceil((w * chans * depth) / 8);
  const out = Buffer.alloc(stride * h);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const cur = out.subarray(y * stride, (y + 1) * stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? cur[x - bpp] : 0;
      const b = prev[x];
      const c = x >= bpp ? prev[x - bpp] : 0;
      const v = line[x];
      cur[x] = (f === 0 ? v : f === 1 ? v + a : f === 2 ? v + b : f === 3 ? v + ((a + b) >> 1) : v + paeth(a, b, c)) & 0xff;
    }
    prev = cur;
  }
  // Samples as 8-bit values.
  const sample = (y: number, i: number): number => {
    const row = y * stride;
    if (depth === 8) return out[row + i];
    if (depth === 16) return out[row + i * 2];
    const bitPos = i * depth;
    const byte = out[row + (bitPos >> 3)];
    const v = (byte >> (8 - depth - (bitPos & 7))) & ((1 << depth) - 1);
    return type === 3 ? v : Math.round((v * 255) / ((1 << depth) - 1));
  };
  const grey = type === 0 || type === 4;
  const color = Buffer.alloc(w * h * (grey ? 1 : 3));
  let alpha: Buffer | null = type === 4 || type === 6 || (type === 3 && trns) || ((type === 0 || type === 2) && trns) ? Buffer.alloc(w * h, 255) : null;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const px = y * w + x;
      if (type === 3) {
        const idx = sample(y, x);
        color[px * 3] = palette?.[idx * 3] ?? 0;
        color[px * 3 + 1] = palette?.[idx * 3 + 1] ?? 0;
        color[px * 3 + 2] = palette?.[idx * 3 + 2] ?? 0;
        if (alpha) alpha[px] = trns && idx < trns.length ? trns[idx] : 255;
      } else if (grey) {
        color[px] = sample(y, x * chans);
        if (type === 4) alpha![px] = sample(y, x * 2 + 1);
        else if (alpha && trns && color[px] === (depth === 16 ? trns[0] : trns.readUInt16BE(0))) alpha[px] = 0;
      } else {
        for (let k = 0; k < 3; k++) color[px * 3 + k] = sample(y, x * chans + k);
        if (type === 6) alpha![px] = sample(y, x * 4 + 3);
        else if (alpha && trns && trns.length >= 6 && color[px * 3] === trns[1] && color[px * 3 + 1] === trns[3] && color[px * 3 + 2] === trns[5]) alpha[px] = 0;
      }
    }
  if (alpha && alpha.every((a) => a === 255)) alpha = null;
  return { w, h, channels: grey ? 1 : 3, color, alpha };
}

const cache = new Map<string, ImageRes>();

/** An image ready for both surfaces, or null when the bytes are neither JPEG nor a PNG we can read. */
export function loadImage(bytes: Buffer): ImageRes | null {
  const key = createHash('sha1').update(bytes).digest('hex');
  const hit = cache.get(key);
  if (hit) return hit;
  let res: ImageRes | null = null;
  const j = jpegInfo(bytes);
  if (j && (j.comps === 1 || j.comps === 3 || j.comps === 4)) {
    res = { key, width: j.w, height: j.h, mime: 'image/jpeg', original: bytes, pdf: { filter: 'DCTDecode', colorSpace: j.comps === 1 ? 'DeviceGray' : j.comps === 4 ? 'DeviceCMYK' : 'DeviceRGB', data: bytes, invertCmyk: j.comps === 4 && j.adobe } };
  } else {
    const png = decodePng(bytes);
    if (png) res = { key, width: png.w, height: png.h, mime: 'image/png', original: bytes, pdf: { filter: 'FlateDecode', colorSpace: png.channels === 1 ? 'DeviceGray' : 'DeviceRGB', data: deflateSync(png.color), alpha: png.alpha ? deflateSync(png.alpha) : undefined } };
  }
  if (res) {
    if (cache.size > 200) cache.delete(cache.keys().next().value!);
    cache.set(key, res);
  }
  return res;
}
