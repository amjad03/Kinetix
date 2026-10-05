import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { afterAll, describe, expect, it } from 'vitest';
import { importContent, type LibraryFile } from '../src/content/import.js';
import * as schema from '../src/db/schema.js';
import { ownerPool } from './helpers.js';

type Course = LibraryFile['courses'][number];
type Topic = Course['chapters'][number]['topics'][number];

const topic = (title: string, hook = `Why ${title}?`): Topic => ({ title, summary: '', notes: [`${title} note`], outcomes: [], resources: [], lesson: { hook, example: '', activity: '', questions: [], homework: '', terms: [] } });

/** Re-importing the library updates it in place: coverage, plans and videos keep their topics. */
describe('content import', () => {
  const owner = ownerPool();
  const db = drizzle(owner, { schema });
  const dir = mkdtempSync(join(tmpdir(), 'kinetix-content-'));
  const write = (chapters: Course['chapters'], file = 'lib.json', code = 'class-1-test') =>
    writeFileSync(
      join(dir, file),
      JSON.stringify({ curricula: [{ code: 'test-import', name: 'Import test', level: 'k12' }], courses: [{ curriculum: 'test-import', code, title: 'Test', term: 1, source: 'test', chapters }] }),
    );
  const outline = async () =>
    (
      await owner.query<{ chapter: string; chapter_id: string; topic: string | null; topic_id: string | null; hook: string | null }>(
        `select ch.title chapter, ch.id chapter_id, t.title topic, t.id topic_id, t.lesson->>'hook' hook
           from chapters ch join courses c on c.id = ch.course_id left join topics t on t.chapter_id = ch.id
          where c.curriculum_code = 'test-import' order by ch.position, t.position`,
      )
    ).rows;

  afterAll(async () => {
    rmSync(dir, { recursive: true, force: true });
    await owner.end();
  });

  it('keeps chapter and topic ids, and writes only what changed', async () => {
    write([
      { title: 'Numbers', topics: [topic('Counting'), topic('Zero')] },
      { title: 'Shapes', topics: [topic('Circles'), topic('Squares')] },
    ]);
    expect(await importContent(db, dir)).toMatchObject({ courses: 1, topics: 4, inserted: 4, updated: 0, deleted: 0 });
    const first = await outline();
    const id = (t: string) => first.find((r) => r.topic === t)!.topic_id;

    expect(await importContent(db, dir)).toMatchObject({ inserted: 0, updated: 0, deleted: 0 });
    expect(await outline()).toEqual(first);

    // Chapters swap, a topic is added in front, one is dropped and one gets a new hook.
    write([
      { title: 'Shapes', topics: [topic('Triangles'), topic('Circles', 'Is a wheel a circle?')] },
      { title: 'Numbers', topics: [topic('Counting'), topic('Zero')] },
    ]);
    expect(await importContent(db, dir)).toMatchObject({ inserted: 1, deleted: 1 });
    const after = await outline();
    expect(after.map((r) => [r.chapter, r.topic])).toEqual([
      ['Shapes', 'Triangles'],
      ['Shapes', 'Circles'],
      ['Numbers', 'Counting'],
      ['Numbers', 'Zero'],
    ]);
    expect(after.find((r) => r.topic === 'Circles')).toMatchObject({ topic_id: id('Circles'), hook: 'Is a wheel a circle?' });
    expect(after.find((r) => r.topic === 'Counting')!.topic_id).toBe(id('Counting'));
    expect(after.find((r) => r.topic === 'Zero')!.topic_id).toBe(id('Zero'));
    expect(after.find((r) => r.chapter === 'Numbers')!.chapter_id).toBe(first.find((r) => r.chapter === 'Numbers')!.chapter_id);
    expect(after.some((r) => r.topic_id === id('Squares'))).toBe(false);
  });

  it('refuses a course that two files both define', async () => {
    write([{ title: 'Numbers', topics: [] }], 'other.json');
    await expect(importContent(db, dir)).rejects.toThrow('Course test-import/class-1-test is in both lib.json and other.json');
    rmSync(join(dir, 'other.json'));
  });

  it('re-imports the shipped library without changing anything', async () => {
    expect(await importContent(db)).toMatchObject({ inserted: 0, updated: 0, deleted: 0 });
  });
});
