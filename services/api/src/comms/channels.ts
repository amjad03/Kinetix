import { createHash, createHmac } from 'node:crypto';
import { Logger } from '@nestjs/common';

export interface TextMessage {
  /** E.164, e.g. +919800000001. */
  to: string;
  /** The rendered text, for development logs and providers that take the full text. */
  text: string;
  /** The operator-registered (DLT) template this text was made from. */
  templateId: string;
  /** The template's variables by name, for providers that fill their own registered template. */
  vars: Record<string, string>;
  /** The DLT header (sender id) and principal entity id the template is registered under; empty = the provider default. */
  header?: string;
  entityId?: string;
  /** DLT content type: transactional and service messages reach DND numbers, promotional ones do not. */
  contentType?: string;
}

/** What a provider said when it took a message: its id (for the delivery report). */
export interface SendReceipt {
  providerMessageId?: string;
}

/** Sends a registered SMS. Unlike the sign-in code sender, this throws when the message could not be handed over, so the engine can retry. */
export abstract class TextSender {
  abstract readonly provider: string;
  abstract send(msg: TextMessage): Promise<SendReceipt>;
}

/** Development and tests: records what would be sent. */
export class ConsoleTextSender extends TextSender {
  readonly provider = 'console';
  private readonly log = new Logger('SMS');
  readonly sent: TextMessage[] = [];
  async send(msg: TextMessage): Promise<SendReceipt> {
    this.sent.push(msg);
    this.log.log(`SMS to ${msg.to.slice(0, 3)}******${msg.to.slice(-4)} (template ${msg.templateId}): ${msg.text.length} characters`);
    return { providerMessageId: `console-${Date.now().toString(36)}-${this.sent.length}` };
  }
}

const json = async (res: Response) => (await res.json().catch(() => ({}))) as Record<string, unknown>;

/** MSG91 Flow API v5: the template id is the MSG91 flow linked to the DLT template, and the vars fill its `##name##` slots. */
export class Msg91TextSender extends TextSender {
  readonly provider = 'msg91';
  constructor(
    private readonly cfg: { authKey: string; senderId: string },
    private readonly url = 'https://control.msg91.com/api/v5/flow',
  ) {
    super();
  }

  async send(msg: TextMessage): Promise<SendReceipt> {
    const res = await fetch(this.url, {
      method: 'POST',
      headers: { authkey: this.cfg.authKey, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ template_id: msg.templateId, sender: msg.header || this.cfg.senderId, short_url: '0', recipients: [{ mobiles: msg.to.replace(/^\+/, ''), ...msg.vars }] }),
      signal: AbortSignal.timeout(10_000),
    });
    const body = (await json(res)) as { type?: string; message?: string; request_id?: string };
    if (!res.ok || body.type === 'error') throw new Error(`MSG91 rejected the SMS: ${res.status} ${body.message ?? ''}`.trim());
    return { providerMessageId: body.request_id ?? body.message };
  }
}

/**
 * Kaleyra (v1 messages API): the full text goes with the DLT template id, the header as `sender` and the principal
 * entity id; `type` is TXN for transactional and service text, MKT for promotional.
 */
export class KaleyraTextSender extends TextSender {
  readonly provider = 'kaleyra';
  constructor(
    private readonly cfg: { sid: string; apiKey: string; senderId: string; callbackUrl?: string },
    private readonly base = 'https://api.kaleyra.io/v1',
  ) {
    super();
  }

  async send(msg: TextMessage): Promise<SendReceipt> {
    const form = new URLSearchParams({
      to: msg.to,
      sender: msg.header || this.cfg.senderId,
      body: msg.text,
      type: msg.contentType === 'promotional' ? 'MKT' : 'TXN',
      template_id: msg.templateId,
      ...(msg.entityId ? { entity_id: msg.entityId } : {}),
      ...(this.cfg.callbackUrl ? { callback: this.cfg.callbackUrl } : {}),
    });
    const res = await fetch(`${this.base}/${encodeURIComponent(this.cfg.sid)}/messages`, {
      method: 'POST',
      headers: { 'api-key': this.cfg.apiKey, 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
      body: form,
      signal: AbortSignal.timeout(10_000),
    });
    const body = (await json(res)) as { id?: string; data?: { message_id?: string }[]; error?: { message?: string } };
    if (!res.ok || body.error) throw new Error(`Kaleyra rejected the SMS: ${res.status} ${body.error?.message ?? ''}`.trim());
    return { providerMessageId: body.data?.[0]?.message_id ?? body.id };
  }
}

/** Gupshup Enterprise SMS (GatewayAPI rest, SendMessage) with the DLT principal entity id and template id. */
export class GupshupTextSender extends TextSender {
  readonly provider = 'gupshup';
  constructor(
    private readonly cfg: { userId: string; password: string; senderId: string },
    private readonly url = 'https://enterprise.smsgupshup.com/GatewayAPI/rest',
  ) {
    super();
  }

  async send(msg: TextMessage): Promise<SendReceipt> {
    const unicode = /[^\x00-\x7F]/.test(msg.text);
    const form = new URLSearchParams({
      method: 'SendMessage',
      send_to: msg.to.replace(/^\+/, ''),
      msg: msg.text,
      msg_type: unicode ? 'Unicode_Text' : 'TEXT',
      userid: this.cfg.userId,
      password: this.cfg.password,
      auth_scheme: 'plain',
      v: '1.1',
      format: 'json',
      mask: msg.header || this.cfg.senderId,
      dltTemplateId: msg.templateId,
      ...(msg.entityId ? { principalEntityId: msg.entityId } : {}),
    });
    const res = await fetch(this.url, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: form, signal: AbortSignal.timeout(10_000) });
    const body = (await json(res)) as { response?: { id?: string; status?: string; details?: string } };
    if (!res.ok || body.response?.status !== 'success') throw new Error(`Gupshup rejected the SMS: ${res.status} ${body.response?.details ?? ''}`.trim());
    return { providerMessageId: body.response.id };
  }
}

export interface WhatsAppMessage {
  to: string;
  /** The approved template's name and language code. */
  template: string;
  language: string;
  /** The body parameters in order ({{1}}, {{2}}, …). */
  params: string[];
  /** The institution's WhatsApp Business phone number id. */
  phoneNumberId?: string;
}

/** WhatsApp Business messages. Needs the institution's own approved WhatsApp Business account; none is connected by default. */
export abstract class WhatsAppSender {
  abstract readonly connected: boolean;
  readonly provider: string = 'none';
  abstract send(msg: WhatsAppMessage): Promise<SendReceipt>;
}

export class UnconfiguredWhatsApp extends WhatsAppSender {
  readonly connected = false;
  async send(): Promise<SendReceipt> {
    throw new Error('WhatsApp Business is not connected for this institution');
  }
}

/** Meta WhatsApp Cloud API: a template message from the institution's phone number id. */
export class MetaWhatsAppSender extends WhatsAppSender {
  readonly connected = true;
  override readonly provider = 'meta';
  constructor(
    private readonly cfg: { token: string; phoneNumberId: string },
    private readonly base = 'https://graph.facebook.com/v21.0',
  ) {
    super();
  }

  async send(msg: WhatsAppMessage): Promise<SendReceipt> {
    const res = await fetch(`${this.base}/${encodeURIComponent(msg.phoneNumberId || this.cfg.phoneNumberId)}/messages`, {
      method: 'POST',
      headers: { authorization: `Bearer ${this.cfg.token}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: msg.to.replace(/^\+/, ''),
        type: 'template',
        template: { name: msg.template, language: { code: msg.language || 'en' }, components: msg.params.length ? [{ type: 'body', parameters: msg.params.map((text) => ({ type: 'text', text })) }] : [] },
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const body = (await json(res)) as { messages?: { id?: string }[]; error?: { message?: string } };
    if (!res.ok || body.error) throw new Error(`WhatsApp rejected the message: ${res.status} ${body.error?.message ?? ''}`.trim());
    return { providerMessageId: body.messages?.[0]?.id };
  }
}

/** Development and tests: a connected WhatsApp account that records what would be sent. */
export class ConsoleWhatsApp extends WhatsAppSender {
  readonly connected = true;
  override readonly provider = 'console';
  readonly sent: WhatsAppMessage[] = [];
  async send(msg: WhatsAppMessage): Promise<SendReceipt> {
    this.sent.push(msg);
    return { providerMessageId: `wa-console-${this.sent.length}` };
  }
}

// ---- Amazon SES (API v2) ------------------------------------------------------------------------------------------

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
const hmac = (key: Buffer | string, s: string) => createHmac('sha256', key).update(s).digest();

/** AWS Signature Version 4 headers for one JSON request. Pure apart from the time passed in. */
export function sigV4(req: { method: string; host: string; path: string; body: string; region: string; service: string; accessKeyId: string; secretAccessKey: string; at: Date }): Record<string, string> {
  const amzDate = req.at.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const day = amzDate.slice(0, 8);
  const payloadHash = sha256(req.body);
  const headers = `content-type:application/json\nhost:${req.host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
  const signed = 'content-type;host;x-amz-content-sha256;x-amz-date';
  const canonical = [req.method, req.path, '', headers, signed, payloadHash].join('\n');
  const scope = `${day}/${req.region}/${req.service}/aws4_request`;
  const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256(canonical)].join('\n');
  const key = hmac(hmac(hmac(hmac(`AWS4${req.secretAccessKey}`, day), req.region), req.service), 'aws4_request');
  const signature = createHmac('sha256', key).update(toSign).digest('hex');
  return {
    'content-type': 'application/json',
    'x-amz-date': amzDate,
    'x-amz-content-sha256': payloadHash,
    authorization: `AWS4-HMAC-SHA256 Credential=${req.accessKeyId}/${scope}, SignedHeaders=${signed}, Signature=${signature}`,
  };
}

/** SES v2 SendEmail (simple content) through the region's endpoint; bounces and complaints come back through SNS. */
export async function sesSend(cfg: { region: string; accessKeyId: string; secretAccessKey: string; from: string; configurationSet?: string }, mail: { to: string[]; subject: string; text: string }, at = new Date()): Promise<SendReceipt> {
  const host = `email.${cfg.region}.amazonaws.com`;
  const path = '/v2/email/outbound-emails';
  const body = JSON.stringify({
    FromEmailAddress: cfg.from,
    Destination: { ToAddresses: mail.to },
    Content: { Simple: { Subject: { Data: mail.subject, Charset: 'UTF-8' }, Body: { Text: { Data: mail.text, Charset: 'UTF-8' } } } },
    ...(cfg.configurationSet ? { ConfigurationSetName: cfg.configurationSet } : {}),
  });
  const res = await fetch(`https://${host}${path}`, { method: 'POST', headers: sigV4({ method: 'POST', host, path, body, region: cfg.region, service: 'ses', accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey, at }), body, signal: AbortSignal.timeout(15_000) });
  const out = (await json(res)) as { MessageId?: string; message?: string };
  if (!res.ok) throw new Error(`SES rejected the email: ${res.status} ${out.message ?? ''}`.trim());
  return { providerMessageId: out.MessageId };
}
