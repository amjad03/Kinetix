/** Curriculum versions under the NEP 2024 regulation (one draft revision pending), and convocations for the previous and the final-year batch. School-only modules (report cards, PUC, houses) are not seeded: this is a college. */
import type { Ctx, SubjectRef } from './ctx.js';
import { addDays } from './kit.js';

const UNITS = ['Foundations and concepts', 'Methods and applications', 'Case studies and practice'];

export async function curriculumAndConvocation(c: Ctx): Promise<void> {
  const { kit: k, r } = c;
  const principal = c.byEmail.principal.id;
  const reg = await k.ins<{ id: string }>('regulations', [
    { name: 'NEP 2021', year: 2021, authority: 'Board of Studies, Commerce and Management', effectiveFrom: '2021-08-01', notes: 'First NEP batch.' },
    { name: 'NEP 2024', year: 2024, authority: 'Board of Studies, Commerce and Management', effectiveFrom: '2024-08-01', notes: 'Revised credit framework with skill enhancement courses.' },
  ]);
  const nep24 = reg[1].id;

  const versionOf = new Map<string, { id: string; subjects: Map<string, string> }>();
  for (const [code, prog] of Object.entries(c.programs)) {
    const papers = new Map<string, SubjectRef>();
    for (const sec of c.sections.filter((s) => s.prog === code)) for (const sub of sec.subjects) papers.set(sub.code, sub);
    if (!papers.size) continue;
    const v1 = await k.one<{ id: string }>('curriculum_versions', { programId: prog.id, regulationId: nep24, regulationYear: 2024, versionNo: 1, label: `${prog.def.name} NEP 2024`, status: 'active', effectiveFrom: '2024-08-01', bosRef: `BoS/2024/${code}/01`, approvedBy: principal, approvedAt: '2024-06-20T10:00:00Z', activatedAt: '2024-07-01T10:00:00Z', createdBy: principal });
    const subs = await k.ins<{ id: string; code: string }>('curriculum_subjects', [...papers.values()].map((p, i) => ({ versionId: v1.id, term: p.term, code: p.code, name: p.name, credits: p.credits, hours: p.credits * 15, ord: i })));
    await k.ins('curriculum_units', subs.flatMap((s) => UNITS.map((title, n) => ({ subjectId: s.id, ord: n + 1, title, hours: 15, topics: [`${title}: key ideas`, `${title}: worked examples`] }))), { returning: false });
    await k.ins('curriculum_cos', subs.flatMap((s) => [1, 2, 3].map((n) => ({ subjectId: s.id, code: `CO${n}`, statement: ['Explain the core concepts', 'Apply the methods to routine problems', 'Evaluate a practical case'][n - 1], bloomLevel: ['understand', 'apply', 'evaluate'][n - 1] }))), { returning: false });
    versionOf.set(code, { id: v1.id, subjects: new Map(subs.map((s) => [s.code, s.id])) });

    // One programme per department group gets a pending revision: a draft with one paper reworked and one added.
    if (code === 'BCM' || code === 'BCA') {
      const v2 = await k.one<{ id: string }>('curriculum_versions', { programId: prog.id, regulationId: nep24, regulationYear: 2024, versionNo: 2, label: `${prog.def.name} NEP 2024 revision for 2027-28`, status: 'draft', supersedesId: v1.id, source: code === 'BCA' ? 'import' : 'manual', createdBy: c.byEmail.principal.id });
      const first = [...papers.values()];
      const subs2 = await k.ins<{ id: string; code: string }>('curriculum_subjects', [...first.map((p, i) => ({ versionId: v2.id, term: p.term, code: p.code, name: p.name, credits: i === 0 ? p.credits + 1 : p.credits, hours: (i === 0 ? p.credits + 1 : p.credits) * 15, ord: i })), { versionId: v2.id, term: 5, code: `${code}-SEC-DA`, name: 'Data Analytics (skill enhancement)', credits: 3, hours: 45, ord: first.length }]);
      await k.ins('curriculum_units', subs2.flatMap((s) => UNITS.map((title, n) => ({ subjectId: s.id, ord: n + 1, title, hours: 15, topics: [`${title}: key ideas`, `${title}: worked examples`, ...(n === 2 && s.code === first[0].code ? ['Industry case review'] : [])] }))), { returning: false });
    }
  }
  // Every student follows the active version of their programme.
  await k.ins('student_curriculum_pins', c.students.flatMap((s) => (versionOf.has(s.prog) ? [{ studentId: s.id, versionId: versionOf.get(s.prog)!.id, pinnedBy: principal }] : [])), { returning: false });

  // Previous batch: graduated students of BCom in last year's final-semester section, degrees issued at the 2025 convocation.
  const bcm = c.programs.BCM;
  if (!bcm) return;
  const [prevSection] = await k.ins<{ id: string }>('sections', [{ programId: bcm.id, academicYearId: c.years.prev, term: bcm.def.terms, name: 'A', displayName: `${bcm.def.name} Sem ${bcm.def.terms} A (2022-25 batch)` }]);
  const alumni = await k.ins<{ id: string; fullName: string }>('students', Array.from({ length: 8 }, (_, i) => ({ sectionId: prevSection.id, rollNo: `22BCM${String(i + 1).padStart(3, '0')}`, fullName: `${['Anitha', 'Bharath', 'Chaitra', 'Dinesh', 'Esha', 'Farhan', 'Geetha', 'Harish'][i]} ${['Gowda', 'Shetty', 'Naik', 'Rao'][i % 4]}`, status: 'alumni', enrolledOn: '2022-08-02' })));
  const past = await k.one<{ id: string }>('convocations', { name: 'Convocation 2025', heldOn: '2025-12-13', graduationYear: 2025, programId: bcm.id, status: 'held', createdBy: principal });
  await k.ins('convocation_candidates', alumni.map((s, i) => ({ convocationId: past.id, studentId: s.id, status: 'degree_issued', cgpa: (6.4 + r.next() * 3).toFixed(2), degreeTitle: bcm.def.name, registeredAt: '2025-11-20T09:00:00Z', certificateNo: `DEG-2025-${String(i + 1).padStart(4, '0')}`, issuedAt: '2025-12-13T11:00:00Z' })), { returning: false });

  // This year's most senior BCom students are on the eligible list, some already registered.
  const bcmStudents = c.students.filter((s) => s.prog === 'BCM');
  const top = Math.max(0, ...bcmStudents.map((s) => s.term));
  const finalYear = bcmStudents.filter((s) => s.term === top).slice(0, 14);
  if (finalYear.length) {
    const next = await k.one<{ id: string }>('convocations', { name: 'Convocation 2026', heldOn: addDays(c.today, 60), graduationYear: 2026, programId: bcm.id, status: 'registration_open', createdBy: principal });
    await k.ins('convocation_candidates', finalYear.map((s, i) => ({ convocationId: next.id, studentId: s.id, status: i % 3 === 0 ? 'registered' : 'eligible', cgpa: (6 + r.next() * 3.4).toFixed(2), degreeTitle: bcm.def.name, registeredAt: i % 3 === 0 ? `${addDays(c.today, -3)}T09:00:00Z` : null })), { returning: false });
  }
  await k.ins('affiliated_institutions', [
    { code: 'SSC-MAIN', name: 'Soundarya Institute of Management and Science', model: 'autonomous', university: 'Bangalore University', city: 'Bengaluru', affiliationValidTo: '2029-05-31' },
    { code: 'SSC-EVE', name: 'Soundarya Evening College', model: 'affiliated', university: 'Bangalore University', city: 'Bengaluru', affiliationValidTo: '2027-05-31' },
  ], { returning: false });
}
