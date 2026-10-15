// The kidney cut open: the right kidney's real shape, its renal artery,
// vein and ureter from BodyParts3D (CC BY 4.0), with the inside built in code
// to textbook proportions: the cortex, the pyramids of the medulla, the
// calyces and pelvis, the blood vessels between the pyramids, and one
// nephron drawn much larger than life. The kidney is turned so its own
// middle plane faces the front; the ready-made cut opens it along that plane.
import { readBp3d, weld } from '../lib/mesh.mjs';
import { blob, curveThrough, taperTube } from '../lib/shapes.mjs';
import { t } from '../lib/teaching.mjs';

const add = (a, b) => a.map((v, k) => v + b[k]);
const sub = (a, b) => a.map((v, k) => v - b[k]);
const mul = (a, s) => a.map((v) => v * s);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a) => mul(a, 1 / Math.hypot(...a));
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

const FILES = { kidney: 'FJ3147', artery: ['FJ2038', 'FJ3576'], vein: ['FJ3577', 'FJ3578'], ureter: 'FJ3146' };

/** A BodyParts3D file as a plain mesh in metres. */
const bp3d = (f) => weld(readBp3d(process.env.BP3D, f));

/** The mesh's points moved into a frame (origin, unit axes). */
function inFrame(m, origin, axes) {
  const positions = new Float32Array(m.positions.length);
  for (let i = 0; i < positions.length; i += 3) {
    const p = [m.positions[i] - origin[0], m.positions[i + 1] - origin[1], m.positions[i + 2] - origin[2]];
    for (let k = 0; k < 3; k++) positions[i + k] = dot(p, axes[k]);
  }
  return { positions, indices: m.indices };
}

/** Where a ray from [o] along [d] first leaves the mesh (distance), or null. */
function rayExit(m, o, d) {
  let best = null;
  const P = m.positions;
  for (let i = 0; i < m.indices.length; i += 3) {
    const [a, b, c] = [0, 1, 2].map((k) => [P[m.indices[i + k] * 3], P[m.indices[i + k] * 3 + 1], P[m.indices[i + k] * 3 + 2]]);
    const e1 = sub(b, a), e2 = sub(c, a), h = cross(d, e2), det = dot(e1, h);
    if (Math.abs(det) < 1e-12) continue;
    const s = sub(o, a), u = dot(s, h) / det;
    if (u < 0 || u > 1) continue;
    const q = cross(s, e1), v = dot(d, q) / det;
    if (v < 0 || u + v > 1) continue;
    const tt = dot(e2, q) / det;
    if (tt > 1e-6 && (best === null || tt > best)) best = tt;
  }
  return best;
}

let cached = null;
/** The kidney in its own frame (x to the hilum, y up its length, z out of its middle plane) and the inside's layout. */
function layout() {
  if (cached) return cached;
  if (!process.env.BP3D) throw new Error('kidney: set BP3D');
  const K = bp3d(FILES.kidney);
  const n = K.positions.length / 3;
  const c = [0, 1, 2].map((k) => { let s = 0; for (let i = 0; i < n; i++) s += K.positions[i * 3 + k]; return s / n; });
  // Its length: the main axis of its points.
  const cov = [0, 1, 2].map((i) => [0, 1, 2].map((j) => { let s = 0; for (let v = 0; v < n; v++) s += (K.positions[v * 3 + i] - c[i]) * (K.positions[v * 3 + j] - c[j]); return s / n; }));
  let u = [0, 1, 0];
  for (let it = 0; it < 80; it++) u = norm([0, 1, 2].map((i) => dot(cov[i], u)));
  if (u[1] < 0) u = mul(u, -1);
  // The hilum: where the renal artery meets the kidney.
  const art = bp3d(FILES.artery[0]);
  let hil = null, hd = Infinity;
  for (let i = 0; i < art.positions.length; i += 3) {
    const p = [art.positions[i], art.positions[i + 1], art.positions[i + 2]];
    const d = Math.hypot(...sub(p, c));
    if (d < hd) [hd, hil] = [d, p];
  }
  const h0 = sub(hil, c);
  const x = norm(sub(h0, mul(u, dot(h0, u))));
  const z = cross(x, u);
  const axes = [x, u, z];
  const kidney = inFrame(K, c, axes);
  // The middle plane (z = 0): how far the surface is from the sinus centre in each direction.
  const S = [0.012, 0, 0]; // the renal sinus, towards the hilum
  const reach = (phi) => rayExit(kidney, S, [Math.cos(phi), Math.sin(phi), 0]);
  // Pyramids in a fan round the sinus, leaving the hilum open.
  const angles = [-150, -118, -86, -54, 54, 86, 118, 150, 180].map((a) => (a * Math.PI) / 180);
  const pyramids = angles.map((phi) => {
    const R = reach(phi);
    const d = [Math.cos(phi), Math.sin(phi), 0];
    const base = add(S, mul(d, R - 0.0098));
    const tip = add(S, mul(d, Math.min(0.02, R * 0.38)));
    return { phi, d, R, base, tip, width: Math.max(0.006, (R - 0.008) * 0.2) };
  });
  // The thickness of the kidney at a point of the middle plane (half, front to back).
  const halfThick = (p) => rayExit(kidney, [p[0], p[1], 0], [0, 0, 1]) ?? 0.01;
  const hilum = add(S, [Math.max(0.02, reach(0) - 0.004), 0, 0]);
  cached = { c, axes, kidney, S, pyramids, halfThick, hilum, reach };
  return cached;
}

/** A pyramid: a cone from the papilla [tip] to its [base], with an oval cross-section, closed and rounded at both ends. */
function pyramid(THREE, { tip, base, width, d }, depth) {
  const along = sub(base, tip), len = Math.hypot(...along), ax = norm(along);
  const side = norm(cross([0, 0, 1], ax)), out = [0, 0, 1];
  const rings = 18, seg = 28;
  const pos = [];
  for (let i = 0; i <= rings; i++) {
    const s = i / rings;
    const a = 0.0016 + (width - 0.0016) * Math.pow(s, 0.75), b = 0.0016 + (depth - 0.0016) * Math.pow(s, 0.75);
    const at = add(tip, mul(ax, len * s));
    for (let j = 0; j < seg; j++) {
      const th = (j / seg) * Math.PI * 2;
      pos.push(...add(at, add(mul(side, Math.cos(th) * a), mul(out, Math.sin(th) * b))));
    }
  }
  const idx = [];
  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < seg; j++) {
      const a = i * seg + j, b = i * seg + ((j + 1) % seg), c = (i + 1) * seg + j, e = (i + 1) * seg + ((j + 1) % seg);
      idx.push(a, b, c, b, e, c);
    }
  }
  // The papilla rounded, the base a low dome.
  const tipPt = pos.length / 3;
  pos.push(...add(tip, mul(ax, -0.0014)));
  const basePt = pos.length / 3;
  pos.push(...add(base, mul(ax, 0.0016)));
  for (let j = 0; j < seg; j++) {
    const j2 = (j + 1) % seg;
    idx.push(tipPt, j2, j);
    idx.push(basePt, rings * seg + j, rings * seg + j2);
  }
  void d;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  // Faces outwards whichever way the frame turned.
  let v = 0;
  for (let k = 0; k < idx.length; k += 3) {
    const [p, q, r] = [idx[k] * 3, idx[k + 1] * 3, idx[k + 2] * 3];
    v += pos[p] * (pos[q + 1] * pos[r + 2] - pos[q + 2] * pos[r + 1]) - pos[p + 1] * (pos[q] * pos[r + 2] - pos[q + 2] * pos[r]) + pos[p + 2] * (pos[q] * pos[r + 1] - pos[q + 1] * pos[r]);
  }
  if (v < 0) {
    const flipped = [];
    for (let k = 0; k < idx.length; k += 3) flipped.push(idx[k], idx[k + 2], idx[k + 1]);
    g.setIndex(flipped);
  }
  return g;
}

/** [m] squeezed front to back where it would show through the kidney's surface (the thin edges). */
function within(m, kidney) {
  const positions = new Float32Array(m.positions);
  for (let i = 0; i < positions.length; i += 3) {
    const o = [positions[i], positions[i + 1], 0];
    const front = (rayExit(kidney, o, [0, 0, 1]) ?? 0.002) - 0.0009, back = (rayExit(kidney, o, [0, 0, -1]) ?? 0.002) - 0.0009;
    positions[i + 2] = Math.max(-Math.max(back, 0.0004), Math.min(Math.max(front, 0.0004), positions[i + 2]));
  }
  return { ...m, positions, normals: undefined };
}

const plainRich = (m) => ({ positions: m.positions, indices: m.indices, material: { name: 'made', color: [1, 1, 1, 1], roughness: 0.6, metalness: 0, doubleSided: false, alpha: 'OPAQUE' } });

export default {
  id: 'kidney',
  version: 1,
  order: 6.5,
  subject: 'Biology',
  classes: [7, 10, 11],
  title: t('Kidney (inside)', 'वृक्क (भीतरी संरचना)', 'ಮೂತ್ರಪಿಂಡ (ಒಳರಚನೆ)'),
  summary: t(
    'A kidney cut open along its length: the cortex outside, the cone-shaped pyramids of the medulla, and the calyces and pelvis that collect urine into the ureter. About a million nephrons filter the blood.',
    'लंबाई में काटा गया वृक्क: बाहर वल्कुट, मध्यांश के शंकु जैसे पिरामिड, और वे केलिक्स व श्रोणि जो मूत्र को मूत्रवाहिनी में इकट्ठा करते हैं। लगभग दस लाख नेफ्रॉन रक्त छानते हैं।',
    'ಉದ್ದಕ್ಕೆ ಕತ್ತರಿಸಿದ ಮೂತ್ರಪಿಂಡ: ಹೊರಗೆ ಕಾರ್ಟೆಕ್ಸ್, ಮೆಡುಲ್ಲಾದ ಶಂಕುವಿನಾಕಾರದ ಪಿರಮಿಡ್‌ಗಳು, ಮತ್ತು ಮೂತ್ರವನ್ನು ಮೂತ್ರನಾಳಕ್ಕೆ ಸಂಗ್ರಹಿಸುವ ಕ್ಯಾಲಿಕ್ಸ್‌ಗಳು ಮತ್ತು ಪೆಲ್ವಿಸ್. ಸುಮಾರು ಹತ್ತು ಲಕ್ಷ ನೆಫ್ರಾನ್‌ಗಳು ರಕ್ತವನ್ನು ಸೋಸುತ್ತವೆ.',
  ),
  keywords: ['kidney', 'kidneys', 'cortex', 'medulla', 'renal pyramid', 'renal pelvis', 'calyx', 'excretion', 'excretory system', 'urine', 'ureter', 'life processes', 'excretory products and their elimination', 'longitudinal section of kidney'],
  credit: 'Kidney shape, renal artery, vein and ureter: BodyParts3D, © The Database Center for Life Science, CC BY 4.0; inside built by ZYNETIX (simplified)',
  source: 'bp3d',
  groups: [
    { id: 'kidney', name: t('Kidney tissue', 'वृक्क ऊतक', 'ಮೂತ್ರಪಿಂಡ ಅಂಗಾಂಶ') },
    { id: 'urine', name: t('Urine collecting parts', 'मूत्र एकत्र करने वाले भाग', 'ಮೂತ್ರ ಸಂಗ್ರಹಿಸುವ ಭಾಗಗಳು') },
    { id: 'blood', name: t('Blood vessels', 'रक्त वाहिकाएँ', 'ರಕ್ತನಾಳಗಳು') },
  ],
  async import(k) {
    const { c, axes, kidney, S, pyramids, halfThick, hilum, reach } = layout();
    const THREE = k.THREE;
    const made = (g) => k.fromThree(g, {});
    const joinAll = (list) => k.join(list.map((m, i) => ({ ...m, path: `p${i}`, material: { ...m.material, color: [1, 1, 1, 1] } })));
    const out = {};
    out.cortex = plainRich(kidney);
    // The medulla: the pyramids, each as deep (front to back) as the kidney allows.
    out.medulla = within(joinAll(pyramids.map((p) => made(pyramid(THREE, p, Math.min(0.0115, halfThick(mul(add(p.tip, p.base), 0.5)) - 0.0055, halfThick(p.base) - 0.004))))), kidney);
    // The renal sinus, the fat round the pelvis.
    out.sinus = k.clipRich(made(blob(THREE, add(S, [0.001, 0, 0]), 0.0095, 0.024, 0.0075, 3)), (x) => x < hilum[0] - 0.003);
    // Calyces: a cup round each papilla, joined in two major calyces to the pelvis, which leaves at the hilum as the ureter.
    const upper = add(S, [0.002, 0.014, 0]), lower = add(S, [0.002, -0.014, 0]), pelvis = add(S, [0.008, 0, 0]);
    const calyx = [];
    for (const p of pyramids) {
      const cup = add(p.tip, mul(p.d, -0.0022));
      const to = p.d[1] > 0.3 ? upper : p.d[1] < -0.3 ? lower : pelvis;
      calyx.push(made(taperTube(THREE, curveThrough(THREE, [add(p.tip, mul(p.d, 0.0012)), cup, mul(add(cup, to), 0.5), to]), 0.0033, 0.0019, { segments: 16, radial: 16 })));
    }
    for (const m of [upper, lower]) calyx.push(made(taperTube(THREE, curveThrough(THREE, [m, mul(add(m, pelvis), 0.5), pelvis]), 0.0025, 0.0042, { segments: 16, radial: 16 })));
    const ureterStart = add(hilum, [0.004, -0.012, 0]);
    calyx.push(made(taperTube(THREE, curveThrough(THREE, [add(pelvis, [-0.004, 0, 0]), add(pelvis, [0.007, -0.004, 0]), add(hilum, [0.002, -0.009, 0]), ureterStart]), 0.0068, 0.003, { segments: 24, radial: 20 })));
    out.pelvis = joinAll(calyx);
    // The ureter outside: BodyParts3D's, its first 7 cm below the kidney.
    const ureter = inFrame(bp3d(FILES.ureter), c, axes);
    out.ureter = k.clipRich(plainRich(ureter), (x, y) => y > -0.085 && x > 0.004);
    // Blood vessels: BodyParts3D's renal artery and vein outside (cut 4 cm from the hilum), branches between the pyramids inside.
    const vessel = (files, dz, r, beside) => {
      const outside = k.clipRich(plainRich(k.plain(files.map((f) => plainRich(inFrame(bp3d(f), c, axes))))), (x) => x > 0.01 && x < 0.045);
      const inside = [];
      const root = add(hilum, [0.0, dz > 0 ? 0.004 : -0.002, dz]);
      for (const p of pyramids) {
        // Between this pyramid and the next one round: an interlobar vessel up to the cortex, then an arcuate one over the pyramid's base.
        const q = pyramids.find((x) => x.phi > p.phi) || null;
        if (!q) continue;
        const mid = norm(add(p.d, q.d));
        const R = (p.R + q.R) / 2;
        const across = mul([-mid[1], mid[0], 0], beside);
        const a = add(add(S, mul(mid, 0.012)), across), b = add(add(S, mul(mid, R - 0.009)), across);
        inside.push(made(taperTube(THREE, curveThrough(THREE, [root, add(mul(add(root, a), 0.5), [0, 0, dz]), add(a, [0, 0, dz]), add(b, [0, 0, dz])]), r, r * 0.6, { segments: 20, radial: 10 })));
        const arc = [];
        for (let s = 0; s <= 6; s++) {
          const ang = p.phi + ((q.phi - p.phi) * s) / 6;
          const dd = [Math.cos(ang), Math.sin(ang), 0];
          arc.push(add(add(S, mul(dd, ((p.R * (6 - s) + q.R * s) / 6) - 0.0085 - beside * 0.6)), [0, 0, dz]));
        }
        inside.push(made(taperTube(THREE, curveThrough(THREE, arc), r * 0.55, r * 0.55, { segments: 24, radial: 8 })));
      }
      return joinAll([outside, ...inside]);
    };
    out.renal_artery = vessel(FILES.artery, -0.0003, 0.0016, -0.0013);
    out.renal_vein = vessel(FILES.vein, -0.0003, 0.0017, 0.0013);
    // One nephron, enlarged: in the cortex above the upper pyramid, its loop dipping into the pyramid.
    const p = pyramids.find((x) => Math.abs(x.phi - (86 * Math.PI) / 180) < 0.01);
    const side = [-p.d[1], p.d[0], 0];
    const at = (dist, across) => add(add(S, mul(p.d, dist)), mul(side, across));
    const zN = -0.0001;
    // Points kept at least 6.8 mm inside the kidney's edge.
    const lift = (q) => {
      const r = sub(q, S), len = Math.hypot(r[0], r[1]);
      const R = reach(Math.atan2(r[1], r[0])) - 0.0068;
      const f = len > R ? R / len : 1;
      return [S[0] + r[0] * f, S[1] + r[1] * f, zN];
    };
    const G = lift(at(p.R - 0.0035, -0.006));
    const nephron = [
      made(blob(THREE, G, 0.0021, 0.0021, 0.0021, 3)),
      made(taperTube(THREE, curveThrough(THREE, [G, lift(at(p.R - 0.003, -0.0035)), lift(at(p.R - 0.0055, -0.002)), lift(at(p.R - 0.0035, -0.0005)), lift(at(p.R - 0.0075, 0.0005)), lift(at(p.R - 0.012, 0.0008)), lift(at(0.03, 0.0008)), lift(at(0.025, 0.002)), lift(at(0.03, 0.0032)), lift(at(p.R - 0.011, 0.0032)), lift(at(p.R - 0.0065, 0.0042)), lift(at(p.R - 0.0045, 0.0055)), lift(at(p.R - 0.006, 0.0068))]), 0.0009, 0.0009, { segments: 140, radial: 10 })),
      made(taperTube(THREE, curveThrough(THREE, [lift(at(p.R - 0.006, 0.0068)), lift(at(p.R - 0.009, 0.0078)), lift(at(0.03, 0.0072)), lift(at(0.02, 0.0045)), lift(at(0.0155, 0.0012))]), 0.001, 0.0012, { segments: 60, radial: 10 })),
    ];
    out.nephron = within(joinAll(nephron), kidney);
    return out;
  },
  parts: [
    {
      id: 'cortex', group: 'kidney', color: '#a8473b', inside: '#c56a52', explode: [-0.25, 0, -0.4],
      name: t('Cortex', 'वल्कुट (कॉर्टेक्स)', 'ಕಾರ್ಟೆಕ್ಸ್ (ಹೊರವಲಯ)'),
      info: t(
        'The outer layer, under a thin tough capsule. It holds the filtering parts of the nephrons (glomeruli) and reaches down between the pyramids as the renal columns.',
        'बाहरी परत, एक पतले मज़बूत संपुट के नीचे। इसमें नेफ्रॉन के छानने वाले भाग (ग्लोमेरुलस) होते हैं, और यह पिरामिडों के बीच वृक्क स्तंभों के रूप में नीचे तक जाती है।',
        'ತೆಳು ಗಟ್ಟಿ ಸಂಪುಟದ ಕೆಳಗಿನ ಹೊರಪದರ. ನೆಫ್ರಾನ್‌ಗಳ ಸೋಸುವ ಭಾಗಗಳು (ಗ್ಲೋಮೆರುಲಸ್) ಇಲ್ಲಿವೆ; ಪಿರಮಿಡ್‌ಗಳ ನಡುವೆ ಮೂತ್ರಪಿಂಡ ಸ್ತಂಭಗಳಾಗಿ ಕೆಳಗಿಳಿಯುತ್ತದೆ.',
      ),
    },
    {
      id: 'sinus', group: 'kidney', color: '#efd88f', minor: true, explode: [0, 0, 0.1],
      name: t('Renal sinus (fat)', 'वृक्क कोटर (वसा)', 'ಮೂತ್ರಪಿಂಡ ಕುಹರ (ಕೊಬ್ಬು)'),
      info: t('A space filled with fat round the pelvis and the blood vessels, opening at the hilum.', 'श्रोणि और रक्त वाहिकाओं के चारों ओर वसा से भरा स्थान, जो हाइलम पर खुलता है।', 'ಪೆಲ್ವಿಸ್ ಮತ್ತು ರಕ್ತನಾಳಗಳ ಸುತ್ತ ಕೊಬ್ಬು ತುಂಬಿದ ಜಾಗ; ಹೈಲಮ್‌ನಲ್ಲಿ ತೆರೆಯುತ್ತದೆ.'),
    },
    {
      id: 'medulla', group: 'kidney', color: '#7a2a2c', explode: [-0.1, 0, 0.25],
      name: t('Medulla (renal pyramids)', 'मध्यांश (वृक्क पिरामिड)', 'ಮೆಡುಲ್ಲಾ (ಮೂತ್ರಪಿಂಡ ಪಿರಮಿಡ್‌ಗಳು)'),
      info: t(
        'The inner part, made of 8 to 18 cone-shaped pyramids. Their stripes are the loops of Henle and collecting ducts, which take water back and concentrate the urine.',
        'भीतरी भाग, 8 से 18 शंकु जैसे पिरामिडों से बना। इनकी धारियाँ हेनले के लूप और संग्रह नलिकाएँ हैं, जो पानी वापस लेकर मूत्र को गाढ़ा करती हैं।',
        '8 ರಿಂದ 18 ಶಂಕುವಿನಾಕಾರದ ಪಿರಮಿಡ್‌ಗಳಿಂದಾದ ಒಳಭಾಗ. ಇವುಗಳ ಪಟ್ಟೆಗಳು ಹೆನ್ಲೆಯ ಕುಣಿಕೆಗಳು ಮತ್ತು ಸಂಗ್ರಹ ನಾಳಗಳು; ಅವು ನೀರನ್ನು ಮರಳಿ ಹೀರಿ ಮೂತ್ರವನ್ನು ಸಾಂದ್ರಗೊಳಿಸುತ್ತವೆ.',
      ),
    },
    {
      id: 'pelvis', group: 'urine', color: '#f3ead2', explode: [0.25, 0, 0.35],
      name: t('Calyces and renal pelvis', 'केलिक्स और वृक्क श्रोणि', 'ಕ್ಯಾಲಿಕ್ಸ್‌ಗಳು ಮತ್ತು ಮೂತ್ರಪಿಂಡ ಪೆಲ್ವಿಸ್'),
      info: t(
        'Each pyramid\'s tip (papilla) drips urine into a cup, a calyx. The calyces join into the funnel-shaped pelvis, which narrows into the ureter.',
        'हर पिरामिड का सिरा (पैपिला) मूत्र को एक प्याले, केलिक्स, में टपकाता है। केलिक्स मिलकर कीप जैसी श्रोणि बनाते हैं, जो पतली होकर मूत्रवाहिनी बनती है।',
        'ಪ್ರತಿ ಪಿರಮಿಡ್‌ನ ತುದಿ (ಪ್ಯಾಪಿಲ್ಲಾ) ಮೂತ್ರವನ್ನು ಒಂದು ಬಟ್ಟಲಿಗೆ, ಕ್ಯಾಲಿಕ್ಸ್‌ಗೆ, ತೊಟ್ಟಿಕ್ಕಿಸುತ್ತದೆ. ಕ್ಯಾಲಿಕ್ಸ್‌ಗಳು ಸೇರಿ ಆಲಿಕೆಯಾಕಾರದ ಪೆಲ್ವಿಸ್ ಆಗುತ್ತವೆ; ಅದು ಕಿರಿದಾಗಿ ಮೂತ್ರನಾಳವಾಗುತ್ತದೆ.',
      ),
    },
    {
      id: 'ureter', group: 'urine', color: '#e9cf86', explode: [0.3, -0.5, 0],
      name: t('Ureter', 'मूत्रवाहिनी', 'ಮೂತ್ರನಾಳ'),
      info: t('A muscular tube about 25 cm long that carries urine down to the bladder, squeezing it along in waves.', 'लगभग 25 cm लंबी पेशीय नली जो लहरों की तरह सिकुड़कर मूत्र को मूत्राशय तक ले जाती है।', 'ಸುಮಾರು 25 cm ಉದ್ದದ ಸ್ನಾಯು ನಾಳ; ಅಲೆಯಂತೆ ಸಂಕುಚಿಸಿ ಮೂತ್ರವನ್ನು ಮೂತ್ರಕೋಶಕ್ಕೆ ಒಯ್ಯುತ್ತದೆ.'),
    },
    {
      id: 'renal_artery', group: 'blood', color: '#d2312e', explode: [0.55, 0.15, 0.2],
      name: t('Renal artery', 'वृक्क धमनी', 'ಮೂತ್ರಪಿಂಡ ಅಪಧಮನಿ'),
      info: t('Brings blood from the aorta. About a quarter of all the blood the heart pumps passes through the kidneys, some 180 litres filtered a day.', 'महाधमनी से रक्त लाती है। हृदय द्वारा पंप किए गए कुल रक्त का लगभग चौथाई भाग वृक्कों से होकर जाता है; दिन में लगभग 180 लीटर छनता है।', 'ಮಹಾಪಧಮನಿಯಿಂದ ರಕ್ತ ತರುತ್ತದೆ. ಹೃದಯ ಪಂಪ್ ಮಾಡುವ ರಕ್ತದ ಸುಮಾರು ಕಾಲು ಭಾಗ ಮೂತ್ರಪಿಂಡಗಳ ಮೂಲಕ ಹೋಗುತ್ತದೆ; ದಿನಕ್ಕೆ ಸುಮಾರು 180 ಲೀಟರ್ ಸೋಸಲ್ಪಡುತ್ತದೆ.'),
    },
    {
      id: 'renal_vein', group: 'blood', color: '#3a5bbf', explode: [0.55, -0.05, -0.2],
      name: t('Renal vein', 'वृक्क शिरा', 'ಮೂತ್ರಪಿಂಡ ಅಭಿಧಮನಿ'),
      info: t('Takes the cleaned blood back to the vena cava.', 'साफ़ किया हुआ रक्त वापस महाशिरा तक ले जाती है।', 'ಶುದ್ಧಗೊಂಡ ರಕ್ತವನ್ನು ಮರಳಿ ಮಹಾಭಿಧಮನಿಗೆ ಒಯ್ಯುತ್ತದೆ.'),
    },
    {
      id: 'nephron', group: 'urine', color: '#f2c94c', explode: [-0.2, 0.35, 0.5],
      name: t('A nephron (drawn much larger)', 'एक नेफ्रॉन (बहुत बड़ा दिखाया)', 'ಒಂದು ನೆಫ್ರಾನ್ (ತುಂಬಾ ದೊಡ್ಡದಾಗಿ ತೋರಿಸಿದೆ)'),
      info: t(
        'The kidney\'s filtering unit; each kidney has about a million, too small to see. Its cup (Bowman\'s capsule) round a knot of capillaries sits in the cortex, its loop dips into a pyramid, and its collecting duct ends at the papilla.',
        'वृक्क की छानने वाली इकाई; हर वृक्क में लगभग दस लाख, जो आँख से दिखते नहीं। इसका प्याला (बोमन संपुट) केशिकाओं के गुच्छे के चारों ओर वल्कुट में होता है, इसका लूप पिरामिड में उतरता है, और संग्रह नलिका पैपिला पर खुलती है।',
        'ಮೂತ್ರಪಿಂಡದ ಸೋಸುವ ಘಟಕ; ಪ್ರತಿ ಮೂತ್ರಪಿಂಡದಲ್ಲಿ ಸುಮಾರು ಹತ್ತು ಲಕ್ಷ, ಕಣ್ಣಿಗೆ ಕಾಣದಷ್ಟು ಚಿಕ್ಕವು. ಲೋಮನಾಳಗಳ ಗುಚ್ಛದ ಸುತ್ತಲಿನ ಇದರ ಬಟ್ಟಲು (ಬೌಮನ್ ಸಂಪುಟ) ಕಾರ್ಟೆಕ್ಸ್‌ನಲ್ಲಿದೆ, ಇದರ ಕುಣಿಕೆ ಪಿರಮಿಡ್‌ಗೆ ಇಳಿಯುತ್ತದೆ, ಸಂಗ್ರಹ ನಾಳ ಪ್ಯಾಪಿಲ್ಲಾದಲ್ಲಿ ಕೊನೆಗೊಳ್ಳುತ್ತದೆ.',
      ),
    },
  ],
  views: [
    { id: 'front', name: t('Front', 'सामने से', 'ಮುಂಭಾಗ'), dir: [0, 0.05, 1] },
    { id: 'angle', name: t('At an angle', 'तिरछे', 'ಓರೆಯಾಗಿ'), dir: [0.6, 0.25, 1] },
  ],
  slices: [
    { id: 'section', name: t('Cut along its length', 'लंबाई में काट', 'ಉದ್ದಕ್ಕೆ ಕತ್ತರಿಕೆ'), normal: [0, 0, -1], through: 'cortex', view: 'front' },
  ],
  get animations() {
    const { pyramids, S, hilum } = layout();
    const p = pyramids.find((x) => Math.abs(x.phi - (86 * Math.PI) / 180) < 0.01);
    return [
      {
        id: 'urine', kind: 'flow',
        name: t('Making urine', 'मूत्र का बनना', 'ಮೂತ್ರ ತಯಾರಿಕೆ'),
        steps: [
          {
            color: '#ff6b5e', highlight: ['renal_artery'],
            text: t('Blood comes in through the renal artery and its branches between the pyramids.', 'रक्त वृक्क धमनी और पिरामिडों के बीच उसकी शाखाओं से अंदर आता है।', 'ರಕ್ತ ಮೂತ್ರಪಿಂಡ ಅಪಧಮನಿ ಮತ್ತು ಪಿರಮಿಡ್‌ಗಳ ನಡುವಿನ ಅದರ ಶಾಖೆಗಳ ಮೂಲಕ ಒಳಬರುತ್ತದೆ.'),
            paths: [[add(hilum, [0.04, 0.004, 0]), hilum, S, add(S, mul(p.d, p.R - 0.009))]],
          },
          {
            color: '#f2c94c', highlight: ['cortex', 'nephron'],
            text: t('In the cortex, each nephron filters the blood; water, salts, sugar and urea pass into it.', 'वल्कुट में हर नेफ्रॉन रक्त छानता है; पानी, लवण, शर्करा और यूरिया उसमें चले जाते हैं।', 'ಕಾರ್ಟೆಕ್ಸ್‌ನಲ್ಲಿ ಪ್ರತಿ ನೆಫ್ರಾನ್ ರಕ್ತವನ್ನು ಸೋಸುತ್ತದೆ; ನೀರು, ಲವಣಗಳು, ಸಕ್ಕರೆ ಮತ್ತು ಯೂರಿಯಾ ಅದರೊಳಗೆ ಹೋಗುತ್ತವೆ.'),
            paths: [[add(S, mul(p.d, p.R - 0.004)), add(S, mul(p.d, p.R - 0.012)), add(S, mul(p.d, 0.03))]],
          },
          {
            color: '#f2c94c', highlight: ['medulla'],
            text: t('In the pyramids, useful substances and most of the water are taken back into the blood.', 'पिरामिडों में उपयोगी पदार्थ और अधिकांश पानी वापस रक्त में ले लिए जाते हैं।', 'ಪಿರಮಿಡ್‌ಗಳಲ್ಲಿ ಉಪಯುಕ್ತ ವಸ್ತುಗಳು ಮತ್ತು ಹೆಚ್ಚಿನ ನೀರು ಮರಳಿ ರಕ್ತಕ್ಕೆ ಹೀರಲ್ಪಡುತ್ತವೆ.'),
            paths: [[add(S, mul(p.d, 0.03)), p.tip]],
          },
          {
            color: '#f7e27a', highlight: ['pelvis', 'ureter'],
            text: t('The urine left over drips into the calyces, collects in the pelvis and flows down the ureter to the bladder.', 'बचा हुआ मूत्र केलिक्स में टपकता है, श्रोणि में इकट्ठा होता है और मूत्रवाहिनी से मूत्राशय तक बहता है।', 'ಉಳಿದ ಮೂತ್ರ ಕ್ಯಾಲಿಕ್ಸ್‌ಗಳಿಗೆ ತೊಟ್ಟಿಕ್ಕಿ, ಪೆಲ್ವಿಸ್‌ನಲ್ಲಿ ಸಂಗ್ರಹವಾಗಿ, ಮೂತ್ರನಾಳದ ಮೂಲಕ ಮೂತ್ರಕೋಶಕ್ಕೆ ಹರಿಯುತ್ತದೆ.'),
            paths: [[p.tip, add(S, [0.002, 0.014, 0]), add(S, [0.008, 0, 0]), hilum, 'ureter@bottom']],
          },
        ],
      },
    ];
  },
};
