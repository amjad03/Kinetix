import { count, isNotNull } from 'drizzle-orm';
import type { Tx } from '../db/db.service.js';
import { academicDocRequests, examOfficeSettings, hallTickets } from '../db/schema.js';
import { formatSeries, withDefaults, type OfficeSettings } from './exam-office.logic.js';

/** The exam office settings of the tenant in `tx` (defaults filled in), and whether the office has saved any. */
export async function officeSettings(tx: Tx): Promise<{ settings: OfficeSettings; configured: boolean }> {
  const [row] = await tx.select({ settings: examOfficeSettings.settings }).from(examOfficeSettings);
  return { settings: withDefaults(row?.settings), configured: !!row };
}

export const loadOfficeSettings = async (tx: Tx) => (await officeSettings(tx)).settings;

/**
 * Hall ticket numbers from the office's series, `n` of them in a row, or null when the office has not set a series
 * (the session-based numbers are used then). The running number continues after every ticket issued so far.
 */
export async function hallTicketNumbers(tx: Tx, n: number, on: Date): Promise<string[] | null> {
  const { settings, configured } = await officeSettings(tx);
  if (!configured) return null;
  const [{ issued }] = await tx.select({ issued: count() }).from(hallTickets);
  return Array.from({ length: n }, (_, i) => formatSeries(settings.hallTicketSeries, settings.hallTicketSeries.next + Number(issued) + i, on));
}

/** The next certificate (transcript, grade card) serial from the office's series, or null when none is set. */
export async function certificateSerial(tx: Tx, on: Date): Promise<string | null> {
  const { settings, configured } = await officeSettings(tx);
  if (!configured) return null;
  const [{ issued }] = await tx.select({ issued: count() }).from(academicDocRequests).where(isNotNull(academicDocRequests.serialNo));
  return formatSeries(settings.certificateSeries, settings.certificateSeries.next + Number(issued), on);
}
