import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type { UserPrincipal } from '../auth/principal.js';
import { auditUser } from '../common/audit.js';
import { nextNumber } from '../common/ops.js';
import type { Tx } from '../db/db.service.js';
import { researchCalls } from '../db/schema-research.js';
import { projectMembers, researchProjects, researchProposals } from '../db/schema.js';
import { found, hasRole } from '../placements/placements.access.js';
import { canMoveProposal, ethicsBlocksApproval } from './research-rules.js';
import { RESEARCH_ROLES } from './roles.js';

/**
 * Moves a research proposal along draft → submitted → under review → approved / rejected (or withdrawn). Submitting
 * against a funding call needs the call open and its internal deadline (else its deadline) not passed; approval needs
 * ethics clearance when the proposal asks for it and creates the project with the investigator as supervisor.
 */
export async function moveProposal(tx: Tx, p: UserPrincipal, id: string, to: string, today: string, decision?: { note?: string; startsOn?: string }, ownerOnly = false) {
  const cur = found((await tx.select().from(researchProposals).where(eq(researchProposals.id, id)).for('update'))[0], 'Proposal');
  if (ownerOnly && cur.piUserId !== p.userId && !hasRole(p, RESEARCH_ROLES)) throw new NotFoundException('Proposal not found');
  if (!canMoveProposal(cur.status, to)) throw new ConflictException(`A ${cur.status} proposal cannot become ${to}`);
  if (to === 'submitted' && cur.callId) {
    const [call] = await tx.select().from(researchCalls).where(eq(researchCalls.id, cur.callId));
    const last = call?.internalDeadline ?? call?.deadline;
    if (call && (call.status !== 'open' || (last && today > last))) throw new ConflictException({ message: `The internal deadline of this call (${last}) has passed`, code: 'CALL_CLOSED' });
  }
  if (to === 'approved' && ethicsBlocksApproval(cur)) throw new ConflictException('Ethics clearance is required before approval');
  if (to === 'rejected' && !decision?.note) throw new BadRequestException('Give a reason for rejecting');
  const [row] = await tx.update(researchProposals).set({ status: to, reviewNote: decision?.note ?? cur.reviewNote, decidedBy: decision ? p.userId : null, decidedAt: decision ? new Date() : null, version: cur.version + 1 }).where(eq(researchProposals.id, id)).returning();
  let project = null;
  if (to === 'approved') {
    const code = await nextNumber(tx, p.tenantId, 'PRJ');
    [project] = await tx.insert(researchProjects).values({ tenantId: p.tenantId, proposalId: id, code, title: cur.title, kind: cur.kind, piUserId: cur.piUserId, departmentId: cur.departmentId, sponsorOrg: cur.sponsorOrg, startsOn: decision?.startsOn ?? today }).returning();
    await tx.insert(projectMembers).values({ tenantId: p.tenantId, projectId: project.id, userId: cur.piUserId, role: 'supervisor' });
  }
  await auditUser(tx, p, `research.proposal_${to}`, 'proposal', id, { note: decision?.note, projectId: project?.id });
  return { ...row, project };
}
