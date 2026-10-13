// Core-type transformer parts built in code: a stepped (cruciform) limb, the
// yokes, and windings as closed cylindrical shells round a limb (axis y).
import { revolve } from './shapes.mjs';

/** A stepped limb of width [w] (x and z) at x, from y0 to y1: two crossing bars. */
export function limb(THREE, x, w, y0, y1) {
  const h = y1 - y0, c = (y0 + y1) / 2;
  return [new THREE.BoxGeometry(w, h, w * 0.62).translate(x, c, 0), new THREE.BoxGeometry(w * 0.62, h, w).translate(x, c, 0)];
}

/** A yoke from x0 to x1 at height y, [w] its depth (z) and [h] its height. */
export const yoke = (THREE, x0, x1, y, w, h) => [new THREE.BoxGeometry(x1 - x0, h, w * 0.62).translate((x0 + x1) / 2, y, 0), new THREE.BoxGeometry(x1 - x0, h * 0.8, w).translate((x0 + x1) / 2, y, 0)];

/** A winding: a closed shell from radius rIn to rOut round the limb at x, from y0 to y1. */
export const winding = (THREE, x, rIn, rOut, y0, y1, seg = 40) => revolve(THREE, [[rIn, y0], [rOut, y0], [rOut, y1], [rIn, y1]], seg).translate(x, 0, 0);

/** A bushing on top at [x, y, z]: a stack of sheds and a stud. */
export function bushing(THREE, [x, y, z], h = 0.04) {
  const out = [new THREE.CylinderGeometry(0.006, 0.008, h, 14).translate(x, y + h / 2, z)];
  for (let k = 1; k <= 3; k++) out.push(new THREE.CylinderGeometry(0.011, 0.011, 0.003, 16).translate(x, y + (h * k) / 4, z));
  out.push(new THREE.CylinderGeometry(0.0025, 0.0025, 0.012, 8).translate(x, y + h + 0.006, z));
  return out;
}
