// Shapes returned by /v1/accreditation and small helpers for its pages.

export interface AccMetric {
  code: string;
  group: string;
  kind: 'QnM' | 'QlM';
  title: string;
  unit: string;
  value: number | null;
  source: 'manual' | 'auto' | 'none';
  score: number | null;
  evidence: number;
  complete: boolean;
}
export interface AccGroup {
  id: string;
  title: string;
  weight: number;
  metrics: number;
  scored: number;
  mean: number | null;
  complete: number;
}
export interface AccOverview {
  body: string;
  cycle: string;
  groups: AccGroup[];
  metrics: AccMetric[];
  completeness: { complete: number; total: number; percent: number };
  estimate: { estimate: number | null; floor: number; grade: string; floorGrade: string } | null;
}
export interface DvvRow {
  id: string;
  metricCode: string;
  query: string;
  response: string;
  status: string;
}

/** The current cycle and the four before it, for the cycle picker (for example 2026-27 back to 2022-23). */
export function cycleOptions(current: string): { value: string; label: string }[] {
  const start = Number(current.slice(0, 4));
  const out = Array.from({ length: 5 }, (_, i) => {
    const y = start - i;
    const v = `${y}-${String((y + 1) % 100).padStart(2, '0')}`;
    return { value: v, label: v };
  });
  return out.some((o) => o.value === current) ? out : [{ value: current, label: current }, ...out];
}
