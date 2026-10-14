import type { ProduceInput } from '../documents/document-engine.service.js';
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq, inArray, notInArray, sql } from 'drizzle-orm';
import { audit } from '../common/audit.js';
import type { Tx } from '../db/db.service.js';
import { admissionCycles, applications, entranceHalls, entranceSeats, entranceTests, tenants } from '../db/schema.js';
import { AdmissionsService } from './admissions.service.js';
import { auditActor, type Actor } from './enquiries.service.js';

/** Applications that no longer need a seat in the test. */
const OUT: (typeof applications.$inferSelect.status)[] = ['rejected', 'withdrawn', 'declined', 'ineligible', 'enrolled'];

export interface HallTicketData {
  institution: string;
  applicantName: string;
  applicationNo: string;
  cycleName: string;
  testName: string;
  testDate: string;
  startsAt: string;
  durationMinutes: number;
  venue: string | null;
  hall: string;
  seatNo: number;
}

/** An entrance-test hall ticket for the document engine (hall ticket template, candidate as the subject). */
export function entranceTicketInput(t: HallTicketData, applicationId: string): ProduceInput {
  return {
    docType: 'hall_ticket',
    title: 'Hall Ticket',
    subject: { type: 'candidate', id: null, name: t.applicantName },
    source: { type: 'entrance_hall_ticket', id: applicationId },
    data: {
      student: { name: t.applicantName, rollNo: t.applicationNo, className: t.cycleName, program: t.testName, admissionNo: t.applicationNo },
      exam: { session: `${t.testName}, ${t.cycleName}`, ticketNo: t.applicationNo, centre: t.venue ?? t.institution, reportingTime: `${t.startsAt.slice(0, 5)} (${t.durationMinutes} minutes)`, instructions: 'Report at the venue 30 minutes before the test with this hall ticket and a photo identity card. Electronic devices are not allowed in the hall.' },
      papers: [{ date: t.testDate, day: '', time: t.startsAt.slice(0, 5), code: '', subject: t.testName, room: t.hall, seat: String(t.seatNo) }],
    },
    keyFields: [{ label: 'Candidate', value: t.applicantName }, { label: 'Application number', value: t.applicationNo }, { label: 'Test', value: t.testName }, { label: 'Date', value: t.testDate }],
    photo: null,
  };
}

/** Entrance tests: scheduling, halls with capacity, seat allocation, hall tickets and score entry. */
@Injectable()
export class EntranceService {
  constructor(private readonly admissions: AdmissionsService) {}

  async test(tx: Tx, id: string) {
    const [t] = await tx.select().from(entranceTests).where(eq(entranceTests.id, id));
    if (!t) throw new NotFoundException('Entrance test not found');
    return t;
  }

  async create(tx: Tx, actor: Actor, input: { cycleId: string; name: string; testDate: string; startsAt: string; durationMinutes: number; maxScore: number; passScore?: number | null; venue?: string | null; halls: { name: string; capacity: number }[] }) {
    await this.admissions.cycle(tx, input.cycleId);
    if (input.passScore != null && input.passScore > input.maxScore) throw new BadRequestException('The pass mark cannot be above the maximum score');
    const names = input.halls.map((h) => h.name.trim().toLowerCase());
    if (new Set(names).size !== names.length) throw new BadRequestException('Two halls share a name');
    const [t] = await tx
      .insert(entranceTests)
      .values({ tenantId: actor.tenantId, cycleId: input.cycleId, name: input.name, testDate: input.testDate, startsAt: input.startsAt, durationMinutes: input.durationMinutes, maxScore: input.maxScore, passScore: input.passScore ?? null, venue: input.venue ?? null, createdBy: actor.userId })
      .returning();
    if (input.halls.length) await tx.insert(entranceHalls).values(input.halls.map((h) => ({ tenantId: actor.tenantId, testId: t.id, name: h.name.trim(), capacity: h.capacity })));
    await audit(tx, { ...auditActor(actor), action: 'admissions.entrance_test_created.v1', subjectType: 'entrance_test', subjectId: t.id, data: { cycleId: input.cycleId, date: input.testDate } });
    return this.view(tx, t.id);
  }

  async addHall(tx: Tx, actor: Actor, testId: string, h: { name: string; capacity: number }) {
    await this.test(tx, testId);
    const [dup] = await tx.select({ id: entranceHalls.id }).from(entranceHalls).where(and(eq(entranceHalls.testId, testId), sql`lower(${entranceHalls.name}) = ${h.name.trim().toLowerCase()}`));
    if (dup) throw new ConflictException('A hall with this name already exists');
    await tx.insert(entranceHalls).values({ tenantId: actor.tenantId, testId, name: h.name.trim(), capacity: h.capacity });
    await audit(tx, { ...auditActor(actor), action: 'admissions.entrance_hall_added.v1', subjectType: 'entrance_test', subjectId: testId, data: h });
    return this.view(tx, testId);
  }

  async list(tx: Tx, cycleId?: string) {
    const tests = await tx.select().from(entranceTests).where(cycleId ? eq(entranceTests.cycleId, cycleId) : undefined).orderBy(asc(entranceTests.testDate), asc(entranceTests.startsAt));
    return Promise.all(tests.map((t) => this.view(tx, t.id)));
  }

  /** The test with its halls (capacity, seated) and how many candidates are scored. */
  async view(tx: Tx, id: string) {
    const t = await this.test(tx, id);
    const halls = await tx.select().from(entranceHalls).where(eq(entranceHalls.testId, id)).orderBy(asc(entranceHalls.name));
    const seats = await tx.select({ hallId: entranceSeats.hallId, score: entranceSeats.score, absent: entranceSeats.absent }).from(entranceSeats).where(eq(entranceSeats.testId, id));
    return {
      ...t,
      halls: halls.map((h) => ({ id: h.id, name: h.name, capacity: h.capacity, seated: seats.filter((s) => s.hallId === h.id).length })),
      capacity: halls.reduce((n, h) => n + h.capacity, 0),
      seated: seats.length,
      scored: seats.filter((s) => s.absent || s.score != null).length,
    };
  }

  /**
   * Seats every candidate who still needs one, hall by hall in application order. Candidates already
   * seated keep their seat. Nothing is allocated unless everyone fits.
   */
  async allocate(tx: Tx, actor: Actor, testId: string) {
    const t = await this.test(tx, testId);
    const halls = await tx.select().from(entranceHalls).where(eq(entranceHalls.testId, testId)).orderBy(asc(entranceHalls.name));
    if (halls.length === 0) throw new BadRequestException('Add at least one hall first');
    const seated = await tx.select().from(entranceSeats).where(eq(entranceSeats.testId, testId));
    const taken = new Set(seated.map((s) => s.applicationId));
    const candidates = (await tx.select().from(applications).where(and(eq(applications.cycleId, t.cycleId), notInArray(applications.status, OUT), inArray(applications.feeStatus, ['none', 'paid', 'waived']))).orderBy(asc(applications.submittedAt), asc(applications.id))).filter((a) => !taken.has(a.id));
    const free = halls.map((h) => ({ hall: h, next: Math.max(0, ...seated.filter((s) => s.hallId === h.id).map((s) => s.seatNo)) + 1, left: h.capacity - seated.filter((s) => s.hallId === h.id).length }));
    const room = free.reduce((n, f) => n + Math.max(0, f.left), 0);
    if (candidates.length > room) throw new ConflictException(`${candidates.length} candidates need seats but only ${room} are free: add a hall or raise a capacity`);
    let i = 0;
    for (const f of free) {
      while (f.left > 0 && i < candidates.length) {
        await tx.insert(entranceSeats).values({ tenantId: actor.tenantId, testId, hallId: f.hall.id, applicationId: candidates[i].id, seatNo: f.next });
        f.next++;
        f.left--;
        i++;
      }
    }
    await audit(tx, { ...auditActor(actor), action: 'admissions.entrance_seats_allocated.v1', subjectType: 'entrance_test', subjectId: testId, data: { allocated: candidates.length } });
    return { allocated: candidates.length, ...(await this.view(tx, testId)) };
  }

  /** The seating list with names, seats and scores. */
  async seating(tx: Tx, testId: string) {
    await this.test(tx, testId);
    return tx
      .select({ applicationId: applications.id, applicationNo: applications.applicationNo, applicantName: applications.applicantName, hall: entranceHalls.name, seatNo: entranceSeats.seatNo, score: entranceSeats.score, absent: entranceSeats.absent })
      .from(entranceSeats)
      .innerJoin(applications, eq(applications.id, entranceSeats.applicationId))
      .innerJoin(entranceHalls, eq(entranceHalls.id, entranceSeats.hallId))
      .where(eq(entranceSeats.testId, testId))
      .orderBy(asc(entranceHalls.name), asc(entranceSeats.seatNo));
  }

  /** Enters scores (or absences) for seated candidates, once the test day has come. */
  async enterScores(tx: Tx, actor: Actor, testId: string, entries: { applicationId: string; score?: number | null; absent?: boolean }[], today: string) {
    const t = await this.test(tx, testId);
    if (t.testDate > today) throw new BadRequestException('The test has not been held yet');
    const seats = await tx.select().from(entranceSeats).where(and(eq(entranceSeats.testId, testId), inArray(entranceSeats.applicationId, entries.map((e) => e.applicationId))));
    const byApp = new Map(seats.map((s) => [s.applicationId, s]));
    for (const e of entries) {
      if (!byApp.has(e.applicationId)) throw new BadRequestException('A candidate has no seat in this test');
      if (e.absent && e.score != null) throw new BadRequestException('An absent candidate has no score');
      if (!e.absent && e.score == null) throw new BadRequestException('Give a score or mark the candidate absent');
      if (e.score != null && (e.score < 0 || e.score > t.maxScore)) throw new BadRequestException(`Scores run from 0 to ${t.maxScore}`);
    }
    for (const e of entries) {
      await tx
        .update(entranceSeats)
        .set({ score: e.absent ? null : e.score!, absent: !!e.absent, scoredBy: actor.userId, scoredAt: new Date() })
        .where(eq(entranceSeats.id, byApp.get(e.applicationId)!.id));
    }
    await audit(tx, { ...auditActor(actor), action: 'admissions.entrance_scores_entered.v1', subjectType: 'entrance_test', subjectId: testId, data: { count: entries.length } });
    return this.view(tx, testId);
  }

  /** The data for one candidate's hall ticket; they must be seated. */
  async ticket(tx: Tx, testId: string, applicationId: string): Promise<HallTicketData> {
    const t = await this.test(tx, testId);
    const [row] = await tx
      .select({ a: applications, hall: entranceHalls.name, seatNo: entranceSeats.seatNo })
      .from(entranceSeats)
      .innerJoin(applications, eq(applications.id, entranceSeats.applicationId))
      .innerJoin(entranceHalls, eq(entranceHalls.id, entranceSeats.hallId))
      .where(and(eq(entranceSeats.testId, testId), eq(entranceSeats.applicationId, applicationId)));
    if (!row) throw new NotFoundException('This candidate has no seat in the test yet');
    const [cycle] = await tx.select({ name: admissionCycles.name }).from(admissionCycles).where(eq(admissionCycles.id, t.cycleId));
    const [inst] = await tx.select({ name: tenants.name }).from(tenants);
    return { institution: inst?.name ?? '', applicantName: row.a.applicantName, applicationNo: row.a.applicationNo, cycleName: cycle?.name ?? '', testName: t.name, testDate: t.testDate, startsAt: t.startsAt, durationMinutes: t.durationMinutes, venue: t.venue, hall: row.hall, seatNo: row.seatNo };
  }

  /** A candidate's own ticket (the first test they are seated for), for the applicant's tracking page. */
  async ticketForApplicant(tx: Tx, applicationId: string): Promise<HallTicketData> {
    const [seat] = await tx.select({ testId: entranceSeats.testId }).from(entranceSeats).innerJoin(entranceTests, eq(entranceTests.id, entranceSeats.testId)).where(eq(entranceSeats.applicationId, applicationId)).orderBy(asc(entranceTests.testDate)).limit(1);
    if (!seat) throw new NotFoundException('No hall ticket yet: seats have not been allocated');
    return this.ticket(tx, seat.testId, applicationId);
  }
}
