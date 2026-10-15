// The stomach from BodyParts3D (CC BY 4.0), with the end of the oesophagus
// and the start of the duodenum. Its wall is made in two layers a few
// millimetres thick inside the real outer surface: the muscle coat, and the
// lining (mucosa) with its folds (rugae); the wall is split into the fundus,
// body and pyloric part. The two sphincters are drawn as rings. Downloaded on
// first use.
import { readBp3d, weld, normals, cutPlane, components, centroid } from '../lib/mesh.mjs';
import { t } from '../lib/teaching.mjs';

const sub = (a, b) => a.map((v, k) => v - b[k]);
const add = (a, b) => a.map((v, k) => v + b[k]);
const mul = (a, s) => a.map((v) => v * s);
const norm = (a) => mul(a, 1 / Math.hypot(...a));
const dist = (a, b) => Math.hypot(...sub(a, b));
const bp3d = (f) => weld(readBp3d(process.env.BP3D, f));
const vert = (m, i) => [m.positions[i * 3], m.positions[i * 3 + 1], m.positions[i * 3 + 2]];
const verts = (m) => Array.from({ length: m.positions.length / 3 }, (_, i) => vert(m, i));
const mean = (ps) => [0, 1, 2].map((k) => ps.reduce((a, p) => a + p[k], 0) / ps.length);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** Each triangle split in four (new points at the edges' middles), so folds can be drawn on a coarse surface. */
function subdivide(m) {
  const pos = Array.from(m.positions);
  const mids = new Map();
  const mid = (a, b) => {
    const key = a < b ? `${a},${b}` : `${b},${a}`;
    if (!mids.has(key)) {
      mids.set(key, pos.length / 3);
      for (let k = 0; k < 3; k++) pos.push((pos[a * 3 + k] + pos[b * 3 + k]) / 2);
    }
    return mids.get(key);
  };
  const idx = [];
  for (let i = 0; i < m.indices.length; i += 3) {
    const [a, b, c] = [m.indices[i], m.indices[i + 1], m.indices[i + 2]];
    const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a);
    idx.push(a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca);
  }
  return { positions: new Float32Array(pos), indices: new Uint32Array(idx) };
}

/**
 * A closed wall between two surfaces inside [m]: [m] moved in along its
 * normals by [d0], and again by [d1(p)] (turned inside out), as one solid.
 */
function wall(m, d0, d1) {
  const n = normals(m);
  const nv = m.positions.length / 3;
  const positions = new Float32Array(nv * 6);
  for (let i = 0; i < nv; i++) {
    const p = vert(m, i), q = [n[i * 3], n[i * 3 + 1], n[i * 3 + 2]];
    const a = sub(p, mul(q, d0)), b = sub(p, mul(q, d1(p)));
    positions.set(a, i * 3);
    positions.set(b, (nv + i) * 3);
  }
  const indices = new Uint32Array(m.indices.length * 2);
  for (let i = 0; i < m.indices.length; i += 3) {
    indices.set([m.indices[i], m.indices[i + 1], m.indices[i + 2]], i);
    indices.set([m.indices[i] + nv, m.indices[i + 2] + nv, m.indices[i + 1] + nv], m.indices.length + i);
  }
  return { positions, indices };
}

let cached = null;
function layout() {
  if (cached) return cached;
  if (!process.env.BP3D) throw new Error('stomach: set BP3D');
  const S = subdivide(subdivide(bp3d('FJ2564'))), O = bp3d('FJ2563'), D = bp3d('FJ2573');
  const sv = verts(S), ov = verts(O), dv = verts(D);
  // The cardia: where the oesophagus's lowest part meets the stomach.
  const omin = Math.min(...ov.map((p) => p[1]));
  const ringC = mean(ov.filter((p) => p[1] < omin + 0.012));
  const upC = mean(ov.filter((p) => p[1] > omin + 0.02 && p[1] < omin + 0.045));
  // The pylorus: the stomach's point nearest the duodenum.
  let P = null, best = Infinity;
  for (const p of sv) {
    for (let j = 0; j < dv.length; j += 7) {
      const d = dist(p, dv[j]);
      if (d < best) [best, P] = [d, p];
    }
  }
  const ringP = mean(dv.filter((p) => dist(p, P) < 0.012));
  const inP = mean(sv.filter((p) => dist(p, P) < 0.025));
  // The stomach's own flat: the direction it is thinnest in (its points' least spread), facing forwards.
  const c = mean(sv);
  const cov = [0, 1, 2].map((i) => [0, 1, 2].map((j) => sv.reduce((a, p) => a + (p[i] - c[i]) * (p[j] - c[j]), 0) / sv.length));
  const inv = (() => {
    const [a, b, cc] = cov;
    const det = a[0] * (b[1] * cc[2] - b[2] * cc[1]) - a[1] * (b[0] * cc[2] - b[2] * cc[0]) + a[2] * (b[0] * cc[1] - b[1] * cc[0]);
    return [
      [(b[1] * cc[2] - b[2] * cc[1]) / det, (a[2] * cc[1] - a[1] * cc[2]) / det, (a[1] * b[2] - a[2] * b[1]) / det],
      [(b[2] * cc[0] - b[0] * cc[2]) / det, (a[0] * cc[2] - a[2] * cc[0]) / det, (a[2] * b[0] - a[0] * b[2]) / det],
      [(b[0] * cc[1] - b[1] * cc[0]) / det, (a[1] * cc[0] - a[0] * cc[1]) / det, (a[0] * b[1] - a[1] * b[0]) / det],
    ];
  })();
  let flat = [0, 0, 1];
  for (let it = 0; it < 60; it++) flat = norm([0, 1, 2].map((i) => dot(inv[i], flat)));
  if (flat[2] < 0) flat = mul(flat, -1);
  cached = { S, O, D, ringC, axisC: norm(sub(upC, ringC)), P, ringP, axisP: norm(sub(ringP, inP)), omin, cardiaY: ringC[1], flat };
  return cached;
}

/** Which region of the stomach wall a point is in. */
function region(p) {
  const { ringC, P } = layout();
  if (p[1] > ringC[1] - 0.004) return 'fundus';
  if (dist(p, P) < 0.06) return 'pylorus';
  return 'body';
}

const ring = (THREE, centre, axis, r, tube) => {
  const g = new THREE.TorusGeometry(r, tube, 16, 48);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(...axis)));
  g.translate(...centre);
  return g;
};

const plainRich = (m) => ({ positions: m.positions, indices: m.indices, material: { name: 'made', color: [1, 1, 1, 1], roughness: 0.6, metalness: 0, doubleSided: false, alpha: 'OPAQUE' } });

export default {
  id: 'stomach',
  version: 1,
  order: 6.1,
  source: 'bp3d',
  remote: true,
  topic: 'human',
  license: 'CC BY 4.0',
  subject: 'Biology',
  classes: [7, 10, 11],
  title: t('Stomach', 'आमाशय', 'ಜಠರ'),
  summary: t(
    'A J-shaped muscular bag that holds about a litre of food. Its walls churn the food with acid and enzymes for two to four hours before letting it into the small intestine a little at a time.',
    'J आकार की पेशीय थैली जिसमें लगभग एक लीटर भोजन समाता है। इसकी दीवारें दो से चार घंटे तक भोजन को अम्ल और एंजाइमों के साथ मथती हैं, फिर उसे थोड़ा-थोड़ा करके छोटी आँत में जाने देती हैं।',
    'ಸುಮಾರು ಒಂದು ಲೀಟರ್ ಆಹಾರ ಹಿಡಿಯುವ J ಆಕಾರದ ಸ್ನಾಯು ಚೀಲ. ಇದರ ಗೋಡೆಗಳು ಎರಡರಿಂದ ನಾಲ್ಕು ಗಂಟೆ ಆಹಾರವನ್ನು ಆಮ್ಲ ಮತ್ತು ಕಿಣ್ವಗಳೊಂದಿಗೆ ಕಲಕಿ, ನಂತರ ಸ್ವಲ್ಪ ಸ್ವಲ್ಪವಾಗಿ ಸಣ್ಣ ಕರುಳಿಗೆ ಬಿಡುತ್ತವೆ.',
  ),
  keywords: ['stomach', 'digestion', 'gastric juice', 'hydrochloric acid', 'pepsin', 'rugae', 'pylorus', 'sphincter', 'fundus', 'oesophagus', 'esophagus', 'nutrition in animals', 'life processes', 'digestion and absorption'],
  credit: 'Stomach, oesophagus and duodenum: BodyParts3D, © The Database Center for Life Science, CC BY 4.0; wall layers and sphincters built by ZYNETIX (simplified)',
  groups: [
    { id: 'stomach', name: t('Stomach wall', 'आमाशय की दीवार', 'ಜಠರದ ಗೋಡೆ') },
    { id: 'tube', name: t('Food pipe and intestine', 'भोजन नली और आँत', 'ಅನ್ನನಾಳ ಮತ್ತು ಕರುಳು') },
  ],
  async import(k) {
    const { S, O, D, ringC, axisC, P, ringP, axisP, omin } = layout();
    const THREE = k.THREE;
    const out = {};
    // The muscle coat, 3.5 mm thick, split into its regions (one solid when cut).
    const coat = plainRich(wall(S, 0, () => 0.0035));
    for (const id of ['fundus', 'body', 'pylorus']) out[id] = k.clipRich(coat, (x, y, z) => region([x, y, z]) === id);
    // The lining: 2-3 mm more, with lengthwise folds.
    const along = norm(sub(ringC, P));
    const across = norm([along[1], -along[0], 0]);
    const folds = (p) => 0.0058 + 0.0011 * Math.max(0, Math.sin((2 * Math.PI * (p[0] * across[0] + p[1] * across[1] + p[2] * across[2])) / 0.007));
    out.mucosa = plainRich(wall(S, 0.0035, folds));
    // The oesophagus's last 5 cm and the duodenum's first 5 cm.
    out.oesophagus = plainRich(cutPlane(O, [0, omin + 0.05, 0], [0, -1, 0]));
    // The duodenum up to a cut 4 cm past the pylorus; only the piece joined to the stomach.
    const dCut = cutPlane(D, add(ringP, mul(axisP, 0.04)), mul(axisP, -1));
    const pieces = components(dCut).sort((a, b) => dist(centroid(a), ringP) - dist(centroid(b), ringP));
    out.duodenum = plainRich(pieces[0]);
    out.cardiac_sphincter = k.fromThree(ring(THREE, add(ringC, mul(axisC, 0.004)), axisC, 0.0105, 0.0026), {});
    out.pyloric_sphincter = k.fromThree(ring(THREE, add(ringP, mul(axisP, -0.006)), axisP, 0.0095, 0.0036), {});
    return out;
  },
  parts: [
    {
      id: 'fundus', group: 'stomach', color: '#d9867a', capWith: 'body', detail: 0.15, inside: '#b8584f', explode: [-0.1, 0.5, 0],
      name: t('Fundus', 'फंडस (कोष)', 'ಫಂಡಸ್'),
      info: t('The rounded top of the stomach, above where the food pipe joins. Swallowed air collects here.', 'आमाशय का गोल ऊपरी भाग, जहाँ भोजन नली जुड़ती है उसके ऊपर। निगली गई हवा यहाँ इकट्ठा होती है।', 'ಅನ್ನನಾಳ ಸೇರುವ ಜಾಗದ ಮೇಲಿನ ಜಠರದ ದುಂಡು ಮೇಲ್ಭಾಗ. ನುಂಗಿದ ಗಾಳಿ ಇಲ್ಲಿ ಸಂಗ್ರಹವಾಗುತ್ತದೆ.'),
    },
    {
      id: 'body', group: 'stomach', color: '#e0928a', detail: 0.15, inside: '#b8584f', explode: [0.3, 0, 0.1],
      name: t('Body (muscle coat)', 'काय (पेशीय परत)', 'ಕಾಯ (ಸ್ನಾಯು ಪದರ)'),
      info: t('The main part. Three layers of muscle running in different directions squeeze and churn the food into a thick paste called chyme.', 'मुख्य भाग। अलग-अलग दिशाओं में चलती पेशियों की तीन परतें भोजन को दबाकर और मथकर गाढ़े लेप, काइम, में बदलती हैं।', 'ಮುಖ್ಯ ಭಾಗ. ಬೇರೆ ಬೇರೆ ದಿಕ್ಕಿನಲ್ಲಿ ಸಾಗುವ ಮೂರು ಸ್ನಾಯು ಪದರಗಳು ಆಹಾರವನ್ನು ಹಿಂಡಿ ಕಲಕಿ ಕೈಮ್ ಎಂಬ ಗಟ್ಟಿ ಮಿಶ್ರಣವಾಗಿಸುತ್ತವೆ.'),
    },
    {
      id: 'pylorus', group: 'stomach', color: '#e5a094', capWith: 'body', detail: 0.15, inside: '#b8584f', explode: [-0.4, -0.3, 0.1],
      name: t('Pyloric part', 'जठरनिर्गमी भाग (पाइलोरस)', 'ಪೈಲೋರಿಕ್ ಭಾಗ'),
      info: t('The narrowing end that leads to the small intestine. Strong waves of muscle push the chyme towards the pylorus.', 'संकरा होता सिरा जो छोटी आँत की ओर जाता है। पेशियों की तेज़ लहरें काइम को पाइलोरस की ओर धकेलती हैं।', 'ಸಣ್ಣ ಕರುಳಿನತ್ತ ಸಾಗುವ ಕಿರಿದಾಗುವ ತುದಿ. ಸ್ನಾಯುಗಳ ಬಲವಾದ ಅಲೆಗಳು ಕೈಮ್ ಅನ್ನು ಪೈಲೋರಸ್‌ನತ್ತ ತಳ್ಳುತ್ತವೆ.'),
    },
    {
      id: 'mucosa', group: 'stomach', color: '#e88c8c', detail: 0.45, inside: '#c9686e', explode: [0.1, 0, 0.5],
      name: t('Lining (mucosa) with folds', 'भीतरी अस्तर (श्लेष्मा) और सिलवटें', 'ಒಳಪದರ (ಲೋಳೆಪೊರೆ) ಮತ್ತು ಮಡಿಕೆಗಳು'),
      info: t('Its gastric glands make hydrochloric acid, the enzyme pepsin and mucus, which stops the stomach digesting itself. The folds (rugae) flatten out as the stomach fills.', 'इसकी जठर ग्रंथियाँ हाइड्रोक्लोरिक अम्ल, एंजाइम पेप्सिन और श्लेष्मा बनाती हैं, जो आमाशय को स्वयं को पचाने से रोकता है। आमाशय भरने पर सिलवटें (रूगी) फैल जाती हैं।', 'ಇದರ ಜಠರ ಗ್ರಂಥಿಗಳು ಹೈಡ್ರೋಕ್ಲೋರಿಕ್ ಆಮ್ಲ, ಪೆಪ್ಸಿನ್ ಕಿಣ್ವ ಮತ್ತು ಲೋಳೆಯನ್ನು ತಯಾರಿಸುತ್ತವೆ; ಲೋಳೆ ಜಠರ ತನ್ನನ್ನೇ ಜೀರ್ಣಿಸಿಕೊಳ್ಳದಂತೆ ತಡೆಯುತ್ತದೆ. ಜಠರ ತುಂಬಿದಾಗ ಮಡಿಕೆಗಳು (ರೂಗೇ) ಹರಡಿಕೊಳ್ಳುತ್ತವೆ.'),
    },
    {
      id: 'oesophagus', group: 'tube', color: '#d98383', explode: [0, 0.8, 0],
      name: t('Oesophagus (food pipe)', 'ग्रासनली (भोजन नली)', 'ಅನ್ನನಾಳ'),
      info: t('Brings swallowed food down from the throat in waves of squeezing (peristalsis).', 'निगले गए भोजन को सिकुड़न की लहरों (क्रमाकुंचन) से गले से नीचे लाती है।', 'ನುಂಗಿದ ಆಹಾರವನ್ನು ಸಂಕೋಚನದ ಅಲೆಗಳಿಂದ (ಪೆರಿಸ್ಟಾಲ್ಸಿಸ್) ಗಂಟಲಿನಿಂದ ಕೆಳಗೆ ತರುತ್ತದೆ.'),
    },
    {
      id: 'cardiac_sphincter', group: 'tube', color: '#a54848', explode: [0, 0.55, 0.2],
      name: t('Cardiac sphincter', 'हृदय अवरोधिनी (कार्डियक स्फिंक्टर)', 'ಕಾರ್ಡಿಯಾಕ್ ಸ್ಪಿಂಕ್ಟರ್'),
      info: t('A ring of muscle that lets food in and stops acid coming back up (when it fails, we feel heartburn).', 'पेशियों का छल्ला जो भोजन को अंदर आने देता है और अम्ल को ऊपर लौटने से रोकता है (इसके विफल होने पर सीने में जलन होती है)।', 'ಆಹಾರವನ್ನು ಒಳಗೆ ಬಿಟ್ಟು ಆಮ್ಲ ಮೇಲೆ ಮರಳದಂತೆ ತಡೆಯುವ ಸ್ನಾಯು ಉಂಗುರ (ಇದು ವಿಫಲವಾದಾಗ ಎದೆಯುರಿ ಆಗುತ್ತದೆ).'),
    },
    {
      id: 'pyloric_sphincter', group: 'tube', color: '#a54848', explode: [-0.6, -0.2, 0.2],
      name: t('Pyloric sphincter', 'जठरनिर्गमी अवरोधिनी (पाइलोरिक स्फिंक्टर)', 'ಪೈಲೋರಿಕ್ ಸ್ಪಿಂಕ್ಟರ್'),
      info: t('A thick ring of muscle that opens now and then to let a little chyme into the duodenum.', 'पेशियों का मोटा छल्ला जो समय-समय पर खुलकर थोड़ा काइम ग्रहणी में जाने देता है।', 'ಆಗಾಗ ತೆರೆದು ಸ್ವಲ್ಪ ಕೈಮ್ ಅನ್ನು ಡ್ಯುಯೊಡಿನಮ್‌ಗೆ ಬಿಡುವ ದಪ್ಪ ಸ್ನಾಯು ಉಂಗುರ.'),
    },
    {
      id: 'duodenum', group: 'tube', color: '#e6ab70', explode: [-0.8, -0.4, 0],
      name: t('Duodenum', 'ग्रहणी', 'ಡ್ಯುಯೊಡಿನಮ್'),
      info: t('The first part of the small intestine, where bile and pancreatic juice join the food.', 'छोटी आँत का पहला भाग, जहाँ पित्त और अग्न्याशयी रस भोजन से मिलते हैं।', 'ಸಣ್ಣ ಕರುಳಿನ ಮೊದಲ ಭಾಗ; ಇಲ್ಲಿ ಪಿತ್ತರಸ ಮತ್ತು ಮೇದೋಜೀರಕ ರಸ ಆಹಾರವನ್ನು ಸೇರುತ್ತವೆ.'),
    },
  ],
  get views() {
    const { flat } = layout();
    return [
      { id: 'front', name: t('Front', 'सामने से', 'ಮುಂಭಾಗ'), dir: [0, 0.1, 1] },
      { id: 'angle', name: t('At an angle', 'तिरछे', 'ಓರೆಯಾಗಿ'), dir: [-0.5, 0.3, 1] },
      { id: 'inside', name: t('Inside', 'भीतर', 'ಒಳಗೆ'), dir: flat.map((v) => Math.round(v * 1000) / 1000) },
    ];
  },
  get slices() {
    const { flat } = layout();
    return [{ id: 'open', name: t('Cut open from the front', 'सामने से खोला गया', 'ಮುಂಭಾಗದಿಂದ ತೆರೆದದ್ದು'), normal: flat.map((v) => -Math.round(v * 1000) / 1000), through: 'mucosa', view: 'inside' }];
  },
  animations: [],
};
