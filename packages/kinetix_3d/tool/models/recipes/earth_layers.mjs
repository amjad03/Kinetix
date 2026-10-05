// The layers of the Earth, built in code. Each layer is a hollow shell (a
// closed solid), so a cut shows every layer as a flat ring of its own colour.
// Depths are to scale except the crust, which would be thinner than a line.
// The continents come from Natural Earth (public domain) via
// data/land_mask.txt (see make_land_mask.mjs).
import { globe } from '../lib/earth.mjs';

const t = (en, hi, kn) => ({ en, hi, kn });

// Radii in model metres: the Earth is 0.1 (6,371 km).
const R = { crust: 0.1, upper: 0.093, lower: 0.084, outer: 0.0546, inner: 0.0192 };
// India faces the class (a little left of centre) in the first view.
const INDIA_AT = -20; // degrees round from +z towards +x

// Each shell's inner wall sits a hair outside the next shell, so that the two
// never draw in the same place (which would flicker on the cut face).
const GAP = 0.0004;

/** A hollow ball between radii [inner] and [outer]: outside faces out, inside faces in. */
function shell(THREE, outer, inner, seg = 96) {
  const a = new THREE.SphereGeometry(outer, seg, seg / 2).toNonIndexed();
  if (!inner) return a;
  const b = new THREE.SphereGeometry(inner + GAP, seg, seg / 2).toNonIndexed();
  flip(b);
  return [a, b];
}

function flip(g) {
  const p = g.attributes.position.array;
  for (let i = 0; i < p.length; i += 9) {
    for (let k = 0; k < 3; k++) [p[i + 3 + k], p[i + 6 + k]] = [p[i + 6 + k], p[i + 3 + k]];
  }
}

/**
 * A point on a cut face at radius [r], [deg] degrees up from the equator:
 * 'x' is the face on the plane x = 0 (towards +z), 'z' the face on z = 0
 * (towards +x, or up and round for angles past 90).
 */
function ring(face, r, deg) {
  const a = (deg * Math.PI) / 180;
  return face === 'x' ? [0, r * Math.sin(a), r * Math.cos(a)] : [r * Math.cos(a), r * Math.sin(a), 0];
}

/** The point of the surface in direction [x, y, z]. */
function surface(x, y, z) {
  const l = Math.hypot(x, y, z);
  return [(x / l) * R.crust, (y / l) * R.crust, (z / l) * R.crust];
}

// When the layers are taken apart they line up, biggest to smallest.
const lineUp = (() => {
  const order = [R.crust, R.upper, R.lower, R.outer, R.inner];
  const xs = [0];
  for (let i = 1; i < order.length; i++) xs.push(xs[i - 1] + order[i - 1] + order[i] + 0.012);
  const mid = (xs[0] - order[0] + xs.at(-1) + order.at(-1)) / 2;
  // The viewer moves a part by explode × 0.4 × the model's size (0.2).
  return xs.map((x) => [+((x - mid) / 0.08).toFixed(3), 0, 0]);
})();

export default {
  id: 'earth_layers',
  version: 2,
  order: 2,
  source: 'procedural',
  subject: 'Geography',
  classes: [7, 9, 11],
  title: t('Layers of the Earth', 'पृथ्वी की परतें', 'ಭೂಮಿಯ ಪದರಗಳು'),
  summary: t(
    'Under the thin crust lie the mantle, the liquid outer core and the solid inner core. It gets hotter the deeper you go.',
    'पतली भूपर्पटी के नीचे प्रावार, तरल बाहरी क्रोड और ठोस आंतरिक क्रोड हैं। जितना गहरा जाएँ, उतना गर्म।',
    'ತೆಳುವಾದ ಭೂಹೊರಪದರದ ಕೆಳಗೆ ಪ್ರಾವಾರ, ದ್ರವ ಹೊರ ತಿರುಳು ಮತ್ತು ಘನ ಒಳ ತಿರುಳು ಇವೆ. ಆಳಕ್ಕೆ ಹೋದಂತೆ ಹೆಚ್ಚು ಬಿಸಿ.',
  ),
  keywords: ['earth layers', 'interior of the earth', 'inside our earth', 'crust', 'mantle', 'core', 'inner core', 'outer core', 'sial', 'sima', 'continents', 'oceans', 'earthquakes', 'the earth'],
  credit: 'Model built by KINETIX; coastlines from Natural Earth (public domain)',
  groups: [
    { id: 'crust', name: t('Crust', 'भूपर्पटी', 'ಭೂಹೊರಪದರ') },
    { id: 'layers', name: t('Deeper layers', 'गहरी परतें', 'ಆಳದ ಪದರಗಳು') },
  ],
  build(THREE) {
    // The surface, split into land and sea by the map.
    const { land, sea } = globe(THREE, R.crust, { facing: 78 - INDIA_AT });
    const underside = new THREE.SphereGeometry(R.upper + GAP, 96, 48).toNonIndexed();
    flip(underside);
    return {
      crust: underside,
      continental_crust: land,
      oceanic_crust: sea,
      upper_mantle: shell(THREE, R.upper, R.lower),
      lower_mantle: shell(THREE, R.lower, R.outer),
      outer_core: shell(THREE, R.outer, R.inner),
      inner_core: shell(THREE, R.inner, 0, 64),
    };
  },
  parts: [
    {
      // The rock of the crust: its underside (the land and sea parts are its
      // top), and the colour of its ring when the Earth is cut.
      id: 'crust', group: 'crust', matte: true, color: '#9b7a55', inside: '#9b7a55', explode: lineUp[0],
      name: t('Crust', 'भूपर्पटी', 'ಭೂಹೊರಪದರ'),
      info: t(
        'The thin rocky outer layer we live on: 5–70 km thick, like the skin of an apple. It is broken into large plates that move very slowly.',
        'हम जिस पतली चट्टानी बाहरी परत पर रहते हैं: 5–70 किमी मोटी, सेब के छिलके जैसी। यह बड़ी प्लेटों में बँटी है जो बहुत धीरे खिसकती हैं।',
        'ನಾವು ವಾಸಿಸುವ ತೆಳು ಬಂಡೆಯ ಹೊರಪದರ: 5–70 ಕಿಮೀ ದಪ್ಪ, ಸೇಬಿನ ಸಿಪ್ಪೆಯಂತೆ. ಇದು ಬಹಳ ನಿಧಾನವಾಗಿ ಸರಿಯುವ ದೊಡ್ಡ ಫಲಕಗಳಾಗಿ ಒಡೆದಿದೆ.',
      ),
    },
    {
      id: 'continental_crust', group: 'crust', matte: true, detail: 0.25, error: 0.0005, color: '#6f9a4c', inside: '#9b7a55', explode: lineUp[0],
      name: t('Continental crust', 'महाद्वीपीय भूपर्पटी', 'ಖಂಡೀಯ ಭೂಹೊರಪದರ'),
      info: t(
        'The land. Thicker (30–70 km) and made of lighter rocks like granite, rich in silica and aluminium (sial).',
        'स्थल भाग। मोटी (30–70 किमी), ग्रेनाइट जैसी हल्की चट्टानों से बनी, सिलिका और एल्युमिनियम से भरपूर (सियाल)।',
        'ಭೂಭಾಗ. ದಪ್ಪ (30–70 ಕಿಮೀ), ಗ್ರಾನೈಟ್‌ನಂತಹ ಹಗುರ ಬಂಡೆಗಳಿಂದಾಗಿದೆ; ಸಿಲಿಕಾ ಮತ್ತು ಅಲ್ಯೂಮಿನಿಯಂ ಸಮೃದ್ಧ (ಸಿಯಾಲ್).',
      ),
    },
    {
      id: 'oceanic_crust', group: 'crust', detail: 0.15, error: 0.0005, color: '#2f6fb8', inside: '#9b7a55', explode: lineUp[0],
      name: t('Oceanic crust', 'महासागरीय भूपर्पटी', 'ಸಾಗರೀಯ ಭೂಹೊರಪದರ'),
      info: t(
        'The floor of the oceans. Thinner (about 5–10 km) and made of heavier basalt, rich in silica and magnesium (sima).',
        'महासागरों का तल। पतली (लगभग 5–10 किमी), भारी बेसाल्ट से बनी, सिलिका और मैग्नीशियम से भरपूर (सिमा)।',
        'ಸಾಗರಗಳ ತಳ. ತೆಳು (ಸುಮಾರು 5–10 ಕಿಮೀ), ಭಾರವಾದ ಬಸಾಲ್ಟ್‌ನಿಂದಾಗಿದೆ; ಸಿಲಿಕಾ ಮತ್ತು ಮೆಗ್ನೀಸಿಯಂ ಸಮೃದ್ಧ (ಸಿಮಾ).',
      ),
    },
    {
      id: 'upper_mantle', group: 'layers', color: '#e0843e', explode: lineUp[1],
      name: t('Upper mantle', 'ऊपरी प्रावार', 'ಮೇಲಿನ ಪ್ರಾವಾರ'),
      info: t(
        'Hot rock down to about 660 km that flows very slowly, carrying the plates of the crust. Magma comes from here.',
        'लगभग 660 किमी तक गर्म चट्टान जो बहुत धीरे बहती है और भूपर्पटी की प्लेटों को ढोती है। मैग्मा यहीं से आता है।',
        'ಸುಮಾರು 660 ಕಿಮೀವರೆಗಿನ ಬಿಸಿ ಬಂಡೆ; ಬಹಳ ನಿಧಾನವಾಗಿ ಹರಿದು ಭೂಹೊರಪದರದ ಫಲಕಗಳನ್ನು ಹೊರುತ್ತದೆ. ಶಿಲಾಪಾಕ ಇಲ್ಲಿಂದ ಬರುತ್ತದೆ.',
      ),
    },
    {
      id: 'lower_mantle', group: 'layers', color: '#c2502c', explode: lineUp[2],
      name: t('Lower mantle', 'निचला प्रावार', 'ಕೆಳಗಿನ ಪ್ರಾವಾರ'),
      info: t(
        'Solid but very hot rock, down to about 2,900 km. The mantle is about 84% of the Earth\'s volume.',
        'ठोस पर बहुत गर्म चट्टान, लगभग 2,900 किमी तक। प्रावार पृथ्वी के आयतन का लगभग 84% है।',
        'ಘನ ಆದರೆ ಅತಿ ಬಿಸಿ ಬಂಡೆ, ಸುಮಾರು 2,900 ಕಿಮೀವರೆಗೆ. ಪ್ರಾವಾರ ಭೂಮಿಯ ಗಾತ್ರದ ಸುಮಾರು 84%.',
      ),
    },
    {
      id: 'outer_core', group: 'layers', color: '#f39a2e', glow: 0.25, explode: lineUp[3],
      name: t('Outer core', 'बाहरी क्रोड', 'ಹೊರ ತಿರುಳು'),
      info: t(
        'Liquid iron and nickel, about 4,500–5,500 °C, down to 5,150 km. Its flow makes the Earth\'s magnetic field.',
        'तरल लोहा और निकेल, लगभग 4,500–5,500 °C, 5,150 किमी तक। इसका बहाव पृथ्वी का चुंबकीय क्षेत्र बनाता है।',
        'ದ್ರವ ಕಬ್ಬಿಣ ಮತ್ತು ನಿಕ್ಕಲ್, ಸುಮಾರು 4,500–5,500 °C, 5,150 ಕಿಮೀವರೆಗೆ. ಇದರ ಹರಿವು ಭೂಮಿಯ ಕಾಂತಕ್ಷೇತ್ರ ಸೃಷ್ಟಿಸುತ್ತದೆ.',
      ),
    },
    {
      id: 'inner_core', group: 'layers', color: '#f7d23a', glow: 0.45, explode: lineUp[4],
      name: t('Inner core', 'आंतरिक क्रोड', 'ಒಳ ತಿರುಳು'),
      info: t(
        'A solid ball of iron and nickel (nife), about 5,400 °C – as hot as the Sun\'s surface – kept solid by enormous pressure.',
        'लोहे और निकेल (निफे) का ठोस गोला, लगभग 5,400 °C – सूर्य की सतह जितना गर्म – भारी दबाव के कारण ठोस।',
        'ಕಬ್ಬಿಣ ಮತ್ತು ನಿಕ್ಕಲ್‌ನ (ನಿಫೆ) ಘನ ಗೋಳ, ಸುಮಾರು 5,400 °C – ಸೂರ್ಯನ ಮೇಲ್ಮೈಯಷ್ಟು ಬಿಸಿ – ಭಾರಿ ಒತ್ತಡದಿಂದ ಘನವಾಗಿದೆ.',
      ),
    },
  ],
  views: [
    { id: 'front', name: t('India', 'भारत', 'ಭಾರತ'), dir: [0.5, 0.35, 1] },
    { id: 'wedge', name: t('Into the wedge', 'कटे भाग में', 'ಕತ್ತರಿಸಿದ ಭಾಗದೊಳಗೆ'), dir: [1, 0.55, 1] },
    { id: 'inside', name: t('The cut face', 'कटा हुआ भाग', 'ಕತ್ತರಿಸಿದ ಮುಖ'), dir: [0.12, 0.2, 1] },
    { id: 'north', name: t('North Pole', 'उत्तरी ध्रुव', 'ಉತ್ತರ ಧ್ರುವ'), dir: [0, 1, 0.02] },
  ],
  slices: [
    // A quarter taken out, like the textbook picture.
    // Labels sit on the cut faces, one ring each.
    {
      id: 'wedge', name: t('Slice taken out', 'एक फाँक निकाली', 'ಒಂದು ತುಂಡು ತೆಗೆದಿದೆ'), normal: [-1, 0, 0], offset: 0, normal2: [0, 0, -1], view: 'wedge',
      anchors: {
        continental_crust: surface(-0.2, 0.5, 0.85),
        oceanic_crust: surface(0.9, -0.2, -0.3),
        crust: ring('x', (R.crust + R.upper) / 2, 55),
        upper_mantle: ring('z', (R.upper + R.lower) / 2, 35),
        lower_mantle: ring('x', (R.lower + R.outer) / 2, 15),
        outer_core: ring('z', (R.outer + R.inner) / 2, -20),
        inner_core: ring('x', R.inner * 0.5, 30),
      },
    },
    {
      id: 'open', name: t('Cut in half', 'आधा काटें', 'ಅರ್ಧಕ್ಕೆ ಕತ್ತರಿಸಿ'), normal: [0, 0, -1], offset: 0, view: 'inside',
      anchors: {
        continental_crust: null,
        oceanic_crust: null,
        crust: ring('z', (R.crust + R.upper) / 2, 120),
        upper_mantle: ring('z', (R.upper + R.lower) / 2, 160),
        lower_mantle: ring('z', (R.lower + R.outer) / 2, 200),
        outer_core: ring('z', (R.outer + R.inner) / 2, -60),
        inner_core: ring('z', R.inner * 0.4, 45),
      },
    },
  ],
  animations: [],
};
