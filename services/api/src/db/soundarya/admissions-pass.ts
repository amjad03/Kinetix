/**
 * Admissions pass: programme approvals, the BCA counselling with its reservation matrix (two rounds, claims, a
 * floating seat and a forfeit), the MBA government seats allotted by KEA through PGCET with their checklists, a
 * provisional and a confirmed admission enrolled with fees and sign-in details, opt-outs and a sent campaign broadcast.
 */
import type { UserPrincipal } from '../../auth/principal.js';
import { AdmissionsService } from '../../admissions/admissions.service.js';
import { DepthService } from '../../admissions/depth/depth.service.js';
import { EnrolmentService } from '../../admissions/pass/enrolment.service.js';
import { PLAN_PRESETS } from '../../admissions/pass/reservation.js';
import { SeatsService } from '../../admissions/pass/seats.service.js';
import type { Ctx } from './ctx.js';
import { PROFILE } from './data.js';
import { addDays, at } from './kit.js';
import { service, withTenant } from './nest.js';

export async function admissionsPass(c: Ctx): Promise<void> {
  if (PROFILE === 'school') return;
  const { kit: k } = c;
  const officer = c.byEmail.admissions.id;
  const principal = c.byEmail.principal.id;
  const actor = { tenantId: c.tenantId, userId: officer };
  const head: UserPrincipal = { kind: 'user', tenantId: c.tenantId, userId: principal, roles: ['principal'] };
  const adm = await service(AdmissionsService);
  const depth = await service(DepthService);
  const seats = await service(SeatsService);
  const enrol = await service(EnrolmentService);
  const prog = (code: string) => c.programs[code].id;

  // Programme approvals: Bangalore University affiliation for the degrees, AICTE for MBA; branch codes.
  const approvals: [string, string, number, string, string, string][] = [
    ['BBA', 'BB', 60, 'Bangalore University', 'BU/AFF/2004/117', '2029-05-31'],
    ['BCM', 'BC', 120, 'Bangalore University', 'BU/AFF/2004/117', '2029-05-31'],
    ['BCA', 'CA', 60, 'Bangalore University', 'BU/AFF/2011/342', '2029-05-31'],
    ['MBA', 'MB', 60, 'AICTE', 'F.No. South-West/1-44102318/2026/EOA', '2027-06-30'],
    ['BAV', 'AV', 40, 'Bangalore University', 'BU/AFF/2019/088', '2027-05-31'],
  ];
  await withTenant(c.tenantId, async (tx) => {
    for (const [code, branchCode, sanctionedIntake, approvalBody, approvalRef, approvalValidTo] of approvals) await enrol.setProgrammeSettings(tx, { ...actor, userId: principal }, prog(code), { branchCode, sanctionedIntake, approvalBody, approvalRef, approvalValidTo });
  });
  // The sign-in message families get at enrolment, registered with the operator (DLT).
  await k.ins('message_templates', [
    { key: 'admission.welcome', channel: 'sms', locale: 'en', subject: '', body: 'Welcome to {{institution}}. {{name}} is admitted to {{programme}}. Sign in to the {{app}} app with {{login}} and the code sent to it.', dltTemplateId: '1107172200045671234', active: true },
    { key: 'lead.open-day', channel: 'sms', locale: 'en', subject: '', body: 'Dear {{name}}, {{institution}} holds an open day for {{programme}} on Saturday 10 am. Meet the faculty and see the campus.', dltTemplateId: '1107172200045675678', active: true },
  ], { returning: false });

  // ---- BCA 2027-28: counselling with the state university's reservation ------------------------------------------
  const [bca] = await k.q<{ id: string }>("select id from admission_cycles where tenant_id = $1 and name = 'BCA 2027-28: Early admission round'", [c.tenantId]);
  const apps = await k.q<{ id: string; application_no: string; status: string; fee_status: string; answers: { marks_12th: number } }>('select id, application_no, status, fee_status, answers from applications where cycle_id = $1 order by application_no', [bca.id]);
  await k.ins('application_documents', apps.flatMap((a, i) => ['marksheet', 'id_proof'].map((docKey) => ({ applicationId: a.id, docKey, fileName: `${docKey}-bca-${i + 1}.pdf`, contentType: 'application/pdf', sizeBytes: 150000 + i * 700, storageKey: `seed/admissions/${a.id}/${docKey}.pdf`, status: 'verified', reviewedBy: officer, uploadedAt: at(addDays(c.today, -i - 1), '10:00') }))), { returning: false });
  const preset = PLAN_PRESETS.find((p) => p.key === 'karnataka-degree')!;
  const cats = ['GM', 'SC', 'GM', '2A', 'GM', '3B', 'GM', 'SC', 'GM', 'Cat-1', 'GM', 'ST'];
  await withTenant(c.tenantId, async (tx) => {
    // Intake 28: university merit 80% = 22, management 6; in merit SC 4, ST 1, Cat-1 1, 2A 3, 2B 1, 3A 1, 3B 1, GM 10; one foreign-national seat on top.
    await seats.applyPlan(tx, actor, bca.id, { ...preset.plan, options: [{ label: 'BCA', intake: 28 }] });
    await depth.setFormula(tx, actor, bca.id, { preset: 'simple' });
    for (const [i, a] of apps.entries()) {
      await adm.setCategory(tx, actor, a.id, cats[i]);
      if (a.status === 'submitted' && a.fee_status === 'paid') await adm.setStatus(tx, actor, a.id, 'under_review');
      await depth.setMarks(tx, actor, a.id, { percentage: a.answers.marks_12th });
      await depth.setPreferences(tx, actor, a.id, ['BCA']);
    }
    await seats.setClaims(tx, actor, apps[4].id, { horizontal: ['rural'], supernumerary: [] });
    await seats.setClaims(tx, actor, apps[2].id, { horizontal: ['pwd'], supernumerary: [] });
    await adm.evaluate(tx, actor, bca.id);
    await depth.buildRankList(tx, actor, bca.id);
    const r1 = await depth.startRound(tx, actor, bca.id);
    await depth.publishRound(tx, actor, r1.id);
    const al = (await depth.roundAllotments(tx, r1.id)).allotments;
    const answers = ['freeze', 'freeze', 'float', 'freeze', 'reject', 'freeze'] as const;
    for (const [i, x] of al.entries()) if (answers[i]) await depth.respond(tx, actor, x.id, answers[i]);
    await depth.closeRound(tx, actor, r1.id);
    await depth.startRound(tx, actor, bca.id);
  });

  // ---- MBA 2027-28: PGCET government seats allotted by KEA ---------------------------------------------------------
  const [mba] = await k.q<{ id: string }>("select id from admission_cycles where tenant_id = $1 and name = 'MBA 2027-28 (KMAT / PGCET)'", [c.tenantId]);
  const pg = PLAN_PRESETS.find((p) => p.key === 'karnataka-pg-private')!;
  let phoneN = 70000;
  const phone = () => `+9190000${String(phoneN++).padStart(5, '0')}`;
  const kea = [
    ['KEA/PGCET/2027/R1/MBA/0112', 'PG27M0412', 1240, 'Ananya Kulkarni', '2004-06-11', 'female', '2A'],
    ['KEA/PGCET/2027/R1/MBA/0113', 'PG27M0907', 2105, 'Rakesh Gowda', '2003-11-02', 'male', 'GM'],
    ['KEA/PGCET/2027/R1/MBA/0114', 'PG27M1315', 3380, 'Shruthi Naik', '2004-01-23', 'female', 'SC'],
    ['KEA/PGCET/2027/R1/MBA/0115', 'PG27M1720', 4117, 'Mohammed Faizan', '2003-08-30', 'male', '3B'],
  ] as const;
  await withTenant(c.tenantId, async (tx) => {
    await seats.setEligibilityPreset(tx, actor, mba.id, 'ka-pg-mba');
    await depth.setFormula(tx, actor, mba.id, { preset: 'pgcet_mba' });
    await seats.applyPlan(tx, actor, mba.id, { ...pg.plan, options: [{ label: 'MBA', intake: 36 }] });
    await seats.importExternalAllotments(tx, actor, mba.id, 'kea', kea.map(([allotmentRef, rollNo, rank, name, dateOfBirth, gender, category]) => ({ allotmentRef, rollNo, rank, name, dateOfBirth, gender, phone: phone(), guardianName: `Parent of ${name.split(' ')[0]}`, guardianPhone: phone(), category, option: 'MBA' })));
  });
  const allotted = await k.q<{ id: string; applicant_name: string }>('select id, applicant_name from applications where cycle_id = $1 and external_allotment_ref is not null order by entrance_rank', [mba.id]);
  await withTenant(c.tenantId, async (tx) => {
    for (const a of allotted) await enrol.ensureChecklist(tx, actor, a.id);
    // Ananya hands everything in: confirmed, then enrolled.
    const first = await enrol.checklist(tx, allotted[0].id);
    for (const i of first.items.filter((x) => x.required)) await enrol.updateItem(tx, actor, i.id, { status: i.original ? 'received' : 'verified', referenceNo: i.itemKey === 'eligibility' ? 'BU/EC/2027/00412' : i.itemKey === 'caste_income' ? 'RD-BNG-2026-118842' : null });
    await enrol.enroll(tx, head, allotted[0].id, { activate: false });
    // Rakesh is admitted provisionally: the transfer and migration certificates come from his university later.
    const second = await enrol.checklist(tx, allotted[1].id);
    for (const i of second.items.filter((x) => x.required && !['tc', 'migration', 'eligibility'].includes(x.itemKey))) await enrol.updateItem(tx, actor, i.id, { status: i.original ? 'received' : 'verified' });
    await enrol.provisionalAdmit(tx, actor, allotted[1].id, { dueOn: addDays(c.today, 21), undertaking: true });
    await enrol.enroll(tx, head, allotted[1].id, { activate: false });
    // Shruthi's caste certificate is in; her transfer certificate is overdue on an earlier undertaking.
    const third = await enrol.checklist(tx, allotted[2].id);
    const caste = third.items.find((x) => x.itemKey === 'caste');
    if (caste) await enrol.updateItem(tx, actor, caste.id, { status: 'received', referenceNo: 'RD-BNG-2026-120017' });
  });
  await k.q("update admission_checklist_items set status = 'deferred', due_on = $2 where application_id = $1 and item_key = 'tc'", [allotted[2].id, addDays(c.today, -2)]);
  await k.q("update applications set provisional = true, provisional_until = $2 where id = $1", [allotted[2].id, addDays(c.today, -2)]);

  // ---- Leads: opt-outs and a sent open-day broadcast ------------------------------------------------------------
  const leads = await k.q<{ id: string; name: string }>("select id, name from enquiries where tenant_id = $1 and stage in ('new', 'contacted', 'counselling') and merged_into_id is null order by created_at limit 30", [c.tenantId]);
  const outs = leads.slice(0, 3);
  await k.q('update enquiries set opted_out_at = $2 where id = any($1::uuid[])', [outs.map((o) => o.id), at(addDays(c.today, -9), '15:00')]);
  const [tpl] = await k.q<{ id: string }>("select id from message_templates where tenant_id = $1 and key = 'lead.open-day'", [c.tenantId]);
  const reach = leads.slice(3);
  const sentAt = at(addDays(c.today, -6), '11:00');
  const b = await k.one<{ id: string }>('admission_broadcasts', { templateId: tpl.id, channel: 'sms', segment: { stages: ['new', 'contacted', 'counselling'] }, status: 'done', total: leads.length, sent: reach.length - 1, skipped: 3, failed: 1, idempotencyKey: 'seed-open-day', createdBy: officer, createdAt: sentAt, finishedAt: sentAt });
  await k.ins('admission_broadcast_sends', [
    ...outs.map((o) => ({ broadcastId: b.id, enquiryId: o.id, status: 'skipped', reason: 'Opted out' })),
    ...reach.map((r, i) => ({ broadcastId: b.id, enquiryId: r.id, status: i === 5 ? 'failed' : 'sent', reason: i === 5 ? 'The provider refused the message' : null, sentAt: i === 5 ? null : sentAt })),
  ], { returning: false });
  await k.ins('enquiry_activities', reach.filter((_, i) => i !== 5).map((r) => ({ enquiryId: r.id, kind: 'sms', note: `Campaign message "lead.open-day": Dear ${r.name}, Soundarya holds an open day on Saturday 10 am.`, actorId: officer, createdAt: sentAt })), { returning: false });
}
