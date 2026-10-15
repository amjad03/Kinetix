import { BadRequestException, Controller, Get, NotFoundException, Param, ParseUUIDPipe, Query, Res } from '@nestjs/common';
import { and, asc, eq, sql } from 'drizzle-orm';
import type { Response } from 'express';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { UserPrincipal } from '../auth/principal.js';
import { assertCanSeeStudent } from '../common/student-access.js';
import { PdfWriter } from '../common/pdf.js';
import { DbService, type Tx } from '../db/db.service.js';
import { examPapers, rooms, subjects, tenants } from '../db/schema.js';
import { CELL_READ, CELL_STAFF, loadSession, rowsOf, UUID } from './common.js';

/** One candidate line of a hall attendance sheet. */
export interface SheetLine {
  seatNo: number | null;
  rollNo: string;
  name: string;
  bookletNo: string | null;
  status: string | null;
}

/** Internal and external marks of a result line, from its components. */
export function splitComponents(components: { kind: string; weighted: number }[]): { internal: number; external: number } {
  const sum = (k: string) => Math.round(components.filter((c) => c.kind === k).reduce((a, c) => a + Number(c.weighted ?? 0), 0) * 100) / 100;
  return { internal: sum('internal'), external: sum('external') };
}

/** The hall attendance (signature) sheet of one paper in one hall: seat, register number, name, booklet, signature. */
export function attendanceSheetPdf(h: { institution: string; session: string; paper: string; date: string; time: string; hall: string }, lines: SheetLine[]): Buffer {
  const pdf = new PdfWriter();
  pdf.text(h.institution, { size: 14, bold: true, align: 'center' });
  pdf.text('ATTENDANCE SHEET OF CANDIDATES', { size: 11, bold: true, align: 'center' });
  pdf.text(h.session, { align: 'center' });
  pdf.rule();
  pdf.text(`Paper: ${h.paper}`, { bold: true });
  pdf.text(`Date: ${h.date}    Time: ${h.time}    Hall: ${h.hall}`);
  pdf.gap(4);
  const xs = [0, 34, 110, 290, 370, 440];
  pdf.row(['Seat', 'Register no', 'Name', 'Booklet no', 'Status', 'Signature'], xs, { bold: true });
  pdf.rule();
  for (const l of lines) {
    pdf.row([l.seatNo === null ? '' : String(l.seatNo), l.rollNo, l.name, l.bookletNo ?? '________', l.status ? l.status.toUpperCase() : '', '______________'], xs);
    pdf.gap(4);
  }
  pdf.rule();
  const present = lines.filter((l) => l.status === 'present').length;
  const absent = lines.filter((l) => l.status === 'absent').length;
  pdf.text(`Candidates: ${lines.length}    Present: ${lines.some((l) => l.status) ? present : '____'}    Absent: ${lines.some((l) => l.status) ? absent : '____'}`, { bold: true });
  pdf.gap(24);
  pdf.text('Signature of the invigilator', { stay: true });
  pdf.text('Chief Superintendent', { align: 'right' });
  return pdf.build();
}

export interface DFormHall {
  hall: string;
  registered: number;
  present: string[];
  absent: string[];
  malpractice: string[];
  booklets: { first: string | null; last: string | null; count: number };
}

/** The D-form (absentee statement) of a paper: per hall the candidates present, absent and booked, and the booklets used. */
export function dFormPdf(h: { institution: string; session: string; paper: string; date: string; time: string }, halls: DFormHall[]): Buffer {
  const pdf = new PdfWriter();
  pdf.text(h.institution, { size: 14, bold: true, align: 'center' });
  pdf.text('D-FORM: STATEMENT OF ATTENDANCE AND ABSENTEES', { size: 11, bold: true, align: 'center' });
  pdf.text(h.session, { align: 'center' });
  pdf.rule();
  pdf.text(`Paper: ${h.paper}    Date: ${h.date}    Time: ${h.time}`, { bold: true });
  pdf.gap(4);
  const xs = [0, 120, 200, 270, 340, 410];
  pdf.row(['Hall', 'Registered', 'Present', 'Absent', 'Malpractice', 'Booklets used'], xs, { bold: true });
  pdf.rule();
  for (const x of halls) pdf.row([x.hall, String(x.registered), String(x.present.length), String(x.absent.length), String(x.malpractice.length), x.booklets.count ? `${x.booklets.count} (${x.booklets.first} to ${x.booklets.last})` : '0'], xs);
  pdf.rule();
  const tot = (f: (x: DFormHall) => number) => halls.reduce((a, x) => a + f(x), 0);
  pdf.row(['Total', String(tot((x) => x.registered)), String(tot((x) => x.present.length)), String(tot((x) => x.absent.length)), String(tot((x) => x.malpractice.length)), String(tot((x) => x.booklets.count))], xs, { bold: true });
  pdf.gap(8);
  for (const x of halls) {
    if (!x.absent.length && !x.malpractice.length) continue;
    pdf.text(`${x.hall}`, { bold: true });
    if (x.absent.length) pdf.paragraph(`Absent: ${x.absent.join(', ')}`);
    if (x.malpractice.length) pdf.paragraph(`Booked for malpractice: ${x.malpractice.join(', ')}`);
    pdf.gap(4);
  }
  pdf.gap(24);
  pdf.text('Certified that the particulars above are correct.');
  pdf.gap(18);
  pdf.text('Chief Superintendent', { align: 'right' });
  return pdf.build();
}

export interface TabulationCandidate {
  rollNo: string;
  name: string;
  sgpa: number | null;
  cgpa: number | null;
  result: string;
  lines: { code: string; internal: number; external: number; grace: number; total: number; grade: string; passed: boolean }[];
}

/** The tabulation register of a session: each candidate's subject-wise internal, external, grace, total and grade. */
export function tabulationPdf(h: { institution: string; session: string }, rows: TabulationCandidate[]): Buffer {
  const pdf = new PdfWriter();
  pdf.text(h.institution, { size: 14, bold: true, align: 'center' });
  pdf.text('TABULATION REGISTER', { size: 11, bold: true, align: 'center' });
  pdf.text(h.session, { align: 'center' });
  pdf.rule();
  const xs = [20, 120, 180, 240, 290, 350, 410];
  for (const r of rows) {
    pdf.text(`${r.rollNo}  ${r.name}    SGPA ${r.sgpa === null ? '-' : r.sgpa.toFixed(2)}    CGPA ${r.cgpa === null ? '-' : r.cgpa.toFixed(2)}    ${r.result}`, { bold: true });
    pdf.row(['Subject', 'Internal', 'External', 'Grace', 'Total', 'Grade', 'Result'], xs, { bold: true, size: 8 });
    for (const l of r.lines) pdf.row([l.code, l.internal.toFixed(1), l.external.toFixed(1), l.grace ? l.grace.toFixed(1) : '', l.total.toFixed(1), l.grade, l.passed ? 'P' : 'F'], xs, { size: 8 });
    pdf.gap(4);
  }
  pdf.gap(20);
  pdf.text('Tabulator', { stay: true });
  pdf.text('Controller of Examinations', { align: 'right' });
  return pdf.build();
}

/** Printed registers of a session: hall attendance sheets, the D-form and the tabulation register; and a student's marks ledger. */
@Controller('v1')
export class RegistersController {
  constructor(private readonly db: DbService) {}

  @Get('exam-sessions/:id/registers/attendance-sheet.pdf')
  @Auth('user', CELL_STAFF)
  async attendanceSheet(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Query('paperId') paperId: string, @Query('roomId') roomId: string | undefined, @Res() res: Response) {
    if (!UUID.test(paperId ?? '') || (roomId && !UUID.test(roomId))) throw new BadRequestException('Choose a paper (and a hall)');
    const pdf = await this.db.withTenant(p.tenantId, async (tx) => {
      const { s, paper, institution } = await this.paper(tx, id, paperId);
      // Seated candidates of the hall when there is a seating plan, else the class roster with any repeaters.
      const rows = await rowsOf<{ seat_no: number | null; roll_no: string; name: string; booklet_no: string | null; status: string | null; room: string | null }>(
        tx,
        sql`with cands as (
              select st.id, st.roll_no, st.full_name from students st where st.section_id = ${paper.sectionId}::uuid and st.status = 'active'
              union select st.id, st.roll_no, st.full_name from supplementary_registrations r join students st on st.id = r.student_id where r.session_id = ${id}::uuid and r.subject_id = ${paper.subjectId}::uuid)
            select es.seat_no, c.roll_no, c.full_name as name, ea.booklet_no, ea.status, rm.name as room
            from cands c left join exam_seats es on es.paper_id = ${paperId}::uuid and es.student_id = c.id left join rooms rm on rm.id = es.room_id
            left join exam_attendance ea on ea.paper_id = ${paperId}::uuid and ea.student_id = c.id
            where (${roomId ?? null}::uuid is null or es.room_id = ${roomId ?? null}::uuid)
            order by rm.name nulls last, es.seat_no nulls last, c.roll_no`,
      );
      const hall = roomId ? ((await tx.select({ name: rooms.name }).from(rooms).where(eq(rooms.id, roomId)))[0]?.name ?? '') : [...new Set(rows.map((r) => r.room).filter(Boolean))].join(', ') || 'As allotted';
      return attendanceSheetPdf({ institution, session: s.name, paper: `${paper.code} ${paper.subject}`, date: paper.examDate, time: `${paper.startsAt.slice(0, 5)} - ${paper.endsAt.slice(0, 5)}`, hall }, rows.map((r) => ({ seatNo: r.seat_no, rollNo: r.roll_no, name: r.name, bookletNo: r.booklet_no, status: r.status })));
    });
    send(res, pdf, 'attendance-sheet.pdf');
  }

  @Get('exam-sessions/:id/registers/d-form.pdf')
  @Auth('user', CELL_READ)
  async dForm(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Query('paperId') paperId: string, @Res() res: Response) {
    if (!UUID.test(paperId ?? '')) throw new BadRequestException('Choose a paper');
    const pdf = await this.db.withTenant(p.tenantId, async (tx) => {
      const { s, paper, institution } = await this.paper(tx, id, paperId);
      const halls = await dFormHalls(tx, id, paperId);
      return dFormPdf({ institution, session: s.name, paper: `${paper.code} ${paper.subject}`, date: paper.examDate, time: `${paper.startsAt.slice(0, 5)} - ${paper.endsAt.slice(0, 5)}` }, halls);
    });
    send(res, pdf, 'd-form.pdf');
  }

  @Get('exam-sessions/:id/registers/tabulation.pdf')
  @Auth('user', CELL_READ)
  async tabulation(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const pdf = await this.db.withTenant(p.tenantId, async (tx) => {
      const s = await loadSession(tx, id);
      if (!['processed', 'published', 'locked'].includes(s.status)) throw new BadRequestException('Process the results first');
      const [t] = await tx.select({ name: tenants.name }).from(tenants);
      return tabulationPdf({ institution: t?.name ?? '', session: s.name }, await tabulationRows(tx, id));
    });
    send(res, pdf, 'tabulation-register.pdf');
  }

  /** A student's marks ledger: every attempt of every subject across sessions, with the attempt that counts marked. */
  @Get('students/:studentId/marks-ledger')
  @Auth('user')
  ledger(@CurrentPrincipal() p: UserPrincipal, @Param('studentId', ParseUUIDPipe) studentId: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await assertCanSeeStudent(tx, p, studentId, CELL_READ);
      return studentLedger(tx, studentId);
    });
  }

  private async paper(tx: Tx, sessionId: string, paperId: string) {
    const s = await loadSession(tx, sessionId);
    const [paper] = await tx
      .select({ id: examPapers.id, subjectId: examPapers.subjectId, sectionId: examPapers.sectionId, examDate: examPapers.examDate, startsAt: examPapers.startsAt, endsAt: examPapers.endsAt, code: subjects.code, subject: subjects.name })
      .from(examPapers)
      .innerJoin(subjects, eq(subjects.id, examPapers.subjectId))
      .where(and(eq(examPapers.id, paperId), eq(examPapers.sessionId, sessionId)));
    if (!paper) throw new NotFoundException('Paper not found');
    const [t] = await tx.select({ name: tenants.name }).from(tenants);
    return { s, paper, institution: t?.name ?? '' };
  }
}

/** Per hall of a paper: candidates seated or on the roll, present, absent, booked, and the booklet range used. */
export async function dFormHalls(tx: Tx, sessionId: string, paperId: string): Promise<DFormHall[]> {
  const rows = await rowsOf<{ hall: string; roll_no: string; status: string | null; booklet_no: string | null }>(
    tx,
    sql`select coalesce(rm.name, 'Not seated') as hall, st.roll_no, ea.status, ea.booklet_no
        from exam_papers p join students st on (st.section_id = p.section_id and st.status = 'active')
          or st.id in (select r.student_id from supplementary_registrations r where r.session_id = ${sessionId}::uuid and r.subject_id = p.subject_id)
        left join exam_seats es on es.paper_id = p.id and es.student_id = st.id left join rooms rm on rm.id = es.room_id
        left join exam_attendance ea on ea.paper_id = p.id and ea.student_id = st.id
        where p.id = ${paperId}::uuid order by hall, st.roll_no`,
  );
  const halls = new Map<string, typeof rows>();
  for (const r of rows) halls.set(r.hall, [...(halls.get(r.hall) ?? []), r]);
  return [...halls].map(([hall, list]) => {
    const booklets = list.map((x) => x.booklet_no).filter((b): b is string => !!b).sort();
    return {
      hall,
      registered: list.length,
      present: list.filter((x) => x.status === 'present').map((x) => x.roll_no),
      absent: list.filter((x) => x.status === 'absent').map((x) => x.roll_no),
      malpractice: list.filter((x) => x.status === 'debarred').map((x) => x.roll_no),
      booklets: { first: booklets[0] ?? null, last: booklets[booklets.length - 1] ?? null, count: booklets.length },
    };
  });
}

/** Every candidate's subject lines of a processed session, for the tabulation register. */
export async function tabulationRows(tx: Tx, sessionId: string): Promise<TabulationCandidate[]> {
  const rs = await rowsOf<{ id: string; roll_no: string; name: string; sgpa: number; cgpa: number; outcome: string; withheld: boolean }>(
    tx,
    sql`select r.id, st.roll_no, st.full_name as name, r.sgpa::float8 as sgpa, r.cgpa::float8 as cgpa, r.outcome,
          exists (select 1 from result_withholds w where w.session_id = r.session_id and w.student_id = r.student_id and w.status = 'held') as withheld
        from exam_results r join students st on st.id = r.student_id where r.session_id = ${sessionId}::uuid order by st.roll_no`,
  );
  const ls = await rowsOf<{ result_id: string; code: string; components: { kind: string; weighted: number }[]; grace: number; percent: number; grade: string; passed: boolean }>(
    tx,
    sql`select l.result_id, sub.code, l.components, l.grace::float8 as grace, l.percent::float8 as percent, l.grade, l.passed from exam_result_lines l join exam_results r on r.id = l.result_id join subjects sub on sub.id = l.subject_id where r.session_id = ${sessionId}::uuid order by sub.code`,
  );
  return rs.map((r) => ({
    rollNo: r.roll_no,
    name: r.name,
    sgpa: r.withheld ? null : r.sgpa,
    cgpa: r.withheld ? null : r.cgpa,
    result: r.withheld ? 'WITHHELD' : r.outcome === 'pass' ? 'PASS' : 'FAIL',
    lines: r.withheld
      ? []
      : ls
          .filter((l) => l.result_id === r.id)
          .map((l) => {
            const c = splitComponents(Array.isArray(l.components) ? l.components : []);
            return { code: l.code, internal: c.internal, external: c.external, grace: l.grace, total: l.percent, grade: l.grade, passed: l.passed };
          }),
  }));
}

/** A student's marks ledger across sessions: all attempts, with the one that counts and the running CGPA. */
export async function studentLedger(tx: Tx, studentId: string) {
  const rows = await rowsOf<{ session_id: string; session: string; kind: string; term: number; starts_on: string; status: string; code: string; subject: string; credits: number; percent: number; grade: string; grade_point: number; passed: boolean; grace: number; sgpa: number; cgpa: number; withheld: boolean }>(
    tx,
    sql`select s.id as session_id, s.name as session, s.kind, s.term, s.starts_on::text as starts_on, s.status, sub.code, sub.name as subject, l.credits::float8 as credits, l.percent::float8 as percent, l.grade,
          l.grade_point::float8 as grade_point, l.passed, l.grace::float8 as grace, r.sgpa::float8 as sgpa, r.cgpa::float8 as cgpa,
          exists (select 1 from result_withholds w where w.session_id = s.id and w.student_id = r.student_id and w.status = 'held') as withheld
        from exam_results r join exam_sessions s on s.id = r.session_id join exam_result_lines l on l.result_id = r.id join subjects sub on sub.id = l.subject_id
        where r.student_id = ${studentId}::uuid and s.status in ('published', 'locked') order by s.starts_on, s.created_at, sub.code`,
  );
  const visible = rows.filter((r) => !r.withheld);
  // The attempt that counts per subject: the latest pass, else the latest attempt.
  const counts = new Map<string, string>();
  for (const r of visible) {
    const prev = counts.get(r.code);
    const prevRow = prev ? visible.find((x) => `${x.session_id}|${x.code}` === prev) : null;
    if (!prevRow || r.passed || !prevRow.passed) counts.set(r.code, `${r.session_id}|${r.code}`);
  }
  const sessions = [...new Map(rows.map((r) => [r.session_id, { sessionId: r.session_id, session: r.session, kind: r.kind, term: r.term, startsOn: r.starts_on, sgpa: r.withheld ? null : r.sgpa, cgpa: r.withheld ? null : r.cgpa, withheld: r.withheld }])).values()];
  const attempts = visible.map((r) => ({ sessionId: r.session_id, session: r.session, kind: r.kind, term: r.term, code: r.code, subject: r.subject, credits: r.credits, percent: r.percent, grade: r.grade, gradePoint: r.grade_point, grace: r.grace, passed: r.passed, counts: counts.get(r.code) === `${r.session_id}|${r.code}` }));
  const counted = attempts.filter((a) => a.counts);
  return {
    sessions,
    attempts,
    summary: { subjects: counted.length, cleared: counted.filter((a) => a.passed).length, backlogs: counted.filter((a) => !a.passed).length, creditsEarned: counted.filter((a) => a.passed).reduce((n, a) => n + a.credits, 0), attempts: attempts.length, cgpa: sessions.filter((s) => s.cgpa !== null).at(-1)?.cgpa ?? null },
  };
}

function send(res: Response, pdf: Buffer, name: string) {
  res.setHeader('content-type', 'application/pdf');
  res.setHeader('content-disposition', `inline; filename="${name}"`);
  res.end(pdf);
}

// Keep the column order of rooms for imports elsewhere.
export const ROOM_ORDER = asc(rooms.name);
