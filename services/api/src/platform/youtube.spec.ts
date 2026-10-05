import { describe, expect, it } from 'vitest';
import { byLanguage } from '../content/concept-videos.service.js';
import { bestTopicFor } from './matching.js';
import { isoDurationSeconds, parsePlaylistId, parseYouTubeId, PlaylistsUnavailableError, YouTube } from './youtube.js';

const ID = 'dQw4w9WgXcQ';

/** A fetch that answers from a table of URL prefixes (and records what was asked). */
function fakeFetch(routes: [string, unknown, number?][]) {
  const calls: string[] = [];
  const fn = (async (input: string | URL) => {
    const url = String(input);
    calls.push(url);
    const hit = routes.find(([prefix]) => url.startsWith(prefix));
    if (!hit) throw new TypeError('fetch failed');
    return new Response(JSON.stringify(hit[1]), { status: hit[2] ?? 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  return { fn, calls };
}

describe('YouTube links', () => {
  it('finds the video id in every link form people paste', () => {
    for (const link of [
      `https://www.youtube.com/watch?v=${ID}`,
      `https://youtube.com/watch?feature=share&v=${ID}&t=42s`,
      `http://m.youtube.com/watch?v=${ID}`,
      `https://music.youtube.com/watch?v=${ID}&list=PL123`,
      `https://youtu.be/${ID}?si=abc`,
      `youtu.be/${ID}`,
      `https://www.youtube.com/shorts/${ID}`,
      `https://www.youtube.com/embed/${ID}?rel=0`,
      `https://www.youtube-nocookie.com/embed/${ID}`,
      `https://www.youtube.com/live/${ID}`,
      `  ${ID}  `,
    ]) {
      expect(parseYouTubeId(link), link).toBe(ID);
    }
  });

  it('refuses links that are not one YouTube video', () => {
    for (const link of ['', 'hello', 'https://vimeo.com/123456', `https://example.com/watch?v=${ID}`, 'https://www.youtube.com/watch?v=short', 'https://www.youtube.com/playlist?list=PLabcdefghij', 'https://www.youtube.com/@kinetix']) {
      expect(parseYouTubeId(link), link).toBeNull();
    }
  });

  it('finds playlist ids', () => {
    expect(parsePlaylistId('https://www.youtube.com/playlist?list=PLx0sYbCqOb8TBPRdmBHs5Iftvv9TPboYG')).toBe('PLx0sYbCqOb8TBPRdmBHs5Iftvv9TPboYG');
    expect(parsePlaylistId(`https://www.youtube.com/watch?v=${ID}&list=PLabcdefghij`)).toBe('PLabcdefghij');
    expect(parsePlaylistId('PLabcdefghij')).toBe('PLabcdefghij');
    expect(parsePlaylistId(`https://youtu.be/${ID}`)).toBeNull();
    expect(parsePlaylistId('https://example.com/?list=PLabcdefghij')).toBeNull();
  });

  it('reads ISO 8601 durations', () => {
    expect(isoDurationSeconds('PT4M13S')).toBe(253);
    expect(isoDurationSeconds('PT1H2M')).toBe(3720);
    expect(isoDurationSeconds('P0D')).toBeNull();
    expect(isoDurationSeconds('soon')).toBeNull();
  });
});

describe('YouTube client', () => {
  it('gets the title from oEmbed without a key, and gives up quietly when offline', async () => {
    const yt = new YouTube(undefined, fakeFetch([['https://www.youtube.com/oembed', { title: 'Goodwill in 5 minutes', author_name: 'KINETIX' }]]).fn);
    expect(await yt.videoInfo(ID)).toEqual({ title: 'Goodwill in 5 minutes', channelTitle: 'KINETIX', durationSeconds: null });
    expect(await new YouTube(undefined, fakeFetch([]).fn).videoInfo(ID)).toBeNull();
    expect(await new YouTube(undefined, fakeFetch([['https://www.youtube.com/oembed', {}, 404]]).fn).videoInfo(ID)).toBeNull();
  });

  it('with a key, reads durations and pages through a playlist, skipping private videos', async () => {
    const f = fakeFetch([
      ['https://www.googleapis.com/youtube/v3/videos', { items: [{ id: ID, snippet: { title: 'Goodwill', channelTitle: 'KINETIX' }, contentDetails: { duration: 'PT5M' } }] }],
      [
        'https://www.googleapis.com/youtube/v3/playlistItems?part=snippet%2CcontentDetails%2Cstatus&playlistId=PLabcdefghij&maxResults=50&key=k&pageToken=p2',
        { items: [{ snippet: { title: 'Third', position: 2 }, contentDetails: { videoId: 'ccccccccccc' } }] },
      ],
      [
        'https://www.googleapis.com/youtube/v3/playlistItems',
        {
          nextPageToken: 'p2',
          items: [
            { snippet: { title: 'First', position: 0, videoOwnerChannelTitle: 'KINETIX' }, contentDetails: { videoId: 'aaaaaaaaaaa' } },
            { snippet: { title: 'Private video', position: 1 }, contentDetails: { videoId: 'bbbbbbbbbbb' }, status: { privacyStatus: 'private' } },
          ],
        },
      ],
    ]);
    const yt = new YouTube('k', f.fn);
    expect(yt.canListPlaylists).toBe(true);
    expect(await yt.videoInfo(ID)).toEqual({ title: 'Goodwill', channelTitle: 'KINETIX', durationSeconds: 300 });
    expect((await yt.playlistVideos('PLabcdefghij')).map((v) => [v.videoId, v.title, v.position])).toEqual([
      ['aaaaaaaaaaa', 'First', 0],
      ['ccccccccccc', 'Third', 2],
    ]);
    await expect(new YouTube(undefined).playlistVideos('PLabcdefghij')).rejects.toBeInstanceOf(PlaylistsUnavailableError);
  });
});

describe('matching and ordering', () => {
  const topics = [
    { id: 'meaning', title: 'Meaning and nature of goodwill', summary: 'Why goodwill arises' },
    { id: 'methods', title: 'Methods of valuing goodwill', summary: 'Average profit, super profit and capitalisation methods' },
    { id: 'shares', title: 'Valuation of shares', summary: 'Net assets and yield methods' },
  ];

  it('guesses the topic of a playlist video from its title', () => {
    expect(bestTopicFor('Super profit method | Valuation of goodwill | KINETIX', topics)).toBe('methods');
    expect(bestTopicFor('What is goodwill? Meaning and nature', topics)).toBe('meaning');
    expect(bestTopicFor('Share valuation: yield method explained', topics)).toBe('shares');
    expect(bestTopicFor('KINETIX channel trailer', topics)).toBeNull();
  });

  it("puts the class's language first, then English, then the rest", () => {
    const v = (id: string, language: 'en' | 'hi' | 'kn', position: number) => ({ id, language, position });
    const videos = [v('en2', 'en', 2), v('hi1', 'hi', 1), v('kn3', 'kn', 3), v('en1', 'en', 0), v('kn1', 'kn', 4)];
    expect(byLanguage(videos, 'kn').map((x) => x.id)).toEqual(['kn3', 'kn1', 'en1', 'en2', 'hi1']);
    expect(byLanguage(videos, 'en').map((x) => x.id)).toEqual(['en1', 'en2', 'hi1', 'kn3', 'kn1']);
  });
});
