import { eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Tx } from '../db/db.service.js';
import { lmsSettings } from '../db/schema-lms.js';
import type { Localized } from '../notifications/texts.js';

/** The institution's LMS rules. Every key is read by the LMS code, so a saved value changes behaviour. */
export const LmsSettingsSchema = z.object({
  /** open: posts appear at once; hold_students: a student's new discussion or reply waits for a teacher. */
  forumModeration: z.enum(['open', 'hold_students']).default('open'),
  /** A post is hidden for review once this many members report it (0 = never by itself). */
  forumAutoHideReports: z.number().int().min(0).max(50).default(3),
  /** Minutes an author may edit their own post. */
  forumEditMinutes: z.number().int().min(0).max(1440).default(15),
  /** Check each typed hand-in against the class's other hand-ins when it arrives. */
  plagiarismAutoCheck: z.boolean().default(true),
  /** Similarity (share of shared five-word phrases) at which a teacher is told. */
  plagiarismThresholdPct: z.number().int().min(10).max(100).default(40),
  /** At risk in a course: no activity for this many days. */
  atRiskInactiveDays: z.number().int().min(1).max(90).default(7),
  /** ... opened less than this share of the course's items. */
  atRiskEngagementBelowPct: z.number().int().min(0).max(100).default(40),
  /** ... averages below this on the course's quizzes. */
  atRiskQuizBelowPct: z.number().int().min(0).max(100).default(40),
  /** ... has this many homework of the course overdue. */
  atRiskOverdueCount: z.number().int().min(1).max(50).default(2),
  /** A live-class join this many minutes after the start counts as late. */
  liveLateAfterMin: z.number().int().min(0).max(120).default(10),
  /** Students may download their own certificate as soon as they meet the course's rules. */
  certificateSelfClaim: z.boolean().default(true),
});
export type LmsSettings = z.infer<typeof LmsSettingsSchema>;
export const LmsSettingsPatch = LmsSettingsSchema.partial().strict();

/** Defaults with the institution's saved values on top; a value that no longer fits falls back to the default. */
export function effectiveLmsSettings(stored: Record<string, unknown> | null | undefined): LmsSettings {
  const base = LmsSettingsSchema.parse({});
  if (!stored) return base;
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(stored)) {
    const field = (LmsSettingsSchema.shape as Record<string, z.ZodType>)[k];
    if (field && field.safeParse(v).success) out[k] = v;
  }
  return out as LmsSettings;
}

export async function lmsSettingsOf(tx: Tx, tenantId: string): Promise<LmsSettings> {
  const [row] = await tx.select({ s: lmsSettings.settings }).from(lmsSettings).where(eq(lmsSettings.tenantId, tenantId));
  return effectiveLmsSettings(row?.s);
}

/** LMS notification texts in English, Hindi and Kannada. */
export const lmsTexts = {
  forumReply: (v: { title: string; author: string }): Localized => ({
    en: { title: `New reply: ${v.title}`, body: `${v.author} replied to your discussion.` },
    hi: { title: `नया जवाब: ${v.title}`, body: `${v.author} ने आपकी चर्चा का जवाब दिया।` },
    kn: { title: `ಹೊಸ ಉತ್ತರ: ${v.title}`, body: `${v.author} ನಿಮ್ಮ ಚರ್ಚೆಗೆ ಉತ್ತರಿಸಿದ್ದಾರೆ.` },
  }),
  forumReported: (v: { title: string; course: string }): Localized => ({
    en: { title: `Post reported: ${v.title}`, body: `A member of ${v.course} reported a post. Open the moderation queue.` },
    hi: { title: `पोस्ट की शिकायत: ${v.title}`, body: `${v.course} के एक सदस्य ने एक पोस्ट की शिकायत की है। मॉडरेशन सूची खोलें।` },
    kn: { title: `ಪೋಸ್ಟ್ ವರದಿ: ${v.title}`, body: `${v.course} ಸದಸ್ಯರೊಬ್ಬರು ಪೋಸ್ಟ್ ಬಗ್ಗೆ ವರದಿ ಮಾಡಿದ್ದಾರೆ. ಮಾಡರೇಶನ್ ಪಟ್ಟಿ ತೆರೆಯಿರಿ.` },
  }),
  liveScheduled: (v: { title: string; course: string; when: string }): Localized => ({
    en: { title: `Live class: ${v.title}`, body: `${v.course}, ${v.when}. Join from the app.` },
    hi: { title: `लाइव कक्षा: ${v.title}`, body: `${v.course}, ${v.when}। ऐप से जुड़ें।` },
    kn: { title: `ಲೈವ್ ತರಗತಿ: ${v.title}`, body: `${v.course}, ${v.when}. ಆ್ಯಪ್‌ನಿಂದ ಸೇರಿ.` },
  }),
  certificateIssued: (v: { course: string; name: string }): Localized => ({
    en: { title: `Certificate: ${v.course}`, body: `${v.name} has completed ${v.course}. The certificate can be downloaded.` },
    hi: { title: `प्रमाणपत्र: ${v.course}`, body: `${v.name} ने ${v.course} पूरा कर लिया है। प्रमाणपत्र डाउनलोड किया जा सकता है।` },
    kn: { title: `ಪ್ರಮಾಣಪತ್ರ: ${v.course}`, body: `${v.name} ${v.course} ಪೂರ್ಣಗೊಳಿಸಿದ್ದಾರೆ. ಪ್ರಮಾಣಪತ್ರವನ್ನು ಡೌನ್‌ಲೋಡ್ ಮಾಡಬಹುದು.` },
  }),
  similarity: (v: { title: string; pct: number }): Localized => ({
    en: { title: `Similar hand-ins: ${v.title}`, body: `A hand-in is ${v.pct}% similar to a classmate's. Review it before marking.` },
    hi: { title: `मिलते-जुलते उत्तर: ${v.title}`, body: `एक जमा किया गया काम सहपाठी के काम से ${v.pct}% मिलता है। अंक देने से पहले देखें।` },
    kn: { title: `ಹೋಲುವ ಸಲ್ಲಿಕೆಗಳು: ${v.title}`, body: `ಒಂದು ಸಲ್ಲಿಕೆ ಸಹಪಾಠಿಯದಕ್ಕೆ ${v.pct}% ಹೋಲುತ್ತದೆ. ಅಂಕ ನೀಡುವ ಮೊದಲು ಪರಿಶೀಲಿಸಿ.` },
  }),
};
