import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Put, Query, Res, StreamableFile } from '@nestjs/common';
import { and, asc, eq, gte, inArray, lte, notInArray, sql } from 'drizzle-orm';
import type { Response } from 'express';
import { z } from 'zod';
import { Auth, CurrentPrincipal } from '../auth/auth.decorators.js';
import type { UserPrincipal } from '../auth/principal.js';
import { auditUser } from '../common/audit.js';
import { Day } from '../common/ops.js';
import { writeXlsx } from '../common/xlsx.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService } from '../db/db.service.js';
import { committeeActionItems, committeeMeetings, committeeMembers, committees, students, tenants, userRoles, users } from '../db/schema.js';
import { studentProfiles } from '../db/schema-sis.js';
import { committeeAgendaItems, committeeMeetingAttendance, committeeMinuteSignoffs } from '../db/schema-governance-pass.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { found, hasRole } from '../placements/placements.access.js';
import { TASK_ROLES } from '../tasks/tasks.controller.js';
import { qualified } from '../campus-life/kit-shared.js';
import { CommitteeGovService, GOV_COMMITTEE_ROLES } from './committee-gov.service.js';
import { govTexts } from './governance-texts.js';
import { minutesPdf } from './minutes-pdf.js';
import { COMMITTEE_KINDS, COMMITTEE_RULES, issueText, MEMBER_CATEGORIES, MEMBER_ROLES, ruleOf } from './statutory.js';

const Text = (max: number) => z.string().trim().max(max);
const Profile = z
  .object({
    kind: z.enum(COMMITTEE_KINDS),
    mandate: Text(2000),
    meetingsPerYear: z.number().int().min(0).max(52),
    quorumPct: z.number().int().min(1).max(100),
    constitutedOn: Day.nullable(),
    orderRef: Text(200),
    public: z.boolean(),
    helpline: Text(40),
    email: z.union([z.literal(''), z.email()]),
  })
  .partial();
const MemberBody = z
  .object({
    userId: z.uuid().optional(),
    /** A student member (SGRC, anti-ragging committee) by roll number. */
    rollNo: Text(40).optional(),
    name: Text(160).optional(),
    role: z.enum(MEMBER_ROLES).default('member'),
    category: z.enum(MEMBER_CATEGORIES).default('internal'),
    gender: z.enum(['', 'female', 'male', 'other']).optional(),
    designation: Text(160).default(''),
    phone: Text(20).default(''),
    contactPublic: z.boolean().default(false),
    tenureStart: Day,
    tenureEnd: Day.nullable().optional(),
  })
  .refine((b) => !!b.userId || !!b.rollNo || !!b.name, { message: 'Choose a person or type the outside member’s name', path: ['name'] })
  .refine((b) => !b.tenureEnd || b.tenureEnd >= b.tenureStart, { message: 'The tenure cannot end before it starts', path: ['tenureEnd'] });
const MemberPatch = z.object({ role: z.enum(MEMBER_ROLES), category: z.enum(MEMBER_CATEGORIES), gender: z.enum(['', 'female', 'male', 'other']), designation: Text(160), phone: Text(20), contactPublic: z.boolean(), tenureEnd: Day.nullable() }).partial();
const MeetingBody = z.object({ title: z.string().trim().min(2).max(160), meetingOn: Day, startsAt: z.union([z.literal(''), z.string().regex(/^\d{2}:\d{2}$/)]).default(''), venue: Text(160).default(''), agenda: z.array(z.object({ title: z.string().trim().min(2).max(300), presenter: Text(120).default('') })).max(40).default([]) });
const Details = z.object({ title: z.string().trim().min(2).max(160), meetingOn: Day, startsAt: z.union([z.literal(''), z.string().regex(/^\d{2}:\d{2}$/)]), venue: Text(160), minutes: Text(20000) }).partial();
const AgendaBody = z.object({ items: z.array(z.object({ title: z.string().trim().min(2).max(300), presenter: Text(120).default(''), discussion: Text(4000).default(''), resolution: Text(4000).default(''), outcome: z.enum(['pending', 'resolved', 'deferred', 'noted', 'rejected']).default('pending') })).max(40) });
const AttendanceBody = z.object({ entries: z.array(z.object({ memberId: z.uuid(), status: z.enum(['present', 'absent', 'leave']) })).max(200) });
const SignBody = z.object({ decision: z.enum(['approve', 'object']), comment: Text(1000).default('') }).refine((b) => b.decision === 'approve' || b.comment.length >= 3, { message: 'Say what is wrong with the minutes', path: ['comment'] });
const ActionBody = z.object({ title: z.string().trim().min(2).max(240), ownerUserId: z.uuid(), dueOn: Day, agendaItemId: z.uuid().optional() });
const ReportBody = z.object({ actionTaken: z.string().trim().min(3).max(4000), status: z.enum(['in_progress', 'done']).default('done'), evidenceUrl: z.union([z.literal(''), z.url().max(500)]).default('') });

/**
 * Statutory committees for governance: the catalogue of the committees a college must keep (IQAC, anti-ragging, ICC,
 * SGRC, SC/ST cell, governing body and the rest) with their composition checked against the regulation; meetings with
 * notice, agenda items and resolutions, attendance and quorum; minutes circulated to the members who were present,
 * approved and signed by them; and the action-taken report. Committees, members and meetings are the campus-life
 * tables; this adds what governance needs on top.
 */
@Controller('v1/governance/committees')
export class CommitteesGovController {
  constructor(
    private readonly db: DbService,
    private readonly svc: CommitteeGovService,
    private readonly notifications: NotificationsService,
  ) {}

  /** The statutory catalogue: what each committee needs and the regulation behind it. */
  @Get('catalogue')
  @Auth('user', TASK_ROLES)
  catalogue() {
    return COMMITTEE_RULES;
  }

  /** Staff who can be members, for the pickers (students are added by roll number, outsiders by name). */
  @Get('people')
  @Auth('user', GOV_COMMITTEE_ROLES)
  people(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) =>
      tx
        .selectDistinct({ id: users.id, name: users.fullName })
        .from(users)
        .innerJoin(userRoles, eq(userRoles.userId, users.id))
        .where(and(eq(users.status, 'active'), notInArray(userRoles.role, ['student', 'guardian', 'alumni', 'external_examiner'])))
        .orderBy(asc(users.fullName))
        .limit(1000),
    );
  }

  /** Every committee against its rule this year, and the required ones not yet constituted. */
  @Get('compliance')
  @Auth('user', GOV_COMMITTEE_ROLES)
  compliance(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, (tx) => this.svc.compliance(tx));
  }

  /** Creates the statutory committees that are missing (all required ones, or the kinds named), with their norms. */
  @Post('setup')
  @HttpCode(200)
  @Auth('user', GOV_COMMITTEE_ROLES)
  setup(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(z.object({ kinds: z.array(z.enum(COMMITTEE_KINDS)).max(20).optional() }))) b: { kinds?: string[] }) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const today = await this.svc.today(tx);
      const have = new Set((await tx.select({ kind: committees.kind }).from(committees)).map((r) => r.kind));
      const want = COMMITTEE_RULES.filter((r) => (b.kinds ? b.kinds.includes(r.kind) : r.required) && !have.has(r.kind));
      const made: string[] = [];
      for (const r of want) {
        const [row] = await tx
          .insert(committees)
          .values({ tenantId: p.tenantId, name: r.name, statutory: true, kind: r.kind, mandate: r.mandate, description: r.basis, meetingsPerYear: r.meetingsPerYear, quorumPct: r.quorumPct, public: r.public, constitutedOn: today })
          .onConflictDoNothing()
          .returning({ id: committees.id });
        if (row) made.push(r.kind);
      }
      await auditUser(tx, p, 'committee.statutory_setup', 'committee', undefined, { created: made });
      return { created: made };
    });
  }

  /** One committee: profile, members with composition issues, this year's meetings and the action items. */
  @Get(':id')
  @Auth('user', TASK_ROLES)
  async detail(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const c = found((await tx.select().from(committees).where(eq(committees.id, id)))[0], 'Committee');
      if (!hasRole(p, GOV_COMMITTEE_ROLES) && !(await this.svc.isMember(tx, p, id))) throw new NotFoundException('Committee not found');
      const today = await this.svc.today(tx);
      const rule = ruleOf(c.kind);
      const members = await this.svc.members(tx, [id]);
      const comp = (await this.svc.compliance(tx)).committees.find((x) => x.id === id);
      const meetings = await tx
        .select({ m: committeeMeetings, actions: sql<number>`(select count(*)::int from committee_action_items a where a.meeting_id = ${qualified('committee_meetings')})`, present: sql<number>`(select count(*)::int from committee_meeting_attendance a where a.meeting_id = ${qualified('committee_meetings')} and a.status = 'present')` })
        .from(committeeMeetings)
        .where(eq(committeeMeetings.committeeId, id))
        .orderBy(sql`${committeeMeetings.meetingOn} desc`)
        .limit(100);
      return {
        ...c,
        rule: rule ?? null,
        canManage: await this.svc.canManage(tx, p, id),
        members: members.map((m) => ({ id: m.id, userId: m.userId, name: m.displayName, role: m.role, category: m.category, gender: m.gender, designation: m.designation, phone: hasRole(p, GOV_COMMITTEE_ROLES) ? m.phone : undefined, contactPublic: m.contactPublic, tenureStart: m.tenureStart, tenureEnd: m.tenureEnd, current: m.tenureStart <= today && (!m.tenureEnd || m.tenureEnd >= today) })),
        compliance: comp ? { ...comp, issueTexts: comp.issues.map(issueText) } : null,
        meetings: meetings.map((r) => ({ id: r.m.id, title: r.m.title, meetingOn: r.m.meetingOn, startsAt: r.m.startsAt, venue: r.m.venue, status: r.m.status, minutesStatus: r.m.minutesStatus, noticeSentAt: r.m.noticeSentAt, actions: r.actions, present: r.present })),
      };
    });
  }

  @Put(':id/profile')
  @Auth('user', GOV_COMMITTEE_ROLES)
  profile(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(Profile)) b: z.infer<typeof Profile>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const before = found((await tx.select().from(committees).where(eq(committees.id, id)).for('update'))[0], 'Committee');
      const rule = b.kind ? ruleOf(b.kind) : undefined;
      const set = { ...b, ...(b.kind && b.kind !== 'other' ? { statutory: true } : {}), ...(rule && b.meetingsPerYear === undefined && before.meetingsPerYear === 0 ? { meetingsPerYear: rule.meetingsPerYear } : {}) };
      const [row] = await tx.update(committees).set(set).where(eq(committees.id, id)).returning();
      await auditUser(tx, p, 'committee.profile_updated', 'committee', id, { changes: Object.keys(b) });
      return row;
    });
  }

  // ---- members ------------------------------------------------------------------------------------------------

  /** A member with an account (staff, student) or an outside member by name (NGO, lawyer, police, parent nominee). */
  @Post(':id/members')
  @Auth('user', GOV_COMMITTEE_ROLES)
  addMember(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(MemberBody)) b: z.infer<typeof MemberBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      found((await tx.select({ id: committees.id }).from(committees).where(eq(committees.id, id)))[0], 'Committee');
      if (b.userId) found((await tx.select({ id: users.id }).from(users).where(eq(users.id, b.userId)))[0], 'Person');
      let userId = b.userId ?? null;
      if (!userId && b.rollNo) {
        const st = await tx.select({ userId: students.userId, gender: studentProfiles.gender }).from(students).leftJoin(studentProfiles, eq(studentProfiles.studentId, students.id)).where(and(eq(students.rollNo, b.rollNo), eq(students.status, 'active')));
        if (st.length !== 1) throw new BadRequestException(st.length ? 'Two students have this roll number; choose the person instead' : 'No student has this roll number');
        if (!st[0].userId) throw new BadRequestException('This student has no app account yet');
        userId = st[0].userId;
        b.gender ??= (st[0].gender ?? '').toLowerCase().startsWith('f') ? 'female' : (st[0].gender ?? '').toLowerCase().startsWith('m') ? 'male' : undefined;
        b.category = 'student';
      }
      const gender = b.gender ?? (userId ? await this.svc.staffGender(tx, userId) : '');
      const [row] = await tx.insert(committeeMembers).values({ tenantId: p.tenantId, committeeId: id, userId, name: userId ? '' : (b.name ?? ''), role: b.role, category: b.category, gender, designation: b.designation, phone: b.phone, contactPublic: b.contactPublic, tenureStart: b.tenureStart, tenureEnd: b.tenureEnd ?? null }).returning();
      await auditUser(tx, p, 'committee.member_added', 'committee', id, { memberId: row.id, role: b.role, category: b.category, outside: !userId });
      return row;
    });
  }

  @Patch(':id/members/:memberId')
  @Auth('user', GOV_COMMITTEE_ROLES)
  updateMember(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Param('memberId', ParseUUIDPipe) memberId: string, @Body(new ZodBody(MemberPatch)) b: z.infer<typeof MemberPatch>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const cur = found((await tx.select().from(committeeMembers).where(and(eq(committeeMembers.id, memberId), eq(committeeMembers.committeeId, id))))[0], 'Member');
      if (b.tenureEnd && b.tenureEnd < cur.tenureStart) throw new BadRequestException('The tenure cannot end before it starts');
      const [row] = await tx.update(committeeMembers).set(b).where(eq(committeeMembers.id, memberId)).returning();
      await auditUser(tx, p, 'committee.member_updated', 'committee', id, { memberId, changes: Object.keys(b) });
      return row;
    });
  }

  // ---- meetings -----------------------------------------------------------------------------------------------

  /** Schedules a meeting with its agenda items (the office, or the committee's chair or secretary). */
  @Post(':id/meetings')
  @Auth('user', TASK_ROLES)
  schedule(@CurrentPrincipal() p: UserPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodBody(MeetingBody)) b: z.infer<typeof MeetingBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      found((await tx.select({ id: committees.id }).from(committees).where(eq(committees.id, id)))[0], 'Committee');
      await this.svc.assertManage(tx, p, id);
      const [m] = await tx.insert(committeeMeetings).values({ tenantId: p.tenantId, committeeId: id, title: b.title, meetingOn: b.meetingOn, startsAt: b.startsAt, venue: b.venue, agenda: b.agenda.map((a, i) => `${i + 1}. ${a.title}`).join('\n'), createdBy: p.userId }).returning();
      if (b.agenda.length) await tx.insert(committeeAgendaItems).values(b.agenda.map((a, i) => ({ tenantId: p.tenantId, meetingId: m.id, seq: i + 1, title: a.title, presenter: a.presenter })));
      await auditUser(tx, p, 'committee.meeting_scheduled', 'committee', id, { meetingId: m.id, meetingOn: b.meetingOn, items: b.agenda.length });
      return m;
    });
  }

  /** The meeting with agenda, attendance and quorum, signatures and actions: members of the committee (staff or student) and the office. */
  @Get('meetings/:meetingId')
  @Auth('user')
  meeting(@CurrentPrincipal() p: UserPrincipal, @Param('meetingId', ParseUUIDPipe) meetingId: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const m = await this.svc.meeting(tx, meetingId);
      if (!hasRole(p, GOV_COMMITTEE_ROLES) && !(await this.svc.isMember(tx, p, m.committeeId))) throw new NotFoundException('Meeting not found');
      const me = m.attendance.find((a) => a.userId === p.userId);
      const mySignoff = me ? m.signoffs.find((s) => s.memberId === me.memberId && s.current) : undefined;
      return { ...m, canManage: await this.svc.canManage(tx, p, m.committeeId), canSign: m.minutesStatus === 'circulated' && me?.status === 'present' && !mySignoff, mySignoff: mySignoff ?? null };
    });
  }

  /** Title, date, time, venue and the minutes' text; only while the minutes are a draft. */
  @Put('meetings/:meetingId')
  @Auth('user', TASK_ROLES)
  details(@CurrentPrincipal() p: UserPrincipal, @Param('meetingId', ParseUUIDPipe) meetingId: string, @Body(new ZodBody(Details)) b: z.infer<typeof Details>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const cur = await this.draft(tx, p, meetingId);
      const status = b.minutes && cur.status === 'scheduled' ? 'held' : undefined;
      const [row] = await tx.update(committeeMeetings).set({ ...b, ...(status ? { status } : {}) }).where(eq(committeeMeetings.id, meetingId)).returning();
      await auditUser(tx, p, 'committee.meeting_updated', 'committee', cur.committeeId, { meetingId, changes: Object.keys(b) });
      return row;
    });
  }

  /** Replaces the agenda items with their discussion, resolution and outcome. */
  @Put('meetings/:meetingId/agenda')
  @Auth('user', TASK_ROLES)
  agenda(@CurrentPrincipal() p: UserPrincipal, @Param('meetingId', ParseUUIDPipe) meetingId: string, @Body(new ZodBody(AgendaBody)) b: z.infer<typeof AgendaBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const cur = await this.draft(tx, p, meetingId);
      const old = await tx.select().from(committeeAgendaItems).where(eq(committeeAgendaItems.meetingId, meetingId)).orderBy(asc(committeeAgendaItems.seq));
      // Keep the rows (and the actions linked to them) where the position is unchanged; add or drop the rest.
      for (const [i, it] of b.items.entries()) {
        const hit = old.find((o) => o.seq === i + 1);
        if (hit) await tx.update(committeeAgendaItems).set(it).where(eq(committeeAgendaItems.id, hit.id));
        else await tx.insert(committeeAgendaItems).values({ tenantId: p.tenantId, meetingId, seq: i + 1, ...it });
      }
      const drop = old.filter((o) => o.seq > b.items.length).map((o) => o.id);
      if (drop.length) await tx.delete(committeeAgendaItems).where(inArray(committeeAgendaItems.id, drop));
      await tx.update(committeeMeetings).set({ agenda: b.items.map((a, i) => `${i + 1}. ${a.title}`).join('\n') }).where(eq(committeeMeetings.id, meetingId));
      await auditUser(tx, p, 'committee.agenda_updated', 'committee', cur.committeeId, { meetingId, items: b.items.length });
      return tx.select().from(committeeAgendaItems).where(eq(committeeAgendaItems.meetingId, meetingId)).orderBy(asc(committeeAgendaItems.seq));
    });
  }

  /** Records who was present. Members are those whose tenure covers the meeting's date. */
  @Put('meetings/:meetingId/attendance')
  @Auth('user', TASK_ROLES)
  attendance(@CurrentPrincipal() p: UserPrincipal, @Param('meetingId', ParseUUIDPipe) meetingId: string, @Body(new ZodBody(AttendanceBody)) b: z.infer<typeof AttendanceBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const cur = await this.draft(tx, p, meetingId);
      const ms = await tx.select({ id: committeeMembers.id }).from(committeeMembers).where(and(eq(committeeMembers.committeeId, cur.committeeId), lte(committeeMembers.tenureStart, cur.meetingOn), sql`(${committeeMembers.tenureEnd} is null or ${committeeMembers.tenureEnd} >= ${cur.meetingOn})`));
      const ok = new Set(ms.map((m) => m.id));
      const bad = b.entries.filter((e) => !ok.has(e.memberId));
      if (bad.length) throw new BadRequestException(`${bad.length} of these people were not members on ${cur.meetingOn}`);
      for (const e of b.entries)
        await tx.insert(committeeMeetingAttendance).values({ tenantId: p.tenantId, meetingId, memberId: e.memberId, status: e.status }).onConflictDoUpdate({ target: [committeeMeetingAttendance.meetingId, committeeMeetingAttendance.memberId], set: { status: e.status } });
      if (cur.status === 'scheduled' && b.entries.some((e) => e.status === 'present') && cur.meetingOn <= (await this.svc.today(tx))) await tx.update(committeeMeetings).set({ status: 'held' }).where(eq(committeeMeetings.id, meetingId));
      await auditUser(tx, p, 'committee.attendance_recorded', 'committee', cur.committeeId, { meetingId, present: b.entries.filter((e) => e.status === 'present').length });
      return (await this.svc.meeting(tx, meetingId)).quorum;
    });
  }

  /** Sends the notice with the agenda to every member with an account. */
  @Post('meetings/:meetingId/notice')
  @HttpCode(200)
  @Auth('user', TASK_ROLES)
  notice(@CurrentPrincipal() p: UserPrincipal, @Param('meetingId', ParseUUIDPipe) meetingId: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const m = await this.svc.meeting(tx, meetingId);
      await this.svc.assertManage(tx, p, m.committeeId);
      if (m.status !== 'scheduled') throw new ConflictException('Notice goes out before the meeting');
      const to = m.attendance.map((a) => a.userId).filter((x): x is string => !!x);
      await this.notifications.notifyUsers(tx, to, { kind: 'task', text: govTexts.meetingNotice({ committee: m.committee?.name ?? '', title: m.title, on: m.meetingOn, at: m.startsAt, venue: m.venue, items: m.agenda.length }), data: { meetingId, committeeId: m.committeeId }, dedupeKey: `committee-notice:${meetingId}:${m.meetingOn}` }, { replace: true });
      await tx.update(committeeMeetings).set({ noticeSentAt: this.svc.now() }).where(eq(committeeMeetings.id, meetingId));
      await auditUser(tx, p, 'committee.notice_sent', 'committee', m.committeeId, { meetingId, recipients: to.length });
      return { sent: to.length };
    });
  }

  /**
   * Circulates the minutes to the members who were present: the text is fixed (hashed) and each member approves or
   * objects. A meeting without quorum cannot circulate minutes.
   */
  @Post('meetings/:meetingId/circulate')
  @HttpCode(200)
  @Auth('user', TASK_ROLES)
  circulate(@CurrentPrincipal() p: UserPrincipal, @Param('meetingId', ParseUUIDPipe) meetingId: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const cur = await this.draft(tx, p, meetingId);
      const m = await this.svc.meeting(tx, meetingId);
      if (cur.meetingOn > (await this.svc.today(tx))) throw new ConflictException('The meeting has not happened yet');
      if (!m.minutes.trim() && !m.agenda.some((a) => a.resolution.trim())) throw new BadRequestException('Write the minutes or the resolutions first');
      if (m.quorum.met !== true) throw new ConflictException({ message: `Quorum not recorded: ${m.quorum.present} present, ${m.quorum.needed} needed`, code: 'NO_QUORUM' });
      const hash = await this.svc.hashNow(tx, meetingId);
      await tx.update(committeeMeetings).set({ status: 'held', minutesStatus: 'circulated', minutesHash: hash, minutesCirculatedAt: this.svc.now() }).where(eq(committeeMeetings.id, meetingId));
      const to = m.attendance.filter((a) => a.status === 'present' && a.userId && a.userId !== p.userId).map((a) => a.userId!);
      await this.notifications.notifyUsers(tx, to, { kind: 'task', text: govTexts.minutesToSign({ committee: m.committee?.name ?? '', title: m.title, on: m.meetingOn }), data: { meetingId }, dedupeKey: `committee-minutes:${meetingId}:${hash.slice(0, 12)}` });
      await auditUser(tx, p, 'committee.minutes_circulated', 'committee', cur.committeeId, { meetingId, hash });
      return { minutesStatus: 'circulated', minutesHash: hash, sentTo: to.length };
    });
  }

  /** Takes circulated minutes back to draft to revise them; signatures on the old text stay on record but no longer count. */
  @Post('meetings/:meetingId/revise')
  @HttpCode(200)
  @Auth('user', TASK_ROLES)
  revise(@CurrentPrincipal() p: UserPrincipal, @Param('meetingId', ParseUUIDPipe) meetingId: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const cur = found((await tx.select().from(committeeMeetings).where(eq(committeeMeetings.id, meetingId)).for('update'))[0], 'Meeting');
      await this.svc.assertManage(tx, p, cur.committeeId);
      if (cur.minutesStatus !== 'circulated') throw new ConflictException(cur.minutesStatus === 'approved' ? 'Approved minutes cannot be changed' : 'The minutes are already a draft');
      await tx.update(committeeMeetings).set({ minutesStatus: 'draft' }).where(eq(committeeMeetings.id, meetingId));
      await auditUser(tx, p, 'committee.minutes_revised', 'committee', cur.committeeId, { meetingId });
      return { minutesStatus: 'draft' };
    });
  }

  /** A member who was present approves or objects to the circulated minutes, signing them. */
  @Post('meetings/:meetingId/sign')
  @HttpCode(200)
  @Auth('user')
  sign(@CurrentPrincipal() p: UserPrincipal, @Param('meetingId', ParseUUIDPipe) meetingId: string, @Body(new ZodBody(SignBody)) b: z.infer<typeof SignBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const cur = found((await tx.select().from(committeeMeetings).where(eq(committeeMeetings.id, meetingId)).for('update'))[0], 'Meeting');
      const m = await this.svc.meeting(tx, meetingId);
      const me = m.attendance.find((a) => a.userId === p.userId);
      if (!me) throw new NotFoundException('Meeting not found');
      if (cur.minutesStatus !== 'circulated' || !cur.minutesHash) throw new ConflictException('These minutes are not out for approval');
      if (me.status !== 'present') throw new ForbiddenException('Only members who were present approve the minutes');
      if ((await this.svc.hashNow(tx, meetingId)) !== cur.minutesHash) throw new ConflictException('The minutes changed after they were circulated; ask the secretary to circulate them again');
      const at = this.svc.now();
      const signature = this.svc.sign(cur.minutesHash, me.memberId, b.decision, at);
      const [row] = await tx.insert(committeeMinuteSignoffs).values({ tenantId: p.tenantId, meetingId, memberId: me.memberId, userId: p.userId, decision: b.decision, comment: b.comment, minutesHash: cur.minutesHash, signature, signedAt: at }).onConflictDoNothing().returning();
      if (!row) throw new ConflictException('You have already signed these minutes');
      await auditUser(tx, p, b.decision === 'approve' ? 'committee.minutes_approved_by_member' : 'committee.minutes_objected', 'committee', cur.committeeId, { meetingId, hash: cur.minutesHash });
      const after = await this.svc.meeting(tx, meetingId);
      const managers = after.attendance.filter((a) => (a.role === 'chair' || a.role === 'secretary') && a.userId).map((a) => a.userId!);
      if (b.decision === 'object') {
        await this.notifications.notifyUsers(tx, [...new Set([...managers, cur.createdBy])], { kind: 'task', text: govTexts.minutesObjected({ committee: after.committee?.name ?? '', title: cur.title, by: me.name }), data: { meetingId }, dedupeKey: `committee-object:${row.id}` });
      } else if (after.approval.approved) {
        await tx.update(committeeMeetings).set({ minutesStatus: 'approved', minutesApprovedAt: at }).where(eq(committeeMeetings.id, meetingId));
        await auditUser(tx, p, 'committee.minutes_approved', 'committee', cur.committeeId, { meetingId, approvals: after.approval.approvals });
        const all = after.attendance.map((a) => a.userId).filter((x): x is string => !!x);
        await this.notifications.notifyUsers(tx, all, { kind: 'task', text: govTexts.minutesApproved({ committee: after.committee?.name ?? '', title: cur.title }), data: { meetingId }, dedupeKey: `committee-approved:${meetingId}:${cur.minutesHash.slice(0, 12)}` });
      }
      return { decision: b.decision, signature, approval: after.approval, minutesStatus: after.approval.approved && b.decision === 'approve' ? 'approved' : 'circulated' };
    });
  }

  /** The minutes as a PDF: attendance with quorum, each agenda item with its resolution, actions and the signatures. */
  @Get('meetings/:meetingId/minutes.pdf')
  @Auth('user')
  minutesPdf(@CurrentPrincipal() p: UserPrincipal, @Param('meetingId', ParseUUIDPipe) meetingId: string, @Res({ passthrough: true }) res: Response) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const m = await this.svc.meeting(tx, meetingId);
      if (!hasRole(p, GOV_COMMITTEE_ROLES) && !(await this.svc.isMember(tx, p, m.committeeId))) throw new NotFoundException('Meeting not found');
      const [t] = await tx.select({ name: tenants.name }).from(tenants);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename="minutes.pdf"');
      return new StreamableFile(minutesPdf({ institution: t?.name ?? '', meeting: m }));
    });
  }

  // ---- action items and the action-taken report ---------------------------------------------------------------

  /** An action item from the meeting, optionally against one agenda item. */
  @Post('meetings/:meetingId/actions')
  @Auth('user', TASK_ROLES)
  addAction(@CurrentPrincipal() p: UserPrincipal, @Param('meetingId', ParseUUIDPipe) meetingId: string, @Body(new ZodBody(ActionBody)) b: z.infer<typeof ActionBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const m = found((await tx.select().from(committeeMeetings).where(eq(committeeMeetings.id, meetingId)))[0], 'Meeting');
      await this.svc.assertManage(tx, p, m.committeeId);
      found((await tx.select({ id: users.id }).from(users).where(eq(users.id, b.ownerUserId)))[0], 'Owner');
      if (b.agendaItemId) found((await tx.select({ id: committeeAgendaItems.id }).from(committeeAgendaItems).where(and(eq(committeeAgendaItems.id, b.agendaItemId), eq(committeeAgendaItems.meetingId, meetingId))))[0], 'Agenda item');
      const [row] = await tx.insert(committeeActionItems).values({ tenantId: p.tenantId, meetingId, committeeId: m.committeeId, title: b.title, ownerUserId: b.ownerUserId, dueOn: b.dueOn, agendaItemId: b.agendaItemId ?? null }).returning();
      await auditUser(tx, p, 'committee.action_created', 'committee', m.committeeId, { actionId: row.id, ownerUserId: b.ownerUserId });
      return row;
    });
  }

  /** The owner (or the office) reports the action taken; done closes the item. */
  @Put('action-items/:actionId/report')
  @Auth('user', TASK_ROLES)
  report(@CurrentPrincipal() p: UserPrincipal, @Param('actionId', ParseUUIDPipe) actionId: string, @Body(new ZodBody(ReportBody)) b: z.infer<typeof ReportBody>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const cur = found((await tx.select().from(committeeActionItems).where(eq(committeeActionItems.id, actionId)).for('update'))[0], 'Action item');
      if (cur.ownerUserId !== p.userId && !(await this.svc.canManage(tx, p, cur.committeeId))) throw new ForbiddenException('Only the owner or the office can report on this');
      if (cur.status === 'dropped') throw new ConflictException('This action was dropped');
      const today = await this.svc.today(tx);
      const [row] = await tx.update(committeeActionItems).set({ actionTaken: b.actionTaken, status: b.status, evidenceUrl: b.evidenceUrl, reportedOn: today, completedAt: b.status === 'done' ? this.svc.now() : null }).where(eq(committeeActionItems.id, actionId)).returning();
      await auditUser(tx, p, 'committee.action_reported', 'committee', cur.committeeId, { actionId, from: cur.status, to: b.status });
      return row;
    });
  }

  /** The action-taken report (ATR) for a committee or all of them, over a period (the academic year by default). */
  @Get('atr/report')
  @Auth('user', GOV_COMMITTEE_ROLES)
  atr(@CurrentPrincipal() p: UserPrincipal, @Query('committeeId') committeeId?: string, @Query('from') from?: string, @Query('to') to?: string) {
    return this.db.withTenant(p.tenantId, (tx) => this.atrRows(tx, committeeId, from, to));
  }

  @Get('atr/report.xlsx')
  @Auth('user', GOV_COMMITTEE_ROLES)
  atrXlsx(@CurrentPrincipal() p: UserPrincipal, @Res({ passthrough: true }) res: Response, @Query('committeeId') committeeId?: string, @Query('from') from?: string, @Query('to') to?: string) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const r = await this.atrRows(tx, committeeId, from, to);
      const rows: (string | number | null)[][] = [['Committee', 'Meeting', 'Meeting date', 'Action', 'Owner', 'Due', 'Status', 'Action taken', 'Reported on', 'Overdue']];
      for (const a of r.rows) rows.push([a.committee, a.meeting, a.meetingOn, a.title, a.owner, a.dueOn, a.status, a.actionTaken, a.reportedOn, a.overdue ? 'Yes' : 'No']);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="action-taken-report-${r.from}-${r.to}.xlsx"`);
      return new StreamableFile(writeXlsx('Action taken report', rows));
    });
  }

  /** The signed-in person's committees, minutes waiting for their signature, upcoming meetings and open actions. */
  @Get('me/summary')
  @Auth('user')
  mine(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, (tx) => this.svc.mine(tx, p));
  }

  private async atrRows(tx: Parameters<Parameters<DbService['withTenant']>[1]>[0], committeeId?: string, from?: string, to?: string) {
    const today = await this.svc.today(tx);
    const y = await this.svc.year(tx, today);
    const lo = from && Day.safeParse(from).success ? from : y.from;
    const hi = to && Day.safeParse(to).success ? to : y.to;
    if (committeeId && !z.uuid().safeParse(committeeId).success) throw new BadRequestException('committeeId must be an id');
    const rows = await tx
      .select({ a: committeeActionItems, owner: users.fullName, committee: committees.name, meeting: committeeMeetings.title, meetingOn: committeeMeetings.meetingOn })
      .from(committeeActionItems)
      .innerJoin(users, eq(users.id, committeeActionItems.ownerUserId))
      .innerJoin(committees, eq(committees.id, committeeActionItems.committeeId))
      .innerJoin(committeeMeetings, eq(committeeMeetings.id, committeeActionItems.meetingId))
      .where(and(committeeId ? eq(committeeActionItems.committeeId, committeeId) : undefined, gte(committeeMeetings.meetingOn, lo), lte(committeeMeetings.meetingOn, hi)))
      .orderBy(asc(committees.name), asc(committeeMeetings.meetingOn), asc(committeeActionItems.dueOn))
      .limit(2000);
    const out = rows.map((r) => ({ id: r.a.id, committee: r.committee, meeting: r.meeting, meetingOn: r.meetingOn, title: r.a.title, owner: r.owner, dueOn: r.a.dueOn, status: r.a.status, actionTaken: r.a.actionTaken, reportedOn: r.a.reportedOn, overdue: ['open', 'in_progress'].includes(r.a.status) && r.a.dueOn < today }));
    return { from: lo, to: hi, rows: out, totals: { total: out.length, done: out.filter((r) => r.status === 'done').length, open: out.filter((r) => r.status === 'open' || r.status === 'in_progress').length, overdue: out.filter((r) => r.overdue).length, reported: out.filter((r) => r.actionTaken).length } };
  }

  /** The meeting, if `p` may change it and its minutes are still a draft. */
  private async draft(tx: Parameters<Parameters<DbService['withTenant']>[1]>[0], p: UserPrincipal, meetingId: string) {
    const cur = found((await tx.select().from(committeeMeetings).where(eq(committeeMeetings.id, meetingId)).for('update'))[0], 'Meeting');
    await this.svc.assertManage(tx, p, cur.committeeId);
    if (cur.status === 'cancelled') throw new ConflictException('A cancelled meeting cannot be changed');
    if (cur.minutesStatus !== 'draft') throw new ConflictException(cur.minutesStatus === 'approved' ? 'Approved minutes cannot be changed' : 'The minutes are out for approval; take them back to revise');
    return cur;
  }
}
