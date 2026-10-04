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
  /** How often the job runner looks for work; 0 turns it off (tests run jobs by hand). */
  JOBS_POLL_MS: z.coerce.number().int().min(0).default(2000),
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
  return parsed.data;
}
