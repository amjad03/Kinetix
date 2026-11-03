import type { INestApplication } from '@nestjs/common';
import argon2 from 'argon2';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp, createTenant, FixedClock, ownerPool, pairBoard } from './helpers.js';

/**
 * Academics pass: the timetable studio (constraint generation, drag-and-drop checks, versions and publishing),
 * teacher unavailability, timetables as they are on a day (substitutes, compensatory days, batches, electives) for the
 * teacher, the smart board and families, the teaching diary against lesson plans with syllabus coverage, and the
 * calendar's working-day norms and holiday propagation. Figures are worked by hand in the comments.
 */
describe('academics pass', () => {
  const owner = ownerPool();
  // Monday 9 November 2026, 10:20 IST: inside the fixture's Monday 10:00-10:55 period.
  const clock = new FixedClock(new Date('2026-11-09T04:50:00Z'));
  let app: INestApplication;
  const http = () => request(app.getHttpServer());
  const q = async (sql: string, args: unknown[] = []) => (await owner.query(sql, args)).rows;
  let hash: string;
  const loginAs = async (slug: string, email: string) => (await http().post('/v1/auth/login').send({ tenant: slug, login: email, password: 'pw' }).expect(201)).body.accessToken as string;
  const staff = async (tenantId: string, email: string, role: string) => {
    const [u] = await q('insert into users (tenant_id, full_name, email, password_hash) values ($1, $2, $3, $4) returning id', [tenantId, email.split('@')[0], email, hash]);
    await q('insert into user_roles (tenant_id, user_id, role) values ($1, $2, $3)', [tenantId, u.id, role]);
    return u.id as string;
  };

  beforeAll(async () => {
    app = await createApp(clock);
    hash = await argon2.hash('pw');
  });
  afterAll(async () => {
    await app.close();
    await owner.end();
  });

  describe('timetable studio', () => {
    let t: Awaited<ReturnType<typeof createTenant>>;
    let tok: Record<string, string>;
    const as = (who: string) => ({ authorization: `Bearer ${tok[who]}` });
    let t3: string;
    let t4: string;
    let lab: string;
    let evs: string;
    let e1: string;
    let e2: string;
    let versionId: string;
    type Slot = { id: string; sectionId: string; subjectId: string; teacherId: string; roomId: string | null; dayOfWeek: number; startsAt: string; endsAt: string; batch: string | null; combinedSectionIds: string[] | null; kind: string; blockId: string | null; room: string | null };

    beforeAll(async () => {
      t = await createTenant(owner);
      t3 = await staff(t.tenantId, `t3-${t.slug}@x.in`, 'teacher');
      t4 = await staff(t.tenantId, `t4-${t.slug}@x.in`, 'teacher');
      tok = { principal: await loginAs(t.slug, t.principal.email!), teacher: await loginAs(t.slug, t.teacher.email!) };
      // L-T-P: Corporate Accounting 3-0-0; Tally lab 0-0-2 (a lab course); EVS 1-0-0 taught to A and B together; an
      // open elective basket of Marketing and Banking, 2 lectures each.
      await q('update subjects set lecture_hours = 3 where id = $1', [t.subject.id]);
      const sub = async (code: string, name: string, type: string, l: number, p: number) => (await q("insert into subjects (tenant_id, program_id, term, code, name, course_type, lecture_hours, practical_hours) values ($1, $2, 3, $3, $4, $5, $6, $7) returning id", [t.tenantId, t.program.id, code, name, type, l, p]))[0].id as string;
      lab = await sub('BCOM-3.2', 'Tally lab', 'lab', 0, 2);
      evs = await sub('BCOM-3.3', 'Environmental studies', 'core', 1, 0);
      e1 = await sub('BCOM-3.E1', 'Digital marketing', 'open_elective', 2, 0);
      e2 = await sub('BCOM-3.E2', 'Banking', 'open_elective', 2, 0);
      const [basket] = await q("insert into elective_baskets (tenant_id, program_id, term, name, kind) values ($1, $2, 3, 'Open elective I', 'open_elective') returning id", [t.tenantId, t.program.id]);
      await q('insert into elective_basket_subjects (tenant_id, basket_id, subject_id) values ($1, $2, $3), ($1, $2, $4)', [t.tenantId, basket.id, e1, e2]);
      const alloc = (sec: string, subj: string, who: string, role: string, batch: string | null) => q("insert into faculty_allocations (tenant_id, academic_year_id, section_id, subject_id, teacher_id, role, batch, hours_per_week) values ($1, (select id from academic_years where tenant_id = $1), $2, $3, $4, $5, $6, 2)", [t.tenantId, sec, subj, who, role, batch]);
      await alloc(t.section.id, t.subject.id, t.teacher.id, 'primary', null);
      await alloc(t.otherSection.id, t.subject.id, t.teacher2.id, 'primary', null);
      await alloc(t.section.id, lab, t3, 'lab', 'B1');
      await alloc(t.section.id, lab, t4, 'lab', 'B2');
      await alloc(t.otherSection.id, lab, t3, 'lab', null);
      await alloc(t.section.id, evs, t4, 'primary', null);
      await alloc(t.section.id, e1, t4, 'primary', null);
      await alloc(t.section.id, e2, t3, 'primary', null);
      // Lab batches of A: Student A in B1, B and C in B2.
      await q('insert into student_batches (tenant_id, section_id, student_id, batch) values ($1, $2, $3, $4), ($1, $2, $5, $6), ($1, $2, $7, $6)', [t.tenantId, t.section.id, t.students[0].id, 'B1', t.students[1].id, 'B2', t.students[2].id]);
      await q("insert into rooms (tenant_id, campus_id, name, kind, capacity) values ($1, $2, 'Room 2', 'classroom', 60), ($1, $2, 'Lab 1', 'lab', 30), ($1, $2, 'Lab 2', 'lab', 30)", [t.tenantId, t.campus.id]);
      // The bell: two periods, a break, two periods, lunch, two periods; Monday to Friday.
      const bell = [
        { label: 'P1', startsAt: '09:00', endsAt: '09:50', kind: 'class' },
        { label: 'P2', startsAt: '09:50', endsAt: '10:40', kind: 'class' },
        { label: 'Break', startsAt: '10:40', endsAt: '11:00', kind: 'break' },
        { label: 'P3', startsAt: '11:00', endsAt: '11:50', kind: 'class' },
        { label: 'P4', startsAt: '11:50', endsAt: '12:40', kind: 'class' },
        { label: 'Lunch', startsAt: '12:40', endsAt: '13:30', kind: 'break' },
        { label: 'P5', startsAt: '13:30', endsAt: '14:20', kind: 'class' },
        { label: 'P6', startsAt: '14:20', endsAt: '15:10', kind: 'class' },
      ];
      await q("insert into period_structures (tenant_id, name, days, periods, is_default) values ($1, 'Day', '{1,2,3,4,5}', $2, true)", [t.tenantId, JSON.stringify(bell)]);
    });

    it('keeps teacher unavailability (own only for a teacher) and refuses a live period then', async () => {
      // The teacher of Accounting A is away every Wednesday.
      const mine = (await http().post('/v1/records/faculty-unavailability').set(as('teacher')).send({ dayOfWeek: 3, reason: 'Research day at the university' }).expect(201)).body;
      expect(mine.id).toBeTruthy();
      await http().post('/v1/records/faculty-unavailability').set(as('teacher')).send({ teacherId: t.teacher2.id, dayOfWeek: 2, reason: 'Not mine to set' }).expect(403);
      await http().post('/v1/records/faculty-unavailability').set(as('teacher')).send({ dayOfWeek: 2, startsAt: '14:00', reason: 'Half given' }).expect(400);
      const list = (await http().get('/v1/records/faculty-unavailability').set(as('teacher')).expect(200)).body;
      expect(list.total).toBe(1);
      const live = await http().post('/v1/admin/timetable/slots').set(as('principal')).send({ sectionId: t.section.id, subjectId: t.subject.id, teacherId: t.teacher.id, dayOfWeek: 3, startsAt: '11:00', endsAt: '11:50' }).expect(409);
      expect(live.body.code).toBe('TIMETABLE_TEACHER_UNAVAILABLE');
    });

    it('generates a week for two classes under every constraint', async () => {
      await http().post('/v1/timetable-studio/versions').set(as('teacher')).send({ name: 'x', sectionIds: [t.section.id] }).expect(403);
      const v = (await http().post('/v1/timetable-studio/versions').set(as('principal')).send({ name: 'Odd semester 2026', sectionIds: [t.section.id, t.otherSection.id], settings: { combine: [{ subjectId: evs, sectionIds: [t.section.id, t.otherSection.id] }] } }).expect(201)).body;
      versionId = v.id;
      expect(v.status).toBe('draft');
      // 3 + 3 accounting, labs: A B1 (2), A B2 (2), B (2), EVS once for both, electives 2 meetings x 2 options = 17.
      expect(v.report.unplaced).toEqual([]);
      expect(v.report.placed).toBe(17);
      const full = (await http().get(`/v1/timetable-studio/versions/${versionId}`).set(as('principal')).expect(200)).body;
      const slots = full.slots as Slot[];
      expect(slots).toHaveLength(17);
      expect(full.problems).toEqual([]);
      expect(full.periods.map((p: { startsAt: string }) => p.startsAt)).toEqual(['09:00', '09:50', '11:00', '11:50', '13:30', '14:20']);
      // Accounting A: three days, never on Wednesday (the teacher is away).
      const accA = slots.filter((s) => s.subjectId === t.subject.id && s.sectionId === t.section.id);
      expect(accA).toHaveLength(3);
      expect(accA.some((s) => s.dayOfWeek === 3)).toBe(false);
      expect(new Set(accA.map((s) => s.dayOfWeek)).size).toBe(3);
      // Each lab is a block of two back-to-back periods in a lab that does not cross a break.
      for (const batch of ['B1', 'B2']) {
        const block = slots.filter((s) => s.subjectId === lab && s.batch === batch);
        expect(block).toHaveLength(2);
        expect(block[0].blockId).toBe(block[1].blockId);
        expect(block[0].endsAt).toBe(block[1].startsAt);
        expect(['09:50', '11:50'].includes(block[0].startsAt)).toBe(false);
        expect(block[0].room).toMatch(/^Lab/);
      }
      // The batches run side by side in the two labs.
      const b1 = slots.find((s) => s.subjectId === lab && s.batch === 'B1')!;
      const b2 = slots.find((s) => s.subjectId === lab && s.batch === 'B2')!;
      expect([b1.dayOfWeek, b1.startsAt]).toEqual([b2.dayOfWeek, b2.startsAt]);
      expect(b1.roomId).not.toBe(b2.roomId);
      // EVS meets once for A and B together.
      const ev = slots.filter((s) => s.subjectId === evs);
      expect(ev).toHaveLength(1);
      expect(ev[0].combinedSectionIds).toEqual([t.otherSection.id]);
      // The electives run in parallel for both classes, each option in its own room.
      const el = slots.filter((s) => s.kind === 'elective');
      expect(el).toHaveLength(4);
      const cells = [...new Set(el.map((s) => `${s.dayOfWeek}|${s.startsAt}`))];
      expect(cells).toHaveLength(2);
      for (const c of cells) {
        const here = el.filter((s) => `${s.dayOfWeek}|${s.startsAt}` === c);
        expect(new Set(here.map((s) => s.subjectId))).toEqual(new Set([e1, e2]));
        expect(new Set(here.map((s) => s.roomId)).size).toBe(2);
        expect(here.every((s) => s.combinedSectionIds?.[0] === t.otherSection.id)).toBe(true);
      }
      // Workload: Accounting A's teacher has 3 periods here; nobody over the 30-period or 6-a-day limit.
      const load = full.workload as { teacherId: string; periods: number; status: string }[];
      expect(load.find((w) => w.teacherId === t.teacher.id)?.periods).toBe(3);
      expect(load.every((w) => w.status === 'ok')).toBe(true);
      // Publishing would add 17 periods and remove A's one live period.
      expect(full.diff).toEqual(expect.arrayContaining([expect.objectContaining({ sectionId: t.section.id, removed: 1 })]));
    });

    it('checks a drag and drop: unavailable teacher, class clash, then a free cell; a lab block moves together', async () => {
      const full = (await http().get(`/v1/timetable-studio/versions/${versionId}`).set(as('principal')).expect(200)).body;
      const slots = full.slots as Slot[];
      const acc = slots.find((s) => s.subjectId === t.subject.id && s.sectionId === t.section.id)!;
      const url = `/v1/timetable-studio/versions/${versionId}/slots/${acc.id}`;
      const away = (await http().patch(url).set(as('principal')).send({ dayOfWeek: 3, startsAt: '09:00', dryRun: true }).expect(200)).body;
      expect(away.ok).toBe(false);
      expect(away.problems.map((p: { kind: string }) => p.kind)).toContain('unavailable');
      const elective = slots.find((s) => s.kind === 'elective')!;
      const clash = await http().patch(url).set(as('principal')).send({ dayOfWeek: elective.dayOfWeek, startsAt: elective.startsAt }).expect(409);
      expect(clash.body.code).toBe('TIMETABLE_CLASS_CLASH');
      // A free cell for class A (and its teacher): not Wednesday, nothing of A or combined into A then.
      const busyA = new Set(slots.filter((s) => s.sectionId === t.section.id || s.combinedSectionIds?.includes(t.section.id)).map((s) => `${s.dayOfWeek}|${s.startsAt}`));
      const accDays = new Set(slots.filter((s) => s.subjectId === t.subject.id && s.sectionId === t.section.id && s.id !== acc.id).map((s) => s.dayOfWeek));
      let target: { dayOfWeek: number; startsAt: string } | null = null;
      for (const d of [1, 2, 4, 5]) for (const p of full.periods as { startsAt: string }[]) if (!target && !accDays.has(d) && !busyA.has(`${d}|${p.startsAt}`)) target = { dayOfWeek: d, startsAt: p.startsAt };
      const ok = (await http().patch(url).set(as('principal')).send({ ...target!, roomId: null }).expect(200)).body;
      expect(ok.ok).toBe(true);
      expect(ok.slots[0]).toMatchObject({ dayOfWeek: target!.dayOfWeek, startsAt: target!.startsAt });
      // A lab block: dragging the first period reports (or moves) both.
      const b1 = slots.filter((s) => s.subjectId === lab && s.batch === 'B1');
      const dry = (await http().patch(`/v1/timetable-studio/versions/${versionId}/slots/${b1[0].id}`).set(as('principal')).send({ dayOfWeek: b1[0].dayOfWeek === 1 ? 2 : 1, startsAt: '13:30', dryRun: true }).expect(200)).body;
      if (!dry.ok) expect(new Set(dry.problems.map((p: { slotId: string }) => p.slotId)).size).toBeGreaterThan(0);
      // Locking keeps a period when the version is generated again.
      await http().post(`${url}/lock`).set(as('principal')).send({ locked: true }).expect(200);
      const again = (await http().post(`/v1/timetable-studio/versions/${versionId}/generate`).set(as('principal')).send({}).expect(200)).body;
      expect(again.placed).toBe(17);
      const after = (await http().get(`/v1/timetable-studio/versions/${versionId}`).set(as('principal')).expect(200)).body.slots as (Slot & { locked: boolean })[];
      expect(after.find((s) => s.id === acc.id)).toMatchObject({ locked: true, dayOfWeek: target!.dayOfWeek, startsAt: target!.startsAt });
    });

    it('publishes the version as the live timetable, tells teachers and families, supersedes the old one and prints a grid', async () => {
      await http().post(`/v1/timetable-studio/versions/${versionId}/publish`).set(as('teacher')).send({}).expect(403);
      const out = (await http().post(`/v1/timetable-studio/versions/${versionId}/publish`).set(as('principal')).send({ effectiveFrom: '2026-11-16' }).expect(200)).body;
      expect(out).toMatchObject({ published: 17, archived: 1, superseded: [] });
      // Teachers (4 here, plus the old period's teacher, the same person), 2 guardians and 1 student login.
      const [{ n }] = await q('select count(*)::int as n from notifications where dedupe_key = $1', [`timetable:${versionId}`]);
      expect(n).toBe(out.told);
      expect(n).toBe(7);
      const live = (await http().get(`/v1/admin/timetable?sectionId=${t.otherSection.id}`).set(as('principal')).expect(200)).body as unknown[];
      // B: 3 accounting + 2 lab + EVS and 4 elective periods combined into it = 10.
      expect(live).toHaveLength(10);
      const [{ archived }] = await q('select archived_at is not null as archived from timetable_slots where id = $1', [t.slot.id]);
      expect(archived).toBe(true);
      await http().patch(`/v1/timetable-studio/versions/${versionId}/slots/${(live[0] as { id: string }).id}`).set(as('principal')).send({ dayOfWeek: 1, startsAt: '09:00' }).expect(409);
      const [{ n: events }] = await q("select count(*)::int as n from domain_events where tenant_id = $1 and type = 'timetable.version_published'", [t.tenantId]);
      expect(events).toBe(1);
      // A copy to change it, published, supersedes it.
      const copy = (await http().post(`/v1/timetable-studio/versions/${versionId}/duplicate`).set(as('principal')).expect(201)).body;
      const second = (await http().post(`/v1/timetable-studio/versions/${copy.id}/publish`).set(as('principal')).send({ notify: false }).expect(200)).body;
      expect(second).toMatchObject({ published: 17, archived: 17 });
      const list = (await http().get('/v1/timetable-studio/versions').set(as('principal')).expect(200)).body;
      expect(list.rows.map((r: { status: string }) => r.status)).toEqual(['published', 'superseded']);
      const pdf = await http().get(`/v1/timetable-studio/versions/live/pdf?by=class&id=${t.section.id}`).set(as('principal')).buffer(true).parse((res, cb) => {
        const parts: Buffer[] = [];
        res.on('data', (c: Buffer) => parts.push(c));
        res.on('end', () => cb(null, Buffer.concat(parts)));
      }).expect(200);
      expect(pdf.headers['content-type']).toBe('application/pdf');
      expect((pdf.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');
    });

    it('keeps another institution out', async () => {
      const other = await createTenant(owner);
      const tok2 = await loginAs(other.slug, other.principal.email!);
      await http().get(`/v1/timetable-studio/versions/${versionId}`).set({ authorization: `Bearer ${tok2}` }).expect(404);
      expect((await http().get('/v1/timetable-studio/versions').set({ authorization: `Bearer ${tok2}` }).expect(200)).body.total).toBe(0);
      await http().post('/v1/timetable-studio/versions').set({ authorization: `Bearer ${tok2}` }).send({ name: 'x', sectionIds: [t.section.id] }).expect(404);
      expect((await http().get('/v1/records/faculty-unavailability').set({ authorization: `Bearer ${tok2}` }).expect(200)).body.total).toBe(0);
    });
  });

  describe('day timetables, the teaching diary and the calendar', () => {
    let t: Awaited<ReturnType<typeof createTenant>>;
    let tok: Record<string, string>;
    const as = (who: string) => ({ authorization: `Bearer ${tok[who]}` });
    let hod: string;
    let topicIds: string[];
    let labSlot: string;

    beforeAll(async () => {
      t = await createTenant(owner);
      hod = await staff(t.tenantId, `hod-${t.slug}@x.in`, 'hod');
      tok = { principal: await loginAs(t.slug, t.principal.email!), teacher: await loginAs(t.slug, t.teacher.email!), teacher2: await loginAs(t.slug, t.teacher2.email!), hod: await loginAs(t.slug, `hod-${t.slug}@x.in`), parent: await loginAs(t.slug, t.guardian.email!), student: await loginAs(t.slug, t.studentUser.email!) };
      const [dep] = await q("insert into departments (tenant_id, name, head_user_id) values ($1, 'Commerce', $2) returning id", [t.tenantId, hod]);
      await q('update subjects set department_id = $2, lecture_hours = 4 where id = $1', [t.subject.id, dep.id]);
      await q('insert into department_staff (tenant_id, department_id, user_id) values ($1, $2, $3)', [t.tenantId, dep.id, t.teacher.id]);
      await q("insert into curricula (code, name, level) values ('acad-pass', 'Academics pass', 'ug') on conflict do nothing");
      const [course] = await q("insert into courses (curriculum_code, code, title, term, source) values ('acad-pass', $1, 'Corporate accounting', 3, 'test') returning id", [`acp-${t.tenantId.slice(0, 8)}`]);
      await q('update subjects set course_id = $2 where id = $1', [t.subject.id, course.id]);
      const [ch] = await q("insert into chapters (tenant_id, course_id, position, title) values ($1, $2, 1, 'Company final accounts') returning id", [t.tenantId, course.id]);
      topicIds = (await q("insert into topics (tenant_id, chapter_id, position, title) values ($1, $2, 1, 'Schedule III'), ($1, $2, 2, 'Profit and loss statement'), ($1, $2, 3, 'Balance sheet'), ($1, $2, 4, 'Notes to accounts') returning id", [t.tenantId, ch.id])).map((r) => r.id as string);
      // An odd semester from 1 August to 30 November 2026.
      await q("insert into academic_terms (tenant_id, academic_year_id, name, starts_on, ends_on) values ($1, (select id from academic_years where tenant_id = $1), 'Odd semester 2026', '2026-08-01', '2026-11-30')", [t.tenantId]);
      // A lab period of batch B1 on Monday afternoon; Student A is in B1, Student C (the student login) in B2.
      labSlot = (await q("insert into timetable_slots (tenant_id, academic_year_id, section_id, subject_id, teacher_id, day_of_week, starts_at, ends_at, batch) values ($1, (select id from academic_years where tenant_id = $1), $2, $3, $4, 1, '14:00', '15:40', 'B1') returning id", [t.tenantId, t.section.id, t.subject.id, t.teacher2.id]))[0].id;
      await q('insert into student_batches (tenant_id, section_id, student_id, batch) values ($1, $2, $3, $4), ($1, $2, $5, $6)', [t.tenantId, t.section.id, t.students[0].id, 'B1', t.students[2].id, 'B2']);
    });

    it('shows a substitute everywhere: the teachers\' days, the board in the room, the family\'s week', async () => {
      await http().post('/v1/timetable/substitutions').set(as('principal')).send({ slotId: t.slot.id, date: '2026-11-09', substituteTeacherId: t.teacher2.id, reason: 'On duty at the university' }).expect(201);
      const mine = (await http().get('/v1/teacher/timetable?date=2026-11-09').set(as('teacher')).expect(200)).body;
      expect(mine.periods.find((p: { slotId: string }) => p.slotId === t.slot.id).coveredBy).toMatchObject({ id: t.teacher2.id });
      const theirs = (await http().get('/v1/teacher/timetable?date=2026-11-09').set(as('teacher2')).expect(200)).body;
      const covering = theirs.periods.find((p: { slotId: string }) => p.slotId === t.slot.id);
      expect(covering.substituteFor).toMatchObject({ id: t.teacher.id });
      expect(covering.isNow).toBe(true);
      // The substitute signs in to the room's board: the period is theirs now, and today's room timetable says who covers it.
      const { boardToken, socket } = await pairBoard(app, t, tok.teacher2);
      try {
        const now = (await http().get('/v1/classroom/now').set({ authorization: `Bearer ${boardToken}` }).expect(200)).body;
        expect(now.slot?.id).toBe(t.slot.id);
        const today = (await http().get('/v1/classroom/today').set({ authorization: `Bearer ${boardToken}` }).expect(200)).body;
        expect(today.room.name).toBe('Room 1');
        expect(today.roomPeriods).toEqual([expect.objectContaining({ slotId: t.slot.id, teacher: t.teacher2.fullName, usualTeacher: t.teacher.fullName, isNow: true })]);
        expect(today.myPeriods.map((p: { slotId: string }) => p.slotId)).toEqual([t.slot.id, labSlot]);
        expect(today.currentSlotId).toBe(t.slot.id);
      } finally {
        socket.close();
      }
      // The family's week: Monday has the period with the substitute; the lab is only for B1 (Student A).
      const a = (await http().get(`/v1/parent/children/${t.students[0].id}/timetable`).set(as('parent')).expect(200)).body;
      expect(a.from).toBe('2026-11-09');
      expect(a.days).toHaveLength(7);
      expect(a.days[0].periods.map((p: { subject: string; teacherId: string; batch: string | null }) => [p.batch, p.teacherId])).toEqual([[null, t.teacher2.id], ['B1', t.teacher2.id]]);
      const c = (await http().get(`/v1/parent/children/${t.students[2].id}/timetable?from=2026-11-16&days=1`).set(as('student')).expect(200)).body;
      expect(c.days[0].periods).toHaveLength(1); // B2: not the B1 lab
      expect(c.days[0].periods[0].usualTeacher).toBeNull(); // the substitution was for the 9th only
      await http().get(`/v1/parent/children/${t.students[2].id}/timetable`).set(as('parent')).expect(404);
    });

    it('follows a compensatory working day and a holiday, and a holiday cancels the substitutions and special classes on it', async () => {
      // Saturday 14 November follows Monday; Monday 23 November is a holiday with a substitution and an extra class planned.
      await q("insert into working_day_swaps (tenant_id, date, follows_weekday, reason) values ($1, '2026-11-14', 1, 'Make-up for Deepavali')", [t.tenantId]);
      const sat = (await http().get(`/v1/parent/children/${t.students[0].id}/timetable?from=2026-11-14&days=1`).set(as('parent')).expect(200)).body.days[0];
      expect(sat).toMatchObject({ weekday: 6, follows: 1 });
      expect(sat.periods).toHaveLength(2);
      await http().post('/v1/timetable/substitutions').set(as('principal')).send({ slotId: t.slot.id, date: '2026-11-23', substituteTeacherId: t.teacher2.id, reason: 'Exam duty' }).expect(201);
      await q("insert into special_classes (tenant_id, kind, section_id, subject_id, teacher_id, date, starts_at, ends_at) values ($1, 'remedial', $2, $3, $4, '2026-11-23', '16:00', '16:50')", [t.tenantId, t.section.id, t.subject.id, t.teacher.id]);
      const hol = (await http().post('/v1/admin/calendar').set(as('principal')).send({ kind: 'holiday', title: 'Kanakadasa Jayanti', startsOn: '2026-11-23', endsOn: '2026-11-23' }).expect(201)).body;
      // Two weekly Monday periods do not meet; one substitution and one special class are cancelled.
      expect(hol.effect).toEqual({ periodsAffected: 2, substitutionsCancelled: 1, specialClassesCancelled: 1 });
      const [{ n }] = await q("select count(*)::int as n from domain_events where tenant_id = $1 and type = 'calendar.event_published'", [t.tenantId]);
      expect(n).toBe(1);
      const day = (await http().get(`/v1/parent/children/${t.students[0].id}/timetable?from=2026-11-23&days=1`).set(as('parent')).expect(200)).body.days[0];
      expect(day).toMatchObject({ holiday: 'Kanakadasa Jayanti', periods: [] });
    });

    it('checks the calendar against the university\'s working-day minimum', async () => {
      await q("insert into affiliation_settings (tenant_id, profile_code, scheme_code) values ($1, 'bengaluru-city-university', 'sep-2024')", [t.tenantId]);
      const wd = (await http().get('/v1/academic-planning/working-days?from=2026-08-01&to=2026-11-30').set(as('principal')).expect(200)).body;
      expect(wd.norm).toMatchObject({ minWorkingDaysPerTerm: 90, minWorkingDaysPerYear: 180 });
      // 1 Aug - 30 Nov 2026, Monday to Saturday: 104 days, less the holiday on Monday 23 Nov = 103 (the Saturday swap was a working day anyway).
      const term = wd.terms.find((x: { name: string }) => x.name === 'Odd semester 2026');
      expect(term).toMatchObject({ days: 103, norm: 90, short: 0 });
      expect(wd.year.norm).toBe(180);
    });

    it('keeps the teaching diary against the lesson plan and marks the topics covered', async () => {
      // A lesson plan for Monday 2 November planned topics 1 and 2; only topic 1 was taught.
      await q("insert into lesson_plans (tenant_id, section_id, subject_id, timetable_slot_id, date, teacher_id, topic_ids, content) values ($1, $2, $3, $4, '2026-11-02', $5, $6, '{}')", [t.tenantId, t.section.id, t.subject.id, t.slot.id, t.teacher.id, `{${topicIds[0]},${topicIds[1]}}`]);
      const behind = await http().post('/v1/teaching-log').set(as('teacher')).send({ slotId: t.slot.id, date: '2026-11-02', topicIds: [topicIds[0]], delivery: 'lecture', summary: 'Schedule III format' }).expect(400);
      expect(behind.body.message).toMatch(/behind/);
      const e1 = (await http().post('/v1/teaching-log').set(as('teacher')).send({ slotId: t.slot.id, date: '2026-11-02', topicIds: [topicIds[0]], summary: 'Schedule III format', deviationReason: 'Students needed the format again' }).expect(200)).body;
      expect(e1.againstPlan).toBe('behind');
      // No plan on 26 October: topics 2 and 3 taught.
      const e2 = (await http().post('/v1/teaching-log').set(as('teacher')).send({ slotId: t.slot.id, date: '2026-10-26', topicIds: [topicIds[1], topicIds[2]], delivery: 'discussion' }).expect(200)).body;
      expect(e2.againstPlan).toBe('unplanned');
      // Not a meeting day, the future, another teacher, a topic of another course.
      await http().post('/v1/teaching-log').set(as('teacher')).send({ slotId: t.slot.id, date: '2026-11-03', topicIds: [topicIds[0]] }).expect(400);
      await http().post('/v1/teaching-log').set(as('teacher')).send({ slotId: t.slot.id, date: '2026-11-16', topicIds: [topicIds[0]] }).expect(400);
      await http().post('/v1/teaching-log').set(as('teacher2')).send({ slotId: t.slot.id, date: '2026-10-19', topicIds: [topicIds[0]] }).expect(403);
      await http().post('/v1/teaching-log').set(as('teacher')).send({ slotId: t.slot.id, date: '2026-10-19', topicIds: ['11111111-1111-4111-8111-111111111111'] }).expect(400);
      // The substitute writes today's period.
      const sub = (await http().post('/v1/teaching-log').set(as('teacher2')).send({ slotId: t.slot.id, date: '2026-11-09', summary: 'Revision of Schedule III', delivery: 'revision', source: 'teacher_app' }).expect(200)).body;
      expect(sub).toMatchObject({ substitute: true, teacherId: t.teacher2.id, source: 'teacher_app' });
      // Topics 1, 2, 3 of 4 are covered: 75%.
      const cov = (await http().get(`/v1/coverage?sectionId=${t.section.id}&subjectId=${t.subject.id}`).set(as('teacher')).expect(200)).body;
      expect(cov).toMatchObject({ covered: 3, total: 4, percent: 75 });
      const reg = (await http().get(`/v1/teaching-log/register?sectionId=${t.section.id}&subjectId=${t.subject.id}`).set(as('teacher')).expect(200)).body;
      // Mondays 3 Aug - 30 Nov (18) for the 10:00 period less the holiday on 23 Nov, plus the Saturday that followed Monday = 18;
      // the B1 lab period is the same subject: 18 more. Up to today (9 Nov): 15 + 15. Allotted: 4 lectures x 17 weeks.
      expect(reg.hours).toMatchObject({ perWeek: 4, allotted: 68, scheduled: 36, scheduledToDate: 30, logged: 3, held: 3 });
      expect(reg.topics).toMatchObject({ covered: 3, total: 4, percent: 75 });
      expect(reg.againstPlan).toMatchObject({ behind: 1, unplanned: 2 });
      // 75% covered against 83.3% of the term's periods gone: within ten points, on track.
      expect(reg.elapsedPct).toBe(83.3);
      expect(reg.pace).toBe('on_track');
      await http().get(`/v1/teaching-log/register?sectionId=${t.section.id}&subjectId=${t.subject.id}`).set(as('parent')).expect(403);
      const pending = (await http().get('/v1/teaching-log/pending').set(as('teacher')).expect(200)).body as { date: string }[];
      // The last two weeks: Monday 26 Oct (logged), 2 Nov (logged), 9 Nov (covered by teacher2) — none left for the teacher.
      expect(pending.filter((x) => x.date >= '2026-10-27')).toEqual([]);
    });

    it('lets the head of department review the diary and see syllabus completion; the teacher cannot review', async () => {
      const list = (await http().get('/v1/records/teaching-logs').set(as('hod')).expect(200)).body;
      expect(list.total).toBe(3);
      const ownList = (await http().get('/v1/records/teaching-logs').set(as('teacher2')).expect(200)).body;
      expect(ownList.total).toBe(1);
      const id = list.rows.find((r: { againstPlan: string }) => r.againstPlan === 'behind').id;
      await http().post(`/v1/teaching-log/${id}/review`).set(as('teacher')).send({ remark: 'x' }).expect(403);
      const r = (await http().post(`/v1/teaching-log/${id}/review`).set(as('hod')).send({ remark: 'Plan a revision period next week' }).expect(200)).body;
      expect(r.reviewedBy).toBe(hod);
      const [{ n }] = await q("select count(*)::int as n from notifications where dedupe_key = $1 and user_id = $2", [`teaching-log-review:${id}`, t.teacher.id]);
      expect(n).toBe(1);
      const done = (await http().get('/v1/teaching-log/completion').set(as('hod')).expect(200)).body.rows;
      expect(done).toEqual([expect.objectContaining({ subjectId: t.subject.id, covered: 3, topics: 4, coveredPct: 75, logged: 3, behindPlan: 1, unreviewed: 2, pace: 'on_track' })]);
      const other = await createTenant(owner);
      const tok2 = await loginAs(other.slug, other.principal.email!);
      expect((await http().get('/v1/records/teaching-logs').set({ authorization: `Bearer ${tok2}` }).expect(200)).body.total).toBe(0);
      await http().post(`/v1/teaching-log/${id}/review`).set({ authorization: `Bearer ${tok2}` }).send({}).expect(404);
    });
  });
});
