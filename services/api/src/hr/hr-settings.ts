import { eq, sql } from 'drizzle-orm';
import type { Tx } from '../db/db.service.js';
import { hrSettings, type Series } from '../db/schema-hrpay.js';

export type HrModuleSettings = Omit<typeof hrSettings.$inferSelect, 'tenantId' | 'updatedAt'>;

export const DEFAULT_HR_SETTINGS: HrModuleSettings = {
  employeeSeries: { prefix: 'EMP/', next: 1, digits: 4, suffix: '' },
  payslipSeries: { prefix: 'PS/{FY}/', next: 1, digits: 5, suffix: '' },
  leaveLevels: 1,
  encashment: { maxDaysPerYear: 15, minBalanceAfter: 0 },
  attendance: { officeStart: '09:00', graceMinutes: 10, halfDayAfterMinutes: 120, minHoursFullDay: 6, officeEnd: '17:00', lateMarksPerHalfDay: 3 },
  loans: { maxInstallments: 24, maxAdvancePaise: 5_000_000, maxLoanPaise: 50_000_000 },
};

/** `{FY}` is the Indian financial year (April to March), `{YYYY}`/`{YY}` the calendar year. */
export function formatSeries(s: Series, on: Date = new Date(), n = s.next): string {
  const y = on.getUTCFullYear();
  const fy = on.getUTCMonth() >= 3 ? y : y - 1;
  const expand = (x: string) => x.replaceAll('{FY}', `${fy}-${String(fy + 1).slice(2)}`).replaceAll('{YYYY}', String(y)).replaceAll('{YY}', String(y).slice(2));
  return `${expand(s.prefix)}${String(n).padStart(Math.min(Math.max(s.digits, 1), 10), '0')}${expand(s.suffix)}`;
}

export async function hrModuleSettings(tx: Tx, tenantId: string): Promise<HrModuleSettings> {
  await tx.insert(hrSettings).values({ tenantId, ...DEFAULT_HR_SETTINGS }).onConflictDoNothing();
  const [row] = await tx.select().from(hrSettings).where(eq(hrSettings.tenantId, tenantId));
  const { tenantId: _t, updatedAt: _u, ...rest } = row;
  return { ...rest, attendance: { ...DEFAULT_HR_SETTINGS.attendance, ...rest.attendance } };
}

/** Takes `count` numbers from a series and returns the first; the row lock keeps numbers unique. */
export async function takeNumbers(tx: Tx, tenantId: string, which: 'employeeSeries' | 'payslipSeries', count: number): Promise<{ series: Series; first: number }> {
  await hrModuleSettings(tx, tenantId);
  const col = which === 'employeeSeries' ? sql`employee_series` : sql`payslip_series`;
  const res = await tx.execute<{ s: Series }>(sql`select ${col} as s from hr_settings where tenant_id = ${tenantId}::uuid for update`);
  const series = res.rows[0].s;
  await tx.update(hrSettings).set({ [which]: { ...series, next: series.next + count } }).where(eq(hrSettings.tenantId, tenantId));
  return { series, first: series.next };
}
