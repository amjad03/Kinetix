import { Module } from '@nestjs/common';
import { ENV, type Env } from '../config/env.js';
import { AiController } from './ai.controller.js';
import { AiService, LLM_PROVIDER, providerFromEnv } from './ai.service.js';

@Module({
  providers: [AiService, { provide: LLM_PROVIDER, inject: [ENV], useFactory: (env: Env) => providerFromEnv(env) }],
  controllers: [AiController],
  exports: [AiService],
})
export class AiModule {}
