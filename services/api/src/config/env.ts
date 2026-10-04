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
});

export type Env = z.infer<typeof EnvSchema>;

export const ENV = Symbol('ENV');

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    throw new Error(`Invalid environment: ${z.prettifyError(parsed.error)}`);
  }
  return parsed.data;
}
