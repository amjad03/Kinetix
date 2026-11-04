import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import type { UserPrincipal } from '../auth/principal.js';
import { hmac } from '../common/crypto.js';
import { Clock } from '../common/time.js';
import { tenantToday } from '../common/tenant-today.js';
import { ENV, type Env } from '../config/env.js';
import type { Tx } from '../db/db.service.js';
import { academicYears, committeeActionItems, committeeMeetings, committeeMembers, committees, staffProfiles, users } from '../db/schema.js';
import { committeeAgendaItems, committeeMeetingAttendance, committeeMinuteSignoffs } from '../db/schema-governance-pass.js';
import { found, hasRole } from '../placements/placements.access.js';
import { COMMITTEE_STAFF } from '../campus-life/campus-life.access.js';
import { compositionIssues, currentMembers, minutesApproved, minutesHash, quorumNeeded, ruleOf, COMMITTEE_RULES, type CompositionIssue } from './statutory.js';

/** The office: who sets up committees, manages any meeting and reads every committee's papers. */
export const GOV_COMMITTEE_ROLES = [...COMMITTEE_STAFF, 'quality_officer'] as UserPrincipal['roles'];

export type MemberRow = typeof committeeMembers.$inferSelect & { displayName: string; hasAccount: boolean };

/** Committee meetings, composition and the year's compliance, shared by the governance controllers and the dashboard. */
@Injectable()
export class CommitteeGovService {
  constructor(
    private readonly clock: Clock,
    @Inject(ENV) private readonly env: Env,
  ) {}

  now() {
    return this.clock.now();
  }

  today(tx: Tx) {
    return tenantToday(tx, this.clock);
  }

  /** The current academic year (June to May when none is marked current). */
  async year(tx: Tx, today: string): Promise<{ label: string; from: string; to: string }> {
    const [y] = await tx.select().from(academicYears).where(eq(academicYears.isCurrent, true)).limit(1);
    if (y) return { label: y.label, from: y.startsOn, to: y.endsOn };
    const start = Number(today.slice(0, 4)) - (Number(today.slice(5, 7)) < 6 ? 1 : 0);
    return { label: `${start}-${String((start + 1) % 100).padStart(2, '0')}`, from: `${start}-06-01`, to: `${start + 1}-05-31` };
  }

  /** Members with a name to show: the account's name, or the outside member's own. */
  async members(tx: Tx, committeeIds: string[]): Promise<MemberRow[]> {
    if (!committeeIds.length) return [];
    const rows = await tx.select({ m: committeeMembers, fullName: users.fullName }).from(committeeMembers).leftJoin(users, eq(users.id, committeeMembers.userId)).where(inArray(committeeMembers.committeeId, committeeIds)).orderBy(asc(committeeMembers.tenureStart));
    return rows.map((r) => ({ ...r.m, displayName: r.m.name || r.fullName || '', hasAccount: !!r.m.userId }));
  }

  /** The gender recorded on the staff profile, as a member's default. */
  async staffGender(tx: Tx, userId: string): Promise<string> {
    const [s] = await tx.select({ g: staffProfiles.gender }).from(staffProfiles).where(eq(staffProfiles.userId, userId));
    const g = (s?.g ?? '').toLowerCase();
    return g.startsWith('f') ? 'female' : g.startsWith('m') ? 'male' : g ? 'other' : '';
  }

  /** The office, or the committee's own chair or secretary in office today. */
  async canManage(tx: Tx, p: UserPrincipal, committeeId: string): Promise<boolean> {
    if (hasRole(p, GOV_COMMITTEE_ROLES)) return true;
    const today = await this.today(tx);
    const [m] = await tx
      .select({ id: committeeMembers.id })
      .from(committeeMembers)
      .where(and(eq(committeeMembers.committeeId, committeeId), eq(committeeMembers.userId, p.userId), inArray(committeeMembers.role, ['chair', 'secretary']), lte(committeeMembers.tenureStart, today), sql`(${committeeMembers.tenureEnd} is null or ${committeeMembers.tenureEnd} >= ${today})`));
    return !!m;
  }

  async assertManage(tx: Tx, p: UserPrincipal, committeeId: string) {
    if (!(await this.canManage(tx, p, committeeId))) throw new ForbiddenException('Only the office or the committee chair or secretary can do this');
  }

  /** Is `p` a member (any time) of the committee? Members read their committee's meetings. */
  async isMember(tx: Tx, p: UserPrincipal, committeeId: string): Promise<boolean> {
    const [m] = await tx.select({ id: committeeMembers.id }).from(committeeMembers).where(and(eq(committeeMembers.committeeId, committeeId), eq(committeeMembers.userId, p.userId)));
    return !!m;
  }

  /** A meeting with everything the minutes need: agenda, attendance with quorum, signatures and actions. */
  async meeting(tx: Tx, meetingId: string) {
    const m = found((await tx.select().from(committeeMeetings).where(eq(committeeMeetings.id, meetingId)))[0], 'Meeting');
    const [c] = await tx.select().from(committees).where(eq(committees.id, m.committeeId));
    const members = await this.members(tx, [m.committeeId]);
    const onDay = currentMembers(members, m.meetingOn);
    const agenda = await tx.select().from(committeeAgendaItems).where(eq(committeeAgendaItems.meetingId, meetingId)).orderBy(asc(committeeAgendaItems.seq));
    const att = await tx.select().from(committeeMeetingAttendance).where(eq(committeeMeetingAttendance.meetingId, meetingId));
    const sig = await tx.select({ s: committeeMinuteSignoffs }).from(committeeMinuteSignoffs).where(eq(committeeMinuteSignoffs.meetingId, meetingId)).orderBy(asc(committeeMinuteSignoffs.signedAt));
    const acts = await tx.select({ a: committeeActionItems, owner: users.fullName }).from(committeeActionItems).innerJoin(users, eq(users.id, committeeActionItems.ownerUserId)).where(eq(committeeActionItems.meetingId, meetingId)).orderBy(asc(committeeActionItems.dueOn));
    const status = new Map(att.map((a) => [a.memberId, a.status]));
    const attendance = onDay.map((mm) => ({ memberId: mm.id, name: mm.displayName, role: mm.role, category: mm.category, hasAccount: mm.hasAccount, userId: mm.userId, status: status.get(mm.id) ?? null }));
    const present = attendance.filter((a) => a.status === 'present');
    const needed = quorumNeeded(onDay.length, c?.quorumPct ?? 50);
    const nameOf = new Map(members.map((mm) => [mm.id, mm.displayName]));
    const currentHash = m.minutesHash;
    const signoffs = sig.map(({ s }) => ({ ...s, name: nameOf.get(s.memberId) ?? '', current: s.minutesHash === currentHash, valid: this.verify(s) }));
    const approval = minutesApproved(
      present.map((a) => ({ memberId: a.memberId, role: a.role, canSign: a.hasAccount })),
      signoffs.filter((s) => s.current && s.valid).map((s) => ({ memberId: s.memberId, role: attendance.find((a) => a.memberId === s.memberId)?.role ?? 'member', decision: s.decision as 'approve' | 'object' })),
    );
    return {
      ...m,
      committee: c ? { id: c.id, name: c.name, kind: c.kind, quorumPct: c.quorumPct } : null,
      agenda,
      attendance,
      quorum: { members: onDay.length, needed, present: present.length, met: att.length ? present.length >= needed : null },
      signoffs,
      approval,
      actions: acts.map((a) => ({ ...a.a, ownerName: a.owner, overdue: ['open', 'in_progress'].includes(a.a.status) && a.a.dueOn < this.now().toISOString().slice(0, 10) })),
    };
  }

  /** The minutes' hash as they stand now (title, date, text, agenda resolutions, attendance). */
  async hashNow(tx: Tx, meetingId: string): Promise<string> {
    const [m] = await tx.select().from(committeeMeetings).where(eq(committeeMeetings.id, meetingId));
    const agenda = await tx.select().from(committeeAgendaItems).where(eq(committeeAgendaItems.meetingId, meetingId));
    const att = await tx.select().from(committeeMeetingAttendance).where(eq(committeeMeetingAttendance.meetingId, meetingId));
    return minutesHash({ title: m.title, meetingOn: m.meetingOn, minutes: m.minutes, agenda, attendance: att });
  }

  /** The member's signature over the minutes: an HMAC with a key only the server holds. */
  sign(minutesHashValue: string, memberId: string, decision: string, at: Date): string {
    return hmac(`committee-minutes:${this.env.JWT_SECRET}`, `${minutesHashValue}|${memberId}|${decision}|${at.toISOString()}`);
  }

  verify(s: { minutesHash: string; memberId: string; decision: string; signedAt: Date; signature: string }): boolean {
    return this.sign(s.minutesHash, s.memberId, s.decision, s.signedAt) === s.signature;
  }

  /**
   * Every committee with its rule, current members, composition issues and the year's meetings against the norm,
   * plus the required statutory committees the institution has not constituted.
   */
  async compliance(tx: Tx) {
    const today = await this.today(tx);
    const year = await this.year(tx, today);
    const list = await tx.select().from(committees).where(eq(committees.active, true)).orderBy(desc(committees.statutory), asc(committees.name));
    const ids = list.map((c) => c.id);
    const members = await this.members(tx, ids);
    const meetings = ids.length
      ? await tx
          .select({ committeeId: committeeMeetings.committeeId, held: sql<number>`count(*) filter (where ${committeeMeetings.status} = 'held')::int`, scheduled: sql<number>`count(*) filter (where ${committeeMeetings.status} = 'scheduled')::int`, pending: sql<number>`count(*) filter (where ${committeeMeetings.status} = 'held' and ${committeeMeetings.minutesStatus} <> 'approved')::int`, last: sql<string | null>`max(${committeeMeetings.meetingOn}) filter (where ${committeeMeetings.status} = 'held')::text` })
          .from(committeeMeetings)
          .where(and(inArray(committeeMeetings.committeeId, ids), gte(committeeMeetings.meetingOn, year.from), lte(committeeMeetings.meetingOn, year.to)))
          .groupBy(committeeMeetings.committeeId)
      : [];
    const acts = ids.length
      ? await tx
          .select({ committeeId: committeeActionItems.committeeId, open: sql<number>`count(*) filter (where ${committeeActionItems.status} in ('open', 'in_progress'))::int`, overdue: sql<number>`count(*) filter (where ${committeeActionItems.status} in ('open', 'in_progress') and ${committeeActionItems.dueOn} < ${today})::int`, done: sql<number>`count(*) filter (where ${committeeActionItems.status} = 'done')::int` })
          .from(committeeActionItems)
          .where(inArray(committeeActionItems.committeeId, ids))
          .groupBy(committeeActionItems.committeeId)
      : [];
    // The share of the year gone: a committee that should meet four times is expected to have met twice by mid-year.
    const span = Math.max(1, (Date.parse(year.to) - Date.parse(year.from)) / 86_400_000);
    const gone = Math.min(1, Math.max(0, (Date.parse(today) - Date.parse(year.from)) / 86_400_000 / span));
    const rows = list.map((c) => {
      const rule = ruleOf(c.kind);
      const ms = members.filter((m) => m.committeeId === c.id);
      const cur = currentMembers(ms, today);
      const issues: CompositionIssue[] = compositionIssues(rule, ms.map((m) => ({ id: m.id, name: m.displayName, role: m.role, category: m.category, gender: m.gender, tenureStart: m.tenureStart, tenureEnd: m.tenureEnd })), today);
      const mt = meetings.find((x) => x.committeeId === c.id);
      const a = acts.find((x) => x.committeeId === c.id);
      const norm = c.meetingsPerYear || rule?.meetingsPerYear || 0;
      const expected = Math.floor(norm * gone);
      const held = mt?.held ?? 0;
      const status = issues.length || held < expected || (a?.overdue ?? 0) > 0 ? 'attention' : 'ok';
      return {
        id: c.id,
        name: c.name,
        kind: c.kind,
        statutory: c.statutory,
        basis: rule?.basis ?? null,
        members: cur.length,
        women: cur.filter((m) => m.gender === 'female').length,
        issues,
        meetingsNorm: norm,
        meetingsExpected: expected,
        meetingsHeld: held,
        meetingsScheduled: mt?.scheduled ?? 0,
        minutesPending: mt?.pending ?? 0,
        lastMeetingOn: mt?.last ?? null,
        openActions: a?.open ?? 0,
        overdueActions: a?.overdue ?? 0,
        doneActions: a?.done ?? 0,
        public: c.public,
        status,
      };
    });
    const have = new Set(list.map((c) => c.kind));
    const missing = COMMITTEE_RULES.filter((r) => r.required && !have.has(r.kind)).map((r) => ({ kind: r.kind, name: r.name, basis: r.basis }));
    return { today, year, committees: rows, missing };
  }

  /** Meetings whose minutes wait for `p`'s signature, and `p`'s committees and open actions. */
  async mine(tx: Tx, p: UserPrincipal) {
    const today = await this.today(tx);
    const memberships = await tx.select({ m: committeeMembers, c: committees }).from(committeeMembers).innerJoin(committees, eq(committees.id, committeeMembers.committeeId)).where(eq(committeeMembers.userId, p.userId));
    const current = memberships.filter((r) => r.m.tenureStart <= today && (!r.m.tenureEnd || r.m.tenureEnd >= today));
    const memberIds = memberships.map((r) => r.m.id);
    const circulated = memberIds.length
      ? await tx
          .select({ meeting: committeeMeetings, memberId: committeeMeetingAttendance.memberId })
          .from(committeeMeetingAttendance)
          .innerJoin(committeeMeetings, eq(committeeMeetings.id, committeeMeetingAttendance.meetingId))
          .where(and(inArray(committeeMeetingAttendance.memberId, memberIds), eq(committeeMeetingAttendance.status, 'present'), eq(committeeMeetings.minutesStatus, 'circulated')))
      : [];
    const signed = circulated.length ? await tx.select().from(committeeMinuteSignoffs).where(inArray(committeeMinuteSignoffs.meetingId, circulated.map((c) => c.meeting.id))) : [];
    const toSign = circulated
      .filter((c) => !signed.some((s) => s.meetingId === c.meeting.id && s.memberId === c.memberId && s.minutesHash === c.meeting.minutesHash))
      .map((c) => ({ meetingId: c.meeting.id, title: c.meeting.title, meetingOn: c.meeting.meetingOn, committee: memberships.find((m) => m.c.id === c.meeting.committeeId)?.c.name ?? '' }));
    const upcoming = current.length
      ? await tx.select().from(committeeMeetings).where(and(inArray(committeeMeetings.committeeId, current.map((r) => r.c.id)), eq(committeeMeetings.status, 'scheduled'), gte(committeeMeetings.meetingOn, today))).orderBy(asc(committeeMeetings.meetingOn)).limit(20)
      : [];
    const actions = await tx.select({ a: committeeActionItems, committee: committees.name }).from(committeeActionItems).innerJoin(committees, eq(committees.id, committeeActionItems.committeeId)).where(and(eq(committeeActionItems.ownerUserId, p.userId), inArray(committeeActionItems.status, ['open', 'in_progress']))).orderBy(asc(committeeActionItems.dueOn));
    return {
      committees: current.map((r) => ({ id: r.c.id, name: r.c.name, kind: r.c.kind, role: r.m.role, tenureEnd: r.m.tenureEnd })),
      toSign,
      upcoming: upcoming.map((m) => ({ id: m.id, title: m.title, meetingOn: m.meetingOn, startsAt: m.startsAt, venue: m.venue, committee: current.find((r) => r.c.id === m.committeeId)?.c.name ?? '' })),
      actions: actions.map((r) => ({ id: r.a.id, title: r.a.title, dueOn: r.a.dueOn, status: r.a.status, actionTaken: r.a.actionTaken, committee: r.committee, overdue: r.a.dueOn < today })),
    };
  }
}
