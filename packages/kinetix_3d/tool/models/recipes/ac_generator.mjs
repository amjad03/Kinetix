// An AC generator (dynamo), built in code, as in the class 10 and 12
// pictures: a coil turned by a handle between the poles of a magnet, two
// slip rings, brushes and a bulb. Like the electric motor model, but run
// backwards: motion in, current out.
import { rod, blob } from '../lib/shapes.mjs';
import { t, arrow, wire, box, ring } from '../lib/teaching.mjs';

const W = 0.03, L = 0.036; // coil half-width (x) and half-length (z)
const Z1 = 0.056, Z2 = 0.07; // the two slip rings along the axle
const CR = 0.0085; // slip ring radius
const POLE = 0.047;
const BULB = [0, -0.075, 0.063];

export default {
  id: 'ac_generator',
  version: 1,
  order: 2,
  source: 'procedural',
  subject: 'Physics',
  classes: [10, 12],
  title: t('AC generator', 'प्रत्यावर्ती धारा जनित्र', 'ಪರ್ಯಾಯ ವಿದ್ಯುತ್ ಜನಕ'),
  summary: t(
    'Turning a coil in a magnetic field induces a current in it (electromagnetic induction). Slip rings carry it out; it reverses every half turn, so it is alternating current.',
    'चुंबकीय क्षेत्र में कुंडली घुमाने से उसमें धारा प्रेरित होती है (विद्युत चुंबकीय प्रेरण)। सर्पी वलय इसे बाहर ले जाते हैं; यह हर आधे चक्कर में उलटती है, इसलिए यह प्रत्यावर्ती धारा है।',
    'ಕಾಂತಕ್ಷೇತ್ರದಲ್ಲಿ ಸುರುಳಿಯನ್ನು ತಿರುಗಿಸಿದರೆ ಅದರಲ್ಲಿ ವಿದ್ಯುತ್ ಪ್ರೇರಿತವಾಗುತ್ತದೆ (ವಿದ್ಯುತ್ಕಾಂತೀಯ ಪ್ರೇರಣೆ). ಜಾರು ಉಂಗುರಗಳು ಅದನ್ನು ಹೊರಗೆ ಒಯ್ಯುತ್ತವೆ; ಪ್ರತಿ ಅರ್ಧ ಸುತ್ತಿಗೆ ಅದು ದಿಕ್ಕು ಬದಲಿಸುತ್ತದೆ, ಹಾಗಾಗಿ ಇದು ಪರ್ಯಾಯ ವಿದ್ಯುತ್.',
  ),
  keywords: ['generator', 'ac generator', 'electric generator', 'dynamo', 'electromagnetic induction', 'slip rings', 'alternating current', 'fleming right hand rule', 'magnetic effects of electric current', 'induced current'],
  credit: 'Model built by KINETIX',
  groups: [
    { id: 'magnet', name: t('Magnet', 'चुंबक', 'ಕಾಂತ') },
    { id: 'rotor', name: t('Turning parts', 'घूमने वाले भाग', 'ತಿರುಗುವ ಭಾಗಗಳು') },
    { id: 'circuit', name: t('Circuit', 'परिपथ', 'ಮಂಡಲ') },
    { id: 'ideas', name: t('Field and current', 'क्षेत्र और धारा', 'ಕ್ಷೇತ್ರ ಮತ್ತು ವಿದ್ಯುತ್') },
  ],
  build(THREE) {
    const coil = wire(THREE, [
      [-0.0035, CR * 0.9, Z1 - 0.003], [-W * 0.7, 0.001, L + 0.008], [-W, 0, L], [-W, 0, 0], [-W, 0, -L], [-W * 0.95, 0, -L - 0.002], [0, 0, -L - 0.003],
      [W * 0.95, 0, -L - 0.002], [W, 0, -L], [W, 0, 0], [W, 0, L], [W * 0.7, -0.001, L + 0.008], [0.0035, -CR * 0.9, Z2 - 0.003],
    ], 0.0024, 160);
    const field = [];
    for (const [y, z] of [[0.016, 0.024], [0.016, -0.024], [-0.016, 0.024], [-0.016, -0.024], [0, 0]]) {
      field.push(rod(THREE, [-POLE, y, z], [POLE, y, z], 0.0006, 8));
      field.push(...arrow(THREE, [-0.006, y, z], [0.006, y, z], 0.0006));
    }
    return {
      north_pole: box(THREE, [0.03, 0.05, 0.085], [-POLE - 0.015, 0, 0]),
      south_pole: box(THREE, [0.03, 0.05, 0.085], [POLE + 0.015, 0, 0]),
      coil,
      slip_rings: [ring(THREE, [0, 0, Z1], [0, 0, 1], CR, 0.0018), ring(THREE, [0, 0, Z2], [0, 0, 1], CR, 0.0018)],
      axle: rod(THREE, [0, 0, -0.07], [0, 0, Z2 + 0.012], 0.0022, 16),
      handle: [box(THREE, [0.03, 0.005, 0.004], [0.015, 0, -0.07]), rod(THREE, [0.028, 0, -0.07], [0.028, 0, -0.086], 0.0025, 16)],
      brushes: [box(THREE, [0.006, 0.008, 0.006], [0, -CR - 0.006, Z1]), box(THREE, [0.006, 0.008, 0.006], [0, -CR - 0.006, Z2])],
      bulb: [blob(THREE, [BULB[0], BULB[1], BULB[2]], 0.009, 0.011, 0.009, 4), rod(THREE, [BULB[0], BULB[1] + 0.008, BULB[2]], [BULB[0], BULB[1] + 0.016, BULB[2]], 0.0045, 20)],
      wires: [
        wire(THREE, [[0, -CR - 0.01, Z1], [-0.012, -0.03, Z1], [-0.008, -0.055, BULB[2] - 0.002], [-0.002, BULB[1] + 0.016, BULB[2]]], 0.0011),
        wire(THREE, [[0, -CR - 0.01, Z2], [0.012, -0.03, Z2], [0.008, -0.055, BULB[2] + 0.002], [0.002, BULB[1] + 0.016, BULB[2]]], 0.0011),
      ],
      field,
      induced: [...arrow(THREE, [-W - 0.004, 0.003, -0.02], [-W - 0.004, 0.003, 0.02]), ...arrow(THREE, [W + 0.004, 0.003, 0.02], [W + 0.004, 0.003, -0.02])],
    };
  },
  parts: [
    {
      id: 'north_pole', group: 'magnet', color: '#c93a3a', matte: true, explode: [-1.2, 0, 0],
      name: t('North pole (N)', 'उत्तरी ध्रुव (N)', 'ಉತ್ತರ ಧ್ರುವ (N)'),
      info: t('A strong permanent magnet (or an electromagnet in big generators).', 'एक प्रबल स्थायी चुंबक (बड़े जनित्रों में विद्युत चुंबक)।', 'ಪ್ರಬಲ ಶಾಶ್ವತ ಕಾಂತ (ದೊಡ್ಡ ಜನಕಗಳಲ್ಲಿ ವಿದ್ಯುತ್ಕಾಂತ).'),
    },
    {
      id: 'south_pole', group: 'magnet', color: '#3561c4', matte: true, explode: [1.2, 0, 0],
      name: t('South pole (S)', 'दक्षिणी ध्रुव (S)', 'ದಕ್ಷಿಣ ಧ್ರುವ (S)'),
      info: t('The field runs from N to S across the coil.', 'क्षेत्र कुंडली के आर-पार N से S की ओर चलता है।', 'ಕ್ಷೇತ್ರ ಸುರುಳಿಯನ್ನು ದಾಟಿ N ನಿಂದ S ಕಡೆಗೆ ಸಾಗುತ್ತದೆ.'),
    },
    {
      id: 'coil', group: 'rotor', color: '#c8783a', explode: [0, 0.6, 0], spin: { axis: [0, 0, 1], speed: 90 },
      name: t('Coil (armature)', 'कुंडली (आर्मेचर)', 'ಸುರುಳಿ (ಆರ್ಮೇಚರ್)'),
      info: t('As it turns, its sides cut the field lines and a current is induced. More turns, a stronger field or faster turning give more current.', 'घूमते समय इसकी भुजाएँ क्षेत्र रेखाओं को काटती हैं और धारा प्रेरित होती है। अधिक फेरे, प्रबल क्षेत्र या तेज़ घुमाव से अधिक धारा मिलती है।', 'ತಿರುಗುವಾಗ ಇದರ ಬದಿಗಳು ಕ್ಷೇತ್ರ ರೇಖೆಗಳನ್ನು ಕತ್ತರಿಸುತ್ತವೆ, ವಿದ್ಯುತ್ ಪ್ರೇರಿತವಾಗುತ್ತದೆ. ಹೆಚ್ಚು ಸುತ್ತುಗಳು, ಪ್ರಬಲ ಕ್ಷೇತ್ರ ಅಥವಾ ವೇಗದ ತಿರುಗುವಿಕೆ ಹೆಚ್ಚು ವಿದ್ಯುತ್ ನೀಡುತ್ತವೆ.'),
    },
    {
      id: 'slip_rings', group: 'rotor', color: '#e0a93a', explode: [0, 0, 0.9], spin: { axis: [0, 0, 1], speed: 90 },
      name: t('Slip rings', 'सर्पी वलय', 'ಜಾರು ಉಂಗುರಗಳು'),
      info: t('Two full rings, one joined to each end of the coil, turning with it. Unlike the motor\'s split ring they never swap, so the current outside reverses as it does in the coil: AC.', 'दो पूरे वलय, हर एक कुंडली के एक सिरे से जुड़ा, उसके साथ घूमता है। मोटर के विभक्त वलय के विपरीत ये कभी अदला-बदली नहीं करते, इसलिए बाहर की धारा भी कुंडली की तरह उलटती है: AC।', 'ಎರಡು ಪೂರ್ಣ ಉಂಗುರಗಳು, ಪ್ರತಿಯೊಂದೂ ಸುರುಳಿಯ ಒಂದು ತುದಿಗೆ ಜೋಡಿಸಿ ಅದರೊಂದಿಗೆ ತಿರುಗುತ್ತವೆ. ಮೋಟಾರಿನ ಸೀಳು ಉಂಗುರದಂತೆ ಇವು ಅದಲು-ಬದಲಾಗುವುದಿಲ್ಲ, ಹಾಗಾಗಿ ಹೊರಗಿನ ವಿದ್ಯುತ್ ಕೂಡ ಸುರುಳಿಯಂತೆ ದಿಕ್ಕು ಬದಲಿಸುತ್ತದೆ: AC.'),
    },
    {
      id: 'axle', group: 'rotor', color: '#9aa3ad', minor: true, explode: [0, 0, -0.6], spin: { axis: [0, 0, 1], speed: 90 },
      name: t('Axle', 'धुरी', 'ಅಕ್ಷದಂಡ'),
      info: t('Turned by a handle here; by a turbine (steam, water, wind) in a power station.', 'यहाँ हत्थे से घुमाई जाती है; बिजलीघर में टरबाइन (भाप, पानी, पवन) से।', 'ಇಲ್ಲಿ ಹಿಡಿಯಿಂದ ತಿರುಗಿಸಲಾಗುತ್ತದೆ; ವಿದ್ಯುತ್ ಸ್ಥಾವರದಲ್ಲಿ ಟರ್ಬೈನ್ (ಆವಿ, ನೀರು, ಗಾಳಿ) ಇಂದ.'),
    },
    {
      id: 'handle', group: 'rotor', color: '#8a6d4a', explode: [0, 0, -1], spin: { axis: [0, 0, 1], speed: 90 },
      name: t('Handle', 'हत्था', 'ಹಿಡಿ'),
      info: t('The mechanical energy we put in becomes electrical energy.', 'हमारे द्वारा दी गई यांत्रिक ऊर्जा विद्युत ऊर्जा बन जाती है।', 'ನಾವು ನೀಡುವ ಯಾಂತ್ರಿಕ ಶಕ್ತಿ ವಿದ್ಯುತ್ ಶಕ್ತಿಯಾಗುತ್ತದೆ.'),
    },
    {
      id: 'brushes', group: 'circuit', color: '#3c3f44', matte: true, explode: [0, -0.4, 1.1],
      name: t('Carbon brushes', 'कार्बन ब्रश', 'ಕಾರ್ಬನ್ ಬ್ರಷ್‌ಗಳು'),
      info: t('Fixed contacts pressing on the turning slip rings; they carry the current out to the circuit.', 'घूमते सर्पी वलयों पर दबे स्थिर संपर्क; ये धारा को बाहरी परिपथ में ले जाते हैं।', 'ತಿರುಗುವ ಜಾರು ಉಂಗುರಗಳ ಮೇಲೆ ಒತ್ತಿರುವ ಸ್ಥಿರ ಸಂಪರ್ಕಗಳು; ವಿದ್ಯುತ್ತನ್ನು ಹೊರ ಮಂಡಲಕ್ಕೆ ಒಯ್ಯುತ್ತವೆ.'),
    },
    {
      id: 'bulb', group: 'circuit', color: '#ffe58a', glow: 0.6, explode: [0, -0.9, 1.1],
      name: t('Bulb', 'बल्ब', 'ಬಲ್ಬ್'),
      info: t('Lights up while the coil turns. Turn slowly and it flickers: the current rises, falls and reverses.', 'कुंडली घूमने तक जलता है। धीरे घुमाएँ तो टिमटिमाता है: धारा बढ़ती, घटती और उलटती है।', 'ಸುರುಳಿ ತಿರುಗುವವರೆಗೆ ಉರಿಯುತ್ತದೆ. ನಿಧಾನವಾಗಿ ತಿರುಗಿಸಿದರೆ ಮಿನುಗುತ್ತದೆ: ವಿದ್ಯುತ್ ಏರುತ್ತದೆ, ಇಳಿಯುತ್ತದೆ, ದಿಕ್ಕು ಬದಲಿಸುತ್ತದೆ.'),
    },
    {
      id: 'wires', group: 'circuit', color: '#d8d2c4', minor: true, explode: [0, -0.65, 1.1],
      name: t('Connecting wires', 'संयोजक तार', 'ಸಂಪರ್ಕ ತಂತಿಗಳು'),
      info: t('Join the brushes to the bulb.', 'ब्रशों को बल्ब से जोड़ते हैं।', 'ಬ್ರಷ್‌ಗಳನ್ನು ಬಲ್ಬ್‌ಗೆ ಜೋಡಿಸುತ್ತವೆ.'),
    },
    {
      id: 'field', group: 'ideas', color: '#7fc3ff', opacity: 0.75, explode: [0, 0, 0],
      name: t('Magnetic field', 'चुंबकीय क्षेत्र', 'ಕಾಂತಕ್ಷೇತ್ರ'),
      info: t('Field lines from the north pole to the south pole.', 'उत्तरी ध्रुव से दक्षिणी ध्रुव तक क्षेत्र रेखाएँ।', 'ಉತ್ತರ ಧ್ರುವದಿಂದ ದಕ್ಷಿಣ ಧ್ರುವದವರೆಗೆ ಕ್ಷೇತ್ರ ರೇಖೆಗಳು.'),
    },
    {
      id: 'induced', group: 'ideas', color: '#ffd23f', hidden: true, glow: 0.4, spin: { axis: [0, 0, 1], speed: 90 },
      name: t('Induced current', 'प्रेरित धारा', 'ಪ್ರೇರಿತ ವಿದ್ಯುತ್'),
      info: t('Fleming\'s right-hand rule: thumb along the motion, first finger along the field, and the second finger gives the induced current. The two sides move opposite ways, so their currents add up round the coil.', 'फ्लेमिंग का दक्षिण-हस्त नियम: अंगूठा गति की दिशा में, तर्जनी क्षेत्र की दिशा में, तो मध्यमा प्रेरित धारा की दिशा बताती है। दोनों भुजाएँ उलटी दिशाओं में चलती हैं, इसलिए उनकी धाराएँ कुंडली में जुड़ जाती हैं।', 'ಫ್ಲೆಮಿಂಗ್‌ನ ಬಲಗೈ ನಿಯಮ: ಹೆಬ್ಬೆರಳು ಚಲನೆಯ ದಿಕ್ಕು, ತೋರುಬೆರಳು ಕ್ಷೇತ್ರದ ದಿಕ್ಕು, ಮಧ್ಯದ ಬೆರಳು ಪ್ರೇರಿತ ವಿದ್ಯುತ್ತಿನ ದಿಕ್ಕು. ಎರಡು ಬದಿಗಳು ವಿರುದ್ಧ ದಿಕ್ಕುಗಳಲ್ಲಿ ಚಲಿಸುವುದರಿಂದ ಅವುಗಳ ವಿದ್ಯುತ್ ಸುರುಳಿಯಲ್ಲಿ ಕೂಡುತ್ತದೆ.'),
    },
  ],
  views: [
    { id: 'front', name: t('Front', 'सामने से', 'ಮುಂಭಾಗ'), dir: [0.45, 0.55, 1] },
    { id: 'end', name: t('Along the axle', 'धुरी की दिशा से', 'ಅಕ್ಷದಂಡದ ದಿಕ್ಕಿನಿಂದ'), dir: [0.02, 0.05, 1] },
    { id: 'above', name: t('From above', 'ऊपर से', 'ಮೇಲಿನಿಂದ'), dir: [0, 1, 0.3] },
  ],
  slices: [],
  animations: [
    { id: 'run', kind: 'orbit', name: t('Turn the handle', 'हत्था घुमाएँ', 'ಹಿಡಿ ತಿರುಗಿಸಿ') },
    {
      id: 'how', kind: 'flow',
      name: t('How it works', 'यह कैसे काम करता है', 'ಇದು ಹೇಗೆ ಕೆಲಸ ಮಾಡುತ್ತದೆ'),
      steps: [
        {
          color: '#9ad0ff', highlight: ['handle', 'axle', 'coil'],
          text: t('The handle turns the coil between the poles. Its sides move up and down through the field.', 'हत्था कुंडली को ध्रुवों के बीच घुमाता है। इसकी भुजाएँ क्षेत्र में ऊपर-नीचे चलती हैं।', 'ಹಿಡಿ ಸುರುಳಿಯನ್ನು ಧ್ರುವಗಳ ನಡುವೆ ತಿರುಗಿಸುತ್ತದೆ. ಇದರ ಬದಿಗಳು ಕ್ಷೇತ್ರದಲ್ಲಿ ಮೇಲೆ-ಕೆಳಗೆ ಚಲಿಸುತ್ತವೆ.'),
          paths: [[[-POLE, 0.016, 0.024], [POLE, 0.016, 0.024]], [[-POLE, -0.016, -0.024], [POLE, -0.016, -0.024]]],
        },
        {
          color: '#ffe066', highlight: ['coil', 'induced'],
          text: t('Cutting the field lines induces a current in the coil (Fleming\'s right-hand rule).', 'क्षेत्र रेखाओं को काटने से कुंडली में धारा प्रेरित होती है (फ्लेमिंग का दक्षिण-हस्त नियम)।', 'ಕ್ಷೇತ್ರ ರೇಖೆಗಳನ್ನು ಕತ್ತರಿಸುವುದರಿಂದ ಸುರುಳಿಯಲ್ಲಿ ವಿದ್ಯುತ್ ಪ್ರೇರಿತವಾಗುತ್ತದೆ (ಫ್ಲೆಮಿಂಗ್‌ನ ಬಲಗೈ ನಿಯಮ).'),
          paths: [[[-W, 0, L], [-W, 0, -L], [0, 0, -L - 0.003], [W, 0, -L], [W, 0, L]]],
        },
        {
          color: '#ffe066', highlight: ['slip_rings', 'brushes', 'wires', 'bulb'],
          text: t('The slip rings and brushes carry the current out to the bulb, and back.', 'सर्पी वलय और ब्रश धारा को बल्ब तक ले जाते हैं, और वापस लाते हैं।', 'ಜಾರು ಉಂಗುರಗಳು ಮತ್ತು ಬ್ರಷ್‌ಗಳು ವಿದ್ಯುತ್ತನ್ನು ಬಲ್ಬ್‌ಗೆ ಒಯ್ದು ಹಿಂದಕ್ಕೆ ತರುತ್ತವೆ.'),
          paths: [[[0, -CR - 0.01, Z1], [-0.012, -0.03, Z1], [-0.008, -0.055, BULB[2] - 0.002], [0, BULB[1], BULB[2]], [0.008, -0.055, BULB[2] + 0.002], [0.012, -0.03, Z2], [0, -CR - 0.01, Z2]]],
        },
        {
          color: '#ff9f7f', highlight: ['coil', 'slip_rings', 'bulb'],
          text: t('After half a turn each side moves the other way through the field, so the current reverses: alternating current. In India it reverses 100 times a second (50 Hz).', 'आधे चक्कर बाद हर भुजा क्षेत्र में उल्टी दिशा में चलती है, इसलिए धारा उलट जाती है: प्रत्यावर्ती धारा। भारत में यह एक सेकंड में 100 बार उलटती है (50 Hz)।', 'ಅರ್ಧ ಸುತ್ತಿನ ನಂತರ ಪ್ರತಿ ಬದಿ ಕ್ಷೇತ್ರದಲ್ಲಿ ವಿರುದ್ಧ ದಿಕ್ಕಿನಲ್ಲಿ ಚಲಿಸುತ್ತದೆ, ಹಾಗಾಗಿ ವಿದ್ಯುತ್ ದಿಕ್ಕು ಬದಲಿಸುತ್ತದೆ: ಪರ್ಯಾಯ ವಿದ್ಯುತ್. ಭಾರತದಲ್ಲಿ ಇದು ಸೆಕೆಂಡಿಗೆ 100 ಬಾರಿ ದಿಕ್ಕು ಬದಲಿಸುತ್ತದೆ (50 Hz).'),
          paths: [[[0, -CR - 0.01, Z2], [0.012, -0.03, Z2], [0.008, -0.055, BULB[2] + 0.002], [0, BULB[1], BULB[2]], [-0.008, -0.055, BULB[2] - 0.002], [-0.012, -0.03, Z1], [0, -CR - 0.01, Z1]]],
        },
      ],
    },
  ],
};
