/** Pure research rules: DOI handling, proposal moves, grant balances and the NAAC criterion 3 inputs. */

/** `https://doi.org/10.1000/xyz` or `doi:10.1000/xyz` become `10.1000/xyz`; anything not shaped like a DOI is null. */
export function normalizeDoi(input: string): string | null {
  const v = input.trim().replace(/^(https?:\/\/(dx\.)?doi\.org\/|doi:\s*)/i, '');
  return /^10\.\d{4,9}\/\S+$/.test(v) ? v : null;
}

const PROPOSAL_MOVES: Record<string, string[]> = {
  draft: ['submitted', 'withdrawn'],
  submitted: ['under_review', 'approved', 'rejected', 'withdrawn'],
  under_review: ['approved', 'rejected', 'withdrawn'],
  approved: [],
  rejected: [],
  withdrawn: [],
};
export const canMoveProposal = (from: string, to: string) => (PROPOSAL_MOVES[from] ?? []).includes(to);

/** Whether an approval may go ahead: an ethics-bound proposal needs a cleared ethics decision first. */
export const ethicsBlocksApproval = (p: { ethicsRequired: boolean; ethicsStatus: string }) => p.ethicsRequired && p.ethicsStatus !== 'cleared';

export interface GrantBalance {
  sanctionedPaise: number;
  spentPaise: number;
  balancePaise: number;
  utilisationPercent: number;
}
export function grantBalance(sanctionedPaise: number, expenses: number[]): GrantBalance {
  const spentPaise = expenses.reduce((s, x) => s + x, 0);
  return { sanctionedPaise, spentPaise, balancePaise: sanctionedPaise - spentPaise, utilisationPercent: sanctionedPaise ? Math.round((spentPaise / sanctionedPaise) * 1000) / 10 : 0 };
}

const INDEXES = ['scopus', 'wos', 'ugc_care'];
export const INDEX_NAMES = INDEXES;

export interface KpiInput {
  facultyCount: number;
  publications: { kind: string; indexedIn: string[] }[];
  grants: { sanctionedPaise: number }[];
  patents: { status: string }[];
  scholarsAwarded: number;
  projects: number;
  conferencesPresented: number;
}

/** Inputs for NAAC criterion 3 (research, innovations and extension); ratios are per teacher and rounded to 2 places. */
export function researchKpis(i: KpiInput) {
  const per = (n: number) => (i.facultyCount ? Math.round((n / i.facultyCount) * 100) / 100 : 0);
  const indexed = i.publications.filter((p) => p.indexedIn.some((x) => INDEXES.includes(x))).length;
  const books = i.publications.filter((p) => p.kind === 'book' || p.kind === 'book_chapter').length;
  return {
    facultyCount: i.facultyCount,
    grants: { count: i.grants.length, totalSanctionedPaise: i.grants.reduce((s, g) => s + g.sanctionedPaise, 0) },
    publications: { total: i.publications.length, indexed, perTeacher: per(i.publications.length), booksAndChapters: books },
    patents: { total: i.patents.length, granted: i.patents.filter((p) => p.status === 'granted').length },
    scholarsAwarded: i.scholarsAwarded,
    projects: i.projects,
    conferencesPresented: i.conferencesPresented,
    naac: {
      '3.1.1': { label: 'Grants for research projects (count and amount)', value: i.grants.length },
      '3.3.1': { label: 'Research papers per teacher', value: per(i.publications.length) },
      '3.3.2': { label: 'Books and chapters', value: books },
      '3.4.1': { label: 'Patents published or granted', value: i.patents.filter((p) => ['published', 'granted'].includes(p.status)).length },
      '3.4.2': { label: 'PhD / MPhil awarded', value: i.scholarsAwarded },
    },
  };
}
