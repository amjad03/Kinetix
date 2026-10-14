import { Body, Controller, Get, Put } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { Auth, CurrentPrincipal, STAFF_ADMIN_ROLES } from '../auth/auth.decorators.js';
import type { UserPrincipal } from '../auth/principal.js';
import { audit } from '../common/audit.js';
import { ZodBody } from '../common/zod-body.js';
import { DbService, type Tx } from '../db/db.service.js';
import { notificationKind, tenants } from '../db/schema.js';

/** What each kind of app notification is about and who gets it. `message` (a reply in a conversation) cannot be turned off. */
export const NOTIFICATION_KINDS: { key: (typeof notificationKind.enumValues)[number]; label: string; audience: 'families' | 'staff' | 'everyone'; locked?: boolean }[] = [
  { key: 'absence', label: 'Absence alerts', audience: 'families' },
  { key: 'homework', label: 'Homework set, reviewed and due', audience: 'families' },
  { key: 'marks', label: 'Marks published', audience: 'families' },
  { key: 'fee', label: 'Fee invoices, reminders and receipts', audience: 'families' },
  { key: 'library', label: 'Library issues and due dates', audience: 'families' },
  { key: 'transport', label: 'Bus arrivals', audience: 'families' },
  { key: 'hostel', label: 'Hostel gate and night roll', audience: 'families' },
  { key: 'calendar', label: 'Calendar: holidays, exams and events', audience: 'everyone' },
  { key: 'broadcast', label: 'Broadcasts', audience: 'everyone' },
  { key: 'announcement', label: 'Announcements', audience: 'everyone' },
  { key: 'live', label: 'Live classes starting', audience: 'families' },
  { key: 'board_shared', label: 'Class boards shared', audience: 'families' },
  { key: 'recording', label: 'Lesson recordings', audience: 'everyone' },
  { key: 'badge', label: 'Badges awarded', audience: 'families' },
  { key: 'certificate', label: 'Certificates ready', audience: 'everyone' },
  { key: 'placement', label: 'Placement drives and offers', audience: 'families' },
  { key: 'survey', label: 'Surveys and polls', audience: 'everyone' },
  { key: 'grievance', label: 'Grievance updates', audience: 'everyone' },
  { key: 'welfare', label: 'Welfare and counselling', audience: 'everyone' },
  { key: 'leave', label: 'Leave decisions', audience: 'staff' },
  { key: 'payslip', label: 'Payslips', audience: 'staff' },
  { key: 'task', label: 'Tasks and approvals', audience: 'staff' },
  { key: 'message', label: 'Replies in a conversation', audience: 'everyone', locked: true },
];
const KEYS = NOTIFICATION_KINDS.map((k) => k.key) as [string, ...string[]];
const Body_ = z.object({ off: z.array(z.enum(KEYS)).max(KEYS.length), pushOff: z.array(z.enum(KEYS)).max(KEYS.length) });

async function current(tx: Tx, tenantId: string) {
  const [t] = await tx.select({ settings: tenants.settings }).from(tenants).where(eq(tenants.id, tenantId));
  const n = t?.settings.notifications ?? {};
  return { off: n.off ?? [], pushOff: n.pushOff ?? [] };
}

/** Settings > Notifications: which app notifications the institution sends, and which also buzz the phone. */
@Controller('v1/admin/notification-settings')
export class NotificationSettingsController {
  constructor(private readonly db: DbService) {}

  @Get()
  @Auth('user', STAFF_ADMIN_ROLES)
  get(@CurrentPrincipal() p: UserPrincipal) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const sent = await tx.execute<{ kind: string; n: number }>(sql`select kind::text as kind, count(*)::int as n from notifications where created_at >= now() - interval '30 days' group by kind`);
      const last30 = Object.fromEntries(sent.rows.map((r) => [r.kind, r.n]));
      return { kinds: NOTIFICATION_KINDS.map((k) => ({ ...k, locked: !!k.locked, sent30: last30[k.key] ?? 0 })), ...(await current(tx, p.tenantId)) };
    });
  }

  @Put()
  @Auth('user', STAFF_ADMIN_ROLES)
  save(@CurrentPrincipal() p: UserPrincipal, @Body(new ZodBody(Body_)) b: z.infer<typeof Body_>) {
    return this.db.withTenant(p.tenantId, async (tx) => {
      const before = await current(tx, p.tenantId);
      const off = [...new Set(b.off)].filter((k) => k !== 'message').sort();
      // A kind that is not sent has no push either way; keep the list to the kinds that are sent.
      const pushOff = [...new Set(b.pushOff)].filter((k) => !off.includes(k)).sort();
      await tx.execute(sql`update tenants set settings = jsonb_set(settings, '{notifications}', ${JSON.stringify({ off, pushOff })}::jsonb, true) where id = ${p.tenantId}::uuid`);
      await audit(tx, { tenantId: p.tenantId, actorType: 'user', actorId: p.userId, action: 'settings.notifications_updated', subjectType: 'tenant', subjectId: p.tenantId, before: { off: before.off.join(', '), pushOff: before.pushOff.join(', ') }, after: { off: off.join(', '), pushOff: pushOff.join(', ') } });
      return { off, pushOff };
    });
  }
}
