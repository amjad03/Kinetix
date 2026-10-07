import { describe, expect, it } from 'vitest';
import { DEFAULT_DOCUMENTS, DEFAULT_QUESTIONS, parseDocuments, parsePairs, parseQuestions } from './cycle-config';

describe('cycle configuration lines', () => {
  it('parses the default questions and documents', () => {
    const q = parseQuestions(DEFAULT_QUESTIONS);
    expect(q).toEqual({
      ok: true,
      value: [
        { key: 'marks_12th', label: '12th marks %', type: 'number', required: true, min: 0, max: 100 },
        { key: 'stream', label: 'Stream', type: 'select', required: true, options: ['Commerce', 'Science', 'Arts'] },
      ],
    });
    expect(parseDocuments(DEFAULT_DOCUMENTS)).toEqual({
      ok: true,
      value: [
        { key: 'marksheet', label: 'Previous marksheet', required: true },
        { key: 'id_proof', label: 'ID proof', required: false },
      ],
    });
  });

  it('names the line that is wrong', () => {
    expect(parseQuestions('Bad Key | x | text')).toMatchObject({ ok: false, line: 1 });
    expect(parseQuestions('a_key | A | text\nb_key | B | nope')).toMatchObject({ ok: false, line: 2 });
    expect(parseQuestions('s_x | S | select | y | OnlyOne')).toMatchObject({ ok: false, error: expect.stringContaining('two options') });
    expect(parseQuestions('n_x | N | number | y | high')).toMatchObject({ ok: false, error: expect.stringContaining('0-100') });
    expect(parseQuestions('a_k | A | text\na_k | B | text')).toMatchObject({ ok: false, error: expect.stringContaining('twice') });
  });

  it('parses rule pairs', () => {
    expect(parsePairs('marks_12th 40\nentrance 2.5')).toEqual({ ok: true, value: [{ field: 'marks_12th', value: 40 }, { field: 'entrance', value: 2.5 }] });
    expect(parsePairs('marks 40 extra')).toMatchObject({ ok: false, line: 1 });
    expect(parsePairs('')).toEqual({ ok: true, value: [] });
  });
});
