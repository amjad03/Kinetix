import { and, eq, ne } from 'drizzle-orm';
import type { Tx } from '../db/db.service.js';
import { homework, homeworkSubmissions } from '../db/schema.js';
import type { EventBus } from '../events/events.js';
import { containment, MIN_WORDS, shingles, words } from '../integrity/similarity.js';
import { lmsSettingsOf, lmsTexts } from '../lms/lms-settings.js';
import type { NotificationsService } from '../notifications/notifications.service.js';

/** Highest similarity (percent, two decimals) of one text against others; 0 when either is too short to compare. */
export function highestSimilarity(text: string, others: string[]): number {
  const w = words(text);
  if (w.length < MIN_WORDS) return 0;
  const mine = shingles(w);
  let best = 0;
  for (const o of others) {
    const ow = words(o);
    if (ow.length < MIN_WORDS) continue;
    best = Math.max(best, containment(mine, shingles(ow)));
  }
  return Math.round(best * 10000) / 100;
}

/**
 * The plagiarism hook on every typed hand-in: compares it with the class's other hand-ins of the same homework (group
 * mates excepted), keeps the highest similarity on the submission (and raises the other one's if it is now higher),
 * tells the teacher when it crosses the institution's threshold, and announces `homework.submission_received` so an
 * external checker (Turnitin, Urkund) connected through the integrations can take the text too. A flag is a prompt
 * to look, never a finding.
 */
export async function plagiarismHook(tx: Tx, deps: { events: EventBus; notifications: NotificationsService }, a: { tenantId: string; homeworkId: string; studentId: string; text: string; groupMates: string[] }): Promise<number | null> {
  const s = await lmsSettingsOf(tx, a.tenantId);
  await deps.events.emit(tx, a.tenantId, { type: 'homework.submission_received', aggregateType: 'homework', aggregateId: a.homeworkId, payload: { studentId: a.studentId, words: words(a.text).length } });
  if (!s.plagiarismAutoCheck || words(a.text).length < MIN_WORDS) return null;
  const skip = new Set([a.studentId, ...a.groupMates]);
  const others = (await tx.select({ studentId: homeworkSubmissions.studentId, text: homeworkSubmissions.text, pct: homeworkSubmissions.similarityPct }).from(homeworkSubmissions).where(and(eq(homeworkSubmissions.homeworkId, a.homeworkId), ne(homeworkSubmissions.studentId, a.studentId)))).filter((o) => !skip.has(o.studentId));
  const pct = highestSimilarity(a.text, others.map((o) => o.text));
  for (const sid of [a.studentId, ...a.groupMates]) await tx.update(homeworkSubmissions).set({ similarityPct: pct }).where(and(eq(homeworkSubmissions.homeworkId, a.homeworkId), eq(homeworkSubmissions.studentId, sid)));
  // The earlier hand-in that this one matches is as similar to it.
  for (const o of others) {
    const back = highestSimilarity(o.text, [a.text]);
    if (back > Number(o.pct ?? 0)) await tx.update(homeworkSubmissions).set({ similarityPct: back }).where(and(eq(homeworkSubmissions.homeworkId, a.homeworkId), eq(homeworkSubmissions.studentId, o.studentId)));
  }
  if (pct >= s.plagiarismThresholdPct) {
    const [hw] = await tx.select({ title: homework.title, createdBy: homework.createdBy }).from(homework).where(eq(homework.id, a.homeworkId));
    await deps.notifications.notifyUsers(tx, [hw.createdBy], { kind: 'homework', text: lmsTexts.similarity({ title: hw.title, pct: Math.round(pct) }), data: { homeworkId: a.homeworkId, studentId: a.studentId }, dedupeKey: `lms-similarity:${a.homeworkId}:${a.studentId}` }, { replace: true });
    await deps.events.emit(tx, a.tenantId, { type: 'homework.similarity_flagged', aggregateType: 'homework', aggregateId: a.homeworkId, payload: { studentId: a.studentId, similarityPct: pct } });
  }
  return pct;
}
