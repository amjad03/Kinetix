// Notification texts of the governance pass in English, Hindi and Kannada (the recipient's own language).
import { dateIn, type Lang, type Localized, type Text } from '../notifications/texts.js';

const all = (f: (l: Lang) => Text): Localized => ({ en: f('en'), hi: f('hi'), kn: f('kn') });

export const govTexts = {
  meetingNotice: (p: { committee: string; title: string; on: string; at: string; venue: string; items: number }) =>
    all((l) => {
      const d = dateIn(l, p.on);
      const where = [p.at, p.venue].filter(Boolean).join(', ');
      return {
        en: { title: `Meeting notice: ${p.committee}`, body: `${p.title} on ${d}${where ? ` (${where})` : ''}. ${p.items} agenda item(s).` },
        hi: { title: `बैठक की सूचना: ${p.committee}`, body: `${p.title}, ${d}${where ? ` (${where})` : ''}। कार्यसूची में ${p.items} विषय।` },
        kn: { title: `ಸಭೆಯ ಸೂಚನೆ: ${p.committee}`, body: `${p.title}, ${d}${where ? ` (${where})` : ''}. ಕಾರ್ಯಸೂಚಿಯಲ್ಲಿ ${p.items} ವಿಷಯಗಳು.` },
      }[l];
    }),
  minutesToSign: (p: { committee: string; title: string; on: string }) =>
    all((l) => {
      const d = dateIn(l, p.on);
      return {
        en: { title: `Minutes to approve: ${p.committee}`, body: `Read and approve the minutes of ${p.title} (${d}).` },
        hi: { title: `कार्यवृत्त अनुमोदन हेतु: ${p.committee}`, body: `${p.title} (${d}) का कार्यवृत्त पढ़कर अनुमोदित करें।` },
        kn: { title: `ಅನುಮೋದನೆಗೆ ನಡಾವಳಿ: ${p.committee}`, body: `${p.title} (${d}) ರ ನಡಾವಳಿ ಓದಿ ಅನುಮೋದಿಸಿ.` },
      }[l];
    }),
  minutesApproved: (p: { committee: string; title: string }) =>
    all((l) => ({
      en: { title: `Minutes approved: ${p.committee}`, body: `The minutes of ${p.title} are approved and signed.` },
      hi: { title: `कार्यवृत्त अनुमोदित: ${p.committee}`, body: `${p.title} का कार्यवृत्त अनुमोदित और हस्ताक्षरित है।` },
      kn: { title: `ನಡಾವಳಿ ಅನುಮೋದಿತ: ${p.committee}`, body: `${p.title} ರ ನಡಾವಳಿ ಅನುಮೋದಿಸಿ ಸಹಿ ಮಾಡಲಾಗಿದೆ.` },
    })[l]),
  minutesObjected: (p: { committee: string; title: string; by: string }) =>
    all((l) => ({
      en: { title: `Objection to minutes: ${p.committee}`, body: `${p.by} objected to the minutes of ${p.title}. Revise and circulate again.` },
      hi: { title: `कार्यवृत्त पर आपत्ति: ${p.committee}`, body: `${p.by} ने ${p.title} के कार्यवृत्त पर आपत्ति की। संशोधित कर फिर से भेजें।` },
      kn: { title: `ನಡಾವಳಿಗೆ ಆಕ್ಷೇಪಣೆ: ${p.committee}`, body: `${p.by} ಅವರು ${p.title} ರ ನಡಾವಳಿಗೆ ಆಕ್ಷೇಪಿಸಿದ್ದಾರೆ. ತಿದ್ದಿ ಮತ್ತೆ ಕಳುಹಿಸಿ.` },
    })[l]),
  policyToAcknowledge: (p: { title: string; version: number }) =>
    all((l) => ({
      en: { title: `Policy to read: ${p.title}`, body: `Version ${p.version} is published. Read it and acknowledge.` },
      hi: { title: `पढ़ने हेतु नीति: ${p.title}`, body: `संस्करण ${p.version} प्रकाशित है। पढ़कर स्वीकृति दें।` },
      kn: { title: `ಓದಬೇಕಾದ ನೀತಿ: ${p.title}`, body: `ಆವೃತ್ತಿ ${p.version} ಪ್ರಕಟವಾಗಿದೆ. ಓದಿ ಸ್ವೀಕೃತಿ ನೀಡಿ.` },
    })[l]),
  policyReminder: (p: { title: string; version: number }) =>
    all((l) => ({
      en: { title: `Reminder: acknowledge ${p.title}`, body: `You have not yet acknowledged version ${p.version}.` },
      hi: { title: `स्मरण: ${p.title} की स्वीकृति दें`, body: `आपने अभी तक संस्करण ${p.version} की स्वीकृति नहीं दी है।` },
      kn: { title: `ಜ್ಞಾಪನೆ: ${p.title} ಸ್ವೀಕರಿಸಿ`, body: `ನೀವು ಇನ್ನೂ ಆವೃತ್ತಿ ${p.version} ಸ್ವೀಕರಿಸಿಲ್ಲ.` },
    })[l]),
  deadlineReminder: (p: { title: string; dueOn: string; days: number }) =>
    all((l) => {
      const d = dateIn(l, p.dueOn);
      return {
        en: { title: `Due ${p.days === 0 ? 'today' : `in ${p.days} day(s)`}: ${p.title}`, body: `Compliance deadline ${d}.` },
        hi: { title: `${p.days === 0 ? 'आज' : `${p.days} दिन में`} देय: ${p.title}`, body: `अनुपालन की अंतिम तिथि ${d}।` },
        kn: { title: `${p.days === 0 ? 'ಇಂದು' : `${p.days} ದಿನಗಳಲ್ಲಿ`} ಬಾಕಿ: ${p.title}`, body: `ಅನುಸರಣೆಯ ಕೊನೆಯ ದಿನಾಂಕ ${d}.` },
      }[l];
    }),
  deadlineMissed: (p: { title: string; dueOn: string }) =>
    all((l) => {
      const d = dateIn(l, p.dueOn);
      return {
        en: { title: `Deadline passed: ${p.title}`, body: `It was due ${d} and is not marked done.` },
        hi: { title: `अंतिम तिथि निकल गई: ${p.title}`, body: `यह ${d} को देय था और पूरा चिह्नित नहीं है।` },
        kn: { title: `ಗಡುವು ಮೀರಿದೆ: ${p.title}`, body: `ಇದು ${d} ರಂದು ಬಾಕಿ ಇತ್ತು, ಪೂರ್ಣಗೊಂಡಿಲ್ಲ.` },
      }[l];
    }),
  rtiDue: (p: { no: string; dueOn: string; days: number }) =>
    all((l) => {
      const d = dateIn(l, p.dueOn);
      return {
        en: { title: `RTI ${p.no}: reply due ${p.days <= 0 ? 'now' : `in ${p.days} day(s)`}`, body: `The reply must reach the applicant by ${d}.` },
        hi: { title: `आरटीआई ${p.no}: उत्तर ${p.days <= 0 ? 'अभी' : `${p.days} दिन में`} देय`, body: `आवेदक को उत्तर ${d} तक मिल जाना चाहिए।` },
        kn: { title: `ಆರ್‌ಟಿಐ ${p.no}: ಉತ್ತರ ${p.days <= 0 ? 'ಈಗ' : `${p.days} ದಿನಗಳಲ್ಲಿ`} ಬಾಕಿ`, body: `ಅರ್ಜಿದಾರರಿಗೆ ${d} ರೊಳಗೆ ಉತ್ತರ ತಲುಪಬೇಕು.` },
      }[l];
    }),
  rtiAssigned: (p: { no: string; subject: string; dueOn: string }) =>
    all((l) => {
      const d = dateIn(l, p.dueOn);
      return {
        en: { title: `RTI request ${p.no} for you`, body: `${p.subject}. Reply by ${d}.` },
        hi: { title: `आपके लिए आरटीआई अनुरोध ${p.no}`, body: `${p.subject}। ${d} तक उत्तर दें।` },
        kn: { title: `ನಿಮಗೆ ಆರ್‌ಟಿಐ ಅರ್ಜಿ ${p.no}`, body: `${p.subject}. ${d} ರೊಳಗೆ ಉತ್ತರಿಸಿ.` },
      }[l];
    }),
};
