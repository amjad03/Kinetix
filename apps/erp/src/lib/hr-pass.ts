/** Shapes of the HR and payroll pass screens (API: hr/tax-declarations, reimbursements, pay-matrix, settlement). */

export const DECLARATION_SECTIONS = ['80C', '80CCD1B', '80D', '80D_PARENTS', '80D_SENIOR_PARENTS', '80E', '80G', '80TTA', '24B'] as const;
export type DeclarationSection = (typeof DECLARATION_SECTIONS)[number];
export const CLAIM_CATEGORIES = ['travel', 'conference', 'books', 'telephone', 'medical', 'fuel', 'other'] as const;

export interface DeclarationFigures {
  section80cPaise: number;
  otherDeductionsPaise: number;
  hraExemptPaise: number;
}

export interface DeclarationItem {
  id: string;
  section: DeclarationSection;
  sectionLabel: string;
  label: string;
  declaredPaise: number;
  proofStatus: 'none' | 'submitted' | 'accepted' | 'rejected';
  proofName: string | null;
  acceptedPaise: number | null;
  proofNote: string;
}

export type DeclarationStatus = 'draft' | 'submitted' | 'approved' | 'proofs_submitted' | 'verified' | 'rejected';

export interface Declaration {
  id: string;
  userId: string;
  fullName: string;
  employeeCode: string | null;
  fy: number;
  fyLabel: string;
  regime: 'old' | 'new';
  status: DeclarationStatus;
  rentMonthlyPaise: number;
  rentMonths: number;
  metro: boolean;
  landlordName: string;
  landlordPan: string | null;
  items: DeclarationItem[];
  declared: DeclarationFigures;
  accepted: DeclarationFigures | null;
  estimate: { oldPaise: number; newPaise: number; grossPaise: number };
  decisionNote: string;
  submittedAt: string | null;
  verifiedAt: string | null;
  version: number;
}

export interface DeclarationInput {
  fy: number;
  regime: 'old' | 'new';
  rentMonthlyPaise: number;
  rentMonths: number;
  metro: boolean;
  landlordName: string;
  landlordPan: string | null;
  items: { section: DeclarationSection; label: string; declaredPaise: number }[];
  expectedVersion?: number;
}

export interface Claim {
  id: string;
  claimNo: string;
  category: string;
  taxFree: boolean;
  spentOn: string;
  amountPaise: number;
  approvedPaise: number | null;
  description: string;
  hasBill: boolean;
  status: 'submitted' | 'approved' | 'paid' | 'rejected' | 'cancelled';
  payMonth: string | null;
  decisionNote: string;
}

export interface MatrixLevel {
  id: string;
  scheme: string;
  level: string;
  name: string;
  cadre: string | null;
  cells: number[];
}

export interface MatrixStaff {
  userId: string;
  fullName: string;
  employeeCode: string;
  levelId: string;
  level: string;
  levelName: string;
  cell: number | null;
  basicPaise: number | null;
  nextBasicPaise: number | null;
  cellCount: number;
  hraClass: string;
  lastMove: string | null;
}

export interface IncrementPreview {
  on: string;
  applied: boolean;
  due: number;
  staff: { userId: string; fullName: string; level: string; fromCell: number | null; toCell: number | null; fromBasicPaise: number | null; toBasicPaise: number | null; due: boolean; reason: string }[];
}

export interface BankFileSettings {
  format: 'generic' | 'sbi' | 'canara' | 'hdfc';
  debitAccountLast4: string | null;
  corporateId: string;
}

export interface SettlementLine {
  code: string;
  label: string;
  kind: 'earning' | 'recovery';
  amountPaise: number;
  basis: string;
}

export interface Settlement {
  lines: SettlementLine[];
  netPaise: number;
  inputs: { unpaidDays: number; encashableDays: number; noticeShortfallDays: number; joinedOn: string | null; monthlyBasicDaPaise: number; monthlyGrossPaise: number };
}

/** Rupees typed in a field as paise (null when not a number). */
export const toPaise = (v: string): number | null => {
  const n = Number(v.replace(/,/g, '').trim());
  return v.trim() !== '' && Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
};

/** The figures a declaration totals to, before they reach the API (for the live summary on the form). */
export function declaredTotal(items: { declaredPaise: number }[]): number {
  return items.reduce((n, i) => n + i.declaredPaise, 0);
}
