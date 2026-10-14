import { Controller, Get } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { Auth, CurrentPrincipal, STAFF_ADMIN_ROLES } from '../auth/auth.decorators.js';
import type { UserPrincipal } from '../auth/principal.js';
import { Clock } from '../common/time.js';
import { tenantToday } from '../common/today.js';
import { DbService } from '../db/db.service.js';

type CampusFigures = {
  id: string;
  name: string;
  code: string | null;
  city: string | null;
  active: boolean;
  head: string | null;
  programmes: number;
  classes: number;
  students: number;
  marked_today: number;
  present_today: number;
  fees_due_paise: number;
  fees_overdue_paise: number;
  buildings: number;
  rooms: number;
};

/** Settings > Campuses: one row of figures per campus (programmes, classes and students this year, attendance today, fees due) and the totals. */
@Controller('v1/admin/institution')
export class CampusOverviewController {
  constructor(
    private readonly db: DbService,
    private readonly clock: Clock,
  ) {}

  @Get('campus-overview')
  @Auth('user', [...STAFF_ADMIN_ROLES, 'university_admin'])
  overview(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const today = await tenantToday(tx, this.clock);
      const { rows } = await tx.execute<CampusFigures>(sql`
        with cur as (select id from academic_years where is_current limit 1)
        select c.id, c.name, c.code, c.city, c.active, u.full_name as head,
          (select count(*)::int from programs p where p.campus_id = c.id) as programmes,
          (select count(*)::int from sections s join programs p on p.id = s.program_id where p.campus_id = c.id and s.academic_year_id in (select id from cur)) as classes,
          (select count(*)::int from students st join sections s on s.id = st.section_id join programs p on p.id = s.program_id where p.campus_id = c.id and st.status = 'active') as students,
          (select count(distinct a.student_id)::int from attendance_records a join sections s on s.id = a.section_id join programs p on p.id = s.program_id where p.campus_id = c.id and a.date = ${today}::date) as marked_today,
          (select count(distinct a.student_id)::int from attendance_records a join sections s on s.id = a.section_id join programs p on p.id = s.program_id where p.campus_id = c.id and a.date = ${today}::date and a.status in ('present', 'late')) as present_today,
          (select coalesce(sum(i.amount_paise - i.paid_paise), 0)::bigint from fee_invoices i join students st on st.id = i.student_id join sections s on s.id = st.section_id join programs p on p.id = s.program_id where p.campus_id = c.id and i.status = 'due') as fees_due_paise,
          (select coalesce(sum(i.amount_paise - i.paid_paise), 0)::bigint from fee_invoices i join students st on st.id = i.student_id join sections s on s.id = st.section_id join programs p on p.id = s.program_id where p.campus_id = c.id and i.status = 'due' and i.due_on < ${today}::date) as fees_overdue_paise,
          (select count(*)::int from buildings b where b.campus_id = c.id) as buildings,
          (select count(*)::int from rooms r where r.campus_id = c.id) as rooms
        from campuses c left join users u on u.id = c.head_user_id
        order by c.sort_order, c.name`);
      const campuses = rows.map((r) => ({
        id: r.id,
        name: r.name,
        code: r.code,
        city: r.city,
        active: r.active,
        head: r.head,
        programmes: r.programmes,
        classes: r.classes,
        students: r.students,
        attendanceToday: r.marked_today ? Math.round((r.present_today / r.marked_today) * 1000) / 10 : null,
        feesDuePaise: Number(r.fees_due_paise),
        feesOverduePaise: Number(r.fees_overdue_paise),
        buildings: r.buildings,
        rooms: r.rooms,
      }));
      const sum = (k: 'programmes' | 'classes' | 'students' | 'feesDuePaise' | 'feesOverduePaise' | 'buildings' | 'rooms') => campuses.reduce((a, c) => a + c[k], 0);
      const marked = rows.reduce((a, r) => a + r.marked_today, 0);
      const present = rows.reduce((a, r) => a + r.present_today, 0);
      return {
        today,
        campuses,
        totals: { campuses: campuses.length, programmes: sum('programmes'), classes: sum('classes'), students: sum('students'), attendanceToday: marked ? Math.round((present / marked) * 1000) / 10 : null, feesDuePaise: sum('feesDuePaise'), feesOverduePaise: sum('feesOverduePaise'), buildings: sum('buildings'), rooms: sum('rooms') },
      };
    });
  }
}
