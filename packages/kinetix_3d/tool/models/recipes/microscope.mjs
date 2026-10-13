// A compound light microscope (the Omax binocular model by 3Donimus, CC BY
// 3.0, from the Google Poly archive on Poly Pizza). The source's pieces are
// sorted into the parts a biology class names, by where they sit; the
// display stand and the power cord are left out.
const t = (en, hi, kn) => ({ en, hi, kn });

/** Which part a source piece belongs to, from its centre [x, y, z] and size (source units). */
function partOf([x, y, z], [sx, sy, sz]) {
  if (y < -1.45 || sy > 4) return null; // the display stand and the cord
  if (sy > 2) return 'arm';
  if (y > 2.6) return 'eyepiece';
  if (y > 1.9) return 'head';
  if (y > 0.75) return 'objectives';
  if (y > 0.3) return 'stage';
  if (y > -0.45) return Math.abs(x - 0.13) > 0.3 ? 'knobs' : 'condenser';
  if (y > -0.9) return 'lamp';
  return 'base';
}

export default {
  id: 'microscope',
  version: 1,
  order: 7.5,
  source: 'polypizza',
  subject: 'Biology',
  classes: [6, 8, 9, 11],
  title: t('Compound microscope', 'संयुक्त सूक्ष्मदर्शी', 'ಸಂಯುಕ್ತ ಸೂಕ್ಷ್ಮದರ್ಶಕ'),
  summary: t(
    'Two sets of lenses, the objective and the eyepiece, magnify a thin specimen lit from below up to about 1,000 times, enough to see cells.',
    'लेंसों के दो समूह, अभिदृश्यक और नेत्रिका, नीचे से प्रकाशित पतले नमूने को लगभग 1,000 गुना तक बड़ा दिखाते हैं, कोशिकाएँ देखने के लिए पर्याप्त।',
    'ಎರಡು ಮಸೂರ ಸಮೂಹಗಳು, ವಸ್ತುಮಸೂರ ಮತ್ತು ನೇತ್ರಮಸೂರ, ಕೆಳಗಿನಿಂದ ಬೆಳಗಿದ ತೆಳು ಮಾದರಿಯನ್ನು ಸುಮಾರು 1,000 ಪಟ್ಟು ದೊಡ್ಡದಾಗಿ ತೋರಿಸುತ್ತವೆ; ಜೀವಕೋಶಗಳನ್ನು ನೋಡಲು ಸಾಕು.',
  ),
  keywords: ['microscope', 'compound microscope', 'lens', 'magnification', 'cell', 'the fundamental unit of life', 'cell structure and functions', 'eyepiece', 'objective', 'stage', 'slide', 'microorganisms', 'lab equipment'],
  credit: 'Omax compound microscope by 3Donimus (Poly Pizza), CC BY 3.0',
  sources: {
    model: { file: 'lab/microscope_omax.glb', url: 'https://static.poly.pizza/97dca3fe-24d1-495a-996b-7b5e472afcad.glb' },
  },
  size: 0.36,
  async import(k) {
    const groups = {};
    for (const p of k.worldPrimitives(await k.readSource(k.source('model')))) {
      const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
      for (let i = 0; i < p.positions.length; i += 3) for (let a = 0; a < 3; a++) {
        lo[a] = Math.min(lo[a], p.positions[i + a]);
        hi[a] = Math.max(hi[a], p.positions[i + a]);
      }
      const id = partOf(lo.map((v, a) => (v + hi[a]) / 2), lo.map((v, a) => hi[a] - v));
      if (id) (groups[id] ||= []).push({ ...p, uvs: undefined, material: { ...p.material, texture: undefined } });
    }
    // The body is white plastic, the knobs and head black: keep the source's colours.
    return Object.fromEntries(Object.entries(groups).map(([id, list]) => {
      const m = k.join(list);
      return [id, { ...m, colors: m.colors || undefined, material: { ...m.material, roughness: 0.45, metalness: 0.05 } }];
    }));
  },
  groups: [
    { id: 'optics', name: t('Lenses and light', 'लेंस और प्रकाश', 'ಮಸೂರಗಳು ಮತ್ತು ಬೆಳಕು') },
    { id: 'body', name: t('Body and controls', 'ढाँचा और नियंत्रण', 'ಚೌಕಟ್ಟು ಮತ್ತು ನಿಯಂತ್ರಣಗಳು') },
  ],
  parts: [
    {
      id: 'eyepiece', group: 'optics', color: '#2b2f36', explode: [0, 1, 0.3],
      name: t('Eyepieces (ocular lenses)', 'नेत्रिकाएँ (नेत्र लेंस)', 'ನೇತ್ರಮಸೂರಗಳು'),
      info: t('You look through these. Each magnifies 10 times.', 'इनसे देखा जाता है। हर एक 10 गुना बड़ा दिखाती है।', 'ಇವುಗಳ ಮೂಲಕ ನೋಡುತ್ತೇವೆ. ಪ್ರತಿಯೊಂದೂ 10 ಪಟ್ಟು ದೊಡ್ಡದಾಗಿಸುತ್ತದೆ.'),
    },
    {
      id: 'head', group: 'body', color: '#30343b', explode: [0, 0.8, 0],
      name: t('Head (body tube)', 'शीर्ष (देह नली)', 'ತಲೆ (ದೇಹ ನಳಿಕೆ)'),
      info: t('Holds the eyepieces at the right distance from the objectives; prisms inside split the light to both eyes.', 'नेत्रिकाओं को अभिदृश्यकों से सही दूरी पर रखता है; भीतर लगे प्रिज़्म प्रकाश को दोनों आँखों तक बाँटते हैं।', 'ನೇತ್ರಮಸೂರಗಳನ್ನು ವಸ್ತುಮಸೂರಗಳಿಂದ ಸರಿಯಾದ ದೂರದಲ್ಲಿ ಹಿಡಿಯುತ್ತದೆ; ಒಳಗಿನ ಪಟ್ಟಕಗಳು ಬೆಳಕನ್ನು ಎರಡೂ ಕಣ್ಣುಗಳಿಗೆ ಹಂಚುತ್ತವೆ.'),
    },
    {
      id: 'objectives', group: 'optics', color: '#c9d2cf', explode: [0, 0.3, 1],
      name: t('Revolving nosepiece and objective lenses', 'घूमने वाला नोज़पीस और अभिदृश्यक लेंस', 'ತಿರುಗುವ ನೋಸ್‌ಪೀಸ್ ಮತ್ತು ವಸ್ತುಮಸೂರಗಳು'),
      info: t('Turn it to choose 4×, 10×, 40× or 100×. Total magnification = eyepiece × objective, for example 10 × 40 = 400 times.', 'इसे घुमाकर 4×, 10×, 40× या 100× चुनें। कुल आवर्धन = नेत्रिका × अभिदृश्यक, जैसे 10 × 40 = 400 गुना।', '4×, 10×, 40× ಅಥವಾ 100× ಆಯ್ಕೆಗೆ ಇದನ್ನು ತಿರುಗಿಸಿ. ಒಟ್ಟು ವರ್ಧನೆ = ನೇತ್ರಮಸೂರ × ವಸ್ತುಮಸೂರ, ಉದಾ. 10 × 40 = 400 ಪಟ್ಟು.'),
    },
    {
      id: 'stage', group: 'body', color: '#2d3138', explode: [0, 0.2, 1],
      name: t('Stage with slide clips', 'स्लाइड क्लिप वाला मंच', 'ಸ್ಲೈಡ್ ಕ್ಲಿಪ್‌ಗಳಿರುವ ವೇದಿಕೆ'),
      info: t('The glass slide with the specimen is clipped here, over the hole that lets light through.', 'नमूने वाली काँच की स्लाइड यहाँ, प्रकाश जाने वाले छेद के ऊपर, क्लिप से लगाई जाती है।', 'ಮಾದರಿಯಿರುವ ಗಾಜಿನ ಸ್ಲೈಡನ್ನು ಬೆಳಕು ಹಾದುಹೋಗುವ ರಂಧ್ರದ ಮೇಲೆ ಇಲ್ಲಿ ಕ್ಲಿಪ್ ಮಾಡಲಾಗುತ್ತದೆ.'),
    },
    {
      id: 'condenser', group: 'optics', color: '#33373e', minor: true, explode: [0, -0.2, 1],
      name: t('Condenser and diaphragm', 'संघनित्र और डायफ्राम', 'ಸಾಂದ್ರಕ ಮತ್ತು ವಪೆ'),
      info: t('Gathers the light onto the specimen; the diaphragm controls how much light passes.', 'प्रकाश को नमूने पर केंद्रित करता है; डायफ्राम तय करता है कि कितना प्रकाश जाए।', 'ಬೆಳಕನ್ನು ಮಾದರಿಯ ಮೇಲೆ ಕೇಂದ್ರೀಕರಿಸುತ್ತದೆ; ಎಷ್ಟು ಬೆಳಕು ಹೋಗಬೇಕೆಂದು ವಪೆ ನಿಯಂತ್ರಿಸುತ್ತದೆ.'),
    },
    {
      id: 'knobs', group: 'body', color: '#5a5f66', explode: [1, 0, 0],
      name: t('Coarse and fine focus knobs', 'स्थूल और सूक्ष्म समायोजन घुंडियाँ', 'ಸ್ಥೂಲ ಮತ್ತು ಸೂಕ್ಷ್ಮ ಹೊಂದಾಣಿಕೆ ಗುಬ್ಬಿಗಳು'),
      info: t('Move the stage up and down to bring the specimen into focus: the big knob roughly, the small one finely.', 'नमूने को स्पष्ट दिखाने के लिए मंच को ऊपर-नीचे करती हैं: बड़ी घुंडी मोटे तौर पर, छोटी बारीकी से।', 'ಮಾದರಿ ಸ್ಪಷ್ಟವಾಗಿ ಕಾಣುವಂತೆ ವೇದಿಕೆಯನ್ನು ಮೇಲೆ-ಕೆಳಗೆ ಸರಿಸುತ್ತವೆ: ದೊಡ್ಡ ಗುಬ್ಬಿ ಸ್ಥೂಲವಾಗಿ, ಚಿಕ್ಕದು ಸೂಕ್ಷ್ಮವಾಗಿ.'),
    },
    {
      id: 'arm', group: 'body', color: '#f2f2ef', explode: [0, 0, -1],
      name: t('Arm', 'भुजा', 'ತೋಳು'),
      info: t('Joins the head to the base. Carry the microscope by the arm, with a hand under the base.', 'शीर्ष को आधार से जोड़ती है। सूक्ष्मदर्शी को भुजा से पकड़ें और आधार के नीचे हाथ रखें।', 'ತಲೆಯನ್ನು ತಳಕ್ಕೆ ಜೋಡಿಸುತ್ತದೆ. ಸೂಕ್ಷ್ಮದರ್ಶಕವನ್ನು ತೋಳಿನಿಂದ ಹಿಡಿದು, ತಳದ ಕೆಳಗೆ ಕೈ ಇಟ್ಟು ಒಯ್ಯಿರಿ.'),
    },
    {
      id: 'lamp', group: 'optics', color: '#e8eef0', explode: [0, -0.5, 1], glow: 0.15,
      name: t('Light source', 'प्रकाश स्रोत', 'ಬೆಳಕಿನ ಮೂಲ'),
      info: t('A lamp in the base shines up through the specimen. Older microscopes use a mirror to reflect daylight.', 'आधार में लगा लैंप नमूने के आर-पार ऊपर की ओर चमकता है। पुराने सूक्ष्मदर्शी दिन का प्रकाश परावर्तित करने के लिए दर्पण लगाते हैं।', 'ತಳದಲ್ಲಿರುವ ದೀಪ ಮಾದರಿಯ ಮೂಲಕ ಮೇಲಕ್ಕೆ ಬೆಳಗುತ್ತದೆ. ಹಳೆಯ ಸೂಕ್ಷ್ಮದರ್ಶಕಗಳು ಹಗಲಿನ ಬೆಳಕನ್ನು ಪ್ರತಿಫಲಿಸಲು ಕನ್ನಡಿ ಬಳಸುತ್ತವೆ.'),
    },
    {
      id: 'base', group: 'body', color: '#f2f2ef', explode: [0, -1, 0],
      name: t('Base', 'आधार', 'ತಳ'),
      info: t('A heavy foot that keeps the microscope steady.', 'भारी तल जो सूक्ष्मदर्शी को स्थिर रखता है।', 'ಸೂಕ್ಷ್ಮದರ್ಶಕವನ್ನು ಸ್ಥಿರವಾಗಿಡುವ ಭಾರವಾದ ಪಾದ.'),
    },
  ],
  views: [
    { id: 'front', name: t('Front', 'सामने से', 'ಮುಂಭಾಗ'), dir: [0.75, 0.3, 1] },
    { id: 'side', name: t('Side', 'बगल से', 'ಪಕ್ಕದಿಂದ'), dir: [1, 0.2, -0.1] },
  ],
  slices: [],
  animations: [],
};
