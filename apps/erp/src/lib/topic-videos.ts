// Syllabus › Topic videos: pure helpers for the institution's and teachers' concept videos (unit-tested).

import type { MessageKey } from '@/i18n/messages';
import type { ManagedVideo, ShareStatus, TopicVideoCount, VideoSource } from './types';

const SOURCE: Record<VideoSource, MessageKey> = { platform: 'tv.source.platform', institution: 'tv.source.institution', teacher: 'tv.source.teacher' };
const STATUS: Record<ShareStatus, MessageKey> = { none: 'tv.status.none', pending: 'tv.status.pending', approved: 'tv.status.approved', rejected: 'tv.status.rejected' };

export const sourceLabel = (s: VideoSource): MessageKey => SOURCE[s];
export const statusLabel = (s: ShareStatus): MessageKey => STATUS[s];

/** A teacher's video can be offered to the whole institution until it is pending or approved. */
export function canRequestShare(v: Pick<ManagedVideo, 'source' | 'shareStatus'>): boolean {
  return v.source === 'teacher' && (v.shareStatus === 'none' || v.shareStatus === 'rejected');
}

/** How many videos wait for the principal across a course's topics. */
export function pendingTotal(counts: readonly TopicVideoCount[]): number {
  return counts.reduce((n, c) => n + c.pending, 0);
}

/** A course's counts by topic id. */
export function countsByTopic(counts: readonly TopicVideoCount[]): Record<string, TopicVideoCount> {
  return Object.fromEntries(counts.map((c) => [c.topicId, c]));
}

/** The institution's videos and the teachers' videos of a topic, each in the order they are shown. */
export function splitByScope(videos: readonly ManagedVideo[]): { institution: ManagedVideo[]; teacher: ManagedVideo[] } {
  const byPos = (a: ManagedVideo, b: ManagedVideo) => a.position - b.position;
  return { institution: videos.filter((v) => v.source === 'institution').sort(byPos), teacher: videos.filter((v) => v.source === 'teacher').sort(byPos) };
}

/** The classes a teacher teaches, once each, from GET /v1/teacher/classes. */
export function uniqueClasses(rows: readonly { section: { id: string; displayName: string } }[]): { id: string; displayName: string }[] {
  const seen = new Map<string, string>();
  for (const r of rows) seen.set(r.section.id, r.section.displayName);
  return [...seen].map(([id, displayName]) => ({ id, displayName }));
}
