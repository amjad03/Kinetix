// The Taj Mahal, Agra (1632-1653), drawn by ZYNETIX from its published
// measurements: the marble plinth, the mausoleum with its great arched
// portals (iwans) and cut corners, the onion dome on its drum, four
// chhatris, four minarets and the long water channel of the garden. A
// simplified model: the carving and inlay are left out.
import { rod } from '../lib/shapes.mjs';
import { archPanel, archPoints, onFace, onionDome, finial, chhatri } from '../lib/architecture.mjs';

const t = (en, hi, kn) => ({ en, hi, kn });

const PLINTH = 7; // the marble platform's height
const HALF = 28.5; // half the mausoleum's width
const CUT = 8.5; // the cut corners
const ROOF = PLINTH + 30;

export default {
  id: 'taj_mahal',
  version: 1,
  order: 1,
  source: 'procedural',
  subject: 'History',
  classes: [7, 8, 12],
  title: t('Taj Mahal, Agra', 'ताजमहल, आगरा', 'ತಾಜ್ ಮಹಲ್, ಆಗ್ರಾ'),
  summary: t(
    'The white marble tomb that Mughal emperor Shah Jahan built for Mumtaz Mahal (1632-1653). A simplified model at true proportions: 73 m to the top of the dome, minarets 40 m.',
    'मुग़ल बादशाह शाहजहाँ द्वारा मुमताज़ महल के लिए बनवाया गया सफ़ेद संगमरमर का मक़बरा (1632-1653)। सही अनुपात में सरल मॉडल: गुंबद के शिखर तक 73 मी, मीनारें 40 मी।',
    'ಮೊಘಲ್ ಚಕ್ರವರ್ತಿ ಷಹಜಹಾನ್ ಮುಮ್ತಾಜ್ ಮಹಲ್‌ಗಾಗಿ ನಿರ್ಮಿಸಿದ ಬಿಳಿ ಅಮೃತಶಿಲೆಯ ಸಮಾಧಿ (1632-1653). ನಿಜ ಅನುಪಾತದ ಸರಳ ಮಾದರಿ: ಗುಮ್ಮಟದ ತುದಿಗೆ 73 ಮೀ, ಮಿನಾರುಗಳು 40 ಮೀ.',
  ),
  keywords: ['taj mahal', 'mughal', 'shah jahan', 'mumtaz mahal', 'monument', 'architecture', 'agra', 'tomb', 'marble', 'world heritage', 'rulers and buildings', 'mughal empire', 'dome', 'minaret'],
  credit: 'Simplified model drawn by ZYNETIX from published measurements',
  size: 0.6,
  crease: 35,
  matte: true,
  build(THREE) {
    const mausoleum = [];
    // The core: a square with cut corners, extruded upwards.
    const core = new THREE.Shape();
    const c = [[-HALF + CUT, -HALF], [HALF - CUT, -HALF], [HALF, -HALF + CUT], [HALF, HALF - CUT], [HALF - CUT, HALF], [-HALF + CUT, HALF], [-HALF, HALF - CUT], [-HALF, -HALF + CUT]];
    core.moveTo(...c[0]);
    for (const p of c.slice(1)) core.lineTo(...p);
    // The walls behind the arches are a shade darker, so the recesses read as deep.
    const walls = [new THREE.ExtrudeGeometry(core, { depth: ROOF - PLINTH, bevelEnabled: false }).rotateX(-Math.PI / 2).translate(0, PLINTH, 0)];
    // A cornice round the roof.
    const rim = new THREE.Shape();
    const k = 0.6;
    rim.moveTo(-HALF + CUT, -HALF - k);
    for (const [x, y] of [[HALF - CUT, -HALF - k], [HALF + k, -HALF + CUT], [HALF + k, HALF - CUT], [HALF - CUT, HALF + k], [-HALF + CUT, HALF + k], [-HALF - k, HALF - CUT], [-HALF - k, -HALF + CUT]]) rim.lineTo(x, y);
    mausoleum.push(new THREE.ExtrudeGeometry(rim, { depth: 1.2, bevelEnabled: false }).rotateX(-Math.PI / 2).translate(0, ROOF - 1.2, 0));
    // The four faces: a tall central portal (pishtaq) with a deep pointed arch,
    // and two storeys of smaller arches either side; two storeys on each cut corner.
    const pinnacles = [];
    for (let f = 0; f < 4; f++) {
      const a = (f * Math.PI) / 2;
      mausoleum.push(onFace(archPanel(THREE, 22, ROOF - PLINTH + 3.5, 2.2, [archPoints(13, 15, 0, 1.5)]), a, HALF, PLINTH));
      for (const side of [-15.5, 15.5]) {
        mausoleum.push(onFace(archPanel(THREE, 9, ROOF - PLINTH, 1.2, [archPoints(5.6, 5.5, 0, 1.4), archPoints(5.6, 5.5, 0, 15.2)]), a, HALF, PLINTH, side));
      }
      // Slender pinnacles (guldastas) at the portal's corners.
      for (const side of [-11.3, 11.3]) {
        pinnacles.push(onFace(rod(THREE, [0, 0, 0], [0, 9.5, 0], 0.45, 12), a, HALF + 1.6, ROOF - 2.5, side));
        pinnacles.push(onFace(finial(THREE, 2.2, 9.5, 0.4), a, HALF + 1.6, ROOF - 2.5, side));
      }
      const cutAngle = a + Math.PI / 4;
      const cutDist = ((HALF + HALF - CUT) / 2) * Math.SQRT2;
      mausoleum.push(onFace(archPanel(THREE, CUT * Math.SQRT2 - 0.4, ROOF - PLINTH, 1.0, [archPoints(6, 5.5, 0, 1.4), archPoints(6, 5.5, 0, 15.2)]), cutAngle, cutDist, PLINTH));
    }
    // Drum, dome and finial.
    const drum = [new THREE.CylinderGeometry(14, 14.6, 7.5, 64).translate(0, ROOF + 3.75, 0), new THREE.CylinderGeometry(15.2, 15.2, 0.9, 64).translate(0, ROOF + 0.45, 0)];
    const dome = onionDome(THREE, 14.2, 15.8, 25, ROOF + 7.5, 96);
    const top = finial(THREE, 10.5, ROOF + 31.8, 1.3);
    // Four chhatris on the roof round the dome.
    const kiosks = [];
    for (const [x, z] of [[-17, -17], [17, -17], [17, 17], [-17, 17]]) kiosks.push(new THREE.CylinderGeometry(4.8, 4.8, 1.2, 8).translate(x, ROOF + 0.6, z), ...chhatri(THREE, [x, ROOF + 1.2, z], 3.6, 5.2));
    // The plinth, and the red sandstone terrace below it.
    const plinth = [new THREE.BoxGeometry(95, PLINTH, 95).translate(0, PLINTH / 2, 0)];
    for (let i = -6; i <= 6; i++) {
      // Blind arches round the plinth's sides.
      for (let f = 0; f < 4; f++) plinth.push(onFace(archPanel(THREE, 6.6, PLINTH - 1.2, 0.35, [archPoints(4, 2.1, 0, 0.8)]), (f * Math.PI) / 2, 47.5, 0.4, i * 7));
    }
    const terrace = new THREE.BoxGeometry(112, 1.2, 104).translate(0, -0.6, 4);
    // Minarets at the plinth's corners: three balconies and a chhatri.
    const minarets = [];
    for (const [x, z] of [[-41, -41], [41, -41], [41, 41], [-41, 41]]) {
      minarets.push(new THREE.CylinderGeometry(3.5, 4.2, 2, 8).translate(x, PLINTH + 1, z));
      minarets.push(new THREE.CylinderGeometry(2.55, 3.25, 36, 32).translate(x, PLINTH + 2 + 18, z));
      for (const h of [12, 23.5, 34]) {
        minarets.push(new THREE.CylinderGeometry(4.0, 3.2, 1.0, 32).translate(x, PLINTH + 2 + h, z));
        minarets.push(new THREE.TorusGeometry(3.9, 0.18, 6, 32).rotateX(Math.PI / 2).translate(x, PLINTH + 2 + h + 1.0, z));
      }
      minarets.push(...chhatri(THREE, [x, PLINTH + 38, z], 2.5, 3.6));
    }
    // The garden: the water channel and lawns in front (south).
    const pool = new THREE.BoxGeometry(6.5, 0.4, 56).translate(0, 0.05, 84);
    const edging = [new THREE.BoxGeometry(9, 0.3, 57).translate(0, -0.05, 84)];
    const lawn = [new THREE.BoxGeometry(46, 0.3, 56).translate(-29, -0.12, 84), new THREE.BoxGeometry(46, 0.3, 56).translate(29, -0.12, 84)];
    return {
      mausoleum,
      walls,
      pinnacles,
      drum,
      dome,
      finial: top,
      chhatris: kiosks,
      minarets,
      plinth,
      terrace,
      pool,
      garden: [...edging, ...lawn],
    };
  },
  groups: [
    { id: 'tomb', name: t('The tomb', 'मक़बरा', 'ಸಮಾಧಿ') },
    { id: 'setting', name: t('Plinth, minarets and garden', 'चबूतरा, मीनारें और बाग़', 'ವೇದಿಕೆ, ಮಿನಾರುಗಳು ಮತ್ತು ಉದ್ಯಾನ') },
  ],
  parts: [
    {
      id: 'dome', group: 'tomb', color: '#efeae0', explode: [0, 1.2, 0],
      name: t('Main dome (onion dome)', 'मुख्य गुंबद (प्याज़ आकार)', 'ಮುಖ್ಯ ಗುಮ್ಮಟ (ಈರುಳ್ಳಿ ಆಕಾರ)'),
      info: t('About 35 m high on its drum. It is a double dome: a lower inner dome hides the tall outer one from the hall below.', 'अपने ढोल पर लगभग 35 मी ऊँचा। यह दोहरा गुंबद है: नीचे का भीतरी गुंबद ऊँचे बाहरी गुंबद को नीचे के कक्ष से छिपाता है।', 'ತನ್ನ ಡೋಲಿನ ಮೇಲೆ ಸುಮಾರು 35 ಮೀ ಎತ್ತರ. ಇದು ಎರಡು ಪದರದ ಗುಮ್ಮಟ: ಕೆಳಗಿನ ಒಳ ಗುಮ್ಮಟ ಎತ್ತರದ ಹೊರ ಗುಮ್ಮಟವನ್ನು ಕೆಳಗಿನ ಸಭಾಂಗಣದಿಂದ ಮರೆಮಾಡುತ್ತದೆ.'),
    },
    {
      id: 'finial', group: 'tomb', color: '#d6a943', metal: true, explode: [0, 1.6, 0],
      name: t('Finial', 'कलश (शिखर)', 'ಕಳಸ'),
      info: t('A gilded finial crowned with a crescent moon, 73 m above the garden.', 'अर्धचंद्र से सुसज्जित सुनहरा कलश, बाग़ से 73 मी ऊपर।', 'ಅರ್ಧಚಂದ್ರ ಮುಕುಟದ ಚಿನ್ನಲೇಪಿತ ಕಳಸ, ಉದ್ಯಾನದಿಂದ 73 ಮೀ ಎತ್ತರ.'),
    },
    {
      id: 'drum', group: 'tomb', color: '#efebe2', minor: true, explode: [0, 0.9, 0],
      name: t('Drum', 'ढोल (आधार)', 'ಡೋಲು'),
      info: t('The round wall that lifts the dome above the roof.', 'गोल दीवार जो गुंबद को छत से ऊपर उठाती है।', 'ಗುಮ್ಮಟವನ್ನು ಛಾವಣಿಯಿಂದ ಮೇಲೆತ್ತುವ ದುಂಡನೆಯ ಗೋಡೆ.'),
    },
    {
      id: 'mausoleum', group: 'tomb', color: '#ebe5d8', explode: [0, 0.2, 0],
      name: t('Mausoleum with iwans (arched portals)', 'इवानों (मेहराबदार द्वारों) वाला मक़बरा', 'ಇವಾನ್‌ಗಳ (ಕಮಾನಿನ ದ್ವಾರಗಳ) ಸಮಾಧಿ ಕಟ್ಟಡ'),
      info: t('Each of the four sides has a huge pointed arch, about 33 m high, in a rectangular frame. The tombs of Mumtaz Mahal and Shah Jahan are in the hall inside.', 'चारों ओर हर तरफ़ आयताकार ढाँचे में लगभग 33 मी ऊँचा विशाल नुकीला मेहराब। भीतर के कक्ष में मुमताज़ महल और शाहजहाँ की क़ब्रें हैं।', 'ನಾಲ್ಕೂ ಬದಿಗಳಲ್ಲಿ ಆಯತಾಕಾರದ ಚೌಕಟ್ಟಿನಲ್ಲಿ ಸುಮಾರು 33 ಮೀ ಎತ್ತರದ ದೊಡ್ಡ ಚೂಪಾದ ಕಮಾನು. ಒಳಗಿನ ಸಭಾಂಗಣದಲ್ಲಿ ಮುಮ್ತಾಜ್ ಮಹಲ್ ಮತ್ತು ಷಹಜಹಾನ್ ಸಮಾಧಿಗಳಿವೆ.'),
    },
    {
      id: 'walls', group: 'tomb', color: '#b9b09f', minor: true, explode: [0, 0.2, 0],
      name: t('Walls of the hall', 'कक्ष की दीवारें', 'ಸಭಾಂಗಣದ ಗೋಡೆಗಳು'),
      info: t('Behind the arches, marble screens (jalis) let soft light into the tomb chamber.', 'मेहराबों के पीछे संगमरमर की जालियाँ क़ब्र-कक्ष में हल्का प्रकाश आने देती हैं।', 'ಕಮಾನುಗಳ ಹಿಂದೆ ಅಮೃತಶಿಲೆಯ ಜಾಲರಿಗಳು ಸಮಾಧಿ ಕೋಣೆಗೆ ಮೃದು ಬೆಳಕನ್ನು ಬಿಡುತ್ತವೆ.'),
    },
    {
      id: 'pinnacles', group: 'tomb', color: '#ebe6db', minor: true, explode: [0, 0.6, 0],
      name: t('Pinnacles (guldastas)', 'गुलदस्ते (कंगूरे)', 'ಗುಲ್ದಸ್ತಾಗಳು (ಶಿಖರಗಳು)'),
      info: t('Slender spires that frame each great portal.', 'हर विशाल द्वार को घेरने वाले पतले शिखर।', 'ಪ್ರತಿ ದೊಡ್ಡ ದ್ವಾರವನ್ನು ಸುತ್ತುವರಿಯುವ ತೆಳು ಗೋಪುರಗಳು.'),
    },
    {
      id: 'chhatris', group: 'tomb', color: '#f0ece2', explode: [0, 0.8, 0],
      name: t('Chhatris (domed kiosks)', 'छतरियाँ (गुंबददार मंडप)', 'ಛತ್ರಿಗಳು (ಗುಮ್ಮಟದ ಮಂಟಪಗಳು)'),
      info: t('Four small domed pavilions on pillars, a feature Mughal architecture took from Rajput buildings.', 'खंभों पर चार छोटे गुंबददार मंडप, मुग़ल स्थापत्य ने यह शैली राजपूत इमारतों से ली।', 'ಕಂಬಗಳ ಮೇಲಿನ ನಾಲ್ಕು ಸಣ್ಣ ಗುಮ್ಮಟದ ಮಂಟಪಗಳು; ಮೊಘಲ್ ವಾಸ್ತುಶಿಲ್ಪ ಈ ಶೈಲಿಯನ್ನು ರಜಪೂತ ಕಟ್ಟಡಗಳಿಂದ ಪಡೆಯಿತು.'),
    },
    {
      id: 'minarets', group: 'setting', color: '#eeeae0', explode: [1, 0, 1],
      name: t('Minarets', 'मीनारें', 'ಮಿನಾರುಗಳು'),
      info: t('Four towers, 40 m tall, that lean slightly outwards so that in an earthquake they would fall away from the tomb.', 'चार 40 मी ऊँची मीनारें जो थोड़ा बाहर की ओर झुकी हैं, ताकि भूकंप में मक़बरे से दूर गिरें।', 'ನಾಲ್ಕು 40 ಮೀ ಎತ್ತರದ ಗೋಪುರಗಳು; ಭೂಕಂಪದಲ್ಲಿ ಸಮಾಧಿಯಿಂದ ದೂರ ಬೀಳುವಂತೆ ಸ್ವಲ್ಪ ಹೊರಗೆ ಬಾಗಿವೆ.'),
    },
    {
      id: 'plinth', group: 'setting', color: '#e9e3d6', explode: [0, -0.5, 0],
      name: t('Marble plinth (chabutra)', 'संगमरमर का चबूतरा', 'ಅಮೃತಶಿಲೆಯ ವೇದಿಕೆ (ಚಬೂತ್ರಾ)'),
      info: t('A raised platform about 95 m square that lifts the tomb above the garden.', 'लगभग 95 मी वर्गाकार ऊँचा चबूतरा जो मक़बरे को बाग़ से ऊपर उठाता है।', 'ಸುಮಾರು 95 ಮೀ ಚದರದ ಎತ್ತರದ ವೇದಿಕೆ; ಸಮಾಧಿಯನ್ನು ಉದ್ಯಾನದಿಂದ ಮೇಲೆತ್ತುತ್ತದೆ.'),
    },
    {
      id: 'terrace', group: 'setting', color: '#8f4632', minor: true, matte: true, explode: [0, -1, 0],
      name: t('Red sandstone terrace', 'लाल बलुआ पत्थर का चबूतरा', 'ಕೆಂಪು ಮರಳುಗಲ್ಲಿನ ಜಗಲಿ'),
      info: t('The Taj is flanked by a mosque and a guest house in red sandstone.', 'ताज के दोनों ओर लाल बलुआ पत्थर की मस्जिद और मेहमानख़ाना हैं।', 'ತಾಜ್‌ನ ಎರಡೂ ಬದಿ ಕೆಂಪು ಮರಳುಗಲ್ಲಿನ ಮಸೀದಿ ಮತ್ತು ಅತಿಥಿಗೃಹಗಳಿವೆ.'),
    },
    {
      id: 'pool', group: 'setting', color: '#2f6690', explode: [0, -1, 1],
      name: t('Water channel', 'जल नहर', 'ನೀರಿನ ಕಾಲುವೆ'),
      info: t('The long pool reflects the tomb. It divides the charbagh, a Mughal garden laid out in four parts.', 'लंबा तालाब मक़बरे का प्रतिबिंब दिखाता है। यह चारबाग़ (चार भागों वाला मुग़ल बाग़) को बाँटता है।', 'ಉದ್ದನೆಯ ಕೊಳ ಸಮಾಧಿಯನ್ನು ಪ್ರತಿಬಿಂಬಿಸುತ್ತದೆ. ಇದು ಚಾರ್‌ಬಾಗ್ (ನಾಲ್ಕು ಭಾಗದ ಮೊಘಲ್ ಉದ್ಯಾನ) ಅನ್ನು ವಿಭಜಿಸುತ್ತದೆ.'),
    },
    {
      id: 'garden', group: 'setting', color: '#41693a', minor: true, matte: true, explode: [0, -1, 1],
      name: t('Garden (charbagh)', 'बाग़ (चारबाग़)', 'ಉದ್ಯಾನ (ಚಾರ್‌ಬಾಗ್)'),
      info: t('Lawns and walks laid out on either side of the water.', 'पानी के दोनों ओर बने लॉन और रास्ते।', 'ನೀರಿನ ಎರಡೂ ಬದಿಯ ಹುಲ್ಲುಹಾಸು ಮತ್ತು ದಾರಿಗಳು.'),
    },
  ],
  views: [
    { id: 'front', name: t('From the garden', 'बाग़ से', 'ಉದ್ಯಾನದಿಂದ'), dir: [0.18, 0.28, 1] },
    { id: 'corner', name: t('From a corner', 'एक कोने से', 'ಒಂದು ಮೂಲೆಯಿಂದ'), dir: [1, 0.45, 1] },
    { id: 'above', name: t('From above', 'ऊपर से', 'ಮೇಲಿನಿಂದ'), dir: [0, 1, 0.35] },
  ],
  slices: [],
  animations: [],
};
