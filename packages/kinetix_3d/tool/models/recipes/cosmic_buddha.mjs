// The "Cosmic Buddha", a 6th-century limestone figure from China whose robe is
// carved with the realms of Buddhist teaching; laser-scanned by the
// Smithsonian's National Museum of Asian Art (Smithsonian Open Access, CC0).
// Downloaded on first use.
const t = (en, hi, kn) => ({ en, hi, kn });

export default {
  id: 'cosmic_buddha',
  version: 1,
  remote: true,
  topic: 'monument',
  license: 'CC0',
  subject: 'History',
  classes: [6, 7, 12],
  title: t('The Cosmic Buddha (sculpture)', 'कॉस्मिक बुद्ध (मूर्ति)', 'ಕಾಸ್ಮಿಕ್ ಬುದ್ಧ (ಶಿಲ್ಪ)'),
  summary: t(
    'A stone Buddha from 6th-century China, about 1.5 m tall. Buddhism began in India and travelled along trade routes to China and beyond; the robe is carved with scenes of its teaching.',
    '6वीं शताब्दी के चीन की पत्थर की बुद्ध प्रतिमा, लगभग 1.5 मीटर ऊँची। बौद्ध धर्म भारत में आरंभ हुआ और व्यापार मार्गों से चीन और आगे तक फैला; वस्त्र पर इसकी शिक्षाओं के दृश्य उकेरे हैं।',
    '6ನೇ ಶತಮಾನದ ಚೀನಾದ ಕಲ್ಲಿನ ಬುದ್ಧ ಪ್ರತಿಮೆ, ಸುಮಾರು 1.5 ಮೀ ಎತ್ತರ. ಬೌದ್ಧ ಧರ್ಮ ಭಾರತದಲ್ಲಿ ಆರಂಭವಾಗಿ ವ್ಯಾಪಾರ ಮಾರ್ಗಗಳ ಮೂಲಕ ಚೀನಾ ಮತ್ತು ಮುಂದಕ್ಕೆ ಹರಡಿತು; ವಸ್ತ್ರದ ಮೇಲೆ ಅದರ ಬೋಧನೆಯ ದೃಶ್ಯಗಳನ್ನು ಕೆತ್ತಲಾಗಿದೆ.',
  ),
  keywords: ['buddha', 'buddhism', 'sculpture', 'silk route', 'religion', 'art', 'ancient history', 'new questions and ideas', 'buildings paintings and books', 'statue'],
  credit: 'Buddha draped in robes portraying the Realms of Desire, National Museum of Asian Art, Smithsonian Open Access (CC0)',
  sources: {
    scan: { file: 'si/cosmic-buddha-150k-1024-low.glb', url: 'https://3d-api.si.edu/content/document/3d_package:d8c62be8-4ebc-11ea-b77f-2e728ce88125/cosmic-buddha-laser-scan-150k-1024-low.glb' },
  },
  size: 0.5,
  async import(k) {
    // The scan faces away from +z: turn it to face the class.
    const m = k.place(k.join(k.worldPrimitives(await k.readSource(k.source('scan')))), { rotate: [0, 180, 0] });
    return { statue: await k.simplifyRich(m, 0.6, 0.0005) };
  },
  groups: [{ id: 'statue', name: t('Statue', 'प्रतिमा', 'ಪ್ರತಿಮೆ') }],
  parts: [
    {
      id: 'statue', group: 'statue', color: '#9b9488', explode: [0, 0.0001, 0],
      name: t('Buddha in carved robes', 'उकेरे वस्त्रों में बुद्ध', 'ಕೆತ್ತಿದ ವಸ್ತ್ರಗಳಲ್ಲಿ ಬುದ್ಧ'),
      info: t(
        'Carved in limestone in about 550–577 CE; the head and hands were lost long ago. Look closely at the robe: rows of tiny figures show the different worlds of Buddhist belief.',
        'लगभग 550–577 ई. में चूना पत्थर में उकेरी गई; सिर और हाथ बहुत पहले टूटकर खो गए। वस्त्र को ध्यान से देखें: छोटी आकृतियों की पंक्तियाँ बौद्ध मान्यता के विभिन्न लोकों को दिखाती हैं।',
        'ಸುಮಾರು ಕ್ರಿ.ಶ. 550–577ರಲ್ಲಿ ಸುಣ್ಣದಕಲ್ಲಿನಲ್ಲಿ ಕೆತ್ತಲಾಗಿದೆ; ತಲೆ ಮತ್ತು ಕೈಗಳು ಬಹಳ ಹಿಂದೆಯೇ ಕಳೆದುಹೋಗಿವೆ. ವಸ್ತ್ರವನ್ನು ಗಮನಿಸಿ: ಸಣ್ಣ ಆಕೃತಿಗಳ ಸಾಲುಗಳು ಬೌದ್ಧ ನಂಬಿಕೆಯ ವಿವಿಧ ಲೋಕಗಳನ್ನು ತೋರಿಸುತ್ತವೆ.',
      ),
    },
  ],
  views: [
    { id: 'front', name: t('Front', 'सामने से', 'ಮುಂಭಾಗ'), dir: [0, 0.1, 1] },
    { id: 'side', name: t('Side', 'बगल से', 'ಪಕ್ಕದಿಂದ'), dir: [1, 0.1, 0.4] },
  ],
  slices: [],
  animations: [],
};
