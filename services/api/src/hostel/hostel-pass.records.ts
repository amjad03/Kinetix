import { BadRequestException, ConflictException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { z } from 'zod';
import { auditUser } from '../common/audit.js';
import { choiceFilter, choices, oneOf, qual, Rupees, rupeesOf, studentByRoll, todayIn, yesNo } from '../common/lht-kit.js';
import { Clock } from '../common/time.js';
import { hostelCommittees, hostelGateLogs, messExpenses, messInspections } from '../db/schema-hostel-pass.js';
import { hostels, messBills } from '../db/schema-lht.js';
import { committeeMembers, committees, hostelGatePasses, students, users } from '../db/schema.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { RecordRegistry, type KitCtx, type RecordEntity } from '../records/entity.js';
import { DateText, Text, uuidEq } from '../records/helpers.js';
import { HOSTEL_ROLES } from './hostel.controller.js';
import { HostelRecords, hostelOptions, studentCols, studentField, studentSearch, withStudent } from './hostel.records.js';
import { gateEvent } from './hostel-pass.controller.js';
import { LOCAL_TODAY, studentScope } from './hostel-scope.js';

const DIRECTIONS = choices(['out', 'Out'], ['in', 'In']);
const METHODS = choices(['qr', 'QR scan'], ['manual', 'By hand']);
const PURPOSES = choices(['anti_ragging', 'Anti-ragging committee'], ['anti_ragging_squad', 'Anti-ragging squad'], ['mess', 'Mess committee'], ['discipline', 'Discipline committee']);
const MEMBER_ROLES = choices(['chair', 'Chair'], ['secretary', 'Secretary'], ['member', 'Member'], ['external', 'External member']);
const MEALS = choices(['breakfast', 'Breakfast'], ['lunch', 'Lunch'], ['snacks', 'Snacks'], ['dinner', 'Dinner']);
const HEADS = choices(['provisions', 'Provisions'], ['vegetables', 'Vegetables'], ['milk', 'Milk and dairy'], ['fuel', 'Gas and fuel'], ['wages', 'Cooks’ wages'], ['other', 'Other']);
const Score = z.coerce.number().int().min(1, 'Give 1 to 5').max(5, 'Give 1 to 5');
const MESS_ROLES = [...HOSTEL_ROLES, 'canteen_manager' as const];
const Month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use a month like 2026-10');
const inspector = alias(users, 'inspector');
const recorder = alias(users, 'recorder');

/**
 * The hostel pass's record lists: the gate log (every QR scan and hand entry), the hostel's committees (anti-ragging
 * committee and squad, mess and discipline committees, with members), mess committee inspections and the month's
 * mess spending behind the diet system bill.
 */
@Injectable()
export class HostelPassRecords implements OnModuleInit {
  constructor(
    private readonly registry: RecordRegistry,
    private readonly clock: Clock,
    private readonly notifications: NotificationsService,
    private readonly records: HostelRecords,
  ) {}

  onModuleInit(): void {
    for (const e of [this.gateLog(), this.committees(), this.inspections(), this.expenses()]) this.registry.register(e);
  }

  gateLog(): RecordEntity {
    return {
      key: 'hostel-gate-log',
      module: 'hostel',
      table: hostelGateLogs,
      subjectType: 'hostel_gate_log',
      roles: { read: HOSTEL_ROLES, write: HOSTEL_ROLES },
      label: (r) => `${r.rollNo} ${r.studentName} · ${r.direction}`,
      list: {
        select: { id: hostelGateLogs.id, ...studentCols, at: hostelGateLogs.at, direction: hostelGateLogs.direction, method: hostelGateLogs.method, passReason: hostelGatePasses.reason, minutesLate: hostelGateLogs.minutesLate, gate: hostelGateLogs.gate, note: hostelGateLogs.note, recordedBy: recorder.fullName },
        joins: (q) => withStudent(hostelGateLogs.studentId)(q).leftJoin(hostelGatePasses, eq(hostelGatePasses.id, hostelGateLogs.gatePassId)).leftJoin(recorder, eq(recorder.id, hostelGateLogs.recordedBy)),
        search: [...studentSearch, hostelGateLogs.note, hostelGateLogs.gate],
        filters: {
          direction: choiceFilter('Out or in', hostelGateLogs.direction, DIRECTIONS),
          method: choiceFilter('By', hostelGateLogs.method, METHODS),
          late: yesNo('Late', sql`${hostelGateLogs.minutesLate} > 0`, sql`${hostelGateLogs.minutesLate} = 0`, ['Came in late', 'On time']),
          pass: yesNo('On a pass', sql`${hostelGateLogs.gatePassId} is not null`, sql`${hostelGateLogs.gatePassId} is null`, ['On an out-pass', 'Local outing']),
          day: { label: 'Day', where: (v) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? sql`(${hostelGateLogs.at} at time zone 'Asia/Kolkata')::date = ${v}::date` : undefined) },
          when: { label: 'When', options: choices(['today', 'Today'], ['week', 'Last 7 days']), where: (v) => (v === 'today' ? sql`(${hostelGateLogs.at} at time zone 'Asia/Kolkata')::date = (now() at time zone 'Asia/Kolkata')::date` : v === 'week' ? sql`${hostelGateLogs.at} > now() - interval '7 days'` : undefined) },
        },
        sorts: { at: hostelGateLogs.at, name: students.fullName, minutes: hostelGateLogs.minutesLate },
        defaultSort: { id: 'at', dir: 'desc' },
        scope: (ctx) => studentScope(ctx.p, hostelGateLogs.studentId),
      },
      fields: {
        student: studentField(),
        direction: { label: 'Out or in', type: 'select', schema: oneOf(DIRECTIONS), options: DIRECTIONS, column: hostelGateLogs.direction, required: true, edit: false },
        note: { label: 'Why by hand', type: 'text', schema: z.string().trim().min(3, 'Say why the QR was not used').max(300), column: hostelGateLogs.note, required: true, edit: false },
        gate: { label: 'Gate', type: 'text', schema: z.string().trim().max(60), column: hostelGateLogs.gate, edit: false },
      },
      // An entry made here is a hand entry at the gate, with the same rules as a scan.
      create: async (ctx, v) => {
        const s = await studentByRoll(ctx.tx, String(v.student));
        const log = await gateEvent(ctx.tx, ctx.p, this.clock.now(), { notifications: this.notifications, records: this.records }, { studentId: s.id, direction: v.direction as 'out' | 'in', method: 'manual', gate: String(v.gate ?? ''), note: String(v.note ?? '') });
        return log.id;
      },
      remove: { guard: async () => 'The gate log is kept as it was recorded' },
      columns: [
        { key: 'at', header: 'When' },
        { key: 'direction', header: 'Out or in' },
        { key: 'rollNo', header: 'Roll no.' },
        { key: 'studentName', header: 'Student' },
        { key: 'method', header: 'By' },
        { key: 'passReason', header: 'Out-pass' },
        { key: 'minutesLate', header: 'Minutes late' },
        { key: 'gate', header: 'Gate' },
        { key: 'note', header: 'Note' },
        { key: 'recordedBy', header: 'Recorded by' },
      ],
    };
  }

  committees(): RecordEntity {
    const members = sql<number>`(select count(*)::int from committee_members m where m.committee_id = ${qual(hostelCommittees.committeeId)} and (m.tenure_end is null or m.tenure_end >= ${LOCAL_TODAY}))`;
    const chair = sql<string | null>`(select u.full_name from committee_members m join users u on u.id = m.user_id where m.committee_id = ${qual(hostelCommittees.committeeId)} and m.role = 'chair' and (m.tenure_end is null or m.tenure_end >= ${LOCAL_TODAY}) limit 1)`;
    const lastMeeting = sql<string | null>`(select max(mt.meeting_on)::text from committee_meetings mt where mt.committee_id = ${qual(hostelCommittees.committeeId)} and mt.status = 'held')`;
    const valid = sql`(${hostelCommittees.validUntil} is null or ${hostelCommittees.validUntil} >= ${LOCAL_TODAY})`;
    return {
      key: 'hostel-committees',
      module: 'hostel',
      table: hostelCommittees,
      subjectType: 'hostel_committee',
      roles: { read: [...HOSTEL_ROLES, 'quality_officer'], write: HOSTEL_ROLES },
      label: (r) => String(r.name),
      list: {
        select: { id: hostelCommittees.id, committeeId: hostelCommittees.committeeId, name: committees.name, purpose: hostelCommittees.purpose, hostelId: hostelCommittees.hostelId, hostelName: hostels.name, constitutedOn: hostelCommittees.constitutedOn, validUntil: hostelCommittees.validUntil, helpline: hostelCommittees.helpline, chair, members, lastMeeting, status: sql<string>`case when ${valid} then 'active' else 'expired' end` },
        joins: (q) => q.innerJoin(committees, eq(committees.id, hostelCommittees.committeeId)).leftJoin(hostels, eq(hostels.id, hostelCommittees.hostelId)),
        search: [committees.name],
        filters: { purpose: choiceFilter('Purpose', hostelCommittees.purpose, PURPOSES), hostel: { label: 'Hostel', options: hostelOptions, where: (v) => uuidEq(hostelCommittees.hostelId, v) }, current: yesNo('In date', valid, sql`not ${valid}`, ['In date', 'Expired']) },
        sorts: { name: committees.name, purpose: hostelCommittees.purpose, constituted: hostelCommittees.constitutedOn },
        defaultSort: { id: 'purpose', dir: 'asc' },
      },
      fields: {
        name: { label: 'Name', type: 'text', schema: Text(120), required: true, rowKey: 'name', apply: async (ctx, id, v) => {
          const [hc] = await ctx.tx.select({ c: hostelCommittees.committeeId }).from(hostelCommittees).where(eq(hostelCommittees.id, id));
          await ctx.tx.update(committees).set({ name: String(v) }).where(eq(committees.id, hc.c));
        } },
        purpose: { label: 'Purpose', type: 'select', schema: oneOf(PURPOSES), options: PURPOSES, column: hostelCommittees.purpose, required: true },
        hostelId: { label: 'Hostel', type: 'select', schema: z.uuid().nullable().optional(), options: hostelOptions, column: hostelCommittees.hostelId, help: 'Empty = every hostel' },
        constitutedOn: { label: 'Constituted on', type: 'date', schema: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-10-15'), column: hostelCommittees.constitutedOn, required: true },
        validUntil: { label: 'Valid until', type: 'date', schema: DateText, column: hostelCommittees.validUntil },
        helpline: { label: 'Helpline', type: 'phone', schema: z.string().trim().max(40), column: hostelCommittees.helpline, help: 'Shown to residents with the national anti-ragging helpline' },
      },
      // The committee itself goes on the institution's committee list (statutory for the anti-ragging ones).
      create: async (ctx, v) => {
        const name = String(v.name);
        const purpose = String(v.purpose);
        const [c] = await ctx.tx.insert(committees).values({ tenantId: ctx.p.tenantId, name, statutory: purpose.startsWith('anti_ragging'), description: PURPOSES.find((x) => x.value === purpose)?.label ?? '' }).onConflictDoNothing().returning({ id: committees.id });
        const committeeId = c?.id ?? (await ctx.tx.select({ id: committees.id }).from(committees).where(sql`lower(${committees.name}) = ${name.toLowerCase()}`))[0].id;
        const [row] = await ctx.tx.insert(hostelCommittees).values({ tenantId: ctx.p.tenantId, committeeId, hostelId: (v.hostelId as string | null) ?? null, purpose, constitutedOn: String(v.constitutedOn), validUntil: (v.validUntil as string | null) ?? null, helpline: String(v.helpline ?? '') }).onConflictDoNothing().returning({ id: hostelCommittees.id });
        if (!row) throw new ConflictException('That committee already serves the hostel');
        return row.id;
      },
      check: async (ctx, id) => {
        const [r] = await ctx.tx.select().from(hostelCommittees).where(eq(hostelCommittees.id, id));
        if (r.validUntil && r.validUntil < r.constitutedOn) throw new BadRequestException('Valid until is before the day it was constituted');
      },
      columns: [
        { key: 'name', header: 'Committee' },
        { key: 'purpose', header: 'Purpose' },
        { key: 'hostelName', header: 'Hostel' },
        { key: 'chair', header: 'Chair' },
        { key: 'members', header: 'Members' },
        { key: 'constitutedOn', header: 'Constituted' },
        { key: 'validUntil', header: 'Valid until' },
        { key: 'lastMeeting', header: 'Last meeting' },
        { key: 'helpline', header: 'Helpline' },
        { key: 'status', header: 'Status' },
      ],
      actions: {
        addMember: {
          label: 'Add a member',
          params: z.object({ person: z.string().trim().min(2, 'Give an email or a roll number').max(120), role: oneOf(MEMBER_ROLES).default('member') }),
          apply: async (ctx, id, raw) => {
            const p = raw as { person: string; role: string };
            const [hc] = await ctx.tx.select().from(hostelCommittees).where(eq(hostelCommittees.id, id));
            // A staff member by email, or a student (a resident on the mess committee) by roll number.
            const [u] = p.person.includes('@')
              ? await ctx.tx.select({ id: users.id, name: users.fullName }).from(users).where(sql`lower(${users.email}) = ${p.person.toLowerCase()}`)
              : await ctx.tx.select({ id: students.userId, name: students.fullName }).from(students).where(sql`lower(${students.rollNo}) = ${p.person.toLowerCase()} and ${students.userId} is not null`);
            if (!u?.id) throw new NotFoundException('No one with that email or roll number');
            const [dup] = await ctx.tx.select({ id: committeeMembers.id }).from(committeeMembers).where(and(eq(committeeMembers.committeeId, hc.committeeId), eq(committeeMembers.userId, u.id), sql`(${committeeMembers.tenureEnd} is null or ${committeeMembers.tenureEnd} >= ${LOCAL_TODAY})`));
            if (dup) throw new ConflictException(`${u.name} is already a member`);
            const [m] = await ctx.tx.insert(committeeMembers).values({ tenantId: ctx.p.tenantId, committeeId: hc.committeeId, userId: u.id, role: p.role, tenureStart: await todayIn(ctx.tx, this.clock.now()), tenureEnd: hc.validUntil }).returning({ id: committeeMembers.id });
            await auditUser(ctx.tx, ctx.p, 'hostel_committee.member_added', 'hostel_committee', id, { memberId: m.id, userId: u.id, role: p.role });
            return u.name;
          },
        },
      },
    };
  }

  inspections(): RecordEntity {
    const avg = sql<number>`round((${messInspections.quality} + ${messInspections.quantity} + ${messInspections.hygiene}) / 3.0, 1)::float`;
    return {
      key: 'mess-inspections',
      module: 'hostel',
      table: messInspections,
      subjectType: 'mess_inspection',
      roles: { read: MESS_ROLES, write: MESS_ROLES },
      label: (r) => `${r.inspectedOn} ${r.meal}`,
      list: {
        select: { id: messInspections.id, inspectedOn: messInspections.inspectedOn, meal: messInspections.meal, hostelId: messInspections.hostelId, hostelName: hostels.name, quality: messInspections.quality, quantity: messInspections.quantity, hygiene: messInspections.hygiene, average: avg, remarks: messInspections.remarks, actionTaken: messInspections.actionTaken, status: messInspections.status, inspector: inspector.fullName },
        joins: (q) => q.innerJoin(inspector, eq(inspector.id, messInspections.inspectorUserId)).leftJoin(hostels, eq(hostels.id, messInspections.hostelId)),
        search: [messInspections.remarks, messInspections.actionTaken, inspector.fullName],
        filters: { status: choiceFilter('Status', messInspections.status, choices(['open', 'Open'], ['closed', 'Closed'])), meal: choiceFilter('Meal', messInspections.meal, MEALS), poor: yesNo('Poor', sql`least(${messInspections.quality}, ${messInspections.quantity}, ${messInspections.hygiene}) <= 2`, sql`least(${messInspections.quality}, ${messInspections.quantity}, ${messInspections.hygiene}) > 2`, ['A score of 2 or less', 'All 3 or more']) },
        sorts: { on: messInspections.inspectedOn, average: avg },
        defaultSort: { id: 'on', dir: 'desc' },
      },
      fields: {
        hostelId: { label: 'Hostel', type: 'select', schema: z.uuid().nullable().optional(), options: hostelOptions, column: messInspections.hostelId },
        inspectedOn: { label: 'Day', type: 'date', schema: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-10-15'), column: messInspections.inspectedOn, required: true },
        meal: { label: 'Meal', type: 'select', schema: oneOf(MEALS), options: MEALS, column: messInspections.meal, required: true },
        quality: { label: 'Quality (1-5)', type: 'number', schema: Score, column: messInspections.quality, required: true },
        quantity: { label: 'Quantity (1-5)', type: 'number', schema: Score, column: messInspections.quantity, required: true },
        hygiene: { label: 'Hygiene (1-5)', type: 'number', schema: Score, column: messInspections.hygiene, required: true },
        remarks: { label: 'Remarks', type: 'textarea', schema: z.string().trim().max(1000), column: messInspections.remarks },
      },
      create: async (ctx, v) => {
        if (String(v.inspectedOn) > (await todayIn(ctx.tx, this.clock.now()))) throw new BadRequestException('That meal has not been served yet');
        const [row] = await ctx.tx.insert(messInspections).values({ tenantId: ctx.p.tenantId, hostelId: (v.hostelId as string | null) ?? null, inspectedOn: String(v.inspectedOn), meal: String(v.meal), quality: Number(v.quality), quantity: Number(v.quantity), hygiene: Number(v.hygiene), remarks: String(v.remarks ?? ''), inspectorUserId: ctx.p.userId }).returning({ id: messInspections.id });
        return row.id;
      },
      columns: [
        { key: 'inspectedOn', header: 'Day' },
        { key: 'meal', header: 'Meal' },
        { key: 'hostelName', header: 'Hostel' },
        { key: 'quality', header: 'Quality' },
        { key: 'quantity', header: 'Quantity' },
        { key: 'hygiene', header: 'Hygiene' },
        { key: 'average', header: 'Average' },
        { key: 'remarks', header: 'Remarks' },
        { key: 'actionTaken', header: 'Action taken' },
        { key: 'inspector', header: 'Inspected by' },
        { key: 'status', header: 'Status' },
      ],
      actions: {
        close: {
          label: 'Close with the action taken',
          params: z.object({ actionTaken: z.string().trim().min(3, 'Say what was done').max(500) }),
          apply: async (ctx, id, raw) => {
            const [r] = await ctx.tx.update(messInspections).set({ status: 'closed', actionTaken: (raw as { actionTaken: string }).actionTaken }).where(and(eq(messInspections.id, id), eq(messInspections.status, 'open'))).returning();
            if (!r) throw new ConflictException('Already closed');
            await auditUser(ctx.tx, ctx.p, 'mess_inspection.closed', 'mess_inspection', id, { changes: { status: { before: 'open', after: 'closed' } } });
          },
        },
      },
    };
  }

  expenses(): RecordEntity {
    const billed = async (ctx: KitCtx, month: string) => (await ctx.tx.select({ id: messBills.id }).from(messBills).where(and(eq(messBills.month, month), eq(messBills.status, 'charged'), sql`${messBills.diets} > 0`)).limit(1)).length > 0;
    return {
      key: 'mess-expenses',
      module: 'hostel',
      table: messExpenses,
      subjectType: 'mess_expense',
      roles: { read: [...MESS_ROLES, 'accountant'], write: MESS_ROLES },
      label: (r) => `${r.month} ${r.head} ₹${r.amountRupees}`,
      list: {
        select: { id: messExpenses.id, month: messExpenses.month, head: messExpenses.head, amountRupees: rupeesOf(messExpenses.amountPaise), spentOn: messExpenses.spentOn, note: messExpenses.note, fromStock: sql<boolean>`${messExpenses.stockLogId} is not null` },
        search: [messExpenses.note],
        filters: { month: { label: 'Month', where: (v) => (/^\d{4}-\d{2}$/.test(v) ? eq(messExpenses.month, v) : undefined) }, head: choiceFilter('Head', messExpenses.head, HEADS), stock: yesNo('From kitchen purchases', sql`${messExpenses.stockLogId} is not null`, sql`${messExpenses.stockLogId} is null`) },
        sorts: { on: messExpenses.spentOn, amount: messExpenses.amountPaise, month: messExpenses.month },
        defaultSort: { id: 'on', dir: 'desc' },
      },
      fields: {
        month: { label: 'Month', type: 'text', schema: Month, column: messExpenses.month, required: true, help: 'The mess month it belongs to, like 2026-10' },
        head: { label: 'Head', type: 'select', schema: oneOf(HEADS), options: HEADS, column: messExpenses.head, required: true, bulk: true },
        amount: { label: 'Amount (₹)', type: 'number', schema: Rupees.refine((n) => n > 0, 'Give the amount'), column: messExpenses.amountPaise, rowKey: 'amountRupees', required: true },
        spentOn: { label: 'Spent on', type: 'date', schema: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-10-15'), column: messExpenses.spentOn, required: true },
        note: { label: 'Note', type: 'text', schema: z.string().trim().max(200), column: messExpenses.note },
      },
      create: async (ctx, v) => {
        if (await billed(ctx, String(v.month))) throw new ConflictException('The diet bills of this month are already charged');
        const [row] = await ctx.tx.insert(messExpenses).values({ tenantId: ctx.p.tenantId, month: String(v.month), head: String(v.head), amountPaise: Number(v.amount), spentOn: String(v.spentOn), note: String(v.note ?? ''), createdBy: ctx.p.userId }).returning({ id: messExpenses.id });
        return row.id;
      },
      check: async (ctx, id) => {
        const [r] = await ctx.tx.select().from(messExpenses).where(eq(messExpenses.id, id));
        if (r.spentOn.slice(0, 7) > r.month) throw new BadRequestException('Spent after the month it is billed in');
      },
      remove: { guard: async (ctx, id) => ((await billed(ctx, (await ctx.tx.select({ m: messExpenses.month }).from(messExpenses).where(eq(messExpenses.id, id)))[0]?.m ?? '')) ? 'The diet bills of this month are already charged' : null) },
      columns: [
        { key: 'month', header: 'Month' },
        { key: 'spentOn', header: 'Spent on' },
        { key: 'head', header: 'Head' },
        { key: 'amountRupees', header: 'Amount (₹)' },
        { key: 'note', header: 'Note' },
        { key: 'fromStock', header: 'From kitchen purchases' },
      ],
    };
  }
}
