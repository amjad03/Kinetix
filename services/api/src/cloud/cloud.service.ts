import { BadGatewayException, BadRequestException, ConflictException, Inject, Injectable, NotFoundException, PayloadTooLargeException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { audit } from '../common/audit.js';
import { SecretBox } from '../common/secret-box.js';
import { Clock } from '../common/time.js';
import { ENV, type Env } from '../config/env.js';
import { ConnectorsService } from '../connectors/connectors.service.js';
import { DbService, type Tx } from '../db/db.service.js';
import { cloudAccounts } from '../db/schema-foundation.js';
import { CloudHttp, multipart, type CloudRequest, type CloudResponse } from './cloud-http.js';

export type CloudProvider = 'google' | 'microsoft';
export const CLOUD_PROVIDERS: CloudProvider[] = ['google', 'microsoft'];
export type CloudFileKind = 'folder' | 'pdf' | 'pptx' | 'image' | 'video';

export interface CloudFile {
  id: string;
  name: string;
  kind: CloudFileKind;
  mimeType: string;
  size: number | null;
  modifiedAt: string | null;
}

export const NOT_CONFIGURED = 'This cloud service is not set up for your institution yet. Ask your administrator to set it up in the Zynetix dashboard → Integrations.';
export const NOT_CONNECTED = 'Connect your account on this board first';
export const MOODLE_NOT_CONFIGURED = 'Moodle is not set up for your institution yet. Ask your administrator to set it up in the Zynetix dashboard → Integrations.';
/** Largest file brought onto the board or saved from it. */
export const MAX_CLOUD_FILE = 200 * 1024 * 1024;

const CONNECTOR: Record<CloudProvider, string> = { google: 'cloud_google', microsoft: 'cloud_microsoft' };
const LABEL: Record<CloudProvider, string> = { google: 'Google Drive', microsoft: 'OneDrive' };
const GOOGLE_SCOPES = ['openid', 'email', 'https://www.googleapis.com/auth/drive', 'https://www.googleapis.com/auth/classroom.courses.readonly', 'https://www.googleapis.com/auth/classroom.courseworkmaterials'];
const MICROSOFT_SCOPES = ['offline_access', 'User.Read', 'Files.ReadWrite'];
const PPTX = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
/** Google's own formats, exported on import. */
const GOOGLE_EXPORT: Record<string, { mime: string; ext: string; kind: CloudFileKind }> = {
  'application/vnd.google-apps.presentation': { mime: PPTX, ext: 'pptx', kind: 'pptx' },
  'application/vnd.google-apps.document': { mime: 'application/pdf', ext: 'pdf', kind: 'pdf' },
};

type Cfg = Record<string, string | string[] | undefined>;
const str = (c: Cfg, k: string) => ((c[k] as string | undefined) ?? '').trim();
const trimSlash = (u: string) => u.replace(/\/+$/, '');
const form = (o: Record<string, string>) => new URLSearchParams(o).toString();
const aad = (tenantId: string, provider: string, userId: string) => `${tenantId}:cloud.${provider}.${userId}`;

/** What the board can bring in: folders to open, PDFs, slides, pictures and videos. */
export function fileKind(mime: string, name = ''): CloudFileKind | null {
  const m = mime.toLowerCase();
  if (m === 'application/vnd.google-apps.folder' || m === 'folder') return 'folder';
  if (GOOGLE_EXPORT[m]) return GOOGLE_EXPORT[m].kind;
  if (m === 'application/pdf' || /\.pdf$/i.test(name)) return 'pdf';
  if (m === PPTX || m === 'application/vnd.ms-powerpoint' || /\.pptx?$/i.test(name)) return 'pptx';
  if (m.startsWith('image/')) return 'image';
  if (m.startsWith('video/')) return 'video';
  return null;
}

interface Endpoints {
  auth: string;
  token: string;
  api: string;
  upload?: string;
  classroom?: string;
}

function endpoints(p: CloudProvider, c: Cfg): Endpoints {
  const base = trimSlash(str(c, 'apiBaseUrl'));
  if (p === 'google') {
    return base
      ? { auth: `${base}/o/oauth2/v2/auth`, token: `${base}/token`, api: `${base}/drive/v3`, upload: `${base}/upload/drive/v3`, classroom: `${base}/classroom/v1` }
      : { auth: 'https://accounts.google.com/o/oauth2/v2/auth', token: 'https://oauth2.googleapis.com/token', api: 'https://www.googleapis.com/drive/v3', upload: 'https://www.googleapis.com/upload/drive/v3', classroom: 'https://classroom.googleapis.com/v1' };
  }
  const dir = encodeURIComponent(str(c, 'directory') || 'common');
  const login = base ? `${base}/login/${dir}/oauth2/v2.0` : `https://login.microsoftonline.com/${dir}/oauth2/v2.0`;
  return { auth: `${login}/authorize`, token: `${login}/token`, api: base ? `${base}/graph/v1.0` : 'https://graph.microsoft.com/v1.0' };
}

interface OAuthState {
  t: string;
  u: string;
  p: CloudProvider;
  r: string;
  exp: number;
}

/**
 * Google Drive, OneDrive, Google Classroom and Moodle for the board. The institution's administrator
 * sets up each in the Zynetix dashboard (Integrations: OAuth client id and secret, or Moodle's web
 * service token), stored encrypted by the connector registry. Each teacher then connects their own
 * Google or Microsoft account once, by scanning a QR on the board; their refresh token is encrypted
 * at rest. Files pass through this server: the board never holds the teacher's cloud tokens.
 */
@Injectable()
export class CloudService {
  private readonly box: SecretBox | undefined;
  private readonly access = new Map<string, { token: string; until: number }>();

  constructor(
    private readonly db: DbService,
    private readonly connectors: ConnectorsService,
    private readonly http: CloudHttp,
    private readonly clock: Clock,
    @Inject(ENV) private readonly env: Env,
  ) {
    this.box = SecretBox.fromEnv(env);
  }

  // ----- set-up and accounts ----------------------------------------------------------------------

  private async config(tx: Tx, tenantId: string, type: string): Promise<Cfg | null> {
    try {
      return (await this.connectors.resolve(tx, tenantId, type)).config;
    } catch (e) {
      if (e instanceof NotFoundException) return null;
      throw e;
    }
  }

  private async requireConfig(tx: Tx, tenantId: string, p: CloudProvider): Promise<Cfg> {
    const c = await this.config(tx, tenantId, CONNECTOR[p]);
    if (!c) throw new ConflictException(NOT_CONFIGURED);
    return c;
  }

  /** For the board's Cloud menu: what the institution set up and what this teacher connected. */
  async status(tx: Tx, tenantId: string, userId: string) {
    const accounts = await tx.select({ provider: cloudAccounts.provider, account: cloudAccounts.account }).from(cloudAccounts).where(eq(cloudAccounts.userId, userId));
    const one = async (p: CloudProvider) => {
      const configured = !!(await this.config(tx, tenantId, CONNECTOR[p]));
      const a = accounts.find((x) => x.provider === p);
      return { configured, connected: configured && !!a, account: a?.account ?? null };
    };
    const google = await one('google');
    return { google, microsoft: await one('microsoft'), classroom: google, moodle: { configured: !!(await this.config(tx, tenantId, 'lms_moodle')) } };
  }

  redirectUri(origin: string): string {
    return `${trimSlash(this.env.API_PUBLIC_URL ?? origin)}/v1/cloud/oauth/callback`;
  }

  private signState(s: OAuthState): string {
    const payload = Buffer.from(JSON.stringify(s)).toString('base64url');
    return `${payload}.${createHmac('sha256', this.env.JWT_SECRET).update(`cloud-oauth:${payload}`).digest('base64url')}`;
  }

  private readState(raw: string): OAuthState | null {
    const [payload, mac] = raw.split('.');
    if (!payload || !mac) return null;
    const want = Buffer.from(createHmac('sha256', this.env.JWT_SECRET).update(`cloud-oauth:${payload}`).digest('base64url'));
    if (want.length !== Buffer.from(mac).length || !timingSafeEqual(want, Buffer.from(mac))) return null;
    const s = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as OAuthState;
    return s.exp > this.clock.now().getTime() / 1000 ? s : null;
  }

  /** The sign-in page the teacher opens on their phone (QR on the board). Valid for 15 minutes. */
  async connectUrl(tx: Tx, tenantId: string, userId: string, p: CloudProvider, origin: string): Promise<{ url: string; expiresAt: string }> {
    const c = await this.requireConfig(tx, tenantId, p);
    if (!this.box) throw new ConflictException(NOT_CONFIGURED);
    const e = endpoints(p, c);
    const redirect = this.redirectUri(origin);
    const exp = Math.floor(this.clock.now().getTime() / 1000) + 15 * 60;
    const state = this.signState({ t: tenantId, u: userId, p, r: redirect, exp });
    const q: Record<string, string> = { client_id: str(c, 'clientId'), redirect_uri: redirect, response_type: 'code', state, scope: (p === 'google' ? GOOGLE_SCOPES : MICROSOFT_SCOPES).join(' ') };
    if (p === 'google') Object.assign(q, { access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true' });
    else q.prompt = 'select_account';
    return { url: `${e.auth}?${new URLSearchParams(q)}`, expiresAt: new Date(exp * 1000).toISOString() };
  }

  /** Google or Microsoft sends the teacher back here: the code becomes their stored (encrypted) refresh token. */
  async callback(code: string, rawState: string): Promise<{ provider: CloudProvider; account: string | null }> {
    const s = this.readState(rawState);
    if (!s || !CLOUD_PROVIDERS.includes(s.p)) throw new BadRequestException('This sign-in link has expired. Start again from the board.');
    const box = this.box;
    if (!box) throw new ConflictException(NOT_CONFIGURED);
    return this.db.withTenant(s.t, async (tx) => {
      const c = await this.requireConfig(tx, s.t, s.p);
      const e = endpoints(s.p, c);
      const tok = await this.tokenCall(e.token, { grant_type: 'authorization_code', code, redirect_uri: s.r, client_id: str(c, 'clientId'), client_secret: str(c, 'clientSecret'), ...(s.p === 'microsoft' ? { scope: MICROSOFT_SCOPES.join(' ') } : {}) }, s.p);
      if (!tok.refresh_token) throw new BadGatewayException(`${LABEL[s.p]} did not give offline access. Remove Zynetix from your account's connected apps and try again.`);
      this.access.set(`${s.t}:${s.u}:${s.p}`, { token: tok.access_token, until: Date.now() + (tok.expires_in ?? 3000) * 1000 - 60_000 });
      const account = await this.whoAmI(s.p, e, tok.access_token).catch(() => null);
      const values = { tenantId: s.t, userId: s.u, provider: s.p, account, refreshTokenEnc: box.encrypt(tok.refresh_token, aad(s.t, s.p, s.u)), updatedAt: this.clock.now() };
      await tx.insert(cloudAccounts).values(values).onConflictDoUpdate({ target: [cloudAccounts.tenantId, cloudAccounts.userId, cloudAccounts.provider], set: { account, refreshTokenEnc: values.refreshTokenEnc, updatedAt: values.updatedAt } });
      await audit(tx, { tenantId: s.t, actorType: 'user', actorId: s.u, action: 'cloud.connected', subjectType: 'user', subjectId: s.u, data: { provider: s.p } });
      return { provider: s.p, account };
    });
  }

  async disconnect(tx: Tx, tenantId: string, userId: string, p: CloudProvider): Promise<void> {
    await tx.delete(cloudAccounts).where(and(eq(cloudAccounts.userId, userId), eq(cloudAccounts.provider, p)));
    this.access.delete(`${tenantId}:${userId}:${p}`);
    await audit(tx, { tenantId, actorType: 'user', actorId: userId, action: 'cloud.disconnected', subjectType: 'user', subjectId: userId, data: { provider: p } });
  }

  private async tokenCall(url: string, body: Record<string, string>, p: CloudProvider): Promise<{ access_token: string; refresh_token?: string; expires_in?: number }> {
    const res = await this.http.request(url, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' }, body: form(body) });
    const j = this.parse(res) as { access_token?: string; refresh_token?: string; expires_in?: number; error_description?: string; error?: string };
    if (res.status >= 400 || !j.access_token) {
      if (j.error === 'invalid_grant') throw new ConflictException(NOT_CONNECTED);
      throw new BadGatewayException(`${LABEL[p]} refused the sign-in${j.error_description || j.error ? `: ${j.error_description ?? j.error}` : ''}`);
    }
    return j as { access_token: string; refresh_token?: string; expires_in?: number };
  }

  private async whoAmI(p: CloudProvider, e: Endpoints, token: string): Promise<string | null> {
    if (p === 'google') {
      const j = this.parse(await this.http.request(`${e.api}/about?fields=user(emailAddress)`, { method: 'GET', headers: { authorization: `Bearer ${token}` } })) as { user?: { emailAddress?: string } };
      return j.user?.emailAddress ?? null;
    }
    const j = this.parse(await this.http.request(`${e.api}/me`, { method: 'GET', headers: { authorization: `Bearer ${token}` } })) as { mail?: string; userPrincipalName?: string };
    return j.mail ?? j.userPrincipalName ?? null;
  }

  /** A fresh access token for this teacher (refreshed from the stored refresh token). */
  private async session(tx: Tx, tenantId: string, userId: string, p: CloudProvider): Promise<{ token: string; e: Endpoints }> {
    const c = await this.requireConfig(tx, tenantId, p);
    const e = endpoints(p, c);
    const key = `${tenantId}:${userId}:${p}`;
    const hit = this.access.get(key);
    if (hit && hit.until > Date.now()) return { token: hit.token, e };
    const [row] = await tx.select().from(cloudAccounts).where(and(eq(cloudAccounts.userId, userId), eq(cloudAccounts.provider, p)));
    if (!row || !this.box) throw new ConflictException(NOT_CONNECTED);
    const refresh = this.box.decrypt(row.refreshTokenEnc, aad(tenantId, p, userId));
    const tok = await this.tokenCall(e.token, { grant_type: 'refresh_token', refresh_token: refresh, client_id: str(c, 'clientId'), client_secret: str(c, 'clientSecret'), ...(p === 'microsoft' ? { scope: MICROSOFT_SCOPES.join(' ') } : {}) }, p);
    if (tok.refresh_token && tok.refresh_token !== refresh) {
      await tx.update(cloudAccounts).set({ refreshTokenEnc: this.box.encrypt(tok.refresh_token, aad(tenantId, p, userId)), updatedAt: this.clock.now() }).where(and(eq(cloudAccounts.userId, userId), eq(cloudAccounts.provider, p)));
    }
    this.access.set(key, { token: tok.access_token, until: Date.now() + (tok.expires_in ?? 3000) * 1000 - 60_000 });
    return { token: tok.access_token, e };
  }

  private parse(res: CloudResponse): unknown {
    try {
      return JSON.parse(res.body.toString('utf8') || '{}');
    } catch {
      return {};
    }
  }

  private async call(token: string, url: string, r: Omit<CloudRequest, 'headers'> & { headers?: Record<string, string> }, what: string): Promise<CloudResponse> {
    const res = await this.http.request(url, { ...r, headers: { authorization: `Bearer ${token}`, ...(r.headers ?? {}) } });
    if (res.status === 401) throw new ConflictException(NOT_CONNECTED);
    if (res.status >= 400) {
      const j = this.parse(res) as { error?: { message?: string } | string };
      const msg = typeof j.error === 'object' ? j.error?.message : j.error;
      throw new BadGatewayException(`${what} answered ${res.status}${msg ? `: ${msg}` : ''}`);
    }
    return res;
  }

  // ----- files -----------------------------------------------------------------------------------

  /** A folder's files the board can use (folders first), or a search across the drive. */
  async list(tx: Tx, tenantId: string, userId: string, p: CloudProvider, folder?: string, q?: string): Promise<CloudFile[]> {
    const { token, e } = await this.session(tx, tenantId, userId, p);
    let files: CloudFile[];
    if (p === 'google') {
      const parts = ['trashed = false'];
      if (q) parts.push(`name contains '${q.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`);
      else parts.push(`'${(folder || 'root').replace(/'/g, '')}' in parents`);
      const url = `${e.api}/files?${new URLSearchParams({ q: parts.join(' and '), fields: 'files(id,name,mimeType,size,modifiedTime)', pageSize: '200', orderBy: 'folder,name' })}`;
      const j = this.parse(await this.call(token, url, { method: 'GET' }, LABEL[p])) as { files?: { id: string; name: string; mimeType: string; size?: string; modifiedTime?: string }[] };
      files = (j.files ?? []).flatMap((f) => {
        const kind = fileKind(f.mimeType, f.name);
        return kind ? [{ id: f.id, name: f.name, kind, mimeType: f.mimeType, size: f.size ? Number(f.size) : null, modifiedAt: f.modifiedTime ?? null }] : [];
      });
    } else {
      const path = q ? `/me/drive/root/search(q='${encodeURIComponent(q.replace(/'/g, "''"))}')` : folder ? `/me/drive/items/${encodeURIComponent(folder)}/children` : '/me/drive/root/children';
      const j = this.parse(await this.call(token, `${e.api}${path}?$top=200`, { method: 'GET' }, LABEL[p])) as { value?: { id: string; name: string; size?: number; lastModifiedDateTime?: string; folder?: unknown; file?: { mimeType?: string } }[] };
      files = (j.value ?? []).flatMap((f) => {
        const mime = f.folder ? 'folder' : (f.file?.mimeType ?? 'application/octet-stream');
        const kind = fileKind(mime, f.name);
        return kind ? [{ id: f.id, name: f.name, kind, mimeType: mime, size: f.folder ? null : (f.size ?? null), modifiedAt: f.lastModifiedDateTime ?? null }] : [];
      });
    }
    return files.sort((a, b) => Number(b.kind === 'folder') - Number(a.kind === 'folder') || a.name.localeCompare(b.name));
  }

  /** A file's bytes for the board (Google Slides come as PPTX, Google Docs as PDF). */
  async download(tx: Tx, tenantId: string, userId: string, p: CloudProvider, id: string): Promise<{ name: string; mimeType: string; body: Buffer }> {
    const { token, e } = await this.session(tx, tenantId, userId, p);
    let name: string, mime: string, url: string, size: number | null;
    if (p === 'google') {
      const meta = this.parse(await this.call(token, `${e.api}/files/${encodeURIComponent(id)}?fields=id,name,mimeType,size`, { method: 'GET' }, LABEL[p])) as { name: string; mimeType: string; size?: string };
      const exp = GOOGLE_EXPORT[meta.mimeType];
      name = exp ? `${meta.name}.${exp.ext}` : meta.name;
      mime = exp ? exp.mime : meta.mimeType;
      size = meta.size ? Number(meta.size) : null;
      url = exp ? `${e.api}/files/${encodeURIComponent(id)}/export?mimeType=${encodeURIComponent(exp.mime)}` : `${e.api}/files/${encodeURIComponent(id)}?alt=media`;
    } else {
      const meta = this.parse(await this.call(token, `${e.api}/me/drive/items/${encodeURIComponent(id)}`, { method: 'GET' }, LABEL[p])) as { name: string; size?: number; file?: { mimeType?: string } };
      name = meta.name;
      mime = meta.file?.mimeType ?? 'application/octet-stream';
      size = meta.size ?? null;
      url = `${e.api}/me/drive/items/${encodeURIComponent(id)}/content`;
    }
    if (!fileKind(mime, name) || fileKind(mime, name) === 'folder') throw new BadRequestException('The board cannot open this kind of file');
    if (size !== null && size > MAX_CLOUD_FILE) throw new PayloadTooLargeException('That file is too large for the board');
    const res = await this.call(token, url, { method: 'GET' }, LABEL[p]);
    return { name, mimeType: mime, body: res.body };
  }

  /** Saves a board PDF or PPTX (or any file) to the teacher's drive; Google: into [folder] or My Drive, OneDrive: into the Zynetix folder. */
  async upload(tx: Tx, tenantId: string, userId: string, p: CloudProvider, file: { name: string; mimeType: string; body: Buffer }, folder?: string): Promise<{ id: string; name: string; webUrl: string | null }> {
    const { token, e } = await this.session(tx, tenantId, userId, p);
    const name = file.name.replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 200) || 'Zynetix board';
    let out: { id: string; name: string; webUrl: string | null };
    if (p === 'google') {
      const meta = JSON.stringify({ name, mimeType: file.mimeType, ...(folder ? { parents: [folder] } : {}) });
      const mp = multipart('related', [{ contentType: 'application/json; charset=UTF-8', body: meta }, { contentType: file.mimeType, body: file.body }]);
      const j = this.parse(await this.call(token, `${e.upload}/files?uploadType=multipart&fields=id,name,webViewLink`, { method: 'POST', headers: { 'content-type': mp.contentType }, body: mp.body }, LABEL[p])) as { id: string; name: string; webViewLink?: string };
      out = { id: j.id, name: j.name ?? name, webUrl: j.webViewLink ?? null };
    } else {
      const path = folder ? `/me/drive/items/${encodeURIComponent(folder)}:/${encodeURIComponent(name)}:/content` : `/me/drive/root:/Zynetix/${encodeURIComponent(name)}:/content`;
      const j = this.parse(await this.call(token, `${e.api}${path}?@microsoft.graph.conflictBehavior=rename`, { method: 'PUT', headers: { 'content-type': file.mimeType }, body: file.body }, LABEL[p])) as { id: string; name: string; webUrl?: string };
      out = { id: j.id, name: j.name ?? name, webUrl: j.webUrl ?? null };
    }
    await audit(tx, { tenantId, actorType: 'user', actorId: userId, action: 'cloud.saved', subjectType: 'user', subjectId: userId, data: { provider: p, name: out.name, bytes: file.body.length } });
    return out;
  }

  // ----- Google Classroom ------------------------------------------------------------------------

  async classroomCourses(tx: Tx, tenantId: string, userId: string): Promise<{ id: string; name: string; section: string | null }[]> {
    const { token, e } = await this.session(tx, tenantId, userId, 'google');
    const j = this.parse(await this.call(token, `${e.classroom}/courses?teacherId=me&courseStates=ACTIVE&pageSize=100`, { method: 'GET' }, 'Google Classroom')) as { courses?: { id: string; name: string; section?: string }[] };
    return (j.courses ?? []).map((c) => ({ id: c.id, name: c.name, section: c.section ?? null }));
  }

  /** Posts the notes as course material: the file goes to the teacher's Drive, the material links it (students view it). */
  async classroomPost(tx: Tx, tenantId: string, userId: string, courseId: string, file: { name: string; mimeType: string; body: Buffer }, title: string, description?: string) {
    const saved = await this.upload(tx, tenantId, userId, 'google', file);
    const { token, e } = await this.session(tx, tenantId, userId, 'google');
    const body = JSON.stringify({ title: title.slice(0, 200), ...(description ? { description: description.slice(0, 2000) } : {}), materials: [{ driveFile: { driveFile: { id: saved.id }, shareMode: 'VIEW' } }], state: 'PUBLISHED' });
    const j = this.parse(await this.call(token, `${e.classroom}/courses/${encodeURIComponent(courseId)}/courseWorkMaterials`, { method: 'POST', headers: { 'content-type': 'application/json' }, body }, 'Google Classroom')) as { id: string; alternateLink?: string };
    await audit(tx, { tenantId, actorType: 'user', actorId: userId, action: 'share.classroom', subjectType: 'user', subjectId: userId, data: { courseId, materialId: j.id } });
    return { id: j.id, link: j.alternateLink ?? null, fileId: saved.id };
  }

  // ----- Moodle (web service token) --------------------------------------------------------------

  private async moodle(tx: Tx, tenantId: string): Promise<{ base: string; token: string }> {
    const c = await this.config(tx, tenantId, 'lms_moodle');
    if (!c) throw new ConflictException(MOODLE_NOT_CONFIGURED);
    return { base: trimSlash(str(c, 'baseUrl')), token: str(c, 'token') };
  }

  private async ws<T>(m: { base: string; token: string }, fn: string, args: Record<string, string>): Promise<T> {
    const res = await this.http.request(`${m.base}/webservice/rest/server.php`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: form({ wstoken: m.token, wsfunction: fn, moodlewsrestformat: 'json', ...args }) });
    const j = this.parse(res) as T & { exception?: string; message?: string };
    if (res.status >= 400 || (j && typeof j === 'object' && 'exception' in j && j.exception)) throw new BadGatewayException(`Moodle: ${(j as { message?: string }).message ?? `answered ${res.status}`}`);
    return j;
  }

  async moodleCourses(tx: Tx, tenantId: string): Promise<{ id: string; name: string; shortName: string | null }[]> {
    const m = await this.moodle(tx, tenantId);
    const me = await this.ws<{ userid: number }>(m, 'core_webservice_get_site_info', {});
    const courses = await this.ws<{ id: number; fullname: string; shortname?: string }[]>(m, 'core_enrol_get_users_courses', { userid: String(me.userid) });
    return courses.map((c) => ({ id: String(c.id), name: c.fullname, shortName: c.shortname ?? null }));
  }

  /** Posts the notes to the course's announcements forum, with the file attached. */
  async moodlePost(tx: Tx, tenantId: string, userId: string, courseId: string, file: { name: string; mimeType: string; body: Buffer }, title: string, message?: string) {
    const m = await this.moodle(tx, tenantId);
    const mp = multipart('form-data', [{ name: 'token', body: m.token }, { name: 'filearea', body: 'draft' }, { name: 'itemid', body: '0' }, { name: 'file_1', filename: file.name, contentType: file.mimeType, body: file.body }]);
    const up = await this.http.request(`${m.base}/webservice/upload.php`, { method: 'POST', headers: { 'content-type': mp.contentType }, body: mp.body });
    const uploaded = this.parse(up) as { itemid?: number; error?: string }[] | { error?: string };
    const itemid = Array.isArray(uploaded) ? uploaded[0]?.itemid : undefined;
    if (up.status >= 400 || itemid === undefined) throw new BadGatewayException(`Moodle did not take the file${!Array.isArray(uploaded) && uploaded.error ? `: ${uploaded.error}` : ''}`);
    const forums = await this.ws<{ id: number; type: string }[]>(m, 'mod_forum_get_forums_by_courses', { 'courseids[0]': courseId });
    const forum = forums.find((f) => f.type === 'news') ?? forums[0];
    if (!forum) throw new BadGatewayException('This Moodle course has no forum to post to');
    const posted = await this.ws<{ discussionid: number }>(m, 'mod_forum_add_discussion', {
      forumid: String(forum.id),
      subject: title.slice(0, 255),
      message: message ?? title,
      'options[0][name]': 'attachmentsid',
      'options[0][value]': String(itemid),
    });
    await audit(tx, { tenantId, actorType: 'user', actorId: userId, action: 'share.moodle', subjectType: 'user', subjectId: userId, data: { courseId, discussionId: posted.discussionid } });
    return { id: String(posted.discussionid), link: `${m.base}/mod/forum/discuss.php?d=${posted.discussionid}` };
  }
}
