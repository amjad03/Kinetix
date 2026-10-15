// The Earth's land and sea, from Natural Earth (public domain) via
// data/land_mask.txt (see make_land_mask.mjs): a 720 x 360 grid, one bit a
// cell, row 0 at 90° N, column 0 at 180° W.
import { readFileSync } from 'node:fs';

const W = 720, H = 360;
const mask = Buffer.from(readFileSync(new URL('../data/land_mask.txt', import.meta.url), 'utf8').trim(), 'base64');

/** Whether the point at [lat], [lon] (degrees, east positive) is land. */
export function isLand(lat, lon) {
  const row = Math.min(H - 1, Math.max(0, Math.floor(((90 - lat) / 180) * H)));
  const col = ((Math.floor(((lon + 180) / 360) * W) % W) + W) % W;
  const i = row * W + col;
  return (mask[i >> 3] & (1 << (i & 7))) !== 0;
}

/**
 * A globe of [radius] split into land and sea (non-indexed geometries),
 * north up (+y). [facing] is the longitude that faces +z.
 */
export function globe(THREE, radius, { widthSegments = 360, heightSegments = 180, facing = 0 } = {}) {
  const surface = new THREE.SphereGeometry(radius, widthSegments, heightSegments).toNonIndexed();
  const p = surface.attributes.position.array;
  const land = [], sea = [];
  for (let i = 0; i < p.length; i += 9) {
    const x = (p[i] + p[i + 3] + p[i + 6]) / 3, y = (p[i + 1] + p[i + 4] + p[i + 7]) / 3, z = (p[i + 2] + p[i + 5] + p[i + 8]) / 3;
    const lat = (Math.asin(y / Math.hypot(x, y, z)) * 180) / Math.PI;
    const lon = (Math.atan2(x, z) * 180) / Math.PI + facing;
    (isLand(lat, ((((lon + 180) % 360) + 360) % 360) - 180) ? land : sea).push(...p.subarray(i, i + 9));
  }
  const make = (arr) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
    return g;
  };
  return { land: make(land), sea: make(sea) };
}
