import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildSyllabus, catalogues, libraryJson, reviewMarkdown, SOURCES } from '../scripts/build-syllabus.js';
import { CONTENT_DIR, LibraryFile } from '../src/content/import.js';

const built = buildSyllabus();
const files = readdirSync(CONTENT_DIR).filter((f) => f.endsWith('.json')).sort();
const library = new Map(files.map((f) => [f, LibraryFile.parse(JSON.parse(readFileSync(join(CONTENT_DIR, f), 'utf8')))]));

/** Every content file, and the university syllabus files built from content/sources. */
describe('content library files', () => {
  it('parse, and define each course once', () => {
    const seen = new Map<string, string>();
    for (const [file, lib] of library) {
      for (const c of lib.courses) {
        const key = `${c.curriculum}/${c.code}`;
        expect(seen.get(key), `${key} in ${file}`).toBeUndefined();
        seen.set(key, file);
        const chapters = c.chapters.map((ch) => ch.title);
        expect(new Set(chapters).size, `${key}: duplicate unit`).toBe(chapters.length);
        for (const ch of c.chapters) expect(new Set(ch.topics.map((t) => t.title)).size, `${key} / ${ch.title}: duplicate topic`).toBe(ch.topics.length);
      }
    }
  });

  it('are in step with their sources (rebuild with pnpm content:build-syllabus)', () => {
    expect(built.libraries.size).toBeGreaterThan(0);
    for (const [file, lib] of built.libraries) expect(readFileSync(join(CONTENT_DIR, `${file}.json`), 'utf8'), file).toBe(libraryJson(lib));
    expect(readFileSync(join(SOURCES, 'REVIEW.md'), 'utf8')).toBe(reviewMarkdown(built));
  });

  it('give university courses unique codes, the right curricula and full topics', () => {
    const { labs, models } = catalogues();
    const levels: Record<string, string> = { 'bu-ug': 'ug', 'bu-pg': 'pg', 'kslu-law': 'ug' };
    const codes = new Set<string>();
    for (const [file, raw] of built.libraries) {
      const lib = library.get(`${file}.json`)!;
      expect(lib).toEqual(LibraryFile.parse(raw));
      for (const c of lib.curricula) expect(c.level, c.code).toBe(levels[c.code]);
      for (const c of lib.courses) {
        // The seed and admins find a course by its code alone.
        expect(codes.has(c.code), c.code).toBe(false);
        codes.add(c.code);
        expect(Object.keys(levels)).toContain(c.curriculum);
        expect(c.source).toMatch(/^kinetix-curriculum-team from public (BU|KSLU) syllabus \(.+, 20\d\d-\d\d\)/);
        expect(c.chapters.length, c.code).toBeGreaterThan(0);
        for (const ch of c.chapters) {
          expect(ch.topics.length, `${c.code} / ${ch.title}`).toBeGreaterThan(0);
          for (const t of ch.topics) {
            const where = `${c.code} / ${t.title}`;
            expect(t.summary, where).not.toBe('');
            expect(t.notes.length, where).toBeGreaterThanOrEqual(3);
            expect(t.notes.length, where).toBeLessThanOrEqual(6);
            expect(t.outcomes.length, where).toBeGreaterThanOrEqual(2);
            expect(t.outcomes.length, where).toBeLessThanOrEqual(4);
            for (const r of t.resources) expect((r.kind === 'lab' ? labs : models).get(r.id), `${where}: ${r.id}`).toBe(r.title);
            for (const q of t.lesson?.questions ?? []) expect(q.a, where).not.toBe('');
          }
        }
      }
    }
  });
});
