// Building pieces for the monuments, in metres at real size: arched wall
// panels (real recesses, not painted arches), onion domes and kiosks
// (chhatris), fluted towers, spoked wheels. All with three.js geometry.
import { revolve, rod } from './shapes.mjs';

/** The outline of a pointed (Mughal) arch, [w] wide, straight sides [h0] high, from (x0, y0). */
export function archPoints(w, h0, x0 = 0, y0 = 0, n = 12) {
  const R = 0.75 * w, cx = 0.25 * w;
  const top = Math.acos(-cx / R);
  const pts = [[x0 - w / 2, y0], [x0 - w / 2, y0 + h0]];
  // Left arc (centre at +cx) from angle pi to the apex, then the mirror.
  for (let i = 1; i <= n; i++) {
    const a = Math.PI - ((Math.PI - top) * i) / n;
    pts.push([x0 + cx + R * Math.cos(a), y0 + h0 + R * Math.sin(a)]);
  }
  for (let i = n - 1; i >= 1; i--) {
    const a = Math.PI - ((Math.PI - top) * i) / n;
    pts.push([x0 - cx - R * Math.cos(a), y0 + h0 + R * Math.sin(a)]);
  }
  pts.push([x0 + w / 2, y0 + h0], [x0 + w / 2, y0]);
  return pts;
}

/** A round (semicircular) arch outline, [w] wide, straight sides [h0] high. */
export function roundArchPoints(w, h0, x0 = 0, y0 = 0, n = 20) {
  const pts = [[x0 - w / 2, y0], [x0 - w / 2, y0 + h0]];
  for (let i = 1; i < n; i++) {
    const a = Math.PI - (Math.PI * i) / n;
    pts.push([x0 + (w / 2) * Math.cos(a), y0 + h0 + (w / 2) * Math.sin(a)]);
  }
  pts.push([x0 + w / 2, y0 + h0], [x0 + w / 2, y0]);
  return pts;
}

/**
 * A wall panel [width] x [height], [depth] thick, facing +z (z from 0 to
 * depth), with arch-shaped openings cut right through: [arches] are point
 * lists from archPoints (in panel coordinates, y from the panel's foot).
 */
export function archPanel(THREE, width, height, depth, arches) {
  const s = new THREE.Shape();
  s.moveTo(-width / 2, 0).lineTo(width / 2, 0).lineTo(width / 2, height).lineTo(-width / 2, height).lineTo(-width / 2, 0);
  for (const a of arches) {
    // An opening that reaches the foot is closed just above it, so the outline stays one piece.
    const lifted = a.map(([x, y]) => [x, Math.max(y, 0.02 * height)]);
    s.holes.push(new THREE.Path(lifted.slice().reverse().map(([x, y]) => new THREE.Vector2(x, y))));
  }
  return new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 8 });
}

/** Puts a panel (facing +z) on the face whose outward direction is at [angle] about y, [dist] from the centre, [y] up, [side] along the face. */
export function onFace(g, angle, dist, y = 0, side = 0) {
  return g.translate(side, y, dist).rotateY(angle);
}

/** An onion dome: widest [r] at [bulge] of its height [h], from a base radius [r0], on [y]. */
export function onionDome(THREE, r0, r, h, y = 0, seg = 64) {
  const pts = [[0, y]];
  const prof = [
    [r0, 0], [r * 0.99, 0.06], [r, 0.16], [r * 0.97, 0.28], [r * 0.86, 0.42], [r * 0.68, 0.56], [r * 0.46, 0.7], [r * 0.26, 0.82], [r * 0.11, 0.92], [r * 0.03, 0.98], [0, 1],
  ];
  for (const [x, f] of prof) pts.push([x, y + f * h]);
  return revolve(THREE, pts, seg);
}

/** A finial (kalash): stacked knobs and a spike, [h] tall, from [y]. */
export function finial(THREE, h, y = 0, r = h * 0.08) {
  return revolve(THREE, [[0, y], [r * 0.6, y], [r, y + h * 0.08], [r * 0.5, y + h * 0.16], [r * 1.1, y + h * 0.28], [r * 0.45, y + h * 0.4], [r * 0.8, y + h * 0.5], [r * 0.3, y + h * 0.6], [r * 0.15, y + h * 0.95], [0, y + h]], 24);
}

/** A chhatri: [n] slender pillars round a circle of radius [r], [h] tall, a cornice and an onion dome, on [base]. */
export function chhatri(THREE, base, r, h, n = 8) {
  const [x, y, z] = base;
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = (2 * Math.PI * i) / n + Math.PI / n;
    out.push(rod(THREE, [x + r * Math.cos(a), y, z + r * Math.sin(a)], [x + r * Math.cos(a), y + h, z + r * Math.sin(a)], r * 0.09, 10));
  }
  out.push(new THREE.CylinderGeometry(r * 1.15, r * 1.15, h * 0.08, 32).translate(x, y + h * 0.04 - 0.0, z));
  out.push(new THREE.CylinderGeometry(r * 1.32, r * 1.05, h * 0.12, 32).translate(x, y + h + h * 0.06, z));
  out.push(onionDome(THREE, r * 0.95, r * 1.05, h * 0.9, y + h * 1.12, 40).translate(x, 0, z));
  out.push(finial(THREE, h * 0.45, y + h * 2.0, r * 0.12).translate(x, 0, z));
  return out;
}

/**
 * A fluted tower storey from [y0] to [y1], radius [ra] tapering to [rb]:
 * [flute](u) gives the extra radius (a fraction) round the circumference
 * (u from 0 to 1).
 */
export function flutedStorey(THREE, y0, y1, ra, rb, flute, seg = 192, rings = 6) {
  const pos = [], idx = [];
  for (let j = 0; j <= rings; j++) {
    const v = j / rings, y = y0 + (y1 - y0) * v, r = ra + (rb - ra) * v;
    for (let i = 0; i < seg; i++) {
      const u = i / seg, a = u * Math.PI * 2;
      const rr = r * (1 + flute(u));
      pos.push(rr * Math.cos(a), y, rr * Math.sin(a));
    }
  }
  for (let j = 0; j < rings; j++) {
    for (let i = 0; i < seg; i++) {
      const a = j * seg + i, b = j * seg + ((i + 1) % seg), c = a + seg, d = b + seg;
      idx.push(a, c, b, b, c, d);
    }
  }
  // Caps top and bottom.
  const bottom = pos.length / 3;
  pos.push(0, y0, 0);
  const top = bottom + 1;
  pos.push(0, y1, 0);
  for (let i = 0; i < seg; i++) {
    const i2 = (i + 1) % seg;
    idx.push(bottom, i, i2, top, rings * seg + i2, rings * seg + i);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}

/** A spoked wheel in the xy plane (axle along z): rim [r], [spokes], [w] thick, centred at [c]. */
export function spokedWheel(THREE, c, r, spokes, w) {
  const [x, y, z] = c;
  const out = [new THREE.TorusGeometry(r * 0.93, r * 0.07, 10, 64).translate(x, y, z), new THREE.CylinderGeometry(r * 0.16, r * 0.16, w * 1.4, 24).rotateX(Math.PI / 2).translate(x, y, z)];
  out.push(new THREE.TorusGeometry(r * 0.8, r * 0.035, 8, 48).translate(x, y, z));
  for (let i = 0; i < spokes; i++) {
    const a = (2 * Math.PI * i) / spokes;
    out.push(rod(THREE, [x + r * 0.15 * Math.cos(a), y + r * 0.15 * Math.sin(a), z], [x + r * 0.88 * Math.cos(a), y + r * 0.88 * Math.sin(a), z], r * 0.05, 8));
    // A carved medallion half way along each spoke.
    out.push(new THREE.SphereGeometry(r * 0.075, 12, 8).scale(1, 1, 0.5).translate(x + r * 0.52 * Math.cos(a), y + r * 0.52 * Math.sin(a), z));
  }
  return out;
}

/** A square stepped pyramid roof (a pidha deul): [tiers] tiers of [steps] slabs each, from [w] wide at [y]. */
export function pidhaRoof(THREE, cx, cz, w, y, tiers, steps, slab, shrink) {
  const out = [];
  let width = w, yy = y;
  for (let t = 0; t < tiers; t++) {
    for (let s = 0; s < steps; s++) {
      out.push(new THREE.BoxGeometry(width, slab, width).translate(cx, yy + slab / 2, cz));
      out.push(new THREE.BoxGeometry(width * 0.94, slab * 0.6, width * 0.94).translate(cx, yy + slab * 1.3, cz));
      yy += slab * 1.6;
      width *= shrink;
    }
    // A plain band between tiers.
    out.push(new THREE.BoxGeometry(width * 0.9, slab * 1.6, width * 0.9).translate(cx, yy + slab * 0.8, cz));
    yy += slab * 1.6;
    width *= 0.92;
  }
  return { pieces: out, top: yy, width };
}
