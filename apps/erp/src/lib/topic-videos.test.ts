import { describe, expect, it } from 'vitest';
import { canRequestShare, countsByTopic, pendingTotal, sourceLabel, splitByScope, statusLabel, uniqueClasses } from './topic-videos';
import type { ManagedVideo } from './types';

const v = (o: Partial<ManagedVideo>): ManagedVideo =>
  ({ id: 'i', source: 'teacher', shareStatus: 'none', position: 1, topicId: 't', youtubeVideoId: 'x', title: 'T', language: 'en', durationSeconds: null, channelTitle: null, reviewReason: null, sectionIds: [], sections: [], createdBy: null, createdByName: null, topicTitle: '', createdAt: '', ...o }) as ManagedVideo;

describe('topic videos', () => {
  it('lets a teacher ask for sharing until it is pending or approved', () => {
    expect(canRequestShare(v({ shareStatus: 'none' }))).toBe(true);
    expect(canRequestShare(v({ shareStatus: 'rejected' }))).toBe(true);
    expect(canRequestShare(v({ shareStatus: 'pending' }))).toBe(false);
    expect(canRequestShare(v({ shareStatus: 'approved' }))).toBe(false);
    expect(canRequestShare(v({ source: 'institution' }))).toBe(false);
  });

  it('names sources and statuses with messages', () => {
    expect(sourceLabel('teacher')).toBe('tv.source.teacher');
    expect(statusLabel('pending')).toBe('tv.status.pending');
  });

  it('totals pending videos and indexes counts by topic', () => {
    const counts = [
      { topicId: 'a', institution: 1, teacher: 2, pending: 1 },
      { topicId: 'b', institution: 0, teacher: 1, pending: 2 },
    ];
    expect(pendingTotal(counts)).toBe(3);
    expect(countsByTopic(counts).b.teacher).toBe(1);
  });

  it('splits by scope in display order and lists each class once', () => {
    const s = splitByScope([v({ id: 'b', position: 2 }), v({ id: 'a', position: 1 }), v({ id: 'c', source: 'institution' })]);
    expect(s.teacher.map((x) => x.id)).toEqual(['a', 'b']);
    expect(s.institution.map((x) => x.id)).toEqual(['c']);
    expect(uniqueClasses([{ section: { id: '1', displayName: 'A' } }, { section: { id: '1', displayName: 'A' } }, { section: { id: '2', displayName: 'B' } }])).toEqual([
      { id: '1', displayName: 'A' },
      { id: '2', displayName: 'B' },
    ]);
  });
});
