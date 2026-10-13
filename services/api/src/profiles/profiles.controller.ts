import { Controller, ForbiddenException, Get, Module, NotFoundException, Param, ParseUUIDPipe } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { RoleName, UserPrincipal } from '../auth/principal.js';
import { assertCanSeeStudent } from '../common/student-access.js';
import { DbService } from '../db/db.service.js';

const STUDENT_STAFF: RoleName[] = ['principal', 'tenant_admin', 'hod', 'teacher', 'accountant', 'admissions_officer', 'counsellor', 'exam_controller'];
const STAFF_VIEWERS: RoleName[] = ['principal', 'tenant_admin', 'hr_manager', 'hod'];

const rows = <T>(r: { rows: unknown[] }) => r.rows as T[];

/** Profile pages (redesign v2): attendance for a student, and a staff member's classes, attendance, pay and mentees. */
@Controller('v1/profiles')
export class ProfilesController {
  constructor(private readonly db: DbService) {}

  /** Attendance over the last six months: totals and per month (present includes late). */
  @Get('students/:id/attendance')
  @Auth('user')
  studentAttendance(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      await assertCanSeeStudent(tx, p, id, STUDENT_STAFF);
      const months = rows<{ month: string; present: number; total: number }>(
        await tx.execute(sql`select to_char(date, 'YYYY-MM') as month, count(*) filter (where status in ('present','late'))::int as present, count(*)::int as total
          from attendance_records where student_id = ${id} and date >= (current_date - interval '6 months') group by 1 order by 1`),
      );
      const present = months.reduce((a, m) => a + m.present, 0);
      const total = months.reduce((a, m) => a + m.total, 0);
      const mentor = rows<{ id: string; fullName: string; startedOn: string }>(
        await tx.execute(sql`select u.id, u.full_name as "fullName", m.started_on::text as "startedOn" from mentor_assignments m join users u on u.id = m.mentor_user_id where m.student_id = ${id} and m.ended_on is null limit 1`),
      )[0] ?? null;
      return { present, total, percent: total ? Math.round((present / total) * 1000) / 10 : null, months, mentor };
    });
  }

  /** A staff member: what they teach, their attendance this year, recent payslips and mentees. Leaders, HR, or the person. */
  @Get('staff/:id')
  @Auth('user')
  staff(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    if (p.userId !== id && !p.roles.some((r) => STAFF_VIEWERS.includes(r))) throw new ForbiddenException();
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [u] = rows<{ id: string }>(await tx.execute(sql`select id from users where id = ${id}`));
      if (!u) throw new NotFoundException('Staff member not found');
      const classes = rows<{ sectionId: string; section: string; subject: string; periods: number }>(
        await tx.execute(sql`select s.id as "sectionId", s.display_name as section, sub.name as subject, count(*)::int as periods
          from timetable_slots t join sections s on s.id = t.section_id join subjects sub on sub.id = t.subject_id
          where t.teacher_id = ${id} and t.archived_at is null group by 1, 2, 3 order by 2, 3`),
      );
      const [att] = rows<{ present: number; absent: number; leave: number; total: number }>(
        await tx.execute(sql`select count(*) filter (where status = 'present')::int as present, count(*) filter (where status = 'absent')::int as absent,
          count(*) filter (where status = 'on_leave')::int as leave, count(*)::int as total from staff_attendance where user_id = ${id} and date >= (current_date - interval '12 months')`),
      );
      const payslips = rows<{ id: string; month: string; netPaise: number; grossPaise: number; status: string }>(
        await tx.execute(sql`select ps.id, r.month, ps.net_paise::float as "netPaise", ps.gross_paise::float as "grossPaise", r.status
          from payslips ps join payroll_runs r on r.id = ps.run_id where ps.user_id = ${id} order by r.month desc limit 6`),
      );
      const mentees = rows<{ studentId: string; fullName: string; section: string }>(
        await tx.execute(sql`select st.id as "studentId", st.full_name as "fullName", s.display_name as section from mentor_assignments m
          join students st on st.id = m.student_id join sections s on s.id = st.section_id where m.mentor_user_id = ${id} and m.ended_on is null order by st.full_name limit 100`),
      );
      return { classes, attendance: { ...att, percent: att.total ? Math.round(((att.present + att.leave) / att.total) * 1000) / 10 : null }, payslips, mentees };
    });
  }
}

@Module({ controllers: [ProfilesController] })
export class ProfilesModule {}
