import { z } from 'zod';
import { SecretBox } from '../common/secret-box.js';

const EnvSchema = z.object({
  DATABASE_URL: z.string().url(),
  APP_DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(16),
  PAIRING_HMAC_SECRET: z.string().min(8),
  PORT: z.coerce.number().default(4000),
  DEFAULT_TIMEZONE: z.string().default('Asia/Kolkata'),
  /**
   * The primary AI model server: OpenAI-compatible (vLLM, llama.cpp), self-hosted on a GPU in
   * the college, on E2E Networks or in AWS Mumbai. It must be in India. With neither this nor a
   * fallback, AI tasks return labelled previews so the apps still work in development.
   */
  AI_BASE_URL: z.url().optional(),
  AI_MODEL: z.string().default('kinetix-llm'),
  AI_API_KEY: z.string().optional(),
  AI_TIMEOUT_MS: z.coerce.number().int().positive().default(60_000),
  /** Whether the primary model reads images (readBoard). */
  AI_VISION: z.stringbool().default(true),
  /**
   * Pay-per-use Indian API used when the primary is down, overloaded or not configured
   * (connection errors, timeouts, 5xx, 429; never on a 4xx). `none` or `sarvam`.
   */
  AI_FALLBACK_PROVIDER: z.enum(['none', 'sarvam']).default('none'),
  /** Circuit breaker: after this many failures in a row the primary is skipped for AI_BREAKER_COOLDOWN_S. */
  AI_BREAKER_FAILURES: z.coerce.number().int().positive().default(3),
  AI_BREAKER_COOLDOWN_S: z.coerce.number().int().positive().default(60),
  /** Model requests per institution per day (cached answers are free). */
  AI_DAILY_LIMIT: z.coerce.number().int().positive().default(2000),
  /** Speech-to-text server (OpenAI-compatible /audio/transcriptions: faster-whisper, IndicConformer), in India. */
  ASR_BASE_URL: z.url().optional(),
  ASR_MODEL: z.string().default('whisper'),
  ASR_API_KEY: z.string().optional(),
  /** Speech-to-text fallback when the primary is down or not configured: `none` or `sarvam`. */
  ASR_FALLBACK_PROVIDER: z.enum(['none', 'sarvam']).default('none'),
  /** Hours of lesson audio each institution may transcribe per calendar month (IST); 0 = no cap. */
  ASR_MONTHLY_HOURS: z.coerce.number().min(0).default(300),
  /** Sarvam AI (Bengaluru), the pay-per-use fallback for chat and speech-to-text. */
  SARVAM_API_KEY: z.string().optional(),
  SARVAM_BASE_URL: z.url().default('https://api.sarvam.ai'),
  SARVAM_LLM_MODEL: z.string().default('sarvam-105b'),
  SARVAM_ASR_MODEL: z.string().default('saaras:v3'),
  /** Cost estimates for the logs and ai_usage, in rupees. Check against the current Sarvam price list. */
  SARVAM_INR_PER_M_INPUT: z.coerce.number().min(0).default(29.28),
  SARVAM_INR_PER_M_OUTPUT: z.coerce.number().min(0).default(73.2),
  SARVAM_INR_PER_AUDIO_HOUR: z.coerce.number().min(0).default(30),
  /**
   * The code runner (services/code-runner) that compiles and runs C, C++ and Java for the code
   * lab: `unix:/run/kx-runner/runner.sock` (docker-compose) or `http://host:8080` (ECS). Unset:
   * those languages answer 503 CODE_RUNNER_UNAVAILABLE (Python, JavaScript and SQL run on the
   * device and never come here).
   */
  CODE_RUNNER_URL: z.string().regex(/^(unix:\/|https?:\/\/)/).optional(),
  /** Shared with the runner, which refuses requests without it. */
  CODE_RUNNER_TOKEN: z.string().optional(),
  /** Runs each institution may start per minute, and each person (or board). */
  CODE_RUN_TENANT_PER_MINUTE: z.coerce.number().int().positive().default(120),
  CODE_RUN_USER_PER_MINUTE: z.coerce.number().int().positive().default(20),
  /** How long the API waits for the runner (compile + run + queue). */
  CODE_RUNNER_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
  /** Where recordings are kept: local disk in development, S3 in ap-south-1 in production. */
  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  STORAGE_DIR: z.string().default('.data/objects'),
  S3_BUCKET: z.string().optional(),
  S3_REGION: z.string().default('ap-south-1'),
  /** Firebase service account (JSON, or a path to it) for push notifications. Optional. */
  FCM_SERVICE_ACCOUNT: z.string().optional(),
  /**
   * Online fee payments: razorpay in production, demo for development (no money moves), or
   * none (fees can still be recorded at the counter). With razorpay, each institution enters its
   * own Razorpay keys in the ERP (Settings → Online payments) and fees go straight to its
   * account; there are no platform-wide Razorpay keys.
   */
  PAYMENTS_PROVIDER: z.enum(['none', 'demo', 'razorpay']).default('none'),
  /**
   * Tests and local e2e only: with PAYMENTS_PROVIDER=razorpay, Razorpay's API is faked (orders
   * are made up, "Test connection" succeeds unless the key secret starts with "wrong"); the
   * signatures are still checked with each institution's secrets. Never in production.
   */
  RAZORPAY_FAKE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  /**
   * Master key for secrets stored in the database (institutions' Razorpay secrets): 32 random
   * bytes, base64 (`openssl rand -base64 32`). Required with PAYMENTS_PROVIDER=razorpay. To
   * rotate, raise SECRETS_ENCRYPTION_KEY_VERSION, keep the old key in SECRETS_ENCRYPTION_OLD_KEYS
   * ("1:<base64>") and run `pnpm secrets:rotate` (docs/operations/security.md).
   */
  SECRETS_ENCRYPTION_KEY: z.string().optional(),
  SECRETS_ENCRYPTION_KEY_VERSION: z.coerce.number().int().min(1).default(1),
  SECRETS_ENCRYPTION_OLD_KEYS: z.string().optional(),
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
  /**
   * YouTube Data API key (Google Cloud, YouTube Data API v3), optional. Only the platform team's
   * playlist import and video durations use it (playlistItems.list and videos.list cost one
   * quota unit each). Without it, concept videos are added one link at a time.
   */
  YOUTUBE_API_KEY: z.string().optional(),
  /**
   * Our mirror of PhET's sims in India (infra/terraform/phet.tf), e.g. https://dxxxx.cloudfront.net/phet;
   * files are at <url>/<id>/<id>_all.html. Unset (development, demo): boards are sent to
   * phet.colorado.edu instead (docs/operations/phet.md).
   */
  PHET_MIRROR_URL: z.url().optional(),
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
  if (parsed.data.PAYMENTS_PROVIDER === 'razorpay' && !parsed.data.SECRETS_ENCRYPTION_KEY) {
    throw new Error('Invalid environment: SECRETS_ENCRYPTION_KEY is required with PAYMENTS_PROVIDER=razorpay (institutions\' Razorpay secrets are encrypted with it)');
  }
  try {
    SecretBox.fromEnv(parsed.data);
  } catch (e) {
    throw new Error(`Invalid environment: ${(e as Error).message}`);
  }
  if (parsed.data.SMS_PROVIDER === 'msg91' && !(parsed.data.MSG91_AUTH_KEY && parsed.data.MSG91_TEMPLATE_ID && parsed.data.MSG91_SENDER_ID)) {
    throw new Error('Invalid environment: MSG91_AUTH_KEY, MSG91_TEMPLATE_ID and MSG91_SENDER_ID are required with SMS_PROVIDER=msg91');
  }
  const sarvam = parsed.data.AI_FALLBACK_PROVIDER === 'sarvam' || parsed.data.ASR_FALLBACK_PROVIDER === 'sarvam';
  if (sarvam && !parsed.data.SARVAM_API_KEY) throw new Error('Invalid environment: SARVAM_API_KEY is required with AI_FALLBACK_PROVIDER=sarvam or ASR_FALLBACK_PROVIDER=sarvam');
  return parsed.data;
}
