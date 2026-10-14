import type { Localized } from '../notifications/texts.js';
import { rupees } from '../notifications/texts.js';

const all = (f: (l: 'en' | 'hi' | 'kn') => { title: string; body: string }): Localized => ({ en: f('en'), hi: f('hi'), kn: f('kn') });

/** What families and the management are told about fees, in English, Hindi and Kannada. */
export const feeTexts = {
  scholarshipReceived: (scheme: string, amountPaise: number) =>
    all((l) => {
      const a = rupees(amountPaise);
      return {
        en: { title: 'Scholarship received', body: `${a} from ${scheme} has been received and set against the fees.` },
        hi: { title: 'छात्रवृत्ति प्राप्त', body: `${scheme} से ${a} प्राप्त हुए और फ़ीस में जमा कर दिए गए।` },
        kn: { title: 'ವಿದ್ಯಾರ್ಥಿವೇತನ ಸ್ವೀಕರಿಸಲಾಗಿದೆ', body: `${scheme} ಇಂದ ${a} ಸ್ವೀಕರಿಸಲಾಗಿದ್ದು ಶುಲ್ಕಕ್ಕೆ ಜಮೆ ಮಾಡಲಾಗಿದೆ.` },
      }[l];
    }),
  receiptCancelled: (receiptNo: string) =>
    all((l) => ({
      en: { title: 'Receipt cancelled', body: `Receipt ${receiptNo} has been cancelled by the accounts office. The fees on it are due again.` },
      hi: { title: 'रसीद रद्द', body: `लेखा कार्यालय ने रसीद ${receiptNo} रद्द कर दी है। उस पर दर्ज फ़ीस फिर से देय है।` },
      kn: { title: 'ರಸೀದಿ ರದ್ದು', body: `ಲೆಕ್ಕಪತ್ರ ಕಚೇರಿ ರಸೀದಿ ${receiptNo} ಅನ್ನು ರದ್ದುಪಡಿಸಿದೆ. ಅದರಲ್ಲಿನ ಶುಲ್ಕ ಮತ್ತೆ ಬಾಕಿ ಇದೆ.` },
    })[l]),
  dailySummary: (day: string, collectedPaise: number, receipts: number, duePaise: number) =>
    all((l) => {
      const c = rupees(collectedPaise);
      const d = rupees(duePaise);
      return {
        en: { title: `Fee collection on ${day}`, body: `${c} collected on ${receipts} receipt(s). Still due: ${d}.` },
        hi: { title: `${day} का फ़ीस संग्रह`, body: `${receipts} रसीदों पर ${c} संग्रहित। अभी बकाया: ${d}।` },
        kn: { title: `${day} ರ ಶುಲ್ಕ ಸಂಗ್ರಹ`, body: `${receipts} ರಸೀದಿಗಳಲ್ಲಿ ${c} ಸಂಗ್ರಹಿಸಲಾಗಿದೆ. ಇನ್ನೂ ಬಾಕಿ: ${d}.` },
      }[l];
    }),
};
