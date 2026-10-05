import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { z } from 'zod';
import * as s from '../db/schema.js';

const lessonText = {
  hook: z.string().default(''),
  example: z.string().default(''),
  exampleTex: z.string().min(1).optional(),
  activity: z.string().default(''),
  questions: z.array(z.object({ q: z.string().min(1), a: z.string() })).default([]),
  homework: z.string().default(''),
  terms: z.array(z.string().min(1)).default([]),
};
const LessonVariant = z.object({ ...lessonText, title: z.string().min(1).optional(), notes: z.array(z.string()).default([]), outcomes: z.array(z.string()).default([]) });
/** A topic's full lesson (see TopicLesson in the schema), with Hindi and Kannada versions. */
export const Lesson = z.object({ ...lessonText, hi: LessonVariant.optional(), kn: LessonVariant.optional() });

const Topic = z.object({
  title: z.string().min(1),
  summary: z.string().default(''),
  notes: z.array(z.string()).default([]),
  outcomes: z.array(z.string()).default([]),
  /** 3D models and labs on the board: ids from packages/kinetix_3d and packages/kinetix_labs. */
  resources: z.array(z.object({ kind: z.enum(['model3d', 'lab']), id: z.string().min(1), title: z.string().min(1) })).default([]),
  lesson: Lesson.optional(),
});

export const LibraryFile = z.object({
  curricula: z.array(z.object({ code: z.string().min(1), name: z.string().min(1), level: z.enum(['k12', 'ug', 'pg', 'diploma', 'phd']) })).default([]),
  courses: z
    .array(
      z.object({
        curriculum: z.string().min(1),
        code: z.string().min(1),
        title: z.string().min(1),
        /** Class (K-12: LKG is -1, UKG 0) or semester. */
        term: z.number().int(),
        language: z.enum(['en', 'hi', 'kn']).default('en'),
        source: z.string().min(1),
        reviewed: z.boolean().default(false),
        chapters: z.array(z.object({ title: z.string().min(1), topics: z.array(Topic).default([]) })),
      }),
    )
    .default([]),
});
export type LibraryFile = z.infer<typeof LibraryFile>;

export const CONTENT_DIR = fileURLToPath(new URL('../../content/', import.meta.url));

/**
 * Pairs incoming chapters or topics with the library's existing rows: the same title first
 * (nearest position wins among equal titles), then the same position among the rows left. So a
 * topic keeps its id when others are added, removed or reordered around it, and a retitled one
 * keeps its id when it stays in place. Rows left unpaired are no longer in the library.
 */
export function pairRows<R extends { title: string; position: number }>(existing: R[], incoming: { title: string }[]): { pairs: (R | undefined)[]; unused: R[] } {
  const free = new Set(existing);
  const pairs: (R | undefined)[] = incoming.map((item, i) => {
    let best: R | undefined;
    for (const r of free) if (r.title === item.title && (!best || Math.abs(r.position - (i + 1)) < Math.abs(best.position - (i + 1)))) best = r;
    if (best) free.delete(best);
    return best;
  });
  for (const [i, p] of pairs.entries()) {
    if (p) continue;
    const r = [...free].find((x) => x.position === i + 1);
    if (r) {
      pairs[i] = r;
      free.delete(r);
    }
  }
  return { pairs, unused: [...free] };
}

/** JSON equality that ignores key order (jsonb comes back with its keys reordered). */
function sameJson(a: unknown, b: unknown): boolean {
  const canon = (v: unknown): unknown =>
    Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).filter(([, x]) => x !== undefined).sort(([x], [y]) => (x < y ? -1 : 1)).map(([k, x]) => [k, canon(x)])) : v;
  return JSON.stringify(canon(a ?? null)) === JSON.stringify(canon(b ?? null));
}

export interface ImportResult {
  courses: number;
  topics: number;
  inserted: number;
  updated: number;
  deleted: number;
}

/**
 * Loads the global content library from JSON files. Idempotent: courses match by curriculum and
 * code, global chapters and topics by title then position (see pairRows), and rows are written
 * only when they changed, so ids stay stable across imports and everything that refers to a
 * topic (coverage, plans, videos) keeps pointing at it. Global rows no longer in the files are
 * removed. Runs on the owner connection (global rows are not writable by the application role).
 */
export async function importContent(db: NodePgDatabase<typeof s>, dir = CONTENT_DIR): Promise<ImportResult> {
  const files = (await readdir(dir)).filter((f) => f.endsWith('.json')).sort();
  const r: ImportResult = { courses: 0, topics: 0, inserted: 0, updated: 0, deleted: 0 };
  const seen = new Map<string, string>();
  await db.transaction(async (tx) => {
    for (const file of files) {
      const lib = LibraryFile.parse(JSON.parse(await readFile(`${dir}/${file}`, 'utf8')));
      for (const c of lib.curricula) {
        await tx.insert(s.curricula).values(c).onConflictDoUpdate({ target: s.curricula.code, set: { name: c.name, level: c.level } });
      }
      for (const c of lib.courses) {
        // Two files writing one course would fight over its chapters on every import.
        const key = `${c.curriculum}/${c.code}`;
        if (seen.has(key)) throw new Error(`Course ${key} is in both ${seen.get(key)} and ${file}`);
        seen.set(key, file);

        const values = { curriculumCode: c.curriculum, code: c.code, title: c.title, term: c.term, language: c.language, source: c.source, reviewed: c.reviewed, updatedAt: new Date() };
        const [course] = await tx
          .insert(s.courses)
          .values(values)
          .onConflictDoUpdate({ target: [s.courses.curriculumCode, s.courses.code], set: values })
          .returning();
        r.courses++;

        const oldChapters = await tx
          .select({ id: s.chapters.id, title: s.chapters.title, position: s.chapters.position })
          .from(s.chapters)
          .where(and(eq(s.chapters.courseId, course.id), isNull(s.chapters.tenantId)))
          .orderBy(asc(s.chapters.position));
        const ch = pairRows(oldChapters, c.chapters);
        const chapterIds: string[] = [];
        for (const [i, row] of ch.pairs.entries()) {
          const want = { title: c.chapters[i].title, position: i + 1 };
          if (!row) {
            const [added] = await tx.insert(s.chapters).values({ courseId: course.id, ...want }).returning({ id: s.chapters.id });
            chapterIds.push(added.id);
            continue;
          }
          if (row.title !== want.title || row.position !== want.position) await tx.update(s.chapters).set(want).where(eq(s.chapters.id, row.id));
          chapterIds.push(row.id);
        }

        const oldTopics = chapterIds.length
          ? await tx
              .select({ id: s.topics.id, chapterId: s.topics.chapterId, position: s.topics.position, title: s.topics.title, summary: s.topics.summary, notes: s.topics.notes, outcomes: s.topics.outcomes, resources: s.topics.resources, lesson: s.topics.lesson })
              .from(s.topics)
              .where(and(inArray(s.topics.chapterId, chapterIds), isNull(s.topics.tenantId)))
          : [];
        const toInsert: (typeof s.topics.$inferInsert)[] = [];
        const gone: string[] = [];
        for (const [ci, chapter] of c.chapters.entries()) {
          const chapterId = chapterIds[ci];
          const tp = pairRows(oldTopics.filter((t) => t.chapterId === chapterId).sort((a, b) => a.position - b.position), chapter.topics);
          for (const [ti, t] of chapter.topics.entries()) {
            const want = { position: ti + 1, title: t.title, summary: t.summary, notes: t.notes, outcomes: t.outcomes, resources: t.resources, lesson: t.lesson ?? null };
            const row = tp.pairs[ti];
            r.topics++;
            if (!row) toInsert.push({ ...want, chapterId });
            else if (!sameJson({ ...row, id: undefined, chapterId: undefined }, want)) {
              await tx.update(s.topics).set({ ...want, updatedAt: new Date() }).where(eq(s.topics.id, row.id));
              r.updated++;
            }
          }
          gone.push(...tp.unused.map((t) => t.id));
        }
        // Batches stay well under Postgres's limit of 65,535 parameters per statement.
        for (let i = 0; i < toInsert.length; i += 500) await tx.insert(s.topics).values(toInsert.slice(i, i + 500));
        r.inserted += toInsert.length;
        if (gone.length) await tx.delete(s.topics).where(inArray(s.topics.id, gone));
        if (ch.unused.length) {
          r.deleted += (await tx.select({ id: s.topics.id }).from(s.topics).where(and(inArray(s.topics.chapterId, ch.unused.map((x) => x.id)), isNull(s.topics.tenantId)))).length;
          await tx.delete(s.chapters).where(inArray(s.chapters.id, ch.unused.map((x) => x.id)));
        }
        r.deleted += gone.length;
      }
    }
  });
  return r;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  importContent(drizzle(pool, { schema: s }))
    .then((r) => console.log(`Imported ${r.courses} courses, ${r.topics} topics (${r.inserted} new, ${r.updated} changed, ${r.deleted} removed)`))
    .finally(() => pool.end());
}
