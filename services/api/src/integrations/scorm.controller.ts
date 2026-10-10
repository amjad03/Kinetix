import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, Header, HttpCode, Inject, NotFoundException, Param, ParseUUIDPipe, Post, Query, Req, Res } from '@nestjs/common';
import { createHmac } from 'node:crypto';
import { extname } from 'node:path';
import type { Request, Response } from 'express';
import { and, desc, eq } from 'drizzle-orm';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { UserPrincipal } from '../auth/principal.js';
import { auditUser } from '../common/audit.js';
import { Clock } from '../common/time.js';
import { ENV, type Env } from '../config/env.js';
import { DbService } from '../db/db.service.js';
import { courses, users } from '../db/schema.js';
import { scormAttempts, scormFiles, scormPackages } from '../db/schema-integrations.js';
import { safeEqual } from './common.js';
import { readRawBody } from './http.js';
import { readZip } from './zip.js';

const AUTHORS = ['teacher', 'hod', 'principal', 'tenant_admin'] as never[];
const MIME: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.htm': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.xml': 'application/xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.mp3': 'audio/mpeg', '.pdf': 'application/pdf', '.woff2': 'font/woff2', '.woff': 'font/woff' };
const attr = (tag: string, name: string) => tag.match(new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, 'i'))?.[1];
const text = (xml: string, tag: string) => xml.match(new RegExp(`<(?:\\w+:)?${tag}[^>]*>([\\s\\S]*?)</(?:\\w+:)?${tag}>`, 'i'))?.[1]?.replace(/<!\[CDATA\[|\]\]>/g, '').trim();
const esc = (s: string) => s.replace(/&amp;/g, '&');

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

/** The LMS side of SCORM: both runtime APIs, in one small script the player page runs. */
const SHIM = `
(function(){
  var cmi = window.__CMI || {}, version = window.__VERSION, token = window.__TOKEN, init = false, err = '0', dirty = false;
  function save(){ if(!dirty) return true; dirty = false; var x = new XMLHttpRequest(); x.open('POST','/v1/scorm/track/'+token,false); x.setRequestHeader('content-type','application/json'); try{ x.send(JSON.stringify({cmi:cmi})); }catch(e){} return true; }
  function init_(){ init = true; err='0'; if(version==='1.2' && !cmi['cmi.core.lesson_status']) cmi['cmi.core.lesson_status']='incomplete'; if(version!=='1.2' && !cmi['cmi.completion_status']) cmi['cmi.completion_status']='incomplete'; return 'true'; }
  function get(k){ if(!init){ err='122'; return ''; } err='0'; return cmi[k] === undefined ? (/_count$/.test(k) ? '0' : '') : cmi[k]; }
  function set(k,v){ if(!init){ err='132'; return 'false'; } err='0'; cmi[k]=String(v); dirty=true; return 'true'; }
  function commit(){ if(!init){ err='142'; return 'false'; } save(); return 'true'; }
  function fin(){ if(!init){ err='112'; return 'false'; } save(); init=false; return 'true'; }
  if(version==='1.2'){
    window.API = { LMSInitialize: init_, LMSFinish: fin, LMSGetValue: get, LMSSetValue: set, LMSCommit: commit, LMSGetLastError: function(){return err;}, LMSGetErrorString: function(){return err==='0'?'No error':'Error '+err;}, LMSGetDiagnostic: function(){return '';} };
  } else {
    window.API_1484_11 = { Initialize: init_, Terminate: fin, GetValue: get, SetValue: set, Commit: commit, GetLastError: function(){return err;}, GetErrorString: function(){return err==='0'?'No error':'Error '+err;}, GetDiagnostic: function(){return '';} };
  }
  window.addEventListener('pagehide', save);
})();`;

/** SCORM 1.2 / 2004 packages: import, a player with tracking, and the attempt report. */
@Controller('v1/scorm')
export class ScormController {
  constructor(private readonly db: DbService, @Inject(ENV) private readonly env: Env, private readonly clock: Clock) {}

  private sign(p: { pkg: string; tenant: string; user: string; exp: number }) {
    const body = Buffer.from(JSON.stringify(p)).toString('base64url');
    return `${body}.${createHmac('sha256', this.env.PAIRING_HMAC_SECRET).update(body).digest('base64url')}`;
  }

  private open(token: string) {
    const [body, sig] = token.split('.');
    if (!body || !sig || !safeEqual(sig, createHmac('sha256', this.env.PAIRING_HMAC_SECRET).update(body).digest('base64url'))) throw new ForbiddenException('This player link is not valid');
    const p = JSON.parse(Buffer.from(body, 'base64url').toString()) as { pkg: string; tenant: string; user: string; exp: number };
    if (p.exp < this.clock.now().getTime()) throw new ForbiddenException('This player link has expired. Open the lesson again');
    return p;
  }

  @Get('packages')
  @Auth('user')
  list(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, (tx) => tx.select({ id: scormPackages.id, title: scormPackages.title, version: scormPackages.version, courseId: scormPackages.courseId, courseName: courses.title, fileCount: scormPackages.fileCount, createdAt: scormPackages.createdAt }).from(scormPackages).leftJoin(courses, eq(courses.id, scormPackages.courseId)).orderBy(desc(scormPackages.createdAt)));
  }

  /** Imports a package: send the .zip as the request body (`?title=` and `?courseId=` are optional). */
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
    const mf = entries.find((e) => e.path.toLowerCase() === 'imsmanifest.xml');
    if (!mf) throw new BadRequestException('This is not a SCORM package: imsmanifest.xml is missing at the top of the zip');
    const m = parseManifest(mf.data.toString('utf8'));
    if (courseId && !/^[0-9a-f-]{36}$/.test(courseId)) throw new BadRequestException('Bad course id');
    return this.db.withTenant(p.tenantId, async (tx) => {
      if (courseId) {
        const [c] = await tx.select({ id: courses.id }).from(courses).where(eq(courses.id, courseId));
        if (!c) throw new NotFoundException('Course not found');
      }
      const [pkg] = await tx.insert(scormPackages).values({ tenantId: p.tenantId, courseId: courseId ?? null, title: (title?.trim() || m.title).slice(0, 200), version: m.version, launchHref: m.launchHref, manifest: { items: m.items }, fileCount: entries.length, createdBy: p.userId }).returning();
      for (let i = 0; i < entries.length; i += 50) {
        await tx.insert(scormFiles).values(entries.slice(i, i + 50).map((e) => ({ tenantId: p.tenantId, packageId: pkg.id, path: e.path, mime: MIME[extname(e.path).toLowerCase()] ?? 'application/octet-stream', content: e.data })));
      }
      await auditUser(tx, p, 'scorm.imported', 'scorm_package', pkg.id, { version: m.version, files: entries.length });
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
      const token = this.sign({ pkg: id, tenant: p.tenantId, user: p.userId, exp: this.clock.now().getTime() + 4 * 3_600_000 });
      return { playerUrl: `/v1/scorm/player/${token}` };
    });
  }

  @Get('player/:token')
  @Header('content-type', 'text/html; charset=utf-8')
  @Header('content-security-policy', "frame-ancestors 'self'")
  async player(@Param('token') token: string) {
    const t = this.open(token);
    return this.db.withTenant(t.tenant, async (tx) => {
      const [pkg] = await tx.select().from(scormPackages).where(eq(scormPackages.id, t.pkg));
      if (!pkg) throw new NotFoundException('Package not found');
      const [att] = await tx.select().from(scormAttempts).where(and(eq(scormAttempts.packageId, t.pkg), eq(scormAttempts.userId, t.user)));
      const json = (v: unknown) => JSON.stringify(v).replace(/</g, '\\u003c');
      return `<!doctype html><html><head><meta charset="utf-8"><title>${pkg.title.replace(/[<&]/g, '')}</title><style>html,body,iframe{margin:0;width:100%;height:100%;border:0}</style><script>window.__CMI=${json(att?.cmi ?? {})};window.__VERSION=${json(pkg.version)};window.__TOKEN=${json(token)};${SHIM}</script></head><body><iframe src="/v1/scorm/content/${token}/${pkg.launchHref.split('/').map(encodeURIComponent).join('/')}" allow="fullscreen"></iframe></body></html>`;
    });
  }

  /** A file of the package, addressed by the player token so relative links inside the content keep working. */
  @Get('content/:token/*path')
  async content(@Param('token') token: string, @Param('path') path: string | string[], @Res() res: Response) {
    const t = this.open(token);
    const rel = (Array.isArray(path) ? path.join('/') : path).replace(/^\/+/, '');
    const file = await this.db.withTenant(t.tenant, async (tx) => (await tx.select().from(scormFiles).where(and(eq(scormFiles.packageId, t.pkg), eq(scormFiles.path, rel))))[0]);
    if (!file) throw new NotFoundException('File not found in the package');
    res.setHeader('content-type', file.mime);
    res.setHeader('x-content-type-options', 'nosniff');
    res.send(file.content);
  }

  /** The shim saves the learner's data here (on commit and on finish). */
  @Post('track/:token')
  @HttpCode(200)
  async track(@Param('token') token: string, @Body() body: { cmi?: Record<string, string> }) {
    const t = this.open(token);
    const cmi = body?.cmi && typeof body.cmi === 'object' ? Object.fromEntries(Object.entries(body.cmi).filter(([k, v]) => /^cmi\.[\w.]+$/.test(k) && typeof v === 'string' && v.length < 4000).slice(0, 300)) : {};
    return this.db.withTenant(t.tenant, async (tx) => {
      const [pkg] = await tx.select({ version: scormPackages.version }).from(scormPackages).where(eq(scormPackages.id, t.pkg));
      if (!pkg) throw new NotFoundException('Package not found');
      const v12 = pkg.version === '1.2';
      const status = v12 ? cmi['cmi.core.lesson_status'] : cmi['cmi.success_status'] && cmi['cmi.success_status'] !== 'unknown' ? cmi['cmi.success_status'] : cmi['cmi.completion_status'];
      const raw = Number(v12 ? cmi['cmi.core.score.raw'] : cmi['cmi.score.raw']);
      const values = { cmi, lessonStatus: status ?? 'incomplete', scoreRaw: Number.isFinite(raw) && (v12 ? cmi['cmi.core.score.raw'] : cmi['cmi.score.raw']) !== '' ? raw : null, totalTime: (v12 ? cmi['cmi.core.total_time'] ?? cmi['cmi.core.session_time'] : cmi['cmi.total_time'] ?? cmi['cmi.session_time']) ?? '', updatedAt: this.clock.now() };
      const [cur] = await tx.select({ id: scormAttempts.id }).from(scormAttempts).where(and(eq(scormAttempts.packageId, t.pkg), eq(scormAttempts.userId, t.user)));
      if (cur) await tx.update(scormAttempts).set(values).where(eq(scormAttempts.id, cur.id));
      else await tx.insert(scormAttempts).values({ tenantId: t.tenant, packageId: t.pkg, userId: t.user, ...values });
      return { saved: true, status: values.lessonStatus, score: values.scoreRaw };
    });
  }

  /** Who has opened the package and how far they got. */
  @Get('packages/:id/attempts')
  @Auth('user', AUTHORS)
  attempts(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, (tx) => tx.select({ userId: scormAttempts.userId, name: users.fullName, status: scormAttempts.lessonStatus, score: scormAttempts.scoreRaw, totalTime: scormAttempts.totalTime, updatedAt: scormAttempts.updatedAt }).from(scormAttempts).innerJoin(users, eq(users.id, scormAttempts.userId)).where(eq(scormAttempts.packageId, id)).orderBy(desc(scormAttempts.updatedAt)));
  }
}
