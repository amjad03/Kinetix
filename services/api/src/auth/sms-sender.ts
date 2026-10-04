import { Logger } from '@nestjs/common';

export interface OtpSms {
  /** E.164, e.g. +919800000001. */
  to: string;
  code: string;
  appName: string;
  /** The user's preferred language; the DLT template decides the wording. */
  language: string;
}

/** Delivers sign-in codes by SMS. Sending must not throw for an undeliverable number. */
export abstract class SmsSender {
  abstract sendOtp(sms: OtpSms): Promise<void>;
}

/** Shows only the last digits of a phone number in logs. */
export const maskPhone = (phone: string) => `${phone.slice(0, 3)}******${phone.slice(-4)}`;

/** Development and tests: writes the code to the log instead of sending it. Never use in production. */
export class ConsoleSmsSender extends SmsSender {
  private readonly log = new Logger('SMS');

  async sendOtp(sms: OtpSms): Promise<void> {
    this.log.log(`Sign-in code for ${maskPhone(sms.to)}: ${sms.code} (${sms.appName}, ${sms.language})`);
  }
}

/**
 * MSG91 (India) Flow API v5. Indian SMS must use a DLT-registered sender id and template; the
 * MSG91 template id is linked to that DLT template, whose text (in the user's language) has the
 * variables `##otp##` and `##app##`.
 */
export class Msg91SmsSender extends SmsSender {
  private readonly log = new Logger(Msg91SmsSender.name);

  constructor(
    private readonly cfg: { authKey: string; templateId: string; senderId: string },
    private readonly fetchFn: typeof fetch = fetch,
    private readonly url = 'https://control.msg91.com/api/v5/flow',
  ) {
    super();
  }

  async sendOtp(sms: OtpSms): Promise<void> {
    const body = {
      template_id: this.cfg.templateId,
      sender: this.cfg.senderId,
      short_url: '0',
      // MSG91 wants the number with the country code and without the plus.
      recipients: [{ mobiles: sms.to.replace(/^\+/, ''), otp: sms.code, app: sms.appName }],
    };
    try {
      const res = await this.fetchFn(this.url, {
        method: 'POST',
        headers: { authkey: this.cfg.authKey, 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10_000),
      });
      const json = (await res.json().catch(() => ({}))) as { type?: string; message?: string };
      if (!res.ok || json.type === 'error') this.log.warn(`MSG91 rejected the SMS to ${maskPhone(sms.to)}: ${res.status} ${json.message ?? ''}`);
    } catch (e) {
      this.log.warn(`MSG91 request failed for ${maskPhone(sms.to)}: ${(e as Error).message}`);
    }
  }
}
