import { Logger } from '@nestjs/common';

/** YouTube video ids are 11 characters of [A-Za-z0-9_-]. */
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const PLAYLIST_ID = /^[A-Za-z0-9_-]{10,64}$/;

/**
 * The video id from any YouTube link a person might paste: watch?v=, youtu.be/, shorts/,
 * embed/, live/, the youtube-nocookie.com player, m. and music. hosts, or a bare id. Null when
 * the text is not a YouTube video link.
 */
export function parseYouTubeId(input: string): string | null {
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

/** The playlist id from a playlist link (or any link with `list=`), or a bare id. */
export function parsePlaylistId(input: string): string | null {
  const text = input.trim();
  if (/^(PL|UU|OL|FL|LL)[A-Za-z0-9_-]{8,}$/.test(text)) return text;
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase().replace(/^(www|m|music)\./, '');
  if (host !== 'youtube.com' && host !== 'youtu.be' && host !== 'youtube-nocookie.com') return null;
  const id = url.searchParams.get('list');
  return id && PLAYLIST_ID.test(id) ? id : null;
}

/** ISO 8601 durations as the Data API gives them (PT1H2M3S) in seconds; null when unreadable. */
export function isoDurationSeconds(iso: string | undefined | null): number | null {
  const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(iso ?? '');
  if (!m) return null;
  const [, d, h, min, s] = m.map((x) => Number(x ?? 0));
  const total = d * 86400 + h * 3600 + min * 60 + s;
  return total > 0 ? total : null;
}

export interface VideoInfo {
  title: string;
  channelTitle: string | null;
  durationSeconds: number | null;
}

export interface PlaylistVideo {
  videoId: string;
  title: string;
  position: number;
  channelTitle: string | null;
}

export class PlaylistsUnavailableError extends Error {
  constructor() {
    super('Playlist import needs a YouTube Data API key on the server (YOUTUBE_API_KEY). Add videos one link at a time, or ask for the key to be set.');
  }
}

export class PlaylistNotFoundError extends Error {
  constructor() {
    super('That playlist was not found, or it is private');
  }
}

/**
 * The little the platform needs from YouTube: a video's title (oEmbed, no key) and, when the
 * server has a Data API key, durations and the videos of a playlist (playlistItems.list costs
 * one quota unit per 50 videos). Nothing is downloaded; the apps play videos with YouTube's
 * own player. Failures are reported as `null`, so adding a link still works offline.
 */
export class YouTube {
  private readonly log = new Logger('YouTube');

  constructor(
    private readonly apiKey: string | undefined,
    private readonly fetchFn: typeof fetch = fetch,
    private readonly timeoutMs = 8000,
  ) {}

  get canListPlaylists(): boolean {
    return !!this.apiKey;
  }

  /** Title, channel and (with a key) duration of a public video, or null when YouTube can't be asked. */
  async videoInfo(videoId: string): Promise<VideoInfo | null> {
    if (this.apiKey) {
      const details = await this.videoDetails([videoId]).catch(() => null);
      const d = details?.get(videoId);
      if (d) return d;
    }
    try {
      const url = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}`;
      const res = await this.fetchFn(url, { signal: AbortSignal.timeout(this.timeoutMs) });
      if (!res.ok) return null;
      const j = (await res.json()) as { title?: string; author_name?: string };
      return j.title ? { title: j.title, channelTitle: j.author_name ?? null, durationSeconds: null } : null;
    } catch (e) {
      this.log.warn(`oEmbed failed for ${videoId}: ${(e as Error).message}`);
      return null;
    }
  }

  /** videos.list (snippet, contentDetails) for up to 50 ids. Needs the key. */
  async videoDetails(ids: string[]): Promise<Map<string, VideoInfo>> {
    const out = new Map<string, VideoInfo>();
    if (!this.apiKey || ids.length === 0) return out;
    for (let i = 0; i < ids.length; i += 50) {
      const q = new URLSearchParams({ part: 'snippet,contentDetails', id: ids.slice(i, i + 50).join(','), key: this.apiKey, maxResults: '50' });
      const j = await this.get<{ items?: { id: string; snippet?: { title?: string; channelTitle?: string }; contentDetails?: { duration?: string } }[] }>(`videos?${q}`);
      for (const it of j.items ?? []) {
        out.set(it.id, { title: it.snippet?.title ?? '', channelTitle: it.snippet?.channelTitle ?? null, durationSeconds: isoDurationSeconds(it.contentDetails?.duration) });
      }
    }
    return out;
  }

  /** The public videos of a playlist in order (at most `limit`). Private and deleted entries are skipped. */
  async playlistVideos(playlistId: string, limit = 200): Promise<PlaylistVideo[]> {
    if (!this.apiKey) throw new PlaylistsUnavailableError();
    const out: PlaylistVideo[] = [];
    let pageToken: string | undefined;
    do {
      const q = new URLSearchParams({ part: 'snippet,contentDetails,status', playlistId, maxResults: '50', key: this.apiKey, ...(pageToken ? { pageToken } : {}) });
      const j = await this.get<{
        nextPageToken?: string;
        items?: { snippet?: { title?: string; position?: number; videoOwnerChannelTitle?: string }; contentDetails?: { videoId?: string }; status?: { privacyStatus?: string } }[];
      }>(`playlistItems?${q}`, true);
      for (const it of j.items ?? []) {
        const videoId = it.contentDetails?.videoId;
        const title = it.snippet?.title ?? '';
        if (!videoId || it.status?.privacyStatus === 'private' || title === 'Private video' || title === 'Deleted video') continue;
        out.push({ videoId, title, position: it.snippet?.position ?? out.length, channelTitle: it.snippet?.videoOwnerChannelTitle ?? null });
      }
      pageToken = j.nextPageToken;
    } while (pageToken && out.length < limit);
    return out.slice(0, limit);
  }

  private async get<T>(path: string, playlist = false): Promise<T> {
    const res = await this.fetchFn(`https://www.googleapis.com/youtube/v3/${path}`, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(this.timeoutMs) });
    if (playlist && res.status === 404) throw new PlaylistNotFoundError();
    if (!res.ok) throw new Error(`YouTube Data API returned ${res.status}`);
    return (await res.json()) as T;
  }
}
