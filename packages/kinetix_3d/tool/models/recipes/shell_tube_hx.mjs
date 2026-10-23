// A shell-and-tube heat exchanger (one shell pass, one tube pass) built in
// code, cut away: the shell, the tube bundle between two tube sheets,
// segmental baffles that make the shell-side fluid zig-zag across the
// tubes, the channel heads and the four nozzles. Proportions simplified.
import { t, box } from '../lib/teaching.mjs';
import { shell, plate, layX, pipe, tray } from '../lib/process.mjs';
import { rod, revolve } from '../lib/shapes.mjs';

const L = 0.3, R = 0.045; // tube length (x from -L/2 to L/2) and shell inner radius
const BAFFLES = 5;

export default {
  id: 'shell_tube_hx',
  version: 1,
  order: 20,
  source: 'procedural',
  subject: 'Engineering',
  classes: [12],
  title: t('Shell-and-tube heat exchanger', 'शेल-एंड-ट्यूब ऊष्मा विनिमायक', 'ಶೆಲ್-ಅಂಡ್-ಟ್ಯೂಬ್ ಶಾಖ ವಿನಿಮಯಕ'),
  summary: t(
    'One fluid flows inside the tubes, the other outside them in the shell, guided across the tubes by baffles. Heat passes through the tube walls: Q = U·A·ΔT_lm (the log-mean temperature difference).',
    'एक द्रव नलियों के अंदर बहता है, दूसरा शेल में उनके बाहर, बैफ़लों द्वारा नलियों के आर-पार मोड़ा जाता है। ऊष्मा नलियों की दीवारों से जाती है: Q = U·A·ΔT_lm (लघुगणकीय माध्य ताप अंतर)।',
    'ಒಂದು ದ್ರವ ಕೊಳವೆಗಳ ಒಳಗೆ, ಇನ್ನೊಂದು ಶೆಲ್‌ನಲ್ಲಿ ಅವುಗಳ ಹೊರಗೆ ಹರಿಯುತ್ತದೆ, ಬ್ಯಾಫಲ್‌ಗಳು ಅದನ್ನು ಕೊಳವೆಗಳ ಅಡ್ಡಲಾಗಿ ತಿರುಗಿಸುತ್ತವೆ. ಶಾಖ ಕೊಳವೆಯ ಗೋಡೆಗಳ ಮೂಲಕ ಸಾಗುತ್ತದೆ: Q = U·A·ΔT_lm (ಲಾಗ್-ಸರಾಸರಿ ತಾಪ ವ್ಯತ್ಯಾಸ).',
  ),
  keywords: ['heat exchanger', 'shell and tube', 'shell and tube heat exchanger', 'baffles', 'tube sheet', 'lmtd', 'heat transfer', 'counter current', 'condenser', 'chemical engineering', 'tema'],
  credit: 'Model built by Zynetix (proportions simplified)',
  crease: 35,
  build(THREE) {
    const tubes = [];
    const pitch = 0.0125;
    for (let i = -3; i <= 3; i++) {
      for (let j = -3; j <= 3; j++) {
        const y = i * pitch * 0.866, z = j * pitch + (i % 2 ? pitch / 2 : 0);
        if (Math.hypot(y, z) > R - 0.008) continue;
        tubes.push(rod(THREE, [-L / 2, y, z], [L / 2, y, z], 0.0035, 10));
      }
    }
    const baffles = [];
    for (let k = 1; k <= BAFFLES; k++) {
      const x = -L / 2 + (k * L) / (BAFFLES + 1);
      // Alternate cuts top and bottom: the shell-side fluid zig-zags.
      const b = tray(THREE, R - 0.001, 0, 0.003, 0.5, 32).rotateZ(k % 2 ? Math.PI / 2 : -Math.PI / 2);
      baffles.push(layX(b).translate(x, 0, 0));
    }
    const ends = L / 2 + 0.008;
    const r = R + 0.003;
    const bonnet = () => revolve(THREE, [[0, 0], [r, 0], [r, 0.02], [r * 0.85, 0.032], [r * 0.5, 0.039], [0, 0.041]], 48);
    return {
      shell: layX(shell(THREE, R, R + 0.003, -L / 2, L / 2, 48)),
      tube_bundle: tubes,
      tube_sheets: [layX(plate(THREE, R + 0.006, -L / 2 - 0.004, 0.008, 48)), layX(plate(THREE, R + 0.006, L / 2 + 0.004, 0.008, 48))],
      baffles,
      channel_heads: [
        layX(bonnet()).translate(ends, 0, 0),
        layX(bonnet()).rotateY(Math.PI).translate(-ends, 0, 0),
      ],
      shell_nozzles: [...pipe(THREE, [[L / 2 - 0.04, R, 0], [L / 2 - 0.04, R + 0.04, 0]], 0.009), ...pipe(THREE, [[-L / 2 + 0.04, -R, 0], [-L / 2 + 0.04, -R - 0.04, 0]], 0.009)],
      tube_nozzles: [...pipe(THREE, [[-ends - 0.04, 0, 0], [-ends - 0.075, 0, 0]], 0.009), ...pipe(THREE, [[ends + 0.04, 0, 0], [ends + 0.075, 0, 0]], 0.009)],
      saddles: [box(THREE, [0.02, 0.03, 0.08], [-L / 3, -R - 0.02, 0]), box(THREE, [0.02, 0.03, 0.08], [L / 3, -R - 0.02, 0])],
    };
  },
  groups: [
    { id: 'shell_side', name: t('Shell side', 'शेल पक्ष', 'ಶೆಲ್ ಬದಿ') },
    { id: 'tube_side', name: t('Tube side', 'ट्यूब पक्ष', 'ಕೊಳವೆ ಬದಿ') },
  ],
  parts: [
    {
      id: 'shell', group: 'shell_side', color: '#9fb3c4', metal: true, opacity: 0.6, explode: [0, 0, -1],
      name: t('Shell', 'शेल', 'ಶೆಲ್'),
      info: t('The outer pipe; the shell-side fluid (often the one that fouls less or is at lower pressure) flows here.', 'बाहरी पाइप; शेल-पक्ष का द्रव (अक्सर कम मैल जमाने वाला या कम दाब वाला) यहाँ बहता है।', 'ಹೊರಗಿನ ಕೊಳವೆ; ಶೆಲ್-ಬದಿಯ ದ್ರವ (ಸಾಮಾನ್ಯವಾಗಿ ಕಡಿಮೆ ಕೊಳೆ ಅಥವಾ ಕಡಿಮೆ ಒತ್ತಡದ್ದು) ಇಲ್ಲಿ ಹರಿಯುತ್ತದೆ.'),
    },
    {
      id: 'tube_bundle', group: 'tube_side', color: '#c8783a', metal: true, explode: [0, 0, 0],
      name: t('Tube bundle', 'ट्यूब बंडल', 'ಕೊಳವೆ ಕಟ್ಟು'),
      info: t('Many thin tubes give a large area A in a small shell. The tube-side fluid flows inside them.', 'अनेक पतली नलियाँ छोटे शेल में बड़ा क्षेत्रफल A देती हैं। ट्यूब-पक्ष का द्रव इनके अंदर बहता है।', 'ಹಲವು ತೆಳು ಕೊಳವೆಗಳು ಸಣ್ಣ ಶೆಲ್‌ನಲ್ಲಿ ದೊಡ್ಡ ವಿಸ್ತೀರ್ಣ A ನೀಡುತ್ತವೆ. ಕೊಳವೆ-ಬದಿಯ ದ್ರವ ಇವುಗಳ ಒಳಗೆ ಹರಿಯುತ್ತದೆ.'),
    },
    {
      id: 'tube_sheets', group: 'tube_side', color: '#6f7c88', metal: true, explode: [0, 0, 0.5],
      name: t('Tube sheets', 'ट्यूब शीट', 'ಕೊಳವೆ ಹಾಳೆಗಳು'),
      info: t('Thick drilled plates the tube ends are fixed into; they keep the two fluids apart.', 'मोटी छिद्रित प्लेटें जिनमें नलियों के सिरे लगे होते हैं; ये दोनों द्रवों को अलग रखती हैं।', 'ಕೊಳವೆಯ ತುದಿಗಳನ್ನು ಸಿಕ್ಕಿಸಿದ ದಪ್ಪ ರಂಧ್ರ ಫಲಕಗಳು; ಎರಡೂ ದ್ರವಗಳನ್ನು ಬೇರೆಯಾಗಿಡುತ್ತವೆ.'),
    },
    {
      id: 'baffles', group: 'shell_side', color: '#7d8a96', metal: true, explode: [0, 0.8, 0],
      name: t('Segmental baffles', 'खंडीय बैफ़ल', 'ಖಂಡ ಬ್ಯಾಫಲ್‌ಗಳು'),
      info: t('Cut plates, alternately top and bottom: the shell fluid crosses the tubes again and again, which raises the heat transfer coefficient, and the tubes are held from sagging.', 'बारी-बारी से ऊपर-नीचे कटी प्लेटें: शेल का द्रव बार-बार नलियों को पार करता है, जिससे ऊष्मा अंतरण गुणांक बढ़ता है, और नलियाँ झुकती नहीं।', 'ಪರ್ಯಾಯವಾಗಿ ಮೇಲೆ-ಕೆಳಗೆ ಕತ್ತರಿಸಿದ ಫಲಕಗಳು: ಶೆಲ್ ದ್ರವ ಮತ್ತೆ ಮತ್ತೆ ಕೊಳವೆಗಳನ್ನು ದಾಟುತ್ತದೆ, ಶಾಖ ವರ್ಗಾವಣೆ ಗುಣಾಂಕ ಹೆಚ್ಚುತ್ತದೆ, ಕೊಳವೆಗಳು ಬಾಗುವುದಿಲ್ಲ.'),
    },
    {
      id: 'channel_heads', group: 'tube_side', color: '#3d6fa8', metal: true, explode: [0, 0, 0],
      name: t('Channel heads (bonnets)', 'चैनल हेड (बोनट)', 'ಚಾನಲ್ ತಲೆಗಳು (ಬಾನೆಟ್)'),
      info: t('Collect the tube-side fluid at each end; they come off for cleaning the tubes.', 'हर सिरे पर ट्यूब-पक्ष का द्रव इकट्ठा करते हैं; नलियों की सफ़ाई के लिए खुलते हैं।', 'ಪ್ರತಿ ತುದಿಯಲ್ಲಿ ಕೊಳವೆ-ಬದಿಯ ದ್ರವ ಸಂಗ್ರಹಿಸುತ್ತವೆ; ಕೊಳವೆ ಸ್ವಚ್ಛಗೊಳಿಸಲು ತೆರೆಯುತ್ತವೆ.'),
    },
    {
      id: 'shell_nozzles', group: 'shell_side', color: '#c62828', explode: [0, 0.6, 0],
      name: t('Hot fluid in (top) and out (bottom)', 'गर्म द्रव प्रवेश (ऊपर) और निकास (नीचे)', 'ಬಿಸಿ ದ್ರವ ಒಳಕ್ಕೆ (ಮೇಲೆ) ಮತ್ತು ಹೊರಕ್ಕೆ (ಕೆಳಗೆ)'),
      info: t('The shell fluid enters at one end and leaves at the other, opposite to the tube fluid: counter-current flow gives the largest LMTD.', 'शेल द्रव एक सिरे से आता है और दूसरे से निकलता है, ट्यूब द्रव की उल्टी दिशा में: प्रतिधारा प्रवाह सबसे बड़ा LMTD देता है।', 'ಶೆಲ್ ದ್ರವ ಒಂದು ತುದಿಯಲ್ಲಿ ಬಂದು ಇನ್ನೊಂದರಲ್ಲಿ ಹೋಗುತ್ತದೆ, ಕೊಳವೆ ದ್ರವಕ್ಕೆ ವಿರುದ್ಧವಾಗಿ: ಪ್ರತಿಪ್ರವಾಹ ಅತಿ ದೊಡ್ಡ LMTD ನೀಡುತ್ತದೆ.'),
    },
    {
      id: 'tube_nozzles', group: 'tube_side', color: '#1565c0', explode: [0, 0, 0],
      name: t('Cold fluid in and out (tube side)', 'ठंडा द्रव प्रवेश और निकास (ट्यूब पक्ष)', 'ತಂಪು ದ್ರವ ಒಳ ಮತ್ತು ಹೊರ (ಕೊಳವೆ ಬದಿ)'),
      info: t('Cooling water usually goes in the tubes: they are easier to clean than the shell.', 'ठंडा पानी आमतौर पर नलियों में जाता है: इन्हें शेल से आसानी से साफ़ किया जा सकता है।', 'ತಂಪು ನೀರು ಸಾಮಾನ್ಯವಾಗಿ ಕೊಳವೆಗಳಲ್ಲಿ ಹೋಗುತ್ತದೆ: ಅವನ್ನು ಶೆಲ್‌ಗಿಂತ ಸುಲಭವಾಗಿ ಸ್ವಚ್ಛಗೊಳಿಸಬಹುದು.'),
    },
    {
      id: 'saddles', group: 'shell_side', color: '#5b6670', metal: true, minor: true, explode: [0, -1, 0],
      name: t('Saddle supports', 'सैडल आधार', 'ಸ್ಯಾಡಲ್ ಆಧಾರಗಳು'),
      info: t('Carry the exchanger on its foundation.', 'विनिमायक को उसकी नींव पर टिकाते हैं।', 'ವಿನಿಮಯಕವನ್ನು ಅದರ ಅಡಿಪಾಯದ ಮೇಲೆ ಹೊರುತ್ತವೆ.'),
    },
  ],
  views: [
    { id: 'front', name: t('Front', 'सामने से', 'ಮುಂಭಾಗ'), dir: [0.35, 0.5, 1] },
    { id: 'end', name: t('Along the tubes', 'नलियों की दिशा से', 'ಕೊಳವೆಗಳ ದಿಕ್ಕಿನಿಂದ'), dir: [1, 0.15, 0.15] },
  ],
  slices: [
    { id: 'half', name: t('Cut along the shell', 'शेल के साथ काटकर', 'ಶೆಲ್‌ನ ಉದ್ದಕ್ಕೆ ಕತ್ತರಿಸಿ'), normal: [0, 0, -1], offset: 0, view: 'front' },
    { id: 'cutaway', name: t('Cut away (a quarter out)', 'काटकर (एक चौथाई हटाकर)', 'ಕತ್ತರಿಸಿ (ಕಾಲು ಭಾಗ ತೆಗೆದು)'), normal: [0, -1, 0], offset: 0, normal2: [0, 0, -1], view: 'front' },
  ],
  animations: [],
};
