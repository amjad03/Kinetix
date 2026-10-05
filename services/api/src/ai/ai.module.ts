import { Module } from '@nestjs/common';
import { ENV, type Env } from '../config/env.js';
import { ContentModule } from '../content/content.module.js';
import { DbService } from '../db/db.service.js';
import { AiController } from './ai.controller.js';
import { AsrGateway, NoSpeechToText, OpenAiCompatibleAsr, SarvamAsr, SpeechToText } from './asr.js';
import { AiService, LLM_PROVIDER, providerFromEnv } from './ai.service.js';
import { CircuitBreaker } from './providers.js';

/** Local first: the self-hosted speech server (ASR_BASE_URL), then Sarvam; capped and metered per institution. */
export function speechToTextFromEnv(env: Env, db: DbService): SpeechToText {
  const chain: SpeechToText[] = [];
  if (env.ASR_BASE_URL) chain.push(new OpenAiCompatibleAsr(env.ASR_BASE_URL, env.ASR_MODEL, env.ASR_API_KEY));
  if (env.ASR_FALLBACK_PROVIDER === 'sarvam' && env.SARVAM_API_KEY) {
    chain.push(new SarvamAsr({ baseUrl: env.SARVAM_BASE_URL, apiKey: env.SARVAM_API_KEY, model: env.SARVAM_ASR_MODEL, inrPerHour: env.SARVAM_INR_PER_AUDIO_HOUR }));
  }
  if (chain.length === 0) return new NoSpeechToText();
  return new AsrGateway(
    chain.map((provider) => ({ provider, breaker: new CircuitBreaker(env.AI_BREAKER_FAILURES, env.AI_BREAKER_COOLDOWN_S * 1000) })),
    db,
    env.ASR_MONTHLY_HOURS,
  );
}

@Module({
  imports: [ContentModule],
  providers: [
    AiService,
    { provide: LLM_PROVIDER, inject: [ENV], useFactory: (env: Env) => providerFromEnv(env) },
    { provide: SpeechToText, inject: [ENV, DbService], useFactory: speechToTextFromEnv },
  ],
  controllers: [AiController],
  exports: [AiService, SpeechToText],
})
export class AiModule {}
