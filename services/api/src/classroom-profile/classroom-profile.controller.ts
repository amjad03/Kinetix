import { Body, Controller, Get, Header, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { Auth, CurrentPrincipal, STAFF_ADMIN_ROLES, TEACHING_ROLES } from '../auth/auth.decorators.js';
import type { BoardPrincipal, UserPrincipal } from '../auth/principal.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService } from '../db/db.service.js';
import { ClassroomProfileService, TRAINING_STATUSES } from './classroom-profile.service.js';

const OpenBody = z.object({ sectionId: z.uuid(), subjectId: z.uuid().nullish() });
const TrainingBody = z.object({ slotAt: z.iso.datetime(), topic: z.string().trim().min(2).max(200), notes: z.string().max(2000).optional() });
const DecideBody = z.object({ status: z.enum(TRAINING_STATUSES), adminNote: z.string().max(1000).optional() });
const EndBody = z.object({ notes: z.string().max(40_000).optional(), title: z.string().max(200).optional(), publish: z.boolean().optional() });
const LockBody = z.object({ locked: z.boolean() });

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** The board's profile: classrooms taken, training requests, End class with notes, and the class buzzer. */
@Controller('v1/classroom')
export class ClassroomProfileController {
  constructor(
    private readonly db: DbService,
    private readonly svc: ClassroomProfileService,
  ) {}

  /** Your Classrooms: each class and subject the teacher teaches or has taught. */
  @Get('classrooms')
  @Auth(['board', 'user'], TEACHING_ROLES)
  classrooms(@CurrentPrincipal() p: BoardPrincipal | UserPrincipal) {
    const teacherId = p.kind === 'board' ? p.teacherId : p.userId;
    return this.db.withTenant(p.tenantId, (tx) => this.svc.classrooms(tx, teacherId));
  }

  /** Open class: the board's current session switches to one of the teacher's classes. */
  @Post('classrooms/open')
  @HttpCode(200)
  @Auth('board')
  open(@CurrentPrincipal() p: BoardPrincipal, @Body(new ZodBody(OpenBody)) b: z.infer<typeof OpenBody>) {
    return this.db.withTenant(p.tenantId, (tx) => this.svc.openClass(tx, p.tenantId, p.sessionId, p.teacherId, b.sectionId, b.subjectId ?? null));
  }

  @Get('trainings/slots')
  @Auth(['board', 'user'], TEACHING_ROLES)
  slots(@CurrentPrincipal() p: BoardPrincipal | UserPrincipal) {
    return this.db.withTenant(p.tenantId, (tx) => this.svc.trainingSlots(tx));
  }

  @Post('trainings')
  @Auth(['board', 'user'], TEACHING_ROLES)
  requestTraining(@CurrentPrincipal() p: BoardPrincipal | UserPrincipal, @Body(new ZodBody(TrainingBody)) b: z.infer<typeof TrainingBody>) {
    const userId = p.kind === 'board' ? p.teacherId : p.userId;
    return this.db.withTenant(p.tenantId, (tx) => this.svc.requestTraining(tx, p.tenantId, userId, p.kind === 'board' ? p.deviceId : null, b));
  }

  /** The teacher's own requests with their status (the confirmation on the board). */
  @Get('trainings/mine')
  @Auth(['board', 'user'], TEACHING_ROLES)
  mine(@CurrentPrincipal() p: BoardPrincipal | UserPrincipal) {
    return this.db.withTenant(p.tenantId, (tx) => this.svc.myTrainings(tx, p.kind === 'board' ? p.teacherId : p.userId));
  }

  /** ERP: every request of the institution. */
  @Get('trainings')
  @Auth('user', STAFF_ADMIN_ROLES)
  all(@CurrentPrincipal() p: UserPrincipal, @Query('status') status?: string) {
    return this.db.withTenant(p.tenantId, (tx) => this.svc.allTrainings(tx, status));
  }

  @Patch('trainings/:id')
  @Auth('user', STAFF_ADMIN_ROLES)
  decide(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(DecideBody)) b: z.infer<typeof DecideBody>) {
    return this.db.withTenant(p.tenantId, (tx) => this.svc.decideTraining(tx, p.tenantId, p.userId, id, b.status, b.adminNote));
  }

  /** End class: save notes, publish them to the students, close the session, answer a summary. */
  @Post('end')
  @HttpCode(200)
  @Auth('board')
  end(@CurrentPrincipal() p: BoardPrincipal, @Body(new ZodBody(EndBody)) b: z.infer<typeof EndBody>) {
    return this.db.withTenant(p.tenantId, (tx) => this.svc.endClass(tx, p.tenantId, p.sessionId, p.teacherId, b));
  }

  @Get('buzzer')
  @Auth('board')
  buzzer(@CurrentPrincipal() p: BoardPrincipal) {
    return this.db.withTenant(p.tenantId, (tx) => this.svc.buzzerState(tx, p.sessionId));
  }

  /** Open the buzzer to the class, or lock it. */
  @Post('buzzer/lock')
  @HttpCode(200)
  @Auth('board')
  lock(@CurrentPrincipal() p: BoardPrincipal, @Body(new ZodBody(LockBody)) b: z.infer<typeof LockBody>) {
    return this.db.withTenant(p.tenantId, (tx) => this.svc.setBuzzer(tx, p.tenantId, p.sessionId, b.locked));
  }

  @Post('buzzer/reset')
  @HttpCode(200)
  @Auth('board')
  reset(@CurrentPrincipal() p: BoardPrincipal) {
    return this.db.withTenant(p.tenantId, (tx) => this.svc.resetBuzzer(tx, p.tenantId, p.sessionId));
  }
}

/** The Student App's side: the buzzer, and the notes the teacher published. */
@Controller('v1/student')
export class StudentClassroomController {
  constructor(
    private readonly db: DbService,
    private readonly svc: ClassroomProfileService,
  ) {}

  @Get('buzzer')
  @Auth('user', ['student'])
  state(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, (tx) => this.svc.studentBuzzer(tx, p.userId));
  }

  @Post('buzzer/press')
  @HttpCode(200)
  @Auth('user', ['student'])
  press(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, (tx) => this.svc.press(tx, p.tenantId, p.userId));
  }

  @Get('class-notes')
  @Auth('user', ['student'])
  notes(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, (tx) => this.svc.studentNotes(tx, p.userId));
  }
}

/** The link a teacher shares (WhatsApp, QR): a plain page with the notes. The token is unguessable. */
@Controller('v1/class-notes')
export class SharedClassNotesController {
  constructor(private readonly svc: ClassroomProfileService) {}

  @Get(':token')
  @Header('content-type', 'text/html; charset=utf-8')
  async page(@Param('token') token: string) {
    const n = await this.svc.sharedNotes(token);
    return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(n.title)}</title></head><body style="font-family:system-ui;max-width:42rem;margin:2rem auto;padding:0 1rem"><h1>${esc(n.title)}</h1><p>${esc(n.teacher)}</p><pre style="white-space:pre-wrap;font:inherit">${esc(n.notes)}</pre></body></html>`;
  }
}
