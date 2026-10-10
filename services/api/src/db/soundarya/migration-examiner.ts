/**
 * Samples for data migration, university result formats, standalone transcripts and the external examiner portal
 * (migration 0128): the two sample templates, a committed import batch with imported history and a saved mapping,
 * an issued grade card, and an external examiner with valuation, question paper and claim.
 */
import { createHash } from 'node:crypto';
import { SAMPLE_TEMPLATES } from '../../university-results/tabulation.logic.js';
import type { Ctx } from './ctx.js';
import { at, J, rupees } from './kit.js';

export async function migrationAndExaminer(c: Ctx): Promise<void> {
  const { kit: k } = c;
  const principal = c.byEmail.principal.id;
  const tpl = await k.ins<{ id: string }>('university_templates', SAMPLE_TEMPLATES.map((s) => ({ code: s.code, name: s.name, university: s.university, config: J(s.config), createdBy: principal })));
  void tpl;

  // ---- imported history of three students from the previous system ----
  const sec = c.sections.find((s) => s.students.length >= 3 && s.subjects.length >= 2) ?? c.sections[0]!;
  const kids = sec.students.slice(0, 3);
  const fp = createHash('sha256').update('soundarya-linways-history').digest('hex');
  const [batch] = await k.ins<{ id: string }>('migration_batches', {
    entity: 'marks', fileName: 'linways-marks-2024-25.xlsx', fingerprint: fp, rowCount: kids.length * 2, createdCount: kids.length * 2,
    reconciliation: J({ totals: { rows: kids.length * 2, created: kids.length * 2, updated: 0, skipped: 0, error: 0 }, lines: [] }), createdBy: principal,
  });
  await k.ins('migration_mappings', { entity: 'marks', name: 'Linways mark export', mapping: J({ roll_no: 'Reg No', academic_year: '=2024-25', term: 'Sem', subject_code: 'Paper Code', subject_name: 'Paper', internal_marks: 'IA', external_marks: 'ESE', max_internal: '=20', max_external: '=80' }), createdBy: principal }, { returning: false });
  await k.ins(
    'legacy_marks',
    kids.flatMap((s, i) =>
      ['H101', 'H102'].map((code, j) => ({
        batchId: batch!.id, rollNo: s.rollNo, studentId: s.id, academicYear: '2024-25', term: 1, subjectCode: code, subjectName: j ? 'Environmental Studies' : 'Foundation English', credits: 4,
        internalMarks: 14 + i + j, externalMarks: 52 + i * 6 - j * 3, maxInternal: 20, maxExternal: 80, grade: i === 2 ? 'B' : 'A', gradePoint: i === 2 ? 7 : 8, result: 'pass',
      })),
    ),
    { returning: false },
  );
  await k.ins('legacy_attendance', kids.map((s, i) => ({ batchId: batch!.id, rollNo: s.rollNo, studentId: s.id, academicYear: '2024-25', term: 1, classesHeld: 96, classesAttended: 80 + i * 5 })), { returning: false });
  await k.ins(
    'legacy_fee_entries',
    kids.flatMap((s, i) => [
      { batchId: batch!.id, rollNo: s.rollNo, studentId: s.id, academicYear: '2024-25', entryType: 'charge', head: 'Tuition', reference: `INV-${i + 1}`, entryDate: '2024-08-05', amountPaise: rupees(24000) },
      { batchId: batch!.id, rollNo: s.rollNo, studentId: s.id, academicYear: '2024-25', entryType: 'receipt', head: 'Tuition', reference: `RC-${i + 1}`, entryDate: '2024-08-12', amountPaise: rupees(24000) },
    ]),
    { returning: false },
  );

  await k.ins('migration_batch_records', kids.map((s) => ({ batchId: batch!.id, tableName: 'legacy_marks', recordId: s.id })), { returning: false });

  // ---- transcript requests: one issued, one waiting ----
  const [first, second] = kids;
  await k.ins(
    'academic_doc_requests',
    [
      { studentId: first!.id, kind: 'grade_card', purpose: 'Higher studies', status: 'issued', requestedBy: first!.userId ?? principal, decidedBy: principal, decidedAt: at('2026-10-02'), issuedAt: at('2026-10-03'), serialNo: 'GC/2026/0001', verifyToken: 'seed-GC-2026-0001', snapshot: J({ header: { institution: '', name: first!.name, rollNo: first!.rollNo, className: sec.label, program: sec.prog }, terms: [], cgpa: 8, creditsEarned: 8, creditsAttempted: 8, outcome: 'passed', classLabel: 'First Class with Distinction' }) },
      { studentId: second!.id, kind: 'transcript', purpose: 'Job application', status: 'requested', requestedBy: second!.userId ?? principal },
    ],
    { returning: false },
  );

  // ---- an external examiner: valuation, question paper and a claim ----
  const [session] = await k.q<{ id: string; programId: string }>("select id, program_id from exam_sessions where status in ('scheduled','published') order by starts_on limit 1");
  const subject = sec.subjects[0];
  if (!session || !subject) return;
  const [user] = await k.ins<{ id: string }>('users', { fullName: 'Dr. Meera Iyer', phone: '+919845099001', email: 'meera.iyer@visiting.example.in', passwordHash: null });
  await k.ins('user_roles', { userId: user!.id, role: 'external_examiner', campusId: null }, { returning: false });
  const [ex] = await k.ins<{ id: string }>('ext_examiners', { userId: user!.id, organisation: 'Mount Carmel College (visiting)' });
  const [val] = await k.ins<{ id: string }>('ext_examiner_assignments', { examinerId: ex!.id, sessionId: session.id, subjectId: subject.id, role: 'valuer', ratePaise: rupees(25), status: 'active', acceptedAt: at('2026-10-04'), createdBy: principal });
  const [qpa] = await k.ins<{ id: string }>('ext_examiner_assignments', { examinerId: ex!.id, sessionId: session.id, subjectId: subject.id, role: 'qp_setter', ratePaise: rupees(1500), status: 'active', acceptedAt: at('2026-10-04'), createdBy: principal });
  const [paper] = await k.q<{ id: string; maxMarks: number }>('select id, max_marks from exam_papers where session_id = $1 and subject_id = $2 limit 1', [session.id, subject.id]);
  if (paper) {
    await k.ins(
      'ext_valuation_scripts',
      kids.map((s, i) => ({ assignmentId: val!.id, paperId: paper.id, studentId: s.id, scriptCode: `SEED${i + 1}${sec.label.replace(/\W/g, '').slice(0, 2).toUpperCase()}X`, maxMarks: paper.maxMarks, marks: i < 2 ? Math.round(paper.maxMarks * (0.6 + i * 0.1)) : null, status: i < 2 ? 'valued' : 'pending', valuedAt: i < 2 ? at('2026-10-06') : null })),
      { returning: false },
    );
    await k.ins('ext_remuneration_claims', { examinerId: ex!.id, assignmentId: val!.id, units: 2, amountPaise: rupees(50), status: 'submitted' }, { returning: false });
  }
  await k.ins('ext_question_papers', { sessionId: session.id, subjectId: subject.id, setterAssignmentId: qpa!.id, title: `${subject.name}: end-semester paper`, content: 'Section A: ten short questions of two marks each.\nSection B: five questions of ten marks each, answer any four.', status: 'scrutiny' }, { returning: false });
}
