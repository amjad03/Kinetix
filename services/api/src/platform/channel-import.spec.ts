import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ANIMATIONS } from '../content/animations.js';
import { AiGate } from '../ai/gate.js';
import { erpOnlyPath, publicSlugOf } from '../institution/edition.js';
import { bestTopicFor, topicMatch } from './matching.js';
import { channelIdFromHtml, parseChannelRef, parseVideoFeed, YouTube } from './youtube.js';

const FIX = join(__dirname, '..', '..', 'test', 'fixtures', 'youtube');
const feedXml = readFileSync(join(FIX, 'channel-feed.xml'), 'utf8');
const pageHtml = readFileSync(join(FIX, 'channel-page.html'), 'utf8');
const CH = 'UCabcdefghijklmnopqrstuv';

/** A fetch that answers from fixtures by URL prefix and records what was asked; no network. */
function fakeFetch(routes: [string, { status?: number; body: string }][]) {
  const asked: string[] = [];
  const fn = (async (input: string | URL) => {
    const url = String(input);
    asked.push(url);
    const hit = routes.find(([prefix]) => url.startsWith(prefix));
    if (!hit) return new Response('not found', { status: 404 });
    return new Response(hit[1].body, { status: hit[1].status ?? 200 });
  }) as typeof fetch;
  return { fn, asked };
}

describe('YouTube channel import', () => {
  it('reads channel links, handles and ids', () => {
    expect(parseChannelRef(CH)).toEqual({ kind: 'id', id: CH });
    expect(parseChannelRef('@ZynetixLearning')).toEqual({ kind: 'handle', handle: '@ZynetixLearning' });
    expect(parseChannelRef('https://www.youtube.com/@ZynetixLearning/videos')).toEqual({ kind: 'handle', handle: '@ZynetixLearning' });
    expect(parseChannelRef(`youtube.com/channel/${CH}`)).toEqual({ kind: 'id', id: CH });
    expect(parseChannelRef('https://m.youtube.com/user/zynetix')).toEqual({ kind: 'user', name: 'zynetix' });
    expect(parseChannelRef('https://www.youtube.com/c/Zynetix')).toEqual({ kind: 'custom', name: 'Zynetix' });
    expect(parseChannelRef('https://www.youtube.com/watch?v=AAAAAAAAAA1')).toBeNull();
    expect(parseChannelRef('https://example.com/@someone')).toBeNull();
    expect(parseChannelRef('not a channel')).toBeNull();
  });

  it('parses the public feed and a channel page', () => {
    const feed = parseVideoFeed(feedXml);
    expect(feed.title).toBe('Zynetix Learning');
    expect(feed.videos).toEqual([
      { videoId: 'AAAAAAAAAA1', title: 'Share Capital & Issue of Shares | Corporate Accounting', position: 0, channelTitle: 'Zynetix Learning', publishedAt: '2026-09-01T10:00:00+00:00' },
      { videoId: 'BBBBBBBBBB2', title: 'Underwriting of Shares explained', position: 1, channelTitle: 'Zynetix Learning', publishedAt: '2026-08-20T10:00:00+00:00' },
    ]);
    expect(channelIdFromHtml(pageHtml)).toBe(CH);
    expect(channelIdFromHtml('<html></html>')).toBeNull();
  });

  it('without an API key, resolves a handle from its page and lists the feed', async () => {
    const f = fakeFetch([
      ['https://www.youtube.com/@ZynetixLearning', { body: pageHtml }],
      [`https://www.youtube.com/feeds/videos.xml?channel_id=${CH}`, { body: feedXml }],
    ]);
    const r = await new YouTube(undefined, f.fn).sourceVideos('https://www.youtube.com/@ZynetixLearning');
    expect(r).toMatchObject({ source: { kind: 'channel', id: CH, title: 'Zynetix Learning' }, via: 'feed' });
    expect(r!.videos.map((v) => v.videoId)).toEqual(['AAAAAAAAAA1', 'BBBBBBBBBB2']);
    expect(f.asked.some((u) => u.includes('googleapis'))).toBe(false);
  });

  it('without an API key, lists a playlist from its feed', async () => {
    const f = fakeFetch([['https://www.youtube.com/feeds/videos.xml?playlist_id=PLzynetix123456', { body: feedXml }]]);
    const r = await new YouTube(undefined, f.fn).sourceVideos('https://www.youtube.com/playlist?list=PLzynetix123456');
    expect(r).toMatchObject({ source: { kind: 'playlist', id: 'PLzynetix123456' }, via: 'feed' });
    expect(r!.videos).toHaveLength(2);
  });

  it('with an API key, lists every upload of the channel through the Data API', async () => {
    const f = fakeFetch([
      ['https://www.googleapis.com/youtube/v3/channels?', { body: JSON.stringify({ items: [{ id: CH, snippet: { title: 'Zynetix Learning' }, contentDetails: { relatedPlaylists: { uploads: 'UUabcdefghijklmnopqrstuv' } } }] }) }],
      [
        'https://www.googleapis.com/youtube/v3/playlistItems?',
        { body: JSON.stringify({ items: [1, 2, 3].map((n) => ({ snippet: { title: `Video ${n}`, position: n - 1 }, contentDetails: { videoId: `CCCCCCCCCC${n}` }, status: { privacyStatus: 'public' } })) }) },
      ],
    ]);
    const r = await new YouTube('key', f.fn).sourceVideos('@ZynetixLearning');
    expect(r).toMatchObject({ source: { kind: 'channel', id: CH, title: 'Zynetix Learning' }, via: 'api' });
    expect(r!.videos.map((v) => v.videoId)).toEqual(['CCCCCCCCCC1', 'CCCCCCCCCC2', 'CCCCCCCCCC3']);
    expect(f.asked[0]).toContain('forHandle=%40ZynetixLearning');
    expect(f.asked[1]).toContain('playlistId=UUabcdefghijklmnopqrstuv');
  });

  it('says when it is not a channel or playlist link', async () => {
    expect(await new YouTube(undefined, fakeFetch([]).fn).sourceVideos('https://www.youtube.com/watch?v=AAAAAAAAAA1')).toBeNull();
  });

  it('suggests topics by title across a course', () => {
    const tps = [
      { id: 'issue', title: 'Issue of Shares', summary: 'Share capital, premium and calls' },
      { id: 'underwriting', title: 'Underwriting of Shares', summary: '' },
      { id: 'redemption', title: 'Redemption of Preference Shares', summary: '' },
    ];
    expect(topicMatch('Share Capital & Issue of Shares | Corporate Accounting', tps)).toEqual({ id: 'issue', score: 5 });
    expect(bestTopicFor('Underwriting of Shares explained', tps)).toBe('underwriting');
    expect(topicMatch('Lecture 1 introduction', tps)).toBeNull();
  });
});

describe('board edition routes', () => {
  it('marks ERP-only modules and leaves board modules open', () => {
    for (const p of ['/v1/fees/invoices', '/v1/hostel/blocks', '/v1/hr/staff', '/v1/payroll/runs', '/v1/admissions', '/v1/books/daybook', '/v1/public/admissions/sdmcet', '/v1/admin/payments/gateway', '/v1/parent/children/abc/bank-transfers']) {
      expect(erpOnlyPath(p), p).toBe(true);
    }
    for (const p of ['/v1/me', '/v1/timetable/today', '/v1/topics/x/resources', '/v1/devices/compute', '/v1/ai/admin/logs', '/v1/admin/teachers', '/v1/content/courses', '/v1/quiz-games', '/v1/parent/children/abc/diary', '/v1/feedback']) {
      expect(erpOnlyPath(p), p).toBe(false);
    }
    expect(publicSlugOf('/v1/public/admissions/sdmcet?x=1')).toBe('sdmcet');
  });
});

describe('AI concurrency gate', () => {
  it('lets max requests run, queues the next and refuses it after the wait', async () => {
    const gate = new AiGate(1, 30);
    const first = await gate.acquire();
    expect(first).toBeTypeOf('function');
    expect(await gate.acquire()).toBeNull(); // waited 30 ms, nothing freed up
    const waiting = gate.acquire();
    expect(gate.load).toEqual({ running: 1, waiting: 1, max: 1 });
    first!();
    const second = await waiting;
    expect(second).toBeTypeOf('function');
    second!();
    second!(); // releasing twice frees one slot only
    expect(gate.load).toEqual({ running: 0, waiting: 0, max: 1 });
    expect(await new AiGate(1, 0).acquire()).toBeTypeOf('function');
  });
});

describe('built-in animations', () => {
  it('matches the kinetix_animations catalogue', () => {
    const dir = join(__dirname, '..', '..', '..', '..', 'packages', 'kinetix_animations', 'lib', 'src', 'anims');
    const ids = readdirSync(dir).flatMap((f) => [...readFileSync(join(dir, f), 'utf8').matchAll(/^ {2}id: '([a-z0-9-]+)'/gm)].map((m) => m[1]));
    expect(Object.keys(ANIMATIONS).sort()).toEqual(ids.sort());
  });
});
