// The coronavirus that causes COVID-19 (SARS-CoV-2), from NIAID's
// scientifically accurate model on NIH 3D (built from Protein Data Bank
// structures and electron microscope images). The source is one mesh
// coloured by protein; it is split by colour into the envelope and the two
// forms of the spike protein.
const t = (en, hi, kn) => ({ en, hi, kn });

export default {
  id: 'virus',
  version: 1,
  order: 12,
  source: 'nih3d',
  subject: 'Biology',
  classes: [8, 9, 11, 12],
  title: t('Coronavirus (SARS-CoV-2)', 'कोरोनावायरस (SARS-CoV-2)', 'ಕೊರೊನಾವೈರಸ್ (SARS-CoV-2)'),
  summary: t(
    'The virus that causes COVID-19, about 100 nanometres across. Spike proteins on its fatty envelope grip our cells so the virus can get in and make copies of itself.',
    'COVID-19 फैलाने वाला विषाणु, लगभग 100 नैनोमीटर चौड़ा। इसके वसा-आवरण पर लगे स्पाइक प्रोटीन हमारी कोशिकाओं को पकड़ते हैं ताकि विषाणु अंदर जाकर अपनी प्रतियाँ बना सके।',
    'COVID-19 ಉಂಟುಮಾಡುವ ವೈರಸ್, ಸುಮಾರು 100 ನ್ಯಾನೋಮೀಟರ್ ಅಗಲ. ಇದರ ಕೊಬ್ಬಿನ ಹೊದಿಕೆಯ ಮೇಲಿನ ಸ್ಪೈಕ್ ಪ್ರೋಟೀನ್‌ಗಳು ನಮ್ಮ ಜೀವಕೋಶಗಳನ್ನು ಹಿಡಿದು ವೈರಸ್ ಒಳಹೊಕ್ಕು ತನ್ನ ನಕಲುಗಳನ್ನು ಮಾಡುವಂತೆ ಮಾಡುತ್ತವೆ.',
  ),
  keywords: ['virus', 'coronavirus', 'covid', 'covid-19', 'sars-cov-2', 'spike protein', 'microbes', 'microorganisms', 'disease', 'pathogen', 'vaccine', 'rna virus', 'why do we fall ill'],
  credit: 'SARS-CoV-2 Virion (PathogenAR Version), NIAID / NIH 3D (3DPX-014820), CC BY 4.0',
  sources: {
    virion: {
      file: 'virus/OpenClosedSpikesColored_NIH3D.glb',
      url: 'https://3d.nih.gov/api/submissions/19432/runs/7f944244-c721-4bbe-adae-4dd4473a0070/output-files/422689',
    },
  },
  // Shown 20 cm across; the real virus is about 100 nm.
  size: 0.2,
  async import(k) {
    const [whole] = k.worldPrimitives(await k.readSource(k.source('virion')));
    const parts = k.splitByColour(whole, {
      envelope: [0.05, 0.25, 0.45],
      spikes_closed: [0.75, 0.5, 0.5],
      spikes_open: [0.85, 0.15, 0.15],
    });
    return {
      envelope: await k.simplifyRich(parts.envelope, 0.3, 0.004),
      spikes_closed: await k.simplifyRich(parts.spikes_closed, 0.16, 0.004),
      spikes_open: await k.simplifyRich(parts.spikes_open, 0.18, 0.004),
    };
  },
  groups: [
    { id: 'virus', name: t('The virus', 'विषाणु', 'ವೈರಸ್') },
  ],
  parts: [
    {
      id: 'envelope', group: 'virus', color: '#3f86b4', inside: '#2b5f82', explode: [0, 0, 0.0001],
      name: t('Envelope with membrane proteins', 'झिल्ली प्रोटीन वाला आवरण', 'ಪೊರೆ ಪ್ರೋಟೀನ್‌ಗಳಿರುವ ಹೊದಿಕೆ'),
      info: t(
        'A thin fatty layer taken from the cell the virus came out of, studded with membrane (M) and envelope (E) proteins. Soap breaks this layer, which is why washing hands works.',
        'वसा की पतली परत जो उस कोशिका से ली गई है जिससे विषाणु निकला, इसमें झिल्ली (M) और आवरण (E) प्रोटीन जड़े हैं। साबुन इस परत को तोड़ देता है, इसीलिए हाथ धोना कारगर है।',
        'ವೈರಸ್ ಹೊರಬಂದ ಜೀವಕೋಶದಿಂದ ಪಡೆದ ತೆಳುವಾದ ಕೊಬ್ಬಿನ ಪದರ; ಇದರಲ್ಲಿ ಪೊರೆ (M) ಮತ್ತು ಹೊದಿಕೆ (E) ಪ್ರೋಟೀನ್‌ಗಳಿವೆ. ಸಾಬೂನು ಈ ಪದರವನ್ನು ಒಡೆಯುತ್ತದೆ, ಅದಕ್ಕೇ ಕೈ ತೊಳೆಯುವುದು ಪರಿಣಾಮಕಾರಿ.',
      ),
    },
    {
      id: 'spikes_closed', group: 'virus', color: '#e7c6a5', inside: '#c9a27c',
      name: t('Spike proteins (closed)', 'स्पाइक प्रोटीन (बंद)', 'ಸ್ಪೈಕ್ ಪ್ರೋಟೀನ್‌ಗಳು (ಮುಚ್ಚಿದ)'),
      info: t(
        'Most spikes are closed, resting and not yet able to bind. They give the virus its crown-like look: "corona" means crown.',
        'अधिकतर स्पाइक बंद रहते हैं, विश्राम में और अभी जुड़ने योग्य नहीं। इन्हीं से विषाणु मुकुट जैसा दिखता है: "कोरोना" का अर्थ है मुकुट।',
        'ಹೆಚ್ಚಿನ ಸ್ಪೈಕ್‌ಗಳು ಮುಚ್ಚಿರುತ್ತವೆ, ಇನ್ನೂ ಅಂಟಿಕೊಳ್ಳಲು ಸಿದ್ಧವಾಗಿಲ್ಲ. ಇವುಗಳಿಂದ ವೈರಸ್ ಕಿರೀಟದಂತೆ ಕಾಣುತ್ತದೆ: "ಕೊರೊನಾ" ಎಂದರೆ ಕಿರೀಟ.',
      ),
    },
    {
      id: 'spikes_open', group: 'virus', color: '#e2553f', inside: '#b23a28',
      name: t('Spike proteins (open)', 'स्पाइक प्रोटीन (खुले)', 'ಸ್ಪೈಕ್ ಪ್ರೋಟೀನ್‌ಗಳು (ತೆರೆದ)'),
      info: t(
        'An open spike can lock on to the ACE2 receptor of a cell in our nose, throat or lungs. Vaccines teach the body to make antibodies that block the spike.',
        'खुला स्पाइक हमारी नाक, गले या फेफड़ों की कोशिका के ACE2 ग्राही से चिपक सकता है। टीके शरीर को ऐसे प्रतिरक्षी बनाना सिखाते हैं जो स्पाइक को रोकते हैं।',
        'ತೆರೆದ ಸ್ಪೈಕ್ ನಮ್ಮ ಮೂಗು, ಗಂಟಲು ಅಥವಾ ಶ್ವಾಸಕೋಶದ ಜೀವಕೋಶದ ACE2 ಗ್ರಾಹಕಕ್ಕೆ ಅಂಟಿಕೊಳ್ಳಬಲ್ಲದು. ಲಸಿಕೆಗಳು ಸ್ಪೈಕ್ ಅನ್ನು ತಡೆಯುವ ಪ್ರತಿಕಾಯಗಳನ್ನು ಮಾಡಲು ದೇಹಕ್ಕೆ ಕಲಿಸುತ್ತವೆ.',
      ),
    },
  ],
  views: [
    { id: 'front', name: t('Front', 'सामने से', 'ಮುಂಭಾಗ'), dir: [0.2, 0.25, 1] },
    { id: 'side', name: t('Side', 'बगल से', 'ಪಕ್ಕದಿಂದ'), dir: [1, 0.1, 0.2] },
  ],
  slices: [
    { id: 'half', name: t('Cut in half', 'बीच से आधा काटा', 'ಅರ್ಧಕ್ಕೆ ಕತ್ತರಿಸಿದ್ದು'), normal: [0, 0, -1], through: 'envelope', view: 'front' },
  ],
  animations: [],
};
