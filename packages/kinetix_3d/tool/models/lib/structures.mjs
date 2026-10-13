// Shapes for the civil and mechanical engineering models: straight members of a
// frame or truss (boxes laid from one point to another), cables hung through
// points, and prisms lofted through stations of a 2D outline (helical and bevel
// gears, cams).

/**
 * A straight member from [a] to [b] with a [w] x [h] rectangular section
 * (a beam, a column, a truss member). [up] keeps the section's height
 * pointing that way where it can.
 */
export function member(THREE, a, b, w, h = w, up = [0, 1, 0]) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const len = A.distanceTo(B);
  const g = new THREE.BoxGeometry(w, len, h).translate(0, len / 2, 0);
  const dir = B.clone().sub(A).normalize();
  const U = new THREE.Vector3(...up).normalize();
  // Lay the box's length (y) along the member, its depth (z) as close to [up] as it can go.
  const side = new THREE.Vector3().crossVectors(dir, Math.abs(dir.dot(U)) > 0.99 ? new THREE.Vector3(1, 0, 0) : U).normalize();
  const depth = new THREE.Vector3().crossVectors(side, dir).normalize();
  const m = new THREE.Matrix4().makeBasis(side, dir, depth).setPosition(A);
  return g.applyMatrix4(m);
}

/** A round cable (or bar) through [points], one straight rod per stretch. */
export function cable(THREE, points, r, radial = 8) {
  const out = [];
  for (let i = 0; i + 1 < points.length; i++) {
    const A = new THREE.Vector3(...points[i]), B = new THREE.Vector3(...points[i + 1]);
    const len = A.distanceTo(B);
    if (len < 1e-9) continue;
    const g = new THREE.CylinderGeometry(r, r, len, radial, 1, false).translate(0, len / 2, 0);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize()));
    out.push(g.translate(A.x, A.y, A.z));
  }
  return out;
}

/**
 * A prism lofted through [stations]: each is {z, scale, turn} for the same
 * closed 2D [outline] ([x, y] points going round anticlockwise), scaled about
 * the axis, turned by [turn] radians and set at height [z]. Sides and both
 * end caps, faces outwards. A helical gear is a straight gear turned along
 * its width; a bevel gear is one that shrinks towards the cone's apex.
 */
export function loft(THREE, outline, stations) {
  const n = outline.length;
  const pos = [];
  const idx = [];
  const at = (s, [x, y]) => {
    const c = Math.cos(s.turn ?? 0), sn = Math.sin(s.turn ?? 0), k = s.scale ?? 1;
    return [k * (x * c - y * sn), k * (x * sn + y * c), s.z];
  };
  for (const s of stations) for (const p of outline) pos.push(...at(s, p));
  const up = stations[stations.length - 1].z > stations[0].z;
  for (let j = 0; j + 1 < stations.length; j++) {
    for (let i = 0; i < n; i++) {
      const i2 = (i + 1) % n;
      const a = j * n + i, b = j * n + i2, c = (j + 1) * n + i2, d = (j + 1) * n + i;
      if (up) idx.push(a, b, c, a, c, d);
      else idx.push(a, c, b, a, d, c);
    }
  }
  // The end caps: the outline cut into triangles, facing out of each end.
  const tris = THREE.ShapeUtils.triangulateShape(outline.map(([x, y]) => new THREE.Vector2(x, y)), []);
  const area2 = (p, q, r) => (outline[q][0] - outline[p][0]) * (outline[r][1] - outline[p][1]) - (outline[q][1] - outline[p][1]) * (outline[r][0] - outline[p][0]);
  for (const [end, base] of [[0, 0], [1, (stations.length - 1) * n]]) {
    // The last station's cap faces on along the loft, the first one's back: +z or -z.
    const plusZ = (end === 1) === up;
    for (const [p, q, r] of tris) {
      if (area2(p, q, r) > 0 === plusZ) idx.push(base + p, base + q, base + r);
      else idx.push(base + p, base + r, base + q);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}

/**
 * The outline of an involute spur gear of [n] teeth and module [m] (20°
 * pressure angle), as [x, y] points going round it anticlockwise.
 */
export function gearOutline(n, m, pressure = (20 * Math.PI) / 180) {
  const rp = (m * n) / 2, rb = rp * Math.cos(pressure), ra = rp + m, rf = Math.max(rp - 1.25 * m, rb * 0.98);
  const inv = (a) => Math.tan(a) - a;
  const half = Math.PI / (2 * n) + inv(pressure);
  const flank = [];
  for (let i = 0; i <= 6; i++) {
    const r = Math.max(rb, rf) + ((ra - Math.max(rb, rf)) * i) / 6;
    const a = Math.acos(Math.min(1, rb / r));
    flank.push([r, half - inv(a)]);
  }
  const pts = [];
  for (let k = 0; k < n; k++) {
    const c = (2 * Math.PI * k) / n;
    pts.push([rf, c - half - (Math.PI / (2 * n)) * 0.6]);
    for (const [r, a] of flank) pts.push([r, c - a]);
    for (const [r, a] of flank.slice().reverse()) pts.push([r, c + a]);
    pts.push([rf, c + half + (Math.PI / (2 * n)) * 0.6]);
  }
  return pts.map(([r, a]) => [r * Math.cos(a), r * Math.sin(a)]);
}
