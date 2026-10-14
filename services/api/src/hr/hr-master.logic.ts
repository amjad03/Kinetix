/** Pure rules of the staff master (tested in hr-master.logic.spec.ts). */

const DAY = 86_400_000;
const utc = (d: string) => Date.parse(`${d}T00:00:00Z`);
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/**
 * The retirement date under the usual Indian service rule: the afternoon of the last day of the month in which
 * the person reaches the age; someone born on the 1st of a month retires on the last day of the month before.
 */
export function retirementDate(dateOfBirth: string, age: number): string {
  const [y, m, d] = dateOfBirth.split('-').map(Number);
  const month = d === 1 ? m - 1 : m; // 1-based; 0 means December of the year before
  return iso(Date.UTC(y + age, month, 1) - DAY);
}

/**
 * Years of service in periods (inclusive dates), overlapping periods counted once; `teaching` counts only the
 * teaching periods. One decimal.
 */
export function serviceYears(periods: { from: string; to: string; kind: string }[]): { total: number; teaching: number } {
  const span = (list: { from: string; to: string }[]) => {
    const sorted = list.filter((p) => p.to >= p.from).map((p) => [utc(p.from), utc(p.to) + DAY] as const).sort((a, b) => a[0] - b[0]);
    let days = 0;
    let end = -Infinity;
    for (const [s, e] of sorted) {
      const start = Math.max(s, end);
      if (e > start) days += (e - start) / DAY;
      end = Math.max(end, e);
    }
    return Math.round((days / 365.25) * 10) / 10;
  };
  return { total: span(periods), teaching: span(periods.filter((p) => p.kind === 'teaching')) };
}

/** AICTE's cadre ratio for a department: 1 professor : 2 associate professors : 6 assistant professors. */
export function cadreRatio(counts: { professor: number; associate: number; assistant: number }): { required: { professor: number; associate: number; assistant: number }; meets: boolean } {
  const total = counts.professor + counts.associate + counts.assistant;
  const unit = total / 9;
  const required = { professor: Math.ceil(unit * 1 - 1e-9), associate: Math.ceil(unit * 2 - 1e-9), assistant: Math.max(0, total - Math.ceil(unit - 1e-9) - Math.ceil(unit * 2 - 1e-9)) };
  return { required, meets: counts.professor >= required.professor && counts.professor + counts.associate >= required.professor + required.associate };
}

/** Students per teacher, one decimal; null without teachers. */
export const sfr = (students: number, teachers: number) => (teachers > 0 ? Math.round((students / teachers) * 10) / 10 : null);
