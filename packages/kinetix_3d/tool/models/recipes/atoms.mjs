// Bohr models of the first 20 elements, built in code: a nucleus of
// protons and neutrons, and electrons in shells (K, L, M, N) that orbit.
import { blob } from '../lib/shapes.mjs';

const t = (en, hi, kn) => ({ en, hi, kn });

// [symbol, English, Hindi, Kannada, neutrons of the commonest isotope]
const ELEMENTS = [
  ['H', 'Hydrogen', 'हाइड्रोजन', 'ಹೈಡ್ರೋಜನ್', 0], ['He', 'Helium', 'हीलियम', 'ಹೀಲಿಯಂ', 2], ['Li', 'Lithium', 'लिथियम', 'ಲಿಥಿಯಂ', 4],
  ['Be', 'Beryllium', 'बेरिलियम', 'ಬೆರಿಲಿಯಂ', 5], ['B', 'Boron', 'बोरॉन', 'ಬೋರಾನ್', 6], ['C', 'Carbon', 'कार्बन', 'ಕಾರ್ಬನ್', 6],
  ['N', 'Nitrogen', 'नाइट्रोजन', 'ನೈಟ್ರೋಜನ್', 7], ['O', 'Oxygen', 'ऑक्सीजन', 'ಆಮ್ಲಜನಕ', 8], ['F', 'Fluorine', 'फ्लोरीन', 'ಫ್ಲೋರಿನ್', 10],
  ['Ne', 'Neon', 'नियॉन', 'ನಿಯಾನ್', 10], ['Na', 'Sodium', 'सोडियम', 'ಸೋಡಿಯಂ', 12], ['Mg', 'Magnesium', 'मैग्नीशियम', 'ಮೆಗ್ನೀಸಿಯಂ', 12],
  ['Al', 'Aluminium', 'एल्युमिनियम', 'ಅಲ್ಯೂಮಿನಿಯಂ', 14], ['Si', 'Silicon', 'सिलिकॉन', 'ಸಿಲಿಕಾನ್', 14], ['P', 'Phosphorus', 'फॉस्फोरस', 'ರಂಜಕ', 16],
  ['S', 'Sulphur', 'सल्फर (गंधक)', 'ಗಂಧಕ', 16], ['Cl', 'Chlorine', 'क्लोरीन', 'ಕ್ಲೋರಿನ್', 18], ['Ar', 'Argon', 'आर्गन', 'ಆರ್ಗಾನ್', 22],
  ['K', 'Potassium', 'पोटैशियम', 'ಪೊಟ್ಯಾಸಿಯಂ', 20], ['Ca', 'Calcium', 'कैल्शियम', 'ಕ್ಯಾಲ್ಸಿಯಂ', 20],
];
const SHELLS = ['K', 'L', 'M', 'N'];
const CAPACITY = [2, 8, 8, 8]; // how the first 20 elements fill their shells
const RADII = [0.045, 0.072, 0.099, 0.126];
// Each shell is tipped a little differently, so the atom reads as 3D.
const TILTS = [[0.35, 0.1], [-0.3, 0.35], [0.25, -0.4], [-0.2, 0.3]];

function configuration(z) {
  const out = [];
  let left = z;
  for (const c of CAPACITY) {
    if (left <= 0) break;
    out.push(Math.min(c, left));
    left -= c;
  }
  return out;
}

/** Points spread evenly through a ball (for packing the nucleus). */
function packed(n, radius) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const k = i + 0.5;
    const r = radius * Math.cbrt(k / n);
    const phi = Math.acos(1 - (2 * k) / n), theta = Math.PI * (1 + Math.sqrt(5)) * k;
    pts.push([r * Math.cos(theta) * Math.sin(phi), r * Math.sin(theta) * Math.sin(phi), r * Math.cos(phi)]);
  }
  return pts;
}

/** The normal of shell [s]: (0, 0, 1) turned by the shell's tilt (Euler XYZ). */
function shellNormal(s) {
  const [a, b] = TILTS[s];
  return [Math.sin(b), -Math.cos(b) * Math.sin(a), Math.cos(b) * Math.cos(a)];
}

function shellFrame(THREE, s) {
  const [a, b] = TILTS[s];
  // Shells face the class (like the textbook drawing), each tipped a little.
  return new THREE.Quaternion().setFromEuler(new THREE.Euler(a, b, 0));
}

export default {
  id: 'atoms',
  version: 1,
  order: 1,
  source: 'procedural',
  subject: 'Chemistry',
  classes: [9, 10, 11],
  title: t('Atoms: the first 20 elements', 'परमाणु: पहले 20 तत्व', 'ಪರಮಾಣುಗಳು: ಮೊದಲ 20 ಧಾತುಗಳು'),
  summary: t(
    'Bohr models: protons and neutrons in the nucleus, electrons moving in shells around it. Choose an element to see its electron configuration.',
    'बोर मॉडल: नाभिक में प्रोटॉन और न्यूट्रॉन, और उसके चारों ओर कक्षाओं में घूमते इलेक्ट्रॉन। किसी तत्व को चुनकर उसका इलेक्ट्रॉनिक विन्यास देखें।',
    'ಬೋರ್ ಮಾದರಿಗಳು: ಬೀಜಕೇಂದ್ರದಲ್ಲಿ ಪ್ರೋಟಾನ್-ನ್ಯೂಟ್ರಾನ್‌ಗಳು, ಸುತ್ತಲಿನ ಕವಚಗಳಲ್ಲಿ ಚಲಿಸುವ ಎಲೆಕ್ಟ್ರಾನ್‌ಗಳು. ಧಾತುವನ್ನು ಆರಿಸಿ ಅದರ ಎಲೆಕ್ಟ್ರಾನ್ ವಿನ್ಯಾಸ ನೋಡಿ.',
  ),
  keywords: ['atom', 'atoms', 'structure of the atom', 'bohr model', 'electron', 'proton', 'neutron', 'electronic configuration', 'shells', 'atoms and molecules', 'valency'],
  credit: 'Model built by KINETIX',
  thumb: 'na', // the library picture shows sodium's three shells
  variants: ELEMENTS.map(([sym, en, hi, kn], i) => ({ id: sym.toLowerCase(), name: t(`${i + 1}. ${en} (${sym})`, `${i + 1}. ${hi} (${sym})`, `${i + 1}. ${kn} (${sym})`) })),
  groups: [
    { id: 'nucleus', name: t('Nucleus', 'नाभिक', 'ಬೀಜಕೇಂದ್ರ') },
    { id: 'electrons', name: t('Electrons and shells', 'इलेक्ट्रॉन और कोश', 'ಎಲೆಕ್ಟ್ರಾನ್‌ಗಳು ಮತ್ತು ಕವಚಗಳು') },
  ],
  build(THREE) {
    const out = {};
    ELEMENTS.forEach(([sym, , , , neutrons], i) => {
      const z = i + 1, v = sym.toLowerCase();
      const n = z + neutrons;
      const R = 0.0055 * Math.cbrt(n) + 0.004;
      const spots = packed(n, R);
      // Mix protons and neutrons through the nucleus.
      const protons = [], neutronsList = [];
      spots.forEach((p, k) => (k % 2 === 0 && protons.length < z) || neutronsList.length >= neutrons ? protons.push(p) : neutronsList.push(p));
      out[`${v}_protons`] = protons.map((p) => blob(THREE, p, 0.0055, 0.0055, 0.0055, 3));
      if (neutronsList.length) out[`${v}_neutrons`] = neutronsList.map((p) => blob(THREE, p, 0.0055, 0.0055, 0.0055, 3));
      configuration(z).forEach((count, s) => {
        const q = shellFrame(THREE, s);
        const ring = new THREE.TorusGeometry(RADII[s], 0.0009, 6, 128);
        ring.applyQuaternion(q);
        out[`${v}_shell_${SHELLS[s]}`] = ring;
        out[`${v}_electrons_${SHELLS[s]}`] = Array.from({ length: count }, (_, k) => {
          const a = (k / count) * Math.PI * 2 + s * 0.4;
          const p = new THREE.Vector3(Math.cos(a) * RADII[s], Math.sin(a) * RADII[s], 0).applyQuaternion(q);
          return blob(THREE, [p.x, p.y, p.z], 0.0045, 0.0045, 0.0045, 3);
        });
      });
    });
    return out;
  },
  get parts() {
    const list = [];
    ELEMENTS.forEach(([sym, en, hi, kn, neutrons], i) => {
      const z = i + 1, v = sym.toLowerCase();
      const conf = configuration(z);
      const confText = conf.join(', ');
      list.push({
        id: `${v}_protons`, variant: v, group: 'nucleus', color: '#e0483f',
        name: t(`Protons: ${z}`, `प्रोटॉन: ${z}`, `ಪ್ರೋಟಾನ್‌ಗಳು: ${z}`),
        info: t(`Positive particles in the nucleus. ${en} has ${z}, which is its atomic number.`, `नाभिक के धनावेशित कण। ${hi} में ${z} हैं, यही इसकी परमाणु संख्या है।`, `ಬೀಜಕೇಂದ್ರದ ಧನಾವೇಶಿತ ಕಣಗಳು. ${kn} ಇಲ್ಲಿ ${z} ಇವೆ; ಇದೇ ಅದರ ಪರಮಾಣು ಸಂಖ್ಯೆ.`),
      });
      if (neutrons) {
        list.push({
          id: `${v}_neutrons`, variant: v, group: 'nucleus', color: '#9aa3ad',
          name: t(`Neutrons: ${neutrons}`, `न्यूट्रॉन: ${neutrons}`, `ನ್ಯೂಟ್ರಾನ್‌ಗಳು: ${neutrons}`),
          info: t(`Particles with no charge. Mass number = protons + neutrons = ${z + neutrons}.`, `आवेश-रहित कण। द्रव्यमान संख्या = प्रोटॉन + न्यूट्रॉन = ${z + neutrons}।`, `ಆವೇಶವಿಲ್ಲದ ಕಣಗಳು. ರಾಶಿ ಸಂಖ್ಯೆ = ಪ್ರೋಟಾನ್ + ನ್ಯೂಟ್ರಾನ್ = ${z + neutrons}.`),
        });
      }
      conf.forEach((count, s) => {
        const sh = SHELLS[s];
        const outer = s === conf.length - 1;
        list.push({
          id: `${v}_shell_${sh}`, variant: v, group: 'electrons', color: '#8fb8e6', minor: true,
          name: t(`${sh} shell`, `${sh} कोश`, `${sh} ಕವಚ`),
          info: t(`Shell ${sh} holds at most ${2 * (s + 1) ** 2} electrons. ${en}: ${confText}.`, `${sh} कोश में अधिकतम ${2 * (s + 1) ** 2} इलेक्ट्रॉन आ सकते हैं। ${hi}: ${confText}।`, `${sh} ಕವಚದಲ್ಲಿ ಗರಿಷ್ಠ ${2 * (s + 1) ** 2} ಎಲೆಕ್ಟ್ರಾನ್‌ಗಳು. ${kn}: ${confText}.`),
        });
        list.push({
          id: `${v}_electrons_${sh}`, variant: v, group: 'electrons', color: outer ? '#f2b33d' : '#4f8fd6', glow: outer ? 0.25 : 0,
          // Electrons turn about their shell's own axis (the ring's normal).
          spin: { axis: shellNormal(s), speed: 70 - s * 14, centre: [0, 0, 0] },
          name: outer
            ? t(`Valence electrons (${sh}): ${count}`, `संयोजी इलेक्ट्रॉन (${sh}): ${count}`, `ವೇಲೆನ್ಸ್ ಎಲೆಕ್ಟ್ರಾನ್‌ಗಳು (${sh}): ${count}`)
            : t(`Electrons in ${sh}: ${count}`, `${sh} में इलेक्ट्रॉन: ${count}`, `${sh} ನಲ್ಲಿ ಎಲೆಕ್ಟ್ರಾನ್‌ಗಳು: ${count}`),
          info: outer
            ? t(`The outermost electrons decide how ${en} reacts. Configuration ${confText}.`, `सबसे बाहरी इलेक्ट्रॉन तय करते हैं कि ${hi} कैसे अभिक्रिया करेगा। विन्यास ${confText}।`, `ಹೊರಗಿನ ಎಲೆಕ್ಟ್ರಾನ್‌ಗಳು ${kn} ಹೇಗೆ ವರ್ತಿಸುತ್ತದೆ ಎಂದು ನಿರ್ಧರಿಸುತ್ತವೆ. ವಿನ್ಯಾಸ ${confText}.`)
            : t(`Negative particles moving around the nucleus. ${en}: ${confText}.`, `नाभिक के चारों ओर घूमते ऋणावेशित कण। ${hi}: ${confText}।`, `ಬೀಜಕೇಂದ್ರದ ಸುತ್ತ ಚಲಿಸುವ ಋಣಾವೇಶಿತ ಕಣಗಳು. ${kn}: ${confText}.`),
        });
      });
    });
    return list;
  },
  views: [
    { id: 'front', name: t('Front', 'सामने से', 'ಮುಂಭಾಗ'), dir: [0.15, 0.2, 1] },
    { id: 'side', name: t('Side', 'बगल से', 'ಪಕ್ಕದಿಂದ'), dir: [1, 0.3, 0.3] },
  ],
  slices: [],
  animations: [
    { id: 'orbit', kind: 'orbit', name: t('Electrons moving', 'घूमते इलेक्ट्रॉन', 'ಚಲಿಸುವ ಎಲೆಕ್ಟ್ರಾನ್‌ಗಳು') },
  ],
};

export { shellFrame, TILTS };
