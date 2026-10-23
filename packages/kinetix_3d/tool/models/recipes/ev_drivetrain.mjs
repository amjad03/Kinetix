// An electric car's drivetrain laid out on its chassis, built in code: the
// battery pack under the floor, the inverter, the traction motor and its
// reduction gearbox with the differential on the rear axle, the onboard
// charger and charging port, the DC-DC converter and the 12 V battery, joined
// by orange high-voltage cables. "Drive" turns the wheels and the motor.
import { t, box } from '../lib/teaching.mjs';
import { rod } from '../lib/shapes.mjs';
import { pipe } from '../lib/process.mjs';

const WB = 0.27, TRACK = 0.16, WR = 0.034; // wheelbase, track, wheel radius
const wheelSpin = { axis: [1, 0, 0], speed: 180 };
const motorSpin = { axis: [1, 0, 0], speed: 540, centre: [0, 0.04, -WB / 2 + 0.03] };

function wheel(THREE, x, z) {
  const g = new THREE.CylinderGeometry(WR, WR, 0.024, 28).rotateZ(Math.PI / 2).translate(x, WR, z);
  return [g, new THREE.CylinderGeometry(WR * 0.55, WR * 0.55, 0.026, 6).rotateZ(Math.PI / 2).translate(x, WR, z)];
}

export default {
  id: 'ev_drivetrain',
  version: 1,
  order: 24,
  source: 'procedural',
  subject: 'Engineering',
  classes: [12],
  title: t('Electric car drivetrain', 'इलेक्ट्रिक कार ड्राइवट्रेन', 'ವಿದ್ಯುತ್ ಕಾರಿನ ಡ್ರೈವ್‌ಟ್ರೇನ್'),
  summary: t(
    'Battery (DC) → inverter (DC to three-phase AC) → motor → reduction gear and differential → wheels. In regenerative braking the power flows back the other way; the onboard charger fills the battery from the grid.',
    'बैटरी (DC) → इन्वर्टर (DC से त्रि-कला AC) → मोटर → रिडक्शन गियर और डिफ़रेंशियल → पहिए। पुनर्योजी ब्रेकिंग में शक्ति उल्टी दिशा में बहती है; ऑनबोर्ड चार्जर ग्रिड से बैटरी भरता है।',
    'ಬ್ಯಾಟರಿ (DC) → ಇನ್ವರ್ಟರ್ (DC ಯಿಂದ ಮೂರು-ಹಂತ AC) → ಮೋಟಾರ್ → ರಿಡಕ್ಷನ್ ಗೇರ್ ಮತ್ತು ಡಿಫರೆನ್ಷಿಯಲ್ → ಚಕ್ರಗಳು. ಪುನರುತ್ಪಾದಕ ಬ್ರೇಕಿಂಗ್‌ನಲ್ಲಿ ಶಕ್ತಿ ಹಿಮ್ಮುಖ ಹರಿಯುತ್ತದೆ; ಆನ್‌ಬೋರ್ಡ್ ಚಾರ್ಜರ್ ಗ್ರಿಡ್‌ನಿಂದ ಬ್ಯಾಟರಿ ತುಂಬುತ್ತದೆ.',
  ),
  keywords: ['ev drivetrain', 'electric vehicle', 'ev architecture', 'powertrain', 'inverter', 'traction motor', 'onboard charger', 'dc-dc converter', 'regenerative braking', 'battery pack', 'reduction gear', 'differential', 'ev technology'],
  credit: 'Model built by Zynetix (proportions simplified)',
  crease: 35,
  build(THREE) {
    const rearZ = -WB / 2, frontZ = WB / 2, x = TRACK / 2;
    return {
      chassis: [box(THREE, [0.008, 0.008, WB + 0.12], [-0.055, 0.03, 0]), box(THREE, [0.008, 0.008, WB + 0.12], [0.055, 0.03, 0]), box(THREE, [0.118, 0.006, 0.008], [0, 0.03, frontZ + 0.05]), box(THREE, [0.118, 0.006, 0.008], [0, 0.03, rearZ - 0.05])],
      battery: [box(THREE, [0.1, 0.016, 0.17], [0, 0.022, 0.0])],
      inverter: [box(THREE, [0.05, 0.022, 0.03], [0, 0.065, rearZ + 0.07])],
      motor: [rod(THREE, [-0.035, 0.04, rearZ + 0.03], [0.005, 0.04, rearZ + 0.03], 0.018, 24)],
      gearbox: [box(THREE, [0.03, 0.04, 0.045], [0.022, 0.04, rearZ + 0.012])],
      half_shafts: [rod(THREE, [0.037, WR, rearZ], [x - 0.012, WR, rearZ], 0.003, 10), rod(THREE, [0.007, WR, rearZ], [-x + 0.012, WR, rearZ], 0.003, 10)],
      wheels_rear: [...wheel(THREE, x, rearZ), ...wheel(THREE, -x, rearZ)],
      wheels_front: [...wheel(THREE, x, frontZ), ...wheel(THREE, -x, frontZ)],
      front_axle: [rod(THREE, [-x + 0.012, WR, frontZ], [x - 0.012, WR, frontZ], 0.0025, 8)],
      charger: [box(THREE, [0.035, 0.016, 0.03], [0.03, 0.065, frontZ - 0.02])],
      charge_port: [box(THREE, [0.006, 0.018, 0.018], [0.075, 0.07, frontZ - 0.07])],
      dcdc: [box(THREE, [0.025, 0.012, 0.02], [-0.03, 0.062, frontZ - 0.02])],
      aux_battery: [box(THREE, [0.022, 0.018, 0.03], [-0.03, 0.065, frontZ + 0.03])],
      hv_cables: [
        ...pipe(THREE, [[0, 0.032, -0.085], [0, 0.055, rearZ + 0.085]], 0.0025),
        ...pipe(THREE, [[0, 0.055, rearZ + 0.055], [-0.015, 0.055, rearZ + 0.04]], 0.0025),
        ...pipe(THREE, [[0.02, 0.032, 0.085], [0.03, 0.057, frontZ - 0.035]], 0.0022),
        ...pipe(THREE, [[0.072, 0.07, frontZ - 0.07], [0.047, 0.065, frontZ - 0.025]], 0.0022),
        ...pipe(THREE, [[-0.02, 0.032, 0.085], [-0.03, 0.056, frontZ - 0.03]], 0.0022),
      ],
    };
  },
  groups: [
    { id: 'power', name: t('High-voltage system', 'उच्च वोल्टेज तंत्र', 'ಅಧಿಕ ವೋಲ್ಟೇಜ್ ವ್ಯವಸ್ಥೆ') },
    { id: 'drive', name: t('Drive to the wheels', 'पहियों तक ड्राइव', 'ಚಕ್ರಗಳವರೆಗಿನ ಚಾಲನೆ') },
    { id: 'charging', name: t('Charging and 12 V', 'चार्जिंग और 12 V', 'ಚಾರ್ಜಿಂಗ್ ಮತ್ತು 12 V') },
    { id: 'body', name: t('Chassis', 'चेसिस', 'ಚಾಸಿಸ್') },
  ],
  parts: [
    {
      id: 'battery', group: 'power', color: '#2f6fd6', explode: [0, -0.8, 0],
      name: t('Battery pack (under the floor)', 'बैटरी पैक (फ़र्श के नीचे)', 'ಬ್ಯಾಟರಿ ಪ್ಯಾಕ್ (ನೆಲದ ಕೆಳಗೆ)'),
      info: t('Stores the energy (30–80 kWh) at 300–800 V DC. Low and in the middle, it keeps the car stable.', 'ऊर्जा (30–80 kWh) 300–800 V DC पर रखता है। नीचे और बीच में होने से कार स्थिर रहती है।', 'ಶಕ್ತಿಯನ್ನು (30–80 kWh) 300–800 V DC ನಲ್ಲಿ ಸಂಗ್ರಹಿಸುತ್ತದೆ. ಕೆಳಗೆ ಮಧ್ಯದಲ್ಲಿರುವುದರಿಂದ ಕಾರು ಸ್ಥಿರ.'),
    },
    {
      id: 'inverter', group: 'power', color: '#8e44ad', explode: [0, 1, 0],
      name: t('Traction inverter', 'ट्रैक्शन इन्वर्टर', 'ಎಳೆತ ಇನ್ವರ್ಟರ್'),
      info: t('IGBT or SiC switches turn the battery\'s DC into three-phase AC of the frequency and amplitude the motor needs; in braking it works backwards as a rectifier.', 'IGBT या SiC स्विच बैटरी के DC को मोटर के लिए आवश्यक आवृत्ति और आयाम के त्रि-कला AC में बदलते हैं; ब्रेकिंग में यह उल्टा दिष्टकारी बनता है।', 'IGBT ಅಥವಾ SiC ಸ್ವಿಚ್‌ಗಳು ಬ್ಯಾಟರಿಯ DC ಯನ್ನು ಮೋಟಾರ್‌ಗೆ ಬೇಕಾದ ಆವೃತ್ತಿ ಮತ್ತು ಪಾರ ಹೊಂದಿದ ಮೂರು-ಹಂತ AC ಆಗಿಸುತ್ತವೆ; ಬ್ರೇಕಿಂಗ್‌ನಲ್ಲಿ ಹಿಮ್ಮುಖ ದಿಷ್ಟಕಾರಿ.'),
    },
    {
      id: 'hv_cables', group: 'power', color: '#ff6f00', explode: [0, 0.5, 0],
      name: t('High-voltage cables', 'उच्च वोल्टेज केबल', 'ಅಧಿಕ ವೋಲ್ಟೇಜ್ ಕೇಬಲ್‌ಗಳು'),
      info: t('Orange, shielded cables between the battery, inverter, motor and charger.', 'बैटरी, इन्वर्टर, मोटर और चार्जर के बीच नारंगी, परिरक्षित केबल।', 'ಬ್ಯಾಟರಿ, ಇನ್ವರ್ಟರ್, ಮೋಟಾರ್ ಮತ್ತು ಚಾರ್ಜರ್ ನಡುವೆ ಕಿತ್ತಳೆ, ರಕ್ಷಿತ ಕೇಬಲ್‌ಗಳು.'),
    },
    {
      id: 'motor', group: 'drive', color: '#4f6170', metal: true, explode: [-0.8, 0.4, 0], spin: motorSpin,
      name: t('Traction motor', 'ट्रैक्शन मोटर', 'ಎಳೆತ ಮೋಟಾರ್'),
      info: t('A PMSM or induction motor: full torque from standstill, up to 12,000–16,000 rpm.', 'PMSM या प्रेरण मोटर: रुकी अवस्था से पूरा बलाघूर्ण, 12,000–16,000 rpm तक।', 'PMSM ಅಥವಾ ಪ್ರೇರಣ ಮೋಟಾರ್: ನಿಶ್ಚಲದಿಂದಲೇ ಪೂರ್ಣ ಟಾರ್ಕ್, 12,000–16,000 rpm ವರೆಗೆ.'),
    },
    {
      id: 'gearbox', group: 'drive', color: '#7d8a96', metal: true, explode: [0.6, 0.4, 0],
      name: t('Reduction gear and differential', 'रिडक्शन गियर और डिफ़रेंशियल', 'ರಿಡಕ್ಷನ್ ಗೇರ್ ಮತ್ತು ಡಿಫರೆನ್ಷಿಯಲ್'),
      info: t('One fixed ratio (about 9:1) – no gear changes – and a differential so the wheels can turn at different speeds on a bend.', 'एक स्थिर अनुपात (लगभग 9:1) – गियर बदलना नहीं – और डिफ़रेंशियल ताकि मोड़ पर पहिए अलग चाल से घूम सकें।', 'ಒಂದೇ ಸ್ಥಿರ ಅನುಪಾತ (ಸುಮಾರು 9:1) – ಗೇರ್ ಬದಲಾವಣೆ ಇಲ್ಲ – ಮತ್ತು ತಿರುವಿನಲ್ಲಿ ಚಕ್ರಗಳು ಬೇರೆ ವೇಗದಲ್ಲಿ ತಿರುಗಲು ಡಿಫರೆನ್ಷಿಯಲ್.'),
    },
    {
      id: 'half_shafts', group: 'drive', color: '#b8bec4', metal: true, minor: true, explode: [0, 0, -0.4],
      name: t('Half shafts', 'हाफ़ शाफ़्ट', 'ಅರ್ಧ ಶಾಫ್ಟ್‌ಗಳು'),
      info: t('Carry the torque from the differential to each driven wheel.', 'डिफ़रेंशियल से हर चालित पहिए तक बलाघूर्ण ले जाते हैं।', 'ಡಿಫರೆನ್ಷಿಯಲ್‌ನಿಂದ ಪ್ರತಿ ಚಾಲಿತ ಚಕ್ರಕ್ಕೆ ಟಾರ್ಕ್ ಒಯ್ಯುತ್ತವೆ.'),
    },
    {
      id: 'wheels_rear', group: 'drive', color: '#2b2b2b', matte: true, explode: [0, 0, -0.6], spin: { ...wheelSpin, centre: [0, WR, -WB / 2] },
      name: t('Driven wheels', 'चालित पहिए', 'ಚಾಲಿತ ಚಕ್ರಗಳು'),
      info: t('Tractive force F = T·G·η / r (motor torque T, gear ratio G, wheel radius r).', 'कर्षण बल F = T·G·η / r (मोटर बलाघूर्ण T, गियर अनुपात G, पहिए की त्रिज्या r)।', 'ಎಳೆತ ಬಲ F = T·G·η / r (ಮೋಟಾರ್ ಟಾರ್ಕ್ T, ಗೇರ್ ಅನುಪಾತ G, ಚಕ್ರದ ತ್ರಿಜ್ಯ r).'),
    },
    {
      id: 'wheels_front', group: 'body', color: '#2b2b2b', matte: true, explode: [0, 0, 0.6], spin: { ...wheelSpin, centre: [0, WR, WB / 2] },
      name: t('Front wheels', 'आगे के पहिए', 'ಮುಂದಿನ ಚಕ್ರಗಳು'),
      info: t('Steered; not driven in this rear-wheel-drive layout.', 'स्टीयर होते हैं; इस रियर-व्हील-ड्राइव में चालित नहीं।', 'ತಿರುಗಿಸಲಾಗುತ್ತದೆ; ಈ ಹಿಂದಿನ-ಚಕ್ರ-ಚಾಲನೆಯಲ್ಲಿ ಚಾಲಿತವಲ್ಲ.'),
    },
    {
      id: 'front_axle', group: 'body', color: '#b8bec4', metal: true, minor: true, explode: [0, 0, 0.5],
      name: t('Front axle', 'आगे का धुरा', 'ಮುಂದಿನ ಅಚ್ಚು'),
      info: t('Carries the front wheels.', 'आगे के पहियों को थामता है।', 'ಮುಂದಿನ ಚಕ್ರಗಳನ್ನು ಹೊರುತ್ತದೆ.'),
    },
    {
      id: 'charger', group: 'charging', color: '#00897b', explode: [0.4, 0.9, 0],
      name: t('Onboard charger (OBC)', 'ऑनबोर्ड चार्जर (OBC)', 'ಆನ್‌ಬೋರ್ಡ್ ಚಾರ್ಜರ್ (OBC)'),
      info: t('For AC charging: rectifier, PFC and an isolated DC-DC stage, typically 3.3–22 kW. DC fast chargers bypass it.', 'AC चार्जिंग के लिए: दिष्टकारी, PFC और पृथक DC-DC चरण, सामान्यतः 3.3–22 kW। DC फ़ास्ट चार्जर इसे बायपास करते हैं।', 'AC ಚಾರ್ಜಿಂಗ್‌ಗೆ: ದಿಷ್ಟಕಾರಿ, PFC ಮತ್ತು ಪ್ರತ್ಯೇಕ DC-DC ಹಂತ, ಸಾಮಾನ್ಯವಾಗಿ 3.3–22 kW. DC ವೇಗದ ಚಾರ್ಜರ್‌ಗಳು ಇದನ್ನು ಬೈಪಾಸ್ ಮಾಡುತ್ತವೆ.'),
    },
    {
      id: 'charge_port', group: 'charging', color: '#263238', explode: [1, 0.4, 0],
      name: t('Charging port (CCS2)', 'चार्जिंग पोर्ट (CCS2)', 'ಚಾರ್ಜಿಂಗ್ ಪೋರ್ಟ್ (CCS2)'),
      info: t('Type 2 pins for AC and two extra DC pins below for fast charging.', 'AC के लिए टाइप 2 पिन और नीचे फ़ास्ट चार्जिंग के लिए दो अतिरिक्त DC पिन।', 'AC ಗೆ ಟೈಪ್ 2 ಪಿನ್‌ಗಳು ಮತ್ತು ವೇಗದ ಚಾರ್ಜಿಂಗ್‌ಗೆ ಕೆಳಗೆ ಎರಡು ಹೆಚ್ಚುವರಿ DC ಪಿನ್‌ಗಳು.'),
    },
    {
      id: 'dcdc', group: 'charging', color: '#6d4c41', explode: [-0.4, 0.9, 0],
      name: t('DC-DC converter', 'DC-DC परिवर्तक', 'DC-DC ಪರಿವರ್ತಕ'),
      info: t('Steps the high voltage down to 12–14 V for the lights, wipers and electronics.', 'उच्च वोल्टेज को बत्तियों, वाइपर और इलेक्ट्रॉनिक्स के लिए 12–14 V तक घटाता है।', 'ದೀಪಗಳು, ವೈಪರ್ ಮತ್ತು ಎಲೆಕ್ಟ್ರಾನಿಕ್ಸ್‌ಗೆ ಅಧಿಕ ವೋಲ್ಟೇಜ್ ಅನ್ನು 12–14 V ಗೆ ಇಳಿಸುತ್ತದೆ.'),
    },
    {
      id: 'aux_battery', group: 'charging', color: '#37474f', explode: [-0.6, 0.8, 0.4],
      name: t('12 V auxiliary battery', '12 V सहायक बैटरी', '12 V ಸಹಾಯಕ ಬ್ಯಾಟರಿ'),
      info: t('Wakes up the car\'s computers before the main contactors close.', 'मुख्य कॉन्टैक्टर बंद होने से पहले कार के कंप्यूटर जगाती है।', 'ಮುಖ್ಯ ಕಾಂಟ್ಯಾಕ್ಟರ್ ಮುಚ್ಚುವ ಮೊದಲು ಕಾರಿನ ಕಂಪ್ಯೂಟರ್‌ಗಳನ್ನು ಎಚ್ಚರಿಸುತ್ತದೆ.'),
    },
    {
      id: 'chassis', group: 'body', color: '#9aa3ad', metal: true, minor: true, explode: [0, -0.4, 0],
      name: t('Chassis frame', 'चेसिस ढाँचा', 'ಚಾಸಿಸ್ ಚೌಕಟ್ಟು'),
      info: t('The frame the drivetrain is mounted on.', 'वह ढाँचा जिस पर ड्राइवट्रेन लगा है।', 'ಡ್ರೈವ್‌ಟ್ರೇನ್ ಜೋಡಿಸಿದ ಚೌಕಟ್ಟು.'),
    },
  ],
  views: [
    { id: 'front', name: t('From above, at an angle', 'ऊपर से, तिरछा', 'ಮೇಲಿನಿಂದ, ಓರೆಯಾಗಿ'), dir: [0.9, 0.9, 0.7] },
    { id: 'top', name: t('From above', 'ऊपर से', 'ಮೇಲಿನಿಂದ'), dir: [0.05, 1, 0.05] },
    { id: 'side', name: t('Side', 'बगल से', 'ಪಕ್ಕದಿಂದ'), dir: [1, 0.15, 0.05] },
  ],
  slices: [],
  animations: [{ id: 'run', kind: 'orbit', name: t('Drive', 'चलाएँ', 'ಚಲಾಯಿಸಿ') }],
};
