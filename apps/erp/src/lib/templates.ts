// Pure helpers behind the module page templates (components/templates): report presets and numbering series.

export interface ReportPreset {
  name: string;
  /** The filter query string, without `?`. */
  query: string;
}

/** Adds or replaces a preset by name (case-insensitive), newest first, at most 12. */
export function savePreset(list: ReportPreset[], p: ReportPreset): ReportPreset[] {
  const name = p.name.trim().slice(0, 60);
  if (!name) return list;
  return [{ name, query: p.query }, ...list.filter((x) => x.name.toLowerCase() !== name.toLowerCase())].slice(0, 12);
}

export function parsePresets(raw: string | null): ReportPreset[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw) as unknown;
    return Array.isArray(v) ? v.filter((x): x is ReportPreset => !!x && typeof x.name === 'string' && typeof x.query === 'string').slice(0, 12) : [];
  } catch {
    return [];
  }
}

export interface NumberingSeries {
  prefix: string;
  next: number;
  /** Zero-padded width of the running number. */
  pad: number;
  suffix?: string;
}

/** The next document number of a series, e.g. RCPT/2026-27/00042. `{YY}` and `{FY}` expand from `on`. */
export function formatSeries(s: NumberingSeries, on = new Date()): string {
  const y = on.getFullYear();
  const fyStart = on.getMonth() >= 3 ? y : y - 1; // Indian financial year starts in April
  const expand = (x: string) => x.replaceAll('{YY}', String(y).slice(2)).replaceAll('{YYYY}', String(y)).replaceAll('{FY}', `${fyStart}-${String(fyStart + 1).slice(2)}`);
  return `${expand(s.prefix)}${String(Math.max(0, Math.trunc(s.next))).padStart(Math.min(Math.max(s.pad, 1), 10), '0')}${expand(s.suffix ?? '')}`;
}
