import { ConflictException } from '@nestjs/common';
import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { Tx } from '../db/db.service.js';
import { feeAccountsSettings, acctPeriodCloses } from '../db/schema-fee-accounts.js';
import { auditLog, feeInvoices, userRoles, users } from '../db/schema.js';
import type { Localized } from '../notifications/texts.js';
import { rupees } from '../notifications/texts.js';
import { DEFAULT_APPROVALS, DEFAULT_HEADS, DEFAULT_MAPPINGS, DEFAULT_MODES, DEFAULT_SERIES, formatSeries, type SeriesKey } from './fee-accounts.logic.js';

/** The desk's settings row, created with the defaults the first time it is read. */
export async function settingsOf(tx: Tx, tenantId: string) {
  const [row] = await tx.select().from(feeAccountsSettings);
  if (row) return { ...row, series: { ...DEFAULT_SERIES, ...row.series }, mappings: { ...DEFAULT_MAPPINGS, ...row.mappings }, approvals: { ...DEFAULT_APPROVALS, ...row.approvals } };
  const [made] = await tx
    .insert(feeAccountsSettings)
    .values({ tenantId, series: DEFAULT_SERIES, feeHeads: DEFAULT_HEADS, paymentModes: DEFAULT_MODES, mappings: DEFAULT_MAPPINGS, approvals: DEFAULT_APPROVALS })
    .onConflictDoNothing()
    .returning();
  return made ?? settingsOf(tx, tenantId);
}

/** Takes the next number of a series (the settings row is locked, so two requests never share one). */
export async function nextNumber(tx: Tx, tenantId: string, key: SeriesKey, date: string): Promise<string> {
  await settingsOf(tx, tenantId);
  const [row] = await tx.select().from(feeAccountsSettings).for('update');
  const series = { ...DEFAULT_SERIES, ...row.series };
  const s = series[key];
  const number = formatSeries(s, date);
  await tx.update(feeAccountsSettings).set({ series: { ...series, [key]: { ...s, next: s.next + 1 } } }).where(eq(feeAccountsSettings.id, row.id));
  return number;
}

/** The receipt prefix, digits and suffix from the settings; the running number itself restarts every financial year. */
export async function receiptNumber(tx: Tx, n: number, date: string): Promise<string> {
  const [row] = await tx.select({ series: feeAccountsSettings.series }).from(feeAccountsSettings);
  return formatSeries(row?.series.receipt ?? DEFAULT_SERIES.receipt, date, n);
}

/** Gives every invoice that has no number yet one from the invoice series, oldest first. */
export async function ensureInvoiceNumbers(tx: Tx, tenantId: string): Promise<void> {
  const open = await tx.select({ id: feeInvoices.id, createdAt: feeInvoices.createdAt }).from(feeInvoices).where(isNull(feeInvoices.invoiceNo)).orderBy(asc(feeInvoices.createdAt), asc(feeInvoices.id)).limit(2000);
  for (const inv of open) {
    const no = await nextNumber(tx, tenantId, 'invoice', inv.createdAt.toISOString().slice(0, 10));
    await tx.update(feeInvoices).set({ invoiceNo: no }).where(eq(feeInvoices.id, inv.id));
  }
}

/** Refuses a posting into a month that has been closed. */
export async function assertPeriodOpen(tx: Tx, date: string): Promise<void> {
  const [c] = await tx.select({ id: acctPeriodCloses.id }).from(acctPeriodCloses).where(eq(acctPeriodCloses.period, date.slice(0, 7)));
  if (c) throw new ConflictException(`The month ${date.slice(0, 7)} is closed`);
}

/** Staff who decide: the principal and institution admins (and the accountant for vouchers and cash). */
export async function approverIds(tx: Tx, roles: string[]): Promise<string[]> {
  const rows = await tx.selectDistinct({ id: userRoles.userId }).from(userRoles).where(inArray(userRoles.role, roles as (typeof userRoles.role.enumValues)[number][]));
  return rows.map((r) => r.id);
}

/** The audit trail of one record, newest first, with the actor's name. */
export async function historyOf(tx: Tx, subjectType: string, subjectId: string) {
  return tx
    .select({ id: auditLog.id, at: auditLog.at, action: auditLog.action, data: auditLog.data, actor: users.fullName })
    .from(auditLog)
    .leftJoin(users, eq(users.id, auditLog.actorId))
    .where(and(eq(auditLog.subjectType, subjectType), eq(auditLog.subjectId, subjectId)))
    .orderBy(sql`${auditLog.at} desc`)
    .limit(100);
}

const all = (f: (l: 'en' | 'hi' | 'kn') => { title: string; body: string }): Localized => ({ en: f('en'), hi: f('hi'), kn: f('kn') });

/** What families and approvers are told, in English, Hindi and Kannada. */
export const deskTexts = {
  approvalNeeded: (what: string, number: string) =>
    all((l) => ({
      en: { title: 'Approval needed', body: `${what} ${number} is waiting for your decision.` },
      hi: { title: 'स्वीकृति आवश्यक', body: `${what} ${number} आपके निर्णय की प्रतीक्षा में है।` },
      kn: { title: 'ಅನುಮೋದನೆ ಬೇಕು', body: `${what} ${number} ನಿಮ್ಮ ನಿರ್ಧಾರಕ್ಕಾಗಿ ಕಾಯುತ್ತಿದೆ.` },
    })[l]),
  decided: (what: string, number: string, approved: boolean) =>
    all((l) => ({
      en: { title: approved ? 'Approved' : 'Not approved', body: `${what} ${number} was ${approved ? 'approved' : 'not approved'}.` },
      hi: { title: approved ? 'स्वीकृत' : 'अस्वीकृत', body: `${what} ${number} ${approved ? 'स्वीकृत हो गया' : 'स्वीकृत नहीं हुआ'}।` },
      kn: { title: approved ? 'ಅನುಮೋದಿತ' : 'ತಿರಸ್ಕೃತ', body: `${what} ${number} ${approved ? 'ಅನುಮೋದನೆಯಾಗಿದೆ' : 'ಅನುಮೋದನೆಯಾಗಿಲ್ಲ'}.` },
    })[l]),
  concession: (approved: boolean, amountPaise: number) =>
    all((l) => {
      const a = rupees(amountPaise);
      return {
        en: approved ? { title: 'Concession approved', body: `A concession of ${a} has been applied to the fees.` } : { title: 'Concession not approved', body: `The concession request for ${a} was not approved. Contact the accounts office.` },
        hi: approved ? { title: 'रियायत स्वीकृत', body: `${a} की रियायत फ़ीस में लागू कर दी गई है।` } : { title: 'रियायत अस्वीकृत', body: `${a} की रियायत का अनुरोध स्वीकृत नहीं हुआ। लेखा कार्यालय से संपर्क करें।` },
        kn: approved ? { title: 'ರಿಯಾಯಿತಿ ಅನುಮೋದಿತ', body: `${a} ರಿಯಾಯಿತಿಯನ್ನು ಶುಲ್ಕಕ್ಕೆ ಅನ್ವಯಿಸಲಾಗಿದೆ.` } : { title: 'ರಿಯಾಯಿತಿ ತಿರಸ್ಕೃತ', body: `${a} ರಿಯಾಯಿತಿ ವಿನಂತಿ ಅನುಮೋದನೆಯಾಗಿಲ್ಲ. ಲೆಕ್ಕಪತ್ರ ಕಚೇರಿಯನ್ನು ಸಂಪರ್ಕಿಸಿ.` },
      }[l];
    }),
  refundPaid: (amountPaise: number, mode: string) =>
    all((l) => {
      const a = rupees(amountPaise);
      return {
        en: { title: 'Refund paid', body: `A refund of ${a} has been paid (${mode}).` },
        hi: { title: 'धनवापसी का भुगतान', body: `${a} की धनवापसी कर दी गई है (${mode})।` },
        kn: { title: 'ಮರುಪಾವತಿ ಮಾಡಲಾಗಿದೆ', body: `${a} ಮರುಪಾವತಿ ಮಾಡಲಾಗಿದೆ (${mode}).` },
      }[l];
    }),
  chequeBounced: (chequeNo: string, amountPaise: number, chargePaise: number) =>
    all((l) => {
      const a = rupees(amountPaise);
      const c = rupees(chargePaise);
      return {
        en: { title: 'Cheque returned', body: `Cheque ${chequeNo} for ${a} was returned by the bank. The amount is due again${chargePaise ? `, with a charge of ${c}` : ''}.` },
        hi: { title: 'चेक लौटा', body: `${a} का चेक ${chequeNo} बैंक ने लौटा दिया। राशि फिर से देय है${chargePaise ? `, ${c} शुल्क के साथ` : ''}।` },
        kn: { title: 'ಚೆಕ್ ಹಿಂತಿರುಗಿದೆ', body: `${a} ಮೊತ್ತದ ಚೆಕ್ ${chequeNo} ಅನ್ನು ಬ್ಯಾಂಕ್ ಹಿಂತಿರುಗಿಸಿದೆ. ಮೊತ್ತ ಮತ್ತೆ ಬಾಕಿ ಇದೆ${chargePaise ? `, ${c} ಶುಲ್ಕದೊಂದಿಗೆ` : ''}.` },
      }[l];
    }),
};
