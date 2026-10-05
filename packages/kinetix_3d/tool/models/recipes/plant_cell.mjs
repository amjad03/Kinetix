// A plant cell, built in code: cell wall, membrane, a large central
// vacuole, chloroplasts and the organelles plant and animal cells share.
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { seeded, blob } from '../lib/shapes.mjs';
import { placeIn, mitochondria, golgi, reticulum, chloroplasts } from '../lib/cell.mjs';

const t = (en, hi, kn) => ({ en, hi, kn });

export default {
  id: 'plant_cell',
  version: 1,
  order: 9,
  source: 'procedural',
  subject: 'Biology',
  classes: [8, 9, 11],
  title: t('Plant cell', 'पादप कोशिका', 'ಸಸ್ಯ ಕೋಶ'),
  summary: t(
    'Like an animal cell, but with a stiff cell wall outside the membrane, a large vacuole full of sap, and chloroplasts that make food from sunlight.',
    'जंतु कोशिका जैसी, पर झिल्ली के बाहर एक कठोर कोशिका भित्ति, रस से भरी एक बड़ी रिक्तिका, और सूर्य के प्रकाश से भोजन बनाने वाले हरितलवक।',
    'ಪ್ರಾಣಿ ಕೋಶದಂತೆಯೇ, ಆದರೆ ಪೊರೆಯ ಹೊರಗೆ ಗಟ್ಟಿಯಾದ ಕೋಶಭಿತ್ತಿ, ರಸ ತುಂಬಿದ ದೊಡ್ಡ ರಸದಾನಿ ಮತ್ತು ಸೂರ್ಯನ ಬೆಳಕಿನಿಂದ ಆಹಾರ ತಯಾರಿಸುವ ಹರಿತ್ತಿನ ಕಣಗಳು.',
  ),
  keywords: ['plant cell', 'cell', 'cell wall', 'chloroplast', 'vacuole', 'the fundamental unit of life', 'cell structure', 'organelles'],
  credit: 'Model built by KINETIX',
  groups: [
    { id: 'outside', name: t('Boundary', 'सीमा', 'ಗಡಿ') },
    { id: 'control', name: t('Control centre', 'नियंत्रण केंद्र', 'ನಿಯಂತ್ರಣ ಕೇಂದ್ರ') },
    { id: 'organelles', name: t('Organelles', 'कोशिकांग', 'ಅಂಗಕಗಳು') },
  ],
  build(THREE) {
    const rnd = seeded(21);
    const W = 0.24, H = 0.15, D = 0.12;
    const wall = new RoundedBoxGeometry(W, H, D, 6, 0.018);
    const membrane = new RoundedBoxGeometry(W - 0.012, H - 0.012, D - 0.012, 6, 0.015);
    const vac = new RoundedBoxGeometry(W * 0.58, H * 0.6, D * 0.6, 6, 0.03);
    vac.translate(0.02, 0, 0);
    const nuc = [-0.082, 0.02, 0.01];
    const inner = [W / 2 - 0.02, H / 2 - 0.02, D / 2 - 0.02];
    // Organelles sit in the thin layer of cytoplasm around the vacuole.
    const aroundVacuole = () => {
      for (let k = 0; k < 400; k++) {
        const p = [0, 1, 2].map((i) => (rnd() * 2 - 1) * inner[i]);
        const inVac = Math.abs(p[0] - 0.02) < W * 0.3 && Math.abs(p[1]) < H * 0.31 && Math.abs(p[2]) < D * 0.31;
        const nearNuc = Math.hypot(p[0] - nuc[0], p[1] - nuc[1], p[2] - nuc[2]) < 0.03;
        if (!inVac && !nearNuc) return p;
      }
      return [0, 0, 0];
    };
    const chl = chloroplasts(THREE, rnd, Array.from({ length: 16 }, aroundVacuole), 0.012);
    const mito = mitochondria(THREE, rnd, Array.from({ length: 5 }, aroundVacuole), 0.007);
    const g = golgi(THREE, rnd, [-0.07, -0.042, -0.02], 0.016);
    const er = reticulum(THREE, rnd, nuc, 0.027, 0.034, 3, { rough: true, thick: 0.0025 });
    const free = Array.from({ length: 90 }, () => blob(THREE, aroundVacuole(), 0.0012, 0.0012, 0.0012, 1));
    void placeIn;
    return {
      cell_wall: wall,
      membrane,
      vacuole: vac,
      nucleus: blob(THREE, nuc, 0.022, 0.02, 0.02, 8),
      nucleolus: blob(THREE, [nuc[0] + 0.004, nuc[1] + 0.003, nuc[2]], 0.007, 0.007, 0.007, 4),
      chloroplasts: [...chl.outer, ...chl.grana],
      mitochondria: [...mito.outer, ...mito.cristae],
      golgi: [...g.sacs, ...g.vesicles],
      er: er.tubes,
      ribosomes: [...er.ribosomes, ...free],
    };
  },
  parts: [
    {
      id: 'cell_wall', group: 'outside', color: '#9bbf5a', opacity: 0.28,
      name: t('Cell wall', 'कोशिका भित्ति', 'ಕೋಶಭಿತ್ತಿ'),
      info: t('A stiff wall of cellulose outside the membrane. It gives the plant cell its fixed shape and support.', 'झिल्ली के बाहर सेल्यूलोज़ की कठोर भित्ति। यह पादप कोशिका को निश्चित आकार और सहारा देती है।', 'ಪೊರೆಯ ಹೊರಗಿನ ಸೆಲ್ಯುಲೋಸ್‌ನ ಗಟ್ಟಿ ಗೋಡೆ. ಸಸ್ಯ ಕೋಶಕ್ಕೆ ನಿಶ್ಚಿತ ಆಕಾರ ಮತ್ತು ಆಧಾರ ನೀಡುತ್ತದೆ.'),
    },
    {
      id: 'membrane', group: 'outside', color: '#e6d18a', opacity: 0.18,
      name: t('Cell membrane', 'कोशिका झिल्ली', 'ಕೋಶ ಪೊರೆ'),
      info: t('Just inside the wall; it controls what enters and leaves the cell.', 'भित्ति के ठीक अंदर; यह नियंत्रित करती है कि कोशिका में क्या आए और क्या जाए।', 'ಭಿತ್ತಿಯ ಒಳಗೆ; ಕೋಶದೊಳಗೆ ಏನು ಬರಬೇಕು, ಏನು ಹೋಗಬೇಕು ಎಂಬುದನ್ನು ನಿಯಂತ್ರಿಸುತ್ತದೆ.'),
    },
    {
      id: 'vacuole', group: 'organelles', color: '#8fcbea', opacity: 0.45,
      name: t('Central vacuole', 'केंद्रीय रिक्तिका', 'ಕೇಂದ್ರ ರಸದಾನಿ'),
      info: t('A large sac of cell sap that stores water and keeps the cell firm.', 'कोशिका रस की बड़ी थैली जो पानी संग्रहीत करती है और कोशिका को कड़ा बनाए रखती है।', 'ನೀರನ್ನು ಸಂಗ್ರಹಿಸಿ ಕೋಶವನ್ನು ಗಟ್ಟಿಯಾಗಿಡುವ ಕೋಶರಸದ ದೊಡ್ಡ ಚೀಲ.'),
    },
    {
      id: 'nucleus', group: 'control', color: '#8b68c2', opacity: 0.75,
      name: t('Nucleus', 'केंद्रक', 'ಕೋಶಕೇಂದ್ರ'),
      info: t('The control centre, pushed to the side by the big vacuole.', 'नियंत्रण केंद्र, जिसे बड़ी रिक्तिका एक ओर धकेल देती है।', 'ನಿಯಂತ್ರಣ ಕೇಂದ್ರ; ದೊಡ್ಡ ರಸದಾನಿ ಅದನ್ನು ಒಂದು ಬದಿಗೆ ತಳ್ಳುತ್ತದೆ.'),
    },
    {
      id: 'nucleolus', minor: true, group: 'control', color: '#4b2e82',
      name: t('Nucleolus', 'केंद्रिका', 'ಕೋಶಕೇಂದ್ರಿಕೆ'),
      info: t('Makes ribosomes.', 'राइबोसोम बनाती है।', 'ರೈಬೋಸೋಮ್‌ಗಳನ್ನು ತಯಾರಿಸುತ್ತದೆ.'),
    },
    {
      id: 'chloroplasts', group: 'organelles', color: '#3d9a3d',
      name: t('Chloroplasts', 'हरितलवक (क्लोरोप्लास्ट)', 'ಹರಿತ್ತಿನ ಕಣಗಳು (ಕ್ಲೋರೋಪ್ಲಾಸ್ಟ್)'),
      info: t('Contain green chlorophyll and make food by photosynthesis. Cut one to see its stacks (grana).', 'इनमें हरा पर्णहरित होता है और ये प्रकाश संश्लेषण से भोजन बनाते हैं। काटकर इनके ढेर (ग्रैना) देखें।', 'ಹಸಿರು ಪತ್ರಹರಿತ್ತು ಹೊಂದಿದ್ದು ದ್ಯುತಿಸಂಶ್ಲೇಷಣೆಯಿಂದ ಆಹಾರ ತಯಾರಿಸುತ್ತವೆ. ಕತ್ತರಿಸಿ ಇವುಗಳ ರಾಶಿಗಳನ್ನು (ಗ್ರಾನಾ) ನೋಡಿ.'),
    },
    {
      id: 'mitochondria', group: 'organelles', color: '#e0703a',
      name: t('Mitochondria', 'माइटोकॉन्ड्रिया', 'ಮೈಟೋಕಾಂಡ್ರಿಯಾ'),
      info: t('Release energy from food, in plant cells too.', 'पादप कोशिकाओं में भी भोजन से ऊर्जा मुक्त करते हैं।', 'ಸಸ್ಯ ಕೋಶಗಳಲ್ಲೂ ಆಹಾರದಿಂದ ಶಕ್ತಿ ಬಿಡುಗಡೆ ಮಾಡುತ್ತವೆ.'),
    },
    {
      id: 'golgi', group: 'organelles', color: '#e8a33b',
      name: t('Golgi apparatus', 'गॉल्जी उपकरण', 'ಗಾಲ್ಗಿ ಸಂಕೀರ್ಣ'),
      info: t('Packs and sends out materials, including those used to build the cell wall.', 'पदार्थों को पैक करके भेजता है, जिनमें कोशिका भित्ति बनाने वाले पदार्थ भी शामिल हैं।', 'ಕೋಶಭಿತ್ತಿ ನಿರ್ಮಿಸುವ ವಸ್ತುಗಳೂ ಸೇರಿದಂತೆ ವಸ್ತುಗಳನ್ನು ಪ್ಯಾಕ್ ಮಾಡಿ ಕಳುಹಿಸುತ್ತದೆ.'),
    },
    {
      id: 'er', group: 'organelles', color: '#6fa8dc',
      name: t('Endoplasmic reticulum', 'अंतर्द्रव्यी जालिका', 'ಅಂತರ್ದ್ರವ್ಯ ಜಾಲಿಕೆ'),
      info: t('Tubes where proteins and fats are made and moved.', 'नलियाँ जहाँ प्रोटीन और वसा बनते हैं और ले जाए जाते हैं।', 'ಪ್ರೋಟೀನ್ ಮತ್ತು ಕೊಬ್ಬು ತಯಾರಾಗಿ ಸಾಗಿಸಲ್ಪಡುವ ನಳಿಕೆಗಳು.'),
    },
    {
      id: 'ribosomes', minor: true, group: 'organelles', color: '#3d3d56',
      name: t('Ribosomes', 'राइबोसोम', 'ರೈಬೋಸೋಮ್‌ಗಳು'),
      info: t('Tiny grains where proteins are built.', 'सूक्ष्म कण जहाँ प्रोटीन बनते हैं।', 'ಪ್ರೋಟೀನ್‌ಗಳು ರೂಪುಗೊಳ್ಳುವ ಸೂಕ್ಷ್ಮ ಕಣಗಳು.'),
    },
  ],
  views: [
    { id: 'front', name: t('Front', 'सामने से', 'ಮುಂಭಾಗ'), dir: [0.3, 0.35, 1] },
    { id: 'top', name: t('From above', 'ऊपर से', 'ಮೇಲಿನಿಂದ'), dir: [0, 1, 0.3] },
  ],
  slices: [
    { id: 'half', name: t('Cut in half', 'बीच से आधा काटा', 'ಅರ್ಧಕ್ಕೆ ಕತ್ತರಿಸಿದ್ದು'), normal: [0, 0, -1], offset: 0.0, view: 'front' },
  ],
  animations: [],
};
