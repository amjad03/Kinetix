import { eq, sql } from 'drizzle-orm';
import type { Tx } from '../db/db.service.js';
import { admissionCycles, calendarEvents, examSessions, meritLists } from '../db/schema.js';

export interface FeedResult {
  synced: number;
  admissions: number;
  exams: number;
}

/**
 * Puts admission windows and results, exam sessions and result days on the institution calendar. Each entry is keyed by what it
 * comes from, so running it again updates the entry instead of repeating it. Called when a cycle opens, a merit list or exam
 * results are published, an exam is scheduled, and from the "update the calendar" button.
 */
export async function feedCalendar(tx: Tx, tenantId: string, userId: string): Promise<FeedResult> {
  const entries: { source: 'admissions' | 'exams'; ref: string; kind: 'event' | 'exam'; title: string; startsOn: string; endsOn: string }[] = [];
  for (const c of await tx.select().from(admissionCycles).where(sql`${admissionCycles.status} <> 'draft'`)) {
    entries.push({ source: 'admissions', ref: `cycle:${c.id}`, kind: 'event', title: `Admissions open: ${c.name}`, startsOn: c.opensOn, endsOn: c.closesOn });
  }
  const lists = await tx
    .select({ id: meritLists.id, version: meritLists.version, publishedAt: meritLists.publishedAt, name: admissionCycles.name })
    .from(meritLists)
    .innerJoin(admissionCycles, eq(admissionCycles.id, meritLists.cycleId))
    .where(sql`${meritLists.publishedAt} is not null`);
  for (const m of lists) {
    const day = m.publishedAt!.toISOString().slice(0, 10);
    entries.push({ source: 'admissions', ref: `merit:${m.id}`, kind: 'event', title: `Admission results: ${m.name} (list ${m.version})`, startsOn: day, endsOn: day });
  }
  for (const s of await tx.select().from(examSessions).where(sql`${examSessions.status} <> 'draft'`)) {
    entries.push({ source: 'exams', ref: `session:${s.id}`, kind: 'exam', title: s.name, startsOn: s.startsOn, endsOn: s.endsOn });
    if (s.publishedAt) {
      const day = s.publishedAt.toISOString().slice(0, 10);
      entries.push({ source: 'exams', ref: `result:${s.id}`, kind: 'event', title: `Results published: ${s.name}`, startsOn: day, endsOn: day });
    }
  }
  for (const e of entries) {
    const values = { kind: e.kind, title: e.title, startsOn: e.startsOn, endsOn: e.endsOn };
    await tx
      .insert(calendarEvents)
      .values({ tenantId, ...values, source: e.source, sourceRef: e.ref, createdBy: userId })
      .onConflictDoUpdate({ target: [calendarEvents.tenantId, calendarEvents.source, calendarEvents.sourceRef], targetWhere: sql`${calendarEvents.source} is not null`, set: values });
  }
  return { synced: entries.length, admissions: entries.filter((e) => e.source === 'admissions').length, exams: entries.filter((e) => e.source === 'exams').length };
}
