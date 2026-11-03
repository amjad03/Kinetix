#!/usr/bin/env node
// A large institution for load tests (docs/operations/PERFORMANCE.md): 20,000 students with a guardian each, 800 staff,
// 334 sections, a timetable, three years of daily attendance, marks for two assessments per subject per term and fee
// invoices with payments. Set-based SQL (generate_series), so it takes minutes, not hours. Never against production.
//
//   DATABASE_URL=postgres://zynetix_owner:...@localhost:5432/zynetix_perf node scripts/perf/seed-large-tenant.mjs
//   (env: STUDENTS=20000 STAFF=800 YEARS=3 SLUG=perf-college; every account's password is PERF_PASSWORD, default perf-pass-123)
import argon2 from 'argon2';
import pg from 'pg';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set (the owner role of a scratch database)');
if (process.env.NODE_ENV === 'production' || process.env.DEPLOYMENT === 'production') throw new Error('Refusing to seed load-test data in production');
const STUDENTS = Number(process.env.STUDENTS ?? 20000);
const STAFF = Number(process.env.STAFF ?? 800);
const YEARS = Number(process.env.YEARS ?? 3);
const SLUG = process.env.SLUG ?? 'perf-college';
const PER_SECTION = 60;
const PROGRAMS = 10;

const pool = new pg.Pool({ connectionString: url, max: 1 });
const q = async (label, text, params = []) => {
  const t = Date.now();
  const r = await pool.query(text, params);
  console.log(`${label.padEnd(28)} ${String(r.rowCount ?? '').padStart(10)} rows  ${((Date.now() - t) / 1000).toFixed(1)}s`);
  return r;
};

const hash = await argon2.hash(process.env.PERF_PASSWORD ?? 'perf-pass-123', { type: argon2.argon2id, memoryCost: 65_536, timeCost: 3, parallelism: 4 });
const exists = await pool.query('select id from tenants where slug = $1', [SLUG]);
if (exists.rowCount) {
  console.log(`Institution ${SLUG} already exists; drop the database to seed again.`);
  await pool.end();
  process.exit(0);
}

const { rows: [tenant] } = await q('tenant', `insert into tenants (slug, name, kind) values ($1, 'Perf College', 'college') returning id`, [SLUG]);
const T = tenant.id;
const { rows: [campus] } = await q('campus', `insert into campuses (tenant_id, name) values ($1, 'Main') returning id`, [T]);
const thisYear = 2026;
await q('academic years', `insert into academic_years (tenant_id, label, starts_on, ends_on, is_current)
  select $1, (y)::text || '-' || right((y + 1)::text, 2), make_date(y, 6, 1), make_date(y + 1, 4, 30), y = $2::int
  from generate_series($2::int - $3::int + 1, $2::int) y`, [T, thisYear, YEARS]);
const { rows: [year] } = await pool.query('select id from academic_years where tenant_id = $1 and is_current', [T]);

// Staff: principal, admin, accountant, then teachers.
await q('staff users', `insert into users (tenant_id, full_name, email, password_hash)
  select $1, 'Staff ' || g, 'staff' || g || '@perf.zynetix.in', $2 from generate_series(1, $3) g`, [T, hash, STAFF]);
await q('staff roles', `insert into user_roles (tenant_id, user_id, role)
  select $1, u.id, (case when u.email = 'staff1@perf.zynetix.in' then 'principal' when u.email = 'staff2@perf.zynetix.in' then 'tenant_admin' when u.email = 'staff3@perf.zynetix.in' then 'accountant' else 'teacher' end)::role_name
  from users u where u.tenant_id = $1 and u.email like 'staff%'`, [T]);
await q('staff profiles', `insert into staff_profiles (user_id, tenant_id, employee_code)
  select u.id, $1, 'E' || lpad(substring(u.email from 'staff(\\d+)@'), 4, '0') from users u where u.tenant_id = $1 and u.email like 'staff%'`, [T]);

// Programmes, sections (current year), subjects.
const sections = Math.ceil(STUDENTS / PER_SECTION);
await q('programs', `insert into programs (tenant_id, campus_id, name, level, term_count, sort_order)
  select $1, $2, 'Programme ' || g, 'ug', 6, g from generate_series(1, $3) g`, [T, campus.id, PROGRAMS]);
await q('sections', `insert into sections (tenant_id, program_id, academic_year_id, term, name, display_name, sort_order)
  select $1, p.id, $2, 1 + (s.g % 3) * 2, chr(65 + (s.g / $4)::int % 26) || (s.g / ($4 * 26))::text, p.name || ' Sem ' || (1 + (s.g % 3) * 2) || ' ' || chr(65 + (s.g / $4)::int % 26) || (s.g / ($4 * 26))::text, s.g
  from generate_series(0, $3 - 1) s(g) join lateral (select id, name from programs where tenant_id = $1 order by sort_order offset (s.g % $4) limit 1) p on true`, [T, year.id, sections, PROGRAMS]);
await q('subjects', `insert into subjects (tenant_id, program_id, term, code, name, sort_order)
  select $1, p.id, t, 'P' || p.sort_order || '-' || t || '.' || n, 'Subject ' || t || '.' || n, n
  from programs p cross join generate_series(1, 6) t cross join generate_series(1, 6) n where p.tenant_id = $1`, [T]);

// Students and their guardians (each family has a login).
await q('students', `with sec as (select id, row_number() over (order by sort_order) - 1 as i from sections where tenant_id = $1)
  insert into students (tenant_id, section_id, roll_no, full_name, enrolled_on)
  select $1, sec.id, 'R' || lpad((g % $3::int + 1)::text, 3, '0'), 'Student ' || g, make_date($4::int - 1, 6, 1)
  from generate_series(0, $2 - 1) g join sec on sec.i = g / $3`, [T, STUDENTS, PER_SECTION, thisYear]);
await q('guardian users', `insert into users (tenant_id, full_name, email, phone, password_hash)
  select $1, 'Parent of ' || s.full_name, 'parent' || substring(s.full_name from 'Student (\\d+)') || '@perf.zynetix.in', '+9170' || lpad(substring(s.full_name from 'Student (\\d+)'), 8, '0'), $2
  from students s where s.tenant_id = $1`, [T, hash]);
await q('guardian roles', `insert into user_roles (tenant_id, user_id, role, campus_id)
  select $1, u.id, 'guardian', $2 from users u where u.tenant_id = $1 and u.email like 'parent%'`, [T, campus.id]);
await q('analyze (plans)', 'analyze students, users');
await q('guardians', `with s as (select id, substring(full_name from 'Student (\\d+)')::int as n from students where tenant_id = $1),
  u as (select id, substring(email from 'parent(\\d+)@')::int as n from users where tenant_id = $1 and email like 'parent%')
  insert into guardians (tenant_id, user_id, student_id, relation, is_primary) select $1, u.id, s.id, 'father', true from s join u using (n)`, [T]);

// Timetable: six periods a day, Monday to Saturday, teachers round-robin.
await q('timetable', `with t as (select u.id, row_number() over (order by u.email) as i from users u join user_roles r on r.user_id = u.id and r.role = 'teacher' where u.tenant_id = $1),
  n as (select count(*) c from t),
  sec as (select s.id, s.program_id, s.term, row_number() over (order by s.sort_order) as i from sections s where s.tenant_id = $1)
  insert into timetable_slots (tenant_id, academic_year_id, section_id, subject_id, teacher_id, day_of_week, starts_at, ends_at)
  select $1, $2, sec.id, sub.id, t.id, d, make_time(8 + p, 0, 0), make_time(8 + p, 55, 0)
  from sec cross join generate_series(1, 6) d cross join generate_series(1, 6) p
  join subjects sub on sub.program_id = sec.program_id and sub.term = sec.term and sub.sort_order = p
  join t on t.i = 1 + ((sec.i * 6 + p) % (select c from n))`, [T, year.id]);

// Daily attendance for every school day (Monday to Saturday) of the last YEARS years: about 93% present.
const { rows: [marker] } = await pool.query(`select u.id from users u where u.tenant_id = $1 and u.email = 'staff4@perf.zynetix.in'`, [T]);
for (let y = 0; y < YEARS; y++) {
  await q(`attendance year ${y + 1}`, `insert into attendance_records (tenant_id, student_id, section_id, date, status, marked_by, occurred_at)
    select $1, s.id, s.section_id, d::date, (case when hashtext(s.id::text || d::text) % 100 between 0 and 6 then 'absent' else 'present' end)::attendance_status, $2, d + interval '9 hours'
    from students s cross join generate_series(make_date($3::int, 6, 3), make_date($3::int + 1, 3, 31), interval '1 day') d
    where s.tenant_id = $1 and extract(isodow from d) < 7 and hashtext(d::text) % 10 <> 0`, [T, marker.id, thisYear - YEARS + 1 + y]);
}

// Assessments: two per subject for each section, with marks for every student.
await q('assessments', `insert into assessments (tenant_id, section_id, subject_id, title, kind, max_marks, held_on, created_by, mark_status)
  select $1, s.id, sub.id, k.title, 'internal', 50, make_date($2::int, k.m, 15), $3, 'verified'
  from sections s join subjects sub on sub.program_id = s.program_id and sub.term = s.term
  cross join (values ('Internal 1', 8), ('Internal 2', 10)) k(title, m) where s.tenant_id = $1`, [T, thisYear, marker.id]);
await q('marks', `insert into marks (tenant_id, assessment_id, student_id, marks)
  select $1, a.id, st.id, 15 + abs(hashtext(a.id::text || st.id::text)) % 36
  from assessments a join students st on st.section_id = a.section_id where a.tenant_id = $1`, [T]);

// Fees: four instalments a year for each student over YEARS years; older ones paid.
await q('fee invoices', `insert into fee_invoices (tenant_id, student_id, section_id, batch_id, title, amount_paise, paid_paise, due_on, status, created_by, invoice_no)
  select $1::uuid, s.id, s.section_id, md5($1::uuid::text || y || q)::uuid, 'Tuition ' || y || ' Q' || q, 2500000, case when make_date(y, 3 * q, 10) < make_date($2::int, 10, 1) then 2500000 else 0 end, make_date(y, 3 * q, 10),
         (case when make_date(y, 3 * q, 10) < make_date($2::int, 10, 1) then 'paid' else 'due' end)::invoice_status, $3, 'INV-' || y || '-' || q || '-' || substring(s.full_name from 'Student (\\d+)')
  from students s cross join generate_series($2::int - $4::int + 1, $2::int) y cross join generate_series(1, 4) q where s.tenant_id = $1::uuid`, [T, thisYear, marker.id, YEARS]);
await q('fee payments', `insert into fee_payments (tenant_id, invoice_id, student_id, amount_paise, method, status, paid_at, receipt_no)
  select $1, i.id, i.student_id, i.amount_paise, 'cash', 'paid', i.due_on + interval '2 days', 'R-' || i.invoice_no from fee_invoices i where i.tenant_id = $1 and i.status = 'paid'`, [T]);

await q('analyze', 'analyze');
console.log(`Seeded ${SLUG}: ${STUDENTS} students, ${STAFF} staff. Sign in as staff1@perf.zynetix.in (principal) or parent<N>@perf.zynetix.in.`);
await pool.end();
