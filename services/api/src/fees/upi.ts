import { qrSvg } from '../common/qr.js';
import { paiseToRupees } from './payment-provider.js';

/** Merchant category code for colleges and universities (NPCI MCC list). */
export const UPI_MCC_EDUCATION = '8220';

/** A UPI id (virtual payment address) as NPCI allows it: name@handle. */
export const VPA = /^[A-Za-z0-9.\-_]{2,256}@[A-Za-z][A-Za-z0-9]{1,64}$/;

/**
 * The NPCI UPI deep link ("intent") a phone's UPI app opens: pay this VPA exactly this amount with this reference.
 * The amount is bound (am, two decimals) so the payer cannot change it; tr is the institution's reference, which UPI
 * apps and banks carry into the statement narration, so the bank import can match the credit to the fee.
 * Spec: NPCI "UPI Linking Specifications" (pa, pn, mc, tr, tn, am, cu).
 */
export function upiIntent(o: { vpa: string; payee: string; amountPaise: number; reference: string; note: string }): string {
  const q = new URLSearchParams({ pa: o.vpa, pn: o.payee.slice(0, 50), mc: UPI_MCC_EDUCATION, tr: o.reference.replace(/[^A-Za-z0-9]/g, '').slice(0, 35), tn: o.note.replace(/[^\p{L}\p{N} .,/-]/gu, '').slice(0, 50), am: paiseToRupees(o.amountPaise), cu: 'INR' });
  // NPCI apps expect %20 for spaces, not "+".
  return `upi://pay?${q.toString().replace(/\+/g, '%20')}`;
}

/** The intent and its QR (SVG) for an amount due, or null when the account has no UPI id. */
export function upiQr(o: { vpa: string | null | undefined; payee: string; amountPaise: number; reference: string; note: string }): { intent: string; qrSvg: string; vpa: string; amountPaise: number; reference: string } | null {
  if (!o.vpa || !VPA.test(o.vpa) || o.amountPaise <= 0) return null;
  const intent = upiIntent({ vpa: o.vpa, payee: o.payee, amountPaise: o.amountPaise, reference: o.reference, note: o.note });
  return { intent, qrSvg: qrSvg(intent), vpa: o.vpa, amountPaise: o.amountPaise, reference: o.reference.replace(/[^A-Za-z0-9]/g, '').slice(0, 35) };
}
