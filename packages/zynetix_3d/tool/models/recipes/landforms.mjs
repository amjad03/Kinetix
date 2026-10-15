// Four landforms from real elevation data (Terrain Tiles on AWS: SRTM and
// GMTED2010 heights, public domain), each cut out as a block like a lab
// relief model: a mountain massif (Kangchenjunga), a deep river valley (the
// Kali Gandaki gorge), a plateau edge (the Meghalaya plateau above the
// Bangladesh plains) and a delta (the Ganga-Brahmaputra delta, draped with a NASA MODIS
// satellite picture). Heights are raised where the land is flat.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { heightGrid, block } from '../lib/terrain.mjs';

const t = (en, hi, kn) => ({ en, hi, kn });

const LANDFORMS = {
  mountain: { box: [27.36, 88.05, 27.76, 88.5], zoom: 11, exaggeration: 1.15, snowline: 5000 },
  valley: { box: [28.48, 83.45, 28.8, 83.82], zoom: 11, exaggeration: 1.2, snowline: 5000 },
  // The Meghalaya (Shillong) plateau ends in a cliff above the Bangladesh plains.
  plateau: {
    box: [25.06, 91.55, 25.45, 92.05], zoom: 11, exaggeration: 2, snowline: 9000,
    ramp: [[-1e9, [0.2, 0.4, 0.5]], [0, [0.44, 0.55, 0.3]], [80, [0.4, 0.53, 0.27]], [300, [0.24, 0.42, 0.2]], [900, [0.32, 0.45, 0.22]], [1300, [0.55, 0.55, 0.32]], [1800, [0.6, 0.52, 0.36]]],
  },
  delta: { box: [21.5, 88.2, 23.2, 90.6], zoom: 8, exaggeration: 60, snowline: 9000, picture: 'delta' },
};

export default {
  id: 'landforms',
  version: 1,
  order: 3,
  source: 'terrain',
  subject: 'Geography',
  classes: [5, 6, 7, 9],
  title: t('Landforms', 'भू-आकृतियाँ', 'ಭೂರೂಪಗಳು'),
  summary: t(
    'Real places made from satellite height measurements: a mountain, a valley, a plateau and a delta. Turn each one and compare how the land rises and falls.',
    'उपग्रह से मापी गई ऊँचाइयों से बने असली स्थान: एक पर्वत, एक घाटी, एक पठार और एक डेल्टा। हर एक को घुमाकर देखिए कि भूमि कैसे उठती और गिरती है।',
    'ಉಪಗ್ರಹ ಎತ್ತರ ಮಾಪನಗಳಿಂದ ಮಾಡಿದ ನೈಜ ಸ್ಥಳಗಳು: ಒಂದು ಪರ್ವತ, ಒಂದು ಕಣಿವೆ, ಒಂದು ಪ್ರಸ್ಥಭೂಮಿ ಮತ್ತು ಒಂದು ಮುಖಜಭೂಮಿ. ಪ್ರತಿಯೊಂದನ್ನೂ ತಿರುಗಿಸಿ ಭೂಮಿ ಹೇಗೆ ಏರಿಳಿಯುತ್ತದೆ ಹೋಲಿಸಿ.',
  ),
  keywords: ['landform', 'landforms', 'mountain', 'valley', 'plateau', 'delta', 'river', 'relief', 'physical features', 'himalaya', 'deccan plateau', 'meghalaya', 'cherrapunji', 'sundarbans', 'major landforms of the earth', 'physical features of india', 'contour'],
  credit: 'Heights: Terrain Tiles on AWS (SRTM, GMTED2010; NASA/USGS, public domain); delta picture: NASA Worldview/GIBS, MODIS Aqua (public domain); model by ZYNETIX',
  sources: {
    delta: {
      file: 'landforms/delta_modis_aqua_2020-01-15.jpg',
      url: 'https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0&LAYERS=MODIS_Aqua_CorrectedReflectance_TrueColor&STYLES=&CRS=EPSG:4326&BBOX=21.5,88.2,23.2,90.6&WIDTH=1280&HEIGHT=980&FORMAT=image/jpeg&TIME=2020-01-15',
    },
  },
  maxTexture: 1024,
  variants: [
    { id: 'mountain', name: t('Mountain', 'पर्वत', 'ಪರ್ವತ') },
    { id: 'valley', name: t('Valley', 'घाटी', 'ಕಣಿವೆ') },
    { id: 'plateau', name: t('Plateau', 'पठार', 'ಪ್ರಸ್ಥಭೂಮಿ') },
    { id: 'delta', name: t('Delta', 'डेल्टा', 'ಮುಖಜಭೂಮಿ') },
  ],
  thumb: 'mountain',
  async import(k) {
    const dir = join(process.env.SOURCES || new URL('../sources', import.meta.url).pathname, 'landforms/tiles');
    const out = {};
    for (const [id, f] of Object.entries(LANDFORMS)) {
      const grid = await heightGrid(dir, f.box, f.zoom, 200);
      const { top, sides } = block(grid, { exaggeration: f.exaggeration, snowline: f.snowline, ramp: f.ramp, base: 0.035 });
      const matte = { color: [1, 1, 1, 1], roughness: 0.92, metalness: 0, doubleSided: false, alpha: 'OPAQUE' };
      if (f.picture) {
        out[id] = { ...top, colors: undefined, material: { ...matte, texture: { data: readFileSync(k.source(f.picture)), mime: 'image/jpeg' } } };
      } else {
        out[id] = { ...top, uvs: undefined, material: matte };
      }
      out[`${id}_block`] = { ...sides, material: matte };
    }
    return out;
  },
  groups: [
    { id: 'land', name: t('The land', 'भूमि', 'ಭೂಮಿ') },
    { id: 'rock', name: t('Rock below', 'नीचे की चट्टान', 'ಕೆಳಗಿನ ಬಂಡೆ') },
  ],
  parts: [
    {
      id: 'mountain', variant: 'mountain', group: 'land', color: '#8a7a5c', cap: false, explode: [0, 1, 0],
      name: t('Mountains: Kangchenjunga (8,586 m), Sikkim', 'पर्वत: कंचनजंगा (8,586 मी), सिक्किम', 'ಪರ್ವತ: ಕಾಂಚನಜುಂಗಾ (8,586 ಮೀ), ಸಿಕ್ಕಿಂ'),
      info: t(
        'India\'s highest peak, in the Himalaya, young fold mountains still rising as the Indian plate pushes into Asia. Snow lies above about 5,000 m; glaciers fill the high valleys. Box about 33 km across.',
        'भारत की सबसे ऊँची चोटी, हिमालय में; ये नवीन वलित पर्वत हैं जो भारतीय प्लेट के एशिया में धँसने से अब भी उठ रहे हैं। लगभग 5,000 मी से ऊपर बर्फ़ रहती है; ऊँची घाटियों में हिमनद हैं। खंड लगभग 33 किमी चौड़ा।',
        'ಭಾರತದ ಅತಿ ಎತ್ತರದ ಶಿಖರ, ಹಿಮಾಲಯದಲ್ಲಿ; ಭಾರತೀಯ ಫಲಕ ಏಷ್ಯಾಕ್ಕೆ ತಳ್ಳುತ್ತಿರುವುದರಿಂದ ಇನ್ನೂ ಏರುತ್ತಿರುವ ನವೀನ ಮಡಿಕೆ ಪರ್ವತಗಳು. ಸುಮಾರು 5,000 ಮೀ ಮೇಲೆ ಹಿಮ; ಎತ್ತರದ ಕಣಿವೆಗಳಲ್ಲಿ ಹಿಮನದಿಗಳು. ಭಾಗ ಸುಮಾರು 33 ಕಿಮೀ ಅಗಲ.',
      ),
    },
    {
      id: 'valley', variant: 'valley', group: 'land', color: '#7d7a52', cap: false, explode: [0, 1, 0],
      name: t('Valley: the Kali Gandaki gorge, Nepal', 'घाटी: काली गंडकी महाखड्ड, नेपाल', 'ಕಣಿವೆ: ಕಾಳಿ ಗಂಡಕಿ ಕಮರಿ, ನೇಪಾಳ'),
      info: t(
        'A river has cut a deep V-shaped valley between two 8,000 m peaks, Dhaulagiri and Annapurna: one of the deepest gorges on Earth. Rivers wear the land down and carry it away.',
        'एक नदी ने दो 8,000 मी ऊँची चोटियों, धौलागिरि और अन्नपूर्णा, के बीच गहरी V-आकार की घाटी काटी है: पृथ्वी के सबसे गहरे महाखड्डों में से एक। नदियाँ भूमि को घिसकर बहा ले जाती हैं।',
        'ಒಂದು ನದಿ ಎರಡು 8,000 ಮೀ ಶಿಖರಗಳಾದ ಧೌಲಗಿರಿ ಮತ್ತು ಅನ್ನಪೂರ್ಣಗಳ ನಡುವೆ ಆಳವಾದ V-ಆಕಾರದ ಕಣಿವೆ ಕೊರೆದಿದೆ: ಭೂಮಿಯ ಅತಿ ಆಳದ ಕಮರಿಗಳಲ್ಲಿ ಒಂದು. ನದಿಗಳು ಭೂಮಿಯನ್ನು ಸವೆಸಿ ಕೊಂಡೊಯ್ಯುತ್ತವೆ.',
      ),
    },
    {
      id: 'plateau', variant: 'plateau', group: 'land', color: '#6f8a44', cap: false, explode: [0, 1, 0],
      name: t('Plateau: the Meghalaya plateau, Cherrapunji', 'पठार: मेघालय पठार, चेरापूंजी', 'ಪ್ರಸ್ಥಭೂಮಿ: ಮೇಘಾಲಯ ಪ್ರಸ್ಥಭೂಮಿ, ಚಿರಾಪುಂಜಿ'),
      info: t(
        'High land with a mostly flat top, about 1,400 m up, ending in a steep cliff above the low plains of Bangladesh. Rain-bearing winds rise up this wall, which makes Cherrapunji and Mawsynram among the wettest places on Earth. Heights raised 2 times.',
        'लगभग 1,400 मी ऊँची, अधिकतर समतल शीर्ष वाली भूमि, जो बांग्लादेश के निचले मैदानों के ऊपर एक खड़ी चट्टान पर समाप्त होती है। वर्षा लाने वाली हवाएँ इस दीवार पर चढ़ती हैं, इसलिए चेरापूंजी और मासिनराम पृथ्वी के सबसे अधिक वर्षा वाले स्थानों में हैं। ऊँचाइयाँ 2 गुना बढ़ाकर दिखाई गई हैं।',
        'ಸುಮಾರು 1,400 ಮೀ ಎತ್ತರದ, ಹೆಚ್ಚಾಗಿ ಸಮತಟ್ಟಾದ ಮೇಲ್ಭಾಗದ ಭೂಮಿ; ಬಾಂಗ್ಲಾದೇಶದ ತಗ್ಗು ಬಯಲುಗಳ ಮೇಲೆ ಕಡಿದಾದ ಬಂಡೆಯಲ್ಲಿ ಕೊನೆಗೊಳ್ಳುತ್ತದೆ. ಮಳೆ ತರುವ ಗಾಳಿ ಈ ಗೋಡೆಯನ್ನು ಏರುತ್ತದೆ, ಆದ್ದರಿಂದ ಚಿರಾಪುಂಜಿ ಮತ್ತು ಮೌಸಿನ್‌ರಾಮ್ ಭೂಮಿಯ ಅತಿ ಹೆಚ್ಚು ಮಳೆಯ ಸ್ಥಳಗಳಲ್ಲಿ ಸೇರಿವೆ. ಎತ್ತರಗಳನ್ನು 2 ಪಟ್ಟು ಹೆಚ್ಚಿಸಲಾಗಿದೆ.',
      ),
    },
    {
      id: 'delta', variant: 'delta', group: 'land', color: '#3f6b3a', cap: false, explode: [0, 1, 0],
      name: t('Delta: the Ganga-Brahmaputra delta (Sundarbans)', 'डेल्टा: गंगा-ब्रह्मपुत्र डेल्टा (सुंदरबन)', 'ಮುಖಜಭೂಮಿ: ಗಂಗಾ-ಬ್ರಹ್ಮಪುತ್ರ ಮುಖಜಭೂಮಿ (ಸುಂದರಬನ)'),
      info: t(
        'The world\'s largest delta: near the sea the rivers slow down, drop their silt and split into many channels. The dark green is the Sundarbans mangrove forest. About 250 km across; heights raised 60 times, as it is almost flat.',
        'विश्व का सबसे बड़ा डेल्टा: समुद्र के पास नदियाँ धीमी होकर गाद जमा करती हैं और कई धाराओं में बँट जाती हैं। गहरा हरा भाग सुंदरबन का मैंग्रोव वन है। लगभग 250 किमी चौड़ा; लगभग समतल होने से ऊँचाइयाँ 60 गुना बढ़ाकर दिखाई गई हैं।',
        'ವಿಶ್ವದ ಅತಿ ದೊಡ್ಡ ಮುಖಜಭೂಮಿ: ಸಮುದ್ರದ ಬಳಿ ನದಿಗಳು ನಿಧಾನವಾಗಿ ಹೂಳು ಬಿಟ್ಟು ಅನೇಕ ಕವಲುಗಳಾಗಿ ಒಡೆಯುತ್ತವೆ. ಗಾಢ ಹಸಿರು ಭಾಗ ಸುಂದರಬನ ಕಾಂಡ್ಲಾ ಕಾಡು. ಸುಮಾರು 250 ಕಿಮೀ ಅಗಲ; ಬಹುತೇಕ ಸಮತಟ್ಟಾಗಿರುವುದರಿಂದ ಎತ್ತರಗಳನ್ನು 60 ಪಟ್ಟು ಹೆಚ್ಚಿಸಲಾಗಿದೆ.',
      ),
    },
    ...['mountain', 'valley', 'plateau', 'delta'].map((v) => ({
      id: `${v}_block`, variant: v, group: 'rock', color: '#7a5a3c', minor: true, cap: false, explode: [0, -1, 0],
      name: t('Rock and soil below', 'नीचे की चट्टान और मिट्टी', 'ಕೆಳಗಿನ ಬಂಡೆ ಮತ್ತು ಮಣ್ಣು'),
      info: t('The block is cut out of the Earth\'s crust to show the land from the side.', 'भूमि को बगल से दिखाने के लिए यह खंड पृथ्वी की पपड़ी से काटा गया है।', 'ಭೂಮಿಯನ್ನು ಪಕ್ಕದಿಂದ ತೋರಿಸಲು ಈ ಭಾಗವನ್ನು ಭೂಮಿಯ ಹೊರಪದರದಿಂದ ಕತ್ತರಿಸಲಾಗಿದೆ.'),
    })),
  ],
  views: [
    { id: 'above', name: t('From above, at an angle', 'ऊपर से, तिरछा', 'ಮೇಲಿನಿಂದ, ಓರೆಯಾಗಿ'), dir: [0.35, 0.75, 1] },
    { id: 'low', name: t('Low, from the side', 'नीचे से, बगल से', 'ತಗ್ಗಿನಿಂದ, ಪಕ್ಕದಿಂದ'), dir: [0.6, 0.3, 1] },
    { id: 'top', name: t('Straight down (like a map)', 'सीधे ऊपर से (नक्शे जैसा)', 'ನೇರವಾಗಿ ಮೇಲಿನಿಂದ (ನಕ್ಷೆಯಂತೆ)'), dir: [0, 1, 0.02] },
  ],
  slices: [],
  animations: [],
};
