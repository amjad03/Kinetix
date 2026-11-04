import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ENV, loadEnv } from '../src/config/env.js';
import { rubricMarks } from '../src/homework/assignment-depth.controller.js';
import { highestSimilarity } from '../src/homework/plagiarism-hook.js';
import { injectShim, parseCmi5 } from '../src/integrations/scorm.controller.js';
import { moveOnMet } from '../src/integrations/xapi.controller.js';
import { writeZip } from '../src/integrations/zip.js';
import { pathProgress } from '../src/lms/lms-certificates.controller.js';
import { completionOf } from '../src/lms/lms-completion.js';
import { riskOf } from '../src/lms/lms-insights.controller.js';
import { joinStatus, providerOf } from '../src/lms/lms-live.controller.js';
import { packageItemDone, scormOutcome } from '../src/lms/package-progress.js';
import { attemptTotal, canReview, permutation, proctorVerdict, scoreAnswer, toOriginal } from '../src/lms/quiz-rules.js';
import { createApp, createTenant, FixedClock, nextMondayIst, ownerPool } from './helpers.js';

const CONTENT = 'content.lms-test.example';

/**
 * LMS production pass: SCORM served sandboxed from a separate content origin (SECURITY_AUDIT X1), cmi5 over xAPI,
 * lesson pages and completion rules, course prerequisites, the offline bundle and progress sync, quiz negative marking
 * with shuffled options, proctoring signals, answer review and the push to internal marks, live classes with
 * attendance from joins, forum pre-moderation and reports, certificates and learning paths, at-risk analytics, the
 * NAAC 2.3.2 evidence report, rubric marking and the plagiarism hook. Figures are worked by hand in the comments.
 */
describe('lms production pass', () => {
  const owner = ownerPool();
  const start = nextMondayIst('10:30');
  const clock = new FixedClock(start);
  let app: INestApplication;
  let t: Awaited<ReturnType<typeof createTenant>>;
  let other: Awaited<ReturnType<typeof createTenant>>;
  const tokens: Record<string, string> = {};
  const http = () => request(app.getHttpServer());
  const as = (who: string) => ({ authorization: `Bearer ${tokens[who]}` });
  const login = async (slug: string, email: string) => (await http().post('/v1/auth/login').send({ tenant: slug, login: email, password: 'pw' }).expect(201)).body.accessToken as string;
  const at = (min: number) => new Date(start.getTime() + min * 60_000);
  let courseId = '';
  let moduleId = '';

  beforeAll(async () => {
    t = await createTenant(owner);
    other = await createTenant(owner);
    app = await createApp(clock, (b) => b.overrideProvider(ENV).useValue({ ...loadEnv(), SCORM_CONTENT_ORIGIN: `http://${CONTENT}` }));
    tokens.principal = await login(t.slug, t.principal.email!);
    tokens.teacher = await login(t.slug, t.teacher.email!);
    tokens.teacher2 = await login(t.slug, t.teacher2.email!);
    tokens.student = await login(t.slug, t.studentUser.email!);
    tokens.parent = await login(t.slug, t.guardian.email!);
    tokens.outsider = await login(other.slug, other.principal.email!);
    courseId = (await http().post('/v1/lms/courses').set(as('teacher')).send({ sectionId: t.section.id, subjectId: t.subject.id }).expect(201)).body.id;
    moduleId = (await http().post(`/v1/lms/courses/${courseId}/modules`).set(as('teacher')).send({ title: 'Unit 1' }).expect(201)).body.id;
    await http().patch(`/v1/lms/courses/${courseId}`).set(as('teacher')).send({ status: 'published' }).expect(200);
  });

  afterAll(async () => {
    await app.close();
    await owner.end();
  });

  it('has pure rules for quizzes, completion, risk, paths, live, packages and marking', () => {
    // Shown order [2, 0, 1]: the student's "0" is option 2.
    expect(toOriginal(0, [2, 0, 1])).toBe(2);
    expect(toOriginal([0, 2], [2, 0, 1])).toEqual([2, 1]);
    expect(permutation(5, () => 0.5).sort()).toEqual([0, 1, 2, 3, 4]);
    const q = { kind: 'mcq', options: [{ text: 'a', correct: false }, { text: 'b', correct: true }], answer: '', marks: 4, negativeMarks: null };
    // 25% of 4 marks off a wrong answer; nothing off a blank one; the question's own negative marks win.
    expect(scoreAnswer(q, 0, undefined, 25)).toMatchObject({ correct: false, marks: -1 });
    expect(scoreAnswer(q, undefined, undefined, 25)).toMatchObject({ correct: false, marks: 0 });
    expect(scoreAnswer(q, 1, undefined, 25)).toEqual({ correct: true, marks: 4 });
    expect(scoreAnswer({ ...q, negativeMarks: 2 }, 0, undefined, 25)?.marks).toBe(-2);
    expect(scoreAnswer({ ...q, kind: 'short', options: [], answer: 'x' }, 'y', undefined, 25)?.marks).toBe(0);
    expect(attemptTotal([-1, -1, 0])).toBe(0);
    expect(attemptTotal([4, -1])).toBe(3);
    expect(proctorVerdict('strict', 3, 2, ['tab_hidden'])).toEqual({ violations: 3, flagged: true, submit: true });
    expect(proctorVerdict('record', 3, 2, ['network_change'])).toEqual({ violations: 2, flagged: false, submit: false });
    const quiz = { status: 'published', closesAt: new Date('2026-11-10T10:00:00Z') };
    expect(canReview('after_close', quiz, new Date('2026-11-10T09:00:00Z'))).toBe(false);
    expect(canReview('after_close', quiz, new Date('2026-11-10T10:00:00Z'))).toBe(true);
    expect(canReview('after_submit', quiz, new Date(0))).toBe(true);
    expect(canReview('never', { ...quiz, status: 'closed' }, new Date())).toBe(false);
    // Three items, two finished: 66% (floored), below an 80% rule.
    const items = ['a', 'b', 'c'].map((id) => ({ id, releaseAt: null, prerequisiteItemId: null, audienceStudentIds: null }));
    expect(completionOf(items, 's', new Date(), new Set(['a', 'b']), 72, { completionPct: 80, minGradePct: 60 })).toEqual({ total: 3, done: 2, pct: 66, grade: 72, eligible: false, missing: ['items'] });
    expect(completionOf(items, 's', new Date(), new Set(['a', 'b', 'c']), 50, { completionPct: 80, minGradePct: 60 }).missing).toEqual(['grade']);
    const now = new Date('2026-11-10T00:00:00Z');
    const th = { atRiskInactiveDays: 7, atRiskEngagementBelowPct: 40, atRiskQuizBelowPct: 40, atRiskOverdueCount: 2 };
    expect(riskOf({ items: 10, opened: 2, lastActiveAt: null, overdue: 2, quizPct: 30, liveHeld: 2, liveJoined: 0 }, th, now)).toEqual({ reasons: ['inactive', 'low_engagement', 'low_quiz', 'overdue', 'missed_live'], level: 'high', engagementPct: 20 });
    expect(riskOf({ items: 10, opened: 8, lastActiveAt: new Date('2026-11-09T00:00:00Z'), overdue: 0, quizPct: 75, liveHeld: 0, liveJoined: 0 }, th, now).level).toBe('none');
    expect(pathProgress([{ courseId: 'x', required: true }, { courseId: 'y', required: false }], (c) => c === 'x')).toEqual({ total: 2, done: 1, pct: 50, complete: true, nextCourseId: 'y' });
    expect(joinStatus(null, now, 10)).toBe('absent');
    expect(joinStatus(new Date(now.getTime() + 11 * 60_000), now, 10)).toBe('late');
    expect(providerOf('https://meet.google.com/abc-defg-hij')).toBe('meet');
    expect(providerOf('https://us02web.zoom.us/j/123')).toBe('zoom');
    expect(packageItemDone('pass', 80, { completed: true, passed: null, scorePct: 75 })).toBe(false);
    expect(packageItemDone('pass', 80, { completed: true, passed: null, scorePct: 88 })).toBe(true);
    expect(packageItemDone('mark_done', null, { completed: false, passed: null, scorePct: null })).toBe(false);
    expect(scormOutcome('1.2', { 'cmi.core.lesson_status': 'passed', 'cmi.core.score.raw': '18', 'cmi.core.score.max': '20' })).toEqual({ completed: true, passed: true, scorePct: 90 });
    expect(scormOutcome('2004', { 'cmi.completion_status': 'completed', 'cmi.success_status': 'failed', 'cmi.score.scaled': '0.35' })).toEqual({ completed: true, passed: false, scorePct: 35 });
    expect(moveOnMet('CompletedAndPassed', true, false)).toBe(false);
    expect(moveOnMet('CompletedOrPassed', false, true)).toBe(true);
    // Levels worth 3 of 4 and 1 of 2: 4 of 6 points of 20 marks = 13.33.
    expect(rubricMarks([{ name: 'Analysis', levels: [{ points: 1 }, { points: 3 }, { points: 4 }] }, { name: 'Format', levels: [{ points: 1 }, { points: 2 }] }], [1, 0], 20)).toEqual({ total: 4, maxTotal: 6, marks: 13.33 });
    expect(() => rubricMarks([{ name: 'A', levels: [{ points: 1 }] }], [], 10)).toThrow(/each of the 1/);
    const essay = 'the balance sheet shows the assets and liabilities of the company at the end of the year and the profit and loss account shows the result';
    expect(highestSimilarity(essay, [essay])).toBe(100);
    expect(highestSimilarity('too short to compare', [essay])).toBe(0);
    expect(injectShim('<html><head><title>x</title></head></html>')).toMatch(/^<html><head><script>/);
    expect(parseCmi5('<courseStructure><course id="c"><title><langstring lang="en">Safety</langstring></title></course><au id="https://ex/au1" moveOn="Passed" masteryScore="0.8"><title><langstring>AU</langstring></title><url>au/index.html</url></au></courseStructure>')).toEqual({ title: 'Safety', auId: 'https://ex/au1', url: 'au/index.html', moveOn: 'Passed', masteryScore: 0.8 });
    expect(() => parseCmi5('<au id="x"><url>https://evil.example/au</url></au>')).toThrow(/relative/);
  });

  describe('SCORM on its own sandboxed origin (SECURITY_AUDIT X1)', () => {
    let pkgId = '';
    let itemId = '';
    let playerUrl = '';
    let contentPath = '';
    it('frames the package from the content origin in a sandbox and serves files only there', async () => {
      const manifest = `<?xml version="1.0"?><manifest identifier="m1"><metadata><schema>ADL SCORM</schema><schemaversion>1.2</schemaversion></metadata><organizations default="o1"><organization identifier="o1"><title>Ledger basics</title><item identifier="i1" identifierref="r1"><title>Lesson 1</title></item></organization></organizations><resources><resource identifier="r1" type="webcontent" adlcp:scormtype="sco" href="sco/index.html"/></resources></manifest>`;
      const zip = writeZip([{ path: 'imsmanifest.xml', data: Buffer.from(manifest) }, { path: 'sco/index.html', data: Buffer.from('<html><head><title>SCO</title></head><body>Ledger</body></html>') }, { path: 'sco/app.js', data: Buffer.from('1') }]);
      await http().post('/v1/scorm/packages').set(as('teacher')).set('content-type', 'application/zip').send(writeZip([{ path: 'imsmanifest.xml', data: Buffer.from(manifest) }, { path: '../evil.html', data: Buffer.from('x') }])).expect(400);
      pkgId = (await http().post('/v1/scorm/packages').set(as('teacher')).set('content-type', 'application/zip').send(zip).expect(201)).body.id;
      itemId = (await http().post(`/v1/lms/modules/${moduleId}/items`).set(as('teacher')).send({ kind: 'scorm', title: 'Ledger basics', refId: pkgId, passPct: 80 }).expect(201)).body.id;
      playerUrl = (await http().post(`/v1/scorm/packages/${pkgId}/launch`).set(as('student')).expect(200)).body.playerUrl;
      const page = await http().get(playerUrl).expect(200);
      const csp = page.headers['content-security-policy'];
      expect(csp).toMatch(/script-src 'nonce-[^']+'/);
      expect(csp).toContain(`frame-src http://${CONTENT}`);
      expect(csp).not.toContain('unsafe-inline\'; script');
      expect(page.text).toContain("f.setAttribute('sandbox','allow-scripts allow-forms allow-popups");
      expect(page.text).not.toContain('allow-same-origin');
      const state = JSON.parse(page.text.match(/window\.__S=(\{.*?\});\(function/)![1]);
      expect(state.src.startsWith(`http://${CONTENT}/v1/scorm/content/`)).toBe(true);
      expect(state.cmi['cmi.core.student_name']).toBe(t.studentUser.fullName);
      contentPath = new URL(state.src).pathname;
      const playerToken = playerUrl.split('/').pop()!;
      // The content link is not the player's: it names no learner and cannot save tracking.
      expect(contentPath).not.toContain(playerToken);
      await http().post(`/v1/scorm/track/${contentPath.split('/')[4]}`).send({ cmi: { 'cmi.core.lesson_status': 'passed' } }).expect(403);
      await http().get(`/v1/scorm/content/${playerToken}/sco/index.html`).set('host', CONTENT).expect(403);
    });

    it('answers package files only on the content host, sandboxed, and nothing else there', async () => {
      // On the API's own host the files are refused, so package script never runs on the API origin.
      await http().get(contentPath).expect(404);
      const file = await http().get(contentPath).set('host', CONTENT).expect(200);
      expect(file.headers['content-security-policy']).toMatch(/^sandbox allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads;/);
      expect(file.headers['content-security-policy']).not.toContain('allow-same-origin');
      expect(file.headers['content-security-policy']).toContain(`connect-src http://${CONTENT};`);
      expect(file.headers['content-security-policy']).toMatch(/frame-ancestors http:\/\/127\.0\.0\.1:\d+/);
      expect(file.headers['set-cookie']).toBeUndefined();
      expect(file.text).toMatch(/<head><script>\(function\(\)\{[\s\S]*window\.API=api/);
      // The content host serves no API: signed-in calls and the player are refused there.
      await http().get('/v1/me').set('host', CONTENT).set(as('student')).expect(404);
      await http().get(playerUrl).set('host', CONTENT).expect(404);
      await http().post(`/v1/scorm/packages/${pkgId}/launch`).set('host', CONTENT).set(as('student')).expect(404);
    });

    it('turns the tracking into the course item: 18 of 20 is 90%, above the 80% pass mark', async () => {
      const token = playerUrl.split('/').pop();
      const saved = (await http().post(`/v1/scorm/track/${token}`).send({ cmi: { 'cmi.core.lesson_status': 'incomplete', 'cmi.core.score.raw': '14', 'cmi.core.score.max': '20', 'javascript:alert(1)': 'x' } }).expect(200)).body;
      expect(saved).toMatchObject({ status: 'incomplete', score: 14, itemsDone: 0 });
      expect((await http().post(`/v1/scorm/track/${token}`).send({ cmi: { 'cmi.core.lesson_status': 'passed', 'cmi.core.score.raw': '18', 'cmi.core.score.max': '20' } }).expect(200)).body.itemsDone).toBe(1);
      const course = (await http().get(`/v1/lms/courses/${courseId}`).set(as('student')).expect(200)).body;
      expect(course.modules[0].items.find((i: { id: string }) => i.id === itemId)).toMatchObject({ completed: true });
      // A pass-mark item cannot be ticked off by hand.
      await http().post(`/v1/lms/items/${itemId}/progress`).set(as('student')).send({ completed: true }).expect(409);
    });
  });

  describe('cmi5 over xAPI', () => {
    let pkgId = '';
    let fetchUrl = '';
    let auth = '';
    let reg = '';
    const au = 'https://zynetix.test/cmi5/au1';
    it('imports a cmi5 unit and launches it with a one-use fetch link', async () => {
      const xml = `<courseStructure><course id="https://zynetix.test/cmi5"><title><langstring lang="en">Safe lab work</langstring></title></course><au id="${au}" moveOn="Passed" masteryScore="0.7"><title><langstring lang="en">Unit 1</langstring></title><url>au/index.html</url></au></courseStructure>`;
      const zip = writeZip([{ path: 'cmi5.xml', data: Buffer.from(xml) }, { path: 'au/index.html', data: Buffer.from('<html><body>AU</body></html>') }]);
      const pkg = (await http().post('/v1/scorm/packages').set(as('teacher')).set('content-type', 'application/zip').send(zip).expect(201)).body;
      expect(pkg).toMatchObject({ version: 'cmi5', auId: au, moveOn: 'Passed', title: 'Safe lab work' });
      pkgId = pkg.id;
      await http().post(`/v1/lms/modules/${moduleId}/items`).set(as('teacher')).send({ kind: 'scorm', title: 'Safe lab work', refId: pkgId }).expect(201);
      const { playerUrl } = (await http().post(`/v1/scorm/packages/${pkgId}/launch`).set(as('student')).expect(200)).body;
      const page = (await http().get(playerUrl).expect(200)).text;
      const src = new URL(JSON.parse(page.match(/window\.__S=(\{.*?\});\(function/)![1]).src);
      expect(src.host).toBe(CONTENT);
      expect(JSON.parse(src.searchParams.get('actor')!).account.name).toBe(t.studentUser.id);
      fetchUrl = new URL(src.searchParams.get('fetch')!).pathname;
      reg = src.searchParams.get('registration')!;
      // A sandboxed unit calls from origin "null": CORS for any origin, never credentials.
      const pre = await http().options(fetchUrl).set('origin', 'null').set('access-control-request-method', 'POST').expect(204);
      expect(pre.headers['access-control-allow-origin']).toBe('*');
      expect(pre.headers['access-control-allow-credentials']).toBeUndefined();
      auth = (await http().post(fetchUrl).expect(200)).body['auth-token'];
      expect((await http().post(fetchUrl).expect(400)).body['error-code']).toBe('1');
      // The file headers let the unit reach the xAPI endpoint and nothing else.
      const file = await http().get(src.pathname).set('host', CONTENT).expect(200);
      expect(file.headers['content-security-policy']).toMatch(/connect-src http:\/\/content\.lms-test\.example http:\/\/127\.0\.0\.1:\d+\/v1\/xapi\//);
    });

    it('keeps LaunchData, takes statements only for its learner, and passes the unit by moveOn', async () => {
      const basic = { authorization: `Basic ${auth}` };
      const ld = (await http().get('/v1/xapi/activities/state').query({ activityId: au, stateId: 'LMS.LaunchData', registration: reg, agent: '{}' }).set(basic).expect(200)).body;
      expect(ld).toMatchObject({ launchMode: 'Normal', moveOn: 'Passed', masteryScore: 0.7 });
      await http().put('/v1/xapi/activities/state').query({ activityId: au, stateId: 'LMS.LaunchData' }).set(basic).send({ launchMode: 'Review' }).expect(403);
      await http().put('/v1/xapi/activities/state').query({ activityId: au, stateId: 'bookmark', registration: reg }).set(basic).send({ page: 3 }).expect(204);
      await http().post('/v1/xapi/activities/state').query({ activityId: au, stateId: 'bookmark', registration: reg }).set(basic).send({ seen: true }).expect(204);
      expect((await http().get('/v1/xapi/activities/state').query({ activityId: au, stateId: 'bookmark', registration: reg }).set(basic).expect(200)).body).toEqual({ page: 3, seen: true });
      const actor = { objectType: 'Agent', account: { homePage: 'x', name: t.studentUser.id } };
      await http().post('/v1/xapi/statements').set({ authorization: 'Basic eDp5' }).send({ actor, verb: { id: 'x' }, object: { id: au } }).expect(403);
      await http().post('/v1/xapi/statements').set(basic).send({ actor: { account: { name: t.teacher.id } }, verb: { id: 'http://adlnet.gov/expapi/verbs/passed' }, object: { id: au } }).expect(403);
      const ids = (await http().post('/v1/xapi/statements').set(basic).send([{ actor, verb: { id: 'http://adlnet.gov/expapi/verbs/initialized' }, object: { id: au }, context: { registration: reg } }, { actor, verb: { id: 'http://adlnet.gov/expapi/verbs/passed' }, object: { id: au }, result: { score: { scaled: 0.85 }, success: true }, context: { registration: reg } }]).expect(200)).body;
      expect(ids).toHaveLength(2);
      const att = (await http().get(`/v1/scorm/packages/${pkgId}/attempts`).set(as('teacher')).expect(200)).body;
      expect(att[0]).toMatchObject({ status: 'passed', score: 85 });
      const course = (await http().get(`/v1/lms/courses/${courseId}`).set(as('student')).expect(200)).body;
      expect(course.modules[0].items.find((i: { title: string }) => i.title === 'Safe lab work').completed).toBe(true);
    });
  });

  describe('authoring, completion, prerequisites and the offline bundle', () => {
    let pageId = '';
    let doneId = '';
    it('adds a lesson page and a mark-as-done item, edits and reorders them', async () => {
      await http().post(`/v1/lms/modules/${moduleId}/items`).set(as('teacher')).send({ kind: 'page', title: 'Notes' }).expect(400);
      await http().post(`/v1/lms/modules/${moduleId}/items`).set(as('teacher')).send({ kind: 'link', title: 'Bad', url: 'javascript:alert(1)' }).expect(400);
      pageId = (await http().post(`/v1/lms/modules/${moduleId}/items`).set(as('teacher')).send({ kind: 'page', title: 'Notes on partnership', body: 'A partnership firm keeps a capital account for each partner.', durationMin: 10, sizeKb: 2 }).expect(201)).body.id;
      doneId = (await http().post(`/v1/lms/modules/${moduleId}/items`).set(as('teacher')).send({ kind: 'link', title: 'ICAI guidance note', url: 'https://www.icai.org/', completionRule: 'mark_done' }).expect(201)).body.id;
      await http().patch(`/v1/lms/items/${pageId}`).set(as('teacher2')).send({ title: 'x' }).expect(403);
      await http().patch(`/v1/lms/items/${pageId}`).set(as('teacher')).send({ completionRule: 'pass' }).expect(400);
      expect((await http().patch(`/v1/lms/items/${pageId}`).set(as('teacher')).send({ body: 'A partnership firm keeps a capital and a current account for each partner.' }).expect(200)).body.body).toContain('current account');
      const course = (await http().get(`/v1/lms/courses/${courseId}`).set(as('teacher')).expect(200)).body;
      const ids = course.modules[0].items.map((i: { id: string }) => i.id) as string[];
      await http().put(`/v1/lms/courses/${courseId}/order`).set(as('teacher')).send({ modules: [{ id: moduleId, itemIds: ids.slice(1) }] }).expect(400);
      await http().put(`/v1/lms/courses/${courseId}/order`).set(as('teacher')).send({ modules: [{ id: moduleId, itemIds: [...ids].reverse() }] }).expect(200);
      expect((await http().get(`/v1/lms/courses/${courseId}`).set(as('teacher')).expect(200)).body.modules[0].items[0].id).toBe(ids[ids.length - 1]);
    });

    it('counts completion by each item rule: opening a page finishes it, a link needs "mark as done"', async () => {
      await http().patch(`/v1/lms/courses/${courseId}/completion`).set(as('teacher')).send({ completionPct: 100, certificate: true, minGradePct: null }).expect(200);
      await http().post(`/v1/lms/items/${pageId}/progress`).set(as('student')).send({}).expect(200);
      await http().post(`/v1/lms/items/${doneId}/progress`).set(as('student')).send({}).expect(200);
      let c = (await http().get(`/v1/lms/courses/${courseId}`).set(as('student')).expect(200)).body;
      // 4 items (SCORM, cmi5, page, link): SCORM, cmi5 and the page are done, the link only opened: 3 of 4 = 75%.
      expect(c.completion).toMatchObject({ total: 4, done: 3, pct: 75, eligible: false, missing: ['items'] });
      await http().post(`/v1/lms/courses/${courseId}/certificate/claim`).set(as('student')).expect(409);
      await http().post(`/v1/lms/items/${doneId}/progress`).set(as('student')).send({ completed: true }).expect(200);
      c = (await http().get(`/v1/lms/courses/${courseId}`).set(as('student')).expect(200)).body;
      expect(c.completion).toMatchObject({ done: 4, pct: 100, eligible: true });
    });

    it('locks a course until its prerequisite course is complete', async () => {
      const [sub2] = (await owner.query(`insert into subjects (tenant_id, program_id, term, code, name) values ($1, $2, 3, 'BCOM-3.2', 'Cost Accounting') returning id`, [t.tenantId, t.program.id])).rows;
      await owner.query(`insert into timetable_slots (tenant_id, academic_year_id, section_id, subject_id, teacher_id, room_id, day_of_week, starts_at, ends_at) select tenant_id, academic_year_id, section_id, $2, teacher_id, room_id, 2, '10:00', '10:55' from timetable_slots where id = $1`, [t.slot.id, sub2.id]);
      const c2 = (await http().post('/v1/lms/courses').set(as('teacher')).send({ sectionId: t.section.id, subjectId: sub2.id }).expect(201)).body.id;
      await http().patch(`/v1/lms/courses/${c2}`).set(as('teacher')).send({ status: 'published' }).expect(200);
      const m2 = (await http().post(`/v1/lms/courses/${c2}/modules`).set(as('teacher')).send({ title: 'Unit 1' }).expect(201)).body.id;
      const i2 = (await http().post(`/v1/lms/modules/${m2}/items`).set(as('teacher')).send({ kind: 'page', title: 'Costing', body: 'Elements of cost.' }).expect(201)).body.id;
      await http().patch(`/v1/lms/courses/${c2}/completion`).set(as('teacher')).send({ prerequisiteCourseIds: [c2] }).expect(400);
      await http().patch(`/v1/lms/courses/${c2}/completion`).set(as('teacher')).send({ prerequisiteCourseIds: [courseId] }).expect(200);
      await http().patch(`/v1/lms/courses/${courseId}/completion`).set(as('teacher')).send({ prerequisiteCourseIds: [c2] }).expect(400);
      // The first course is complete, so the second is open.
      let view = (await http().get(`/v1/lms/courses/${c2}`).set(as('student')).expect(200)).body;
      expect(view.prerequisites).toEqual([]);
      expect(view.modules[0].items[0]).toMatchObject({ locked: false, body: 'Elements of cost.' });
      // A new item in the first course makes it incomplete again: the second locks.
      await http().post(`/v1/lms/modules/${moduleId}/items`).set(as('teacher')).send({ kind: 'page', title: 'Goodwill', body: 'Valuation of goodwill.' }).expect(201);
      view = (await http().get(`/v1/lms/courses/${c2}`).set(as('student')).expect(200)).body;
      expect(view.prerequisites).toEqual([{ id: courseId, title: expect.any(String) }]);
      expect(view.modules[0].items[0]).toMatchObject({ locked: true, body: '' });
      await http().post(`/v1/lms/items/${i2}/progress`).set(as('student')).send({}).expect(409);
    });

    it('serves the offline bundle with an ETag and takes back offline progress once', async () => {
      const first = await http().get('/v1/lms/my/offline').set(as('student')).expect(200);
      const course = first.body.courses.find((c: { id: string }) => c.id === courseId);
      const goodwill = course.modules[0].items.find((i: { title: string }) => i.title === 'Goodwill');
      expect(goodwill.body).toBe('Valuation of goodwill.');
      await http().get('/v1/lms/my/offline').set(as('student')).set('if-none-match', first.headers.etag).expect(304);
      const ev = { events: [{ itemId: goodwill.id, at: at(-30).toISOString(), completed: false }, { itemId: '00000000-0000-4000-8000-000000000000', at: at(-20).toISOString() }] };
      expect((await http().post('/v1/lms/my/progress/sync').set(as('student')).send(ev).expect(200)).body).toEqual({ applied: 1, skipped: ['00000000-0000-4000-8000-000000000000'] });
      await http().post('/v1/lms/my/progress/sync').set(as('student')).send(ev).expect(200);
      const { rows } = await owner.query('select views, completed_at from lms_item_progress where item_id = $1', [goodwill.id]);
      expect(rows).toHaveLength(1);
      expect(rows[0].views).toBe(1);
      expect(new Date(rows[0].completed_at).getTime()).toBe(at(-30).getTime());
      // The bundle changed, so the old ETag no longer matches.
      await http().get('/v1/lms/my/offline').set(as('student')).set('if-none-match', first.headers.etag).expect(200);
      await http().get('/v1/lms/my/offline').set(as('teacher')).expect(403);
    });
  });

  describe('quizzes: negative marking, shuffled options, proctoring, review and internal marks', () => {
    let quizId = '';
    let quiz2 = '';
    it('marks 4 for a right answer and takes 1 off a wrong one (25% of 4)', async () => {
      quizId = (await http().post('/v1/lms/quizzes').set(as('teacher')).send({ sectionId: t.section.id, subjectId: t.subject.id, title: 'Partnership quiz', opensAt: at(-60), closesAt: at(120), negativePct: 25, review: 'after_submit', passPct: 50 }).expect(201)).body.id;
      const opts = [{ text: 'Debit', correct: false }, { text: 'Credit', correct: true }, { text: 'Neither', correct: false }];
      await http().post(`/v1/lms/quizzes/${quizId}/questions`).set(as('teacher')).send({ kind: 'mcq', text: 'Interest on capital is credited to?', options: opts, marks: 4 }).expect(201);
      await http().post(`/v1/lms/quizzes/${quizId}/questions`).set(as('teacher')).send({ kind: 'mcq', text: 'Drawings are debited to?', options: [{ text: 'Current account', correct: true }, { text: 'Bank', correct: false }], marks: 4 }).expect(201);
      await http().post(`/v1/lms/quizzes/${quizId}/publish`).set(as('teacher')).expect(200);
      await http().post(`/v1/lms/modules/${moduleId}/items`).set(as('teacher')).send({ kind: 'quiz', title: 'Partnership quiz', refId: quizId }).expect(201);
      const s = (await http().post(`/v1/lms/quizzes/${quizId}/start`).set(as('student')).expect(200)).body;
      expect(s.negativePct).toBe(25);
      const q1 = s.questions.find((q: { text: string }) => q.text.startsWith('Interest'));
      const q2 = s.questions.find((q: { text: string }) => q.text.startsWith('Drawings'));
      expect([...q1.options].sort()).toEqual(['Credit', 'Debit', 'Neither']);
      const answers = { [q1.id]: [q1.options.indexOf('Credit')], [q2.id]: [q2.options.indexOf('Bank')] };
      const r = (await http().post(`/v1/lms/quiz-attempts/${s.attemptId}/submit`).set(as('student')).send({ answers }).expect(200)).body;
      // 4 - 1 = 3 of 8: 37.5%, below the 50% pass mark.
      expect(r).toMatchObject({ score: 3, maxScore: 8, passed: false });
      expect(r.results[q2.id]).toEqual({ correct: false, marks: -1 });
      const rev = (await http().get(`/v1/lms/quiz-attempts/${s.attemptId}/review`).set(as('student')).expect(200)).body;
      const rq1 = rev.questions.find((q: { id: string }) => q.id === q1.id);
      expect(rq1.options[rq1.correctOptions[0]]).toBe('Credit');
    });

    it('submits a strict proctored attempt after three violations and flags it', async () => {
      quiz2 = (await http().post('/v1/lms/quizzes').set(as('teacher')).send({ sectionId: t.section.id, subjectId: t.subject.id, title: 'Proctored test', opensAt: at(-60), closesAt: at(120), proctoring: 'strict', maxViolations: 3, review: 'never' }).expect(201)).body.id;
      await http().post(`/v1/lms/quizzes/${quiz2}/questions`).set(as('teacher')).send({ kind: 'short', text: 'Name the deed that governs a partnership', answer: 'partnership deed|deed', marks: 2 }).expect(201);
      await http().post(`/v1/lms/quizzes/${quiz2}/publish`).set(as('teacher')).expect(200);
      const s = (await http().post(`/v1/lms/quizzes/${quiz2}/start`).set(as('student')).expect(200)).body;
      await http().put(`/v1/lms/quiz-attempts/${s.attemptId}/answers`).set(as('student')).send({ answers: { [s.questions[0].id]: 'Partnership deed' } }).expect(200);
      expect((await http().post(`/v1/lms/quiz-attempts/${s.attemptId}/events`).set(as('student')).send({ events: [{ kind: 'tab_hidden', at: start }, { kind: 'network_change', at: start }] }).expect(200)).body).toMatchObject({ violations: 1, submitted: false });
      const v = (await http().post(`/v1/lms/quiz-attempts/${s.attemptId}/events`).set(as('student')).send({ events: [{ kind: 'copy', at: start }, { kind: 'app_background', at: start }] }).expect(200)).body;
      expect(v).toMatchObject({ violations: 3, flagged: true, submitted: true });
      const log = (await http().get(`/v1/lms/quiz-attempts/${s.attemptId}/events`).set(as('teacher')).expect(200)).body;
      expect(log).toMatchObject({ violations: 3, flagged: true, autoSubmitted: true });
      expect(log.events).toHaveLength(4);
      await http().get(`/v1/lms/quiz-attempts/${s.attemptId}/events`).set(as('student')).expect(403);
      await http().get(`/v1/lms/quiz-attempts/${s.attemptId}/review`).set(as('student')).expect(403);
      const list = (await http().get('/v1/lms/quizzes').set(as('teacher')).expect(200)).body;
      expect(list.find((q: { id: string }) => q.id === quiz2).flagged).toBe(1);
    });

    it('pushes the best scores to internal marks and puts quizzes in the gradebook', async () => {
      await http().post(`/v1/lms/quizzes/${quizId}/push-marks`).set(as('teacher2')).expect(403);
      const pushed = (await http().post(`/v1/lms/quizzes/${quizId}/push-marks`).set(as('teacher')).expect(200)).body;
      expect(pushed).toMatchObject({ students: 3, absent: 2, maxMarks: 8 });
      const { rows } = await owner.query('select marks, absent from marks where assessment_id = $1 and student_id = $2', [pushed.assessmentId, t.students[2].id]);
      expect(rows[0]).toMatchObject({ absent: false });
      expect(Number(rows[0].marks)).toBe(3);
      await http().put(`/v1/lms/courses/${courseId}/categories`).set(as('teacher')).send({ categories: [{ name: 'Quizzes', source: 'quiz', weight: 100 }] }).expect(200);
      const gb = (await http().get(`/v1/lms/courses/${courseId}/gradebook`).set(as('teacher')).expect(200)).body;
      // Partnership quiz 3 of 8 and the proctored test 2 of 2: 5 of 10 = 50%.
      expect(gb.rows.find((r: { studentId: string }) => r.studentId === t.students[2].id).overall).toBe(50);
    });
  });

  describe('live classes with attendance from joins', () => {
    let liveId = '';
    it('schedules a live class, refuses early joins and records the join', async () => {
      await http().post(`/v1/lms/courses/${courseId}/live`).set(as('teacher')).send({ title: 'Doubt session', startsAt: at(60), durationMin: 45, joinUrl: 'http://meet.google.com/abc' }).expect(400);
      await http().post(`/v1/lms/courses/${courseId}/live`).set(as('teacher2')).send({ title: 'Doubt session', startsAt: at(60), durationMin: 45, joinUrl: 'https://meet.google.com/abc-defg-hij' }).expect(403);
      const live = (await http().post(`/v1/lms/courses/${courseId}/live`).set(as('teacher')).send({ title: 'Doubt session', startsAt: at(60), durationMin: 45, joinUrl: 'https://meet.google.com/abc-defg-hij', slotId: t.slot.id }).expect(201)).body;
      expect(live.provider).toBe('meet');
      liveId = live.id;
      const list = (await http().get(`/v1/lms/courses/${courseId}/live`).set(as('student')).expect(200)).body;
      expect(list[0]).toMatchObject({ joinUrl: null, open: false });
      await http().post(`/v1/lms/live/${liveId}/join`).set(as('student')).expect(409);
      clock.at = at(72); // 12 minutes after the start: late (grace 10)
      expect((await http().post(`/v1/lms/live/${liveId}/join`).set(as('student')).expect(200)).body.joinUrl).toBe('https://meet.google.com/abc-defg-hij');
      await http().post(`/v1/lms/live/${liveId}/join`).set(as('student')).expect(200);
      // The family of student A sees the class's live class, which A has not joined.
      expect((await http().get('/v1/lms/my-live').set(as('parent')).expect(200)).body[0]).toMatchObject({ id: liveId, joined: false, open: true });
      expect((await http().get('/v1/lms/my-live').set(as('student')).expect(200)).body[0]).toMatchObject({ id: liveId, joined: true });
    });

    it('suggests present, late or absent from the joins and writes the attendance', async () => {
      const a = (await http().get(`/v1/lms/live/${liveId}/attendance`).set(as('teacher')).expect(200)).body;
      expect(a.rows.map((r: { suggested: string }) => r.suggested)).toEqual(['absent', 'absent', 'late']);
      expect(a.rows[2].joins).toBe(2);
      await http().post(`/v1/lms/live/${liveId}/attendance`).set(as('teacher')).send({ entries: [{ studentId: other.students[0].id, status: 'present' }] }).expect(400);
      await http().post(`/v1/lms/live/${liveId}/attendance`).set(as('teacher')).send({ entries: a.rows.map((r: { id: string; suggested: string }) => ({ studentId: r.id, status: r.suggested })) }).expect(200);
      const { rows } = await owner.query('select status from attendance_records where timetable_slot_id = $1 and student_id = $2', [t.slot.id, t.students[2].id]);
      expect(rows[0].status).toBe('late');
      clock.at = start;
    });
  });

  describe('forum pre-moderation, reports and edits', () => {
    let threadId = '';
    let teacherPost = '';
    it('holds a student discussion for a teacher when the institution asks', async () => {
      await http().put('/v1/lms/settings').set(as('teacher')).send({ forumModeration: 'hold_students' }).expect(403);
      await http().put('/v1/lms/settings').set(as('principal')).send({ forumModeration: 'nonsense' }).expect(400);
      await http().put('/v1/lms/settings').set(as('principal')).send({ forumModeration: 'hold_students', forumAutoHideReports: 1 }).expect(200);
      threadId = (await http().post(`/v1/lms/courses/${courseId}/forum`).set(as('student')).send({ title: 'Goodwill doubt', body: 'How is super profit computed?' }).expect(201)).body.id;
      expect((await http().get(`/v1/lms/courses/${courseId}/forum`).set(as('parent')).expect(200)).body).toEqual([]);
      expect((await http().get(`/v1/lms/courses/${courseId}/forum`).set(as('student')).expect(200)).body[0]).toMatchObject({ id: threadId, held: true });
      const q = (await http().get(`/v1/lms/courses/${courseId}/forum/queue`).set(as('teacher')).expect(200)).body;
      expect(q.threads.map((x: { id: string }) => x.id)).toEqual([threadId]);
      await http().post('/v1/lms/forum/moderation').set(as('student')).send({ kind: 'thread', id: threadId, action: 'approve' }).expect(403);
      await http().post('/v1/lms/forum/moderation').set(as('teacher')).send({ kind: 'thread', id: threadId, action: 'approve' }).expect(200);
      expect((await http().get(`/v1/lms/courses/${courseId}/forum`).set(as('parent')).expect(200)).body).toHaveLength(1);
    });

    it('hides a reported reply for review and lets the author edit only for a while', async () => {
      teacherPost = (await http().post(`/v1/lms/forum/${threadId}/posts`).set(as('teacher')).send({ body: 'Average profit less normal profit.' }).expect(201)).body.id;
      const { rows } = await owner.query(`select count(*)::int as n from notifications where user_id = $1 and dedupe_key like 'lms-forum-reply:%'`, [t.studentUser.id]);
      expect(rows[0].n).toBe(1);
      await http().post(`/v1/lms/forum/${threadId}/report`).set(as('parent')).send({ postId: teacherPost, reason: 'spam' }).expect(403);
      expect((await http().post(`/v1/lms/forum/${threadId}/report`).set(as('student')).send({ postId: teacherPost, reason: 'off_topic' }).expect(200)).body).toMatchObject({ reports: 1, held: true });
      await http().post(`/v1/lms/forum/${threadId}/report`).set(as('student')).send({ postId: teacherPost, reason: 'off_topic' }).expect(200);
      expect((await http().get(`/v1/lms/forum/${threadId}`).set(as('parent')).expect(200)).body.posts).toEqual([]);
      const q = (await http().get(`/v1/lms/courses/${courseId}/forum/queue`).set(as('teacher')).expect(200)).body;
      expect(q.posts[0]).toMatchObject({ id: teacherPost, reports: 1, reasons: [{ reason: 'off_topic', note: '' }] });
      expect((await http().post('/v1/lms/forum/moderation').set(as('teacher')).send({ kind: 'post', id: teacherPost, action: 'dismiss' }).expect(200)).body.reportsResolved).toBe(1);
      expect((await http().get(`/v1/lms/forum/${threadId}`).set(as('parent')).expect(200)).body.posts).toHaveLength(1);
      await http().patch(`/v1/lms/forum/posts/${teacherPost}`).set(as('student')).send({ body: 'x' }).expect(404);
      expect((await http().patch(`/v1/lms/forum/posts/${teacherPost}`).set(as('teacher')).send({ body: 'Super profit is average profit less normal profit.' }).expect(200)).body.editedAt).toBeTruthy();
      clock.at = at(20);
      await http().patch(`/v1/lms/forum/posts/${teacherPost}`).set(as('teacher')).send({ body: 'Late edit' }).expect(409);
      clock.at = start;
      await http().put('/v1/lms/settings').set(as('principal')).send({ forumModeration: 'open' }).expect(200);
    });
  });

  describe('certificates and learning paths', () => {
    let certId = '';
    it('issues a certificate to a student who meets the rules and records it in the register', async () => {
      // Finish the course again (the "Goodwill" page and the quiz item, which needs 40%... the quiz was 37.5%).
      await http().patch(`/v1/lms/courses/${courseId}/completion`).set(as('teacher')).send({ completionPct: 75 }).expect(200);
      const list = (await http().get(`/v1/lms/courses/${courseId}/certificates`).set(as('teacher')).expect(200)).body;
      const c = list.rows.find((r: { id: string }) => r.id === t.students[2].id);
      // 6 items: SCORM, cmi5, page, link, Goodwill (synced) done; the quiz (37.5% < 40%) not: 5 of 6 = 83%.
      expect(c.completion).toMatchObject({ total: 6, done: 5, pct: 83, eligible: true });
      const issued = (await http().post(`/v1/lms/courses/${courseId}/certificates`).set(as('teacher')).send({}).expect(200)).body;
      expect(issued.issued).toBe(1);
      expect(issued.skipped).toEqual(expect.arrayContaining([{ studentId: t.students[0].id, reason: 'items' }]));
      const mine = (await http().get('/v1/lms/my/certificates').set(as('student')).expect(200)).body;
      expect(mine[0]).toMatchObject({ kind: 'course', completedPct: 83 });
      expect(mine[0].serial).toMatch(/^CC/);
      certId = mine[0].id;
      expect((await http().post(`/v1/lms/courses/${courseId}/certificate/claim`).set(as('student')).expect(200)).body.id).toBe(certId);
      const pdf = await http().get(`/v1/lms/lms-certificates/${certId}/pdf`).set(as('student')).buffer(true).expect(200);
      expect(pdf.headers['content-type']).toContain('application/pdf');
      await http().get(`/v1/lms/lms-certificates/${certId}/pdf`).set(as('parent')).expect(404);
      await http().get(`/v1/lms/lms-certificates/${certId}/pdf`).set(as('outsider')).expect(404);
      const token = mine[0].verifyUrl.split('/').pop();
      expect((await http().get(`/v1/public/verify/${t.slug}/${token}`).expect(200)).body.status).toBe('valid');
      await http().post(`/v1/lms/lms-certificates/${certId}/revoke`).set(as('teacher')).send({ reason: 'Issued in error' }).expect(403);
      await http().post(`/v1/lms/lms-certificates/${certId}/revoke`).set(as('principal')).send({ reason: 'Issued in error' }).expect(200);
      expect((await http().get(`/v1/public/verify/${t.slug}/${token}`).expect(200)).body.status).toBe('revoked');
    });

    it('runs a learning path of two courses and its certificate', async () => {
      const courses = (await http().get('/v1/lms/courses').set(as('teacher')).expect(200)).body as { id: string }[];
      const c2 = courses.find((c) => c.id !== courseId)!.id;
      await http().post('/v1/lms/paths').set(as('teacher')).send({ title: 'Accounting track', steps: [{ courseId }] }).expect(403);
      await http().post('/v1/lms/paths').set(as('principal')).send({ title: 'Accounting track', steps: [{ courseId, required: false }] }).expect(400);
      const path = (await http().post('/v1/lms/paths').set(as('principal')).send({ title: 'Accounting track', programId: t.program.id, certificate: true, steps: [{ courseId }, { courseId: c2, required: false }] }).expect(201)).body;
      expect((await http().get('/v1/lms/my/paths').set(as('student')).expect(200)).body).toEqual([]);
      await http().patch(`/v1/lms/paths/${path.id}`).set(as('principal')).send({ status: 'published' }).expect(200);
      const mine = (await http().get('/v1/lms/my/paths').set(as('student')).expect(200)).body[0];
      // The first (required) course is complete, the optional second is not: 1 of 2 = 50%, complete.
      expect(mine).toMatchObject({ id: path.id, total: 2, done: 1, pct: 50, complete: true, nextCourseId: c2 });
      const cert = (await http().post(`/v1/lms/paths/${path.id}/claim`).set(as('student')).expect(200)).body;
      expect(cert.pathId).toBe(path.id);
      expect((await http().get('/v1/lms/my/certificates').set(as('parent')).expect(200)).body).toEqual([]);
    });
  });

  describe('analytics, evidence, rubric marking and the plagiarism hook', () => {
    it('lists the students at risk with their reasons, highest first', async () => {
      await http().get(`/v1/lms/courses/${courseId}/at-risk`).set(as('student')).expect(403);
      await http().get(`/v1/lms/courses/${courseId}/at-risk`).set(as('teacher2')).expect(403);
      await http().get(`/v1/lms/courses/${courseId}/at-risk`).set(as('outsider')).expect(404);
      const r = (await http().get(`/v1/lms/courses/${courseId}/at-risk`).set(as('teacher')).expect(200)).body;
      const a = r.students.find((s: { id: string }) => s.id === t.students[0].id);
      // A opened nothing (inactive, 0% engagement) and missed... only one live class so far (no missed_live).
      expect(a).toMatchObject({ level: 'medium', reasons: ['inactive', 'low_engagement'], engagementPct: 0 });
      const c = r.students.find((s: { id: string }) => s.id === t.students[2].id);
      // C: 6 of 7 items opened, active today, quizzes 5 of 10 = 50% (not below 40).
      expect(c).toMatchObject({ level: 'none', quizPct: 50 });
      expect(r.atRisk).toBe(2);
      expect(r.students[r.students.length - 1].id).toBe(t.students[2].id);
    });

    it('gives the institution overview, the NAAC 2.3.2 evidence and a parent the child summary', async () => {
      await http().get('/v1/lms/overview').set(as('teacher')).expect(403);
      const o = (await http().get('/v1/lms/overview').set(as('principal')).expect(200)).body;
      expect(o).toMatchObject({ courses: 2, published: 2, packages: 2, certificates: 1, paths: 1, openReports: 0 });
      expect(o.itemsByKind.scorm).toBe(2);
      const ev = (await http().get('/v1/lms/reports/evidence').set(as('principal')).expect(200)).body;
      // teacher, teacher2 (no course) and any head of department: the teacher uses the LMS.
      const mine = ev.rows.find((r: { userId: string }) => r.userId === t.teacher.id);
      expect(mine).toMatchObject({ courses: 2, published: 2, quizzes: 2, live: 1, usesLms: true });
      expect(ev.teachersUsingLms).toBe(1);
      const csvText = (await http().get('/v1/lms/reports/evidence?format=csv').set(as('principal')).expect(200)).text;
      expect(csvText).toContain('Percentage (NAAC 2.3.2)');
      await http().get('/v1/lms/reports/evidence?from=yesterday').set(as('principal')).expect(400);
      const sum = (await http().get(`/v1/lms/students/${t.students[0].id}/summary`).set(as('parent')).expect(200)).body;
      expect(sum.courses.find((c: { courseId: string }) => c.courseId === courseId)).toMatchObject({ completionPct: 0, risk: { level: 'medium' } });
      await http().get(`/v1/lms/students/${t.students[2].id}/summary`).set(as('parent')).expect(404);
    });

    it('marks an assignment by rubric and flags a copied hand-in', async () => {
      const rubric = (await http().post('/v1/assessment-tools/rubrics').set(as('principal')).send({ name: 'Case analysis', criteria: [{ name: 'Analysis', levels: [{ label: 'Weak', points: 1 }, { label: 'Good', points: 3 }, { label: 'Strong', points: 4 }] }, { name: 'Format', levels: [{ label: 'Poor', points: 1 }, { label: 'Neat', points: 2 }] }] }).expect(201)).body;
      const hw = (await http().post('/v1/homework').set(as('teacher')).send({ sectionId: t.section.id, subjectId: t.subject.id, title: 'Goodwill case', dueOn: new Date(start.getTime() + 5.5 * 3600_000 + 2 * 86_400_000).toISOString().slice(0, 10) }).expect(201)).body.id;
      await http().put(`/v1/homework/${hw}/settings`).set(as('teacher')).send({ maxMarks: 20, rubricId: rubric.id }).expect(200);
      const essay = 'the goodwill of the firm is valued at three years purchase of the average super profit of the last five years after adjusting abnormal items';
      await owner.query(`insert into homework_submissions (tenant_id, homework_id, student_id, text, submitted_by, submitted_at) values ($1, $2, $3, $4, $5, now())`, [t.tenantId, hw, t.students[0].id, essay, t.guardian.id]);
      await http().post(`/v1/homework/${hw}/submissions/${t.students[2].id}`).set(as('student')).field('text', `${essay} as required`).expect(200);
      const subs = (await http().get(`/v1/homework/${hw}/submissions`).set(as('teacher')).expect(200)).body.students;
      expect(Number(subs.find((s: { studentId: string }) => s.studentId === t.students[2].id).similarityPct)).toBe(100);
      expect(Number(subs.find((s: { studentId: string }) => s.studentId === t.students[0].id).similarityPct)).toBeGreaterThan(90);
      const { rows } = await owner.query(`select count(*)::int as n from domain_events where tenant_id = $1 and type = 'homework.similarity_flagged'`, [t.tenantId]);
      expect(rows[0].n).toBe(1);
      await http().put(`/v1/homework/${hw}/rubric-marks`).set(as('teacher')).send({ studentId: t.students[1].id, selections: [1, 0] }).expect(409);
      await http().put(`/v1/homework/${hw}/rubric-marks`).set(as('teacher')).send({ studentId: t.students[2].id, selections: [1] }).expect(400);
      await http().put(`/v1/homework/${hw}/rubric-marks`).set(as('teacher2')).send({ studentId: t.students[2].id, selections: [1, 0] }).expect(403);
      // Good (3 of 4) and Neat (2 of 2): 5 of 6 points of 20 = 16.67.
      expect((await http().put(`/v1/homework/${hw}/rubric-marks`).set(as('teacher')).send({ studentId: t.students[2].id, selections: [1, 1] }).expect(200)).body).toMatchObject({ points: 5, maxPoints: 6, marks: 16.67 });
      expect((await http().get(`/v1/homework/${hw}/rubric`).set(as('teacher')).expect(200)).body.students.find((s: { studentId: string }) => s.studentId === t.students[2].id).selections).toEqual([1, 1]);
    });

    it('keeps another institution out of every new list', async () => {
      await http().get(`/v1/lms/courses/${courseId}/live`).set(as('outsider')).expect(404);
      await http().get(`/v1/lms/courses/${courseId}/forum/queue`).set(as('outsider')).expect(404);
      await http().get(`/v1/lms/courses/${courseId}/certificates`).set(as('outsider')).expect(404);
      expect((await http().get('/v1/lms/paths').set(as('outsider')).expect(200)).body).toEqual([]);
      expect((await http().get('/v1/lms/overview').set(as('outsider')).expect(200)).body).toMatchObject({ courses: 0, certificates: 0 });
      expect((await http().get('/v1/lms/settings').set(as('outsider')).expect(200)).body.settings.forumModeration).toBe('open');
    });
  });
});
