// The Sun Temple at Konark, Odisha (about 1250, King Narasimhadeva I), drawn
// by ZYNETIX from its published measurements: the temple was built as the
// chariot of the Sun god, with 24 carved stone wheels (about 3 m across) on
// its platform and seven horses pulling it. The assembly hall (jagamohana)
// still stands with its stepped pyramid roof; the great tower behind it fell
// long ago. A simplified model: the carvings are left out.
import { rod } from '../lib/shapes.mjs';
import { spokedWheel, pidhaRoof } from '../lib/architecture.mjs';

const t = (en, hi, kn) => ({ en, hi, kn });

const DECK = 4.4; // the platform's top
const HALL = { z: 9, w: 24 }; // the jagamohana's centre and width
const WHEEL_R = 1.5;

/** A horse in mid-stride facing +z (a simplified carved figure), standing at [x, z]. */
function horse(THREE, x, z) {
  const body = new THREE.SphereGeometry(1, 20, 14).scale(0.55, 0.62, 1.25).translate(x, 2.0, z);
  const chest = new THREE.SphereGeometry(1, 16, 12).scale(0.5, 0.6, 0.55).translate(x, 2.1, z + 0.9);
  const neck = rod(THREE, [x, 2.3, z + 1.0], [x, 3.25, z + 1.65], 0.3, 12);
  const head = new THREE.SphereGeometry(1, 14, 10).scale(0.26, 0.28, 0.6).rotateX(0.7).translate(x, 3.25, z + 2.0);
  const legs = [
    rod(THREE, [x - 0.28, 1.7, z + 0.9], [x - 0.3, 0.7, z + 1.5], 0.12, 8), rod(THREE, [x - 0.3, 0.7, z + 1.5], [x - 0.3, 0.0, z + 1.2], 0.1, 8),
    rod(THREE, [x + 0.28, 1.7, z + 0.9], [x + 0.3, 0.0, z + 0.8], 0.12, 8),
    rod(THREE, [x - 0.28, 1.7, z - 0.8], [x - 0.3, 0.0, z - 1.1], 0.13, 8),
    rod(THREE, [x + 0.28, 1.7, z - 0.8], [x + 0.32, 0.9, z - 0.4], 0.13, 8), rod(THREE, [x + 0.32, 0.9, z - 0.4], [x + 0.3, 0.0, z - 0.7], 0.1, 8),
  ];
  const tail = rod(THREE, [x, 2.2, z - 1.2], [x, 1.2, z - 1.6], 0.09, 6);
  return [body, chest, neck, head, ...legs, tail];
}

export default {
  id: 'konark',
  version: 1,
  order: 4,
  source: 'procedural',
  subject: 'History',
  classes: [6, 7, 9, 12],
  title: t('Sun Temple, Konark', 'सूर्य मंदिर, कोणार्क', 'ಸೂರ್ಯ ದೇವಾಲಯ, ಕೋನಾರ್ಕ್'),
  summary: t(
    'A 13th-century temple to Surya built as his giant stone chariot, with 24 carved wheels and seven horses. The wheels are also sundials: the shadow of the spokes tells the time. A simplified model.',
    '13वीं शताब्दी का सूर्य मंदिर जो उनके विशाल पत्थर के रथ के रूप में बना है, 24 नक्काशीदार पहियों और सात घोड़ों के साथ। पहिये धूपघड़ी भी हैं: तीलियों की छाया समय बताती है। सरल मॉडल।',
    '13ನೇ ಶತಮಾನದ ಸೂರ್ಯ ದೇವಾಲಯ, ಅವನ ದೈತ್ಯ ಕಲ್ಲಿನ ರಥದಂತೆ ನಿರ್ಮಿತ; 24 ಕೆತ್ತಿದ ಚಕ್ರಗಳು ಮತ್ತು ಏಳು ಕುದುರೆಗಳು. ಚಕ್ರಗಳು ಸೂರ್ಯಗಡಿಯಾರಗಳೂ ಹೌದು: ಕಡ್ಡಿಗಳ ನೆರಳು ಸಮಯ ತಿಳಿಸುತ್ತದೆ. ಸರಳ ಮಾದರಿ.',
  ),
  keywords: ['konark', 'sun temple', 'odisha', 'temple architecture', 'monument', 'chariot', 'sundial', 'kalinga architecture', 'eastern ganga dynasty', 'world heritage', 'konark wheel', 'temples'],
  credit: 'Simplified model drawn by ZYNETIX from published measurements',
  size: 0.6,
  crease: 30,
  matte: true,
  build(THREE) {
    // The platform, with a moulded plinth, and the steps at the front.
    const platform = [
      new THREE.BoxGeometry(32, 1.2, 62).translate(0, 0.6, -3),
      new THREE.BoxGeometry(30.5, DECK - 1.2, 60).translate(0, 1.2 + (DECK - 1.2) / 2, -3),
      new THREE.BoxGeometry(31.5, 0.6, 61).translate(0, DECK - 0.3, -3),
      new THREE.BoxGeometry(30.8, 0.4, 60.4).translate(0, 2.2, -3),
    ];
    const steps = [];
    for (let i = 0; i < 8; i++) steps.push(new THREE.BoxGeometry(9, 0.55, 1.2).translate(0, 0.275 + i * 0.55, 27.6 + (7 - i) * 0.9 - 0.4));
    // Twelve pairs of wheels along the sides.
    const wheels = [];
    for (let i = 0; i < 12; i++) {
      const z = -30 + 2 + i * 4.85;
      for (const s of [-1, 1]) wheels.push(...spokedWheel(THREE, [0, 0, 0], WHEEL_R, 8, 0.35).map((g) => g.rotateY(Math.PI / 2).translate(s * 15.6, WHEEL_R + 0.25, z)));
    }
    // The jagamohana: a square hall with doorways, under a pyramid of stepped tiers.
    const hall = [new THREE.BoxGeometry(HALL.w, 11, HALL.w).translate(0, DECK + 5.5, HALL.z)];
    const doors = [];
    for (const [a, d] of [[0, 1], [Math.PI / 2, 1], [-Math.PI / 2, 1]]) {
      doors.push(new THREE.BoxGeometry(4.2, 7.5, 0.6).translate(0, DECK + 3.75, HALL.w / 2 + 0.05 * d).rotateY(a).translate(0, 0, a === 0 ? HALL.z : HALL.z));
    }
    // Door frames stand proud of the wall.
    const frames = [];
    for (const a of [0, Math.PI / 2, -Math.PI / 2]) {
      frames.push(new THREE.BoxGeometry(6.4, 9.5, 0.9).translate(0, DECK + 4.75, HALL.w / 2).rotateY(a).translate(0, 0, HALL.z));
    }
    const roof = pidhaRoof(THREE, 0, HALL.z, HALL.w + 1.5, DECK + 11, 3, 5, 0.85, 0.955);
    const crown = [
      new THREE.CylinderGeometry(roof.width * 0.32, roof.width * 0.4, 1.2, 24).translate(0, roof.top + 0.6, HALL.z),
      new THREE.TorusGeometry(roof.width * 0.36, 0.7, 10, 32).rotateX(Math.PI / 2).translate(0, roof.top + 1.8, HALL.z),
      new THREE.CylinderGeometry(roof.width * 0.2, roof.width * 0.3, 1.2, 24).translate(0, roof.top + 2.9, HALL.z),
      new THREE.SphereGeometry(1.2, 20, 14).scale(1, 1.3, 1).translate(0, roof.top + 4.4, HALL.z),
      rod(THREE, [0, roof.top + 5.4, HALL.z], [0, roof.top + 7.2, HALL.z], 0.18, 8),
    ];
    // The ruined base of the great tower (deul) behind the hall.
    const deul = [new THREE.BoxGeometry(22, 9, 22).translate(0, DECK + 4.5, -15), new THREE.BoxGeometry(18, 2.5, 18).translate(0, DECK + 10.25, -15), new THREE.BoxGeometry(13, 1.6, 13).translate(0, DECK + 12.3, -15)];
    // Seven horses pulling the chariot.
    const horses = [];
    const xs = [-10.5, -7, -3.5, 0, 3.5, 7, 10.5];
    xs.forEach((x, i) => horses.push(...horse(THREE, x, 33.5 + (i % 2) * 1.2)));
    const ground = new THREE.BoxGeometry(70, 0.4, 90).translate(0, -0.2, 2);
    return { platform, steps, wheels, hall, doors, frames, roof: roof.pieces, crown, deul, horses, ground };
  },
  groups: [
    { id: 'chariot', name: t('The chariot', 'रथ', 'ರಥ') },
    { id: 'temple', name: t('The temple', 'मंदिर', 'ದೇವಾಲಯ') },
  ],
  parts: [
    {
      id: 'wheels', group: 'chariot', color: '#5b4c3d', explode: [0, -0.3, 0.0001],
      name: t('24 carved wheels (sundials)', '24 नक्काशीदार पहिये (धूपघड़ियाँ)', '24 ಕೆತ್ತಿದ ಚಕ್ರಗಳು (ಸೂರ್ಯಗಡಿಯಾರಗಳು)'),
      info: t('About 3 m across, each with 8 thick and 8 thin spokes. Read like a clock, the shadow of the axle on the spokes gives the time of day.', 'लगभग 3 मी चौड़े, हर एक में 8 मोटी और 8 पतली तीलियाँ। घड़ी की तरह पढ़ने पर, धुरी की छाया तीलियों पर दिन का समय बताती है।', 'ಸುಮಾರು 3 ಮೀ ಅಗಲ, ಪ್ರತಿಯೊಂದರಲ್ಲೂ 8 ದಪ್ಪ ಮತ್ತು 8 ತೆಳು ಕಡ್ಡಿಗಳು. ಗಡಿಯಾರದಂತೆ ಓದಿದರೆ, ಅಚ್ಚಿನ ನೆರಳು ಕಡ್ಡಿಗಳ ಮೇಲೆ ದಿನದ ಸಮಯ ತೋರಿಸುತ್ತದೆ.'),
    },
    {
      id: 'horses', group: 'chariot', color: '#6b5a47', explode: [0, 0, 1],
      name: t('Seven horses', 'सात घोड़े', 'ಏಳು ಕುದುರೆಗಳು'),
      info: t('They pull the Sun\'s chariot, one for each day of the week.', 'ये सूर्य का रथ खींचते हैं, सप्ताह के हर दिन के लिए एक।', 'ಇವು ಸೂರ್ಯನ ರಥವನ್ನು ಎಳೆಯುತ್ತವೆ, ವಾರದ ಪ್ರತಿ ದಿನಕ್ಕೆ ಒಂದು.'),
    },
    {
      id: 'platform', group: 'chariot', color: '#6e5e4d', explode: [0, -0.6, 0],
      name: t('Chariot platform', 'रथ का चबूतरा', 'ರಥದ ವೇದಿಕೆ'),
      info: t('The high base of the temple, covered with carvings of daily life, music, dance and animals.', 'मंदिर का ऊँचा आधार, जिस पर दैनिक जीवन, संगीत, नृत्य और पशुओं की नक्काशी है।', 'ದೇವಾಲಯದ ಎತ್ತರದ ತಳ; ದೈನಂದಿನ ಜೀವನ, ಸಂಗೀತ, ನೃತ್ಯ ಮತ್ತು ಪ್ರಾಣಿಗಳ ಕೆತ್ತನೆಗಳಿಂದ ಆವೃತ.'),
    },
    {
      id: 'steps', group: 'chariot', color: '#8a7967', minor: true, explode: [0, -0.4, 1],
      name: t('Steps', 'सीढ़ियाँ', 'ಮೆಟ್ಟಿಲುಗಳು'),
      info: t('The way up to the hall, between the horses.', 'घोड़ों के बीच से कक्ष तक जाने का रास्ता।', 'ಕುದುರೆಗಳ ನಡುವೆ ಸಭಾಂಗಣಕ್ಕೆ ಹೋಗುವ ದಾರಿ.'),
    },
    {
      id: 'hall', group: 'temple', color: '#7d6b57', explode: [0, 0.3, 0.3],
      name: t('Jagamohana (assembly hall)', 'जगमोहन (सभा मंडप)', 'ಜಗಮೋಹನ (ಸಭಾ ಮಂಟಪ)'),
      info: t('The hall that still stands, about 39 m high. It was filled with sand and sealed in 1903 to keep it from falling.', 'जो कक्ष अब भी खड़ा है, लगभग 39 मी ऊँचा। इसे गिरने से बचाने के लिए 1903 में रेत से भरकर बंद कर दिया गया।', 'ಇನ್ನೂ ನಿಂತಿರುವ ಸಭಾಂಗಣ, ಸುಮಾರು 39 ಮೀ ಎತ್ತರ. ಬೀಳದಂತೆ ತಡೆಯಲು 1903ರಲ್ಲಿ ಮರಳು ತುಂಬಿ ಮುಚ್ಚಲಾಯಿತು.'),
    },
    {
      id: 'roof', group: 'temple', color: '#786552', explode: [0, 1, 0.3],
      name: t('Pyramid roof (pidha)', 'पिरामिड छत (पीढ़ा)', 'ಪಿರಮಿಡ್ ಛಾವಣಿ (ಪೀಢ)'),
      info: t('Three tiers of horizontal stone slabs, stepping in as they rise: the Kalinga style of Odisha.', 'ऊपर जाते हुए भीतर खिसकती पत्थर की क्षैतिज पट्टियों की तीन परतें: ओडिशा की कलिंग शैली।', 'ಏರುತ್ತಾ ಒಳಸರಿಯುವ ಅಡ್ಡ ಕಲ್ಲುಪಟ್ಟಿಗಳ ಮೂರು ಸ್ತರಗಳು: ಒಡಿಶಾದ ಕಳಿಂಗ ಶೈಲಿ.'),
    },
    {
      id: 'crown', group: 'temple', color: '#7a6a57', explode: [0, 1.5, 0.3],
      name: t('Amalaka and kalasha', 'आमलक और कलश', 'ಆಮಲಕ ಮತ್ತು ಕಳಸ'),
      info: t('The ribbed stone disc and the pot-shaped finial that crown the roof.', 'छत के शिखर पर धारीदार पत्थर की चकती और कलश।', 'ಛಾವಣಿಯ ತುದಿಯ ಗೆರೆಗಳ ಕಲ್ಲಿನ ತಟ್ಟೆ ಮತ್ತು ಕಳಸ.'),
    },
    {
      id: 'frames', group: 'temple', color: '#76664f', minor: true, explode: [0, 0.3, 0.5],
      name: t('Carved doorways', 'नक्काशीदार द्वार', 'ಕೆತ್ತಿದ ದ್ವಾರಗಳು'),
      info: t('Richly carved door frames on three sides of the hall.', 'कक्ष के तीन ओर भव्य नक्काशीदार द्वार।', 'ಸಭಾಂಗಣದ ಮೂರು ಬದಿಗಳಲ್ಲಿ ಸಮೃದ್ಧ ಕೆತ್ತನೆಯ ದ್ವಾರಗಳು.'),
    },
    {
      id: 'doors', group: 'temple', color: '#3a3027', minor: true, explode: [0, 0.3, 0.6],
      name: t('Doorways (now blocked)', 'द्वार (अब बंद)', 'ದ್ವಾರಗಳು (ಈಗ ಮುಚ್ಚಿವೆ)'),
      info: t('Blocked with stone when the hall was sealed.', 'कक्ष बंद करते समय पत्थर से बंद कर दिए गए।', 'ಸಭಾಂಗಣ ಮುಚ್ಚಿದಾಗ ಕಲ್ಲಿನಿಂದ ಮುಚ್ಚಲಾಯಿತು.'),
    },
    {
      id: 'deul', group: 'temple', color: '#7c6b58', explode: [0, 0.2, -1],
      name: t('Ruins of the main tower (deul)', 'मुख्य शिखर (देउल) के अवशेष', 'ಮುಖ್ಯ ಗೋಪುರದ (ದೇಉಳ) ಅವಶೇಷಗಳು'),
      info: t('The sanctum once rose about 70 m behind the hall; it collapsed centuries ago.', 'गर्भगृह कभी कक्ष के पीछे लगभग 70 मी ऊँचा था; यह सदियों पहले गिर गया।', 'ಗರ್ಭಗೃಹ ಒಮ್ಮೆ ಸಭಾಂಗಣದ ಹಿಂದೆ ಸುಮಾರು 70 ಮೀ ಎತ್ತರವಿತ್ತು; ಶತಮಾನಗಳ ಹಿಂದೆ ಕುಸಿಯಿತು.'),
    },
    {
      id: 'ground', group: 'chariot', color: '#8a7d68', minor: true, matte: true, explode: [0, -1.5, 0],
      name: t('Temple courtyard', 'मंदिर का आँगन', 'ದೇವಾಲಯದ ಅಂಗಳ'),
      info: t('Near the sea on the coast of Odisha.', 'ओडिशा के तट पर, समुद्र के पास।', 'ಒಡಿಶಾ ಕರಾವಳಿಯಲ್ಲಿ, ಸಮುದ್ರದ ಬಳಿ.'),
    },
  ],
  views: [
    { id: 'front', name: t('The chariot, wheels and horses', 'रथ, पहिये और घोड़े', 'ರಥ, ಚಕ್ರಗಳು ಮತ್ತು ಕುದುರೆಗಳು'), dir: [1, 0.3, 0.75] },
    { id: 'side', name: t('Side (the wheels)', 'बगल से (पहिये)', 'ಪಕ್ಕದಿಂದ (ಚಕ್ರಗಳು)'), dir: [1, 0.2, 0.15] },
  ],
  slices: [],
  animations: [],
};
