import { Logger } from '@nestjs/common';

export interface Mail {
  to: string[];
  subject: string;
  text: string;
  attachments: { filename: string; contentType: string; content: Buffer }[];
}

/** Outgoing email for scheduled reports. Throws when the message could not be handed over. */
export abstract class Mailer {
  abstract send(mail: Mail): Promise<void>;
}

/** Development default: logs what would be sent. */
export class LogMailer extends Mailer {
  private readonly log = new Logger('Mailer');
  readonly sent: Mail[] = [];
  async send(mail: Mail): Promise<void> {
    this.sent.push(mail);
    this.log.log(`Email to ${mail.to.join(', ')}: "${mail.subject}" (${mail.attachments.map((a) => `${a.filename} ${a.content.length}B`).join(', ') || 'no attachment'}) [MAIL_WEBHOOK_URL is not set, nothing was sent]`);
  }
}

/** POSTs `{from, to, subject, text, attachments:[{filename, contentType, contentBase64}]}` to a relay (an SES/Postmark Lambda, n8n…). */
export class WebhookMailer extends Mailer {
  constructor(
    private readonly url: string,
    private readonly from: string,
  ) {
    super();
  }

  async send(mail: Mail): Promise<void> {
    const res = await fetch(this.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ from: this.from, to: mail.to, subject: mail.subject, text: mail.text, attachments: mail.attachments.map((a) => ({ filename: a.filename, contentType: a.contentType, contentBase64: a.content.toString('base64') })) }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(`Mail relay answered ${res.status}`);
  }
}
