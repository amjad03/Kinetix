/**
 * Minimum qualifications for direct recruitment and promotion of college teachers under the UGC Regulations 2018
 * (Minimum Qualifications for Appointment of Teachers…, clause 4), which AICTE follows for technical institutions in
 * substance. The check reads the staff record (degrees with percentage, Ph.D., NET/SET, experience, publications) and
 * says what is missing; it does not replace the selection committee.
 */
export interface EligibilityInput {
  cadre: string | null;
  /** Best master's degree percentage on record (null when not recorded). */
  mastersPercent: number | null;
  hasMasters: boolean;
  phd: boolean;
  netSet: boolean;
  /** Teaching or research experience in years (here and before). */
  experienceYears: number;
  publications: number;
  /** Reserved categories and persons with disabilities get a 5% relaxation of the master's marks. */
  relaxed: boolean;
}

export interface EligibilityResult {
  cadre: string;
  eligible: boolean;
  missing: string[];
}

/** UGC 2018 clause 4.1 (college): what each cadre needs. */
export const CADRE_RULES: Record<string, { label: string; phd: boolean; netOrPhd: boolean; minYears: number; minPublications: number }> = {
  assistant_professor: { label: 'Assistant Professor', phd: false, netOrPhd: true, minYears: 0, minPublications: 0 },
  associate_professor: { label: 'Associate Professor', phd: true, netOrPhd: true, minYears: 8, minPublications: 7 },
  professor: { label: 'Professor', phd: true, netOrPhd: true, minYears: 10, minPublications: 10 },
  principal: { label: 'Principal', phd: true, netOrPhd: true, minYears: 15, minPublications: 10 },
};

export function cadreEligibility(i: EligibilityInput): EligibilityResult | null {
  const rule = i.cadre ? CADRE_RULES[i.cadre] : undefined;
  if (!rule || !i.cadre) return null;
  const missing: string[] = [];
  const min = i.relaxed ? 50 : 55;
  if (!i.hasMasters) missing.push("Master's degree");
  else if (i.mastersPercent !== null && i.mastersPercent < min) missing.push(`${min}% in the master's degree (has ${i.mastersPercent}%)`);
  if (rule.phd && !i.phd) missing.push('Ph.D.');
  else if (rule.netOrPhd && !i.phd && !i.netSet) missing.push('NET/SET/SLET or a Ph.D.');
  if (i.experienceYears < rule.minYears) missing.push(`${rule.minYears} years of teaching or research (has ${Math.floor(i.experienceYears * 10) / 10})`);
  if (i.publications < rule.minPublications) missing.push(`${rule.minPublications} publications in peer-reviewed or UGC-listed journals (has ${i.publications})`);
  return { cadre: rule.label, eligible: missing.length === 0, missing };
}
