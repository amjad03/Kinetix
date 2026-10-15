// Shared by the DNA scenes: nucleotides drawn as molecular illustration
// draws them (a phosphate and a sugar on the backbone, a base reaching in to
// its partner), many at once with instancing, and double helices built from them.
import { THREE, mat } from './kit.js';

/** Base colours, muted, as in molecular illustration. */
export const BASE = { A: '#c8594f', T: '#d9b44a', G: '#4f8a6b', C: '#4f74a8', U: '#b98ac8' };
export const PAIR = { A: 'T', T: 'A', G: 'C', C: 'G' };
export const RNA_PAIR = { A: 'U', T: 'A', G: 'C', C: 'G' };
export const BACKBONE = { old: '#c99a5a', new: '#8fb3d9', rna: '#8cc48a' };

/** The helix's numbers: its radius, the rise per base pair, the turn per base pair. */
export const R = 1.0, RISE = 0.34, TURN = (Math.PI * 2) / 10;

/**
 * Up to [capacity] nucleotides. Each frame: begin(), put(...) for each, end().
 * A nucleotide's own frame: +x along its strand, +y out from the helix axis
 * (the base points down −y to the middle), origin on the axis.
 */
export class Nucleotides extends THREE.Group {
  constructor(capacity, { quality = 1 } = {}) {
    super();
    const sphere = new THREE.IcosahedronGeometry(1, quality > 0.5 ? 2 : 1);
    const ball = (m) => {
      const im = new THREE.InstancedMesh(sphere, m, capacity);
      im.frustumCulled = false;
      im.count = 0;
      this.add(im);
      return im;
    };
    const white = (o = {}) => mat({ color: '#ffffff', rough: 0.4, clearcoat: 0.5, clearcoatRough: 0.2, rim: 0.15, ...o });
    this.phosphate = ball(white());
    this.sugar = ball(white({ rough: 0.5 }));
    // Bases: a rounded slab (a flattened capsule), one mesh per kind for its colour.
    const slab = new THREE.CapsuleGeometry(0.15, 0.62, 4, 10);
    slab.scale(1, 1, 0.55);
    this.bases = {};
    for (const [k, c] of Object.entries(BASE)) {
      const im = new THREE.InstancedMesh(slab, mat({ color: c, rough: 0.45, clearcoat: 0.4, sheen: 0.3, rim: 0.15 }), capacity);
      im.frustumCulled = false;
      im.count = 0;
      this.bases[k] = im;
      this.add(im);
    }
    this._m = new THREE.Matrix4();
    this._v = new THREE.Vector3();
    this._s = new THREE.Vector3();
    this._c = new THREE.Color();
    this._q = new THREE.Quaternion();
    this.capacity = capacity;
  }

  begin() {
    this.phosphate.count = this.sugar.count = 0;
    for (const m of Object.values(this.bases)) m.count = 0;
  }

  _ball(mesh, local, origin, quat, r, color) {
    if (mesh.count >= this.capacity) return;
    this._v.copy(local).applyQuaternion(quat).add(origin);
    this._s.setScalar(r);
    this._m.compose(this._v, this._q.identity(), this._s);
    mesh.setMatrixAt(mesh.count, this._m);
    mesh.setColorAt(mesh.count, this._c.set(color));
    mesh.count++;
  }

  /**
   * A nucleotide of base [type] at [origin] (its point on the helix axis)
   * turned by [quat], scaled [k] (0 hides it), backbone [color]; [reach]
   * shortens the base (1: to the axis).
   */
  put(type, origin, quat, color, k = 1, reach = 1) {
    if (k <= 0.01) return;
    const L = new THREE.Vector3();
    this._ball(this.phosphate, L.set(0, R + 0.08, 0).multiplyScalar(1), origin, quat, 0.21 * k, color);
    this._ball(this.sugar, L.set(0.13, R - 0.24, 0.1), origin, quat, 0.2 * k, new THREE.Color(color).lerp(new THREE.Color('#f2ece0'), 0.45));
    const mesh = this.bases[type];
    if (!mesh || mesh.count >= this.capacity) return;
    // The base runs from the sugar in towards the axis.
    const top = R - 0.38, bottom = 0.04 + (1 - reach) * (R - 0.4);
    this._v.set(0.08, (top + bottom) / 2, 0.06).applyQuaternion(quat).add(origin);
    this._s.set(k, k * ((top - bottom) / 0.92), k);
    this._m.compose(this._v, quat, this._s);
    mesh.setMatrixAt(mesh.count++, this._m);
  }

  end() {
    for (const m of [this.phosphate, this.sugar, ...Object.values(this.bases)]) {
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
      m.visible = m.count > 0;
    }
  }
}

const X = new THREE.Vector3(1, 0, 0);
/** The turn of strand [s] (0 or 1) at base pair [i]: about the x axis, the second strand opposite with a minor groove. */
export function strandQuat(i, s, out = new THREE.Quaternion(), phase = 0) {
  return out.setFromAxisAngle(X, i * TURN + phase + (s ? Math.PI * 0.78 : 0));
}

/** A random sequence of [n] bases (repeatable from [rnd]). */
export const sequence = (n, rnd) => Array.from({ length: n }, () => 'ATGC'[(rnd() * 4) | 0]);
