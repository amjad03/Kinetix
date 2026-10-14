import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readXlsx, writeWorkbook } from '../src/common/xlsx.js';
import { RecycleBinService } from '../src/records/recycle-bin.service.js';
import { createApp, createTenant, FixedClock, nextMondayIst, ownerPool } from './helpers.js';

const binary = (res: request.Response, cb: (e: Error | null, body: Buffer) => void) => {
  const chunks: Buffer[] = [];
  res.on('data', (c: Buffer) => chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
};

/**
 * The record depth kit: the recycle bin (delete, restore with linked rows, purge, retention), history with
 * before/after, bulk operations with per-row reports, move and promote, import (template, check, commit),
 * export, reorder, duplicate, saved views, permissions and tenant isolation.
 */
describe('record depth kit', () => {
  const owner = ownerPool();
  const clock = new FixedClock(nextMondayIst('10:30'));
  let app: INestApplication;
  let t: Awaited<ReturnType<typeof createTenant>>;
  let other: Awaited<ReturnType<typeof createTenant>>;
  const tokens: Record<string, string> = {};
  const http = () => request(app.getHttpServer());
  const as = (who: string) => ({ authorization: `Bearer ${tokens[who]}` });
  const login = async (slug: string, email: string) => (await http().post('/v1/auth/login').send({ tenant: slug, login: email, password: 'pw' }).expect(201)).body.accessToken as string;

  beforeAll(async () => {
    t = await createTenant(owner);
    other = await createTenant(owner);
    app = await createApp(clock);
    tokens.principal = await login(t.slug, t.principal.email!);
    tokens.teacher = await login(t.slug, t.teacher.email!);
    tokens.outsider = await login(other.slug, other.principal.email!);
  });

  afterAll(async () => {
    await app.close();
    await owner.end();
  });

  it('describes a list and pages, searches, filters and sorts it on the server', async () => {
    const meta = (await http().get('/v1/records/students/meta').set(as('principal')).expect(200)).body;
    expect(meta).toMatchObject({ key: 'students', module: 'students', can: { write: true, import: true, move: true, duplicate: true } });
    expect(meta.fields.map((f: { key: string }) => f.key)).toEqual(['fullName', 'rollNo', 'sectionId', 'enrolledOn', 'status', 'admissionNo', 'registerNo', 'dateOfBirth', 'gender', 'category']);
    expect(meta.move.options).toEqual(expect.arrayContaining([{ value: t.section.id, label: 'BCom Sem 3 A', group: 'BCom' }]));
    expect(meta.actions).toEqual([
      { key: 'promote', label: 'Promote to next class', tone: null },
      { key: 'admissionNo', label: 'Give admission numbers', tone: null },
      { key: 'clearance', label: 'Start no-dues clearance', tone: null },
    ]);

    const page = (await http().get('/v1/records/students?pageSize=2&sort=roll:desc').set(as('principal')).expect(200)).body;
    expect(page).toMatchObject({ total: 3, page: 1, pageSize: 2 });
    expect(page.rows.map((r: { rollNo: string }) => r.rollNo)).toEqual(['R3', 'R2']);
    const next = (await http().get('/v1/records/students?pageSize=2&page=2&sort=roll:desc').set(as('principal')).expect(200)).body;
    expect(next.rows.map((r: { rollNo: string }) => r.rollNo)).toEqual(['R1']);
    const found = (await http().get('/v1/records/students?q=r2').set(as('principal')).expect(200)).body;
    expect(found.rows).toEqual([expect.objectContaining({ fullName: 'Student B', className: 'BCom Sem 3 A', guardianCount: 1, _label: 'R2 Student B' })]);
    expect((await http().get(`/v1/records/students?f.section=${t.otherSection.id}`).set(as('principal')).expect(200)).body.total).toBe(0);

    // Who may: the teacher reads classes but changes nothing; another institution sees none of it.
    await http().get('/v1/records/students').set(as('teacher')).expect(403);
    await http().post('/v1/records/classes').set(as('teacher')).send({ programId: t.program.id, term: 3, name: 'C' }).expect(403);
    await http().get('/v1/records/unknown').set(as('principal')).expect(404);
    expect((await http().get('/v1/records/students').set(as('outsider')).expect(200)).body.total).toBe(3);
    await http().get(`/v1/records/students/${t.students[0].id}`).set(as('outsider')).expect(404);
  });

  let deptId: string;
  it('adds and edits a record, and its history shows each field before and after', async () => {
    await owner.query(`insert into user_roles (tenant_id, user_id, role) values ($1, $2, 'hod')`, [t.tenantId, t.teacher2.id]);
    await http().post('/v1/records/departments').set(as('principal')).send({ name: '' }).expect(400);
    await http().post('/v1/records/departments').set(as('principal')).send({ name: 'Commerce', headUserId: t.teacher.id }).expect(400); // not an HOD
    const d = (await http().post('/v1/records/departments').set(as('principal')).send({ name: 'Commerce', headUserId: t.teacher2.id }).expect(201)).body;
    deptId = d.id;
    expect(d).toMatchObject({ name: 'Commerce', headName: expect.any(String), staffCount: 0 });
    await http().patch(`/v1/records/departments/${deptId}`).set(as('principal')).send({ name: 'Commerce and Management' }).expect(200);
    await http().patch(`/v1/records/departments/${deptId}`).set(as('principal')).send({ nope: 1 }).expect(400);

    const h = (await http().get(`/v1/records/departments/${deptId}/history`).set(as('principal')).expect(200)).body;
    expect(h.total).toBe(2);
    expect(h.items[0]).toMatchObject({ action: 'department.updated', actor: { id: t.principal.id, type: 'user' }, changes: [{ field: 'name', label: 'Name', before: 'Commerce', after: 'Commerce and Management' }] });
    expect(h.items[1]).toMatchObject({ action: 'department.created', changes: expect.arrayContaining([{ field: 'name', label: 'Name', before: null, after: 'Commerce' }]) });
    // Another institution's history of the same id is empty.
    expect((await http().get(`/v1/records/departments/${deptId}/history`).set(as('outsider')).expect(200)).body.total).toBe(0);
  });

  it('deletes to the recycle bin and restores with every linked row and link', async () => {
    await owner.query(`insert into department_staff (tenant_id, department_id, user_id) values ($1, $2, $3), ($1, $2, $4)`, [t.tenantId, deptId, t.teacher.id, t.teacher2.id]);
    await owner.query(`update subjects set department_id = $1 where id = $2`, [deptId, t.subject.id]);

    const del = (await http().delete(`/v1/records/departments/${deptId}`).set(as('principal')).expect(200)).body;
    expect(del).toMatchObject({ label: 'Commerce and Management', rows: 4 }); // the department, 2 memberships, 1 subject link
    expect((await owner.query(`select count(*)::int as n from department_staff where department_id = $1`, [deptId])).rows[0].n).toBe(0);
    expect((await owner.query(`select department_id from subjects where id = $1`, [t.subject.id])).rows[0].department_id).toBeNull();

    const bin = (await http().get('/v1/recycle-bin?module=academics').set(as('principal')).expect(200)).body;
    expect(bin).toMatchObject({ total: 1, retentionDays: 90, modules: expect.arrayContaining(['academics', 'students', 'hr']) });
    expect(bin.rows[0]).toMatchObject({ id: del.binId, entity: 'departments', label: 'Commerce and Management', rowCount: 4, deletedBy: { id: t.principal.id } });
    expect((await http().get(`/v1/recycle-bin/${del.binId}`).set(as('principal')).expect(200)).body.linked).toEqual({ department_staff: 2 });
    // Not to a teacher, nor to another institution.
    expect((await http().get('/v1/recycle-bin').set(as('teacher')).expect(200)).body.total).toBe(0);
    expect((await http().get('/v1/recycle-bin').set(as('outsider')).expect(200)).body.total).toBe(0);
    await http().post(`/v1/recycle-bin/${del.binId}/restore`).set(as('outsider')).expect(404);

    const r = (await http().post(`/v1/recycle-bin/${del.binId}/restore`).set(as('principal')).expect(200)).body;
    expect(r).toMatchObject({ ok: true, restored: { restored: 4, skipped: [] } });
    expect((await owner.query(`select name, head_user_id from departments where id = $1`, [deptId])).rows[0]).toEqual({ name: 'Commerce and Management', head_user_id: t.teacher2.id });
    expect((await owner.query(`select count(*)::int as n from department_staff where department_id = $1`, [deptId])).rows[0].n).toBe(2);
    expect((await owner.query(`select department_id from subjects where id = $1`, [t.subject.id])).rows[0].department_id).toBe(deptId);
    expect((await http().get('/v1/recycle-bin').set(as('principal')).expect(200)).body.total).toBe(0);
    const actions = (await http().get(`/v1/records/departments/${deptId}/history`).set(as('principal')).expect(200)).body.items.map((i: { action: string }) => i.action);
    expect(actions.slice(0, 2)).toEqual(['department.restored', 'department.deleted']);
  });

  it('refuses to delete a record still in use, and explains a restore whose parent is gone', async () => {
    const monday = nextMondayIst('12:00').toISOString().slice(0, 10);
    await owner.query(
      `insert into attendance_records (tenant_id, student_id, section_id, date, timetable_slot_id, status, marked_by, occurred_at) values ($1, $2, $3, $4, $5, 'present', $6, now())`,
      [t.tenantId, t.students[0].id, t.section.id, monday, t.slot.id, t.teacher.id],
    );
    const inUse = (await http().delete(`/v1/records/students/${t.students[0].id}`).set(as('principal')).expect(409)).body;
    expect(inUse).toMatchObject({ code: 'RECORD_IN_USE', table: 'attendance_records' });
    expect(inUse.message).toMatch(/^R1 Student A cannot be deleted because attendance records still refer to it/);

    // A new class with one student: delete the student, then the empty class; the student cannot come back alone.
    const cls = (await http().post('/v1/records/classes').set(as('principal')).send({ programId: t.program.id, term: 3, name: 'C' }).expect(201)).body;
    expect(cls).toMatchObject({ displayName: 'BCom Sem 3 C', yearLabel: '2026-27' });
    const st = (await http().post('/v1/records/students').set(as('principal')).send({ fullName: 'Kiran Rao', rollNo: 'C1', sectionId: cls.id }).expect(201)).body;
    await http().post('/v1/records/students').set(as('principal')).send({ fullName: 'Kiran Again', rollNo: 'C1', sectionId: cls.id }).expect(409);
    await http().delete(`/v1/records/classes/${cls.id}`).set(as('principal')).expect(409); // it has a student
    const binStudent = (await http().delete(`/v1/records/students/${st.id}`).set(as('principal')).expect(200)).body.binId;
    const binClass = (await http().delete(`/v1/records/classes/${cls.id}`).set(as('principal')).expect(200)).body.binId;
    const blocked = (await http().post(`/v1/recycle-bin/${binStudent}/restore`).set(as('principal')).expect(409)).body;
    expect(blocked).toMatchObject({ code: 'RESTORE_PARENT_MISSING' });
    expect(blocked.message).toBe('C1 Kiran Rao cannot be restored because "BCom Sem 3 C" (classes) was deleted. Restore "BCom Sem 3 C" first.');
    // Restored together, the class goes first and the student follows.
    const both = (await http().post('/v1/recycle-bin/restore').set(as('principal')).send({ ids: [binStudent, binClass] }).expect(200)).body.results;
    expect(both.map((x: { ok: boolean }) => x.ok)).toEqual([true, true]);
    expect((await http().get(`/v1/records/students/${st.id}`).set(as('principal')).expect(200)).body).toMatchObject({ className: 'BCom Sem 3 C' });
  });

  it('keeps guardians and the lifecycle record with a deleted student, and purges by hand and after the retention period', async () => {
    const s = t.students[1];
    const del = (await http().delete(`/v1/records/students/${s.id}`).set(as('principal')).expect(200)).body;
    expect((await owner.query(`select count(*)::int as n from guardians where student_id = $1`, [s.id])).rows[0].n).toBe(0);
    await http().post(`/v1/recycle-bin/${del.binId}/restore`).set(as('principal')).expect(200);
    expect((await owner.query(`select relation from guardians where student_id = $1`, [s.id])).rows).toEqual([{ relation: 'mother' }]);

    const again = (await http().delete(`/v1/records/students/${s.id}`).set(as('principal')).expect(200)).body;
    const purged = (await http().post('/v1/recycle-bin/purge').set(as('principal')).send({ ids: [again.binId, '00000000-0000-4000-8000-000000000000'] }).expect(200)).body.results;
    expect(purged).toEqual([expect.objectContaining({ ok: true, label: 'R2 Student B' }), expect.objectContaining({ ok: false, code: 'NOT_FOUND' })]);
    await http().post(`/v1/recycle-bin/${again.binId}/restore`).set(as('principal')).expect(404);

    // Retention: a setting for the principal; the daily job removes what is older.
    await http().put('/v1/recycle-bin/settings').set(as('teacher')).send({ retentionDays: 30 }).expect(403);
    await http().put('/v1/recycle-bin/settings').set(as('principal')).send({ retentionDays: 0 }).expect(400);
    expect((await http().put('/v1/recycle-bin/settings').set(as('principal')).send({ retentionDays: 30 }).expect(200)).body).toEqual({ retentionDays: 30 });
    expect((await http().get('/v1/recycle-bin/settings').set(as('principal')).expect(200)).body).toEqual({ retentionDays: 30 });
    const d1 = (await http().post('/v1/records/departments').set(as('principal')).send({ name: 'Old one' }).expect(201)).body;
    const d2 = (await http().post('/v1/records/departments').set(as('principal')).send({ name: 'New one' }).expect(201)).body;
    const old = (await http().delete(`/v1/records/departments/${d1.id}`).set(as('principal')).expect(200)).body;
    await http().delete(`/v1/records/departments/${d2.id}`).set(as('principal')).expect(200);
    await owner.query(`update deleted_records set deleted_at = now() - interval '31 days' where id = $1`, [old.binId]);
    const otherBin = await owner.query(`insert into deleted_records (tenant_id, entity, module, table_name, record_id, label, snapshot, deleted_at) values ($1, 'departments', 'academics', 'departments', gen_random_uuid()::text, 'Theirs', '{"root":{},"rows":[],"nulled":[]}', now() - interval '31 days') returning id`, [other.tenantId]);
    clock.at = new Date();
    expect(await app.get(RecycleBinService).purgeExpired(t.tenantId)).toBe(1);
    expect((await http().get('/v1/recycle-bin?q=one').set(as('principal')).expect(200)).body.rows.map((r: { label: string }) => r.label)).toEqual(['New one']);
    // Each institution's own retention applies (the other is still on the 90-day default).
    expect(await app.get(RecycleBinService).purgeExpired(other.tenantId)).toBe(0);
    expect((await owner.query(`select count(*)::int as n from deleted_records where id = $1`, [otherBin.rows[0].id])).rows[0].n).toBe(1);
  });

  it('runs bulk operations with a report per record, partly or all-or-nothing', async () => {
    const ids = [t.students[0].id, t.students[2].id];
    // Student A has attendance, so the delete of A fails and C's goes ahead.
    const partial = (await http().post('/v1/records/students/bulk').set(as('principal')).send({ op: 'delete', target: { ids } }).expect(200)).body;
    expect(partial).toMatchObject({ op: 'delete', committed: true, total: 2, succeeded: 1, failed: 1 });
    expect(partial.rows).toEqual([expect.objectContaining({ id: ids[0], ok: false, code: 'RECORD_IN_USE' }), expect.objectContaining({ id: ids[1], ok: true, label: 'R3 Student C' })]);
    const binC = (await http().get('/v1/recycle-bin?q=Student%20C').set(as('principal')).expect(200)).body.rows[0].id;
    await http().post(`/v1/recycle-bin/${binC}/restore`).set(as('principal')).expect(200);

    // All or nothing: one failure undoes the other.
    const atomic = (await http().post('/v1/records/students/bulk').set(as('principal')).send({ op: 'delete', target: { ids }, atomic: true }).expect(200)).body;
    expect(atomic).toMatchObject({ committed: false, succeeded: 0, failed: 1 });
    expect((await http().get('/v1/records/students').set(as('principal')).expect(200)).body.total).toBe(3);

    // Bulk edit: values are checked once; a status change goes through the lifecycle rules per student.
    await http().post('/v1/records/students/bulk').set(as('principal')).send({ op: 'update', target: { ids }, fields: { fullName: 'Same Name' } }).expect(400);
    await http().post('/v1/records/students/bulk').set(as('principal')).send({ op: 'update', target: { ids }, fields: { enrolledOn: 'June' } }).expect(400);
    const edit = (await http().post('/v1/records/students/bulk').set(as('principal')).send({ op: 'update', target: { all: true, query: { filters: { section: t.section.id } }, except: [t.students[0].id] }, fields: { enrolledOn: '2026-06-01' } }).expect(200)).body;
    expect(edit).toMatchObject({ total: 1, succeeded: 1 });
    const { rows } = await owner.query(`select roll_no, enrolled_on::text from students where tenant_id = $1 and section_id = $2 order by roll_no`, [t.tenantId, t.section.id]);
    expect(rows.map((r) => [r.roll_no, r.enrolled_on])).toEqual([
      ['R1', null],
      ['R3', '2026-06-01'],
    ]);
    const hist = (await http().get(`/v1/records/students/${t.students[2].id}/history`).set(as('principal')).expect(200)).body.items[0];
    expect(hist).toMatchObject({ action: 'student.updated', changes: [{ field: 'enrolledOn', before: null, after: '2026-06-01' }], data: { bulk: true } });

    const status = (await http().post('/v1/records/students/bulk').set(as('principal')).send({ op: 'update', target: { ids }, fields: { status: 'enrolled' } }).expect(200)).body;
    expect(status.failed).toBe(2); // active → enrolled is not a lifecycle move
    expect(status.rows[0].message).toEqual(expect.any(String));
  });

  it('moves students between classes and programmes, and promotes them to the next class', async () => {
    const bba = (await http().post('/v1/records/programmes').set(as('principal')).send({ name: 'BBA', level: 'ug', termCount: 6, campusId: t.campus.id }).expect(201)).body;
    const bbaA = (await http().post('/v1/records/classes').set(as('principal')).send({ programId: bba.id, term: 3, name: 'A' }).expect(201)).body;
    await http().post(`/v1/records/students/${t.students[2].id}/move`).set(as('principal')).send({ to: bbaA.id }).expect(400); // a reason is required
    await http().post(`/v1/records/students/${t.students[2].id}/move`).set(as('principal')).send({ to: other.section.id, reason: 'Transfer' }).expect(400);
    const moved = (await http().post(`/v1/records/students/${t.students[2].id}/move`).set(as('principal')).send({ to: bbaA.id, reason: 'Changed programme' }).expect(200)).body;
    expect(moved).toMatchObject({ className: 'BBA Sem 3 A', programName: 'BBA' });
    const ev = await owner.query(`select kind, reason, data from student_lifecycle_events where student_id = $1 order by created_at desc limit 1`, [t.students[2].id]);
    expect(ev.rows[0]).toMatchObject({ kind: 'section', reason: 'Changed programme', data: { fromProgramId: t.program.id, toProgramId: bba.id } });

    // Bulk move back, one already there.
    const back = (await http().post('/v1/records/students/bulk').set(as('principal')).send({ op: 'move', target: { ids: [t.students[2].id, t.students[0].id] }, to: t.section.id, reason: 'Back' }).expect(200)).body;
    expect(back.rows.map((r: { ok: boolean }) => r.ok)).toEqual([true, false]);
    expect(back.rows[1].message).toBe('The student is already in this class');

    // Promote: Sem 3 A → Sem 4 A (same section name), detained or missing class reported per row.
    const sem4 = (await http().post('/v1/records/classes').set(as('principal')).send({ programId: t.program.id, term: 4, name: 'A' }).expect(201)).body;
    const promoted = (await http().post('/v1/records/students/bulk').set(as('principal')).send({ op: 'action', action: 'promote', target: { ids: [t.students[0].id, t.students[2].id] }, params: { label: 'Annual promotion' } }).expect(200)).body;
    expect(promoted.rows).toEqual([expect.objectContaining({ ok: true, message: 'BCom Sem 3 A → BCom Sem 4 A' }), expect.objectContaining({ ok: true })]);
    expect((await http().get(`/v1/records/students?f.section=${sem4.id}`).set(as('principal')).expect(200)).body.total).toBe(2);
    await http().post('/v1/records/students/bulk').set(as('principal')).send({ op: 'action', action: 'nope', target: { ids: [t.students[0].id] } }).expect(404);
  });

  it('imports from the Excel template: check with row errors, then commit (all, or the good rows)', async () => {
    const tpl = await http().get('/v1/records/subjects/import/template').set(as('principal')).buffer(true).parse(binary).expect(200);
    expect(tpl.headers['content-type']).toContain('spreadsheetml');
    const tplBody = tpl.body as Buffer;
    const sheet = readXlsx(tplBody);
    expect(sheet[0]).toEqual(['Programme *', 'Term *', 'Code *', 'Subject *', 'Department', 'Type', 'Credits', 'L-T-P-S', 'Internal maximum', 'External maximum', 'Internal pass marks', 'External pass marks']);
    expect(sheet[1].slice(0, 4)).toEqual(['BSc', '1', 'BSC-1.1', 'Physics I']);
    expect(sheet[1].slice(5, 10)).toEqual(['core', '4', '3-1-0-0', '40', '60']);
    expect(tplBody.toString('latin1')).toContain('xl/worksheets/sheet3.xml'); // the hidden lists
    await http().get('/v1/records/subjects/import/template').set(as('teacher')).expect(403);

    const file = writeWorkbook([
      {
        name: 'Data',
        rows: [
          ['Programme *', 'Term *', 'Code *', 'Subject *', 'Department', 'Notes', 'Type', 'Credits', 'L-T-P-S', 'Internal maximum', 'External maximum'],
          ['BSc', '1', 'BSC-1.1', 'Physics I', '', '', 'core', '4', '3-1-0-0', '40', '60'], // the example row: skipped
          ['BCom', '3', 'BCOM-3.2', 'Cost Accounting', 'Commerce and Management'],
          ['BCom', '3', 'BCOM-3.1', 'Corporate Accounting II', ''],
          ['BCom', '9', 'BCOM-9.1', 'Too far', ''],
          ['Nowhere', '1', 'X-1', 'Lost', ''],
        ],
      },
    ]);
    const check = (await http().post('/v1/records/subjects/import').set(as('principal')).attach('file', file, 'subjects.xlsx').expect(200)).body;
    expect(check).toMatchObject({ status: 'validated', mode: 'upsert', ignored: ['Notes'], totals: { rows: 4, created: 1, updated: 1, error: 2 } });
    expect(check.rows.map((r: { row: number; status: string }) => [r.row, r.status])).toEqual([
      [3, 'created'],
      [4, 'updated'],
      [5, 'error'],
      [6, 'error'],
    ]);
    expect(check.rows[3]).toMatchObject({ message: 'No programme with this name', detail: 'Nowhere', values: { program: 'Nowhere', code: 'X-1' } });
    expect((await owner.query(`select count(*)::int as n from subjects where code = 'BCOM-3.2'`)).rows[0].n).toBe(0); // nothing saved yet

    const refused = (await http().post(`/v1/records/subjects/import/${check.id}/commit`).set(as('principal')).send({}).expect(200)).body;
    expect(refused).toMatchObject({ committed: false, status: 'failed' });
    const done = (await http().post(`/v1/records/subjects/import/${check.id}/commit`).set(as('principal')).send({ skipErrors: true }).expect(200)).body;
    expect(done).toMatchObject({ committed: true, status: 'committed', totals: { created: 1, updated: 1, error: 2 } });
    expect((await owner.query(`select s.name, d.name as dept from subjects s left join departments d on d.id = s.department_id where s.tenant_id = $1 and s.code in ('BCOM-3.1', 'BCOM-3.2') order by s.code`, [t.tenantId])).rows).toEqual([
      { name: 'Corporate Accounting II', dept: 'Commerce and Management' },
      { name: 'Cost Accounting', dept: 'Commerce and Management' },
    ]);
    await http().post(`/v1/records/subjects/import/${check.id}/commit`).set(as('principal')).send({}).expect(409);
    expect((await http().get(`/v1/records/subjects/import/${check.id}`).set(as('principal')).expect(200)).body.status).toBe('committed');
    await http().get(`/v1/records/subjects/import/${check.id}`).set(as('outsider')).expect(404);

    // A CSV in "add only" mode: a row whose key exists is an error; missing required columns refuse the file.
    const csv = 'Department,Head email\r\nCommerce and Management,\r\nLanguages,\r\n';
    const insert = (await http().post('/v1/records/departments/import?mode=insert').set(as('principal')).attach('file', Buffer.from(csv), 'd.csv').expect(200)).body;
    expect(insert.rows.map((r: { status: string; code?: string }) => r.code ?? r.status)).toEqual(['IMPORT_EXISTS', 'created']);
    const bad = (await http().post('/v1/records/departments/import').set(as('principal')).attach('file', Buffer.from('Head email\r\nx@y.in\r\n'), 'd.csv').expect(400)).body;
    expect(bad).toMatchObject({ code: 'IMPORT_MISSING_COLUMNS', missing: ['Department'] });

    // Students go through the bulk importer's own rows (families and logins).
    const students = 'Roll number,Full name,Class,Guardian 1 name,Guardian 1 phone,Guardian 1 relation\r\nR9,Meera Joshi,BCom Sem 3 A,Anil Joshi,+919811100001,father\r\n';
    const sv = (await http().post('/v1/records/students/import').set(as('principal')).attach('file', Buffer.from(students), 's.csv').expect(200)).body;
    expect(sv.totals).toMatchObject({ created: 1, error: 0 });
    await http().post(`/v1/records/students/import/${sv.id}/commit`).set(as('principal')).send({}).expect(200);
    expect((await http().get('/v1/records/students?q=Meera').set(as('principal')).expect(200)).body.rows[0]).toMatchObject({ rollNo: 'R9', guardianCount: 1 });
  });

  it('exports the filtered list or the chosen rows as CSV or Excel', async () => {
    const csv = await http().get(`/v1/records/students/export?format=csv&f.section=${t.section.id}&sort=roll:asc&columns=rollNo,fullName,status`).set(as('principal')).expect(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.text.replace(/^﻿/, '').trim().split('\r\n')).toEqual(['Roll no,Student,Status', 'R9,Meera Joshi,Active']);
    const chosen = await http().get(`/v1/records/students/export?format=csv&ids=${t.students[0].id}`).set(as('principal')).expect(200);
    expect(chosen.text.trim().split('\r\n')).toHaveLength(2);
    const x = await http().get('/v1/records/departments/export?format=xlsx').set(as('principal')).buffer(true).parse(binary).expect(200);
    expect(readXlsx(x.body as Buffer)[0]).toEqual(['Department', 'Head', 'Staff', 'Subjects']);
    await http().get('/v1/records/students/export?format=pdf').set(as('principal')).expect(400);
    await http().get('/v1/records/students/export').set(as('teacher')).expect(403);
  });

  it('saves a drag-and-drop order within a group, and duplicates a record next to its original', async () => {
    const list = async () => (await http().get(`/v1/records/subjects?f.programme=${t.program.id}&f.term=3`).set(as('principal')).expect(200)).body.rows.map((r: { code: string }) => r.code);
    expect(await list()).toEqual(['BCOM-3.1', 'BCOM-3.2']);
    const ids = (await http().get(`/v1/records/subjects?f.programme=${t.program.id}&f.term=3`).set(as('principal')).expect(200)).body.rows.map((r: { id: string }) => r.id);
    await http().post('/v1/records/subjects/reorder').set(as('principal')).send({ ids: [ids[1], ids[0]] }).expect(200);
    expect(await list()).toEqual(['BCOM-3.2', 'BCOM-3.1']);
    // A sort the person picks still wins over the manual order.
    expect((await http().get(`/v1/records/subjects?f.programme=${t.program.id}&f.term=3&sort=code:asc`).set(as('principal')).expect(200)).body.rows[0].code).toBe('BCOM-3.1');

    const copy = (await http().post(`/v1/records/subjects/${ids[1]}/duplicate`).set(as('principal')).expect(201)).body;
    expect(copy).toMatchObject({ code: 'BCOM-3.2-COPY', name: 'Cost Accounting (copy)' });
    expect(await list()).toEqual(['BCOM-3.2', 'BCOM-3.2-COPY', 'BCOM-3.1']);
    const copy2 = (await http().post(`/v1/records/subjects/${ids[1]}/duplicate`).set(as('principal')).expect(201)).body;
    expect(copy2.code).toBe('BCOM-3.2-COPY2');

    const term4 = (await http().get(`/v1/records/subjects?f.programme=${t.program.id}`).set(as('principal')).expect(200)).body.rows;
    const bscSem1 = (await http().post('/v1/records/subjects').set(as('principal')).send({ programId: t.program.id, term: 1, code: 'BCOM-1.1', name: 'Accounting basics' }).expect(201)).body;
    const refused = (await http().post('/v1/records/subjects/reorder').set(as('principal')).send({ ids: [bscSem1.id, term4[0].id] }).expect(400)).body;
    expect(refused.message).toBe('Records from different groups cannot be ordered together');
    await http().post('/v1/records/subjects/reorder').set(as('outsider')).send({ ids: [ids[0]] }).expect(404);
    const deptDup = (await http().post(`/v1/records/departments/${deptId}/duplicate`).set(as('principal')).expect(201)).body;
    expect(deptDup).toMatchObject({ name: 'Commerce and Management (copy)', headUserId: null });
  });

  it('moves subjects and staff to a department in bulk, and keeps staff in the bin with their roles', async () => {
    const subs = (await http().get(`/v1/records/subjects?f.department=none`).set(as('principal')).expect(200)).body.rows.map((r: { id: string }) => r.id);
    const moved = (await http().post('/v1/records/subjects/bulk').set(as('principal')).send({ op: 'move', target: { ids: subs }, to: deptId }).expect(200)).body;
    expect(moved.failed).toBe(0);
    expect((await http().get(`/v1/records/subjects?f.department=none`).set(as('principal')).expect(200)).body.total).toBe(0);

    const s = (await http().post('/v1/records/staff').set(as('principal')).send({ fullName: 'Lata Rao', email: 'LATA@x.in', role: 'librarian' }).expect(201)).body;
    expect(s).toMatchObject({ email: 'lata@x.in', roles: 'librarian', employeeCode: null });
    await http().post('/v1/records/staff').set(as('principal')).send({ fullName: 'Other Lata', email: 'lata@x.in', role: 'teacher' }).expect(409);
    const m = (await http().post('/v1/records/staff/bulk').set(as('principal')).send({ op: 'move', target: { ids: [s.id] }, to: deptId }).expect(200)).body;
    expect(m.succeeded).toBe(1);
    const after = (await http().get(`/v1/records/staff/${s.id}`).set(as('principal')).expect(200)).body;
    expect(after).toMatchObject({ departmentName: 'Commerce and Management', employeeCode: expect.stringMatching(/\d/) });
    expect((await http().get(`/v1/records/staff?f.department=${deptId}`).set(as('principal')).expect(200)).body.rows.map((r: { fullName: string }) => r.fullName)).toContain('Lata Rao');
    await http().delete(`/v1/records/staff/${t.principal.id}`).set(as('principal')).expect(403);

    const del = (await http().delete(`/v1/records/staff/${s.id}`).set(as('principal')).expect(200)).body;
    expect((await owner.query(`select count(*)::int as n from users where id = $1`, [s.id])).rows[0].n).toBe(0);
    await http().post(`/v1/recycle-bin/${del.binId}/restore`).set(as('principal')).expect(200);
    expect((await owner.query(`select role::text from user_roles where user_id = $1`, [s.id])).rows).toEqual([{ role: 'librarian' }]);
    expect((await owner.query(`select count(*)::int as n from department_staff where user_id = $1`, [s.id])).rows[0].n).toBe(1);
    // Students are not staff.
    await http().get(`/v1/records/staff/${t.studentUser.id}`).set(as('principal')).expect(404);
  });

  it('saves views per person, shares them with roles and keeps them in the institution', async () => {
    const state = { q: 'sem', filters: { programme: t.program.id }, sort: { id: 'name', dir: 'desc' }, columns: ['displayName', 'studentCount'], density: 'compact', pageSize: 50 };
    const v = (await http().post('/v1/saved-views').set(as('principal')).send({ page: 'classes', name: 'BCom classes', state, isDefault: true }).expect(201)).body;
    await http().post('/v1/saved-views').set(as('principal')).send({ page: 'classes', name: 'bcom CLASSES', state }).expect(409);
    const v2 = (await http().post('/v1/saved-views').set(as('principal')).send({ page: 'classes', name: 'Second', state: {}, isDefault: true }).expect(201)).body;
    const mine = (await http().get('/v1/saved-views?page=classes').set(as('principal')).expect(200)).body;
    expect(mine.map((x: { name: string; isDefault: boolean }) => [x.name, x.isDefault])).toEqual([
      ['BCom classes', false],
      ['Second', true],
    ]);
    expect(mine[0]).toMatchObject({ state, mine: true, sharedRoles: [] });
    await http().get('/v1/saved-views').set(as('principal')).expect(400);

    expect((await http().get('/v1/saved-views?page=classes').set(as('teacher')).expect(200)).body).toEqual([]);
    await http().put(`/v1/saved-views/${v.id}`).set(as('principal')).send({ sharedRoles: ['teacher'] }).expect(200);
    const shared = (await http().get('/v1/saved-views?page=classes').set(as('teacher')).expect(200)).body;
    expect(shared).toEqual([expect.objectContaining({ id: v.id, mine: false, isDefault: false, owner: expect.any(String) })]);
    await http().put(`/v1/saved-views/${v.id}`).set(as('teacher')).send({ name: 'Mine now' }).expect(403);
    await http().delete(`/v1/saved-views/${v.id}`).set(as('teacher')).expect(403);
    expect((await http().get('/v1/saved-views?page=classes').set(as('outsider')).expect(200)).body).toEqual([]);
    await http().delete(`/v1/saved-views/${v2.id}`).set(as('outsider')).expect(404);
    await http().delete(`/v1/saved-views/${v2.id}`).set(as('principal')).expect(204);
  });
});
