// Solid shapes for maths, built in code. Each shape is a variant. The flat
// faces of cube, cuboid, pyramid and prism fold about hinges, so "take
// apart" unfolds them into their nets; every shape can be cut to show its
// cross-sections.
const t = (en, hi, kn) => ({ en, hi, kn });

/** One flat face: a polygon (list of [x, y, z]) facing away from [inside]. */
function face(THREE, pts, inside = [0, 0, 0]) {
  const g = new THREE.BufferGeometry();
  const pos = [];
  const n = new THREE.Vector3().crossVectors(new THREE.Vector3(...pts[1]).sub(new THREE.Vector3(...pts[0])), new THREE.Vector3(...pts[2]).sub(new THREE.Vector3(...pts[0])));
  const c = pts.reduce((a, p) => a.add(new THREE.Vector3(...p)), new THREE.Vector3()).multiplyScalar(1 / pts.length);
  const flip = n.dot(c.clone().sub(new THREE.Vector3(...inside))) < 0;
  for (let i = 1; i + 1 < pts.length; i++) {
    const tri = flip ? [pts[0], pts[i + 1], pts[i]] : [pts[0], pts[i], pts[i + 1]];
    for (const p of tri) pos.push(...p);
  }
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return g;
}

/**
 * The hinge angle that lays a face flat: turning [onFace] about [axis]
 * through [pivot] until it points along [target].
 */
function flatten(THREE, pivot, axis, onFace, target) {
  const a = new THREE.Vector3(...axis).normalize();
  const v = new THREE.Vector3(...onFace).sub(new THREE.Vector3(...pivot));
  v.sub(a.clone().multiplyScalar(v.dot(a))).normalize();
  const w = new THREE.Vector3(...target).normalize();
  return Math.atan2(a.dot(new THREE.Vector3().crossVectors(v, w)), v.dot(w));
}

const box = (a, b, c) => {
  // Half sizes; the solid stands on y = -c/2... all faces as corner lists.
  const [x, y, z] = [a / 2, c / 2, b / 2];
  return {
    bottom: [[-x, -y, -z], [x, -y, -z], [x, -y, z], [-x, -y, z]],
    top: [[-x, y, -z], [x, y, -z], [x, y, z], [-x, y, z]],
    front: [[-x, -y, z], [x, -y, z], [x, y, z], [-x, y, z]],
    back: [[-x, -y, -z], [x, -y, -z], [x, y, -z], [-x, y, -z]],
    right: [[x, -y, -z], [x, -y, z], [x, y, z], [x, y, -z]],
    left: [[-x, -y, -z], [-x, -y, z], [-x, y, z], [-x, y, -z]],
    x, y, z,
  };
};

/** Hinges that unfold a box into the cross-shaped net (on its bottom face). */
function boxHinges(THREE, B, prefix) {
  const { x, y, z } = B;
  return {
    [`${prefix}_front`]: { point: [0, -y, z], axis: [1, 0, 0], angle: flatten(THREE, [0, -y, z], [1, 0, 0], [0, y, z], [0, 0, 1]) },
    [`${prefix}_back`]: { point: [0, -y, -z], axis: [1, 0, 0], angle: flatten(THREE, [0, -y, -z], [1, 0, 0], [0, y, -z], [0, 0, -1]) },
    [`${prefix}_right`]: { point: [x, -y, 0], axis: [0, 0, 1], angle: flatten(THREE, [x, -y, 0], [0, 0, 1], [x, y, 0], [1, 0, 0]) },
    [`${prefix}_left`]: { point: [-x, -y, 0], axis: [0, 0, 1], angle: flatten(THREE, [-x, -y, 0], [0, 0, 1], [-x, y, 0], [-1, 0, 0]) },
    // The top folds out from the front face's upper edge.
    [`${prefix}_top`]: { point: [0, y, z], axis: [1, 0, 0], angle: flatten(THREE, [0, y, z], [1, 0, 0], [0, y, -z], [0, 1, 0]), parent: `${prefix}_front` },
  };
}

const faceName = {
  bottom: t('Bottom face', 'निचला फलक', 'ಕೆಳಗಿನ ಮುಖ'),
  top: t('Top face', 'ऊपरी फलक', 'ಮೇಲಿನ ಮುಖ'),
  front: t('Front face', 'सामने का फलक', 'ಮುಂದಿನ ಮುಖ'),
  back: t('Back face', 'पीछे का फलक', 'ಹಿಂದಿನ ಮುಖ'),
  right: t('Right face', 'दायाँ फलक', 'ಬಲ ಮುಖ'),
  left: t('Left face', 'बायाँ फलक', 'ಎಡ ಮುಖ'),
};

const cubeInfo = t(
  'A cube: 6 equal square faces, 12 edges, 8 vertices. Surface area = 6a², volume = a³.',
  'घन: 6 बराबर वर्गाकार फलक, 12 किनारे, 8 शीर्ष। पृष्ठीय क्षेत्रफल = 6a², आयतन = a³।',
  'ಘನ: 6 ಸಮ ಚೌಕ ಮುಖಗಳು, 12 ಅಂಚುಗಳು, 8 ಶೃಂಗಗಳು. ಮೇಲ್ಮೈ ವಿಸ್ತೀರ್ಣ = 6a², ಘನಫಲ = a³.',
);
const cuboidInfo = t(
  'A cuboid: 6 rectangular faces in 3 pairs, 12 edges, 8 vertices. Surface area = 2(lb + bh + hl), volume = l × b × h.',
  'घनाभ: 3 जोड़ियों में 6 आयताकार फलक, 12 किनारे, 8 शीर्ष। पृष्ठीय क्षेत्रफल = 2(lb + bh + hl), आयतन = l × b × h।',
  'ಆಯತಘನ: 3 ಜೋಡಿಗಳಲ್ಲಿ 6 ಆಯತ ಮುಖಗಳು, 12 ಅಂಚುಗಳು, 8 ಶೃಂಗಗಳು. ಮೇಲ್ಮೈ ವಿಸ್ತೀರ್ಣ = 2(lb + bh + hl), ಘನಫಲ = l × b × h.',
);
const pyramidInfo = t(
  'A square pyramid: a square base and 4 triangular faces meeting at the apex; 8 edges, 5 vertices. Volume = ⅓ × base area × height.',
  'वर्ग पिरामिड: एक वर्गाकार आधार और शीर्ष पर मिलते 4 त्रिभुजाकार फलक; 8 किनारे, 5 शीर्ष। आयतन = ⅓ × आधार का क्षेत्रफल × ऊँचाई।',
  'ಚೌಕ ಪಿರಮಿಡ್: ಚೌಕ ತಳ ಮತ್ತು ಶಿಖರದಲ್ಲಿ ಸೇರುವ 4 ತ್ರಿಭುಜ ಮುಖಗಳು; 8 ಅಂಚುಗಳು, 5 ಶೃಂಗಗಳು. ಘನಫಲ = ⅓ × ತಳದ ವಿಸ್ತೀರ್ಣ × ಎತ್ತರ.',
);
const prismInfo = t(
  'A triangular prism: 2 triangles and 3 rectangles; 9 edges, 6 vertices. Volume = area of the triangle × length.',
  'त्रिभुजाकार प्रिज़्म: 2 त्रिभुज और 3 आयत; 9 किनारे, 6 शीर्ष। आयतन = त्रिभुज का क्षेत्रफल × लंबाई।',
  'ತ್ರಿಭುಜ ಪಟ್ಟಕ: 2 ತ್ರಿಭುಜಗಳು ಮತ್ತು 3 ಆಯತಗಳು; 9 ಅಂಚುಗಳು, 6 ಶೃಂಗಗಳು. ಘನಫಲ = ತ್ರಿಭುಜದ ವಿಸ್ತೀರ್ಣ × ಉದ್ದ.',
);
const cylinderInfo = t(
  'A cylinder: 2 circular faces and a curved surface. Curved surface area = 2πrh, total = 2πr(r + h), volume = πr²h.',
  'बेलन: 2 वृत्ताकार फलक और एक वक्र पृष्ठ। वक्र पृष्ठीय क्षेत्रफल = 2πrh, कुल = 2πr(r + h), आयतन = πr²h।',
  'ಸಿಲಿಂಡರ್: 2 ವೃತ್ತ ಮುಖಗಳು ಮತ್ತು ಒಂದು ವಕ್ರ ಮೇಲ್ಮೈ. ವಕ್ರ ಮೇಲ್ಮೈ ವಿಸ್ತೀರ್ಣ = 2πrh, ಒಟ್ಟು = 2πr(r + h), ಘನಫಲ = πr²h.',
);
const coneInfo = t(
  'A cone: a circular base and a curved surface up to the apex. Curved surface area = πrl, volume = ⅓πr²h. Cut it at different angles for the conic sections.',
  'शंकु: एक वृत्ताकार आधार और शीर्ष तक जाता वक्र पृष्ठ। वक्र पृष्ठीय क्षेत्रफल = πrl, आयतन = ⅓πr²h। शंकु परिच्छेदों के लिए इसे अलग-अलग कोणों पर काटें।',
  'ಶಂಕು: ವೃತ್ತಾಕಾರದ ತಳ ಮತ್ತು ಶಿಖರದವರೆಗಿನ ವಕ್ರ ಮೇಲ್ಮೈ. ವಕ್ರ ಮೇಲ್ಮೈ ವಿಸ್ತೀರ್ಣ = πrl, ಘನಫಲ = ⅓πr²h. ಶಂಕುಚ್ಛೇದಗಳಿಗಾಗಿ ಬೇರೆ ಬೇರೆ ಕೋನಗಳಲ್ಲಿ ಕತ್ತರಿಸಿ.',
);
const sphereInfo = t(
  'A sphere: every point on it is the same distance r from the centre. Surface area = 4πr², volume = ⁴⁄₃πr³.',
  'गोला: इसका हर बिंदु केंद्र से समान दूरी r पर है। पृष्ठीय क्षेत्रफल = 4πr², आयतन = ⁴⁄₃πr³।',
  'ಗೋಳ: ಇದರ ಪ್ರತಿ ಬಿಂದುವೂ ಕೇಂದ್ರದಿಂದ ಸಮಾನ ದೂರ r ನಲ್ಲಿದೆ. ಮೇಲ್ಮೈ ವಿಸ್ತೀರ್ಣ = 4πr², ಘನಫಲ = ⁴⁄₃πr³.',
);

const hinges = {};

export default {
  id: 'solids',
  version: 1,
  order: 1,
  source: 'procedural',
  subject: 'Maths',
  classes: [5, 6, 7, 8, 9, 10, 11],
  title: t('3D shapes and their nets', '3D आकृतियाँ और उनके जाल', '3D ಆಕೃತಿಗಳು ಮತ್ತು ಅವುಗಳ ಬಲೆಗಳು'),
  summary: t(
    'Turn each solid, unfold it into its net with "Take apart", and cut it to see its cross-sections.',
    'हर ठोस को घुमाएँ, "अलग करें" से उसका जाल खोलें, और काटकर उसके अनुप्रस्थ काट देखें।',
    'ಪ್ರತಿ ಘನಾಕೃತಿಯನ್ನು ತಿರುಗಿಸಿ, "ಬಿಡಿಸಿ" ಮೂಲಕ ಅದರ ಬಲೆಯನ್ನು ತೆರೆಯಿರಿ, ಕತ್ತರಿಸಿ ಅಡ್ಡಛೇದಗಳನ್ನು ನೋಡಿ.',
  ),
  keywords: ['solid shapes', '3d shapes', 'nets', 'cube', 'cuboid', 'cylinder', 'cone', 'sphere', 'pyramid', 'prism', 'surface area', 'volume', 'mensuration', 'visualising solid shapes', 'conic sections', 'cross section'],
  credit: 'Model built by KINETIX',
  edges: true,
  caps: 'flat',
  variants: [
    { id: 'cube', name: t('Cube', 'घन', 'ಘನ') },
    { id: 'cuboid', name: t('Cuboid', 'घनाभ', 'ಆಯತಘನ') },
    { id: 'pyramid', name: t('Square pyramid', 'वर्ग पिरामिड', 'ಚೌಕ ಪಿರಮಿಡ್') },
    { id: 'prism', name: t('Triangular prism', 'त्रिभुजाकार प्रिज़्म', 'ತ್ರಿಭುಜ ಪಟ್ಟಕ') },
    { id: 'cylinder', name: t('Cylinder', 'बेलन', 'ಸಿಲಿಂಡರ್') },
    { id: 'cone', name: t('Cone', 'शंकु', 'ಶಂಕು') },
    { id: 'sphere', name: t('Sphere', 'गोला', 'ಗೋಳ') },
  ],
  groups: [
    { id: 'faces', name: t('Faces', 'फलक', 'ಮುಖಗಳು') },
    { id: 'curved', name: t('Curved surfaces', 'वक्र पृष्ठ', 'ವಕ್ರ ಮೇಲ್ಮೈಗಳು') },
  ],
  build(THREE) {
    const out = {};
    // Cube and cuboid.
    for (const [v, dims] of [['cube', [0.1, 0.1, 0.1]], ['cuboid', [0.14, 0.08, 0.06]]]) {
      const B = box(...dims);
      for (const k of ['bottom', 'top', 'front', 'back', 'right', 'left']) out[`${v}_${k}`] = face(THREE, B[k]);
      Object.assign(hinges, boxHinges(THREE, B, v));
    }
    // Square pyramid (base 0.1, height 0.09).
    {
      const b = 0.05, y0 = -0.045, apex = [0, 0.045, 0];
      const base = [[-b, y0, -b], [b, y0, -b], [b, y0, b], [-b, y0, b]];
      out.pyramid_bottom = face(THREE, base);
      const sides = { front: [[-b, y0, b], [b, y0, b]], back: [[-b, y0, -b], [b, y0, -b]], right: [[b, y0, -b], [b, y0, b]], left: [[-b, y0, -b], [-b, y0, b]] };
      const out2 = { front: [0, 0, 1], back: [0, 0, -1], right: [1, 0, 0], left: [-1, 0, 0] };
      for (const [k, [p, q]] of Object.entries(sides)) {
        out[`pyramid_${k}`] = face(THREE, [p, q, apex], [0, -0.01, 0]);
        const mid = [(p[0] + q[0]) / 2, y0, (p[2] + q[2]) / 2];
        const axis = [q[0] - p[0], 0, q[2] - p[2]];
        hinges[`pyramid_${k}`] = { point: mid, axis, angle: flatten(THREE, mid, axis, apex, out2[k]) };
      }
    }
    // Triangular prism lying on a rectangular face.
    {
      const L = 0.07, w = 0.05, h = 0.05 * Math.sqrt(3), y0 = -h / 2;
      const A = (z) => [[-w, y0, z], [w, y0, z], [0, y0 + h, z]];
      const [f0, f1] = [A(L), A(-L)];
      out.prism_bottom = face(THREE, [f1[0], f1[1], f0[1], f0[0]]);
      out.prism_right = face(THREE, [f1[1], f1[2], f0[2], f0[1]]);
      out.prism_left = face(THREE, [f1[0], f1[2], f0[2], f0[0]]);
      out.prism_front = face(THREE, f0);
      out.prism_back = face(THREE, f1);
      hinges.prism_right = { point: [w, y0, 0], axis: [0, 0, 1], angle: flatten(THREE, [w, y0, 0], [0, 0, 1], [0, y0 + h, 0], [1, 0, 0]) };
      hinges.prism_left = { point: [-w, y0, 0], axis: [0, 0, 1], angle: flatten(THREE, [-w, y0, 0], [0, 0, 1], [0, y0 + h, 0], [-1, 0, 0]) };
      hinges.prism_front = { point: [0, y0, L], axis: [1, 0, 0], angle: flatten(THREE, [0, y0, L], [1, 0, 0], [0, y0 + h, L], [0, 0, 1]) };
      hinges.prism_back = { point: [0, y0, -L], axis: [1, 0, 0], angle: flatten(THREE, [0, y0, -L], [1, 0, 0], [0, y0 + h, -L], [0, 0, -1]) };
    }
    // Round solids: separate pieces, so "take apart" lifts off their ends.
    {
      const r = 0.045, h = 0.11;
      const side = new THREE.CylinderGeometry(r, r, h, 72, 1, true);
      out.cylinder_curved = side;
      const top = new THREE.CircleGeometry(r, 72).rotateX(-Math.PI / 2).translate(0, h / 2, 0);
      const bottom = new THREE.CircleGeometry(r, 72).rotateX(Math.PI / 2).translate(0, -h / 2, 0);
      out.cylinder_top = top;
      out.cylinder_bottom = bottom;
      out.cone_curved = new THREE.ConeGeometry(0.05, 0.11, 96, 24, true);
      out.cone_bottom = new THREE.CircleGeometry(0.05, 96).rotateX(Math.PI / 2).translate(0, -0.055, 0);
      out.sphere_surface = new THREE.SphereGeometry(0.055, 96, 64);
    }
    return out;
  },
  get parts() {
    const list = [];
    const flat = (v, info) => ['bottom', 'front', 'back', 'right', 'left', 'top'].map((k) => ({
      id: `${v}_${k}`, variant: v, group: 'faces', color: k === 'bottom' ? '#e39b2f' : '#4f8fd6', minor: k !== 'bottom',
      name: faceName[k], info,
      ...(hinges[`${v}_${k}`] ? { hinge: hinges[`${v}_${k}`] } : {}),
    }));
    list.push(...flat('cube', cubeInfo), ...flat('cuboid', cuboidInfo));
    list.push(...flat('pyramid', pyramidInfo).filter((p) => !p.id.endsWith('_top')).map((p) => (p.id === 'pyramid_bottom' ? p : { ...p, name: t('Triangular face', 'त्रिभुजाकार फलक', 'ತ್ರಿಭುಜ ಮುಖ') })));
    list.push(...flat('prism', prismInfo).filter((p) => !p.id.endsWith('_top')).map((p) => ({ ...p, name: p.id.endsWith('front') || p.id.endsWith('back') ? t('Triangular face', 'त्रिभुजाकार फलक', 'ತ್ರಿಭುಜ ಮುಖ') : p.id.endsWith('bottom') ? faceName.bottom : t('Rectangular face', 'आयताकार फलक', 'ಆಯತ ಮುಖ') })));
    list.push(
      { id: 'cylinder_curved', variant: 'cylinder', group: 'curved', color: '#4f8fd6', name: t('Curved surface', 'वक्र पृष्ठ', 'ವಕ್ರ ಮೇಲ್ಮೈ'), info: cylinderInfo, explode: [0, 0, 0] },
      { id: 'cylinder_top', variant: 'cylinder', group: 'faces', color: '#e39b2f', name: t('Circular face (top)', 'वृत्ताकार फलक (ऊपर)', 'ವೃತ್ತ ಮುಖ (ಮೇಲೆ)'), info: cylinderInfo, explode: [0, 1, 0] },
      { id: 'cylinder_bottom', variant: 'cylinder', group: 'faces', color: '#e39b2f', minor: true, name: t('Circular face (bottom)', 'वृत्ताकार फलक (नीचे)', 'ವೃತ್ತ ಮುಖ (ಕೆಳಗೆ)'), info: cylinderInfo, explode: [0, -1, 0] },
      { id: 'cone_curved', variant: 'cone', group: 'curved', color: '#4f8fd6', name: t('Curved surface', 'वक्र पृष्ठ', 'ವಕ್ರ ಮೇಲ್ಮೈ'), info: coneInfo, explode: [0, 0.4, 0] },
      { id: 'cone_bottom', variant: 'cone', group: 'faces', color: '#e39b2f', name: t('Circular base', 'वृत्ताकार आधार', 'ವೃತ್ತಾಕಾರದ ತಳ'), info: coneInfo, explode: [0, -1, 0] },
      { id: 'sphere_surface', variant: 'sphere', group: 'curved', color: '#4f8fd6', name: t('Curved surface', 'वक्र पृष्ठ', 'ವಕ್ರ ಮೇಲ್ಮೈ'), info: sphereInfo, explode: [0, 0, 0] },
    );
    return list;
  },
  views: [
    { id: 'corner', name: t('From a corner', 'कोने से', 'ಮೂಲೆಯಿಂದ'), dir: [1, 0.8, 1.2] },
    { id: 'front', name: t('Front', 'सामने से', 'ಮುಂಭಾಗ'), dir: [0, 0.05, 1] },
    { id: 'top', name: t('From above', 'ऊपर से', 'ಮೇಲಿನಿಂದ'), dir: [0, 1, 0.01] },
  ],
  slices: [
    { id: 'across', name: t('Straight across', 'सीधा आड़ा काट', 'ನೇರ ಅಡ್ಡ ಕತ್ತರಿಕೆ'), normal: [0, -1, 0], offset: 0.0, view: 'corner' },
    { id: 'down', name: t('Straight down', 'सीधा खड़ा काट', 'ನೇರ ಲಂಬ ಕತ್ತರಿಕೆ'), normal: [0, 0, -1], offset: 0.0, view: 'corner' },
    { id: 'slant', name: t('At a slant (an ellipse on a cone)', 'तिरछा काट (शंकु पर दीर्घवृत्त)', 'ಓರೆ ಕತ್ತರಿಕೆ (ಶಂಕುವಿನಲ್ಲಿ ದೀರ್ಘವೃತ್ತ)'), normal: [0, -0.94, 0.34], offset: 0.0, view: 'corner' },
    { id: 'steep', name: t('Parallel to the side (a parabola on a cone)', 'भुजा के समांतर (शंकु पर परवलय)', 'ಪಾರ್ಶ್ವಕ್ಕೆ ಸಮಾಂತರ (ಶಂಕುವಿನಲ್ಲಿ ಪರವಲಯ)'), normal: [0, -0.41, 0.91], offset: -0.01, view: 'corner' },
    { id: 'corner_cut', name: t('Cut off a corner', 'एक कोना काटकर', 'ಒಂದು ಮೂಲೆ ಕತ್ತರಿಸಿ'), normal: [-0.577, -0.577, -0.577], offset: -0.045, view: 'corner' },
  ],
  animations: [],
};
