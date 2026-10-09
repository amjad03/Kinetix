// Scoring of accreditation criteria trees, ready-made framework templates, and the CQI loop state.

export interface CriterionNode {
  id: string;
  parentId: string | null;
  weight: number;
  target: number | null;
  actual: number | null;
}

/** A criterion with a target scores the share of the target reached, capped at 100; without a target or a figure it has no score. */
export function leafScore(target: number | null, actual: number | null): number | null {
  if (target === null || actual === null || target <= 0) return null;
  return Math.round(Math.min(100, Math.max(0, (actual / target) * 100)) * 10) / 10;
}

const weighted = (parts: { score: number | null; weight: number }[]): number | null => {
  const scored = parts.filter((p) => p.score !== null && p.weight > 0);
  const total = scored.reduce((a, p) => a + p.weight, 0);
  return total === 0 ? null : Math.round((scored.reduce((a, p) => a + (p.score as number) * p.weight, 0) / total) * 10) / 10;
};

/** Score of every node: a criterion with children is the weighted mean of its children's scores, otherwise its own leaf score. */
export function scoreTree(nodes: CriterionNode[]): Map<string, number | null> {
  const kids = new Map<string | null, CriterionNode[]>();
  for (const n of nodes) kids.set(n.parentId, [...(kids.get(n.parentId) ?? []), n]);
  const out = new Map<string, number | null>();
  const walk = (n: CriterionNode, depth: number): number | null => {
    const children = depth > 12 ? [] : (kids.get(n.id) ?? []);
    const s = children.length ? weighted(children.map((c) => ({ score: walk(c, depth + 1), weight: c.weight }))) : leafScore(n.target, n.actual);
    out.set(n.id, s);
    return s;
  };
  for (const root of kids.get(null) ?? []) walk(root, 0);
  return out;
}

export function frameworkScore(nodes: CriterionNode[]): number | null {
  const scores = scoreTree(nodes);
  return weighted(nodes.filter((n) => n.parentId === null).map((n) => ({ score: scores.get(n.id) ?? null, weight: n.weight })));
}

export interface TemplateCriterion {
  code: string;
  title: string;
  metric?: string;
  unit?: string;
  target?: number;
  weight?: number;
  harvestSource?: string;
  children?: TemplateCriterion[];
}

/** Ready-made trees an institution copies and then edits: the criteria are a starting point, not the full manual of the accrediting body. */
export const TEMPLATES: Record<string, { body: string; name: string; criteria: TemplateCriterion[] }> = {
  naac: {
    body: 'naac',
    name: 'NAAC assessment (starter)',
    criteria: [
      { code: '1', title: 'Curricular aspects', weight: 15, children: [{ code: '1.1', title: 'Curriculum designed and reviewed with stakeholders', metric: 'Programmes with a curriculum review in the year', unit: '%', target: 100 }] },
      {
        code: '2',
        title: 'Teaching-learning and evaluation',
        weight: 30,
        children: [
          { code: '2.1', title: 'Student enrolment', metric: 'Students on roll', unit: 'students', target: 500, harvestSource: 'students' },
          { code: '2.4', title: 'Teacher profile', metric: 'Full-time teachers', unit: 'staff', target: 40, harvestSource: 'staff' },
          { code: '2.6', title: 'Student performance', metric: 'Pass percentage in the latest published session', unit: '%', target: 90, harvestSource: 'exam_pass_rate' },
          { code: '2.7', title: 'Student satisfaction', metric: 'Average feedback rating', unit: 'of 5', target: 4, harvestSource: 'feedback_rating' },
        ],
      },
      { code: '3', title: 'Research, innovations and extension', weight: 15, children: [{ code: '3.3', title: 'Research publications', metric: 'Publications recorded', unit: 'papers', target: 20, harvestSource: 'publications' }] },
      { code: '4', title: 'Infrastructure and learning resources', weight: 10, children: [{ code: '4.3', title: 'Digital learning content', metric: 'Items on the learning platform', unit: 'items', target: 200, harvestSource: 'lms_items' }] },
      { code: '5', title: 'Student support and progression', weight: 15, children: [{ code: '5.2', title: 'Placement', metric: 'Students placed', unit: '%', target: 60, harvestSource: 'placement_rate' }, { code: '5.3', title: 'Grievance redressal', metric: 'Grievances resolved', unit: '%', target: 95, harvestSource: 'grievance_resolution' }] },
      { code: '6', title: 'Governance, leadership and management', weight: 10, children: [{ code: '6.2', title: 'Committees meet regularly', metric: 'Committee meetings held', unit: 'meetings', target: 12, harvestSource: 'committee_meetings' }] },
      { code: '7', title: 'Institutional values and best practices', weight: 5, children: [{ code: '7.1', title: 'Best practices documented', metric: 'Practices documented', unit: 'practices', target: 2 }] },
    ],
  },
  nba: {
    body: 'nba',
    name: 'NBA programme accreditation (starter)',
    criteria: [
      { code: '1', title: 'Vision, mission and programme educational objectives', weight: 5 },
      { code: '2', title: 'Programme curriculum and teaching-learning processes', weight: 20, children: [{ code: '2.1', title: 'Course files complete', metric: 'Course files reviewed', unit: 'files', target: 30, harvestSource: 'course_files' }] },
      { code: '3', title: 'Course outcomes and programme outcomes', weight: 25, children: [{ code: '3.1', title: 'Student pass percentage', metric: 'Pass percentage', unit: '%', target: 85, harvestSource: 'exam_pass_rate' }] },
      { code: '4', title: 'Students performance', weight: 20, children: [{ code: '4.1', title: 'Placement', metric: 'Students placed', unit: '%', target: 60, harvestSource: 'placement_rate' }] },
      { code: '5', title: 'Faculty contributions', weight: 20, children: [{ code: '5.1', title: 'Faculty strength', metric: 'Full-time teachers', unit: 'staff', target: 40, harvestSource: 'staff' }] },
      { code: '6', title: 'Continuous improvement', weight: 10 },
    ],
  },
  nirf: {
    body: 'nirf',
    name: 'NIRF parameters (starter)',
    criteria: [
      { code: 'TLR', title: 'Teaching, learning and resources', weight: 30, children: [{ code: 'TLR.1', title: 'Student strength', metric: 'Students on roll', unit: 'students', target: 500, harvestSource: 'students' }, { code: 'TLR.2', title: 'Faculty strength', metric: 'Full-time teachers', unit: 'staff', target: 40, harvestSource: 'staff' }] },
      { code: 'RP', title: 'Research and professional practice', weight: 30, children: [{ code: 'RP.1', title: 'Publications', metric: 'Publications recorded', unit: 'papers', target: 20, harvestSource: 'publications' }] },
      { code: 'GO', title: 'Graduation outcomes', weight: 20, children: [{ code: 'GO.1', title: 'Placement', metric: 'Students placed', unit: '%', target: 60, harvestSource: 'placement_rate' }, { code: 'GO.2', title: 'Pass percentage', metric: 'Pass percentage', unit: '%', target: 90, harvestSource: 'exam_pass_rate' }] },
      { code: 'OI', title: 'Outreach and inclusivity', weight: 10 },
      { code: 'PR', title: 'Perception', weight: 10, children: [{ code: 'PR.1', title: 'Feedback rating', metric: 'Average feedback rating', unit: 'of 5', target: 4, harvestSource: 'feedback_rating' }] },
    ],
  },
};

export const HARVEST_SOURCES = ['students', 'staff', 'exam_pass_rate', 'placement_rate', 'feedback_rating', 'publications', 'lms_items', 'course_files', 'grievance_resolution', 'committee_meetings'] as const;
export type HarvestSource = (typeof HARVEST_SOURCES)[number];

/** Where a CQI action stands: planned, being worked, waiting to be re-measured, or closed with the effect known. */
export function cqiState(a: { status: string; remeasuredValue: number | null; targetValue: number | null; remeasureOn: string | null }, today: string): 'planned' | 'in_progress' | 'awaiting_remeasure' | 'effective' | 'not_effective' {
  if (a.remeasuredValue !== null) return a.targetValue !== null && a.remeasuredValue < a.targetValue ? 'not_effective' : 'effective';
  if (a.status === 'done' || (a.remeasureOn && a.remeasureOn <= today)) return 'awaiting_remeasure';
  return a.status === 'open' ? 'planned' : 'in_progress';
}
