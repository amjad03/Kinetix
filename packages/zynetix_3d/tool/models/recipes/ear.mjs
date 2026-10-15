// The human ear (the right ear) at its true size: the outer ear from
// BodyParts3D (CC BY 4.0), the inner ear from a micro-CT scan of a real
// bony labyrinth (Wimmer et al. 2019, specimen F07, CC BY 4.0), and the ear
// canal, eardrum, the three ossicles, the middle ear cavity, the Eustachian
// tube and the nerve built in code between them from textbook measurements.
// Coordinates are BodyParts3D's, in metres: x towards the body's left (so
// medial for this ear), y up, z forwards.
import { readBp3d } from '../lib/mesh.mjs';
import { blob, curveThrough, revolve, rod, taperTube } from '../lib/shapes.mjs';
import { t, wire } from '../lib/teaching.mjs';

const add = (a, b) => a.map((v, k) => v + b[k]);
const sub = (a, b) => a.map((v, k) => v - b[k]);
const mul = (a, s) => a.map((v) => v * s);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a) => mul(a, 1 / Math.hypot(...a));
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const MM = 0.001;
/** [p] moved by [d] millimetres. */
const off = (p, d) => add(p, mul(d, MM));

// The micro-CT labyrinth (scanner millimetres) and its landmarks from the
// dataset's description: round and oval windows, cochlea base centre, apex,
// vestibule, and the cochlea's own axes (z along the modiolus to the apex).
const SCAN = {
  RW: [-9.44, -60.02, -109.8], C: [-7.17, -57.48, -113.91], A: [-7.12, -59.95, -115.42], OW: [-6.76, -60.46, -108.88], V: [-6.61, -59.2, -108.17],
  X: [-0.43, -0.48, 0.77], Y: [-0.9, 0.21, -0.37], Z: [0.02, -0.85, -0.52],
};
/** The cochlea tilted down from the line vestibule–cochlea (degrees), so it lies forwards and a little below the vestibule. */
const PITCH = 45;

/** Which part of the labyrinth a point (scanner mm) is in. */
function labyrinthPart(p) {
  if (Math.hypot(...sub(p, SCAN.V)) < 2.7) return 'vestibule';
  const r = sub(p, SCAN.C);
  const z = dot(r, SCAN.Z), x = dot(r, SCAN.X), y = dot(r, SCAN.Y);
  if (z > -1.4 && z < 5.5 && Math.hypot(x, y) < 5.4) return 'cochlea';
  return 'semicircular_canals';
}

let cached = null;
/**
 * Where everything goes, from the pinna: the opening of the ear canal is
 * the hole through the BodyParts3D pinna, and the canal, eardrum, ossicles
 * and labyrinth follow from it at their real distances.
 */
function layout() {
  if (cached) return cached;
  if (!process.env.BP3D) throw new Error('ear: set BP3D');
  const pinna = readBp3d(process.env.BP3D, 'FJ2811');
  const P = pinna.positions;
  // The right ear only (x < 0), as triangles seen from the side (y, z).
  const tris = [];
  for (let i = 0; i < pinna.indices.length; i += 3) {
    const v = [0, 1, 2].map((k) => pinna.indices[i + k] * 3);
    if (v.every((a) => P[a] < 0)) tris.push(v.map((a) => [P[a + 1], P[a + 2]]));
  }
  const inTri = (y, z, [a, b, c]) => {
    const s = (p, q) => (q[0] - p[0]) * (z - p[1]) - (q[1] - p[1]) * (y - p[0]);
    const d1 = s(a, b), d2 = s(b, c), d3 = s(c, a);
    return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
  };
  let ylo = Infinity, yhi = -Infinity, zlo = Infinity, zhi = -Infinity;
  for (const tr of tris) for (const [y, z] of tr) [ylo, yhi, zlo, zhi] = [Math.min(ylo, y), Math.max(yhi, y), Math.min(zlo, z), Math.max(zhi, z)];
  const step = 0.0005;
  const ny = Math.ceil((yhi - ylo) / step), nz = Math.ceil((zhi - zlo) / step);
  const hit = Array.from({ length: ny }, (_, i) => Array.from({ length: nz }, (_, j) => tris.some((tr) => inTri(ylo + i * step, zlo + j * step, tr))));
  // The hole: grid points not covered but with the pinna on every side.
  const reach = Math.round(0.012 / step);
  const covered = (i, j, di, dj) => {
    for (let k = 1; k <= reach; k++) if (hit[i + di * k]?.[j + dj * k]) return true;
    return false;
  };
  let sy = 0, sz = 0, n = 0;
  for (let i = 0; i < ny; i++) {
    for (let j = 0; j < nz; j++) {
      if (hit[i][j]) continue;
      if (covered(i, j, 1, 0) && covered(i, j, -1, 0) && covered(i, j, 0, 1) && covered(i, j, 0, -1)) {
        sy += ylo + i * step;
        sz += zlo + j * step;
        n++;
      }
    }
  }
  if (!n) throw new Error('ear: no opening found in the pinna');
  const hy = sy / n, hz = sz / n;
  // The canal starts at the inner (medial) end of the opening.
  let ex = -Infinity;
  for (let i = 0; i < P.length; i += 3) if (P[i] < 0 && Math.hypot(P[i + 1] - hy, P[i + 2] - hz) < 0.0045) ex = Math.max(ex, P[i]);
  const E = [ex - 0.0008, hy, hz];
  // The canal: about 2.4 cm, its outer part rising and turning back a little,
  // its inner, bony part running forwards and down to the eardrum.
  const canal = [[0, 0, 0], [4, 1.2, -0.6], [9, 1.8, -0.2], [15, 1.0, 1.0], [20, -0.2, 2.2], [23.6, -0.8, 2.9]].map((d) => off(E, d));
  const D = canal[canal.length - 1];
  // The eardrum faces outwards, downwards and forwards (about 55° to the canal's floor).
  const n0 = norm([-1, -0.7, 0.45]);
  const U = off(D, mul(n0, -1.8)); // the umbo, pulled in by the malleus
  const upOnDrum = norm(sub([0, 1, 0], mul(n0, n0[1])));
  // The oval window, about 5.6 mm in from the eardrum's centre, a little above and behind it.
  const OW = off(D, [5.6, 2.2, -1.3]);
  // The labyrinth turned upright: lateral from the windows, forwards from the vestibule to the cochlea.
  const mid = (a, b) => mul(add(a, b), 0.5);
  const L = norm(sub(mid(SCAN.OW, SCAN.RW), mid(SCAN.V, SCAN.C)));
  const A0 = sub(SCAN.C, SCAN.V);
  const An = norm(sub(A0, mul(L, dot(A0, L))));
  const S = cross(L, An);
  const th = (PITCH * Math.PI) / 180;
  const fwd = add(mul(An, Math.cos(th)), mul(S, Math.sin(th))), up = sub(mul(S, Math.cos(th)), mul(An, Math.sin(th)));
  const axes = [mul(L, -1), up, fwd];
  const local = (p) => axes.map((u) => dot(sub(p, SCAN.V), u) * MM);
  const shift = sub(OW, local(SCAN.OW));
  const toModel = (p) => add(local(p), shift);
  cached = { E, canal, D, n0, U, upOnDrum, OW, axes, shift, toModel, V: toModel(SCAN.V), C: toModel(SCAN.C), A: toModel(SCAN.A) };
  return cached;
}

/** The ossicles: where each one's landmarks are. */
function ossicles() {
  const { D, n0, U, upOnDrum, OW } = layout();
  const F = off(OW, [-0.25, 0, 0]); // the stapes footplate, in the oval window
  const SH = off(F, [-3.0, 0.1, 0.1]); // the stapes head
  const Li = off(SH, [-0.45, 0.15, 0]); // the incus's lenticular process
  const Bi = off(Li, [-1.1, 4.9, -1.0]); // the incus body
  const Hm = off(Bi, [-0.4, 0.4, 1.55]); // the malleus head, against the incus body (their joint)
  const LP = add(add(D, mul(upOnDrum, 3.2 * MM)), mul(n0, -0.47 * MM)); // its lateral process, on the drum
  return { F, SH, Li, Bi, Hm, LP, U };
}

const SKIN = '#e6b49b';

export default {
  id: 'ear',
  version: 2,
  order: 8,
  source: 'bp3d',
  subject: 'Biology',
  classes: [8, 9, 10, 11],
  title: t('Human ear', 'मानव कान', 'ಮಾನವ ಕಿವಿ'),
  summary: t(
    'The outer ear collects sound, the middle ear\'s three tiny bones pass the vibrations on, and the inner ear turns them into nerve signals. The inner ear also senses balance. Shown at its true size: the whole inner ear is smaller than a pea.',
    'बाहरी कान ध्वनि इकट्ठा करता है, मध्य कान की तीन छोटी हड्डियाँ कंपन आगे बढ़ाती हैं, और आंतरिक कान उन्हें तंत्रिका संकेतों में बदलता है। आंतरिक कान संतुलन भी पहचानता है। वास्तविक आकार में: पूरा आंतरिक कान एक मटर से भी छोटा है।',
    'ಹೊರಕಿವಿ ಶಬ್ದವನ್ನು ಸಂಗ್ರಹಿಸುತ್ತದೆ, ಮಧ್ಯಕಿವಿಯ ಮೂರು ಸಣ್ಣ ಮೂಳೆಗಳು ಕಂಪನಗಳನ್ನು ಮುಂದೆ ಸಾಗಿಸುತ್ತವೆ, ಒಳಕಿವಿ ಅವುಗಳನ್ನು ನರ ಸಂಕೇತಗಳಾಗಿ ಬದಲಿಸುತ್ತದೆ. ಒಳಕಿವಿ ಸಮತೋಲನವನ್ನೂ ಗ್ರಹಿಸುತ್ತದೆ. ನಿಜವಾದ ಗಾತ್ರದಲ್ಲಿ: ಇಡೀ ಒಳಕಿವಿ ಒಂದು ಬಟಾಣಿಗಿಂತ ಚಿಕ್ಕದು.',
  ),
  keywords: ['ear', 'human ear', 'hearing', 'sound', 'eardrum', 'cochlea', 'ossicles', 'semicircular canals', 'balance', 'sense organs', 'structure of the ear', 'neural control and coordination', 'auditory nerve', 'malleus', 'incus', 'stapes'],
  credit: 'Pinna: BodyParts3D, © The Database Center for Life Science, CC BY 4.0; inner ear: micro-CT bony labyrinth F07, Wimmer et al. 2019 (Zenodo 10.5281/zenodo.3355272), CC BY 4.0; middle ear built by ZYNETIX (simplified)',
  sources: {
    labyrinth: { file: 'ear/F07_uCT_SURF.ply', url: 'https://zenodo.org/api/records/3355272/files/F07.zip/content', zip: 'F07/uCT/F07_uCT_SURF.ply' },
  },
  groups: [
    { id: 'outer', name: t('Outer ear', 'बाहरी कान', 'ಹೊರಕಿವಿ') },
    { id: 'middle', name: t('Middle ear', 'मध्य कान', 'ಮಧ್ಯಕಿವಿ') },
    { id: 'inner', name: t('Inner ear', 'आंतरिक कान', 'ಒಳಕಿವಿ') },
  ],
  async import(k) {
    // The labyrinth, split into cochlea, vestibule and canals in the scanner's
    // frame, then turned and placed at the oval window.
    const { axes, shift } = layout();
    const scan = k.join(k.worldPrimitives(await k.readSource(k.source('labyrinth'))));
    const out = {};
    for (const id of ['cochlea', 'vestibule', 'semicircular_canals']) {
      const piece = k.clipRich(scan, (x, y, z) => labyrinthPart([x, y, z]) === id);
      const placed = k.orient(piece, { origin: SCAN.V, axes, scale: MM, translate: shift });
      out[id] = await k.simplifyRich({ ...placed, normals: undefined, material: { name: 'bone', color: [1, 1, 1, 1], roughness: 0.55, metalness: 0 } }, 0.14, 0.004);
    }
    // Plain parts: painted in the recipe's colours, not the scan's.
    for (const id of Object.keys(out)) out[id] = { ...out[id], colors: undefined };
    return out;
  },
  build(THREE) {
    const { canal, D, n0, OW, C, V } = layout();
    const o = ossicles();
    const V3 = (p) => new THREE.Vector3(...p);
    // The eardrum: a shallow cone, its tip (the umbo) pulled inwards, 0.3 mm thick.
    const R = 4.4 * MM, h = 1.8 * MM, th = 0.3 * MM;
    const drum = revolve(THREE, [[0, h], [R * 0.5, h * 0.42], [R, 0], [R, -th], [R * 0.5, h * 0.42 - th], [0, h - th]], 64);
    drum.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V3([0, 1, 0]), V3(mul(n0, -1))));
    drum.translate(...D);
    // The canal: an open tube of skin, wider at the outside.
    const canalTube = taperTube(THREE, curveThrough(THREE, canal), 3.7 * MM, 3.4 * MM, { segments: 60, radial: 28, caps: false });
    // The stapes: footplate in the oval window, two arched legs, the head.
    const F = o.F;
    const stapes = [
      blob(THREE, F, 0.3 * MM, 0.7 * MM, 1.45 * MM, 2),
      ...[1, -1].map((s) => wire(THREE, [off(F, [-0.15, 0, 1.15 * s]), off(F, [-1.3, 0.05, 1.05 * s]), off(F, [-2.3, 0.08, 0.5 * s]), off(o.SH, [0.35, 0, 0])], 0.17 * MM, 20)),
      blob(THREE, o.SH, 0.55 * MM, 0.5 * MM, 0.5 * MM, 2),
    ];
    // The incus: a body with a short process backwards and a long process down to the stapes.
    const incus = [
      blob(THREE, off(o.Bi, [0, 0, -0.25]), 1.05 * MM, 1.35 * MM, 1.45 * MM, 3),
      taperTube(THREE, curveThrough(THREE, [o.Bi, off(o.Bi, [0.15, 0.3, -1.8]), off(o.Bi, [0.25, 0.4, -3.4])]), 0.75 * MM, 0.25 * MM, { segments: 16, radial: 12 }),
      taperTube(THREE, curveThrough(THREE, [o.Bi, off(o.Li, [-0.65, 3.4, -0.65]), off(o.Li, [-0.35, 1.4, -0.2]), o.Li]), 0.55 * MM, 0.3 * MM, { segments: 24, radial: 12 }),
      blob(THREE, o.Li, 0.4 * MM, 0.35 * MM, 0.4 * MM, 2),
    ];
    // The malleus: the handle along the eardrum from the umbo, then neck and head.
    const malleus = [
      taperTube(THREE, curveThrough(THREE, [o.U, o.LP]), 0.25 * MM, 0.45 * MM, { segments: 12, radial: 12 }),
      taperTube(THREE, curveThrough(THREE, [o.LP, mid3(o.LP, o.Hm, [0.35, 0, 0]), o.Hm]), 0.45 * MM, 0.75 * MM, { segments: 16, radial: 12 }),
      blob(THREE, off(o.Hm, [0, 0.2, 0]), 0.9 * MM, 1.35 * MM, 0.95 * MM, 3),
      rod(THREE, off(o.LP, [0.3, 0.6, 0.2]), off(o.LP, [0.5, 0.9, 2.0]), 0.18 * MM, 8),
    ];
    // The air-filled middle ear between the eardrum and the inner ear.
    const M = off(mul(add(D, OW), 0.5), [0, 1.6, 0]);
    const cavity = blob(THREE, M, 3.4 * MM, 6.6 * MM, 5.0 * MM, 3);
    // The Eustachian tube: forwards, inwards and down towards the throat (its first 2 cm).
    const T0 = off(M, [0.5, -3.2, 3.8]);
    const tube = taperTube(THREE, curveThrough(THREE, [T0, off(T0, [3, -4.5, 5.5]), off(T0, [8, -11, 12]), off(T0, [11, -14.5, 16])]), 1.1 * MM, 2.0 * MM, { segments: 40, radial: 14 });
    // The vestibulocochlear nerve: branches from the cochlea and the vestibule join and run inwards to the brain stem.
    const J = off(mul(add(C, V), 0.5), [4.8, 0.8, -0.6]);
    const nerve = [
      taperTube(THREE, curveThrough(THREE, [off(C, [1.2, 0, -0.8]), off(J, [-1.5, -0.4, 0.6]), J]), 0.75 * MM, 0.95 * MM, { segments: 20, radial: 12 }),
      taperTube(THREE, curveThrough(THREE, [off(V, [1.6, 0.6, 0]), off(J, [-1.4, 0.6, -0.3]), J]), 0.7 * MM, 0.95 * MM, { segments: 20, radial: 12 }),
      taperTube(THREE, curveThrough(THREE, [J, off(J, [5, 0.8, -1]), off(J, [11, 1.6, -2.4])]), 1.3 * MM, 1.4 * MM, { segments: 24, radial: 14 }),
    ];
    return { ear_canal: canalTube, eardrum: drum, malleus, incus, stapes, middle_ear: cavity, eustachian_tube: tube, auditory_nerve: nerve };
  },
  parts: [
    {
      id: 'pinna', group: 'outer', color: SKIN, files: ['FJ2811'], keep: (x) => x < 0, explode: [-0.8, 0, 0],
      name: t('Pinna (outer ear)', 'कर्ण पल्लव (बाहरी कान)', 'ಕಿವಿ ಹಾಲೆ (ಹೊರಕಿವಿ)'),
      info: t('The flap of skin and cartilage we can see. Its folds collect sound waves and funnel them into the ear canal.', 'त्वचा और उपास्थि का वह भाग जो हमें दिखता है। इसकी तहें ध्वनि तरंगों को इकट्ठा करके कर्ण नलिका में भेजती हैं।', 'ನಮಗೆ ಕಾಣುವ ಚರ್ಮ ಮತ್ತು ಮೃದ್ವಸ್ಥಿಯ ಭಾಗ. ಇದರ ಮಡಿಕೆಗಳು ಶಬ್ದ ತರಂಗಗಳನ್ನು ಸಂಗ್ರಹಿಸಿ ಕಿವಿ ನಾಳದೊಳಗೆ ಕಳುಹಿಸುತ್ತವೆ.'),
    },
    {
      id: 'ear_canal', group: 'outer', color: '#d98f78', inside: '#c56f5c', explode: [-0.4, 0, 0],
      name: t('Ear canal', 'कर्ण नलिका', 'ಕಿವಿ ನಾಳ'),
      info: t('A tube about 2.5 cm long leading to the eardrum. Its wax and hairs trap dust.', 'लगभग 2.5 cm लंबी नली जो कर्णपटह तक जाती है। इसका मोम और बाल धूल रोकते हैं।', 'ಕಿವಿತಮಟೆಯವರೆಗೆ ಹೋಗುವ ಸುಮಾರು 2.5 cm ಉದ್ದದ ನಾಳ. ಇದರ ಮೇಣ ಮತ್ತು ಕೂದಲು ಧೂಳನ್ನು ತಡೆಯುತ್ತವೆ.'),
    },
    {
      id: 'eardrum', group: 'middle', color: '#d8cdbd', opacity: 0.82, explode: [-0.18, -0.05, 0.08],
      name: t('Eardrum (tympanic membrane)', 'कर्णपटह (कान का पर्दा)', 'ಕಿವಿತಮಟೆ'),
      info: t('A thin, tight membrane about 9 mm across at the end of the canal. Sound waves make it vibrate.', 'नलिका के सिरे पर लगभग 9 mm चौड़ी तनी हुई पतली झिल्ली। ध्वनि तरंगें इसे कंपित करती हैं।', 'ನಾಳದ ತುದಿಯಲ್ಲಿ ಸುಮಾರು 9 mm ಅಗಲದ ಬಿಗಿಯಾದ ತೆಳು ಪೊರೆ. ಶಬ್ದ ತರಂಗಗಳು ಅದನ್ನು ಕಂಪಿಸುತ್ತವೆ.'),
    },
    {
      id: 'malleus', group: 'middle', color: '#efe3c8', explode: [-0.05, 0.22, 0.15],
      name: t('Hammer (malleus)', 'मुग्दरक (मैलियस)', 'ಸುತ್ತಿಗೆ ಮೂಳೆ (ಮ್ಯಾಲಿಯಸ್)'),
      info: t('The first of the three ossicles, the smallest bones in the body (about 8 mm long). Its handle is joined to the eardrum and vibrates with it.', 'तीन कर्ण अस्थिकाओं में पहली, शरीर की सबसे छोटी हड्डियाँ (लगभग 8 mm लंबी)। इसका हत्था कर्णपटह से जुड़ा है और उसके साथ कंपित होता है।', 'ದೇಹದ ಅತಿ ಚಿಕ್ಕ ಮೂಳೆಗಳಾದ ಮೂರು ಕಿವಿ ಮೂಳೆಗಳಲ್ಲಿ ಮೊದಲನೆಯದು (ಸುಮಾರು 8 mm ಉದ್ದ). ಇದರ ಹಿಡಿ ಕಿವಿತಮಟೆಗೆ ಜೋಡಿಸಿದ್ದು ಅದರೊಂದಿಗೆ ಕಂಪಿಸುತ್ತದೆ.'),
    },
    {
      id: 'incus', group: 'middle', color: '#e6d6b8', explode: [0, 0.28, -0.12],
      name: t('Anvil (incus)', 'स्थूणक (इन्कस)', 'ಅಡಿಗಲ್ಲು ಮೂಳೆ (ಇಂಕಸ್)'),
      info: t('The middle ossicle, passing the vibrations from the hammer to the stirrup.', 'बीच की अस्थिका, जो कंपन मुग्दरक से वलयक तक पहुँचाती है।', 'ಮಧ್ಯದ ಕಿವಿ ಮೂಳೆ, ಕಂಪನಗಳನ್ನು ಸುತ್ತಿಗೆಯಿಂದ ರಿಕಾಪು ಮೂಳೆಗೆ ಸಾಗಿಸುತ್ತದೆ.'),
    },
    {
      id: 'stapes', group: 'middle', color: '#f6eedc', explode: [0.04, 0.12, 0.22],
      name: t('Stirrup (stapes)', 'वलयक (स्टेपीज़)', 'ರಿಕಾಪು ಮೂಳೆ (ಸ್ಟೇಪಿಸ್)'),
      info: t('The smallest bone in the body, about 3 mm. Its footplate fits the oval window of the inner ear. The three ossicles make the vibrations about 20 times stronger.', 'शरीर की सबसे छोटी हड्डी, लगभग 3 mm। इसका पाद आंतरिक कान की अंडाकार खिड़की पर बैठता है। तीनों अस्थिकाएँ कंपन को लगभग 20 गुना प्रबल करती हैं।', 'ದೇಹದ ಅತಿ ಚಿಕ್ಕ ಮೂಳೆ, ಸುಮಾರು 3 mm. ಇದರ ಪಾದ ಒಳಕಿವಿಯ ಅಂಡಾಕಾರದ ಕಿಟಕಿಯ ಮೇಲೆ ಕುಳಿತಿದೆ. ಮೂರು ಮೂಳೆಗಳು ಕಂಪನಗಳನ್ನು ಸುಮಾರು 20 ಪಟ್ಟು ಬಲಪಡಿಸುತ್ತವೆ.'),
    },
    {
      id: 'middle_ear', group: 'middle', color: '#f2d0c0', opacity: 0.16, minor: true, cap: false, explode: [0, 0, 0],
      name: t('Middle ear cavity', 'मध्य कर्ण गुहा', 'ಮಧ್ಯಕಿವಿ ಕುಹರ'),
      info: t('An air-filled space behind the eardrum that holds the three ossicles.', 'कर्णपटह के पीछे हवा से भरा स्थान जिसमें तीनों अस्थिकाएँ होती हैं।', 'ಕಿವಿತಮಟೆಯ ಹಿಂದೆ ಗಾಳಿ ತುಂಬಿದ ಜಾಗ, ಇದರಲ್ಲಿ ಮೂರು ಕಿವಿ ಮೂಳೆಗಳಿವೆ.'),
    },
    {
      id: 'eustachian_tube', group: 'middle', color: '#e39a96', explode: [0, -0.3, 0.25],
      name: t('Eustachian tube', 'कर्णनली (यूस्टेकियन नली)', 'ಯೂಸ್ಟೇಕಿಯನ್ ನಾಳ'),
      info: t('Joins the middle ear to the throat and keeps the air pressure equal on both sides of the eardrum (your ears "pop" when it opens).', 'मध्य कान को गले से जोड़ती है और कर्णपटह के दोनों ओर वायुदाब बराबर रखती है (इसके खुलने पर कान "पॉप" करते हैं)।', 'ಮಧ್ಯಕಿವಿಯನ್ನು ಗಂಟಲಿಗೆ ಜೋಡಿಸಿ ಕಿವಿತಮಟೆಯ ಎರಡೂ ಬದಿ ಗಾಳಿಯ ಒತ್ತಡ ಸಮವಾಗಿಡುತ್ತದೆ (ಇದು ತೆರೆದಾಗ ಕಿವಿ "ಪಾಪ್" ಆಗುತ್ತದೆ).'),
    },
    {
      id: 'semicircular_canals', group: 'inner', color: '#86c3e8', explode: [0.12, 0.3, -0.1],
      name: t('Semicircular canals', 'अर्धवृत्ताकार नलिकाएँ', 'ಅರ್ಧವೃತ್ತಾಕಾರದ ನಾಳಗಳು'),
      info: t('Three fluid-filled loops at right angles to each other. When the head turns the fluid moves, and they sense balance and movement, not sound.', 'एक-दूसरे से समकोण पर तीन द्रव भरे छल्ले। सिर घूमने पर द्रव हिलता है, और ये संतुलन और गति पहचानते हैं, ध्वनि नहीं।', 'ಪರಸ್ಪರ ಲಂಬ ಕೋನದಲ್ಲಿರುವ ಮೂರು ದ್ರವ ತುಂಬಿದ ಕುಣಿಕೆಗಳು. ತಲೆ ತಿರುಗಿದಾಗ ದ್ರವ ಚಲಿಸುತ್ತದೆ; ಇವು ಸಮತೋಲನ ಮತ್ತು ಚಲನೆಯನ್ನು ಗ್ರಹಿಸುತ್ತವೆ, ಶಬ್ದವನ್ನಲ್ಲ.'),
    },
    {
      id: 'vestibule', group: 'inner', color: '#a8d2ea', minor: true, explode: [0.15, 0.1, 0],
      name: t('Vestibule', 'प्रघाण (वेस्टिब्यूल)', 'ಮುಖಮಂಟಪ (ವೆಸ್ಟಿಬ್ಯೂಲ್)'),
      info: t('The chamber joining the cochlea and the semicircular canals; it senses which way is down. The stapes presses on its oval window.', 'कर्णावर्त और अर्धवृत्ताकार नलिकाओं को जोड़ने वाला कक्ष; यह पहचानता है कि नीचे किस ओर है। वलयक इसकी अंडाकार खिड़की पर दबाता है।', 'ಕಾಕ್ಲಿಯಾ ಮತ್ತು ಅರ್ಧವೃತ್ತಾಕಾರದ ನಾಳಗಳನ್ನು ಜೋಡಿಸುವ ಕೋಣೆ; ಕೆಳಗೆ ಯಾವ ಕಡೆ ಎಂದು ಗ್ರಹಿಸುತ್ತದೆ. ರಿಕಾಪು ಮೂಳೆ ಇದರ ಅಂಡಾಕಾರದ ಕಿಟಕಿಯ ಮೇಲೆ ಒತ್ತುತ್ತದೆ.'),
    },
    {
      id: 'cochlea', group: 'inner', color: '#b792e2', explode: [0.18, -0.12, 0.2],
      name: t('Cochlea', 'कर्णावर्त (कॉक्लिया)', 'ಕಾಕ್ಲಿಯಾ (ಶಂಖನಾಳ)'),
      info: t('A snail-shaped, fluid-filled tube of 2¾ turns, about 9 mm across. Vibrations of the fluid move tiny hair cells, which turn them into nerve signals; different places respond to different pitches.', 'लगभग 9 mm चौड़ी, 2¾ चक्करों वाली घोंघे जैसी द्रव भरी नली। द्रव के कंपन छोटी रोम कोशिकाओं को हिलाते हैं, जो उन्हें तंत्रिका संकेतों में बदलती हैं; अलग-अलग स्थान अलग-अलग तारत्व पर प्रतिक्रिया करते हैं।', 'ಸುಮಾರು 9 mm ಅಗಲದ, 2¾ ಸುರುಳಿಗಳ ಬಸವನ ಆಕಾರದ ದ್ರವ ತುಂಬಿದ ನಾಳ. ದ್ರವದ ಕಂಪನಗಳು ಸಣ್ಣ ರೋಮ ಕೋಶಗಳನ್ನು ಚಲಿಸುತ್ತವೆ, ಅವು ಅವುಗಳನ್ನು ನರ ಸಂಕೇತಗಳಾಗಿ ಬದಲಿಸುತ್ತವೆ; ಬೇರೆ ಬೇರೆ ಜಾಗಗಳು ಬೇರೆ ಬೇರೆ ಸ್ಥಾಯಿಗೆ ಸ್ಪಂದಿಸುತ್ತವೆ.'),
    },
    {
      id: 'auditory_nerve', group: 'inner', color: '#f2cf55', explode: [0.45, 0, 0],
      name: t('Auditory nerve', 'श्रवण तंत्रिका', 'ಶ್ರವಣ ನರ'),
      info: t('Carries the signals from the cochlea (and the balance organs) to the brain, which makes sense of them as sound.', 'कर्णावर्त (और संतुलन अंगों) से संकेत मस्तिष्क तक ले जाती है, जो उन्हें ध्वनि के रूप में समझता है।', 'ಕಾಕ್ಲಿಯಾದಿಂದ (ಮತ್ತು ಸಮತೋಲನ ಅಂಗಗಳಿಂದ) ಸಂಕೇತಗಳನ್ನು ಮಿದುಳಿಗೆ ಒಯ್ಯುತ್ತದೆ, ಮಿದುಳು ಅವುಗಳನ್ನು ಶಬ್ದವಾಗಿ ಅರ್ಥೈಸುತ್ತದೆ.'),
    },
  ],
  views: [
    { id: 'front', name: t('Section', 'काट', 'ಛೇದ'), dir: [0, 0.08, 1] },
    { id: 'outside', name: t('From outside', 'बाहर से', 'ಹೊರಗಿನಿಂದ'), dir: [-1, 0.15, 0.35] },
    { id: 'inner', name: t('Middle and inner ear', 'मध्य और आंतरिक कान', 'ಮಧ್ಯ ಮತ್ತು ಒಳಕಿವಿ'), dir: [0.75, 0.45, 1] },
  ],
  slices: [
    { id: 'canal', name: t('Cut along the ear canal', 'कर्ण नलिका के साथ काट', 'ಕಿವಿ ನಾಳದ ಉದ್ದಕ್ಕೂ ಕತ್ತರಿಕೆ'), normal: [0, 0, -1], through: 'ear_canal', view: 'front' },
  ],
  get animations() {
    const { E, canal, D } = layout();
    const o = ossicles();
    const { C, V, A } = layout();
    return [
      {
        id: 'hearing', kind: 'flow',
        name: t('How we hear', 'हम कैसे सुनते हैं', 'ನಾವು ಹೇಗೆ ಕೇಳುತ್ತೇವೆ'),
        steps: [
          {
            color: '#ffffff', highlight: ['pinna', 'ear_canal'],
            text: t('The pinna collects sound waves and the ear canal carries them in.', 'कर्ण पल्लव ध्वनि तरंगें इकट्ठा करता है और कर्ण नलिका उन्हें अंदर ले जाती है।', 'ಕಿವಿ ಹಾಲೆ ಶಬ್ದ ತರಂಗಗಳನ್ನು ಸಂಗ್ರಹಿಸುತ್ತದೆ, ಕಿವಿ ನಾಳ ಅವುಗಳನ್ನು ಒಳಗೆ ಒಯ್ಯುತ್ತದೆ.'),
            paths: [[off(E, [-22, 2, 6]), off(E, [-8, 0.5, 1]), ...canal]],
          },
          {
            color: '#ffe066', highlight: ['eardrum'],
            text: t('The sound waves make the eardrum vibrate.', 'ध्वनि तरंगें कर्णपटह को कंपित करती हैं।', 'ಶಬ್ದ ತರಂಗಗಳು ಕಿವಿತಮಟೆಯನ್ನು ಕಂಪಿಸುತ್ತವೆ.'),
            paths: [[off(D, [-3, 0, 0]), D]],
          },
          {
            color: '#ffe066', highlight: ['malleus', 'incus', 'stapes'],
            text: t('The hammer, anvil and stirrup pass the vibrations along and make them stronger.', 'मुग्दरक, स्थूणक और वलयक कंपन को आगे बढ़ाते हैं और प्रबल करते हैं।', 'ಸುತ್ತಿಗೆ, ಅಡಿಗಲ್ಲು ಮತ್ತು ರಿಕಾಪು ಮೂಳೆಗಳು ಕಂಪನಗಳನ್ನು ಮುಂದೆ ಸಾಗಿಸಿ ಬಲಪಡಿಸುತ್ತವೆ.'),
            paths: [[o.U, o.LP, o.Hm, o.Bi, o.Li, o.SH, o.F]],
          },
          {
            color: '#d9b8ff', highlight: ['cochlea'],
            text: t('The stirrup pushes on the fluid in the cochlea; hair cells turn the waves in the fluid into nerve signals.', 'वलयक कर्णावर्त के द्रव को धकेलता है; रोम कोशिकाएँ द्रव की तरंगों को तंत्रिका संकेतों में बदलती हैं।', 'ರಿಕಾಪು ಮೂಳೆ ಕಾಕ್ಲಿಯಾದ ದ್ರವವನ್ನು ತಳ್ಳುತ್ತದೆ; ರೋಮ ಕೋಶಗಳು ದ್ರವದ ತರಂಗಗಳನ್ನು ನರ ಸಂಕೇತಗಳಾಗಿ ಬದಲಿಸುತ್ತವೆ.'),
            paths: [[o.F, V, C, A]],
          },
          {
            color: '#f4d35e', highlight: ['auditory_nerve'],
            text: t('The auditory nerve carries the signals to the brain, and we hear the sound.', 'श्रवण तंत्रिका संकेतों को मस्तिष्क तक ले जाती है, और हम ध्वनि सुनते हैं।', 'ಶ್ರವಣ ನರ ಸಂಕೇತಗಳನ್ನು ಮಿದುಳಿಗೆ ಒಯ್ಯುತ್ತದೆ, ನಾವು ಶಬ್ದವನ್ನು ಕೇಳುತ್ತೇವೆ.'),
            paths: [[C, 'auditory_nerve', 'auditory_nerve@right']],
          },
          {
            color: '#9fe0ff', highlight: ['semicircular_canals', 'vestibule'],
            text: t('Separately, the semicircular canals and the vestibule sense the head\'s movement and keep us balanced.', 'अलग से, अर्धवृत्ताकार नलिकाएँ और प्रघाण सिर की गति पहचानते हैं और हमें संतुलित रखते हैं।', 'ಪ್ರತ್ಯೇಕವಾಗಿ, ಅರ್ಧವೃತ್ತಾಕಾರದ ನಾಳಗಳು ಮತ್ತು ಮುಖಮಂಟಪ ತಲೆಯ ಚಲನೆಯನ್ನು ಗ್ರಹಿಸಿ ನಮ್ಮನ್ನು ಸಮತೋಲನದಲ್ಲಿಡುತ್ತವೆ.'),
            paths: [[V, 'semicircular_canals@top', 'semicircular_canals@back', V]],
          },
        ],
      },
    ];
  },
};

/** The middle of [a] and [b], moved by [d] millimetres. */
function mid3(a, b, d) {
  return off(mul(add(a, b), 0.5), d);
}
