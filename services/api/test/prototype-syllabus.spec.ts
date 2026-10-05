import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { classLabel, convertPrototype, labScore, SOURCE } from '../scripts/convert-prototype-syllabus.js';
import { CONTENT_DIR, LibraryFile, pairRows } from '../src/content/import.js';

const FIXTURE = fileURLToPath(new URL('./fixtures/prototype/', import.meta.url));

/** The prototype's syllabus converted to library files (scripts/convert-prototype-syllabus.ts). */
describe('prototype syllabus converter', () => {
  const { libraries, dropped } = convertPrototype(FIXTURE);
  const course = (curriculum: string, code: string) => libraries.get(curriculum)!.courses.find((c) => c.code === code)!;

  it('maps boards to curricula, books to courses and LKG/UKG to classes -1 and 0', () => {
    expect([...libraries.keys()]).toEqual(['cbse', 'ka-state', 'early-years']);
    expect(libraries.get('early-years')!.curricula).toEqual([{ code: 'early-years', name: 'Early years (LKG, UKG)', level: 'k12' }]);
    expect(libraries.get('cbse')!.courses.map((c) => [c.code, c.title, c.term, c.language])).toEqual([
      ['class-10-science', 'Science, Class 10', 10, 'en'],
      // Two English books in Class 10: each code and title names its book.
      ['class-10-english-first-flight', 'English: First Flight, Class 10', 10, 'en'],
      ['class-10-english-footprints-without-feet', 'English: Footprints without Feet, Class 10', 10, 'en'],
      // Sanskrit is written in Devanagari; course languages are en, hi and kn.
      ['class-6-sanskrit', 'Sanskrit: Deepakam, Class 6', 6, 'hi'],
    ]);
    expect(course('early-years', 'lkg-english')).toMatchObject({ title: 'English: Little Readers LKG, LKG', term: -1 });
    expect(classLabel(0)).toBe('UKG');
    for (const lib of libraries.values()) for (const c of lib.courses) expect(c).toMatchObject({ source: SOURCE, reviewed: false });
  });

  it('turns each chapter lesson into one topic with the lesson attached', () => {
    const science = course('cbse', 'class-10-science');
    expect(science.chapters.map((c) => [c.title, c.topics.length])).toEqual([
      ['Chemical Reactions and Equations', 1],
      ['Light – Reflection and Refraction', 1],
      ['Our Environment', 0], // no lesson written: the chapter is listed, without topics
    ]);
    expect(science.chapters[0].topics[0]).toEqual({
      title: 'Chemical Reactions and Equations',
      summary: 'In a chemical reaction new substances form.',
      notes: ['In a chemical reaction new substances form.', 'An equation must be balanced.'],
      outcomes: ['Write and balance a chemical equation'],
      resources: [
        { kind: 'model3d', id: 'molecules', title: 'Molecules and their shapes' },
        { kind: 'lab', id: 'reactions', title: 'Types of chemical reactions' },
      ],
      lesson: {
        hook: 'Why does an iron nail turn brown?',
        example: 'Balance Fe + H₂O → Fe₃O₄ + H₂.',
        exampleTex: '3\\,\\mathrm{Fe} + 4\\,\\mathrm{H_2O} \\rightarrow \\mathrm{Fe_3O_4} + 4\\,\\mathrm{H_2}',
        activity: 'Dip an iron nail in copper sulphate solution.',
        questions: [{ q: 'Balance: H₂ + O₂ → H₂O', a: '2H₂ + O₂ → 2H₂O' }],
        homework: 'Find three reactions in your kitchen.',
        terms: ['reactant', 'product'],
      },
    });
  });

  it('keeps old 3D model ids, matches labs by the old keywords, and drops simulations', () => {
    const light = course('cbse', 'class-10-science').chapters[1].topics[0];
    // Best score first, at most three; ties keep the lab library's order.
    expect(light.resources.map((r) => `${r.kind}:${r.id}`)).toEqual(['model3d:prism', 'lab:glass-slab', 'lab:lens-mirror', 'lab:shadows']);
    expect(dropped).toEqual({ sims: 1, unknownModels: ['cbse-10-science-science: no_such_model'] });
    // Language and literature chapters get no labs.
    expect(course('cbse', 'class-10-english-first-flight').chapters[0].topics[0].resources).toEqual([]);
    expect(course('ka-state', 'class-10-science').chapters[1].topics[0].resources.map((r) => r.id)).toEqual(['indicators']);
  });

  it('scores labs as the prototype did: whole words or plurals, phrases worth more', () => {
    const lab = { id: 'x', title: { en: 'Magnets' }, keywords: ['magnet', 'magnetic field'] };
    expect(labScore(lab, 'Fun with Magnets')).toBe(4); // "magnets" (title) and "magnet" + s
    expect(labScore(lab, 'The magnetic field of the Earth')).toBe(3);
    expect(labScore(lab, 'Magnetism')).toBe(0);
  });

  it('carries Kannada chapter titles and Kannada lessons as the kn version', () => {
    const [reactions, acids] = course('ka-state', 'class-10-science').chapters.map((c) => c.topics[0]);
    expect(reactions.lesson.kn).toMatchObject({
      title: 'ರಾಸಾಯನಿಕ ಕ್ರಿಯೆಗಳು ಮತ್ತು ಸಮೀಕರಣಗಳು',
      notes: ['ಕ್ರಿಯೆಯಲ್ಲಿ ಹೊಸ ವಸ್ತುಗಳು ಉಂಟಾಗುತ್ತವೆ.'],
      outcomes: ['ಸಮೀಕರಣವನ್ನು ಸಮತೋಲನಗೊಳಿಸು'],
      hook: 'ಉರಿಯುವ ಮೇಣದಬತ್ತಿಗೆ ಏನಾಗುತ್ತದೆ?',
      terms: ['ಪ್ರತಿಕಾರಕ'],
    });
    expect(acids.lesson.kn).toEqual({ title: 'ಆಮ್ಲಗಳು, ಪ್ರತ್ಯಾಮ್ಲಗಳು ಮತ್ತು ಲವಣಗಳು' }); // title only: no Kannada lesson yet
  });

  it('writes files the import accepts', () => {
    for (const lib of libraries.values()) expect(() => LibraryFile.parse(JSON.parse(JSON.stringify(lib)))).not.toThrow();
  });
});

/** The converted library as shipped in services/api/content. */
describe('shipped prototype library', () => {
  const files = ['cbse.json', 'icse.json', 'ka-state.json', 'early-years.json'];
  const libs = files.map((f) => LibraryFile.parse(JSON.parse(readFileSync(`${CONTENT_DIR}/${f}`, 'utf8'))));
  const topics = libs.flatMap((l) => l.courses.flatMap((c) => c.chapters.flatMap((ch) => ch.topics)));

  it('has every book and chapter lesson of the prototype, unreviewed', () => {
    expect(readdirSync(CONTENT_DIR)).toEqual(expect.arrayContaining(files));
    expect(libs.map((l) => l.courses.length)).toEqual([55, 40, 80, 12]);
    expect(libs.map((l) => l.courses.reduce((n, c) => n + c.chapters.reduce((m, ch) => m + ch.topics.length, 0), 0))).toEqual([670, 409, 1394, 100]);
    expect(libs.flatMap((l) => l.courses).every((c) => c.source === SOURCE && !c.reviewed)).toBe(true);
    expect(topics.filter((t) => t.resources.some((r) => r.kind === 'model3d'))).toHaveLength(214);
    expect(topics.every((t) => t.lesson && t.notes.length > 0)).toBe(true);
  });
});

describe('pairing library rows on re-import', () => {
  const rows = (...titles: string[]) => titles.map((title, i) => ({ id: `id-${i + 1}`, title, position: i + 1 }));
  const ids = (r: ReturnType<typeof pairRows<{ id: string; title: string; position: number }>>) => r.pairs.map((p) => p?.id ?? null);

  it('keeps ids when topics are added, removed or reordered', () => {
    expect(ids(pairRows(rows('A', 'B', 'C'), [{ title: 'New' }, { title: 'A' }, { title: 'B' }, { title: 'C' }]))).toEqual([null, 'id-1', 'id-2', 'id-3']);
    const dropped = pairRows(rows('A', 'B', 'C'), [{ title: 'A' }, { title: 'C' }]);
    expect(ids(dropped)).toEqual(['id-1', 'id-3']);
    expect(dropped.unused.map((r) => r.id)).toEqual(['id-2']);
    expect(ids(pairRows(rows('A', 'B'), [{ title: 'B' }, { title: 'A' }]))).toEqual(['id-2', 'id-1']);
  });

  it('keeps the id of a retitled topic that stays in place', () => {
    expect(ids(pairRows(rows('A', 'B', 'C'), [{ title: 'A' }, { title: 'B, corrected' }, { title: 'C' }]))).toEqual(['id-1', 'id-2', 'id-3']);
    // Repeated titles pair with the nearest position.
    expect(ids(pairRows(rows('Revision', 'X', 'Revision'), [{ title: 'Y' }, { title: 'Revision' }, { title: 'Revision' }]))).toEqual([null, 'id-1', 'id-3']);
  });
});
