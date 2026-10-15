// Organelles for the cell models (animal and plant), built in code.
import { taperTube, curveThrough, blob } from './shapes.mjs';

/** A point inside an ellipsoid of half-sizes [r], away from [avoid] spheres. */
export function placeIn(rnd, r, avoid = [], margin = 0) {
  for (let tries = 0; tries < 400; tries++) {
    const p = [0, 1, 2].map((k) => (rnd() * 2 - 1) * r[k]);
    const inside = p[0] ** 2 / r[0] ** 2 + p[1] ** 2 / r[1] ** 2 + p[2] ** 2 / r[2] ** 2 < 1;
    if (!inside) continue;
    if (avoid.every(([c, rad]) => Math.hypot(p[0] - c[0], p[1] - c[1], p[2] - c[2]) > rad + margin)) return p;
  }
  return [0, 0, 0];
}

function orient(THREE, g, rnd, at) {
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rnd() * Math.PI, rnd() * Math.PI, rnd() * Math.PI));
  g.applyQuaternion(q);
  g.translate(...at);
  return g;
}

/** Bean-shaped mitochondria with inner folds (cristae) that show when cut. */
export function mitochondria(THREE, rnd, places, size = 0.009) {
  const outer = [], cristae = [];
  for (const at of places) {
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rnd() * Math.PI, rnd() * Math.PI, rnd() * Math.PI));
    const g = new THREE.CapsuleGeometry(size, size * 2.2, 8, 16);
    g.applyQuaternion(q);
    g.translate(...at);
    outer.push(g);
    for (let k = -2; k <= 2; k++) {
      const plate = new THREE.BoxGeometry(size * 1.5, size * 0.16, size * 1.3);
      plate.translate(0, k * size * 0.55, 0);
      plate.rotateZ((k % 2) * 0.25);
      plate.applyQuaternion(q);
      plate.translate(...at);
      cristae.push(plate);
    }
  }
  return { outer, cristae };
}

/** Golgi apparatus: a stack of curved flat sacs with small vesicles. */
export function golgi(THREE, rnd, at, size = 0.022) {
  const sacs = [], vesicles = [];
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.3, rnd() * Math.PI, 0.2));
  for (let k = 0; k < 5; k++) {
    const r = size * (1 - Math.abs(k - 2) * 0.12);
    const g = new THREE.SphereGeometry(r, 32, 6, 0, Math.PI * 2, 0.9, 0.55);
    // Give the sac a thickness: a slightly smaller copy, reversed, closes it.
    const inner = new THREE.SphereGeometry(r * 0.94, 32, 6, 0, Math.PI * 2, 0.9, 0.55);
    const idx = inner.index.array;
    for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]];
    for (const s of [g, inner]) {
      s.scale(1, 0.55, 1);
      s.translate(0, -k * size * 0.16, 0);
      s.applyQuaternion(q);
      s.translate(...at);
      sacs.push(s);
    }
  }
  for (let k = 0; k < 10; k++) {
    const a = rnd() * Math.PI * 2;
    const v = new THREE.Vector3(Math.cos(a) * size * 1.15, -rnd() * size * 0.8, Math.sin(a) * size * 1.15).applyQuaternion(q);
    vesicles.push(blob(THREE, [at[0] + v.x, at[1] + v.y, at[2] + v.z], size * 0.12, size * 0.12, size * 0.12, 2));
  }
  return { sacs, vesicles };
}

/** Endoplasmic reticulum: folded tubes around the nucleus; rough ER has ribosomes on it. */
export function reticulum(THREE, rnd, centre, from, to, count, { rough = true, thick = 0.0032 } = {}) {
  const tubes = [], ribosomes = [];
  for (let k = 0; k < count; k++) {
    const r = from + ((to - from) * k) / Math.max(1, count - 1);
    const a0 = rnd() * Math.PI * 2, span = 1.2 + rnd() * 1.2, tilt = (rnd() - 0.5) * 1.2;
    const pts = [];
    for (let s = 0; s <= 10; s++) {
      const a = a0 + (span * s) / 10;
      const wob = 1 + Math.sin(s * 1.7 + k) * 0.08;
      pts.push([centre[0] + Math.cos(a) * r * wob, centre[1] + Math.sin(a) * r * wob * Math.cos(tilt), centre[2] + Math.sin(a) * r * Math.sin(tilt) + Math.sin(s * 2.1) * r * 0.08]);
    }
    const curve = curveThrough(THREE, pts);
    tubes.push(taperTube(THREE, curve, thick, thick, { segments: 40, radial: 10 }));
    if (rough) {
      for (let s = 0; s < 26; s++) {
        const p = curve.getPointAt(rnd());
        const off = new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize().multiplyScalar(thick * 1.1);
        ribosomes.push(blob(THREE, [p.x + off.x, p.y + off.y, p.z + off.z], thick * 0.42, thick * 0.42, thick * 0.42, 1));
      }
    }
  }
  return { tubes, ribosomes };
}

/** Chloroplasts: green lens shapes with stacks of discs (grana) inside. */
export function chloroplasts(THREE, rnd, places, size = 0.012) {
  const outer = [], grana = [];
  for (const at of places) {
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rnd() * Math.PI, rnd() * Math.PI, rnd() * Math.PI));
    const g = new THREE.IcosahedronGeometry(1, 4);
    g.scale(size, size * 0.5, size * 0.7);
    g.applyQuaternion(q);
    g.translate(...at);
    outer.push(g);
    for (let k = 0; k < 4; k++) {
      const x = (k - 1.5) * size * 0.45;
      for (let d = 0; d < 4; d++) {
        const disc = new THREE.CylinderGeometry(size * 0.16, size * 0.16, size * 0.05, 12);
        disc.translate(x, (d - 1.5) * size * 0.07, 0);
        disc.applyQuaternion(q);
        disc.translate(...at);
        grana.push(disc);
      }
    }
  }
  return { outer, grana };
}

/** A centrosome: two centrioles at right angles, each a ring of nine tubes. */
export function centrosome(THREE, at, size = 0.006) {
  const rods = [];
  for (const [rx, rz] of [[0, 0], [Math.PI / 2, 0]]) {
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * Math.PI * 2;
      const g = new THREE.CylinderGeometry(size * 0.12, size * 0.12, size * 2, 8);
      g.translate(Math.cos(a) * size * 0.6, 0, Math.sin(a) * size * 0.6);
      g.rotateX(rx);
      g.rotateZ(rz);
      g.translate(at[0] + (rx ? size * 1.4 : 0), at[1], at[2]);
      rods.push(g);
    }
  }
  return rods;
}

export { orient };
