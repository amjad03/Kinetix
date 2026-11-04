import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { and, asc, desc, eq, gt, inArray, isNull, or, sql } from 'drizzle-orm';
import { audit } from '../common/audit.js';
import { Clock } from '../common/time.js';
import { departmentOf } from '../comms/comms.service.js';
import { DbService, type Tx } from '../db/db.service.js';
import { conversations, departments, messages, tenants, userRoles, users } from '../db/schema.js';
import { chatAvailability, chatBlocks } from '../db/schema-comms.js';
import { DomainEvents, EventBus } from '../events/events.js';
import { JobsService, type Job } from '../jobs/jobs.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { outsideOfficeHours, overdueForEscalation } from './chat-rules.js';

export const CHAT_ESCALATE = 'conversations.escalate-overdue';
/** Hours before an unanswered family message goes to the head of department, unless the institution sets its own. */
export const DEFAULT_ESCALATE_HOURS = 48;

type Conversation = typeof conversations.$inferSelect;

/**
 * Safety around family chat: blocks, escalation to the head of department (by the family, or when a message waits
 * too long), and staff availability (do-not-disturb and personal chat hours).
 */
@Injectable()
export class ChatSafetyService implements OnModuleInit {
  private readonly log = new Logger(ChatSafetyService.name);

  constructor(
    private readonly db: DbService,
    private readonly jobs: JobsService,
    private readonly clock: Clock,
    private readonly notifications: NotificationsService,
    private readonly events: EventBus,
  ) {}

  onModuleInit(): void {
    this.jobs.registerHourly(CHAT_ESCALATE, (job: Job) => this.escalateOverdue(job.tenantId).then(() => undefined));
  }

  /** The block that stops this person writing to this member of staff, or null. */
  async activeBlock(tx: Tx, userId: string, staffId: string) {
    const now = this.clock.now();
    const [b] = await tx
      .select()
      .from(chatBlocks)
      .where(and(eq(chatBlocks.userId, userId), isNull(chatBlocks.liftedAt), or(isNull(chatBlocks.until), gt(chatBlocks.until, now)), or(isNull(chatBlocks.staffId), eq(chatBlocks.staffId, staffId))))
      .orderBy(desc(chatBlocks.createdAt))
      .limit(1);
    return b ?? null;
  }

  /** When a member of staff is away: on do-not-disturb, or outside their own chat hours. */
  async away(tx: Tx, staffId: string, timeZone: string): Promise<{ until: Date | null; note: string; hours: { start: string; end: string; days: number[] } | null } | null> {
    const [a] = await tx.select().from(chatAvailability).where(eq(chatAvailability.userId, staffId));
    if (!a) return null;
    const now = this.clock.now();
    if (a.dndUntil && a.dndUntil > now) return { until: a.dndUntil, note: a.awayNote, hours: a.hours };
    if (outsideOfficeHours(now, timeZone, a.hours)) return { until: null, note: a.awayNote, hours: a.hours };
    return null;
  }

  /**
   * Who a thread goes up to: the head of the teacher's department, or the principal when the teacher is the head
   * (or has no department). Null when nobody is above.
   */
  async escalationTarget(tx: Tx, staffId: string): Promise<string | null> {
    const dept = await departmentOf(tx, staffId);
    if (dept) {
      const [d] = await tx.select({ head: departments.headUserId }).from(departments).where(eq(departments.id, dept));
      if (d?.head && d.head !== staffId) return d.head;
    }
    const [principal] = await tx
      .select({ id: users.id })
      .from(userRoles)
      .innerJoin(users, eq(users.id, userRoles.userId))
      .where(and(eq(userRoles.role, 'principal'), eq(users.status, 'active')))
      .orderBy(asc(users.fullName))
      .limit(1);
    return principal && principal.id !== staffId ? principal.id : null;
  }

  /** Hands the thread up: the head can read and reply, both sides see a note, the head is told. */
  async escalate(tx: Tx, c: Conversation, by: string | null, reason: string): Promise<string> {
    const to = await this.escalationTarget(tx, c.staffId);
    if (!to) throw new Error('Nobody to escalate to');
    const now = this.clock.now();
    await tx.update(conversations).set({ escalatedAt: now, escalatedTo: to, escalationReason: reason.slice(0, 300), status: 'open' }).where(eq(conversations.id, c.id));
    const [head] = await tx.select({ fullName: users.fullName }).from(users).where(eq(users.id, to));
    await tx.insert(messages).values({ tenantId: c.tenantId, conversationId: c.id, senderId: by ?? to, kind: 'system', body: `Escalated to ${head?.fullName ?? 'the head of department'}: ${reason}`.slice(0, 500), createdAt: now });
    await this.notifications.notifyUsers(tx, [to], {
      kind: 'message',
      text: { title: 'A conversation was escalated to you', body: reason.slice(0, 200) },
      data: { conversationId: c.id, studentId: c.studentId },
      dedupeKey: `conversation-escalated:${c.id}:${now.toISOString()}`,
    });
    await this.events.emit(tx, c.tenantId, { type: DomainEvents.ConversationEscalated, aggregateType: 'conversation', aggregateId: c.id, actorId: by ?? undefined, payload: { to, studentId: c.studentId, automatic: !by } });
    await audit(tx, { tenantId: c.tenantId, actorType: by ? 'user' : 'system', actorId: by ?? undefined, action: 'conversation.escalated', subjectType: 'conversation', subjectId: c.id, data: { to, reason } });
    return to;
  }

  /** Hourly: teacher threads where the family has waited longer than the institution allows go to the head of department. */
  async escalateOverdue(tenantId: string): Promise<number> {
    return this.db.withTenant(tenantId, async (tx) => {
      const [t] = await tx.select({ settings: tenants.settings }).from(tenants);
      const hours = t?.settings.chat?.escalateAfterHours ?? DEFAULT_ESCALATE_HOURS;
      if (!hours) return 0;
      const now = this.clock.now();
      const rows = await tx
        .select({
          c: conversations,
          lastFamily: sql<string | null>`(select max(m.created_at) from messages m where m.conversation_id = ${conversations.id} and m.kind = 'text' and m.sender_id = ${conversations.familyId})`,
          lastStaff: sql<string | null>`(select max(m.created_at) from messages m where m.conversation_id = ${conversations.id} and m.kind = 'text' and m.sender_id <> ${conversations.familyId})`,
        })
        .from(conversations)
        .where(and(eq(conversations.kind, 'teacher'), eq(conversations.status, 'open'), isNull(conversations.escalatedAt)));
      let n = 0;
      for (const r of rows) {
        if (!overdueForEscalation(r.lastFamily ? new Date(r.lastFamily) : null, r.lastStaff ? new Date(r.lastStaff) : null, now, hours)) continue;
        if (!(await this.escalationTarget(tx, r.c.staffId))) continue;
        await this.escalate(tx, r.c, null, `No reply for ${hours} hours`);
        n++;
      }
      if (n) this.log.log(`Escalated ${n} unanswered conversation(s) for ${tenantId}`);
      return n;
    });
  }

  /** The people in a thread who should hear of a change. */
  people(c: Conversation): string[] {
    return [c.familyId, c.staffId, ...(c.escalatedTo ? [c.escalatedTo] : [])];
  }

  async hasRole(tx: Tx, userId: string, roles: string[]): Promise<boolean> {
    const [r] = await tx.select({ id: userRoles.userId }).from(userRoles).where(and(eq(userRoles.userId, userId), inArray(userRoles.role, roles as never[]))).limit(1);
    return !!r;
  }
}
