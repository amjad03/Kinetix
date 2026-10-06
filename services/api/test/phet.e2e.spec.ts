import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ENV, loadEnv } from '../src/config/env.js';
import { PHET_ATTRIBUTION } from '../src/content/phet.controller.js';
import { createApp, FixedClock } from './helpers.js';

describe('PhET sims', () => {
  const clock = new FixedClock(new Date());
  let mirrored: INestApplication;
  let demo: INestApplication;

  beforeAll(async () => {
    mirrored = await createApp(clock, (b) => b.overrideProvider(ENV).useValue(loadEnv({ ...process.env, PHET_MIRROR_URL: 'https://mirror.example.in/phet/' })));
    demo = await createApp(clock, (b) => b.overrideProvider(ENV).useValue(loadEnv({ ...process.env, PHET_MIRROR_URL: undefined })));
  });

  afterAll(async () => {
    await mirrored?.close();
    await demo?.close();
  });

  it('redirects to the mirror in India, in the asked locale, without signing in', async () => {
    const res = await request(mirrored.getHttpServer()).get('/v1/content/sims/phet/forces-and-motion-basics?locale=hi').expect(302);
    expect(res.headers.location).toBe('https://mirror.example.in/phet/forces-and-motion-basics/forces-and-motion-basics_all.html?locale=hi');
    expect(res.headers['cache-control']).toContain('max-age');
  });

  it('answers with the link as JSON, English by default', async () => {
    const res = await request(mirrored.getHttpServer()).get('/v1/content/sims/phet/ohms-law?format=json').expect(200);
    expect(res.body).toEqual({
      id: 'ohms-law',
      locale: 'en',
      url: 'https://mirror.example.in/phet/ohms-law/ohms-law_all.html?locale=en',
      mirror: true,
      attribution: PHET_ATTRIBUTION,
    });
  });

  it('falls back to phet.colorado.edu without PHET_MIRROR_URL', async () => {
    const res = await request(demo.getHttpServer()).get('/v1/content/sims/phet/ohms-law?locale=kn&format=json').expect(200);
    expect(res.body.url).toBe('https://phet.colorado.edu/sims/html/ohms-law/latest/ohms-law_all.html?locale=kn');
    expect(res.body.mirror).toBe(false);
    await request(demo.getHttpServer()).get('/v1/content/sims/phet/ohms-law').expect(302).expect('location', /^https:\/\/phet\.colorado\.edu\//);
  });

  it('refuses odd ids and locales (no open redirect)', async () => {
    for (const path of ['Ohms_Law', 'a--b', '-x', '..%2Fevil', `${'a'.repeat(81)}`]) {
      await request(mirrored.getHttpServer()).get(`/v1/content/sims/phet/${path}`).expect(400);
    }
    await request(mirrored.getHttpServer()).get('/v1/content/sims/phet/ohms-law?locale=hi%26x=1').expect(400);
    await request(mirrored.getHttpServer()).get('/v1/content/sims/phet/ohms-law?locale=//evil.com').expect(400);
  });
});
