// Shapes for microscopic models (a bacterium, a mitochondrion), in their own
// units (micrometres): capsules made of hollow shells, closed tangled loops
// and points scattered inside a capsule.
import { revolve } from './shapes.mjs';

/**
 * A capsule along the x axis (a cylinder [2 × half] long with round ends):
 * solid with radius [r0], or a hollow shell between [r0] and [r1].
 */
export function capsule(THREE, half, r0, r1 = 0, seg = 48) {
  const side = (r, from, to, n) => {
    const out = [];
    for (let i = 0; i <= n; i++) {
      const a = from + ((to - from) * i) / n;
      out.push([r * Math.cos(a), (a < 0 ? -half : half) + r * Math.sin(a)]);
    }
    return out;
  };
  const outline = (r) => [...side(r, -Math.PI / 2, -0.0001, 12), ...side(r, 0.0001, Math.PI / 2, 12)];
  const outer = outline(r0);
  const loop = r1 > 0 ? [...outer, ...outline(r1).reverse()] : outer;
  const g = revolve(THREE, loop, seg);
  // Revolved about y: turn the long axis to x.
  return g.rotateZ(-Math.PI / 2);
}

/** The radius of a capsule (half, r) at a point along it, or 0 beyond its ends. */
export function capsuleRadius(half, r, x) {
  const over = Math.abs(x) - half;
  if (over <= 0) return r;
  return over >= r ? 0 : Math.sqrt(r * r - over * over);
}

/** [n] points inside a capsule (keeping [margin] from its skin), from a seeded random source. */
export function insideCapsule(rnd, n, half, r, margin = 0, test = () => true) {
  const out = [];
  for (let k = 0; out.length < n && k < n * 200; k++) {
    const p = [(rnd() * 2 - 1) * (half + r), (rnd() * 2 - 1) * r, (rnd() * 2 - 1) * r];
    const rr = capsuleRadius(half, r - margin, p[0]);
    if (Math.hypot(p[1], p[2]) < rr && test(p)) out.push(p);
  }
  return out;
}
