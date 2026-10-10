import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, Header, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Put, Query, Req, UnauthorizedException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import type { Request } from 'express';
import { readRawBody } from './http.js';
import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { BoardPrincipal, DevicePrincipal, UserPrincipal } from '../auth/principal.js';
import { auditUser } from '../common/audit.js';
import { Clock, localParts, zonedToInstant } from '../common/time.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService, type Tx } from '../db/db.service.js';
import { attendanceRecords, guardians, libraryBooks, students, tenants, users, staffAttendance } from '../db/schema.js';
import { accessDevices, credentialTags, deviceEvents, transportBoardings } from '../db/schema-integrations.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { INTEGRATION_ADMIN, safeEqual, sha256 } from './common.js';
import { LibraryDesk } from './library-desk.js';

const ADMIN = [...INTEGRATION_ADMIN, 'hr_manager', 'librarian', 'transport_manager'] as never[];
const Purpose = z.enum(['attendance', 'library', 'transport', 'board_signin']);
const DeviceBody = z.object({
  kind: z.enum(['biometric', 'rfid_reader']),
  vendor: z.enum(['essl', 'zkteco', 'cosec', 'generic']).default('generic'),
  serial: z.string().trim().min(1).max(60),
  name: z.string().trim().min(1).max(100),
  purpose: Purpose,
  location: z.string().trim().max(120).default(''),
  /** routeId and direction for transport readers; boardDeviceId for board sign-in; lateAfter ("09:30") for attendance; tzOffsetMinutes of the device clock. */
  config: z.object({ routeId: z.uuid().optional(), direction: z.enum(['to_school', 'from_school']).optional(), boardDeviceId: z.uuid().optional(), lateAfter: z.string().regex(/^\d{2}:\d{2}$/).optional(), tzOffsetMinutes: z.number().int().min(-720).max(840).optional() }).default({}),
});
const TagBody = z.object({ kind: z.enum(['rfid', 'biometric_pin']), value: z.string().trim().min(1).max(60), subjectType: z.enum(['student', 'staff', 'book']), subjectId: z.uuid() });
const PushBody = z.object({ events: z.array(z.object({ tag: z.string().trim().min(1).max(60), at: z.string().optional(), direction: z.enum(['in', 'out']).optional() })).min(1).max(500) });

type Device = typeof accessDevices.$inferSelect;
interface RawEvent { tag: string; at?: Date; direction?: 'in' | 'out' }
const LATE_TEXT = { en: (n: string, r: string) => ({ title: `${n} boarded the bus`, body: `${n} boarded ${r} just now.` }), hi: (n: string, r: string) => ({ title: `${n} बस में चढ़े`, body: `${n} अभी ${r} में चढ़े हैं।` }), kn: (n: string, r: string) => ({ title: `${n} ಬಸ್ ಹತ್ತಿದ್ದಾರೆ`, body: `${n} ಈಗ ${r} ಹತ್ತಿದ್ದಾರೆ.` }) };

/** Parses a device wall-clock time ("2026-10-13 09:02:11") using the device's offset, or an ISO string with its own zone. */
export function deviceTime(text: string | undefined, tzOffsetMinutes: number, now: Date): Date {
  if (!text) return now;
  if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(text)) return new Date(text);
  const m = text.trim().match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) throw new BadRequestException(`Unreadable time "${text}"`);
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] ?? 0)) - tzOffsetMinutes * 60_000);
}

/** Registry of attendance and RFID devices and tags, the live event feed, and the device-facing push endpoints. */
@Controller('v1')
export class DevicesController {
  private readonly desk: LibraryDesk;
  constructor(private readonly db: DbService, private readonly clock: Clock, private readonly notifications: NotificationsService) {
    this.desk = new LibraryDesk(clock, notifications);
  }

  // ---- registry -----------------------------------------------------------------------------

  @Get('access-devices')
  @Auth('user', ADMIN)
  list(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const rows = await tx.select({ id: accessDevices.id, kind: accessDevices.kind, vendor: accessDevices.vendor, serial: accessDevices.serial, name: accessDevices.name, purpose: accessDevices.purpose, location: accessDevices.location, config: accessDevices.config, active: accessDevices.active, lastSeenAt: accessDevices.lastSeenAt }).from(accessDevices).orderBy(accessDevices.name);
      return rows;
    });
  }

  /** Registers a device. The device key is shown once; put it in the device's server URL or header. */
  @Post('access-devices')
  @Auth('user', ADMIN)
  create(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(DeviceBody)) b: z.infer<typeof DeviceBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [dup] = await tx.select({ id: accessDevices.id }).from(accessDevices).where(eq(accessDevices.serial, b.serial));
      if (dup) throw new BadRequestException('A device with that serial number is already registered');
      if (b.purpose === 'transport' && !b.config.routeId) throw new BadRequestException('A transport reader needs its route');
      const secret = randomBytes(24).toString('base64url');
      const [row] = await tx.insert(accessDevices).values({ tenantId: p.tenantId, ...b, keyHash: sha256(secret), createdBy: p.userId }).returning({ id: accessDevices.id, serial: accessDevices.serial, name: accessDevices.name });
      await auditUser(tx, p, 'access_device.registered', 'access_device', row.id, { serial: b.serial, purpose: b.purpose });
      return { ...row, deviceKey: `${p.tenantId}.${row.id}.${secret}` };
    });
  }

  @Post('access-devices/:id/rotate-key')
  @HttpCode(200)
  @Auth('user', ADMIN)
  rotate(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const secret = randomBytes(24).toString('base64url');
      const [row] = await tx.update(accessDevices).set({ keyHash: sha256(secret) }).where(eq(accessDevices.id, id)).returning({ id: accessDevices.id });
      if (!row) throw new NotFoundException('Device not found');
      await auditUser(tx, p, 'access_device.key_rotated', 'access_device', id);
      return { id, deviceKey: `${p.tenantId}.${id}.${secret}` };
    });
  }

  @Put('access-devices/:id/active')
  @Auth('user', ADMIN)
  setActive(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(z.object({ active: z.boolean() }))) b: { active: boolean }) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const [row] = await tx.update(accessDevices).set({ active: b.active }).where(eq(accessDevices.id, id)).returning({ id: accessDevices.id, active: accessDevices.active });
      if (!row) throw new NotFoundException('Device not found');
      await auditUser(tx, p, 'access_device.active_changed', 'access_device', id, b);
      return row;
    });
  }

  // ---- tags ---------------------------------------------------------------------------------

  @Get('credential-tags')
  @Auth('user', ADMIN)
  tags(@CurrentPrincipal() p: UserPrincipal, @Query('subjectType') subjectType?: string) {
    return this.db.withTenant(p.tenantId, (tx) => tx.select().from(credentialTags).where(subjectType ? eq(credentialTags.subjectType, subjectType) : undefined).orderBy(desc(credentialTags.createdAt)).limit(500));
  }

  @Post('credential-tags')
  @Auth('user', ADMIN)
  addTag(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(TagBody)) b: z.infer<typeof TagBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const subject = b.subjectType === 'student' ? await tx.select({ id: students.id }).from(students).where(eq(students.id, b.subjectId)) : b.subjectType === 'book' ? await tx.select({ id: libraryBooks.id }).from(libraryBooks).where(eq(libraryBooks.id, b.subjectId)) : await tx.select({ id: users.id }).from(users).where(eq(users.id, b.subjectId));
      if (!subject.length) throw new NotFoundException(`That ${b.subjectType} does not exist`);
      const [dup] = await tx.select({ id: credentialTags.id }).from(credentialTags).where(and(eq(credentialTags.kind, b.kind), eq(credentialTags.value, b.value)));
      if (dup) throw new BadRequestException('That tag is already registered');
      const [row] = await tx.insert(credentialTags).values({ tenantId: p.tenantId, ...b }).returning();
      await auditUser(tx, p, 'credential_tag.registered', 'credential_tag', row.id, { subjectType: b.subjectType });
      return row;
    });
  }

  @Delete('credential-tags/:id')
  @HttpCode(204)
  @Auth('user', ADMIN)
  removeTag(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const gone = await tx.delete(credentialTags).where(eq(credentialTags.id, id)).returning({ id: credentialTags.id });
      if (!gone.length) throw new NotFoundException('Tag not found');
      await auditUser(tx, p, 'credential_tag.removed', 'credential_tag', id);
    });
  }

  /** Recent device events with what each one did. */
  @Get('device-events')
  @Auth('user', ADMIN)
  events(@CurrentPrincipal() p: UserPrincipal, @Query('outcome') outcome?: string) {
    return this.db.withTenant(p.tenantId, (tx) =>
      tx.select({ id: deviceEvents.id, device: accessDevices.name, purpose: accessDevices.purpose, tag: deviceEvents.tagValue, eventAt: deviceEvents.eventAt, direction: deviceEvents.direction, outcome: deviceEvents.outcome, detail: deviceEvents.detail, subjectType: deviceEvents.subjectType, subjectId: deviceEvents.subjectId })
        .from(deviceEvents).innerJoin(accessDevices, eq(accessDevices.id, deviceEvents.deviceId)).where(outcome ? eq(deviceEvents.outcome, outcome) : undefined).orderBy(desc(deviceEvents.eventAt)).limit(200),
    );
  }

  /** The teacher who last tapped at the sign-in reader beside this board (within two minutes), for the board to greet. */
  @Get('devices/teacher-tap')
  @Auth(['device', 'board'])
  async teacherTap(@CurrentPrincipal() p: DevicePrincipal | BoardPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const since = new Date(this.clock.now().getTime() - 120_000);
      const [row] = await tx
        .select({ at: deviceEvents.eventAt, userId: deviceEvents.subjectId, name: users.fullName })
        .from(deviceEvents).innerJoin(accessDevices, eq(accessDevices.id, deviceEvents.deviceId)).innerJoin(users, eq(users.id, deviceEvents.subjectId))
        .where(and(eq(accessDevices.purpose, 'board_signin'), sql`${accessDevices.config}->>'boardDeviceId' = ${p.deviceId}`, eq(deviceEvents.outcome, 'signed_in'), gte(deviceEvents.eventAt, since)))
        .orderBy(desc(deviceEvents.eventAt)).limit(1);
      return { present: await this.boardReaderPresent(tx, p.deviceId), signedIn: row ?? null };
    });
  }

  private async boardReaderPresent(tx: Tx, boardDeviceId: string) {
    const [r] = await tx.select({ n: sql<number>`count(*)::int` }).from(accessDevices).where(and(eq(accessDevices.purpose, 'board_signin'), eq(accessDevices.active, true), sql`${accessDevices.config}->>'boardDeviceId' = ${boardDeviceId}`));
    return r.n > 0;
  }

  // ---- device-facing endpoints (no user session; the device key is the credential) -------------

  /** Generic push: `{ events: [{ tag, at?, direction? }] }` with `x-device-key`. */
  @Post('device-ingest/events')
  @HttpCode(200)
  async push(@Req() req: { headers: Record<string, string | undefined> }, @Body(new ZodBody(PushBody)) b: z.infer<typeof PushBody>) {
    const key = req.headers['x-device-key'];
    return this.run(key, (device, now) => b.events.map((e) => ({ tag: e.tag, at: deviceTime(e.at, (device.config.tzOffsetMinutes as number | undefined) ?? 330, now), direction: e.direction })));
  }

  /** eSSL / ZKTeco ADMS handshake (the device asks for its options before pushing). */
  @Get('device-ingest/adms/:key/iclock/cdata')
  @Header('content-type', 'text/plain')
  async admsHello(@Param('key') key: string, @Query('SN') sn?: string) {
    await this.run(key, () => [], sn);
    return `GET OPTION FROM: ${sn ?? ''}\nStamp=9999\nOpStamp=9999\nErrorDelay=30\nDelay=10\nTransTimes=00:00;14:05\nTransInterval=1\nTransFlag=1111000000\nRealtime=1\nEncrypt=0`;
  }

  /** ADMS push: `table=ATTLOG`, one tab-separated line per punch (PIN, time, status, verify mode). */
  @Post('device-ingest/adms/:key/iclock/cdata')
  @HttpCode(200)
  @Header('content-type', 'text/plain')
  async adms(@Param('key') key: string, @Query('SN') sn: string | undefined, @Query('table') table: string | undefined, @Req() req: Request) {
    const text = (await readRawBody(req, 2 * 1024 * 1024)).toString('utf8');
    if (table !== 'ATTLOG') return 'OK: 0';
    const res = await this.run(key, (device, now) => {
      const off = (device.config.tzOffsetMinutes as number | undefined) ?? 330;
      return text.split(/\r?\n/).filter((l) => l.trim()).map((l) => {
        const [pin, time, status] = l.split('\t');
        return { tag: pin.trim(), at: deviceTime(time, off, now), direction: status === '1' || status === '5' ? ('out' as const) : ('in' as const) };
      });
    }, sn);
    return `OK: ${res.processed}`;
  }

  /** Matrix COSEC style push: `{ userid, date: "13/10/2026", time: "09:02:11", entryexit: 0|1 }` (or an array of them). */
  @Post('device-ingest/cosec/:key')
  @HttpCode(200)
  async cosec(@Param('key') key: string, @Body() body: unknown) {
    const list = (Array.isArray(body) ? body : [body]) as { userid?: string | number; date?: string; time?: string; entryexit?: number | string }[];
    return this.run(key, (device, now) => {
      const off = (device.config.tzOffsetMinutes as number | undefined) ?? 330;
      return list.map((e) => {
        if (e?.userid === undefined) throw new BadRequestException('Each punch needs a userid');
        const d = e.date?.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
        return { tag: String(e.userid), at: deviceTime(d ? `${d[3]}-${d[2]}-${d[1]} ${e.time ?? '00:00:00'}` : undefined, off, now), direction: String(e.entryexit) === '1' ? ('out' as const) : ('in' as const) };
      });
    });
  }

  private async run(key: string | undefined, parse: (device: Device, now: Date) => RawEvent[], serial?: string) {
    const parts = (key ?? '').split('.');
    if (parts.length !== 3 || !/^[0-9a-f-]{36}$/.test(parts[0]) || !/^[0-9a-f-]{36}$/.test(parts[1])) throw new UnauthorizedException('Missing or malformed device key');
    const [tenantId, deviceId, secret] = parts;
    return this.db.withTenant(tenantId, async (tx) => {
      const [device] = await tx.select().from(accessDevices).where(eq(accessDevices.id, deviceId));
      if (!device || !device.active || !safeEqual(device.keyHash, sha256(secret))) throw new UnauthorizedException('Unknown device or wrong key');
      if (serial && serial !== device.serial) throw new ForbiddenException('That key belongs to another device');
      const now = this.clock.now();
      await tx.update(accessDevices).set({ lastSeenAt: now }).where(eq(accessDevices.id, device.id));
      const events = parse(device, now);
      const outcomes: Record<string, number> = {};
      for (const e of events) {
        const o = await this.process(tx, tenantId, device, e);
        outcomes[o] = (outcomes[o] ?? 0) + 1;
      }
      return { processed: events.length, outcomes };
    });
  }

  /** Maps one punch or tap to attendance, a library transaction or a boarding. */
  private async process(tx: Tx, tenantId: string, device: Device, e: RawEvent): Promise<string> {
    const tagKind = device.kind === 'biometric' ? 'biometric_pin' : 'rfid';
    const [tag] = await tx.select().from(credentialTags).where(and(eq(credentialTags.kind, tagKind), eq(credentialTags.value, e.tag), eq(credentialTags.active, true)));
    const [ev] = await tx.insert(deviceEvents).values({ tenantId, deviceId: device.id, tagKind, tagValue: e.tag, eventAt: e.at!, direction: e.direction ?? 'in', outcome: 'received', subjectType: tag?.subjectType ?? null, subjectId: tag?.subjectId ?? null }).onConflictDoNothing().returning({ id: deviceEvents.id });
    if (!ev) return 'duplicate';
    const finish = async (outcome: string, detail: Record<string, unknown> = {}) => {
      await tx.update(deviceEvents).set({ outcome, detail }).where(eq(deviceEvents.id, ev.id));
      return outcome;
    };
    if (!tag) return finish('unmapped');
    const [t] = await tx.select({ tz: tenants.timezone }).from(tenants);
    const local = localParts(e.at!, t?.tz ?? 'Asia/Kolkata');
    switch (device.purpose) {
      case 'attendance':
      case 'board_signin': {
        if (tag.subjectType === 'staff') {
          await this.staffPunch(tx, tenantId, tag.subjectId, local.date, e.at!);
          return finish(device.purpose === 'board_signin' ? 'signed_in' : 'attendance_marked', { date: local.date });
        }
        if (tag.subjectType === 'student' && device.purpose === 'attendance') {
          const [s] = await tx.select({ sectionId: students.sectionId }).from(students).where(eq(students.id, tag.subjectId));
          if (!s) return finish('rejected', { reason: 'student_missing' });
          const lateAfter = device.config.lateAfter as string | undefined;
          const status = lateAfter && local.time.slice(0, 5) > lateAfter ? 'late' : 'present';
          const done = await tx.insert(attendanceRecords).values({ tenantId, studentId: tag.subjectId, sectionId: s.sectionId, date: local.date, timetableSlotId: null, status, markedBy: device.createdBy, occurredAt: e.at! }).onConflictDoNothing().returning({ id: attendanceRecords.id });
          return finish(done.length ? 'attendance_marked' : 'already_marked', { date: local.date, status });
        }
        return finish('rejected', { reason: 'tag_not_valid_here' });
      }
      case 'library':
        return this.libraryTap(tx, tenantId, device, tag, e, finish);
      case 'transport': {
        if (tag.subjectType !== 'student') return finish('rejected', { reason: 'not_a_student' });
        const routeId = (device.config.routeId as string | undefined) ?? null;
        const [dup] = await tx.select({ id: transportBoardings.id }).from(transportBoardings).where(and(eq(transportBoardings.studentId, tag.subjectId), eq(transportBoardings.onDate, local.date), routeId ? eq(transportBoardings.routeId, routeId) : undefined, gte(transportBoardings.boardedAt, new Date(e.at!.getTime() - 30 * 60_000))));
        if (dup) return finish('already_boarded');
        await tx.insert(transportBoardings).values({ tenantId, studentId: tag.subjectId, routeId, deviceId: device.id, boardedAt: e.at!, onDate: local.date });
        const [s] = await tx.select({ name: students.fullName }).from(students).where(eq(students.id, tag.subjectId));
        const family = await tx.select({ userId: guardians.userId }).from(guardians).where(eq(guardians.studentId, tag.subjectId));
        if (family.length) {
          const r = (device.name || 'the school bus').slice(0, 60);
          const n = s?.name ?? 'Your child';
          await this.notifications.notifyUsers(tx, family.map((g) => g.userId), { kind: 'transport', text: { en: LATE_TEXT.en(n, r), hi: LATE_TEXT.hi(n, r), kn: LATE_TEXT.kn(n, r) }, data: { studentId: tag.subjectId }, dedupeKey: `boarding:${ev.id}` });
        }
        return finish('boarded', { parentsNotified: family.length });
      }
    }
    return finish('rejected');
  }

  private async staffPunch(tx: Tx, tenantId: string, userId: string, date: string, at: Date) {
    const [cur] = await tx.select().from(staffAttendance).where(and(eq(staffAttendance.userId, userId), eq(staffAttendance.date, date)));
    if (!cur) {
      await tx.insert(staffAttendance).values({ tenantId, userId, date, status: 'present', checkInAt: at, source: 'biometric' });
      return;
    }
    const first = cur.checkInAt && cur.checkInAt < at ? cur.checkInAt : at;
    const last = cur.checkOutAt && cur.checkOutAt > at ? cur.checkOutAt : cur.checkInAt && cur.checkInAt >= at ? cur.checkInAt : at;
    await tx.update(staffAttendance).set({ checkInAt: first, checkOutAt: last > first ? last : null, status: cur.status === 'absent' ? 'present' : cur.status }).where(and(eq(staffAttendance.userId, userId), eq(staffAttendance.date, date)));
  }

  /** Library reader: a student's card selects the patron; a book tag then issues it to them, or returns it when it is out. */
  private async libraryTap(tx: Tx, tenantId: string, device: Device, tag: typeof credentialTags.$inferSelect, e: RawEvent, finish: (o: string, d?: Record<string, unknown>) => Promise<string>) {
    if (tag.subjectType === 'student') return finish('patron_selected');
    if (tag.subjectType !== 'book') return finish('rejected', { reason: 'tag_not_valid_here' });
    const [{ open }] = await tx.select({ open: sql<number>`count(*)::int` }).from(sql`library_loans`).where(sql`book_id = ${tag.subjectId} and returned_at is null`);
    if (open > 0) {
      const r = await this.desk.giveBack(tx, tenantId, device.createdBy, tag.subjectId);
      return finish(r.ok ? 'returned' : 'rejected', r.ok ? { loanId: r.loanId, finePaise: r.fineP } : { reason: r.reason });
    }
    const since = new Date(e.at!.getTime() - 120_000);
    const [patron] = await tx
      .select({ studentId: deviceEvents.subjectId })
      .from(deviceEvents)
      .where(and(eq(deviceEvents.deviceId, device.id), eq(deviceEvents.outcome, 'patron_selected'), gte(deviceEvents.eventAt, since), sql`${deviceEvents.eventAt} <= ${e.at!}`))
      .orderBy(desc(deviceEvents.eventAt)).limit(1);
    if (!patron?.studentId) return finish('rejected', { reason: 'tap_student_card_first' });
    const r = await this.desk.issue(tx, tenantId, device.createdBy, tag.subjectId, patron.studentId);
    return finish(r.ok ? 'issued' : 'rejected', r.ok ? { loanId: r.loanId, dueOn: r.dueOn } : { reason: r.reason });
  }
}
