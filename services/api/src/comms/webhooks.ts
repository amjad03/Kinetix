/** Pure parsers for providers' delivery reports, bounces and replies. Each yields the engine's events; unknown shapes yield none. */
import { reportStatus, type ReportStatus } from './comms.logic.js';

export type ProviderEvent =
  | { kind: 'report'; messageId: string; status: ReportStatus; error?: string; key: string }
  | { kind: 'reply'; from: string; text: string; key: string }
  | { kind: 'bounce'; email: string; permanent: boolean; messageId?: string; reason: string; key: string }
  | { kind: 'complaint'; email: string; messageId?: string; key: string }
  | { kind: 'subscribe'; url: string; key: string };

/** Which channel a provider serves. */
export const PROVIDER_CHANNEL: Record<string, 'sms' | 'whatsapp' | 'email'> = { msg91: 'sms', kaleyra: 'sms', gupshup: 'sms', console: 'sms', meta: 'whatsapp', ses: 'email', relay: 'email' };

const str = (v: unknown) => (v === undefined || v === null ? '' : String(v));
const list = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? (v as Record<string, unknown>[]) : v && typeof v === 'object' ? [v as Record<string, unknown>] : []);

function report(messageId: string, raw: unknown, error?: string): ProviderEvent[] {
  const status = reportStatus(raw as string);
  if (!messageId || !status) return [];
  return [{ kind: 'report', messageId, status, error: error || undefined, key: `${messageId}:${status}` }];
}

function reply(from: string, text: string, id: string): ProviderEvent[] {
  if (!from || !text) return [];
  return [{ kind: 'reply', from, text: text.slice(0, 1000), key: `reply:${id || `${from}:${text}`.slice(0, 120)}` }];
}

/** Delivery reports and replies from an SMS provider (MSG91, Kaleyra, Gupshup, the console stand-in). */
export function parseSms(provider: string, body: unknown): ProviderEvent[] {
  const out: ProviderEvent[] = [];
  const b = (body ?? {}) as Record<string, unknown>;
  if (provider === 'msg91') {
    // { data: [{ requestId, report: [{ number, status, desc }] }] } or a bare array.
    for (const item of list(b.data ?? body)) {
      const id = str(item.requestId ?? item.request_id);
      const reports = list(item.report);
      if (reports.length) for (const r of reports) out.push(...report(id, r.status, str(r.desc)));
      else out.push(...report(id, item.status, str(item.desc)));
      if (item.mobile && item.message) out.push(...reply(str(item.mobile), str(item.message), str(item.id)));
    }
    return out;
  }
  if (provider === 'kaleyra') {
    for (const item of list(b.data ?? body)) out.push(...report(str(item.message_id ?? item.id), item.status, str(item.description ?? item.status_description)));
    return out;
  }
  if (provider === 'gupshup') {
    for (const item of list(b.response ?? body)) {
      if (item.externalId) out.push(...report(str(item.externalId), item.status, str(item.cause)));
      else if (item.mobile && item.msg) out.push(...reply(str(item.mobile), str(item.msg), str(item.msgid)));
    }
    return out;
  }
  // console: { messageId, status } or { from, text }, one or many.
  for (const item of list(body)) {
    if (item.messageId) out.push(...report(str(item.messageId), item.status, str(item.error)));
    else if (item.from && item.text) out.push(...reply(str(item.from), str(item.text), str(item.id)));
  }
  return out;
}

/** Meta WhatsApp Cloud API webhook: statuses (sent, delivered, read, failed) and incoming messages. */
export function parseWhatsApp(body: unknown): ProviderEvent[] {
  const out: ProviderEvent[] = [];
  for (const entry of list((body as Record<string, unknown>)?.entry)) {
    for (const change of list(entry.changes)) {
      const value = (change.value ?? {}) as Record<string, unknown>;
      for (const s of list(value.statuses)) out.push(...report(str(s.id), s.status, list(s.errors).map((e) => str(e.title ?? e.message)).join('; ')));
      for (const m of list(value.messages)) {
        const text = str((m.text as Record<string, unknown> | undefined)?.body ?? (m.button as Record<string, unknown> | undefined)?.text ?? (m.interactive as Record<string, unknown> | undefined)?.type);
        out.push(...reply(str(m.from), text, str(m.id)));
      }
    }
  }
  return out;
}

/** Amazon SES through SNS: the subscription handshake, bounces, complaints and deliveries. `body` is the SNS envelope. */
export function parseSes(body: unknown): ProviderEvent[] {
  const env = (typeof body === 'string' ? safeJson(body) : body) as Record<string, unknown> | null;
  if (!env) return [];
  if (env.Type === 'SubscriptionConfirmation' && typeof env.SubscribeURL === 'string') return [{ kind: 'subscribe', url: env.SubscribeURL, key: `sub:${str(env.MessageId)}` }];
  const msg = (typeof env.Message === 'string' ? safeJson(env.Message) : env.Message ?? env) as Record<string, unknown> | null;
  if (!msg) return [];
  const type = str(msg.notificationType ?? msg.eventType);
  const mail = (msg.mail ?? {}) as Record<string, unknown>;
  const messageId = str(mail.messageId) || undefined;
  const key = str(env.MessageId) || `${messageId}:${type}`;
  if (type === 'Bounce') {
    const bounce = (msg.bounce ?? {}) as Record<string, unknown>;
    const permanent = bounce.bounceType === 'Permanent';
    const out: ProviderEvent[] = list(bounce.bouncedRecipients).map((r, i) => ({ kind: 'bounce' as const, email: str(r.emailAddress).toLowerCase(), permanent, messageId, reason: str(r.diagnosticCode) || `${str(bounce.bounceType)} bounce`, key: `${key}:${i}` }));
    if (messageId && permanent) out.push({ kind: 'report', messageId, status: 'bounced', error: 'Bounced', key: `${messageId}:bounced` });
    return out;
  }
  if (type === 'Complaint') return list(((msg.complaint ?? {}) as Record<string, unknown>).complainedRecipients).map((r, i) => ({ kind: 'complaint' as const, email: str(r.emailAddress).toLowerCase(), messageId, key: `${key}:${i}` }));
  if (type === 'Delivery' && messageId) return [{ kind: 'report', messageId, status: 'delivered', key: `${messageId}:delivered` }];
  return [];
}

/** SNS only hands out subscription links on its own hosts. */
export const isSnsUrl = (url: string) => {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && /^sns\.[a-z0-9-]+\.amazonaws\.com$/.test(u.hostname);
  } catch {
    return false;
  }
};

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}
