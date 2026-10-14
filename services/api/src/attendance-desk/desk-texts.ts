import { dateIn, type Lang, type Localized, type Text } from '../notifications/texts.js';

/** Attendance desk notices in English, Hindi and Kannada (each recipient reads their own language). */
const all = (f: (l: Lang) => Text): Localized => ({ en: f('en'), hi: f('hi'), kn: f('kn') });

const KIND: Record<'on_duty' | 'medical' | 'personal', Record<Lang, string>> = {
  on_duty: { en: 'On duty', hi: 'ऑन ड्यूटी', kn: 'ಕರ್ತವ್ಯದ ಮೇಲೆ' },
  medical: { en: 'Medical leave', hi: 'चिकित्सा अवकाश', kn: 'ವೈದ್ಯಕೀಯ ರಜೆ' },
  personal: { en: 'Leave', hi: 'अवकाश', kn: 'ರಜೆ' },
};

export const deskTexts = {
  /** To a teacher: a period of theirs has no attendance yet. */
  unmarked: (p: { section: string; subject: string; date: string; time: string }) =>
    all((l) => ({
      title: l === 'hi' ? 'उपस्थिति दर्ज नहीं हुई' : l === 'kn' ? 'ಹಾಜರಾತಿ ದಾಖಲಾಗಿಲ್ಲ' : 'Attendance not marked',
      body: `${p.section} · ${p.subject} · ${dateIn(l, p.date)} ${p.time}`,
    })),
  /** To a family: the evening summary of the day's absences. */
  digest: (p: { studentName: string; date: string; absent: number; held: number; subjects: string }) =>
    all((l) => ({
      title: l === 'hi' ? `${p.studentName}: आज की उपस्थिति` : l === 'kn' ? `${p.studentName}: ಇಂದಿನ ಹಾಜರಾತಿ` : `${p.studentName}: today's attendance`,
      body:
        l === 'hi'
          ? `${dateIn(l, p.date)}: ${p.held} में से ${p.absent} कालांश अनुपस्थित${p.subjects ? ` (${p.subjects})` : ''}`
          : l === 'kn'
            ? `${dateIn(l, p.date)}: ${p.held} ಅವಧಿಗಳಲ್ಲಿ ${p.absent} ಗೈರು${p.subjects ? ` (${p.subjects})` : ''}`
            : `${dateIn(l, p.date)}: absent for ${p.absent} of ${p.held} periods${p.subjects ? ` (${p.subjects})` : ''}`,
    })),
  /** To a student and family: attendance has fallen under the warning level or the minimum. */
  shortage: (p: { studentName: string; subject: string; pct: number; threshold: number; short: boolean }) =>
    all((l) => {
      const where = p.subject ? ` · ${p.subject}` : '';
      if (l === 'hi')
        return { title: p.short ? `${p.studentName}: उपस्थिति कम है` : `${p.studentName}: उपस्थिति पर ध्यान दें`, body: `${p.pct}%${where}. परीक्षा के लिए न्यूनतम ${p.threshold}% आवश्यक है।` };
      if (l === 'kn')
        return { title: p.short ? `${p.studentName}: ಹಾಜರಾತಿ ಕೊರತೆ` : `${p.studentName}: ಹಾಜರಾತಿ ಎಚ್ಚರಿಕೆ`, body: `${p.pct}%${where}. ಪರೀಕ್ಷೆಗೆ ಕನಿಷ್ಠ ${p.threshold}% ಬೇಕು.` };
      return { title: p.short ? `${p.studentName}: attendance is short` : `${p.studentName}: attendance warning`, body: `${p.pct}%${where}. At least ${p.threshold}% is needed to write the examination.` };
    }),
  /** To a student and family: a leave or on-duty request was decided. */
  leaveDecided: (p: { studentName: string; kind: 'on_duty' | 'medical' | 'personal'; approved: boolean; from: string; to: string }) =>
    all((l) => ({
      title: `${KIND[p.kind][l]}: ${l === 'hi' ? (p.approved ? 'स्वीकृत' : 'अस्वीकृत') : l === 'kn' ? (p.approved ? 'ಅನುಮೋದಿಸಲಾಗಿದೆ' : 'ತಿರಸ್ಕರಿಸಲಾಗಿದೆ') : p.approved ? 'approved' : 'declined'}`,
      body: `${p.studentName} · ${dateIn(l, p.from)}${p.to !== p.from ? ` - ${dateIn(l, p.to)}` : ''}`,
    })),
};
