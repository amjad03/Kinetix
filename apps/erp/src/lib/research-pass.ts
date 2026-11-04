/** Pure helpers of the research pass's ERP forms (actions.ts): what the API is sent. */

/** The claim form's choice "publication:<id>" or "patent:<id>" as the body field the API takes. */
export function claimSubject(value: string): { publicationId: string } | { patentId: string } | null {
  const m = /^(publication|patent):([0-9a-f-]{36})$/i.exec(value.trim());
  if (!m) return null;
  return m[1] === 'patent' ? { patentId: m[2] } : { publicationId: m[2] };
}

/**
 * The typed-in details sent with a DOI for when the registry cannot be reached: only when the title, venue and a
 * four-digit year are all given (otherwise the API answers REGISTRY_OFFLINE and asks for them).
 */
export function doiFallback(v: Record<string, string | undefined>): { title: string; venue: string; year: number; kind: string } | undefined {
  const title = v.title?.trim() ?? '';
  const venue = v.venue?.trim() ?? '';
  const year = Number(v.year);
  if (title.length < 3 || !venue || !Number.isInteger(year) || year < 1950 || year > 2100) return undefined;
  return { title, venue, year, kind: v.kind || 'journal' };
}

/** The registers of each research view, in tab order (the page shows these lists). */
export const RESEARCH_LISTS = {
  outputs: ['research-publications', 'research-profiles', 'research-patents', 'research-conferences', 'research-recognitions', 'research-incentive-claims'],
  funding: ['research-calls', 'research-proposals', 'research-projects', 'research-grants', 'grant-heads', 'grant-releases', 'grant-ucs', 'research-seed-grants', 'research-incentive-schemes'],
  collab: ['research-consultancies', 'research-mous', 'research-mou-activities'],
  scholars: ['research-scholars', 'scholar-progress-reports', 'scholar-dc-meetings', 'scholar-coursework', 'research-centres'],
  facilities: ['research-equipment', 'research-equipment-usage', 'research-ethics'],
} as const;
