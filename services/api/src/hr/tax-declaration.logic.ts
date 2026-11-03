/**
 * Investment declarations (Form 12BB) to the figures TDS uses, under the old regime: section caps, the HRA exemption
 * (section 10(13A), rule 2A) and the 80C total (capped with employee PF in payroll-math.ts). The new regime allows only
 * the standard deduction, so a new-regime declaration gives zero deductions. Integer paise throughout.
 */
const R = (rupees: number) => rupees * 100;

export const DECLARATION_SECTIONS = ['80C', '80CCD1B', '80D', '80D_PARENTS', '80D_SENIOR_PARENTS', '80E', '80G', '80TTA', '24B'] as const;
export type DeclarationSection = (typeof DECLARATION_SECTIONS)[number];

/** Each section's yearly ceiling (null: no ceiling). 80C is capped together with employee PF by payroll-math.ts. */
export const SECTION_CAPS: Record<DeclarationSection, number | null> = {
  '80C': R(1_50_000),
  '80CCD1B': R(50_000),
  '80D': R(25_000),
  '80D_PARENTS': R(25_000),
  '80D_SENIOR_PARENTS': R(50_000),
  '80E': null,
  '80G': null,
  '80TTA': R(10_000),
  '24B': R(2_00_000),
};

export const SECTION_LABELS: Record<DeclarationSection, string> = {
  '80C': 'Section 80C (LIC, PPF, ELSS, tuition fees, housing loan principal, NSC…)',
  '80CCD1B': 'Section 80CCD(1B): own NPS contribution',
  '80D': 'Section 80D: health insurance (self, spouse, children)',
  '80D_PARENTS': 'Section 80D: health insurance for parents',
  '80D_SENIOR_PARENTS': 'Section 80D: health insurance for senior citizen parents',
  '80E': 'Section 80E: interest on an education loan',
  '80G': 'Section 80G: donations (eligible amount)',
  '80TTA': 'Section 80TTA: savings bank interest',
  '24B': 'Section 24(b): interest on a housing loan (self-occupied)',
};

/** Rent above this a year needs the landlord's PAN (CBDT circular on rule 26C). */
export const LANDLORD_PAN_ABOVE_PAISE = R(1_00_000);

export interface HraInput {
  /** HRA received in the year. */
  hraPaise: number;
  /** Basic pay plus DA in the year ("salary" for rule 2A). */
  salaryPaise: number;
  /** Rent actually paid in the year. */
  rentPaise: number;
  metro: boolean;
}

/** The least of: HRA received; rent paid less 10% of salary; 50% (metro) or 40% of salary. Never below zero. */
export function hraExemption(i: HraInput): number {
  if (i.rentPaise <= 0 || i.hraPaise <= 0) return 0;
  const excessRent = i.rentPaise - Math.round(i.salaryPaise / 10);
  const share = Math.round((i.salaryPaise * (i.metro ? 50 : 40)) / 100);
  return Math.max(0, Math.min(i.hraPaise, excessRent, share));
}

export interface DeclarationFigures {
  /** 80C before the combined ₹1.5 lakh cap with employee PF (payroll-math caps both together). */
  section80cPaise: number;
  /** Every other deduction after its own cap, plus the HRA exemption. */
  otherDeductionsPaise: number;
  hraExemptPaise: number;
  /** Each section after its cap, for the payslip's tax sheet and Form 16. */
  bySection: Partial<Record<DeclarationSection, number>>;
}

/** The yearly figures TDS uses from declared (or, after verification, accepted) amounts. */
export function declarationFigures(regime: 'old' | 'new', items: { section: string; amountPaise: number }[], hra: HraInput | null): DeclarationFigures {
  if (regime === 'new') return { section80cPaise: 0, otherDeductionsPaise: 0, hraExemptPaise: 0, bySection: {} };
  const total = new Map<DeclarationSection, number>();
  for (const it of items) {
    if (!(DECLARATION_SECTIONS as readonly string[]).includes(it.section) || it.amountPaise <= 0) continue;
    const s = it.section as DeclarationSection;
    total.set(s, (total.get(s) ?? 0) + it.amountPaise);
  }
  const bySection: Partial<Record<DeclarationSection, number>> = {};
  for (const [s, v] of total) {
    const cap = SECTION_CAPS[s];
    bySection[s] = s === '80C' ? v : cap === null ? v : Math.min(v, cap);
  }
  const hraExemptPaise = hra ? hraExemption(hra) : 0;
  const other = Object.entries(bySection).filter(([s]) => s !== '80C').reduce((n, [, v]) => n + (v ?? 0), 0);
  return { section80cPaise: bySection['80C'] ?? 0, otherDeductionsPaise: other + hraExemptPaise, hraExemptPaise, bySection };
}
