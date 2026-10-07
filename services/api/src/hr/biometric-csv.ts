/**
 * Reads a biometric device's CSV export: `employee_code,date,in_time,out_time` (header required,
 * column order free). Dates are YYYY-MM-DD or DD-MM-YYYY (also with "/"); times HH:MM[:SS] (a
 * blank out time is allowed). Several punches for one person on one day collapse to the earliest
 * in and the latest out. Another device format is a new parser with the same output.
 */
export interface BiometricDay {
  employeeCode: string;
  date: string;
  inTime: string;
  outTime: string | null;
}

export interface ParsedBiometric {
  days: (BiometricDay & { line: number })[];
  errors: { line: number; error: string }[];
}

/** Splits one CSV line, honouring double quotes. */
export function splitCsv(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      out.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

export function normalizeDate(raw: string): string | null {
  const s = raw.trim().replace(/\//g, '-');
  let y: string, m: string, d: string;
  let hit = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (hit) [, y, m, d] = hit;
  else if ((hit = /^(\d{1,2})-(\d{1,2})-(\d{4})$/.exec(s))) [, d, m, y] = hit;
  else return null;
  const iso = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  const t = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(t.getTime()) || t.toISOString().slice(0, 10) !== iso ? null : iso;
}

export function normalizeTime(raw: string): string | null {
  const hit = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(raw.trim());
  if (!hit || Number(hit[1]) > 23 || Number(hit[2]) > 59 || Number(hit[3] ?? 0) > 59) return null;
  return `${hit[1].padStart(2, '0')}:${hit[2]}:${hit[3] ?? '00'}`;
}

export function parseBiometricCsv(csv: string): ParsedBiometric {
  const lines = csv.replace(/^﻿/, '').split(/\r?\n/);
  const header = splitCsv(lines[0] ?? '').map((h) => h.toLowerCase());
  const col = (name: string) => header.indexOf(name);
  const [ci, di, ii, oi] = ['employee_code', 'date', 'in_time', 'out_time'].map(col);
  if (ci < 0 || di < 0 || ii < 0) return { days: [], errors: [{ line: 1, error: 'Header must have employee_code, date, in_time and (optionally) out_time' }] };
  const errors: ParsedBiometric['errors'] = [];
  const byKey = new Map<string, BiometricDay & { line: number }>();
  for (let n = 1; n < lines.length; n++) {
    if (!lines[n].trim()) continue;
    const cells = splitCsv(lines[n]);
    const code = cells[ci]?.trim();
    const date = normalizeDate(cells[di] ?? '');
    const inTime = normalizeTime(cells[ii] ?? '');
    const outRaw = oi >= 0 ? (cells[oi] ?? '').trim() : '';
    const outTime = outRaw ? normalizeTime(outRaw) : null;
    if (!code) errors.push({ line: n + 1, error: 'Missing employee_code' });
    else if (!date) errors.push({ line: n + 1, error: `Bad date "${cells[di] ?? ''}"` });
    else if (!inTime) errors.push({ line: n + 1, error: `Bad in_time "${cells[ii] ?? ''}"` });
    else if (outRaw && !outTime) errors.push({ line: n + 1, error: `Bad out_time "${outRaw}"` });
    else {
      const key = `${code}|${date}`;
      const prev = byKey.get(key);
      if (!prev) byKey.set(key, { employeeCode: code, date, inTime, outTime, line: n + 1 });
      else {
        if (inTime < prev.inTime) prev.inTime = inTime;
        // A later punch (in or out) extends the day.
        for (const t of [outTime, inTime]) if (t && (!prev.outTime || t > prev.outTime) && t > prev.inTime) prev.outTime = t;
      }
    }
  }
  return { days: [...byKey.values()], errors };
}
