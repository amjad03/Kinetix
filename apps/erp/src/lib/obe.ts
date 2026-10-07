// Outcome-based education: shapes returned by services/api (obe module) and the matrix/attainment helpers the pages share.

export type OutcomeKind = 'mission' | 'vision' | 'peo' | 'po' | 'pso';

export interface ProgramOutcome {
  id: string;
  kind: OutcomeKind;
  code: string;
  statement: string;
  ord: number;
}
export interface AttainmentConfig {
  studentThresholdPercent: number;
  levels: { level: number; minStudentsPercent: number }[];
  evidenceWeights: Record<string, number>;
  directWeight: number;
  indirectWeight: number;
  maxLevel: number;
  targetLevel: number;
  decimals: number;
}
export interface CourseOutcome {
  id: string;
  code: string;
  statement: string;
  bloomLevel: string | null;
}
export interface CoSet {
  id: string;
  version: number;
  status: 'draft' | 'active' | 'retired';
  note: string | null;
  outcomes: CourseOutcome[];
}
export interface MatrixData {
  set: { id: string; subjectId: string; status: CoSet['status']; version: number };
  cos: CourseOutcome[];
  outcomes: ProgramOutcome[];
  cells: { coId: string; outcomeId: string; strength: number }[];
}
export interface AttainmentRow {
  scope: 'co' | 'po';
  targetId: string;
  code: string;
  direct: number | null;
  indirect: number | null;
  combined: number | null;
  target: number;
  gap: number | null;
  met: boolean;
  trend: 'up' | 'down' | 'flat' | 'new';
  detail: { coverage?: number; kind?: string };
}
export interface Attainment {
  computedAt: string | null;
  config: AttainmentConfig;
  cos: AttainmentRow[];
  pos: AttainmentRow[];
  summary: { cosMet: number; cos: number; posMet: number; pos: number; gaps: { scope: 'co' | 'po'; targetId: string; code: string; gap: number }[] };
}
export interface ImprovementAction {
  id: string;
  scope: 'co' | 'po';
  targetId: string;
  title: string;
  detail: string | null;
  status: 'open' | 'in_progress' | 'done';
  dueOn: string | null;
  owner: string | null;
}

/** Clicking a matrix cell cycles 0 (none) → 1 (low) → 2 (medium) → 3 (high) → 0. */
export const nextStrength = (n: number): number => (n >= 3 || n < 0 ? 0 : n + 1);

const key = (coId: string, outcomeId: string) => `${coId}:${outcomeId}`;

/** The matrix as a lookup, with every unmapped cell 0. */
export function strengthMap(cells: { coId: string; outcomeId: string; strength: number }[]): (coId: string, outcomeId: string) => number {
  const m = new Map(cells.map((c) => [key(c.coId, c.outcomeId), c.strength]));
  return (coId, outcomeId) => m.get(key(coId, outcomeId)) ?? 0;
}

/** Sets one cell and returns the new list; strength 0 removes the mapping. */
export function setCell(cells: { coId: string; outcomeId: string; strength: number }[], coId: string, outcomeId: string, strength: number) {
  const rest = cells.filter((c) => !(c.coId === coId && c.outcomeId === outcomeId));
  return strength > 0 ? [...rest, { coId, outcomeId, strength }] : rest;
}

/** COs with no mapping at all (an accreditor's first question about the matrix). */
export const unmappedCos = <T extends { id: string }>(cos: T[], cells: { coId: string; strength: number }[]) => cos.filter((c) => !cells.some((x) => x.coId === c.id && x.strength > 0));

/** POs/PSOs that no CO maps to, so they can never be measured. */
export const uncoveredOutcomes = <T extends { id: string }>(outcomes: T[], cells: { outcomeId: string; strength: number }[]) => outcomes.filter((o) => !cells.some((x) => x.outcomeId === o.id && x.strength > 0));

/** Colour of an attainment figure against its target. */
export function levelTone(row: { combined: number | null; target: number }): 'none' | 'met' | 'near' | 'short' {
  if (row.combined === null) return 'none';
  if (row.combined >= row.target) return 'met';
  return row.combined >= row.target * 0.75 ? 'near' : 'short';
}

export const fmtLevel = (n: number | null): string => (n === null ? '—' : n.toFixed(2));
