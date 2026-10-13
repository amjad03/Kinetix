#!/usr/bin/env node
// Exercises the API the way the apps do: board enrolment, teacher pairing (with the /v1/pairing/pending poll),
// board profile PIN, attendance from the teacher, and the parent, student and teacher sign-ins.
// Usage: node scripts/demo-api-check.mjs [apiUrl] [tenant]   (defaults: http://localhost:4000 vidyaniketan)
const API = process.argv[2] ?? 'http://localhost:4000';
const T = process.argv[3] ?? 'vidyaniketan';
const D = `${T}.demo.kinetix.in`;
const people = T === 'soundarya'
  ? { teacher: 'sowmya.reddy', student: 'student.bca', parent: 'parent.bca' }
  : { teacher: 'sowmya.reddy', student: 'student.class7', parent: 'parent.class7' };
let fails = 0;
const ok = (label, cond, extra = '') => { console.log(`${cond ? 'ok  ' : 'FAIL'} ${label}${extra ? ': ' + extra : ''}`); if (!cond) fails++; return cond; };
async function call(method, path, token, body) {
  const r = await fetch(API + path, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  let json; try { json = JSON.parse(text); } catch { json = text; }
  return { status: r.status, json };
}
const login = async (who) => (await call('POST', '/v1/auth/login', null, { tenant: T, login: `${who}@${D}`, password: 'kinetix123' })).json.accessToken;

const principal = await login('principal');
ok('principal sign-in', !!principal);
const devs = await call('GET', '/v1/devices/fleet?hours=24', principal);
const list = devs.json.boards ?? [];
ok('boards listed', list.length > 0, `${list.length} boards`);
const board = list.find((b) => /^Room/.test(b.room ?? '')) ?? list[0];
const code = await call('POST', `/v1/devices/${board.id}/enrollment-code`, principal);
ok('enrolment code issued', !!code.json.enrollmentCode, code.json.enrollmentCode);
const enr = await call('POST', '/v1/devices/enroll', null, { code: code.json.enrollmentCode, platform: 'android', appVersion: 'demo-check' });
const dev = enr.json.deviceToken;
ok('board enrolled with the code', !!dev, enr.status === 200 || enr.status === 201 ? board.name : JSON.stringify(enr.json));
ok('board config', (await call('GET', '/v1/devices/me/config', dev)).status === 200);
const pc = await call('POST', '/v1/devices/me/pairing-codes', dev);
ok('board pairing code', !!pc.json.code, pc.json.code);
const teacher = await login(people.teacher);
ok('teacher app sign-in', !!teacher);
const claim = await call('POST', '/v1/pairing/claim', teacher, { code: pc.json.code });
ok('teacher claims the board', claim.status === 200, claim.status === 200 ? claim.json.board?.name : JSON.stringify(claim.json).slice(0, 200));
const pend = await call('GET', '/v1/pairing/pending', dev);
const boardSession = pend.json.pending?.sessionToken;
ok('board polls /v1/pairing/pending', !!boardSession);
const profiles = await call('GET', '/v1/devices/me/profiles', dev);
ok('board profiles', profiles.status === 200);
const pin = await call('PUT', '/v1/devices/me/profiles/me/pin', boardSession, { pin: '2468' });
ok('teacher sets a board PIN', pin.status === 200, pin.status === 200 ? '' : JSON.stringify(pin.json).slice(0, 200));
const me = JSON.parse(Buffer.from(teacher.split('.')[1], 'base64url').toString()).sub;
const unlock = await call('POST', `/v1/devices/me/profiles/${me}/unlock`, dev, { pin: '2468' });
ok('PIN unlock on the board', unlock.status === 200 || unlock.status === 201, unlock.status >= 300 ? JSON.stringify(unlock.json).slice(0, 200) : '');
const now = await call('GET', '/v1/classroom/now', boardSession);
ok('board: class now', now.status < 500, now.json.slot ? 'in a period' : 'between periods (fine outside school hours)');

// Attendance from the teacher for today's first period.
const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
const tt = await call('GET', `/v1/teacher/timetable?date=${today}`, teacher);
const slots = tt.json.slots ?? tt.json.periods ?? tt.json.classes ?? (Array.isArray(tt.json) ? tt.json : []);
if (ok('teacher timetable today', tt.status === 200 && slots.length > 0, `${slots.length} periods`)) {
  const slot = slots[0];
  const slotId = slot.slotId ?? slot.id;
  const roster = await call('GET', `/v1/sections/${slot.section.id}/roster`, teacher);
  const students = Array.isArray(roster.json) ? roster.json : [];
  const records = students.map((s, i) => ({ studentId: s.studentId ?? s.id, status: i % 9 === 4 ? 'absent' : 'present' }));
  const saved = await call('POST', '/v1/attendance', teacher, { slotId, date: today, records });
  ok('attendance submitted', saved.status === 200 || saved.status === 201, saved.status >= 300 ? JSON.stringify(saved.json).slice(0, 200) : `${records.length} students, ${slot.section.displayName}`);
  const kid = students.find((s) => (s.studentId ?? s.id) === records[4]?.studentId);
  const back = await call('GET', `/v1/attendance?slotId=${slotId}&date=${today}`, principal);
  ok('attendance visible to the school office', back.status === 200 && back.json.taken === true, kid ? `absent: ${kid.fullName ?? kid.name}` : '');
}

const parent = await login(people.parent);
ok('parent app sign-in', !!parent);
const kids = await call('GET', '/v1/parent/children', parent);
const kidList = Array.isArray(kids.json) ? kids.json : kids.json.children ?? [];
ok('parent children', kidList.length > 0, kidList.map((k) => k.fullName ?? k.name).join(', '));
if (kidList[0]) {
  const id = kidList[0].id ?? kidList[0].studentId;
  for (const p of ['attendance?days=30', 'summary?days=30', 'diary', 'subjects']) {
    const r = await call('GET', `/v1/parent/children/${id}/${p}`, parent);
    ok(`parent ${p.split('?')[0]}`, r.status === 200);
  }
}
const student = await login(people.student);
ok('student app sign-in', !!student);
console.log(fails ? `\n${fails} checks failed` : '\nAll API checks passed');
process.exitCode = fails ? 1 : 0;
