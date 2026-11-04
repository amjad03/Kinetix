/**
 * The research pass on the demo college: researcher identifiers for the research-active faculty (some verified), two
 * recognised research centres, five years of publications with indexing, quartiles, impact factors and citations (one
 * retracted, one waiting for the DOI registry), patents through to a licensed grant, four funded projects with budget
 * heads, instalments, expenses by head and utilisation certificates, consultancy and corporate training, MoUs with
 * activities, seed money, awards and fellowships, ethics approvals (one running out), funding calls (one closing in a
 * fortnight), central instruments with bookings, seminars organised on IPR and research methodology, an incentive
 * scheme with claims in every state, and Ph.D. scholars with registration detail, coursework, doctoral committee
 * meetings and six-monthly progress reports, so every research screen and report shows figures.
 */
import type { Ctx, UserRef } from './ctx.js';
import { addDays, J, rupees } from './kit.js';

/** An ORCID iD with a valid ISO 7064 mod 11-2 check digit from the 15 digits given. */
function orcid(base15: string): string {
  let total = 0;
  for (const ch of base15) total = (total + Number(ch)) * 2;
  const r = (12 - (total % 11)) % 11;
  const d = base15 + (r === 10 ? 'X' : String(r));
  return `${d.slice(0, 4)}-${d.slice(4, 8)}-${d.slice(8, 12)}-${d.slice(12)}`;
}

export async function researchPass(c: Ctx): Promise<void> {
  const k = c.kit;
  const d = (n: number) => addDays(c.today, n);
  const who = (email: string, i: number): UserRef => c.byEmail[email] ?? c.teachers[i % c.teachers.length];
  const coord = c.byEmail.research ?? c.byEmail.principal;
  const kav = who('hod.commerce', 0);
  const rag = who('hod.management', 1);
  const sri = who('hod.computers', 2);
  const sud = who('sudhir.kamath', 3);
  const lat = who('latha.gowda', 4);
  const har = who('harini.acharya', 5);
  const dee = who('deepa.nair', 6);
  const sha = who('shalini.desai', 7);
  const sow = who('sowmya.reddy', 8);
  const arv = who('arvind.shetty', 9);
  const dept = c.departments;
  const A = (...us: (UserRef | string)[]) => J(us.map((u) => (typeof u === 'string' ? { name: u } : { name: u.name, userId: u.id })));

  // ---- researcher identifiers -------------------------------------------------------------------
  const ids: [UserRef, string, string | null, string | null, string | null, string | null, number | null, number | null, boolean, string][] = [
    [kav, '000000021825009', '57201234567', 'AAB-1234-2019', 'qc6CJjYAAAAJ', '102345', 9, 112, true, 'Rural finance; digital payments; MSME credit'],
    [rag, '000000034471120', '57189012345', 'ABC-5521-2018', 'Rk8yPq2AAAAJ', '102346', 7, 86, true, 'Human resources; start-up talent'],
    [sri, '000000017755301', '56988123456', 'AAD-9087-2020', 'Xy7Lm3sAAAAJ', '102347', 6, 64, true, 'Computer vision; low-code systems'],
    [sud, '000000029983412', '57322198765', null, 'Lm9kQw1AAAAJ', '102348', 4, 31, false, 'Management accounting'],
    [lat, '000000046612005', null, null, 'Tq2pZx8AAAAJ', '102349', 3, 22, true, 'Financial literacy'],
    [har, '000000038894417', null, null, null, '102350', 2, 9, false, 'Taxation; GST'],
    [sha, '000000052231096', '58011223344', null, 'Gh5tRe4AAAAJ', null, 3, 18, false, 'Marketing; consumer behaviour'],
    [sow, '000000027709843', '57655443322', 'AAF-3321-2021', 'Pz4wNm6AAAAJ', '102351', 5, 47, true, 'Machine learning in education'],
  ];
  await k.ins(
    'research_profiles',
    ids.map(([u, o, sc, wos, gs, vid, h, cites, verified, areas], i) => ({ userId: u.id, orcid: orcid(o), scopusAuthorId: sc, wosResearcherId: wos, googleScholarId: gs, vidwanId: vid, irinsUrl: vid ? `https://soundarya.irins.org/profile/${vid}` : null, areas, scopusHIndex: sc ? h : null, wosHIndex: wos ? Math.max(1, (h ?? 2) - 2) : null, scholarHIndex: gs ? (h ?? 0) + 2 : null, scholarCitations: gs ? Math.round((cites ?? 0) * 1.6) : null, metricsOn: d(-20 - i), verifiedBy: verified ? coord.id : null, verifiedAt: verified ? new Date(`${d(-15 - i)}T10:00:00+05:30`) : null })),
    { returning: false },
  );

  // ---- research centres -------------------------------------------------------------------------
  const centres = await k.ins<{ id: string }>('research_centres', [
    { code: 'RC-COM', name: 'Research Centre in Commerce and Finance', departmentId: dept['Commerce'], headUserId: kav.id, recognisedBy: 'Bengaluru City University', recognitionRef: 'BCU/RC/2022/07', recognisedOn: '2022-07-01', validUntil: '2027-06-30', areas: 'Rural finance; taxation; financial literacy', facilities: 'Research lab with 12 workstations, SPSS and R, e-journal access (J-Gate, EBSCO)', sortOrder: 1 },
    { code: 'RC-MGT', name: 'Research Centre in Management Studies', departmentId: dept['Management Studies'], headUserId: rag.id, recognisedBy: 'Bengaluru City University', recognitionRef: 'BCU/RC/2021/11', recognisedOn: '2021-12-01', validUntil: d(55), areas: 'HR; marketing; entrepreneurship', facilities: 'Seminar room, case library, survey tablets', sortOrder: 2 },
  ]);
  await k.q("update research_projects set centre_id = $2 where tenant_id = $1 and department_id = $3", [c.tenantId, centres[0].id, dept['Commerce']]);
  await k.q("update research_projects set centre_id = $2 where tenant_id = $1 and department_id = $3", [c.tenantId, centres[1].id, dept['Management Studies']]);

  // ---- publications over five years -------------------------------------------------------------
  type P = { t: string; kind?: string; v: string; y: number; a: (UserRef | string)[]; idx?: string[]; q?: string; cites?: number; ifac?: number; doi?: string; isbn?: string; care?: string; status?: string };
  const pubs: P[] = [
    { t: 'UPI adoption among kirana stores in North Bengaluru', v: 'Journal of Rural Development', y: 2026, a: [kav, lat, 'R. Narayan'], idx: ['scopus', 'ugc_care'], q: 'Q2', cites: 4, ifac: 1.42, doi: '10.5555/jrd.2026.0311' },
    { t: 'Credit scoring for micro retailers using transaction data', v: 'International Journal of Bank Marketing', y: 2026, a: [kav, sri], idx: ['scopus', 'wos'], q: 'Q1', cites: 3, ifac: 4.1, doi: '10.5555/ijbm.2026.0117' },
    { t: 'Face matching attendance with low-cost hardware', v: 'Multimedia Tools and Applications', y: 2026, a: [sri, sow, 'F. Ahmed'], idx: ['scopus', 'wos'], q: 'Q2', cites: 2, ifac: 3.6, doi: '10.5555/mtap.2026.2044' },
    { t: 'Retention of engineers in Bengaluru start-ups', v: 'Management Research Review', y: 2026, a: [rag, sha], idx: ['scopus'], q: 'Q2', cites: 1, ifac: 2.9, doi: '10.5555/mrr.2026.0098' },
    { t: 'GST compliance cost of micro enterprises: a field study', v: 'Indian Journal of Finance', y: 2025, a: [har, kav], idx: ['ugc_care'], care: 'II', cites: 6, doi: '10.5555/ijf.2025.0712' },
    { t: 'Machine learning for early warning of course drop-out', v: 'Education and Information Technologies', y: 2025, a: [sow, sri], idx: ['scopus', 'wos'], q: 'Q1', cites: 11, ifac: 5.5, doi: '10.5555/eait.2025.1188' },
    { t: 'Financial literacy and first-generation learners', v: 'Journal of Commerce and Accounting Research', y: 2025, a: [lat, kav], idx: ['ugc_care'], care: 'I', cites: 5 },
    { t: 'Brand loyalty and sustainable packaging', v: 'Journal of Marketing Theory', y: 2025, a: [sha, dee], idx: ['scopus'], q: 'Q3', cites: 3, ifac: 1.1, doi: '10.5555/jmt.2025.0410' },
    { t: 'Managerial accounting for small business', kind: 'book', v: 'Sapna Book House', y: 2025, a: [sud], isbn: '978-93-5555-012-4' },
    { t: 'Digital payments in rural Karnataka', kind: 'book_chapter', v: 'Finance for Bharat (Springer)', y: 2025, a: [kav, lat], idx: ['scopus'], isbn: '978-981-55-1234-5', cites: 2 },
    { t: 'Low-code platforms for MSME stock control', kind: 'conference', v: 'ICCA 2025, Bengaluru (IEEE)', y: 2025, a: [sri, arv], idx: ['scopus'], cites: 4, doi: '10.5555/icca.2025.88' },
    { t: 'Women entrepreneurs and microfinance in Tumakuru', v: 'Journal of Entrepreneurship', y: 2024, a: [rag, 'P. Shastri'], idx: ['scopus', 'ugc_care'], q: 'Q2', cites: 14, ifac: 2.2, doi: '10.5555/joe.2024.0207' },
    { t: 'Chatbots in student support services', v: 'Interactive Learning Environments', y: 2024, a: [sri, sow], idx: ['scopus', 'wos'], q: 'Q1', cites: 21, ifac: 5.4, doi: '10.5555/ile.2024.0730' },
    { t: 'Working capital practices of cooperative banks', v: 'Indian Journal of Accounting', y: 2024, a: [sud, har], idx: ['ugc_care'], care: 'II', cites: 7 },
    { t: 'Employer branding on campus', v: 'Vision: The Journal of Business Perspective', y: 2024, a: [rag, dee], idx: ['scopus'], q: 'Q3', cites: 9, ifac: 1.3, doi: '10.5555/vis.2024.0055' },
    { t: 'Rural credit after demonetisation', v: 'Economic and Political Weekly', y: 2023, a: [kav], idx: ['scopus', 'ugc_care'], q: 'Q3', cites: 18, doi: '10.5555/epw.2023.4471' },
    { t: 'Deep learning for handwriting recognition in Kannada', v: 'Pattern Recognition Letters', y: 2023, a: [sri, sow, 'M. Rao'], idx: ['scopus', 'wos'], q: 'Q2', cites: 27, ifac: 3.9, doi: '10.5555/prl.2023.1102' },
    { t: 'Consumer trust in online grocery', v: 'Journal of Retailing and Consumer Services', y: 2023, a: [sha], idx: ['scopus', 'wos'], q: 'Q1', cites: 16, ifac: 10.4, doi: '10.5555/jrcs.2023.0901' },
    { t: 'Accounting education after NEP 2020', v: 'Journal of Commerce Education', y: 2023, a: [lat, sud], idx: ['ugc_care'], care: 'I', cites: 4 },
    { t: 'Talent analytics in Indian IT', v: 'Personnel Review', y: 2022, a: [rag], idx: ['scopus', 'wos'], q: 'Q1', cites: 31, ifac: 3.7, doi: '10.5555/pr.2022.0333' },
    { t: 'Rule mining for library circulation', kind: 'conference', v: 'NCETCS 2022, Mysuru', y: 2022, a: [sow], cites: 3 },
    { t: 'Tax morale of small traders', v: 'Journal of Indian Taxation', y: 2022, a: [har], idx: ['ugc_care'], care: 'II', cites: 5 },
    { t: 'Microfinance repayment and joint liability', v: 'Journal of Rural Studies', y: 2022, a: [kav, 'S. Iyer'], idx: ['scopus', 'wos'], q: 'Q1', cites: 24, ifac: 5.1, doi: '10.5555/jrs.2022.0614' },
    { t: 'Survey of cloud adoption by colleges (withdrawn)', v: 'Journal of Educational Computing', y: 2024, a: [arv], idx: ['scopus'], q: 'Q3', cites: 0, doi: '10.5555/jec.2024.0919', status: 'retracted' },
  ];
  const rows = await k.ins<{ id: string; title: string; ownerUserId: string }>(
    'publications',
    pubs.map((p) => {
      const owner = p.a.find((x): x is UserRef => typeof x !== 'string')!;
      return { ownerUserId: owner.id, departmentId: owner.dept ? dept[owner.dept] : null, title: p.t, kind: p.kind ?? 'journal', venue: p.v, year: p.y, doi: p.doi ?? null, isbn: p.isbn ?? null, indexedIn: p.idx ?? [], quartile: p.q ?? null, impactFactor: p.ifac ?? null, citations: p.cites ?? 0, ugcCareGroup: p.care ?? null, authors: A(...p.a), status: p.status ?? 'published', retractedOn: p.status === 'retracted' ? '2025-11-12' : null, retractionNote: p.status === 'retracted' ? 'Withdrawn by the authors: the survey sample was duplicated.' : null, metadataSource: p.doi ? 'crossref' : 'manual', volume: String(10 + (p.y % 7)), issue: String((p.y % 4) + 1), pages: `${100 + p.t.length}-${112 + p.t.length}` };
    }),
  );
  await k.one('publications', { ownerUserId: sow.id, departmentId: dept['Computer Applications'], title: 'Adaptive quizzes and learning gains (details awaited from the DOI registry)', kind: 'journal', venue: 'Awaiting registry', year: 2026, doi: '10.5555/awaiting.2026.0042', authors: A(sow), metadataSource: 'pending' });

  // ---- IPR -------------------------------------------------------------------------------------
  await k.ins('patents', [
    { ownerUserId: kav.id, departmentId: dept['Commerce'], title: 'System for offline UPI settlement for small merchants', kind: 'patent', inventors: A(kav, lat), applicationNo: '202541018822', filedOn: '2025-03-14', status: 'published', publishedOn: '2025-09-19' },
    { ownerUserId: sri.id, departmentId: dept['Computer Applications'], title: 'Low-power face matching device for classrooms', kind: 'patent', inventors: A(sri, sow), applicationNo: '202341055123', filedOn: '2023-08-02', status: 'granted', publishedOn: '2024-02-09', grantedOn: '2026-01-21', patentNo: 'IN 512345', licensed: true, licenceRevenuePaise: rupees(150000) },
    { ownerUserId: sow.id, departmentId: dept['Computer Applications'], title: 'Kannada handwriting dataset and tools', kind: 'copyright', inventors: A(sow), applicationNo: 'SW-18822/2025', filedOn: '2025-06-10', status: 'granted', grantedOn: '2025-10-30', patentNo: 'SW-18822/2025-CO' },
    { ownerUserId: sha.id, departmentId: dept['Management Studies'], title: 'Eco-pack brand mark for the student incubator', kind: 'trademark', inventors: A(sha), applicationNo: 'TM-6123456', filedOn: '2026-05-04', status: 'filed' },
  ], { returning: false });

  // ---- funded projects: grants, heads, releases, expenses, UCs ----------------------------------
  const proj = await k.ins<{ id: string }>('research_projects', [
    { code: 'SIMS-RP-2025-11', title: 'Early warning of course drop-out with learning analytics', kind: 'research', piUserId: sow.id, departmentId: dept['Computer Applications'], sponsorOrg: 'AICTE', startsOn: '2025-09-01', endsOn: '2027-08-31', status: 'active', version: 1 },
    { code: 'SIMS-RP-2024-04', title: 'Women-led micro enterprises and credit access', kind: 'research', piUserId: rag.id, departmentId: dept['Management Studies'], sponsorOrg: 'ANRF (SERB)', startsOn: '2024-04-01', endsOn: '2027-03-31', status: 'active', centreId: centres[1].id, version: 1 },
    { code: 'SIMS-RP-2026-05', title: 'Cashflow analytics for cooperative banks', kind: 'industry', piUserId: kav.id, departmentId: dept['Commerce'], sponsorOrg: 'Infosys Foundation', startsOn: '2026-06-01', endsOn: '2027-05-31', status: 'active', centreId: centres[0].id, version: 1 },
  ]);
  await k.ins('project_members', [{ projectId: proj[0].id, userId: sri.id, role: 'co_supervisor' }, { projectId: proj[1].id, userId: sha.id, role: 'co_supervisor' }, { projectId: proj[2].id, userId: sud.id, role: 'member' }], { returning: false });
  const grants = await k.ins<{ id: string }>('research_grants', [
    { projectId: proj[0].id, agency: 'AICTE', scheme: 'Research Promotion Scheme', sanctionRef: 'AICTE/RPS/2025/0418', sanctionedPaise: rupees(1500000), startsOn: '2025-09-01', endsOn: '2027-08-31', status: 'active', agencyKind: 'government', overheadPct: 10 },
    { projectId: proj[1].id, agency: 'ANRF (SERB)', scheme: 'Core Research Grant', sanctionRef: 'CRG/2024/003311', sanctionedPaise: rupees(2400000), startsOn: '2024-04-01', endsOn: '2027-03-31', status: 'active', agencyKind: 'government', overheadPct: 8 },
    { projectId: proj[2].id, agency: 'Infosys Foundation', scheme: 'Industry research grant', sanctionRef: 'INF/CSR/2026/12', sanctionedPaise: rupees(800000), startsOn: '2026-06-01', endsOn: '2027-05-31', status: 'active', agencyKind: 'industry', overheadPct: 15 },
  ]);
  await k.q("update research_grants set agency_kind = 'government', overhead_pct = 5 where tenant_id = $1 and agency = 'ICSSR'", [c.tenantId]);
  const heads: [number, string, number][] = [
    [0, 'manpower', 600000], [0, 'equipment', 450000], [0, 'consumables', 150000], [0, 'travel', 100000], [0, 'contingency', 50000], [0, 'overhead', 150000],
    [1, 'manpower', 1200000], [1, 'equipment', 500000], [1, 'travel', 250000], [1, 'contingency', 150000], [1, 'overhead', 192000],
    [2, 'manpower', 450000], [2, 'consumables', 120000], [2, 'travel', 80000], [2, 'overhead', 120000],
  ];
  await k.ins('research_grant_heads', heads.map(([g, head, amt]) => ({ grantId: grants[g].id, head, sanctionedPaise: rupees(amt) })), { returning: false });
  await k.ins('research_grant_releases', [
    { grantId: grants[0].id, instalment: 1, releasedOn: '2025-09-20', receivedOn: '2025-09-26', amountPaise: rupees(900000), reference: 'AICTE/REL/2025/1188', createdBy: coord.id },
    { grantId: grants[0].id, instalment: 2, releasedOn: d(-40), receivedOn: d(-35), amountPaise: rupees(400000), reference: 'AICTE/REL/2026/0207', createdBy: coord.id },
    { grantId: grants[1].id, instalment: 1, releasedOn: '2024-05-10', receivedOn: '2024-05-17', amountPaise: rupees(1000000), reference: 'SERB/REL/2024/771', createdBy: coord.id },
    { grantId: grants[1].id, instalment: 2, releasedOn: '2025-06-02', receivedOn: '2025-06-09', amountPaise: rupees(800000), reference: 'SERB/REL/2025/912', createdBy: coord.id },
    { grantId: grants[2].id, instalment: 1, releasedOn: '2026-06-05', receivedOn: '2026-06-08', amountPaise: rupees(400000), reference: 'INF/NEFT/26/0441', createdBy: coord.id },
  ], { returning: false });
  const exp: [number, string, string, number, string][] = [
    [0, 'equipment', 'GPU workstation', 380000, '2025-10-15'], [0, 'manpower', 'Junior research fellow, October to March', 186000, '2026-03-31'], [0, 'consumables', 'Survey licences and cloud credits', 42000, '2026-01-12'], [0, 'travel', 'Data collection visits to 6 colleges', 31000, '2026-02-20'], [0, 'manpower', 'Junior research fellow, April to September', 186000, d(-10)],
    [1, 'manpower', 'Project associate, 2024-25', 420000, '2025-03-31'], [1, 'equipment', 'Survey tablets (15)', 225000, '2024-07-08'], [1, 'travel', 'Field work in Tumakuru district', 96000, '2024-11-18'], [1, 'manpower', 'Project associate, 2025-26', 432000, '2026-03-31'], [1, 'contingency', 'Printing and translation', 38000, '2025-08-14'],
    [2, 'manpower', 'Data analyst, June to October', 160000, d(-5)], [2, 'consumables', 'Database licence', 45000, '2026-07-02'],
  ];
  await k.ins('grant_expenses', exp.map(([g, budgetHead, desc, amt, on], i) => ({ grantId: grants[g].id, head: desc.split(',')[0], budgetHead, amountPaise: rupees(amt), spentOn: on, description: desc, voucherRef: `RV-${on.slice(0, 4)}-${200 + i}`, createdBy: coord.id })), { returning: false });
  await k.ins('grant_utilisation_certificates', [
    { grantId: grants[1].id, periodFrom: '2024-04-01', periodTo: '2025-03-31', utilisedPaise: rupees(741000), submittedOn: '2025-04-28', reference: 'SIMS/UC/2024-25/03', status: 'accepted' },
    { grantId: grants[0].id, periodFrom: '2025-09-01', periodTo: '2026-03-31', utilisedPaise: rupees(639000), submittedOn: '2026-04-22', reference: 'SIMS/UC/2025-26/01', status: 'accepted' },
    { grantId: grants[1].id, periodFrom: '2025-04-01', periodTo: '2026-03-31', utilisedPaise: rupees(470000), submittedOn: '2026-04-30', reference: 'SIMS/UC/2025-26/02', status: 'returned', note: 'SERB asked for the audited statement of expenditure with the UC.' },
    { grantId: grants[0].id, periodFrom: '2026-04-01', periodTo: '2027-03-31', utilisedPaise: 0, status: 'draft' },
  ], { returning: false });

  // ---- consultancy, MoUs, seed money, recognitions ---------------------------------------------
  await k.ins('research_consultancies', [
    { title: 'GST health check for 40 traders', client: 'Yeshwanthpur Traders Association', clientContact: 'Secretary, 080-2337 1100', kind: 'consultancy', leadUserId: har.id, departmentId: dept['Commerce'], startsOn: '2025-07-01', endsOn: '2025-09-30', contractPaise: rupees(240000), receivedPaise: rupees(240000), institutionSharePct: 40, agreementRef: 'SIMS/CON/2025/04', status: 'completed', createdBy: coord.id },
    { title: 'Inventory app evaluation', client: 'Peenya Industries Association', kind: 'testing', leadUserId: sri.id, departmentId: dept['Computer Applications'], startsOn: '2026-01-10', endsOn: '2026-03-31', contractPaise: rupees(180000), receivedPaise: rupees(180000), institutionSharePct: 50, agreementRef: 'SIMS/CON/2026/01', status: 'completed', createdBy: coord.id },
    { title: 'Leadership programme for branch managers', client: 'Karnataka Gramin Bank', kind: 'corporate_training', leadUserId: rag.id, departmentId: dept['Management Studies'], startsOn: '2025-11-17', endsOn: '2025-11-21', contractPaise: rupees(350000), receivedPaise: rupees(350000), institutionSharePct: 60, trainees: 42, agreementRef: 'SIMS/CT/2025/02', status: 'completed', createdBy: coord.id },
    { title: 'Customer survey for a dairy cooperative', client: 'Bengaluru Milk Union', kind: 'consultancy', leadUserId: sha.id, departmentId: dept['Management Studies'], startsOn: d(-30), endsOn: d(60), contractPaise: rupees(300000), receivedPaise: rupees(120000), institutionSharePct: 40, agreementRef: 'SIMS/CON/2026/07', status: 'active', createdBy: coord.id },
    { title: 'Tally and GST workshop for staff', client: 'Sri Ganesh Textiles', kind: 'corporate_training', leadUserId: sud.id, departmentId: dept['Commerce'], startsOn: '2024-10-07', endsOn: '2024-10-09', contractPaise: rupees(90000), receivedPaise: rupees(90000), institutionSharePct: 50, trainees: 25, status: 'completed', createdBy: coord.id },
  ], { returning: false });
  const mous = await k.ins<{ id: string }>('research_mous', [
    { partner: 'Infosys Ltd (Mysuru campus)', partnerKind: 'industry', purpose: 'Internships, faculty training and joint projects', signedOn: '2024-08-01', validUntil: '2027-07-31', coordinatorUserId: sri.id, departmentId: dept['Computer Applications'], status: 'active' },
    { partner: 'Indian Institute of Science, Centre for Society and Policy', partnerKind: 'academic', purpose: 'Joint research on rural finance, shared seminars', signedOn: '2023-11-15', validUntil: d(70), coordinatorUserId: kav.id, departmentId: dept['Commerce'], status: 'active' },
    { partner: 'NABARD Karnataka Regional Office', partnerKind: 'government', purpose: 'Field studies and student projects on rural credit', signedOn: '2025-02-10', validUntil: '2028-02-09', coordinatorUserId: kav.id, departmentId: dept['Commerce'], status: 'active' },
    { partner: 'University of Malaya, Faculty of Business', partnerKind: 'international', country: 'Malaysia', purpose: 'Faculty exchange and co-authored papers', signedOn: '2025-09-01', validUntil: '2030-08-31', coordinatorUserId: rag.id, departmentId: dept['Management Studies'], status: 'active' },
  ]);
  await k.ins('research_mou_activities', [
    { mouId: mous[0].id, title: 'Infosys campus connect faculty workshop', kind: 'training', heldOn: '2025-12-04', participants: 24 },
    { mouId: mous[0].id, title: 'Summer internships for BCA students', kind: 'internship', heldOn: '2026-06-15', participants: 18 },
    { mouId: mous[1].id, title: 'Joint seminar on financial inclusion', kind: 'seminar', heldOn: '2025-08-22', participants: 120 },
    { mouId: mous[2].id, title: 'Village credit field study', kind: 'project', heldOn: '2026-01-20', participants: 30 },
    { mouId: mous[3].id, title: 'Visiting lecture by Dr. Tan Wei Ling', kind: 'lecture', heldOn: '2026-02-26', participants: 85 },
  ], { returning: false });
  await k.ins('research_seed_grants', [
    { title: 'Pilot survey on UPI fraud among street vendors', applicantUserId: lat.id, departmentId: dept['Commerce'], requestedPaise: rupees(75000), sanctionedPaise: rupees(60000), sanctionedOn: '2025-07-15', durationMonths: 12, utilisedPaise: rupees(58200), reportSubmittedOn: '2026-07-20', outcome: 'One paper under review; proposal to ICSSR', status: 'completed' },
    { title: 'Prototype of a Kannada reading tutor', applicantUserId: sow.id, departmentId: dept['Computer Applications'], requestedPaise: rupees(100000), sanctionedPaise: rupees(100000), sanctionedOn: '2026-02-01', durationMonths: 12, utilisedPaise: rupees(41000), status: 'sanctioned' },
    { title: 'Case studies of women-led start-ups', applicantUserId: dee.id, departmentId: dept['Management Studies'], requestedPaise: rupees(50000), sanctionedPaise: rupees(50000), sanctionedOn: '2024-08-10', durationMonths: 10, utilisedPaise: rupees(50000), reportSubmittedOn: '2025-06-30', outcome: 'Book chapter accepted', status: 'completed' },
    { title: 'Tax awareness app for students', applicantUserId: har.id, departmentId: dept['Commerce'], requestedPaise: rupees(80000), status: 'applied' },
  ], { returning: false });
  await k.ins('research_recognitions', [
    { userId: kav.id, kind: 'award', title: 'Best Researcher Award', body: 'Bengaluru City University', level: 'state', receivedOn: '2025-09-05' },
    { userId: sri.id, kind: 'award', title: 'IEEE Bangalore Section Outstanding Paper', body: 'IEEE', level: 'national', receivedOn: '2026-03-12' },
    { userId: sow.id, kind: 'fellowship', title: 'Visiting fellowship, IIIT Bangalore', body: 'IIIT Bangalore', level: 'national', receivedOn: '2025-12-01', validUntil: '2026-05-31', amountPaise: rupees(120000) },
    { userId: rag.id, kind: 'editorial', title: 'Associate editor, Management Research Review', body: 'Emerald Publishing', level: 'international', receivedOn: '2024-01-01' },
    { userId: sha.id, kind: 'reviewer', title: 'Reviewer, Journal of Retailing and Consumer Services', body: 'Elsevier', level: 'international', receivedOn: '2025-04-01' },
    { userId: lat.id, kind: 'fellowship', title: 'ICSSR short-term doctoral fellowship (mentor)', body: 'ICSSR', level: 'national', receivedOn: '2024-09-01', amountPaise: rupees(50000) },
  ], { returning: false });

  // ---- ethics, calls, instruments -------------------------------------------------------------
  await k.ins('research_ethics_approvals', [
    { committee: 'iec', protocolNo: 'SIMS/IEC/2025/03', title: 'Survey of financial stress among first-generation students', piUserId: lat.id, submittedOn: '2025-06-10', approvedOn: '2025-07-01', expiresOn: d(40), status: 'approved', conditions: 'Consent in Kannada and English; no names in the data set' },
    { committee: 'iec', protocolNo: 'SIMS/IEC/2025/07', title: 'Learning analytics on student data', piUserId: sow.id, projectId: proj[0].id, submittedOn: '2025-08-01', approvedOn: '2025-08-25', expiresOn: '2027-08-24', status: 'approved', conditions: 'Pseudonymised identifiers only (DPDP Act 2023)' },
    { committee: 'iec', protocolNo: 'SIMS/IEC/2026/02', title: 'Interviews with women entrepreneurs', piUserId: rag.id, submittedOn: d(-12), status: 'pending' },
  ], { returning: false });
  await k.ins('research_calls', [
    { agency: 'ANRF', scheme: 'Core Research Grant', title: 'CRG call 2026-27', url: 'https://anrfonline.in', opensOn: d(-30), internalDeadline: d(9), deadline: d(25), maxAmountPaise: rupees(6000000), status: 'open' },
    { agency: 'ICSSR', scheme: 'Major Research Project', title: 'ICSSR major projects 2026', opensOn: d(-10), internalDeadline: d(35), deadline: d(50), maxAmountPaise: rupees(2000000), status: 'open' },
    { agency: 'AICTE', scheme: 'Research Promotion Scheme', title: 'AICTE RPS 2026', opensOn: d(-60), internalDeadline: d(-20), deadline: d(-5), maxAmountPaise: rupees(1500000), status: 'closed' },
    { agency: 'DST', scheme: 'Women Scientist Scheme (WOS-A)', title: 'WOS-A rolling call', opensOn: d(-90), deadline: d(120), status: 'open' },
  ], { returning: false });
  const eq = await k.ins<{ id: string; internalRatePaise: number; externalRatePaise: number }>('research_equipment', [
    { code: 'CIF-01', name: 'GPU compute server (2 x A100)', category: 'Computing', location: 'Central Instrumentation Facility, room 204', departmentId: dept['Computer Applications'], custodianUserId: sri.id, makeModel: 'Dell PowerEdge R750xa', purchasedOn: '2025-10-15', costPaise: rupees(1850000), internalRatePaise: rupees(150), externalRatePaise: rupees(900), sortOrder: 1 },
    { code: 'CIF-02', name: 'Eye tracker for consumer studies', category: 'Behavioural lab', location: 'Management research lab', departmentId: dept['Management Studies'], custodianUserId: sha.id, makeModel: 'Tobii Pro Nano', purchasedOn: '2024-12-02', costPaise: rupees(640000), internalRatePaise: rupees(200), externalRatePaise: rupees(1200), sortOrder: 2 },
    { code: 'CIF-03', name: 'Survey tablets (15)', category: 'Field work', location: 'Commerce research lab', departmentId: dept['Commerce'], custodianUserId: kav.id, purchasedOn: '2024-07-08', costPaise: rupees(225000), internalRatePaise: 0, externalRatePaise: rupees(300), sortOrder: 3 },
  ]);
  const book = (e: number, day: number, hours: number, kind: 'internal' | 'external', user: UserRef | null, purpose: string, status: string, ext?: [string, string]) => {
    const start = new Date(`${d(day)}T10:00:00+05:30`);
    const rate = kind === 'internal' ? eq[e].internalRatePaise : eq[e].externalRatePaise;
    return { equipmentId: eq[e].id, userKind: kind, userId: user?.id ?? null, externalName: ext?.[0] ?? null, externalOrg: ext?.[1] ?? null, purpose, startsAt: start, endsAt: new Date(start.getTime() + hours * 3_600_000), ratePaise: rate, amountPaise: Number(rate) * hours, status, invoiceRef: status === 'billed' ? `CIF/INV/${100 - day}` : null, createdBy: coord.id };
  };
  await k.ins('research_equipment_usage', [book(0, -40, 6, 'internal', sow, 'Model training for drop-out prediction', 'completed'), book(0, -21, 8, 'external', null, 'Image classification benchmark', 'billed', ['Dr. N. Suresh', 'RV College of Engineering']), book(0, -3, 4, 'internal', sri, 'Face matching evaluation', 'completed'), book(0, 2, 5, 'internal', sow, 'Hyper-parameter search', 'booked'), book(1, -30, 3, 'internal', sha, 'Packaging attention study', 'completed'), book(1, -12, 2, 'external', null, 'Shelf display study', 'billed', ['Ms. Ritu Jain', 'Namdhari Fresh']), book(2, -50, 24, 'internal', kav, 'Rural credit survey', 'completed')], { returning: false });

  // ---- events organised (NAAC 3.2.2) -----------------------------------------------------------
  await k.ins('conferences', [
    { name: 'Workshop on patent drafting and filing for teachers', role: 'organised', level: 'institutional', heldOn: '2025-11-08', location: 'Soundarya seminar hall', userId: coord.id, eventKind: 'workshop', theme: 'ipr', participants: 64, sponsor: 'KSCST', sponsoredPaise: rupees(40000) },
    { name: 'Research methodology and SPSS: five-day FDP', role: 'organised', level: 'national', heldOn: '2026-01-19', endsOn: '2026-01-23', location: 'Soundarya computer lab', userId: kav.id, eventKind: 'fdp', theme: 'research_methodology', participants: 48 },
    { name: 'Start-up boot camp with the incubation centre', role: 'organised', level: 'institutional', heldOn: '2026-03-07', location: 'Soundarya incubation centre', userId: rag.id, eventKind: 'workshop', theme: 'entrepreneurship', participants: 110 },
    { name: 'National Conference on Fintech for Bharat', role: 'organised', level: 'national', heldOn: '2025-02-14', endsOn: '2025-02-15', location: 'Soundarya auditorium', userId: kav.id, eventKind: 'conference', theme: 'subject', participants: 210, sponsor: 'NABARD', sponsoredPaise: rupees(150000) },
    { name: 'International Conference on Business Analytics', role: 'presented', level: 'international', heldOn: '2026-02-05', location: 'Kuala Lumpur', userId: rag.id, paperTitle: 'Retention of engineers in Bengaluru start-ups' },
  ], { returning: false });

  // ---- incentives -------------------------------------------------------------------------------
  const scheme = await k.one<{ id: string }>('research_incentive_schemes', { name: 'Research publication incentive 2026-27', kind: 'publication', rates: J({ scopus_q1: rupees(25000), scopus_q2: rupees(15000), scopus: rupees(10000), wos: rupees(12000), ugc_care: rupees(5000), book: rupees(10000), book_chapter: rupees(4000) }), capPerYearPaise: rupees(60000), validFrom: '2026-04-01', validUntil: '2027-03-31', active: true, note: 'Full rate to the first author, half to a co-author on the staff. Papers published from 2025 onwards. Paid through payroll after the IQAC check.' });
  await k.one('research_incentive_schemes', { name: 'Patent incentive', kind: 'patent', rates: J({ published: rupees(10000), granted: rupees(50000) }), active: true, note: 'Once a stage, shared equally by the staff inventors.' });
  const byTitle = (t: string) => rows.find((r) => r.title === t)!;
  const claim = (u: UserRef, t: string, basis: string, amount: number, status: string, extra: Record<string, unknown> = {}) => ({ schemeId: scheme.id, userId: u.id, publicationId: byTitle(t).id, basis, amountPaise: rupees(amount), status, decidedBy: status === 'claimed' ? null : coord.id, decidedAt: status === 'claimed' ? null : new Date(`${d(-8)}T11:00:00+05:30`), ...extra });
  await k.ins('research_incentive_claims', [
    claim(kav, 'Credit scoring for micro retailers using transaction data', 'scopus_q1', 25000, 'paid', { paidOn: d(-3), paymentRef: 'PAY/OCT-2026/INC-01' }),
    claim(sri, 'Credit scoring for micro retailers using transaction data', 'scopus_q1 (co-author, 50%)', 12500, 'approved'),
    claim(sri, 'Face matching attendance with low-cost hardware', 'scopus_q2', 15000, 'approved'),
    claim(rag, 'Retention of engineers in Bengaluru start-ups', 'scopus_q2', 15000, 'claimed'),
    claim(kav, 'UPI adoption among kirana stores in North Bengaluru', 'scopus_q2', 15000, 'claimed'),
    claim(har, 'GST compliance cost of micro enterprises: a field study', 'ugc_care', 5000, 'rejected', { decisionNote: 'Published in July 2025, before the scheme year; claim under the 2025-26 scheme.' }),
  ], { returning: false });

  // ---- Ph.D. scholars -------------------------------------------------------------------------
  // The three scholars of the research stage get their registration detail; six more join the centres.
  await k.q(`update research_scholars set registration_no = 'BCU/PHD/2025/031', mode = 'full_time', department_id = $2, centre_id = $3, fellowship = 'jrf', fellowship_agency = 'UGC', entrance = 'net', gender = 'male', category = 'obc', coursework_completed_on = '2025-07-30', synopsis_approved_on = '2025-12-18' where tenant_id = $1 and full_name = 'Ananth Prabhu'`, [c.tenantId, dept['Commerce'], centres[0].id]);
  await k.q(`update research_scholars set registration_no = 'BCU/PHD/2024/012', mode = 'part_time', department_id = $2, centre_id = $3, entrance = 'entrance_test', gender = 'female', category = 'general', coursework_completed_on = '2024-07-20', synopsis_approved_on = '2024-12-10' where tenant_id = $1 and full_name = 'Shreya Kamath'`, [c.tenantId, dept['Management Studies'], centres[1].id]);
  await k.q(`update research_scholars set registration_no = 'BCU/MPH/2023/004', department_id = $2, gender = 'male', category = 'general' where tenant_id = $1 and full_name = 'Vinay Hegde'`, [c.tenantId, dept['Computer Applications']]);
  const sch = await k.ins<{ id: string; fullName: string; enrolledOn: string; supervisorUserId: string }>('research_scholars', [
    { fullName: 'Divya Shankar', programme: 'phd', supervisorUserId: kav.id, enrolledOn: '2023-08-01', thesisTitle: 'Microfinance and women-led households in Ramanagara', registrationNo: 'BCU/PHD/2023/019', mode: 'full_time', departmentId: dept['Commerce'], centreId: centres[0].id, fellowship: 'srf', fellowshipAgency: 'CSIR', entrance: 'net', gender: 'female', category: 'sc', courseworkCompletedOn: '2024-02-15', synopsisApprovedOn: '2024-09-12' },
    { fullName: 'Karthik Gowda', programme: 'phd', supervisorUserId: kav.id, enrolledOn: '2026-01-12', thesisTitle: 'Cashflow analytics for cooperative banks', registrationNo: 'BCU/PHD/2026/003', mode: 'full_time', departmentId: dept['Commerce'], centreId: centres[0].id, fellowship: 'institute', fellowshipAgency: 'Soundarya Institute', entrance: 'entrance_test', gender: 'male', category: 'general', projectId: proj[2].id },
    { fullName: 'Fathima Banu', programme: 'phd', supervisorUserId: lat.id, enrolledOn: '2024-08-05', thesisTitle: 'Financial literacy interventions for first-generation learners', registrationNo: 'BCU/PHD/2024/027', mode: 'part_time', departmentId: dept['Commerce'], centreId: centres[0].id, entrance: 'set', gender: 'female', category: 'obc', courseworkCompletedOn: '2025-02-10' },
    { fullName: 'Rohan Desai', programme: 'phd', supervisorUserId: rag.id, enrolledOn: '2022-08-10', thesisTitle: 'Talent analytics and attrition in Indian IT', registrationNo: 'BCU/PHD/2022/008', mode: 'full_time', departmentId: dept['Management Studies'], centreId: centres[1].id, fellowship: 'jrf', fellowshipAgency: 'UGC', entrance: 'net', gender: 'male', category: 'general', courseworkCompletedOn: '2023-02-20', synopsisApprovedOn: '2023-09-15', status: 'thesis_submitted' },
    { fullName: 'Pooja Naik', programme: 'phd', supervisorUserId: sow.id, enrolledOn: '2025-08-18', thesisTitle: 'Adaptive assessment in undergraduate programming', registrationNo: 'BCU/PHD/2025/044', mode: 'full_time', departmentId: dept['Computer Applications'], fellowship: 'jrf', fellowshipAgency: 'UGC', entrance: 'net', gender: 'female', category: 'ews', projectId: proj[0].id, courseworkCompletedOn: '2026-02-28' },
    { fullName: 'Suresh Babu', programme: 'phd', supervisorUserId: rag.id, enrolledOn: '2020-01-20', thesisTitle: 'Employer branding in Indian higher education', registrationNo: 'BCU/PHD/2020/002', mode: 'part_time', departmentId: dept['Management Studies'], centreId: centres[1].id, entrance: 'exempt', gender: 'male', category: 'st', courseworkCompletedOn: '2020-08-01', synopsisApprovedOn: '2021-03-10', status: 'awarded', completedOn: '2026-02-14' },
  ]);
  const [ananth] = await k.q<{ id: string }>("select id from research_scholars where tenant_id = $1 and full_name = 'Ananth Prabhu'", [c.tenantId]);
  const S = (n: string) => (n === 'Ananth Prabhu' ? ananth.id : sch.find((s) => s.fullName === n)!.id);
  await k.ins('scholar_coursework', [
    ...['Divya Shankar', 'Fathima Banu', 'Pooja Naik', 'Karthik Gowda'].flatMap((n, i) => [
      { scholarId: S(n), course: 'Research methodology', credits: 4, grade: i === 3 ? null : 'A', status: i === 3 ? 'enrolled' : 'passed', completedOn: i === 3 ? null : ['2024-02-15', '2025-02-10', '2026-02-28'][i] },
      { scholarId: S(n), course: 'Research and publication ethics', credits: 2, grade: i === 3 ? null : 'A+', status: i === 3 ? 'enrolled' : 'passed', completedOn: i === 3 ? null : ['2024-02-15', '2025-02-10', '2026-02-28'][i] },
      { scholarId: S(n), course: n === 'Pooja Naik' ? 'Advanced machine learning' : 'Advanced financial economics', credits: 4, grade: i === 3 ? null : 'B+', status: i === 3 ? 'enrolled' : 'passed', completedOn: i === 3 ? null : ['2024-02-15', '2025-02-10', '2026-02-28'][i] },
    ]),
  ], { returning: false });
  await k.ins('scholar_dc_meetings', [
    { scholarId: S('Divya Shankar'), heldOn: '2025-11-20', members: 'Dr. Kavitha Murthy (guide), Dr. N. Rao (external), Prof. Sudhir Kamath', progress: 'satisfactory', recommendations: 'Complete the second field round before the pre-submission seminar', nextDueOn: '2026-05-20' },
    { scholarId: S('Fathima Banu'), heldOn: '2025-12-02', members: 'Prof. Latha Gowda (guide), Dr. S. Iyer (external)', progress: 'needs_improvement', recommendations: 'Narrow the sample to two districts; submit a review paper', nextDueOn: '2026-06-02' },
    { scholarId: S('Pooja Naik'), heldOn: '2026-03-10', members: 'Prof. Sowmya Reddy (guide), Dr. Srinivas Rao', progress: 'satisfactory', recommendations: 'Synopsis by December', nextDueOn: '2026-09-10' },
    { scholarId: S('Ananth Prabhu'), heldOn: '2026-01-15', members: 'Dr. Kavitha Murthy (guide), Dr. M. Shetty (external)', progress: 'satisfactory', recommendations: 'Proceed to data collection', nextDueOn: '2026-07-15' },
  ], { returning: false });
  await k.ins('scholar_progress_reports', [
    { scholarId: S('Divya Shankar'), periodFrom: '2025-02-01', periodTo: '2025-07-31', submittedOn: '2025-08-06', summary: 'First field round in 4 villages (186 households); data cleaned.', outputs: 'Paper presented at the National Conference on Fintech for Bharat', rating: 'satisfactory', supervisorRemarks: 'On schedule', status: 'accepted', reviewedBy: kav.id },
    { scholarId: S('Divya Shankar'), periodFrom: '2025-08-01', periodTo: '2026-01-31', submittedOn: '2026-02-04', summary: 'Second field round started; econometric model drafted.', rating: 'satisfactory', supervisorRemarks: 'Add robustness checks', status: 'accepted', reviewedBy: kav.id },
    { scholarId: S('Divya Shankar'), periodFrom: '2026-02-01', periodTo: '2026-07-31', submittedOn: d(-60), summary: 'Two chapters drafted; review paper submitted to the Journal of Rural Studies.', status: 'submitted' },
    { scholarId: S('Fathima Banu'), periodFrom: '2025-08-05', periodTo: '2026-02-04', submittedOn: '2026-02-12', summary: 'Literature review; questionnaire validated with 40 students.', supervisorRemarks: 'Add the pilot results and the reliability figures before resubmitting', status: 'returned', reviewedBy: lat.id },
    { scholarId: S('Pooja Naik'), periodFrom: '2025-08-18', periodTo: '2026-02-17', submittedOn: '2026-02-25', summary: 'Coursework completed; adaptive quiz engine prototype.', rating: 'satisfactory', status: 'accepted', reviewedBy: sow.id },
    { scholarId: S('Ananth Prabhu'), periodFrom: '2025-07-10', periodTo: '2026-01-09', submittedOn: '2026-01-14', summary: 'Synopsis approved; sampling frame of 300 shops.', rating: 'needs_improvement', supervisorRemarks: 'Data collection is behind; plan two field weeks in March', status: 'accepted', reviewedBy: kav.id },
  ], { returning: false });
  await k.ins('supervisor_allocations', [
    { scholarId: S('Divya Shankar'), supervisorUserId: kav.id, role: 'supervisor', allocatedOn: '2023-08-01' },
    { scholarId: S('Fathima Banu'), supervisorUserId: lat.id, role: 'supervisor', allocatedOn: '2024-08-05' },
    { scholarId: S('Fathima Banu'), supervisorUserId: kav.id, role: 'co_supervisor', allocatedOn: '2024-08-05', reason: 'Co-guide from the research centre (guide is an assistant professor)' },
    { scholarId: S('Pooja Naik'), supervisorUserId: sow.id, role: 'supervisor', allocatedOn: '2025-08-18' },
  ], { returning: false });
  // Rohan Desai's thesis went through the university's DrillBit check; Suresh Babu's is on Shodhganga.
  const theses = await k.ins<{ id: string }>('thesis_records', [
    { scholarId: S('Rohan Desai'), title: 'Talent analytics and attrition in Indian IT', stage: 'submitted', abstract: 'A mixed-methods study of attrition across 14 IT firms in Bengaluru.', submittedOn: d(-25), version: 3 },
    { scholarId: sch.find((s) => s.fullName === 'Suresh Babu')!.id, title: 'Employer branding in Indian higher education', stage: 'awarded', abstract: 'Employer branding and faculty recruitment in private colleges.', submittedOn: '2025-06-30', awardedOn: '2026-02-14', shodhgangaHandle: '10603/598812', shodhgangaDepositedOn: '2026-03-20', examiners: J([{ name: 'Prof. A. Menon', affiliation: 'IIM Kozhikode', verdict: 'accept' }, { name: 'Dr. R. Pillai', affiliation: 'Cochin University', verdict: 'accept' }]), version: 6 },
  ]);
  await k.ins('similarity_checks', [
    { thesisId: theses[0].id, engine: 'drillbit', scorePercent: 7.4, matches: J([]), checkedBy: coord.id, reportRef: 'DB-SIMS-2026-118', reportUrl: 'https://drillbitplagiarism.com/report/DB-SIMS-2026-118', level: 'level_0' },
    { thesisId: theses[1].id, engine: 'urkund', scorePercent: 6.1, matches: J([]), checkedBy: coord.id, reportRef: 'D88120455', level: 'level_0' },
  ], { returning: false });
  await k.ins('thesis_events', [
    { thesisId: theses[0].id, stage: 'submitted', note: 'Submitted to the research office', actorId: rag.id },
    { thesisId: theses[0].id, stage: 'submitted', note: 'drillbit report DB-SIMS-2026-118: 7.4%', actorId: coord.id },
    { thesisId: theses[1].id, stage: 'awarded', note: 'Open defence passed', actorId: coord.id },
    { thesisId: theses[1].id, stage: 'awarded', note: 'Deposited with Shodhganga (10603/598812)', actorId: coord.id },
  ], { returning: false });
}
