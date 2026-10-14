/**
 * Bloom's revised taxonomy for course outcome statements: the action verbs of each level and a check that a CO starts
 * with a measurable verb of the level it claims. NBA and NAAC reviewers look for this; "understand", "know" and
 * "learn" are not measurable and are flagged.
 */
export const BLOOM_LEVELS = ['Remember', 'Understand', 'Apply', 'Analyse', 'Evaluate', 'Create'] as const;

const VERBS: Record<number, string[]> = {
  1: ['define', 'list', 'name', 'recall', 'recognise', 'recognize', 'state', 'identify', 'label', 'match', 'memorise', 'memorize', 'reproduce', 'record', 'tabulate', 'select', 'locate', 'quote', 'outline'],
  2: ['explain', 'describe', 'summarise', 'summarize', 'classify', 'interpret', 'discuss', 'illustrate', 'paraphrase', 'exemplify', 'infer', 'estimate', 'extend', 'translate', 'restate', 'report', 'review', 'express', 'indicate', 'relate', 'represent', 'outline'],
  3: ['apply', 'demonstrate', 'solve', 'use', 'compute', 'calculate', 'implement', 'execute', 'prepare', 'operate', 'show', 'sketch', 'practise', 'practice', 'perform', 'determine', 'employ', 'modify', 'predict', 'schedule', 'conduct', 'carry', 'draw', 'manipulate', 'experiment', 'estimate', 'model'],
  4: ['analyse', 'analyze', 'differentiate', 'distinguish', 'examine', 'compare', 'contrast', 'organise', 'organize', 'attribute', 'categorise', 'categorize', 'investigate', 'deduce', 'inspect', 'test', 'diagnose', 'discriminate', 'dissect', 'infer', 'outline', 'prioritise', 'prioritize', 'relate', 'separate', 'simplify', 'debug', 'interpret'],
  5: ['evaluate', 'assess', 'judge', 'justify', 'critique', 'criticise', 'criticize', 'appraise', 'argue', 'defend', 'recommend', 'select', 'prioritise', 'prioritize', 'validate', 'measure', 'rate', 'rank', 'conclude', 'verify', 'support', 'interpret', 'decide', 'estimate'],
  6: ['create', 'design', 'develop', 'formulate', 'construct', 'compose', 'plan', 'propose', 'devise', 'produce', 'invent', 'build', 'generate', 'model', 'synthesise', 'synthesize', 'integrate', 'combine', 'compile', 'originate', 'author', 'hypothesise', 'hypothesize', 'improve', 'adapt'],
};
const NOT_MEASURABLE = ['understand', 'know', 'learn', 'appreciate', 'be', 'become', 'familiarise', 'familiarize', 'realise', 'realize', 'grasp', 'believe', 'study', 'cover'];

/** The level number (1-6) of a stored Bloom level: "L3", "3", "Apply", "K3", "BL3"; null when not recognised. */
export function bloomNumber(level: string | null | undefined): number | null {
  if (!level) return null;
  const m = /([1-6])/.exec(level);
  if (m) return Number(m[1]);
  const i = BLOOM_LEVELS.findIndex((l) => level.trim().toLowerCase().startsWith(l.slice(0, 5).toLowerCase()));
  return i >= 0 ? i + 1 : null;
}

export interface VerbCheck {
  verb: string | null;
  /** Levels whose verb lists contain the verb. */
  levels: number[];
  ok: boolean;
  /** What is wrong, for the ERP's own words: no verb, a verb that cannot be measured, not a Bloom verb, or a verb of another level. */
  issue: 'none' | 'vague' | 'unknown' | 'level' | null;
  /** The level claimed (1-6), when one is recorded. */
  claimed: number | null;
  /** Why the statement is flagged, in plain English; null when it is fine. */
  message: string | null;
}

/** The first word of the statement after "CO1:", "Students will be able to" and similar openings. */
export function leadingVerb(statement: string): string | null {
  const s = statement
    .trim()
    .replace(/^co\s*\d+\s*[:.)-]\s*/i, '')
    .replace(/^(on (successful )?completion of (this|the) course,?\s*)?((the )?(students?|learners?) (will|should|shall) be able to|be able to|able to)\s*/i, '')
    .trim();
  const w = /^[A-Za-z]+/.exec(s)?.[0]?.toLowerCase();
  return w ?? null;
}

const base = (w: string) => [w, w.replace(/ies$/, 'y'), w.replace(/es$/, ''), w.replace(/s$/, '')];

/** Checks the action verb of a CO against its claimed Bloom level. */
export function checkCo(statement: string, bloomLevel?: string | null): VerbCheck {
  const verb = leadingVerb(statement);
  const claimed = bloomNumber(bloomLevel);
  if (!verb) return { verb: null, levels: [], ok: false, issue: 'none', claimed, message: 'Start the outcome with an action verb' };
  const forms = base(verb);
  if (forms.some((f) => NOT_MEASURABLE.includes(f))) return { verb, levels: [], ok: false, issue: 'vague', claimed, message: `"${verb}" cannot be measured; use an action verb such as explain, apply or analyse` };
  const levels = Object.entries(VERBS)
    .filter(([, list]) => forms.some((f) => list.includes(f)))
    .map(([l]) => Number(l));
  if (!levels.length) return { verb, levels, ok: false, issue: 'unknown', claimed, message: `"${verb}" is not an action verb of Bloom's taxonomy` };
  if (claimed === null) return { verb, levels, ok: true, issue: null, claimed, message: null };
  if (!levels.includes(claimed)) return { verb, levels, ok: false, issue: 'level', claimed, message: `"${verb}" is a ${levels.map((l) => BLOOM_LEVELS[l - 1]).join(' or ')} verb, not ${BLOOM_LEVELS[claimed - 1]}` };
  return { verb, levels, ok: true, issue: null, claimed, message: null };
}
