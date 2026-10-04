var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { Module } from '@nestjs/common';
import { ENV } from '../config/env.js';
import { ContentModule } from '../content/content.module.js';
import { AiController } from './ai.controller.js';
import { NoSpeechToText, OpenAiCompatibleAsr, SpeechToText } from './asr.js';
import { AiService, LLM_PROVIDER, providerFromEnv } from './ai.service.js';
let AiModule = class AiModule {
};
AiModule = __decorate([
    Module({
        imports: [ContentModule],
        providers: [
            AiService,
            { provide: LLM_PROVIDER, inject: [ENV], useFactory: (env) => providerFromEnv(env) },
            {
                provide: SpeechToText,
                inject: [ENV],
                useFactory: (env) => (env.ASR_BASE_URL ? new OpenAiCompatibleAsr(env.ASR_BASE_URL, env.ASR_MODEL, env.ASR_API_KEY) : new NoSpeechToText()),
            },
        ],
        controllers: [AiController],
        exports: [AiService, SpeechToText],
    })
], AiModule);
export { AiModule };
//# sourceMappingURL=ai.module.js.map