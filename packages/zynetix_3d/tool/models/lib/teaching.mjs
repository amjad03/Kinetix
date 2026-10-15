// More shapes for the models built in code: arrows, orbital lobes, arcs
// and coils (orbitals, hybridisation, circuits, machines, the ear, the
// nephron). Sizes are in metres of the model's own space.
import { rod, taperTube } from './shapes.mjs';

/** Text in the three languages. */
export const t = (en, hi, kn) => ({ en, hi, kn });

/** A cone-headed arrow from [a] to [b] (arrays): a shaft and a head. */
export function arrow(THREE, a, b, r = 0.0016) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const d = B.clone().sub(A);
  const len = d.length();
  const head = Math.min(len * 0.35, r * 5);
  const shaftEnd = A.clone().addScaledVector(d.normalize(), len - head);
  const cone = new THREE.ConeGeometry(r * 2.4, head, 16);
  cone.translate(0, head / 2, 0);
  cone.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d));
  cone.translate(shaftEnd.x, shaftEnd.y, shaftEnd.z);
  return [rod(THREE, a, shaftEnd.toArray(), r, 12), cone];
}

/** Turns the triangles of an indexed geometry outwards (positive enclosed volume). */
export function outwards(g) {
  const pos = g.attributes.position.array;
  const idx = g.index.array;
  let v = 0;
  for (let k = 0; k < idx.length; k += 3) {
    const [p, q, r] = [idx[k] * 3, idx[k + 1] * 3, idx[k + 2] * 3];
    v += pos[p] * (pos[q + 1] * pos[r + 2] - pos[q + 2] * pos[r + 1]) - pos[p + 1] * (pos[q] * pos[r + 2] - pos[q + 2] * pos[r]) + pos[p + 2] * (pos[q] * pos[r + 1] - pos[q + 1] * pos[r]);
  }
  if (v < 0) for (let k = 0; k < idx.length; k += 3) [idx[k + 1], idx[k + 2]] = [idx[k + 2], idx[k + 1]];
  return g;
}

/**
 * The lobes of an orbital-like shape: the surface at distance R·|f(d)|^power
 * (squared by default) from [at] in each direction d (a unit [x, y, z]),
 * keeping only the directions where f has [sign] (+1 or -1); the lobes of
 * the other sign are another call. Faces point outwards.
 */
export function polarLobes(THREE, f, R, sign, { at = [0, 0, 0], nt = 48, np = 72, power = 2 } = {}) {
  const pos = [];
  const idx = [];
  const dir = (i, j) => {
    const th = (Math.PI * i) / nt, ph = (2 * Math.PI * j) / np;
    return [Math.sin(th) * Math.cos(ph), Math.cos(th), Math.sin(th) * Math.sin(ph)];
  };
  for (let i = 0; i <= nt; i++) {
    for (let j = 0; j <= np; j++) {
      const d = dir(i, j);
      const v = f(d);
      const r = R * Math.abs(v) ** power;
      pos.push(at[0] + d[0] * r, at[1] + d[1] * r, at[2] + d[2] * r);
    }
  }
  const k = (i, j) => i * (np + 1) + j;
  for (let i = 0; i < nt; i++) {
    for (let j = 0; j < np; j++) {
      if (Math.sign(f(dir(i + 0.5, j + 0.5))) !== sign) continue;
      idx.push(k(i, j), k(i + 1, j), k(i, j + 1), k(i, j + 1), k(i + 1, j), k(i + 1, j + 1));
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return outwards(g);
}

/** Points of a circular arc round [centre] from direction [a] towards [b], radius [r]. */
export function arcPoints(THREE, centre, a, b, r, n = 24) {
  const A = new THREE.Vector3(...a).normalize(), B = new THREE.Vector3(...b).normalize();
  const angle = A.angleTo(B);
  const axis = new THREE.Vector3().crossVectors(A, B).normalize();
  const out = [];
  for (let i = 0; i <= n; i++) out.push(A.clone().applyAxisAngle(axis, (angle * i) / n).multiplyScalar(r).add(new THREE.Vector3(...centre)).toArray());
  return out;
}

/** A thin tube through [points] ([x, y, z] arrays). */
export function wire(THREE, points, r, segments = 64) {
  return taperTube(THREE, new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)), false, 'centripetal'), r, r, { segments, radial: 10 });
}

/**
 * A wire with sharp corners through [points]: one straight rod per leg and
 * a ball at each bend, so circuit diagrams keep their right angles.
 */
export function straightWire(THREE, points, r) {
  const out = [];
  for (let i = 1; i < points.length; i++) out.push(rod(THREE, points[i - 1], points[i], r, 10));
  for (let i = 1; i < points.length - 1; i++) out.push(new THREE.SphereGeometry(r, 10, 8).translate(...points[i]));
  return out;
}

/** A coil: [turns] turns of radius [r] round the axis from [a] to [b], wire radius [w]. */
export function helix(THREE, a, b, r, turns, w) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const axis = B.clone().sub(A);
  const len = axis.length();
  axis.normalize();
  const u = new THREE.Vector3(Math.abs(axis.x) < 0.9 ? 1 : 0, Math.abs(axis.x) < 0.9 ? 0 : 1, 0).cross(axis).normalize();
  const v = new THREE.Vector3().crossVectors(axis, u);
  const pts = [];
  const n = Math.ceil(turns * 24);
  for (let i = 0; i <= n; i++) {
    const s = i / n, a2 = s * turns * Math.PI * 2;
    pts.push(A.clone().addScaledVector(axis, s * len).addScaledVector(u, Math.cos(a2) * r).addScaledVector(v, Math.sin(a2) * r));
  }
  return taperTube(THREE, new THREE.CatmullRomCurve3(pts), w, w, { segments: n * 2, radial: 8 });
}

/** A ring (torus) of radius [r] and tube [tube] at [at], its axis along [axis]. */
export function ring(THREE, at, axis, r, tube, arc = Math.PI * 2) {
  const g = new THREE.TorusGeometry(r, tube, 10, 64, arc);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(...axis).normalize()));
  return g.translate(...at);
}

/** A box [sx, sy, sz] centred at [at]. */
export const box = (THREE, [sx, sy, sz], at) => new THREE.BoxGeometry(sx, sy, sz).translate(...at);

/** A prism from a 2D outline ([x, y] points) in the x-y plane, [depth] thick, centred on z = 0. */
export function extrude(THREE, outline, depth) {
  const s = new THREE.Shape(outline.map(([x, y]) => new THREE.Vector2(x, y)));
  return new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false }).translate(0, 0, -depth / 2);
}
