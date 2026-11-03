import { and, desc, eq, inArray } from 'drizzle-orm';
import type { Tx } from '../db/db.service.js';
import { attendanceDetentionEntries, attendanceDetentionLists } from '../db/schema-academic-ops.js';
import { students } from '../db/schema.js';
import { attendancePolicy, attendanceWindow, eligibilityFor } from './policy.js';

/**
 * Why attendance holds back each student's hall ticket (students not in the map are clear), under each class's own
 * policy (threshold from the programme, rule or university profile; per subject or overall; the condonation floor):
 *
 * - on the latest published detention list as detained: held, whatever the live figure says (the list is the
 *   institution's decision; withdraw and republish it to change it);
 * - otherwise short today (live figures, condonation applied): held, as detained or as condonable with the gap.
 */
export async function attendanceHolds(tx: Tx, studentIds: string[], today: string): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!studentIds.length) return out;
  const listed = await tx
    .select({ studentId: attendanceDetentionEntries.studentId, status: attendanceDetentionEntries.status, effective: attendanceDetentionEntries.effectivePct, threshold: attendanceDetentionEntries.thresholdPct, title: attendanceDetentionLists.title })
    .from(attendanceDetentionEntries)
    .innerJoin(attendanceDetentionLists, eq(attendanceDetentionLists.id, attendanceDetentionEntries.listId))
    .where(and(inArray(attendanceDetentionEntries.studentId, studentIds), eq(attendanceDetentionLists.status, 'published')))
    .orderBy(desc(attendanceDetentionLists.publishedAt));
  const seen = new Set<string>();
  for (const l of listed) {
    if (seen.has(l.studentId)) continue;
    seen.add(l.studentId);
    if (l.status === 'detained') out.set(l.studentId, `Detained for shortage of attendance (${l.effective ?? 0}% against ${l.threshold}%, ${l.title})`);
  }
  const rows = await tx.select({ id: students.id, sectionId: students.sectionId }).from(students).where(inArray(students.id, studentIds));
  const bySection = new Map<string, string[]>();
  for (const r of rows) if (!out.has(r.id)) bySection.set(r.sectionId, [...(bySection.get(r.sectionId) ?? []), r.id]);
  for (const [sectionId, ids] of bySection) {
    const policy = await attendancePolicy(tx, sectionId);
    const window = await attendanceWindow(tx, sectionId, today);
    for (const e of await eligibilityFor(tx, ids, policy, window)) {
      if (e.status === 'eligible') continue;
      const where = e.shortIn.includes('overall') || !e.shortIn.length ? `${e.overall.effective ?? 0}%` : e.subjects.filter((s) => e.shortIn.includes(s.subjectId)).map((s) => `${s.code} ${s.effective ?? 0}%`).join(', ');
      out.set(e.studentId, e.status === 'detained' ? `Detained for shortage of attendance (${where} against ${policy.thresholdPct}%)` : `Attendance short (${where} against ${policy.thresholdPct}%); condonation not yet approved`);
    }
  }
  return out;
}
