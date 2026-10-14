// Accreditation outputs in the layouts the portals ask for: NAAC SSR data templates (one workbook per metric in the
// template's column order, criterion folders, extended profile), the AQAR, NIRF data capture sheets with a score
// estimate, NBA SAR tables, the AISHE DCF-II and UDISE+ returns, and the DVV clarification register.
import type { Assessment, MetricResult } from './engine.js';
import type { FrameworkDef } from './frameworks/types.js';
import { mapToTemplate } from './accreditation.service.js';
import { windowOf, type AcademicYear, type SourceCache } from './sources.js';
import { xlsx, type Cell, type Sheet } from './xlsx.js';

export interface ExportCtx {
  f: FrameworkDef;
  a: Assessment;
  inst: string;
  at: Date;
  /** Data template rows entered, by metric code and year. */
  rows: Map<string, Map<string, string[][]>>;
  cache: SourceCache;
  today: string;
}

const yearsOfCtx = (c: ExportCtx): AcademicYear[] => windowOf(c.a.cycle, c.f.years, c.today);
const yearOf = (c: ExportCtx, label: string) => yearsOfCtx(c).find((y) => y.label === label)!;
const round = (v: number | null | undefined, d = 2) => (v === null || v === undefined ? null : Math.round(v * 10 ** d) / 10 ** d);
const metric = (c: ExportCtx, code: string) => c.a.metrics.find((m) => m.code === code);
const yesNo = (b: boolean) => (b ? 'Yes' : 'No');
const sourceWord = (m: MetricResult) => ({ manual: 'Entered by the institution', auto: 'Computed from ERP data', mixed: 'ERP data with entries by the institution', none: 'Not yet available' })[m.valueSource];

/** The data template rows of a metric for one year: what was entered, else the ERP records placed under the template columns. */
async function templateRows(c: ExportCtx, m: MetricResult, year: string, rowsSource?: string): Promise<{ rows: Cell[][]; from: 'entered' | 'erp' | 'none' }> {
  const entered = c.rows.get(m.code)?.get(year) ?? [];
  if (entered.length) return { rows: entered, from: 'entered' };
  if (!rowsSource) return { rows: [], from: 'none' };
  const s = await c.cache.get(rowsSource, yearOf(c, year));
  const mapped = s.rows.length ? mapToTemplate(m.columns, s.columns, s.rows, year) : null;
  return mapped ? { rows: mapped, from: 'erp' } : { rows: [], from: 'none' };
}

/** One metric as the SSR data template: the official columns with every year's rows, the year-wise inputs and the summary. */
export async function metricWorkbook(c: ExportCtx, m: MetricResult, rowsSource?: string): Promise<Buffer> {
  const head: Cell[][] = [[`${c.f.title}: metric ${m.code} (${m.kind})`, c.inst], [m.title], [`Formula: ${m.formula}`], []];
  const sheets: Sheet[] = [];
  if (m.kind === 'QlM') {
    sheets.push({ name: 'Response', rows: [...head, ['Response (up to 500 words)'], [m.narrative || 'Not written yet'], [], ['Supporting figures from the ERP'], [m.autoNarrative || '-']], widths: [120], title: [0], header: [4, 7] });
  } else if (m.options) {
    sheets.push({ name: 'Options', rows: [...head, ['Option', 'Available (Yes / No)', 'Link to the relevant document'], ...m.options.labels.map((o, i) => [o, yesNo(!!m.options!.selected?.includes(i)), '']), [], ['Options ticked', m.options.selected?.length ?? 0]], widths: [80, 22, 40], title: [0], header: [4] });
  } else {
    const multi = m.yearsRequired > 1 && !m.columns.some((x) => /^(academic )?year$/i.test(x.trim()));
    const cols = multi ? ['Academic year', ...m.columns] : m.columns;
    const body: Cell[][] = [];
    let erp = false;
    for (const y of m.years.filter((x) => x.required)) {
      const t = await templateRows(c, m, y.year, rowsSource);
      if (t.from === 'erp') erp = true;
      body.push(...t.rows.map((r) => (multi ? [y.year, ...r] : r)));
    }
    sheets.push({ name: 'Data template', rows: [...head, cols, ...body, ...(erp ? [[], ['Rows marked from ERP records were placed under the template columns automatically; check them before upload.']] : [])], widths: cols.map(() => 26), title: [0], header: [4], freeze: 5 });
    const inputHead = ['Academic year', ...m.inputs.map((i) => i.label), 'Value', 'Source'];
    sheets.push({ name: 'Year-wise', rows: [inputHead, ...m.years.filter((y) => y.required).map((y) => [y.year, ...m.inputs.map((i) => y.inputs.find((x) => x.key === i.key)?.value ?? null), round(y.value, 4), y.source === 'manual' ? 'Entered' : y.inputs.some((i) => i.source === 'auto') ? 'Computed from ERP data' : y.source === 'computed' ? 'Computed from entries' : 'Missing'])], widths: inputHead.map((_, i) => (i ? 22 : 14)), header: [0] });
  }
  sheets.push({ name: 'Summary', rows: [['Item', 'Detail'], ['Metric', m.code], ['Type', m.kind === 'QnM' ? 'Quantitative (QnM)' : 'Qualitative (QlM)'], ['Title', m.title], ['Unit', m.unit], ['Weightage', m.weight], ['Formula', m.formula], ['Value filed', round(m.value, 4)], ['Source', sourceWord(m)], ['Estimated score', m.score === null ? '-' : `${m.score} of ${m.maxScore}`], ['Evidence files', m.evidence], ['Completeness', `${m.completeness}%`], ['Documents to upload', m.evidenceRequired.join('; ')]], widths: [22, 110], header: [0] });
  return xlsx(sheets, c.at);
}

/** Criterion summary, metric list, gaps: the cover workbook of every export. */
export function summarySheets(c: ExportCtx, title: string): Sheet[] {
  const { a } = c;
  const head: Cell[][] = [[`${title}, ${c.inst}, ${a.window.length > 1 ? `${a.window[0]} to ${a.window[a.window.length - 1]}` : a.cycle}`], [`Completeness ${a.completeness.percent}% (${a.completeness.complete} of ${a.completeness.total} metrics complete)`]];
  const e = a.estimate;
  if (e.scoring === 'naac') head.push([`Estimated CGPA ${e.value ?? '-'} (${e.grade}); counting unfilled metrics as zero ${e.floor ?? '-'} (${e.floorGrade}). Binary accreditation data set ${e.binary?.ready ? 'complete' : 'incomplete'}.`]);
  if (e.scoring === 'nba') head.push([`Estimated marks ${e.value ?? '-'} of ${e.max}`]);
  if (e.scoring === 'nirf') head.push([`Estimated NIRF score ${e.value ?? '-'} of 100 (indicative: NIRF scales against the category leaders)`]);
  head.push(['Estimates are KINETIX calculations, not results of the accrediting or ranking body.'], []);
  const unit = e.scoring === 'naac' ? 'Grade point (scored metrics)' : e.scoring === 'none' ? 'Score' : 'Marks';
  const crit: Cell[][] = [['Criterion', 'Title', 'Weightage', 'Metrics', 'Complete', 'Completeness %', unit, e.scoring === 'naac' ? 'Grade point (all metrics)' : 'Maximum'], ...a.criteria.map((x) => [x.id, x.title, x.weight, x.metrics, x.complete, x.completeness, x.score, x.floor === null ? null : e.scoring === 'naac' ? x.floor : x.max])];
  const list: Cell[][] = [['Metric', 'Criterion', 'Type', 'Title', 'Unit', 'Weightage', 'Value', 'Source', 'Score', 'Of', 'Evidence files', 'Completeness %', 'Owner', 'Due', 'Status'], ...a.metrics.map((m) => [m.code, m.criterion, m.kind, m.title, m.unit, m.weight, round(m.value, 4), sourceWord(m), m.score, m.maxScore, m.evidence, m.completeness, m.task?.ownerName ?? m.task?.departmentName ?? '', m.task?.dueOn ?? '', m.task?.status ?? 'unassigned'])];
  const gaps: Cell[][] = [['Metric', 'Title', 'Completeness %', 'Missing'], ...a.metrics.filter((m) => !m.complete).map((m) => [m.code, m.title, m.completeness, [m.kind === 'QlM' && !m.narrative ? 'narrative' : '', m.options && m.options.selected === null ? 'options' : '', m.kind === 'QnM' && !m.options ? m.years.filter((y) => y.required && !y.hasData).map((y) => y.year).join(', ') : '', m.evidenceRequired.length && !m.evidence ? 'evidence' : ''].filter(Boolean).join('; ')])];
  return [
    { name: 'Summary', rows: [...head, ...crit], widths: [12, 48, 12, 10, 10, 14, 22, 22], title: [0], header: [head.length] },
    { name: 'Metrics', rows: list, widths: [10, 9, 6, 70, 14, 10, 12, 24, 8, 6, 10, 12, 22, 12, 12], header: [0], freeze: 1 },
    { name: 'Gaps', rows: gaps, widths: [10, 80, 14, 50], header: [0], freeze: 1 },
  ];
}

export function dvvSheet(rows: { framework: string; metricCode: string; deviation: string; query: string; heiValue: number | null; dvvValue: number | null; response: string; status: string; dueOn: string | null }[], cycle: string): Sheet {
  return { name: 'DVV clarifications', rows: [[`Data validation and verification (DVV) clarifications, ${cycle}`], [], ['Metric', 'Deviation', 'Clarification asked by DVV', 'Value filed by the institution', 'Value recommended by DVV', 'Institution response', 'Status', 'Respond by'], ...rows.map((r) => [r.metricCode, r.deviation.replace(/_/g, ' '), r.query, r.heiValue, r.dvvValue, r.response, r.status, r.dueOn])], widths: [10, 18, 60, 16, 16, 60, 12, 12], title: [0], header: [2], freeze: 3 };
}

/** NAAC SSR: extended profile, one workbook per metric in criterion folders, the summary and the DVV register. */
export async function naacSsr(c: ExportCtx, dvv: Parameters<typeof dvvSheet>[0], rowsSourceOf: (code: string) => string | undefined): Promise<{ name: string; data: Buffer }[]> {
  const files: { name: string; data: Buffer }[] = [];
  const ep = c.a.metrics.filter((m) => m.criterion === 'EP');
  if (ep.length) {
    const head = ['Metric', 'Particulars', ...c.a.window];
    files.push({ name: 'Extended profile.xlsx', data: xlsx([{ name: 'Extended profile', rows: [[`Extended profile, ${c.inst}`], [], head, ...ep.map((m) => [m.code.replace('EP-', ''), m.title, ...c.a.window.map((y) => round(m.years.find((x) => x.year === y)?.value, 2))])], widths: [10, 80, ...c.a.window.map(() => 12)], title: [0], header: [2] }], c.at) });
  }
  for (const m of c.a.metrics.filter((x) => x.criterion !== 'EP')) files.push({ name: `Criterion ${m.criterion}/${m.code}.xlsx`, data: await metricWorkbook(c, m, rowsSourceOf(m.code)) });
  files.push({ name: 'Summary.xlsx', data: xlsx(summarySheets(c, `${c.f.title} self-study report data`), c.at) });
  files.push({ name: 'DVV clarifications.xlsx', data: xlsx([dvvSheet(dvv, c.a.cycle)], c.at) });
  const gaps = c.a.metrics.filter((m) => !m.complete);
  files.push({ name: 'README.txt', data: Buffer.from(`${c.f.title}: self-study report data for ${c.inst}\nAssessment period ${c.a.window[0]} to ${c.a.cycle}\nGenerated ${c.at.toISOString()}\nCatalogue: ${c.f.source}\n\nEach file under "Criterion N" is one metric: the data template in NAAC column order with every year of the period, the year-wise inputs and a summary. "Extended profile.xlsx" holds the base figures. Estimates are KINETIX calculations, not NAAC results.\n\nMetrics still to complete (${gaps.length}):\n${gaps.map((g) => `- ${g.code}  ${g.title} (${g.completeness}%)`).join('\n')}\n`, 'utf8') });
  return files;
}

/** NAAC AQAR for one academic year: Part A, a sheet per criterion and the data templates of the year. */
export async function naacAqar(c: ExportCtx, iqac: { meetings: number; actions: number; practices: number }, rowsSourceOf: (code: string) => string | undefined): Promise<Buffer> {
  const year = c.a.cycle;
  const sheets: Sheet[] = [
    { name: 'Part A', rows: [[`Annual Quality Assurance Report (AQAR) ${year}`], [], ['Item', 'Detail'], ['Name of the institution', c.inst], ['Framework', c.f.title], ['Year of the report', year], ['IQAC meetings held in the year', iqac.meetings], ['IQAC action points recorded', iqac.actions], ['Best practices and distinctiveness written', iqac.practices], ['Metrics complete', `${c.a.completeness.complete} of ${c.a.completeness.total}`], ['Date of generation', c.at.toISOString().slice(0, 10)]], widths: [44, 80], title: [0], header: [2] },
  ];
  for (const cr of c.a.criteria.filter((x) => x.id !== 'EP')) {
    const rows: Cell[][] = [[`Criterion ${cr.id}: ${cr.title}`], [], ['Metric', 'Type', 'Description', `Response for ${year}`, 'Inputs', 'Evidence files']];
    for (const m of c.a.metrics.filter((x) => x.criterion === cr.id)) {
      const y = m.years.find((x) => x.year === year);
      const response = m.kind === 'QlM' ? m.narrative || '(narrative not written)' : m.options ? `${m.options.selected?.length ?? 0} of ${m.options.labels.length}: ${m.options.labels.filter((_, i) => m.options!.selected?.includes(i)).join('; ')}` : y?.value ?? m.value;
      rows.push([m.code, m.kind, m.title, typeof response === 'number' ? round(response, 4) : response, y ? y.inputs.map((i) => `${m.inputs.find((d) => d.key === i.key)?.label ?? i.key}: ${i.value ?? '-'}`).join('; ') : '', y?.evidence ?? 0]);
    }
    sheets.push({ name: `Criterion ${cr.id}`, rows, widths: [10, 6, 70, 40, 60, 12], title: [0], header: [2], freeze: 3 });
  }
  for (const m of c.a.metrics.filter((x) => x.kind === 'QnM' && !x.options && x.columns.length && x.criterion !== 'EP')) {
    const t = await templateRows(c, m, year, rowsSourceOf(m.code));
    if (t.rows.length) sheets.push({ name: m.code, rows: [[`${m.code} ${m.title}`], m.columns, ...t.rows], widths: m.columns.map(() => 26), title: [0], header: [1] });
  }
  return xlsx(sheets, c.at);
}

/** A table of a metric's inputs by year (CAY first, as the SAR prints them) with the value and marks. */
function yearTable(m: MetricResult, label: string, names = ['CAY', 'CAYm1', 'CAYm2']): Sheet {
  const ys = m.years.filter((y) => y.required).reverse();
  const head = ['Item', ...ys.map((y, i) => `${names[i] ?? ''} (${y.year})`)];
  const rows: Cell[][] = m.inputs.map((d) => [d.label, ...ys.map((y) => y.inputs.find((i) => i.key === d.key)?.value ?? null)]);
  rows.push([`${m.title} (${m.unit})`, ...ys.map((y) => round(y.value, 2))]);
  return { name: label, rows: [[`${label}: ${m.title}`], [`Formula: ${m.formula}`], [], head, ...rows, [], ['Value filed', round(m.value, 2)], ['Estimated marks', m.score === null ? '-' : `${m.score} of ${m.maxScore}`]], widths: [70, 20, 20, 20], title: [0], header: [3] };
}

/** NBA SAR: summary, criterion sheets, the quantitative tables of criteria 4 and 5, CO-PO attainment and matrix. */
export function nbaSar(c: ExportCtx, att: { program: string; scope: string; code: string; direct: number | null; indirect: number | null; combined: number | null; target: number; gap: number | null; met: boolean }[], matrix: { program: string; co: string; po: string; strength: number }[]): Buffer {
  const sheets = summarySheets(c, `${c.f.title} self assessment report data`);
  for (const cr of c.a.criteria) {
    const rows: Cell[][] = [[`Criterion ${cr.id}: ${cr.title} (${cr.weight} marks)`], [], ['Item', 'Description', 'Value', 'Unit', 'Marks', 'Of', 'Response']];
    for (const m of c.a.metrics.filter((x) => x.criterion === cr.id)) rows.push([m.code, m.title, round(m.value, 2), m.unit, m.score, m.maxScore, m.kind === 'QlM' ? m.narrative || m.autoNarrative || 'Narrative not written' : '']);
    rows.push([], ['Criterion total', '', '', '', cr.score, cr.weight]);
    sheets.push({ name: `Criterion ${cr.id}`, rows, widths: [8, 70, 12, 14, 8, 6, 80], title: [0], header: [2] });
  }
  // The year-by-year tables: every quantitative metric computed over CAY, CAYm1 and CAYm2 (criteria 4 and 5 in the
  // engineering formats, 5 and 6 in the management format, 8 for Tier-I first-year academics).
  for (const m of c.a.metrics.filter((x) => x.kind === 'QnM' && x.inputs.length && x.yearsRequired > 1)) sheets.push(yearTable(m, `Table ${m.code}`));
  sheets.push({ name: 'CO-PO attainment', rows: [['Programme', 'Level', 'Code', 'Direct', 'Indirect', 'Attainment', 'Target', 'Gap', 'Met'], ...att.map((a) => [a.program, a.scope === 'po' ? 'PO / PSO' : 'CO', a.code, a.direct, a.indirect, a.combined, a.target, a.gap, yesNo(a.met)])], widths: [30, 10, 12, 10, 10, 12, 10, 10, 8], header: [0] });
  const pos = [...new Set(matrix.map((x) => x.po))].sort((x, y) => x.localeCompare(y, 'en', { numeric: true }));
  const cos = [...new Set(matrix.map((x) => `${x.program}|${x.co}`))];
  sheets.push({ name: 'CO-PO matrix', rows: [['Programme', 'Course outcome', ...pos], ...cos.map((k) => { const [prog, co] = k.split('|'); return [prog, co, ...pos.map((po) => matrix.find((x) => x.program === prog && x.co === co && x.po === po)?.strength ?? null)]; })], widths: [30, 16, ...pos.map(() => 8)], header: [0] });
  return xlsx(sheets, c.at);
}

/** NIRF data capturing system sheets for three years, and the score estimate per parameter with the methodology's formulas. */
export async function nirfDcs(c: ExportCtx): Promise<Buffer> {
  const ys = yearsOfCtx(c);
  const latest = ys[ys.length - 1];
  const get = (key: string, y: AcademicYear) => c.cache.get(key, y);
  const inputOf = (code: string, key: string, year: string) => metric(c, code)?.years.find((y) => y.year === year)?.inputs.find((i) => i.key === key)?.value ?? null;
  const sheets: Sheet[] = [];

  // Sanctioned (approved) intake by programme and year.
  const intake = new Map<string, Map<string, number>>();
  for (const y of ys) for (const r of (await get('seats_sanctioned', y)).rows) {
    const prog = String(r[1] || r[0]);
    intake.set(prog, (intake.get(prog) ?? new Map()).set(y.label, (intake.get(prog)?.get(y.label) ?? 0) + Number(r[2] ?? 0)));
  }
  sheets.push({ name: 'Sanctioned (Approved) Intake', rows: [['Academic year', ...ys.map((y) => y.label)], ...[...intake].map(([p, m]) => [p, ...ys.map((y) => m.get(y.label) ?? null)])], widths: [40, 14, 14, 14], header: [0] });

  // Total actual student strength (latest year) by programme, gender and category.
  const st = await get('students_on_roll', latest);
  const byProg = new Map<string, Cell[][]>();
  for (const r of st.rows) byProg.set(String(r[2] || 'Not assigned'), [...(byProg.get(String(r[2] || 'Not assigned')) ?? []), r]);
  const cnt = (rs: Cell[][], f: (r: Cell[]) => boolean) => rs.filter(f).length;
  const isF = (r: Cell[]) => /^f/i.test(String(r[3] ?? ''));
  const isM = (r: Cell[]) => /^m/i.test(String(r[3] ?? ''));
  const cat = (r: Cell[]) => String(r[4] ?? '').toLowerCase();
  const ws = metric(c, 'OI.RD');
  sheets.push({ name: 'Total Actual Student Strength', rows: [[`Total actual student strength (${latest.label})`], ['Programme', 'No. of male students', 'No. of female students', 'Total students', 'Within state (including male and female)', 'Outside state (including male and female)', 'Outside country (including male and female)', 'Economically backward (including male and female)', 'Socially challenged (SC + ST + OBC including male and female)'], ...[...byProg].map(([p, rs]) => [p, cnt(rs, isM), cnt(rs, isF), rs.length, null, null, null, cnt(rs, (r) => cat(r) === 'ews'), cnt(rs, (r) => ['sc', 'st', 'obc'].includes(cat(r)))]), ['All programmes', cnt(st.rows, isM), cnt(st.rows, isF), st.rows.length, ws ? (ws.combinedInputs.students ?? 0) - (ws.combinedInputs.otherStates ?? 0) - (ws.combinedInputs.otherCountries ?? 0) : null, ws?.combinedInputs.otherStates ?? null, ws?.combinedInputs.otherCountries ?? null, cnt(st.rows, (r) => cat(r) === 'ews'), cnt(st.rows, (r) => ['sc', 'st', 'obc'].includes(cat(r)))]], widths: [36, 14, 14, 12, 18, 18, 18, 18, 22], title: [0], header: [1] });

  // Placement and higher studies by year.
  sheets.push({ name: 'Placement & Higher Studies', rows: [['Academic year', 'No. of first year students intake in the year', 'No. of first year students admitted in the year', 'No. of students graduating in minimum stipulated time', 'No. of students placed', 'Median salary of placed graduates (amount in INR)', 'No. of students selected for higher studies'], ...(await Promise.all(ys.map(async (y) => [y.label, (await get('seats_sanctioned', y)).value, (await get('students_admitted', y)).value, inputOf('GO.GPH', 'graduating', y.label), inputOf('GO.GPH', 'placed', y.label), round(((await get('median_salary', y)).value ?? 0) * 100000, 0) || null, inputOf('GO.GPH', 'higher', y.label)])))], widths: [14, 20, 20, 22, 14, 22, 20], header: [0] });

  // Ph.D. students.
  const phdRoll = await get('phd_on_roll', latest);
  const ft = phdRoll.rows.filter((r) => !/part/i.test(String(r[1] ?? ''))).length;
  sheets.push({ name: 'Ph.D Student Details', rows: [['Ph.D. (student pursuing doctoral programme till ' + latest.label + ')', 'Total students'], ['Full time', ft], ['Part time', phdRoll.rows.length - ft], [], ['No. of Ph.D. students graduated (including integrated Ph.D.)', ...ys.map((y) => y.label)], ['Full time and part time', ...(await Promise.all(ys.map(async (y) => (await get('phd_awarded', y)).value)))]], widths: [60, 14, 14, 14], header: [0, 4] });

  // Financial resources: capital and operational expenditure (INR).
  const inr = (lakhs: number | null) => (lakhs === null ? null : Math.round(lakhs * 100000));
  const capital: Cell[][] = [];
  const operational: Cell[][] = [];
  for (const y of ys) {
    const cap = await get('capex_lakhs', y);
    const lib = await get('library_spend_lakhs', y);
    const equip = cap.rows.filter((r) => /(lab|equip|software|computer|instrument)/i.test(String(r[2] ?? ''))).reduce((a, r) => a + Number(r[4] ?? 0), 0);
    const other = (cap.value ?? 0) - equip;
    capital.push([y.label, inr(lib.value), inr(equip), null, inr(other), inr((lib.value ?? 0) + (cap.value ?? 0))]);
    const op = await get('opex_lakhs', y);
    const sal = op.rows.filter((r) => r[0] === 'Salaries').reduce((a, r) => a + Number(r[2] ?? 0), 0);
    const mnt = (await get('maintenance_lakhs', y)).value ?? 0;
    operational.push([y.label, inr(sal), inr(mnt), null, inr((op.value ?? 0) - sal), inr((op.value ?? 0) + mnt)]);
  }
  sheets.push({ name: 'Financial Resources - Capital', rows: [['Financial year', 'Library (books, journals and e-resources only)', 'New equipment and software for laboratories', 'Engineering workshops', 'Other expenditure on creation of capital assets (excluding land and building)', 'Total (INR)'], ...capital], widths: [14, 26, 26, 20, 30, 18], header: [0] });
  sheets.push({ name: 'Financial Resources - Operational', rows: [['Financial year', 'Salaries (teaching and non-teaching staff)', 'Maintenance of academic infrastructure or consumables and other running expenditures', 'Seminars / conferences / workshops', 'Other operational expenditure', 'Total (INR)'], ...operational], widths: [14, 26, 30, 22, 22, 18], header: [0] });

  // Sponsored research, consultancy, executive development.
  const sponsored: Cell[][] = [];
  for (const y of ys) {
    const g = await get('grants_lakhs', y);
    sponsored.push([y.label, g.rows.length, new Set(g.rows.map((r) => String(r[2] ?? ''))).size, inr(g.value)]);
  }
  sheets.push({ name: 'Sponsored Research Details', rows: [['Financial year', 'Total no. of sponsored projects', 'Total no. of funding agencies', 'Total amount received (amount in INR)'], ...sponsored], widths: [14, 24, 24, 26], header: [0] });
  sheets.push({ name: 'Consultancy Project Details', rows: [['Financial year', 'Total amount received (amount in INR)'], ...ys.map((y) => [y.label, inr(inputOf('RP.FPPP', 'consultancy', y.label))])], widths: [14, 30], header: [0] });
  if (c.f.key === 'nirf-management') sheets.push({ name: 'Executive Development Programs', rows: [['Financial year', 'Total no. of executive development programmes / management development programmes', 'Total no. of participants', 'Total annual earnings (amount in INR, excluding lodging and boarding)'], ...ys.map((y) => [y.label, null, null, inr(inputOf('RP.FPPP', 'consultancy', y.label))])], widths: [14, 40, 20, 36], header: [0] });

  // PCS facilities, faculty, IPR.
  const pcs = metric(c, 'OI.PCS');
  sheets.push({ name: 'PCS Facilities', rows: [['Facilities for physically challenged students', 'Answer'], ...(pcs?.options?.labels ?? []).map((l, i) => [l, pcs?.options?.selected ? yesNo(pcs.options.selected.includes(i)) : 'Not answered'])], widths: [80, 16], header: [0] });
  const fac = await get('teachers_all', latest);
  sheets.push({ name: 'Faculty Details', rows: [['Srno', 'Name', 'Department', 'Designation', 'Gender', 'Association type', 'Joining date'], ...fac.rows.map((r, i) => [i + 1, r[0], r[1], r[2], r[4], r[3] === 'visiting' ? 'Visiting' : 'Regular', r[5]])], widths: [6, 30, 24, 24, 10, 16, 14], header: [0], freeze: 1 });
  sheets.push({ name: 'IPR', rows: [['Calendar year', 'No. of patents published', 'No. of patents granted'], ...(await Promise.all(ys.map(async (y) => [y.cal, (await get('patents_published', y)).value, (await get('patents_granted', y)).value])))], widths: [14, 24, 24], header: [0] });

  // Score estimate.
  const est: Cell[][] = [[`${c.f.title}: score estimate (${c.a.window[0]} to ${c.a.cycle})`], ['Indicative: NIRF scales several sub-parameters against the best institution in the category; set those benchmarks in accreditation settings.'], [], ['Parameter', 'Weight %', 'Sub-parameter', 'Title', 'Value', 'Unit', 'Benchmark', 'Marks', 'Of', 'Formula']];
  for (const cr of c.a.criteria) {
    for (const m of c.a.metrics.filter((x) => x.criterion === cr.id)) est.push([cr.id, cr.weight, m.code.split('.')[1], m.title, round(m.value, 2), m.unit, m.bench, m.score, m.maxScore, m.formula]);
    est.push([`${cr.id} score`, cr.weight, '', cr.title, null, '', null, cr.score, cr.max, `Contribution to the total: ${round(((cr.score ?? 0) * cr.weight) / Math.max(1, cr.max), 2)}`]);
  }
  est.push([], ['Estimated total score', '', '', '', c.a.estimate.value, 'of 100']);
  sheets.unshift({ name: 'Score estimate', rows: est, widths: [10, 9, 10, 50, 12, 18, 11, 8, 6, 90], title: [0], header: [3], freeze: 4 });
  return xlsx(sheets, c.at);
}

/** AISHE DCF-II (college) blocks from ERP data, with what remains to be entered by hand. */
export async function aisheDcf(c: ExportCtx, profile: Record<string, string | number | null>): Promise<Buffer> {
  const y = yearsOfCtx(c).at(-1)!;
  const get = (key: string) => c.cache.get(key, y);
  const gender = (v: Cell) => (/^f/i.test(String(v ?? '')) ? 'Female' : /^(t|other)/i.test(String(v ?? '')) ? 'Transgender' : /^m/i.test(String(v ?? '')) ? 'Male' : 'Not recorded');
  const tally = (rows: Cell[][], key: (r: Cell[]) => string, g: (r: Cell[]) => string) => {
    const out = new Map<string, Record<string, number>>();
    for (const r of rows) {
      const k = key(r) || 'Not recorded';
      const t = (out.get(k) ?? {}) as Record<string, number>;
      t[g(r)] = (t[g(r)] ?? 0) + 1;
      out.set(k, t);
    }
    return out;
  };
  const sheets: Sheet[] = [];
  sheets.push({ name: 'Block 1 Basic information', rows: [[`AISHE DCF-II (college), survey year ${y.label}`], [], ['Item', 'Detail'], ...Object.entries(profile).map(([k, v]) => [k, v])], widths: [44, 80], title: [0], header: [2] });
  const progs = await get('programmes');
  sheets.push({ name: 'Block 2 Programmes', rows: [['Level', 'Programme', 'Code', 'Duration (semesters)', 'Intake'], ...progs.rows.map((r) => [r[1], r[0], r[2], r[3], null])], widths: [12, 40, 14, 18, 10], header: [0] });
  const t = tally((await get('teachers_all')).rows, (r) => String(r[2] || 'Designation not recorded'), (r) => gender(r[4]));
  sheets.push({ name: 'Block 3 Teaching staff', rows: [['Designation', 'Male', 'Female', 'Transgender', 'Gender not recorded', 'Total'], ...[...t].map(([d, g]) => [d, g.Male ?? 0, g.Female ?? 0, g.Transgender ?? 0, g['Not recorded'] ?? 0, Object.values(g).reduce((a, b) => a + b, 0)])], widths: [36, 10, 10, 12, 18, 10], header: [0] });
  const teacherList = await get('teachers_all');
  sheets.push({ name: 'Teacher information', rows: [['Name', 'Department', 'Designation', 'Nature of appointment', 'Gender', 'Date of joining', 'Social category', 'Highest qualification'], ...teacherList.rows.map((r) => [r[0], r[1], r[2], r[3], gender(r[4]), r[5], null, null])], widths: [30, 24, 24, 18, 12, 14, 14, 20], header: [0], freeze: 1 });
  const nt = tally((await get('staff_nonteaching')).rows, (r) => String(r[2] || 'Designation not recorded'), (r) => gender(r[3]));
  sheets.push({ name: 'Block 4 Non-teaching staff', rows: [['Post / group', 'Male', 'Female', 'Transgender', 'Gender not recorded', 'Total'], ...[...nt].map(([d, g]) => [d, g.Male ?? 0, g.Female ?? 0, g.Transgender ?? 0, g['Not recorded'] ?? 0, Object.values(g).reduce((a, b) => a + b, 0)])], widths: [36, 10, 10, 12, 18, 10], header: [0] });
  const cats = ['General', 'EWS', 'SC', 'ST', 'OBC'];
  const catOf = (v: Cell) => { const s = String(v ?? '').toUpperCase(); return s === 'EWS' ? 'EWS' : s === 'SC' ? 'SC' : s === 'ST' ? 'ST' : s.startsWith('OBC') ? 'OBC' : 'General'; };
  const st = await get('students_on_roll');
  const enrol = new Map<string, Record<string, number>>();
  for (const r of st.rows) {
    const k = String(r[2] || 'Not assigned');
    const e = enrol.get(k) ?? {};
    const key = `${catOf(r[4])}|${gender(r[3])}`;
    e[key] = (e[key] ?? 0) + 1;
    enrol.set(k, e);
  }
  const g3 = ['Male', 'Female', 'Transgender'];
  sheets.push({ name: 'Block 5 Enrolment', rows: [[`Students enrolled, ${y.label} (category recorded as General when not given)`], ['Programme', ...cats.flatMap((ct) => g3.map((g) => `${ct} ${g.toLowerCase()}`)), 'Gender not recorded', 'Total'], ...[...enrol].map(([p, e]) => [p, ...cats.flatMap((ct) => g3.map((g) => e[`${ct}|${g}`] ?? 0)), Object.entries(e).filter(([k]) => k.endsWith('|Not recorded')).reduce((a, [, v]) => a + v, 0), Object.values(e).reduce((a, b) => a + b, 0)])], widths: [30, ...cats.flatMap(() => g3.map(() => 11)), 14, 10], title: [0], header: [1], freeze: 2 });
  const pwd = metric(c, 'AISHE-5.4');
  const yc = pwd?.years.find((x) => x.year === y.label);
  sheets.push({ name: 'Block 5 PwD and minority', rows: [['Item', 'Students'], ...(pwd?.inputs ?? []).map((d) => [d.label, yc?.inputs.find((i) => i.key === d.key)?.value ?? null])], widths: [40, 12], header: [0] });
  const foreign = c.rows.get('AISHE-5.5')?.get(y.label) ?? [];
  sheets.push({ name: 'Block 5 Foreign students', rows: [metric(c, 'AISHE-5.5')?.columns ?? ['Country'], ...foreign], widths: [24, 30, 10, 10, 12], header: [0] });
  const fin = await get('final_appeared');
  const res = new Map<string, number[]>();
  for (const r of fin.rows) {
    const k = String(r[2] || 'Not assigned');
    const v = res.get(k) ?? [0, 0, 0, 0];
    const f = gender(r[6]) === 'Female';
    v[f ? 1 : 0]++;
    if (r[4] === 'pass') v[f ? 3 : 2]++;
    res.set(k, v);
  }
  sheets.push({ name: 'Block 6 Examination results', rows: [['Programme', 'Appeared (male and not recorded)', 'Appeared (female)', 'Passed (male and not recorded)', 'Passed (female)', 'Total appeared', 'Total passed'], ...[...res].map(([p, v]) => [p, v[0], v[1], v[2], v[3], v[0] + v[1], v[2] + v[3]])], widths: [30, 22, 16, 22, 16, 14, 14], header: [0] });
  const rec = metric(c, 'AISHE-7.1');
  const exp = metric(c, 'AISHE-7.2');
  const ci = (m: MetricResult | undefined, k: string) => m?.years.find((x) => x.year === y.label)?.inputs.find((i) => i.key === k)?.value ?? null;
  sheets.push({ name: 'Block 7 Financial', rows: [['Head', 'Amount (INR lakhs)'], ['Receipts: fees', ci(rec, 'fees')], ['Receipts: grants from central and state government', ci(rec, 'grants')], ['Receipts: other', ci(rec, 'other')], ['Expenditure: operational including salaries', ci(exp, 'opex')], ['Expenditure: capital', ci(exp, 'capex')]], widths: [60, 20], header: [0] });
  const fac = metric(c, 'AISHE-8.4');
  sheets.push({ name: 'Block 8 Infrastructure', rows: [['Item', 'Number or availability'], ['Classrooms and halls', (await get('classrooms')).value], ['Computers for academic use', (await get('computers')).value], ['Books in the library (copies)', (await get('library_titles')).value], ...(fac?.options?.labels ?? []).map((l, i) => [l, fac?.options?.selected ? yesNo(fac.options.selected.includes(i)) : 'Not answered'])], widths: [50, 22], header: [0] });
  const sch = await get('scholarship_students');
  const bySch = new Map<string, Set<string>>();
  for (const r of sch.rows) bySch.set(String(r[1]), (bySch.get(String(r[1])) ?? new Set()).add(String(r[0])));
  sheets.push({ name: 'Block 9 Scholarships', rows: [['Scheme', 'Students'], ...[...bySch].map(([k, v]) => [k, v.size])], widths: [50, 12], header: [0] });
  sheets.push({ name: 'To complete by hand', rows: [['Item', 'What is missing'], ...c.a.metrics.filter((m) => !m.complete).map((m) => [`${m.code} ${m.title}`, m.kind === 'QlM' ? 'Details' : m.options ? 'Facilities to tick' : 'Figures or evidence'])], widths: [90, 30], header: [0] });
  return xlsx(sheets, c.at);
}

/** UDISE+ school return: profile, facilities, teacher profile, enrolment by class, student profile (SDMS) and results. */
export async function udise(c: ExportCtx, profile: Record<string, string | number | null>): Promise<Buffer> {
  const y = yearsOfCtx(c).at(-1)!;
  const get = (key: string) => c.cache.get(key, y);
  const sheets: Sheet[] = [];
  sheets.push({ name: 'School profile', rows: [[`UDISE+ ${y.label}`], [], ['Item', 'Detail'], ...Object.entries(profile).map(([k, v]) => [k, v]), ['Instructional days', metric(c, 'UDISE-1.2')?.value ?? null]], widths: [40, 80], title: [0], header: [2] });
  const fac = metric(c, 'UDISE-2.5');
  const toil = metric(c, 'UDISE-2.3')?.years.find((x) => x.year === y.label)?.inputs ?? [];
  sheets.push({ name: 'Facilities', rows: [['Item', 'Number or availability'], ['Classrooms', (await get('classrooms')).value], ['Computers', (await get('computers')).value], ['Smart classrooms', (await get('ict_rooms')).value], ['Library books', (await get('library_titles')).value], ['Toilets for boys', toil.find((i) => i.key === 'boys')?.value ?? null], ['Toilets for girls', toil.find((i) => i.key === 'girls')?.value ?? null], ['CWSN-friendly toilets', toil.find((i) => i.key === 'cwsn')?.value ?? null], ...(fac?.options?.labels ?? []).map((l, i) => [l, fac?.options?.selected ? yesNo(fac.options.selected.includes(i)) : 'Not answered'])], widths: [40, 22], header: [0] });
  const teachers = await get('teachers_all');
  sheets.push({ name: 'Teacher profile', rows: [['Teacher name', 'Gender', 'Nature of appointment', 'Date of joining', 'Department / subject', 'Designation', 'Social category', 'Academic qualification', 'Professional qualification', 'In-service training received'], ...teachers.rows.map((r) => [r[0], r[4], r[3], r[5], r[1], r[2], null, null, null, null])], widths: [28, 10, 18, 14, 22, 20, 14, 20, 20, 18], header: [0], freeze: 1 });
  const st = await get('students_on_roll');
  const byClass = new Map<string, number[]>();
  for (const r of st.rows) {
    const k = String(r[7] || r[2] || 'Not assigned');
    const v = byClass.get(k) ?? [0, 0, 0];
    const g = String(r[3] ?? '');
    v[/^f/i.test(g) ? 1 : /^m/i.test(g) ? 0 : 2]++;
    byClass.set(k, v);
  }
  sheets.push({ name: 'Enrolment by class', rows: [['Class / section', 'Boys', 'Girls', 'Gender not recorded', 'Total'], ...[...byClass].map(([k, v]) => [k, v[0], v[1], v[2], v[0] + v[1] + v[2]])], widths: [30, 10, 10, 18, 10], header: [0] });
  sheets.push({ name: 'Student profile (SDMS)', rows: [['Student name', 'Gender', 'Social category', 'Class / section', 'Roll no.', 'Date of admission', 'Status'], ...st.rows.map((r) => [r[1], r[3], r[4], r[7] || r[2], r[0], r[6], r[5]])], widths: [28, 10, 14, 24, 10, 16, 12], header: [0], freeze: 1 });
  const fin = await get('final_appeared');
  sheets.push({ name: 'Results', rows: [['Class / programme', 'Appeared', 'Passed'], ...[...new Set(fin.rows.map((r) => String(r[2])))].map((p) => [p, fin.rows.filter((r) => r[2] === p).length, fin.rows.filter((r) => r[2] === p && r[4] === 'pass').length])], widths: [30, 12, 12], header: [0] });
  sheets.push({ name: 'To complete by hand', rows: [['Item', 'What is missing'], ...c.a.metrics.filter((m) => !m.complete).map((m) => [`${m.code} ${m.title}`, m.kind === 'QlM' ? 'Details' : m.options ? 'Facilities to tick' : 'Figures or evidence']), ['Teacher social category and qualifications', 'Not held in the staff records'], ['Student Aadhaar, PEN, CWSN and BPL status', 'Not held in the student records']], widths: [90, 40], header: [0] });
  return xlsx(sheets, c.at);
}
