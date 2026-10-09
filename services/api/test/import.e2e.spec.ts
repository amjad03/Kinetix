import type { INestApplication } from '@nestjs/common';
import { drizzle } from 'drizzle-orm/node-postgres';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createInstitution, parseArgs } from '../src/db/create-institution.js';
import * as s from '../src/db/schema.js';
import { TEMPLATES } from '../src/import/templates.js';
import { createApp, createTenant, FixedClock, ownerPool } from './helpers.js';

interface RowResult {
  row: number;
  status: string;
  message: string;
  code?: string;
  detail?: string;
}

/** Bulk import: a new institution set up from the four CSV templates, then re-imports, mistakes and isolation. */
describe('bulk import', () => {
  const owner = ownerPool();
  let app: INestApplication;
  let tenantId: string;
  let slug: string;
  let other: Awaited<ReturnType<typeof createTenant>>;
  const tokens: Record<string, string> = {};
  const http = () => request(app.getHttpServer());
  const q = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await owner.query(sql, params)).rows as T[];
  const post = (kind: string, csv: string | Buffer, query = '', who = 'admin') =>
    http().post(`/v1/admin/import/${kind}${query}`).set('authorization', `Bearer ${tokens[who]}`).set('content-type', 'text/csv; charset=utf-8').send(csv);
  const byRow = (rows: RowResult[], row: number) => rows.find((r) => r.row === row)!;

  beforeAll(async () => {
    app = await createApp(new FixedClock(new Date()));
    slug = `imp-${Math.random().toString(36).slice(2, 8)}`;
    const args = parseArgs(['--slug', slug, '--name', 'Import College', '--kind', 'college', '--year-label', '2026-27', '--year-start', '2026-06-01', '--year-end', '2027-03-31', '--admin-name', 'Admin', '--admin-email', 'admin@imp.example.in']);
    const inst = await createInstitution(drizzle(owner, { schema: s }), args);
    tenantId = inst.tenant.id;
    other = await createTenant(owner);
    const login = async (tenant: string, login: string, password: string) => (await http().post('/v1/auth/login').send({ tenant, login, password }).expect(201)).body.accessToken as string;
    // The new administrator first replaces the temporary password.
    const temp = await login(slug, 'admin@imp.example.in', inst.password!);
    tokens.admin = (await http().post('/v1/me/password').set('authorization', `Bearer ${temp}`).send({ currentPassword: inst.password, newPassword: 'Import-office-2026' }).expect(200)).body.accessToken as string;
    tokens.otherPrincipal = await login(other.slug, other.principal.email!, 'pw');
    tokens.otherTeacher = await login(other.slug, other.teacher.email!, 'pw');
  });

  afterAll(async () => {
    await app.close();
    await owner.end();
  });

  it('serves the templates to the principal and admin only, and refuses bad uploads', async () => {
    const tpl = await http().get('/v1/admin/import/templates/students').set('authorization', `Bearer ${tokens.admin}`).expect(200);
    expect(tpl.headers['content-type']).toMatch(/^text\/csv/);
    expect(tpl.text).toBe(TEMPLATES.students);
    await http().get('/v1/admin/import/templates/bogus').set('authorization', `Bearer ${tokens.admin}`).expect(404);
    await post('staff', TEMPLATES.staff, '', 'otherTeacher').expect(403);
    await post('bogus', TEMPLATES.staff).expect(404);

    expect((await post('staff', '').expect(400)).body.code).toBe('IMPORT_NO_FILE');
    expect((await post('staff', '# only a comment\nfull_name,roles\n').expect(400)).body.code).toBe('IMPORT_EMPTY');
    const missing = await post('students', 'roll_no,full_name\nR1,Asha\n').expect(400);
    expect(missing.body).toMatchObject({ code: 'IMPORT_MISSING_COLUMNS', missing: ['section'] });
    const latin1 = Buffer.from([...Buffer.from('full_name,roles,email\nRa'), 0xe9, ...Buffer.from('l,teacher,r@x.in\n')]);
    expect((await post('staff', latin1).expect(400)).body.code).toBe('IMPORT_NOT_UTF8');
  });

  it('checks a file without saving anything on a dry run', async () => {
    const res = await post('programs', TEMPLATES.programs, '?dryRun=true').expect(200);
    expect(res.body).toMatchObject({ kind: 'programs', dryRun: true, committed: false, totals: { rows: 4, created: 4, updated: 0, skipped: 0, error: 0 } });
    expect(res.body.rows.map((r: RowResult) => r.row)).toEqual([13, 14, 15, 16]); // lines in the file, after the comments
    expect(await q('select id from programs where tenant_id = $1', [tenantId])).toHaveLength(0);
    expect(await q('select id from departments where tenant_id = $1', [tenantId])).toHaveLength(0);
    expect(await q(`select id from audit_log where tenant_id = $1 and action like 'import.%'`, [tenantId])).toHaveLength(0);
  });

  it('imports programs, classes, subjects and departments from a multipart upload, and upserts on re-import', async () => {
    const res = await http()
      .post('/v1/admin/import/programs')
      .set('authorization', `Bearer ${tokens.admin}`)
      .attach('file', Buffer.from(TEMPLATES.programs), { filename: 'programs.csv', contentType: 'text/csv' })
      .expect(200);
    expect(res.body).toMatchObject({ committed: true, totals: { created: 4, error: 0 } });
    expect(byRow(res.body.rows, 13).message).toBe('BSc · BSc Sem 1 A · BSC-1.1 Physics I');
    const secs = await q<{ display_name: string; term: number }>('select display_name, term from sections where tenant_id = $1 order by display_name', [tenantId]);
    expect(secs.map((x) => x.display_name)).toEqual(['BSc Sem 1 A', 'BSc Sem 1 B']);
    const subs = await q<{ code: string; dept: string }>('select s.code, d.name as dept from subjects s join departments d on d.id = s.department_id where s.tenant_id = $1 order by s.code', [tenantId]);
    expect(subs).toEqual([
      { code: 'BSC-1.1', dept: 'Science' },
      { code: 'BSC-1.2', dept: 'Science' },
      { code: 'BSC-1.3', dept: 'Languages' },
      { code: 'BSC-1.4', dept: 'Languages' },
    ]);
    expect(await q(`select data from audit_log where tenant_id = $1 and action = 'import.programs'`, [tenantId])).toEqual([{ data: expect.objectContaining({ totals: expect.objectContaining({ created: 4 }) }) }]);

    // The same file again changes nothing; a renamed subject and a new program level are updates.
    expect((await post('programs', TEMPLATES.programs).expect(200)).body.totals).toMatchObject({ skipped: 4, created: 0, updated: 0 });
    const again = await post('programs', 'program,level,terms,term,section,subject_code,subject_name\nbsc,UG,6,1,,BSC-1.1,Physics I (Mechanics)\nMCom,pg,4,1,A,,\n').expect(200);
    expect(again.body.rows.map((r: RowResult) => r.status)).toEqual(['updated', 'created']);
    expect(await q(`select name from subjects where tenant_id = $1 and code = 'BSC-1.1'`, [tenantId])).toEqual([{ name: 'Physics I (Mechanics)' }]);
    expect(await q(`select display_name from sections where tenant_id = $1 and display_name = 'MCom Sem 1 A'`, [tenantId])).toHaveLength(1);

    // Mistakes are reported per row.
    const bad = await post('programs', 'program,level,terms,term,section,subject_code,subject_name\nBSc,ug,6,9,C,,\nBA,college,6,1,A,,\nBSc,ug,4,1,,,\nBSc,ug,6,1,,BSC-9,\n', '?dryRun=true').expect(200);
    expect(bad.body.rows.map((r: RowResult) => r.code)).toEqual(['IMPORT_BAD_TERM', 'IMPORT_BAD_LEVEL', 'IMPORT_PROGRAM_CONFLICT', 'IMPORT_REQUIRED']);
    expect(bad.body.rows[3]).toMatchObject({ message: 'This value is required', detail: 'subject_name' });
  });

  it('imports staff with roles, departments and Hindi and Kannada names, then updates on re-import', async () => {
    const res = await post('staff', TEMPLATES.staff).expect(200);
    expect(res.body).toMatchObject({ committed: true, totals: { created: 5, error: 0 } });
    const people = await q<{ full_name: string; phone: string; preferred_language: string; roles: string[]; password_hash: string | null }>(
      `select u.full_name, u.phone, u.preferred_language, u.password_hash, array_agg(r.role::text order by r.role) as roles from users u join user_roles r on r.user_id = u.id
       where u.tenant_id = $1 and u.email like '%@example.in' group by u.id order by u.full_name`,
      [tenantId],
    );
    expect(people.find((p) => p.full_name === 'सुनीता वर्मा')).toMatchObject({ preferred_language: 'hi', roles: ['teacher'], phone: '+919845000103', password_hash: null });
    expect(people.find((p) => p.full_name === 'ಮಂಜುನಾಥ ಗೌಡ')).toMatchObject({ preferred_language: 'kn' });
    expect(people.find((p) => p.full_name === 'Suresh Hegde')!.roles).toEqual(['hod', 'teacher']);
    const langStaff = await q<{ full_name: string }>(`select u.full_name from department_staff ds join departments d on d.id = ds.department_id join users u on u.id = ds.user_id where d.tenant_id = $1 and d.name = 'Languages' order by u.full_name`, [tenantId]);
    expect(langStaff.map((x) => x.full_name)).toEqual(['सुनीता वर्मा', 'ಮಂಜುನಾಥ ಗೌಡ']);
    // Staff sign in with a phone code: the imported teacher can ask for one.
    await http().post('/v1/auth/otp/request').send({ tenant: slug, phone: '98450 00103' }).expect(202);

    expect((await post('staff', TEMPLATES.staff).expect(200)).body.totals).toMatchObject({ skipped: 5 });
    // Matched by phone: a new email and an added role. Unknown roles and broken contacts are row errors.
    const upd = await post('staff', 'full_name,email,phone,roles\nPriya Nair,priya@example.in,98450 00101,teacher;principal\nX,x@example.in,,dean\nY,not-an-email,,teacher\nZ,suresh.hegde@example.in,+919845000103,teacher\n', '?dryRun=true').expect(200);
    expect(upd.body.rows.map((r: RowResult) => [r.status, r.code])).toEqual([['updated', undefined], ['error', 'IMPORT_BAD_ROLE'], ['error', 'IMPORT_BAD_EMAIL'], ['error', 'IMPORT_CONTACT_MISMATCH']]);
    await post('staff', 'full_name,email,phone,roles\nPriya Nair,priya.nair@example.in,98450 00101,teacher;principal\n').expect(200);
    expect(await q(`select r.role from user_roles r join users u on u.id = r.user_id where u.tenant_id = $1 and u.email = 'priya.nair@example.in' order by r.role::text`, [tenantId])).toEqual([{ role: 'principal' }, { role: 'teacher' }]);
  });

  it('rolls back the whole file when any row is wrong', async () => {
    const csv = TEMPLATES.students.replace('BSC1B002,Rohan Kulkarni,BSc Sem 1 B', 'BSC1B002,Rohan Kulkarni,BSc Sem 7 Z');
    const res = await post('students', csv).expect(200);
    expect(res.body).toMatchObject({ committed: false, dryRun: false, totals: { rows: 4, created: 3, error: 1 } });
    expect(byRow(res.body.rows, 15)).toMatchObject({ status: 'error', code: 'IMPORT_UNKNOWN_CLASS', message: 'No class with this name', detail: 'BSc Sem 7 Z' });
    expect(await q('select id from students where tenant_id = $1', [tenantId])).toHaveLength(0);
    expect(await q(`select u.id from users u join user_roles r on r.user_id = u.id where u.tenant_id = $1 and r.role in ('guardian', 'student')`, [tenantId])).toHaveLength(0);
  });

  it('imports students with logins and links guardians by phone, sharing one parent between siblings', async () => {
    // Priya (staff) is also a parent: her phone links her as a guardian, with no second account.
    const csv = `${TEMPLATES.students}BSC1A003,Meera Nair,bsc sem 1 a,,,en,Priya Nair,98450 00101,mother,en,,,,\n`;
    const res = await post('students', csv).expect(200);
    expect(res.body).toMatchObject({ committed: true, totals: { created: 5, error: 0 } });
    const kids = await q<{ roll_no: string; full_name: string; section: string }>('select st.roll_no, st.full_name, s.display_name as section from students st join sections s on s.id = st.section_id where st.tenant_id = $1 order by st.roll_no', [tenantId]);
    expect(kids.map((k) => k.full_name)).toEqual(['Aditi Kulkarni', 'ಕಾವ್ಯ ಶೆಟ್ಟಿ', 'Meera Nair', 'आरव मिश्रा', 'Rohan Kulkarni']);
    const ramesh = await q<{ student: string; relation: string }>(
      `select st.full_name as student, g.relation from guardians g join users u on u.id = g.user_id join students st on st.id = g.student_id where u.tenant_id = $1 and u.phone = '+919900000201' order by st.full_name`,
      [tenantId],
    );
    expect(ramesh).toEqual([{ student: 'Aditi Kulkarni', relation: 'father' }, { student: 'Rohan Kulkarni', relation: 'father' }]);
    expect(await q(`select id from users where tenant_id = $1 and phone = '+919900000201'`, [tenantId])).toHaveLength(1);
    const rajesh = await q(`select u.full_name, u.preferred_language from users u where u.tenant_id = $1 and u.phone = '+919900000205'`, [tenantId]);
    expect(rajesh).toEqual([{ full_name: 'राजेश मिश्रा', preferred_language: 'hi' }]);
    const priyaRoles = await q<{ role: string }>(`select r.role from user_roles r join users u on u.id = r.user_id where u.tenant_id = $1 and u.phone = '+919845000101' order by r.role::text`, [tenantId]);
    expect(priyaRoles.map((r) => r.role)).toEqual(['guardian', 'principal', 'teacher']);
    const kavya = await q(`select u.email, u.phone, r.role from students st join users u on u.id = st.user_id join user_roles r on r.user_id = u.id where st.tenant_id = $1 and st.roll_no = 'BSC1A002'`, [tenantId]);
    expect(kavya).toEqual([{ email: 'kavya.shetty@example.in', phone: '+919900000203', role: 'student' }]);
    // The parent signs in with a code and sees both children.
    await http().post('/v1/auth/otp/request').send({ tenant: slug, phone: '+919900000201' }).expect(202);

    // Again: nothing changes. Then Rohan moves to section A, and a staff phone cannot be a student login.
    expect((await post('students', csv).expect(200)).body.totals).toMatchObject({ skipped: 5, created: 0, updated: 0 });
    const moved = await post('students', 'roll_no,full_name,section,student_phone\nBSC1B002,Rohan Kulkarni,BSc Sem 1 A,\nBSC1A001,Aditi Kulkarni,BSc Sem 1 A,+919845000102\nBSC1A001,Aditi K,BSc Sem 1 A,\n').expect(200);
    expect(moved.body.rows.map((r: RowResult) => r.code ?? r.status)).toEqual(['updated', 'IMPORT_CONTACT_TAKEN', 'IMPORT_DUPLICATE_ROW']);
    expect(moved.body.committed).toBe(false);
    await post('students', 'roll_no,full_name,section\nBSC1B002,Rohan Kulkarni,BSc Sem 1 A\n').expect(200);
    expect(await q(`select s.display_name from students st join sections s on s.id = st.section_id where st.tenant_id = $1 and st.roll_no = 'BSC1B002'`, [tenantId])).toEqual([{ display_name: 'BSc Sem 1 A' }]);
    await post('students', 'roll_no,full_name,section\nBSC1B002,Rohan Kulkarni,BSc Sem 1 B\n').expect(200);
  });

  it('imports the timetable, reports clashes per row, upserts, and replaces a class’s week only when asked', async () => {
    const res = await post('timetable', TEMPLATES.timetable).expect(200);
    expect(res.body).toMatchObject({ committed: true, totals: { created: 5, error: 0 } });
    const slots = () =>
      q<{ id: string; section: string; code: string; day: number; starts: string; room: string | null }>(
        `select t.id, s.display_name as section, sub.code, t.day_of_week as day, to_char(t.starts_at, 'HH24:MI') as starts, r.name as room
         from timetable_slots t join sections s on s.id = t.section_id join subjects sub on sub.id = t.subject_id left join rooms r on r.id = t.room_id
         where t.tenant_id = $1 and t.archived_at is null order by s.display_name, t.day_of_week, t.starts_at`,
        [tenantId],
      );
    expect((await slots()).map((x) => `${x.section} ${x.day} ${x.starts} ${x.code} ${x.room}`)).toEqual([
      'BSc Sem 1 A 1 09:00 BSC-1.1 Room 101',
      'BSc Sem 1 A 1 10:00 BSC-1.2 Room 101',
      'BSc Sem 1 A 2 09:00 BSC-1.3 Room 101',
      'BSc Sem 1 B 1 10:00 BSC-1.1 Room 102',
      'BSc Sem 1 B 2 09:00 BSC-1.4 Room 102',
    ]);
    // The editor sees them.
    const secA = (await q<{ id: string }>(`select id from sections where tenant_id = $1 and display_name = 'BSc Sem 1 A'`, [tenantId]))[0].id;
    expect((await http().get(`/v1/admin/timetable?sectionId=${secA}`).set('authorization', `Bearer ${tokens.admin}`).expect(200)).body).toHaveLength(3);

    // Clashes, with the same rules as the timetable editor, one per row; nothing is saved.
    const clash = await post(
      'timetable',
      [
        'section,subject_code,teacher,day,start,end,room',
        'BSc Sem 1 A,BSC-1.2,suresh.hegde@example.in,Mon,09:30,10:20,', // class A already has 09:00 and 10:00
        'BSc Sem 1 B,BSC-1.2,priya.nair@example.in,3,11:00,11:55,Room 101', // new: fine
        'BSc Sem 1 A,BSC-1.1,+919845000101,Wed,11:30,12:00,', // Priya is teaching at 11:00 (the row above)
        'BSc Sem 1 B,BSC-1.2,suresh.hegde@example.in,Tue,9:30,10:00,', // class B has 09:00–09:55 on Tuesday
        'BSc Sem 1 B,BSC-1.2,suresh.hegde@example.in,Fri,09:00,09:55,Room 101',
        'MCom Sem 1 A,BSC-1.2,suresh.hegde@example.in,Fri,09:00,09:55,Room 101', // subject not in that class
        'BSc Sem 1 B,BSC-1.2,nobody@example.in,Sat,09:00,09:55,',
        'BSc Sem 1 B,BSC-1.2,suresh.hegde@example.in,Funday,09:00,09:55,',
        'BSc Sem 1 B,BSC-1.2,accounts@example.in,Sat,09:00,09:55,', // not teaching staff
      ].join('\n'),
    ).expect(200);
    expect(clash.body.committed).toBe(false);
    expect(clash.body.rows.map((r: RowResult) => r.code ?? r.status)).toEqual([
      'TIMETABLE_CLASS_CLASH',
      'created',
      'TIMETABLE_TEACHER_CLASH',
      'TIMETABLE_CLASS_CLASH',
      'created',
      'IMPORT_UNKNOWN_SUBJECT',
      'IMPORT_UNKNOWN_TEACHER',
      'IMPORT_BAD_DAY',
      'BAD_REQUEST',
    ]);
    expect(clash.body.rows[0].message).toMatch(/^BSc Sem 1 A already has a period at \d\d:\d\d–\d\d:\d\d that day$/);
    expect(clash.body.rows[2].message).toBe('This teacher is already teaching at 11:00–11:55 that day');
    const room = await post('timetable', 'section,subject_code,teacher,day,start,end,room\nMCom Sem 1 A,,suresh.hegde@example.in,Mon,09:00,09:55,Room 101\n', '?dryRun=true').expect(200);
    expect(room.body.rows[0].code).toBe('IMPORT_REQUIRED');
    expect(await slots()).toHaveLength(5);

    // Re-import: unchanged rows are skipped; a period matched by class, day and start with a new room is changed (old one archived).
    const before = await slots();
    const changed = await post('timetable', TEMPLATES.timetable.replace('BSc Sem 1 B,BSC-1.4,sunita.verma@example.in,Tue,09:00,09:55,Room 102', 'BSc Sem 1 B,BSC-1.4,sunita.verma@example.in,Tue,09:00,09:55,Lab 1')).expect(200);
    expect(changed.body.rows.map((r: RowResult) => r.status)).toEqual(['skipped', 'skipped', 'skipped', 'skipped', 'updated']);
    const after = await slots();
    expect(after.find((x) => x.section === 'BSc Sem 1 B' && x.day === 2)!.room).toBe('Lab 1');
    expect(after.filter((x) => before.some((b) => b.id === x.id))).toHaveLength(4);

    // Replace: class A gets exactly the file's periods; class B is untouched. The unchanged period keeps its id.
    const keep = before.find((x) => x.section === 'BSc Sem 1 A' && x.day === 1 && x.starts === '09:00')!;
    const replaced = await post('timetable', 'section,subject_code,teacher,day,start,end,room\nBSc Sem 1 A,BSC-1.1,priya.nair@example.in,Mon,09:00,09:55,Room 101\nBSc Sem 1 A,BSC-1.3,manjunath.gowda@example.in,Thu,12:00,12:55,\n', '?replace=true').expect(200);
    expect(replaced.body.rows.map((r: RowResult) => r.status)).toEqual(['skipped', 'created']);
    const final = await slots();
    expect(final.filter((x) => x.section === 'BSc Sem 1 A').map((x) => `${x.day} ${x.starts} ${x.code}`)).toEqual(['1 09:00 BSC-1.1', '4 12:00 BSC-1.3']);
    expect(final.find((x) => x.section === 'BSc Sem 1 A' && x.day === 1)!.id).toBe(keep.id);
    expect(final.filter((x) => x.section === 'BSc Sem 1 B')).toHaveLength(2);
    const archived = await q(`select id from timetable_slots t where t.tenant_id = $1 and t.archived_at is not null`, [tenantId]);
    expect(archived).toHaveLength(3); // the room change, and A's Mon 10:00 and Tue 09:00
  });

  it('keeps institutions apart: another institution sees none of these classes or people', async () => {
    const students = await post('students', 'roll_no,full_name,section\nR9,Asha,BSc Sem 1 A\n', '?dryRun=true', 'otherPrincipal').expect(200);
    expect(students.body.rows[0].code).toBe('IMPORT_UNKNOWN_CLASS');
    const tt = await post('timetable', `section,subject_code,teacher,day,start,end\nBCom Sem 3 A,BCOM-3.1,priya.nair@example.in,Tue,09:00,09:55\n`, '?dryRun=true', 'otherPrincipal').expect(200);
    expect(tt.body.rows[0].code).toBe('IMPORT_UNKNOWN_TEACHER');
    // The same email in another institution is a different person.
    const staff = await post('staff', 'full_name,email,roles\nPriya Nair (other),priya.nair@example.in,teacher\n', '', 'otherPrincipal').expect(200);
    expect(staff.body.rows[0].status).toBe('created');
    const priyas = await q<{ tenant_id: string; full_name: string }>(`select tenant_id, full_name from users where email = 'priya.nair@example.in' order by full_name`);
    expect(priyas).toEqual([
      { tenant_id: tenantId, full_name: 'Priya Nair' },
      { tenant_id: other.tenantId, full_name: 'Priya Nair (other)' },
    ]);
    // Its own guardians link by phone within it only.
    const fam = await post('students', `roll_no,full_name,section,guardian1_name,guardian1_phone\nR1,Student A,BCom Sem 3 A,Ramesh K,+919900000201\n`, '', 'otherPrincipal').expect(200);
    expect(fam.body.rows[0].status).toBe('updated');
    expect(await q(`select tenant_id from users where phone = '+919900000201' order by tenant_id = $1`, [tenantId])).toHaveLength(2);
  });
});
