// Shapes and helpers for Reports and analytics (services/api/src/analytics) and global search (services/api/src/search).
import { formatRupees } from './money';

export interface Column {
  key: string;
  label: string;
  kind?: 'text' | 'int' | 'percent' | 'money' | 'date';
}

export type Cell = string | number | null;

export interface ReportMeta {
  key: string;
  title: string;
  description: string;
  category: 'institution' | 'academic' | 'finance' | 'people' | 'classroom';
  params: { name: string; label: string; type: 'uuid' | 'date' | 'enum'; options?: string[] }[];
}

export interface ReportResult {
  key: string;
  title: string;
  columns: Column[];
  rows: Record<string, Cell>[];
  summary?: { label: string; value: Cell }[];
}

export interface Kpis {
  enrolment: { active: number; total: number; joinedInRange: number };
  attendance: { percent: number | null; marks: number };
  results: { session: string | null; students: number; passPercent: number | null; averageSgpa: number | null };
  fees: { billedPaise: number; collectedPaise: number; outstandingPaise: number; overduePaise: number; collectedInRangePaise: number };
  staff: { active: number; total: number; teachers: number };
  placement: { offers: number; students: number; joined: number };
  research: { outputs: number; grantsPaise: number };
}

export interface ClassroomAnalytics {
  sessions: { total: number; hours: number; teachers: number; boards: number };
  tools: { tool: string; label: string; uses: number }[];
  coverage: { id: string; label: string; parent: string; topics: number; covered: number; percent: number | null }[];
}

export interface Schedule {
  id: string;
  reportKey: string;
  frequency: 'daily' | 'weekly' | 'monthly';
  format: 'csv' | 'pdf';
  recipients: string[];
  nextRunAt: string;
  active: boolean;
}

export interface SearchHit {
  type: 'students' | 'staff' | 'courses' | 'topics' | 'documents' | 'reports';
  id: string;
  title: string;
  subtitle: string;
  url: string;
  score: number;
}

export interface FeatureFlag {
  key: string;
  description: string;
  default: boolean;
  enabled: boolean;
}

export interface MfaStatus {
  enrolled: boolean;
  backupCodesLeft: number;
  required: boolean;
}

export interface SessionRow {
  id: string;
  label: string;
  ip: string | null;
  mfaVerified: boolean;
  createdAt: string;
  lastSeenAt: string;
  current: boolean;
}

/** A cell as the screen shows it: rupees for money, a percent sign for percentages, a dash for nothing. */
export function showCell(col: Column, v: Cell | undefined): string {
  if (v === null || v === undefined || v === '') return '–';
  if (col.kind === 'money' && typeof v === 'number') return formatRupees(v);
  if (col.kind === 'percent' && typeof v === 'number') return `${v}%`;
  return String(v);
}

/** The path the export route proxies for a report download. */
export function exportPath(key: string, format: 'csv' | 'pdf', query: Record<string, string | undefined> = {}): string {
  const q = Object.entries(query).filter(([, v]) => v).map(([k, v]) => `&${k}=${encodeURIComponent(v!)}`).join('');
  return `/api/export?path=${encodeURIComponent(`/v1/analytics/reports/${key}/export?format=${format}${q}`)}`;
}

export const accreditationPath = (framework: 'naac' | 'nirf' | 'aishe') => `/api/export?path=${encodeURIComponent(`/v1/analytics/accreditation/${framework}?format=zip`)}`;

/** Splits "a@x.in, b@x.in\n c@x.in" into trimmed, lower-case, unique addresses. */
export function parseRecipients(input: string): string[] {
  return [...new Set(input.split(/[\s,;]+/).map((e) => e.trim().toLowerCase()).filter(Boolean))];
}

export const isDay = (s: string | undefined): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
