// Shapes for the models built in code (cells, neurons, flowers, planets…).
// All sizes are in metres of the model's own space; the viewer scales the
// camera to the model.

/** A repeatable random sequence, so a rebuild gives the same model. */
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

/**
 * A tube along [curve] whose radius goes from [r0] to [r1], closed with
 * rounded ends so that it is a solid surface.
 */
export function taperTube(THREE, curve, r0, r1, { segments = 48, radial = 12, caps = true } = {}) {
  const frames = curve.computeFrenetFrames(segments, false);
  const pos = [];
  const idx = [];
  for (let i = 0; i <= segments; i++) {
    const u = i / segments;
    const p = curve.getPointAt(u);
    const r = r0 + (r1 - r0) * u;
    const n = frames.normals[i], b = frames.binormals[i];
    for (let j = 0; j < radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      pos.push(p.x + r * (Math.cos(a) * n.x + Math.sin(a) * b.x), p.y + r * (Math.cos(a) * n.y + Math.sin(a) * b.y), p.z + r * (Math.cos(a) * n.z + Math.sin(a) * b.z));
    }
  }
  for (let i = 0; i < segments; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * radial + j, b = i * radial + ((j + 1) % radial), c = (i + 1) * radial + j, d = (i + 1) * radial + ((j + 1) % radial);
      idx.push(a, c, b, b, c, d);
    }
  }
  if (caps) {
    // A point at each end, pulled out a little, closes the tube.
    for (const [ring, u, dir] of [[0, 0, -1], [segments, 1, 1]]) {
      const p = curve.getPointAt(u);
      const t = curve.getTangentAt(u).multiplyScalar(dir * (u === 0 ? r0 : r1) * 0.6);
      const k = pos.length / 3;
      pos.push(p.x + t.x, p.y + t.y, p.z + t.z);
      for (let j = 0; j < radial; j++) {
        const a = ring * radial + j, b = ring * radial + ((j + 1) % radial);
        if (dir < 0) idx.push(k, a, b);
        else idx.push(k, b, a);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}

/** A smooth curve through [points] ([x, y, z] arrays). */
export const curveThrough = (THREE, points) => new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)), false, 'centripetal');

/**
 * A branching tree of tapering tubes from [start] along [dir] (like
 * dendrites): [depth] levels, each branch splitting in [split].
 */
export function branches(THREE, rnd, start, dir, { length = 0.06, radius = 0.006, depth = 3, split = 2, spread = 0.7, shrink = 0.72 } = {}) {
  const out = [];
  const grow = (from, d, len, r, level) => {
    const bend = new THREE.Vector3((rnd() - 0.5) * 0.5, (rnd() - 0.5) * 0.5, (rnd() - 0.5) * 0.5);
    const mid = from.clone().add(d.clone().multiplyScalar(len * 0.5)).add(bend.multiplyScalar(len * 0.3));
    const end = from.clone().add(d.clone().multiplyScalar(len));
    const curve = new THREE.CatmullRomCurve3([from, mid, end]);
    out.push({ geometry: taperTube(THREE, curve, r, r * shrink, { segments: 16, radial: 8 }), tip: end, level });
    if (level >= depth) return;
    for (let k = 0; k < split; k++) {
      const nd = d.clone().add(new THREE.Vector3((rnd() - 0.5) * spread * 2, (rnd() - 0.5) * spread * 2, (rnd() - 0.5) * spread * 2)).normalize();
      grow(end, nd, len * (0.65 + rnd() * 0.2), r * shrink, level + 1);
    }
  };
  grow(new THREE.Vector3(...start), new THREE.Vector3(...dir).normalize(), length, radius, 1);
  return out;
}

/** A sphere squashed or stretched to [sx, sy, sz] at [at]. */
export function blob(THREE, at, sx, sy = sx, sz = sx, detail = 3) {
  const g = new THREE.IcosahedronGeometry(1, detail);
  g.scale(sx, sy, sz);
  g.translate(...at);
  return g;
}

/** A closed cylinder from [a] to [b] (arrays) of radius [r]. */
export function rod(THREE, a, b, r, radial = 16) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const len = A.distanceTo(B);
  const g = new THREE.CylinderGeometry(r, r, len, radial, 1, false);
  g.translate(0, len / 2, 0);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize());
  g.applyQuaternion(q);
  g.translate(A.x, A.y, A.z);
  return g;
}

/**
 * A closed solid of revolution about the y axis: [loop] is its outline as
 * [radius, height] points going round once (not repeated at the end), so a
 * ring-shaped outline makes a hollow shell. Faces point outwards.
 */
export function revolve(THREE, loop, seg = 96) {
  const pos = [];
  const idx = [];
  for (let j = 0; j < seg; j++) {
    const a = (j / seg) * Math.PI * 2;
    for (const [r, y] of loop) pos.push(r * Math.sin(a), y, r * Math.cos(a));
  }
  const n = loop.length;
  for (let j = 0; j < seg; j++) {
    const j2 = (j + 1) % seg;
    for (let i = 0; i < n; i++) {
      const i2 = (i + 1) % n;
      const a = j * n + i, b = j * n + i2, c = j2 * n + i, d = j2 * n + i2;
      idx.push(a, b, c, b, d, c);
    }
  }
  // Outwards: the enclosed volume comes out positive.
  let v = 0;
  for (let k = 0; k < idx.length; k += 3) {
    const [p, q, r] = [idx[k] * 3, idx[k + 1] * 3, idx[k + 2] * 3];
    v += pos[p] * (pos[q + 1] * pos[r + 2] - pos[q + 2] * pos[r + 1]) - pos[p + 1] * (pos[q] * pos[r + 2] - pos[q + 2] * pos[r]) + pos[p + 2] * (pos[q] * pos[r + 1] - pos[q + 1] * pos[r]);
  }
  if (v < 0) for (let k = 0; k < idx.length; k += 3) [idx[k + 1], idx[k + 2]] = [idx[k + 2], idx[k + 1]];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}

/**
 * A thin closed sheet (a petal, a leaf): [fn](u, v) gives the middle surface
 * as [x, y, z] for u and v from 0 to 1; the sheet is [thickness] thick.
 * Faces point outwards.
 */
export function sheet(THREE, fn, { nu = 24, nv = 10, thickness = 0.0008 } = {}) {
  const P = (u, v) => new THREE.Vector3(...fn(Math.min(1, Math.max(0, u)), Math.min(1, Math.max(0, v))));
  const pos = [];
  const e = 1e-3;
  const grid = (sign) => {
    const base = pos.length / 3;
    for (let i = 0; i <= nu; i++) {
      for (let j = 0; j <= nv; j++) {
        const u = i / nu, v = j / nv;
        const du = P(u + e, v).sub(P(u - e, v));
        const dv = P(u, v + e).sub(P(u, v - e));
        const n = du.cross(dv);
        if (n.lengthSq() < 1e-18) n.set(0, 1, 0);
        const p = P(u, v).addScaledVector(n.normalize(), (sign * thickness) / 2);
        pos.push(p.x, p.y, p.z);
      }
    }
    return base;
  };
  const top = grid(1), bottom = grid(-1);
  const T = (i, j) => top + i * (nv + 1) + j, B = (i, j) => bottom + i * (nv + 1) + j;
  const idx = [];
  for (let i = 0; i < nu; i++) {
    for (let j = 0; j < nv; j++) {
      idx.push(T(i, j), T(i + 1, j), T(i + 1, j + 1), T(i, j), T(i + 1, j + 1), T(i, j + 1));
      idx.push(B(i, j), B(i + 1, j + 1), B(i + 1, j), B(i, j), B(i, j + 1), B(i + 1, j + 1));
    }
  }
  // The edges, joining top and bottom.
  for (let i = 0; i < nu; i++) {
    idx.push(T(i + 1, 0), T(i, 0), B(i, 0), T(i + 1, 0), B(i, 0), B(i + 1, 0));
    idx.push(T(i, nv), T(i + 1, nv), B(i + 1, nv), T(i, nv), B(i + 1, nv), B(i, nv));
  }
  for (let j = 0; j < nv; j++) {
    idx.push(T(0, j), T(0, j + 1), B(0, j + 1), T(0, j), B(0, j + 1), B(0, j));
    idx.push(T(nu, j + 1), T(nu, j), B(nu, j), T(nu, j + 1), B(nu, j), B(nu, j + 1));
  }
  let v = 0;
  for (let k = 0; k < idx.length; k += 3) {
    const [p, q, r] = [idx[k] * 3, idx[k + 1] * 3, idx[k + 2] * 3];
    v += pos[p] * (pos[q + 1] * pos[r + 2] - pos[q + 2] * pos[r + 1]) - pos[p + 1] * (pos[q] * pos[r + 2] - pos[q + 2] * pos[r]) + pos[p + 2] * (pos[q] * pos[r + 1] - pos[q + 1] * pos[r]);
  }
  if (v < 0) for (let k = 0; k < idx.length; k += 3) [idx[k + 1], idx[k + 2]] = [idx[k + 2], idx[k + 1]];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}
