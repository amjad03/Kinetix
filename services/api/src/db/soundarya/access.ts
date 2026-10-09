/** Alumni portal login, delegated approvals, data-privacy (DPDP) requests and marks drawn on an answer script. */
import { DOMAIN } from './data.js';
import type { Ctx } from './ctx.js';
import { addDays, at, J } from './kit.js';

const MASK_PERCENT = 15;

export async function rolesAndRights(c: Ctx): Promise<void> {
  const { kit: k } = c;
  const idOf = async (email: string) => (await k.q<{ id: string }>('select id from users where tenant_id = $1 and email = $2', [c.tenantId, `${email}@${DOMAIN}`]))[0]?.id;

  // An alumnus with a portal login, linked to the first alumni profile (who has pledges and donations).
  const [profile] = await k.q<{ id: string; fullName: string; email: string | null; phone: string | null }>('select id, full_name, email, phone from alumni_profiles where tenant_id = $1 order by created_at, id limit 1', [c.tenantId]);
  if (profile) {
    const user = await k.one<{ id: string }>('users', { fullName: profile.fullName, email: `alumnus@${DOMAIN}`, phone: profile.phone, passwordHash: c.hash, preferredLanguage: 'en', status: 'active' });
    await k.ins('user_roles', { userId: user.id, role: 'alumni', campusId: c.campusId }, { returning: false });
    await k.q('update alumni_profiles set user_id = $2, directory_visible = true where id = $1', [profile.id, user.id]);
  }

  // Delegations: the principal is away for a week and the HoD Management Studies decides; an earlier one between HoDs was ended.
  const principal = c.byEmail.principal.id;
  const hodManagement = c.byEmail['hod.management'].id;
  await k.ins(
    'approval_delegations',
    [
      { delegatorId: principal, delegateId: hodManagement, scope: 'all', startsOn: addDays(c.today, -2), endsOn: addDays(c.today, 9), reason: 'Attending the NAAC peer team preparation workshop' },
      { delegatorId: c.byEmail['hod.commerce'].id, delegateId: c.byEmail['hod.computers'].id, scope: 'leave', startsOn: addDays(c.today, -20), endsOn: addDays(c.today, -10), reason: 'Examination duty', revokedAt: at(addDays(c.today, -14), '10:00'), revokedBy: c.byEmail['hod.commerce'].id },
    ],
    { returning: false },
  );

  // Data-privacy requests: a pending correction, a copy that was given, and an erasure the retention rules blocked.
  const student = await idOf('student.bcom');
  const guardian = await idOf('parent.bca');
  const reasons = ['The student is currently enrolled; the institution must keep the enrolment record.', 'Fee receipts and payments must be kept for 8 years under the tax and GST rules.'];
  const vignesh = await idOf('student.bca');
  await k.ins(
    'dpdp_requests',
    [
      ...(student ? [{ userId: student, kind: 'correction', status: 'pending', details: 'My phone number changed.', correction: J({ field: 'phone', value: '+919880012345' }), createdAt: at(addDays(c.today, -3), '11:20') }] : []),
      ...(student ? [{ userId: student, kind: 'export', status: 'completed', details: 'pdf', processedAt: at(addDays(c.today, -9), '16:05'), createdAt: at(addDays(c.today, -9), '16:05') }] : []),
      ...(vignesh ? [{ userId: vignesh, kind: 'erasure', status: 'blocked', details: 'I want my data removed.', resolutionNote: 'Records must be kept while you are enrolled and for the fee-record period.', retentionReasons: J(reasons), processedBy: principal, processedAt: at(addDays(c.today, -5), '12:30'), createdAt: at(addDays(c.today, -6), '09:40') }] : []),
      ...(guardian ? [{ userId: guardian, kind: 'correction', status: 'completed', details: 'Spelling of my name', correction: J({ field: 'fullName', value: 'Revathi Naik' }), resolutionNote: 'Updated.', processedBy: principal, processedAt: at(addDays(c.today, -8), '14:00'), createdAt: at(addDays(c.today, -10), '10:15') }] : []),
    ],
    { returning: false },
  );

  // Marks drawn on the script that needs a third valuation (round 1 and 2 each marked it), and a masked header band on the paper.
  const [script] = await k.q<{ id: string; paperId: string }>("select id, paper_id from eval_scripts where tenant_id = $1 and third_required order by dummy_no limit 1", [c.tenantId]);
  if (script) {
    await k.q('update eval_configs set mask_header_percent = $2 where paper_id = $1', [script.paperId, MASK_PERCENT]);
    await k.q('update eval_scripts set header_masked = true where paper_id = $1', [script.paperId]);
    const allocs = await k.q<{ id: string; examinerId: string; round: number }>('select id, examiner_id, round from eval_allocations where script_id = $1 and round < 3 order by round', [script.id]);
    await k.ins(
      'eval_annotations',
      allocs.flatMap((a) => [
        { scriptId: script.id, allocationId: a.id, pageIndex: 0, kind: 'tick', x: 0.18, y: 0.32, createdBy: a.examinerId },
        { scriptId: script.id, allocationId: a.id, pageIndex: 0, kind: a.round === 1 ? 'cross' : 'tick', x: 0.62, y: 0.47, createdBy: a.examinerId },
        { scriptId: script.id, allocationId: a.id, pageIndex: 0, kind: 'highlight', x: 0.1, y: 0.55, w: 0.55, h: 0.06, createdBy: a.examinerId },
        { scriptId: script.id, allocationId: a.id, pageIndex: 0, kind: 'comment', x: 0.7, y: 0.62, text: a.round === 1 ? 'Definition is incomplete; the second step is missing.' : 'Full marks for the working shown here.', createdBy: a.examinerId },
      ]),
      { returning: false },
    );
  }
}
