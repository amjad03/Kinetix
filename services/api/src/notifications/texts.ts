/**
 * Notification texts in English, Hindi and Kannada. Each recipient gets the text in their own
 * preferred language (users.preferred_language). Terms follow docs/i18n/glossary.md; the Hindi
 * and Kannada are a first draft and need native review.
 */

export type Lang = 'en' | 'hi' | 'kn';
export const LANGS: Lang[] = ['en', 'hi', 'kn'];

export interface Text {
  title: string;
  body: string;
}

/** The same message in every language. */
export type Localized = Record<Lang, Text>;

const LOCALE: Record<Lang, string> = { en: 'en-IN', hi: 'hi-IN', kn: 'kn-IN' };

/** "Mon 5 Oct" / "सोम, 5 अक्टू॰" / "ಸೋಮ, 5 ಅಕ್ಟೋ" for a YYYY-MM-DD date. */
export function dateIn(lang: Lang, date: string): string {
  return new Intl.DateTimeFormat(LOCALE[lang], { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
    .format(new Date(`${date}T00:00:00Z`))
    .replace(',', lang === 'en' ? '' : ',');
}

/** "₹45,000" or "₹1,250.50" from paise (Indian grouping, Western digits in every language). */
export function rupees(paise: number): string {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: paise % 100 === 0 ? 0 : 2 }).format(paise / 100);
}

const first = (name: string) => name.split(' ')[0];

/** Builds a message in all three languages from one function per language. */
const all = (f: (lang: Lang) => Text): Localized => ({ en: f('en'), hi: f('hi'), kn: f('kn') });

export const texts = {
  absence: (p: { studentName: string; date: string; subject?: string | null; from?: string; to?: string }) =>
    all((l) => {
      const d = dateIn(l, p.date);
      const period = p.subject ? `${p.subject} (${p.from}–${p.to})` : null;
      return {
        en: {
          title: `${first(p.studentName)} was marked absent`,
          body: `${p.studentName} was marked absent${period ? ` for ${period}` : ''} on ${d}. If this is wrong, please contact the class teacher.`,
        },
        hi: {
          title: `${first(p.studentName)} को अनुपस्थित दर्ज किया गया`,
          body: `${p.studentName} को ${d} को${period ? ` ${period} में` : ''} अनुपस्थित दर्ज किया गया। अगर यह गलत है, तो कृपया कक्षा शिक्षक से संपर्क करें।`,
        },
        kn: {
          title: `${first(p.studentName)} ಗೈರು ಎಂದು ದಾಖಲಾಗಿದೆ`,
          body: `${p.studentName} ${d} ರಂದು${period ? ` ${period} ತರಗತಿಯಲ್ಲಿ` : ''} ಗೈರು ಎಂದು ದಾಖಲಾಗಿದೆ. ಇದು ತಪ್ಪಾಗಿದ್ದರೆ, ದಯವಿಟ್ಟು ತರಗತಿ ಶಿಕ್ಷಕರನ್ನು ಸಂಪರ್ಕಿಸಿ.`,
        },
      }[l];
    }),

  homework: (p: { subject: string; title: string; dueOn: string }) =>
    all((l) => {
      const d = dateIn(l, p.dueOn);
      return {
        en: { title: `Homework: ${p.subject}`, body: `${p.title} · due ${d}` },
        hi: { title: `होमवर्क: ${p.subject}`, body: `${p.title} · जमा करने की तारीख ${d}` },
        kn: { title: `ಹೋಂವರ್ಕ್: ${p.subject}`, body: `${p.title} · ಸಲ್ಲಿಸುವ ದಿನಾಂಕ ${d}` },
      }[l];
    }),

  homeworkReviewed: (p: { studentName: string; title: string; status: 'checked' | 'returned'; remark: string | null }) =>
    all((l) => {
      const n = first(p.studentName);
      const note = p.remark ? ` “${p.remark}”` : '';
      return p.status === 'checked'
        ? {
            en: { title: `Homework checked: ${n}`, body: `${p.title}.${note}` },
            hi: { title: `होमवर्क जाँचा गया: ${n}`, body: `${p.title}।${note}` },
            kn: { title: `ಹೋಂವರ್ಕ್ ಪರಿಶೀಲಿಸಲಾಗಿದೆ: ${n}`, body: `${p.title}.${note}` },
          }[l]
        : {
            en: { title: `Homework to redo: ${n}`, body: `${p.title}.${note} Please submit it again.` },
            hi: { title: `होमवर्क दोबारा करें: ${n}`, body: `${p.title}।${note} कृपया फिर से जमा करें।` },
            kn: { title: `ಹೋಂವರ್ಕ್ ಮತ್ತೆ ಮಾಡಿ: ${n}`, body: `${p.title}.${note} ದಯವಿಟ್ಟು ಮತ್ತೆ ಸಲ್ಲಿಸಿ.` },
          }[l];
    }),

  boardShared: (p: { subject: string | null; title: string }) =>
    all(
      (l) =>
        ({
          en: { title: p.subject ? `Today's board: ${p.subject}` : "Today's board", body: `${p.title}. Open it to revise what was taught in class.` },
          hi: { title: p.subject ? `आज का बोर्ड: ${p.subject}` : 'आज का बोर्ड', body: `${p.title}। कक्षा में जो पढ़ाया गया, उसे दोहराने के लिए खोलें।` },
          kn: { title: p.subject ? `ಇಂದಿನ ಬೋರ್ಡ್: ${p.subject}` : 'ಇಂದಿನ ಬೋರ್ಡ್', body: `${p.title}. ತರಗತಿಯಲ್ಲಿ ಕಲಿಸಿದ್ದನ್ನು ಪುನರಾವರ್ತಿಸಲು ತೆರೆಯಿರಿ.` },
        })[l],
    ),

  recordingMissed: (p: { subject: string | null; title: string }) =>
    all(
      (l) =>
        ({
          en: { title: `Missed ${p.subject ?? 'class'}? Watch the lesson`, body: `${p.title}. The teacher's board and voice are recorded so you can catch up.` },
          hi: {
            title: `${p.subject ? `${p.subject} की कक्षा` : 'कक्षा'} छूट गई? पाठ देखें`,
            body: `${p.title}। शिक्षक का बोर्ड और आवाज़ रिकॉर्ड की गई है, ताकि छूटा हुआ पाठ पूरा हो सके।`,
          },
          kn: {
            title: `${p.subject ? `${p.subject} ತರಗತಿ` : 'ತರಗತಿ'} ತಪ್ಪಿಹೋಯಿತೇ? ಪಾಠವನ್ನು ನೋಡಿ`,
            body: `${p.title}. ತಪ್ಪಿದ ಪಾಠವನ್ನು ಕಲಿಯಲು ಶಿಕ್ಷಕರ ಬೋರ್ಡ್ ಮತ್ತು ಧ್ವನಿಯನ್ನು ರೆಕಾರ್ಡ್ ಮಾಡಲಾಗಿದೆ.`,
          },
        })[l],
    ),

  recordingShared: (p: { subject: string | null; title: string }) =>
    all(
      (l) =>
        ({
          en: { title: `Lesson recording: ${p.subject ?? 'class'}`, body: `${p.title}. Watch it again to revise.` },
          hi: { title: `पाठ की रिकॉर्डिंग: ${p.subject ?? 'कक्षा'}`, body: `${p.title}। दोहराने के लिए फिर से देखें।` },
          kn: { title: `ಪಾಠದ ರೆಕಾರ್ಡಿಂಗ್: ${p.subject ?? 'ತರಗತಿ'}`, body: `${p.title}. ಪುನರಾವರ್ತನೆಗಾಗಿ ಮತ್ತೆ ನೋಡಿ.` },
        })[l],
    ),

  feeIssued: (p: { title: string; amountPaise: number; dueOn: string }) =>
    all((l) => {
      const d = dateIn(l, p.dueOn);
      const a = rupees(p.amountPaise);
      return {
        en: { title: `Fee due: ${p.title}`, body: `${a} due by ${d}. Pay in the app or at the fees counter.` },
        hi: { title: `फ़ीस देय: ${p.title}`, body: `${a} ${d} तक जमा करें। ऐप में या फ़ीस काउंटर पर भुगतान करें।` },
        kn: { title: `ಶುಲ್ಕ ಬಾಕಿ: ${p.title}`, body: `${a} ಅನ್ನು ${d} ರೊಳಗೆ ಪಾವತಿಸಿ. ಆ್ಯಪ್‌ನಲ್ಲಿ ಅಥವಾ ಶುಲ್ಕ ಕೌಂಟರ್‌ನಲ್ಲಿ ಪಾವತಿಸಬಹುದು.` },
      }[l];
    }),

  feePaid: (p: { title: string; amountPaise: number; studentName: string; receiptNo: string }) =>
    all((l) => {
      const a = rupees(p.amountPaise);
      return {
        en: { title: `Payment received: ${a}`, body: `${p.title} for ${p.studentName}. Receipt ${p.receiptNo}.` },
        hi: { title: `भुगतान प्राप्त: ${a}`, body: `${p.studentName} के लिए ${p.title}। रसीद ${p.receiptNo}।` },
        kn: { title: `ಪಾವತಿ ಸ್ವೀಕರಿಸಲಾಗಿದೆ: ${a}`, body: `${p.studentName} ಅವರ ${p.title}. ರಸೀದಿ ${p.receiptNo}.` },
      }[l];
    }),

  libraryIssued: (p: { studentName: string; title: string; dueOn: string }) =>
    all((l) => {
      const d = dateIn(l, p.dueOn);
      const n = first(p.studentName);
      return {
        en: { title: `Library book borrowed: ${p.title}`, body: `${n} borrowed "${p.title}". Please return it by ${d}.` },
        hi: { title: `पुस्तकालय से किताब ली गई: ${p.title}`, body: `${n} ने "${p.title}" किताब ली है। कृपया ${d} तक लौटाएँ।` },
        kn: { title: `ಗ್ರಂಥಾಲಯದ ಪುಸ್ತಕ ಪಡೆದಿದೆ: ${p.title}`, body: `${n} "${p.title}" ಪುಸ್ತಕವನ್ನು ಪಡೆದಿದ್ದಾರೆ. ದಯವಿಟ್ಟು ${d} ರೊಳಗೆ ಹಿಂದಿರುಗಿಸಿ.` },
      }[l];
    }),

  calendar: (p: { kind: 'holiday' | 'exam' | 'event'; title: string; startsOn: string; endsOn: string }) =>
    all((l) => {
      const when = p.startsOn === p.endsOn ? dateIn(l, p.startsOn) : `${dateIn(l, p.startsOn)} – ${dateIn(l, p.endsOn)}`;
      if (p.kind === 'holiday') {
        return {
          en: { title: `Holiday: ${p.title}`, body: `${when}. There are no classes.` },
          hi: { title: `छुट्टी: ${p.title}`, body: `${when}। कक्षाएँ नहीं होंगी।` },
          kn: { title: `ರಜೆ: ${p.title}`, body: `${when}. ತರಗತಿಗಳು ಇರುವುದಿಲ್ಲ.` },
        }[l];
      }
      const label = { exam: { en: 'Exams', hi: 'परीक्षा', kn: 'ಪರೀಕ್ಷೆ' }, event: { en: 'Event', hi: 'कार्यक्रम', kn: 'ಕಾರ್ಯಕ್ರಮ' } }[p.kind][l];
      return { title: `${label}: ${p.title}`, body: when };
    }),

  marksPublished: (p: { subject: string; title: string }) =>
    all(
      (l) =>
        ({
          en: { title: `Marks published: ${p.subject}`, body: `${p.title}. Open the app to see the marks and the class average.` },
          hi: { title: `अंक जारी: ${p.subject}`, body: `${p.title}। अंक और कक्षा का औसत देखने के लिए ऐप खोलें।` },
          kn: { title: `ಅಂಕಗಳು ಪ್ರಕಟವಾಗಿವೆ: ${p.subject}`, body: `${p.title}. ಅಂಕಗಳು ಮತ್ತು ತರಗತಿ ಸರಾಸರಿಯನ್ನು ನೋಡಲು ಆ್ಯಪ್ ತೆರೆಯಿರಿ.` },
        })[l],
    ),

  message: (p: { senderName: string; preview: string }) =>
    all(
      (l) =>
        ({
          en: { title: `Message from ${p.senderName}`, body: p.preview },
          hi: { title: `${p.senderName} का संदेश`, body: p.preview },
          kn: { title: `${p.senderName} ಅವರಿಂದ ಸಂದೇಶ`, body: p.preview },
        })[l],
    ),

  live: (p: { subject: string | null; teacherName: string }) =>
    all(
      (l) =>
        ({
          en: { title: `Live now: ${p.subject ?? 'class'}`, body: `${p.teacherName} is teaching live. Open KINETIX to watch the board.` },
          hi: { title: `अभी लाइव: ${p.subject ?? 'कक्षा'}`, body: `${p.teacherName} लाइव पढ़ा रहे हैं। बोर्ड देखने के लिए KINETIX खोलें।` },
          kn: { title: `ಈಗ ಲೈವ್: ${p.subject ?? 'ತರಗತಿ'}`, body: `${p.teacherName} ಲೈವ್ ಆಗಿ ಕಲಿಸುತ್ತಿದ್ದಾರೆ. ಬೋರ್ಡ್ ನೋಡಲು KINETIX ತೆರೆಯಿರಿ.` },
        })[l],
    ),
};

/** What a phone's lock screen shows for each kind: generic on purpose (no names or details). */
export const LOCK_SCREEN: Record<string, Record<Lang, string>> = {
  absence: { en: 'Attendance update', hi: 'उपस्थिति की सूचना', kn: 'ಹಾಜರಾತಿ ಸೂಚನೆ' },
  homework: { en: 'New homework', hi: 'नया होमवर्क', kn: 'ಹೊಸ ಹೋಂವರ್ಕ್' },
  board_shared: { en: 'Class board shared', hi: 'कक्षा का बोर्ड साझा किया गया', kn: 'ತರಗತಿಯ ಬೋರ್ಡ್ ಹಂಚಿಕೊಳ್ಳಲಾಗಿದೆ' },
  recording: { en: 'Lesson recording available', hi: 'पाठ की रिकॉर्डिंग उपलब्ध है', kn: 'ಪಾಠದ ರೆಕಾರ್ಡಿಂಗ್ ಲಭ್ಯವಿದೆ' },
  broadcast: { en: 'Message from your institution', hi: 'आपके संस्थान से संदेश', kn: 'ನಿಮ್ಮ ಸಂಸ್ಥೆಯಿಂದ ಸಂದೇಶ' },
  fee: { en: 'Fees update', hi: 'फ़ीस की सूचना', kn: 'ಶುಲ್ಕದ ಸೂಚನೆ' },
  library: { en: 'Library update', hi: 'पुस्तकालय की सूचना', kn: 'ಗ್ರಂಥಾಲಯದ ಸೂಚನೆ' },
  marks: { en: 'Marks published', hi: 'अंक जारी', kn: 'ಅಂಕಗಳು ಪ್ರಕಟವಾಗಿವೆ' },
  message: { en: 'New message', hi: 'नया संदेश', kn: 'ಹೊಸ ಸಂದೇಶ' },
  live: { en: 'Class is live', hi: 'कक्षा लाइव है', kn: 'ತರಗತಿ ಲೈವ್ ಆಗಿದೆ' },
};

export const OPEN_APP: Record<Lang, string> = {
  en: 'Open KINETIX to see the details.',
  hi: 'जानकारी देखने के लिए KINETIX खोलें।',
  kn: 'ವಿವರಗಳನ್ನು ನೋಡಲು KINETIX ತೆರೆಯಿರಿ.',
};
