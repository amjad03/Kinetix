// A woolly mammoth skeleton scanned at the Smithsonian's National Museum of
// Natural History (Smithsonian Open Access, CC0). Downloaded on first use.
const t = (en, hi, kn) => ({ en, hi, kn });

export default {
  id: 'woolly_mammoth',
  version: 1,
  remote: true,
  topic: 'life',
  license: 'CC0',
  subject: 'Biology',
  classes: [8, 10, 12],
  title: t('Woolly mammoth skeleton', 'ऊनी मैमथ का कंकाल', 'ಉಣ್ಣೆಯ ಮ್ಯಾಮತ್ ಅಸ್ಥಿಪಂಜರ'),
  summary: t(
    'A relative of today\'s elephants that lived in the cold grasslands of the last Ice Age and died out about 4,000 years ago. Fossils like this show how living things change and become extinct.',
    'आज के हाथियों का संबंधी, जो पिछले हिमयुग के ठंडे घास के मैदानों में रहता था और लगभग 4,000 वर्ष पहले विलुप्त हो गया। ऐसे जीवाश्म दिखाते हैं कि जीव कैसे बदलते और विलुप्त होते हैं।',
    'ಇಂದಿನ ಆನೆಗಳ ಸಂಬಂಧಿ; ಕೊನೆಯ ಹಿಮಯುಗದ ತಣ್ಣನೆಯ ಹುಲ್ಲುಗಾವಲುಗಳಲ್ಲಿ ಬದುಕಿ ಸುಮಾರು 4,000 ವರ್ಷಗಳ ಹಿಂದೆ ಅಳಿದುಹೋಯಿತು. ಇಂತಹ ಪಳೆಯುಳಿಕೆಗಳು ಜೀವಿಗಳು ಹೇಗೆ ಬದಲಾಗುತ್ತವೆ ಮತ್ತು ಅಳಿಯುತ್ತವೆ ಎಂದು ತೋರಿಸುತ್ತವೆ.',
  ),
  keywords: ['mammoth', 'woolly mammoth', 'fossil', 'extinct', 'extinction', 'ice age', 'evolution', 'elephant', 'skeleton', 'heredity and evolution', 'conservation'],
  credit: 'Woolly mammoth, Smithsonian National Museum of Natural History, Smithsonian Open Access (CC0)',
  sources: {
    scan: { file: 'si/woolly-mammoth-150k-1024-low.glb', url: 'https://3d-api.si.edu/content/document/3d_package:341c96cd-f967-4540-8ed1-d3fc56d31f12/woolly-mammoth-150k-1024-low.glb' },
  },
  size: 0.6,
  async import(k) {
    // The scan lies on its side: stand it on its feet.
    const m = k.place(k.join(k.worldPrimitives(await k.readSource(k.source('scan')))), { rotate: [-90, 0, 0] });
    return { skeleton: await k.simplifyRich(m, 0.55, 0.0006) };
  },
  groups: [{ id: 'fossil', name: t('Fossil skeleton', 'जीवाश्म कंकाल', 'ಪಳೆಯುಳಿಕೆ ಅಸ್ಥಿಪಂಜರ') }],
  parts: [
    {
      id: 'skeleton', group: 'fossil', color: '#b49a74', explode: [0, 0.0001, 0],
      name: t('Woolly mammoth (Mammuthus primigenius)', 'ऊनी मैमथ (मैमथस प्रिमिजेनियस)', 'ಉಣ್ಣೆಯ ಮ್ಯಾಮತ್ (ಮ್ಯಾಮತಸ್ ಪ್ರಿಮಿಜೀನಿಯಸ್)'),
      info: t(
        'About 3 metres tall at the shoulder, with long curved tusks for clearing snow and fighting, and a thick coat of hair against the cold.',
        'कंधे तक लगभग 3 मीटर ऊँचा, बर्फ़ हटाने और लड़ने के लिए लंबे मुड़े दाँत, और ठंड से बचाने वाले घने बाल।',
        'ಭುಜದವರೆಗೆ ಸುಮಾರು 3 ಮೀಟರ್ ಎತ್ತರ; ಹಿಮ ಸರಿಸಲು ಮತ್ತು ಹೋರಾಡಲು ಉದ್ದನೆಯ ಬಾಗಿದ ದಂತಗಳು, ಚಳಿಯಿಂದ ರಕ್ಷಿಸುವ ದಪ್ಪ ಕೂದಲು.',
      ),
    },
  ],
  views: [
    { id: 'side', name: t('Side', 'बगल से', 'ಪಕ್ಕದಿಂದ'), dir: [1, 0.2, 0.45] },
    { id: 'front', name: t('Front', 'सामने से', 'ಮುಂಭಾಗ'), dir: [0, 0.15, 1] },
  ],
  slices: [],
  animations: [],
};
