/** Part 1: the institution, programmes, people, classes, timetable and academic calendar. */
import { DEPARTMENTS, DOMAIN, FEMALE, MALE, PROGRAMS, SLUG, STAFF, SURNAMES, type Dept } from './data.js';
import type { Ctx, SectionRef, StudentRef, SubjectRef, UserRef } from './ctx.js';
import { addDays, iso, makeKit, rng, weekday, type Kit } from './kit.js';

export const PERIODS = [['09:00', '09:55'], ['10:00', '10:55'], ['11:15', '12:10'], ['12:15', '13:10'], ['14:00', '14:55']] as const;

/** Karnataka and national holidays for 2026-27 (dates are for the demo; each institution keeps its own). */
export const HOLIDAYS: [string, string, string][] = [
  ['Independence Day', '2026-08-15', '2026-08-15'],
  ['Varamahalakshmi Vrata', '2026-08-21', '2026-08-21'],
  ['Ganesh Chaturthi', '2026-09-14', '2026-09-14'],
  ['Gandhi Jayanti', '2026-10-02', '2026-10-02'],
  ['Mahanavami and Vijayadashami (Dasara)', '2026-10-19', '2026-10-21'],
  ['Maharshi Valmiki Jayanti', '2026-10-26', '2026-10-26'],
  ['Kannada Rajyotsava', '2026-11-01', '2026-11-01'],
  ['Deepavali', '2026-11-08', '2026-11-10'],
  ['Kanakadasa Jayanti', '2026-11-27', '2026-11-27'],
  ['Christmas', '2026-12-25', '2026-12-25'],
];

export async function buildCore(kit: Kit, hash: string): Promise<Ctx> {
  const r = rng(2026);
  const today = iso(new Date());
  const semStart = '2026-08-03';
  const tenant = await kit.one<{ id: string }>(
    'tenants',
    {
      slug: SLUG,
      name: 'Soundarya Institute of Management and Science',
      kind: 'college',
      timezone: 'Asia/Kolkata',
      settings: {
        liveViewEnabled: true,
        liveViewIndicator: true,
        profile: {
          shortName: 'SIMS',
          address: 'Soundarya Nagar, Sidedahalli, Nagasandra Post, Bengaluru 560073',
          affiliation: 'Bengaluru City University',
          scheme: 'NEP semester scheme',
          phone: '+91 90000 10000',
          email: `office@${DOMAIN}`,
        },
      },
    },
    { noTenant: true },
  );
  const tenantId = tenant.id;
  const k = makeKit(kit.pool, tenantId);
  const campus = await k.one<{ id: string }>('campuses', { name: 'Soundarya Nagar Campus', city: 'Bengaluru' });
  const yrs = await k.ins<{ id: string; label: string }>('academic_years', [
    { label: '2025-26', startsOn: '2025-08-01', endsOn: '2026-05-31', isCurrent: false },
    { label: '2026-27', startsOn: '2026-08-01', endsOn: '2027-05-31', isCurrent: true },
    { label: '2027-28', startsOn: '2027-08-01', endsOn: '2028-05-31', isCurrent: false },
  ]);
  const yid = (l: string) => yrs.find((y) => y.label === l)!.id;
  const term = await k.one<{ id: string }>('academic_terms', { academicYearId: yid('2026-27'), name: 'Odd semester 2026', startsOn: '2026-08-01', endsOn: '2026-12-19' });

  // Programmes, classes, papers.
  const programs: Ctx['programs'] = {};
  for (const def of PROGRAMS) {
    const p = await k.one<{ id: string }>('programs', { campusId: campus.id, name: def.name, level: def.level, termCount: def.terms });
    programs[def.code] = { id: p.id, def };
  }
  const deptRows = await k.ins<{ id: string; name: string }>('departments', DEPARTMENTS.map((name) => ({ name })));
  const departments = Object.fromEntries(deptRows.map((d) => [d.name, d.id]));
  const desRows = await k.ins<{ id: string; name: string }>('designations', [...new Set(STAFF.map((s) => s.designation))].map((name, i) => ({ name, grade: `G${(i % 5) + 1}` })));
  const designations = Object.fromEntries(desRows.map((d) => [d.name, d.id]));

  // Staff.
  let phone = 10000;
  const nextPhone = () => `+9190000${String(phone++).padStart(5, '0')}`;
  const userRows = await k.ins<{ id: string; fullName: string; email: string }>(
    'users',
    STAFF.map((s) => ({ fullName: s.name, email: `${s.email}@${DOMAIN}`, phone: nextPhone(), passwordHash: hash, preferredLanguage: s.lang ?? 'en', status: 'active' })),
  );
  const staff: UserRef[] = userRows.map((u, i) => ({ id: u.id, name: u.fullName, email: STAFF[i].email, dept: STAFF[i].dept }));
  const byEmail = Object.fromEntries(staff.map((s) => [s.email, s]));
  await k.ins('user_roles', STAFF.flatMap((s, i) => s.roles.map((role) => ({ userId: staff[i].id, role, campusId: campus.id }))), { returning: false });
  const teachers = staff.filter((_, i) => STAFF[i].roles.includes('teacher'));
  const hods: Record<Dept, string> = {} as Record<Dept, string>;
  STAFF.forEach((s, i) => {
    if (s.roles.includes('hod') && s.dept) hods[s.dept] = staff[i].id;
  });
  for (const d of DEPARTMENTS) await k.q('update departments set head_user_id = $1 where id = $2', [hods[d], departments[d]]);
  await k.ins('department_staff', STAFF.flatMap((s, i) => (s.dept ? [{ departmentId: departments[s.dept], userId: staff[i].id }] : [])), { returning: false });
  await k.ins(
    'staff_profiles',
    STAFF.map((s, i) => ({
      userId: staff[i].id,
      employeeCode: `SIMS-${String(i + 1).padStart(3, '0')}`,
      departmentId: s.dept ? departments[s.dept] : null,
      designationId: designations[s.designation],
      employmentType: i % 11 === 10 ? 'contract' : 'permanent',
      dateOfJoining: `20${String(10 + (i % 15)).padStart(2, '0')}-0${(i % 9) + 1}-01`,
      status: 'active',
      gender: s.gender,
      dateOfBirth: `${1968 + (i % 25)}-0${(i % 9) + 1}-1${i % 9}`,
      taxRegime: i % 3 === 0 ? 'old' : 'new',
      bankAccountHolder: s.name.replace(/^(Dr\.|Prof\.|Capt\.)\s*/, ''),
      bankName: ['Canara Bank', 'State Bank of India', 'Karnataka Bank', 'HDFC Bank'][i % 4],
      bankIfsc: ['CNRB0000321', 'SBIN0004112', 'KARB0000150', 'HDFC0000412'][i % 4],
      bankAccountLast4: String(1000 + ((i * 37) % 9000)),
    })),
    { returning: false },
  );

  // Rooms.
  const roomNames = [...Array.from({ length: 16 }, (_, i) => `Room ${101 + i}`), 'Computer Lab 1', 'Computer Lab 2', 'Seminar Hall', 'Aviation Simulation Lab', 'Auditorium', 'Examination Hall'];
  const rooms = await k.ins<{ id: string; name: string }>(
    'rooms',
    roomNames.map((name) => ({ campusId: campus.id, name, capacity: /Hall|Auditorium/.test(name) ? 200 : /Lab/.test(name) ? 40 : 70, kind: /Lab/.test(name) ? 'lab' : /Hall|Auditorium/.test(name) ? 'hall' : 'classroom' })),
  );

  // Sections and subjects, with a teacher per paper (least loaded in the owning department).
  const load = new Map<string, number>();
  const teacherFor = (dept: Dept): string => {
    const pool = teachers.filter((t) => t.dept === dept);
    const best = [...pool].sort((a, b) => (load.get(a.id) ?? 0) - (load.get(b.id) ?? 0))[0] ?? teachers[0];
    load.set(best.id, (load.get(best.id) ?? 0) + 1);
    return best.id;
  };
  const sections: SectionRef[] = [];
  let roomIdx = 0;
  for (const def of PROGRAMS) {
    const pid = programs[def.code].id;
    for (const [t, size] of def.classes) {
      const label = `${def.name} Sem ${t} A`;
      const sec = await k.one<{ id: string }>('sections', { programId: pid, academicYearId: yid('2026-27'), term: t, name: 'A', displayName: label });
      const papers = def.papers[t];
      const subjRows = await k.ins<{ id: string; code: string; name: string }>(
        'subjects',
        papers.map(([name, credits, dept], i) => ({
          programId: pid,
          term: t,
          code: `${def.code}-${t}${String(i + 1).padStart(2, '0')}`,
          name,
          departmentId: departments[dept ?? def.dept],
        })),
      );
      const subjects: SubjectRef[] = subjRows.map((s, i) => ({
        id: s.id,
        programId: pid,
        prog: def.code,
        term: t,
        code: s.code,
        name: s.name,
        credits: papers[i][1],
        dept: papers[i][2] ?? def.dept,
        teacherId: teacherFor(papers[i][2] ?? def.dept),
      }));
      sections.push({ id: sec.id, programId: pid, prog: def.code, def, term: t, label, roomId: rooms[roomIdx++ % 16].id, subjects, students: [], slotIds: [] });
      void size;
    }
  }

  // Students: unique fictional names; two reserved for logins.
  const used = new Set<string>(['Sahana Gowda', 'Vignesh Naik', 'Chaitra Naik']);
  const students: StudentRef[] = [];
  const makeName = (female: boolean) => {
    for (;;) {
      const n = `${r.pick(female ? FEMALE : MALE)} ${r.pick(SURNAMES)}`;
      if (!used.has(n)) {
        used.add(n);
        return n;
      }
    }
  };
  for (const sec of sections) {
    const size = sec.def.classes.find(([t]) => t === sec.term)![1];
    const intake = 2026 - Math.floor((sec.term - 1) / 2);
    for (let i = 0; i < size; i++) {
      let name: string;
      let female: boolean;
      if (sec.prog === 'BCM' && sec.term === 3 && i === 0) [name, female] = ['Sahana Gowda', true];
      else if (sec.prog === 'BCA' && sec.term === 3 && i === 0) [name, female] = ['Vignesh Naik', false];
      else if (sec.prog === 'BBA' && sec.term === 1 && i === 0) [name, female] = ['Chaitra Naik', true];
      else {
        female = r.chance(sec.prog === 'BAV' ? 0.55 : 0.52);
        name = makeName(female);
      }
      // Most students attend about four days in five; one in eight is at risk.
      let presence = Math.min(0.97, Math.max(0.5, r.gauss(0.86, 0.06)));
      if (r.chance(0.12)) presence = 0.58 + r.next() * 0.14;
      if (name === 'Sahana Gowda') presence = 0.95;
      if (name === 'Vignesh Naik') presence = 0.66;
      const ability = Math.min(0.97, Math.max(0.2, r.gauss(0.62, 0.17) - (presence < 0.74 ? 0.1 : 0)));
      students.push({ id: '', name, rollNo: `${String(intake).slice(2)}${sec.prog}${String(i + 1).padStart(3, '0')}`, sectionId: sec.id, prog: sec.prog, term: sec.term, female, presence, ability });
    }
  }
  const stRows = await k.ins<{ id: string; rollNo: string }>(
    'students',
    students.map((s) => ({ sectionId: s.sectionId, rollNo: s.rollNo, fullName: s.name, status: 'active', enrolledOn: `20${s.rollNo.slice(0, 2)}-08-0${(s.rollNo.charCodeAt(5) % 5) + 1}` })),
  );
  stRows.forEach((row, i) => (students[i].id = row.id));
  for (const sec of sections) sec.students = students.filter((s) => s.sectionId === sec.id);

  // Timetable: weekly periods in proportion to credits, no teacher in two rooms at once.
  const busy = new Set<string>();
  for (const sec of sections) {
    const total = sec.subjects.reduce((n, s) => n + s.credits, 0);
    const left = new Map(sec.subjects.map((s) => [s.id, Math.max(2, Math.round((s.credits / total) * 30))]));
    const slots: Record<string, unknown>[] = [];
    for (let p = 0; p < PERIODS.length; p++) {
      for (let d = 1; d <= 6; d++) {
        const prev = slots.find((x) => x.dayOfWeek === d && x.startsAt === PERIODS[p - 1]?.[0])?.subjectId;
        const options = sec.subjects.filter((s) => (left.get(s.id) ?? 0) > 0 && !busy.has(`${s.teacherId}:${d}:${p}`));
        const choice = [...options].sort((a, b) => (left.get(b.id)! - left.get(a.id)!) - (a.id === prev ? 1 : 0) + (b.id === prev ? 1 : 0))[0];
        if (!choice) continue;
        left.set(choice.id, left.get(choice.id)! - 1);
        busy.add(`${choice.teacherId}:${d}:${p}`);
        slots.push({ academicYearId: yid('2026-27'), sectionId: sec.id, subjectId: choice.id, teacherId: choice.teacherId, roomId: sec.roomId, dayOfWeek: d, startsAt: PERIODS[p][0], endsAt: PERIODS[p][1] });
      }
    }
    const rows = await k.ins<{ id: string }>('timetable_slots', slots);
    sec.slotIds = rows.map((x) => x.id);
  }

  // Guardians for roughly a third of the students (two of them have logins).
  const guardianOf = new Map<string, string[]>();
  const withGuardian = students.filter((s, i) => i % 3 === 0 || ['Sahana Gowda', 'Vignesh Naik', 'Chaitra Naik'].includes(s.name));
  const relationOf = (s: StudentRef, i: number) => (s.name === 'Vignesh Naik' || s.name === 'Chaitra Naik' ? 'mother' : s.name === 'Sahana Gowda' ? 'father' : i % 2 ? 'mother' : 'father');
  const gUsers = await k.ins<{ id: string }>(
    'users',
    withGuardian.map((s, i) => {
      const special = s.name === 'Sahana Gowda' ? 'parent.bcom' : s.name === 'Vignesh Naik' ? 'parent.bca' : null;
      const rel = relationOf(s, i);
      const fullName = s.name === 'Sahana Gowda' ? 'Basavaraj Gowda' : s.name === 'Vignesh Naik' || s.name === 'Chaitra Naik' ? 'Revathi Naik' : `${r.pick(rel === 'father' ? MALE : FEMALE)} ${s.name.split(' ').slice(-1)[0]}`;
      return { fullName, email: special ? `${special}@${DOMAIN}` : s.name === 'Chaitra Naik' ? null : `guardian.${s.rollNo.toLowerCase()}@${DOMAIN}`, phone: nextPhone(), passwordHash: hash, preferredLanguage: i % 4 === 0 ? 'kn' : 'en', status: 'active' };
    }),
  );
  // Revathi Naik is one user for two children (Vignesh and Chaitra): Chaitra's own guardian row points at her.
  const vigneshIdx = withGuardian.findIndex((s) => s.name === 'Vignesh Naik');
  const chaitraIdx = withGuardian.findIndex((s) => s.name === 'Chaitra Naik');
  const guardians = withGuardian.map((s, i) => {
    const userId = i === chaitraIdx ? gUsers[vigneshIdx].id : gUsers[i].id;
    guardianOf.set(s.id, [userId]);
    return { userId, studentId: s.id, relation: relationOf(s, i), isPrimary: true, isEmergencyContact: true };
  });
  const uniqueGuardianUsers = [...new Set(guardians.map((g) => g.userId))];
  await k.ins('user_roles', uniqueGuardianUsers.map((userId) => ({ userId, role: 'guardian', campusId: campus.id })), { returning: false });
  await k.ins('guardians', guardians, { returning: false });
  await k.q('delete from users where id = $1', [gUsers[chaitraIdx].id]);

  // Student logins.
  const logins: [string, string][] = [['Sahana Gowda', 'student.bcom'], ['Vignesh Naik', 'student.bca']];
  for (const [name, mail] of logins) {
    const st = students.find((s) => s.name === name)!;
    const u = await k.one<{ id: string }>('users', { fullName: name, email: `${mail}@${DOMAIN}`, phone: nextPhone(), passwordHash: hash, status: 'active' });
    await k.ins('user_roles', { userId: u.id, role: 'student', campusId: campus.id }, { returning: false });
    await k.q('update students set user_id = $1 where id = $2', [u.id, st.id]);
    st.userId = u.id;
  }

  // Calendar and working days.
  const principal = byEmail.principal.id;
  await k.ins(
    'calendar_events',
    [
      ...HOLIDAYS.map(([title, startsOn, endsOn]) => ({ kind: 'holiday', title, startsOn, endsOn, createdBy: principal })),
      { kind: 'exam', title: 'Internal Assessment 1', startsOn: '2026-09-21', endsOn: '2026-09-26', createdBy: principal },
      { kind: 'exam', title: 'Internal Assessment 2', startsOn: '2026-11-16', endsOn: '2026-11-21', createdBy: principal },
      { kind: 'exam', title: 'Semester End Examinations (BCU)', startsOn: '2026-12-21', endsOn: '2027-01-09', createdBy: principal },
      { kind: 'event', title: 'Freshers Day: Aarambh 2026', startsOn: '2026-09-05', endsOn: '2026-09-05', createdBy: principal },
      { kind: 'event', title: 'Annual Day and Alumni Meet', startsOn: '2026-12-12', endsOn: '2026-12-12', createdBy: principal },
      { kind: 'event', title: 'Teachers Day Celebration', startsOn: '2026-09-05', endsOn: '2026-09-05', createdBy: principal },
    ],
    { returning: false },
  );
  const holidays = new Set<string>();
  for (const [, s, e] of HOLIDAYS) for (let d = s; d <= e; d = addDays(d, 1)) holidays.add(d);
  const workingDays: string[] = [];
  for (let d = semStart; d < today; d = addDays(d, 1)) if (weekday(d) !== 7 && !holidays.has(d)) workingDays.push(d);

  return { kit: k, r, tenantId, hash, today, semStart, campusId: campus.id, years: { prev: yid('2025-26'), cur: yid('2026-27'), next: yid('2027-28') }, termId: term.id, programs, departments, designations, staff, byEmail, teachers, sections, students, guardianOf, rooms, workingDays, holidays };
}
