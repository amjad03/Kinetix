import { BadRequestException, Controller, Get, Param, Query, Res } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import type { Response } from 'express';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { UserPrincipal } from '../auth/principal.js';
import { DbService, type Tx } from '../db/db.service.js';
import { resultClassBands } from '../db/schema-depth.js';
import { classOf, DEFAULT_BANDS, type ClassBand } from '../exams/exam-ops.logic.js';
import { passStats } from '../exam-office/exam-office.logic.js';
import { classify, percentEquivalent } from '../affiliation/maths.js';
import { resolveAffiliation } from '../affiliation/resolve.js';
import { CELL_READ, loadSession, rowsOf, UUID } from './common.js';
import { csv, goldMedallists, rankList, remuneration } from './exam-cell.logic.js';
import { cellSettings } from './settings.js';

export const CELL_REPORTS = ['gazette', 'result_register', 'pass_by_course', 'pass_by_teacher', 'pass_by_section', 'grade_distribution', 'year_comparison', 'toppers', 'ranks', 'analysis', 'distinctions', 'gold_medals', 'nirf', 'exam_fees', 'withheld', 'pending_certificates', 'remuneration', 'answer_sheets', 'mismatches'] as const;
export type CellReport = (typeof CELL_REPORTS)[number];
/** Reports that need no exam session. */
const NO_SESSION: CellReport[] = ['pending_certificates', 'remuneration'];

type Row = Record<string, unknown>;
export interface ReportData {
  report: CellReport;
  columns: { key: string; label: string }[];
  rows: Row[];
  totals?: Row;
}

const cols = (...pairs: [string, string][]) => pairs.map(([key, label]) => ({ key, label }));
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 10000) / 100 : 0);

/**
 * The exam cell's registers and analyses: the tabulation register (gazette), result register, pass percentage by
 * course, by teacher and by class, the grade distribution of each paper, the comparison with earlier years, toppers and ranks (repeaters excluded by the rule), results by gender and category,
 * distinctions, gold medals, the NIRF graduation outcome, the exam-fee statement, withheld results, the pending
 * certificate register, remuneration of invigilators and valuers, the answer-book statements and the double-entry
 * mismatches. Each is a table on screen and a CSV file.
 */
@Controller('v1/exam-cell/reports')
export class CellReportsController {
  constructor(private readonly db: DbService) {}

  @Get(':report')
  @Auth('user', CELL_READ)
  async report(@CurrentPrincipal() p: UserPrincipal, @Param('report') report: string, @Res({ passthrough: true }) res: Response, @Query('sessionId') sessionId?: string, @Query('format') format?: string) {
    if (!(CELL_REPORTS as readonly string[]).includes(report)) throw new BadRequestException('Unknown report');
    const r = report as CellReport;
    if (!NO_SESSION.includes(r) && !(sessionId && UUID.test(sessionId))) throw new BadRequestException('Choose an exam session');
    const data = await this.db.withTenant(p.tenantId, (tx) => build(tx, r, sessionId && UUID.test(sessionId) ? sessionId : null));
    if (format === 'csv') {
      res.setHeader('content-type', 'text/csv; charset=utf-8');
      res.setHeader('content-disposition', `attachment; filename="${r}.csv"`);
      return csv([data.columns.map((c) => c.label), ...data.rows.map((row) => data.columns.map((c) => row[c.key] as unknown)), ...(data.totals ? [data.columns.map((c) => data.totals![c.key] as unknown)] : [])]);
    }
    return data;
  }
}

async function bands(tx: Tx): Promise<ClassBand[]> {
  const [row] = await tx.select().from(resultClassBands);
  return row?.bands ?? DEFAULT_BANDS;
}

/** Each candidate's result in the session, with roll number, class and whether it is withheld. */
async function results(tx: Tx, sessionId: string) {
  return rowsOf<{ result_id: string; student_id: string; roll_no: string; name: string; section: string; section_id: string; sgpa: number; cgpa: number; credits_attempted: number; credits_earned: number; outcome: string; withheld: string | null; gender: string | null; category: string | null }>(
    tx,
    sql`select r.id as result_id, st.id as student_id, st.roll_no, st.full_name as name, sec.display_name as section, sec.id as section_id, r.sgpa::float8 as sgpa, r.cgpa::float8 as cgpa,
        r.credits_attempted::float8 as credits_attempted, r.credits_earned::float8 as credits_earned, r.outcome,
        (select w.reason from result_withholds w where w.session_id = r.session_id and w.student_id = r.student_id and w.status = 'held' limit 1) as withheld,
        a.gender, a.category
      from exam_results r join students st on st.id = r.student_id join sections sec on sec.id = st.section_id left join applications a on a.id = st.application_id
      where r.session_id = ${sessionId}::uuid order by sec.display_name, st.roll_no`,
  );
}

async function lines(tx: Tx, sessionId: string) {
  return rowsOf<{ result_id: string; student_id: string; subject_id: string; code: string; subject: string; percent: number; grade: string; passed: boolean; credits: number; section_id: string }>(
    tx,
    sql`select l.result_id, r.student_id, l.subject_id, sub.code, sub.name as subject, l.percent::float8 as percent, l.grade, l.passed, l.credits::float8 as credits, st.section_id
      from exam_result_lines l join exam_results r on r.id = l.result_id join subjects sub on sub.id = l.subject_id join students st on st.id = r.student_id
      where r.session_id = ${sessionId}::uuid order by sub.code`,
  );
}

/** Students who failed any subject in an earlier published attempt of the programme (repeaters). */
async function repeaters(tx: Tx, programId: string): Promise<Set<string>> {
  const rows = await rowsOf<{ student_id: string }>(tx, sql`select distinct r.student_id from exam_result_lines l join exam_results r on r.id = l.result_id join exam_sessions s on s.id = r.session_id where s.program_id = ${programId}::uuid and s.status in ('published', 'locked') and not l.passed`);
  return new Set(rows.map((r) => r.student_id));
}

async function build(tx: Tx, report: CellReport, sessionId: string | null): Promise<ReportData> {
  const s = sessionId ? await loadSession(tx, sessionId) : null;
  switch (report) {
    case 'gazette': {
      const rs = await results(tx, s!.id);
      const ls = await lines(tx, s!.id);
      const codes = [...new Set(ls.map((l) => l.code))].sort();
      return {
        report,
        columns: [...cols(['rollNo', 'Roll no'], ['name', 'Name'], ['section', 'Class']), ...codes.map((c) => ({ key: `sub:${c}`, label: c })), ...cols(['sgpa', 'SGPA'], ['cgpa', 'CGPA'], ['result', 'Result'])],
        rows: rs.map((r) => {
          const mine = ls.filter((l) => l.result_id === r.result_id);
          return { rollNo: r.roll_no, name: r.name, section: r.section, ...Object.fromEntries(codes.map((c) => [`sub:${c}`, r.withheld ? '' : (mine.find((l) => l.code === c)?.grade ?? '')])), sgpa: r.withheld ? '' : r.sgpa, cgpa: r.withheld ? '' : r.cgpa, result: r.withheld ? 'WITHHELD' : r.outcome === 'pass' ? 'PASS' : 'FAIL' };
        }),
      };
    }
    case 'result_register': {
      const rs = await results(tx, s!.id);
      const aff = await resolveAffiliation(tx, s!.programId);
      const bs = await bands(tx);
      const ls = await lines(tx, s!.id);
      return {
        report,
        columns: cols(['rollNo', 'Roll no'], ['name', 'Name'], ['section', 'Class'], ['creditsAttempted', 'Credits registered'], ['creditsEarned', 'Credits earned'], ['sgpa', 'SGPA'], ['cgpa', 'CGPA'], ['percent', 'Percent'], ['class', 'Class / division'], ['result', 'Result']),
        rows: rs.map((r) => {
          const mine = ls.filter((l) => l.result_id === r.result_id);
          const percent = mine.length ? Math.round((mine.reduce((a, l) => a + l.percent, 0) / mine.length) * 100) / 100 : null;
          const passed = r.outcome === 'pass';
          const cls = aff ? (classify(aff.rules, { passed, cgpa: r.cgpa, percent: aff.rules.percentage.basis === 'cgpa' ? percentEquivalent(aff.rules, { cgpa: r.cgpa, marksPercent: percent }) : percent, firstAttempt: mine.every((l) => l.passed) }) ?? (passed ? 'Pass' : 'Fail')) : percent === null ? '' : classOf(bs, percent, passed);
          return { rollNo: r.roll_no, name: r.name, section: r.section, creditsAttempted: r.credits_attempted, creditsEarned: r.credits_earned, sgpa: r.withheld ? '' : r.sgpa, cgpa: r.withheld ? '' : r.cgpa, percent: r.withheld ? '' : percent, class: r.withheld ? 'Withheld' : cls, result: r.withheld ? 'WITHHELD' : passed ? 'PASS' : 'FAIL' };
        }),
      };
    }
    case 'pass_by_course': {
      const ls = await lines(tx, s!.id);
      const bySub = new Map<string, typeof ls>();
      for (const l of ls) bySub.set(l.code, [...(bySub.get(l.code) ?? []), l]);
      const rows = [...bySub].map(([code, list]) => ({ code, subject: list[0].subject, ...passStats(list) }));
      return { report, columns: cols(['code', 'Code'], ['subject', 'Subject'], ['appeared', 'Appeared'], ['passed', 'Passed'], ['failed', 'Failed'], ['passPercent', 'Pass %'], ['mean', 'Mean %'], ['highest', 'Highest %']), rows, totals: { code: 'Total', ...passStats(ls) } };
    }
    case 'pass_by_teacher': {
      const ls = await lines(tx, s!.id);
      const teachers = await rowsOf<{ section_id: string; subject_id: string; teacher: string }>(
        tx,
        sql`select distinct ts.section_id, ts.subject_id, u.full_name as teacher from timetable_slots ts join users u on u.id = ts.teacher_id where ts.academic_year_id = ${s!.academicYearId}::uuid`,
      );
      const groups = new Map<string, { teacher: string; code: string; subject: string; list: typeof ls }>();
      for (const l of ls) {
        const names = teachers.filter((t) => t.section_id === l.section_id && t.subject_id === l.subject_id).map((t) => t.teacher);
        for (const teacher of names.length ? names : ['Not assigned']) {
          const key = `${teacher}|${l.code}`;
          const g = groups.get(key) ?? { teacher, code: l.code, subject: l.subject, list: [] };
          g.list.push(l);
          groups.set(key, g);
        }
      }
      const rows = [...groups.values()].sort((a, b) => a.teacher.localeCompare(b.teacher) || a.code.localeCompare(b.code)).map((g) => ({ teacher: g.teacher, code: g.code, subject: g.subject, ...passStats(g.list) }));
      return { report, columns: cols(['teacher', 'Teacher'], ['code', 'Code'], ['subject', 'Subject'], ['appeared', 'Appeared'], ['passed', 'Passed'], ['passPercent', 'Pass %'], ['mean', 'Mean %']), rows };
    }
    case 'pass_by_section': {
      const ls = await lines(tx, s!.id);
      const names = new Map((await rowsOf<{ id: string; name: string }>(tx, sql`select id, display_name as name from sections where id in (select st.section_id from exam_results r join students st on st.id = r.student_id where r.session_id = ${s!.id}::uuid)`)).map((x) => [x.id, x.name]));
      const groups = new Map<string, typeof ls>();
      for (const l of ls) groups.set(`${l.section_id}|${l.code}`, [...(groups.get(`${l.section_id}|${l.code}`) ?? []), l]);
      const rows = [...groups.values()]
        .map((list) => ({ section: names.get(list[0].section_id) ?? '', code: list[0].code, subject: list[0].subject, ...passStats(list) }))
        .sort((a, b) => a.section.localeCompare(b.section) || a.code.localeCompare(b.code));
      return { report, columns: cols(['section', 'Class'], ['code', 'Code'], ['subject', 'Subject'], ['appeared', 'Appeared'], ['passed', 'Passed'], ['failed', 'Failed'], ['passPercent', 'Pass %'], ['mean', 'Mean %']), rows, totals: { section: 'Total', ...passStats(ls) } };
    }
    case 'grade_distribution': {
      const ls = await lines(tx, s!.id);
      const dist = gradeDistribution(ls);
      return { report, columns: [...cols(['code', 'Code'], ['subject', 'Subject'], ['appeared', 'Appeared']), ...dist.grades.map((g) => ({ key: `g:${g}`, label: g }))], rows: dist.rows, totals: dist.totals };
    }
    case 'year_comparison': {
      // The same examination (programme, term and kind) in every year, oldest first, for the trend.
      const rows = await rowsOf<{ session: string; year: string; starts_on: string; appeared: number; passed: number; mean_sgpa: number | null; top_sgpa: number | null }>(
        tx,
        sql`select s.name as session, y.label as year, s.starts_on::text as starts_on, count(r.id)::int as appeared, count(r.id) filter (where r.outcome = 'pass')::int as passed,
              round(avg(r.sgpa), 2)::float8 as mean_sgpa, max(r.sgpa)::float8 as top_sgpa
            from exam_sessions s join academic_years y on y.id = s.academic_year_id left join exam_results r on r.session_id = s.id
            where s.program_id = ${s!.programId}::uuid and s.term = ${s!.term} and s.kind = ${s!.kind} and (s.status in ('processed', 'published', 'locked') or s.id = ${s!.id}::uuid)
            group by s.id, s.name, y.label, s.starts_on order by s.starts_on`,
      );
      return {
        report,
        columns: cols(['year', 'Academic year'], ['session', 'Examination'], ['appeared', 'Appeared'], ['passed', 'Passed'], ['passPercent', 'Pass %'], ['change', 'Change in pass %'], ['meanSgpa', 'Mean SGPA'], ['topSgpa', 'Top SGPA']),
        rows: yearTrend(rows.map((r) => ({ year: r.year, session: r.session, appeared: r.appeared, passed: r.passed, meanSgpa: r.mean_sgpa, topSgpa: r.top_sgpa }))),
      };
    }
    case 'toppers':
    case 'ranks': {
      const rs = (await results(tx, s!.id)).filter((r) => !r.withheld);
      const cfg = await cellSettings(tx);
      const rep = await repeaters(tx, s!.programId);
      const ranked = rankList(rs.map((r) => ({ studentId: r.student_id, score: r.sgpa, passed: r.outcome === 'pass', repeater: rep.has(r.student_id), rollNo: r.roll_no, name: r.name, section: r.section, sectionId: r.section_id, cgpa: r.cgpa })), { excludeRepeaters: cfg.ranks.excludeRepeaters });
      const classRank = new Map<string, number | null>();
      for (const sec of new Set(rs.map((r) => r.section_id))) for (const x of rankList(ranked.filter((r) => r.sectionId === sec), { excludeRepeaters: cfg.ranks.excludeRepeaters })) classRank.set(x.studentId, x.rank);
      const rows = ranked.map((r) => ({ rank: r.rank ?? '', classRank: classRank.get(r.studentId) ?? '', rollNo: r.rollNo, name: r.name, section: r.section, sgpa: r.score, cgpa: r.cgpa, note: r.passed ? (r.repeater && cfg.ranks.excludeRepeaters ? 'Repeater: not ranked' : '') : 'Not passed' }));
      return { report, columns: cols(['rank', 'Rank'], ['classRank', 'Class rank'], ['rollNo', 'Roll no'], ['name', 'Name'], ['section', 'Class'], ['sgpa', 'SGPA'], ['cgpa', 'CGPA'], ['note', 'Note']), rows: report === 'toppers' ? rows.filter((r) => typeof r.rank === 'number' && r.rank <= 10) : rows };
    }
    case 'analysis': {
      const rs = (await results(tx, s!.id)).filter((r) => !r.withheld);
      const group = (key: 'gender' | 'category', label: string) => {
        const m = new Map<string, typeof rs>();
        for (const r of rs) m.set(r[key]?.trim() || 'Not recorded', [...(m.get(r[key]?.trim() || 'Not recorded') ?? []), r]);
        return [...m].sort(([a], [b]) => a.localeCompare(b)).map(([value, list]) => ({ by: label, value, appeared: list.length, passed: list.filter((x) => x.outcome === 'pass').length, passPercent: pct(list.filter((x) => x.outcome === 'pass').length, list.length), meanSgpa: list.length ? Math.round((list.reduce((a, x) => a + x.sgpa, 0) / list.length) * 100) / 100 : 0 }));
      };
      return { report, columns: cols(['by', 'By'], ['value', 'Group'], ['appeared', 'Appeared'], ['passed', 'Passed'], ['passPercent', 'Pass %'], ['meanSgpa', 'Mean SGPA']), rows: [...group('gender', 'Gender'), ...group('category', 'Category')] };
    }
    case 'distinctions': {
      const rs = (await results(tx, s!.id)).filter((r) => !r.withheld && r.outcome === 'pass');
      const ls = await lines(tx, s!.id);
      const bs = await bands(tx);
      const top = [...bs].sort((a, b) => b.minPercent - a.minPercent)[0];
      const rows = rs
        .map((r) => {
          const mine = ls.filter((l) => l.result_id === r.result_id);
          const percent = mine.length ? Math.round((mine.reduce((a, l) => a + l.percent, 0) / mine.length) * 100) / 100 : 0;
          return { rollNo: r.roll_no, name: r.name, section: r.section, percent, sgpa: r.sgpa, subjects: mine.filter((l) => top && l.percent >= top.minPercent).map((l) => l.code).join(' ') };
        })
        .filter((r) => (top ? r.percent >= top.minPercent : false) || r.subjects.length > 0)
        .sort((a, b) => b.percent - a.percent);
      return { report, columns: cols(['rollNo', 'Roll no'], ['name', 'Name'], ['section', 'Class'], ['percent', 'Percent'], ['sgpa', 'SGPA'], ['subjects', 'Distinction in']), rows };
    }
    case 'gold_medals': {
      const cfg = await cellSettings(tx);
      const cands = await rowsOf<{ student_id: string; roll_no: string; name: string; cgpa: number; failed: number; final: boolean; passed: boolean }>(
        tx,
        sql`with latest as (select distinct on (r.student_id) r.student_id, r.cgpa::float8 as cgpa, s.term, r.outcome from exam_results r join exam_sessions s on s.id = r.session_id
              where s.program_id = ${s!.programId}::uuid and s.status in ('published', 'locked') order by r.student_id, s.starts_on desc)
            select l.student_id, st.roll_no, st.full_name as name, l.cgpa, l.term >= pr.term_count as final, l.outcome = 'pass' as passed,
              (select count(*)::int from exam_result_lines x join exam_results y on y.id = x.result_id join exam_sessions z on z.id = y.session_id where y.student_id = l.student_id and z.program_id = ${s!.programId}::uuid and not x.passed) as failed
            from latest l join students st on st.id = l.student_id join programs pr on pr.id = ${s!.programId}::uuid
            where not exists (select 1 from result_withholds w where w.student_id = l.student_id and w.status = 'held')`,
      );
      const pool = cands.map((c) => ({ studentId: c.student_id, rollNo: c.roll_no, name: c.name, cgpa: c.cgpa, firstAttempt: c.failed === 0, completed: c.final && c.passed }));
      const medal = new Set(goldMedallists(pool, cfg.medal).map((m) => m.studentId));
      const rows = pool.filter((c) => c.completed).sort((a, b) => b.cgpa - a.cgpa).slice(0, 25).map((c) => ({ rollNo: c.rollNo, name: c.name, cgpa: c.cgpa, firstAttempt: c.firstAttempt ? 'Yes' : 'No', medal: medal.has(c.studentId) ? 'Gold medal' : '' }));
      return { report, columns: cols(['rollNo', 'Roll no'], ['name', 'Name'], ['cgpa', 'CGPA'], ['firstAttempt', 'All first attempts'], ['medal', 'Award']), rows };
    }
    case 'nirf': {
      const rows = await rowsOf<{ programme: string; final_year: number; graduated: number; in_time: number }>(
        tx,
        sql`with fin as (select distinct on (r.student_id) r.student_id, r.outcome from exam_results r join exam_sessions s on s.id = r.session_id join programs pr on pr.id = s.program_id
              where s.program_id = ${s!.programId}::uuid and s.status in ('published', 'locked') and s.term >= pr.term_count order by r.student_id, s.starts_on desc),
            back as (select distinct y.student_id from exam_result_lines x join exam_results y on y.id = x.result_id join exam_sessions z on z.id = y.session_id where z.program_id = ${s!.programId}::uuid and z.status in ('published', 'locked') and not x.passed)
          select pr.name as programme, count(*)::int as final_year, count(*) filter (where fin.outcome = 'pass')::int as graduated,
                 count(*) filter (where fin.outcome = 'pass' and fin.student_id not in (select student_id from back))::int as in_time
            from fin join programs pr on pr.id = ${s!.programId}::uuid group by pr.name`,
      );
      return {
        report,
        columns: cols(['programme', 'Programme'], ['finalYear', 'Students in the final year'], ['graduated', 'Graduated'], ['inTime', 'Graduated in the stipulated time'], ['percent', 'Percent in time']),
        rows: rows.map((r) => ({ programme: r.programme, finalYear: r.final_year, graduated: r.graduated, inTime: r.in_time, percent: pct(r.in_time, r.final_year) })),
      };
    }
    case 'exam_fees': {
      const rows = await rowsOf<{ roll_no: string; name: string; papers: number; amount: number; status: string; receipt_no: string | null; note: string | null }>(
        tx,
        sql`select st.roll_no, st.full_name as name, f.papers, f.amount_paise::float8 as amount, f.status, f.receipt_no, f.note from exam_fee_dues f join students st on st.id = f.student_id where f.session_id = ${s!.id}::uuid order by st.roll_no`,
      );
      const sum = (st?: string) => rows.filter((r) => !st || r.status === st).reduce((a, r) => a + r.amount, 0) / 100;
      return {
        report,
        columns: cols(['rollNo', 'Roll no'], ['name', 'Name'], ['papers', 'Papers'], ['amount', 'Fee (Rs)'], ['status', 'Status'], ['receiptNo', 'Receipt'], ['note', 'Note']),
        rows: rows.map((r) => ({ rollNo: r.roll_no, name: r.name, papers: r.papers, amount: r.amount / 100, status: r.status, receiptNo: r.receipt_no ?? '', note: r.note ?? '' })),
        totals: { rollNo: 'Total', name: `Collected Rs ${sum('paid')}, due Rs ${sum('due')}, waived Rs ${sum('waived')}`, amount: sum() },
      };
    }
    case 'withheld': {
      const rows = await rowsOf<Row>(
        tx,
        sql`select st.roll_no as "rollNo", st.full_name as name, w.reason, w.note, w.status, to_char(w.held_at, 'YYYY-MM-DD') as "heldOn", to_char(w.released_at, 'YYYY-MM-DD') as "releasedOn", w.release_note as "releaseNote"
          from result_withholds w join students st on st.id = w.student_id where w.session_id = ${s!.id}::uuid order by w.status, st.roll_no`,
      );
      return { report, columns: cols(['rollNo', 'Roll no'], ['name', 'Name'], ['reason', 'Reason'], ['note', 'Note'], ['status', 'Status'], ['heldOn', 'Held on'], ['releasedOn', 'Released on'], ['releaseNote', 'Release note']), rows };
    }
    case 'pending_certificates': {
      const rows = await rowsOf<Row>(
        tx,
        sql`select 'Academic document' as source, d.kind as document, st.roll_no as "rollNo", st.full_name as name,
              case when d.status = 'issued' then 'Reissue needed' else d.status end as status, to_char(d.created_at, 'YYYY-MM-DD') as since,
              (current_date - coalesce(d.superseded_at, d.created_at)::date)::int as days, coalesce(d.superseded_reason, d.purpose) as note
            from academic_doc_requests d join students st on st.id = d.student_id
            where d.status in ('requested', 'approved') or (d.status = 'issued' and d.superseded_at is not null and not exists (select 1 from academic_doc_requests n where n.original_id = d.id and n.status = 'issued'))
          union all
          select 'Certificate', coalesce(t.name, c.purpose), coalesce(st.roll_no, ''), coalesce(st.full_name, u.full_name), c.status, to_char(c.created_at, 'YYYY-MM-DD'), (current_date - c.created_at::date)::int, c.purpose
            from certificates c left join certificate_templates t on t.id = c.template_id left join students st on st.id = c.student_id left join users u on u.id = c.staff_user_id
            where c.status in ('requested', 'approved')
          order by days desc`,
      );
      return { report, columns: cols(['source', 'Register'], ['document', 'Document'], ['rollNo', 'Roll no'], ['name', 'Name'], ['status', 'Status'], ['since', 'Since'], ['days', 'Days pending'], ['note', 'Note']), rows };
    }
    case 'remuneration': {
      const cfg = await cellSettings(tx);
      const scope = s ? sql`and d.session_id = ${s.id}::uuid` : sql``;
      const camp = s ? sql`and c.session_id = ${s.id}::uuid` : sql``;
      const people = await rowsOf<{ id: string; name: string; inv: number; chief: number; scripts: number; chief_days: number }>(
        tx,
        sql`with duty as (select d.staff_id as id, count(*) filter (where d.role = 'invigilator')::int as inv, count(*) filter (where d.role = 'chief')::int as chief from invigilation_duties d where true ${scope} group by d.staff_id),
            val as (select b.examiner_id as id, sum(b.valued)::int as scripts from valuation_bundles b join valuation_camps c on c.id = b.camp_id where b.examiner_id is not null ${camp} group by b.examiner_id),
            chief as (select c.chief_examiner_id as id, sum((select count(distinct d2.day) from valuation_daily_counts d2 join valuation_bundles b2 on b2.id = d2.bundle_id where b2.camp_id = c.id))::int as chief_days from valuation_camps c where c.chief_examiner_id is not null ${camp} group by c.chief_examiner_id),
            ids as (select id from duty union select id from val union select id from chief)
          select u.id, u.full_name as name, coalesce(duty.inv, 0) as inv, coalesce(duty.chief, 0) as chief, coalesce(val.scripts, 0) as scripts, coalesce(chief.chief_days, 0) as chief_days
            from ids join users u on u.id = ids.id left join duty on duty.id = ids.id left join val on val.id = ids.id left join chief on chief.id = ids.id order by u.full_name`,
      );
      const rows = people.map((x) => {
        const pay = remuneration(cfg.rates, { invigilations: x.inv, chiefDuties: x.chief, scripts: x.scripts, chiefDays: x.chief_days });
        return { name: x.name, invigilations: x.inv, chiefDuties: x.chief, scripts: x.scripts, chiefDays: x.chief_days, duties: pay.dutiesPaise / 100, valuation: pay.valuationPaise / 100, total: pay.totalPaise / 100 };
      });
      return { report, columns: cols(['name', 'Name'], ['invigilations', 'Invigilation duties'], ['chiefDuties', 'Chief superintendent'], ['scripts', 'Scripts valued'], ['chiefDays', 'Chief examiner days'], ['duties', 'Duties (Rs)'], ['valuation', 'Valuation (Rs)'], ['total', 'Total (Rs)']), rows, totals: { name: 'Total', total: rows.reduce((a, r) => a + r.total, 0) } };
    }
    case 'answer_sheets': {
      const rows = await rowsOf<Row>(
        tx,
        sql`select to_char(a.exam_date, 'YYYY-MM-DD') as date, a.sitting, r.name as hall, a.received, a.issued, a.additional, a.spoiled, a.returned, a.present, a.absent, a.malpractice, a.status, a.remarks
          from answer_sheet_accounts a join rooms r on r.id = a.room_id where a.session_id = ${s!.id}::uuid order by a.exam_date, a.sitting, r.name`,
      );
      const sum = (k: string) => rows.reduce((a, r) => a + Number(r[k] ?? 0), 0);
      return { report, columns: cols(['date', 'Date'], ['sitting', 'Sitting'], ['hall', 'Hall'], ['received', 'Received'], ['issued', 'Issued'], ['additional', 'Additional'], ['spoiled', 'Spoiled'], ['returned', 'Returned'], ['present', 'Present'], ['absent', 'Absent'], ['malpractice', 'Malpractice'], ['status', 'Status'], ['remarks', 'Remarks']), rows, totals: { date: 'Total', ...Object.fromEntries(['received', 'issued', 'additional', 'spoiled', 'returned', 'present', 'absent', 'malpractice'].map((k) => [k, sum(k)])) } };
    }
    case 'mismatches': {
      const rows = await rowsOf<Row>(
        tx,
        sql`select sub.code, st.roll_no as "rollNo", st.full_name as name, case when c.first_absent then 'AB' else c.first_marks::text end as first, case when c.second_absent then 'AB' else c.second_marks::text end as second, c.status,
              case when c.resolved_absent then 'AB' else c.resolved_marks::text end as resolved, c.note
          from mark_entry_checks c join exam_papers p on p.id = c.paper_id join subjects sub on sub.id = p.subject_id join students st on st.id = c.student_id
          where p.session_id = ${s!.id}::uuid and c.status in ('mismatch', 'resolved') order by sub.code, st.roll_no`,
      );
      return { report, columns: cols(['code', 'Paper'], ['rollNo', 'Roll no'], ['name', 'Name'], ['first', 'First entry'], ['second', 'Second entry'], ['status', 'Status'], ['resolved', 'Settled at'], ['note', 'Note']), rows };
    }
  }
}

/** Candidates per grade in each paper (grades ordered from the best mean percent down), with the totals. */
export function gradeDistribution(ls: { code: string; subject: string; grade: string; percent: number }[]) {
  const meanOf = new Map<string, { sum: number; n: number }>();
  for (const l of ls) {
    const m = meanOf.get(l.grade) ?? { sum: 0, n: 0 };
    meanOf.set(l.grade, { sum: m.sum + l.percent, n: m.n + 1 });
  }
  const grades = [...meanOf].sort(([, a], [, b]) => b.sum / b.n - a.sum / a.n).map(([g]) => g);
  const bySub = new Map<string, typeof ls>();
  for (const l of ls) bySub.set(l.code, [...(bySub.get(l.code) ?? []), l]);
  const count = (list: typeof ls) => Object.fromEntries(grades.map((g) => [`g:${g}`, list.filter((l) => l.grade === g).length]));
  const rows = [...bySub].map(([code, list]) => ({ code, subject: list[0].subject, appeared: list.length, ...count(list) }));
  return { grades, rows, totals: { code: 'Total', subject: '', appeared: ls.length, ...count(ls) } };
}

/** Pass percentage of each year and its change from the year before (percentage points). */
export function yearTrend(rows: { year: string; session: string; appeared: number; passed: number; meanSgpa: number | null; topSgpa: number | null }[]) {
  let prev: number | null = null;
  return rows.map((r) => {
    const passPercent = pct(r.passed, r.appeared);
    const change = prev === null || r.appeared === 0 ? '' : Math.round((passPercent - prev) * 100) / 100;
    if (r.appeared) prev = passPercent;
    return { ...r, passPercent, change, meanSgpa: r.meanSgpa ?? '', topSgpa: r.topSgpa ?? '' };
  });
}
