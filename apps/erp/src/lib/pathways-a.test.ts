import { describe, expect, it } from 'vitest';
import { nextThesisStages, parseSteps, stepsText, examinersText, indicatorsText, parseExaminers, parseIndicators, parsePanel, parseQuestions, parseRubric, splitList, uploadType } from './pathways-a';

describe('parseQuestions', () => {
  it('reads one question per line with a 1-based answer and an optional topic', () => {
    const r = parseQuestions('What is 2 + 2? | 3 ; 4 ; 5 | 2 | Quant\nWhich is a noun? | run ; table | 2');
    expect(r).toEqual({
      ok: true,
      value: [
        { prompt: 'What is 2 + 2?', options: ['3', '4', '5'], answerIndex: 1, topic: 'Quant' },
        { prompt: 'Which is a noun?', options: ['run', 'table'], answerIndex: 1, topic: 'General' },
      ],
    });
  });
  it('points at the bad line', () => {
    expect(parseQuestions('Fine? | a ; b | 1\nOnly one option? | a | 1')).toEqual({ ok: false, code: 'line', line: 2 });
    expect(parseQuestions('Fine? | a ; b | 3')).toEqual({ ok: false, code: 'range', line: 1 });
    expect(parseQuestions('Fine? | a ; b | two')).toEqual({ ok: false, code: 'line', line: 1 });
    expect(parseQuestions('  \n')).toEqual({ ok: false, code: 'empty', line: 0 });
  });
  it('skips blank lines but keeps real line numbers', () => {
    expect(parseQuestions('Fine? | a ; b | 1\n\nBad | a ; b')).toEqual({ ok: false, code: 'line', line: 3 });
  });
  it('refuses more than 100 questions', () => {
    const many = Array.from({ length: 101 }, () => 'Q1? | a ; b | 1').join('\n');
    expect(parseQuestions(many)).toMatchObject({ ok: false, code: 'many' });
  });
});

describe('parseRubric', () => {
  it('reads criterion = score lines within the maximum', () => {
    expect(parseRubric('Originality = 4\nPresentation: 3.5', 5)).toEqual({ ok: true, value: { Originality: 4, Presentation: 3.5 } });
  });
  it('refuses a score above the maximum, a repeat and a line without a score', () => {
    expect(parseRubric('Originality = 6', 5)).toEqual({ ok: false, code: 'range', line: 1 });
    expect(parseRubric('A = 1\nA = 2', 5)).toEqual({ ok: false, code: 'dup', line: 2 });
    expect(parseRubric('Originality', 5)).toEqual({ ok: false, code: 'line', line: 1 });
    expect(parseRubric('', 5)).toMatchObject({ ok: false, code: 'empty' });
  });
  it('allows at most 12 criteria', () => {
    expect(parseRubric(Array.from({ length: 13 }, (_, i) => `C${i} = 1`).join('\n'), 5)).toMatchObject({ ok: false, code: 'many' });
  });
});

describe('parseIndicators', () => {
  it('reads CODE | Name | unit, upper-casing the code', () => {
    expect(parseIndicators('trees | Trees planted | trees\nHH | Households reached')).toEqual({
      ok: true,
      value: [
        { code: 'TREES', name: 'Trees planted', unit: 'trees' },
        { code: 'HH', name: 'Households reached', unit: '' },
      ],
    });
  });
  it('refuses repeated codes and lines without a name', () => {
    expect(parseIndicators('A | One\na | Two')).toEqual({ ok: false, code: 'dup', line: 2 });
    expect(parseIndicators('A')).toEqual({ ok: false, code: 'line', line: 1 });
  });
  it('round-trips through its text form', () => {
    const list = [{ code: 'A', name: 'One', unit: 'x' }];
    expect(parseIndicators(indicatorsText(list))).toEqual({ ok: true, value: list });
  });
});

describe('lists', () => {
  it('splits and de-duplicates comma lists', () => {
    expect(splitList('python, , sql,python\nR')).toEqual(['python', 'sql', 'R']);
    expect(parsePanel('Dr Rao, Dr Shah')).toEqual([{ name: 'Dr Rao' }, { name: 'Dr Shah' }]);
  });
  it('reads examiners with an optional affiliation, at most six', () => {
    const r = parseExaminers('Dr Rao | IISc\nDr Shah');
    expect(r).toEqual({ ok: true, value: [{ name: 'Dr Rao', affiliation: 'IISc' }, { name: 'Dr Shah', affiliation: '' }] });
    if (r.ok) expect(examinersText(r.value)).toBe('Dr Rao | IISc\nDr Shah');
    expect(parseExaminers(Array.from({ length: 7 }, (_, i) => `E${i}`).join('\n'))).toMatchObject({ ok: false, code: 'many' });
  });
});

describe('parseSteps', () => {
  it('reads Title | detail lines and round-trips', () => {
    const r = parseSteps('Learn SQL | Do the basics\nBuild a project');
    expect(r).toEqual({ ok: true, value: [{ title: 'Learn SQL', detail: 'Do the basics' }, { title: 'Build a project', detail: '' }] });
    if (r.ok) expect(parseSteps(stepsText(r.value))).toEqual(r);
    expect(parseSteps(Array.from({ length: 11 }, (_, i) => `S${i}`).join('\n'))).toMatchObject({ ok: false, code: 'many' });
  });
});

describe('nextThesisStages', () => {
  it('moves one stage forward, and back to draft from examination or viva', () => {
    expect(nextThesisStages('synopsis')).toEqual(['draft']);
    expect(nextThesisStages('submitted')).toEqual(['examination']);
    expect(nextThesisStages('examination')).toEqual(['viva', 'draft']);
    expect(nextThesisStages('viva')).toEqual(['awarded', 'draft']);
    expect(nextThesisStages('awarded')).toEqual([]);
    expect(nextThesisStages('nonsense')).toEqual([]);
  });
});

describe('uploadType', () => {
  it('trusts a known browser type and falls back to the extension', () => {
    expect(uploadType('a.pdf', 'application/pdf')).toBe('application/pdf');
    expect(uploadType('Report.DOCX', '')).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    expect(uploadType('photo.jpg', 'application/octet-stream')).toBe('image/jpeg');
  });
  it('refuses a type the API does not take', () => {
    expect(uploadType('run.exe', 'application/x-msdownload')).toBeNull();
    expect(uploadType('noext', '')).toBeNull();
  });
});
