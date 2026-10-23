// A disc cam and a knife-edge follower built in code (base circle 30 mm,
// lift 20 mm). The cam's profile is worked out from the follower's motion:
// over half a turn the follower rises and falls (y = h sin θ), over the other
// half it dwells on the base circle. "Run" turns the camshaft and the follower
// moves exactly as the profile under its tip says.
import { rod } from '../lib/shapes.mjs';
import { loft } from '../lib/structures.mjs';

const t = (en, hi, kn) => ({ en, hi, kn });

const BASE = 0.03; // base circle radius
const LIFT = 0.02;
const WIDTH = 0.012;
const SPEED = 120; // crank degrees a second: the cam turns at half of this

/**
 * The cam's radius at angle [a] (from +x, anticlockwise). The cam turns
 * anticlockwise at half the drive's crank; with the follower straight above
 * (90°), the point under it after the cam has turned φ is at 90° - φ, so
 * r(90° - φ) = BASE + LIFT sin φ for φ in 0..180°: r(a) = BASE + LIFT cos a
 * on the right half, the base circle on the left.
 */
const radius = (a) => {
  const c = Math.cos(a);
  return BASE + (c > 0 ? LIFT * c : 0);
};

export default {
  id: 'cam_follower',
  version: 1,
  order: 3,
  source: 'procedural',
  subject: 'Engineering',
  classes: [11, 12],
  title: t('Cam and follower', 'कैम और फ़ॉलोअर', 'ಕ್ಯಾಮ್ ಮತ್ತು ಫಾಲೋವರ್'),
  summary: t(
    'A cam turns steady rotation into a chosen up-and-down motion of the follower. The follower\'s displacement at each angle is simply the cam\'s radius under its tip minus the base circle.',
    'कैम स्थिर घूर्णन को फ़ॉलोअर की चुनी हुई ऊपर-नीचे गति में बदलता है। हर कोण पर फ़ॉलोअर का विस्थापन उसकी नोक के नीचे कैम की त्रिज्या घटा आधार वृत्त है।',
    'ಕ್ಯಾಮ್ ಸ್ಥಿರ ತಿರುಗುವಿಕೆಯನ್ನು ಫಾಲೋವರ್‌ನ ಆಯ್ದ ಮೇಲೆ-ಕೆಳಗಿನ ಚಲನೆಯಾಗಿ ಬದಲಿಸುತ್ತದೆ. ಪ್ರತಿ ಕೋನದಲ್ಲಿ ಫಾಲೋವರ್ ಸ್ಥಾನಾಂತರ = ಅದರ ತುದಿಯ ಕೆಳಗಿನ ಕ್ಯಾಮ್ ತ್ರಿಜ್ಯ − ಮೂಲ ವೃತ್ತ.',
  ),
  keywords: ['cam', 'follower', 'cam and follower', 'camshaft', 'base circle', 'lift', 'dwell', 'rise', 'return', 'mechanism', 'kinematics', 'theory of machines', 'valve'],
  credit: 'Model built by Zynetix (a disc cam with a knife-edge follower)',
  crease: 35,
  build(THREE) {
    const outline = [];
    for (let i = 0; i < 144; i++) {
      const a = (2 * Math.PI * i) / 144;
      outline.push([radius(a) * Math.cos(a), radius(a) * Math.sin(a)]);
    }
    const cam = [loft(THREE, outline, [{ z: -WIDTH / 2 }, { z: WIDTH / 2 }])];
    // A keyway mark and the hub so the turning shows.
    cam.push(new THREE.CylinderGeometry(0.009, 0.009, WIDTH + 0.008, 32).rotateX(Math.PI / 2));
    cam.push(new THREE.BoxGeometry(0.004, 0.006, WIDTH + 0.0084).translate(0, 0.008, 0));
    const shaft = [rod(THREE, [0, 0, -0.06], [0, 0, 0.03], 0.006, 24)];
    // The follower: a rod with a sharp (knife) edge, its tip on the base circle at rest.
    const tip = BASE;
    const follower = [
      new THREE.ConeGeometry(0.004, 0.008, 4).rotateZ(Math.PI).translate(0, tip + 0.004, 0),
      new THREE.BoxGeometry(0.008, 0.075, 0.008).translate(0, tip + 0.008 + 0.0375, 0),
      new THREE.CylinderGeometry(0.009, 0.009, 0.003, 24).translate(0, tip + 0.06, 0),
    ];
    // The guide the follower slides in, on a bracket, and the spring that keeps it on the cam.
    const guide = [
      new THREE.BoxGeometry(0.024, 0.02, 0.02).translate(0, tip + 0.1, 0),
      new THREE.BoxGeometry(0.006, 0.17, 0.02).translate(-0.04, 0.03, -0.02),
      new THREE.BoxGeometry(0.046, 0.006, 0.02).translate(-0.02, tip + 0.1, -0.02),
      new THREE.BoxGeometry(0.12, 0.008, 0.06).translate(-0.01, -0.058, -0.02),
      new THREE.BoxGeometry(0.014, 0.05, 0.014).translate(0, -0.03, -0.045),
    ];
    const pts = [];
    for (let i = 0; i <= 160; i++) {
      const a = (i / 160) * Math.PI * 2 * 7;
      pts.push(new THREE.Vector3(0.0075 * Math.cos(a), tip + 0.062 + (0.026 * i) / 160, 0.0075 * Math.sin(a)));
    }
    const spring = [new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 280, 0.001, 6, false)];
    return { cam, camshaft: shaft, follower, spring, frame: guide };
  },
  groups: [
    { id: 'moving', name: t('Cam and follower', 'कैम और फ़ॉलोअर', 'ಕ್ಯಾಮ್ ಮತ್ತು ಫಾಲೋವರ್') },
    { id: 'frame', name: t('Frame', 'ढाँचा', 'ಚೌಕಟ್ಟು') },
  ],
  parts: [
    {
      id: 'cam', group: 'moving', color: '#d98a2b', metal: true, explode: [0, -0.4, 1],
      drive: { type: 'spin', axis: [0, 0, 1], centre: [0, 0, 0], ratio: 0.5 },
      name: t('Disc cam', 'डिस्क कैम', 'ಡಿಸ್ಕ್ ಕ್ಯಾಮ್'),
      info: t('Base circle 30 mm, lift 20 mm. Rise and return over 180°, dwell over the other 180°.', 'आधार वृत्त 30 mm, उठान 20 mm। 180° में उठान और वापसी, बाकी 180° में ठहराव (ड्वेल)।', 'ಮೂಲ ವೃತ್ತ 30 mm, ಎತ್ತರ 20 mm. 180° ನಲ್ಲಿ ಏರಿಕೆ ಮತ್ತು ಹಿಂತಿರುಗುವಿಕೆ, ಉಳಿದ 180° ನಲ್ಲಿ ನಿಲುಗಡೆ (ಡ್ವೆಲ್).'),
    },
    {
      id: 'follower', group: 'moving', color: '#4a86c5', metal: true, explode: [0, 1.2, 0.4],
      drive: { type: 'valve', axis: [0, 1, 0], lift: LIFT, open: [0, 360] },
      name: t('Knife-edge follower', 'चाकू-धार फ़ॉलोअर', 'ಚಾಕು-ಅಂಚಿನ ಫಾಲೋವರ್'),
      info: t('Its sharp tip follows the profile exactly; roller and flat-faced followers wear less and are used in engines.', 'इसकी नुकीली नोक प्रोफ़ाइल का ठीक पालन करती है; रोलर और समतल फ़ॉलोअर कम घिसते हैं और इंजनों में लगते हैं।', 'ಇದರ ಚೂಪಾದ ತುದಿ ಪ್ರೊಫೈಲ್ ಅನ್ನು ನಿಖರವಾಗಿ ಅನುಸರಿಸುತ್ತದೆ; ರೋಲರ್ ಮತ್ತು ಚಪ್ಪಟೆ ಫಾಲೋವರ್‌ಗಳು ಕಡಿಮೆ ಸವೆಯುತ್ತವೆ, ಎಂಜಿನ್‌ಗಳಲ್ಲಿ ಬಳಕೆ.'),
    },
    {
      id: 'camshaft', group: 'moving', color: '#8f99a3', metal: true, minor: true, explode: [0, -0.6, -1],
      drive: { type: 'spin', axis: [0, 0, 1], centre: [0, 0, 0], ratio: 0.5 },
      name: t('Camshaft', 'कैमशाफ़्ट', 'ಕ್ಯಾಮ್‌ಶಾಫ್ಟ್'),
      info: t('Turns at a steady speed; in a four-stroke engine it turns once for every two turns of the crankshaft.', 'स्थिर गति से घूमता है; चार-स्ट्रोक इंजन में क्रैंकशाफ़्ट के हर दो चक्करों पर एक बार घूमता है।', 'ಸ್ಥಿರ ವೇಗದಲ್ಲಿ ತಿರುಗುತ್ತದೆ; ನಾಲ್ಕು-ಸ್ಟ್ರೋಕ್ ಎಂಜಿನ್‌ನಲ್ಲಿ ಕ್ರ್ಯಾಂಕ್‌ಶಾಫ್ಟ್‌ನ ಪ್ರತಿ ಎರಡು ಸುತ್ತಿಗೆ ಒಮ್ಮೆ ತಿರುಗುತ್ತದೆ.'),
    },
    {
      id: 'spring', group: 'frame', color: '#b9c0c6', metal: true, minor: true, explode: [0, 1.6, 0.4],
      name: t('Spring', 'स्प्रिंग', 'ಸ್ಪ್ರಿಂಗ್'),
      info: t('Presses the follower onto the cam so it never jumps off.', 'फ़ॉलोअर को कैम पर दबाए रखती है ताकि वह उछलकर अलग न हो।', 'ಫಾಲೋವರ್ ಕ್ಯಾಮ್‌ನಿಂದ ಜಿಗಿಯದಂತೆ ಅದನ್ನು ಒತ್ತಿ ಹಿಡಿಯುತ್ತದೆ.'),
    },
    {
      id: 'frame', group: 'frame', color: '#2f3a44', metal: true, minor: true, explode: [0, -0.4, -1],
      name: t('Guide and frame', 'गाइड और ढाँचा', 'ಮಾರ್ಗದರ್ಶಿ ಮತ್ತು ಚೌಕಟ್ಟು'),
      info: t('The guide keeps the follower moving in a straight line through the cam\'s centre (a radial follower).', 'गाइड फ़ॉलोअर को कैम के केंद्र से होकर सीधी रेखा में चलाता है (त्रिज्य फ़ॉलोअर)।', 'ಮಾರ್ಗದರ್ಶಿ ಫಾಲೋವರ್ ಅನ್ನು ಕ್ಯಾಮ್ ಕೇಂದ್ರದ ಮೂಲಕ ನೇರ ರೇಖೆಯಲ್ಲಿ ಚಲಿಸುವಂತೆ ಇಡುತ್ತದೆ (ತ್ರಿಜ್ಯ ಫಾಲೋವರ್).'),
    },
  ],
  views: [
    { id: 'front', name: t('Front', 'सामने से', 'ಮುಂಭಾಗ'), dir: [0.15, 0.2, 1] },
    { id: 'side', name: t('Side', 'बगल से', 'ಪಕ್ಕದಿಂದ'), dir: [1, 0.3, 0.5] },
  ],
  slices: [],
  animations: [{ id: 'run', kind: 'orbit', speed: SPEED, name: t('Turn the cam', 'कैम घुमाएँ', 'ಕ್ಯಾಮ್ ತಿರುಗಿಸಿ') }],
};
