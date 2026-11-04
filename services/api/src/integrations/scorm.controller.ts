import { BadRequestException, Body, Controller, Delete, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Query, Req, Res } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { extname } from 'node:path';
import type { Request, Response } from 'express';
import { and, desc, eq } from 'drizzle-orm';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { UserPrincipal } from '../auth/principal.js';
import { auditUser } from '../common/audit.js';
import { Clock } from '../common/time.js';
import { DbService } from '../db/db.service.js';
import { courses, users } from '../db/schema.js';
import { scormAttempts, scormFiles, scormPackages } from '../db/schema-integrations.js';
import { lmsXapiState } from '../db/schema-lms.js';
import { scormOutcome, syncPackageProgress } from '../lms/package-progress.js';
import { readRawBody } from './http.js';
import { packageFileHeaders, PackageTokens } from './package-tokens.js';
import { readZip } from './zip.js';

const AUTHORS = ['teacher', 'hod', 'principal', 'tenant_admin'] as never[];
const MIME: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.htm': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.xml': 'application/xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.mp3': 'audio/mpeg', '.pdf': 'application/pdf', '.woff2': 'font/woff2', '.woff': 'font/woff', '.webp': 'image/webp', '.vtt': 'text/vtt', '.txt': 'text/plain; charset=utf-8' };
const attr = (tag: string, name: string) => tag.match(new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, 'i'))?.[1];
const text = (xml: string, tag: string) => xml.match(new RegExp(`<(?:\\w+:)?${tag}[^>]*>([\\s\\S]*?)</(?:\\w+:)?${tag}>`, 'i'))?.[1]?.replace(/<!\[CDATA\[|\]\]>/g, '').trim();
const esc = (s: string) => s.replace(/&amp;/g, '&');
const PLAYER_TTL = 4 * 3_600_000;
/** Paths inside a package: relative, no parent steps, no scheme. */
const safeRel = (p: string) => !!p && !/^[a-z][a-z0-9+.-]*:/i.test(p) && !p.startsWith('/') && !p.split(/[\\/]/).includes('..');

/** Reads the launch file, title and SCORM version out of an imsmanifest.xml. */
export function parseManifest(xml: string): { title: string; version: '1.2' | '2004'; launchHref: string; items: { id: string; title: string; href: string | null }[] } {
  const schemaVersion = text(xml, 'schemaversion') ?? '';
  const version = /^1\.2/.test(schemaVersion) ? '1.2' : /2004|CAM 1\.3/i.test(schemaVersion) ? '2004' : /adlcp:scormtype|adlcp:scormType/.test(xml) && !/adlseq|imsss/.test(xml) ? '1.2' : '2004';
  const resources = new Map<string, { href: string; base: string }>();
  for (const m of xml.matchAll(/<resource\b[^>]*>/gi)) {
    const href = attr(m[0], 'href');
    const rid = attr(m[0], 'identifier');
    if (rid && href) resources.set(rid, { href: esc(href), base: esc(attr(m[0], 'xml:base') ?? '') });
  }
  const items: { id: string; title: string; href: string | null }[] = [];
  for (const m of xml.matchAll(/<item\b([^>]*)>([\s\S]*?)(?=<item\b|<\/item>|<\/organization>)/gi)) {
    const ref = attr(`<x ${m[1]}>`, 'identifierref');
    const r = ref ? resources.get(ref) : undefined;
    items.push({ id: attr(`<x ${m[1]}>`, 'identifier') ?? '', title: text(m[2], 'title') ?? '', href: r ? r.base + r.href : null });
  }
  const first = items.find((i) => i.href);
  const launchHref = first?.href ?? [...resources.values()][0]?.base + [...resources.values()][0]?.href;
  if (!launchHref || launchHref === 'undefinedundefined') throw new BadRequestException('The package has no launchable content');
  const orgTitle = text(xml.match(/<organization\b[\s\S]*?<\/organization>/i)?.[0] ?? '', 'title') ?? text(xml, 'title') ?? 'SCORM package';
  return { title: orgTitle, version, launchHref, items };
}

/** Reads the first assignable unit of a cmi5 course structure (cmi5.xml): its id, launch file, moveOn and mastery score. */
export function parseCmi5(xml: string): { title: string; auId: string; url: string; moveOn: string; masteryScore: number | null } {
  const au = xml.match(/<au\b([^>]*)>([\s\S]*?)<\/au>/i);
  if (!au) throw new BadRequestException('This cmi5 package has no assignable unit');
  const head = `<x ${au[1]}>`;
  const auId = attr(head, 'id');
  const url = text(au[2], 'url');
  if (!auId || !url) throw new BadRequestException('The assignable unit needs an id and a url');
  if (!safeRel(esc(url).split('?')[0])) throw new BadRequestException('Only units inside the package can be played (the url must be relative)');
  const moveOn = attr(head, 'moveOn') ?? 'NotApplicable';
  if (!['Passed', 'Completed', 'CompletedAndPassed', 'CompletedOrPassed', 'NotApplicable'].includes(moveOn)) throw new BadRequestException('Unknown moveOn rule');
  const ms = attr(head, 'masteryScore');
  const masteryScore = ms !== undefined && Number.isFinite(Number(ms)) && Number(ms) >= 0 && Number(ms) <= 1 ? Number(ms) : null;
  const course = xml.match(/<course\b[\s\S]*?<\/course>/i)?.[0] ?? '';
  const title = text(text(course, 'title') ?? text(au[2], 'title') ?? '', 'langstring') ?? text(au[2], 'title') ?? 'cmi5 course';
  return { title: title.replace(/<[^>]+>/g, '').trim() || 'cmi5 course', auId, url: esc(url), moveOn, masteryScore };
}

/**
 * The SCORM runtime inside every HTML file of a package. The file runs sandboxed on the content origin, so it cannot
 * reach the player's window: it keeps the learner's data in its own window name (which survives page changes inside
 * the frame), answers the SCORM calls itself, and posts the data to the player on commit and finish.
 */
const CONTENT_SHIM = `<script>(function(){
var P='zxscorm:',st={cmi:{},version:'2004'};try{if(window.name&&window.name.indexOf(P)===0)st=JSON.parse(window.name.slice(P.length));}catch(e){}
var cmi=st.cmi||{},version=st.version,init=false,err='0';
function keep(){try{window.name=P+JSON.stringify({cmi:cmi,version:version});}catch(e){}}
function send(op){var w=window.parent,m={zx:'scorm',op:op,cmi:cmi};for(var i=0;i<10&&w;i++){try{w.postMessage(m,'*');}catch(e){}if(w===w.parent)break;w=w.parent;}}
function init_(){init=true;err='0';if(version==='1.2'&&!cmi['cmi.core.lesson_status'])cmi['cmi.core.lesson_status']='incomplete';if(version!=='1.2'&&!cmi['cmi.completion_status'])cmi['cmi.completion_status']='incomplete';keep();return 'true';}
function get(k){if(!init){err=version==='1.2'?'301':'122';return '';}err='0';return cmi[k]===undefined?(/_count$/.test(k)?'0':''):cmi[k];}
function set(k,v){if(!init){err=version==='1.2'?'301':'132';return 'false';}if(!/^cmi\\.[\\w.]+$/.test(k)){err='401';return 'false';}err='0';cmi[k]=String(v);keep();return 'true';}
function commit(){if(!init){err=version==='1.2'?'301':'142';return 'false';}send('commit');return 'true';}
function fin(){if(!init){err=version==='1.2'?'301':'112';return 'false';}send('finish');init=false;return 'true';}
window.addEventListener('message',function(e){var d=e.data;if(d&&d.zx==='scorm'&&d.op==='init'&&d.cmi&&!Object.keys(cmi).length){cmi=d.cmi;version=d.version||version;keep();}});
if(!st.cmi||!Object.keys(st.cmi).length)send('hello');
var api={LMSInitialize:init_,LMSFinish:fin,LMSGetValue:get,LMSSetValue:set,LMSCommit:commit,LMSGetLastError:function(){return err;},LMSGetErrorString:function(c){return (c||err)==='0'?'No error':'Error '+(c||err);},LMSGetDiagnostic:function(){return '';}};
var api04={Initialize:init_,Terminate:fin,GetValue:get,SetValue:set,Commit:commit,GetLastError:function(){return err;},GetErrorString:function(c){return (c||err)==='0'?'No error':'Error '+(c||err);},GetDiagnostic:function(){return '';}};
window.API=api;window.API_1484_11=api04;window.addEventListener('pagehide',function(){if(init)send('commit');});
})();</script>`;

/** Puts the runtime first in the page, so the package finds it before its own scripts run. */
export function injectShim(html: string): string {
  const head = html.match(/<head\b[^>]*>/i);
  if (head) return html.replace(head[0], head[0] + CONTENT_SHIM);
  const root = html.match(/<html\b[^>]*>/i);
  if (root) return html.replace(root[0], root[0] + CONTENT_SHIM);
  return CONTENT_SHIM + html;
}

/**
 * The player page (on the API's origin): it frames the package from the content origin in a sandbox without
 * same-origin, keeps the learner's data, accepts updates only from its own frame, and saves them with its own link.
 */
const PLAYER_SCRIPT = `(function(){
var S=window.__S,f=document.createElement('iframe');
f.setAttribute('sandbox','allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads');
f.setAttribute('allow','fullscreen; autoplay');f.setAttribute('referrerpolicy','no-referrer');f.title=S.title;
if(S.kind==='scorm')f.name='zxscorm:'+JSON.stringify({cmi:S.cmi,version:S.version});
f.src=S.src;document.body.appendChild(f);
function mine(w){for(var i=0;i<12&&w;i++){if(w===f.contentWindow)return true;if(w===w.parent)return false;w=w.parent;}return false;}
function save(){if(S.kind!=='scorm')return;var b=JSON.stringify({cmi:S.cmi});try{fetch('/v1/scorm/track/'+S.token,{method:'POST',headers:{'content-type':'application/json'},body:b,keepalive:b.length<60000});}catch(e){}}
window.addEventListener('message',function(e){if(!mine(e.source))return;var d=e.data;if(!d||d.zx!=='scorm')return;
if(d.op==='hello'){e.source.postMessage({zx:'scorm',op:'init',cmi:S.cmi,version:S.version},'*');return;}
if(d.cmi&&typeof d.cmi==='object'){var c={};for(var k in d.cmi){if(/^cmi\\.[\\w.]+$/.test(k)&&typeof d.cmi[k]==='string'&&d.cmi[k].length<65000)c[k]=d.cmi[k];}S.cmi=c;}
if(d.op==='commit'||d.op==='finish')save();});
window.addEventListener('pagehide',save);
})();`;

/** SCORM 1.2 / 2004 and cmi5 packages: import, a sandboxed player with tracking, and the attempt report. */
@Controller('v1/scorm')
export class ScormController {
  constructor(
    private readonly db: DbService,
    private readonly tokens: PackageTokens,
    private readonly clock: Clock,
  ) {}

  @Get('packages')
  @Auth('user')
  list(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, (tx) => tx.select({ id: scormPackages.id, title: scormPackages.title, version: scormPackages.version, courseId: scormPackages.courseId, courseName: courses.title, fileCount: scormPackages.fileCount, createdAt: scormPackages.createdAt }).from(scormPackages).leftJoin(courses, eq(courses.id, scormPackages.courseId)).orderBy(desc(scormPackages.createdAt)).limit(500));
  }

  /** Imports a package: send the .zip as the request body (`?title=` and `?courseId=` are optional). SCORM needs imsmanifest.xml, cmi5 needs cmi5.xml. */
  @Post('packages')
  @Auth('user', AUTHORS)
  async upload(@CurrentPrincipal() p: UserPrincipal, @Req() req: Request, @Query('title') title?: string, @Query('courseId') courseId?: string) {
    const buf = await readRawBody(req, 50 * 1024 * 1024);
    let entries;
    try {
      entries = readZip(buf);
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
    if (entries.some((e) => !safeRel(e.path))) throw new BadRequestException('The zip has a file outside its own folder');
    const cmi5 = entries.find((e) => e.path.toLowerCase() === 'cmi5.xml');
    const mf = entries.find((e) => e.path.toLowerCase() === 'imsmanifest.xml');
    if (!cmi5 && !mf) throw new BadRequestException('This is not a SCORM or cmi5 package: imsmanifest.xml or cmi5.xml is missing at the top of the zip');
    const pkgInfo = cmi5
      ? (() => {
          const c = parseCmi5(cmi5.data.toString('utf8'));
          return { title: c.title, version: 'cmi5', launchHref: c.url, manifest: { items: [{ id: c.auId, title: c.title, href: c.url }] }, auId: c.auId, moveOn: c.moveOn, masteryScore: c.masteryScore };
        })()
      : (() => {
          const m = parseManifest(mf!.data.toString('utf8'));
          return { title: m.title, version: m.version, launchHref: m.launchHref, manifest: { items: m.items }, auId: null, moveOn: null, masteryScore: null };
        })();
    if (!entries.some((e) => e.path === pkgInfo.launchHref.split('?')[0])) throw new BadRequestException(`The launch file ${pkgInfo.launchHref.split('?')[0]} is not in the zip`);
    if (courseId && !/^[0-9a-f-]{36}$/.test(courseId)) throw new BadRequestException('Bad course id');
    return this.db.withTenant(p.tenantId, async (tx) => {
      if (courseId) {
        const [c] = await tx.select({ id: courses.id }).from(courses).where(eq(courses.id, courseId));
        if (!c) throw new NotFoundException('Course not found');
      }
      const [pkg] = await tx.insert(scormPackages).values({ tenantId: p.tenantId, courseId: courseId ?? null, title: (title?.trim() || pkgInfo.title).slice(0, 200), version: pkgInfo.version, launchHref: pkgInfo.launchHref, manifest: pkgInfo.manifest, fileCount: entries.length, createdBy: p.userId, auId: pkgInfo.auId, moveOn: pkgInfo.moveOn, masteryScore: pkgInfo.masteryScore }).returning();
      for (let i = 0; i < entries.length; i += 50) {
        await tx.insert(scormFiles).values(entries.slice(i, i + 50).map((e) => ({ tenantId: p.tenantId, packageId: pkg.id, path: e.path, mime: MIME[extname(e.path).toLowerCase()] ?? 'application/octet-stream', content: e.data })));
      }
      await auditUser(tx, p, 'scorm.imported', 'scorm_package', pkg.id, { version: pkgInfo.version, files: entries.length });
      return pkg;
    });
  }

  @Delete('packages/:id')
  @HttpCode(204)
  @Auth('user', AUTHORS)
  remove(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const gone = await tx.delete(scormPackages).where(eq(scormPackages.id, id)).returning({ id: scormPackages.id });
      if (!gone.length) throw new NotFoundException('Package not found');
      await auditUser(tx, p, 'scorm.removed', 'scorm_package', id);
    });
  }

  /** A link that opens the player for the signed-in user (valid for four hours). */
  @Post('packages/:id/launch')
  @HttpCode(200)
  @Auth('user')
  launch(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [pkg] = await tx.select({ id: scormPackages.id }).from(scormPackages).where(eq(scormPackages.id, id));
      if (!pkg) throw new NotFoundException('Package not found');
      const token = this.tokens.sign({ s: 'p', pkg: id, tenant: p.tenantId, user: p.userId }, PLAYER_TTL);
      return { playerUrl: `/v1/scorm/player/${token}` };
    });
  }

  @Get('player/:token')
  async player(@Param('token') token: string, @Req() req: Request, @Res() res: Response) {
    const t = this.tokens.open(token, 'p');
    const html = await this.db.withTenant(t.tenant, async (tx) => {
      const [pkg] = await tx.select().from(scormPackages).where(eq(scormPackages.id, t.pkg));
      if (!pkg) throw new NotFoundException('Package not found');
      let [att] = await tx.select().from(scormAttempts).where(and(eq(scormAttempts.packageId, t.pkg), eq(scormAttempts.userId, t.user!)));
      const [who] = await tx.select({ name: users.fullName }).from(users).where(eq(users.id, t.user!));
      const content = this.tokens.sign({ s: 'c', pkg: pkg.id, tenant: t.tenant, o: this.tokens.apiOrigin(req) }, PLAYER_TTL);
      const base = `${this.tokens.contentOrigin(req)}/v1/scorm/content/${content}/`;
      const launch = pkg.launchHref.split('?')[0].split('/').map(encodeURIComponent).join('/');
      let src = base + launch;
      let cmi: Record<string, string> = att?.cmi ?? {};
      if (pkg.version === 'cmi5') {
        // A registration per learner and package (the attempt), LMS.LaunchData in the state store, and the launch parameters.
        if (!att) [att] = await tx.insert(scormAttempts).values({ tenantId: t.tenant, packageId: pkg.id, userId: t.user!, lessonStatus: 'not attempted' }).returning();
        const api = this.tokens.apiOrigin(req);
        const actor = { objectType: 'Agent', name: who?.name ?? 'Learner', account: { homePage: api, name: t.user! } };
        const launchData = { contextTemplate: { extensions: { 'https://w3id.org/xapi/cmi5/context/extensions/sessionid': randomBytes(12).toString('hex') } }, launchMode: 'Normal', moveOn: pkg.moveOn ?? 'NotApplicable', ...(pkg.masteryScore !== null ? { masteryScore: Number(pkg.masteryScore) } : {}) };
        await tx
          .insert(lmsXapiState)
          .values({ tenantId: t.tenant, packageId: pkg.id, userId: t.user!, registration: att.id, activityId: pkg.auId!, stateId: 'LMS.LaunchData', content: JSON.stringify(launchData) })
          .onConflictDoUpdate({ target: [lmsXapiState.packageId, lmsXapiState.userId, lmsXapiState.registration, lmsXapiState.activityId, lmsXapiState.stateId], set: { content: JSON.stringify(launchData), updatedAt: this.clock.now() } });
        const fetchToken = this.tokens.sign({ s: 'f', pkg: pkg.id, tenant: t.tenant, user: t.user!, reg: att.id }, 10 * 60_000);
        const q = new URLSearchParams({ endpoint: `${api}/v1/xapi/`, fetch: `${api}/v1/xapi/fetch/${fetchToken}`, actor: JSON.stringify(actor), registration: att.id, activityId: pkg.auId! });
        src += (pkg.launchHref.includes('?') ? `?${pkg.launchHref.split('?')[1]}&` : '?') + q.toString();
        cmi = {};
      } else if (!att) {
        // The learner's name and id, as SCORM asks the LMS to supply them.
        cmi = pkg.version === '1.2' ? { 'cmi.core.student_id': t.user!, 'cmi.core.student_name': who?.name ?? '' } : { 'cmi.learner_id': t.user!, 'cmi.learner_name': who?.name ?? '' };
      }
      const json = (v: unknown) => JSON.stringify(v).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
      const state = { kind: pkg.version === 'cmi5' ? 'cmi5' : 'scorm', cmi, version: pkg.version, token, src, title: pkg.title };
      return { html: (nonce: string) => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${pkg.title.replace(/[<&>"]/g, '')}</title><style>html,body,iframe{margin:0;width:100%;height:100%;border:0;display:block}</style></head><body><script nonce="${nonce}">window.__S=${json(state)};${PLAYER_SCRIPT}</script></body></html>` };
    });
    const nonce = randomBytes(16).toString('base64');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Security-Policy', `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; frame-src ${this.tokens.contentOrigin(req)}; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors ${this.tokens.playerAncestors()}`);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.send(html.html(nonce));
  }

  /**
   * A file of the package, addressed by a content link (which names no learner) so relative links inside the content
   * keep working. Served sandboxed, and in production only on the separate content host (setup.ts contentHostGuard).
   */
  @Get('content/:token/*path')
  async content(@Param('token') token: string, @Param('path') path: string | string[], @Req() req: Request, @Res() res: Response) {
    const t = this.tokens.open(token, 'c');
    const rel = (Array.isArray(path) ? path.join('/') : path).replace(/^\/+/, '');
    const { file, version } = await this.db.withTenant(t.tenant, async (tx) => {
      const [pkg] = await tx.select({ version: scormPackages.version }).from(scormPackages).where(eq(scormPackages.id, t.pkg));
      if (!pkg) return { file: undefined, version: '' };
      return { file: (await tx.select().from(scormFiles).where(and(eq(scormFiles.packageId, t.pkg), eq(scormFiles.path, rel))))[0], version: pkg.version };
    });
    if (!file) throw new NotFoundException('File not found in the package');
    // The request reached the content host, so the API's origin comes from the (signed) link the player made.
    const api = t.o ?? this.tokens.apiOrigin(req);
    const headers = packageFileHeaders(this.tokens.contentOrigin(req), api, version === 'cmi5' ? `${api}/v1/xapi/` : null);
    for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
    res.setHeader('content-type', file.mime);
    const html = file.mime.startsWith('text/html') && version !== 'cmi5';
    res.send(html ? injectShim(file.content.toString('utf8')) : file.content);
  }

  /** The player saves the learner's data here (on commit and on finish); the course item's progress follows. */
  @Post('track/:token')
  @HttpCode(200)
  async track(@Param('token') token: string, @Body() body: { cmi?: Record<string, string> }) {
    const t = this.tokens.open(token, 'p');
    const cmi = body?.cmi && typeof body.cmi === 'object' && !Array.isArray(body.cmi) ? Object.fromEntries(Object.entries(body.cmi).filter(([k, v]) => /^cmi\.[\w.]+$/.test(k) && typeof v === 'string' && v.length < 65000).slice(0, 400)) : {};
    return this.db.withTenant(t.tenant, async (tx) => {
      const [pkg] = await tx.select({ version: scormPackages.version }).from(scormPackages).where(eq(scormPackages.id, t.pkg));
      if (!pkg) throw new NotFoundException('Package not found');
      if (pkg.version === 'cmi5') throw new BadRequestException('A cmi5 unit reports through xAPI');
      const v12 = pkg.version === '1.2';
      const status = v12 ? cmi['cmi.core.lesson_status'] : cmi['cmi.success_status'] && cmi['cmi.success_status'] !== 'unknown' ? cmi['cmi.success_status'] : cmi['cmi.completion_status'];
      const raw = Number(v12 ? cmi['cmi.core.score.raw'] : cmi['cmi.score.raw']);
      const now = this.clock.now();
      const values = { cmi, lessonStatus: status ?? 'incomplete', scoreRaw: Number.isFinite(raw) && (v12 ? cmi['cmi.core.score.raw'] : cmi['cmi.score.raw']) !== '' && (v12 ? cmi['cmi.core.score.raw'] : cmi['cmi.score.raw']) !== undefined ? raw : null, totalTime: (v12 ? cmi['cmi.core.total_time'] ?? cmi['cmi.core.session_time'] : cmi['cmi.total_time'] ?? cmi['cmi.session_time']) ?? '', updatedAt: now };
      const [cur] = await tx.select({ id: scormAttempts.id }).from(scormAttempts).where(and(eq(scormAttempts.packageId, t.pkg), eq(scormAttempts.userId, t.user!)));
      if (cur) await tx.update(scormAttempts).set(values).where(eq(scormAttempts.id, cur.id));
      else await tx.insert(scormAttempts).values({ tenantId: t.tenant, packageId: t.pkg, userId: t.user!, ...values });
      const itemsDone = await syncPackageProgress(tx, t.tenant, t.pkg, t.user!, scormOutcome(pkg.version, cmi), now);
      return { saved: true, status: values.lessonStatus, score: values.scoreRaw, itemsDone };
    });
  }

  /** Who has opened the package and how far they got. */
  @Get('packages/:id/attempts')
  @Auth('user', AUTHORS)
  attempts(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, (tx) => tx.select({ userId: scormAttempts.userId, name: users.fullName, status: scormAttempts.lessonStatus, score: scormAttempts.scoreRaw, totalTime: scormAttempts.totalTime, updatedAt: scormAttempts.updatedAt }).from(scormAttempts).innerJoin(users, eq(users.id, scormAttempts.userId)).where(eq(scormAttempts.packageId, id)).orderBy(desc(scormAttempts.updatedAt)).limit(2000));
  }
}
