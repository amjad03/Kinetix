/** Admissions: campaigns, the enquiry pipeline, a closed cycle that filled this year's classes, and an open early-admission round with entrance test and merit list. */
import { AdmissionsService } from '../../admissions/admissions.service.js';
import { EnquiriesService } from '../../admissions/enquiries.service.js';
import { FEMALE, MALE, SURNAMES } from './data.js';
import type { Ctx } from './ctx.js';
import { addDays, at, J, rupees } from './kit.js';
import { service, withTenant } from './nest.js';

const FORM = [
  { key: 'marks_12th', label: 'Class 12 / PUC marks (%)', type: 'number', required: true, min: 0, max: 100 },
  { key: 'stream', label: 'PUC stream', type: 'select', required: true, options: ['Commerce', 'Science', 'Arts', 'Vocational'] },
  { key: 'board', label: 'Board', type: 'select', required: true, options: ['Karnataka PUC Board', 'CBSE', 'ICSE', 'Other state board'] },
];
const DOCS = [{ key: 'marksheet', label: 'Class 12 marks card', required: true }, { key: 'id_proof', label: 'Identity proof (Aadhaar)', required: true }, { key: 'photo', label: 'Passport photograph', required: false }];

export async function admissions(c: Ctx): Promise<void> {
  const { kit: k, r } = c;
  const officer = c.byEmail.admissions.id;
  const actor = { tenantId: c.tenantId, userId: officer };
  const enq = await service(EnquiriesService);
  const adm = await service(AdmissionsService);
  const prog = (code: string) => c.programs[code].id;
  const person = () => {
    const female = r.chance(0.5);
    return { name: `${r.pick(female ? FEMALE : MALE)} ${r.pick(SURNAMES)}`, female };
  };
  let phoneN = 50000;
  const phone = () => `+9190000${String(phoneN++).padStart(5, '0')}`;

  // Campaigns with UTM tags.
  const campaignDefs = [
    { name: 'Instagram Reels: Admissions 2027', channel: 'social', utmSource: 'instagram', utmMedium: 'paid_social', utmCampaign: 'reels_adm27', startsOn: '2026-08-15', endsOn: '2026-12-31', budgetPaise: rupees(120000) },
    { name: 'Google Search: BBA and BCom Bengaluru', channel: 'search', utmSource: 'google', utmMedium: 'cpc', utmCampaign: 'search_bba_bcom', startsOn: '2026-08-01', endsOn: '2027-03-31', budgetPaise: rupees(180000) },
    { name: 'PUC College Visits 2026-27', channel: 'outreach', utmSource: 'school_visit', utmMedium: 'offline', utmCampaign: 'puc_visits', startsOn: '2026-09-01', endsOn: '2027-01-31', budgetPaise: rupees(60000) },
    { name: 'Aviation Open House', channel: 'event', utmSource: 'open_house', utmMedium: 'event', utmCampaign: 'aviation_openhouse', startsOn: '2026-10-03', endsOn: '2026-10-04', budgetPaise: rupees(45000) },
    { name: 'Alumni Referral Drive', channel: 'referral', utmSource: 'alumni', utmMedium: 'referral', utmCampaign: 'alumni_refer', startsOn: '2026-08-01', endsOn: '2027-03-31', budgetPaise: rupees(15000) },
  ];
  const campaigns: { id: string; utmSource: string; utmMedium: string; utmCampaign: string }[] = [];
  for (const d of campaignDefs) campaigns.push((await withTenant(c.tenantId, (tx) => enq.createCampaign(tx, actor, d))) as never);

  // Enquiries across all stages, through the module so first follow-ups and duplicates behave as in the app.
  const sources = ['web', 'walk_in', 'phone', 'campaign', 'referral'] as const;
  const programCodes = ['BBA', 'BCM', 'BCA', 'MBA', 'MCM', 'BAV'];
  const enquiryIds: string[] = [];
  for (let i = 0; i < 72; i++) {
    const p = person();
    const camp = i % 3 === 0 ? campaigns[i % campaigns.length] : null;
    const row = await withTenant(c.tenantId, (tx) =>
      enq.create(tx, actor, { name: p.name, phone: phone(), email: `${p.name.toLowerCase().replace(/[^a-z]+/g, '.')}@enquiry.demo.kinetix.in`, programId: prog(programCodes[i % programCodes.length]), source: camp ? 'campaign' : sources[i % sources.length], message: r.pick(['Please share the fee structure and hostel details.', 'Is there a scholarship for toppers?', 'Want to visit the campus this weekend.', 'Does the BCA course include placements?', 'Is the aviation programme recognised by BCU?', 'Looking for MBA with a marketing specialisation.']), counsellorId: officer, campaignId: camp?.id ?? null, utmSource: camp?.utmSource ?? null, utmMedium: camp?.utmMedium ?? null }, c.today),
    );
    enquiryIds.push(row.enquiry.id);
  }
  // Spread the stages: new / contacted / counselling / applied / lost / deferred.
  for (const [i, id] of enquiryIds.entries()) {
    const stage = ['new', 'new', 'contacted', 'contacted', 'counselling', 'counselling', 'applied', 'lost', 'deferred', 'contacted'][i % 10];
    await withTenant(c.tenantId, async (tx) => {
      if (stage !== 'new') {
        await enq.logActivity(tx, actor, id, { kind: (['call', 'whatsapp', 'visit', 'email', 'sms'] as const)[i % 5], note: ['Spoke to the parent; fee structure shared on WhatsApp.', 'Campus visit scheduled for Saturday 11 am.', 'Visited with father; interested in the hostel.', 'Sent the prospectus and scholarship details.', 'Answered queries about eligibility.'][i % 5], nextFollowUpOn: addDays(c.today, (i % 6) - 2) });
      }
      if (stage === 'counselling' || stage === 'applied') await enq.moveStage(tx, actor, id, 'counselling');
      if (stage === 'lost') await enq.moveStage(tx, actor, id, 'lost', r.pick(['Joined another college nearer to home', 'Fees beyond budget', 'Opted for engineering']));
      if (stage === 'deferred') await enq.moveStage(tx, actor, id, 'deferred');
    });
    await k.q('update enquiries set created_at = $2 where id = $1', [id, at(addDays(c.today, -(i % 55) - 2), '12:00')]);
  }

  // Cycle A: this year's BBA intake, closed. The BBA Sem 1 students all came through it.
  const bbaSem1 = c.sections.find((s) => s.prog === 'BBA' && s.term === 1)!;
  const cycleA = await k.one<{ id: string }>('admission_cycles', { programId: prog('BBA'), academicYearId: c.years.cur, name: 'BBA 2026-27: Regular admissions', status: 'closed', entryTerm: 1, seats: 60, opensOn: '2026-04-15', closesOn: '2026-07-20', applicationFeePaise: rupees(500), offerValidDays: 7, formFields: J(FORM), documents: J(DOCS), eligibility: { minimums: [{ field: 'marks_12th', min: 45 }] }, meritRules: J([{ field: 'marks_12th', weight: 1 }]), createdBy: officer });
  const aApps = bbaSem1.students.map((st, i) => ({ cycleId: cycleA.id, applicationNo: `BBA26-${String(i + 1).padStart(4, '0')}`, applicantName: st.name, dateOfBirth: `2008-0${(i % 9) + 1}-1${i % 9}`, gender: st.female ? 'female' : 'male', phone: phone(), guardianName: `Guardian of ${st.name}`, guardianPhone: phone(), guardianRelation: 'father', answers: J({ marks_12th: 55 + ((i * 7) % 40), stream: ['Commerce', 'Science', 'Arts'][i % 3], board: i % 5 ? 'Karnataka PUC Board' : 'CBSE' }), status: 'enrolled', feeStatus: 'paid', meritScore: 55 + ((i * 7) % 40), meritRank: i + 1, accessTokenHash: `seed-${i}-${r.int(100000, 999999)}`, studentId: st.id, submittedAt: at(addDays('2026-04-15', i), '11:00'), category: ['GM', 'OBC', 'GM', 'SC', 'GM', 'ST'][i % 6] }));
  const aRows = await k.ins<{ id: string; studentId: string }>('applications', [...aApps, ...Array.from({ length: 8 }, (_, i) => ({ cycleId: cycleA.id, applicationNo: `BBA26-${String(40 + i).padStart(4, '0')}`, applicantName: person().name, dateOfBirth: '2008-05-14', gender: 'female', phone: phone(), guardianName: 'Parent', guardianPhone: phone(), answers: J({ marks_12th: 48 + i * 3, stream: 'Commerce', board: 'CBSE' }), status: ['declined', 'rejected', 'withdrawn', 'ineligible', 'declined', 'waitlisted', 'rejected', 'withdrawn'][i], feeStatus: 'paid', accessTokenHash: `seed-x-${i}`, submittedAt: at(addDays('2026-05-01', i), '10:00'), category: 'GM' }))]);
  for (const a of aRows.slice(0, bbaSem1.students.length)) await k.q('update students set application_id = $2 where id = $1', [a.studentId, a.id]);
  await k.ins('merit_lists', { cycleId: cycleA.id, version: 1, seats: 60, entries: J(aRows.slice(0, 30).map((a, i) => ({ applicationId: a.id, rank: i + 1, score: 95 - i, decision: 'offer' }))), generatedBy: officer, publishedAt: at('2026-07-01', '10:00') }, { returning: false });
  await k.ins('application_payments', aRows.slice(0, 30).map((a, i) => ({ applicationId: a.id, amountPaise: rupees(500), method: i % 2 ? 'upi' : 'cash', status: 'paid', reference: i % 2 ? `UPI ${5200 + i}` : null, receiptNo: `APP/2026-27/${String(i + 1).padStart(4, '0')}`, recordedBy: officer, paidAt: at(addDays('2026-04-15', i), '11:15') })), { returning: false });

  // Next year's first-semester classes, where the admitted students will join.
  await k.ins('sections', ['BBA', 'BCA', 'MBA'].map((code) => ({ programId: prog(code), academicYearId: c.years.next, term: 1, name: 'A', displayName: `${c.programs[code].def.name} Sem 1 A (2027-28)` })), { returning: false });

  // Cycle B: BBA 2027-28 early round, open, with an entrance test and a published merit list.
  const cycleB = await withTenant(c.tenantId, (tx) =>
    adm.createCycle(tx, actor, { programId: prog('BBA'), academicYearId: c.years.next, name: 'BBA 2027-28: Early admission round', status: 'draft', entryTerm: 1, seats: 30, opensOn: '2026-09-01', closesOn: addDays(c.today, 25), applicationFeePaise: rupees(500), offerValidDays: 10, formFields: FORM, documents: DOCS, eligibility: { minimums: [{ field: 'marks_12th', min: 50 }] }, meritRules: [{ field: 'marks_12th', weight: 0.6 }, { field: 'entrance_score', weight: 0.4 }] }),
  );
  await withTenant(c.tenantId, async (tx) => {
    await adm.setCycleStatus(tx, actor, cycleB.id, 'open');
    await adm.setQuotas(tx, actor, cycleB.id, [{ category: 'SC', reservedSeats: 4 }, { category: 'ST', reservedSeats: 2 }, { category: 'OBC', reservedSeats: 6 }]);
  });
  const cats = ['GM', 'GM', 'OBC', 'GM', 'SC', 'OBC', 'GM', 'ST', 'GM', 'OBC'];
  const bApps = Array.from({ length: 40 }, (_, i) => {
    const p = person();
    return { cycleId: cycleB.id, applicationNo: `BBA27-${String(i + 1).padStart(4, '0')}`, applicantName: p.name, dateOfBirth: `2009-0${(i % 9) + 1}-0${(i % 8) + 1}`, gender: p.female ? 'female' : 'male', phone: phone(), email: `${p.name.toLowerCase().replace(/[^a-z]+/g, '.')}@applicants.demo.kinetix.in`, guardianName: `${r.pick(MALE)} ${p.name.split(' ')[1]}`, guardianPhone: phone(), guardianRelation: 'father', answers: J({ marks_12th: Math.min(98, Math.max(46, Math.round(r.gauss(72, 12)))), stream: r.pick(['Commerce', 'Commerce', 'Science', 'Arts']), board: r.pick(['Karnataka PUC Board', 'Karnataka PUC Board', 'CBSE', 'ICSE']) }), status: i < 4 ? 'submitted' : 'under_review', feeStatus: 'paid', accessTokenHash: `seed-b-${i}-${r.int(100000, 999999)}`, submittedAt: at(addDays('2026-09-02', i), '10:30'), category: cats[i % cats.length] };
  });
  const bRows = await k.ins<{ id: string; status: string }>('applications', bApps);
  await k.ins('application_payments', bRows.map((a, i) => ({ applicationId: a.id, amountPaise: rupees(500), method: ['upi', 'upi', 'cash', 'bank_transfer'][i % 4], status: 'paid', reference: `UPI ${6100 + i}`, receiptNo: `APP/2026-27/${String(31 + i).padStart(4, '0')}`, recordedBy: officer, paidAt: at(addDays('2026-09-02', i), '10:45') })), { returning: false });
  await k.ins('application_documents', bRows.flatMap((a, i) => ['marksheet', 'id_proof'].map((docKey) => ({ applicationId: a.id, docKey, fileName: `${docKey}-${i + 1}.pdf`, contentType: 'application/pdf', sizeBytes: 180000 + i * 900, storageKey: `seed/admissions/${a.id}/${docKey}.pdf`, status: i < 4 ? 'pending' : i === 11 && docKey === 'id_proof' ? 'rejected' : 'verified', reviewNote: i === 11 && docKey === 'id_proof' ? 'Photo is not readable. Upload again.' : null, uploadedAt: at(addDays('2026-09-02', i), '10:40') }))), { returning: false });
  // Entrance test: two halls, scores for everyone who sat.
  const test = await k.one<{ id: string }>('entrance_tests', { cycleId: cycleB.id, name: 'Soundarya Aptitude Test (BBA 2027)', testDate: addDays(c.today, -3), startsAt: '10:00', durationMinutes: 90, maxScore: 100, passScore: 35, venue: 'Examination Hall, Soundarya Nagar Campus', createdBy: officer });
  const halls = await k.ins<{ id: string }>('entrance_halls', [{ testId: test.id, name: 'Hall A', capacity: 25 }, { testId: test.id, name: 'Hall B', capacity: 25 }]);
  const sitting = bRows.filter((a) => a.status === 'under_review');
  await k.ins('entrance_seats', sitting.map((a, i) => ({ testId: test.id, hallId: halls[i < 25 ? 0 : 1].id, applicationId: a.id, seatNo: (i % 25) + 1, score: i % 13 === 5 ? null : Math.round(r.gauss(58, 17)), absent: i % 13 === 5, scoredBy: officer, scoredAt: at(addDays(c.today, -2), '16:00') })), { returning: false });
  await k.q('update entrance_seats set score = least(100, greatest(8, score)) where test_id = $1', [test.id]);

  // Run the module: eligibility, merit list, offers.
  await withTenant(c.tenantId, async (tx) => {
    await adm.evaluate(tx, actor, cycleB.id);
    const list = await adm.generateMeritList(tx, actor, cycleB.id);
    await adm.publishMeritList(tx, actor, list.id);
  });
  const offered = await k.q<{ id: string }>("select id from applications where cycle_id = $1 and status = 'offered' order by merit_rank", [cycleB.id]);
  await withTenant(c.tenantId, async (tx) => {
    for (const a of offered.slice(0, 5)) await adm.setStatus(tx, actor, a.id, 'accepted', 'Accepted the offer and paid the seat deposit').catch(() => undefined);
    for (const a of offered.slice(5, 7)) await adm.setStatus(tx, actor, a.id, 'declined', 'Joined another college').catch(() => undefined);
  });

  // Cycle C and D: BCA (open, fresh applications) and MBA (draft).
  const cycleC = await withTenant(c.tenantId, (tx) => adm.createCycle(tx, actor, { programId: prog('BCA'), academicYearId: c.years.next, name: 'BCA 2027-28: Early admission round', status: 'draft', entryTerm: 1, seats: 28, opensOn: '2026-09-15', closesOn: addDays(c.today, 40), applicationFeePaise: rupees(500), offerValidDays: 10, formFields: FORM, documents: DOCS, eligibility: { minimums: [{ field: 'marks_12th', min: 50 }] }, meritRules: [{ field: 'marks_12th', weight: 1 }] }));
  await withTenant(c.tenantId, (tx) => adm.setCycleStatus(tx, actor, cycleC.id, 'open'));
  await k.ins('applications', Array.from({ length: 12 }, (_, i) => { const p = person(); return { cycleId: cycleC.id, applicationNo: `BCA27-${String(i + 1).padStart(4, '0')}`, applicantName: p.name, dateOfBirth: '2009-02-11', gender: p.female ? 'female' : 'male', phone: phone(), guardianName: 'Parent', guardianPhone: phone(), answers: J({ marks_12th: 52 + i * 3, stream: 'Science', board: 'Karnataka PUC Board' }), status: i < 8 ? 'submitted' : 'under_review', feeStatus: i % 3 ? 'paid' : 'pending', accessTokenHash: `seed-c-${i}`, submittedAt: at(addDays(c.today, -i), '09:30'), category: 'GM' }; }), { returning: false });
  await withTenant(c.tenantId, (tx) => adm.createCycle(tx, actor, { programId: prog('MBA'), academicYearId: c.years.next, name: 'MBA 2027-28 (KMAT / PGCET)', status: 'draft', entryTerm: 1, seats: 36, opensOn: '2027-01-10', closesOn: '2027-06-30', applicationFeePaise: rupees(1000), offerValidDays: 7, formFields: FORM, documents: DOCS, eligibility: {}, meritRules: [{ field: 'marks_12th', weight: 1 }] }));

  // Link two enquiries to applications so the funnel shows conversion.
  const bFirst = bRows.slice(4, 6);
  for (const [i, a] of bFirst.entries()) await k.q("update enquiries set stage = 'applied', application_id = $2 where id = $1", [enquiryIds[i * 10 + 6], a.id]);
}
