import { z } from 'zod';

const EnvSchema = z.object({
  DATABASE_URL: z.string().url(),
  APP_DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(16),
  PAIRING_HMAC_SECRET: z.string().min(8),
  PORT: z.coerce.number().default(4000),
  DEFAULT_TIMEZONE: z.string().default('Asia/Kolkata'),
  /**
   * AI model server (OpenAI-compatible: vLLM, llama.cpp). It must be hosted in India. Without
   * it, AI tasks return labelled previews so the apps still work in development.
   */
  AI_BASE_URL: z.url().optional(),
  AI_MODEL: z.string().default('kinetix-llm'),
  AI_API_KEY: z.string().optional(),
  AI_TIMEOUT_MS: z.coerce.number().int().positive().default(60_000),
  /** Model requests per institution per day (cached answers are free). */
  AI_DAILY_LIMIT: z.coerce.number().int().positive().default(2000),
  /** Speech-to-text server (OpenAI-compatible /audio/transcriptions, e.g. faster-whisper), in India. */
  ASR_BASE_URL: z.url().optional(),
  ASR_MODEL: z.string().default('whisper'),
  ASR_API_KEY: z.string().optional(),
  /** Where recordings are kept: local disk in development, S3 in ap-south-1 in production. */
  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  STORAGE_DIR: z.string().default('.data/objects'),
  S3_BUCKET: z.string().optional(),
  S3_REGION: z.string().default('ap-south-1'),
  /** Firebase service account (JSON, or a path to it) for push notifications. Optional. */
  FCM_SERVICE_ACCOUNT: z.string().optional(),
  /**
   * Online fee payments: razorpay in production, demo for development (no money moves), or
   * none (fees can still be recorded at the counter).
   */
  PAYMENTS_PROVIDER: z.enum(['none', 'demo', 'razorpay']).default('none'),
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),
  /** How often the job runner looks for work; 0 turns it off (tests run jobs by hand). */
  JOBS_POLL_MS: z.coerce.number().int().min(0).default(2000),
  /**
   * Redis, for running more than one API instance: shared rate limits, live-classroom state and
   * the socket.io adapter. Unset: all of that stays in this process (one instance).
   */
  REDIS_URL: z.url().optional(),
  /** Sign-in codes by SMS: console logs them (development and tests); msg91 sends them (India, DLT). */
  SMS_PROVIDER: z.enum(['console', 'msg91']).default('console'),
  MSG91_AUTH_KEY: z.string().optional(),
  /** The MSG91 Flow template id, linked to the DLT-approved template with variables `otp` and `app`. */
  MSG91_TEMPLATE_ID: z.string().optional(),
  /** The 6-character DLT sender id (header), e.g. KINTIX. */
  MSG91_SENDER_ID: z.string().optional(),
  /** The app name passed to the SMS template. */
  SMS_APP_NAME: z.string().default('KINETIX'),
  /** `json` writes one JSON object per log line (production log shipping); `text` is for people. */
  LOG_FORMAT: z.enum(['text', 'json']).default('text'),
  /**
   * Behind a load balancer, how many proxy hops to trust for the client IP (X-Forwarded-For),
   * which per-IP rate limits use. Unset: the socket address.
   */
  TRUST_PROXY: z.coerce.number().int().min(0).optional(),
});

export type Env = z.infer<typeof EnvSchema>;

export const ENV = Symbol('ENV');

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    throw new Error(`Invalid environment: ${z.prettifyError(parsed.error)}`);
  }
  if (parsed.data.STORAGE_DRIVER === 's3' && !parsed.data.S3_BUCKET) throw new Error('Invalid environment: S3_BUCKET is required with STORAGE_DRIVER=s3');
  if (parsed.data.STORAGE_DRIVER === 's3' && !parsed.data.S3_REGION.startsWith('ap-south-')) {
    throw new Error('Invalid environment: recordings must be stored in India (S3_REGION ap-south-1 or ap-south-2)');
  }
  if (parsed.data.PAYMENTS_PROVIDER === 'razorpay' && !(parsed.data.RAZORPAY_KEY_ID && parsed.data.RAZORPAY_KEY_SECRET && parsed.data.RAZORPAY_WEBHOOK_SECRET)) {
    throw new Error('Invalid environment: RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET and RAZORPAY_WEBHOOK_SECRET are required with PAYMENTS_PROVIDER=razorpay');
  }
  if (parsed.data.SMS_PROVIDER === 'msg91' && !(parsed.data.MSG91_AUTH_KEY && parsed.data.MSG91_TEMPLATE_ID && parsed.data.MSG91_SENDER_ID)) {
    throw new Error('Invalid environment: MSG91_AUTH_KEY, MSG91_TEMPLATE_ID and MSG91_SENDER_ID are required with SMS_PROVIDER=msg91');
  }
  return parsed.data;
}
