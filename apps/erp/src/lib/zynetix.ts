// Zynetix admin dashboard (docs/zynetix/API.md): the board edition, topic materials, YouTube channel
// import, teachers, boards and edge compute, and the AI answer log. Types and pure helpers.
import type { MessageKey } from '@/i18n/messages';
import type { VideoLanguage } from './types';

export type Edition = 'full' | 'board';
export const ZYNETIX_HOME = '/zynetix';

/**
 * Pages the board edition keeps: the Zynetix dashboard, the timetable, subjects and topics, topic
 * videos, the platform team's pages, and the account pages. Every other ERP page goes to the overview.
 */
const BOARD_PATHS = ['/zynetix', '/boards', '/devices', '/timetable', '/syllabus', '/topic-videos', '/platform', '/account', '/audit'];

export function allowedInBoardEdition(pathname: string): boolean {
  const path = pathname.split('?')[0].replace(/\/$/, '') || '/';
  return BOARD_PATHS.some((p) => path === p || path.startsWith(`${p}/`));
}

/** Where to send someone opening `pathname`: null to stay, else the Zynetix overview. */
export function editionRedirect(edition: Edition | undefined, pathname: string | null): string | null {
  if (edition !== 'board' || pathname === null) return null;
  return allowedInBoardEdition(pathname) ? null : ZYNETIX_HOME;
}

// ---------------------------------------------------------------- topic materials

export const MATERIAL_KINDS = ['pdf', 'book', 'syllabus', 'link', 'animation', 'model3d', 'sim'] as const;
export type MaterialKind = (typeof MATERIAL_KINDS)[number];
export const AUDIENCES = ['board', 'teacher', 'student', 'parent'] as const;
export type Audience = (typeof AUDIENCES)[number];
export type MaterialStatus = 'approved' | 'pending' | 'rejected';

export interface TopicMaterial {
  id: string;
  topicId: string;
  source: 'platform' | 'institution';
  kind: MaterialKind;
  title: string;
  url: string | null;
  ref: string | null;
  author: string | null;
  bookChapter: string | null;
  pageFrom: number | null;
  pageTo: number | null;
  language: VideoLanguage;
  audience: Audience[];
  status: MaterialStatus;
  reviewReason: string | null;
  position: number;
  createdBy: string | null;
  createdAt: string;
}

export interface PendingMaterial extends TopicMaterial {
  topic: { id: string; title: string };
}

export interface MaterialInput {
  kind: MaterialKind;
  title?: string;
  url?: string | null;
  ref?: string | null;
  author?: string | null;
  bookChapter?: string | null;
  pageFrom?: number | null;
  pageTo?: number | null;
  language?: VideoLanguage;
  audience?: Audience[];
}

/** The API's rules for a material (topic-materials.service.ts checkMaterial), as a message key, or null when it is fine. */
export function materialProblem(m: MaterialInput): MessageKey | null {
  const has = (v: string | null | undefined) => !!v && v.trim().length > 0;
  if ((m.kind === 'pdf' || m.kind === 'syllabus' || m.kind === 'link') && !has(m.url)) return 'zx.mat.needUrl';
  if (has(m.url) && !/^https?:\/\/\S+$/i.test(m.url!.trim())) return 'zx.mat.badUrl';
  if (m.kind === 'book' && !has(m.title)) return 'zx.mat.needTitle';
  if (m.kind === 'animation' && !has(m.ref)) return 'zx.mat.needAnimation';
  if ((m.kind === 'model3d' || m.kind === 'sim') && !has(m.ref) && !has(m.url)) return 'zx.mat.needRefOrUrl';
  if (m.pageFrom && m.pageTo && m.pageFrom > m.pageTo) return 'zx.mat.badPages';
  if (m.audience && m.audience.length === 0) return 'zx.mat.needAudience';
  return null;
}

/** "Ch 3 · pp. 41–58" for a book; empty for other kinds. */
export function bookRange(m: Pick<TopicMaterial, 'bookChapter' | 'pageFrom' | 'pageTo'>): string {
  const pages = m.pageFrom ? (m.pageTo && m.pageTo !== m.pageFrom ? `pp. ${m.pageFrom}–${m.pageTo}` : `p. ${m.pageFrom}`) : '';
  return [m.bookChapter ?? '', pages].filter(Boolean).join(' · ');
}

/** Toggles one audience, never leaving none. */
export function toggleAudience(list: readonly Audience[], a: Audience): Audience[] {
  const next = list.includes(a) ? list.filter((x) => x !== a) : [...list, a];
  return next.length === 0 ? [...list] : AUDIENCES.filter((x) => next.includes(x));
}

/** Moves item `i` by `d` places (a copy). */
export function moveItem<T>(list: readonly T[], i: number, d: -1 | 1): T[] {
  const j = i + d;
  if (j < 0 || j >= list.length) return [...list];
  const out = [...list];
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}

// ---------------------------------------------------------------- subjects, topics and resources

export interface OutlineTopic {
  id: string;
  title: string;
  own: boolean;
  counts: { videos: number; materials: number; animations: number };
}

export interface SubjectOutline {
  subject: { id: string; code: string; name: string; term: number };
  course: null | { id: string; title: string; chapters: { id: string; title: string; own: boolean; topics: OutlineTopic[] }[] };
}

export interface TopicResources {
  topic: { id: string; title: string; summary: string | null; chapter: { id: string; title: string }; course: { id: string; title: string; language: string } };
  language: string;
  videos: { id: string; source: 'platform' | 'institution' | 'teacher'; topicId: string; youtubeVideoId: string; title: string; language: string; durationSeconds: number | null; channelTitle: string | null; position: number }[];
  materials: TopicMaterial[];
  animations: { id: string; title: string; materialId: string | null; source: string }[];
  builtIn: { kind: string; id: string; title: string }[];
}

export const hasContent = (t: OutlineTopic) => t.counts.videos + t.counts.materials + t.counts.animations > 0;

/** Topics with at least one video, material or animation, over all topics of the outlines. */
export function coverage(outlines: readonly SubjectOutline[]): { topics: number; covered: number; pct: number | null } {
  const topics = outlines.flatMap((o) => o.course?.chapters.flatMap((c) => c.topics) ?? []);
  const seen = new Map(topics.map((t) => [t.id, t]));
  const covered = [...seen.values()].filter(hasContent).length;
  return { topics: seen.size, covered, pct: seen.size ? Math.round((covered / seen.size) * 100) : null };
}

// ---------------------------------------------------------------- YouTube channel import

export interface YoutubePreview {
  source: { kind: 'channel' | 'playlist'; id: string; title: string | null };
  via: 'api' | 'feed';
  topics: { id: string; title: string; chapter: string; course: string }[];
  videos: { youtubeVideoId: string; title: string; position: number; publishedAt: string | null; suggestedTopicId: string | null; score: number; alreadyOn: string[] }[];
}

export interface MappingChoice {
  topicId: string;
  include: boolean;
}

/** Each video starts on its suggested topic, ticked unless it is already on that topic. */
export function initialMapping(p: YoutubePreview): Record<string, MappingChoice> {
  return Object.fromEntries(
    p.videos.map((v) => {
      const topicId = v.suggestedTopicId ?? '';
      return [v.youtubeVideoId, { topicId, include: !!topicId && !v.alreadyOn.includes(topicId) }];
    }),
  );
}

/** The import body's items: ticked videos with a topic. */
export function importItems(p: YoutubePreview, mapping: Record<string, MappingChoice>): { youtubeVideoId: string; title: string; topicId: string }[] {
  return p.videos.filter((v) => mapping[v.youtubeVideoId]?.include && mapping[v.youtubeVideoId].topicId).map((v) => ({ youtubeVideoId: v.youtubeVideoId, title: v.title.slice(0, 200), topicId: mapping[v.youtubeVideoId].topicId }));
}

/** A channel link, @handle, UC… id or playlist link (the API decides; this only rejects the obviously wrong). */
export function looksLikeYoutubeSource(input: string): boolean {
  const s = input.trim();
  return /^@[\w.-]{3,}$/.test(s) || /^UC[\w-]{20,}$/.test(s) || /^(https?:\/\/)?(www\.|m\.)?youtube\.com\//i.test(s) || /^(https?:\/\/)?youtu\.be\//i.test(s);
}

// ---------------------------------------------------------------- teachers

export interface Teacher {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  status: string;
  teachingSubjects: string[];
  roles: string[];
  departments: { id: string; name: string }[];
}

export interface NewTeacher extends Teacher {
  temporaryPassword: string;
  mustChangePassword: boolean;
}

// ---------------------------------------------------------------- boards and edge compute

export interface ComputeDevice {
  id: string;
  name: string;
  room: string | null;
  kind: string | null;
  platform: string | null;
  enrolled: boolean;
  online: boolean;
  lastSeenAt: string | null;
  appVersion: string | null;
  os: string | null;
  osVersion: string | null;
  reportedAt: string | null;
  cpuPct: number | null;
  gpuPct: number | null;
  npuPct: number | null;
  ramPct: number | null;
  ramTotalMb: number | null;
  diskPct: number | null;
  cpuTempC: number | null;
  gpuTempC: number | null;
  uptimeS: number | null;
  ai24h: { inferences: number; inferenceMs: number; avgMs: number | null };
}

export interface Compute {
  online: number;
  total: number;
  devices: ComputeDevice[];
}

export interface ComputeRow {
  deviceId: string;
  device: string;
  at: string;
  samples: number;
  cpuAvg: number | null;
  cpuMax: number | null;
  gpuAvg: number | null;
  gpuMax: number | null;
  npuAvg: number | null;
  npuMax: number | null;
  ramAvg: number | null;
  ramMax: number | null;
  diskMax: number | null;
  cpuTempMax: number | null;
  gpuTempMax: number | null;
  aiInferences: number;
  aiInferenceMs: number;
  aiAvgMs: number | null;
}

export interface ComputeUsage {
  from: string;
  to: string;
  timezone: string;
  bucket: 'day' | 'hour';
  totals: { aiInferences: number; aiInferenceMs: number };
  rows: ComputeRow[];
}

/** A bucket's label in the institution's time zone: "14:00" by hour, "21 Oct" by day. */
export function bucketLabel(at: string, bucket: 'day' | 'hour', timeZone = 'Asia/Kolkata'): string {
  // The API sends buckets as wall-clock time in the institution's zone ("2026-10-20T10:00", no offset):
  // show those as written. Only a real instant (with Z or an offset) is converted to the zone.
  const wallClock = !/(Z|[+-]\d{2}:?\d{2})$/.test(at);
  const d = new Date(wallClock ? `${at.length === 10 ? `${at}T00:00` : at}Z` : at);
  if (Number.isNaN(d.getTime())) return at;
  const zone = wallClock ? 'UTC' : timeZone;
  return bucket === 'hour'
    ? new Intl.DateTimeFormat('en-GB', { timeZone: zone, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d)
    : new Intl.DateTimeFormat('en-GB', { timeZone: zone, day: 'numeric', month: 'short' }).format(d);
}

const avg = (xs: (number | null)[]) => {
  const v = xs.filter((x): x is number => x !== null);
  return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : null;
};

/** CPU, GPU, NPU and RAM averages per time bucket, over the devices in the rows (one line each). */
export function computeSeries(u: ComputeUsage): { labels: string[]; at: string[]; cpu: (number | null)[]; gpu: (number | null)[]; npu: (number | null)[]; ram: (number | null)[]; inferences: number[] } {
  const at = [...new Set(u.rows.map((r) => r.at))].sort();
  const by = (t: string) => u.rows.filter((r) => r.at === t);
  return {
    at,
    labels: at.map((t) => bucketLabel(t, u.bucket, u.timezone)),
    cpu: at.map((t) => avg(by(t).map((r) => r.cpuAvg))),
    gpu: at.map((t) => avg(by(t).map((r) => r.gpuAvg))),
    npu: at.map((t) => avg(by(t).map((r) => r.npuAvg))),
    ram: at.map((t) => avg(by(t).map((r) => r.ramAvg))),
    inferences: at.map((t) => by(t).reduce((s, r) => s + r.aiInferences, 0)),
  };
}

// ---------------------------------------------------------------- AI answer log

export const AI_STATUSES = ['served', 'rejected', 'throttled', 'error'] as const;
export type AiStatus = (typeof AI_STATUSES)[number];

export interface AiLogItem {
  id: string;
  at: string;
  kind: string;
  status: AiStatus;
  outcome: string;
  reason: string | null;
  user: { id: string; fullName: string } | null;
  device: { id: string; name: string } | null;
  topic: { id: string; title: string } | null;
  provider: string | null;
  model: string | null;
  latencyMs: number | null;
  tokensIn: number;
  tokensOut: number;
  estCostInr: number | null;
}

export interface AiLogPage {
  items: AiLogItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AiTotals {
  requests: number;
  served: number;
  rejected: number;
  throttled: number;
  error: number;
  tokensIn: number;
  tokensOut: number;
  p50LatencyMs: number | null;
  p95LatencyMs: number | null;
}

export interface AiSummary {
  from: string;
  to: string;
  timezone: string;
  bucket: 'day' | 'hour';
  totals: AiTotals;
  buckets: (AiTotals & { at: string })[];
  peakHour: { at: string; requests: number; throttled: number } | null;
  byHourOfDay: { hour: number; requests: number; throttled: number }[];
  byKind: { kind: string; requests: number; served: number; tokensIn: number; tokensOut: number }[];
  reasons: { status: AiStatus; reason: string | null; n: number }[];
  capacity: { running: number; waiting: number; max: number };
}

export interface AiLogFilters {
  from?: string;
  to?: string;
  status?: string;
  kind?: string;
  userId?: string;
  deviceId?: string;
  topicId?: string;
  page?: string;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The API query for the log and its summary from the page's search params (unknown values dropped). */
export function aiLogQuery(f: AiLogFilters, extra: Record<string, string> = {}): string {
  const q = new URLSearchParams();
  if (f.from && DATE.test(f.from)) q.set('from', f.from);
  if (f.to && DATE.test(f.to)) q.set('to', f.to);
  if (f.status && (AI_STATUSES as readonly string[]).includes(f.status)) q.set('status', f.status);
  if (f.kind && /^[a-zA-Z_.-]{1,40}$/.test(f.kind)) q.set('kind', f.kind);
  for (const k of ['userId', 'deviceId', 'topicId'] as const) if (f[k] && UUID.test(f[k]!)) q.set(k, f[k]!);
  const page = Number(f.page);
  if (Number.isInteger(page) && page > 1) q.set('page', String(page));
  for (const [k, v] of Object.entries(extra)) q.set(k, v);
  return q.toString();
}

/** The topics asked about most, from log rows. */
export function topTopics(items: readonly AiLogItem[], n = 5): { id: string; title: string; requests: number }[] {
  const m = new Map<string, { id: string; title: string; requests: number }>();
  for (const it of items) {
    if (!it.topic) continue;
    const e = m.get(it.topic.id) ?? { ...it.topic, requests: 0 };
    e.requests += 1;
    m.set(it.topic.id, e);
  }
  return [...m.values()].sort((a, b) => b.requests - a.requests || a.title.localeCompare(b.title)).slice(0, n);
}

export const STATUS_TONE: Record<AiStatus, 'success' | 'danger' | 'warning' | 'neutral'> = { served: 'success', rejected: 'danger', throttled: 'warning', error: 'neutral' };

// ---------------------------------------------------------------- platform: institutions

export interface PlatformTenant {
  id: string;
  slug: string;
  name: string;
  kind: 'school' | 'college' | 'university';
  edition: Edition;
  timezone: string;
  createdAt: string;
}

export interface NewTenantResult {
  tenant: PlatformTenant;
  admin: { id: string; fullName: string; email: string; temporaryPassword: string };
}

// ---------------------------------------------------------------- AI connection (Claude key)

export const CLAUDE_MODELS = ['claude-sonnet-5-5', 'claude-opus-5-5', 'claude-haiku-5-5'] as const;
export type ClaudeModel = (typeof CLAUDE_MODELS)[number];

/** GET /v1/ai/admin/connection: the key itself is never sent. */
export interface AiConnection {
  provider: 'anthropic';
  model: string;
  fallbackModel: string | null;
  keySet: boolean;
  keyHint: string | null;
  updatedAt: string | null;
  source: 'institution' | 'server' | 'none';
}

export type AiTestResult = { ok: true; model: string; latencyMs: number } | { ok: false; error: string };

/** What is wrong with a pasted key before it is sent (empty is fine once a key is saved). */
export function aiKeyProblem(key: string, keySet: boolean): MessageKey | null {
  const k = key.trim();
  if (!k) return keySet ? null : 'zx.aic.keyRequired';
  if (/\s/.test(k) || k.length < 20) return 'zx.aic.keyShort';
  return null;
}

/** The status line's message for where this institution's AI comes from. */
export const aiSourceKey = (c: Pick<AiConnection, 'source'>): MessageKey => (c.source === 'institution' ? 'zx.aic.status.institution' : c.source === 'server' ? 'zx.aic.status.server' : 'zx.aic.status.none');
