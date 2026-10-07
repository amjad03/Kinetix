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

  transportArrival: (p: { studentName: string; stopName: string; routeName: string }) =>
    all((l) => {
      const n = first(p.studentName);
      return {
        en: { title: `Bus arriving at ${p.stopName}`, body: `${p.routeName} is about to reach ${p.stopName} for ${n}.` },
        hi: { title: `बस ${p.stopName} पहुँचने वाली है`, body: `${p.routeName} ${n} के लिए ${p.stopName} पहुँचने वाली है।` },
        kn: { title: `ಬಸ್ ${p.stopName} ತಲುಪುತ್ತಿದೆ`, body: `${p.routeName} ${n} ಅವರಿಗಾಗಿ ${p.stopName} ತಲುಪುತ್ತಿದೆ.` },
      }[l];
    }),

  hostelGate: (p: { studentName: string; event: 'out' | 'in' }) =>
    all((l) => {
      const n = first(p.studentName);
      return p.event === 'out'
        ? {
            en: { title: `${n} left the hostel`, body: `${n} went out through the hostel gate.` },
            hi: { title: `${n} हॉस्टल से बाहर गए`, body: `${n} हॉस्टल के गेट से बाहर गए हैं।` },
            kn: { title: `${n} ಹಾಸ್ಟೆಲ್‌ನಿಂದ ಹೊರಟಿದ್ದಾರೆ`, body: `${n} ಹಾಸ್ಟೆಲ್ ಗೇಟ್ ಮೂಲಕ ಹೊರಗೆ ಹೋಗಿದ್ದಾರೆ.` },
          }[l]
        : {
            en: { title: `${n} is back in the hostel`, body: `${n} came back through the hostel gate.` },
            hi: { title: `${n} हॉस्टल लौट आए`, body: `${n} हॉस्टल के गेट से वापस आ गए हैं।` },
            kn: { title: `${n} ಹಾಸ್ಟೆಲ್‌ಗೆ ಮರಳಿದ್ದಾರೆ`, body: `${n} ಹಾಸ್ಟೆಲ್ ಗೇಟ್ ಮೂಲಕ ಮರಳಿ ಬಂದಿದ್ದಾರೆ.` },
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

  /** To the teacher, a week before a lesson recording is deleted at the end of its term. */
  recordingExpiring: (p: { title: string; sectionName: string | null; expiresOn: string }) =>
    all((l) => {
      const what = p.sectionName ? `${p.title} (${p.sectionName})` : p.title;
      const d = dateIn(l, p.expiresOn);
      return {
        en: { title: `Recording will be deleted on ${d}`, body: `${what}. The semester has ended. Mark it "Keep" in KINETIX Teacher to save it.` },
        hi: { title: `रिकॉर्डिंग ${d} को हटा दी जाएगी`, body: `${what}। सेमेस्टर समाप्त हो गया है। इसे रखने के लिए KINETIX Teacher में "रखें" चुनें।` },
        kn: { title: `ರೆಕಾರ್ಡಿಂಗ್ ${d} ರಂದು ಅಳಿಸಲಾಗುವುದು`, body: `${what}. ಸೆಮಿಸ್ಟರ್ ಮುಗಿದಿದೆ. ಉಳಿಸಲು KINETIX Teacher ನಲ್ಲಿ "ಉಳಿಸಿ" ಆಯ್ಕೆಮಾಡಿ.` },
      }[l];
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

  homeworkReminder: (p: { studentName: string; title: string; subject: string; dueOn: string }) =>
    all((l) => {
      const n = first(p.studentName);
      const d = dateIn(l, p.dueOn);
      return {
        en: { title: `Homework not handed in: ${n}`, body: `${p.title} (${p.subject}), due ${d}. Please hand it in.` },
        hi: { title: `होमवर्क जमा नहीं हुआ: ${n}`, body: `${p.title} (${p.subject}), जमा करने की तारीख ${d}। कृपया जमा करें।` },
        kn: { title: `ಹೋಂವರ್ಕ್ ಸಲ್ಲಿಸಿಲ್ಲ: ${n}`, body: `${p.title} (${p.subject}), ಸಲ್ಲಿಸುವ ದಿನಾಂಕ ${d}. ದಯವಿಟ್ಟು ಸಲ್ಲಿಸಿ.` },
      }[l];
    }),

  badge: (p: { studentName: string; badge: BadgeKind; teacherName: string }) =>
    all((l) => {
      const n = first(p.studentName);
      const b = BADGE_NAMES[p.badge][l];
      return {
        en: { title: `${n} earned a badge: ${b}`, body: `${p.teacherName} awarded ${p.studentName} the “${b}” badge.` },
        hi: { title: `${n} को बैज मिला: ${b}`, body: `${p.teacherName} ने ${p.studentName} को “${b}” बैज दिया।` },
        kn: { title: `${n} ಅವರಿಗೆ ಬ್ಯಾಡ್ಜ್: ${b}`, body: `${p.teacherName} ಅವರು ${p.studentName} ಅವರಿಗೆ “${b}” ಬ್ಯಾಡ್ಜ್ ನೀಡಿದ್ದಾರೆ.` },
      }[l];
    }),
};

export type BadgeKind =
  | 'dazzling_performer'
  | 'good_attempt'
  | 'aspiring_student'
  | 'obedient_student'
  | 'outstanding_speaker'
  | 'master_of_maths'
  | 'creative_mind'
  | 'young_scientist'
  | 'most_curious'
  | 'best_leader';

/** Badge names in each language (the apps carry the same names). */
export const BADGE_NAMES: Record<BadgeKind, Record<Lang, string>> = {
  dazzling_performer: { en: 'Dazzling Performer', hi: 'शानदार प्रदर्शन', kn: 'ಅದ್ಭುತ ಸಾಧಕ' },
  good_attempt: { en: 'Good Attempt', hi: 'अच्छा प्रयास', kn: 'ಉತ್ತಮ ಪ್ರಯತ್ನ' },
  aspiring_student: { en: 'Aspiring Student', hi: 'उभरता विद्यार्थी', kn: 'ಆಕಾಂಕ್ಷಿ ವಿದ್ಯಾರ್ಥಿ' },
  obedient_student: { en: 'Obedient Student', hi: 'आज्ञाकारी विद्यार्थी', kn: 'ವಿಧೇಯ ವಿದ್ಯಾರ್ಥಿ' },
  outstanding_speaker: { en: 'Outstanding Speaker', hi: 'उत्कृष्ट वक्ता', kn: 'ಅತ್ಯುತ್ತಮ ಭಾಷಣಕಾರ' },
  master_of_maths: { en: 'Master of Maths', hi: 'गणित का उस्ताद', kn: 'ಗಣಿತ ಪರಿಣತ' },
  creative_mind: { en: 'Creative Mind', hi: 'रचनात्मक सोच', kn: 'ಸೃಜನಶೀಲ ಮನಸ್ಸು' },
  young_scientist: { en: 'Young Scientist', hi: 'युवा वैज्ञानिक', kn: 'ಯುವ ವಿಜ್ಞಾನಿ' },
  most_curious: { en: 'Most Curious', hi: 'सबसे जिज्ञासु', kn: 'ಅತ್ಯಂತ ಕುತೂಹಲಿ' },
  best_leader: { en: 'Best Leader', hi: 'सर्वश्रेष्ठ नेता', kn: 'ಅತ್ಯುತ್ತಮ ನಾಯಕ' },
};

/** What a phone's lock screen shows for each kind: generic on purpose (no names or details). */
export const LOCK_SCREEN: Record<string, Record<Lang, string>> = {
  absence: { en: 'Attendance update', hi: 'उपस्थिति की सूचना', kn: 'ಹಾಜರಾತಿ ಸೂಚನೆ' },
  homework: { en: 'New homework', hi: 'नया होमवर्क', kn: 'ಹೊಸ ಹೋಂವರ್ಕ್' },
  board_shared: { en: 'Class board shared', hi: 'कक्षा का बोर्ड साझा किया गया', kn: 'ತರಗತಿಯ ಬೋರ್ಡ್ ಹಂಚಿಕೊಳ್ಳಲಾಗಿದೆ' },
  recording: { en: 'Lesson recording available', hi: 'पाठ की रिकॉर्डिंग उपलब्ध है', kn: 'ಪಾಠದ ರೆಕಾರ್ಡಿಂಗ್ ಲಭ್ಯವಿದೆ' },
  broadcast: { en: 'Message from your institution', hi: 'आपके संस्थान से संदेश', kn: 'ನಿಮ್ಮ ಸಂಸ್ಥೆಯಿಂದ ಸಂದೇಶ' },
  fee: { en: 'Fees update', hi: 'फ़ीस की सूचना', kn: 'ಶುಲ್ಕದ ಸೂಚನೆ' },
  transport: { en: 'Bus update', hi: 'बस की सूचना', kn: 'ಬಸ್ ಸೂಚನೆ' },
  hostel: { en: 'Hostel update', hi: 'हॉस्टल की सूचना', kn: 'ಹಾಸ್ಟೆಲ್ ಸೂಚನೆ' },
  library: { en: 'Library update', hi: 'पुस्तकालय की सूचना', kn: 'ಗ್ರಂಥಾಲಯದ ಸೂಚನೆ' },
  marks: { en: 'Marks published', hi: 'अंक जारी', kn: 'ಅಂಕಗಳು ಪ್ರಕಟವಾಗಿವೆ' },
  message: { en: 'New message', hi: 'नया संदेश', kn: 'ಹೊಸ ಸಂದೇಶ' },
  live: { en: 'Class is live', hi: 'कक्षा लाइव है', kn: 'ತರಗತಿ ಲೈವ್ ಆಗಿದೆ' },
  badge: { en: 'A new badge', hi: 'नया बैज', kn: 'ಹೊಸ ಬ್ಯಾಡ್ಜ್' },
};

export const OPEN_APP: Record<Lang, string> = {
  en: 'Open KINETIX to see the details.',
  hi: 'जानकारी देखने के लिए KINETIX खोलें।',
  kn: 'ವಿವರಗಳನ್ನು ನೋಡಲು KINETIX ತೆರೆಯಿರಿ.',
};
