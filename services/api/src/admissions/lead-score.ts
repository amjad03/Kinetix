/**
 * Rule-based lead score, 0 to 100. Every point comes from a visible rule so a counsellor can see why
 * a lead is ranked where it is: how the family found us, whether they named a programme, how much
 * follow-up has happened and how far the enquiry has moved.
 */
export const SOURCE_POINTS: Record<string, number> = { referral: 25, walk_in: 20, campaign: 10, phone: 10, web: 5, import: 0 };
export const STAGE_POINTS: Record<string, number> = { new: 0, contacted: 5, counselling: 15, applied: 30, converted: 40, deferred: 0, lost: -20 };
const FOLLOW_UP_EACH = 5;
const FOLLOW_UP_CAP = 25;

export interface LeadInput {
  source: string;
  stage: string;
  hasProgram: boolean;
  hasEmail: boolean;
  /** Calls, visits, messages and notes logged by the counsellor. */
  activities: number;
}

export interface LeadBreakdown {
  source: number;
  programme: number;
  followUps: number;
  engagement: number;
  total: number;
}

export function leadScore(i: LeadInput): LeadBreakdown {
  const source = SOURCE_POINTS[i.source] ?? 0;
  const programme = i.hasProgram ? 10 : 0;
  const followUps = Math.min(FOLLOW_UP_CAP, Math.max(0, i.activities) * FOLLOW_UP_EACH);
  const engagement = (STAGE_POINTS[i.stage] ?? 0) + (i.hasEmail ? 5 : 0);
  const total = Math.max(0, Math.min(100, source + programme + followUps + engagement));
  return { source, programme, followUps, engagement, total };
}
