/**
 * University register numbers given at admission. VTU's USN is built by the college at admission (region digit,
 * college code, year of admission, branch code, roll in the branch; lateral entrants from 400), so the ERP can issue it;
 * universities on UUCMS issue their own, so the student waits on the "awaiting register number" list until the number
 * is imported. A template names the parts: {region} {college} {yy} {yyyy} {branch} {seq:3}.
 */

export interface RegisterParts {
  region: string;
  college: string;
  /** The calendar year the batch was admitted in (2026 for 2026-27). */
  year: number;
  branch: string;
}

/** Templates for profiles whose register number the college builds itself. */
export const PROFILE_TEMPLATES: Record<string, string> = { vtu: '{region}{college}{yy}{branch}{seq:3}' };

/** The first roll a lateral entrant may take, per template's sequence width (VTU: 400). */
export const LATERAL_START = 400;

const TOKEN = /\{(region|college|yy|yyyy|branch|seq(?::(\d))?)\}/g;

export function templateProblems(t: string): string[] {
  const out: string[] = [];
  if (!t.trim()) return ['The template is empty'];
  const seqs = [...t.matchAll(/\{seq(?::(\d))?\}/g)];
  if (seqs.length !== 1) out.push('The template needs exactly one {seq} (or {seq:3})');
  else if (!t.trim().endsWith(seqs[0][0])) out.push('{seq} must come last');
  const rest = t.replace(TOKEN, '');
  if (/[{}]/.test(rest)) out.push('Unknown part in the template: use {region}, {college}, {yy}, {yyyy}, {branch} and {seq:3}');
  if (/[^A-Za-z0-9/-]/.test(rest)) out.push('Only letters, digits, / and - may sit between the parts');
  return out;
}

/** The fixed part before the roll, upper-cased: "1SB26CS". */
export function registerPrefix(t: string, p: RegisterParts): string {
  return t
    .replace(/\{seq(?::\d)?\}$/, '')
    .replace(TOKEN, (_m, k: string) => (k === 'region' ? p.region : k === 'college' ? p.college : k === 'yy' ? String(p.year % 100).padStart(2, '0') : k === 'yyyy' ? String(p.year) : k === 'branch' ? p.branch : ''))
    .toUpperCase();
}

export const seqWidth = (t: string) => Number(/\{seq(?::(\d))?\}/.exec(t)?.[1] ?? 3);

/**
 * The next register number after the ones already issued with this prefix. Regular admissions count up from 1 and stay
 * below the lateral series; lateral entrants count up from 400 (VTU).
 */
export function nextRegisterNo(t: string, p: RegisterParts, taken: string[], lateral: boolean): string {
  const prefix = registerPrefix(t, p);
  const width = seqWidth(t);
  const used = taken.filter((x) => x.toUpperCase().startsWith(prefix)).map((x) => Number(x.slice(prefix.length))).filter((n) => Number.isInteger(n) && n > 0);
  const start = lateral ? LATERAL_START : 1;
  const ceiling = lateral ? 10 ** width : LATERAL_START;
  const inBand = used.filter((n) => n >= start && n < ceiling);
  const next = inBand.length ? Math.max(...inBand) + 1 : start;
  if (next >= ceiling) throw new Error(lateral ? `The lateral series of ${prefix} is full` : `The regular series of ${prefix} reached ${LATERAL_START - 1}; lateral numbers start at ${LATERAL_START}`);
  return `${prefix}${String(next).padStart(width, '0')}`;
}
