// Turns Natural Earth's land outlines (public domain, naturalearthdata.com)
// into data/land_mask.txt: a 720 x 360 grid (half a degree a cell, row 0 at
// 90° N, column 0 at 180° W), one bit a cell, base64. The Earth models read
// it so that a rebuild needs no download.
//
//   curl -LO https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_land.geojson
//   node make_land_mask.mjs ne_50m_land.geojson
import { readFileSync, writeFileSync } from 'node:fs';

const W = 720, H = 360;
const geo = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const rings = [];
for (const f of geo.features) {
  const g = f.geometry;
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  for (const poly of polys) rings.push(...poly);
}
const bits = new Uint8Array((W * H) / 8);
for (let row = 0; row < H; row++) {
  const lat = 90 - (row + 0.5) * (180 / H);
  const xs = [];
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [x1, y1] = ring[i], [x2, y2] = ring[j];
      if ((y1 > lat) !== (y2 > lat)) xs.push(x1 + ((lat - y1) / (y2 - y1)) * (x2 - x1));
    }
  }
  xs.sort((a, b) => a - b);
  // Even-odd: land lies between each pair of crossings.
  for (let k = 0; k + 1 < xs.length; k += 2) {
    const c0 = Math.ceil((xs[k] + 180) / (360 / W) - 0.5), c1 = Math.floor((xs[k + 1] + 180) / (360 / W) - 0.5);
    for (let c = Math.max(0, c0); c <= Math.min(W - 1, c1); c++) {
      const i = row * W + c;
      bits[i >> 3] |= 1 << (i & 7);
    }
  }
}
writeFileSync(new URL('./data/land_mask.txt', import.meta.url), Buffer.from(bits).toString('base64') + '\n');
let land = 0;
for (let i = 0; i < W * H; i++) if (bits[i >> 3] & (1 << (i & 7))) land++;
console.log(`land_mask.txt: ${W}x${H}, ${((100 * land) / (W * H)).toFixed(1)}% of cells land`);
