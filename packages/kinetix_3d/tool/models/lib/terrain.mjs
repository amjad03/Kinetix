// Real landforms from elevation data: the open Terrain Tiles on AWS
// (Terrarium PNGs, mostly SRTM and GMTED2010 heights, public domain) cut to a
// box of latitude and longitude, made into a block model like the ones in a
// geography lab: the land on top, coloured by height (or by a satellite
// picture), and layered rock round the sides.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import sharp from 'sharp';

const TILE = 256;
const lonToX = (lon, z) => ((lon + 180) / 360) * 2 ** z * TILE;
const latToY = (lat, z) => ((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) * 2 ** z * TILE;

async function tile(dir, z, x, y) {
  const path = join(dir, `${z}_${x}_${y}.png`);
  if (!existsSync(path)) {
    const res = await fetch(`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`);
    if (!res.ok) throw new Error(`terrain tile ${z}/${x}/${y}: HTTP ${res.status}`);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, Buffer.from(await res.arrayBuffer()));
  }
  const { data, info } = await sharp(readFileSync(path)).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const h = new Float32Array(TILE * TILE);
  for (let i = 0; i < TILE * TILE; i++) h[i] = data[i * info.channels] * 256 + data[i * info.channels + 1] + data[i * info.channels + 2] / 256 - 32768;
  return h;
}

/**
 * Heights (metres) on an [n] x [n] grid over the box [south, west, north,
 * east], read at zoom [z] (tiles kept in [dir]). Also the box's width and
 * depth in metres.
 */
export async function heightGrid(dir, [south, west, north, east], z, n) {
  const x0 = lonToX(west, z), x1 = lonToX(east, z), y0 = latToY(north, z), y1 = latToY(south, z);
  const tiles = new Map();
  const sample = async (px, py) => {
    const tx = Math.floor(px / TILE), ty = Math.floor(py / TILE);
    const key = `${tx},${ty}`;
    if (!tiles.has(key)) tiles.set(key, await tile(dir, z, tx, ty));
    const t = tiles.get(key);
    const ix = Math.min(TILE - 1, Math.max(0, Math.floor(px - tx * TILE))), iy = Math.min(TILE - 1, Math.max(0, Math.floor(py - ty * TILE)));
    return t[iy * TILE + ix];
  };
  // Bilinear between pixel centres.
  const at = async (px, py) => {
    const fx = Math.floor(px - 0.5), fy = Math.floor(py - 0.5), u = px - 0.5 - fx, v = py - 0.5 - fy;
    const a = await sample(fx + 0.5, fy + 0.5), b = await sample(fx + 1.5, fy + 0.5), c = await sample(fx + 0.5, fy + 1.5), d = await sample(fx + 1.5, fy + 1.5);
    return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
  };
  const heights = new Float32Array(n * n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) heights[j * n + i] = await at(x0 + ((x1 - x0) * i) / (n - 1), y0 + ((y1 - y0) * j) / (n - 1));
  const lat = ((south + north) / 2) * (Math.PI / 180);
  const width = ((east - west) / 360) * 40075016 * Math.cos(lat);
  const depth = ((north - south) / 360) * 40007863;
  return { heights, n, width, depth };
}

/** A height-coloured relief: sea, plains, hills, mountains, bare rock and snow. Linear RGB. */
const RAMP = [
  [-1e9, [0.05, 0.16, 0.38]],
  [-1, [0.09, 0.27, 0.52]],
  // Natural colours, as the land looks from the air: green plains and
  // forests, alpine grass, bare rock and snow.
  [0.5, [0.33, 0.47, 0.22]],
  [400, [0.36, 0.48, 0.23]],
  [900, [0.3, 0.44, 0.2]],
  [1800, [0.22, 0.36, 0.17]],
  [2900, [0.3, 0.38, 0.21]],
  [3600, [0.5, 0.48, 0.33]],
  [4300, [0.46, 0.42, 0.38]],
  [4800, [0.6, 0.58, 0.57]],
  [5600, [0.9, 0.91, 0.94]],
  [6400, [0.98, 0.99, 1.0]],
];
export function reliefColour(h, slope, snowline = 4800, stops = RAMP) {
  const ramp = stops === RAMP ? RAMP.map(([at, c]) => [at >= 4800 ? at - 4800 + snowline : at, c]) : stops;
  let c = ramp[0][1];
  for (let i = 1; i < ramp.length; i++) {
    if (h < ramp[i][0]) {
      const [a, ca] = ramp[i - 1], [b, cb] = ramp[i];
      const t = a < -1e8 ? 1 : (h - a) / (b - a);
      c = ca.map((v, k) => v + (cb[k] - v) * t);
      break;
    }
    c = ramp[i][1];
  }
  // Steep slopes are bare rock; snow does not lie on cliffs.
  const rock = Math.min(1, Math.max(0, (slope - 0.7) / 0.6)) * (h > 0 ? 1 : 0);
  // The ramp is written in screen colours (sRGB); vertex colours are linear.
  return c.map((v, k) => Math.pow(v * (1 - rock) + [0.36, 0.33, 0.3][k] * rock, 2.2));
}

/**
 * The block: a grid surface [size] metres across (the longer side) with
 * heights scaled by [scale] and raised [exaggeration] times, and four walls
 * down to a flat base [base] below the lowest point. Returns {top, sides}
 * as rich meshes (see lib/importer.mjs): the top with vertex colours or UVs.
 */
export function block(grid, { size = 0.4, exaggeration = 1, base = 0.03, colour, seaLevel = 0, snowline, ramp } = {}) {
  const { heights, n, width, depth } = grid;
  const k = size / Math.max(width, depth);
  const w = width * k, d = depth * k;
  let lo = Infinity;
  for (const h of heights) lo = Math.min(lo, Math.max(h, seaLevel));
  const y = (h) => (Math.max(h, seaLevel) - lo) * k * exaggeration;
  const positions = new Float32Array(n * n * 3);
  const uvs = new Float32Array(n * n * 2);
  const colors = new Float32Array(n * n * 4);
  const cell = Math.max(width, depth) / (n - 1);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const v = j * n + i;
      positions.set([-w / 2 + (w * i) / (n - 1), y(heights[v]), -d / 2 + (d * j) / (n - 1)], v * 3);
      uvs.set([i / (n - 1), j / (n - 1)], v * 2);
      const hx = heights[j * n + Math.min(n - 1, i + 1)] - heights[j * n + Math.max(0, i - 1)];
      const hz = heights[Math.min(n - 1, j + 1) * n + i] - heights[Math.max(0, j - 1) * n + i];
      const slope = Math.hypot(hx, hz) / (2 * cell);
      const c = colour ? colour(heights[v], slope) : reliefColour(heights[v] < seaLevel ? -10 : heights[v], slope, snowline, ramp);
      colors.set([...c, 1], v * 4);
    }
  }
  const indices = [];
  for (let j = 0; j + 1 < n; j++) {
    for (let i = 0; i + 1 < n; i++) {
      const a = j * n + i, b = a + 1, c = a + n, e = c + 1;
      indices.push(a, c, b, b, c, e);
    }
  }
  const top = { positions, uvs, colors, indices: new Uint32Array(indices) };
  // The walls: layered rock, darker towards the bottom.
  const bottom = -base;
  const sp = [], sc = [], si = [];
  const edges = [
    Array.from({ length: n }, (_, i) => i), // back (j = 0)
    Array.from({ length: n }, (_, j) => j * n + (n - 1)), // right
    Array.from({ length: n }, (_, i) => (n - 1) * n + (n - 1 - i)), // front, right to left
    Array.from({ length: n }, (_, j) => (n - 1 - j) * n), // left
  ];
  // Rock strata that follow the land above them, topsoil at the top. Each
  // band is two rows of vertices, so the colours change in steps.
  const lin = (c) => c.map((x) => Math.pow(x, 2.2));
  const bands = [[0.36, 0.25, 0.16], [0.55, 0.43, 0.3], [0.47, 0.37, 0.27], [0.62, 0.52, 0.38], [0.42, 0.33, 0.25], [0.52, 0.4, 0.28]].map(lin);
  const soil = lin([0.3, 0.21, 0.13]);
  const rows = bands.length;
  for (const edge of edges) {
    const first = sp.length / 3;
    for (let e = 0; e < edge.length; e++) {
      const v = edge[e];
      const [px, py, pz] = [positions[v * 3], positions[v * 3 + 1], positions[v * 3 + 2]];
      // From the top down: soil, then the bands; each band has a top and a bottom row.
      for (let r = 0; r < rows; r++) {
        const yTop = r === 0 ? py : bottom + (py - bottom) * (1 - (r / rows) ** 0.8);
        const yBot = bottom + (py - bottom) * (1 - ((r + 1) / rows) ** 0.8);
        const c = r === 0 ? soil : bands[r];
        sp.push(px, yTop, pz, px, yBot, pz);
        sc.push(...c, 1, ...c, 1);
      }
    }
    const per = rows * 2;
    for (let e = 0; e + 1 < edge.length; e++) {
      for (let r = 0; r < rows; r++) {
        const a = first + e * per + r * 2, b = a + 1, c = a + per, d = c + 1;
        si.push(a, c, b, c, d, b);
      }
    }
  }
  // The base underneath.
  const b0 = sp.length / 3;
  sp.push(-w / 2, bottom, -d / 2, w / 2, bottom, -d / 2, w / 2, bottom, d / 2, -w / 2, bottom, d / 2);
  for (let i = 0; i < 4; i++) sc.push(0.06, 0.04, 0.03, 1);
  si.push(b0, b0 + 1, b0 + 2, b0, b0 + 2, b0 + 3);
  const sides = { positions: new Float32Array(sp), colors: new Float32Array(sc), indices: new Uint32Array(si) };
  return { top, sides, width: w, depth: d };
}
