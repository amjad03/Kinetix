/** The five developmental domains and four age bands of the early years framework. */
export const EY_DOMAINS = ['physical', 'language', 'cognitive', 'social_emotional', 'creative'] as const;
export type EyDomain = (typeof EY_DOMAINS)[number];
export const EY_AGE_BANDS = ['2-3', '3-4', '4-5', '5-6'] as const;
export type EyAgeBand = (typeof EY_AGE_BANDS)[number];
export const EY_STATUSES = ['emerging', 'developing', 'achieved'] as const;
export type EyStatus = (typeof EY_STATUSES)[number];

export const EY_DOMAIN_LABEL: Record<EyDomain, string> = {
  physical: 'Physical development',
  language: 'Language and communication',
  cognitive: 'Cognitive development',
  social_emotional: 'Social and emotional development',
  creative: 'Creative expression',
};

/** The starting set loaded for a school; the school edits it afterwards. */
export const DEFAULT_MILESTONES: { domain: EyDomain; ageBand: EyAgeBand; title: string }[] = (
  [
    ['physical', '2-3', ['Walks and runs steadily', 'Scribbles with a crayon']],
    ['physical', '3-4', ['Climbs and jumps with balance', 'Holds a crayon with fingers']],
    ['physical', '4-5', ['Hops and kicks a ball', 'Cuts along a line with scissors']],
    ['physical', '5-6', ['Skips and balances on one foot', 'Writes letters with a proper grip']],
    ['language', '2-3', ['Speaks in two or three word phrases', 'Follows a simple instruction']],
    ['language', '3-4', ['Speaks in full short sentences', 'Retells a favourite story in a few words']],
    ['language', '4-5', ['Asks why and how questions', 'Recognises own name in print']],
    ['language', '5-6', ['Recognises letter sounds', 'Tells a story with a beginning and an end']],
    ['cognitive', '2-3', ['Sorts objects by colour or size', 'Matches simple shapes']],
    ['cognitive', '3-4', ['Counts up to ten objects', 'Names basic colours and shapes']],
    ['cognitive', '4-5', ['Understands more and less', 'Completes a simple pattern']],
    ['cognitive', '5-6', ['Counts and writes numbers to twenty', 'Solves simple problems with objects']],
    ['social_emotional', '2-3', ['Plays alongside other children', 'Shows affection to familiar adults']],
    ['social_emotional', '3-4', ['Takes turns with help', 'Says how they feel in simple words']],
    ['social_emotional', '4-5', ['Plays cooperatively in a group', 'Follows class routines independently']],
    ['social_emotional', '5-6', ['Resolves small disagreements with words', 'Shows care for others and for belongings']],
    ['creative', '2-3', ['Enjoys songs and actions', 'Explores paint and clay']],
    ['creative', '3-4', ['Joins in rhymes and movement', 'Makes marks and names them']],
    ['creative', '4-5', ['Draws a person with several parts', 'Pretends in role play']],
    ['creative', '5-6', ['Creates a picture or model with a plan', 'Performs a song or dance with confidence']],
  ] as [EyDomain, EyAgeBand, string[]][]
).flatMap(([domain, ageBand, titles]) => titles.map((title) => ({ domain, ageBand, title })));
