import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module.js';
import { SkillsModule } from '../skills/skills.module.js';
import { CareersController } from './careers.controller.js';

/** Resume, aptitude tests, career paths from the skill passport, mock interviews and the AI career assistant. */
@Module({ imports: [AiModule, SkillsModule], controllers: [CareersController] })
export class CareersModule {}
