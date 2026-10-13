// An electric-vehicle battery pack built in code, to take apart: cylindrical
// cells grouped into four modules (each with its holders and busbars), the
// liquid cooling plate under them, the battery management system (BMS)
// board, the contactor and fuse box, the HV connector and the enclosure.
// "Take apart" shows cell → module → pack. Proportions simplified.
import { t, box } from '../lib/teaching.mjs';
import { rod } from '../lib/shapes.mjs';
import { pipe } from '../lib/process.mjs';

const CELL_R = 0.0105, CELL_H = 0.07; // a 21700 cell: 21 mm across, 70 mm long
const NX = 6, NZ = 4; // cells per module in x and z
const MOD = [[-0.085, -0.06], [0.085, -0.06], [-0.085, 0.06], [0.085, 0.06]]; // module centres (x, z)

export default {
  id: 'ev_battery_pack',
  version: 1,
  order: 22,
  source: 'procedural',
  subject: 'Engineering',
  classes: [12],
  title: t('EV battery pack', 'ईवी बैटरी पैक', 'ಇವಿ ಬ್ಯಾಟರಿ ಪ್ಯಾಕ್'),
  summary: t(
    'Cells are joined in series and parallel into modules, and modules into a pack (e.g. 96s for about 350 V). The BMS watches every cell\'s voltage and temperature, balances them and opens the contactors on a fault; a cooling plate keeps the cells at 20–40 °C.',
    'सेल श्रेणी और समांतर में जुड़कर मॉड्यूल बनाते हैं, और मॉड्यूल पैक (जैसे लगभग 350 V के लिए 96s)। BMS हर सेल का वोल्टेज और ताप देखता है, उन्हें संतुलित करता है और दोष होने पर कॉन्टैक्टर खोल देता है; शीतलन प्लेट सेलों को 20–40 °C पर रखती है।',
    'ಕೋಶಗಳು ಸರಣಿ ಮತ್ತು ಸಮಾಂತರದಲ್ಲಿ ಸೇರಿ ಮಾಡ್ಯೂಲ್, ಮಾಡ್ಯೂಲ್‌ಗಳು ಪ್ಯಾಕ್ ಆಗುತ್ತವೆ (ಉದಾ. ಸುಮಾರು 350 Vಗೆ 96s). BMS ಪ್ರತಿ ಕೋಶದ ವೋಲ್ಟೇಜ್ ಮತ್ತು ತಾಪ ಗಮನಿಸಿ, ಸಮತೋಲನಗೊಳಿಸಿ, ದೋಷವಾದಾಗ ಕಾಂಟ್ಯಾಕ್ಟರ್ ತೆರೆಯುತ್ತದೆ; ತಂಪಿನ ಫಲಕ ಕೋಶಗಳನ್ನು 20–40 °C ನಲ್ಲಿಡುತ್ತದೆ.',
  ),
  keywords: ['battery pack', 'ev battery', 'electric vehicle', 'lithium ion', 'cell', 'module', 'bms', 'battery management system', 'cell balancing', 'thermal management', 'cooling plate', 'contactor', '21700', 'ev technology'],
  credit: 'Model built by KINETIX (proportions simplified)',
  crease: 35,
  build(THREE) {
    const out = {};
    MOD.forEach(([mx, mz], m) => {
      const cells = [], tops = [];
      for (let i = 0; i < NX; i++) {
        for (let k = 0; k < NZ; k++) {
          const x = mx + (i - (NX - 1) / 2) * CELL_R * 2.15, z = mz + (k - (NZ - 1) / 2) * CELL_R * 2.15;
          cells.push(rod(THREE, [x, 0.012, z], [x, 0.012 + CELL_H, z], CELL_R, 14));
          tops.push(rod(THREE, [x, 0.012 + CELL_H, z], [x, 0.014 + CELL_H, z], CELL_R * 0.45, 10));
        }
      }
      out[`cells_${m + 1}`] = [...cells, ...tops];
      const w = NX * CELL_R * 2.15 + 0.006, d = NZ * CELL_R * 2.15 + 0.006;
      out.holders = [...(out.holders || []), box(THREE, [w, 0.008, d], [mx, 0.018, mz]), box(THREE, [w, 0.008, d], [mx, 0.012 + CELL_H - 0.006, mz])];
      out.busbars = [...(out.busbars || []), ...[0, 1, 2, 3].map((k) => box(THREE, [w - 0.01, 0.002, 0.008], [mx, 0.016 + CELL_H, mz + (k - 1.5) * CELL_R * 2.15]))];
    });
    const modTop = 0.016 + CELL_H;
    return {
      ...out,
      cooling_plate: [box(THREE, [0.36, 0.008, 0.25], [0, 0.004, 0]), ...pipe(THREE, [[-0.18, 0.004, -0.1], [-0.22, 0.004, -0.1]], 0.005), ...pipe(THREE, [[-0.18, 0.004, 0.1], [-0.22, 0.004, 0.1]], 0.005)],
      bms: [box(THREE, [0.1, 0.004, 0.06], [0, modTop + 0.03, 0]), box(THREE, [0.02, 0.006, 0.02], [-0.02, modTop + 0.035, 0.01]), box(THREE, [0.014, 0.005, 0.01], [0.025, modTop + 0.035, -0.015]), box(THREE, [0.03, 0.008, 0.008], [0.03, modTop + 0.036, 0.02])],
      sense_wires: [...pipe(THREE, [[-0.05, modTop + 0.03, 0], [-0.085, modTop + 0.002, -0.06]], 0.0012), ...pipe(THREE, [[0.05, modTop + 0.03, 0], [0.085, modTop + 0.002, -0.06]], 0.0012), ...pipe(THREE, [[-0.05, modTop + 0.03, 0.02], [-0.085, modTop + 0.002, 0.06]], 0.0012), ...pipe(THREE, [[0.05, modTop + 0.03, 0.02], [0.085, modTop + 0.002, 0.06]], 0.0012)],
      junction_box: [box(THREE, [0.05, 0.04, 0.07], [0.205, 0.04, 0]), rod(THREE, [0.215, 0.07, -0.015], [0.215, 0.08, -0.015], 0.006, 12), rod(THREE, [0.215, 0.07, 0.015], [0.215, 0.08, 0.015], 0.006, 12)],
      hv_cables: [...pipe(THREE, [[0.17, modTop, -0.06], [0.19, modTop, -0.02], [0.19, 0.06, -0.02]], 0.004), ...pipe(THREE, [[0.17, modTop, 0.06], [0.19, modTop, 0.02], [0.19, 0.06, 0.02]], 0.004), ...pipe(THREE, [[0.23, 0.04, 0], [0.27, 0.04, 0]], 0.007)],
      tray: [box(THREE, [0.48, 0.006, 0.3], [0.02, -0.006, 0]), box(THREE, [0.48, 0.1, 0.006], [0.02, 0.045, -0.15]), box(THREE, [0.48, 0.1, 0.006], [0.02, 0.045, 0.15]), box(THREE, [0.006, 0.1, 0.3], [-0.22, 0.045, 0]), box(THREE, [0.006, 0.1, 0.3], [0.26, 0.045, 0])],
      lid: [box(THREE, [0.48, 0.004, 0.3], [0.02, 0.135, 0])],
    };
  },
  groups: [
    { id: 'cells', name: t('Cells and modules', 'सेल और मॉड्यूल', 'ಕೋಶಗಳು ಮತ್ತು ಮಾಡ್ಯೂಲ್‌ಗಳು') },
    { id: 'control', name: t('BMS and power', 'BMS और पावर', 'BMS ಮತ್ತು ಶಕ್ತಿ') },
    { id: 'pack', name: t('Enclosure and cooling', 'आवरण और शीतलन', 'ಆವರಣ ಮತ್ತು ತಂಪಾಗಿಸುವಿಕೆ') },
  ],
  parts: [
    ...MOD.map(([mx, mz], m) => ({
      id: `cells_${m + 1}`, group: 'cells', color: ['#2f6fd6', '#3c7fe0', '#2a62bf', '#4a8ae6'][m], explode: [mx * 6, 0.6, mz * 6],
      name: t(`Module ${m + 1}: 24 cells`, `मॉड्यूल ${m + 1}: 24 सेल`, `ಮಾಡ್ಯೂಲ್ ${m + 1}: 24 ಕೋಶಗಳು`),
      info: t('Cylindrical lithium-ion cells (21700, about 3.6 V and 5 Ah each). Cells in parallel add capacity; groups in series add voltage.', 'बेलनाकार लिथियम-आयन सेल (21700, प्रत्येक लगभग 3.6 V और 5 Ah)। समांतर सेल क्षमता जोड़ते हैं; श्रेणी में समूह वोल्टेज जोड़ते हैं।', 'ಸಿಲಿಂಡರ್ ಲಿಥಿಯಂ-ಅಯಾನ್ ಕೋಶಗಳು (21700, ಪ್ರತಿಯೊಂದೂ ಸುಮಾರು 3.6 V ಮತ್ತು 5 Ah). ಸಮಾಂತರ ಕೋಶಗಳು ಸಾಮರ್ಥ್ಯ, ಸರಣಿ ಗುಂಪುಗಳು ವೋಲ್ಟೇಜ್ ಹೆಚ್ಚಿಸುತ್ತವೆ.'),
    })),
    {
      id: 'holders', group: 'cells', color: '#3c3f44', matte: true, explode: [0, 0.9, 0],
      name: t('Cell holders', 'सेल होल्डर', 'ಕೋಶ ಹಿಡಿಕೆಗಳು'),
      info: t('Plastic frames that space the cells and hold them against vibration.', 'प्लास्टिक ढाँचे जो सेलों के बीच दूरी रखते हैं और कंपन से बचाते हैं।', 'ಕೋಶಗಳ ನಡುವೆ ಅಂತರ ಇಟ್ಟು ಕಂಪನದಿಂದ ಹಿಡಿಯುವ ಪ್ಲಾಸ್ಟಿಕ್ ಚೌಕಟ್ಟುಗಳು.'),
    },
    {
      id: 'busbars', group: 'cells', color: '#c8783a', metal: true, explode: [0, 1.4, 0],
      name: t('Busbars', 'बसबार', 'ಬಸ್‌ಬಾರ್‌ಗಳು'),
      info: t('Copper or nickel strips welded to the cell ends that join them in parallel and series.', 'सेल के सिरों पर वेल्ड की गई ताँबे या निकल की पट्टियाँ जो उन्हें समांतर और श्रेणी में जोड़ती हैं।', 'ಕೋಶದ ತುದಿಗಳಿಗೆ ವೆಲ್ಡ್ ಮಾಡಿದ ತಾಮ್ರ ಅಥವಾ ನಿಕ್ಕಲ್ ಪಟ್ಟಿಗಳು; ಸಮಾಂತರ ಮತ್ತು ಸರಣಿಯಲ್ಲಿ ಜೋಡಿಸುತ್ತವೆ.'),
    },
    {
      id: 'bms', group: 'control', color: '#2e7d32', explode: [0, 2.2, 0],
      name: t('Battery management system (BMS)', 'बैटरी प्रबंधन प्रणाली (BMS)', 'ಬ್ಯಾಟರಿ ನಿರ್ವಹಣಾ ವ್ಯವಸ್ಥೆ (BMS)'),
      info: t('Measures each cell group\'s voltage and temperature, estimates state of charge (SOC) and health (SOH), balances the cells and talks to the vehicle over CAN.', 'हर सेल समूह का वोल्टेज और ताप मापता है, आवेश अवस्था (SOC) और स्वास्थ्य (SOH) का अनुमान लगाता है, सेलों को संतुलित करता है और CAN पर वाहन से बात करता है।', 'ಪ್ರತಿ ಕೋಶ ಗುಂಪಿನ ವೋಲ್ಟೇಜ್ ಮತ್ತು ತಾಪ ಅಳೆದು, ಚಾರ್ಜ್ ಸ್ಥಿತಿ (SOC) ಮತ್ತು ಆರೋಗ್ಯ (SOH) ಅಂದಾಜಿಸಿ, ಕೋಶಗಳನ್ನು ಸಮತೋಲನಗೊಳಿಸಿ CAN ಮೂಲಕ ವಾಹನದೊಂದಿಗೆ ಮಾತನಾಡುತ್ತದೆ.'),
    },
    {
      id: 'sense_wires', group: 'control', color: '#f9a825', minor: true, explode: [0, 1.8, 0],
      name: t('Voltage and temperature sense wires', 'वोल्टेज और ताप संवेदी तार', 'ವೋಲ್ಟೇಜ್ ಮತ್ತು ತಾಪ ಸಂವೇದಿ ತಂತಿಗಳು'),
      info: t('Thin wires from every series group and thermistor to the BMS.', 'हर श्रेणी समूह और थर्मिस्टर से BMS तक पतले तार।', 'ಪ್ರತಿ ಸರಣಿ ಗುಂಪು ಮತ್ತು ಥರ್ಮಿಸ್ಟರ್‌ನಿಂದ BMS ಗೆ ತೆಳು ತಂತಿಗಳು.'),
    },
    {
      id: 'junction_box', group: 'control', color: '#ef6c00', explode: [1, 0.5, 0],
      name: t('Contactors, fuse and HV connector', 'कॉन्टैक्टर, फ़्यूज़ और HV कनेक्टर', 'ಕಾಂಟ್ಯಾಕ್ಟರ್, ಫ್ಯೂಸ್ ಮತ್ತು HV ಕನೆಕ್ಟರ್'),
      info: t('The BMS closes the main contactors (after pre-charging the inverter\'s capacitor) and opens them on a fault; the fuse protects against short circuits.', 'BMS मुख्य कॉन्टैक्टर बंद करता है (इन्वर्टर के संधारित्र को प्री-चार्ज करने के बाद) और दोष पर खोलता है; फ़्यूज़ लघु परिपथ से बचाता है।', 'BMS ಮುಖ್ಯ ಕಾಂಟ್ಯಾಕ್ಟರ್ ಮುಚ್ಚುತ್ತದೆ (ಇನ್ವರ್ಟರ್ ಸಂಧಾರಿತ್ರ ಪ್ರೀ-ಚಾರ್ಜ್ ನಂತರ), ದೋಷದಲ್ಲಿ ತೆರೆಯುತ್ತದೆ; ಫ್ಯೂಸ್ ಶಾರ್ಟ್ ಸರ್ಕ್ಯೂಟ್‌ನಿಂದ ರಕ್ಷಿಸುತ್ತದೆ.'),
    },
    {
      id: 'hv_cables', group: 'control', color: '#ff6f00', explode: [0.8, 0.8, 0],
      name: t('High-voltage cables (orange)', 'उच्च वोल्टेज केबल (नारंगी)', 'ಅಧಿಕ ವೋಲ್ಟೇಜ್ ಕೇಬಲ್‌ಗಳು (ಕಿತ್ತಳೆ)'),
      info: t('Orange by rule: they carry hundreds of volts DC to the inverter.', 'नियम से नारंगी: ये इन्वर्टर तक सैकड़ों वोल्ट DC ले जाते हैं।', 'ನಿಯಮದಂತೆ ಕಿತ್ತಳೆ: ಇನ್ವರ್ಟರ್‌ಗೆ ನೂರಾರು ವೋಲ್ಟ್ DC ಒಯ್ಯುತ್ತವೆ.'),
    },
    {
      id: 'cooling_plate', group: 'pack', color: '#7fb3d5', metal: true, explode: [0, -0.6, 0],
      name: t('Liquid cooling plate', 'द्रव शीतलन प्लेट', 'ದ್ರವ ತಂಪಿನ ಫಲಕ'),
      info: t('Glycol-water flows through channels under the cells, carrying away heat in fast charging and heating the cells in winter.', 'ग्लाइकॉल-पानी सेलों के नीचे चैनलों में बहता है, तेज़ चार्जिंग में ऊष्मा हटाता है और सर्दी में सेलों को गर्म करता है।', 'ಗ್ಲೈಕಾಲ್-ನೀರು ಕೋಶಗಳ ಕೆಳಗಿನ ಕಾಲುವೆಗಳಲ್ಲಿ ಹರಿದು ವೇಗದ ಚಾರ್ಜಿಂಗ್‌ನಲ್ಲಿ ಶಾಖ ತೆಗೆಯುತ್ತದೆ, ಚಳಿಯಲ್ಲಿ ಕೋಶಗಳನ್ನು ಬಿಸಿಮಾಡುತ್ತದೆ.'),
    },
    {
      id: 'tray', group: 'pack', color: '#5b6670', metal: true, explode: [0, -1.2, 0],
      name: t('Pack tray', 'पैक ट्रे', 'ಪ್ಯಾಕ್ ಟ್ರೇ'),
      info: t('A strong sealed box (IP67) that protects the cells from a crash, water and dust.', 'एक मज़बूत सीलबंद डिब्बा (IP67) जो सेलों को टक्कर, पानी और धूल से बचाता है।', 'ಡಿಕ್ಕಿ, ನೀರು ಮತ್ತು ಧೂಳಿನಿಂದ ಕೋಶಗಳನ್ನು ರಕ್ಷಿಸುವ ಬಲವಾದ ಮೊಹರು ಪೆಟ್ಟಿಗೆ (IP67).'),
    },
    {
      id: 'lid', group: 'pack', color: '#8b949e', metal: true, opacity: 0.35, explode: [0, 3, 0],
      name: t('Lid', 'ढक्कन', 'ಮುಚ್ಚಳ'),
      info: t('Bolted and sealed on top; see-through here to show the inside.', 'ऊपर बोल्ट और सील किया जाता है; अंदर दिखाने के लिए यहाँ पारदर्शी है।', 'ಮೇಲೆ ಬೋಲ್ಟ್ ಮತ್ತು ಮೊಹರು ಮಾಡಲಾಗುತ್ತದೆ; ಒಳಭಾಗ ತೋರಿಸಲು ಇಲ್ಲಿ ಪಾರದರ್ಶಕ.'),
    },
  ],
  views: [
    { id: 'front', name: t('Front', 'सामने से', 'ಮುಂಭಾಗ'), dir: [0.6, 0.9, 1] },
    { id: 'top', name: t('From above', 'ऊपर से', 'ಮೇಲಿನಿಂದ'), dir: [0.05, 1, 0.2] },
  ],
  slices: [
    { id: 'half', name: t('Cut through the modules', 'मॉड्यूलों के आर-पार काटकर', 'ಮಾಡ್ಯೂಲ್‌ಗಳ ಮೂಲಕ ಕತ್ತರಿಸಿ'), normal: [0, 0, -1], offset: 0, view: 'front' },
  ],
  animations: [],
};
