import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { gradeAptitude, interviewQuestions, offlineCoachReply, recommendPaths, scoreAnswer, scoreInterview } from '../src/careers/careers.logic.js';
import { summariseAttendance, workingDays } from '../src/placements/internship-rules.js';
import { createApp, createTenant, FixedClock, ownerPool } from './helpers.js';

describe('career rules', () => {
  it('grades an aptitude test with a score per topic', () => {
    const qs = [
      { prompt: 'a', options: ['1', '2'], answerIndex: 0, topic: 'Quant' },
      { prompt: 'b', options: ['1', '2'], answerIndex: 1, topic: 'Quant' },
      { prompt: 'c', options: ['1', '2'], answerIndex: 1, topic: 'Verbal' },
    ];
    expect(gradeAptitude(qs, [0, 0, 1])).toEqual({ score: 2, total: 3, percent: 66.67, topicScores: { Quant: { right: 1, total: 2 }, Verbal: { right: 1, total: 1 } } });
    expect(gradeAptitude(qs, [])).toMatchObject({ score: 0, percent: 0 });
  });

  it('ranks career paths by skills covered and interests', () => {
    const paths = [
      { id: 'a', title: 'Accountant', family: 'Finance', description: '', requiredSkills: ['Excel', 'Tally', 'GST'], roles: [] },
      { id: 'b', title: 'Data analyst', family: 'Technology', description: '', requiredSkills: ['SQL', 'Excel'], roles: [] },
    ];
    const r = recommendPaths(paths, [{ name: 'MS Excel', level: 4 }, { name: 'GST filing', level: 2 }], ['finance']);
    expect(r[0]).toMatchObject({ pathId: 'a', matched: ['Excel', 'GST'], gaps: ['Tally'], interestMatch: true });
    expect(r[0].fit).toBeGreaterThan(r[1].fit);
    expect(r[1]).toMatchObject({ pathId: 'b', matched: ['Excel'], gaps: ['SQL'] });
  });

  it('scores interview answers on length, points covered and filler words', () => {
    const weak = scoreAnswer('um like I think basically yes', ['team', 'result']);
    const strong = scoreAnswer('In my final year project I worked in a team of four on a billing tool. My task was the database. Together we tested it and the result was a tool two shops now use, and I learned to plan work in small steps and review it with the team every week.', ['team', 'task', 'result', 'learned']);
    expect(weak.score).toBeLessThan(4);
    expect(weak.notes.join(' ')).toContain('filler');
    expect(strong.score).toBeGreaterThanOrEqual(8);
    const all = scoreInterview(interviewQuestions('hr', 2), [{ answer: 'ok' }, { answer: 'ok' }]);
    expect(all.perQuestion).toHaveLength(2);
    expect(all.overall[0]).toContain('practice');
  });

  it('gives an offline coach reply built from the same facts', () => {
    const r = offlineCoachReply('what should I do?', { topPaths: [{ pathId: 'a', title: 'Accountant', family: '', fit: 70, matched: [], gaps: ['Tally'], interestMatch: true }], skills: [], resumeComplete: false });
    expect(r.answer).toContain('Accountant');
    expect(r.suggestions[0]).toContain('Tally');
  });

  it('counts working days and attendance, using the diary where no muster was kept', () => {
    expect(workingDays('2026-09-14', '2026-09-20')).toEqual(['2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18']);
    const i = { startsOn: '2026-09-14', endsOn: '2026-09-18' };
    expect(summariseAttendance(i, [{ onDate: '2026-09-14', present: true, hours: 8 }, { onDate: '2026-09-15', present: false, hours: 0 }], ['2026-09-15', '2026-09-16'], '2026-09-30')).toMatchObject({ workingDays: 5, presentDays: 2, percent: 40, eligible: false });
    expect(summariseAttendance(i, [], ['2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17'], '2026-09-30')).toMatchObject({ presentDays: 4, percent: 80, eligible: true });
  });
});

describe('careers: resume, aptitude, paths, mock interviews, assistant, internships', () => {
  const owner = ownerPool();
  const clock = new FixedClock(new Date('2026-10-20T04:30:00Z'));
  let app: INestApplication;
  let t: Awaited<ReturnType<typeof createTenant>>;
  let other: Awaited<ReturnType<typeof createTenant>>;
  let tokens: Record<string, string>;
  const ids: Record<string, string> = {};
  const http = () => request(app.getHttpServer());
  const auth = (who: string) => ({ authorization: `Bearer ${tokens[who]}` });
  const login = async (slug: string, email: string) => (await http().post('/v1/auth/login').send({ tenant: slug, login: email, password: 'pw' }).expect(201)).body.accessToken as string;
  const get = (who: string, url: string) => http().get(url).set(auth(who));
  const post = (who: string, url: string, body: object = {}) => http().post(url).set(auth(who)).send(body);
  const put = (who: string, url: string, body: object = {}) => http().put(url).set(auth(who)).send(body);
  const C = '/v1/careers';
  const PL = '/v1/placements';
  const days = (from: string, to: string) => {
    const out: string[] = [];
    for (let d = Date.parse(`${from}T00:00:00Z`); d <= Date.parse(`${to}T00:00:00Z`); d += 86_400_000) {
      const dow = new Date(d).getUTCDay();
      if (dow !== 0 && dow !== 6) out.push(new Date(d).toISOString().slice(0, 10));
    }
    return out;
  };
  const internship = async (org: string) => {
    const i = (await post('student', `${PL}/internships`, { orgName: org, title: 'Accounts intern', startsOn: '2026-09-14', endsOn: '2026-10-09' }).expect(201)).body;
    await put('principal', `${PL}/internships/${i.id}/mentor`, { mentorUserId: t.teacher.id }).expect(200);
    await post('principal', `${PL}/internships/${i.id}/status`, { status: 'approved' }).expect(200);
    await post('principal', `${PL}/internships/${i.id}/status`, { status: 'ongoing' }).expect(200);
    return i.id as string;
  };

  beforeAll(async () => {
    t = await createTenant(owner);
    other = await createTenant(owner);
    app = await createApp(clock);
    tokens = {
      teacher: await login(t.slug, t.teacher.email!),
      principal: await login(t.slug, t.principal.email!),
      student: await login(t.slug, t.studentUser.email!),
      parent: await login(t.slug, t.guardian.email!),
      outsider: await login(other.slug, other.principal.email!),
    };
    ids.me = t.students[2].id;
  });

  afterAll(async () => {
    await app.close();
    await owner.end();
  });

  it('keeps a resume the placement cell can read and print, unless the student withholds it', async () => {
    await put('student', `${C}/resume`, { headline: 'BCom final year', summary: 'Careful with numbers.', education: [{ institution: 'Soundarya College', degree: 'BCom', years: '2024-27', score: '8.1 CGPA' }], projects: [{ title: 'Village accounts app', detail: 'Bookkeeping for shops' }], skills: ['Excel', 'Tally'], interests: ['finance'], links: [{ label: 'Portfolio', url: 'https://example.org/me' }] }).expect(200);
    expect((await get('student', `${C}/resume`).expect(200)).body).toMatchObject({ headline: 'BCom final year', skills: ['Excel', 'Tally'] });
    const list = (await get('principal', `${C}/resumes?q=tally`).expect(200)).body;
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ fullName: 'Student C', headline: 'BCom final year' });
    expect((await get('principal', `${C}/resumes/${ids.me}`).expect(200)).body.student.rollNo).toBe('R3');
    const pdf = await get('principal', `${C}/resumes/${ids.me}/pdf`).buffer(true).parse((r, cb) => {
      const chunks: Buffer[] = [];
      r.on('data', (c: Buffer) => chunks.push(c));
      r.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    expect(pdf.status).toBe(200);
    expect((pdf.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');
    await get('teacher', `${C}/resumes`).expect(403);
    await get('outsider', `${C}/resumes/${ids.me}`).expect(404);
    await put('student', `${C}/resume`, { headline: 'BCom final year', visibleToRecruiters: false }).expect(200);
    expect((await get('principal', `${C}/resumes`).expect(200)).body).toEqual([]);
    await get('principal', `${C}/resumes/${ids.me}`).expect(404);
    await get('student', `${C}/resumes/${ids.me}/pdf`).expect(200);
    await put('student', `${C}/resume`, { headline: 'BCom final year', summary: 'Careful with numbers.', education: [{ institution: 'Soundarya College', degree: 'BCom', years: '2024-27' }], skills: ['Excel', 'Tally'], interests: ['finance'], visibleToRecruiters: true }).expect(200);
  });

  it('runs an online aptitude test: answers stay hidden, time is enforced, a pass ends the attempts', async () => {
    const test = (await post('principal', `${C}/tests`, { title: 'Campus screening', category: 'mixed', durationMin: 20, passPercent: 60, questions: [
      { prompt: '2 + 2', options: ['3', '4', '5'], answerIndex: 1, topic: 'Quant' },
      { prompt: 'Synonym of rapid', options: ['slow', 'quick'], answerIndex: 1, topic: 'Verbal' },
      { prompt: 'Next: 2, 4, 8, ?', options: ['10', '16', '12'], answerIndex: 1, topic: 'Logic' },
    ] }).expect(201)).body;
    expect(test.questionCount).toBe(3);
    await post('teacher', `${C}/tests`, { title: 'x', questions: [{ prompt: 'a', options: ['1', '2'], answerIndex: 0 }] }).expect(403);
    await post('principal', `${C}/tests`, { title: 'Bad', questions: [{ prompt: 'a', options: ['1', '2'], answerIndex: 4 }] }).expect(400);
    const listed = (await get('student', `${C}/tests`).expect(200)).body;
    expect(listed[0]).toMatchObject({ title: 'Campus screening', attempts: 0, passed: false });
    // First attempt runs out of time.
    const a1 = (await post('student', `${C}/tests/${test.id}/start`).expect(200)).body;
    expect(JSON.stringify(a1.questions)).not.toContain('answerIndex');
    const again = (await post('student', `${C}/tests/${test.id}/start`).expect(200)).body;
    expect(again.attemptId).toBe(a1.attemptId);
    clock.at = new Date(clock.at.getTime() + 60 * 60_000);
    await post('student', `${C}/attempts/${a1.attemptId}/submit`, { answers: [1, 1, 1] }).expect(409);
    // Second attempt: 1 of 3 right (33%), fails; the third passes.
    const a2 = (await post('student', `${C}/tests/${test.id}/start`).expect(200)).body;
    expect(a2.attemptId).not.toBe(a1.attemptId);
    const r2 = (await post('student', `${C}/attempts/${a2.attemptId}/submit`, { answers: [1, 0, 0] }).expect(200)).body;
    expect(r2).toMatchObject({ score: 1, total: 3, percent: 33.33, passed: false, topicScores: { Quant: { right: 1, total: 1 } } });
    await post('student', `${C}/attempts/${a2.attemptId}/submit`, { answers: [1, 0, 0] }).expect(409);
    const a3 = (await post('student', `${C}/tests/${test.id}/start`).expect(200)).body;
    expect((await post('student', `${C}/attempts/${a3.attemptId}/submit`, { answers: [1, 1, 1] }).expect(200)).body).toMatchObject({ percent: 100, passed: true });
    await post('student', `${C}/tests/${test.id}/start`).expect(409);
    const res = (await get('principal', `${C}/tests/${test.id}/results`).expect(200)).body;
    expect(res).toMatchObject({ attempts: 2, passed: 1 });
    expect(res.rows[0].fullName).toBe('Student C');
    await get('student', `${C}/tests/${test.id}/results`).expect(403);
  });

  it('recommends career paths from the skill passport and resume interests', async () => {
    const lead = (await post('principal', '/v1/skills', { code: 'GST', name: 'GST filing', category: 'skill' }).expect(201)).body;
    await post('teacher', `/v1/skills/${lead.id}/evidence`, { studentId: ids.me, level: 4, title: 'GST return practical' }).expect(201);
    await post('principal', `${C}/paths`, { title: 'Accountant', family: 'Finance', requiredSkills: ['Excel', 'Tally', 'GST'], roles: ['Junior accountant'], steps: [{ title: 'Learn Tally Prime', detail: 'Short course' }] }).expect(201);
    await post('principal', `${C}/paths`, { title: 'Data analyst', family: 'Technology', requiredSkills: ['SQL', 'Excel'] }).expect(201);
    await post('principal', `${C}/paths`, { title: 'Accountant' }).expect(409);
    const rec = (await get('student', `${C}/recommendations`).expect(200)).body;
    expect(rec.skills).toEqual(expect.arrayContaining(['GST filing', 'Excel']));
    expect(rec.paths[0]).toMatchObject({ title: 'Accountant', matched: expect.arrayContaining(['Excel', 'GST']), gaps: [], interestMatch: true });
    expect(rec.paths[0].fit).toBe(100);
    expect((await get('principal', `${C}/recommendations?studentId=${ids.me}`).expect(200)).body.paths[0].title).toBe('Accountant');
    await get('teacher', `${C}/recommendations`).expect(403);
  });

  it('scores a mock interview and communication practice with feedback', async () => {
    const m = (await post('student', `${C}/mock-interviews`, { kind: 'hr', count: 2 }).expect(201)).body;
    expect(m.questions).toHaveLength(2);
    await post('student', `${C}/mock-interviews/${m.id}/submit`, { answers: [{ answer: 'ok' }] }).expect(409);
    const r = (await post('student', `${C}/mock-interviews/${m.id}/submit`, { answers: [{ answer: 'um I am a student, like, basically' }, { answer: 'I worked in a team on a project, my task was the database, and the result was a tool two shops use. I learned a lot from the team and we tested it together every week before the release.', seconds: 40 }] }).expect(200)).body;
    expect(r.perQuestion).toHaveLength(2);
    expect(r.perQuestion[0].score).toBeLessThan(r.perQuestion[1].score);
    expect(r.perQuestion[0].notes.join(' ')).toContain('filler');
    await post('student', `${C}/mock-interviews/${m.id}/submit`, { answers: [{ answer: 'a' }, { answer: 'b' }] }).expect(409);
    const c = (await post('student', `${C}/mock-interviews`, { kind: 'communication', count: 1 }).expect(201)).body;
    expect(c.questions[0]).toContain('college');
    const mine = (await get('student', `${C}/mock-interviews/mine`).expect(200)).body;
    expect(mine.map((x: { status: string }) => x.status).sort()).toEqual(['completed', 'in_progress']);
    await post('parent', `${C}/mock-interviews`, { kind: 'hr' }).expect(403);
  });

  it('answers career questions (offline when no AI model is connected) and keeps the history', async () => {
    const a = (await post('student', `${C}/assistant/ask`, { question: 'Which career suits me?' }).expect(200)).body;
    expect(a.aiUsed).toBe(false);
    expect(a.answer).toContain('Accountant');
    expect(a.pathways[0]).toBe('Accountant');
    const r = (await post('student', `${C}/assistant/ask`, { question: 'Can you review my resume?' }).expect(200)).body;
    expect(r.answer.toLowerCase()).toContain('resume');
    const h = (await get('student', `${C}/assistant/history`).expect(200)).body;
    expect(h.map((x: { role: string }) => x.role)).toEqual(['user', 'assistant', 'user', 'assistant']);
    await post('student', `${C}/assistant/ask`, { question: 'x' }).expect(400);
  });

  it('tracks internship attendance and issues the completion certificate only for good attendance', async () => {
    const id = await internship('Kumar & Co');
    const all = days('2026-09-14', '2026-10-09');
    expect(all).toHaveLength(20);
    for (const d of all.slice(0, 10)) await post('student', `${PL}/internships/${id}/attendance`, { onDate: d }).expect(200);
    await post('student', `${PL}/internships/${id}/attendance`, { onDate: '2026-11-01' }).expect(409);
    const att = (await get('teacher', `${PL}/internships/${id}/attendance`).expect(200)).body;
    expect(att.summary).toMatchObject({ workingDays: 20, presentDays: 10, percent: 50, eligible: false });
    await post('teacher', `${PL}/internships/${id}/evaluation`, { score: 85, remarks: 'Reliable' }).expect(200);
    // Completing with weak attendance gives no certificate, and says why.
    const done = (await post('principal', `${PL}/internships/${id}/status`, { status: 'completed' }).expect(200)).body;
    expect(done.certificate).toMatchObject({ certificateId: null });
    expect(done.certificate.reason).toContain('50%');
    await post('teacher', `${PL}/internships/${id}/certificate`, {}).expect(403);
    expect((await post('principal', `${PL}/internships/${id}/certificate`, {}).expect(200)).body.certificateId).toBeNull();
    // The mentor marks the rest; now it qualifies.
    for (const d of all.slice(10, 16)) await post('teacher', `${PL}/internships/${id}/attendance`, { onDate: d }).expect(200);
    const issued = (await post('principal', `${PL}/internships/${id}/certificate`, {}).expect(200)).body;
    expect(issued.certificateId).toBeTruthy();
    expect((await post('principal', `${PL}/internships/${id}/certificate`, {}).expect(200)).body.certificateId).toBe(issued.certificateId);
    const cert = (await get('student', `${PL}/internships/${id}/certificate`).expect(200)).body;
    expect(cert).toMatchObject({ status: 'issued', certificateId: issued.certificateId });
    expect(cert.serialNo).toMatch(/^INT\//);
    const row = (await owner.query('select rendered_body from certificates where id = $1', [issued.certificateId])).rows[0];
    expect(row.rendered_body).toContain('Kumar & Co');
    expect(row.rendered_body).toContain('80%');
    // Adding our template must not stop the standard ones from being set up.
    expect((await get('principal', '/v1/documents/templates').expect(200)).body.map((x: { kind: string }) => x.kind)).toEqual(expect.arrayContaining(['bonafide', 'transfer_certificate', 'custom']));
  });

  it('issues the certificate straight away when attendance is good and the diary stands in for a muster', async () => {
    const id = await internship('Rao Traders');
    for (const d of days('2026-09-14', '2026-10-07')) await post('student', `${PL}/internships/${id}/diary`, { entryDate: d, entry: 'Posted ledgers' }).expect(200);
    expect((await get('student', `${PL}/internships/${id}/attendance`).expect(200)).body.summary).toMatchObject({ presentDays: 18, percent: 90, eligible: true });
    await post('teacher', `${PL}/internships/${id}/evaluation`, { score: 92, remarks: 'Excellent' }).expect(200);
    const done = (await post('principal', `${PL}/internships/${id}/status`, { status: 'completed' }).expect(200)).body;
    expect(done.certificate.certificateId).toBeTruthy();
    expect(await (async () => (await owner.query(`select count(*)::int as n from internship_certificates where tenant_id = $1`, [t.tenantId])).rows[0].n)()).toBe(2);
  });

  it('maps an internship to skills, courses and course outcomes', async () => {
    const id = await internship('Joshi Associates');
    const skill = (await post('principal', '/v1/skills', { code: 'TALLY', name: 'Tally Prime', category: 'skill' }).expect(201)).body;
    const set = (await owner.query(`insert into co_sets (tenant_id, subject_id, version, status, created_by) values ($1,$2,1,'active',$3) returning id`, [t.tenantId, t.subject.id, t.teacher.id])).rows[0].id;
    const co = (await owner.query(`insert into course_outcomes (tenant_id, co_set_id, code, statement) values ($1,$2,'CO2','Prepare ledgers') returning id`, [t.tenantId, set])).rows[0].id;
    await post('teacher', `${PL}/internships/${id}/links`, { kind: 'skill', refId: skill.id }).expect(201);
    await post('teacher', `${PL}/internships/${id}/links`, { kind: 'course', refId: t.subject.id, note: 'Applies Corporate Accounting' }).expect(201);
    await post('teacher', `${PL}/internships/${id}/links`, { kind: 'course_outcome', refId: co }).expect(201);
    await post('teacher', `${PL}/internships/${id}/links`, { kind: 'skill', refId: skill.id }).expect(409);
    await post('teacher', `${PL}/internships/${id}/links`, { kind: 'skill', refId: co }).expect(404);
    const links = (await get('student', `${PL}/internships/${id}/links`).expect(200)).body;
    expect(links.map((l: { kind: string; label: string }) => `${l.kind}:${l.label}`).sort()).toEqual(['course:Corporate Accounting', 'course_outcome:CO2', 'skill:Tally Prime']);
    await post('student', `${PL}/internships/${id}/links`, { kind: 'skill', refId: skill.id }).expect(403);
    await get('outsider', `${PL}/internships/${id}/links`).expect(404);
  });
});
