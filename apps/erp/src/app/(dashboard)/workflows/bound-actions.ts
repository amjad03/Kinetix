'use server';

import { read, send } from '@/lib/ops-server';
import { simpleFlowBody, type BoundStatus } from '@/lib/pathways-b';

type V = Record<string, string>;
const B = '/v1/workflows/bound';
const id = encodeURIComponent;

/** Where the latest approval request for a record stands. */
export async function boundStatus(module: string, sourceId: string) {
  return read<BoundStatus>(`${B}/${id(module)}/${id(sourceId)}`);
}

/** "Set up with one approver role": one active definition with a single approval step. */
export async function setUpFlow(v: V) {
  return send('/v1/workflows/definitions', simpleFlowBody(v.requestType, v.name, v.role), '/workflows');
}

export async function sendScholarship(applicationId: string) {
  return send(`${B}/scholarships/${id(applicationId)}`, undefined, '/scholarships');
}

/** A refund routed for approval; the payment is the one on the receipt. */
export async function sendRefund(paymentId: string, v: V) {
  return send(`${B}/refunds`, { paymentId, amountPaise: Number(v.amount), reason: v.reason }, '/fees');
}

export async function sendCertificate(requestId: string) {
  return send(`${B}/certificates/${id(requestId)}`, undefined, '/documents');
}

export async function sendWaiver(applicationId: string, v: V) {
  return send(`${B}/admission-waivers/${id(applicationId)}`, { reason: v.reason }, '/admissions');
}

export async function sendResolution(ticketId: string, v: V) {
  return send(`${B}/grievances/${id(ticketId)}/resolution`, { resolution: v.resolution }, '/grievances');
}
