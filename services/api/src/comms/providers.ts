import type { Provider } from '@nestjs/common';
import { LogMailer, Mailer, WebhookMailer, type Mail } from '../analytics/mailer.js';
import { ENV, type Env } from '../config/env.js';
import { ConsoleTextSender, ConsoleWhatsApp, GupshupTextSender, KaleyraTextSender, MetaWhatsAppSender, Msg91TextSender, sesSend, TextSender, UnconfiguredWhatsApp, WhatsAppSender } from './channels.js';

/** Email through Amazon SES. Attachments are not sent this way (scheduled reports use the relay); the text is. */
export class SesMailer extends Mailer {
  override readonly provider: string = 'ses';
  constructor(private readonly cfg: { region: string; accessKeyId: string; secretAccessKey: string; from: string; configurationSet?: string }) {
    super();
  }
  async send(mail: Mail) {
    return sesSend(this.cfg, mail);
  }
}

export function mailerFor(env: Env): Mailer {
  if (env.SES_REGION) return new SesMailer({ region: env.SES_REGION, accessKeyId: env.SES_ACCESS_KEY_ID!, secretAccessKey: env.SES_SECRET_ACCESS_KEY!, from: env.MAIL_FROM, configurationSet: env.SES_CONFIGURATION_SET });
  return env.MAIL_WEBHOOK_URL ? new WebhookMailer(env.MAIL_WEBHOOK_URL, env.MAIL_FROM) : new LogMailer();
}

/** The SMS provider for notices and campaigns: COMMS_SMS_PROVIDER, else the sign-in provider. */
export function textSenderFor(env: Env): TextSender {
  const via = env.COMMS_SMS_PROVIDER ?? env.SMS_PROVIDER;
  const header = env.SMS_SENDER_ID ?? env.MSG91_SENDER_ID ?? '';
  if (via === 'msg91') return new Msg91TextSender({ authKey: env.MSG91_AUTH_KEY!, senderId: header });
  if (via === 'kaleyra') return new KaleyraTextSender({ sid: env.KALEYRA_SID!, apiKey: env.KALEYRA_API_KEY!, senderId: header });
  if (via === 'gupshup') return new GupshupTextSender({ userId: env.GUPSHUP_USER_ID!, password: env.GUPSHUP_PASSWORD!, senderId: header });
  return new ConsoleTextSender();
}

export function whatsAppFor(env: Env): WhatsAppSender {
  if (env.WHATSAPP_PROVIDER === 'meta') return new MetaWhatsAppSender({ token: env.WHATSAPP_TOKEN!, phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID! });
  if (env.WHATSAPP_PROVIDER === 'console') return new ConsoleWhatsApp();
  return new UnconfiguredWhatsApp();
}

/** Mailer, SMS and WhatsApp senders from the environment, for every module that sends outside the apps. */
export const channelProviders: Provider[] = [
  { provide: Mailer, inject: [ENV], useFactory: mailerFor },
  { provide: TextSender, inject: [ENV], useFactory: textSenderFor },
  { provide: WhatsAppSender, inject: [ENV], useFactory: whatsAppFor },
];
