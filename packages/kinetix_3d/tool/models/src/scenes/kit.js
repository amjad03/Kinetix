// The scene kit: what the narrated process scenes (src/scenes/*.js) are made
// with. Smooth procedural geometry (noise-displaced blobs, lathes, tubes),
// physically based materials with a soft rim (the look of translucent
// tissue in scientific illustration), glowing particles (photons,
// electrons, ions) and ball-and-stick molecules drawn with instancing.
//
// Everything here is pure three.js and runs in the page; nothing touches the
// DOM at import time, so `node` can import a scene module to read its script.
import * as THREE from 'three';
import { mergeVertices, mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export { THREE, mergeGeometries };

// ------------------------------------------------------------------ maths

/** A repeatable random sequence (mulberry32). */
export function seeded(seed = 1) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (x) => {
  const t = clamp01(x);
  return t * t * (3 - 2 * t);
};
export const easeInOut = (x) => {
  const t = clamp01(x);
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
};
/** 0 before [a], 1 after [b], smooth between. */
export const window01 = (x, a, b) => smooth((x - a) / (b - a));
/** Rises over [a..b] and falls over [c..d]. */
export const pulse = (x, a, b, c, d) => Math.min(window01(x, a, b), 1 - window01(x, c, d));
export const fract = (x) => x - Math.floor(x);
export const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

// Simplex noise in 3D (after Stefan Gustavson's public-domain version).
const GRAD = [[1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0], [1, 0, 1], [-1, 0, 1], [1, 0, -1], [-1, 0, -1], [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1]];
const PERM = (() => {
  const r = seeded(1234);
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  return Uint8Array.from([...p, ...p]);
})();
export function noise3(x, y, z) {
  const F3 = 1 / 3, G3 = 1 / 6;
  const s = (x + y + z) * F3;
  const i = Math.floor(x + s), j = Math.floor(y + s), k = Math.floor(z + s);
  const t = (i + j + k) * G3;
  const x0 = x - (i - t), y0 = y - (j - t), z0 = z - (k - t);
  let i1, j1, k1, i2, j2, k2;
  if (x0 >= y0) {
    if (y0 >= z0) [i1, j1, k1, i2, j2, k2] = [1, 0, 0, 1, 1, 0];
    else if (x0 >= z0) [i1, j1, k1, i2, j2, k2] = [1, 0, 0, 1, 0, 1];
    else [i1, j1, k1, i2, j2, k2] = [0, 0, 1, 1, 0, 1];
  } else if (y0 < z0) [i1, j1, k1, i2, j2, k2] = [0, 0, 1, 0, 1, 1];
  else if (x0 < z0) [i1, j1, k1, i2, j2, k2] = [0, 1, 0, 0, 1, 1];
  else [i1, j1, k1, i2, j2, k2] = [0, 1, 0, 1, 1, 0];
  const pts = [
    [x0, y0, z0, 0, 0, 0],
    [x0 - i1 + G3, y0 - j1 + G3, z0 - k1 + G3, i1, j1, k1],
    [x0 - i2 + 2 * G3, y0 - j2 + 2 * G3, z0 - k2 + 2 * G3, i2, j2, k2],
    [x0 - 1 + 3 * G3, y0 - 1 + 3 * G3, z0 - 1 + 3 * G3, 1, 1, 1],
  ];
  const ii = i & 255, jj = j & 255, kk = k & 255;
  let n = 0;
  for (const [px, py, pz, a, b, c] of pts) {
    let tt = 0.6 - px * px - py * py - pz * pz;
    if (tt < 0) continue;
    const g = GRAD[PERM[ii + a + PERM[jj + b + PERM[kk + c]]] % 12];
    tt *= tt;
    n += tt * tt * (g[0] * px + g[1] * py + g[2] * pz);
  }
  return 32 * n;
}
/** Fractal noise: [oct] octaves of simplex noise. */
export function fbm(x, y, z, oct = 3) {
  let a = 0.5, f = 1, n = 0;
  for (let i = 0; i < oct; i++) {
    n += a * noise3(x * f, y * f, z * f);
    a *= 0.5;
    f *= 2.03;
  }
  return n;
}

// ------------------------------------------------------------------ geometry

/** Smooth vertex normals over shared positions (seams welded). */
export function smoothNormals(g) {
  g.deleteAttribute('normal');
  const keepUv = g.getAttribute('uv');
  if (keepUv) g.deleteAttribute('uv');
  const m = mergeVertices(g, 1e-5);
  m.computeVertexNormals();
  return m;
}

/**
 * Pushes each vertex along its direction from the centre by fractal noise:
 * organic, slightly lumpy surfaces (cells, organelles, proteins).
 */
export function displace(g, { amp = 0.05, freq = 2, seed = 0, oct = 3, axisScale = [1, 1, 1] } = {}) {
  g = g.index ? g : mergeVertices(g, 1e-5);
  if (!g.attributes.normal) g.computeVertexNormals();
  const p = g.attributes.position, n = g.attributes.normal;
  const o = seed * 17.31;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const d = amp * fbm(x * freq * axisScale[0] + o, y * freq * axisScale[1] + o * 0.7, z * freq * axisScale[2] - o, oct);
    p.setXYZ(i, x + n.getX(i) * d, y + n.getY(i) * d, z + n.getZ(i) * d);
  }
  return smoothNormals(g);
}

/** An ellipsoid of radii [rx, ry, rz], smooth and optionally lumpy. */
export function blob(rx, ry = rx, rz = rx, { detail = 24, amp = 0, freq = 2, seed = 0, oct = 3 } = {}) {
  let g = new THREE.SphereGeometry(1, detail * 2, detail);
  g.scale(rx, ry, rz);
  g = smoothNormals(g);
  return amp ? displace(g, { amp, freq, seed, oct }) : g;
}

/** A capsule-like solid of revolution about y from a profile [[r, y], ...] (bottom to top). */
export function lathe(profile, { segments = 48, phiStart = 0, phiLength = Math.PI * 2 } = {}) {
  const pts = profile.map(([r, y]) => new THREE.Vector2(Math.max(1e-5, r), y));
  return new THREE.LatheGeometry(pts, segments, phiStart, phiLength);
}

/** A smooth profile (Catmull-Rom through [[r, y]...]) with [n] points, for lathes. */
export function profileThrough(points, n = 48) {
  const c = new THREE.SplineCurve(points.map(([r, y]) => new THREE.Vector2(r, y)));
  return c.getSpacedPoints(n).map((p) => [p.x, p.y]);
}

export const curve = (points, closed = false) => new THREE.CatmullRomCurve3(points.map((p) => (p.isVector3 ? p : new THREE.Vector3(...p))), closed, 'centripetal');

/** A tube along [points] (or a curve) of radius [r] (a number or a function of u). */
export function tube(points, r, { segments = 64, radial = 12, closed = false, caps = true } = {}) {
  const c = points.getPointAt ? points : curve(points, closed);
  const rf = typeof r === 'function' ? r : () => r;
  const frames = c.computeFrenetFrames(segments, closed);
  const pos = [], idx = [];
  const ring = radial + 1;
  for (let i = 0; i <= segments; i++) {
    const u = i / segments;
    const p = c.getPointAt(u);
    const rr = rf(u);
    const N = frames.normals[i], B = frames.binormals[i];
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      const cs = Math.cos(a), sn = Math.sin(a);
      pos.push(p.x + rr * (cs * N.x + sn * B.x), p.y + rr * (cs * N.y + sn * B.y), p.z + rr * (cs * N.z + sn * B.z));
    }
  }
  for (let i = 0; i < segments; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * ring + j, b = a + 1, cc = a + ring, d = cc + 1;
      idx.push(a, cc, b, b, cc, d);
    }
  }
  if (caps && !closed) {
    for (const [i, u, dir] of [[0, 0, -1], [segments, 1, 1]]) {
      const p = c.getPointAt(u);
      const t = c.getTangentAt(u).multiplyScalar(dir * rf(u) * 0.55);
      const k = pos.length / 3;
      pos.push(p.x + t.x, p.y + t.y, p.z + t.z);
      for (let j = 0; j < radial; j++) {
        const a = i * ring + j, b = a + 1;
        if (dir < 0) idx.push(k, a, b);
        else idx.push(k, b, a);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return smoothNormals(g);
}

/** A parametric surface f(u, v, target) over [nu] x [nv] cells, with smooth normals. */
export function surface(f, nu, nv, { closedU = false } = {}) {
  const pos = [], uv = [], idx = [];
  const t = new THREE.Vector3();
  for (let j = 0; j <= nv; j++) {
    for (let i = 0; i <= nu; i++) {
      f(i / nu, j / nv, t);
      pos.push(t.x, t.y, t.z);
      uv.push(i / nu, j / nv);
    }
  }
  const row = nu + 1;
  for (let j = 0; j < nv; j++) {
    for (let i = 0; i < nu; i++) {
      const a = j * row + i, b = a + 1, c = a + row, d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  if (closedU) {
    // Average the normals across the seam.
    const n = g.attributes.normal;
    for (let j = 0; j <= nv; j++) {
      const a = j * row, b = a + nu;
      const x = (n.getX(a) + n.getX(b)) / 2, y = (n.getY(a) + n.getY(b)) / 2, z = (n.getZ(a) + n.getZ(b)) / 2;
      n.setXYZ(a, x, y, z);
      n.setXYZ(b, x, y, z);
    }
  }
  return g;
}

/**
 * A disc with rounded rims (a thylakoid, a red blood cell): a lathe of radius
 * [r] and thickness [h], optionally dimpled in the middle by [dimple].
 */
export function disc(r, h, { segments = 40, dimple = 0, rim = 0.5, rimSteps = 8 } = {}) {
  const pts = [];
  const n = rimSteps;
  // A flat face needs no rings; a dimpled one (a red blood cell) does.
  const f = dimple ? 3 : 1;
  pts.push([0.0001, -h / 2 + dimple]);
  for (let i = 0; i <= f; i++) pts.push([(r - h * rim) * (i / f), -h / 2 + dimple * (1 - (i / f) ** 2)]);
  for (let i = 0; i <= n; i++) {
    const a = -Math.PI / 2 + (i / n) * Math.PI;
    pts.push([r - h * rim + Math.cos(a) * h * rim, Math.sin(a) * h / 2]);
  }
  for (let i = f; i >= 0; i--) pts.push([(r - h * rim) * (i / f), h / 2 - dimple * (1 - (i / f) ** 2)]);
  pts.push([0.0001, h / 2 - dimple]);
  return smoothNormals(lathe(pts, { segments }));
}

/** Moves every vertex beyond the plane (n·p > d) back onto it: a flat cut face. */
export function squashBeyond(g, n, d) {
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const s = v.dot(n) - d;
    if (s > 0) {
      v.addScaledVector(n, -s);
      p.setXYZ(i, v.x, v.y, v.z);
    }
  }
  g.computeVertexNormals();
  return g;
}

/** Bends a geometry so that +x follows an arc of [radius] round the z axis. */
export function bendX(g, radius) {
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i);
    const a = x / radius;
    p.setXY(i, Math.sin(a) * (radius + y), Math.cos(a) * (radius + y) - radius);
  }
  g.computeVertexNormals();
  return g;
}

// ------------------------------------------------------------------ materials

const HL = new THREE.Color(1.0, 0.86, 0.6);

/**
 * Adds to a lit material a soft rim (light catching the edges, as in
 * translucent tissue) and a highlight the viewer sets when a part is picked,
 * pointed at or named by the narration.
 */
export function patch(m, { rim = 0, rimColor = 0xffffff, rimPower = 2.6 } = {}) {
  const u = {
    kxRim: { value: rim },
    kxRimColor: { value: new THREE.Color(rimColor) },
    kxRimPow: { value: rimPower },
    kxHl: { value: new THREE.Color(0, 0, 0) },
  };
  m.userData.kx = u;
  m.userData.kxOpts = { rim, rimColor, rimPower };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float kxRim;\nuniform vec3 kxRimColor;\nuniform float kxRimPow;\nuniform vec3 kxHl;')
      .replace(
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\n{\n  float kxF = pow(1.0 - clamp(abs(dot(normalize(vViewPosition), normal)), 0.0, 1.0), kxRimPow);\n  totalEmissiveRadiance += kxRimColor * kxRim * kxF + kxHl * (0.35 + 0.65 * kxF);\n}',
      );
  };
  m.customProgramCacheKey = () => 'kx-rim';
  return m;
}

/** A copy of a patched material with its own uniforms (each part highlights alone). */
export function cloneMaterial(m) {
  const c = m.clone();
  if (m.userData.kxOpts) patch(c, m.userData.kxOpts);
  c.userData.base = m.userData.base;
  return c;
}

/** Sets the highlight of a patched material (0 none .. 1 bright). */
export function highlight(m, amount) {
  const u = m.userData.kx;
  if (u) u.kxHl.value.copy(HL).multiplyScalar(amount);
}

/**
 * The lit, physically based material the scenes use: [color], [rough]ness,
 * [sheen] (a soft velvet edge for tissue), [clearcoat] (a wet surface),
 * [rim] light, [opacity], [emissive].
 */
export function mat({
  color = 0xffffff, rough = 0.5, metal = 0, sheen = 0, sheenColor, sheenRough = 0.6, clearcoat = 0, clearcoatRough = 0.25,
  rim = 0.12, rimColor, rimPower = 2.6, opacity = 1, emissive = 0x000000, emissiveIntensity = 1, side = THREE.FrontSide,
  map = null, bumpMap = null, bumpScale = 1, roughnessMap = null, depthWrite, flat = false, iridescence = 0, ior = 1.45,
  vertexColors = false,
} = {}) {
  const c = new THREE.Color(color);
  const m = new THREE.MeshPhysicalMaterial({
    color: c, roughness: rough, metalness: metal, sheen, sheenColor: new THREE.Color(sheenColor ?? c.clone().lerp(new THREE.Color(0xffffff), 0.15)), sheenRoughness: sheenRough,
    clearcoat, clearcoatRoughness: clearcoatRough, emissive: new THREE.Color(emissive), emissiveIntensity,
    transparent: opacity < 1, opacity, depthWrite: depthWrite ?? opacity >= 0.99, side, map, bumpMap, bumpScale, roughnessMap,
    flatShading: flat, iridescence, ior, vertexColors,
  });
  patch(m, { rim, rimColor: rimColor ?? c.clone().lerp(new THREE.Color(0xffffff), 0.25), rimPower });
  m.userData.base = { color: c.clone(), emissive: new THREE.Color(emissive), opacity };
  return m;
}

/** Unlit additive glow (light shafts, halos). */
export function glowMat(color, opacity = 0.5, { map = null, side = THREE.FrontSide } = {}) {
  return new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, map, side, toneMapped: false });
}

// ------------------------------------------------------------------ textures

let glowTex = null;
/** A soft round spot, for glows and particles. */
export function glowTexture() {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,1)');
  r.addColorStop(0.18, 'rgba(255,255,255,0.85)');
  r.addColorStop(0.45, 'rgba(255,255,255,0.22)');
  r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 64, 64);
  glowTex = new THREE.CanvasTexture(c);
  return glowTex;
}

/** A canvas texture painted by [paint(g, w, h)] (colour unless [data]). */
export function canvasTexture(w, h, paint, { data = false, repeat = null } = {}) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  paint(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = data ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(...repeat);
  }
  return t;
}

// ------------------------------------------------------------------ particles

const pointsVertex = `
attribute float size;
attribute vec3 tint;
attribute float alpha;
varying vec3 vTint;
varying float vAlpha;
uniform float uScale;
#include <clipping_planes_pars_vertex>
void main() {
  vTint = tint;
  vAlpha = alpha;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = size * uScale / max(0.0001, -mvPosition.z);
  gl_Position = projectionMatrix * mvPosition;
  #include <clipping_planes_vertex>
}`;
const pointsFragment = `
uniform sampler2D map;
varying vec3 vTint;
varying float vAlpha;
#include <clipping_planes_pars_fragment>
void main() {
  #include <clipping_planes_fragment>
  vec4 t = texture2D(map, gl_PointCoord);
  gl_FragColor = vec4(vTint * t.rgb * vAlpha * t.a, 1.0);
  #include <colorspace_fragment>
}`;

/**
 * Glowing points (photons, electrons, ions, sparks): [capacity] points, each
 * with a position, a size in world units, a colour and a brightness. Fill
 * them each frame with set(i, ...) and finish with done(n).
 */
export class GlowPoints extends THREE.Points {
  constructor(capacity, { size = 0.05 } = {}) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(capacity * 3), 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(new Float32Array(capacity).fill(size), 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('tint', new THREE.BufferAttribute(new Float32Array(capacity * 3).fill(1), 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('alpha', new THREE.BufferAttribute(new Float32Array(capacity).fill(1), 1).setUsage(THREE.DynamicDrawUsage));
    g.setDrawRange(0, 0);
    const m = new THREE.ShaderMaterial({
      uniforms: { map: { value: glowTexture() }, uScale: { value: 600 } },
      vertexShader: pointsVertex,
      fragmentShader: pointsFragment,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      clipping: true,
    });
    super(g, m);
    this.capacity = capacity;
    this.defaultSize = size;
    this.frustumCulled = false;
    this.renderOrder = 5;
    this.n = 0;
    this.userData.glowPoints = true;
    scalePoints(this);
  }

  /** Point [i]: at (x, y, z), [size] world units, colour [c] (a Color), brightness [a]. */
  set(i, x, y, z, size, c, a = 1) {
    if (i >= this.capacity) return;
    const g = this.geometry.attributes;
    g.position.setXYZ(i, x, y, z);
    g.size.setX(i, size ?? this.defaultSize);
    if (c) g.tint.setXYZ(i, c.r, c.g, c.b);
    g.alpha.setX(i, a);
  }

  /** Adds a point after the last one set; returns its index. */
  push(x, y, z, size, c, a = 1) {
    this.set(this.n, x, y, z, size, c, a);
    return this.n++;
  }

  begin() {
    this.n = 0;
  }

  done(n = this.n) {
    const g = this.geometry;
    g.setDrawRange(0, Math.min(n, this.capacity));
    for (const k of ['position', 'size', 'tint', 'alpha']) g.attributes[k].needsUpdate = true;
  }
}

// ------------------------------------------------------------------ molecules

/** Atoms as scientific illustration draws them: muted CPK colours, slightly glossy. */
export const ATOMS = {
  H: { r: 0.3, color: 0xdfe3e6 },
  C: { r: 0.48, color: 0x474b51 },
  O: { r: 0.46, color: 0xc4483f },
  N: { r: 0.46, color: 0x4a6fb5 },
  P: { r: 0.56, color: 0xd9902f },
  S: { r: 0.56, color: 0xd8bf3a },
  Mg: { r: 0.6, color: 0x7cc46a },
  Na: { r: 0.62, color: 0x8b6cc8 },
  K: { r: 0.7, color: 0x6a4fa8 },
  Ca: { r: 0.66, color: 0x9fb39a },
  Cl: { r: 0.6, color: 0x5fbf4f },
};

// Building blocks for larger molecules (in a plane, ångström-like units).
const ring = (cx, cy, r, elements, rot = 0, z = 0) =>
  elements.map((e, i) => {
    const a = rot + (i / elements.length) * Math.PI * 2;
    return [e, cx + Math.cos(a) * r, cy + Math.sin(a) * r, z + (i % 2 ? 0.12 : -0.12)];
  });
const at = (e, x, y, z = 0) => [e, x, y, z];
/** A phosphate group at (x, y): P with oxygens above, below and in front. */
const phosphate = (x, y, z = 0) => [at('P', x, y, z), at('O', x, y + 1.15, z + 0.2), at('O', x, y - 1.15, z + 0.2), at('O', x + 0.1, y, z + 1.1)];
const adenine = (x, y) => [...ring(x, y, 1.15, ['N', 'C', 'N', 'C', 'C', 'C']), ...ring(x + 1.75, y - 0.35, 0.95, ['C', 'N', 'C', 'N', 'C'], 0.5), at('N', x - 1.1, y + 1.9)];
const ribose = (x, y) => [...ring(x, y, 0.95, ['C', 'C', 'C', 'C', 'O'], 0.3), at('O', x - 0.6, y - 1.6, 0.3), at('O', x + 0.7, y - 1.6, -0.3)];
/** An organic acid of [n] carbons: a zig-zag chain with a carboxyl group at each end and a keto or hydroxyl group. */
const acid = (n) => {
  const out = [];
  const x0 = -((n - 1) * 1.25) / 2;
  for (let i = 0; i < n; i++) out.push(at('C', x0 + i * 1.25, i % 2 ? 0.35 : 0));
  out.push(at('O', x0 - 0.8, 0.9), at('O', x0 - 0.7, -1.0), at('O', -x0 + 0.8, 1.0), at('O', -x0 + 0.7, -0.9), at('O', x0 + 1.25, 1.75, 0.3));
  return out;
};
const nicotinamide = (x, y) => [...ring(x, y, 1.15, ['C', 'C', 'C', 'C', 'C', 'N']), at('C', x - 2.0, y + 0.4), at('O', x - 2.6, y + 1.3), at('N', x - 2.7, y - 0.6)];

/** Molecules as lists of [element, x, y, z] in ångström-like units (scaled when drawn). */
export const MOLECULES = {
  H2O: [at('O', 0, 0), at('H', 0.76, 0.59), at('H', -0.76, 0.59)],
  O2: [at('O', -0.6, 0), at('O', 0.6, 0)],
  CO2: [at('C', 0, 0), at('O', -1.16, 0), at('O', 1.16, 0)],
  H2: [at('H', -0.37, 0), at('H', 0.37, 0)],
  // Glucose: a ring of five carbons and an oxygen, with its OH groups and CH2OH.
  glucose: (() => {
    const out = [];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const x = Math.cos(a) * 1.45, z = Math.sin(a) * 1.45, y = i % 2 ? 0.25 : -0.25;
      out.push([i === 0 ? 'O' : 'C', x, y, z]);
      if (i && i < 5) out.push(['O', x * 1.75, y * 2.6, z * 1.75], ['H', x * 2.2, y * 3.6, z * 2.2]);
    }
    out.push(['C', 2.4, 1.1, -2.0], ['O', 3.3, 1.6, -2.6], ['H', 3.9, 2.3, -2.4]);
    return out;
  })(),
  // ATP: adenine, ribose and a chain of three phosphates.
  ATP: [...adenine(-5.6, 0.2), ...ribose(-2.2, -0.6), at('O', -0.8, 0.1), ...phosphate(0.6, 0.1), at('O', 1.9, 0.2), ...phosphate(3.2, 0.1), at('O', 4.5, 0.2), ...phosphate(5.8, 0.1), at('O', 7.0, 0.3)],
  ADP: [...adenine(-5.6, 0.2), ...ribose(-2.2, -0.6), at('O', -0.8, 0.1), ...phosphate(0.6, 0.1), at('O', 1.9, 0.2), ...phosphate(3.2, 0.1), at('O', 4.4, 0.3)],
  Pi: [at('P', 0, 0), at('O', 0.9, 0.6), at('O', -0.9, 0.6), at('O', 0, -0.7, 0.7), at('O', 0, -0.4, -0.9)],
  // NADPH: nicotinamide–ribose–phosphate–phosphate–ribose–adenine, with a third phosphate.
  NADPH: [...nicotinamide(-7.4, 0.3), at('H', -7.4, 1.9), ...ribose(-4.6, -0.5), ...phosphate(-2.4, 0.1), at('O', -1.2, 0.2), ...phosphate(0.0, 0.1), ...ribose(2.2, -0.5), ...adenine(5.0, 0.2), ...phosphate(2.4, -2.6)],
  NADP: [...nicotinamide(-7.4, 0.3), ...ribose(-4.6, -0.5), ...phosphate(-2.4, 0.1), at('O', -1.2, 0.2), ...phosphate(0.0, 0.1), ...ribose(2.2, -0.5), ...adenine(5.0, 0.2), ...phosphate(2.4, -2.6)],
  // Three- and five-carbon sugar phosphates (3-PGA / G3P, RuBP).
  C3: [at('C', -1.3, 0), at('C', 0, 0.35), at('C', 1.3, 0), at('O', -2.2, 0.8), at('O', -1.5, -1.2), at('O', 0.1, 1.7, 0.3), ...phosphate(2.9, 0.2)],
  C5: [...phosphate(-4.2, 0.2), at('C', -2.6, 0), at('C', -1.3, 0.35), at('C', 0, 0), at('C', 1.3, 0.35), at('C', 2.6, 0), at('O', -1.3, 1.7, 0.2), at('O', 0, -1.3, 0.3), at('O', 1.3, 1.7, -0.2), ...phosphate(4.2, 0.2)],
  pyruvate: [at('C', -1.25, 0), at('C', 0, 0.3), at('C', 1.25, 0), at('O', 0, 1.6), at('O', 2.2, 0.75), at('O', 1.45, -1.2), at('H', -1.9, 0.9), at('H', -1.8, -0.8), at('H', -0.9, -0.6, 0.9)],
  // Acetyl-CoA: the acetyl group on coenzyme A's long tail.
  acetylCoA: [at('C', -6.0, 0), at('C', -4.7, 0.4), at('O', -4.6, 1.7), at('S', -3.3, -0.5), at('C', -2.1, 0.2), at('C', -0.9, -0.4), at('N', 0.3, 0.2), at('C', 1.5, -0.4), at('O', 1.5, -1.7), at('C', 2.8, 0.3), at('N', 4.0, -0.3), at('C', 5.3, 0.3), ...phosphate(6.8, 0.1), ...adenine(9.6, 0.4)],
  // FADH2: the three-ring flavin, a ribitol chain and ADP.
  FADH2: [...ring(-6.0, 0, 1.1, ['C', 'C', 'C', 'C', 'C', 'C']), ...ring(-4.0, 0, 1.1, ['N', 'C', 'C', 'N', 'C', 'C']), ...ring(-2.0, 0, 1.1, ['N', 'C', 'N', 'C', 'C', 'C']), at('H', -4.0, 1.7), at('H', -2.0, -1.7), at('C', -1.0, -2.2), at('C', 0.3, -2.0), at('O', 0.4, -3.3), at('C', 1.5, -1.6), ...phosphate(2.9, -1.2), ...phosphate(4.4, -1.2), ...ribose(6.4, -1.4), ...adenine(9.2, -0.8)],
  // NADH / NAD⁺: as NADPH without its third phosphate.
  NADH: [...nicotinamide(-7.4, 0.3), at('H', -7.4, 1.9), ...ribose(-4.6, -0.5), ...phosphate(-2.4, 0.1), at('O', -1.2, 0.2), ...phosphate(0.0, 0.1), ...ribose(2.2, -0.5), ...adenine(5.0, 0.2)],
  NAD: [...nicotinamide(-7.4, 0.3), ...ribose(-4.6, -0.5), ...phosphate(-2.4, 0.1), at('O', -1.2, 0.2), ...phosphate(0.0, 0.1), ...ribose(2.2, -0.5), ...adenine(5.0, 0.2)],
  // The Krebs cycle's acids, by their carbons: a chain with carboxyl groups at the ends.
  C4: acid(4),
  C6: acid(6),
  lactate: [at('C', -1.25, 0), at('C', 0, 0.3), at('C', 1.25, 0), at('O', 0, 1.6), at('H', 0.4, 2.3), at('O', 2.2, 0.75), at('O', 1.45, -1.2), at('H', -1.9, 0.9), at('H', -1.8, -0.8)],
  ethanol: [at('C', -0.75, 0), at('C', 0.6, 0.3), at('O', 1.5, -0.5), at('H', 2.3, -0.1), at('H', -1.3, 0.8), at('H', -1.2, -0.9)],
  Na: [at('Na', 0, 0)],
  K: [at('K', 0, 0)],
  Ca: [at('Ca', 0, 0)],
  Cl: [at('Cl', 0, 0)],
  glutamate: [at('C', -1.3, 0), at('C', 0, 0.4), at('N', 0, 1.8, 0.2), at('C', 1.2, -0.4), at('C', 2.5, 0.2), at('O', 3.4, -0.5), at('O', 2.7, 1.4), at('O', -1.6, -1.2), at('O', -2.2, 0.8)],
  acetylcholine: [at('C', -3.0, 0), at('C', -1.8, 0.5), at('O', -1.8, 1.8), at('O', -0.6, -0.2), at('C', 0.6, 0.4), at('C', 1.8, -0.3), at('N', 3.0, 0.3), at('C', 3.0, 1.8), at('C', 4.2, -0.3), at('C', 3.1, -0.9, 1.0)],
};

const compacted = new Map();
/**
 * Molecule [kind] as drawn: a long one (ATP, NADPH, acetyl-CoA) curled round
 * into a compact shape, as such molecules are in water, not a straight chain.
 */
export function compactMolecule(kind) {
  if (compacted.has(kind)) return compacted.get(kind);
  const atoms = MOLECULES[kind];
  if (!atoms) throw new Error(`no molecule ${kind}`);
  let x0 = Infinity, x1 = -Infinity;
  for (const [, x] of atoms) {
    x0 = Math.min(x0, x);
    x1 = Math.max(x1, x);
  }
  const len = x1 - x0;
  let out = atoms;
  if (len > 5) {
    // Round three quarters of a turn, and a little up the axis, like a loose coil.
    const turn = Math.PI * 1.45, r = len / turn;
    out = atoms.map(([e, x, y, z]) => {
      const a = ((x - x0) / len) * turn;
      return [e, Math.cos(a) * (r + z * 0.6), y * 0.85 + (a / turn - 0.5) * r * 0.9, Math.sin(a) * (r + z * 0.6)];
    });
  }
  compacted.set(kind, out);
  return out;
}

/**
 * Many small molecules drawn with one instanced mesh per element. Each frame:
 * begin(), put(kind, position, quaternion, scale) for each molecule, end().
 */
export class MoleculeSwarm extends THREE.Group {
  constructor(capacity = 400, { scale = 0.1, detail = 1, rough = 0.32 } = {}) {
    super();
    this.unit = scale;
    this.meshes = {};
    // One sphere geometry for all: about 320 triangles at detail 2.
    const geo = new THREE.IcosahedronGeometry(1, detail);
    for (const [el, a] of Object.entries(ATOMS)) {
      const m = mat({ color: a.color, rough, clearcoat: 0.6, clearcoatRough: 0.2, rim: 0.12, sheen: 0 });
      const mesh = new THREE.InstancedMesh(geo, m, capacity);
      mesh.count = 0;
      mesh.frustumCulled = false;
      mesh.userData.decor = true;
      this.meshes[el] = mesh;
      this.add(mesh);
    }
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._v = new THREE.Vector3();
    this._s = new THREE.Vector3();
    this.capacity = capacity;
  }

  begin() {
    for (const m of Object.values(this.meshes)) m.count = 0;
  }

  /** One molecule [kind] (a MOLECULES name or a list of atoms) at [pos], turned [quat], [scale] times the unit. */
  put(kind, pos, quat, scale = 1) {
    const atoms = typeof kind === 'string' ? compactMolecule(kind) : kind;
    const u = this.unit * scale;
    for (const [el, x, y, z] of atoms) {
      const mesh = this.meshes[el];
      if (mesh.count >= this.capacity) continue;
      this._v.set(x, y, z).multiplyScalar(u);
      if (quat) this._v.applyQuaternion(quat);
      this._v.add(pos);
      const r = ATOMS[el].r * u * 1.25;
      this._s.set(r, r, r);
      this._m.compose(this._v, this._q.identity(), this._s);
      mesh.setMatrixAt(mesh.count++, this._m);
    }
  }

  end() {
    for (const m of Object.values(this.meshes)) {
      m.instanceMatrix.needsUpdate = true;
      m.visible = m.count > 0;
    }
  }
}

/** A tumbling orientation for particle [i] at time [t] (repeatable). */
export function tumble(i, t, speed = 0.6, out = new THREE.Quaternion()) {
  const e = new THREE.Euler(i * 1.7 + t * speed * 0.9, i * 2.3 + t * speed * 0.7, i * 0.9 + t * speed * 0.5);
  return out.setFromEuler(e);
}

// ------------------------------------------------------------------ instancing

/**
 * Places copies of [geometry] with [material] at the matrices [list] (an
 * array of Matrix4): one draw call for dozens of cells or organelles.
 */
export function instanced(geometry, material, list) {
  const m = new THREE.InstancedMesh(geometry, material, Math.max(1, list.length));
  list.forEach((x, i) => m.setMatrixAt(i, x));
  m.count = list.length;
  m.instanceMatrix.needsUpdate = true;
  m.computeBoundingSphere();
  m.computeBoundingBox?.();
  return m;
}

/** A transform: at [p], rotated by Euler [r], scaled by [s] (a number or [x, y, z]). */
export function trs(p = [0, 0, 0], r = [0, 0, 0], s = 1) {
  const sc = Array.isArray(s) ? new THREE.Vector3(...s) : new THREE.Vector3(s, s, s);
  return new THREE.Matrix4().compose(new THREE.Vector3(...p), new THREE.Quaternion().setFromEuler(new THREE.Euler(...r)), sc);
}

// ------------------------------------------------------------------ arrows

/**
 * A soft, curved arrow along [points] (a gentle guide for the eye, not a
 * diagram arrow): a tapered tube and a cone, unlit and slightly glowing.
 */
export function flowArrow(points, r, color, opacity = 0.55) {
  const c = curve(points);
  const g = new THREE.Group();
  const body = tube(c, (u) => r * (0.4 + 0.6 * Math.sin(Math.min(1, u * 1.15) * Math.PI * 0.5)), { segments: 48, radial: 10, caps: false });
  const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, toneMapped: false });
  g.add(new THREE.Mesh(body, m));
  const end = c.getPointAt(1), dir = c.getTangentAt(1);
  const head = new THREE.Mesh(new THREE.ConeGeometry(r * 2.4, r * 6, 18), m);
  head.position.copy(end);
  head.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  g.add(head);
  g.userData.decor = true;
  g.userData.fade = m;
  return g;
}

/** Sets the opacity of every material under [o] to its base times [k] (fading a group in or out). */
export function fade(o, k) {
  o.visible = k > 0.003;
  if (!o.visible) return;
  o.traverse((x) => {
    const ms = x.material ? (Array.isArray(x.material) ? x.material : [x.material]) : [];
    for (const m of ms) {
      if (m.userData.fadeBase === undefined) m.userData.fadeBase = m.opacity;
      const want = m.userData.fadeBase * k;
      const tr = want < 0.995 || m.userData.fadeBase < 0.995;
      if (m.transparent !== tr) {
        m.transparent = tr;
        m.depthWrite = !tr || m.userData.base?.opacity >= 0.99 && k >= 0.995;
        m.needsUpdate = true;
      }
      m.opacity = want;
    }
  });
}

// ------------------------------------------------------------------ impostors

const impVertex = `
attribute float size;
attribute vec3 tint;
varying vec3 vTint;
uniform float uScale;
uniform float uSizeScale;
#include <fog_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
  vTint = tint;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = size * uSizeScale * uScale / max(0.0001, -mvPosition.z);
  gl_Position = projectionMatrix * mvPosition;
  #include <clipping_planes_vertex>
  #include <fog_vertex>
}`;
const impFragment = `
uniform vec3 uLight;
uniform float uAmbient;
uniform vec3 uGlow;
uniform vec3 kxHl;
varying vec3 vTint;
#include <fog_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
  #include <clipping_planes_fragment>
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  c.y = -c.y;
  float d = dot(c, c);
  if (d > 1.0) discard;
  vec3 n = vec3(c, sqrt(1.0 - d));
  float diff = max(dot(n, uLight), 0.0);
  vec3 h = normalize(uLight + vec3(0.0, 0.0, 1.0));
  float spec = pow(max(dot(n, h), 0.0), 36.0) * 0.28;
  // Darker towards the edge of each sphere: the crevices between packed spheres
  // read as shadowed, as with ambient occlusion.
  float ao = mix(0.45, 1.0, smoothstep(0.0, 0.85, n.z));
  vec3 col = (vTint * (uAmbient + diff * (1.0 - uAmbient)) + vec3(spec)) * ao + (uGlow + kxHl * 0.6) * (0.4 + 0.6 * n.z);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

const _dbs = new THREE.Vector2();
/** Sets a points material's uScale so that sizes are world units at any screen size. */
function scalePoints(obj) {
  obj.onBeforeRender = (r, s, cam) => {
    r.getDrawingBufferSize(_dbs);
    obj.material.uniforms.uScale.value = _dbs.y / (2 * Math.tan(((cam.fov || 35) * Math.PI) / 360));
  };
}

/**
 * Thousands of small lit spheres as camera-facing sprites (the heads of a
 * membrane's lipids): a few triangles' cost each. [points] is a list of
 * [x, y, z, diameter, Color].
 */
export class SphereImpostors extends THREE.Points {
  constructor(points, { light = [0.4, 0.75, 0.55], ambient = 0.32 } = {}) {
    // In a shuffled order, any first part of the list is an even sample (for [density]).
    points = points.slice();
    const rnd = seeded(points.length);
    for (let i = points.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [points[i], points[j]] = [points[j], points[i]];
    }
    const n = points.length;
    const pos = new Float32Array(n * 3), size = new Float32Array(n), tint = new Float32Array(n * 3);
    points.forEach(([x, y, z, d, c], i) => {
      pos.set([x, y, z], i * 3);
      size[i] = d;
      tint.set([c.r, c.g, c.b], i * 3);
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('size', new THREE.BufferAttribute(size, 1));
    g.setAttribute('tint', new THREE.BufferAttribute(tint, 3));
    const m = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 600 }, uSizeScale: { value: 1 }, uLight: { value: new THREE.Vector3(...light).normalize() }, uAmbient: { value: ambient }, uGlow: { value: new THREE.Color(0, 0, 0) }, kxHl: { value: new THREE.Color(0, 0, 0) }, ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog) },
      vertexShader: impVertex,
      fragmentShader: impFragment,
      clipping: true,
      fog: true,
    });
    super(g, m);
    // Lit up like the lit materials when its part is picked or named.
    m.userData.kx = { kxHl: m.uniforms.kxHl };
    this.userData.decor = true;
    this.userData.glowPoints = true;
    this.isSphereImpostors = true;
    this.total = n;
    scalePoints(this);
  }

  /** Draws only a fraction [k] of the spheres, a little larger so they still cover (low quality). */
  density(k) {
    const f = Math.max(0.1, Math.min(1, k));
    this.geometry.setDrawRange(0, Math.round(this.total * f));
    this.material.uniforms.uSizeScale.value = 1 / Math.sqrt(f) * 0.92 + 0.08;
  }
}

// ------------------------------------------------------------------ light, proteins

const beamVertex = `
varying vec2 vUv;
varying float vFacing;
#include <fog_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
  vUv = uv;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  vec3 n = normalize(normalMatrix * normal);
  vFacing = abs(dot(n, normalize(-mvPosition.xyz)));
  gl_Position = projectionMatrix * mvPosition;
  #include <clipping_planes_vertex>
  #include <fog_vertex>
}`;
const beamFragment = `
uniform vec3 color;
uniform float opacity;
varying vec2 vUv;
varying float vFacing;
#include <fog_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
  #include <clipping_planes_fragment>
  // Bright in the middle of the beam, fading at its edges and at both ends.
  float along = smoothstep(0.0, 0.35, vUv.y) * (1.0 - smoothstep(0.75, 1.0, vUv.y));
  float a = opacity * along * pow(vFacing, 2.2);
  gl_FragColor = vec4(color * a, 1.0);
  #include <colorspace_fragment>
}`;

/**
 * A soft shaft of light from [from] to [to], [radius] wide: brightest in its
 * core, fading to nothing at its edges and ends (a cheap volumetric beam).
 */
export function beam(from, to, radius, { color = 0xfff1d0, opacity = 0.12, segments = 32 } = {}) {
  const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to);
  const len = a.distanceTo(b);
  const geo = new THREE.CylinderGeometry(radius * 0.7, radius, len, segments, 1, true);
  const m = new THREE.ShaderMaterial({
    uniforms: { color: { value: new THREE.Color(color) }, opacity: { value: opacity }, ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog) },
    vertexShader: beamVertex,
    fragmentShader: beamFragment,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    clipping: true,
    fog: true,
  });
  const mesh = new THREE.Mesh(geo, m);
  mesh.position.copy(a).lerp(b, 0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), b.clone().sub(a).normalize());
  mesh.userData.decor = true;
  mesh.userData.beam = true;
  mesh.renderOrder = 4;
  return mesh;
}

/**
 * A photon as a short glowing streak: a bright head and a fading tail of
 * overlapping glows from [a] towards [b], the head at u (0..1).
 */
export function streak(points, a, b, u, { size = 0.12, color, length = 0.12, n = 14 } = {}) {
  if (u <= 0 || u >= 1.02) return;
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
  for (let k = 0; k < n; k++) {
    const uu = Math.min(1, u) - (k / n) * length;
    if (uu < 0) break;
    const f = 1 - k / n;
    points.push(a.x + dx * uu, a.y + dy * uu, a.z + dz * uu, size * (0.45 + 0.55 * f), color, f * f * (k ? 0.7 : 1));
  }
}

/**
 * The surface of a protein from its lobes ([x, y, z, rx, ry, rz]): blobs merged
 * into one mesh, each lumpy at two scales like a surface of packed atoms.
 */
export function proteinGeometry(lobes, { seed = 1, detail = 17, lump = 0.085, grain = 0.032, scale = 1 } = {}) {
  const geos = lobes.map(([x, y, z, rx, ry = rx, rz = rx], i) => {
    let g = new THREE.SphereGeometry(1, detail * 2, detail);
    g.scale(rx, ry, rz);
    g = smoothNormals(g);
    const r = Math.min(rx, ry, rz);
    g = displace(g, { amp: lump * r * 2.2, freq: 1.6 / r, seed: seed * 13 + i, oct: 2 });
    g = displace(g, { amp: grain * scale, freq: 13 / scale, seed: seed * 29 + i, oct: 1 });
    g.translate(x, y, z);
    return g;
  });
  const merged = mergeGeometries(geos);
  merged.computeBoundingSphere();
  return merged;
}

/** A protein's look: soft, slightly velvety, with a gentle rim, in a muted colour. */
export function proteinMat(color, { rim = 0.16, rough = 0.62, sheen = 0.15, opacity = 1 } = {}) {
  const c = new THREE.Color(color);
  return mat({ color: c, rough, sheen, sheenColor: c.clone().lerp(new THREE.Color(0xffffff), 0.3), sheenRough: 0.5, rim, rimColor: c.clone().lerp(new THREE.Color(0xffffff), 0.45), rimPower: 2.2, clearcoat: 0.08, opacity });
}

// ------------------------------------------------------------------ space-filling proteins

/**
 * A protein as molecular illustration draws it: a space-filling cluster of
 * atoms over the surface of its lobes ([x, y, z, rx, ry, rz]), drawn as cheap
 * sphere sprites, with a dark core (lobes slightly shrunk) behind them that
 * fills the gaps and is what taps and the laser hit. [glow(r, g, b)] lights it.
 */
export function atomCluster(lobes, color, { atom = 0.075, seed = 1, rough = 0.18, tint = 0.07, core = 0.9 } = {}) {
  const rnd = seeded(seed * 7919 + 3);
  const base = new THREE.Color(color);
  const pts = [];
  const inside = (x, y, z, skip) => lobes.some(([cx, cy, cz, rx, ry = rx, rz = rx], j) => j !== skip && ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 + ((z - cz) / rz) ** 2 < 0.9);
  const hsl = {};
  base.getHSL(hsl);
  lobes.forEach(([cx, cy, cz, rx, ry = rx, rz = rx], j) => {
    // Points spread evenly over the ellipsoid (a Fibonacci sphere, stretched).
    const area = 4 * Math.PI * Math.pow((Math.pow(rx * ry, 1.6) + Math.pow(rx * rz, 1.6) + Math.pow(ry * rz, 1.6)) / 3, 1 / 1.6);
    const n = Math.max(12, Math.round(area / (atom * atom * 0.95)));
    const golden = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < n; i++) {
      const y = 1 - (2 * (i + 0.5)) / n;
      const r = Math.sqrt(1 - y * y);
      const a = i * golden + j;
      const dx = Math.cos(a) * r, dz = Math.sin(a) * r;
      // Bumpy at the scale of a few atoms, like a real molecular surface.
      const bump = 1 + 0.18 * atom * fbm(dx * 3 + j, y * 3 - j, dz * 3, 2) / Math.min(rx, ry, rz) * 6;
      const x = cx + dx * rx * bump + (rnd() - 0.5) * atom * rough;
      const yy = cy + y * ry * bump + (rnd() - 0.5) * atom * rough;
      const z = cz + dz * rz * bump + (rnd() - 0.5) * atom * rough;
      if (inside(x, yy, z, j)) continue;
      // Each atom a little lighter or darker, a few of another shade.
      const c = new THREE.Color().setHSL(hsl.h + (rnd() < 0.06 ? 0.04 : 0) + (rnd() - 0.5) * 0.015, hsl.s * (0.92 + rnd() * 0.16), hsl.l * (1 - tint + rnd() * tint * 2));
      pts.push([x, yy, z, atom * (1.18 + rnd() * 0.2), c]);
    }
  });
  const g = new THREE.Group();
  const coreLobes = lobes.map(([x, y, z, rx, ry = rx, rz = rx]) => [x, y, z, rx * core, ry * core, rz * core]);
  const coreMesh = new THREE.Mesh(proteinGeometry(coreLobes, { seed, detail: 10, lump: 0.02, grain: 0 }), mat({ color: base.clone().multiplyScalar(0.28), rough: 0.9, rim: 0 }));
  g.add(coreMesh);
  const sprites = new SphereImpostors(pts, { light: [0.35, 0.8, 0.5], ambient: 0.36 });
  g.add(sprites);
  g.userData.atoms = sprites;
  g.userData.glow = (r, gg, b) => sprites.material.uniforms.uGlow.value.setRGB(r, gg, b);
  return g;
}
