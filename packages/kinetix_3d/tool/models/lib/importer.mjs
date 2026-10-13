// Reading models made by other people (glTF/GLB, STL, OBJ) into the build:
// each source primitive becomes a plain "rich" mesh in world space, keeping
// what makes it look real (its texture, vertex colours, normals and UVs), so
// a recipe can pick, join, turn, cut and simplify the pieces into named parts.
//
// A rich mesh: {positions, indices, normals?, uvs?, colors?, material}, all
// typed arrays, and material {name, color: [r, g, b, a] (linear), texture?:
// {data: Uint8Array, mime}, roughness, metalness, doubleSided, alpha}.
import { readFileSync } from 'node:fs';
import { dirname, join as joinPath } from 'node:path';
import { Document, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptSimplifier } from 'meshoptimizer';
import draco3d from 'draco3dgltf';

/** A source file as a glTF-Transform document. */
export async function readSource(file) {
  if (/\.stl$/i.test(file)) return stlDocument(readFileSync(file));
  if (/\.obj$/i.test(file)) return objDocument(file);
  if (/\.ply$/i.test(file)) return plyDocument(readFileSync(file, 'latin1'));
  await MeshoptDecoder.ready;
  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'draco3d.decoder': await draco3d.createDecoderModule() });
  return io.read(file);
}

function materialOf(m) {
  if (!m) return { name: 'default', color: [0.8, 0.8, 0.8, 1], roughness: 0.6, metalness: 0, doubleSided: false, alpha: 'OPAQUE' };
  const t = m.getBaseColorTexture();
  return {
    name: m.getName(),
    color: m.getBaseColorFactor(),
    texture: t ? { data: t.getImage(), mime: t.getMimeType(), source: t } : undefined,
    roughness: m.getRoughnessFactor(),
    metalness: m.getMetallicFactor(),
    doubleSided: m.getDoubleSided(),
    alpha: m.getAlphaMode(),
    emissive: m.getEmissiveFactor(),
  };
}

function readAttr(acc, size) {
  if (!acc) return undefined;
  const n = acc.getCount();
  const out = new Float32Array(n * size);
  const el = [];
  const s = acc.getElementSize();
  for (let i = 0; i < n; i++) {
    acc.getElement(i, el);
    for (let k = 0; k < size; k++) out[i * size + k] = k < s ? el[k] : 1;
  }
  return out;
}

function transformPoints(arr, m, isNormal) {
  const out = new Float32Array(arr.length);
  for (let i = 0; i < arr.length; i += 3) {
    const x = arr[i], y = arr[i + 1], z = arr[i + 2];
    if (isNormal) {
      // Normals use the inverse transpose; for the rotations and uniform or
      // axis scales in real files the plain matrix and a renormalise is enough.
      const nx = m[0] * x + m[4] * y + m[8] * z, ny = m[1] * x + m[5] * y + m[9] * z, nz = m[2] * x + m[6] * y + m[10] * z;
      const l = Math.hypot(nx, ny, nz) || 1;
      out[i] = nx / l;
      out[i + 1] = ny / l;
      out[i + 2] = nz / l;
    } else {
      out[i] = m[0] * x + m[4] * y + m[8] * z + m[12];
      out[i + 1] = m[1] * x + m[5] * y + m[9] * z + m[13];
      out[i + 2] = m[2] * x + m[6] * y + m[10] * z + m[14];
    }
  }
  return out;
}

/** Determinant sign of the upper 3x3: a mirrored node turns its triangles inside out. */
const mirrored = (m) => m[0] * (m[5] * m[10] - m[6] * m[9]) - m[1] * (m[4] * m[10] - m[6] * m[8]) + m[2] * (m[4] * m[9] - m[5] * m[8]) < 0;

/** Every triangle primitive of the default scene, in world space. */
export function worldPrimitives(doc) {
  const out = [];
  const root = doc.getRoot();
  const scene = root.getDefaultScene() || root.listScenes()[0];
  const visit = (node, path) => {
    const here = `${path}/${node.getName() || 'node'}`;
    const mesh = node.getMesh();
    if (mesh) {
      const world = node.getWorldMatrix();
      mesh.listPrimitives().forEach((prim, pi) => {
        if (prim.getMode() !== 4) return; // triangles only
        const pos = prim.getAttribute('POSITION');
        if (!pos) return;
        const positions = transformPoints(readAttr(pos, 3), world, false);
        const nrm = prim.getAttribute('NORMAL');
        const normals = nrm ? transformPoints(readAttr(nrm, 3), world, true) : undefined;
        const uvs = readAttr(prim.getAttribute('TEXCOORD_0'), 2);
        const colors = readAttr(prim.getAttribute('COLOR_0'), 4);
        const idx = prim.getIndices();
        let indices = idx ? Uint32Array.from(idx.getArray()) : Uint32Array.from({ length: pos.getCount() }, (_, i) => i);
        if (mirrored(world)) for (let i = 0; i < indices.length; i += 3) [indices[i + 1], indices[i + 2]] = [indices[i + 2], indices[i + 1]];
        out.push({ path: `${here}#${pi}`, node: node.getName(), mesh: mesh.getName(), positions, normals, uvs, colors, indices, material: materialOf(prim.getMaterial()) });
      });
    }
    for (const c of node.listChildren()) visit(c, here);
  };
  for (const n of scene.listChildren()) visit(n, '');
  return out;
}

/**
 * The primitives a recipe asks for: [test] is a RegExp (matched against the
 * node path, mesh name and material name) or a function of the primitive.
 */
export function pick(prims, test) {
  const f = test instanceof RegExp ? (p) => test.test(p.path) || test.test(p.mesh || '') || test.test(p.material.name || '') : test;
  return prims.filter(f);
}

const sameTexture = (a, b) => (a?.source && a.source === b?.source) || (a?.data && b?.data && a.data.length === b.data.length && Buffer.compare(Buffer.from(a.data), Buffer.from(b.data)) === 0);

/**
 * One mesh from several primitives. Plain-coloured materials that differ are
 * kept as vertex colours; textured primitives must all share one texture.
 */
export function join(prims) {
  if (!prims.length) throw new Error('join: nothing to join');
  const textured = prims.filter((p) => p.material.texture);
  if (textured.some((p) => !sameTexture(p.material.texture, textured[0].material.texture))) {
    throw new Error(`join: different textures in ${prims.map((p) => p.path).join(', ')}; split them into parts`);
  }
  if (textured.length && textured.length !== prims.length) throw new Error('join: textured and plain primitives mixed; split them into parts');
  const key = (c) => c.map((v) => v.toFixed(3)).join(',');
  const oneColour = new Set(prims.map((p) => key(p.material.color))).size === 1;
  const needColors = !oneColour || prims.some((p) => p.colors);
  const needUvs = textured.length > 0;
  const needNormals = prims.every((p) => p.normals);
  const nv = prims.reduce((a, p) => a + p.positions.length / 3, 0);
  const ni = prims.reduce((a, p) => a + p.indices.length, 0);
  const positions = new Float32Array(nv * 3), normals = needNormals ? new Float32Array(nv * 3) : undefined;
  const uvs = needUvs ? new Float32Array(nv * 2) : undefined, colors = needColors ? new Float32Array(nv * 4) : undefined;
  const indices = new Uint32Array(ni);
  let vo = 0, io = 0;
  for (const p of prims) {
    const n = p.positions.length / 3;
    positions.set(p.positions, vo * 3);
    if (normals) normals.set(p.normals, vo * 3);
    if (uvs) uvs.set(p.uvs || new Float32Array(n * 2), vo * 2);
    if (colors) {
      const f = oneColour ? [1, 1, 1, 1] : p.material.color;
      for (let i = 0; i < n; i++) for (let k = 0; k < 4; k++) colors[(vo + i) * 4 + k] = (p.colors ? p.colors[i * 4 + k] : 1) * f[k];
    }
    for (let i = 0; i < p.indices.length; i++) indices[io + i] = p.indices[i] + vo;
    vo += n;
    io += p.indices.length;
  }
  const material = { ...prims[0].material, color: oneColour ? prims[0].material.color : [1, 1, 1, 1] };
  return { positions, normals, uvs, colors, indices, material };
}

/**
 * Primitives with different textures as one part: a list of rich meshes, one
 * per texture, plus one for the plain-coloured ones (their colours kept as
 * vertex colours). The GLB keeps one primitive per texture in the part's node.
 */
export function joinTextures(prims) {
  if (!prims.length) throw new Error('joinTextures: nothing to join');
  const sets = [];
  for (const p of prims) {
    const tex = p.material.texture;
    let set = sets.find((s) => (tex ? s.tex && sameTexture(s.tex, tex) : !s.tex));
    if (!set) sets.push((set = { tex, list: [] }));
    set.list.push(tex ? p : { ...p, uvs: undefined });
  }
  const out = sets.map((s) => join(s.list));
  return out.length === 1 ? out[0] : out;
}

/** A rich part (one mesh, or one per texture) as a list. */
export const richList = (r) => (Array.isArray(r) ? r : [r]);

/** Moves a rich mesh: optional [rotate] (degrees about x, then y, then z), [scale], then [translate]. */
export function place(m, { rotate = [0, 0, 0], scale = 1, translate = [0, 0, 0] } = {}) {
  const [ax, ay, az] = rotate.map((d) => (d * Math.PI) / 180);
  const rot = (x, y, z) => {
    let [a, b, c] = [x, y * Math.cos(ax) - z * Math.sin(ax), y * Math.sin(ax) + z * Math.cos(ax)];
    [a, c] = [a * Math.cos(ay) + c * Math.sin(ay), -a * Math.sin(ay) + c * Math.cos(ay)];
    [a, b] = [a * Math.cos(az) - b * Math.sin(az), a * Math.sin(az) + b * Math.cos(az)];
    return [a, b, c];
  };
  const s = Array.isArray(scale) ? scale : [scale, scale, scale];
  const positions = new Float32Array(m.positions.length);
  const normals = m.normals ? new Float32Array(m.normals.length) : undefined;
  for (let i = 0; i < positions.length; i += 3) {
    const [x, y, z] = rot(m.positions[i], m.positions[i + 1], m.positions[i + 2]);
    positions[i] = x * s[0] + translate[0];
    positions[i + 1] = y * s[1] + translate[1];
    positions[i + 2] = z * s[2] + translate[2];
    if (normals) {
      const [a, b, c] = rot(m.normals[i] / s[0], m.normals[i + 1] / s[1], m.normals[i + 2] / s[2]);
      const l = Math.hypot(a, b, c) || 1;
      normals[i] = a / l;
      normals[i + 1] = b / l;
      normals[i + 2] = c / l;
    }
  }
  let indices = m.indices;
  if (s[0] * s[1] * s[2] < 0) {
    indices = new Uint32Array(m.indices);
    for (let i = 0; i < indices.length; i += 3) [indices[i + 1], indices[i + 2]] = [indices[i + 2], indices[i + 1]];
  }
  return { ...m, positions, normals, indices };
}

/**
 * Moves a rich mesh into another frame: each point p becomes
 * [scale] × ((p − origin)·axes[0], ·axes[1], ·axes[2]) + [translate]. The axes
 * are unit vectors at right angles (a scan's anatomy turned upright).
 */
export function orient(m, { origin = [0, 0, 0], axes, scale = 1, translate = [0, 0, 0] }) {
  const positions = new Float32Array(m.positions.length);
  const normals = m.normals ? new Float32Array(m.normals.length) : undefined;
  const dot = (a, i, u) => a[i] * u[0] + a[i + 1] * u[1] + a[i + 2] * u[2];
  const rel = new Float32Array(3);
  for (let i = 0; i < positions.length; i += 3) {
    for (let k = 0; k < 3; k++) rel[k] = m.positions[i + k] - origin[k];
    for (let k = 0; k < 3; k++) positions[i + k] = dot(rel, 0, axes[k]) * scale + translate[k];
    if (normals) for (let k = 0; k < 3; k++) normals[i + k] = dot(m.normals, i, axes[k]);
  }
  // A mirroring frame turns the triangles inside out.
  const [a, b, c] = axes;
  const det = a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0]);
  let indices = m.indices;
  if (det < 0) {
    indices = new Uint32Array(m.indices);
    for (let i = 0; i < indices.length; i += 3) [indices[i + 1], indices[i + 2]] = [indices[i + 2], indices[i + 1]];
  }
  return { ...m, positions, normals, indices };
}

/** Keeps only the vertices used, with all their attributes. */
export function compactRich(m, indices = m.indices) {
  const remap = new Int32Array(m.positions.length / 3).fill(-1);
  let n = 0;
  const idx = new Uint32Array(indices.length);
  for (let i = 0; i < indices.length; i++) {
    const v = indices[i];
    if (remap[v] < 0) remap[v] = n++;
    idx[i] = remap[v];
  }
  const take = (arr, size) => {
    if (!arr) return undefined;
    const out = new Float32Array(n * size);
    for (let v = 0; v < remap.length; v++) if (remap[v] >= 0) for (let k = 0; k < size; k++) out[remap[v] * size + k] = arr[v * size + k];
    return out;
  };
  return { ...m, positions: take(m.positions, 3), normals: take(m.normals, 3), uvs: take(m.uvs, 2), colors: take(m.colors, 4), indices: idx };
}

/** Joins vertices that are the same in every attribute (files often repeat them per triangle). */
export function weldRich(m, eps = 1e-6) {
  const n = m.positions.length / 3;
  const map = new Map();
  const remap = new Uint32Array(n);
  const keep = [];
  const q = (v) => Math.round(v / eps);
  for (let i = 0; i < n; i++) {
    let k = `${q(m.positions[i * 3])},${q(m.positions[i * 3 + 1])},${q(m.positions[i * 3 + 2])}`;
    if (m.uvs) k += `|${Math.round(m.uvs[i * 2] * 1e5)},${Math.round(m.uvs[i * 2 + 1] * 1e5)}`;
    if (m.colors) k += `|${Math.round(m.colors[i * 4] * 255)},${Math.round(m.colors[i * 4 + 1] * 255)},${Math.round(m.colors[i * 4 + 2] * 255)}`;
    if (m.normals && !m.smooth) k += `|${Math.round(m.normals[i * 3] * 50)},${Math.round(m.normals[i * 3 + 1] * 50)},${Math.round(m.normals[i * 3 + 2] * 50)}`;
    let j = map.get(k);
    if (j === undefined) {
      j = keep.length;
      map.set(k, j);
      keep.push(i);
    }
    remap[i] = j;
  }
  const idx = [];
  for (let i = 0; i < m.indices.length; i += 3) {
    const a = remap[m.indices[i]], b = remap[m.indices[i + 1]], c = remap[m.indices[i + 2]];
    if (a !== b && b !== c && a !== c) idx.push(a, b, c);
  }
  const take = (arr, size) => {
    if (!arr) return undefined;
    const out = new Float32Array(keep.length * size);
    keep.forEach((v, j) => {
      for (let k = 0; k < size; k++) out[j * size + k] = arr[v * size + k];
    });
    return out;
  };
  return { ...m, positions: take(m.positions, 3), normals: take(m.normals, 3), uvs: take(m.uvs, 2), colors: take(m.colors, 4), indices: new Uint32Array(idx) };
}

/**
 * Fewer triangles: keeps about [ratio] of them, moving no point further than
 * [error] (relative to the mesh size). Every attribute stays with its vertex.
 */
export async function simplifyRich(m, ratio, error = 0.002, { lockBorder = false } = {}) {
  await MeshoptSimplifier.ready;
  const w = weldRich(m);
  const target = Math.max(3, Math.floor((w.indices.length * ratio) / 3) * 3);
  if (target >= w.indices.length) return w;
  const [idx] = MeshoptSimplifier.simplify(w.indices, w.positions, 3, target, error, lockBorder ? ['LockBorder'] : []);
  return compactRich(w, idx);
}

/** Keeps the triangles whose centre passes [keep(x, y, z)]. */
export function clipRich(m, keep) {
  const idx = [];
  const p = m.positions;
  for (let i = 0; i < m.indices.length; i += 3) {
    const a = m.indices[i] * 3, b = m.indices[i + 1] * 3, c = m.indices[i + 2] * 3;
    if (keep((p[a] + p[b] + p[c]) / 3, (p[a + 1] + p[b + 1] + p[c + 1]) / 3, (p[a + 2] + p[b + 2] + p[c + 2]) / 3)) idx.push(m.indices[i], m.indices[i + 1], m.indices[i + 2]);
  }
  return compactRich(m, new Uint32Array(idx));
}

/** Connected pieces (sharing a position), biggest first. */
export function piecesRich(m) {
  const w = weldRich({ ...m, uvs: undefined, colors: undefined, normals: undefined });
  // w's vertex j came from the first source vertex with that position: map
  // source vertices to welded ones through positions.
  const key = (arr, i) => `${Math.round(arr[i * 3] * 1e6)},${Math.round(arr[i * 3 + 1] * 1e6)},${Math.round(arr[i * 3 + 2] * 1e6)}`;
  const wid = new Map();
  for (let j = 0; j < w.positions.length / 3; j++) wid.set(key(w.positions, j), j);
  const of = Uint32Array.from({ length: m.positions.length / 3 }, (_, i) => wid.get(key(m.positions, i)));
  const parent = Int32Array.from({ length: w.positions.length / 3 }, (_, i) => i);
  const find = (x) => {
    while (parent[x] !== x) x = parent[x] = parent[parent[x]];
    return x;
  };
  for (let i = 0; i < m.indices.length; i += 3) {
    const a = find(of[m.indices[i]]), b = find(of[m.indices[i + 1]]), c = find(of[m.indices[i + 2]]);
    parent[b] = a;
    parent[find(c)] = a;
  }
  const groups = new Map();
  for (let i = 0; i < m.indices.length; i += 3) {
    const r = find(of[m.indices[i]]);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r).push(m.indices[i], m.indices[i + 1], m.indices[i + 2]);
  }
  return [...groups.values()].sort((a, b) => b.length - a.length).map((idx) => compactRich(m, new Uint32Array(idx)));
}

/** Rich meshes into one (same material: the first one's). */
export function mergeRich(list) {
  return join(list.map((m, i) => ({ path: `piece${i}`, ...m })));
}

/** The plain {positions, indices} the rest of the build measures. */
export function plain(m) {
  if (!Array.isArray(m)) return { positions: m.positions, indices: m.indices };
  const nv = m.reduce((a, x) => a + x.positions.length, 0), ni = m.reduce((a, x) => a + x.indices.length, 0);
  const positions = new Float32Array(nv), indices = new Uint32Array(ni);
  let vo = 0, io = 0;
  for (const x of m) {
    positions.set(x.positions, vo);
    for (let i = 0; i < x.indices.length; i++) indices[io + i] = x.indices[i] + vo / 3;
    vo += x.positions.length;
    io += x.indices.length;
  }
  return { positions, indices };
}

/** A rich mesh from a three.js BufferGeometry (made in code) with a material. */
export function fromThree(g, material) {
  const geo = g.index ? g : g.toNonIndexed();
  const pos = geo.attributes.position.array;
  const indices = geo.index ? Uint32Array.from(geo.index.array) : Uint32Array.from({ length: pos.length / 3 }, (_, i) => i);
  const uv = geo.attributes.uv?.array;
  const col = geo.attributes.color;
  let colors;
  if (col) {
    colors = new Float32Array((pos.length / 3) * 4);
    for (let i = 0; i < pos.length / 3; i++) {
      for (let k = 0; k < 3; k++) colors[i * 4 + k] = col.array[i * col.itemSize + k];
      colors[i * 4 + 3] = 1;
    }
  }
  return {
    positions: Float32Array.from(pos),
    normals: geo.attributes.normal ? Float32Array.from(geo.attributes.normal.array) : undefined,
    // three.js puts v = 0 at the bottom of a picture, glTF at the top.
    uvs: uv ? Float32Array.from(uv, (x, i) => (i % 2 ? 1 - x : x)) : undefined,
    colors,
    indices,
    material: { name: 'made', color: [1, 1, 1, 1], roughness: 0.6, metalness: 0, doubleSided: false, alpha: 'OPAQUE', ...material },
  };
}

// ------------------------------------------------------------------ STL, OBJ

function docFromMeshes(meshes) {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const scene = doc.createScene('model');
  meshes.forEach((m, i) => {
    const prim = doc.createPrimitive().setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(m.positions).setBuffer(buffer));
    if (m.normals) prim.setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(m.normals).setBuffer(buffer));
    if (m.uvs) prim.setAttribute('TEXCOORD_0', doc.createAccessor().setType('VEC2').setArray(m.uvs).setBuffer(buffer));
    prim.setIndices(doc.createAccessor().setType('SCALAR').setArray(m.indices).setBuffer(buffer));
    const mat = doc.createMaterial(m.name || `m${i}`).setBaseColorFactor(m.color || [0.8, 0.8, 0.8, 1]).setRoughnessFactor(0.6).setMetallicFactor(0);
    if (m.texture) mat.setBaseColorTexture(doc.createTexture(m.name).setImage(m.texture.data).setMimeType(m.texture.mime));
    prim.setMaterial(mat);
    scene.addChild(doc.createNode(m.name || `mesh${i}`).setMesh(doc.createMesh(m.name || `mesh${i}`).addPrimitive(prim)));
  });
  doc.getRoot().setDefaultScene(scene);
  return doc;
}

/** STL (binary or text): one mesh, one triangle per facet. */
export function stlDocument(buf) {
  const pos = [];
  const isText = buf.subarray(0, 5).toString() === 'solid' && buf.toString('latin1', 0, Math.min(buf.length, 2000)).includes('facet');
  if (isText) {
    for (const line of buf.toString('latin1').split('\n')) {
      const t = line.trim();
      if (t.startsWith('vertex')) pos.push(...t.split(/\s+/).slice(1, 4).map(Number));
    }
  } else {
    const n = buf.readUInt32LE(80);
    for (let i = 0; i < n; i++) {
      const o = 84 + i * 50 + 12;
      for (let k = 0; k < 9; k++) pos.push(buf.readFloatLE(o + k * 4));
    }
  }
  const positions = new Float32Array(pos);
  return docFromMeshes([{ name: 'stl', positions, indices: Uint32Array.from({ length: positions.length / 3 }, (_, i) => i) }]);
}

/** PLY in text form (a scan's surface): its vertices and faces, one mesh. */
export function plyDocument(text) {
  const lines = text.split('\n');
  let nv = 0, nf = 0, i = 0;
  for (; i < lines.length; i++) {
    const t = lines[i].trim().split(/\s+/);
    if (t[0] === 'element' && t[1] === 'vertex') nv = Number(t[2]);
    if (t[0] === 'element' && t[1] === 'face') nf = Number(t[2]);
    if (t[0] === 'end_header') break;
  }
  const positions = new Float32Array(nv * 3);
  for (let v = 0; v < nv; v++) {
    const t = lines[++i].trim().split(/\s+/);
    for (let k = 0; k < 3; k++) positions[v * 3 + k] = Number(t[k]);
  }
  const idx = [];
  for (let f = 0; f < nf; f++) {
    const t = lines[++i].trim().split(/\s+/).map(Number);
    for (let k = 2; k < t[0]; k++) idx.push(t[1], t[k], t[k + 1]);
  }
  return docFromMeshes([{ name: 'ply', positions, indices: new Uint32Array(idx) }]);
}

/** OBJ with its MTL: one mesh per material (diffuse colour and map_Kd texture). */
export function objDocument(file) {
  const text = readFileSync(file, 'utf8');
  const mats = {};
  const lib = text.match(/^mtllib\s+(.+)$/m);
  if (lib) {
    let cur = null;
    try {
      for (const line of readFileSync(joinPath(dirname(file), lib[1].trim()), 'utf8').split('\n')) {
        const t = line.trim().split(/\s+/);
        if (t[0] === 'newmtl') mats[(cur = t[1])] = { color: [0.8, 0.8, 0.8, 1] };
        else if (cur && t[0] === 'Kd') mats[cur].color = [...t.slice(1, 4).map(Number).map((c) => Math.pow(c, 2.2)), 1];
        else if (cur && t[0] === 'd') mats[cur].color[3] = Number(t[1]);
        else if (cur && t[0] === 'map_Kd') {
          const path = joinPath(dirname(file), t.slice(1).join(' '));
          mats[cur].texture = { data: readFileSync(path), mime: /\.png$/i.test(path) ? 'image/png' : 'image/jpeg' };
          mats[cur].color = [1, 1, 1, mats[cur].color[3]];
        }
      }
    } catch {
      // No material library next to it: grey.
    }
  }
  const v = [], vt = [], vn = [];
  const groups = new Map();
  let g = null;
  const group = (name) => {
    if (!groups.has(name)) groups.set(name, { name, positions: [], uvs: [], normals: [], indices: [], keys: new Map() });
    return groups.get(name);
  };
  g = group('default');
  for (const line of text.split('\n')) {
    const t = line.trim().split(/\s+/);
    if (t[0] === 'v') v.push(t.slice(1, 4).map(Number));
    else if (t[0] === 'vt') vt.push(t.slice(1, 3).map(Number));
    else if (t[0] === 'vn') vn.push(t.slice(1, 4).map(Number));
    else if (t[0] === 'usemtl') g = group(t[1]);
    else if (t[0] === 'f') {
      const ids = t.slice(1).map((s) => {
        if (g.keys.has(s)) return g.keys.get(s);
        const [a, b, c] = s.split('/').map((x) => (x ? parseInt(x, 10) : 0));
        const at = (arr, i) => arr[i > 0 ? i - 1 : arr.length + i];
        g.positions.push(...at(v, a));
        g.uvs.push(...(b ? at(vt, b) : [0, 0]));
        g.normals.push(...(c ? at(vn, c) : [0, 0, 0]));
        const id = g.positions.length / 3 - 1;
        g.keys.set(s, id);
        return id;
      });
      for (let i = 1; i + 1 < ids.length; i++) g.indices.push(ids[0], ids[i], ids[i + 1]);
    }
  }
  const meshes = [...groups.values()]
    .filter((x) => x.indices.length)
    .map((x) => ({
      name: x.name,
      positions: new Float32Array(x.positions),
      uvs: vt.length ? new Float32Array(x.uvs) : undefined,
      normals: vn.length ? new Float32Array(x.normals) : undefined,
      indices: new Uint32Array(x.indices),
      ...(mats[x.name] || {}),
    }));
  return docFromMeshes(meshes);
}

/**
 * Splits a vertex-coloured mesh by colour: each triangle goes to the part
 * whose colour ([r, g, b], linear 0..1) is nearest its first corner's. The
 * parts lose the vertex colours (the manifest paints them).
 */
export function splitByColour(m, colours) {
  const ids = Object.keys(colours);
  const tris = Object.fromEntries(ids.map((id) => [id, []]));
  for (let i = 0; i < m.indices.length; i += 3) {
    const v = m.indices[i] * 4;
    let best = ids[0], bd = Infinity;
    for (const id of ids) {
      const c = colours[id];
      const d = (m.colors[v] - c[0]) ** 2 + (m.colors[v + 1] - c[1]) ** 2 + (m.colors[v + 2] - c[2]) ** 2;
      if (d < bd) {
        bd = d;
        best = id;
      }
    }
    tris[best].push(m.indices[i], m.indices[i + 1], m.indices[i + 2]);
  }
  return Object.fromEntries(ids.map((id) => [id, compactRich({ ...m, colors: undefined }, new Uint32Array(tris[id]))]));
}
