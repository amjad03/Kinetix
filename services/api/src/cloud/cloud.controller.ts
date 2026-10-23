import { BadRequestException, Controller, Delete, Get, HttpCode, Param, Post, Query, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Auth, CurrentPrincipal, TEACHING_ROLES } from '../auth/auth.decorators.js';
import type { BoardPrincipal, UserPrincipal } from '../auth/principal.js';
import { DbService } from '../db/db.service.js';
import { attrEsc, readRawBody } from '../integrations/http.js';
import { CLOUD_PROVIDERS, CloudService, MAX_CLOUD_FILE, type CloudProvider } from './cloud.service.js';

type Caller = BoardPrincipal | UserPrincipal;
/** The teacher behind the call: the board's signed-in teacher, or the teacher in the app. */
const who = (p: Caller) => ({ tenantId: p.tenantId, userId: p.kind === 'board' ? p.teacherId : p.userId });
const origin = (req: Request) => `${req.protocol}://${req.get('host')}`;

function provider(raw: string): CloudProvider {
  if (!CLOUD_PROVIDERS.includes(raw as CloudProvider)) throw new BadRequestException('Unknown cloud service');
  return raw as CloudProvider;
}

/** An uploaded file: the raw request body, named by `?name=`, typed by its content-type. */
async function fileFrom(req: Request, name?: string) {
  const body = await readRawBody(req, MAX_CLOUD_FILE);
  if (body.length === 0) throw new BadRequestException('The file is empty');
  return { name: (name ?? '').trim() || 'Zynetix board.pdf', mimeType: (req.headers['content-type'] ?? 'application/octet-stream').split(';')[0].trim(), body };
}

/**
 * The board's cloud drives and sharing (Zynetix W5): Google Drive and OneDrive import and export,
 * Google Classroom materials and Moodle announcements. Set up by the institution's administrator
 * under Zynetix dashboard → Integrations; each teacher connects their own account by QR.
 */
@Controller('v1')
export class CloudController {
  constructor(
    private readonly db: DbService,
    private readonly cloud: CloudService,
  ) {}

  /** What is set up and connected, for the board's Cloud and Share menus. */
  @Get('cloud')
  @Auth(['board', 'user'], TEACHING_ROLES)
  status(@CurrentPrincipal() p: Caller) {
    const w = who(p);
    return this.db.withTenant(w.tenantId, (tx) => this.cloud.status(tx, w.tenantId, w.userId));
  }

  /** For the administrator setting up Google or Microsoft: the redirect URI to register with them. */
  @Get('cloud/setup')
  @Auth('user', ['tenant_admin', 'principal'])
  setup(@Req() req: Request) {
    return { redirectUri: this.cloud.redirectUri(origin(req)) };
  }

  /** The sign-in link the board shows as a QR; the teacher finishes on their phone. */
  @Post('cloud/:provider/connect')
  @HttpCode(200)
  @Auth(['board', 'user'], TEACHING_ROLES)
  connect(@CurrentPrincipal() p: Caller, @Param('provider') raw: string, @Req() req: Request) {
    const w = who(p);
    return this.db.withTenant(w.tenantId, (tx) => this.cloud.connectUrl(tx, w.tenantId, w.userId, provider(raw), origin(req)));
  }

  /** Google or Microsoft returns here after the teacher signs in on their phone. */
  @Get('cloud/oauth/callback')
  async callback(@Query('code') code: string | undefined, @Query('state') state: string | undefined, @Query('error') error: string | undefined, @Res() res: Response) {
    const page = (title: string, text: string, status = 200) =>
      res
        .status(status)
        .type('html')
        .send(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Zynetix</title></head><body style="font-family:system-ui,sans-serif;max-width:480px;margin:15vh auto;padding:0 16px;text-align:center"><h1 style="font-size:22px">${attrEsc(title)}</h1><p>${attrEsc(text)}</p></body></html>`);
    if (error || !code || !state) return page('Not connected', error === 'access_denied' ? 'You did not allow Zynetix. Start again from the board if you change your mind.' : 'The sign-in did not finish. Start again from the board.', 400);
    try {
      const r = await this.cloud.callback(code, state);
      return page('Connected', `${r.provider === 'google' ? 'Google' : 'Microsoft'}${r.account ? ` (${r.account})` : ''} is connected to Zynetix. Go back to the board.`);
    } catch (e) {
      return page('Not connected', (e as Error).message, 400);
    }
  }

  @Delete('cloud/:provider')
  @HttpCode(204)
  @Auth(['board', 'user'], TEACHING_ROLES)
  async disconnect(@CurrentPrincipal() p: Caller, @Param('provider') raw: string) {
    const w = who(p);
    await this.db.withTenant(w.tenantId, (tx) => this.cloud.disconnect(tx, w.tenantId, w.userId, provider(raw)));
  }

  @Get('cloud/:provider/files')
  @Auth(['board', 'user'], TEACHING_ROLES)
  async files(@CurrentPrincipal() p: Caller, @Param('provider') raw: string, @Query('folder') folder?: string, @Query('q') q?: string) {
    const w = who(p);
    return { files: await this.db.withTenant(w.tenantId, (tx) => this.cloud.list(tx, w.tenantId, w.userId, provider(raw), folder || undefined, q?.trim() || undefined)) };
  }

  /** The file's bytes (import onto the board). */
  @Get('cloud/:provider/files/:id')
  @Auth(['board', 'user'], TEACHING_ROLES)
  async file(@CurrentPrincipal() p: Caller, @Param('provider') raw: string, @Param('id') id: string, @Res() res: Response) {
    const w = who(p);
    const f = await this.db.withTenant(w.tenantId, (tx) => this.cloud.download(tx, w.tenantId, w.userId, provider(raw), id));
    res.setHeader('content-type', f.mimeType);
    res.setHeader('content-disposition', `attachment; filename*=UTF-8''${encodeURIComponent(f.name)}`);
    res.end(f.body);
  }

  /** Saves a board PDF or PPTX to the teacher's drive. */
  @Post('cloud/:provider/files')
  @Auth(['board', 'user'], TEACHING_ROLES)
  async save(@CurrentPrincipal() p: Caller, @Param('provider') raw: string, @Req() req: Request, @Query('name') name?: string, @Query('folder') folder?: string) {
    const w = who(p);
    const pr = provider(raw);
    const file = await fileFrom(req, name);
    return this.db.withTenant(w.tenantId, (tx) => this.cloud.upload(tx, w.tenantId, w.userId, pr, file, folder || undefined));
  }

  @Get('share/classroom/courses')
  @Auth(['board', 'user'], TEACHING_ROLES)
  async classroomCourses(@CurrentPrincipal() p: Caller) {
    const w = who(p);
    return { courses: await this.db.withTenant(w.tenantId, (tx) => this.cloud.classroomCourses(tx, w.tenantId, w.userId)) };
  }

  /** Posts the board's notes (the body: PDF or PPTX) to a Google Classroom course as material. */
  @Post('share/classroom/courses/:courseId')
  @Auth(['board', 'user'], TEACHING_ROLES)
  async classroomPost(@CurrentPrincipal() p: Caller, @Param('courseId') courseId: string, @Req() req: Request, @Query('title') title?: string, @Query('name') name?: string, @Query('text') text?: string) {
    const w = who(p);
    const file = await fileFrom(req, name);
    return this.db.withTenant(w.tenantId, (tx) => this.cloud.classroomPost(tx, w.tenantId, w.userId, courseId, file, title?.trim() || file.name, text));
  }

  @Get('share/moodle/courses')
  @Auth(['board', 'user'], TEACHING_ROLES)
  async moodleCourses(@CurrentPrincipal() p: Caller) {
    const w = who(p);
    return { courses: await this.db.withTenant(w.tenantId, (tx) => this.cloud.moodleCourses(tx, w.tenantId)) };
  }

  /** Posts the board's notes to a Moodle course's announcements, with the file attached. */
  @Post('share/moodle/courses/:courseId')
  @Auth(['board', 'user'], TEACHING_ROLES)
  async moodlePost(@CurrentPrincipal() p: Caller, @Param('courseId') courseId: string, @Req() req: Request, @Query('title') title?: string, @Query('name') name?: string, @Query('text') text?: string) {
    const w = who(p);
    if (!/^\d+$/.test(courseId)) throw new BadRequestException('Unknown course');
    const file = await fileFrom(req, name);
    return this.db.withTenant(w.tenantId, (tx) => this.cloud.moodlePost(tx, w.tenantId, w.userId, courseId, file, title?.trim() || file.name, text));
  }
}
