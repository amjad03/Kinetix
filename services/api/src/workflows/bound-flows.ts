import { ConflictException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import type { Tx } from '../db/db.service.js';
import { workflowDefinitions } from '../db/schema.js';

/**
 * The domain flows that go through the approval engine when an institution has set up a workflow for them.
 * Each name is the `requestType` of a workflow definition.
 */
export const BOUND = {
  scholarship: 'scholarship_award',
  refund: 'fee_refund',
  certificate: 'certificate_issue',
  waiver: 'admission_fee_waiver',
  grievance: 'grievance_resolution',
} as const;

/** The `sourceModule` each bound flow reports in `workflows.decided`. */
export const BOUND_SOURCE = {
  scholarship: 'scholarships',
  refund: 'fee_refunds',
  certificate: 'certificates',
  waiver: 'admissions',
  grievance: 'grievances',
} as const;

/**
 * Refuses a direct action when the institution routes it through a workflow: the person must send it for approval
 * instead, so the approval route cannot be skipped by calling the original endpoint.
 */
export async function assertNotRouted(tx: Tx, requestType: string): Promise<void> {
  const [d] = await tx.select({ name: workflowDefinitions.name }).from(workflowDefinitions).where(and(eq(workflowDefinitions.requestType, requestType), eq(workflowDefinitions.active, true)));
  if (d) throw new ConflictException({ message: `This needs approval through the "${d.name}" workflow. Send it for approval instead.`, code: 'WORKFLOW_REQUIRED' });
}
