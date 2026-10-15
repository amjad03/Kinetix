// The question-wise marks sheet: building the Excel template and reading it back. Pure, so it is unit-tested.

export interface SheetQuestion {
  id: string;
  no: string;
  maxMarks: number;
}
export interface SheetStudent {
  id: string;
  rollNo: string;
  name: string;
}
export interface SheetEntry {
  studentId: string;
  absent: boolean;
  marks: Record<string, number | null>;
}

/** "Q1 (10)" → "1"; a header names its question by number, with the maximum in brackets. */
export const headerOf = (q: SheetQuestion) => `Q${q.no} (${q.maxMarks})`;
const keyOf = (h: string) =>
  h
    .trim()
    .replace(/\s*\(.*\)\s*$/, '')
    .replace(/^q\.?\s*/i, '')
    .toLowerCase();

/** The marks sheet's rows: a header, then one row per student with their marks so far. */
export function marksSheetRows(questions: SheetQuestion[], students: (SheetStudent & { absent: boolean; marks: Record<string, number | null> })[]): (string | number | null)[][] {
  return [['Roll no', 'Name', 'Absent (Y/N)', ...questions.map(headerOf), 'Total'], ...students.map((s) => {
    const vals = questions.map((q) => s.marks[q.id] ?? null);
    const any = vals.some((v) => v !== null);
    return [s.rollNo, s.name, s.absent ? 'Y' : '', ...vals, any ? Math.round(vals.reduce<number>((a, v) => a + (v ?? 0), 0) * 100) / 100 : null];
  })];
}

/**
 * Reads a filled sheet back: students by roll number, questions by the number in each header. Blank cells stay blank;
 * a mark above the question's maximum, a negative or non-numeric mark, an unknown roll number or question, or a row
 * listed twice is an error (row numbers are the sheet's own, 1 = the header).
 */
export function parseMarksSheet(rows: string[][], questions: SheetQuestion[], students: SheetStudent[]): { entries: SheetEntry[]; errors: { row: number; message: string }[] } {
  const errors: { row: number; message: string }[] = [];
  const entries: SheetEntry[] = [];
  const header = rows[0] ?? [];
  const lower = header.map((h) => h.trim().toLowerCase());
  const rollCol = lower.findIndex((h) => h.startsWith('roll'));
  const absentCol = lower.findIndex((h) => h.startsWith('absent'));
  if (rollCol < 0) return { entries, errors: [{ row: 1, message: 'The sheet needs a "Roll no" column' }] };
  const qByKey = new Map(questions.map((q) => [q.no.trim().toLowerCase(), q]));
  const cols: { col: number; q: SheetQuestion }[] = [];
  header.forEach((h, i) => {
    if (i === rollCol || i === absentCol || /^(name|total)/i.test(h.trim()) || !h.trim()) return;
    const q = qByKey.get(keyOf(h));
    if (q) cols.push({ col: i, q });
    else errors.push({ row: 1, message: `Column "${h}" is not a question of this paper` });
  });
  if (!cols.length) errors.push({ row: 1, message: 'No question columns were found' });
  const byRoll = new Map(students.map((s) => [s.rollNo.trim().toLowerCase(), s]));
  const seen = new Set<string>();
  rows.slice(1).forEach((r, i) => {
    const rowNo = i + 2;
    const roll = (r[rollCol] ?? '').trim();
    if (!roll && r.every((c) => !c?.trim())) return;
    const st = byRoll.get(roll.toLowerCase());
    if (!st) return void errors.push({ row: rowNo, message: `No student with roll number "${roll}" in this class` });
    if (seen.has(st.id)) return void errors.push({ row: rowNo, message: `${roll} is listed twice` });
    seen.add(st.id);
    const absent = absentCol >= 0 && /^(y|yes|ab|absent|1|true)$/i.test((r[absentCol] ?? '').trim());
    const marks: Record<string, number | null> = {};
    for (const { col, q } of cols) {
      const text = (r[col] ?? '').trim();
      if (!text || absent) {
        marks[q.id] = null;
        continue;
      }
      const v = Number(text.replace(',', '.'));
      if (!Number.isFinite(v) || v < 0) errors.push({ row: rowNo, message: `${roll}: "${text}" for Q${q.no} is not a mark` });
      else if (v > q.maxMarks) errors.push({ row: rowNo, message: `${roll}: ${v} for Q${q.no} is more than its ${q.maxMarks} marks` });
      else marks[q.id] = v;
    }
    entries.push({ studentId: st.id, absent, marks });
  });
  return { entries, errors };
}
