// Pieces the biology scenes share: membranes of lipids, proteins, ATP
// synthase, cut-away shells, soft cells, sunbeams and the colours of the
// things that move (electrons, ions, photons).
import { THREE, seeded, mat, beam, proteinGeometry, proteinMat, SphereImpostors, canvasTexture, smoothNormals, tube, atomCluster } from './kit.js';

export const C = (hex) => new THREE.Color(hex);

/** The colours of what flows: light, electrons, ions, water, sparks of a reaction. */
export const COL = {
  photon: C('#ffe9a6'),
  electron: C('#8fe9ff'),
  hion: C('#ff9a76'),
  water: C('#7cc0ff'),
  spark: C('#fff6dc'),
  oxygen: C('#ff8a80'),
  sodium: C('#c4a6ff'),
  potassium: C('#7fe0b0'),
  calcium: C('#ffd27a'),
  signal: C('#b9f2ff'),
};

/** Soft sunbeams from [from] towards [to]: a few beams side by side. */
export function sunbeams(from, to, { count = 3, radius = 0.6, spread = 1.6, opacity = 0.1, seed = 3, color } = {}) {
  const g = new THREE.Group();
  const rnd = seeded(seed);
  for (let i = 0; i < count; i++) {
    const off = [(rnd() - 0.5) * spread * 2, 0, (rnd() - 0.5) * spread * 1.4];
    const b = beam(from.map((v, k) => v + off[k] * 0.6), to.map((v, k) => v + off[k]), radius * (0.6 + rnd() * 0.7), { opacity: opacity * (0.6 + rnd() * 0.6), color });
    b.userData.phase = rnd() * 6;
    g.add(b);
  }
  g.userData.decor = true;
  return g;
}

/** Beams breathe a little, and fade with [k]. */
export function shimmer(beams, T, k = 1) {
  beams.visible = k > 0.01;
  for (const b of beams.children) {
    const u = b.material.uniforms.opacity;
    if (b.userData.o0 === undefined) b.userData.o0 = u.value;
    u.value = b.userData.o0 * k * (0.8 + 0.2 * Math.sin(T * 0.6 + b.userData.phase));
  }
}

/**
 * A protein from its lobes ([x, y, z, rx, ry, rz]), in a muted colour: a
 * space-filling cluster of atoms ([smooth]: a smooth surface instead).
 * [glowProtein] lights either kind.
 */
export function protein(lobes, color, opts = {}) {
  if (opts.smooth) return new THREE.Mesh(proteinGeometry(lobes, opts), proteinMat(color, opts));
  return atomCluster(lobes, color, opts);
}

/** Lights a protein (an emissive tint for its atoms or its surface). */
export function glowProtein(p, r, g, b) {
  if (p.userData.glow) p.userData.glow(r, g, b);
  else p.material?.emissive?.setRGB(r, g, b);
}

/** Rounds a box-like geometry into a soft cell (pushes vertices towards an ellipsoid). */
export function smoothCell(g, k) {
  if (k) {
    g.computeBoundingBox();
    const b = g.boundingBox, c = b.getCenter(new THREE.Vector3()), h = b.getSize(new THREE.Vector3()).multiplyScalar(0.5);
    const p = g.attributes.position, v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).sub(c);
      const n = new THREE.Vector3(v.x / h.x, v.y / h.y, v.z / h.z);
      const len = Math.max(Math.abs(n.x), Math.abs(n.y), Math.abs(n.z));
      const e = n.clone().normalize().multiply(h);
      const bx = n.clone().divideScalar(len).multiply(h);
      v.copy(bx.lerp(e, k * 4)).add(c);
      p.setXYZ(i, v.x, v.y, v.z);
    }
  }
  return smoothNormals(g);
}

/**
 * An ellipsoid shell with a window cut out where [hole(theta, phi)] is true
 * (theta from the top, phi round from +z): a cut-away organelle.
 */
export function shellWithWindow(rx, ry, rz, hole, nu = 96, nv = 48) {
  const pos = [], idx = [];
  const row = nu + 1;
  for (let j = 0; j <= nv; j++) {
    const th = (j / nv) * Math.PI;
    for (let i = 0; i <= nu; i++) {
      const ph = (i / nu) * Math.PI * 2;
      pos.push(Math.sin(th) * Math.sin(ph) * rx, Math.cos(th) * ry, Math.sin(th) * Math.cos(ph) * rz);
    }
  }
  for (let j = 0; j < nv; j++) {
    for (let i = 0; i < nu; i++) {
      const th = ((j + 0.5) / nv) * Math.PI, ph = ((i + 0.5) / nu) * Math.PI * 2;
      if (hole(th, ph)) continue;
      const a = j * row + i, b = a + 1, c = a + row, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/**
 * A lipid bilayer at height y0 over x0..x1, z0..z1: two sheets of heads
 * ([heads] 'both', 'top' or 'bottom') [head] above and below the middle,
 * following [wave](x, z), with holes where proteins sit ([cx, cz, r]).
 */
export function bilayer(y0, x0, x1, z0, z1, keepOut, rnd, { heads = 'both', dim = 1, head = 0.2, wave = () => 0, colors = ['#c9c29a', '#bfc196', '#d2c9a6', '#b9b78e'], size = 0.07 } = {}) {
  const pts = [];
  const hc = colors.map((c) => C(c).multiplyScalar(dim * 0.9));
  const sp = size * 0.97;
  const sides = heads === 'both' ? [1, -1] : heads === 'top' ? [1] : [-1];
  for (const side of sides) {
    let row = 0;
    for (let z = z0; z <= z1; z += sp * 0.87, row++) {
      for (let x = x0 + ((row % 2) * sp) / 2; x <= x1; x += sp) {
        const xx = x + (rnd() - 0.5) * 0.02, zz = z + (rnd() - 0.5) * 0.02;
        if (keepOut.some(([cx, cz, r]) => Math.hypot(xx - cx, (zz - cz) * 1.1) < r)) continue;
        pts.push([xx, y0 + wave(xx, zz) + side * head + (rnd() - 0.5) * 0.015, zz, size, hc[(rnd() * hc.length) | 0]]);
      }
    }
  }
  return new SphereImpostors(pts, { light: [0.35, 0.85, 0.4], ambient: 0.42 });
}

/** The oily core between a bilayer's heads: a sheet with fine tail stripes, seen at its cut edges. */
export function tailSheet(y0, x0, x1, z0, z1, { dim = 1, head = 0.2, wave = () => 0, color = '#a88a45' } = {}) {
  const tails = canvasTexture(512, 64, (c, w, h) => {
    c.fillStyle = color;
    c.fillRect(0, 0, w, h);
    const r = seeded(7);
    for (let x = 0; x < w; x += 2.5) {
      c.strokeStyle = `rgba(${215 + r() * 30},${185 + r() * 25},${110 + r() * 20},0.75)`;
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(x, 0);
      c.bezierCurveTo(x + 2, h * 0.3, x - 2, h * 0.45, x + 0.5, h * 0.5);
      c.bezierCurveTo(x + 2, h * 0.55, x - 2, h * 0.7, x, h);
      c.stroke();
    }
  }, { repeat: [14, 1] });
  const g = new THREE.BoxGeometry(x1 - x0, head * 1.7, z1 - z0, 80, 1, 30);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) + (x0 + x1) / 2, z = p.getZ(i) + (z0 + z1) / 2;
    p.setY(i, p.getY(i) + wave(x, z));
  }
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, mat({ color: new THREE.Color('#ffffff').multiplyScalar(dim * 0.62), map: tails, rough: 0.75, sheen: 0.1, rim: 0.03 }));
  m.position.set((x0 + x1) / 2, y0, (z0 + z1) / 2);
  return m;
}

/**
 * ATP synthase at [at]: the c-ring turbine in the membrane, the central and
 * peripheral stalks, and the α₃β₃ head ([flip]: the head below the membrane,
 * as in mitochondria, where it faces the matrix). Returns {group, rotor, head}.
 */
export function atpSynthase(at, { flip = false } = {}) {
  const group = new THREE.Group();
  const rotor = new THREE.Group();
  // The c-ring: fourteen subunits round the turbine, through the membrane.
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    const c = atomCluster([[0, 0, 0, 0.085, 0.36, 0.085]], i % 2 ? '#7560a0' : '#6c5896', { seed: 30 + i, atom: 0.065 });
    c.position.set(Math.cos(a) * 0.36, 0, Math.sin(a) * 0.36);
    rotor.add(c);
  }
  rotor.add(atomCluster([[0, 0.45, 0, 0.13, 0.3, 0.12], [0.03, 0.85, 0.02, 0.11, 0.28, 0.11], [0, 1.2, 0, 0.12, 0.2, 0.12], [0.12, 0.3, 0.05, 0.12, 0.12, 0.12]], '#b8923e', { seed: 12, atom: 0.065 }));
  group.add(rotor);
  // The head: three α and three β subunits round the top of the stalk.
  const head = new THREE.Group();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const m = atomCluster([[0, 0, 0, 0.29, 0.4, 0.29]], i % 2 ? '#a8574d' : '#c98670', { seed: 40 + i });
    m.position.set(Math.cos(a) * 0.32, 0, Math.sin(a) * 0.32);
    m.rotation.y = -a;
    head.add(m);
  }
  const cap = atomCluster([[0, 0, 0, 0.2, 0.14, 0.2]], '#a48ac6', { seed: 10 });
  cap.position.y = 0.45;
  head.add(cap);
  head.position.set(0, 1.5, 0);
  group.add(head);
  const aSub = atomCluster([[0, 0, 0, 0.22, 0.34, 0.22]], '#7c68a8', { seed: 11 });
  aSub.position.set(0.55, 0, 0.1);
  group.add(aSub);
  const stator = new THREE.Mesh(tube([[0.62, 0.2, 0.1], [0.7, 0.8, 0.12], [0.56, 1.5, 0.1], [0.18, 1.98, 0.04]], (u) => 0.065 - 0.02 * u, { segments: 24, radial: 10 }), proteinMat('#9a82bf'));
  group.add(stator);
  if (flip) group.rotation.x = Math.PI;
  group.position.copy(at);
  return { group, rotor, head };
}
