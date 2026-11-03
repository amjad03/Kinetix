/**
 * The 7th CPC pay matrix as UGC (Regulations 2018, revision of pay 2017) and AICTE adopted it for teachers: each level
 * starts at an entry pay and every next cell is 3% higher, rounded to the nearest ₹100. An annual increment moves one
 * cell up; a promotion fixes pay in the new level at the first cell at or above the current pay plus one notional
 * increment. Integer paise throughout.
 */
const R = (rupees: number) => rupees * 100;

/** Rounds paise to the nearest ₹100 (the matrix rule). */
export const round100 = (paise: number) => Math.round(paise / 10_000) * 10_000;

/** A level's cells from its entry pay: each cell 3% above the last, to the nearest ₹100. */
export function matrixCells(entryPaise: number, count: number): number[] {
  const cells = [entryPaise];
  while (cells.length < count) cells.push(round100(cells[cells.length - 1] * 1.03));
  return cells;
}

export interface LevelDef {
  level: string;
  name: string;
  cadre: string | null;
  entryPaise: number;
  cells: number;
}

/** UGC 7th CPC academic levels for college and university teachers (entry pay and number of cells). */
export const UGC_7CPC_LEVELS: LevelDef[] = [
  { level: '10', name: 'Assistant Professor (Academic Level 10)', cadre: 'assistant_professor', entryPaise: R(57_700), cells: 40 },
  { level: '11', name: 'Assistant Professor, senior scale (Academic Level 11)', cadre: 'assistant_professor', entryPaise: R(68_900), cells: 34 },
  { level: '12', name: 'Assistant Professor, selection grade (Academic Level 12)', cadre: 'assistant_professor', entryPaise: R(79_800), cells: 32 },
  { level: '13A', name: 'Associate Professor (Academic Level 13A)', cadre: 'associate_professor', entryPaise: R(1_31_400), cells: 18 },
  { level: '14', name: 'Professor (Academic Level 14)', cadre: 'professor', entryPaise: R(1_44_200), cells: 15 },
  { level: '15', name: 'Senior Professor (Academic Level 15)', cadre: 'professor', entryPaise: R(1_82_200), cells: 11 },
];

/** HRA as a share of basic by city class once DA reaches 50% (7th CPC: 30/20/10; 27/18/9 below that). */
export function hraPercent(cityClass: string, daPercent: number): number {
  const high = daPercent >= 50;
  return cityClass === 'X' ? (high ? 30 : 27) : cityClass === 'Z' ? (high ? 10 : 9) : high ? 20 : 18;
}

/** The cell (1-based) on a level whose pay is the first at or above `paise`; the last cell when none is. */
export function cellAtOrAbove(cells: number[], paise: number): number {
  const k = cells.findIndex((c) => c >= paise);
  return k === -1 ? cells.length : k + 1;
}

/** Pay on promotion: one notional increment on the current pay, then the first cell of the new level at or above it. */
export function fixOnPromotion(currentPaise: number, newLevelCells: number[]): { cell: number; basicPaise: number } {
  const cell = cellAtOrAbove(newLevelCells, round100(currentPaise * 1.03));
  return { cell, basicPaise: newLevelCells[cell - 1] };
}

/**
 * Whether a staff member gets the annual increment on `on` (1 July, or 1 January where the institution chose it):
 * at least six months of qualifying service since joining or the last move on the matrix, and a cell above theirs.
 */
export function incrementDue(p: { on: string; since: string | null; cell: number; cellCount: number }): { due: boolean; reason: string } {
  if (p.cell >= p.cellCount) return { due: false, reason: 'At the top of the level (stagnation)' };
  if (!p.since) return { due: false, reason: 'No joining date' };
  const [y, m, d] = p.on.split('-').map(Number);
  const sixBefore = new Date(Date.UTC(y, m - 7, d)).toISOString().slice(0, 10);
  if (p.since > sixBefore) return { due: false, reason: 'Less than six months of service on this pay' };
  return { due: true, reason: '' };
}
