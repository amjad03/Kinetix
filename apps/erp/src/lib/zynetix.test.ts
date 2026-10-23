import { describe, expect, it } from 'vitest';
import { NAV_GROUPS, visibleGroups } from './nav';
import {
  aiKeyProblem,
  aiLogQuery,
  aiSourceKey,
  CLAUDE_MODELS,
  bucketLabel,
  allowedInBoardEdition,
  bookRange,
  computeSeries,
  coverage,
  editionRedirect,
  importItems,
  initialMapping,
  looksLikeYoutubeSource,
  materialProblem,
  moveItem,
  toggleAudience,
  topTopics,
  type AiLogItem,
  type ComputeUsage,
  type SubjectOutline,
  type YoutubePreview,
} from './zynetix';

const hrefs = (edition: 'full' | 'board', platform = false) => visibleGroups(['principal'], platform, [], 'all', edition).flatMap((g) => g.items.map((i) => i.href));

describe('board edition', () => {
  it('shows only the Zynetix pages, the timetable and subjects and topics', () => {
    const groups = visibleGroups(['principal'], false, [], 'all', 'board');
    expect(groups.map((g) => g.id)).toEqual(['zynetix']);
    expect(hrefs('board')).toEqual(['/zynetix', '/zynetix/library', '/zynetix/youtube', '/zynetix/programs', '/timetable', '/syllabus', '/topic-videos', '/zynetix/teachers', '/zynetix/boards', '/zynetix/updates', '/zynetix/panel-home', '/zynetix/ai-log', '/zynetix/ai-settings', '/zynetix/integrations']);
    expect(hrefs('board', true)).toContain('/platform/zynetix');
  });

  it('ignores the workspace in the board edition', () => {
    expect(visibleGroups(['principal'], false, [], 'finance_ops', 'board').flatMap((g) => g.items).length).toBe(14);
  });

  it('adds a Zynetix group to the full ERP without repeating pages', () => {
    const all = hrefs('full');
    expect(all).toContain('/fees');
    expect(all).toContain('/zynetix/ai-log');
    expect(new Set(all).size).toBe(all.length);
    expect(NAV_GROUPS.find((g) => g.id === 'zynetix')!.items.every((i) => i.href.startsWith('/zynetix') || i.href.startsWith('/platform'))).toBe(true);
  });

  it('keeps Zynetix pages from roles without the dashboard', () => {
    expect(visibleGroups(['librarian'], false, [], 'all', 'board')).toEqual([]);
  });

  it('sends ERP pages to the overview in the board edition only', () => {
    expect(editionRedirect('board', '/fees')).toBe('/zynetix');
    expect(editionRedirect('board', '/')).toBe('/zynetix');
    expect(editionRedirect('board', '/zynetix/library?subject=1')).toBeNull();
    expect(editionRedirect('board', '/timetable')).toBeNull();
    expect(editionRedirect('board', '/account/security')).toBeNull();
    expect(editionRedirect('full', '/fees')).toBeNull();
    expect(editionRedirect('board', null)).toBeNull();
    expect(allowedInBoardEdition('/zynetixx')).toBe(false);
    expect(allowedInBoardEdition('/boards')).toBe(true);
    expect(allowedInBoardEdition('/devices')).toBe(true);
  });
});

describe('materials', () => {
  it('checks each kind like the API', () => {
    expect(materialProblem({ kind: 'pdf' })).toBe('zx.mat.needUrl');
    expect(materialProblem({ kind: 'pdf', url: 'ftp://x' })).toBe('zx.mat.badUrl');
    expect(materialProblem({ kind: 'pdf', url: 'https://x.in/a.pdf' })).toBeNull();
    expect(materialProblem({ kind: 'book' })).toBe('zx.mat.needTitle');
    expect(materialProblem({ kind: 'book', title: 'Hayt', pageFrom: 9, pageTo: 3 })).toBe('zx.mat.badPages');
    expect(materialProblem({ kind: 'animation' })).toBe('zx.mat.needAnimation');
    expect(materialProblem({ kind: 'sim', ref: 'pendulum' })).toBeNull();
    expect(materialProblem({ kind: 'model3d' })).toBe('zx.mat.needRefOrUrl');
    expect(materialProblem({ kind: 'link', url: 'https://a.b', audience: [] })).toBe('zx.mat.needAudience');
  });

  it('formats book ranges, toggles audiences and moves items', () => {
    expect(bookRange({ bookChapter: 'Ch 3', pageFrom: 41, pageTo: 58 })).toBe('Ch 3 · pp. 41–58');
    expect(bookRange({ bookChapter: null, pageFrom: 7, pageTo: 7 })).toBe('p. 7');
    expect(toggleAudience(['board', 'student'], 'board')).toEqual(['student']);
    expect(toggleAudience(['student'], 'student')).toEqual(['student']);
    expect(toggleAudience(['parent'], 'board')).toEqual(['board', 'parent']);
    expect(moveItem([1, 2, 3], 2, 1)).toEqual([1, 2, 3]);
    expect(moveItem([1, 2, 3], 1, -1)).toEqual([2, 1, 3]);
  });

  it('counts topics with any content once', () => {
    const topic = (id: string, v: number) => ({ id, title: id, own: false, counts: { videos: v, materials: 0, animations: 0 } });
    const o = (topics: ReturnType<typeof topic>[]): SubjectOutline => ({ subject: { id: 's', code: 'c', name: 'n', term: 1 }, course: { id: 'c', title: 't', chapters: [{ id: 'ch', title: 'ch', own: false, topics }] } });
    expect(coverage([o([topic('a', 1), topic('b', 0)]), o([topic('a', 1)])])).toEqual({ topics: 2, covered: 1, pct: 50 });
    expect(coverage([]).pct).toBeNull();
  });
});

describe('YouTube import', () => {
  const preview: YoutubePreview = {
    source: { kind: 'channel', id: 'UC1', title: 'Ch' },
    via: 'feed',
    topics: [{ id: 't1', title: 'Ohm', chapter: 'U1', course: 'C' }],
    videos: [
      { youtubeVideoId: 'v1', title: 'Ohm law', position: 0, publishedAt: null, suggestedTopicId: 't1', score: 2, alreadyOn: [] },
      { youtubeVideoId: 'v2', title: 'Vlog', position: 1, publishedAt: null, suggestedTopicId: null, score: 0, alreadyOn: [] },
      { youtubeVideoId: 'v3', title: 'Ohm again', position: 2, publishedAt: null, suggestedTopicId: 't1', score: 2, alreadyOn: ['t1'] },
    ],
  };
  it('ticks suggested videos not already on the topic, and imports the ticked ones', () => {
    const m = initialMapping(preview);
    expect(m).toEqual({ v1: { topicId: 't1', include: true }, v2: { topicId: '', include: false }, v3: { topicId: 't1', include: false } });
    expect(importItems(preview, { ...m, v2: { topicId: 't1', include: true } })).toEqual([
      { youtubeVideoId: 'v1', title: 'Ohm law', topicId: 't1' },
      { youtubeVideoId: 'v2', title: 'Vlog', topicId: 't1' },
    ]);
  });
  it('accepts channel links, handles, ids and playlists', () => {
    for (const s of ['@sdmcet', 'UCxxxxxxxxxxxxxxxxxxxxxx', 'https://www.youtube.com/@x', 'youtube.com/playlist?list=PL1']) expect(looksLikeYoutubeSource(s), s).toBe(true);
    expect(looksLikeYoutubeSource('https://vimeo.com/1')).toBe(false);
  });
});

describe('AI log and compute', () => {
  it('builds the API query from search params, dropping unknown values', () => {
    expect(aiLogQuery({ from: '2026-10-01', status: 'throttled', kind: 'explain', page: '2', userId: 'nope' })).toBe('from=2026-10-01&status=throttled&kind=explain&page=2');
    expect(aiLogQuery({ status: 'bogus', to: 'x' }, { bucket: 'hour' })).toBe('bucket=hour');
  });

  it('ranks topics by questions', () => {
    const item = (topic: { id: string; title: string } | null) => ({ topic }) as AiLogItem;
    expect(topTopics([item({ id: 'a', title: 'A' }), item({ id: 'b', title: 'B' }), item({ id: 'b', title: 'B' }), item(null)])).toEqual([
      { id: 'b', title: 'B', requests: 2 },
      { id: 'a', title: 'A', requests: 1 },
    ]);
  });

  it('averages compute load per bucket over devices', () => {
    const row = (deviceId: string, at: string, cpuAvg: number | null, aiInferences: number) => ({ deviceId, device: deviceId, at, samples: 1, cpuAvg, cpuMax: cpuAvg, gpuAvg: null, gpuMax: null, npuAvg: null, npuMax: null, ramAvg: 50, ramMax: 50, diskMax: null, cpuTempMax: null, gpuTempMax: null, aiInferences, aiInferenceMs: 0, aiAvgMs: null });
    const u: ComputeUsage = { from: '', to: '', timezone: 'Asia/Kolkata', bucket: 'hour', totals: { aiInferences: 0, aiInferenceMs: 0 }, rows: [row('a', '2026-10-21T05:00:00Z', 20, 3), row('b', '2026-10-21T05:00:00Z', 40, 1), row('a', '2026-10-21T04:00:00Z', null, 0)] };
    const s = computeSeries(u);
    expect(s.at).toEqual(['2026-10-21T04:00:00Z', '2026-10-21T05:00:00Z']);
    expect(s.labels).toEqual(['21 Oct, 09:30', '21 Oct, 10:30']);
    expect(s.cpu).toEqual([null, 30]);
    expect(s.gpu).toEqual([null, null]);
    expect(s.inferences).toEqual([0, 4]);
  });
});

describe('bucketLabel', () => {
  it('shows the API wall-clock buckets as written, and converts real instants to the zone', () => {
    expect(bucketLabel('2026-10-20T10:00', 'hour')).toBe('20 Oct, 10:00');
    expect(bucketLabel('2026-10-20T00:00', 'day')).toBe('20 Oct');
    expect(bucketLabel('2026-10-20T04:30:00Z', 'hour', 'Asia/Kolkata')).toBe('20 Oct, 10:00');
  });
});

describe('AI connection (Claude key)', () => {
  it('needs a key until one is saved, and rejects one that is too short or has spaces', () => {
    expect(aiKeyProblem('', false)).toBe('zx.aic.keyRequired');
    expect(aiKeyProblem('  ', true)).toBeNull();
    expect(aiKeyProblem('sk-ant-short', false)).toBe('zx.aic.keyShort');
    expect(aiKeyProblem('sk-ant-api03 with space-0123456789', false)).toBe('zx.aic.keyShort');
    expect(aiKeyProblem(' sk-ant-api03-0123456789abcdefWXYZ ', false)).toBeNull();
  });

  it('names where the AI comes from', () => {
    expect(aiSourceKey({ source: 'institution' })).toBe('zx.aic.status.institution');
    expect(aiSourceKey({ source: 'server' })).toBe('zx.aic.status.server');
    expect(aiSourceKey({ source: 'none' })).toBe('zx.aic.status.none');
    expect(CLAUDE_MODELS).toEqual(['claude-sonnet-5-5', 'claude-opus-5-5', 'claude-haiku-5-5']);
  });

  it('lists the AI settings page in the Zynetix menu', () => {
    expect(hrefs('full')).toContain('/zynetix/ai-settings');
  });
});
