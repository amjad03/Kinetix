import { and, eq } from 'drizzle-orm';
import type { Tx } from '../db/db.service.js';
import { examResults, resultWithholds } from '../db/schema.js';
import type { NotificationsService } from '../notifications/notifications.service.js';

const REASON_WORDS: Record<string, { en: string; hi: string; kn: string }> = {
  malpractice: { en: 'a malpractice inquiry', hi: 'अनुचित साधन की जाँच', kn: 'ಅಕ್ರಮ ವಿಚಾರಣೆ' },
  fees: { en: 'pending fees', hi: 'बकाया शुल्क', kn: 'ಬಾಕಿ ಶುಲ್ಕ' },
  documents: { en: 'pending documents', hi: 'बकाया दस्तावेज़', kn: 'ಬಾಕಿ ದಾಖಲೆಗಳು' },
  attendance: { en: 'an attendance shortage', hi: 'उपस्थिति की कमी', kn: 'ಹಾಜರಾತಿ ಕೊರತೆ' },
  inquiry: { en: 'an inquiry', hi: 'एक जाँच', kn: 'ಒಂದು ವಿಚಾರಣೆ' },
  other: { en: 'an office matter', hi: 'कार्यालय का एक मामला', kn: 'ಕಚೇರಿಯ ಒಂದು ವಿಷಯ' },
};

/**
 * Tells each candidate and their family that the session's result is out, with the SGPA and the outcome; a
 * candidate whose result is withheld is told it is withheld and why, never the figures.
 */
export async function notifyResults(tx: Tx, notes: NotificationsService, sessionId: string, name: string): Promise<{ told: number; withheld: number }> {
  const results = await tx.select({ studentId: examResults.studentId, sgpa: examResults.sgpa, outcome: examResults.outcome }).from(examResults).where(eq(examResults.sessionId, sessionId));
  const held = new Map((await tx.select({ studentId: resultWithholds.studentId, reason: resultWithholds.reason }).from(resultWithholds).where(and(eq(resultWithholds.sessionId, sessionId), eq(resultWithholds.status, 'held')))).map((h) => [h.studentId, h.reason]));
  for (const r of results) {
    const reason = held.get(r.studentId);
    if (reason) {
      const w = REASON_WORDS[reason] ?? REASON_WORDS.other;
      await notes.examNotice(tx, [r.studentId], {
        kind: 'marks',
        text: {
          en: { title: 'Result withheld', body: `Your result for ${name} is withheld because of ${w.en}. Contact the examination office.` },
          hi: { title: 'परिणाम रोका गया', body: `${name} का आपका परिणाम ${w.hi} के कारण रोका गया है। परीक्षा कार्यालय से संपर्क करें।` },
          kn: { title: 'ಫಲಿತಾಂಶ ತಡೆಹಿಡಿಯಲಾಗಿದೆ', body: `${name} ನಿಮ್ಮ ಫಲಿತಾಂಶವನ್ನು ${w.kn} ಕಾರಣದಿಂದ ತಡೆಹಿಡಿಯಲಾಗಿದೆ. ಪರೀಕ್ಷಾ ಕಚೇರಿಯನ್ನು ಸಂಪರ್ಕಿಸಿ.` },
        },
        data: { sessionId, withheld: 'true' },
        dedupeKey: `result:${sessionId}:${r.studentId}`,
      });
      continue;
    }
    const pass = r.outcome === 'pass';
    await notes.examNotice(tx, [r.studentId], {
      kind: 'marks',
      text: {
        en: { title: 'Result published', body: `${name}: ${pass ? 'Passed' : 'Not passed'}, SGPA ${r.sgpa}.` },
        hi: { title: 'परिणाम घोषित', body: `${name}: ${pass ? 'उत्तीर्ण' : 'अनुत्तीर्ण'}, SGPA ${r.sgpa}.` },
        kn: { title: 'ಫಲಿತಾಂಶ ಪ್ರಕಟ', body: `${name}: ${pass ? 'ಉತ್ತೀರ್ಣ' : 'ಅನುತ್ತೀರ್ಣ'}, SGPA ${r.sgpa}.` },
      },
      data: { sessionId },
      dedupeKey: `result:${sessionId}:${r.studentId}`,
    });
  }
  return { told: results.length, withheld: held.size };
}

/** Tells a candidate their withheld result has been released. */
export async function notifyReleased(tx: Tx, notes: NotificationsService, sessionId: string, name: string, studentId: string): Promise<void> {
  await notes.examNotice(tx, [studentId], {
    kind: 'marks',
    text: {
      en: { title: 'Result released', body: `Your result for ${name} has been released. You can see it now.` },
      hi: { title: 'परिणाम जारी', body: `${name} का आपका परिणाम जारी कर दिया गया है। अब आप इसे देख सकते हैं।` },
      kn: { title: 'ಫಲಿತಾಂಶ ಬಿಡುಗಡೆ', body: `${name} ನಿಮ್ಮ ಫಲಿತಾಂಶ ಬಿಡುಗಡೆಯಾಗಿದೆ. ಈಗ ನೋಡಬಹುದು.` },
    },
    data: { sessionId },
    dedupeKey: `result-release:${sessionId}:${studentId}`,
  });
}
