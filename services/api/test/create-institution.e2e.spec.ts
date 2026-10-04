import type { INestApplication } from '@nestjs/common';
import { drizzle } from 'drizzle-orm/node-postgres';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createInstitution, parseArgs, SlugTakenError, UsageError } from '../src/db/create-institution.js';
import * as s from '../src/db/schema.js';
import { createApp, FixedClock, ownerPool } from './helpers.js';

describe('create-institution', () => {
  const owner = ownerPool();
  const db = drizzle(owner, { schema: s });
  let app: INestApplication;
  const http = () => request(app.getHttpServer());
  const slug = `inst-${Math.random().toString(36).slice(2, 8)}`;
  const argv = (extra: string[] = []) => [
    '--slug', slug, '--name', 'Sri Vidya College', '--kind', 'college', '--timezone', 'Asia/Kolkata', '--campus', 'Main Campus', '--city', 'Mysuru',
    '--year-label', '2026-27', '--year-start', '2026-06-01', '--year-end', '2027-03-31', '--admin-name', 'Admin Office', '--admin-email', 'Office@SriVidya.example.in', ...extra,
  ];

  beforeAll(async () => {
    app = await createApp(new FixedClock(new Date()));
  });

  afterAll(async () => {
    await app.close();
    await owner.end();
  });

  it('checks its arguments', () => {
    expect(parseArgs(argv(['--admin-phone', '98450 12345']))).toMatchObject({ slug, kind: 'college', campus: 'Main Campus', city: 'Mysuru', adminEmail: 'office@srividya.example.in', adminPhone: '+919845012345', otpOnly: false });
    expect(parseArgs([...argv(), '--campus=North Campus']).campus).toBe('North Campus');
    expect(() => parseArgs(argv(['--kind', 'academy']))).toThrow(UsageError);
    expect(() => parseArgs(argv(['--slug', 'Bad Slug']))).toThrow(/--slug/);
    expect(() => parseArgs(argv(['--year-end', '2026-01-01']))).toThrow(/after/);
    expect(() => parseArgs(argv(['--timezone', 'Mars/Olympus']))).toThrow(/time zone/);
    expect(() => parseArgs(argv(['--otp-only']))).toThrow(/--admin-phone/);
    expect(() => parseArgs(['--slug', slug])).toThrow(/required/);
    expect(() => parseArgs(argv(['--colour', 'blue']))).toThrow(/Unknown argument/);
  });

  it('creates the tenant, campus, current year and an administrator who can sign in once with the printed password', async () => {
    const r = await createInstitution(db, parseArgs(argv()));
    expect(r.password).toMatch(/^[A-Za-z2-9]{14}$/);
    expect(r.tenant).toMatchObject({ slug, name: 'Sri Vidya College', kind: 'college', timezone: 'Asia/Kolkata', settings: { liveViewEnabled: false, liveViewIndicator: true } });
    expect(r.year).toMatchObject({ label: '2026-27', isCurrent: true });
    const { rows: hashes } = await owner.query('select password_hash from users where id = $1', [r.admin.id]);
    expect(hashes[0].password_hash).toMatch(/^\$argon2/); // never stored in clear

    const login = await http().post('/v1/auth/login').send({ tenant: slug, login: 'office@srividya.example.in', password: r.password }).expect(201);
    expect(login.body.user.roles).toEqual(['tenant_admin']);
    const token = login.body.accessToken as string;
    const structure = await http().get('/v1/admin/structure').set('authorization', `Bearer ${token}`).expect(200);
    expect(structure.body.campuses).toEqual([{ id: r.campus.id, name: 'Main Campus' }]);
    // The administrator can import straight away: there is a current academic year.
    const dry = await http().post('/v1/admin/import/programs?dryRun=true').set('authorization', `Bearer ${token}`).set('content-type', 'text/csv').send('program,level,terms,term,section\nBA,ug,6,1,A\n').expect(200);
    expect(dry.body.totals).toMatchObject({ created: 1, error: 0 });
    const { rows } = await owner.query(`select action from audit_log where tenant_id = $1 and action = 'institution.created'`, [r.tenant.id]);
    expect(rows).toHaveLength(1);
  });

  it('refuses a slug that already exists and changes nothing', async () => {
    const before = (await owner.query('select count(*)::int as n from tenants')).rows[0].n;
    await expect(createInstitution(db, parseArgs(argv(['--name', 'Someone Else'])))).rejects.toThrow(SlugTakenError);
    expect((await owner.query('select count(*)::int as n from tenants')).rows[0].n).toBe(before);
    expect((await owner.query('select name from tenants where slug = $1', [slug])).rows[0].name).toBe('Sri Vidya College');
  });

  it('with --otp-only stores no password: the administrator signs in with a phone code', async () => {
    const otpSlug = `${slug}-otp`;
    const r = await createInstitution(db, parseArgs([...argv(['--slug', otpSlug]), '--admin-phone', '+919845000999', '--otp-only']));
    expect(r.password).toBeNull();
    expect(r.admin.passwordHash).toBeNull();
    expect(r.admin.phone).toBe('+919845000999');
    await http().post('/v1/auth/otp/request').send({ tenant: otpSlug, phone: '98450 00999' }).expect(202);
    const { rows } = await owner.query('select count(*)::int as n from otp_codes where tenant_id = $1', [r.tenant.id]);
    expect(rows[0].n).toBe(1);
  });
});
