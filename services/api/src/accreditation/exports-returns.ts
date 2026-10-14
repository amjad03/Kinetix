// Regulatory returns in the layouts their portals and disclosures use: AICTE extension-of-approval data with the norms
// check, the UGC public self-disclosure with its checklist, and CBSE OASIS data with the Appendix IX mandatory public
// disclosure. Each block of the return is a sheet: the items with their values and inputs, then the records behind them
// under the return's own columns (rows entered by the institution win over ERP records).
import type { MetricResult } from './engine.js';
import { mapToTemplate } from './accreditation.service.js';
import type { ExportCtx } from './exports.js';
import { windowOf } from './sources.js';
import { xlsx, type Cell, type Sheet } from './xlsx.js';

const round = (v: number | null | undefined, d = 2) => (v === null || v === undefined ? null : Math.round(v * 10 ** d) / 10 ** d);
const yesNo = (b: boolean) => (b ? 'Yes' : 'No');

/** What the item says: the narrative, the options ticked or the figure. */
function answer(m: MetricResult): Cell {
  if (m.kind === 'QlM') return m.narrative || m.autoNarrative || 'To be written';
  if (m.options) return m.options.selected === null ? 'Not answered' : `${m.options.selected.length} of ${m.options.labels.length}`;
  return round(m.value, 2);
}

/** The records behind an item for the year: entered rows, else the ERP records placed under the item's columns. */
async function recordsOf(c: ExportCtx, m: MetricResult, rowsSource: string | undefined): Promise<Cell[][]> {
  const y = windowOf(c.a.cycle, c.f.years, c.today);
  const out: Cell[][] = [];
  for (const yr of y) {
    const entered = c.rows.get(m.code)?.get(yr.label) ?? [];
    if (entered.length) {
      out.push(...entered);
      continue;
    }
    if (!rowsSource || !m.columns.length) continue;
    const s = await c.cache.get(rowsSource, yr);
    const mapped = s.rows.length ? mapToTemplate(m.columns, s.columns, s.rows, yr.label) : null;
    if (mapped) out.push(...mapped);
  }
  return out;
}

/** One sheet per block of the return: its items, then each item's records. */
async function blockSheets(c: ExportCtx, rowsSourceOf: (code: string) => string | undefined): Promise<Sheet[]> {
  const sheets: Sheet[] = [];
  for (const cr of c.a.criteria) {
    const ms = c.a.metrics.filter((m) => m.criterion === cr.id);
    const rows: Cell[][] = [[`${cr.id}. ${cr.title}`], [], ['Item', 'Description', 'Response', 'Unit', 'Inputs', 'Source', 'Evidence files']];
    const header = [2];
    for (const m of ms) {
      const inputs = m.inputs.map((i) => `${i.label}: ${m.combinedInputs[i.key] ?? '-'}`).join('; ');
      rows.push([m.code, m.title, answer(m), m.unit, inputs, m.valueSource === 'auto' ? 'ERP' : m.valueSource === 'manual' ? 'Entered' : m.valueSource === 'mixed' ? 'ERP and entered' : 'Missing', m.evidence]);
      if (m.options) for (const [i, o] of m.options.labels.entries()) rows.push(['', `  ${o}`, m.options.selected === null ? 'Not answered' : yesNo(m.options.selected.includes(i))]);
    }
    for (const m of ms.filter((x) => x.kind === 'QnM' && !x.options && x.columns.length)) {
      const recs = await recordsOf(c, m, rowsSourceOf(m.code));
      if (!recs.length) continue;
      rows.push([], [`${m.code} ${m.title}`]);
      header.push(rows.length);
      rows.push(m.columns);
      rows.push(...recs);
    }
    sheets.push({ name: `${cr.id} ${cr.title}`, rows, widths: [12, 60, 30, 14, 60, 16, 12], title: [0], header });
  }
  return sheets;
}

const handSheet = (c: ExportCtx, extra: [string, string][] = []): Sheet => ({
  name: 'To complete by hand',
  rows: [['Item', 'What is missing'], ...c.a.metrics.filter((m) => !m.complete).map((m) => [`${m.code} ${m.title}`, m.kind === 'QlM' ? 'Details and documents' : m.options ? 'Items to tick' : 'Figures or evidence']), ...extra],
  widths: [90, 40],
  header: [0],
});

const profileSheet = (title: string, profile: Record<string, string | number | null>, c: ExportCtx): Sheet => ({
  name: 'Institution',
  rows: [[title], [`${c.inst}, ${c.a.cycle}`], [], ['Item', 'Detail'], ...Object.entries(profile).map(([k, v]) => [k, v])],
  widths: [40, 80],
  title: [0],
  header: [3],
});

const metric = (c: ExportCtx, code: string) => c.a.metrics.find((m) => m.code === code);
const input = (c: ExportCtx, code: string, key: string) => metric(c, code)?.combinedInputs[key] ?? null;

/** AICTE: institution, the blocks of the portal, and the norms check (faculty-student ratio and cadre against required). */
export async function aicteReturn(c: ExportCtx, profile: Record<string, string | number | null>, rowsSourceOf: (code: string) => string | undefined): Promise<Buffer> {
  const students = input(c, 'AICTE-4.2', 'students') ?? 0;
  const faculty = input(c, 'AICTE-4.2', 'faculty') ?? 0;
  const ratio = 20;
  const required = Math.ceil(students / ratio);
  const req = [Math.ceil(required / 9), Math.ceil((2 * required) / 9), Math.ceil((6 * required) / 9)];
  const have = [input(c, 'AICTE-4.3', 'prof') ?? 0, input(c, 'AICTE-4.3', 'assoc') ?? 0, input(c, 'AICTE-4.3', 'asst') ?? 0];
  const short = (need: number, got: number) => (got >= need ? 'Meets the norm' : `Short by ${need - got}`);
  const admitted = metric(c, 'AICTE-3.3')?.value ?? null;
  const norms: Sheet = {
    name: 'Norms check',
    rows: [
      ['Norms check against the Approval Process Handbook'],
      ['Faculty required at 1 : 20 (use 1 : 15 for MBA / PGDM and for autonomous or accredited institutions); cadre 1 : 2 : 6.'],
      [],
      ['Norm', 'Required', 'Available', 'Status'],
      ['Regular faculty', required, faculty, short(required, faculty)],
      ['Professors', req[0], have[0], short(req[0], have[0])],
      ['Associate professors', req[1], have[1], short(req[1], have[1])],
      ['Assistant professors', req[2], have[2], short(req[2], have[2])],
      ['Admissions against approved intake (%)', '', round(admitted, 1), admitted !== null && admitted <= 50 ? 'At or below 50%: faculty may be computed on actual admissions' : ''],
    ],
    widths: [44, 14, 14, 50],
    title: [0],
    header: [3],
  };
  return xlsx([profileSheet('AICTE extension of approval data', profile, c), norms, ...(await blockSheets(c, rowsSourceOf)), handSheet(c, [['Faculty unique IDs, PAN and Aadhaar on the AICTE portal', 'Check each faculty record on the portal']])], c.at);
}

/** UGC: institution, the disclosure blocks and a checklist of what the website must show. */
export async function ugcReturn(c: ExportCtx, profile: Record<string, string | number | null>, rowsSourceOf: (code: string) => string | undefined): Promise<Buffer> {
  const check: Sheet = {
    name: 'Disclosure checklist',
    rows: [['Public self-disclosure checklist (UGC guidelines, 2024)'], ['The disclosure must be on the website without log-in, searchable, current and verified.'], [], ['Section', 'Item', 'Ready', 'Evidence files'], ...c.a.metrics.map((m) => [c.f.criteria.find((x) => x.id === m.criterion)?.title ?? m.criterion, `${m.code} ${m.title}`, yesNo(m.complete), m.evidence])],
    widths: [26, 90, 10, 14],
    title: [0],
    header: [3],
    freeze: 4,
  };
  return xlsx([profileSheet('UGC public self-disclosure', profile, c), check, ...(await blockSheets(c, rowsSourceOf)), handSheet(c)], c.at);
}

/** CBSE: Appendix IX in its sections and order, then the OASIS blocks with the records behind them. */
export async function cbseReturn(c: ExportCtx, profile: Record<string, string | number | null>, rowsSourceOf: (code: string) => string | undefined): Promise<Buffer> {
  const docs = metric(c, 'CBSE-B.1');
  const results = async (code: string) => {
    const m = metric(c, code);
    if (!m) return [] as Cell[][];
    const rows = await recordsOf(c, m, undefined);
    return rows.length ? rows : m.years.filter((y) => y.required).map((y) => [y.year, y.inputs.find((i) => i.key === 'registered')?.value ?? null, y.inputs.find((i) => i.key === 'passed')?.value ?? null, round(y.value, 2), '']);
  };
  const v = (code: string) => metric(c, code)?.value ?? null;
  const facilities = metric(c, 'CBSE-E.5');
  const rows: Cell[][] = [
    ['Appendix IX: Mandatory public disclosure'],
    [],
    ['A: General information'],
    ['S.No.', 'Information', 'Details'],
    [1, 'Name of the school', profile['Name of the institution'] ?? c.inst],
    [2, 'Affiliation no. (if applicable)', profile['Affiliation number'] ?? null],
    [3, 'School code (if applicable)', profile['AISHE / UDISE code'] ?? null],
    [4, 'Complete address with pin code', profile['Address'] ?? null],
    [5, 'Principal name and qualification', metric(c, 'CBSE-A.1')?.narrative || ''],
    [6, 'School e-mail id', profile['Email'] ?? null],
    [7, 'Contact details (landline / mobile)', profile['Phone'] ?? null],
    [],
    ['B: Documents and information'],
    ['S.No.', 'Documents / information', 'Uploaded'],
    ...(docs?.options?.labels ?? []).map((l, i) => [i + 1, l, docs?.options?.selected ? yesNo(docs.options.selected.includes(i)) : 'Not answered']),
    [],
    ['C: Results and academics'],
    ['S.No.', 'Documents / information', 'Details'],
    [1, 'Fee structure of the school', metric(c, 'CBSE-C.1')?.narrative || metric(c, 'CBSE-C.1')?.autoNarrative || ''],
    [2, 'Annual academic calendar', 'Upload as evidence'],
    [3, 'List of school management committee (SMC)', 'Upload as evidence'],
    [4, 'List of parents-teachers association (PTA) members', 'Upload as evidence'],
    [5, 'Last three-year result of the board examination', 'See the result tables below'],
    [],
    ['Result class X'],
    ['Year', 'No. of registered students', 'No. of students passed', 'Pass percentage', 'Remarks'],
    ...(await results('CBSE-C.2')),
    [],
    ['Result class XII'],
    ['Year', 'No. of registered students', 'No. of students passed', 'Pass percentage', 'Remarks'],
    ...(await results('CBSE-C.3')),
    [],
    ['D: Staff (teaching)'],
    ['S.No.', 'Information', 'Details'],
    [1, 'Principal', metric(c, 'CBSE-A.1')?.narrative ? 'See section A' : ''],
    [2, 'Total no. of teachers', v('CBSE-D.1')],
    ['', 'PGT', input(c, 'CBSE-D.1', 'pgt')],
    ['', 'TGT', input(c, 'CBSE-D.1', 'tgt')],
    ['', 'PRT', input(c, 'CBSE-D.1', 'prt')],
    [3, 'Teachers section ratio', round(v('CBSE-D.2'), 2)],
    [4, 'Details of special educator', input(c, 'CBSE-D.3', 'special')],
    [5, 'Details of counsellor and wellness teacher', input(c, 'CBSE-D.3', 'counsellor')],
    [],
    ['E: School infrastructure'],
    ['S.No.', 'Information', 'Details'],
    [1, 'Total campus area of the school (in square metres)', v('CBSE-E.1')],
    [2, 'No. and size of the classrooms (in square metres)', v('CBSE-E.2')],
    [3, 'No. and size of laboratories including computer labs (in square metres)', v('CBSE-E.3')],
    [4, 'Internet facility', facilities?.options?.selected ? yesNo(facilities.options.selected.includes(0)) : 'Not answered'],
    [5, 'No. of girls toilets', input(c, 'CBSE-E.4', 'girls')],
    [6, 'No. of boys toilets', input(c, 'CBSE-E.4', 'boys')],
    [7, 'Link of YouTube video of the inspection of the school covering the infrastructure of the school', metric(c, 'CBSE-E.6')?.narrative || ''],
  ];
  const sectionRows = rows.map((r, i) => (r.length === 1 && i > 0 && typeof r[0] === 'string' ? i : -1)).filter((i) => i > 0);
  const headerRows = rows.map((r, i) => (r[0] === 'S.No.' || r[0] === 'Year' ? i : -1)).filter((i) => i >= 0);
  const appendix: Sheet = { name: 'Appendix IX disclosure', rows, widths: [8, 70, 40, 16, 20], title: [0, ...sectionRows], header: headerRows };
  return xlsx([profileSheet('CBSE OASIS and mandatory disclosure', profile, c), appendix, ...(await blockSheets(c, rowsSourceOf)), handSheet(c, [['Teacher Aadhaar, training hours and appointment details on OASIS', 'Not held in the staff records']])], c.at);
}
