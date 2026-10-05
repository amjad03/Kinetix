// A simple electric circuit, built in code, laid out like the class 10
// picture: a battery of two cells, a plug key, an ammeter in series, a
// bulb and a resistor, and a voltmeter across the resistor. The battery's
// positive terminal is on its right, so conventional current goes round
// anticlockwise as seen from the front: up the right, across the top, down
// the left.
import { blob, rod } from '../lib/shapes.mjs';
import { t, straightWire, helix, box } from '../lib/teaching.mjs';

const X = 0.08, Y = 0.05; // the loop's corners
const VX = 0.125; // the voltmeter's branch
const W = 0.0012; // wire radius

/** A round meter facing the viewer, with a needle. */
function meter(THREE, at) {
  const casing = new THREE.CylinderGeometry(0.016, 0.016, 0.008, 40).rotateX(Math.PI / 2).translate(at[0], at[1], 0.002);
  const needle = box(THREE, [0.0012, 0.012, 0.001], [0, 0.005, 0]);
  needle.rotateZ(-0.5).translate(at[0], at[1], 0.0065);
  const pivot = blob(THREE, [at[0], at[1], 0.0065], 0.0015, 0.0015, 0.0015, 2);
  return [casing, needle, pivot];
}

const face = (at) => (THREE) => new THREE.CylinderGeometry(0.0135, 0.0135, 0.001, 40).rotateX(Math.PI / 2).translate(at[0], at[1], 0.0062);

// The current's way round, from the battery's + terminal.
const LOOP = [
  [0.033, -Y, 0], [X, -Y, 0], [X, 0, 0], [X, Y, 0], [0.006, Y, 0], [0, Y + 0.006, 0], [-0.006, Y, 0],
  [-X, Y, 0], [-X, 0, 0], [-X, -Y, 0], [-0.055, -Y, 0], [-0.033, -Y, 0],
];
const BRANCH = [[X, 0.02, 0], [VX, 0.02, 0], [VX, 0, 0], [VX, -0.02, 0], [X, -0.02, 0]];

export default {
  id: 'electric_circuit',
  version: 1,
  order: 3,
  source: 'procedural',
  subject: 'Physics',
  classes: [6, 7, 10],
  title: t('A simple electric circuit', 'एक सरल विद्युत परिपथ', 'ಸರಳ ವಿದ್ಯುತ್ ಮಂಡಲ'),
  summary: t(
    'A battery drives a current through a closed loop: a plug key, an ammeter, a bulb and a resistor in series, with a voltmeter across the resistor. V = IR (Ohm\'s law).',
    'बैटरी एक बंद पथ में धारा चलाती है: श्रेणी में प्लग कुंजी, ऐमीटर, बल्ब और प्रतिरोधक, और प्रतिरोधक के सिरों पर वोल्टमीटर। V = IR (ओम का नियम)।',
    'ಬ್ಯಾಟರಿ ಮುಚ್ಚಿದ ಪಥದಲ್ಲಿ ವಿದ್ಯುತ್ ಹರಿಸುತ್ತದೆ: ಸರಣಿಯಲ್ಲಿ ಪ್ಲಗ್ ಕೀ, ಆಮ್ಮೀಟರ್, ಬಲ್ಬ್ ಮತ್ತು ರೋಧಕ, ರೋಧಕದ ಅಡ್ಡಲಾಗಿ ವೋಲ್ಟ್‌ಮೀಟರ್. V = IR (ಓಮ್‌ನ ನಿಯಮ).',
  ),
  keywords: ['electric circuit', 'circuit', 'electricity', 'electric current', 'ohm\'s law', 'ammeter', 'voltmeter', 'resistor', 'resistance', 'potential difference', 'cell', 'battery', 'bulb', 'series circuit', 'current electricity'],
  credit: 'Model built by KINETIX',
  groups: [
    { id: 'source', name: t('Source and switch', 'स्रोत और स्विच', 'ಮೂಲ ಮತ್ತು ಸ್ವಿಚ್') },
    { id: 'load', name: t('Bulb and resistor', 'बल्ब और प्रतिरोधक', 'ಬಲ್ಬ್ ಮತ್ತು ರೋಧಕ') },
    { id: 'meters', name: t('Meters', 'मीटर', 'ಮೀಟರ್‌ಗಳು') },
    { id: 'wiring', name: t('Wires', 'तार', 'ತಂತಿಗಳು') },
  ],
  build(THREE) {
    const cell = (x0, x1) => [
      rod(THREE, [x0, -Y, 0], [x1 - 0.003, -Y, 0], 0.008, 32),
      rod(THREE, [x1 - 0.003, -Y, 0], [x1, -Y, 0], 0.003, 16), // the + terminal
    ];
    // The filament: a small coil between two support wires inside the glass.
    const filament = [
      helix(THREE, [-0.004, Y + 0.02, 0], [0.004, Y + 0.02, 0], 0.0012, 6, 0.00035),
      rod(THREE, [-0.004, Y + 0.006, 0], [-0.004, Y + 0.02, 0], 0.0004, 6),
      rod(THREE, [0.004, Y + 0.006, 0], [0.004, Y + 0.02, 0], 0.0004, 6),
    ];
    return {
      battery: [...cell(-0.033, -0.001), ...cell(0.002, 0.034)],
      plug_key: [box(THREE, [0.024, 0.006, 0.014], [-0.055, -Y - 0.005, 0]), box(THREE, [0.007, 0.006, 0.01], [-0.061, -Y, 0]), box(THREE, [0.007, 0.006, 0.01], [-0.049, -Y, 0]), rod(THREE, [-0.055, -Y - 0.002, 0], [-0.055, -Y + 0.012, 0], 0.0022, 16)],
      ammeter: meter(THREE, [-X, 0]),
      ammeter_face: face([-X, 0])(THREE),
      voltmeter: meter(THREE, [VX, 0]),
      voltmeter_face: face([VX, 0])(THREE),
      bulb_glass: blob(THREE, [0, Y + 0.02, 0], 0.014, 0.016, 0.014, 4),
      bulb_base: rod(THREE, [0, Y - 0.002, 0], [0, Y + 0.008, 0], 0.0065, 24),
      filament,
      resistor: rod(THREE, [X, -0.014, 0], [X, 0.014, 0], 0.0048, 24),
      resistor_bands: [-0.008, -0.002, 0.004].map((y) => rod(THREE, [X, y, 0], [X, y + 0.0025, 0], 0.005, 24)),
      wires: [
        ...straightWire(THREE, [[0.034, -Y, 0], [X, -Y, 0], [X, -0.014, 0]], W),
        ...straightWire(THREE, [[X, 0.014, 0], [X, Y, 0], [0.006, Y, 0]], W),
        ...straightWire(THREE, [[-0.006, Y, 0], [-X, Y, 0], [-X, 0.016, 0]], W),
        ...straightWire(THREE, [[-X, -0.016, 0], [-X, -Y, 0], [-0.064, -Y, 0]], W),
        ...straightWire(THREE, [[-0.046, -Y, 0], [-0.033, -Y, 0]], W),
        ...straightWire(THREE, [[X, 0.02, 0], [VX, 0.02, 0], [VX, 0.016, 0]], W * 0.8),
        ...straightWire(THREE, [[VX, -0.016, 0], [VX, -0.02, 0], [X, -0.02, 0]], W * 0.8),
      ],
      board: box(THREE, [0.27, 0.15, 0.004], [0.022, 0.004, -0.012]),
    };
  },
  parts: [
    {
      id: 'battery', group: 'source', color: '#2f9e6a', explode: [0, -0.8, 0.4],
      name: t('Battery (two cells)', 'बैटरी (दो सेल)', 'ಬ್ಯಾಟರಿ (ಎರಡು ಕೋಶಗಳು)'),
      info: t('Cells joined end to end. The chemical energy in them makes a potential difference that pushes the current round. The longer + terminal is on the right.', 'सिरे से सिरा जुड़े सेल। इनकी रासायनिक ऊर्जा विभवांतर बनाती है जो धारा को परिपथ में चलाता है। लंबा + टर्मिनल दाईं ओर है।', 'ತುದಿಯಿಂದ ತುದಿಗೆ ಜೋಡಿಸಿದ ಕೋಶಗಳು. ಅವುಗಳ ರಾಸಾಯನಿಕ ಶಕ್ತಿ ವಿಭವಾಂತರ ಉಂಟುಮಾಡಿ ವಿದ್ಯುತ್ತನ್ನು ಸುತ್ತ ತಳ್ಳುತ್ತದೆ. ಉದ್ದ + ಟರ್ಮಿನಲ್ ಬಲಭಾಗದಲ್ಲಿದೆ.'),
    },
    {
      id: 'plug_key', group: 'source', color: '#8a6d4a', explode: [-0.5, -0.8, 0.4],
      name: t('Plug key (switch)', 'प्लग कुंजी (स्विच)', 'ಪ್ಲಗ್ ಕೀ (ಸ್ವಿಚ್)'),
      info: t('With the plug in, the circuit is closed and current flows. Take it out and the circuit is open: everything stops.', 'प्लग लगा होने पर परिपथ बंद है और धारा बहती है। निकालने पर परिपथ खुल जाता है: सब रुक जाता है।', 'ಪ್ಲಗ್ ಹಾಕಿದಾಗ ಮಂಡಲ ಮುಚ್ಚಿರುತ್ತದೆ, ವಿದ್ಯುತ್ ಹರಿಯುತ್ತದೆ. ತೆಗೆದರೆ ಮಂಡಲ ತೆರೆಯುತ್ತದೆ: ಎಲ್ಲವೂ ನಿಲ್ಲುತ್ತದೆ.'),
    },
    {
      id: 'ammeter', group: 'meters', color: '#c8473a', explode: [-1, 0, 0.5],
      name: t('Ammeter (A)', 'ऐमीटर (A)', 'ಆಮ್ಮೀಟರ್ (A)'),
      info: t('Measures the current in amperes. It is joined in series, so all the current passes through it; it has a very low resistance.', 'धारा को ऐम्पियर में मापता है। यह श्रेणी में जुड़ा होता है, इसलिए पूरी धारा इससे होकर जाती है; इसका प्रतिरोध बहुत कम होता है।', 'ವಿದ್ಯುತ್ತನ್ನು ಆಂಪಿಯರ್‌ಗಳಲ್ಲಿ ಅಳೆಯುತ್ತದೆ. ಇದನ್ನು ಸರಣಿಯಲ್ಲಿ ಜೋಡಿಸಲಾಗುತ್ತದೆ, ಹಾಗಾಗಿ ಎಲ್ಲಾ ವಿದ್ಯುತ್ ಇದರ ಮೂಲಕ ಹೋಗುತ್ತದೆ; ಇದರ ರೋಧ ತುಂಬಾ ಕಡಿಮೆ.'),
    },
    { id: 'ammeter_face', group: 'meters', color: '#f4f1ea', minor: true, explode: [-1, 0, 0.5], name: t('Ammeter dial', 'ऐमीटर का डायल', 'ಆಮ್ಮೀಟರ್ ಡಯಲ್'), info: t('The needle shows the current.', 'सुई धारा दिखाती है।', 'ಸೂಜಿ ವಿದ್ಯುತ್ತನ್ನು ತೋರಿಸುತ್ತದೆ.') },
    {
      id: 'voltmeter', group: 'meters', color: '#3d6fd0', explode: [1, 0, 0.5],
      name: t('Voltmeter (V)', 'वोल्टमीटर (V)', 'ವೋಲ್ಟ್‌ಮೀಟರ್ (V)'),
      info: t('Measures the potential difference across the resistor in volts. It is joined in parallel, across the two ends; it has a very high resistance, so it takes almost no current.', 'प्रतिरोधक के सिरों के बीच विभवांतर को वोल्ट में मापता है। यह पार्श्व में, दोनों सिरों के बीच जुड़ा होता है; इसका प्रतिरोध बहुत अधिक है, इसलिए यह लगभग कोई धारा नहीं लेता।', 'ರೋಧಕದ ಅಡ್ಡಲಾಗಿ ವಿಭವಾಂತರವನ್ನು ವೋಲ್ಟ್‌ಗಳಲ್ಲಿ ಅಳೆಯುತ್ತದೆ. ಇದನ್ನು ಸಮಾಂತರವಾಗಿ, ಎರಡು ತುದಿಗಳ ನಡುವೆ ಜೋಡಿಸಲಾಗುತ್ತದೆ; ಇದರ ರೋಧ ತುಂಬಾ ಹೆಚ್ಚು, ಹಾಗಾಗಿ ಇದು ಬಹುತೇಕ ವಿದ್ಯುತ್ ತೆಗೆದುಕೊಳ್ಳುವುದಿಲ್ಲ.'),
    },
    { id: 'voltmeter_face', group: 'meters', color: '#f4f1ea', minor: true, explode: [1, 0, 0.5], name: t('Voltmeter dial', 'वोल्टमीटर का डायल', 'ವೋಲ್ಟ್‌ಮೀಟರ್ ಡಯಲ್'), info: t('The needle shows the potential difference.', 'सुई विभवांतर दिखाती है।', 'ಸೂಜಿ ವಿಭವಾಂತರವನ್ನು ತೋರಿಸುತ್ತದೆ.') },
    {
      id: 'bulb_glass', group: 'load', color: '#dfeefa', opacity: 0.3, explode: [0, 1, 0.3],
      name: t('Bulb', 'बल्ब', 'ಬಲ್ಬ್'),
      info: t('A glass bulb filled with an unreactive gas, so the hot filament does not burn away.', 'अक्रिय गैस से भरा काँच का बल्ब, ताकि गर्म तंतु जल न जाए।', 'ನಿಷ್ಕ್ರಿಯ ಅನಿಲ ತುಂಬಿದ ಗಾಜಿನ ಬಲ್ಬ್, ಹಾಗಾಗಿ ಬಿಸಿ ತಂತು ಸುಟ್ಟುಹೋಗುವುದಿಲ್ಲ.'),
    },
    {
      id: 'filament', group: 'load', color: '#ffcc33', glow: 0.9, explode: [0, 1, 0.3],
      name: t('Filament', 'तंतु', 'ತಂತು'),
      info: t('A thin coil of tungsten with a high resistance and melting point. The current heats it until it glows (the heating effect of current, H = I²Rt).', 'उच्च प्रतिरोध और गलनांक वाली टंगस्टन की पतली कुंडली। धारा इसे इतना गर्म करती है कि यह चमकने लगती है (धारा का ऊष्मीय प्रभाव, H = I²Rt)।', 'ಹೆಚ್ಚು ರೋಧ ಮತ್ತು ದ್ರವನ ಬಿಂದುವಿರುವ ಟಂಗ್‌ಸ್ಟನ್‌ನ ತೆಳು ಸುರುಳಿ. ವಿದ್ಯುತ್ ಇದನ್ನು ಹೊಳೆಯುವಷ್ಟು ಬಿಸಿ ಮಾಡುತ್ತದೆ (ವಿದ್ಯುತ್ತಿನ ಉಷ್ಣ ಪರಿಣಾಮ, H = I²Rt).'),
    },
    { id: 'bulb_base', group: 'load', color: '#b8bec6', minor: true, explode: [0, 1, 0.3], name: t('Bulb holder', 'बल्ब होल्डर', 'ಬಲ್ಬ್ ಹೋಲ್ಡರ್'), info: t('Connects the filament to the circuit.', 'तंतु को परिपथ से जोड़ता है।', 'ತಂತುವನ್ನು ಮಂಡಲಕ್ಕೆ ಜೋಡಿಸುತ್ತದೆ.') },
    {
      id: 'resistor', group: 'load', color: '#d9b77a', explode: [0.6, 0, 0.4],
      name: t('Resistor (R)', 'प्रतिरोधक (R)', 'ರೋಧಕ (R)'),
      info: t('Opposes the current. By Ohm\'s law the potential difference across it is V = IR: double the current, double the voltage. The coloured bands give its resistance.', 'धारा का विरोध करता है। ओम के नियम से इसके सिरों पर विभवांतर V = IR है: धारा दोगुनी, तो वोल्टता दोगुनी। रंगीन पट्टियाँ इसका प्रतिरोध बताती हैं।', 'ವಿದ್ಯುತ್ತನ್ನು ವಿರೋಧಿಸುತ್ತದೆ. ಓಮ್‌ನ ನಿಯಮದಂತೆ ಇದರ ಅಡ್ಡಲಾಗಿ ವಿಭವಾಂತರ V = IR: ವಿದ್ಯುತ್ ಇಮ್ಮಡಿಯಾದರೆ ವೋಲ್ಟೇಜ್ ಇಮ್ಮಡಿ. ಬಣ್ಣದ ಪಟ್ಟಿಗಳು ಇದರ ರೋಧವನ್ನು ಹೇಳುತ್ತವೆ.'),
    },
    { id: 'resistor_bands', group: 'load', color: '#7a3b2e', minor: true, explode: [0.6, 0, 0.4], name: t('Colour bands', 'रंगीन पट्टियाँ', 'ಬಣ್ಣದ ಪಟ್ಟಿಗಳು'), info: t('The colour code gives the resistance in ohms.', 'रंग कोड ओम में प्रतिरोध बताता है।', 'ಬಣ್ಣದ ಸಂಕೇತ ರೋಧವನ್ನು ಓಮ್‌ಗಳಲ್ಲಿ ಹೇಳುತ್ತದೆ.') },
    {
      id: 'wires', group: 'wiring', color: '#d08a4a', explode: [0, 0, 0],
      name: t('Connecting wires', 'संयोजक तार', 'ಸಂಪರ್ಕ ತಂತಿಗಳು'),
      info: t('Copper wires with very little resistance join everything into one closed loop. Current flows only when the loop is complete.', 'बहुत कम प्रतिरोध वाले ताँबे के तार सबको एक बंद पथ में जोड़ते हैं। धारा तभी बहती है जब पथ पूरा हो।', 'ತುಂಬಾ ಕಡಿಮೆ ರೋಧದ ತಾಮ್ರದ ತಂತಿಗಳು ಎಲ್ಲವನ್ನೂ ಒಂದು ಮುಚ್ಚಿದ ಪಥವಾಗಿ ಜೋಡಿಸುತ್ತವೆ. ಪಥ ಪೂರ್ಣವಾದಾಗ ಮಾತ್ರ ವಿದ್ಯುತ್ ಹರಿಯುತ್ತದೆ.'),
    },
    { id: 'board', group: 'wiring', color: '#6b5844', matte: true, minor: true, explode: [0, 0, -0.6], name: t('Board', 'तख़्ता', 'ಹಲಗೆ'), info: t('The circuit is set up on a wooden board.', 'परिपथ लकड़ी के तख़्ते पर बनाया गया है।', 'ಮಂಡಲವನ್ನು ಮರದ ಹಲಗೆಯ ಮೇಲೆ ಜೋಡಿಸಲಾಗಿದೆ.') },
  ],
  views: [
    { id: 'front', name: t('Front', 'सामने से', 'ಮುಂಭಾಗ'), dir: [0, 0, 1] },
    { id: 'tilted', name: t('Tilted', 'तिरछा', 'ಓರೆಯಾಗಿ'), dir: [0.5, 0.45, 1] },
  ],
  slices: [],
  animations: [
    {
      id: 'current', kind: 'flow',
      name: t('Current round the circuit', 'परिपथ में धारा', 'ಮಂಡಲದಲ್ಲಿ ವಿದ್ಯುತ್'),
      steps: [
        {
          color: '#ffe066', highlight: ['battery', 'wires'],
          text: t('Close the key and current flows from the + terminal of the battery, round the loop, back to the − terminal.', 'कुंजी लगाते ही धारा बैटरी के + टर्मिनल से, पथ में घूमकर, − टर्मिनल पर लौटती है।', 'ಕೀ ಹಾಕಿದ ಕೂಡಲೇ ವಿದ್ಯುತ್ ಬ್ಯಾಟರಿಯ + ಟರ್ಮಿನಲ್‌ನಿಂದ ಪಥದ ಸುತ್ತ ಹರಿದು − ಟರ್ಮಿನಲ್‌ಗೆ ಮರಳುತ್ತದೆ.'),
          paths: [LOOP],
        },
        {
          color: '#7fc3ff', highlight: ['wires', 'battery'],
          text: t('Electrons actually move the other way, from − to +. By convention the current\'s direction is that of positive charge.', 'इलेक्ट्रॉन वास्तव में उल्टी दिशा में, − से + की ओर चलते हैं। परिपाटी से धारा की दिशा धनावेश की दिशा मानी जाती है।', 'ಎಲೆಕ್ಟ್ರಾನ್‌ಗಳು ನಿಜವಾಗಿ ವಿರುದ್ಧ ದಿಕ್ಕಿನಲ್ಲಿ, − ನಿಂದ + ಕಡೆಗೆ ಚಲಿಸುತ್ತವೆ. ರೂಢಿಯಂತೆ ವಿದ್ಯುತ್ತಿನ ದಿಕ್ಕು ಧನಾವೇಶದ ದಿಕ್ಕು.'),
          paths: [[...LOOP].reverse()],
        },
        {
          color: '#ffe066', highlight: ['ammeter', 'ammeter_face'],
          text: t('The same current passes through every part of a series circuit, so the ammeter can go anywhere in the loop.', 'श्रेणी परिपथ के हर भाग से वही धारा गुज़रती है, इसलिए ऐमीटर पथ में कहीं भी लग सकता है।', 'ಸರಣಿ ಮಂಡಲದ ಪ್ರತಿ ಭಾಗದ ಮೂಲಕ ಅದೇ ವಿದ್ಯುತ್ ಹೋಗುತ್ತದೆ, ಹಾಗಾಗಿ ಆಮ್ಮೀಟರ್ ಪಥದಲ್ಲಿ ಎಲ್ಲಿ ಬೇಕಾದರೂ ಇರಬಹುದು.'),
          paths: [LOOP.slice(6, 10)],
        },
        {
          color: '#ffcc33', highlight: ['filament', 'bulb_glass'],
          text: t('In the filament, electrical energy becomes heat and light.', 'तंतु में विद्युत ऊर्जा ऊष्मा और प्रकाश में बदलती है।', 'ತಂತುವಿನಲ್ಲಿ ವಿದ್ಯುತ್ ಶಕ್ತಿ ಉಷ್ಣ ಮತ್ತು ಬೆಳಕಾಗುತ್ತದೆ.'),
          paths: [LOOP.slice(3, 8)],
        },
        {
          color: '#9ad0ff', highlight: ['voltmeter', 'voltmeter_face', 'resistor'],
          text: t('The voltmeter, across the resistor, compares the two ends: the potential difference V = IR.', 'प्रतिरोधक के सिरों पर लगा वोल्टमीटर दोनों सिरों की तुलना करता है: विभवांतर V = IR।', 'ರೋಧಕದ ಅಡ್ಡಲಾಗಿರುವ ವೋಲ್ಟ್‌ಮೀಟರ್ ಎರಡು ತುದಿಗಳನ್ನು ಹೋಲಿಸುತ್ತದೆ: ವಿಭವಾಂತರ V = IR.'),
          paths: [BRANCH],
        },
      ],
    },
  ],
};
