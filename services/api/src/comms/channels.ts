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
}

/** Sends a registered SMS. Unlike the sign-in code sender, this throws when the message could not be handed over, so the engine can retry. */
export abstract class TextSender {
  abstract send(msg: TextMessage): Promise<void>;
}

/** Development and tests: records what would be sent. */
export class ConsoleTextSender extends TextSender {
  private readonly log = new Logger('SMS');
  readonly sent: TextMessage[] = [];
  async send(msg: TextMessage): Promise<void> {
    this.sent.push(msg);
    this.log.log(`SMS to ${msg.to.slice(0, 3)}******${msg.to.slice(-4)} (template ${msg.templateId}): ${msg.text.slice(0, 60)}`);
  }
}

/** MSG91 Flow API v5: the template id is the MSG91 flow linked to the DLT template, and the vars fill its `##name##` slots. */
export class Msg91TextSender extends TextSender {
  constructor(
    private readonly cfg: { authKey: string; senderId: string },
    private readonly url = 'https://control.msg91.com/api/v5/flow',
  ) {
    super();
  }

  async send(msg: TextMessage): Promise<void> {
    const res = await fetch(this.url, {
      method: 'POST',
      headers: { authkey: this.cfg.authKey, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ template_id: msg.templateId, sender: this.cfg.senderId, short_url: '0', recipients: [{ mobiles: msg.to.replace(/^\+/, ''), ...msg.vars }] }),
      signal: AbortSignal.timeout(10_000),
    });
    const json = (await res.json().catch(() => ({}))) as { type?: string; message?: string };
    if (!res.ok || json.type === 'error') throw new Error(`MSG91 rejected the SMS: ${res.status} ${json.message ?? ''}`.trim());
  }
}

/** WhatsApp Business messages. Needs the institution's own approved WhatsApp Business account; none is connected by default. */
export abstract class WhatsAppSender {
  abstract readonly connected: boolean;
  abstract send(to: string, templateName: string, vars: Record<string, string>): Promise<void>;
}

export class UnconfiguredWhatsApp extends WhatsAppSender {
  readonly connected = false;
  async send(): Promise<void> {
    throw new Error('WhatsApp Business is not connected for this institution');
  }
}
