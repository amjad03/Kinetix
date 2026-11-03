import { and, eq, sql } from 'drizzle-orm';
import type { Tx } from '../db/db.service.js';
import { audienceRules, messageCampaigns, messageTemplates } from '../db/schema-pathways.js';

export type OutChannel = 'sms' | 'whatsapp' | 'email';

/** The family's user accounts: guardians and the student. */
export async function familyUserIds(tx: Tx, studentId: string): Promise<string[]> {
  const r = await tx.execute<{ user_id: string }>(sql`select g.user_id from guardians g where g.student_id = ${studentId}::uuid and g.user_id is not null union select s.user_id from students s where s.id = ${studentId}::uuid and s.user_id is not null`);
  return r.rows.map((x) => x.user_id).filter(Boolean);
}

/**
 * Sends a fees message on SMS, WhatsApp or e-mail through the institution's Communication template `key` on that
 * channel (DLT-registered for SMS), queued as a campaign so delivery, retries, DND and the delivery report are the
 * communication module's. `dedupe` makes the same message to the same people go once.
 */
export async function sendFeeMessage(tx: Tx, o: { tenantId: string; key: string; channel: OutChannel; userIds: string[]; vars: Record<string, string>; title: string; dedupe: string; createdBy: string | null; at: Date }): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!o.userIds.length) return { ok: false, error: 'No family member has an account' };
  const [tpl] = await tx.select().from(messageTemplates).where(and(eq(messageTemplates.key, o.key), eq(messageTemplates.channel, o.channel), eq(messageTemplates.active, true))).limit(1);
  const label = o.channel === 'sms' ? 'SMS' : o.channel === 'whatsapp' ? 'WhatsApp' : 'e-mail';
  if (!tpl) return { ok: false, error: `No active "${o.key}" ${label} template in Communication` };
  if (o.channel === 'sms' && !tpl.dltTemplateId) return { ok: false, error: `The "${o.key}" SMS template has no DLT template id` };
  const [rule] = await tx.insert(audienceRules).values({ tenantId: o.tenantId, name: `${o.dedupe} ${o.channel}`.slice(0, 200), rule: { userIds: o.userIds } }).onConflictDoNothing().returning();
  if (!rule) return { ok: false, error: 'Already sent' };
  await tx.insert(messageCampaigns).values({ tenantId: o.tenantId, title: o.title.slice(0, 200), templateId: tpl.id, audienceId: rule.id, vars: o.vars, sendAt: o.at, createdBy: o.createdBy });
  return { ok: true };
}
