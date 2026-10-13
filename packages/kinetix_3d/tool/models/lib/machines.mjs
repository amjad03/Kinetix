// Parts of electrical machines built in code, all along the z axis (the
// shaft): tubes, discs, annular sectors, slotted stator and rotor cores, and
// conductors in the slots. Low-poly on purpose: the library's machines stay
// a few hundred kilobytes.

/** A closed tube from radius [rIn] to [rOut], from z0 to z1. */
export function tube(THREE, rIn, rOut, z0, z1, seg = 48) {
  return extrudeLoops(THREE, circle(rOut, seg), [circle(rIn, seg).reverse()], z0, z1);
}

/** A solid cylinder of radius [r] from z0 to z1. */
export function disc(THREE, r, z0, z1, seg = 40) {
  return new THREE.CylinderGeometry(r, r, z1 - z0, seg).rotateX(Math.PI / 2).translate(0, 0, (z0 + z1) / 2);
}

/** An annular sector from angle a0 to a1 (radians, from +x towards +y). */
export function sector(THREE, rIn, rOut, a0, a1, z0, z1, n = 10) {
  const pts = [];
  for (let k = 0; k <= n; k++) pts.push(polar(rOut, a0 + ((a1 - a0) * k) / n));
  for (let k = n; k >= 0; k--) pts.push(polar(rIn, a0 + ((a1 - a0) * k) / n));
  return extrudeLoops(THREE, pts, [], z0, z1);
}

/**
 * A laminated core with [slots] open slots: a stator (slots on the inside,
 * [inner] true) or a rotor (slots on the outside). [depth] and [width] are
 * the slot's depth and its width as a fraction of the slot pitch.
 */
export function slottedCore(THREE, rIn, rOut, slots, depth, width, z0, z1, { inner = true } = {}) {
  const slotted = [];
  const r = inner ? rIn : rOut;
  const rs = inner ? rIn + depth : rOut - depth;
  for (let k = 0; k < slots; k++) {
    const pitch = (2 * Math.PI) / slots, a = k * pitch, half = (pitch * width) / 2;
    slotted.push(polar(r, a - pitch / 2 + 0.0001), polar(r, a - half), polar(rs, a - half), polar(rs, a + half), polar(r, a + half));
  }
  if (inner) return extrudeLoops(THREE, circle(rOut, 64), [slotted.reverse()], z0, z1);
  return rIn > 0 ? extrudeLoops(THREE, slotted, [circle(rIn, 32).reverse()], z0, z1) : extrudeLoops(THREE, slotted, [], z0, z1);
}

/** One conductor per slot: a bar at radius [r] (centre) for each slot index in [which]. */
export function slotBars(THREE, r, slots, which, size, z0, z1, { skew = 0 } = {}) {
  const out = [];
  for (const k of which) {
    const a = (k * 2 * Math.PI) / slots;
    const g = new THREE.BoxGeometry(size, size, z1 - z0);
    g.translate(r, 0, (z0 + z1) / 2);
    if (skew) {
      // Twist the bar: its far end turned by [skew] radians.
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const t = (p.getZ(i) - z0) / (z1 - z0) - 0.5;
        const x = p.getX(i), y = p.getY(i), c = Math.cos(skew * t), s = Math.sin(skew * t);
        p.setXY(i, x * c - y * s, x * s + y * c);
      }
    }
    out.push(g.rotateZ(a));
  }
  return out;
}

/** A ring (torus) round the shaft at z, [r] its radius and [tube] its thickness; [arc] of it. */
export function ringZ(THREE, r, tubeR, z, { arc = Math.PI * 2, start = 0, seg = 40 } = {}) {
  return new THREE.TorusGeometry(r, tubeR, 8, seg, arc).rotateZ(start).translate(0, 0, z);
}

const polar = (r, a) => ({ x: r * Math.cos(a), y: r * Math.sin(a) });
const circle = (r, n) => Array.from({ length: n }, (_, k) => polar(r, (k * 2 * Math.PI) / n));

function extrudeLoops(THREE, outer, holes, z0, z1) {
  const shape = new THREE.Shape(outer.map((p) => new THREE.Vector2(p.x, p.y)));
  for (const h of holes) shape.holes.push(new THREE.Path(h.map((p) => new THREE.Vector2(p.x, p.y))));
  return new THREE.ExtrudeGeometry(shape, { depth: z1 - z0, bevelEnabled: false, curveSegments: 1 }).translate(0, 0, z0);
}
