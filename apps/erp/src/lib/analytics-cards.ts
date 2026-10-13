// Shapes of /v1/admin/analytics/{admissions,health,attendance-week}.
export interface AdmissionsByMonth {
  months: { month: string; received: number; confirmed: number }[];
  received: number;
  confirmed: number;
}
export interface HealthRows {
  kind: 'department' | 'class';
  rows: { id: string; name: string; attendance: number | null; results: number | null; score: number | null }[];
}
export interface AttendanceWeek {
  days: { date: string; rate: number | null }[];
  average: number | null;
  today: { date: string; present: number; total: number; rate: number | null };
  below75: number;
}
