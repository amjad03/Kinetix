// An animal cell, built in code, with its organelles in place. The
// membrane is see-through; cut the cell open to look inside.
import { seeded, blob } from '../lib/shapes.mjs';
import { placeIn, mitochondria, golgi, reticulum, centrosome } from '../lib/cell.mjs';

const t = (en, hi, kn) => ({ en, hi, kn });

/** A slightly irregular, soft sphere (a cell is not a perfect ball). */
export function wobbly(THREE, r, amount = 0.06, seed = 1, detail = 20) {
  const g = new THREE.IcosahedronGeometry(1, detail);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = 1 + amount * (Math.sin(3.1 * x + seed) * Math.cos(2.7 * y + seed * 2) + 0.5 * Math.sin(4.3 * z + seed * 3));
    p.setXYZ(i, x * r[0] * k, y * r[1] * k, z * r[2] * k);
  }
  return g;
}

export default {
  id: 'animal_cell',
  version: 1,
  order: 8,
  source: 'procedural',
  subject: 'Biology',
  classes: [8, 9, 11],
  title: t('Animal cell', 'जंतु कोशिका', 'ಪ್ರಾಣಿ ಕೋಶ'),
  summary: t(
    'The unit of life. A thin membrane holds the cytoplasm, in which the nucleus and many small organs (organelles) each do a job.',
    'जीवन की इकाई। एक पतली झिल्ली कोशिकाद्रव्य को घेरे रहती है, जिसमें केंद्रक और कई छोटे अंग (कोशिकांग) अपना-अपना काम करते हैं।',
    'ಜೀವದ ಘಟಕ. ತೆಳುವಾದ ಪೊರೆ ಕೋಶದ್ರವ್ಯವನ್ನು ಹಿಡಿದಿದೆ; ಅದರಲ್ಲಿ ಕೋಶಕೇಂದ್ರ ಮತ್ತು ಅನೇಕ ಸಣ್ಣ ಅಂಗಕಗಳು ತಮ್ಮ ತಮ್ಮ ಕೆಲಸ ಮಾಡುತ್ತವೆ.',
  ),
  keywords: ['animal cell', 'cell', 'cell structure', 'organelles', 'the fundamental unit of life', 'cell the unit of life', 'mitochondria', 'nucleus', 'golgi'],
  credit: 'Model built by KINETIX',
  groups: [
    { id: 'outside', name: t('Boundary', 'सीमा', 'ಗಡಿ') },
    { id: 'control', name: t('Control centre', 'नियंत्रण केंद्र', 'ನಿಯಂತ್ರಣ ಕೇಂದ್ರ') },
    { id: 'organelles', name: t('Organelles', 'कोशिकांग', 'ಅಂಗಕಗಳು') },
  ],
  build(THREE) {
    const rnd = seeded(11);
    const R = [0.1, 0.075, 0.08];
    const nuc = [-0.012, 0.004, 0];
    const avoid = [[nuc, 0.045]];
    const mito = mitochondria(THREE, rnd, Array.from({ length: 9 }, () => placeIn(rnd, [0.075, 0.052, 0.058], avoid, 0.01)));
    const g = golgi(THREE, rnd, [0.045, -0.018, 0.012]);
    const rough = reticulum(THREE, rnd, nuc, 0.036, 0.05, 5, { rough: true });
    const smooth = reticulum(THREE, rnd, nuc, 0.056, 0.066, 3, { rough: false, thick: 0.0028 });
    const lyso = Array.from({ length: 7 }, () => blob(THREE, placeIn(rnd, [0.075, 0.052, 0.058], avoid, 0.006), 0.0055, 0.0055, 0.0055, 3));
    const free = Array.from({ length: 140 }, () => blob(THREE, placeIn(rnd, [0.085, 0.062, 0.068], avoid, 0.004), 0.0013, 0.0013, 0.0013, 1));
    const vac = Array.from({ length: 3 }, () => blob(THREE, placeIn(rnd, [0.07, 0.05, 0.055], avoid, 0.012), 0.009, 0.008, 0.008, 3));
    return {
      membrane: wobbly(THREE, R, 0.05, 2),
      nucleus: blob(THREE, nuc, 0.03, 0.028, 0.029, 10),
      nucleolus: blob(THREE, [nuc[0] + 0.006, nuc[1] + 0.004, nuc[2]], 0.01, 0.009, 0.009, 5),
      rough_er: [...rough.tubes],
      ribosomes: [...rough.ribosomes, ...free],
      smooth_er: smooth.tubes,
      golgi: [...g.sacs, ...g.vesicles],
      mitochondria: [...mito.outer, ...mito.cristae],
      lysosomes: lyso,
      centrosome: centrosome(THREE, [0.022, 0.03, 0.02]),
      vacuoles: vac,
    };
  },
  parts: [
    {
      id: 'membrane', group: 'outside', color: '#f2c2a6', opacity: 0.22,
      name: t('Cell membrane', 'कोशिका झिल्ली', 'ಕೋಶ ಪೊರೆ'),
      info: t('A thin, flexible boundary that lets some substances in and out and keeps others back.', 'एक पतली, लचीली सीमा जो कुछ पदार्थों को अंदर-बाहर जाने देती है और कुछ को रोकती है।', 'ಕೆಲವು ವಸ್ತುಗಳನ್ನು ಒಳಗೆ-ಹೊರಗೆ ಬಿಡುವ, ಇನ್ನು ಕೆಲವನ್ನು ತಡೆಯುವ ತೆಳು, ಬಾಗುವ ಗಡಿ.'),
    },
    {
      id: 'nucleus', group: 'control', color: '#8b68c2', opacity: 0.7,
      name: t('Nucleus', 'केंद्रक', 'ಕೋಶಕೇಂದ್ರ'),
      info: t('The control centre. It holds the chromosomes (DNA) and directs everything the cell does.', 'नियंत्रण केंद्र। इसमें गुणसूत्र (DNA) होते हैं और यह कोशिका के हर काम को निर्देशित करता है।', 'ನಿಯಂತ್ರಣ ಕೇಂದ್ರ. ಇದರಲ್ಲಿ ವರ್ಣತಂತುಗಳು (DNA) ಇವೆ; ಕೋಶದ ಪ್ರತಿ ಕೆಲಸವನ್ನೂ ನಿರ್ದೇಶಿಸುತ್ತದೆ.'),
    },
    {
      id: 'nucleolus', group: 'control', color: '#4b2e82',
      name: t('Nucleolus', 'केंद्रिका', 'ಕೋಶಕೇಂದ್ರಿಕೆ'),
      info: t('A dense spot inside the nucleus that makes ribosomes.', 'केंद्रक के अंदर एक सघन भाग जो राइबोसोम बनाता है।', 'ಕೋಶಕೇಂದ್ರದೊಳಗಿನ ದಟ್ಟ ಭಾಗ; ರೈಬೋಸೋಮ್‌ಗಳನ್ನು ತಯಾರಿಸುತ್ತದೆ.'),
    },
    {
      id: 'rough_er', group: 'organelles', color: '#6fa8dc',
      name: t('Rough endoplasmic reticulum', 'खुरदरी अंतर्द्रव्यी जालिका', 'ಒರಟು ಅಂತರ್ದ್ರವ್ಯ ಜಾಲಿಕೆ'),
      info: t('A network of tubes studded with ribosomes, where proteins are made.', 'राइबोसोम से जड़ी नलियों का जाल, जहाँ प्रोटीन बनते हैं।', 'ರೈಬೋಸೋಮ್‌ಗಳು ಅಂಟಿರುವ ನಳಿಕೆಗಳ ಜಾಲ; ಇಲ್ಲಿ ಪ್ರೋಟೀನ್‌ಗಳು ತಯಾರಾಗುತ್ತವೆ.'),
    },
    {
      id: 'smooth_er', group: 'organelles', color: '#93c47d',
      name: t('Smooth endoplasmic reticulum', 'चिकनी अंतर्द्रव्यी जालिका', 'ನಯವಾದ ಅಂತರ್ದ್ರವ್ಯ ಜಾಲಿಕೆ'),
      info: t('Tubes without ribosomes that make fats (lipids).', 'राइबोसोम-रहित नलियाँ जो वसा (लिपिड) बनाती हैं।', 'ರೈಬೋಸೋಮ್ ಇಲ್ಲದ ನಳಿಕೆಗಳು; ಕೊಬ್ಬು (ಲಿಪಿಡ್) ತಯಾರಿಸುತ್ತವೆ.'),
    },
    {
      id: 'ribosomes', minor: true, group: 'organelles', color: '#3d3d56',
      name: t('Ribosomes', 'राइबोसोम', 'ರೈಬೋಸೋಮ್‌ಗಳು'),
      info: t('Tiny grains where proteins are built.', 'सूक्ष्म कण जहाँ प्रोटीन बनते हैं।', 'ಪ್ರೋಟೀನ್‌ಗಳು ರೂಪುಗೊಳ್ಳುವ ಸೂಕ್ಷ್ಮ ಕಣಗಳು.'),
    },
    {
      id: 'golgi', group: 'organelles', color: '#e8a33b',
      name: t('Golgi apparatus', 'गॉल्जी उपकरण', 'ಗಾಲ್ಗಿ ಸಂಕೀರ್ಣ'),
      info: t('Packs proteins into small bags (vesicles) and sends them where they are needed.', 'प्रोटीन को छोटी थैलियों (पुटिकाओं) में पैक करके ज़रूरत की जगह भेजता है।', 'ಪ್ರೋಟೀನ್‌ಗಳನ್ನು ಸಣ್ಣ ಚೀಲಗಳಲ್ಲಿ (ಕೋಶಕಗಳು) ಪ್ಯಾಕ್ ಮಾಡಿ ಬೇಕಾದಲ್ಲಿಗೆ ಕಳುಹಿಸುತ್ತದೆ.'),
    },
    {
      id: 'mitochondria', group: 'organelles', color: '#e0703a',
      name: t('Mitochondria', 'माइटोकॉन्ड्रिया', 'ಮೈಟೋಕಾಂಡ್ರಿಯಾ'),
      info: t('The powerhouses: they release energy from food (respiration). Cut one to see its folds (cristae).', 'ऊर्जा घर: ये भोजन से ऊर्जा मुक्त करते हैं (श्वसन)। एक को काटकर इसकी सिलवटें (क्रिस्टी) देखें।', 'ಶಕ್ತಿ ಕೇಂದ್ರಗಳು: ಆಹಾರದಿಂದ ಶಕ್ತಿ ಬಿಡುಗಡೆ ಮಾಡುತ್ತವೆ (ಉಸಿರಾಟ). ಕತ್ತರಿಸಿ ಇದರ ಮಡಿಕೆಗಳನ್ನು (ಕ್ರಿಸ್ಟೀ) ನೋಡಿ.'),
    },
    {
      id: 'lysosomes', group: 'organelles', color: '#58b368',
      name: t('Lysosomes', 'लाइसोसोम', 'ಲೈಸೋಸೋಮ್‌ಗಳು'),
      info: t('Bags of digestive enzymes that break down waste and worn-out parts: the cell\'s clean-up crew.', 'पाचक एंजाइमों की थैलियाँ जो अपशिष्ट और पुराने भागों को तोड़ती हैं: कोशिका की सफ़ाई टीम।', 'ತ್ಯಾಜ್ಯ ಮತ್ತು ಹಳೆಯ ಭಾಗಗಳನ್ನು ಒಡೆಯುವ ಜೀರ್ಣ ಕಿಣ್ವಗಳ ಚೀಲಗಳು: ಕೋಶದ ಸ್ವಚ್ಛತಾ ತಂಡ.'),
    },
    {
      id: 'centrosome', group: 'organelles', color: '#d9b441',
      name: t('Centrosome', 'तारककाय (सेंट्रोसोम)', 'ಸೆಂಟ್ರೋಸೋಮ್'),
      info: t('Two centrioles that organise the cell when it divides. Plant cells do not have them.', 'दो तारककेंद्र जो विभाजन के समय कोशिका को व्यवस्थित करते हैं। पादप कोशिका में ये नहीं होते।', 'ಕೋಶ ವಿಭಜನೆಯ ವೇಳೆ ಕೋಶವನ್ನು ಸಂಘಟಿಸುವ ಎರಡು ಸೆಂಟ್ರಿಯೋಲ್‌ಗಳು. ಸಸ್ಯಕೋಶದಲ್ಲಿ ಇವು ಇರುವುದಿಲ್ಲ.'),
    },
    {
      id: 'vacuoles', minor: true, group: 'organelles', color: '#8fd3f0', opacity: 0.6,
      name: t('Small vacuoles', 'छोटी रिक्तिकाएँ', 'ಸಣ್ಣ ರಸದಾನಿಗಳು'),
      info: t('Animal cells have only small, temporary vacuoles.', 'जंतु कोशिकाओं में केवल छोटी, अस्थायी रिक्तिकाएँ होती हैं।', 'ಪ್ರಾಣಿ ಕೋಶಗಳಲ್ಲಿ ಸಣ್ಣ, ತಾತ್ಕಾಲಿಕ ರಸದಾನಿಗಳು ಮಾತ್ರ ಇರುತ್ತವೆ.'),
    },
  ],
  views: [
    { id: 'front', name: t('Front', 'सामने से', 'ಮುಂಭಾಗ'), dir: [0.2, 0.25, 1] },
    { id: 'top', name: t('From above', 'ऊपर से', 'ಮೇಲಿನಿಂದ'), dir: [0, 1, 0.2] },
    { id: 'wedge', name: t('Into the wedge', 'कटे भाग में', 'ಕತ್ತರಿಸಿದ ಭಾಗದೊಳಗೆ'), dir: [1, 0.6, 1] },
  ],
  slices: [
    { id: 'half', name: t('Cut in half', 'बीच से आधा काटा', 'ಅರ್ಧಕ್ಕೆ ಕತ್ತರಿಸಿದ್ದು'), normal: [0, 0, -1], offset: 0.0, view: 'front' },
    // Cut like a cake: a quarter taken out, so the inside shows on two faces.
    { id: 'wedge', name: t('Slice taken out', 'एक फाँक निकाली', 'ಒಂದು ತುಂಡು ತೆಗೆದಿದೆ'), normal: [-1, 0, 0], offset: 0, normal2: [0, 0, -1], view: 'wedge' },
  ],
  animations: [],
};
