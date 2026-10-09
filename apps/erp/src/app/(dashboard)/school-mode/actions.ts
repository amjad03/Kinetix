'use server';

import { getI18n } from '@/i18n/server';
import { parseReportLines } from '@/lib/curriculum';
import { send } from '@/lib/ops-server';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PAGE = '/school-mode';

async function bad(key: 'sm.err.input' | 'sm.err.lines' = 'sm.err.input', extra?: string): Promise<{ ok: false; error: string }> {
  return { ok: false, error: (await getI18n()).t(key, { line: extra ?? '' }) };
}

export async function addHouse(v: Record<string, string>) {
  if (!v.name?.trim() || (v.colour && !/^#[0-9a-fA-F]{6}$/.test(v.colour))) return bad();
  return send('/v1/houses', { name: v.name.trim(), ...(v.colour ? { colour: v.colour } : {}), motto: (v.motto ?? '').trim() }, PAGE);
}

export async function awardPoints(houseId: string, v: Record<string, string>) {
  const points = Number(v.points);
  if (!UUID.test(houseId) || !Number.isInteger(points) || points === 0 || !v.reason?.trim()) return bad();
  return send(`/v1/houses/${encodeURIComponent(houseId)}/points`, { points, reason: v.reason.trim(), category: v.category || 'general' }, PAGE);
}

export async function addStream(v: Record<string, string>) {
  if (!v.code?.trim() || !v.name?.trim()) return bad();
  return send('/v1/school/puc/streams', { code: v.code.trim(), name: v.name.trim() }, PAGE);
}

/** Subjects typed one per line as "Name, theory max, practical max, internal max". */
export async function addCombination(v: Record<string, string>) {
  const subjects = (v.subjects ?? '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [name, theory, practical, internal] = l.split(',').map((x) => x.trim());
      return { name, theoryMax: Number(theory), practicalMax: Number(practical || 0), internalMax: Number(internal || 0) };
    });
  if (!UUID.test(v.streamId ?? '') || !v.code?.trim() || !v.name?.trim() || subjects.length < 3 || subjects.some((s) => !s.name || !Number.isFinite(s.theoryMax) || !Number.isFinite(s.practicalMax) || !Number.isFinite(s.internalMax))) return bad();
  return send('/v1/school/puc/combinations', { streamId: v.streamId, code: v.code.trim(), name: v.name.trim(), subjects, ...(v.seats ? { seats: Number(v.seats) } : {}) }, PAGE);
}

export async function addOutcome(v: Record<string, string>) {
  const grade = Number(v.grade);
  if (!Number.isInteger(grade) || !v.subjectName?.trim() || !v.code?.trim() || !v.statement?.trim()) return bad();
  return send('/v1/school/outcomes', { kind: v.kind === 'competency' ? 'competency' : 'outcome', grade, subjectName: v.subjectName.trim(), code: v.code.trim(), statement: v.statement.trim() }, PAGE);
}

export async function saveReportCard(v: Record<string, string>) {
  if (!UUID.test(v.studentId ?? '') || !UUID.test(v.academicYearId ?? '') || !v.termLabel?.trim()) return bad();
  const parsed = parseReportLines(v.lines ?? '');
  if ('badLine' in parsed) return bad('sm.err.lines', String(parsed.badLine));
  const status = ['pending', 'promoted', 'promoted_with_grace', 'detained'].includes(v.promotionStatus ?? '') ? v.promotionStatus : 'pending';
  const co = (v.coCurricular ?? '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [activity, grade, ...rest] = l.split(',').map((x) => x.trim());
      return { activity, grade, remark: rest.join(', ') };
    });
  if (co.some((c) => !c.activity || !c.grade)) return bad();
  return send('/v1/school/report-cards', { studentId: v.studentId, academicYearId: v.academicYearId, termLabel: v.termLabel.trim(), remarks: (v.remarks ?? '').trim(), behaviourGrade: v.behaviourGrade?.trim() || null, promotionStatus: status, promotedTo: v.promotedTo?.trim() || null, lines: parsed.lines, coCurricular: co }, PAGE, 'PUT');
}
