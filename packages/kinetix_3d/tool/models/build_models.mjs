// Builds the 3D teaching models from their recipes (recipes/*.mjs):
//   BP3D=/path/to/bodyparts3d node build_models.mjs [id ...]
// For each model: assets/viewer3d/models/<id>.glb (geometry, one node per
// part) and <id>.json (names, notes, groups, views, slices, animations and
// the geometry facts the viewer needs: label anchors, take-apart
// directions, flow paths). BP3D is the folder with the BodyParts3D zips
// (isa_/partof_BP3D_4.0_obj_99.zip) from dbarchive.biosciencedbc.jp.
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readBp3d, merge, weld, simplify, clip, bounds, centroid, triangles, openEdges, translate, cutPlane, components, compact } from './lib/mesh.mjs';
import { writeGlb } from './lib/glb.mjs';
import { envelope } from './lib/volume.mjs';
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** A three.js geometry (or a list of them) as a plain mesh. */
function fromGeometry(g) {
  const list = Array.isArray(g) ? g : [g];
  // Some three.js shapes are indexed and some are not: make them all plain
  // triangles, then join shared corners again.
  const clean = list.map((x) => {
    const y = x.index ? x.toNonIndexed() : x.clone();
    for (const k of Object.keys(y.attributes)) if (k !== 'position') y.deleteAttribute(k);
    return y;
  });
  const merged = mergeVertices(mergeGeometries(clean), 1e-6);
  const pos = merged.attributes.position.array;
  return { positions: new Float32Array(pos), indices: new Uint32Array(merged.index.array) };
}

/** Signed volume: negative when the triangles face inwards. */
function volume(m) {
  let v = 0;
  const p = m.positions;
  for (let i = 0; i < m.indices.length; i += 3) {
    const [a, b, c] = [0, 1, 2].map((k) => m.indices[i + k] * 3);
    v += (p[a] * (p[b + 1] * p[c + 2] - p[b + 2] * p[c + 1]) - p[a + 1] * (p[b] * p[c + 2] - p[b + 2] * p[c]) + p[a + 2] * (p[b] * p[c + 1] - p[b + 1] * p[c])) / 6;
  }
  return v;
}

function outward(m) {
  if (volume(m) >= 0) return m;
  const idx = new Uint32Array(m.indices);
  for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]];
  return { positions: m.positions, indices: idx };
}

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, '../../assets/viewer3d/models');

/** Every vertex of [m] as [x, y, z]. */
const vertices = (m) => Array.from({ length: m.positions.length / 3 }, (_, i) => [m.positions[i * 3], m.positions[i * 3 + 1], m.positions[i * 3 + 2]]);

/** A coarse 3D grid of points for nearest-point queries. */
function pointGrid(points, cell = 0.004) {
  const grid = new Map();
  const key = (x, y, z) => `${Math.floor(x / cell)},${Math.floor(y / cell)},${Math.floor(z / cell)}`;
  for (const p of points) {
    const k = key(...p);
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(p);
  }
  return (x, y, z, max = 0.05) => {
    let best = Infinity;
    const r = Math.ceil(max / cell);
    const cx = Math.floor(x / cell), cy = Math.floor(y / cell), cz = Math.floor(z / cell);
    for (let ring = 0; ring <= r; ring++) {
      for (let i = -ring; i <= ring; i++) {
        for (let j = -ring; j <= ring; j++) {
          for (let k = -ring; k <= ring; k++) {
            if (Math.max(Math.abs(i), Math.abs(j), Math.abs(k)) !== ring) continue;
            for (const p of grid.get(`${cx + i},${cy + j},${cz + k}`) || []) best = Math.min(best, Math.hypot(p[0] - x, p[1] - y, p[2] - z));
          }
        }
      }
      if (best <= ring * cell) break;
    }
    return best;
  };
}

/**
 * Splits one closed surface between parts by which reference surface each
 * triangle is nearest to; triangles within [both.within] of two references
 * go to [both.part] (a wall between two cavities, like the septum).
 */
function split(m, refs, both) {
  const near = Object.fromEntries(Object.entries(refs).map(([id, ref]) => [id, pointGrid(vertices(ref), 0.01)]));
  const ids = [...Object.keys(refs), ...(both ? [both.part] : [])];
  const tris = Object.fromEntries(ids.map((id) => [id, []]));
  for (let i = 0; i < m.indices.length; i += 3) {
    let x = 0, y = 0, z = 0;
    for (let k = 0; k < 3; k++) {
      const v = m.indices[i + k] * 3;
      x += m.positions[v] / 3;
      y += m.positions[v + 1] / 3;
      z += m.positions[v + 2] / 3;
    }
    const d = Object.entries(near).map(([id, f]) => [id, f(x, y, z, 0.2)]).sort((a, b) => a[1] - b[1]);
    const id = both && d.length > 1 && d[1][1] < both.within ? both.part : d[0][0];
    tris[id].push(m.indices[i], m.indices[i + 1], m.indices[i + 2]);
  }
  return Object.fromEntries(ids.map((id) => [id, clip({ positions: m.positions, indices: new Uint32Array(tris[id]) }, () => true)]));
}

/**
 * Where a label points: the middle of the part's surface as seen from
 * [dir] (the front by default), so the dot sits on what the class sees.
 */
function frontAnchor(m, dir = [0, 0, 1]) {
  const vs = vertices(m);
  const depth = (p) => p[0] * dir[0] + p[1] * dir[1] + p[2] * dir[2];
  const ds = vs.map(depth);
  const lo = Math.min(...ds), hi = Math.max(...ds);
  const shell = vs.filter((p, i) => ds[i] >= hi - (hi - lo) * 0.25);
  const mean = [0, 1, 2].map((k) => shell.reduce((a, p) => a + p[k], 0) / shell.length);
  // Nearest shell vertex to the mean, measured across the view (not in depth).
  let best = shell[0], bd = Infinity;
  for (const p of shell) {
    const d = [0, 1, 2].map((k) => p[k] - mean[k]);
    const along = d[0] * dir[0] + d[1] * dir[1] + d[2] * dir[2];
    const across = Math.hypot(d[0] - along * dir[0], d[1] - along * dir[1], d[2] - along * dir[2]);
    if (across < bd) {
      bd = across;
      best = p;
    }
  }
  return best;
}

/** The average of the vertices furthest along [dir] (the top 3 %). */
function extreme(m, dir) {
  const vs = vertices(m).map((p) => [p, p[0] * dir[0] + p[1] * dir[1] + p[2] * dir[2]]).sort((a, b) => b[1] - a[1]);
  const top = vs.slice(0, Math.max(1, Math.floor(vs.length * 0.03)));
  return [0, 1, 2].map((k) => top.reduce((a, [p]) => a + p[k], 0) / top.length);
}

const dirs = { top: [0, 1, 0], bottom: [0, -1, 0], left: [-1, 0, 0], right: [1, 0, 0], front: [0, 0, 1], back: [0, 0, -1] };

const round = (v) => Math.round(v * 10000) / 10000;
const r3 = (p) => p.map(round);

async function build(recipe, bp3d) {
  const t0 = Date.now();
  const cache = new Map();
  const load = (f) => {
    if (!cache.has(f)) cache.set(f, weld(readBp3d(bp3d, f)));
    return cache.get(f);
  };
  // 1. Raw part surfaces. Envelopes first: surfaces wrapped around sets of
  // files (the lungs around their airways and vessels).
  const env = {};
  for (const [id, e] of Object.entries(recipe.envelopes || {})) {
    const t1 = Date.now();
    env[id] = outward(weld(envelope(e.files.map(load), e)));
    console.log(`  envelope ${id}: ${triangles(env[id])} triangles, ${Date.now() - t1} ms`);
  }
  const raw = {};
  // Models built in code: the recipe makes each part's geometry with three.js.
  if (recipe.build) {
    const made = await recipe.build(THREE);
    for (const [id, g] of Object.entries(made)) raw[id] = fromGeometry(g);
  }
  for (const [name, s] of Object.entries(recipe.splits || {})) {
    const parts = split(s.envelope ? env[s.envelope] : load(s.file), Object.fromEntries(Object.entries(s.near).map(([id, fs]) => [id, merge(fs.map(load))])), s.both);
    Object.assign(raw, parts);
    void name;
  }
  for (const p of recipe.parts) {
    if (p.files) raw[p.id] = weld(merge(p.files.map(load)));
    if (p.envelope) raw[p.id] = env[p.envelope];
    if (p.scaleOf) continue;
    if (!raw[p.id]) throw new Error(`${recipe.id}: part ${p.id} has no geometry`);
    if (recipe.build) continue; // made in code: keep every piece
    // Drop specks: a few stray triangles far from the part in the source data.
    const pieces = components(raw[p.id]);
    raw[p.id] = merge(pieces.filter((c) => triangles(c) >= (p.minPiece ?? 20)));
  }
  // A part made by scaling another surface about a point (e.g. the retina,
  // just inside the choroid).
  for (const p of recipe.parts) {
    if (!p.scaleOf) continue;
    const { files, factor, about } = p.scaleOf;
    const m = weld(merge(files.map(load)));
    const o = centroid(load(about));
    const positions = new Float32Array(m.positions);
    for (let i = 0; i < positions.length; i += 3) for (let k = 0; k < 3; k++) positions[i + k] = o[k] + (positions[i + k] - o[k]) * factor;
    raw[p.id] = merge(components({ positions, indices: m.indices }).filter((c) => triangles(c) >= 20));
  }
  // 2. Clip (vessels cut short, like a dissected specimen), then centre the
  // model on the origin.
  const all = merge(Object.values(raw));
  const facts0 = { bounds: bounds(all), centroid: (id) => centroid(raw[id]), bboxOf: (id) => bounds(raw[id]) };
  for (const p of recipe.parts) {
    if (p.keep) raw[p.id] = clip(raw[p.id], (x, y, z) => p.keep(x, y, z, facts0));
    for (const c of p.cuts?.(facts0) || []) raw[p.id] = cutPlane(raw[p.id], c.point, c.normal);
    // Pieces left floating by a cut, not touching the part named in
    // [attachedTo], are dropped.
    if (p.attachedTo) {
      const near = pointGrid(vertices(merge(p.attachedTo.map((id) => raw[id]))));
      const pieces = components(raw[p.id]).filter((c) => vertices(c).some((v) => near(...v, 0.006) < 0.006));
      raw[p.id] = merge(pieces);
    }
  }
  // A part can take over the outward-facing triangles of another part near
  // it (where the source data has a gap, the surface underneath shows).
  for (const p of recipe.parts) {
    if (!p.absorb) continue;
    const { from, within, outward } = p.absorb;
    const near = pointGrid(vertices(raw[p.id]));
    const src = raw[from];
    const keep = [], take = [];
    for (let i = 0; i < src.indices.length; i += 3) {
      const [a, b, c] = [0, 1, 2].map((k) => src.indices[i + k] * 3);
      const q = src.positions;
      const cx = (q[a] + q[b] + q[c]) / 3, cy = (q[a + 1] + q[b + 1] + q[c + 1]) / 3, cz = (q[a + 2] + q[b + 2] + q[c + 2]) / 3;
      const ux = q[b] - q[a], uy = q[b + 1] - q[a + 1], uz = q[b + 2] - q[a + 2];
      const vx = q[c] - q[a], vy = q[c + 1] - q[a + 1], vz = q[c + 2] - q[a + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const nl = Math.hypot(nx, ny, nz) || 1;
      const facing = outward(cx, cy, cz, nx / nl, ny / nl, nz / nl, facts0);
      (facing && near(cx, cy, cz, within) < within ? take : keep).push(src.indices[i], src.indices[i + 1], src.indices[i + 2]);
    }
    raw[from] = { positions: src.positions, indices: new Uint32Array(keep) };
    raw[p.id] = weld(merge([raw[p.id], compact({ positions: src.positions, indices: new Uint32Array(take) })]));
  }
  const whole = merge(recipe.parts.filter((p) => !p.hidden).map((p) => raw[p.id]));
  const b = bounds(whole);
  const shift = b.center.map((v) => -v);
  const size = Math.max(...b.size);
  // 3. Simplify each part.
  const parts = [];
  for (const p of recipe.parts) {
    let m = translate(raw[p.id], shift);
    const before = triangles(m);
    // Shapes made in code are kept as made, unless a part asks for fewer
    // triangles (the Earth's coastlines are fine, its oceans need not be).
    if (!recipe.build || p.detail) m = await simplify(m, p.detail ?? recipe.detail ?? 0.5, p.error ?? 0.002);
    parts.push({ ...p, mesh: m, before });
  }
  // 4. Geometry facts for the viewer.
  const facts = {};
  for (const p of parts) {
    const c = centroid(p.mesh);
    const out = Math.hypot(...c) > 1e-4 ? c.map((v) => v / Math.hypot(...c)) : [0, 0, 1];
    const anchor = frontAnchor(p.mesh, p.labelFrom ?? recipe.labelFrom ?? [0, 0, 1]);
    // Where the label points from each side: the viewer takes the one that
    // faces the camera best.
    let anchors = Object.values(dirs).map((d) => [...d, ...r3(frontAnchor(p.mesh, d))]);
    // Or one fixed point for the label (a ray's label in open air, say).
    const at = p.labelAt && r3(p.labelAt.map((v, k) => v + shift[k]));
    if (at) anchors = Object.values(dirs).map((d) => [...d, ...at]);
    facts[p.id] = { centroid: r3(c), anchor: at || r3(anchor), anchors, explode: r3(p.explode ?? out) };
  }
  const point = (ref) => {
    // A point given in the recipe's own coordinates moves with the model when it is centred.
    if (Array.isArray(ref)) return r3(ref.map((v, k) => v + shift[k]));
    // {ref: 'part@front', add: [x, y, z]}: a point moved by [add] metres.
    if (typeof ref === 'object') return r3(point(ref.ref).map((v, k) => v + (ref.add?.[k] ?? 0)));
    const [id, where] = ref.split('@');
    if (id.startsWith('file:')) {
      const m = translate(load(id.slice(5)), shift);
      return r3(where ? extreme(m, dirs[where]) : centroid(m));
    }
    const part = parts.find((p) => p.id === id);
    if (!part) throw new Error(`${recipe.id}: unknown point ${ref}`);
    return r3(where ? extreme(part.mesh, dirs[where]) : facts[id].centroid);
  };
  const animations = (recipe.animations || []).map((a) => ({
    ...a,
    steps: a.steps?.map((s) => ({ ...s, paths: s.paths?.map((path) => path.map(point)) })),
  }));
  // 5. Write.
  const glb = await writeGlb(parts.map((p) => ({ id: p.id, mesh: p.mesh, color: p.color })));
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, `${recipe.id}.glb`), glb);
  const manifest = {
    id: recipe.id,
    version: recipe.version ?? 1,
    subject: recipe.subject,
    ...(recipe.order ? { order: recipe.order } : {}),
    file: `${recipe.id}.glb`,
    title: recipe.title,
    summary: recipe.summary,
    keywords: recipe.keywords,
    classes: recipe.classes,
    credit: recipe.credit,
    size: round(size),
    groups: recipe.groups,
    parts: parts.map((p) => ({
      id: p.id,
      group: p.group,
      color: p.color,
      ...(p.hidden ? { hidden: true } : {}),
      ...(p.opacity ? { opacity: p.opacity } : {}),
      ...(p.minor ? { minor: true } : {}),
      ...(p.glow ? { glow: p.glow } : {}),
      ...(p.inside ? { inside: p.inside } : {}),
      ...(p.matte !== undefined ? { matte: p.matte } : {}),
      ...(p.variant ? { variant: p.variant } : {}),
      // Hinge points and orbit centres move with the model when it is centred.
      ...(p.spin ? { spin: { ...p.spin, centre: r3((p.spin.centre || [0, 0, 0]).map((v, k) => v + shift[k])) } } : {}),
      ...(p.hinge ? { hinge: { ...p.hinge, point: r3(p.hinge.point.map((v, k) => v + shift[k])), axis: r3(p.hinge.axis), angle: round(p.hinge.angle) } } : {}),
      name: p.name,
      info: p.info,
      ...facts[p.id],
    })),
    ...(recipe.variants ? { variants: recipe.variants } : {}),
    ...(recipe.background ? { background: recipe.background } : {}),
    ...(recipe.edges ? { edges: true } : {}),
    ...(recipe.caps ? { caps: recipe.caps } : {}),
    ...(recipe.matte ? { matte: true } : {}),
    // The version the library's picture shows.
    ...(recipe.thumb ? { thumb: recipe.thumb } : {}),
    // Lit by a sun at this point (space models).
    ...(recipe.light ? { light: r3(recipe.light.map((v, k) => v + shift[k])) } : {}),
    views: recipe.views,
    // A cut can pass through a part's middle ("through": part id).
    slices: recipe.slices?.map(({ through, ...sl }) => {
      if (sl.anchors) sl = { ...sl, anchors: Object.fromEntries(Object.entries(sl.anchors).map(([id, v]) => [id, v && r3(v.map((x, k) => x + shift[k]))])) };
      if (!through) return sl;
      const n = sl.normal, c = facts[through].centroid, l = Math.hypot(...n);
      return { ...sl, offset: round((n[0] * c[0] + n[1] * c[1] + n[2] * c[2]) / l) };
    }),
    animations,
  };
  writeFileSync(join(out, `${recipe.id}.json`), JSON.stringify(manifest, null, 1) + '\n');
  const tris = parts.reduce((a, p) => a + triangles(p.mesh), 0);
  console.log(`${recipe.id}: ${parts.length} parts, ${tris} triangles, ${(glb.length / 1024).toFixed(0)} KB, ${Date.now() - t0} ms`);
  for (const p of parts) console.log(`  ${p.id.padEnd(22)} ${String(p.before).padStart(6)} -> ${String(triangles(p.mesh)).padStart(6)} tris, open edges ${openEdges(p.mesh)}`);
}

/** models/index.json: the library the app lists, from every manifest. */
function writeIndex() {
  const models = readdirSync(out)
    .filter((f) => f.endsWith('.json') && f !== 'index.json')
    .map((f) => JSON.parse(readFileSync(join(out, f), 'utf8')))
    .sort((a, b) => subjects.indexOf(a.subject) - subjects.indexOf(b.subject) || (a.order ?? 99) - (b.order ?? 99) || a.id.localeCompare(b.id))
    .map((m) => ({ id: m.id, subject: m.subject, title: m.title, summary: m.summary, keywords: m.keywords, classes: m.classes, ...(m.order ? { order: m.order } : {}) }));
  writeFileSync(join(out, 'index.json'), JSON.stringify({ version: 1, models }, null, 1) + '\n');
  console.log(`index: ${models.length} models`);
}
const subjects = ['Biology', 'Physics', 'Chemistry', 'Geography', 'Space', 'Maths'];

const bp3d = process.env.BP3D;
const wanted = process.argv.slice(2);
for (const f of readdirSync(join(here, 'recipes')).filter((f) => f.endsWith('.mjs')).sort()) {
  const recipe = (await import(join(here, 'recipes', f))).default;
  if (wanted.length && !wanted.includes(recipe.id)) continue;
  if (recipe.source === 'bp3d' && !bp3d) throw new Error('Set BP3D to the folder with the BodyParts3D zips');
  await build(recipe, bp3d);
}
writeIndex();
