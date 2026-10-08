// What POST /v1/ai/insights/{finance,admissions,hr} sends back, and the endpoint for each domain.

export type InsightKind = 'finance' | 'admissions' | 'hr';

export const INSIGHT_PATH: Record<InsightKind, string> = {
  finance: '/v1/ai/insights/finance',
  admissions: '/v1/ai/insights/admissions',
  hr: '/v1/ai/insights/hr',
};

export interface InsightResult {
  headline: string;
  highlights: string[];
  risks: string[];
  suggestions: string[];
}

export interface InsightResponse {
  result: InsightResult;
  meta: { preview: boolean; cached: boolean };
}

export const isInsightKind = (k: string): k is InsightKind => k in INSIGHT_PATH;
