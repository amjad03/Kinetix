/**
 * Pure rules of the research pass: researcher identifiers, duplicate detection by title, grant budgets, releases,
 * overhead and the GFR 12-A utilisation figures, incentive amounts, the UGC 2018 similarity levels, UGC 2022 Ph.D.
 * limits (supervisor caps, duration) and the NIRF research ratios. Money is integer paise throughout.
 */

// ---- researcher identifiers ---------------------------------------------------------------------

/** A Scopus Author ID: 10 or 11 digits. */
export const validScopusId = (v: string) => /^\d{10,11}$/.test(v.trim());
/** A Web of Science ResearcherID: one to three letters, four digits and a four-digit year (AAB-1234-2019). */
export const validWosId = (v: string) => /^[A-Z]{1,3}-\d{4}-(19|20)\d{2}$/.test(v.trim().toUpperCase());
/** A Google Scholar profile id: the 12 characters after `user=` in the profile link. */
export function scholarIdOf(v: string): string | null {
  const m = /[?&]user=([A-Za-z0-9_-]{12})/.exec(v) ?? /^([A-Za-z0-9_-]{12})$/.exec(v.trim());
  return m ? m[1] : null;
}
/** A Vidwan (INFLIBNET) expert id: digits, or the number at the end of a vidwan.inflibnet.ac.in profile link. */
export function vidwanIdOf(v: string): string | null {
  const m = /vidwan\.inflibnet\.ac\.in\/profile\/(\d{3,9})/i.exec(v) ?? /^(\d{3,9})$/.exec(v.trim());
  return m ? m[1] : null;
}

// ---- duplicates ---------------------------------------------------------------------------------

/** The comparison key of a title: lower case letters and digits only, so punctuation and spacing do not hide a duplicate. */
export const titleKey = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, '');
/** The same expression in SQL (matches the publications_title_key_idx index). */
export const TITLE_KEY_SQL = `regexp_replace(lower(title), '[^a-z0-9]+', '', 'g')`;

// ---- funded projects ----------------------------------------------------------------------------

export const BUDGET_HEADS = ['manpower', 'equipment', 'consumables', 'travel', 'contingency', 'overhead', 'other'] as const;
export type BudgetHead = (typeof BUDGET_HEADS)[number];

const GOVT = /\b(ugc|dst|serb|anrf|dbt|csir|icssr|icmr|icar|aicte|drdo|isro|barc|meity|mhrd|moe|ministry|government|govt|department of|state council|kscst|nbhm|dae|ichr)\b/i;
/** A grant's agency kind when none is given: government for a ministry, department or council (by its name), else non-government. */
export const agencyKindOf = (agency: string) => (GOVT.test(agency) ? 'government' : 'non_government');

/** Overhead the institution keeps on what was released: `pct` percent, rounded to the paisa. */
export const overheadPaise = (releasedPaise: number, pct: number) => Math.round((releasedPaise * pct) / 100);

export interface ExpenseCheck {
  sanctionedPaise: number;
  /** Sanction under the expense's head; null when the grant has no heads (only the total applies). */
  headSanctionedPaise: number | null;
  headSpentPaise: number;
  spentPaise: number;
  /** Total released so far; null when no release is recorded (the sanction is the limit). */
  releasedPaise: number | null;
  amountPaise: number;
}

/** Why an expense cannot be booked, or null: within the head, within what was released, within the sanction. */
export function expenseRefusal(c: ExpenseCheck): { code: string; message: string; limitPaise: number } | null {
  if (c.headSanctionedPaise !== null && c.headSpentPaise + c.amountPaise > c.headSanctionedPaise) return { code: 'HEAD_OVERSPEND', message: 'This expense exceeds what is left under its budget head', limitPaise: c.headSanctionedPaise - c.headSpentPaise };
  if (c.spentPaise + c.amountPaise > c.sanctionedPaise) return { code: 'GRANT_OVERSPEND', message: 'This expense exceeds the unspent balance of the grant', limitPaise: c.sanctionedPaise - c.spentPaise };
  if (c.releasedPaise !== null && c.spentPaise + c.amountPaise > c.releasedPaise) return { code: 'FUNDS_NOT_RELEASED', message: 'This expense exceeds the funds the agency has released so far', limitPaise: c.releasedPaise - c.spentPaise };
  return null;
}

export interface Dated {
  on: string;
  amountPaise: number;
}

/**
 * The figures of a utilisation certificate (GFR 2017 form 12-A) for a period: what was unspent at its start, what
 * was received in it, what was spent in it, and what is unspent at its end.
 */
export function ucFigures(releases: Dated[], expenses: Dated[], from: string, to: string) {
  const sum = (xs: Dated[], f: (d: string) => boolean) => xs.filter((x) => f(x.on)).reduce((s, x) => s + x.amountPaise, 0);
  const openingPaise = sum(releases, (d) => d < from) - sum(expenses, (d) => d < from);
  const receivedPaise = sum(releases, (d) => d >= from && d <= to);
  const spentPaise = sum(expenses, (d) => d >= from && d <= to);
  return { openingPaise, receivedPaise, availablePaise: openingPaise + receivedPaise, spentPaise, closingPaise: openingPaise + receivedPaise - spentPaise };
}

// ---- incentives ---------------------------------------------------------------------------------

export interface IncentivePaper {
  kind: string;
  indexedIn: string[];
  quartile: string | null;
  status: string;
}

/** The best-paying rate a paper qualifies for under a scheme's rates (paise), or null when none applies. */
export function paperBasis(p: IncentivePaper, rates: Record<string, number>): { basis: string; ratePaise: number } | null {
  if (p.status === 'retracted') return null;
  const idx = new Set(p.indexedIn.map((x) => x.toLowerCase().replace(/[\s-]+/g, '_')));
  const keys: string[] = [];
  if (p.kind === 'journal') {
    if ((idx.has('scopus') || idx.has('wos')) && p.quartile) keys.push(`scopus_${p.quartile.toLowerCase()}`);
    if (idx.has('wos')) keys.push('wos');
    if (idx.has('scopus')) keys.push('scopus');
    if (idx.has('ugc_care')) keys.push('ugc_care');
  } else keys.push(p.kind);
  const hits = keys.filter((k) => Number(rates[k]) > 0).map((k) => ({ basis: k, ratePaise: Math.round(Number(rates[k])) }));
  return hits.sort((a, b) => b.ratePaise - a.ratePaise)[0] ?? null;
}

/**
 * What one claimant is paid: the full rate for the first author, `coAuthorPct` of it for a co-author, cut to what is
 * left of the yearly cap (0 = no cap).
 */
export function incentiveAmount(ratePaise: number, firstAuthor: boolean, coAuthorPct: number, capPaise: number, alreadyThisYearPaise: number): number {
  const share = firstAuthor ? ratePaise : Math.round((ratePaise * coAuthorPct) / 100);
  return capPaise > 0 ? Math.max(0, Math.min(share, capPaise - alreadyThisYearPaise)) : share;
}

/** The Indian financial year (2026-27) that holds a date. */
export function financialYear(d: string): { label: string; from: string; to: string } {
  const y = Number(d.slice(0, 4));
  const start = Number(d.slice(5, 7)) >= 4 ? y : y - 1;
  return { label: `${start}-${String((start + 1) % 100).padStart(2, '0')}`, from: `${start}-04-01`, to: `${start + 1}-03-31` };
}

// ---- theses and scholars ------------------------------------------------------------------------

/**
 * The UGC (Promotion of Academic Integrity and Prevention of Plagiarism) Regulations 2018 levels for the core work:
 * up to 10% is level 0 (no penalty), above 10 to 40% level 1, above 40 to 60% level 2, above 60% level 3.
 */
export function ugcLevel(scorePercent: number): 'level_0' | 'level_1' | 'level_2' | 'level_3' {
  if (scorePercent <= 10) return 'level_0';
  if (scorePercent <= 40) return 'level_1';
  if (scorePercent <= 60) return 'level_2';
  return 'level_3';
}

/** UGC Ph.D. Regulations 2022: a Professor guides up to 8 scholars, an Associate Professor 6, an Assistant Professor 4. */
export function capForDesignation(designation: string | null | undefined, fallback: number): number {
  const d = (designation ?? '').toLowerCase();
  if (/assistant\s+professor/.test(d)) return 4;
  if (/associate\s+professor/.test(d)) return 6;
  if (/professor/.test(d)) return 8;
  return fallback;
}

/** The last day a scholar may submit: six years from registration, two more for women and persons with disabilities (UGC 2022). */
export function maxSubmissionOn(enrolledOn: string, gender: string | null | undefined, extraYears = 0): string {
  const years = 6 + (gender === 'female' ? 2 : 0) + extraYears;
  const d = new Date(`${enrolledOn}T00:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() + years);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** The next progress report is due `months` after the end of the last period (or of registration). */
export function nextReportDue(lastPeriodTo: string | null, enrolledOn: string, months = 6): string {
  const d = new Date(`${lastPeriodTo ?? enrolledOn}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

// ---- NIRF research and professional practice ----------------------------------------------------

export interface NirfInputs {
  /** Regular faculty in each of the three years. */
  faculty: number[];
  /** Indexed (Scopus / Web of Science) papers in each of the three calendar years. */
  papers: number[];
  citations: number[];
  /** Sponsored research and consultancy received, in paise, each financial year. */
  researchPaise: number[];
  consultancyPaise: number[];
  patentsPublished: number;
  patentsGranted: number;
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * The institution's own NIRF RP ratios over three years: PU (papers per faculty), QP (citations per paper),
 * FPPP (research and consultancy per faculty, in lakhs) and IPR (patents). NIRF scores these against all the other
 * institutions, so these are the inputs and ratios, not the published scores.
 */
export function nirfRatios(i: NirfInputs) {
  const f = avg(i.faculty);
  const papers = i.papers.reduce((a, b) => a + b, 0);
  const cites = i.citations.reduce((a, b) => a + b, 0);
  return {
    facultyAverage: r2(f),
    pu: { papers, perFaculty: f ? r2(papers / 3 / f) : 0 },
    qp: { citations: cites, perPaper: papers ? r2(cites / papers) : 0 },
    fppp: { researchLakhsPerYear: r2(avg(i.researchPaise) / 1e7), consultancyLakhsPerYear: r2(avg(i.consultancyPaise) / 1e7), perFacultyLakhs: f ? r2((avg(i.researchPaise) + avg(i.consultancyPaise)) / 1e7 / f) : 0 },
    ipr: { published: i.patentsPublished, granted: i.patentsGranted },
  };
}
