import { Module } from '@nestjs/common';
import { PassportController, PassportVerifyController } from './passport.controller.js';
import { SdgController } from './sdg.controller.js';
import { SkillsController } from './skills.controller.js';
import { SkillsService } from './skills.service.js';

/** Skill mapping, the Student Outcome Passport (PDF with verify QR), and SDG and impact mapping. */
@Module({ controllers: [SkillsController, PassportController, PassportVerifyController, SdgController], providers: [SkillsService] })
export class SkillsModule {}
