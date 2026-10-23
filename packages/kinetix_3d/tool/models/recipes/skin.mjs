// A block of skin cut open at the front, built in code from textbook
// proportions (simplified; the epidermis is drawn thicker than life): the
// epidermis, dermis and fat beneath, with hairs and their follicles, an oil
// gland, the muscle that raises a hair, a sweat gland and its pore, blood
// vessels, a nerve and touch and pressure receptors. Everything inside is cut
// at the block's front face, so the section shows without a cut. Millimetres,
// the skin's surface at y = 0 and the cut face at z = 0. Downloaded on first use.
import { cutPlane } from '../lib/mesh.mjs';
import { blob, curveThrough, taperTube } from '../lib/shapes.mjs';
import { helix } from '../lib/teaching.mjs';

const t = (en, hi, kn) => ({ en, hi, kn });
const X0 = -3, X1 = 3, Z0 = -2.6, Z1 = 0;
const surface = (x, z) => 0.025 * Math.sin(x * 11 + z * 3);
const junction = (x, z) => -0.4 + 0.13 * Math.sin(x * 4.4 + 0.6) * Math.cos(z * 3.1);
const dermisFloor = (x, z) => -2.6 + 0.08 * Math.sin(x * 1.6 + z * 0.9);
const FLOOR = -5.2;

/** A closed solid over the block's footprint between two height functions (mm). */
function heightSlab(THREE, bottom, top, nx = 60, nz = 26) {
  const pos = [];
  const idx = [];
  const at = (i, j) => [X0 + ((X1 - X0) * i) / nx, Z0 + ((Z1 - Z0) * j) / nz];
  const T = (i, j) => i * (nz + 1) + j, B = (i, j) => (nx + 1) * (nz + 1) + i * (nz + 1) + j;
  for (const f of [top, bottom]) {
    for (let i = 0; i <= nx; i++) {
      for (let j = 0; j <= nz; j++) {
        const [x, z] = at(i, j);
        pos.push(x, f(x, z), z);
      }
    }
  }
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < nz; j++) {
      idx.push(T(i, j), T(i, j + 1), T(i + 1, j), T(i + 1, j), T(i, j + 1), T(i + 1, j + 1));
      idx.push(B(i, j), B(i + 1, j), B(i, j + 1), B(i + 1, j), B(i + 1, j + 1), B(i, j + 1));
    }
  }
  // The four sides.
  for (let i = 0; i < nx; i++) {
    idx.push(T(i, 0), T(i + 1, 0), B(i, 0), T(i + 1, 0), B(i + 1, 0), B(i, 0));
    idx.push(T(i, nz), B(i, nz), T(i + 1, nz), T(i + 1, nz), B(i, nz), B(i + 1, nz));
  }
  for (let j = 0; j < nz; j++) {
    idx.push(T(0, j), B(0, j), T(0, j + 1), T(0, j + 1), B(0, j), B(0, j + 1));
    idx.push(T(nx, j), T(nx, j + 1), B(nx, j), T(nx, j + 1), B(nx, j + 1), B(nx, j));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}

const tube = (THREE, pts, r0, r1 = r0, segments = 40) => taperTube(THREE, curveThrough(THREE, pts), r0, r1, { segments, radial: 12 });

/** A hair: shaft out of the skin, the follicle round its root and the bulb at the bottom. */
function hair(THREE, bulb, exit, tip) {
  const mid = [(bulb[0] + exit[0]) / 2 + 0.05, (bulb[1] + exit[1]) / 2, (bulb[2] + exit[2]) / 2];
  return {
    shaft: tube(THREE, [[bulb[0], bulb[1] + 0.12, bulb[2]], mid, exit, tip], 0.065, 0.05, 60),
    follicle: [tube(THREE, [[bulb[0], bulb[1] + 0.1, bulb[2]], mid, [exit[0] - 0.02, exit[1] - 0.45, exit[2]]], 0.15, 0.12), blob(THREE, bulb, 0.24, 0.27, 0.24, 3)],
  };
}

const plainRich = (m) => ({ positions: m.positions, indices: m.indices, material: { name: 'made', color: [1, 1, 1, 1], roughness: 0.6, metalness: 0, doubleSided: false, alpha: 'OPAQUE' } });

export default {
  id: 'skin',
  version: 1,
  order: 6.4,
  remote: true,
  topic: 'human',
  license: 'Same as the app',
  subject: 'Biology',
  classes: [7, 10, 11],
  title: t('Skin (layers)', 'त्वचा (परतें)', 'ಚರ್ಮ (ಪದರಗಳು)'),
  summary: t(
    'A small block of skin cut open: the epidermis on top, the dermis with hairs, glands, blood vessels and nerve endings, and a layer of fat underneath. The skin protects the body, feels touch and keeps the body\'s temperature steady. Simplified model.',
    'खोला गया त्वचा का एक छोटा टुकड़ा: ऊपर अधिचर्म, बालों, ग्रंथियों, रक्त वाहिकाओं और तंत्रिका सिरों वाली चर्म, और नीचे वसा की परत। त्वचा शरीर की रक्षा करती है, स्पर्श महसूस करती है और शरीर का ताप स्थिर रखती है। सरलीकृत मॉडल।',
    'ತೆರೆದ ಚರ್ಮದ ಸಣ್ಣ ತುಂಡು: ಮೇಲೆ ಹೊರಚರ್ಮ, ಕೂದಲು, ಗ್ರಂಥಿಗಳು, ರಕ್ತನಾಳಗಳು ಮತ್ತು ನರ ತುದಿಗಳಿರುವ ಒಳಚರ್ಮ, ಕೆಳಗೆ ಕೊಬ್ಬಿನ ಪದರ. ಚರ್ಮ ದೇಹವನ್ನು ರಕ್ಷಿಸುತ್ತದೆ, ಸ್ಪರ್ಶವನ್ನು ಅರಿಯುತ್ತದೆ ಮತ್ತು ದೇಹದ ತಾಪವನ್ನು ಸ್ಥಿರವಾಗಿಡುತ್ತದೆ. ಸರಳೀಕೃತ ಮಾದರಿ.',
  ),
  keywords: ['skin', 'epidermis', 'dermis', 'hair follicle', 'sweat gland', 'sebaceous gland', 'sense organs', 'touch', 'temperature control', 'excretion', 'sweat', 'melanin', 'integumentary system'],
  credit: 'Simplified model built by Zynetix from textbook proportions',
  groups: [
    { id: 'layers', name: t('Layers', 'परतें', 'ಪದರಗಳು') },
    { id: 'hair', name: t('Hair and glands', 'बाल और ग्रंथियाँ', 'ಕೂದಲು ಮತ್ತು ಗ್ರಂಥಿಗಳು') },
    { id: 'supply', name: t('Blood and nerves', 'रक्त और तंत्रिकाएँ', 'ರಕ್ತ ಮತ್ತು ನರಗಳು') },
  ],
  async import(k) {
    const THREE = k.THREE;
    const g = {};
    g.epidermis = heightSlab(THREE, junction, surface);
    g.dermis = heightSlab(THREE, dermisFloor, junction);
    g.hypodermis = heightSlab(THREE, () => FLOOR, dermisFloor, 30, 13);
    // Fat cells in the cut face of the lowest layer.
    const fat = [];
    for (let i = 0; i < 9; i++) {
      for (let j = 0; j < 3; j++) {
        const x = X0 + 0.35 + i * 0.66 + (j % 2) * 0.3, y = -3.1 - j * 0.68;
        if (x > X1 - 0.3) continue;
        fat.push(blob(THREE, [x, y, -0.15], 0.29, 0.27, 0.3, 2));
      }
    }
    g.fat_cells = fat;
    const h1 = hair(THREE, [-1.35, -3.05, -0.05], [-0.55, 0.02, -0.05], [0.45, 1.9, -0.25]);
    const h2 = hair(THREE, [2.05, -2.35, -0.6], [2.55, 0.02, -0.8], [3.3, 1.5, -1.0]);
    g.hair = [h1.shaft, h2.shaft];
    g.follicle = [...h1.follicle, ...h2.follicle];
    g.oil_gland = [blob(THREE, [-0.62, -1.15, -0.05], 0.24, 0.3, 0.22, 3), blob(THREE, [-0.5, -1.55, -0.05], 0.2, 0.22, 0.2, 3)];
    g.hair_muscle = tube(THREE, [[-1.05, -1.95, -0.05], [-0.45, -1.4, -0.05], [0.1, -0.85, -0.05], [0.35, -0.5, -0.05]], 0.055, 0.045, 24);
    // The sweat gland: a coil deep in the dermis, its duct winding up to a pore.
    g.sweat_gland = [
      helix(THREE, [1.0, -3.15, -0.05], [1.0, -2.65, -0.05], 0.24, 4, 0.075),
      tube(THREE, [[1.0, -2.65, -0.05], [0.8, -2.0, -0.05], [1.05, -1.3, -0.05], [0.85, -0.7, -0.05], [1.0, -0.35, -0.05], [0.9, -0.15, -0.05], [1.0, 0.03, -0.05]], 0.06, 0.06, 60),
    ];
    // Blood vessels: an artery and a vein along the bottom of the dermis, capillary loops up into the bumps under the epidermis.
    const capillaries = (dx) => [-2.2, -0.9, 0.25, 1.6, 2.6].map((x) => tube(THREE, [[x + dx, -2.3, -0.05], [x + dx + 0.05, -1.4, -0.05], [x + dx + 0.05, -0.62, -0.05], [x + 0.1, -0.5, -0.05]], 0.035, 0.03, 24));
    g.artery = [tube(THREE, [[X0, -2.32, -0.05], [-1, -2.25, -0.05], [1, -2.36, -0.05], [X1, -2.3, -0.05]], 0.085), ...capillaries(-0.08)];
    g.vein = [tube(THREE, [[X0, -2.5, -0.35], [-1, -2.45, -0.35], [1, -2.55, -0.35], [X1, -2.5, -0.35]], 0.1), ...capillaries(0.12).map((m) => m.translate(0, 0, -0.08))];
    // A nerve in the fat with a pressure receptor (Pacinian corpuscle), and a touch receptor up under the epidermis.
    g.nerve = [tube(THREE, [[X0, -3.75, -0.05], [-2.4, -3.8, -0.05], [-1.5, -3.6, -0.05], [0.4, -3.75, -0.05], [X1, -3.7, -0.05]], 0.07), tube(THREE, [[1.5, -3.72, -0.05], [1.9, -2.6, -0.05], [2.2, -1.3, -0.05], [2.25, -0.75, -0.05]], 0.04, 0.035, 40)];
    g.receptors = [blob(THREE, [-2.3, -4.35, -0.05], 0.32, 0.55, 0.3, 3), blob(THREE, [-2.3, -4.35, -0.05], 0.18, 0.4, 0.17, 2), blob(THREE, [2.27, -0.6, -0.05], 0.1, 0.17, 0.1, 2)];
    // Everything in metres, cut at the front face; the hair shafts stay whole above the skin.
    const out = {};
    for (const [id, geo] of Object.entries(g)) {
      const list = (Array.isArray(geo) ? geo : [geo]).map((x) => k.fromThree(x.scale(0.001, 0.001, 0.001), {}));
      const joined = list.length > 1 ? k.join(list.map((m, i) => ({ ...m, path: `${id}${i}` }))) : list[0];
      out[id] = id === 'hair' ? k.clipRich(joined, (x, y, z) => y > 0.0001 || z <= 0) : plainRich(cutPlane(joined, [0, 0, 0], [0, 0, -1]));
    }
    return out;
  },
  parts: [
    {
      id: 'epidermis', group: 'layers', color: '#e7b48c', inside: '#dca07a', explode: [0, 0.45, 0],
      name: t('Epidermis', 'अधिचर्म (बाह्य त्वचा)', 'ಹೊರಚರ್ಮ (ಎಪಿಡರ್ಮಿಸ್)'),
      info: t('The thin outer layer. Its surface cells are dead and keep falling off as new ones grow from below; melanin made here colours the skin and shields it from sunlight.', 'पतली बाहरी परत। इसकी सतह की कोशिकाएँ मृत होती हैं और नीचे से नई बनने पर झड़ती रहती हैं; यहाँ बना मेलेनिन त्वचा को रंग देता है और धूप से बचाता है।', 'ತೆಳುವಾದ ಹೊರಪದರ. ಇದರ ಮೇಲ್ಮೈ ಕೋಶಗಳು ಸತ್ತವು; ಕೆಳಗಿನಿಂದ ಹೊಸವು ಬೆಳೆದಂತೆ ಉದುರುತ್ತಿರುತ್ತವೆ. ಇಲ್ಲಿ ತಯಾರಾಗುವ ಮೆಲನಿನ್ ಚರ್ಮಕ್ಕೆ ಬಣ್ಣ ನೀಡಿ ಬಿಸಿಲಿನಿಂದ ರಕ್ಷಿಸುತ್ತದೆ.'),
    },
    {
      id: 'dermis', group: 'layers', color: '#efa59c', inside: '#e8938a', explode: [0, 0, 0],
      name: t('Dermis', 'चर्म (डर्मिस)', 'ಒಳಚರ್ಮ (ಡರ್ಮಿಸ್)'),
      info: t('The thick, tough, stretchy layer of living tissue that holds the hair roots, glands, blood vessels and nerve endings.', 'जीवित ऊतक की मोटी, मज़बूत, लचीली परत जिसमें बालों की जड़ें, ग्रंथियाँ, रक्त वाहिकाएँ और तंत्रिका सिरे होते हैं।', 'ಕೂದಲಿನ ಬೇರುಗಳು, ಗ್ರಂಥಿಗಳು, ರಕ್ತನಾಳಗಳು ಮತ್ತು ನರ ತುದಿಗಳನ್ನು ಹಿಡಿದಿರುವ ದಪ್ಪ, ಗಟ್ಟಿ, ಹಿಗ್ಗುವ ಜೀವಂತ ಅಂಗಾಂಶದ ಪದರ.'),
    },
    {
      id: 'hypodermis', group: 'layers', color: '#f2d27a', inside: '#ebc65c', explode: [0, -0.4, 0],
      name: t('Fat layer (hypodermis)', 'वसा परत (अधस्त्वचा)', 'ಕೊಬ್ಬಿನ ಪದರ (ಹೈಪೋಡರ್ಮಿಸ್)'),
      info: t('Fat under the skin that stores energy, keeps the body warm and cushions it against knocks.', 'त्वचा के नीचे की वसा जो ऊर्जा जमा करती है, शरीर को गर्म रखती है और चोट से बचाने वाली गद्दी बनती है।', 'ಶಕ್ತಿಯನ್ನು ಸಂಗ್ರಹಿಸುವ, ದೇಹವನ್ನು ಬೆಚ್ಚಗಿಡುವ ಮತ್ತು ಪೆಟ್ಟಿನಿಂದ ಮೆತ್ತೆಯಂತೆ ಕಾಪಾಡುವ ಚರ್ಮದಡಿಯ ಕೊಬ್ಬು.'),
    },
    {
      id: 'fat_cells', group: 'layers', color: '#f9e6a6', minor: true, explode: [0, -0.4, 0.3],
      name: t('Fat cells', 'वसा कोशिकाएँ', 'ಕೊಬ್ಬಿನ ಕೋಶಗಳು'),
      info: t('Each cell holds a large drop of fat.', 'हर कोशिका में वसा की एक बड़ी बूँद होती है।', 'ಪ್ರತಿ ಕೋಶದಲ್ಲೂ ಕೊಬ್ಬಿನ ಒಂದು ದೊಡ್ಡ ಹನಿ ಇರುತ್ತದೆ.'),
    },
    {
      id: 'hair', group: 'hair', color: '#3a2a1f', explode: [0, 0.9, 0],
      name: t('Hair', 'बाल', 'ಕೂದಲು'),
      info: t('A thread of dead cells made of the protein keratin, growing out of a follicle.', 'केराटिन प्रोटीन से बनी मृत कोशिकाओं का धागा, जो रोमकूप से बाहर उगता है।', 'ಕೆರಟಿನ್ ಪ್ರೋಟೀನಿನಿಂದಾದ ಸತ್ತ ಕೋಶಗಳ ಎಳೆ; ಕೋಶಕದಿಂದ ಹೊರಗೆ ಬೆಳೆಯುತ್ತದೆ.'),
    },
    {
      id: 'follicle', group: 'hair', color: '#e8b98e', explode: [-0.2, 0.3, 0.5],
      name: t('Hair follicle and root', 'रोमकूप और बाल की जड़', 'ಕೂದಲಿನ ಕೋಶಕ ಮತ್ತು ಬೇರು'),
      info: t('A pocket in the skin where the hair grows from living cells in the bulb at its base.', 'त्वचा की एक थैली, जहाँ उसके तल के कंद की जीवित कोशिकाओं से बाल उगता है।', 'ಚರ್ಮದ ಒಂದು ಜೇಬು; ಅದರ ತಳದ ಗೆಡ್ಡೆಯಲ್ಲಿರುವ ಜೀವಕೋಶಗಳಿಂದ ಕೂದಲು ಬೆಳೆಯುತ್ತದೆ.'),
    },
    {
      id: 'oil_gland', group: 'hair', color: '#f4d35e', explode: [0.1, 0.3, 0.6],
      name: t('Oil gland (sebaceous gland)', 'तेल ग्रंथि (त्वग्वसीय ग्रंथि)', 'ಎಣ್ಣೆ ಗ್ರಂಥಿ (ಸೆಬೇಸಿಯಸ್ ಗ್ರಂಥಿ)'),
      info: t('Makes an oil, sebum, that keeps the hair and skin soft and waterproof.', 'सीबम नामक तेल बनाती है, जो बालों और त्वचा को मुलायम और जलरोधी रखता है।', 'ಕೂದಲು ಮತ್ತು ಚರ್ಮವನ್ನು ಮೃದು ಮತ್ತು ಜಲನಿರೋಧಕವಾಗಿಡುವ ಸೀಬಮ್ ಎಣ್ಣೆಯನ್ನು ತಯಾರಿಸುತ್ತದೆ.'),
    },
    {
      id: 'hair_muscle', group: 'hair', color: '#c0504d', minor: true, explode: [0.2, 0.3, 0.6],
      name: t('Hair muscle (arrector pili)', 'रोम पेशी (एरेक्टर पिलि)', 'ಕೂದಲಿನ ಸ್ನಾಯು (ಅರೆಕ್ಟರ್ ಪಿಲಿ)'),
      info: t('A tiny muscle that pulls the hair upright when we are cold or scared: goosebumps.', 'एक छोटी पेशी जो ठंड या डर लगने पर बाल को खड़ा कर देती है: रोंगटे खड़े होना।', 'ಚಳಿ ಅಥವಾ ಭಯವಾದಾಗ ಕೂದಲನ್ನು ನೇರ ನಿಲ್ಲಿಸುವ ಸಣ್ಣ ಸ್ನಾಯು: ರೋಮಾಂಚನ.'),
    },
    {
      id: 'sweat_gland', group: 'hair', color: '#7fb0e6', explode: [0.3, 0, 0.6],
      name: t('Sweat gland and pore', 'स्वेद ग्रंथि और रोमछिद्र', 'ಬೆವರು ಗ್ರಂಥಿ ಮತ್ತು ರಂಧ್ರ'),
      info: t('A coiled tube that makes sweat from water, salts and a little urea. Sweat comes out through a pore and cools the body as it evaporates.', 'कुंडलित नली जो पानी, लवण और थोड़े यूरिया से पसीना बनाती है। पसीना रोमछिद्र से बाहर आता है और वाष्पित होकर शरीर को ठंडा करता है।', 'ನೀರು, ಲವಣಗಳು ಮತ್ತು ಸ್ವಲ್ಪ ಯೂರಿಯಾದಿಂದ ಬೆವರು ತಯಾರಿಸುವ ಸುರುಳಿ ನಾಳ. ಬೆವರು ರಂಧ್ರದ ಮೂಲಕ ಹೊರಬಂದು ಆವಿಯಾಗುವಾಗ ದೇಹವನ್ನು ತಂಪಾಗಿಸುತ್ತದೆ.'),
    },
    {
      id: 'artery', group: 'supply', color: '#d2312e', explode: [0, -0.15, 0.6],
      name: t('Artery and capillaries', 'धमनी और केशिकाएँ', 'ಅಪಧಮನಿ ಮತ್ತು ಲೋಮನಾಳಗಳು'),
      info: t('Bring blood to the skin. When we are hot they widen and the skin goes red, losing heat.', 'त्वचा तक रक्त लाती हैं। गर्मी लगने पर ये चौड़ी हो जाती हैं और त्वचा लाल होकर ऊष्मा खोती है।', 'ಚರ್ಮಕ್ಕೆ ರಕ್ತ ತರುತ್ತವೆ. ಸೆಖೆಯಾದಾಗ ಇವು ಹಿಗ್ಗಿ ಚರ್ಮ ಕೆಂಪಾಗಿ ಶಾಖ ಕಳೆದುಕೊಳ್ಳುತ್ತದೆ.'),
    },
    {
      id: 'vein', group: 'supply', color: '#3a5bbf', explode: [0, -0.25, 0.6],
      name: t('Vein', 'शिरा', 'ಅಭಿಧಮನಿ'),
      info: t('Takes the blood back towards the heart.', 'रक्त को वापस हृदय की ओर ले जाती है।', 'ರಕ್ತವನ್ನು ಮರಳಿ ಹೃದಯದತ್ತ ಒಯ್ಯುತ್ತದೆ.'),
    },
    {
      id: 'nerve', group: 'supply', color: '#f2cf55', explode: [0, -0.35, 0.6],
      name: t('Nerve', 'तंत्रिका', 'ನರ'),
      info: t('Carries messages of touch, pressure, heat, cold and pain to the brain.', 'स्पर्श, दबाव, गर्मी, ठंड और दर्द के संदेश मस्तिष्क तक ले जाती है।', 'ಸ್ಪರ್ಶ, ಒತ್ತಡ, ಶಾಖ, ಚಳಿ ಮತ್ತು ನೋವಿನ ಸಂದೇಶಗಳನ್ನು ಮಿದುಳಿಗೆ ಒಯ್ಯುತ್ತದೆ.'),
    },
    {
      id: 'receptors', group: 'supply', color: '#f7b267', explode: [0, -0.3, 0.8],
      name: t('Touch and pressure receptors', 'स्पर्श और दाब ग्राही', 'ಸ್ಪರ್ಶ ಮತ್ತು ಒತ್ತಡ ಗ್ರಾಹಕಗಳು'),
      info: t('Nerve endings wrapped in layers: a small one near the surface feels light touch, a big onion-like one deep down feels pressure and vibration.', 'परतों में लिपटे तंत्रिका सिरे: सतह के पास का छोटा हल्का स्पर्श महसूस करता है, गहराई में प्याज़ जैसा बड़ा दबाव और कंपन महसूस करता है।', 'ಪದರಗಳಲ್ಲಿ ಸುತ್ತಿದ ನರ ತುದಿಗಳು: ಮೇಲ್ಮೈ ಬಳಿಯ ಚಿಕ್ಕದು ಹಗುರ ಸ್ಪರ್ಶವನ್ನು, ಆಳದ ಈರುಳ್ಳಿಯಂತಹ ದೊಡ್ಡದು ಒತ್ತಡ ಮತ್ತು ಕಂಪನವನ್ನು ಅರಿಯುತ್ತದೆ.'),
    },
  ],
  views: [
    { id: 'front', name: t('Cut face', 'कटा हुआ भाग', 'ಕತ್ತರಿಸಿದ ಮುಖ'), dir: [0.35, 0.3, 1] },
    { id: 'top', name: t('Surface', 'सतह', 'ಮೇಲ್ಮೈ'), dir: [0.2, 1, 0.4] },
  ],
  slices: [],
  animations: [],
};
