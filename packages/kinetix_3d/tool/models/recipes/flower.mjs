// The parts of a flower, built in code: a textbook bisexual flower with
// sepals, petals, stamens (filament and anther) and the pistil (stigma,
// style and a hollow ovary holding ovules). Cut it lengthwise for the
// "L.S. of a flower" picture; the pollination steps follow pollen from the
// anther to an ovule.
import { blob, taperTube, curveThrough, sheet } from '../lib/shapes.mjs';

const t = (en, hi, kn) => ({ en, hi, kn });

const PETALS = 5, STAMENS = 6;
// The front petal faces the class (+z).
const petalAngle = (k) => Math.PI / 2 + (k * 2 * Math.PI) / PETALS;
const sepalAngle = (k) => petalAngle(k) + Math.PI / PETALS;
const stamenAngle = (k) => Math.PI / 6 + (k * 2 * Math.PI) / STAMENS;

/** A petal-like sheet round the flower at angle [a]: u along it, v across. */
function blade(a, { r0, y0, length, width, rise, cup, droop = 0, ruffle = 0 }) {
  const R = [Math.cos(a), 0, Math.sin(a)], T = [-Math.sin(a), 0, Math.cos(a)];
  return (u, v) => {
    const s = (v - 0.5) * 2;
    const w = width * Math.sin(Math.PI * Math.pow(u, 0.7));
    const rho = r0 + length * 0.92 * Math.pow(u, 1.05);
    const y = y0 + length * rise * Math.sin(u * Math.PI * 0.55) - droop * u * u * length + cup * s * s * w + ruffle * Math.sin(u * 14 + s * 3) * u;
    const side = (s * w) / 2;
    return [R[0] * rho + T[0] * side, y, R[2] * rho + T[2] * side];
  };
}

const PETAL = { r0: 0.0115, y0: 0.002, length: 0.075, width: 0.058, rise: 0.62, cup: 0.18, droop: 0.12, ruffle: 0.0012 };
const SEPAL = { r0: 0.008, y0: -0.004, length: 0.036, width: 0.017, rise: 0.75, cup: 0.25, droop: 0.05 };
const petalAt = (k, u, v = 0.5) => blade(petalAngle(k), PETAL)(u, v);

// Stamens: a filament curving up and out, an anther at its tip.
const stamenTip = (k) => {
  const a = stamenAngle(k);
  return [Math.cos(a) * 0.021, 0.056, Math.sin(a) * 0.021];
};
const stamenCurve = (k) => {
  const a = stamenAngle(k), c = Math.cos(a), s = Math.sin(a);
  return [[c * 0.0135, 0.004, s * 0.0135], [c * 0.015, 0.025, s * 0.015], [c * 0.017, 0.045, s * 0.017], stamenTip(k)];
};

// The pistil (drawn a little large, as in the textbook picture). Taken
// apart, the whorls stack up: stalk, sepals, petals, stamens, pistil.
const OVARY = { y: 0.017, rx: 0.0115, ry: 0.0135 };
const STYLE_TOP = 0.066;
const ovules = [];
for (let level = 0; level < 2; level++) {
  for (let k = 0; k < 6; k++) {
    const a = (k * Math.PI) / 3 + level * (Math.PI / 6);
    ovules.push([Math.cos(a) * 0.0046, OVARY.y - 0.0038 + level * 0.0076, Math.sin(a) * 0.0046]);
  }
}

export default {
  id: 'flower',
  version: 1,
  order: 10,
  source: 'procedural',
  subject: 'Biology',
  classes: [6, 7, 10, 12],
  title: t('Parts of a flower', 'फूल के भाग', 'ಹೂವಿನ ಭಾಗಗಳು'),
  summary: t(
    'A flower is the reproductive part of a plant. Stamens (male) make pollen; the pistil (female) holds ovules that become seeds after fertilisation.',
    'फूल पौधे का जनन अंग है। पुंकेसर (नर) परागकण बनाते हैं; स्त्रीकेसर (मादा) में बीजांड होते हैं जो निषेचन के बाद बीज बनते हैं।',
    'ಹೂವು ಸಸ್ಯದ ಸಂತಾನೋತ್ಪತ್ತಿ ಭಾಗ. ಕೇಸರಗಳು (ಗಂಡು) ಪರಾಗ ತಯಾರಿಸುತ್ತವೆ; ಶಲಾಕೆ (ಹೆಣ್ಣು) ಅಂಡಕಗಳನ್ನು ಹೊಂದಿದ್ದು ಅವು ನಿಷೇಚನದ ನಂತರ ಬೀಜಗಳಾಗುತ್ತವೆ.',
  ),
  keywords: ['flower', 'parts of a flower', 'pollination', 'fertilisation', 'fertilization', 'stamen', 'pistil', 'carpel', 'ovary', 'ovule', 'anther', 'stigma', 'reproduction in plants', 'sexual reproduction in flowering plants', 'getting to know plants'],
  credit: 'Model built by KINETIX',
  groups: [
    { id: 'outer', name: t('Outer parts', 'बाहरी भाग', 'ಹೊರ ಭಾಗಗಳು') },
    { id: 'male', name: t('Stamen (male)', 'पुंकेसर (नर)', 'ಕೇಸರ (ಗಂಡು)') },
    { id: 'female', name: t('Pistil (female)', 'स्त्रीकेसर (मादा)', 'ಶಲಾಕೆ (ಹೆಣ್ಣು)') },
  ],
  build(THREE) {
    const tube = (pts, r0, r1, radial = 10) => taperTube(THREE, curveThrough(THREE, pts), r0, r1, { segments: 24, radial });
    const petals = Array.from({ length: PETALS }, (_, k) => sheet(THREE, blade(petalAngle(k), PETAL), { nu: 28, nv: 14, thickness: 0.0009 }));
    const sepals = Array.from({ length: PETALS }, (_, k) => sheet(THREE, blade(sepalAngle(k), SEPAL), { nu: 16, nv: 8, thickness: 0.0011 }));
    const filaments = Array.from({ length: STAMENS }, (_, k) => tube(stamenCurve(k), 0.0008, 0.0006, 8));
    const anthers = Array.from({ length: STAMENS }, (_, k) => {
      const [x, y, z] = stamenTip(k);
      const g = blob(THREE, [0, 0, 0], 0.0022, 0.0038, 0.0016, 2);
      g.rotateY(-stamenAngle(k));
      return g.translate(x, y + 0.0025, z);
    });
    // The ovary is a hollow wall so that a cut shows the ovules inside.
    const wall = blob(THREE, [0, OVARY.y, 0], OVARY.rx, OVARY.ry, OVARY.rx, 5);
    const cavity = blob(THREE, [0, OVARY.y, 0], OVARY.rx * 0.72, OVARY.ry * 0.74, OVARY.rx * 0.72, 5).toNonIndexed();
    const p = cavity.attributes.position.array;
    for (let i = 0; i < p.length; i += 9) for (let k = 0; k < 3; k++) [p[i + 3 + k], p[i + 6 + k]] = [p[i + 6 + k], p[i + 3 + k]];
    const style = tube([[0, OVARY.y + OVARY.ry * 0.8, 0], [0, 0.04, 0.0005], [0, STYLE_TOP, 0]], 0.0016, 0.0011, 12);
    const stigma = [0, 1, 2].map((k) => {
      const a = (k * 2 * Math.PI) / 3;
      return blob(THREE, [Math.cos(a) * 0.0022, STYLE_TOP + 0.0012, Math.sin(a) * 0.0022], 0.0026, 0.0017, 0.0026, 2);
    });
    return {
      pedicel: tube([[0.003, -0.045, 0.001], [0.001, -0.025, 0], [0, -0.006, 0]], 0.0032, 0.0036, 14),
      receptacle: blob(THREE, [0, -0.002, 0], 0.0115, 0.0075, 0.0115, 3),
      sepals,
      petals,
      filament: filaments,
      anther: anthers,
      ovary: [wall, cavity],
      ovules: ovules.map((c) => blob(THREE, c, 0.0021, 0.0026, 0.0021, 2)),
      style,
      stigma,
    };
  },
  parts: [
    {
      id: 'petals', group: 'outer', explode: [0, -0.2, 0], color: '#e2384d', inside: '#f07a86',
      name: t('Petals', 'पंखुड़ियाँ', 'ದಳಗಳು'),
      info: t('Brightly coloured, often scented: they attract insects and birds that carry pollen.', 'चमकीले रंग की, प्रायः सुगंधित: ये कीटों और पक्षियों को आकर्षित करती हैं जो परागकण ले जाते हैं।', 'ಗಾಢ ಬಣ್ಣದ, ಹೆಚ್ಚಾಗಿ ಪರಿಮಳಯುಕ್ತ: ಪರಾಗ ಸಾಗಿಸುವ ಕೀಟ ಮತ್ತು ಪಕ್ಷಿಗಳನ್ನು ಆಕರ್ಷಿಸುತ್ತವೆ.'),
    },
    {
      id: 'sepals', group: 'outer', explode: [0, -0.9, 0], color: '#4f9a3c', inside: '#7cbf5f',
      name: t('Sepals', 'बाह्यदल', 'ಪುಷ್ಪಪತ್ರಗಳು'),
      info: t('Small green leaf-like parts that protect the flower while it is a bud.', 'छोटे हरे पत्ती जैसे भाग जो कली अवस्था में फूल की रक्षा करते हैं।', 'ಮೊಗ್ಗಿನ ಸ್ಥಿತಿಯಲ್ಲಿ ಹೂವನ್ನು ರಕ್ಷಿಸುವ ಸಣ್ಣ ಹಸಿರು ಎಲೆಯಂತಹ ಭಾಗಗಳು.'),
    },
    {
      id: 'receptacle', group: 'outer', explode: [0, -1.5, 0], color: '#6aa84f', minor: true,
      name: t('Receptacle', 'पुष्पासन', 'ಪುಷ್ಪಾಸನ'),
      info: t('The swollen tip of the stalk on which all the parts of the flower sit.', 'डंठल का फूला हुआ सिरा जिस पर फूल के सभी भाग लगे होते हैं।', 'ಹೂವಿನ ಎಲ್ಲಾ ಭಾಗಗಳು ಕುಳಿತಿರುವ ತೊಟ್ಟಿನ ಉಬ್ಬಿದ ತುದಿ.'),
    },
    {
      id: 'pedicel', group: 'outer', explode: [0, -1.9, 0], color: '#3f8a35', minor: true,
      name: t('Stalk (pedicel)', 'डंठल (वृंत)', 'ತೊಟ್ಟು (ಪುಷ್ಪವೃಂತ)'),
      info: t('Holds the flower up and joins it to the plant.', 'फूल को थामे रखता है और पौधे से जोड़ता है।', 'ಹೂವನ್ನು ಎತ್ತಿ ಹಿಡಿದು ಸಸ್ಯಕ್ಕೆ ಜೋಡಿಸುತ್ತದೆ.'),
    },
    {
      id: 'anther', group: 'male', explode: [0, 0.9, 0], color: '#f2c230', glow: 0.1,
      name: t('Anther', 'परागकोश', 'ಪರಾಗಕೋಶ'),
      info: t('The top of the stamen, where pollen grains are made.', 'पुंकेसर का शीर्ष, जहाँ परागकण बनते हैं।', 'ಕೇಸರದ ತುದಿ; ಇಲ್ಲಿ ಪರಾಗ ಕಣಗಳು ತಯಾರಾಗುತ್ತವೆ.'),
    },
    {
      id: 'filament', group: 'male', explode: [0, 0.9, 0], color: '#f3e3b8',
      name: t('Filament', 'पुतंतु', 'ಕೇಸರದಂಡ'),
      info: t('The thin stalk that holds the anther up. Anther and filament together make a stamen.', 'पतला डंठल जो परागकोश को थामे रखता है। परागकोश और पुतंतु मिलकर पुंकेसर बनाते हैं।', 'ಪರಾಗಕೋಶವನ್ನು ಎತ್ತಿ ಹಿಡಿಯುವ ತೆಳು ದಂಡ. ಪರಾಗಕೋಶ ಮತ್ತು ಕೇಸರದಂಡ ಸೇರಿ ಕೇಸರ.'),
    },
    {
      id: 'stigma', group: 'female', explode: [0, 2.1, 0], color: '#d98f2b', glow: 0.1,
      name: t('Stigma', 'वर्तिकाग्र', 'ಶಲಾಕಾಗ್ರ'),
      info: t('The sticky top of the pistil that catches pollen.', 'स्त्रीकेसर का चिपचिपा शीर्ष जो परागकणों को पकड़ता है।', 'ಪರಾಗವನ್ನು ಹಿಡಿಯುವ ಶಲಾಕೆಯ ಅಂಟಾದ ತುದಿ.'),
    },
    {
      id: 'style', group: 'female', explode: [0, 2.1, 0], color: '#efd3a0',
      name: t('Style', 'वर्तिका', 'ಶಲಾಕಾನಾಳ'),
      info: t('The tube joining stigma to ovary; the pollen tube grows down through it.', 'वर्तिकाग्र को अंडाशय से जोड़ने वाली नली; परागनली इसी से नीचे बढ़ती है।', 'ಶಲಾಕಾಗ್ರವನ್ನು ಅಂಡಾಶಯಕ್ಕೆ ಜೋಡಿಸುವ ನಾಳ; ಪರಾಗನಾಳ ಇದರ ಮೂಲಕ ಕೆಳಗೆ ಬೆಳೆಯುತ್ತದೆ.'),
    },
    {
      id: 'ovary', group: 'female', explode: [0, 2.1, 0], color: '#8cc063', inside: '#b5d98f',
      name: t('Ovary', 'अंडाशय', 'ಅಂಡಾಶಯ'),
      info: t('The swollen base of the pistil. After fertilisation it grows into the fruit.', 'स्त्रीकेसर का फूला हुआ आधार। निषेचन के बाद यह फल बन जाता है।', 'ಶಲಾಕೆಯ ಉಬ್ಬಿದ ತಳ. ನಿಷೇಚನದ ನಂತರ ಇದು ಹಣ್ಣಾಗಿ ಬೆಳೆಯುತ್ತದೆ.'),
    },
    {
      id: 'ovules', group: 'female', explode: [0, 2.1, 0], color: '#f7efd6', inside: '#fbf4df',
      name: t('Ovules', 'बीजांड', 'ಅಂಡಕಗಳು'),
      info: t('Inside the ovary; each holds an egg cell. After fertilisation an ovule becomes a seed.', 'अंडाशय के अंदर; हर एक में अंड कोशिका होती है। निषेचन के बाद बीजांड बीज बन जाता है।', 'ಅಂಡಾಶಯದ ಒಳಗೆ; ಪ್ರತಿಯೊಂದರಲ್ಲೂ ಅಂಡಕೋಶ ಇರುತ್ತದೆ. ನಿಷೇಚನದ ನಂತರ ಅಂಡಕ ಬೀಜವಾಗುತ್ತದೆ.'),
    },
  ],
  views: [
    { id: 'front', name: t('Front', 'सामने से', 'ಮುಂಭಾಗ'), dir: [0.25, 0.55, 1] },
    { id: 'inside', name: t('The cut face', 'कटा हुआ भाग', 'ಕತ್ತರಿಸಿದ ಮುಖ'), dir: [0.08, 0.18, 1] },
    { id: 'top', name: t('From above', 'ऊपर से', 'ಮೇಲಿನಿಂದ'), dir: [0, 1, 0.25] },
  ],
  slices: [
    {
      id: 'ls', name: t('Cut lengthwise (L.S.)', 'लंबवत काट (L.S.)', 'ಉದ್ದಕ್ಕೆ ಕತ್ತರಿಸಿ (L.S.)'), normal: [0, 0, -1], offset: 0, view: 'inside',
      // Labels on what is left behind the cut.
      anchors: {
        petals: petalAt(2, 0.62),
        sepals: blade(sepalAngle(2), SEPAL)(0.6, 0.5),
        anther: (() => {
          const [x, y, z] = stamenTip(4);
          return [x, y + 0.0025, z];
        })(),
        filament: stamenCurve(4)[2],
        stigma: [0, STYLE_TOP + 0.0012, 0],
        style: [0, 0.042, 0],
        ovary: [-OVARY.rx * 0.86, OVARY.y, 0],
        ovules: ovules[0],
        receptacle: [0.004, -0.003, 0],
        pedicel: [0, -0.03, 0],
      },
    },
  ],
  animations: [
    {
      id: 'pollination', kind: 'flow',
      name: t('Pollination and fertilisation', 'परागण और निषेचन', 'ಪರಾಗಸ್ಪರ್ಶ ಮತ್ತು ನಿಷೇಚನ'),
      steps: [
        {
          color: '#ffd23f', highlight: ['anther'],
          text: t('Pollen grains are made in the anthers.', 'परागकोश में परागकण बनते हैं।', 'ಪರಾಗಕೋಶಗಳಲ್ಲಿ ಪರಾಗ ಕಣಗಳು ತಯಾರಾಗುತ್ತವೆ.'),
          paths: [['filament@bottom', 'filament', 'anther']],
        },
        {
          color: '#ffd23f', highlight: ['anther', 'stigma'],
          text: t('Pollination: insects, birds or wind carry pollen from an anther to a stigma.', 'परागण: कीट, पक्षी या हवा परागकणों को परागकोश से वर्तिकाग्र तक ले जाते हैं।', 'ಪರಾಗಸ್ಪರ್ಶ: ಕೀಟಗಳು, ಪಕ್ಷಿಗಳು ಅಥವಾ ಗಾಳಿ ಪರಾಗವನ್ನು ಪರಾಗಕೋಶದಿಂದ ಶಲಾಕಾಗ್ರಕ್ಕೆ ಸಾಗಿಸುತ್ತವೆ.'),
          paths: [[stamenTip(1), [0.01, 0.085, 0.01], 'stigma@top'], [stamenTip(4), [-0.012, 0.082, -0.006], 'stigma@top']],
        },
        {
          color: '#ffb02e', highlight: ['stigma', 'style'],
          text: t('The pollen grain grows a pollen tube down through the style.', 'परागकण वर्तिका के भीतर से नीचे की ओर परागनली बनाता है।', 'ಪರಾಗ ಕಣ ಶಲಾಕಾನಾಳದ ಮೂಲಕ ಕೆಳಗೆ ಪರಾಗನಾಳವನ್ನು ಬೆಳೆಸುತ್ತದೆ.'),
          paths: [['stigma@top', 'style@top', 'style', 'style@bottom']],
        },
        {
          color: '#ff8a3d', highlight: ['ovary', 'ovules'],
          text: t('Fertilisation: the male cell joins the egg in an ovule. The ovule becomes a seed and the ovary becomes a fruit.', 'निषेचन: नर युग्मक बीजांड में अंड से मिलता है। बीजांड बीज बन जाता है और अंडाशय फल।', 'ನಿಷೇಚನ: ಗಂಡು ಕೋಶ ಅಂಡಕದಲ್ಲಿ ಅಂಡದೊಂದಿಗೆ ಸೇರುತ್ತದೆ. ಅಂಡಕ ಬೀಜವಾಗುತ್ತದೆ, ಅಂಡಾಶಯ ಹಣ್ಣಾಗುತ್ತದೆ.'),
          paths: [['style@bottom', [0, OVARY.y + 0.004, 0], ovules[0]]],
        },
      ],
    },
  ],
};
