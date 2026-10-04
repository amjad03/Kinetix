import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { z } from 'zod';
import * as s from '../db/schema.js';
const Topic = z.object({
    title: z.string().min(1),
    summary: z.string().default(''),
    notes: z.array(z.string()).default([]),
    outcomes: z.array(z.string()).default([]),
});
const LibraryFile = z.object({
    curricula: z.array(z.object({ code: z.string().min(1), name: z.string().min(1), level: z.enum(['k12', 'ug', 'pg', 'diploma', 'phd']) })).default([]),
    courses: z
        .array(z.object({
        curriculum: z.string().min(1),
        code: z.string().min(1),
        title: z.string().min(1),
        term: z.number().int(),
        language: z.enum(['en', 'hi', 'kn']).default('en'),
        source: z.string().min(1),
        reviewed: z.boolean().default(false),
        chapters: z.array(z.object({ title: z.string().min(1), topics: z.array(Topic).default([]) })),
    }))
        .default([]),
});
export const CONTENT_DIR = fileURLToPath(new URL('../../content/', import.meta.url));
/**
 * Loads the global content library from JSON files. Idempotent: courses match by curriculum
 * and code, global chapters and topics by position, so ids stay stable across imports.
 * Runs on the owner connection (global rows are not writable by the application role).
 */
export async function importContent(db, dir = CONTENT_DIR) {
    const files = (await readdir(dir)).filter((f) => f.endsWith('.json')).sort();
    let courses = 0;
    let topics = 0;
    await db.transaction(async (tx) => {
        for (const file of files) {
            const lib = LibraryFile.parse(JSON.parse(await readFile(`${dir}/${file}`, 'utf8')));
            for (const c of lib.curricula) {
                await tx.insert(s.curricula).values(c).onConflictDoUpdate({ target: s.curricula.code, set: { name: c.name, level: c.level } });
            }
            for (const c of lib.courses) {
                const values = { curriculumCode: c.curriculum, code: c.code, title: c.title, term: c.term, language: c.language, source: c.source, reviewed: c.reviewed, updatedAt: new Date() };
                const [course] = await tx
                    .insert(s.courses)
                    .values(values)
                    .onConflictDoUpdate({ target: [s.courses.curriculumCode, s.courses.code], set: values })
                    .returning();
                courses++;
                for (const [ci, ch] of c.chapters.entries()) {
                    const where = and(eq(s.chapters.courseId, course.id), isNull(s.chapters.tenantId), eq(s.chapters.position, ci + 1));
                    let [chapter] = await tx.select().from(s.chapters).where(where);
                    if (chapter)
                        await tx.update(s.chapters).set({ title: ch.title }).where(eq(s.chapters.id, chapter.id));
                    else
                        [chapter] = await tx.insert(s.chapters).values({ courseId: course.id, position: ci + 1, title: ch.title }).returning();
                    for (const [ti, t] of ch.topics.entries()) {
                        const tWhere = and(eq(s.topics.chapterId, chapter.id), isNull(s.topics.tenantId), eq(s.topics.position, ti + 1));
                        const [existing] = await tx.select({ id: s.topics.id }).from(s.topics).where(tWhere);
                        const tv = { title: t.title, summary: t.summary, notes: t.notes, outcomes: t.outcomes, updatedAt: new Date() };
                        if (existing)
                            await tx.update(s.topics).set(tv).where(eq(s.topics.id, existing.id));
                        else
                            await tx.insert(s.topics).values({ ...tv, chapterId: chapter.id, position: ti + 1 });
                        topics++;
                    }
                    await tx.delete(s.topics).where(and(eq(s.topics.chapterId, chapter.id), isNull(s.topics.tenantId), gt(s.topics.position, ch.topics.length)));
                }
                await tx.delete(s.chapters).where(and(eq(s.chapters.courseId, course.id), isNull(s.chapters.tenantId), gt(s.chapters.position, c.chapters.length)));
            }
        }
    });
    return { courses, topics };
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    importContent(drizzle(pool, { schema: s }))
        .then((r) => console.log(`Imported ${r.courses} courses, ${r.topics} topics`))
        .finally(() => pool.end());
}
//# sourceMappingURL=import.js.map