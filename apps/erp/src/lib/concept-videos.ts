// Platform › Concept videos: helpers for the KINETIX platform team's pages (pure, unit-tested).

import type { PlatformCourseTree, PlaylistPreview } from './types';

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

/**
 * The YouTube video id in a pasted link (watch?v=, youtu.be, shorts, embed, live, nocookie) or a
 * bare id; null otherwise. The API parses links the same way (services/api/src/platform/youtube.ts);
 * the ERP uses this only to show the thumbnail while typing and to catch obvious mistakes.
 */
export function youtubeId(input: string): string | null {
  const text = input.trim();
  if (VIDEO_ID.test(text)) return text;
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase().replace(/^(www|m|music)\./, '');
  const parts = url.pathname.split('/').filter(Boolean);
  let id: string | null | undefined;
  if (host === 'youtu.be') id = parts[0];
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    if (parts[0] === 'watch' || parts.length === 0) id = url.searchParams.get('v');
    else if (['shorts', 'embed', 'live', 'v', 'e'].includes(parts[0])) id = parts[1];
  }
  return id && VIDEO_ID.test(id) ? id : null;
}

/** Whether a pasted link names a playlist (`list=`). */
export function isPlaylistLink(input: string): boolean {
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(input.trim()) ? input.trim() : `https://${input.trim()}`);
    return /(^|\.)(youtube\.com|youtu\.be)$/.test(url.hostname.toLowerCase()) && !!url.searchParams.get('list');
  } catch {
    return /^(PL|UU|OL)[A-Za-z0-9_-]{8,}$/.test(input.trim());
  }
}

/** YouTube's own thumbnail (i.ytimg.com, 320×180). */
export function thumbnail(id: string): string {
  return `https://i.ytimg.com/vi/${encodeURIComponent(id)}/mqdefault.jpg`;
}

/** The video on YouTube, for "Open on YouTube". */
export function watchUrl(id: string): string {
  return `https://www.youtube.com/watch?v=${encodeURIComponent(id)}`;
}

/** 4:05, or 1:02:03; empty when unknown. */
export function formatDuration(seconds: number | null | undefined): string {
  if (!seconds || seconds < 0) return '';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const ss = String(s).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/** The list with the item at `index` moved by `delta` (−1 up, +1 down); unchanged at the ends. */
export function move<T>(list: readonly T[], index: number, delta: number): T[] {
  const to = index + delta;
  if (index < 0 || index >= list.length || to < 0 || to >= list.length) return [...list];
  const out = [...list];
  const [item] = out.splice(index, 1);
  out.splice(to, 0, item);
  return out;
}

/** Topics in a course, and how many have at least one video. */
export function coverage(course: Pick<PlatformCourseTree, 'chapters'>): { topics: number; withVideos: number; videos: number } {
  const all = course.chapters.flatMap((c) => c.topics);
  return { topics: all.length, withVideos: all.filter((t) => t.videos > 0).length, videos: all.reduce((n, t) => n + t.videos, 0) };
}

/**
 * The course's chapters with only the topics that match `query` (topic or chapter title) and,
 * with `missingOnly`, have no videos yet. Chapters left without topics are dropped.
 */
export function filterChapters(chapters: PlatformCourseTree['chapters'], query: string, missingOnly: boolean): PlatformCourseTree['chapters'] {
  const q = query.trim().toLowerCase();
  return chapters
    .map((c) => ({
      ...c,
      topics: c.topics.filter((t) => (!missingOnly || t.videos === 0) && (!q || t.title.toLowerCase().includes(q) || c.title.toLowerCase().includes(q))),
    }))
    .filter((c) => c.topics.length > 0);
}

export interface ImportChoice {
  /** Import this video. */
  include: boolean;
  /** The topic it goes to ('' = none chosen). */
  topicId: string;
}

/** Starting choices for a playlist preview: each video goes to its suggested topic, unless it is already there. */
export function initialChoices(preview: PlaylistPreview): Record<string, ImportChoice> {
  return Object.fromEntries(
    preview.videos.map((v) => [v.youtubeVideoId, { topicId: v.suggestedTopicId ?? '', include: !!v.suggestedTopicId && !v.alreadyOn.includes(v.suggestedTopicId) }]),
  );
}

/** The import request's items: the chosen videos that have a topic. */
export function importItems(preview: PlaylistPreview, choices: Record<string, ImportChoice>) {
  return preview.videos
    .filter((v) => choices[v.youtubeVideoId]?.include && choices[v.youtubeVideoId].topicId)
    .map((v) => ({ youtubeVideoId: v.youtubeVideoId, title: v.title.slice(0, 200), durationSeconds: v.durationSeconds, topicId: choices[v.youtubeVideoId].topicId }));
}
