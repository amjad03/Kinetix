/**
 * Zynetix board-edition demo: SDM College of Engineering and Technology, Dharwad (tenant `sdmcet`).
 * Usage: pnpm db:seed:sdmcet  (after the migrations; Docker: `kinetix-api seed-sdmcet`).
 *
 * Safe to run again: the institution is removed and rebuilt, and its syllabus in the global library
 * (curricula vtu-be-2022, vtu-mba-2022, vtu-mtech-2022) is updated in place, so topic ids stay the
 * same and videos imported onto them later (the owner's YouTube channel) are kept.
 *
 * Loads: BE (CSE, ECE, Mech, Civil, EEE; Sem 3 and 5), MBA (Sem 1 and 3) and MTech CSE (Sem 1) with
 * VTU-style subjects (five modules each), HoDs and teachers, students with a guardian each, a room
 * and a board per class, a weekly timetable, topic videos, animations and materials, and 14 days of
 * board telemetry and AI answers so the Zynetix dashboards are not empty. Password for every login:
 * `zynetix123` (docs/zynetix/DEMO.md).
 */
import argon2 from 'argon2';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { ANIMATIONS } from '../content/animations.js';
import { createInstitution } from './create-institution.js';
import * as s from './schema.js';
import { parseModules, SYLLABUS } from './sdmcet/syllabus.js';
import { addDays, at, iso, J, makeKit, rng, weekday, wipeTenant, type Rng } from './soundarya/kit.js';

export const SLUG = 'sdmcet';
export const DOMAIN = 'sdmcet.zynetix.in';
export const PASSWORD = 'zynetix123';
const NAME = 'SDM College of Engineering and Technology, Dharwad';

/**
 * Demo placeholders, not the owner's content: well-known public lectures (3Blue1Brown, MIT
 * OpenCourseWare, Veritasium, Crash Course, TED) linked to matching topics so the board has
 * something to play. They are institution videos with playlist id DEMO_VIDEO_PLAYLIST, so after the
 * owner's channel import they can be removed in one statement:
 *   delete from concept_videos where playlist_id = 'sdmcet-demo-placeholder';
 */
export const DEMO_VIDEO_PLAYLIST = 'sdmcet-demo-placeholder';
export const DEMO_PLACEHOLDER_VIDEOS: readonly { match: RegExp; id: string; title: string; channel: string; seconds: number }[] = [
  { match: /fourier/i, id: 'spUNpyF58BY', title: 'But what is the Fourier Transform? A visual introduction', channel: '3Blue1Brown', seconds: 1244 },
  { match: /neural network|backpropagation|perceptron/i, id: 'aircAruvnKk', title: 'But what is a neural network? | Deep learning chapter 1', channel: '3Blue1Brown', seconds: 1140 },
  { match: /gradient descent/i, id: 'IHZwWFHWa-w', title: 'Gradient descent, how neural networks learn | Deep learning chapter 2', channel: '3Blue1Brown', seconds: 1260 },
  { match: /transformers and attention/i, id: 'wjZofJX0v4M', title: 'Transformers, the tech behind LLMs | Deep learning chapter 5', channel: '3Blue1Brown', seconds: 1620 },
  { match: /linear algebra|vector spaces|linear transformations/i, id: 'fNk_zzaMoSs', title: 'Vectors | Chapter 1, Essence of linear algebra', channel: '3Blue1Brown', seconds: 600 },
  { match: /linear algebra|vector spaces|eigen/i, id: 'J7DzL2_Na80', title: 'Lec 1 | MIT 18.06 Linear Algebra: The geometry of linear equations', channel: 'MIT OpenCourseWare', seconds: 2391 },
  { match: /bayes/i, id: 'HZGCoVF3YvM', title: 'Bayes theorem, the geometry of changing beliefs', channel: '3Blue1Brown', seconds: 912 },
  { match: /central limit/i, id: 'zeJD6dqJ5lo', title: 'But what is the Central Limit Theorem?', channel: '3Blue1Brown', seconds: 1890 },
  { match: /binomial/i, id: '8idr1WZ1A7Q', title: 'Binomial distributions | Probabilities of probabilities, part 1', channel: '3Blue1Brown', seconds: 942 },
  { match: /hamming|error-correcting/i, id: 'X8jsijhllIA', title: 'But what are Hamming codes? The origin of error correction', channel: '3Blue1Brown', seconds: 1203 },
  { match: /divergence|curl|stokes/i, id: 'rB83DpBJQsE', title: 'Divergence and curl: The language of Maxwell\'s equations, fluid flow, and more', channel: '3Blue1Brown', seconds: 954 },
  { match: /differential equations|heat equation|difference equations/i, id: 'p_di4Zn4wz4', title: 'Differential equations, a tourist\'s guide | DE1', channel: '3Blue1Brown', seconds: 1636 },
  { match: /numerical integration/i, id: 'WUvTyaaNkzM', title: 'The essence of calculus', channel: '3Blue1Brown', seconds: 1020 },
  { match: /kirchhoff|ohm's law|electric circuit/i, id: 'bHIhgxav9LY', title: 'The Big Misconception About Electricity', channel: 'Veritasium', seconds: 852 },
  { match: /peak finding|asymptotic notation/i, id: 'HtSuA80QTyo', title: '1. Algorithmic Thinking, Peak Finding (MIT 6.006)', channel: 'MIT OpenCourseWare', seconds: 3180 },
  { match: /boolean|logic gates/i, id: 'gI-qXk7XojA', title: 'Boolean Logic & Logic Gates: Crash Course Computer Science #3', channel: 'CrashCourse', seconds: 618 },
  { match: /functional units/i, id: 'O5nskjZ_GoI', title: 'Early Computing: Crash Course Computer Science #1', channel: 'CrashCourse', seconds: 744 },
  { match: /circular flow|nature and scope/i, id: '3ez10ADR_gM', title: 'Intro to Economics: Crash Course Econ #1', channel: 'CrashCourse', seconds: 714 },
  { match: /start with why|vision and mission|leadership theories/i, id: 'u4ZoJKF_VuA', title: 'How great leaders inspire action | Simon Sinek | TED', channel: 'TED', seconds: 1084 },
];

/** Built-in board animations (content/animations.ts) for matching topics. */
export const TOPIC_ANIMATIONS: readonly [RegExp, string][] = [
  [/packet switching/i, 'packet-switching'],
  [/kirchhoff|ohm's law|electric circuit|mesh and nodal|mesh analysis/i, 'electric-circuit'],
  [/electromagnetic induction|faraday|wind generators/i, 'em-induction-generator'],
  [/wave propagation|plane waves|transmission line equations|tidal and wave/i, 'waves'],
  [/refraction/i, 'refraction'],
  [/states of matter|pure substances/i, 'states-of-matter'],
  [/atomic structure/i, 'atomic-structure'],
  [/electrolysis/i, 'electrolysis'],
  [/hydrological cycle|precipitation/i, 'water-cycle'],
  [/rock cycle|igneous rocks/i, 'rock-cycle'],
  [/plate tectonics|earthquakes/i, 'plate-tectonics-earthquake'],
  [/reverse osmosis|fick's law/i, 'osmosis-diffusion'],
  [/circular flow/i, 'circular-flow-of-income'],
  [/sun-earth/i, 'day-night-seasons'],
  [/environmental impact|biomass/i, 'carbon-cycle'],
  [/biological characteristics/i, 'nitrogen-cycle'],
];

/** VTU's site: the per-module syllabus entries point here until the department uploads its PDFs. */
const SYLLABUS_URL = 'https://vtu.ac.in/';
const STUDY_LINKS = [
  ['NPTEL courses', 'https://nptel.ac.in/courses'],
  ['SWAYAM courses', 'https://swayam.gov.in/'],
  ['MIT OpenCourseWare', 'https://ocw.mit.edu/'],
] as const;

type DeptCode = 'cse' | 'ece' | 'mech' | 'civil' | 'eee' | 'mba' | 'mtech';
interface ProgramDef {
  dept: DeptCode;
  name: string;
  level: 'ug' | 'pg';
  terms: number;
  curriculum: string;
  usn: string;
  classes: Record<number, string[]>;
  block: string;
}
const PROGRAMS: ProgramDef[] = [
  { dept: 'cse', name: 'B.E. Computer Science and Engineering', level: 'ug', terms: 8, curriculum: 'vtu-be-2022', usn: 'CS', classes: { 3: ['A', 'B'], 5: ['A', 'B'] }, block: 'CS' },
  { dept: 'ece', name: 'B.E. Electronics and Communication Engineering', level: 'ug', terms: 8, curriculum: 'vtu-be-2022', usn: 'EC', classes: { 3: ['A'], 5: ['A'] }, block: 'EC' },
  { dept: 'mech', name: 'B.E. Mechanical Engineering', level: 'ug', terms: 8, curriculum: 'vtu-be-2022', usn: 'ME', classes: { 3: ['A'], 5: ['A'] }, block: 'ME' },
  { dept: 'civil', name: 'B.E. Civil Engineering', level: 'ug', terms: 8, curriculum: 'vtu-be-2022', usn: 'CV', classes: { 3: ['A'], 5: ['A'] }, block: 'CV' },
  { dept: 'eee', name: 'B.E. Electrical and Electronics Engineering', level: 'ug', terms: 8, curriculum: 'vtu-be-2022', usn: 'EE', classes: { 3: ['A'], 5: ['A'] }, block: 'EE' },
  { dept: 'mba', name: 'Master of Business Administration (MBA)', level: 'pg', terms: 4, curriculum: 'vtu-mba-2022', usn: 'MBA', classes: { 1: ['A'], 3: ['A'] }, block: 'MBA' },
  { dept: 'mtech', name: 'M.Tech Computer Science and Engineering', level: 'pg', terms: 4, curriculum: 'vtu-mtech-2022', usn: 'SCS', classes: { 1: ['A'] }, block: 'PG' },
];
const CURRICULA = [
  { code: 'vtu-be-2022', name: 'VTU B.E. (2022 scheme)', level: 'ug' },
  { code: 'vtu-mba-2022', name: 'VTU MBA (2022 scheme)', level: 'pg' },
  { code: 'vtu-mtech-2022', name: 'VTU M.Tech (2022 scheme)', level: 'pg' },
] as const;

const DEPARTMENTS: Record<DeptCode, string> = {
  cse: 'Computer Science and Engineering',
  ece: 'Electronics and Communication Engineering',
  mech: 'Mechanical Engineering',
  civil: 'Civil Engineering',
  eee: 'Electrical and Electronics Engineering',
  mba: 'Management Studies (MBA)',
  mtech: 'PG Studies in Computer Science (M.Tech)',
};

/** [full name, login first name, female]; the first of each department is its HoD. */
const STAFF: Record<DeptCode, [string, string, boolean][]> = {
  cse: [['Dr. Prakash Hiremath', 'prakash', false], ['Prof. Sunita Kulkarni', 'sunita', true], ['Prof. Vinayak Joshi', 'vinayak', false], ['Prof. Deepa Patil', 'deepa', true]],
  ece: [['Dr. Mahesh Kadakol', 'mahesh', false], ['Prof. Shweta Desai', 'shweta', true], ['Prof. Raghavendra Bhat', 'raghavendra', false]],
  mech: [['Dr. Basavaraj Angadi', 'basavaraj', false], ['Prof. Santosh Hosamani', 'santosh', false], ['Prof. Kavya Naik', 'kavya', true]],
  civil: [['Dr. Shrinivas Pujar', 'shrinivas', false], ['Prof. Anand Kattimani', 'anand', false], ['Prof. Pooja Mudhol', 'pooja', true]],
  eee: [['Dr. Girish Huddar', 'girish', false], ['Prof. Rekha Shettar', 'rekha', true], ['Prof. Manjunath Yaligar', 'manjunath', false]],
  mba: [['Dr. Veena Hegde', 'veena', true], ['Prof. Arun Kamat', 'arun', false], ['Prof. Nandini Kulkarni', 'nandini', true]],
  mtech: [['Dr. Ramesh Gouda', 'ramesh', false], ['Prof. Lakshmi Bhat', 'lakshmi', true], ['Prof. Kiran Desai', 'kiran', false]],
};
const MALE = ['Aditya', 'Akash', 'Abhishek', 'Bharath', 'Chetan', 'Darshan', 'Ganesh', 'Harsha', 'Karthik', 'Manoj', 'Nikhil', 'Pavan', 'Pranav', 'Rahul', 'Rohit', 'Sachin', 'Shreyas', 'Sagar', 'Tejas', 'Varun', 'Vikas', 'Yash', 'Omkar', 'Sandeep'];
const FEMALE = ['Aishwarya', 'Ananya', 'Bhavana', 'Chaitra', 'Divya', 'Gayatri', 'Kavana', 'Meghana', 'Namratha', 'Pallavi', 'Prerana', 'Rashmi', 'Sahana', 'Sneha', 'Spoorthi', 'Shreya', 'Tanvi', 'Vaishnavi', 'Vidya', 'Akshata', 'Soumya', 'Keerthi'];
const SURNAMES = ['Kulkarni', 'Patil', 'Desai', 'Joshi', 'Hiremath', 'Kamble', 'Naik', 'Hegde', 'Bhat', 'Angadi', 'Pujar', 'Biradar', 'Huded', 'Malagi', 'Jadhav', 'Kadam', 'Shettar', 'Gouda', 'Badiger', 'Kammar'];
const FATHERS = ['Shankar', 'Mallikarjun', 'Suresh', 'Ravindra', 'Prabhakar', 'Vijay', 'Nagaraj', 'Ashok', 'Mohan', 'Sharanappa'];

/** College periods: Mon to Fri seven, Saturday the first four (tea break 11:00, lunch 13:15). */
const PERIODS = [['09:00', '10:00'], ['10:00', '11:00'], ['11:15', '12:15'], ['12:15', '13:15'], ['14:00', '15:00'], ['15:00', '16:00'], ['16:00', '17:00']] as const;
const PERIODS_PER_SUBJECT = 4;
const STUDENTS_PER_SECTION = 6;

export interface SeedSummary {
  tenantId: string;
  sections: number;
  subjects: number;
  topics: number;
  teachers: number;
  students: number;
  guardians: number;
  devices: number;
  slots: number;
  videos: number;
  materials: number;
  animations: number;
  telemetry: number;
  aiUsage: number;
  /** Who teaches what, for docs/zynetix/DEMO.md. */
  classes: { teacher: string; email: string; section: string; subject: string }[];
}

interface Section {
  id: string;
  dept: DeptCode;
  term: number;
  label: string;
  roomId: string;
  roomName: string;
  deviceId?: string;
  subjects: { id: string; code: string; name: string; teacherId: string; topicIds: string[][] }[];
}

/** IST calendar date and time helpers (the demo is in Dharwad). */
const istToday = () => iso(new Date(Date.now() + 330 * 60_000));

/** Upserts the VTU syllabus into the global library; ids stay stable across runs. Returns topic ids per course and module. */
async function upsertLibrary(pool: pg.Pool): Promise<Map<string, { courseId: string; topics: string[][]; titles: string[][] }>> {
  for (const c of CURRICULA) await pool.query('insert into curricula (code, name, level) values ($1, $2, $3) on conflict (code) do update set name = excluded.name, level = excluded.level', [c.code, c.name, c.level]);
  const out = new Map<string, { courseId: string; topics: string[][]; titles: string[][] }>();
  for (const prog of PROGRAMS) {
    for (const term of Object.keys(prog.classes).map(Number)) {
      for (const [code, name, , text] of SYLLABUS[`${prog.dept}-${term}`]) {
        const courseCode = code.toLowerCase();
        const { rows } = await pool.query(
          `insert into courses (curriculum_code, code, title, term, language, source, reviewed) values ($1, $2, $3, $4, 'en', 'SDMCET demo seed (VTU 2022 scheme)', false)
           on conflict (curriculum_code, code) do update set title = excluded.title, term = excluded.term, updated_at = now() returning id`,
          [prog.curriculum, courseCode, name, term],
        );
        const courseId = rows[0].id as string;
        const modules = parseModules(text);
        const chapters = (await pool.query('select id, position from chapters where course_id = $1 and tenant_id is null', [courseId])).rows as { id: string; position: number }[];
        const topicIds: string[][] = [];
        for (let m = 0; m < modules.length; m++) {
          const title = `Module ${m + 1}: ${modules[m].title}`;
          let ch = chapters.find((c) => c.position === m + 1)?.id;
          if (ch) await pool.query('update chapters set title = $1 where id = $2', [title, ch]);
          else ch = (await pool.query('insert into chapters (course_id, position, title) values ($1, $2, $3) returning id', [courseId, m + 1, title])).rows[0].id as string;
          const existing = (await pool.query('select id, position from topics where chapter_id = $1 and tenant_id is null', [ch])).rows as { id: string; position: number }[];
          const ids: string[] = [];
          for (let t = 0; t < modules[m].topics.length; t++) {
            const tt = modules[m].topics[t];
            const summary = `${code} ${name}, module ${m + 1} (${modules[m].title}).`;
            let id = existing.find((x) => x.position === t + 1)?.id;
            if (id) await pool.query('update topics set title = $1, summary = $2, updated_at = now() where id = $3', [tt, summary, id]);
            else id = (await pool.query('insert into topics (chapter_id, position, title, summary) values ($1, $2, $3, $4) returning id', [ch, t + 1, tt, summary])).rows[0].id as string;
            ids.push(id);
          }
          await pool.query('delete from topics where chapter_id = $1 and tenant_id is null and position > $2', [ch, modules[m].topics.length]);
          topicIds.push(ids);
        }
        await pool.query('delete from chapters where course_id = $1 and tenant_id is null and position > $2', [courseId, modules.length]);
        out.set(`${prog.curriculum}:${courseCode}`, { courseId, topics: topicIds, titles: modules.map((x) => x.topics) });
      }
    }
  }
  return out;
}

/** Loads the SDMCET demo (see the file comment). `now` fixes "today" for tests. */
export async function seedSdmcet(pool: pg.Pool, opts: { now?: Date } = {}): Promise<SeedSummary> {
  const now = opts.now ?? new Date();
  const r = rng(1946); // SDM's founding year: the same demo on every run
  const today = opts.now ? iso(new Date(now.getTime() + 330 * 60_000)) : istToday();
  await wipeTenant(pool, SLUG);
  const library = await upsertLibrary(pool);
  const hash = await argon2.hash(PASSWORD);

  // Institution, campus, academic year and administrator (the ERP's own create-institution path).
  const inst = await createInstitution(drizzle(pool, { schema: s }), {
    slug: SLUG,
    name: NAME,
    kind: 'college',
    timezone: 'Asia/Kolkata',
    campus: 'SDMCET Campus, Dhavalagiri',
    city: 'Dharwad',
    yearLabel: '2026-27',
    yearStart: '2026-08-01',
    yearEnd: '2027-07-31',
    adminName: 'Sudhir Pai (Zynetix administrator)',
    adminEmail: `admin@${DOMAIN}`,
    adminPhone: null,
    otpOnly: false,
    edition: 'board',
  });
  const tenantId = inst.tenant.id;
  const k = makeKit(pool, tenantId);
  await k.q('update users set password_hash = $1, password_must_change = false where id = $2', [hash, inst.admin.id]);
  await k.q('update tenants set settings = settings || $1::jsonb where id = $2', [
    JSON.stringify({
      liveViewEnabled: true,
      profile: { shortName: 'SDMCET', address: 'Dhavalagiri, Dharwad, Karnataka 580002', affiliation: 'Visvesvaraya Technological University (VTU), Belagavi', scheme: 'VTU 2022 scheme', email: `office@${DOMAIN}` },
      boardWhatsNew: [{ title: 'Welcome to Zynetix', body: 'Topic videos, animations and syllabus materials are on every classroom board.', at: `${today}T09:00:00+05:30` }],
    }),
    tenantId,
  ]);
  const campusId = inst.campus.id;
  const yearId = inst.year.id;
  await k.ins('academic_terms', { academicYearId: yearId, name: 'Odd semester 2026', startsOn: '2026-08-03', endsOn: '2026-12-19' }, { returning: false });

  // People: principal, HoDs and teachers.
  const principal = await k.one<{ id: string }>('users', { fullName: 'Dr. K. Gopinath', email: `principal@${DOMAIN}`, passwordHash: hash, status: 'active' });
  await k.ins('user_roles', { userId: principal.id, role: 'principal', campusId }, { returning: false });
  const deptIds: Record<string, string> = {};
  const staff: Record<DeptCode, { id: string; name: string; email: string; hod: boolean }[]> = {} as never;
  for (const [code, deptName] of Object.entries(DEPARTMENTS) as [DeptCode, string][]) {
    const people = await k.ins<{ id: string; fullName: string; email: string }>('users', STAFF[code].map(([fullName, first]) => ({ fullName, email: `${first}.${code}@${DOMAIN}`, passwordHash: hash, status: 'active' })));
    staff[code] = people.map((u, i) => ({ id: u.id, name: u.fullName, email: u.email, hod: i === 0 }));
    await k.ins('user_roles', people.flatMap((u, i) => [{ userId: u.id, role: 'teacher', campusId }, ...(i === 0 ? [{ userId: u.id, role: 'hod', campusId }] : [])]), { returning: false });
    const dept = await k.one<{ id: string }>('departments', { name: deptName, headUserId: people[0].id });
    deptIds[code] = dept.id;
    await k.ins('department_staff', people.map((u) => ({ departmentId: dept.id, userId: u.id })), { returning: false });
  }

  // Programmes, rooms with a board each, sections and subjects (linked to the library courses).
  const sections: Section[] = [];
  const load = new Map<string, number>();
  const teacherFor = (dept: DeptCode) => {
    const best = [...staff[dept]].sort((a, b) => (load.get(a.id) ?? 0) - (load.get(b.id) ?? 0) || (a.hod ? 1 : 0) - (b.hod ? 1 : 0))[0];
    load.set(best.id, (load.get(best.id) ?? 0) + 1);
    return best.id;
  };
  let nSubjects = 0;
  for (const prog of PROGRAMS) {
    const p = await k.one<{ id: string }>('programs', { campusId, name: prog.name, level: prog.level, termCount: prog.terms, curriculumCode: prog.curriculum });
    for (const [termText, names] of Object.entries(prog.classes)) {
      const term = Number(termText);
      const defs = SYLLABUS[`${prog.dept}-${term}`];
      const subj = await k.ins<{ id: string; code: string; name: string }>(
        'subjects',
        defs.map(([code, name]) => ({ programId: p.id, term, code, name, departmentId: deptIds[prog.dept], courseId: library.get(`${prog.curriculum}:${code.toLowerCase()}`)!.courseId })),
      );
      nSubjects += subj.length;
      for (const name of names) {
        const label = `${prog.dept === 'mba' ? 'MBA' : prog.dept === 'mtech' ? 'M.Tech CSE' : `BE ${prog.dept === 'civil' ? 'Civil' : prog.dept === 'mech' ? 'Mech' : prog.dept.toUpperCase()}`} Sem ${term} ${name}`;
        // Second-years on the second floor, third-years on the third, PG on the first: CS-201, CS-202, CS-301…
        const roomName = `${prog.block}-${prog.level === 'pg' ? 1 : term === 3 ? 2 : 3}0${sections.filter((x) => x.dept === prog.dept && (prog.level === 'pg' || x.term === term)).length + 1}`;
        const room = await k.one<{ id: string }>('rooms', { campusId, name: roomName, capacity: prog.dept === 'mtech' ? 30 : 66, kind: 'classroom' });
        const sec = await k.one<{ id: string }>('sections', { programId: p.id, academicYearId: yearId, term, name, displayName: label });
        sections.push({
          id: sec.id,
          dept: prog.dept,
          term,
          label,
          roomId: room.id,
          roomName,
          subjects: subj.map((x) => ({ id: x.id, code: x.code, name: x.name, teacherId: teacherFor(prog.dept), topicIds: library.get(`${prog.curriculum}:${x.code.toLowerCase()}`)!.topics })),
        });
      }
    }
  }
  const allStaff = Object.values(staff).flat();
  for (const t of allStaff) {
    const names = [...new Set(sections.flatMap((x) => x.subjects.filter((y) => y.teacherId === t.id).map((y) => y.name)))];
    await k.q('update users set teaching_subjects = $1::jsonb where id = $2', [JSON.stringify(names), t.id]);
  }

  // Boards: one Android IFP per classroom, enrolled and paired, plus an edge AI box in the server room.
  const serverRoom = await k.one<{ id: string }>('rooms', { campusId, name: 'Server Room (Admin Block)', capacity: null, kind: 'lab' });
  const seminar = await k.one<{ id: string }>('rooms', { campusId, name: 'Seminar Hall', capacity: 180, kind: 'hall' });
  void seminar;
  const enrolledAt = new Date(`2026-07-2${(r.int(0, 8))}T11:00:00+05:30`);
  const devices: { id: string; name: string; edge: boolean; roomId: string }[] = [];
  for (const sec of sections) {
    const d = await k.one<{ id: string; name: string }>('devices', { campusId, roomId: sec.roomId, name: `Board ${sec.roomName}`, platform: 'android', appVersion: '2.6.1', enrolledAt });
    sec.deviceId = d.id;
    devices.push({ id: d.id, name: d.name, edge: false, roomId: sec.roomId });
  }
  const edge = await k.one<{ id: string; name: string }>('devices', { campusId, roomId: serverRoom.id, name: 'Zynetix Edge AI box', platform: 'linux', appVersion: '1.3.0', enrolledAt });
  devices.push({ id: edge.id, name: edge.name, edge: true, roomId: serverRoom.id });

  // Students (six per class) with logins, and a guardian with a login for each.
  const usedFirst = new Map<DeptCode, Set<string>>();
  const students: { id: string; userId: string; name: string; sectionId: string; dept: DeptCode }[] = [];
  let guardianCount = 0;
  for (const sec of sections) {
    const used = usedFirst.get(sec.dept) ?? new Set(STAFF[sec.dept].map(([, f]) => f));
    usedFirst.set(sec.dept, used);
    const prog = PROGRAMS.find((p) => p.dept === sec.dept)!;
    const intake = prog.level === 'pg' ? (sec.term === 1 ? 26 : 25) : sec.term === 3 ? 24 : 23;
    for (let i = 0; i < STUDENTS_PER_SECTION; i++) {
      const female = i % 2 === 0;
      let first: string;
      do first = r.pick(female ? FEMALE : MALE);
      while (used.has(first.toLowerCase()));
      used.add(first.toLowerCase());
      const surname = r.pick(SURNAMES);
      const fullName = `${first} ${surname}`;
      const usn = `2SD${intake}${prog.usn}${String((sec.label.endsWith('B') ? 60 : 0) + i + 1).padStart(3, '0')}`;
      const u = await k.one<{ id: string }>('users', { fullName, email: `${first.toLowerCase()}.${sec.dept}@${DOMAIN}`, passwordHash: hash, status: 'active' });
      await k.ins('user_roles', { userId: u.id, role: 'student', campusId }, { returning: false });
      const st = await k.one<{ id: string }>('students', { userId: u.id, sectionId: sec.id, rollNo: usn, fullName, status: 'active', enrolledOn: `20${intake}-08-0${1 + (i % 5)}` });
      students.push({ id: st.id, userId: u.id, name: fullName, sectionId: sec.id, dept: sec.dept });
      const g = await k.one<{ id: string }>('users', { fullName: `${FATHERS[(i + sections.indexOf(sec)) % FATHERS.length]} ${surname}`, email: `parent.${first.toLowerCase()}.${sec.dept}@${DOMAIN}`, passwordHash: hash, status: 'active', preferredLanguage: i % 3 === 0 ? 'kn' : 'en' });
      await k.ins('user_roles', { userId: g.id, role: 'guardian', campusId }, { returning: false });
      await k.ins('guardians', { userId: g.id, studentId: st.id, relation: 'father', isPrimary: true, isEmergencyContact: true }, { returning: false });
      guardianCount++;
    }
  }

  // Weekly timetable: four periods per subject, at most one a day, no teacher in two rooms at once.
  const busy = new Set<string>();
  const slots: { sectionId: string; subjectIdx: number; teacherId: string; day: number; p: number; id?: string }[] = [];
  for (const sec of sections) {
    const left = sec.subjects.map(() => PERIODS_PER_SUBJECT);
    for (let day = 1; day <= 6; day++) {
      const usedToday = new Set<number>();
      const periods = day === 6 ? 4 : PERIODS.length;
      // Rotate the starting subject by day so each paper moves around the week.
      for (let p = 0; p < periods; p++) {
        const order = sec.subjects.map((_, i) => (i + day + p) % sec.subjects.length).sort((a, b) => left[b] - left[a]);
        const pick = order.find((i) => left[i] > 0 && !usedToday.has(i) && !busy.has(`${sec.subjects[i].teacherId}:${day}:${p}`));
        if (pick === undefined) continue;
        // Leave the last afternoon period free for labs most days.
        if (p === 6 && day % 2 === 1) continue;
        left[pick]--;
        usedToday.add(pick);
        busy.add(`${sec.subjects[pick].teacherId}:${day}:${p}`);
        slots.push({ sectionId: sec.id, subjectIdx: pick, teacherId: sec.subjects[pick].teacherId, day, p });
      }
    }
  }
  const slotRows = await k.ins<{ id: string }>(
    'timetable_slots',
    slots.map((x) => {
      const sec = sections.find((y) => y.id === x.sectionId)!;
      return { academicYearId: yearId, sectionId: sec.id, subjectId: sec.subjects[x.subjectIdx].id, teacherId: x.teacherId, roomId: sec.roomId, dayOfWeek: x.day, startsAt: PERIODS[x.p][0], endsAt: PERIODS[x.p][1] };
    }),
  );
  slotRows.forEach((row, i) => (slots[i].id = row.id));

  // Topic resources: demo videos, built-in animations and materials (syllabus, textbook pages, links).
  const admin = inst.admin.id;
  const videoRows: Record<string, unknown>[] = [];
  const materialRows: Record<string, unknown>[] = [];
  const seenCourse = new Set<string>();
  for (const sec of sections) {
    const prog = PROGRAMS.find((p) => p.dept === sec.dept)!;
    for (const def of SYLLABUS[`${sec.dept}-${sec.term}`]) {
      const key = `${prog.curriculum}:${def[0].toLowerCase()}`;
      if (seenCourse.has(key)) continue;
      seenCourse.add(key);
      const [code, , bookText] = def;
      const [bookTitle, bookAuthor] = bookText.split(' | ');
      const lib = library.get(key)!;
      lib.topics.forEach((ids, m) =>
        ids.forEach((topicId, t) => {
          const title = lib.titles[m][t];
          let pos = 0;
          let vpos = 0;
          for (const v of DEMO_PLACEHOLDER_VIDEOS)
            if (v.match.test(title)) videoRows.push({ topicId, youtubeVideoId: v.id, title: v.title, language: 'en', durationSeconds: v.seconds, channelTitle: v.channel, playlistId: DEMO_VIDEO_PLAYLIST, position: vpos++, createdBy: admin, scope: 'institution' });
          for (const [match, ref] of TOPIC_ANIMATIONS)
            if (match.test(title)) materialRows.push({ scope: 'institution', topicId, kind: 'animation', title: ANIMATIONS[ref], ref, position: pos++, createdBy: admin, status: 'approved' });
          if (t === 0) materialRows.push({ scope: 'institution', topicId, kind: 'syllabus', title: `${code} syllabus, module ${m + 1} (VTU 2022 scheme)`, url: SYLLABUS_URL, position: pos++, createdBy: admin, status: 'approved' });
          const start = 1 + m * 64 + t * 14 + (code.length % 7);
          materialRows.push({ scope: 'institution', topicId, kind: 'book', title: bookTitle, author: bookAuthor, bookChapter: `Chapter ${m + 1}`, pageFrom: start, pageTo: start + 9 + (t % 4), position: pos++, createdBy: admin, status: 'approved' });
          if (t === 1) {
            const [label, url] = STUDY_LINKS[m % STUDY_LINKS.length];
            materialRows.push({ scope: 'institution', topicId, kind: 'link', title: `${label}: ${title}`, url, audience: ['board', 'teacher', 'student'], position: pos++, createdBy: admin, status: 'approved' });
          }
        }),
      );
    }
  }
  await k.ins('concept_videos', videoRows, { returning: false });
  await k.ins('topic_materials', materialRows, { returning: false });

  // Telemetry: a sample every 15 minutes in college hours for the last 14 days, with some boards offline.
  const days = Array.from({ length: 14 }, (_, i) => addDays(today, i - 13)).filter((d) => weekday(d) !== 7);
  const slotAt = new Map<string, number>(); // roomId:day:period -> subject load
  for (const x of slots) slotAt.set(`${sections.find((y) => y.id === x.sectionId)!.roomId}:${x.day}:${x.p}`, 1);
  const periodOf = (hhmm: string) => PERIODS.findIndex(([a, b]) => hhmm >= a && hhmm < b);
  const offline = (dev: number, date: string, hhmm: string) => {
    const back = (new Date(`${today}T00:00:00Z`).getTime() - new Date(`${date}T00:00:00Z`).getTime()) / 86400_000;
    if (dev === 3 && (back === 9 || back === 8)) return true; // a board unplugged for two days
    if (dev === 8 && back <= 3 && hhmm >= '13:30') return true; // power cuts in the afternoons
    if (dev === 11 && (back < 1 || (back === 1 && hhmm >= '14:00'))) return true; // offline since yesterday afternoon
    return false;
  };
  const telemetry: Record<string, unknown>[] = [];
  const last = new Map<string, { at: Date; h: Record<string, number> }>();
  for (const date of days) {
    const wd = weekday(date);
    const end = wd === 6 ? '13:30' : '17:15';
    for (let mins = 8 * 60 + 45; ; mins += 15) {
      const hhmm = `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
      if (hhmm > end) break;
      const when = at(date, hhmm);
      if (when > now) break;
      const p = periodOf(hhmm);
      devices.forEach((dev, di) => {
        if (offline(di, date, hhmm)) return;
        const inClass = !dev.edge && p >= 0 && slotAt.has(`${dev.roomId}:${wd}:${p}`);
        const peak = hhmm >= '10:00' && hhmm < '11:00';
        let cpu: number, gpu: number, npu: number, inf: number, ms: number;
        if (dev.edge) {
          const busyness = p >= 0 ? (peak ? 0.85 : 0.55) : 0.15;
          cpu = r.gauss(20 + 50 * busyness, 6);
          gpu = r.gauss(15 + 70 * busyness, 8);
          npu = r.gauss(10 + 75 * busyness, 8);
          inf = Math.round(Math.max(0, r.gauss(60 * busyness, 8)));
          ms = Math.round(inf * r.gauss(95, 15));
        } else if (inClass) {
          cpu = r.gauss(46, 10);
          gpu = r.gauss(38, 14);
          inf = r.int(0, peak ? 14 : 8);
          npu = Math.min(95, inf * r.gauss(6, 1.5));
          ms = Math.round(inf * r.gauss(320, 60));
        } else {
          cpu = r.gauss(14, 4);
          gpu = r.gauss(6, 3);
          inf = 0;
          npu = r.gauss(1, 1);
          ms = 0;
        }
        const clamp = (v: number) => Math.round(Math.min(99, Math.max(0, v)) * 10) / 10;
        const h = {
          cpuPct: clamp(cpu),
          gpuPct: clamp(gpu),
          npuPct: clamp(npu),
          ramPct: clamp(dev.edge ? r.gauss(68, 6) : r.gauss(inClass ? 62 : 44, 6)),
          diskPct: clamp((dev.edge ? 52 : 37) + days.indexOf(date) * 0.2 + (di % 5)),
          cpuTempC: Math.round((38 + cpu * 0.38 + r.gauss(0, 1.5)) * 10) / 10,
          gpuTempC: Math.round((36 + gpu * 0.42 + r.gauss(0, 1.5)) * 10) / 10,
          aiInferences: inf,
          aiInferenceMs: ms,
        };
        telemetry.push({ deviceId: dev.id, at: when, ...h, appVersion: dev.edge ? '1.3.0' : '2.6.1' });
        last.set(dev.id, { at: when, h });
      });
    }
  }
  await k.ins('device_telemetry', telemetry, { returning: false });
  for (const [di, dev] of devices.entries()) {
    const l = last.get(dev.id);
    if (!l) continue;
    const online = di !== 11;
    const sec = sections.find((x) => x.deviceId === dev.id);
    const health = {
      os: dev.edge ? 'Ubuntu' : 'Android',
      osVersion: dev.edge ? '24.04' : '13',
      appVersion: dev.edge ? '1.3.0' : '2.6.1',
      kiosk: dev.edge ? 'off' : 'on',
      deviceKind: dev.edge ? 'edge' : 'ifp',
      storageTotalMb: dev.edge ? 1_024_000 : 128_000,
      storageFreeMb: dev.edge ? 480_000 : 78_000 - di * 900,
      ramTotalMb: dev.edge ? 65_536 : 8_192,
      uptimeS: online ? r.int(3_000, 30_000) : 0,
      currentClass: sec?.label,
      ...l.h,
    };
    const seen = online ? now : l.at;
    await k.q('update devices set health = $1::jsonb, health_at = $2, last_seen_at = $2 where id = $3', [JSON.stringify(health), seen, dev.id]);
  }

  // AI answers: requests from boards during classes (more at 10-11, when some are throttled), teachers' prep and students' tutor.
  const ai: Record<string, unknown>[] = [];
  const semStart = '2026-08-03';
  const moduleFor = (date: string) => {
    const weeks = (new Date(`${date}T00:00:00Z`).getTime() - new Date(`${semStart}T00:00:00Z`).getTime()) / (7 * 86400_000);
    return Math.max(0, Math.min(4, Math.floor(weeks / 3.2)));
  };
  const pushAi = (rr: Rng, row: { userId: string | null; deviceId: string | null; task: string; topicId: string | null; when: Date; peak: boolean }) => {
    const x = rr.next();
    let outcome: string;
    let detail: string | null = null;
    if (row.peak && x < 0.16) {
      outcome = 'throttled';
      detail = 'Busy: 16 AI requests already running; waited 10 s';
    } else if (x < 0.82) outcome = 'ok';
    else if (x < 0.93) outcome = 'cached';
    else if (x < 0.95) {
      outcome = 'blocked';
      detail = rr.pick(['input: personal data (phone number)', 'input: off-topic request outside the syllabus', 'output: unsafe content filtered']);
    } else if (x < 0.96) {
      outcome = 'quota';
      detail = 'Daily AI limit reached (2000 requests)';
    } else if (x < 0.98) {
      outcome = 'invalid';
      detail = 'Model reply was not valid JSON';
    } else {
      outcome = 'unavailable';
      detail = rr.pick(['Model server timed out after 60 s', 'Model server returned 503']);
    }
    const sizes: Record<string, [number, number]> = { explain: [900, 450], selectAsk: [700, 300], readBoard: [1600, 320], quiz: [1100, 850], boardSummary: [1400, 500], lessonPlan: [1300, 1500], homework: [900, 700], tutor: [800, 380], summarize: [1500, 420] };
    const [tin, tout] = sizes[row.task] ?? [800, 400];
    const served = outcome === 'ok';
    const promptTokens = served || outcome === 'invalid' ? Math.round(Math.max(120, rr.gauss(tin, tin * 0.25))) : 0;
    const completionTokens = served || outcome === 'invalid' ? Math.round(Math.max(40, rr.gauss(tout, tout * 0.3))) : 0;
    const latencyMs =
      outcome === 'ok' ? Math.round(Math.max(350, rr.gauss(600 + completionTokens * 3.2 + (row.peak ? 900 : 0), 400)))
      : outcome === 'cached' ? rr.int(15, 70)
      : outcome === 'throttled' ? 10_000 + rr.int(0, 40)
      : outcome === 'unavailable' ? (detail!.includes('60 s') ? 60_000 : rr.int(200, 900))
      : outcome === 'invalid' ? rr.int(2500, 6500)
      : rr.int(3, 25);
    ai.push({ userId: row.userId, deviceId: row.deviceId, task: row.task, outcome, provider: 'openai-compatible', model: 'kinetix-llm', promptVersion: 'v4', promptTokens, completionTokens, latencyMs, detail, topicId: row.topicId, createdAt: row.when });
  };
  for (const date of days) {
    const wd = weekday(date);
    for (const x of slots.filter((y) => y.day === wd)) {
      const sec = sections.find((y) => y.id === x.sectionId)!;
      const subject = sec.subjects[x.subjectIdx];
      const start = PERIODS[x.p][0];
      const peak = start === '10:00';
      const n = peak ? r.int(2, 7) : r.int(0, 4);
      const mod = Math.min(4, moduleFor(date) + (r.chance(0.2) ? 1 : 0));
      const moduleTopics = subject.topicIds[mod];
      for (let i = 0; i < n; i++) {
        const when = new Date(at(date, start).getTime() + r.int(3, 55) * 60_000 + r.int(0, 59) * 1000);
        if (when > now) continue;
        pushAi(r, { userId: subject.teacherId, deviceId: sec.deviceId ?? null, task: r.pick(['explain', 'explain', 'selectAsk', 'readBoard', 'quiz', 'boardSummary', 'summarize']), topicId: r.pick(moduleTopics), when, peak });
      }
    }
    // Teachers prepare in the evening; students ask the tutor after college.
    for (const t of allStaff) {
      if (!r.chance(0.45)) continue;
      const mine = sections.flatMap((sec) => sec.subjects.filter((y) => y.teacherId === t.id));
      if (!mine.length) continue;
      const subject = r.pick(mine);
      const when = at(date, `${String(r.int(17, 21)).padStart(2, '0')}:${String(r.int(0, 59)).padStart(2, '0')}`);
      if (when <= now) pushAi(r, { userId: t.id, deviceId: null, task: r.pick(['lessonPlan', 'quiz', 'homework']), topicId: r.pick(subject.topicIds[Math.min(4, moduleFor(date) + 1)]), when, peak: false });
    }
    for (const st of students) {
      if (!r.chance(0.25)) continue;
      const sec = sections.find((y) => y.id === st.sectionId)!;
      const subject = r.pick(sec.subjects);
      const when = at(date, `${String(r.int(18, 22)).padStart(2, '0')}:${String(r.int(0, 59)).padStart(2, '0')}`);
      if (when <= now) pushAi(r, { userId: st.userId, deviceId: null, task: r.pick(['tutor', 'tutor', 'explain']), topicId: r.pick(subject.topicIds[moduleFor(date)]), when, peak: false });
    }
  }
  await k.ins('ai_usage', ai, { returning: false });

  const classes = sections.flatMap((sec) => sec.subjects.map((x) => ({ teacher: allStaff.find((t) => t.id === x.teacherId)!.name, email: allStaff.find((t) => t.id === x.teacherId)!.email, section: sec.label, subject: `${x.code} ${x.name}` })));
  return {
    tenantId,
    sections: sections.length,
    subjects: nSubjects,
    topics: [...library.values()].reduce((n, c) => n + c.topics.flat().length, 0),
    teachers: allStaff.length,
    students: students.length,
    guardians: guardianCount,
    devices: devices.length,
    slots: slots.length,
    videos: videoRows.length,
    materials: materialRows.filter((m) => m.kind !== 'animation').length,
    animations: materialRows.filter((m) => m.kind === 'animation').length,
    telemetry: telemetry.length,
    aiUsage: ai.length,
    classes,
  };
}

async function main() {
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_DEMO_SEED !== 'yes') {
    console.error('Refusing to load demo data with NODE_ENV=production. Set ALLOW_DEMO_SEED=yes for a staging demo.');
    process.exitCode = 1;
    return;
  }
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL (the owner role) is not set');
  pg.types.setTypeParser(1082, (v: string) => v);
  const pool = new pg.Pool({ connectionString: url, max: 2 });
  const t0 = Date.now();
  try {
    const { classes, ...sum } = await seedSdmcet(pool);
    console.log(`Loaded "${NAME}" (slug ${SLUG}, board edition) in ${Math.round((Date.now() - t0) / 1000)}s:`);
    console.log(Object.entries(sum).filter(([key]) => key !== 'tenantId').map(([key, v]) => `  ${key}: ${v}`).join('\n'));
    console.log(`\nLogins (password ${PASSWORD}): admin@${DOMAIN}, principal@${DOMAIN}, teachers <first>.<dept>@${DOMAIN}, students <first>.<dept>@${DOMAIN}, parents parent.<first>.<dept>@${DOMAIN}.`);
    const byTeacher = new Map<string, string[]>();
    for (const c of classes) byTeacher.set(`${c.teacher} <${c.email}>`, [...(byTeacher.get(`${c.teacher} <${c.email}>`) ?? []), `${c.section}: ${c.subject}`]);
    for (const [t, list] of byTeacher) console.log(`  ${t}\n    ${list.join('\n    ')}`);
  } finally {
    await pool.end();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });
}
