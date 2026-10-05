// Triangle meshes as plain typed arrays, and the few operations the model
// build needs: read BodyParts3D OBJ files, weld, simplify, clip, measure.
import { execFileSync } from 'node:child_process';
import { MeshoptSimplifier } from 'meshoptimizer';

/** @typedef {{positions: Float32Array, indices: Uint32Array}} Mesh */

const zipDirs = { isa: 'isa_BP3D_4.0_obj_99', partof: 'partof_BP3D_4.0_obj_99' };

/**
 * One BodyParts3D element file (e.g. "FJ2428"), in three.js axes and metres:
 * BodyParts3D has x = patient's left, y = posterior, z = superior (mm);
 * the viewer has x = right on screen (patient's left, facing us), y = up,
 * z = towards the viewer (anterior).
 */
export function readBp3d(dir, file) {
  let text = null;
  for (const set of ['isa', 'partof']) {
    try {
      text = execFileSync('unzip', ['-p', `${dir}/${set}_BP3D_4.0_obj_99.zip`, `${zipDirs[set]}/${file}.obj`], { maxBuffer: 1 << 28 }).toString();
      if (text.length) break;
    } catch {
      text = null;
    }
  }
  if (!text) throw new Error(`BodyParts3D file ${file} not found`);
  const pos = [];
  const idx = [];
  for (const line of text.split('\n')) {
    if (line.startsWith('v ')) {
      const [, x, y, z] = line.trim().split(/\s+/).map(Number);
      pos.push(x / 1000, z / 1000, -y / 1000);
    } else if (line.startsWith('f ')) {
      const vs = line.trim().split(/\s+/).slice(1).map((t) => parseInt(t.split('/')[0], 10) - 1);
      for (let i = 1; i + 1 < vs.length; i++) idx.push(vs[0], vs[i], vs[i + 1]);
    }
  }
  return { positions: new Float32Array(pos), indices: new Uint32Array(idx) };
}

export function merge(meshes) {
  const n = meshes.reduce((a, m) => a + m.positions.length, 0);
  const t = meshes.reduce((a, m) => a + m.indices.length, 0);
  const positions = new Float32Array(n);
  const indices = new Uint32Array(t);
  let po = 0, io = 0;
  for (const m of meshes) {
    positions.set(m.positions, po);
    for (let i = 0; i < m.indices.length; i++) indices[io + i] = m.indices[i] + po / 3;
    po += m.positions.length;
    io += m.indices.length;
  }
  return { positions, indices };
}

/** Joins vertices closer than [eps] metres, drops degenerate triangles. */
export function weld(m, eps = 1e-5) {
  const map = new Map();
  const remap = new Uint32Array(m.positions.length / 3);
  const out = [];
  for (let i = 0; i < remap.length; i++) {
    const x = m.positions[i * 3], y = m.positions[i * 3 + 1], z = m.positions[i * 3 + 2];
    const k = `${Math.round(x / eps)},${Math.round(y / eps)},${Math.round(z / eps)}`;
    let j = map.get(k);
    if (j === undefined) {
      j = out.length / 3;
      map.set(k, j);
      out.push(x, y, z);
    }
    remap[i] = j;
  }
  const idx = [];
  for (let i = 0; i < m.indices.length; i += 3) {
    const a = remap[m.indices[i]], b = remap[m.indices[i + 1]], c = remap[m.indices[i + 2]];
    if (a !== b && b !== c && a !== c) idx.push(a, b, c);
  }
  return { positions: new Float32Array(out), indices: new Uint32Array(idx) };
}

/** Fewer triangles, same shape: keeps [ratio] of them within [error] (relative). */
export async function simplify(m, ratio, error = 0.01) {
  await MeshoptSimplifier.ready;
  const target = Math.max(3, Math.floor((m.indices.length * ratio) / 3) * 3);
  if (target >= m.indices.length) return m;
  const [idx] = MeshoptSimplifier.simplify(m.indices, m.positions, 3, target, error, ['LockBorder']);
  return compact({ positions: m.positions, indices: idx });
}

/** Drops unused vertices. */
export function compact(m) {
  const remap = new Int32Array(m.positions.length / 3).fill(-1);
  const out = [];
  const idx = new Uint32Array(m.indices.length);
  for (let i = 0; i < m.indices.length; i++) {
    const v = m.indices[i];
    if (remap[v] < 0) {
      remap[v] = out.length / 3;
      out.push(m.positions[v * 3], m.positions[v * 3 + 1], m.positions[v * 3 + 2]);
    }
    idx[i] = remap[v];
  }
  return { positions: new Float32Array(out), indices: idx };
}

/** Keeps the triangles whose centre passes [keep(x, y, z)]. */
export function clip(m, keep) {
  const idx = [];
  for (let i = 0; i < m.indices.length; i += 3) {
    let x = 0, y = 0, z = 0;
    for (let k = 0; k < 3; k++) {
      const v = m.indices[i + k] * 3;
      x += m.positions[v] / 3;
      y += m.positions[v + 1] / 3;
      z += m.positions[v + 2] / 3;
    }
    if (keep(x, y, z)) idx.push(m.indices[i], m.indices[i + 1], m.indices[i + 2]);
  }
  return compact({ positions: m.positions, indices: new Uint32Array(idx) });
}

export function bounds(m) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < m.positions.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], m.positions[i + k]);
      max[k] = Math.max(max[k], m.positions[i + k]);
    }
  }
  return { min, max, center: min.map((v, k) => (v + max[k]) / 2), size: max.map((v, k) => v - min[k]) };
}

/** Area-weighted centre of the surface. */
export function centroid(m) {
  let ax = 0, ay = 0, az = 0, total = 0;
  const p = m.positions;
  for (let i = 0; i < m.indices.length; i += 3) {
    const a = m.indices[i] * 3, b = m.indices[i + 1] * 3, c = m.indices[i + 2] * 3;
    const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2];
    const vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2];
    const area = Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2;
    ax += ((p[a] + p[b] + p[c]) / 3) * area;
    ay += ((p[a + 1] + p[b + 1] + p[c + 1]) / 3) * area;
    az += ((p[a + 2] + p[b + 2] + p[c + 2]) / 3) * area;
    total += area;
  }
  return total > 0 ? [ax / total, ay / total, az / total] : bounds(m).center;
}

/** Edges used by only one triangle: 0 for a closed (watertight) surface. */
export function openEdges(m) {
  const count = new Map();
  for (let i = 0; i < m.indices.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      const a = m.indices[i + k], b = m.indices[i + ((k + 1) % 3)];
      const key = a < b ? `${a},${b}` : `${b},${a}`;
      count.set(key, (count.get(key) || 0) + 1);
    }
  }
  let open = 0;
  for (const c of count.values()) if (c === 1) open++;
  return open;
}

/** Smooth per-vertex normals (angle-weighted by triangle area). */
export function normals(m) {
  const n = new Float32Array(m.positions.length);
  const p = m.positions;
  for (let i = 0; i < m.indices.length; i += 3) {
    const a = m.indices[i] * 3, b = m.indices[i + 1] * 3, c = m.indices[i + 2] * 3;
    const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2];
    const vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const v of [a, b, c]) {
      n[v] += nx;
      n[v + 1] += ny;
      n[v + 2] += nz;
    }
  }
  for (let i = 0; i < n.length; i += 3) {
    const l = Math.hypot(n[i], n[i + 1], n[i + 2]) || 1;
    n[i] /= l;
    n[i + 1] /= l;
    n[i + 2] /= l;
  }
  return n;
}

export function translate(m, d) {
  const positions = new Float32Array(m.positions);
  for (let i = 0; i < positions.length; i += 3) {
    positions[i] += d[0];
    positions[i + 1] += d[1];
    positions[i + 2] += d[2];
  }
  return { positions, indices: m.indices };
}

export function scale(m, s) {
  const positions = new Float32Array(m.positions);
  for (let i = 0; i < positions.length; i++) positions[i] *= s;
  return { positions, indices: m.indices };
}

export const triangles = (m) => m.indices.length / 3;

/**
 * Cuts the surface with a plane, keeping the side where
 * (p - point) . normal >= 0. Triangles across the plane are split, so the
 * cut edge is straight (like a vessel cut with scissors), not jagged.
 */
export function cutPlane(m, point, normal) {
  const d = (i) => (m.positions[i * 3] - point[0]) * normal[0] + (m.positions[i * 3 + 1] - point[1]) * normal[1] + (m.positions[i * 3 + 2] - point[2]) * normal[2];
  const pos = Array.from(m.positions);
  const idx = [];
  const cache = new Map();
  const between = (a, b) => {
    const k = a < b ? `${a},${b}` : `${b},${a}`;
    if (cache.has(k)) return cache.get(k);
    const da = d(a), db = d(b);
    const t = da / (da - db);
    const v = pos.length / 3;
    for (let c = 0; c < 3; c++) pos.push(m.positions[a * 3 + c] + (m.positions[b * 3 + c] - m.positions[a * 3 + c]) * t);
    cache.set(k, v);
    return v;
  };
  for (let i = 0; i < m.indices.length; i += 3) {
    const tri = [m.indices[i], m.indices[i + 1], m.indices[i + 2]];
    const inside = tri.map((v) => d(v) >= 0);
    const n = inside.filter(Boolean).length;
    if (n === 3) idx.push(...tri);
    else if (n === 0) continue;
    else {
      // Walk the triangle's edges, keeping inside corners and crossings (in order).
      const poly = [];
      for (let k = 0; k < 3; k++) {
        const a = tri[k], b = tri[(k + 1) % 3];
        if (inside[k]) poly.push(a);
        if (inside[k] !== inside[(k + 1) % 3]) poly.push(between(a, b));
      }
      for (let k = 1; k + 1 < poly.length; k++) idx.push(poly[0], poly[k], poly[k + 1]);
    }
  }
  return compact({ positions: new Float32Array(pos), indices: new Uint32Array(idx) });
}

/** Connected pieces of the surface (sharing vertices). */
export function components(m) {
  const parent = Int32Array.from({ length: m.positions.length / 3 }, (_, i) => i);
  const find = (x) => {
    while (parent[x] !== x) x = parent[x] = parent[parent[x]];
    return x;
  };
  for (let i = 0; i < m.indices.length; i += 3) {
    const a = find(m.indices[i]), b = find(m.indices[i + 1]), c = find(m.indices[i + 2]);
    parent[b] = a;
    parent[find(c)] = a;
  }
  const groups = new Map();
  for (let i = 0; i < m.indices.length; i += 3) {
    const r = find(m.indices[i]);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r).push(m.indices[i], m.indices[i + 1], m.indices[i + 2]);
  }
  return [...groups.values()].map((idx) => compact({ positions: m.positions, indices: new Uint32Array(idx) }));
}
