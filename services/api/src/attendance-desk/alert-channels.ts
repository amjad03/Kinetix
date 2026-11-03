import { and, eq, sql } from 'drizzle-orm';
import type { Tx } from '../db/db.service.js';
import { audienceRules, messageCampaigns, messageTemplates } from '../db/schema-pathways.js';

/** The Communication template keys attendance sends on SMS and WhatsApp (DLT-registered texts for SMS). */
export const ATTENDANCE_TEMPLATES = {
  /** {{student}} was absent on {{date}} for {{absent}} of {{held}} periods ({{subjects}}). */
  absence: 'attendance_absence',
  /** {{student}}'s attendance is {{pct}}% ({{subject}}); {{threshold}}% is needed for the examination. */
  shortage: 'attendance_shortage',
  /** {{student}} is on the detention list "{{list}}" ({{pct}}% against {{threshold}}%). */
  detention: 'attendance_detention',
} as const;
export type AttendanceTemplate = (typeof ATTENDANCE_TEMPLATES)[keyof typeof ATTENDANCE_TEMPLATES];

export interface ChannelResult {
  sms: number;
  whatsapp: number;
  /** Why a channel the policy asks for did not go out (no template, no DLT id). */
  skipped: string[];
}

/**
 * Queues the SMS and WhatsApp messages for one student's family (and the student) through Communication, once per
 * `dedupeKey` and channel: a one-person audience and a campaign due now, which the communication engine sends and
 * retries (suppression lists, the recipient's language and delivery reports apply as for any message).
 */
export async function queueFamilyMessage(
  tx: Tx,
  o: { tenantId: string; channels: readonly string[]; template: AttendanceTemplate; studentId: string; studentName: string; vars: Record<string, string>; dedupeKey: string; now: Date },
  out: ChannelResult,
): Promise<void> {
  for (const ch of ['sms', 'whatsapp'] as const) {
    if (!o.channels.includes(ch)) continue;
    const [tpl] = await tx.select().from(messageTemplates).where(and(eq(messageTemplates.key, o.template), eq(messageTemplates.channel, ch), eq(messageTemplates.active, true))).limit(1);
    const label = ch === 'sms' ? 'SMS' : 'WhatsApp';
    if (!tpl) {
      note(out, `No active "${o.template}" ${label} template in Communication`);
      continue;
    }
    if (ch === 'sms' && !tpl.dltTemplateId) {
      note(out, `The "${o.template}" SMS template has no DLT template id`);
      continue;
    }
    const family = await tx.execute<{ user_id: string }>(sql`select g.user_id from guardians g where g.student_id = ${o.studentId}::uuid and g.user_id is not null
      union select s.user_id from students s where s.id = ${o.studentId}::uuid and s.user_id is not null`);
    const ids = family.rows.map((r) => r.user_id);
    if (!ids.length) continue;
    const [rule] = await tx.insert(audienceRules).values({ tenantId: o.tenantId, name: `${o.dedupeKey}:${ch}`, rule: { userIds: ids } }).onConflictDoNothing().returning({ id: audienceRules.id });
    if (!rule) continue; // already queued on this channel
    await tx.insert(messageCampaigns).values({ tenantId: o.tenantId, title: `Attendance: ${o.studentName}`.slice(0, 160), templateId: tpl.id, audienceId: rule.id, vars: { student: o.studentName, ...o.vars }, sendAt: o.now, createdBy: null });
    out[ch]++;
  }
}

function note(out: ChannelResult, why: string) {
  if (!out.skipped.includes(why)) out.skipped.push(why);
}

export const emptyChannels = (): ChannelResult => ({ sms: 0, whatsapp: 0, skipped: [] });
