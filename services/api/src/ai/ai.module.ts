import { Module } from '@nestjs/common';
import { ENV, type Env } from '../config/env.js';
import { ContentModule } from '../content/content.module.js';
import { AiController } from './ai.controller.js';
import { NoSpeechToText, OpenAiCompatibleAsr, SpeechToText } from './asr.js';
import { AiService, LLM_PROVIDER, providerFromEnv } from './ai.service.js';

@Module({
  imports: [ContentModule],
  providers: [
    AiService,
    { provide: LLM_PROVIDER, inject: [ENV], useFactory: (env: Env) => providerFromEnv(env) },
    {
      provide: SpeechToText,
      inject: [ENV],
      useFactory: (env: Env) => (env.ASR_BASE_URL ? new OpenAiCompatibleAsr(env.ASR_BASE_URL, env.ASR_MODEL, env.ASR_API_KEY) : new NoSpeechToText()),
    },
  ],
  controllers: [AiController],
  exports: [AiService, SpeechToText],
})
export class AiModule {}
