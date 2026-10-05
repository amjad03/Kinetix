import { keywords } from '../content/content.service.js';

/** Words that say nothing about the topic in a channel's video titles. */
const NOISE = new Set('kinetix video part lecture concept concepts introduction intro basics tutorial explained hindi kannada english animated animation class grade sem semester'.split(' '));

/**
 * The chapter topic a playlist video most likely explains, by keyword overlap between the video
 * title and the topic's title (summary words count half). Null when nothing matches; ties go to
 * the earlier topic.
 */
export function bestTopicFor(videoTitle: string, chapterTopics: { id: string; title: string; summary?: string }[]): string | null {
  const want = [...keywords(videoTitle)].filter((w) => !NOISE.has(w));
  if (want.length === 0) return null;
  let best: { id: string; score: number } | null = null;
  for (const t of chapterTopics) {
    const title = keywords(t.title);
    const summary = keywords(t.summary ?? '');
    let score = 0;
    for (const w of want) score += title.has(w) ? 2 : summary.has(w) ? 1 : 0;
    if (score > 0 && (!best || score > best.score)) best = { id: t.id, score };
  }
  return best?.id ?? null;
}
