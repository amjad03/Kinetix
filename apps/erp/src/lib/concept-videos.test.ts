import { describe, expect, it } from 'vitest';
import { coverage, filterChapters, formatDuration, importItems, initialChoices, isPlaylistLink, move, thumbnail, youtubeId } from './concept-videos';
import type { PlaylistPreview } from './types';

const ID = 'dQw4w9WgXcQ';

describe('youtubeId', () => {
  it('reads every link form and a bare id', () => {
    for (const link of [`https://www.youtube.com/watch?v=${ID}`, `https://youtu.be/${ID}?si=x`, `youtube.com/shorts/${ID}`, `https://www.youtube.com/embed/${ID}`, `https://www.youtube-nocookie.com/embed/${ID}`, `https://m.youtube.com/watch?v=${ID}&t=3`, ID]) {
      expect(youtubeId(link), link).toBe(ID);
    }
  });

  it('refuses other links', () => {
    for (const link of ['', 'https://vimeo.com/1', `https://example.com/watch?v=${ID}`, 'https://www.youtube.com/playlist?list=PLabcdefghij']) expect(youtubeId(link), link).toBeNull();
  });

  it('tells playlist links apart', () => {
    expect(isPlaylistLink('https://www.youtube.com/playlist?list=PLabcdefghij')).toBe(true);
    expect(isPlaylistLink(`https://youtu.be/${ID}`)).toBe(false);
    expect(isPlaylistLink('https://example.com/?list=PLabcdefghij')).toBe(false);
  });
});

describe('formatting', () => {
  it('formats durations and thumbnails', () => {
    expect(formatDuration(245)).toBe('4:05');
    expect(formatDuration(3723)).toBe('1:02:03');
    expect(formatDuration(null)).toBe('');
    expect(thumbnail(ID)).toBe(`https://i.ytimg.com/vi/${ID}/mqdefault.jpg`);
  });
});

describe('move', () => {
  it('moves an item up or down and stops at the ends', () => {
    expect(move(['a', 'b', 'c'], 2, -1)).toEqual(['a', 'c', 'b']);
    expect(move(['a', 'b', 'c'], 0, 1)).toEqual(['b', 'a', 'c']);
    expect(move(['a', 'b', 'c'], 0, -1)).toEqual(['a', 'b', 'c']);
    expect(move(['a', 'b', 'c'], 2, 1)).toEqual(['a', 'b', 'c']);
  });
});

describe('course tree', () => {
  const chapters = [
    { id: 'c1', title: 'Valuation of Goodwill', topics: [{ id: 't1', title: 'Methods of valuing goodwill', videos: 2 }, { id: 't2', title: 'Meaning of goodwill', videos: 0 }] },
    { id: 'c2', title: 'Valuation of Shares', topics: [{ id: 't3', title: 'Yield method', videos: 1 }] },
  ];

  it('counts topics with videos', () => {
    expect(coverage({ chapters })).toEqual({ topics: 3, withVideos: 2, videos: 3 });
  });

  it('filters by text (topic or chapter) and by missing videos', () => {
    expect(filterChapters(chapters, '', true)).toEqual([{ ...chapters[0], topics: [chapters[0].topics[1]] }]);
    expect(filterChapters(chapters, 'shares', false).map((c) => c.id)).toEqual(['c2']);
    expect(filterChapters(chapters, 'METHOD', false).flatMap((c) => c.topics.map((t) => t.id))).toEqual(['t1', 't3']);
    expect(filterChapters(chapters, 'yield', true)).toEqual([]);
  });
});

describe('playlist import', () => {
  const preview: PlaylistPreview = {
    playlistId: 'PLx',
    chapter: { id: 'c1', title: 'Valuation of Goodwill' },
    topics: [{ id: 't1', title: 'Methods of valuing goodwill' }],
    videos: [
      { youtubeVideoId: 'aaaaaaaaaaa', title: 'Super profit method', position: 0, durationSeconds: 300, suggestedTopicId: 't1', alreadyOn: [] },
      { youtubeVideoId: 'bbbbbbbbbbb', title: 'Average profit method', position: 1, durationSeconds: null, suggestedTopicId: 't1', alreadyOn: ['t1'] },
      { youtubeVideoId: 'ccccccccccc', title: 'Channel trailer', position: 2, durationSeconds: 60, suggestedTopicId: null, alreadyOn: [] },
    ],
  };

  it('starts from the suggestions, leaving out videos already on their topic and those without a match', () => {
    expect(initialChoices(preview)).toEqual({
      aaaaaaaaaaa: { include: true, topicId: 't1' },
      bbbbbbbbbbb: { include: false, topicId: 't1' },
      ccccccccccc: { include: false, topicId: '' },
    });
  });

  it('sends the chosen videos that have a topic', () => {
    const choices = { ...initialChoices(preview), ccccccccccc: { include: true, topicId: '' }, bbbbbbbbbbb: { include: true, topicId: 't1' } };
    expect(importItems(preview, choices)).toEqual([
      { youtubeVideoId: 'aaaaaaaaaaa', title: 'Super profit method', durationSeconds: 300, topicId: 't1' },
      { youtubeVideoId: 'bbbbbbbbbbb', title: 'Average profit method', durationSeconds: null, topicId: 't1' },
    ]);
  });
});
