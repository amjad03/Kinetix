// A smooth surface wrapped around a set of shapes (an "envelope"): used for
// the lungs, which BodyParts3D gives only as airway and vessel trees. The
// trees are drawn into a voxel grid, grown and shrunk again (a closing,
// which fills the space between branches), smoothed, and the surface is
// taken off with surface nets.

/** Exact squared distance along one line (Felzenszwalb and Huttenlocher). */
function edt1d(f, n, d, v, z) {
  let k = 0;
  v[0] = 0;
  z[0] = -Infinity;
  z[1] = Infinity;
  for (let q = 1; q < n; q++) {
    let s;
    for (;;) {
      s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      if (s <= z[k]) k--;
      else break;
    }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = Infinity;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    d[q] = (q - v[k]) * (q - v[k]) + f[v[k]];
  }
}

/** Distance (in cells) from every cell to the nearest cell where [inside] is set. */
export function distance(inside, nx, ny, nz) {
  const INF = 1e12;
  const g = new Float64Array(nx * ny * nz);
  for (let i = 0; i < g.length; i++) g[i] = inside[i] ? 0 : INF;
  const n = Math.max(nx, ny, nz);
  const f = new Float64Array(n), d = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1);
  const idx = (x, y, zz) => x + nx * (y + ny * zz);
  for (let y = 0; y < ny; y++) for (let zz = 0; zz < nz; zz++) {
    for (let x = 0; x < nx; x++) f[x] = g[idx(x, y, zz)];
    edt1d(f, nx, d, v, z);
    for (let x = 0; x < nx; x++) g[idx(x, y, zz)] = d[x];
  }
  for (let x = 0; x < nx; x++) for (let zz = 0; zz < nz; zz++) {
    for (let y = 0; y < ny; y++) f[y] = g[idx(x, y, zz)];
    edt1d(f, ny, d, v, z);
    for (let y = 0; y < ny; y++) g[idx(x, y, zz)] = d[y];
  }
  for (let x = 0; x < nx; x++) for (let y = 0; y < ny; y++) {
    for (let zz = 0; zz < nz; zz++) f[zz] = g[idx(x, y, zz)];
    edt1d(f, nz, d, v, z);
    for (let zz = 0; zz < nz; zz++) g[idx(x, y, zz)] = d[zz];
  }
  for (let i = 0; i < g.length; i++) g[i] = Math.sqrt(g[i]);
  return g;
}

/**
 * The envelope of [meshes]: a surface [grow] metres out from them, with the
 * gaps between them filled up to about 2 x ([grow] + [fill]).
 */
export function envelope(meshes, { cell = 0.0025, grow = 0.008, fill = 0.014, smooth = 2 } = {}) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const m of meshes) for (let i = 0; i < m.positions.length; i += 3) for (let k = 0; k < 3; k++) {
    min[k] = Math.min(min[k], m.positions[i + k]);
    max[k] = Math.max(max[k], m.positions[i + k]);
  }
  const margin = grow + fill + 4 * cell;
  const o = min.map((v) => v - margin);
  const [nx, ny, nz] = [0, 1, 2].map((k) => Math.ceil((max[k] - min[k] + 2 * margin) / cell) + 1);
  const at = (x, y, z) => x + nx * (y + ny * z);
  const solid = new Uint8Array(nx * ny * nz);
  const mark = (x, y, z) => {
    const i = Math.round((x - o[0]) / cell), j = Math.round((y - o[1]) / cell), k = Math.round((z - o[2]) / cell);
    if (i >= 0 && j >= 0 && k >= 0 && i < nx && j < ny && k < nz) solid[at(i, j, k)] = 1;
  };
  for (const m of meshes) {
    const p = m.positions;
    for (let i = 0; i < p.length; i += 3) mark(p[i], p[i + 1], p[i + 2]);
    for (let t = 0; t < m.indices.length; t += 3) {
      const [a, b, c] = [0, 1, 2].map((q) => m.indices[t + q] * 3);
      for (const [u, w] of [[1 / 3, 1 / 3], [0.5, 0], [0, 0.5], [0.5, 0.5]]) {
        mark(p[a] + (p[b] - p[a]) * u + (p[c] - p[a]) * w, p[a + 1] + (p[b + 1] - p[a + 1]) * u + (p[c + 1] - p[a + 1]) * w, p[a + 2] + (p[b + 2] - p[a + 2]) * u + (p[c + 2] - p[a + 2]) * w);
      }
    }
  }
  // Closing: grow by (grow + fill), then shrink back by fill.
  const d1 = distance(solid, nx, ny, nz);
  const big = new Uint8Array(solid.length);
  for (let i = 0; i < big.length; i++) big[i] = d1[i] * cell <= grow + fill ? 1 : 0;
  const outside = new Uint8Array(solid.length);
  for (let i = 0; i < outside.length; i++) outside[i] = big[i] ? 0 : 1;
  const d2 = distance(outside, nx, ny, nz);
  // A signed field: positive inside the envelope, in cells.
  let field = new Float32Array(solid.length);
  for (let i = 0; i < field.length; i++) field[i] = d2[i] - fill / cell;
  // Smooth with a few box blurs (clamped so far-away values do not dominate).
  for (let i = 0; i < field.length; i++) field[i] = Math.max(-3, Math.min(3, field[i]));
  for (let s = 0; s < smooth; s++) field = blur(field, nx, ny, nz);
  return surfaceNets(field, nx, ny, nz, o, cell);
}

function blur(f, nx, ny, nz) {
  const out = new Float32Array(f.length);
  const at = (x, y, z) => x + nx * (y + ny * z);
  for (let z = 0; z < nz; z++) for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
    let s = 0, n = 0;
    for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const X = x + dx, Y = y + dy, Z = z + dz;
      if (X < 0 || Y < 0 || Z < 0 || X >= nx || Y >= ny || Z >= nz) continue;
      s += f[at(X, Y, Z)];
      n++;
    }
    out[at(x, y, z)] = s / n;
  }
  return out;
}

/** The surface where [f] crosses zero (positive = inside), as triangles. */
function surfaceNets(f, nx, ny, nz, o, cell) {
  const at = (x, y, z) => x + nx * (y + ny * z);
  const vert = new Int32Array(nx * ny * nz).fill(-1);
  const pos = [];
  const corners = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
  const edges = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  for (let z = 0; z < nz - 1; z++) for (let y = 0; y < ny - 1; y++) for (let x = 0; x < nx - 1; x++) {
    const v = corners.map(([a, b, c]) => f[at(x + a, y + b, z + c)]);
    if (v.every((q) => q > 0) || v.every((q) => q <= 0)) continue;
    let sx = 0, sy = 0, sz = 0, n = 0;
    for (const [i, j] of edges) {
      if (v[i] > 0 === v[j] > 0) continue;
      const t = v[i] / (v[i] - v[j]);
      sx += corners[i][0] + (corners[j][0] - corners[i][0]) * t;
      sy += corners[i][1] + (corners[j][1] - corners[i][1]) * t;
      sz += corners[i][2] + (corners[j][2] - corners[i][2]) * t;
      n++;
    }
    vert[at(x, y, z)] = pos.length / 3;
    pos.push(o[0] + (x + sx / n) * cell, o[1] + (y + sy / n) * cell, o[2] + (z + sz / n) * cell);
  }
  const idx = [];
  const quad = (a, b, c, d, flip) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (flip) idx.push(a, c, b, a, d, c);
    else idx.push(a, b, c, a, c, d);
  };
  for (let z = 1; z < nz - 1; z++) for (let y = 1; y < ny - 1; y++) for (let x = 1; x < nx - 1; x++) {
    const inside = f[at(x, y, z)] > 0;
    // Edge along x from (x,y,z) to (x+1,y,z): the four cells around it.
    if (x < nx - 1 && inside !== f[at(x + 1, y, z)] > 0) quad(vert[at(x, y - 1, z - 1)], vert[at(x, y, z - 1)], vert[at(x, y, z)], vert[at(x, y - 1, z)], !inside);
    if (y < ny - 1 && inside !== f[at(x, y + 1, z)] > 0) quad(vert[at(x - 1, y, z - 1)], vert[at(x - 1, y, z)], vert[at(x, y, z)], vert[at(x, y, z - 1)], !inside);
    if (z < nz - 1 && inside !== f[at(x, y, z + 1)] > 0) quad(vert[at(x - 1, y - 1, z)], vert[at(x, y - 1, z)], vert[at(x, y, z)], vert[at(x - 1, y, z)], !inside);
  }
  return { positions: new Float32Array(pos), indices: new Uint32Array(idx) };
}
