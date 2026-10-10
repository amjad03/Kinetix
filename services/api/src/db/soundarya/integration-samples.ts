/**
 * Samples for the integrations desk (migration 0125): sandbox settings without secrets, APAAR and ABC ids, attendance and card devices
 * with registered tags, a Moodle platform for LTI, and a few early-alert flags with reasons. Device keys are random and not kept.
 */
import { createHash, randomBytes } from 'node:crypto';
import type { Ctx } from './ctx.js';
import { J } from './kit.js';

export async function integrationSamples(c: Ctx): Promise<void> {
  const { kit: k } = c;
  const admin = c.byEmail.principal.id;
  await k.ins('integration_settings', [
    { key: 'digilocker', value: J({ baseUrl: 'https://sandbox.digilocker.example', clientId: 'soundarya-sandbox', issuerId: 'in.soundarya' }) },
    { key: 'nad', value: J({ baseUrl: 'https://sandbox.nad.example', institutionCode: 'SIMS-DEMO' }) },
  ], { returning: false });

  const digits = (n: number) => String(100000000000 + n * 7919).slice(0, 12);
  await k.ins('student_academic_ids', c.students.slice(0, 40).map((s, i) => ({ studentId: s.id, apaarId: digits(i + 1), abcId: i % 5 === 0 ? null : digits(i + 500), source: 'admission' })), { returning: false });

  const key = () => createHash('sha256').update(randomBytes(24)).digest('hex');
  const devices = await k.ins<{ id: string }>('access_devices', [
    { kind: 'biometric', vendor: 'essl', serial: 'ESSL-GATE-1', name: 'Main gate fingerprint', purpose: 'attendance', location: 'Main gate', keyHash: key(), createdBy: admin, lastSeenAt: new Date() },
    { kind: 'rfid_reader', vendor: 'generic', serial: 'RF-LIB-1', name: 'Library issue desk', purpose: 'library', location: 'Library', keyHash: key(), createdBy: admin },
    { kind: 'rfid_reader', vendor: 'generic', serial: 'RF-STAFF-1', name: 'Staff room reader', purpose: 'board_signin', location: 'Staff room', keyHash: key(), createdBy: admin },
  ]);
  void devices;
  await k.ins('credential_tags', [
    ...c.students.slice(0, 10).map((s, i) => ({ kind: 'rfid', value: `CARD-${1000 + i}`, subjectType: 'student', subjectId: s.id })),
    ...c.teachers.slice(0, 3).map((t, i) => ({ kind: 'biometric_pin', value: String(9001 + i), subjectType: 'staff', subjectId: t.id })),
  ], { returning: false });

  await k.ins('lti_platforms', [{ name: 'Moodle (sample)', issuer: 'https://moodle.sample.example', clientId: 'kinetix-sample', authUrl: 'https://moodle.sample.example/mod/lti/auth.php', jwksUrl: 'https://moodle.sample.example/mod/lti/certs.php' }], { returning: false });

  const reasons = [
    [{ signal: 'attendance', detail: 'Attendance 58% in the last 30 days', points: 40 }, { signal: 'marks', detail: 'Average 38% in the latest published results', points: 35 }],
    [{ signal: 'assignments', detail: '60% of homework not submitted', points: 20 }, { signal: 'fees', detail: 'Fees overdue for 45 days', points: 20 }],
    [{ signal: 'attendance', detail: 'Attendance 72% in the last 30 days', points: 30 }],
  ];
  const levels: [string, number][] = [['high', 75], ['medium', 40], ['watch', 30]];
  await k.ins('early_alert_flags', reasons.map((r, i) => ({ studentId: c.students[50 + i].id, level: levels[i][0], score: levels[i][1], reasons: J(r), status: i === 0 ? 'in_progress' : 'open', mentorUserId: c.teachers[0]?.id ?? null })), { returning: false });
}
