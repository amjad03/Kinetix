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

const CHANNEL_ID = /^UC[A-Za-z0-9_-]{22}$/;

/** A YouTube channel as someone might paste it: its id (UC…), its @handle, or a legacy /user/ or /c/ name. */
export type ChannelRef = { kind: 'id'; id: string } | { kind: 'handle'; handle: string } | { kind: 'user'; name: string } | { kind: 'custom'; name: string };

/**
 * The channel from a channel link (youtube.com/channel/UC…, /@handle, /user/name, /c/name, with
 * any trailing /videos), a bare UC… id or a bare @handle. Null for anything else (a video or
 * playlist link is not a channel).
 */
export function parseChannelRef(input: string): ChannelRef | null {
  const text = input.trim();
  if (CHANNEL_ID.test(text)) return { kind: 'id', id: text };
  if (/^@[A-Za-z0-9._-]{3,100}$/.test(text)) return { kind: 'handle', handle: text };
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase().replace(/^(www|m|music)\./, '');
  if (host !== 'youtube.com') return null;
  const parts = url.pathname.split('/').filter(Boolean).map((x) => decodeURIComponent(x));
  if (parts[0]?.startsWith('@') && /^@[A-Za-z0-9._-]{3,100}$/.test(parts[0])) return { kind: 'handle', handle: parts[0] };
  if (parts[0] === 'channel' && parts[1] && CHANNEL_ID.test(parts[1])) return { kind: 'id', id: parts[1] };
  if (parts[0] === 'user' && parts[1]) return { kind: 'user', name: parts[1] };
  if (parts[0] === 'c' && parts[1]) return { kind: 'custom', name: parts[1] };
  return null;
}

/** The channel id in a channel page's HTML (its canonical link or the page data), or null. */
export function channelIdFromHtml(html: string): string | null {
  const m = /<link rel="canonical" href="https:\/\/www\.youtube\.com\/channel\/(UC[A-Za-z0-9_-]{22})"/.exec(html) ?? /"(?:channelId|externalId)":"(UC[A-Za-z0-9_-]{22})"/.exec(html) ?? /<meta itemprop="(?:channelId|identifier)" content="(UC[A-Za-z0-9_-]{22})"/.exec(html);
  return m?.[1] ?? null;
}

const XML_ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const unxml = (t: string) => t.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (all, e: string) => (e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : (XML_ENTITIES[e] ?? all)));

export interface FeedVideo extends PlaylistVideo {
  publishedAt: string | null;
}

/**
 * The videos of a public channel or playlist feed (youtube.com/feeds/videos.xml), newest first as
 * YouTube lists them. The feed has the latest 15 uploads; it needs no API key.
 */
export function parseVideoFeed(xml: string): { title: string | null; videos: FeedVideo[] } {
  const head = xml.split('<entry>')[0];
  const feedTitle = /<title>([\s\S]*?)<\/title>/.exec(head)?.[1];
  const videos: FeedVideo[] = [];
  for (const m of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    const e = m[1];
    const videoId = /<yt:videoId>([A-Za-z0-9_-]{11})<\/yt:videoId>/.exec(e)?.[1];
    const title = /<title>([\s\S]*?)<\/title>/.exec(e)?.[1];
    if (!videoId || !title) continue;
    const author = /<author>\s*<name>([\s\S]*?)<\/name>/.exec(e)?.[1];
    videos.push({ videoId, title: unxml(title.trim()), position: videos.length, channelTitle: author ? unxml(author.trim()) : null, publishedAt: /<published>([^<]+)<\/published>/.exec(e)?.[1] ?? null });
  }
  return { title: feedTitle ? unxml(feedTitle.trim()) : null, videos };
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

export class ChannelNotFoundError extends Error {
  constructor() {
    super('That YouTube channel was not found');
  }
}

/** A channel's or playlist's videos, and whether they came from the Data API (all of them) or the public feed (the latest 15). */
export interface SourceVideos {
  source: { kind: 'channel' | 'playlist'; id: string; title: string | null };
  via: 'api' | 'feed';
  videos: (PlaylistVideo & { publishedAt?: string | null })[];
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

  /**
   * The videos of a channel (link, @handle or id) or a playlist link: with the Data API key every
   * upload (up to `limit`), otherwise the public feed's latest 15.
   */
  async sourceVideos(input: string, limit = 500): Promise<SourceVideos | null> {
    const playlistId = parsePlaylistId(input);
    if (playlistId) {
      if (this.apiKey) return { source: { kind: 'playlist', id: playlistId, title: null }, via: 'api', videos: await this.playlistVideos(playlistId, limit) };
      const feed = await this.feed(`playlist_id=${playlistId}`);
      if (!feed) throw new PlaylistNotFoundError();
      return { source: { kind: 'playlist', id: playlistId, title: feed.title }, via: 'feed', videos: feed.videos };
    }
    const ref = parseChannelRef(input);
    if (!ref) return null;
    if (this.apiKey) {
      const by: Record<string, string> | null = ref.kind === 'id' ? { id: ref.id } : ref.kind === 'handle' ? { forHandle: ref.handle } : ref.kind === 'user' ? { forUsername: ref.name } : null;
      const channel = by ? await this.channel(by) : null;
      if (channel) return { source: { kind: 'channel', id: channel.id, title: channel.title }, via: 'api', videos: channel.uploads ? await this.playlistVideos(channel.uploads, limit) : [] };
      if (ref.kind !== 'custom') throw new ChannelNotFoundError();
    }
    const id = ref.kind === 'id' ? ref.id : await this.channelIdFromPage(ref);
    if (!id) throw new ChannelNotFoundError();
    const feed = await this.feed(`channel_id=${id}`);
    if (!feed) throw new ChannelNotFoundError();
    return { source: { kind: 'channel', id, title: feed.title }, via: 'feed', videos: feed.videos };
  }

  private async channel(by: Record<string, string>): Promise<{ id: string; title: string | null; uploads: string | null } | null> {
    const q = new URLSearchParams({ part: 'snippet,contentDetails', key: this.apiKey!, ...by });
    const j = await this.get<{ items?: { id: string; snippet?: { title?: string }; contentDetails?: { relatedPlaylists?: { uploads?: string } } }[] }>(`channels?${q}`);
    const c = j.items?.[0];
    return c ? { id: c.id, title: c.snippet?.title ?? null, uploads: c.contentDetails?.relatedPlaylists?.uploads ?? null } : null;
  }

  private async channelIdFromPage(ref: ChannelRef): Promise<string | null> {
    const path = ref.kind === 'handle' ? ref.handle : ref.kind === 'user' ? `user/${ref.name}` : ref.kind === 'custom' ? `c/${ref.name}` : `channel/${ref.id}`;
    const html = await this.text(`https://www.youtube.com/${encodeURI(path)}`);
    return html ? channelIdFromHtml(html) : null;
  }

  private async feed(query: string) {
    const xml = await this.text(`https://www.youtube.com/feeds/videos.xml?${query}`);
    return xml ? parseVideoFeed(xml) : null;
  }

  /** A public page's text, or null when it is missing (404); other failures throw. */
  private async text(url: string): Promise<string | null> {
    const res = await this.fetchFn(url, { signal: AbortSignal.timeout(this.timeoutMs) });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`YouTube returned ${res.status}`);
    return res.text();
  }

  private async get<T>(path: string, playlist = false): Promise<T> {
    const res = await this.fetchFn(`https://www.googleapis.com/youtube/v3/${path}`, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(this.timeoutMs) });
    if (playlist && res.status === 404) throw new PlaylistNotFoundError();
    if (!res.ok) throw new Error(`YouTube Data API returned ${res.status}`);
    return (await res.json()) as T;
  }
}
