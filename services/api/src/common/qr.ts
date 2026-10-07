/**
 * A small QR Code encoder (ISO/IEC 18004): byte mode, error correction level M, versions 1–10
 * (up to 213 bytes, plenty for a verification URL). Returns the module matrix; src/common/pdf.ts
 * draws it. No dependencies.
 */

// Level M: [data codewords per block ... as groups], EC codewords per block. Index = version.
const M_BLOCKS: Record<number, { ec: number; groups: [number, number][] }> = {
  1: { ec: 10, groups: [[1, 16]] },
  2: { ec: 16, groups: [[1, 28]] },
  3: { ec: 26, groups: [[1, 44]] },
  4: { ec: 18, groups: [[2, 32]] },
  5: { ec: 24, groups: [[2, 43]] },
  6: { ec: 16, groups: [[4, 27]] },
  7: { ec: 18, groups: [[4, 31]] },
  8: { ec: 22, groups: [[2, 38], [2, 39]] },
  9: { ec: 22, groups: [[3, 36], [2, 37]] },
  10: { ec: 26, groups: [[4, 43], [1, 44]] },
};
const ALIGN: Record<number, number[]> = { 1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30], 6: [6, 34], 7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50] };

const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
for (let i = 0, x = 1; i < 255; i++) {
  EXP[i] = x;
  LOG[x] = i;
  x <<= 1;
  if (x & 0x100) x ^= 0x11d;
}
for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
const gmul = (a: number, b: number) => (a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]]);

/** Reed–Solomon remainder of `data` for a generator of `ec` check symbols. */
function rsRemainder(data: number[], ec: number): number[] {
  let gen = [1];
  for (let i = 0; i < ec; i++) {
    const next = new Array(gen.length + 1).fill(0);
    for (let j = 0; j < gen.length; j++) {
      next[j] ^= gen[j];
      next[j + 1] ^= gmul(gen[j], EXP[i]);
    }
    gen = next;
  }
  const rem = new Array(ec).fill(0);
  for (const b of data) {
    const factor = b ^ rem.shift()!;
    rem.push(0);
    for (let i = 0; i < ec; i++) rem[i] ^= gmul(gen[i + 1], factor);
  }
  return rem;
}

function bch(value: number, poly: number, bits: number): number {
  const deg = (v: number) => 31 - Math.clz32(v);
  let v = value << bits;
  while (v !== 0 && deg(v) >= deg(poly)) v ^= poly << (deg(v) - deg(poly));
  return (value << bits) | v;
}

/** Encodes text (UTF-8) as a QR code; `true` = dark module. Throws when the text is too long. */
export function qrMatrix(text: string): boolean[][] {
  const bytes = [...Buffer.from(text, 'utf8')];
  let version = 0;
  for (let v = 1; v <= 10; v++) {
    const dataCw = M_BLOCKS[v].groups.reduce((s, [n, k]) => s + n * k, 0);
    if (4 + (v >= 10 ? 16 : 8) + bytes.length * 8 <= dataCw * 8) {
      version = v;
      break;
    }
  }
  if (!version) throw new Error('Text too long for the QR encoder');
  const { ec, groups } = M_BLOCKS[version];
  const dataCw = groups.reduce((s, [n, k]) => s + n * k, 0);

  const bits: number[] = [];
  const put = (val: number, len: number) => {
    for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1);
  };
  put(0b0100, 4);
  put(bytes.length, version >= 10 ? 16 : 8);
  bytes.forEach((b) => put(b, 8));
  put(0, Math.min(4, dataCw * 8 - bits.length));
  while (bits.length % 8) bits.push(0);
  const cw: number[] = [];
  for (let i = 0; i < bits.length; i += 8) cw.push(parseInt(bits.slice(i, i + 8).join(''), 2));
  for (let pad = 0xec; cw.length < dataCw; pad ^= 0xec ^ 0x11) cw.push(pad);

  // Split into blocks, add check symbols, interleave.
  const blocks: { data: number[]; ec: number[] }[] = [];
  let pos = 0;
  for (const [n, k] of groups) {
    for (let i = 0; i < n; i++) {
      const data = cw.slice(pos, pos + k);
      pos += k;
      blocks.push({ data, ec: rsRemainder(data, ec) });
    }
  }
  const out: number[] = [];
  const maxData = Math.max(...blocks.map((b) => b.data.length));
  for (let i = 0; i < maxData; i++) for (const b of blocks) if (i < b.data.length) out.push(b.data[i]);
  for (let i = 0; i < ec; i++) for (const b of blocks) out.push(b.ec[i]);

  const size = 17 + 4 * version;
  const grid: (boolean | null)[][] = Array.from({ length: size }, () => new Array(size).fill(null));
  const fixed: boolean[][] = Array.from({ length: size }, () => new Array(size).fill(false));
  const set = (r: number, c: number, dark: boolean) => {
    if (r < 0 || c < 0 || r >= size || c >= size) return;
    grid[r][c] = dark;
    fixed[r][c] = true;
  };
  const finder = (r0: number, c0: number) => {
    for (let r = -1; r <= 7; r++) for (let c = -1; c <= 7; c++) {
      const inSquare = r >= 0 && r <= 6 && c >= 0 && c <= 6;
      const dark = inSquare && (r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4));
      set(r0 + r, c0 + c, dark);
    }
  };
  finder(0, 0);
  finder(0, size - 7);
  finder(size - 7, 0);
  for (let i = 8; i < size - 8; i++) {
    set(6, i, i % 2 === 0);
    set(i, 6, i % 2 === 0);
  }
  const al = ALIGN[version];
  for (const r of al) for (const c of al) {
    if ((r === 6 && c === 6) || (r === 6 && c === al[al.length - 1]) || (r === al[al.length - 1] && c === 6)) continue;
    for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) set(r + dr, c + dc, Math.max(Math.abs(dr), Math.abs(dc)) !== 1);
  }
  set(size - 8, 8, true); // the dark module
  // Reserve the format and version areas.
  for (let i = 0; i < 9; i++) {
    if (!fixed[8][i]) set(8, i, false);
    if (!fixed[i][8]) set(i, 8, false);
  }
  for (let i = 0; i < 8; i++) {
    set(8, size - 1 - i, false);
    if (i < 7) set(size - 1 - i, 8, false);
  }
  set(size - 8, 8, true);
  if (version >= 7) {
    const info = bch(version, 0x1f25, 12);
    for (let i = 0; i < 18; i++) {
      const dark = ((info >> i) & 1) === 1;
      const a = Math.floor(i / 3);
      const b = (i % 3) + size - 11;
      set(a, b, dark);
      set(b, a, dark);
    }
  }

  // Data bits in the zigzag order.
  const dataBits: number[] = [];
  out.forEach((b) => put2(dataBits, b, 8));
  const cells: [number, number][] = [];
  let up = true;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let n = 0; n < size; n++) {
      const r = up ? size - 1 - n : n;
      for (const c of [right, right - 1]) if (!fixed[r][c]) cells.push([r, c]);
    }
    up = !up;
  }
  const masks: ((r: number, c: number) => boolean)[] = [
    (r, c) => (r + c) % 2 === 0,
    (r) => r % 2 === 0,
    (_, c) => c % 3 === 0,
    (r, c) => (r + c) % 3 === 0,
    (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
    (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
    (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
    (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
  ];
  const build = (mask: number): boolean[][] => {
    const m = grid.map((row) => row.map((v) => v === true));
    cells.forEach(([r, c], i) => {
      const bit = i < dataBits.length ? dataBits[i] === 1 : false;
      m[r][c] = bit !== masks[mask](r, c);
    });
    const fmt = bch(mask, 0x537, 10) ^ 0x5412; // level M = 00
    for (let i = 0; i < 15; i++) {
      const dark = ((fmt >> i) & 1) === 1;
      // first copy: around the top-left finder
      if (i < 6) m[i][8] = dark;
      else if (i < 8) m[i + 1][8] = dark;
      else if (i === 8) m[8][7] = dark;
      else m[8][14 - i] = dark;
      // second copy: top-right and bottom-left
      if (i < 8) m[8][size - 1 - i] = dark;
      else m[size - 15 + i][8] = dark;
    }
    m[size - 8][8] = true;
    return m;
  };
  let best = build(0);
  let bestScore = penalty(best);
  for (let k = 1; k < 8; k++) {
    const m = build(k);
    const s = penalty(m);
    if (s < bestScore) {
      best = m;
      bestScore = s;
    }
  }
  return best;
}

function put2(arr: number[], val: number, len: number) {
  for (let i = len - 1; i >= 0; i--) arr.push((val >>> i) & 1);
}

function penalty(m: boolean[][]): number {
  const n = m.length;
  let score = 0;
  const runs = (line: boolean[]) => {
    let s = 0;
    let run = 1;
    for (let i = 1; i < n; i++) {
      if (line[i] === line[i - 1]) run++;
      else {
        if (run >= 5) s += run - 2;
        run = 1;
      }
    }
    if (run >= 5) s += run - 2;
    return s;
  };
  const finderLike = (line: boolean[]) => {
    let s = 0;
    const pat1 = [true, false, true, true, true, false, true, false, false, false, false];
    const pat2 = [false, false, false, false, true, false, true, true, true, false, true];
    for (let i = 0; i + 11 <= n; i++) {
      if (pat1.every((v, k) => line[i + k] === v)) s += 40;
      if (pat2.every((v, k) => line[i + k] === v)) s += 40;
    }
    return s;
  };
  for (let i = 0; i < n; i++) {
    const col = m.map((row) => row[i]);
    score += runs(m[i]) + runs(col) + finderLike(m[i]) + finderLike(col);
  }
  for (let r = 0; r < n - 1; r++) for (let c = 0; c < n - 1; c++) if (m[r][c] === m[r][c + 1] && m[r][c] === m[r + 1][c] && m[r][c] === m[r + 1][c + 1]) score += 3;
  const dark = m.reduce((s, row) => s + row.filter(Boolean).length, 0);
  score += Math.floor(Math.abs((dark * 100) / (n * n) - 50) / 5) * 10;
  return score;
}
