// Shapes for process equipment built in code (reactors, columns, heat
// exchangers): closed vessels with dished heads, open shells, rings and
// ball-and-stick molecules. Vertical things stand along y; lay them along x
// with layX. Sizes are in metres of the model's own space.
import { blob, rod, revolve } from './shapes.mjs';

/** Points of a dished (2:1 elliptical) head from the side wall at [y] to the axis, [up] or down. */
function head(r, y, depth, up, n = 8) {
  const out = [];
  for (let k = 0; k <= n; k++) {
    const a = (k / n) * (Math.PI / 2);
    out.push([Math.max(r * Math.cos(a), 0), y + (up ? 1 : -1) * depth * Math.sin(a)]);
  }
  return out;
}

/**
 * A closed hollow vessel standing on y: wall [wall] thick, its straight side
 * from y0 to y1, dished heads [dish]·r deep at both ends (flat when 0).
 */
export function vessel(THREE, r, wall, y0, y1, { dish = 0.5, seg = 48 } = {}) {
  const ri = r - wall;
  const outer = [...head(r, y0, r * dish, false).reverse(), ...head(r, y1, r * dish, true)];
  const inner = [...head(ri, y1, Math.max(ri * dish, 0.0001), true).reverse(), ...head(ri, y0, Math.max(ri * dish, 0.0001), false)];
  return revolve(THREE, [...outer, ...inner], seg);
}

/** A solid with a dished bottom filled up to [level] (the liquid in a vessel). */
export function filled(THREE, r, y0, level, { dish = 0.5, seg = 48 } = {}) {
  return revolve(THREE, [...head(r, y0, r * dish, false).reverse(), [r, level], [0, level]], seg);
}

/** An open ring (a short hollow cylinder) round y from y0 to y1. */
export function shell(THREE, rIn, rOut, y0, y1, seg = 48) {
  return revolve(THREE, [[rIn, y0], [rOut, y0], [rOut, y1], [rIn, y1]], seg);
}

/** A flat disc round y at height [y], [h] thick. */
export const plate = (THREE, r, y, h, seg = 40) => new THREE.CylinderGeometry(r, r, h, seg).translate(0, y, 0);

/** A tray with its downcomer opening cut off: a disc of radius r minus the segment beyond x = [cut]·r. */
export function tray(THREE, r, y, h, cut = 0.7, seg = 40) {
  const a = Math.acos(cut);
  const s = new THREE.Shape();
  s.moveTo(cut * r, Math.sin(a) * r);
  s.absarc(0, 0, r, a, Math.PI * 2 - a, false);
  s.closePath();
  return new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: false, curveSegments: seg }).rotateX(Math.PI / 2).translate(0, y + h / 2, 0);
}

/** Lays a geometry built along y down along x. */
export const layX = (g) => g.rotateZ(-Math.PI / 2);

/** A straight pipe through [points] with a sphere at each bend. */
export function pipe(THREE, points, r) {
  const out = [];
  for (let i = 1; i < points.length; i++) out.push(rod(THREE, points[i - 1], points[i], r, 12));
  for (let i = 1; i < points.length - 1; i++) out.push(new THREE.SphereGeometry(r, 10, 8).translate(...points[i]));
  return out;
}

// --- Ball-and-stick molecules ---------------------------------------------------------------------

const tt = (en, hi, kn) => ({ en, hi, kn });

/** CPK colours and sizes (Å) of the elements the molecules use. */
export const ELEMENTS = {
  H: { r: 0.36, color: '#f2f2f2', name: tt('Hydrogen', 'हाइड्रोजन', 'ಹೈಡ್ರೋಜನ್') },
  C: { r: 0.62, color: '#3c3f44', name: tt('Carbon', 'कार्बन', 'ಕಾರ್ಬನ್') },
  N: { r: 0.6, color: '#3f66d6', name: tt('Nitrogen', 'नाइट्रोजन', 'ನೈಟ್ರೋಜನ್') },
  O: { r: 0.6, color: '#e0443c', name: tt('Oxygen', 'ऑक्सीजन', 'ಆಮ್ಲಜನಕ') },
};

/** Atom balls and bond sticks of a molecule ([[el, x, y, z]] in Å, [[i, j, order]]), scaled by [s]; keyed `${id}_${el}` and `${id}_bonds${order}`. */
export function ballAndStick(THREE, id, atoms, bonds, s, out = {}) {
  for (const [el, x, y, z] of atoms) (out[`${id}_${el}`] ??= []).push(blob(THREE, [x * s, y * s, z * s], ELEMENTS[el].r * s * 0.62, ELEMENTS[el].r * s * 0.62, ELEMENTS[el].r * s * 0.62, 3));
  for (const [i, j, order] of bonds) {
    const a = new THREE.Vector3(...atoms[i].slice(1)).multiplyScalar(s), b = new THREE.Vector3(...atoms[j].slice(1)).multiplyScalar(s);
    const dir = b.clone().sub(a).normalize();
    const side = Math.abs(dir.z) < 0.9 ? new THREE.Vector3(0, 0, 1).cross(dir).normalize() : new THREE.Vector3(1, 0, 0).cross(dir).normalize();
    for (let k = 0; k < order; k++) {
      const off = side.clone().multiplyScalar((k - (order - 1) / 2) * s * 0.2);
      (out[`${id}_bonds${order}`] ??= []).push(rod(THREE, a.clone().add(off).toArray(), b.clone().add(off).toArray(), s * 0.075, 10));
    }
  }
  return out;
}
